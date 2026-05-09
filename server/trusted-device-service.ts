import crypto from 'crypto';
import { Request, Response } from 'express';
import { db } from './db';
import {
  trustedDevices,
  trustedDeviceAuditLog,
  loginSecurityPolicies,
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

declare module 'express-session' {
  interface SessionData {
    deviceTrusted?: boolean;
    deviceFingerprint?: string;
  }
}

// ── Raw-header cookie parser (no cookie-parser package needed) ───────────────
export function parseDeviceCookie(req: Request): string | undefined {
  const header = req.headers.cookie ?? '';
  const match = /(?:^|;\s*)thermopac\.device=([A-Fa-f0-9]{64})(?:;|$)/.exec(header);
  return match?.[1];
}

// ── Supplemental fingerprint (forensic reference only — not used for auth) ──
export function computeDeviceFingerprint(req: Request): string {
  const ua   = req.headers['user-agent']       ?? '';
  const ip   = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
               ?? req.socket?.remoteAddress     ?? '';
  const lang = req.headers['accept-language']  ?? '';
  return crypto.createHash('sha256').update(`${ip}:${ua}:${lang}`).digest('hex');
}

export function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? req.socket?.remoteAddress
    ?? 'unknown';
}

// ── Policy lookup ────────────────────────────────────────────────────────────
export async function requiresDeviceTrust(role: string): Promise<boolean> {
  const rows = await db
    .select({ requireDeviceTrust: loginSecurityPolicies.requireDeviceTrust })
    .from(loginSecurityPolicies)
    .where(sql`${role} = ANY(${loginSecurityPolicies.applyToRoles})`);
  return rows[0]?.requireDeviceTrust ?? false;
}

// ── Audit writer ─────────────────────────────────────────────────────────────
export async function writeDeviceAudit(params: {
  userId: number;
  deviceId?: number | null;
  action: string;
  performedBy?: number | null;
  ipAddress?: string | null;
  severity: string;
  notes?: string | null;
}): Promise<void> {
  await db.insert(trustedDeviceAuditLog).values({
    userId: params.userId,
    deviceId: params.deviceId ?? null,
    action: params.action,
    performedBy: params.performedBy ?? null,
    ipAddress: params.ipAddress ?? null,
    severity: params.severity,
    notes: params.notes ?? null,
  });
}

// ── Login enforcement ────────────────────────────────────────────────────────
export interface DeviceTrustResult {
  trusted: boolean;
  deviceId?: number;
  reason?: string;
}

export async function checkDeviceTrustAtLogin(
  req: Request,
  userId: number,
  role: string,
): Promise<DeviceTrustResult> {
  const needsTrust = await requiresDeviceTrust(role);
  if (!needsTrust) return { trusted: true };

  const cookieToken = parseDeviceCookie(req);
  const ip = getClientIp(req);

  if (!cookieToken) {
    await writeDeviceAudit({
      userId,
      action: 'login_blocked_untrusted',
      severity: 'warning',
      ipAddress: ip,
      notes: 'No device cookie present',
    });
    return { trusted: false, reason: 'NO_COOKIE' };
  }

  const [record] = await db
    .select()
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.trustToken, cookieToken),
        eq(trustedDevices.userId, userId),
        eq(trustedDevices.isActive, true),
      ),
    )
    .limit(1);

  if (!record) {
    await writeDeviceAudit({
      userId,
      action: 'login_blocked_untrusted',
      severity: 'warning',
      ipAddress: ip,
      notes: 'Cookie token not in active device registry',
    });
    return { trusted: false, reason: 'TOKEN_NOT_FOUND' };
  }

  // Trusted — update last_used_at and supplemental fingerprint
  const fingerprint = computeDeviceFingerprint(req);
  await db
    .update(trustedDevices)
    .set({ lastUsedAt: new Date(), deviceFingerprint: fingerprint })
    .where(eq(trustedDevices.id, record.id));

  await writeDeviceAudit({
    userId,
    deviceId: record.id,
    action: 'login_trusted',
    severity: 'info',
    ipAddress: ip,
    notes: `Device: ${record.deviceName ?? 'unnamed'}`,
  });

  return { trusted: true, deviceId: record.id };
}

// ── Admin: register device ───────────────────────────────────────────────────
export async function registerDevice(
  userId: number,
  deviceName: string,
  adminId: number,
  ip: string,
): Promise<{ deviceId: number; trustToken: string; activationUrl: string }> {
  const trustToken = crypto.randomBytes(32).toString('hex');

  const [inserted] = await db
    .insert(trustedDevices)
    .values({
      userId,
      deviceFingerprint: '',
      deviceName,
      trustToken,
      isActive: true,
      registeredByAdmin: true,
      registeredBy: adminId,
    })
    .returning({ id: trustedDevices.id });

  await writeDeviceAudit({
    userId,
    deviceId: inserted.id,
    action: 'registered',
    performedBy: adminId,
    severity: 'info',
    ipAddress: ip,
    notes: 'Pending activation by user',
  });

  return {
    deviceId: inserted.id,
    trustToken,
    activationUrl: `/api/security/activate-device?token=${trustToken}`,
  };
}

// ── User: activate device (sets cookie) ─────────────────────────────────────
export async function activateDevice(
  trustToken: string,
  userId: number,
  req: Request,
  res: Response,
): Promise<{ ok: true } | { error: number; message: string }> {
  if (!/^[A-Fa-f0-9]{64}$/.test(trustToken)) {
    return { error: 400, message: 'Invalid token format' };
  }

  const [record] = await db
    .select()
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.trustToken, trustToken),
        eq(trustedDevices.isActive, true),
      ),
    )
    .limit(1);

  if (!record) return { error: 404, message: 'Token not found or device has been revoked' };
  if (record.userId !== userId) return { error: 403, message: 'Token belongs to a different user' };
  if (record.deviceFingerprint !== '') return { error: 409, message: 'Device already activated' };

  const fingerprint = computeDeviceFingerprint(req);
  const ip = getClientIp(req);

  await db
    .update(trustedDevices)
    .set({ deviceFingerprint: fingerprint, lastUsedAt: new Date() })
    .where(eq(trustedDevices.id, record.id));

  await writeDeviceAudit({
    userId,
    deviceId: record.id,
    action: 'activated',
    performedBy: userId,
    severity: 'info',
    ipAddress: ip,
    notes: 'Device cookie set on user machine',
  });

  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('thermopac.device', trustToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,
    maxAge: 31_536_000_000,
    path: '/',
  });

  return { ok: true };
}

// ── Admin: revoke single device ──────────────────────────────────────────────
export async function revokeDevice(
  deviceId: number,
  targetUserId: number,
  revokedById: number,
  reason: string,
  ip: string,
): Promise<{ ok: true } | { error: number; message: string }> {
  const [record] = await db
    .select()
    .from(trustedDevices)
    .where(and(eq(trustedDevices.id, deviceId), eq(trustedDevices.userId, targetUserId)))
    .limit(1);

  if (!record) return { error: 404, message: 'Device not found' };

  await db
    .update(trustedDevices)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedBy: revokedById,
      revokedReason: reason || 'Revoked',
    })
    .where(eq(trustedDevices.id, deviceId));

  await writeDeviceAudit({
    userId: targetUserId,
    deviceId,
    action: 'revoked',
    performedBy: revokedById,
    severity: 'warning',
    ipAddress: ip,
    notes: reason || 'Revoked',
  });

  return { ok: true };
}

// ── Admin: revoke ALL devices (compromise response) ──────────────────────────
export async function revokeAllDevices(
  targetUserId: number,
  adminId: number,
  reason: string,
  ip: string,
): Promise<number> {
  const activeRecords = await db
    .select({ id: trustedDevices.id, deviceName: trustedDevices.deviceName })
    .from(trustedDevices)
    .where(and(eq(trustedDevices.userId, targetUserId), eq(trustedDevices.isActive, true)));

  if (activeRecords.length === 0) return 0;

  await db
    .update(trustedDevices)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedBy: adminId,
      revokedReason: reason,
    })
    .where(and(eq(trustedDevices.userId, targetUserId), eq(trustedDevices.isActive, true)));

  for (const rec of activeRecords) {
    await writeDeviceAudit({
      userId: targetUserId,
      deviceId: rec.id,
      action: 'revoke_all',
      performedBy: adminId,
      severity: 'critical',
      ipAddress: ip,
      notes: reason,
    });
  }

  await writeDeviceAudit({
    userId: targetUserId,
    action: 'reregistration_required',
    performedBy: adminId,
    severity: 'warning',
    ipAddress: ip,
    notes: 'Forced re-registration after revoke-all',
  });

  return activeRecords.length;
}
