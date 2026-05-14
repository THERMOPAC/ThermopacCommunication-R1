/**
 * SAP Central Session Manager — v2.0
 *
 * Single source of truth for all server-initiated SAP B1 Service Layer sessions.
 * Enforces ONE active session at all times. Handles login, expiry, -1102 recovery,
 * disk persistence for crash-safe logout, and SIGTERM cleanup.
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
 * Per-user sessions for GRPO / user-attributed SAP postings are handled separately
 * by sap-session-manager.ts and sap-auth-routes.ts — NOT this module.
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
  retryOn1102: number;
  lastLoginAt: string | null;
  lastInvalidateAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

class SapCentralSession {
  private cookie: string | null = null;
  private expiresAt: Date | null = null;

  /** Mutex — if a login is already in progress, subsequent callers await this */
  private loginPromise: Promise<string> | null = null;

  private stats: SessionStats = {
    loginAttempts: 0,
    loginSuccesses: 0,
    loginFailures: 0,
    sessionReuses: 0,
    invalidations: 0,
    logouts: 0,
    retryOn1102: 0,
    lastLoginAt: null,
    lastInvalidateAt: null,
    lastErrorAt: null,
    lastError: null,
  };

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
   * Thread-safe: concurrent callers during login share one login attempt.
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

    this.loginPromise = this._doLogin().finally(() => {
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
      console.warn('[SapCentralSession] request() — -1102 in response body, invalidating and retrying...');
      this.stats.retryOn1102++;
      await this.invalidate();
      const freshCookie = await this.getSession();
      resp = await sapHttpsClient.authenticatedRequest(freshCookie, baseOpts);
    }

    return resp;
  }

  /**
   * Invalidates the current session: logs out from SAP, clears memory and disk.
   *
   * Crash-safe: writes the cookie to disk as `pendingLogout` BEFORE attempting
   * logout, so if the process dies during the logout call, the next startup can
   * find and force-logout the stale session via initialize().
   */
  async invalidate(): Promise<void> {
    const cookieToLogout = this.cookie;
    this.cookie = null;
    this.expiresAt = null;
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
        console.warn(`[SapCentralSession] invalidate #${this.stats.invalidations} — logout warning (non-fatal):`, err.message);
      }
      // Only delete disk file after logout attempt (success or not — session is dead either way)
      this._deleteDisk();
    } else {
      this._deleteDisk();
      console.log(`[SapCentralSession] invalidate #${this.stats.invalidations} — no active cookie to logout`);
    }
  }

  /**
   * Admin-callable hard reset: invalidates current session, waits 2 s, then
   * re-runs initialize() so the next request triggers a clean fresh login.
   */
  async forceReset(): Promise<{ ok: boolean; message: string; debugInfo: object }> {
    console.log('[SapCentralSession] forceReset() — admin-initiated hard reset');

    // Abort any in-progress login mutex so it doesn't race
    this.loginPromise = null;

    await this.invalidate();
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
   * Used by /connection/test to validate user-entered SAP credentials.
   * Does its own ephemeral login → API test → logout.
   */
  async testCredentials(
    username: string, password: string, companyDb: string,
  ): Promise<{ success: boolean; error?: string }> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let sessionCookie: string | undefined;
      console.log(`[SapCentralSession] testCredentials() — ephemeral login attempt ${attempt}/2 for user=${username} db=${companyDb}`);
      try {
        const { sessionCookie: sc } = await sapHttpsClient.login(username, password, companyDb);
        sessionCookie = sc;

        await sapHttpsClient.authenticatedRequest(sessionCookie, {
          method: 'GET', url: '', path: '/b1s/v1/PurchaseOrders?$top=1',
        });

        console.log('[SapCentralSession] testCredentials() — OK');
        return { success: true };
      } catch (err: any) {
        const msg: string = err?.message ?? String(err);
        const is1102 = this._is1102(msg);

        // Always try to logout the ephemeral cookie if we managed to get one
        if (sessionCookie) {
          try { await sapHttpsClient.logout(sessionCookie); } catch { /* non-fatal */ }
          sessionCookie = undefined;
        }

        if (is1102 && attempt === 1) {
          console.warn(
            '[SapCentralSession] testCredentials() — -1102 on attempt 1. ' +
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
                console.log('[SapCentralSession] testCredentials() — stale disk cookie force-logged-out ✅');
              }
            }
          } catch (fe: any) {
            console.warn('[SapCentralSession] testCredentials() — stale disk logout failed (non-fatal):', fe.message);
          }
          await new Promise<void>(r => setTimeout(r, 5000));
          continue; // retry attempt 2
        }

        console.warn('[SapCentralSession] testCredentials() — failed:', msg);
        return { success: false, error: msg };
      }
    }
    return { success: false, error: 'SAP login failed after 2 attempts' };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

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

        if (is1102 && attempt === 1) {
          this.stats.retryOn1102++;
          console.warn(
            `[SapCentralSession] ⚠️  retry_on_1102 #${this.stats.retryOn1102} — competing session detected on attempt 1. ` +
            `Possible causes: parallel login in GRPO/sync route, user-session with same credentials, ` +
            `or previous server run's session still alive.`,
          );

          // Try to force-logout using the stale session cookie from disk.
          // NOTE: a random B1SESSION token is needed — we cannot construct one from credentials.
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
            console.warn('[SapCentralSession] retry_on_1102 — force-logout of stale disk session failed (non-fatal):', forceErr.message);
          }

          if (!staleKilled) {
            console.warn(
              '[SapCentralSession] retry_on_1102 — no stale disk cookie available for force-logout. ' +
              'Competing session is likely from another process, desktop client, or parallel login in this app. ' +
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
          const errMsg =
            'SAP session conflict (-1102): another session is active on the SAP server. ' +
            'Possible causes: (1) SAP desktop client logged in with same user, ' +
            '(2) another app/server using same credentials, ' +
            '(3) previous server process session still alive (wait ~30 min or use Force Reset). ' +
            'Use POST /api/sap/session/force-reset to attempt recovery.';
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
