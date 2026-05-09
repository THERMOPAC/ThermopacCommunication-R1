import { db } from './db';
import {
  loginSecurityPolicies,
  loginAuditLog,
  userSessionRegistry,
  users,
} from '@shared/schema';
import { isFeatureFlagEnabled } from './utils/epc-migration-helpers';
import { eq, sql } from 'drizzle-orm';

export type LoginSecurityPolicy = typeof loginSecurityPolicies.$inferSelect;

export function computeSeverity(
  attempts: number,
  maxAttempts: number,
): 'info' | 'warning' | 'critical' {
  if (attempts >= maxAttempts) return 'critical';
  if (attempts === maxAttempts - 1) return 'warning';
  return 'info';
}

export async function getLoginPolicyForRole(
  role: string,
): Promise<LoginSecurityPolicy | null> {
  const rows = await db.select().from(loginSecurityPolicies);
  for (const policy of rows) {
    if (policy.applyToRoles.includes(role)) return policy;
  }
  return null;
}

export async function checkLockoutStatus(
  userId: number,
): Promise<{ isLocked: boolean; lockedUntil: Date | null }> {
  const result = await db
    .select({ lockedUntil: users.lockedUntil })
    .from(users)
    .where(eq(users.id, userId));
  const lockedUntil = result[0]?.lockedUntil ?? null;
  const isLocked = lockedUntil !== null && lockedUntil > new Date();
  return { isLocked, lockedUntil };
}

export async function recordFailedAttempt(
  userId: number,
  role: string,
  ip: string,
  userAgent: string,
  username: string,
): Promise<void> {
  const policy = await getLoginPolicyForRole(role);
  const maxAttempts = policy?.maxFailedAttempts ?? 5;
  const lockoutMinutes = policy?.lockoutMinutes ?? 15;

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ failedLoginAttempts: sql`failed_login_attempts + 1` })
      .where(eq(users.id, userId))
      .returning({ failedLoginAttempts: users.failedLoginAttempts });

    const newCount = updated[0]?.failedLoginAttempts ?? 1;

    if (newCount >= maxAttempts) {
      const lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
      await tx
        .update(users)
        .set({ lockedUntil })
        .where(eq(users.id, userId));
    }

    const severity = computeSeverity(newCount, maxAttempts);
    const outcome = newCount >= maxAttempts ? 'locked' : 'failed_password';

    await tx.insert(loginAuditLog).values({
      userId,
      username,
      ipAddress: ip,
      userAgent,
      outcome,
      policyLevel: policy?.policyLevel ?? 'standard',
      failedAttemptCount: newCount,
      severity,
    });
  });
}

export async function recordSuccessfulLogin(
  userId: number,
  role: string,
  sessionId: string,
  ip: string,
  userAgent: string,
  username: string,
): Promise<void> {
  const policy = await getLoginPolicyForRole(role);
  const policyLevel = policy?.policyLevel ?? 'standard';
  const sessionRegistryEnabled = await isFeatureFlagEnabled(
    'SECURITY_SESSION_REGISTRY_ENABLED',
  );

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        lastLoginDevice: userAgent,
      })
      .where(eq(users.id, userId));

    await tx.insert(loginAuditLog).values({
      userId,
      username,
      ipAddress: ip,
      userAgent,
      outcome: 'success',
      policyLevel,
      failedAttemptCount: 0,
      severity: 'info',
    });

    if (sessionRegistryEnabled) {
      await tx.insert(userSessionRegistry).values({
        userId,
        sessionId,
        ipAddress: ip,
        userAgent,
        isActive: true,
        lastActivityAt: new Date(),
      });
    }
  });
}
