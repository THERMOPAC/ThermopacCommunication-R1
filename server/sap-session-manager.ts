import { Request } from 'express';

interface SapSession {
  sessionId: string;
  routeId?: string;
  companyDb: string;
  userId: number;
  expiresAt: Date;
  createdAt: Date;
}

interface SapMetrics {
  loginAttempts: number;
  loginSuccesses: number;
  loginFailures: number;
  activeSessions: number;
}

class SapSessionManager {
  private sessions = new Map<number, SapSession>();
  private metrics: SapMetrics = {
    loginAttempts: 0,
    loginSuccesses: 0,
    loginFailures: 0,
    activeSessions: 0
  };
  
  private readonly TTL_SECONDS: number;

  constructor() {
    this.TTL_SECONDS = parseInt(process.env.SAP_B1_SESSION_TTL_SEC || '1800');
    
    // Cleanup expired sessions every 5 minutes
    setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000);
  }

  setSession(userId: number, sessionId: string, routeId?: string, companyDb?: string): void {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + this.TTL_SECONDS);
    
    this.sessions.set(userId, {
      sessionId,
      routeId,
      companyDb: companyDb || process.env.SAP_COMPANY_DB || 'TPEL_LIVE',
      userId,
      expiresAt,
      createdAt: new Date()
    });
    
    this.updateMetrics();
    console.log(`SAP session created for user ${userId} on ${companyDb || 'default'}, expires at ${expiresAt.toISOString()}`);
  }

  getSession(userId: number): SapSession | null {
    const session = this.sessions.get(userId);
    if (!session) {
      return null;
    }
    
    if (session.expiresAt <= new Date()) {
      this.sessions.delete(userId);
      this.updateMetrics();
      console.log(`SAP session expired for user ${userId}`);
      return null;
    }
    
    return session;
  }

  isValidSession(userId: number): boolean {
    return this.getSession(userId) !== null;
  }

  clearSession(userId: number): void {
    const deleted = this.sessions.delete(userId);
    if (deleted) {
      this.updateMetrics();
      console.log(`SAP session cleared for user ${userId}`);
    }
  }

  getTtlSeconds(userId: number): number | null {
    const session = this.getSession(userId);
    if (!session) {
      return null;
    }
    
    const now = new Date();
    const ttlMs = session.expiresAt.getTime() - now.getTime();
    return Math.max(0, Math.floor(ttlMs / 1000));
  }

  cleanupExpired(): void {
    const now = new Date();
    let cleanedCount = 0;
    
    this.sessions.forEach((session, userId) => {
      if (session.expiresAt <= now) {
        this.sessions.delete(userId);
        cleanedCount++;
      }
    });
    
    if (cleanedCount > 0) {
      this.updateMetrics();
      console.log(`Cleaned up ${cleanedCount} expired SAP sessions`);
    }
  }

  // Metrics methods
  incrementLoginAttempts(): void {
    this.metrics.loginAttempts++;
  }

  incrementLoginSuccesses(): void {
    this.metrics.loginSuccesses++;
  }

  incrementLoginFailures(): void {
    this.metrics.loginFailures++;
  }

  getMetrics(): SapMetrics {
    return { ...this.metrics };
  }

  private updateMetrics(): void {
    this.metrics.activeSessions = this.sessions.size;
  }

  // Get all session info for monitoring (without sensitive data)
  getSessionsSummary() {
    const sessions: any[] = [];
    this.sessions.forEach((session) => {
      sessions.push({
        userId: session.userId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        ttlSeconds: Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
      });
    });
    return sessions;
  }
}

// Export singleton instance
export const sapSessionManager = new SapSessionManager();
export default sapSessionManager;