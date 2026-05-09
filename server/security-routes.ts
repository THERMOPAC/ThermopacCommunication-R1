import { Express, Request, Response } from 'express';
import { db } from './db';
import { users, reauthAuditLog } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { decryptSecret } from './utils/two-factor-crypto';
import * as OTPAuth from 'otpauth';
import bcrypt from 'bcrypt';
import { getSensitiveActionPolicy, writeReauthAudit } from './middleware/require-reauth';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ message: 'Not authenticated' });
}

async function verifyPassword(userId: number, credential: string): Promise<boolean> {
  const [userData] = await db
    .select({ password: users.password })
    .from(users)
    .where(eq(users.id, userId));
  if (!userData?.password) return false;
  return bcrypt.compare(credential, userData.password);
}

async function verifyTotp(userId: number, credential: string): Promise<boolean> {
  const [userData] = await db
    .select({ twoFactorSecret: users.twoFactorSecret, twoFactorEnabled: users.twoFactorEnabled })
    .from(users)
    .where(eq(users.id, userId));
  if (!userData?.twoFactorEnabled || !userData.twoFactorSecret) return false;
  const decryptedSecret = decryptSecret(userData.twoFactorSecret);
  const totp = new OTPAuth.TOTP({
    issuer: 'THERMOPAC QMS',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(decryptedSecret),
  });
  const delta = totp.validate({ token: credential.replace(/\s/g, ''), window: 1 });
  return delta !== null;
}

export function registerSecurityRoutes(app: Express) {
  app.post('/api/security/reauth', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { actionKey, credential, credentialType, cancelled } = req.body;

      if (!actionKey || typeof actionKey !== 'string') {
        return res.status(400).json({ message: 'actionKey is required' });
      }

      const policy = await getSensitiveActionPolicy(actionKey);
      if (!policy || !policy.isActive) {
        return res.status(400).json({ message: 'Unknown or inactive action' });
      }

      if (cancelled === true) {
        try {
          await writeReauthAudit(user.id, actionKey, null, 'cancelled', req);
        } catch (e) {
          console.error('Reauth audit (cancel) failed — C-10:', e);
          return res.status(500).json({ message: 'Security service error' });
        }
        return res.json({ success: true });
      }

      if (!credential || typeof credential !== 'string') {
        return res.status(400).json({ message: 'credential is required' });
      }

      const challengeType = policy.challengeType;
      let passed = false;
      let resolvedType = credentialType as string | undefined;

      if (challengeType === 'password') {
        passed = await verifyPassword(user.id, credential);
        resolvedType = 'password';
      } else if (challengeType === 'totp') {
        const [userData] = await db
          .select({ twoFactorEnabled: users.twoFactorEnabled })
          .from(users)
          .where(eq(users.id, user.id));
        if (!userData?.twoFactorEnabled) {
          return res.status(400).json({ message: 'TOTP not enrolled. Contact your Superuser.' });
        }
        passed = await verifyTotp(user.id, credential);
        resolvedType = 'totp';
      } else {
        const attemptType = credentialType === 'totp' ? 'totp' : 'password';
        if (attemptType === 'totp') {
          passed = await verifyTotp(user.id, credential);
          resolvedType = 'totp';
        } else {
          passed = await verifyPassword(user.id, credential);
          resolvedType = 'password';
        }
      }

      if (!passed) {
        try {
          await writeReauthAudit(user.id, actionKey, resolvedType || challengeType, 'failed', req);
        } catch (e) {
          console.error('Reauth audit (failed) write failed — C-10:', e);
          return res.status(500).json({ message: 'Security service error' });
        }
        return res.status(401).json({ message: 'Invalid credential. Please try again.' });
      }

      req.session.reauthTokens = req.session.reauthTokens ?? {};
      req.session.reauthTokens[actionKey] = {
        at: Date.now(),
        challengeType: resolvedType || challengeType,
        consumed: false,
      };

      try {
        await writeReauthAudit(user.id, actionKey, resolvedType || challengeType, 'passed', req);
      } catch (e) {
        console.error('Reauth audit (passed) write failed — C-10:', e);
        delete req.session.reauthTokens[actionKey];
        return res.status(500).json({ message: 'Security service error' });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('POST /api/security/reauth error:', err);
      return res.status(500).json({ message: 'Re-authentication service error' });
    }
  });
}
