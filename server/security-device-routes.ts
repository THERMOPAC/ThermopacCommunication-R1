import { Express, Request, Response } from 'express';
import { db } from './db';
import { trustedDevices, trustedDeviceAuditLog, users } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { requireReauth } from './middleware/require-reauth';
import {
  revokeDevice,
  activateDevice,
  getClientIp,
} from './trusted-device-service';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ message: 'Not authenticated' });
}

export function registerSecurityDeviceRoutes(app: Express) {

  // GET /api/security/my-devices — list own trusted devices
  app.get('/api/security/my-devices', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const devices = await db
        .select({
          id: trustedDevices.id,
          deviceName: trustedDevices.deviceName,
          isActive: trustedDevices.isActive,
          activationStatus: trustedDevices.deviceFingerprint,
          lastUsedAt: trustedDevices.lastUsedAt,
          revokedAt: trustedDevices.revokedAt,
          revokedReason: trustedDevices.revokedReason,
          registeredByAdmin: trustedDevices.registeredByAdmin,
          createdAt: trustedDevices.createdAt,
        })
        .from(trustedDevices)
        .where(eq(trustedDevices.userId, user.id))
        .orderBy(desc(trustedDevices.createdAt));

      const result = devices.map(d => ({
        ...d,
        activationStatus: d.activationStatus === '' ? 'pending' : 'activated',
      }));

      return res.json(result);
    } catch (err) {
      console.error('GET /api/security/my-devices error:', err);
      return res.status(500).json({ message: 'Failed to load devices' });
    }
  });

  // DELETE /api/security/my-devices/:id — self-revoke (any re-auth, 30 min)
  app.delete(
    '/api/security/my-devices/:id',
    ensureAuthenticated,
    requireReauth('security.revoke_session'),
    async (req: Request, res: Response) => {
      try {
        const user = req.user as any;
        const deviceId = parseInt(req.params.id, 10);
        if (isNaN(deviceId)) return res.status(400).json({ message: 'Invalid device ID' });

        const ip = getClientIp(req);
        const result = await revokeDevice(deviceId, user.id, user.id, 'self_revoked', ip);

        if ('error' in result) return res.status(result.error).json({ message: result.message });
        return res.json({ success: true });
      } catch (err) {
        console.error('DELETE /api/security/my-devices/:id error:', err);
        return res.status(500).json({ message: 'Failed to revoke device' });
      }
    },
  );

  // GET /api/security/activate-device — set thermopac.device cookie
  app.get('/api/security/activate-device', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const token = req.query.token as string;

      if (!token) return res.status(400).json({ message: 'token is required' });

      const result = await activateDevice(token, user.id, req, res);

      if ('error' in result) return res.status(result.error).json({ message: result.message });

      return res.json({
        success: true,
        message: 'Device activated. Your browser is now trusted on this machine.',
      });
    } catch (err) {
      console.error('GET /api/security/activate-device error:', err);
      return res.status(500).json({ message: 'Device activation failed' });
    }
  });
}
