import { Router, Request, Response } from 'express';
import { requireReauth } from './middleware/require-reauth';
import { db } from './db';
import { users, twoFactorAuditLog } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { encryptSecret, decryptSecret, generateBackupCodes, hashBackupCode, verifyBackupCode } from './utils/two-factor-crypto';
import * as OTPAuth from 'otpauth';
import jwt from 'jsonwebtoken';
import * as QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const router = Router();

const ISSUER = 'THERMOPAC QMS';
const CHALLENGE_EXPIRY = '5m';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

function getJwtSecret(): string {
  const key = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  if (!key) throw new Error('TWO_FACTOR_ENCRYPTION_KEY not set');
  return key;
}

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Authentication required' });
}

function getClientInfo(req: Request) {
  return {
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
  };
}

async function logAuditEvent(userId: number, action: string, req: Request, metadata: Record<string, any> = {}) {
  const { ipAddress, userAgent } = getClientInfo(req);
  await db.insert(twoFactorAuditLog).values({
    userId,
    action,
    ipAddress,
    userAgent,
    metadata,
  });
}

router.post('/setup', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    const [userData] = await db.select({
      twoFactorEnabled: users.twoFactorEnabled,
    }).from(users).where(eq(users.id, user.id));

    if (userData?.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is already enabled. Disable it first to reconfigure.' });
    }

    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: user.username || user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const otpauthUrl = totp.toString();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    const encryptedSecret = encryptSecret(secret.base32);

    await db.update(users).set({
      twoFactorSecret: encryptedSecret,
    }).where(eq(users.id, user.id));

    await logAuditEvent(user.id, 'setup_initiated', req);

    res.json({
      qrCode: qrCodeDataUrl,
      manualKey: secret.base32,
      otpauthUrl,
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ error: 'Failed to set up 2FA' });
  }
});

router.post('/verify-setup', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { code } = req.body;

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return res.status(400).json({ error: 'A valid 6-digit code is required' });
    }

    const [userData] = await db.select({
      twoFactorSecret: users.twoFactorSecret,
      twoFactorEnabled: users.twoFactorEnabled,
    }).from(users).where(eq(users.id, user.id));

    if (!userData?.twoFactorSecret) {
      return res.status(400).json({ error: 'Please initiate 2FA setup first' });
    }

    if (userData.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }

    const decryptedSecret = decryptSecret(userData.twoFactorSecret);
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(decryptedSecret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      await logAuditEvent(user.id, 'setup_verify_failed', req);
      return res.status(400).json({ error: 'Invalid code. Please try again with the current code from your authenticator app.' });
    }

    const plainBackupCodes = generateBackupCodes(10);
    const hashedCodes = await Promise.all(
      plainBackupCodes.map(async (code) => ({
        hash: await hashBackupCode(code),
        used: false,
      }))
    );

    await db.update(users).set({
      twoFactorEnabled: true,
      twoFactorBackupCodes: hashedCodes,
      twoFactorFailedAttempts: 0,
      twoFactorLockedUntil: null,
    }).where(eq(users.id, user.id));

    await logAuditEvent(user.id, 'activated', req);

    res.json({
      success: true,
      backupCodes: plainBackupCodes,
      message: '2FA has been enabled successfully. Save your backup codes in a safe place.',
    });
  } catch (error) {
    console.error('2FA verify-setup error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA setup' });
  }
});

router.post('/disable', ensureAuthenticated, requireReauth('user.disable_2fa'), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to disable 2FA' });
    }

    const [userData] = await db.select({
      password: users.password,
      twoFactorEnabled: users.twoFactorEnabled,
    }).from(users).where(eq(users.id, user.id));

    if (!userData?.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    const passwordValid = await bcrypt.compare(password, userData.password);
    if (!passwordValid) {
      await logAuditEvent(user.id, 'disable_failed_wrong_password', req);
      return res.status(403).json({ error: 'Incorrect password' });
    }

    await db.update(users).set({
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
      twoFactorFailedAttempts: 0,
      twoFactorLockedUntil: null,
      twoFactorChallengeNonce: null,
    }).where(eq(users.id, user.id));

    await logAuditEvent(user.id, 'disabled', req);

    res.json({ success: true, message: '2FA has been disabled' });
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { challengeToken, code } = req.body;

    if (!challengeToken || !code) {
      return res.status(400).json({ error: 'Challenge token and code are required' });
    }

    let payload: any;
    try {
      payload = jwt.verify(challengeToken, getJwtSecret());
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Challenge has expired. Please log in again.' });
      }
      return res.status(401).json({ error: 'Invalid challenge token' });
    }

    if (payload.type !== '2fa_challenge') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const userId = payload.userId;
    const nonce = payload.nonce;

    const [userData] = await db.select({
      twoFactorEnabled: users.twoFactorEnabled,
      twoFactorSecret: users.twoFactorSecret,
      twoFactorFailedAttempts: users.twoFactorFailedAttempts,
      twoFactorLockedUntil: users.twoFactorLockedUntil,
      twoFactorChallengeNonce: users.twoFactorChallengeNonce,
    }).from(users).where(eq(users.id, userId));

    if (!userData?.twoFactorEnabled || !userData.twoFactorSecret) {
      return res.status(400).json({ error: '2FA is not configured for this account' });
    }

    if (userData.twoFactorChallengeNonce !== nonce) {
      return res.status(401).json({ error: 'Challenge has been invalidated. Please log in again.' });
    }

    if (userData.twoFactorLockedUntil && new Date(userData.twoFactorLockedUntil) > new Date()) {
      const remaining = Math.ceil((new Date(userData.twoFactorLockedUntil).getTime() - Date.now()) / 60000);
      await logAuditEvent(userId, 'verify_blocked_lockout', req, { remainingMinutes: remaining });
      return res.status(429).json({ error: `Account locked due to too many failed attempts. Try again in ${remaining} minute(s).` });
    }

    const decryptedSecret = decryptSecret(userData.twoFactorSecret);
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: '',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(decryptedSecret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      const newAttempts = (userData.twoFactorFailedAttempts || 0) + 1;
      const updateData: any = { twoFactorFailedAttempts: newAttempts };

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        updateData.twoFactorLockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        updateData.twoFactorChallengeNonce = null;
        await logAuditEvent(userId, 'lockout', req, { attempts: newAttempts });
      }

      await db.update(users).set(updateData).where(eq(users.id, userId));
      await logAuditEvent(userId, 'verify_failed', req, { attempts: newAttempts });

      const attemptsLeft = MAX_FAILED_ATTEMPTS - newAttempts;
      if (attemptsLeft <= 0) {
        return res.status(429).json({ error: 'Too many failed attempts. Account locked for 15 minutes.' });
      }
      return res.status(400).json({ error: `Invalid code. ${attemptsLeft} attempt(s) remaining.` });
    }

    await db.update(users).set({
      twoFactorFailedAttempts: 0,
      twoFactorLockedUntil: null,
      twoFactorChallengeNonce: null,
    }).where(eq(users.id, userId));

    await logAuditEvent(userId, 'verify_success', req);

    const [fullUser] = await db.select().from(users).where(eq(users.id, userId));

    await new Promise<void>((resolve, reject) => {
      req.login(fullUser, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const { password: _, twoFactorSecret: __, ...safeUser } = fullUser;
    res.json({ success: true, user: safeUser });
  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA code' });
  }
});

router.post('/verify-backup', async (req: Request, res: Response) => {
  try {
    const { challengeToken, backupCode } = req.body;

    if (!challengeToken || !backupCode) {
      return res.status(400).json({ error: 'Challenge token and backup code are required' });
    }

    let payload: any;
    try {
      payload = jwt.verify(challengeToken, getJwtSecret());
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Challenge has expired. Please log in again.' });
      }
      return res.status(401).json({ error: 'Invalid challenge token' });
    }

    if (payload.type !== '2fa_challenge') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const userId = payload.userId;
    const nonce = payload.nonce;

    const [userData] = await db.select({
      twoFactorEnabled: users.twoFactorEnabled,
      twoFactorBackupCodes: users.twoFactorBackupCodes,
      twoFactorFailedAttempts: users.twoFactorFailedAttempts,
      twoFactorLockedUntil: users.twoFactorLockedUntil,
      twoFactorChallengeNonce: users.twoFactorChallengeNonce,
    }).from(users).where(eq(users.id, userId));

    if (!userData?.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is not configured for this account' });
    }

    if (userData.twoFactorChallengeNonce !== nonce) {
      return res.status(401).json({ error: 'Challenge has been invalidated. Please log in again.' });
    }

    if (userData.twoFactorLockedUntil && new Date(userData.twoFactorLockedUntil) > new Date()) {
      const remaining = Math.ceil((new Date(userData.twoFactorLockedUntil).getTime() - Date.now()) / 60000);
      return res.status(429).json({ error: `Account locked. Try again in ${remaining} minute(s).` });
    }

    const backupCodes = (userData.twoFactorBackupCodes as any[]) || [];
    const normalizedInput = backupCode.replace(/[-\s]/g, '').toUpperCase();
    let matchedIndex = -1;

    for (let i = 0; i < backupCodes.length; i++) {
      if (backupCodes[i].used) continue;
      const isMatch = await verifyBackupCode(normalizedInput, backupCodes[i].hash);
      if (isMatch) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex === -1) {
      const newAttempts = (userData.twoFactorFailedAttempts || 0) + 1;
      const updateData: any = { twoFactorFailedAttempts: newAttempts };

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        updateData.twoFactorLockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        updateData.twoFactorChallengeNonce = null;
        await logAuditEvent(userId, 'lockout_backup', req, { attempts: newAttempts });
      }

      await db.update(users).set(updateData).where(eq(users.id, userId));
      await logAuditEvent(userId, 'backup_verify_failed', req, { attempts: newAttempts });

      const attemptsLeft = MAX_FAILED_ATTEMPTS - newAttempts;
      if (attemptsLeft <= 0) {
        return res.status(429).json({ error: 'Too many failed attempts. Account locked for 15 minutes.' });
      }
      return res.status(400).json({ error: `Invalid backup code. ${attemptsLeft} attempt(s) remaining.` });
    }

    backupCodes[matchedIndex].used = true;
    const remainingCodes = backupCodes.filter(c => !c.used).length;

    await db.update(users).set({
      twoFactorBackupCodes: backupCodes,
      twoFactorFailedAttempts: 0,
      twoFactorLockedUntil: null,
      twoFactorChallengeNonce: null,
    }).where(eq(users.id, userId));

    await logAuditEvent(userId, 'backup_code_used', req, { remainingCodes });

    const [fullUser] = await db.select().from(users).where(eq(users.id, userId));

    await new Promise<void>((resolve, reject) => {
      req.login(fullUser, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const { password: _, twoFactorSecret: __, ...safeUser } = fullUser;
    res.json({
      success: true,
      user: safeUser,
      warning: remainingCodes <= 3 ? `Only ${remainingCodes} backup code(s) remaining. Please regenerate soon.` : undefined,
    });
  } catch (error) {
    console.error('2FA verify-backup error:', error);
    res.status(500).json({ error: 'Failed to verify backup code' });
  }
});

router.post('/regenerate-backup', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to regenerate backup codes' });
    }

    const [userData] = await db.select({
      password: users.password,
      twoFactorEnabled: users.twoFactorEnabled,
    }).from(users).where(eq(users.id, user.id));

    if (!userData?.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    const passwordValid = await bcrypt.compare(password, userData.password);
    if (!passwordValid) {
      await logAuditEvent(user.id, 'regenerate_backup_failed_wrong_password', req);
      return res.status(403).json({ error: 'Incorrect password' });
    }

    const plainBackupCodes = generateBackupCodes(10);
    const hashedCodes = await Promise.all(
      plainBackupCodes.map(async (code) => ({
        hash: await hashBackupCode(code),
        used: false,
      }))
    );

    await db.update(users).set({
      twoFactorBackupCodes: hashedCodes,
    }).where(eq(users.id, user.id));

    await logAuditEvent(user.id, 'backup_codes_regenerated', req);

    res.json({
      success: true,
      backupCodes: plainBackupCodes,
      message: 'New backup codes generated. Previous codes are now invalid.',
    });
  } catch (error) {
    console.error('2FA regenerate-backup error:', error);
    res.status(500).json({ error: 'Failed to regenerate backup codes' });
  }
});

router.get('/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    const [userData] = await db.select({
      twoFactorEnabled: users.twoFactorEnabled,
      twoFactorBackupCodes: users.twoFactorBackupCodes,
    }).from(users).where(eq(users.id, user.id));

    const backupCodes = (userData?.twoFactorBackupCodes as any[]) || [];
    const remainingBackupCodes = backupCodes.filter(c => !c.used).length;

    res.json({
      enabled: userData?.twoFactorEnabled || false,
      remainingBackupCodes,
    });
  } catch (error) {
    console.error('2FA status error:', error);
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

export default router;
