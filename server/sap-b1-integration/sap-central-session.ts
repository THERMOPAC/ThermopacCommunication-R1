/**
 * SAP Central Session Manager — v3.0
 *
 * Single source of truth for all server-initiated SAP B1 Service Layer sessions.
 * Enforces ONE active session at all times. Handles login, expiry, -1102 recovery,
 * disk persistence for crash-safe logout, and SIGTERM cleanup.
 *
 * v3.0 changes over v2.0:
 *  - Global login serialization queue (_loginQueue): ALL login operations —
 *    _doLogin(), testCredentials(), forceLogin() — are serialized through a
 *    FIFO promise queue. No two login calls can ever be in-flight simultaneously.
 *  - invalidate() now nulls loginPromise immediately so the next getSession()
 *    always starts a fresh queued login instead of joining a stale in-progress one.
 *  - New public forceLogin(waitMs): atomic queued invalidate → wait → login.
 *    Replaces the raw invalidate()+getSession() pattern used in procurement-routes.
 *  - testCredentials() is now serialized through the login queue so it cannot
 *    race with _doLogin().
 *  - forceReset() resets the login queue, loginPromise, AND retryOn1102 counter.
 *  - Raw SAP -1102 response body is logged separately before app interpretation.
 *  - Logout now logs warnings instead of silently swallowing errors so failed
 *    logouts are visible in production logs.
 *
 * v2.0 changes:
 *  - Crash-safe disk persistence: cookie written on login, KEPT on disk through
 *    invalidate() until logout succeeds — so next startup can force-logout it.
 *  - Fixed -1102 force-logout: uses real stale cookie from disk, not a bogus cookie.
 *  - Extended -1102 retry wait to 5 000 ms.
 *  - Comprehensive debug logging: every login_attempt, session_reuse, invalidate,
 *    logout, retry_on_1102 event is logged with prefix [SapCentralSession].
 *  - `getDebugInfo()` — full runtime stats for GET /api/sap/session/debug.
 *  - `forceReset()` — admin-callable hard reset (invalidate → wait → initialize).
 *
 * Usage:
 *   import { sapSession } from '../sap-b1-integration/sap-central-session';
 *   const resp = await sapSession.request({ method: 'GET', path: '/b1s/v1/...' });
 *
 * This is the sole authorised SAP session authority. Per-user session infrastructure
 * (sap-session-manager.ts, sap-auth-routes.ts, sap-auth-middleware.ts) has been
 * permanently deleted as part of SAP Session Unification Migration v1.2.
 */

import fs from 'fs';
import path from 'path';
import { sapHttpsClient } from './sap-https-client';

const DISK_PATH = path.join(process.cwd(), '.sap-session-cache.json');
const SESSION_TTL_MS = 25 * 60 * 1000; // 25 min — SAP default idle timeout is 30 min

interface DiskState {
  cookie: string;
  createdAt: number;
  /**
   * Populated by invalidate() BEFORE the logout attempt.
   * Survives a process crash so next startup can force-logout the stale session.
   */
  pendingLogout?: string;
}

interface SapRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: any;
  timeout?: number;
  /** Binary body for multipart uploads (e.g. SAP Attachments2). Skips JSON stringify. */
  rawBody?: Buffer;
  /** Override Content-Type header (e.g. 'multipart/form-data; boundary=...'). */
  contentType?: string;
}

interface SessionStats {
  loginAttempts: number;
  loginSuccesses: number;
  loginFailures: number;
  sessionReuses: number;
  invalidations: number;
  logouts: number;
  logoutFailures: number;
  retryOn1102: number;
  lastLoginAt: string | null;
  lastInvalidateAt: string | null;
  lastForceResetAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

class SapCentralSession {
  private cookie: string | null = null;
  private expiresAt: Date | null = null;

  /**
   * Dedup mutex — if a login is already in progress via getSession(),
   * subsequent callers await this shared promise instead of starting a new one.
   * Nulled immediately by invalidate() so the next getSession() starts fresh.
   */
  private loginPromise: Promise<string> | null = null;

  /**
   * Global login serialization queue — FIFO promise chain that ensures no two
   * login operations (system login, testCredentials, forceLogin) are ever
   * in-flight at the same time. This is the root fix for -1102 "competing session"
   * errors caused by concurrent login attempts from different code paths.
   */
  private _loginQueue: Promise<void> = Promise.resolve();

  private stats: SessionStats = {
    loginAttempts: 0,
    loginSuccesses: 0,
    loginFailures: 0,
    sessionReuses: 0,
    invalidations: 0,
    logouts: 0,
    logoutFailures: 0,
    retryOn1102: 0,
    lastLoginAt: null,
    lastInvalidateAt: null,
    lastForceResetAt: null,
    lastErrorAt: null,
    lastError: null,
  };

  // ─── Login Queue ──────────────────────────────────────────────────────────

  /**
   * Enqueues a login operation through the global FIFO queue.
   * Guarantees no two login operations overlap regardless of caller.
   * The queue tail always advances (even on failure) so subsequent ops run.
   */
  private _enqueueLoginOp<T>(fn: () => Promise<T>): Promise<T> {
    const work = this._loginQueue.then(() => fn());
    // Always advance the tail — failure must not block the queue
    this._loginQueue = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Called once on server startup.
   * Attempts to force-logout any session left over from the previous run
   * (including crash-recovery stale sessions stored on disk).
   */
  async initialize(): Promise<void> {
    console.log('[SapCentralSession] initialize() — scanning for stale sessions...');
    try {
      if (fs.existsSync(DISK_PATH)) {
        const raw = fs.readFileSync(DISK_PATH, 'utf-8');
        const state: DiskState = JSON.parse(raw);

        // pendingLogout takes priority (set by a previous crash-interrupted invalidate)
        const staleCookie = state.pendingLogout || state.cookie;

        if (staleCookie) {
          console.log('[SapCentralSession] initialize() — found stale disk session, attempting force-logout...');
          try {
            await sapHttpsClient.logout(staleCookie);
            this.stats.logouts++;
            console.log('[SapCentralSession] initialize() — stale session logged out successfully');
          } catch (err: any) {
            this.stats.logoutFailures++;
            console.warn('[SapCentralSession] initialize() — stale session logout failed (non-fatal, may have already expired):', err.message);
          }
        } else {
          console.log('[SapCentralSession] initialize() — disk file present but no cookie found (already cleaned up)');
        }

        try { fs.unlinkSync(DISK_PATH); } catch { /* non-fatal */ }
        console.log('[SapCentralSession] initialize() — disk cache cleared');
      } else {
        console.log('[SapCentralSession] initialize() — no disk cache found (clean start)');
      }
    } catch (err: any) {
      console.warn('[SapCentralSession] initialize() — disk scan error (non-fatal):', err.message);
    }

    this.cookie = null;
    this.expiresAt = null;
    this.loginPromise = null;
    this._loginQueue = Promise.resolve();
    console.log('[SapCentralSession] initialize() — ready');
  }

  /** Called on SIGTERM / SIGINT to cleanly release the SAP session. */
  async shutdown(): Promise<void> {
    console.log('[SapCentralSession] shutdown() — releasing SAP session...');
    await this.invalidate();
  }

  // ─── Core API ─────────────────────────────────────────────────────────────

  /**
   * Returns a valid SAP session cookie string.
   * Creates a new session if none exists or if current one is expired.
   * Thread-safe: concurrent callers during login share one login attempt (dedup),
   * and the underlying login is serialized through the global login queue.
   */
  async getSession(): Promise<string> {
    if (this.cookie && this.expiresAt && this.expiresAt > new Date()) {
      const ttlSeconds = Math.floor((this.expiresAt.getTime() - Date.now()) / 1000);
      this.stats.sessionReuses++;
      console.log(`[SapCentralSession] session_reuse #${this.stats.sessionReuses} — ttl=${ttlSeconds}s`);
      return this.cookie;
    }

    if (this.loginPromise) {
      console.log('[SapCentralSession] getSession() — login already in progress, awaiting shared promise');
      return this.loginPromise;
    }

    // Start a new login, serialized through the global queue, with dedup for
    // concurrent callers that all arrive here before the login completes.
    this.loginPromise = this._enqueueLoginOp(() => this._doLogin()).finally(() => {
      this.loginPromise = null;
    });
    return this.loginPromise;
  }

  /**
   * Make an authenticated SAP Service Layer request.
   * Automatically obtains/creates the session. Retries once on 401 (expired session)
   * and once on -1102 in response body.
   */
  async request(opts: SapRequestOptions): Promise<any> {
    const cookie = await this.getSession();

    const baseOpts = {
      method: opts.method,
      path: opts.path,
      url: '',
      ...(opts.body !== undefined ? { body: opts.body } : {}),
      ...(opts.timeout !== undefined ? { timeout: opts.timeout } : {}),
      ...(opts.rawBody !== undefined ? { rawBody: opts.rawBody } : {}),
      ...(opts.contentType !== undefined ? { headers: { 'Content-Type': opts.contentType } } : {}),
    };

    let resp = await sapHttpsClient.authenticatedRequest(cookie, baseOpts);

    // Session expired — invalidate and retry once
    if (resp.statusCode === 401) {
      console.warn('[SapCentralSession] request() — 401 received, session expired, refreshing...');
      await this.invalidate();
      const freshCookie = await this.getSession();
      resp = await sapHttpsClient.authenticatedRequest(freshCookie, baseOpts);
    }

    // -1102 in response body — competing session appeared mid-flight
    if (typeof resp.body === 'string' && this._is1102(resp.body)) {
      console.warn('[SapCentralSession] request() — -1102 in response body');
      console.warn(`[SapCentralSession] RAW -1102 response body: ${resp.body.substring(0, 600)}`);
      this.stats.retryOn1102++;
      await this.invalidate();
      const freshCookie = await this.getSession();
      resp = await sapHttpsClient.authenticatedRequest(freshCookie, baseOpts);
    }

    return resp;
  }

  /**
   * Invalidates the current session: logs out from SAP, clears memory and disk.
   * Also nulls loginPromise so the next getSession() starts a fresh queued login
   * instead of joining a potentially stale in-progress one.
   *
   * Crash-safe: writes the cookie to disk as `pendingLogout` BEFORE attempting
   * logout, so if the process dies during the logout call, the next startup can
   * find and force-logout the stale session via initialize().
   */
  async invalidate(): Promise<void> {
    const cookieToLogout = this.cookie;
    this.cookie = null;
    this.expiresAt = null;
    // Null the dedup promise so the next getSession() call enqueues a fresh login
    // rather than joining whatever was in-progress before this invalidate.
    this.loginPromise = null;
    this.stats.invalidations++;
    this.stats.lastInvalidateAt = new Date().toISOString();

    if (cookieToLogout) {
      // Crash-safe: keep cookie on disk as pendingLogout until logout succeeds
      this._savePendingLogout(cookieToLogout);
      console.log(`[SapCentralSession] invalidate #${this.stats.invalidations} — attempting SAP logout`);
      try {
        await sapHttpsClient.logout(cookieToLogout);
        this.stats.logouts++;
        console.log(`[SapCentralSession] ✅ invalidate #${this.stats.invalidations} — SAP logout OK`);
      } catch (err: any) {
        this.stats.logoutFailures++;
        console.warn(`[SapCentralSession] ⚠️  invalidate #${this.stats.invalidations} — SAP logout FAILED (cookie may linger in SAP):`, err.message);
      }
      // Only delete disk file after logout attempt (success or not — session is dead either way)
      this._deleteDisk();
    } else {
      this._deleteDisk();
      console.log(`[SapCentralSession] invalidate #${this.stats.invalidations} — no active cookie to logout`);
    }
  }

  /**
   * Atomic forced login: invalidate current session → wait → fresh login.
   * Serialized through the global login queue so it cannot race with any
   * concurrent _doLogin() or testCredentials() call.
   *
   * Use this instead of the raw invalidate() + getSession() pattern.
   * waitMs: milliseconds to wait after logout before logging in (gives SAP time
   * to release the stale session server-side before the new login attempt).
   */
  async forceLogin(waitMs: number = 4000): Promise<string> {
    console.log(`[SapCentralSession] forceLogin(waitMs=${waitMs}) — queuing atomic invalidate+login`);
    return this._enqueueLoginOp(async () => {
      // Null the dedup inside the lock so no stale loginPromise can be joined
      this.loginPromise = null;

      // Logout existing session
      const cookieToLogout = this.cookie;
      this.cookie = null;
      this.expiresAt = null;
      this.stats.invalidations++;
      this.stats.lastInvalidateAt = new Date().toISOString();

      if (cookieToLogout) {
        this._savePendingLogout(cookieToLogout);
        console.log(`[SapCentralSession] forceLogin() — attempting SAP logout before re-login`);
        try {
          await sapHttpsClient.logout(cookieToLogout);
          this.stats.logouts++;
          console.log('[SapCentralSession] forceLogin() — SAP logout OK');
        } catch (err: any) {
          this.stats.logoutFailures++;
          console.warn('[SapCentralSession] forceLogin() — SAP logout FAILED (cookie may linger in SAP):', err.message);
        }
        this._deleteDisk();
      } else {
        this._deleteDisk();
        console.log('[SapCentralSession] forceLogin() — no active cookie, proceeding to fresh login');
      }

      if (waitMs > 0) {
        console.log(`[SapCentralSession] forceLogin() — waiting ${waitMs}ms for SAP to release stale session server-side...`);
        await new Promise<void>(r => setTimeout(r, waitMs));
      }

      console.log('[SapCentralSession] forceLogin() — triggering fresh login');
      return this._doLogin();
    });
  }

  /**
   * Admin-callable hard reset: invalidates current session, resets all in-progress
   * state, waits 5 s, then re-runs initialize() so the next request triggers a
   * clean fresh login.
   */
  async forceReset(): Promise<{ ok: boolean; message: string; debugInfo: object }> {
    console.log('[SapCentralSession] forceReset() — admin-initiated hard reset');

    // Abort any in-progress login mutex and reset the queue so queued ops don't run
    this.loginPromise = null;
    this._loginQueue = Promise.resolve();

    await this.invalidate();

    // Reset retry counter on explicit admin force-reset
    this.stats.retryOn1102 = 0;
    this.stats.lastForceResetAt = new Date().toISOString();

    console.log('[SapCentralSession] forceReset() — waiting 5 s for SAP to release stale session...');
    await new Promise<void>(r => setTimeout(r, 5000));
    await this.initialize();

    const debugInfo = this.getDebugInfo();
    console.log('[SapCentralSession] forceReset() — complete. Next request will trigger a fresh login.');
    return {
      ok: true,
      message: 'SAP central session force-reset complete. Next request will trigger a fresh login.',
      debugInfo,
    };
  }

  /**
   * Lightweight diagnostics snapshot for attaching to -1102 error payloads.
   * Safe to call at any time — does not mutate state.
   */
  getSessionDiagnostics(): {
    username: string;
    isManagerUser: boolean;
    sessionAlive: boolean;
    sessionTtlSeconds: number;
    lastInvalidateAt: string | null;
    lastForceResetAt: string | null;
    loginAttempts: number;
    sessionReuses: number;
    retryOn1102: number;
    logoutFailures: number;
  } {
    const now = new Date();
    const alive = !!(this.cookie && this.expiresAt && this.expiresAt > now);
    const ttl = alive && this.expiresAt
      ? Math.max(0, Math.floor((this.expiresAt.getTime() - now.getTime()) / 1000))
      : 0;
    const username = process.env.SAP_B1_USERNAME || '(not set)';
    return {
      username,
      isManagerUser: username.toLowerCase() === 'manager',
      sessionAlive:  alive,
      sessionTtlSeconds: ttl,
      lastInvalidateAt:  this.stats.lastInvalidateAt,
      lastForceResetAt:  this.stats.lastForceResetAt,
      loginAttempts:     this.stats.loginAttempts,
      sessionReuses:     this.stats.sessionReuses,
      retryOn1102:       this.stats.retryOn1102,
      logoutFailures:    this.stats.logoutFailures,
    };
  }

  /**
   * Health info for /api/sap/session/health monitoring endpoint.
   */
  getHealth(): {
    alive: boolean;
    ttlSeconds: number;
    expiresAt: string | null;
    loginInProgress: boolean;
    companyDb: string;
    username: string;
  } {
    const now = new Date();
    const alive = !!(this.cookie && this.expiresAt && this.expiresAt > now);
    const ttlSeconds = alive && this.expiresAt
      ? Math.max(0, Math.floor((this.expiresAt.getTime() - now.getTime()) / 1000))
      : 0;

    return {
      alive,
      ttlSeconds,
      expiresAt: this.expiresAt?.toISOString() ?? null,
      loginInProgress: !!this.loginPromise,
      companyDb: process.env.SAP_COMPANY_DB || '',
      username: process.env.SAP_B1_USERNAME || '',
    };
  }

  /**
   * Full diagnostic snapshot for GET /api/sap/session/debug.
   */
  getDebugInfo(): object {
    let diskInfo: object | null = null;
    try {
      if (fs.existsSync(DISK_PATH)) {
        const raw = fs.readFileSync(DISK_PATH, 'utf-8');
        const state: DiskState = JSON.parse(raw);
        diskInfo = {
          createdAt: new Date(state.createdAt).toISOString(),
          hasCookie: !!state.cookie,
          hasPendingLogout: !!state.pendingLogout,
        };
      }
    } catch { /* non-fatal */ }

    return {
      health: this.getHealth(),
      stats: { ...this.stats },
      hasDiskFile: fs.existsSync(DISK_PATH),
      diskFile: diskInfo,
      env: {
        SAP_B1_USERNAME: process.env.SAP_B1_USERNAME || '(not set)',
        SAP_COMPANY_DB: process.env.SAP_COMPANY_DB || '(not set)',
        SAP_SERVICE_LAYER_URL: process.env.SAP_SERVICE_LAYER_URL || '(not set)',
      },
    };
  }

  /**
   * Tests a set of credentials without touching the system session.
   * Serialized through the global login queue — cannot race with _doLogin().
   * Used by /connection/test to validate user-entered SAP credentials.
   */
  async testCredentials(
    username: string, password: string, companyDb: string,
  ): Promise<{ success: boolean; error?: string }> {
    console.log(`[SapCentralSession] testCredentials() — queuing ephemeral login for user=${username} db=${companyDb}`);
    return this._enqueueLoginOp(() => this._doTestCredentials(username, password, companyDb));
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async _doTestCredentials(
    username: string, password: string, companyDb: string,
  ): Promise<{ success: boolean; error?: string }> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let sessionCookie: string | undefined;
      console.log(`[SapCentralSession] _doTestCredentials() — ephemeral login attempt ${attempt}/2 for user=${username} db=${companyDb}`);
      try {
        const { sessionCookie: sc } = await sapHttpsClient.login(username, password, companyDb);
        sessionCookie = sc;

        await sapHttpsClient.authenticatedRequest(sessionCookie, {
          method: 'GET', url: '', path: '/b1s/v1/PurchaseOrders?$top=1',
        });

        console.log('[SapCentralSession] _doTestCredentials() — OK');
        return { success: true };
      } catch (err: any) {
        const msg: string = err?.message ?? String(err);
        const is1102 = this._is1102(msg);

        if (is1102) {
          console.error(`[SapCentralSession] _doTestCredentials() RAW -1102 signal (attempt ${attempt}): ${msg.substring(0, 600)}`);
        }

        // Always try to logout the ephemeral cookie if we managed to get one
        if (sessionCookie) {
          try { await sapHttpsClient.logout(sessionCookie); } catch { /* non-fatal */ }
          sessionCookie = undefined;
        }

        if (is1102 && attempt === 1) {
          console.warn(
            '[SapCentralSession] _doTestCredentials() — -1102 on attempt 1. ' +
            'Also attempting stale disk-cookie logout, then waiting 5 s before retry...',
          );
          // Best-effort: kill any stale session we know about from disk
          try {
            if (fs.existsSync(DISK_PATH)) {
              const raw = fs.readFileSync(DISK_PATH, 'utf-8');
              const diskState: DiskState = JSON.parse(raw);
              const staleCookie = diskState.pendingLogout || diskState.cookie;
              if (staleCookie) {
                await sapHttpsClient.logout(staleCookie);
                try { fs.unlinkSync(DISK_PATH); } catch { /* non-fatal */ }
                console.log('[SapCentralSession] _doTestCredentials() — stale disk cookie force-logged-out ✅');
              }
            }
          } catch (fe: any) {
            console.warn('[SapCentralSession] _doTestCredentials() — stale disk logout failed (non-fatal):', fe.message);
          }
          await new Promise<void>(r => setTimeout(r, 5000));
          continue; // retry attempt 2
        }

        console.warn('[SapCentralSession] _doTestCredentials() — failed:', msg);
        return { success: false, error: msg };
      }
    }
    return { success: false, error: 'SAP login failed after 2 attempts' };
  }

  private async _doLogin(): Promise<string> {
    const user = process.env.SAP_B1_USERNAME || '';
    const pass = process.env.SAP_B1_PASSWORD || '';
    const db   = process.env.SAP_COMPANY_DB || '';

    if (!user || !pass || !db) {
      throw new Error(
        'SAP credentials not configured — set SAP_B1_USERNAME, SAP_B1_PASSWORD and SAP_COMPANY_DB in Secrets.',
      );
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      this.stats.loginAttempts++;
      const ts = new Date().toISOString();
      console.log(`[SapCentralSession] login_attempt #${this.stats.loginAttempts} (attempt ${attempt}/2) — user=${user} db=${db} at ${ts}`);

      try {
        const { sessionCookie } = await sapHttpsClient.login(user, pass, db);
        this.cookie    = sessionCookie;
        this.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
        this.stats.loginSuccesses++;
        this.stats.lastLoginAt = new Date().toISOString();
        this._saveToDisk();
        console.log(`[SapCentralSession] ✅ login_success #${this.stats.loginSuccesses} (attempt ${attempt}) — expires ${this.expiresAt.toISOString()}`);
        return sessionCookie;
      } catch (err: any) {
        const msg: string = err?.message ?? String(err);
        const is1102 = this._is1102(msg);

        // Always log the raw SAP -1102 signal separately from the app-constructed message
        if (is1102) {
          console.error(`[SapCentralSession] RAW SAP -1102 signal (login attempt ${attempt}) — raw error: ${msg.substring(0, 800)}`);
        }

        if (is1102 && attempt === 1) {
          this.stats.retryOn1102++;
          console.warn(
            `[SapCentralSession] ⚠️  retry_on_1102 #${this.stats.retryOn1102} — competing session detected on attempt 1. ` +
            `Possible causes: (1) previous server run session not yet expired on SAP side ` +
            `(logout may have silently failed — check logoutFailures in stats), ` +
            `(2) parallel testCredentials() or forceLogin() call (should not happen with v3.0 queue).`,
          );

          // Try to force-logout using the stale session cookie from disk.
          let staleKilled = false;
          try {
            if (fs.existsSync(DISK_PATH)) {
              const raw = fs.readFileSync(DISK_PATH, 'utf-8');
              const diskState: DiskState = JSON.parse(raw);
              const staleCookie = diskState.pendingLogout || diskState.cookie;
              if (staleCookie) {
                console.log('[SapCentralSession] retry_on_1102 — found stale disk cookie, attempting force-logout...');
                await sapHttpsClient.logout(staleCookie);
                this.stats.logouts++;
                try { fs.unlinkSync(DISK_PATH); } catch { /* non-fatal */ }
                staleKilled = true;
                console.log('[SapCentralSession] retry_on_1102 — stale disk session force-logged-out ✅');
              }
            }
          } catch (forceErr: any) {
            this.stats.logoutFailures++;
            console.warn('[SapCentralSession] retry_on_1102 — force-logout of stale disk session failed:', forceErr.message);
          }

          if (!staleKilled) {
            console.warn(
              '[SapCentralSession] retry_on_1102 — no stale disk cookie available. ' +
              'If logoutFailures stat is non-zero, the previous logout silently failed and SAP kept the session alive. ' +
              'Waiting 5 s before retry...',
            );
          }

          await new Promise<void>(r => setTimeout(r, 5000));
          continue; // retry attempt 2
        }

        // Non-1102 error, or any error on attempt 2
        this.stats.loginFailures++;
        this.stats.lastErrorAt = new Date().toISOString();
        this.stats.lastError = msg;
        this.cookie    = null;
        this.expiresAt = null;

        if (is1102) {
          const integUser = process.env.SAP_B1_USERNAME || '(not set)';
          const isManager = integUser.toLowerCase() === 'manager';
          const sessionAlive = !!(this.cookie && this.expiresAt && this.expiresAt > new Date());
          const managerWarn = isManager
            ? ' ⚠️  Integration user is "Manager" — SAP B1 "Manager" is a shared superuser account and is highly likely to conflict with SAP desktop sessions.'
            : '';
          const errMsg =
            `SAP B1 request failed: SAP session conflict (-1102): a competing session is active for integration user "${integUser}".${managerWarn} ` +
            `Current server session alive: ${sessionAlive}. ` +
            `Possible causes: (1) SAP desktop client or SAP Business Client logged in with the same user, ` +
            `(2) a parallel Full Sync or GRPO request is mid-flight in this server. ` +
            `Session stats — login_attempts: ${this.stats.loginAttempts}, retry_on_1102: ${this.stats.retryOn1102}. ` +
            `Use POST /api/sap/session/force-reset to attempt recovery.`;
          console.error(`[SapCentralSession] ❌ login_failure #${this.stats.loginFailures} — -1102: ${errMsg}`);
          throw new Error(errMsg);
        }

        console.error(`[SapCentralSession] ❌ login_failure #${this.stats.loginFailures} (attempt ${attempt}) — ${msg}`);
        throw err;
      }
    }

    // Should never reach here
    throw new Error('SAP login failed after 2 attempts');
  }

  private _is1102(str: string): boolean {
    return str.includes('-1102') || str.toLowerCase().includes('switch company');
  }

  private _saveToDisk(): void {
    try {
      const state: DiskState = { cookie: this.cookie!, createdAt: Date.now() };
      fs.writeFileSync(DISK_PATH, JSON.stringify(state));
    } catch (err: any) {
      console.warn('[SapCentralSession] Failed to persist session to disk:', err.message);
    }
  }

  /**
   * Writes the cookie as `pendingLogout` on disk WITHOUT clearing the active cookie.
   * Used by invalidate() so a crash between logout-attempt and disk-delete does not
   * lose the cookie needed for the next startup's force-logout.
   */
  private _savePendingLogout(cookie: string): void {
    try {
      const existing: Partial<DiskState> = (() => {
        try {
          if (fs.existsSync(DISK_PATH)) return JSON.parse(fs.readFileSync(DISK_PATH, 'utf-8'));
        } catch { /* */ }
        return {};
      })();
      const state: DiskState = {
        cookie: existing.cookie || cookie,
        createdAt: existing.createdAt || Date.now(),
        pendingLogout: cookie,
      };
      fs.writeFileSync(DISK_PATH, JSON.stringify(state));
    } catch (err: any) {
      console.warn('[SapCentralSession] Failed to write pendingLogout to disk:', err.message);
    }
  }

  private _deleteDisk(): void {
    try {
      if (fs.existsSync(DISK_PATH)) fs.unlinkSync(DISK_PATH);
    } catch { /* non-fatal */ }
  }
}

/** Singleton — the ONE system SAP session for the entire server process. */
export const sapSession = new SapCentralSession();
export default sapSession;
