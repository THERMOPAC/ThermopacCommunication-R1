import { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../db';
import { sensitiveActionPolicies, reauthAuditLog } from '@shared/schema';
import { isFeatureFlagEnabled } from '../utils/epc-migration-helpers';
import { eq } from 'drizzle-orm';

declare module 'express-session' {
  interface SessionData {
    reauthTokens?: Record<string, { at: number; challengeType: string; consumed?: boolean }>;
  }
}

const SINGLE_USE_GRACE_MS = 60_000; // 60 s grace for timeout_minutes=0 actions

export async function getSensitiveActionPolicy(actionKey: string) {
  const [policy] = await db
    .select()
    .from(sensitiveActionPolicies)
    .where(eq(sensitiveActionPolicies.actionKey, actionKey));
  return policy ?? null;
}

export async function writeReauthAudit(
  userId: number,
  actionKey: string,
  challengeType: string | null,
  outcome: string,
  req: Request,
): Promise<void> {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const severity = outcome === 'failed' ? 'warning' : 'info';
  await db.insert(reauthAuditLog).values({
    userId,
    actionKey,
    challengeType: challengeType || undefined,
    outcome,
    ipAddress: ip,
    severity,
  });
}

function tokenIsValid(token: { at: number; consumed?: boolean } | undefined, timeoutMinutes: number): boolean {
  if (!token) return false;
  const age = Date.now() - token.at;
  if (timeoutMinutes === 0) return !token.consumed && age < SINGLE_USE_GRACE_MS;
  return age < timeoutMinutes * 60_000;
}

export function requireReauth(actionKey: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!await isFeatureFlagEnabled('SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED')) return next();

      const user = req.user as any;
      if (!user?.id) return res.status(401).json({ message: 'Authentication required' });

      const policy = await getSensitiveActionPolicy(actionKey);
      if (!policy || !policy.isActive) return next();

      const token = req.session.reauthTokens?.[actionKey];
      const valid = tokenIsValid(token, policy.timeoutMinutes);

      if (valid) {
        if (policy.timeoutMinutes === 0) req.session.reauthTokens![actionKey].consumed = true;
        try {
          await writeReauthAudit(user.id, actionKey, token!.challengeType, 'reused', req);
        } catch (e) {
          console.error('Reauth audit (reused) write failed — C-10:', e);
          return res.status(500).json({ message: 'Security service error' });
        }
        return next();
      }

      try {
        await writeReauthAudit(user.id, actionKey, policy.challengeType, 'required', req);
      } catch (e) {
        console.error('Reauth audit (required) write failed — C-10:', e);
        return res.status(500).json({ message: 'Security service error' });
      }

      return res.status(403).json({
        code: 'REAUTH_REQUIRED',
        actionKey,
        challengeType: policy.challengeType,
        timeoutMinutes: policy.timeoutMinutes,
      });
    } catch (err) {
      console.error('requireReauth error:', err);
      return res.status(500).json({ message: 'Security middleware error' });
    }
  };
}

export async function checkReauth(
  req: Request,
  res: Response,
  actionKey: string,
): Promise<boolean> {
  try {
    if (!await isFeatureFlagEnabled('SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED')) return true;

    const user = req.user as any;
    if (!user?.id) {
      res.status(401).json({ message: 'Authentication required' });
      return false;
    }

    const policy = await getSensitiveActionPolicy(actionKey);
    if (!policy || !policy.isActive) return true;

    const token = req.session.reauthTokens?.[actionKey];
    const valid = tokenIsValid(token, policy.timeoutMinutes);

    if (valid) {
      if (policy.timeoutMinutes === 0) req.session.reauthTokens![actionKey].consumed = true;
      try {
        await writeReauthAudit(user.id, actionKey, token!.challengeType, 'reused', req);
      } catch (e) {
        console.error('Reauth audit (reused inline) write failed — C-10:', e);
        res.status(500).json({ message: 'Security service error' });
        return false;
      }
      return true;
    }

    try {
      await writeReauthAudit(user.id, actionKey, policy.challengeType, 'required', req);
    } catch (e) {
      console.error('Reauth audit (required inline) write failed — C-10:', e);
      res.status(500).json({ message: 'Security service error' });
      return false;
    }

    res.status(403).json({
      code: 'REAUTH_REQUIRED',
      actionKey,
      challengeType: policy.challengeType,
      timeoutMinutes: policy.timeoutMinutes,
    });
    return false;
  } catch (err) {
    console.error('checkReauth error:', err);
    res.status(500).json({ message: 'Security middleware error' });
    return false;
  }
}
