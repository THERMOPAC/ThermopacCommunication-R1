/**
 * SAP Central Session Manager — v1.0
 *
 * Single source of truth for all server-initiated SAP B1 Service Layer sessions.
 * Enforces ONE active session at all times. Handles login, expiry, -1102 recovery,
 * disk persistence for graceful logout, and SIGTERM cleanup.
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
}

interface SapRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: any;
  timeout?: number;
}

class SapCentralSession {
  private cookie: string | null = null;
  private expiresAt: Date | null = null;

  /** Mutex — if a login is already in progress, subsequent callers await this */
  private loginPromise: Promise<string> | null = null;

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Called once on server startup.
   * Invalidates any previously-persisted session so we start clean.
   * This prevents -1102 from a prior run's session still being alive on SAP server.
   */
  async initialize(): Promise<void> {
    console.log('[SapCentralSession] Initializing — invalidating any persisted session...');
    try {
      if (fs.existsSync(DISK_PATH)) {
        const raw = fs.readFileSync(DISK_PATH, 'utf-8');
        const state: DiskState = JSON.parse(raw);
        if (state.cookie) {
          try {
            await sapHttpsClient.logout(state.cookie);
            console.log('[SapCentralSession] Old persisted session logged out on startup');
          } catch {
            console.warn('[SapCentralSession] Old session logout failed (non-fatal — may have already expired)');
          }
        }
        fs.unlinkSync(DISK_PATH);
        console.log('[SapCentralSession] Persisted session cache cleared');
      }
    } catch {
      // Silently ignore — disk file may not exist or be malformed
    }
    this.cookie = null;
    this.expiresAt = null;
    this.loginPromise = null;
  }

  /** Called on SIGTERM / SIGINT to cleanly release the SAP session. */
  async shutdown(): Promise<void> {
    console.log('[SapCentralSession] Shutdown — releasing SAP session...');
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
      return this.cookie;
    }

    // If login already in progress, await it instead of firing a second login
    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = this._doLogin().finally(() => {
      this.loginPromise = null;
    });

    return this.loginPromise;
  }

  /**
   * Make an authenticated SAP Service Layer request.
   * Automatically obtains/creates the session. Retries once on 401 (expired session).
   */
  async request(opts: SapRequestOptions): Promise<any> {
    const cookie = await this.getSession();

    let resp = await sapHttpsClient.authenticatedRequest(cookie, {
      method: opts.method,
      path: opts.path,
      url: '',
      ...(opts.body !== undefined ? { body: opts.body } : {}),
      ...(opts.timeout !== undefined ? { timeout: opts.timeout } : {}),
    });

    // Session expired — invalidate and retry once
    if (resp.statusCode === 401) {
      console.warn('[SapCentralSession] 401 received — session expired, refreshing...');
      await this.invalidate();
      const freshCookie = await this.getSession();
      resp = await sapHttpsClient.authenticatedRequest(freshCookie, {
        method: opts.method,
        path: opts.path,
        url: '',
        ...(opts.body !== undefined ? { body: opts.body } : {}),
        ...(opts.timeout !== undefined ? { timeout: opts.timeout } : {}),
      });
    }

    // -1102 in response body — same recovery
    if (typeof resp.body === 'string' && this._is1102(resp.body)) {
      console.warn('[SapCentralSession] -1102 in response body — invalidating and retrying...');
      await this.invalidate();
      const freshCookie = await this.getSession();
      resp = await sapHttpsClient.authenticatedRequest(freshCookie, {
        method: opts.method,
        path: opts.path,
        url: '',
        ...(opts.body !== undefined ? { body: opts.body } : {}),
        ...(opts.timeout !== undefined ? { timeout: opts.timeout } : {}),
      });
    }

    return resp;
  }

  /**
   * Invalidates the current session: logs out from SAP, clears memory and disk.
   */
  async invalidate(): Promise<void> {
    const cookieToLogout = this.cookie;
    this.cookie = null;
    this.expiresAt = null;
    this._deleteDisk();

    if (cookieToLogout) {
      try {
        await sapHttpsClient.logout(cookieToLogout);
        console.log('[SapCentralSession] Session invalidated — SAP logout successful');
      } catch (err: any) {
        console.warn('[SapCentralSession] SAP logout warning (non-fatal):', err.message);
      }
    } else {
      console.log('[SapCentralSession] Session invalidated (no active cookie to logout)');
    }
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
      username: process.env.SAP_USERNAME || '',
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
    let sessionCookie: string | undefined;
    try {
      const { sessionCookie: sc } = await sapHttpsClient.login(username, password, companyDb);
      sessionCookie = sc;

      // Quick API smoke-test
      await sapHttpsClient.authenticatedRequest(sessionCookie, {
        method: 'GET', url: '', path: '/b1s/v1/PurchaseOrders?$top=1',
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      if (sessionCookie) {
        try { await sapHttpsClient.logout(sessionCookie); } catch { /* non-fatal */ }
      }
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async _doLogin(): Promise<string> {
    const user = process.env.SAP_USERNAME || '';
    const pass = process.env.SAP_PASSWORD || '';
    const db   = process.env.SAP_COMPANY_DB || '';

    if (!user || !pass || !db) {
      throw new Error(
        'SAP credentials not configured — SAP_USERNAME / SAP_PASSWORD / SAP_COMPANY_DB must be set',
      );
    }

    console.log(`[SapCentralSession] Logging in → user=${user} db=${db}`);

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { sessionCookie } = await sapHttpsClient.login(user, pass, db);
        this.cookie    = sessionCookie;
        this.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
        this._saveToDisk();
        console.log(`[SapCentralSession] ✅ Login OK (attempt ${attempt}) — expires ${this.expiresAt.toISOString()}`);
        return sessionCookie;
      } catch (err: any) {
        const msg: string = err?.message ?? String(err);
        const is1102 = this._is1102(msg);

        if (is1102 && attempt === 1) {
          console.warn('[SapCentralSession] -1102 detected — attempting force-logout then retry...');
          const constructedCookie = `CompanyDB=${db}; UserName=${user}`;
          try {
            await sapHttpsClient.logout(constructedCookie);
            console.log('[SapCentralSession] Force-logout sent (best-effort)');
          } catch { /* ignore */ }
          await new Promise<void>(r => setTimeout(r, 1500));
          continue; // retry attempt 2
        }

        // Non-1102 error on attempt 1, or any error on attempt 2
        this.cookie    = null;
        this.expiresAt = null;

        if (is1102) {
          throw new Error(
            'SAP session conflict (-1102): another session is active on the SAP server. ' +
            'Please wait ~30 minutes for it to expire, then try again. ' +
            'If this persists, ask your SAP administrator to clear active sessions for this user.',
          );
        }
        throw err;
      }
    }

    // Should never reach here, but TypeScript needs a return
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

  private _deleteDisk(): void {
    try {
      if (fs.existsSync(DISK_PATH)) fs.unlinkSync(DISK_PATH);
    } catch { /* non-fatal */ }
  }
}

/** Singleton — the ONE system SAP session for the entire server process. */
export const sapSession = new SapCentralSession();
export default sapSession;
