import { Express, Request, Response } from 'express';
import { db } from './db';
import { trustedDevices, trustedDeviceAuditLog, users } from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';
import { requireReauth } from './middleware/require-reauth';
import {
  registerDevice,
  revokeDevice,
  revokeAllDevices,
  getClientIp,
} from './trusted-device-service';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ message: 'Not authenticated' });
}

function ensureSuperuser(req: Request, res: Response, next: Function) {
  const user = req.user as any;
  if (!user || user.role !== 'Superuser') {
    return res.status(403).json({ message: 'Superuser access required' });
  }
  next();
}

export function registerAdminDeviceRoutes(app: Express) {

  // GET /api/admin/users/:userId/devices — view user devices (Superuser)
  app.get(
    '/api/admin/users/:userId/devices',
    ensureAuthenticated,
    ensureSuperuser,
    async (req: Request, res: Response) => {
      try {
        const targetUserId = parseInt(req.params.userId, 10);
        if (isNaN(targetUserId)) return res.status(400).json({ message: 'Invalid user ID' });

        const devices = await db
          .select({
            id: trustedDevices.id,
            deviceName: trustedDevices.deviceName,
            deviceFingerprint: trustedDevices.deviceFingerprint,
            isActive: trustedDevices.isActive,
            registeredByAdmin: trustedDevices.registeredByAdmin,
            lastUsedAt: trustedDevices.lastUsedAt,
            revokedAt: trustedDevices.revokedAt,
            revokedReason: trustedDevices.revokedReason,
            createdAt: trustedDevices.createdAt,
            registeredById: trustedDevices.registeredBy,
            revokedById: trustedDevices.revokedBy,
          })
          .from(trustedDevices)
          .where(eq(trustedDevices.userId, targetUserId))
          .orderBy(desc(trustedDevices.createdAt));

        const result = devices.map(d => ({
          ...d,
          activationStatus: d.deviceFingerprint === '' ? 'pending' : 'activated',
        }));

        return res.json(result);
      } catch (err) {
        console.error('GET /api/admin/users/:userId/devices error:', err);
        return res.status(500).json({ message: 'Failed to load devices' });
      }
    },
  );

  // POST /api/admin/users/:userId/devices/grant — register device (TOTP, single-use)
  app.post(
    '/api/admin/users/:userId/devices/grant',
    ensureAuthenticated,
    ensureSuperuser,
    requireReauth('security.grant_device_trust'),
    async (req: Request, res: Response) => {
      try {
        const admin = req.user as any;
        const targetUserId = parseInt(req.params.userId, 10);
        if (isNaN(targetUserId)) return res.status(400).json({ message: 'Invalid user ID' });

        const { deviceName } = req.body;
        if (!deviceName || typeof deviceName !== 'string' || deviceName.trim() === '') {
          return res.status(400).json({ message: 'deviceName is required' });
        }

        const ip = getClientIp(req);
        const result = await registerDevice(targetUserId, deviceName.trim(), admin.id, ip);

        return res.status(201).json(result);
      } catch (err) {
        console.error('POST /api/admin/users/:userId/devices/grant error:', err);
        return res.status(500).json({ message: 'Failed to register device' });
      }
    },
  );

  // DELETE /api/admin/users/:userId/devices/:id — revoke single device (TOTP, single-use)
  app.delete(
    '/api/admin/users/:userId/devices/:id',
    ensureAuthenticated,
    ensureSuperuser,
    requireReauth('security.grant_device_trust'),
    async (req: Request, res: Response) => {
      try {
        const admin = req.user as any;
        const targetUserId = parseInt(req.params.userId, 10);
        const deviceId = parseInt(req.params.id, 10);
        if (isNaN(targetUserId) || isNaN(deviceId)) {
          return res.status(400).json({ message: 'Invalid ID' });
        }

        const ip = getClientIp(req);
        const reason = (req.body?.reason as string) || 'Admin revoked';
        const result = await revokeDevice(deviceId, targetUserId, admin.id, reason, ip);

        if ('error' in result) return res.status(result.error).json({ message: result.message });
        return res.json({ success: true });
      } catch (err) {
        console.error('DELETE /api/admin/users/:userId/devices/:id error:', err);
        return res.status(500).json({ message: 'Failed to revoke device' });
      }
    },
  );

  // POST /api/admin/users/:userId/devices/revoke-all — compromise response (TOTP, single-use)
  app.post(
    '/api/admin/users/:userId/devices/revoke-all',
    ensureAuthenticated,
    ensureSuperuser,
    requireReauth('security.grant_device_trust'),
    async (req: Request, res: Response) => {
      try {
        const admin = req.user as any;
        const targetUserId = parseInt(req.params.userId, 10);
        if (isNaN(targetUserId)) return res.status(400).json({ message: 'Invalid user ID' });

        const { reason } = req.body;
        if (!reason || typeof reason !== 'string' || reason.trim() === '') {
          return res.status(400).json({ message: 'reason is required and must be non-empty' });
        }

        const ip = getClientIp(req);
        const revokedCount = await revokeAllDevices(targetUserId, admin.id, reason.trim(), ip);

        return res.json({
          success: true,
          revokedCount,
          message: `${revokedCount} device(s) revoked. User must re-register before next login.`,
        });
      } catch (err) {
        console.error('POST /api/admin/users/:userId/devices/revoke-all error:', err);
        return res.status(500).json({ message: 'Failed to revoke all devices' });
      }
    },
  );

  // GET /api/admin/device-audit-log — paginated device audit log (Superuser)
  app.get(
    '/api/admin/device-audit-log',
    ensureAuthenticated,
    ensureSuperuser,
    async (req: Request, res: Response) => {
      try {
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const offset = parseInt(req.query.offset as string) || 0;

        const rows = await db
          .select({
            id: trustedDeviceAuditLog.id,
            userId: trustedDeviceAuditLog.userId,
            deviceId: trustedDeviceAuditLog.deviceId,
            action: trustedDeviceAuditLog.action,
            performedById: trustedDeviceAuditLog.performedBy,
            ipAddress: trustedDeviceAuditLog.ipAddress,
            severity: trustedDeviceAuditLog.severity,
            notes: trustedDeviceAuditLog.notes,
            createdAt: trustedDeviceAuditLog.createdAt,
            username: users.username,
          })
          .from(trustedDeviceAuditLog)
          .leftJoin(users, eq(trustedDeviceAuditLog.userId, users.id))
          .orderBy(desc(trustedDeviceAuditLog.createdAt))
          .limit(limit)
          .offset(offset);

        return res.json(rows);
      } catch (err) {
        console.error('GET /api/admin/device-audit-log error:', err);
        return res.status(500).json({ message: 'Failed to load device audit log' });
      }
    },
  );
}
