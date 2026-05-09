/**
 * attendance-security-routes.ts
 * Phase 5 — Attendance GPS Audit (Advisory)
 *
 * Admin read routes + policy update endpoint.
 * All routes require session auth; elevated routes require Superuser or HR.
 * Policy update requires TOTP re-auth (security.update_attendance_policy).
 */

import { Express, Request, Response } from 'express';
import { db } from './db';
import {
  attendanceLocationAuditLog,
  attendanceSecurityPolicies,
  users,
} from '@shared/schema';
import { eq, desc, and, gt, sql, arrayLength } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { requireReauth } from './middleware/require-reauth';
import { sendError, sendPermissionError, sendNotFound, sendBusinessError } from './utils/error-response';

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

function isSuperuser(role: string) {
  return role === 'Superuser';
}

function isSuperuserOrHR(role: string) {
  return role === 'Superuser' || role === 'HR';
}

function isManager(role: string) {
  return role === 'Manager';
}

// Check if targetUserId reports to managerId
async function isSubordinate(managerId: number, targetUserId: number): Promise<boolean> {
  const [targetUser] = await db
    .select({ managerId: users.managerId })
    .from(users)
    .where(eq(users.id, targetUserId));
  return targetUser?.managerId === managerId;
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

function parsePagination(query: Record<string, any>): { limit: number; offset: number } {
  const limit = Math.min(parseInt(query.limit as string) || 50, 200);
  const offset = parseInt(query.offset as string) || 0;
  return { limit, offset };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerAttendanceSecurityRoutes(app: Express): void {

  // -------------------------------------------------------------------------
  // GET /api/attendance/location-audit
  // All audit rows (Superuser / HR only). Paginated.
  // -------------------------------------------------------------------------
  app.get('/api/attendance/location-audit', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const role = req.user!.role;
      if (!isSuperuserOrHR(role)) {
        return sendPermissionError(res, 'Superuser or HR role required');
      }

      const { limit, offset } = parsePagination(req.query);

      const rows = await db
        .select()
        .from(attendanceLocationAuditLog)
        .orderBy(desc(attendanceLocationAuditLog.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(attendanceLocationAuditLog);

      res.json({ rows, total, limit, offset });
    } catch (error) {
      sendError(res, error);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/attendance/location-audit/:userId
  // Audit rows for a specific user.
  // Superuser/HR: any user. Manager: own subordinates only. Self: own.
  // -------------------------------------------------------------------------
  app.get('/api/attendance/location-audit/:userId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const requesterId = req.user!.id;
      const role = req.user!.role;
      const targetUserId = parseInt(req.params.userId);

      if (isNaN(targetUserId)) {
        return res.status(400).json({ error: 'Invalid userId' });
      }

      // Access control
      if (!isSuperuserOrHR(role)) {
        if (isManager(role)) {
          const sub = await isSubordinate(requesterId, targetUserId);
          if (!sub) {
            return sendPermissionError(res, 'Managers may only view audit logs for their direct reports');
          }
        } else if (requesterId !== targetUserId) {
          return sendPermissionError(res, 'You may only view your own audit logs');
        }
      }

      const { limit, offset } = parsePagination(req.query);

      const rows = await db
        .select()
        .from(attendanceLocationAuditLog)
        .where(eq(attendanceLocationAuditLog.userId, targetUserId))
        .orderBy(desc(attendanceLocationAuditLog.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(attendanceLocationAuditLog)
        .where(eq(attendanceLocationAuditLog.userId, targetUserId));

      res.json({ rows, total, limit, offset });
    } catch (error) {
      sendError(res, error);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/attendance/spoofing-flags
  // Rows where spoofing_flags is non-empty. Superuser / HR only.
  // -------------------------------------------------------------------------
  app.get('/api/attendance/spoofing-flags', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const role = req.user!.role;
      if (!isSuperuserOrHR(role)) {
        return sendPermissionError(res, 'Superuser or HR role required');
      }

      const { limit, offset } = parsePagination(req.query);

      const rows = await db
        .select()
        .from(attendanceLocationAuditLog)
        .where(sql`array_length(${attendanceLocationAuditLog.spoofingFlags}, 1) > 0`)
        .orderBy(desc(attendanceLocationAuditLog.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(attendanceLocationAuditLog)
        .where(sql`array_length(${attendanceLocationAuditLog.spoofingFlags}, 1) > 0`);

      res.json({ rows, total, limit, offset });
    } catch (error) {
      sendError(res, error);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/attendance/security-policies
  // All policies. Superuser only.
  // -------------------------------------------------------------------------
  app.get('/api/attendance/security-policies', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!isSuperuser(req.user!.role)) {
        return sendPermissionError(res, 'Superuser role required');
      }

      const policies = await db
        .select()
        .from(attendanceSecurityPolicies)
        .orderBy(attendanceSecurityPolicies.id);

      res.json({ policies });
    } catch (error) {
      sendError(res, error);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/attendance/security-policies/my
  // Returns the policy that applies to the requesting user's role.
  // Session auth only (any authenticated user).
  // -------------------------------------------------------------------------
  app.get('/api/attendance/security-policies/my', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const role = req.user!.role;

      const policies = await db
        .select()
        .from(attendanceSecurityPolicies)
        .orderBy(attendanceSecurityPolicies.id);

      // Find exact role match first
      let matched = policies.find(
        (p) => p.applyToRoles && p.applyToRoles.includes(role)
      );

      // Fallback: catch-all (empty apply_to_roles)
      if (!matched) {
        matched = policies.find(
          (p) => !p.applyToRoles || p.applyToRoles.length === 0
        ) ?? undefined;
      }

      if (!matched) {
        return sendNotFound(res, 'No security policy found for your role');
      }

      res.json({ policy: matched });
    } catch (error) {
      sendError(res, error);
    }
  });

  // -------------------------------------------------------------------------
  // PUT /api/attendance/security-policies/:id
  // Update a policy. Superuser + TOTP re-auth.
  // policy_mode='enforced' is blocked until Phase 7.
  // -------------------------------------------------------------------------
  app.put(
    '/api/attendance/security-policies/:id',
    ensureAuthenticated,
    requireReauth('security.update_attendance_policy'),
    async (req: Request, res: Response) => {
      try {
        if (!isSuperuser(req.user!.role)) {
          return sendPermissionError(res, 'Superuser role required');
        }

        const policyId = parseInt(req.params.id);
        if (isNaN(policyId)) {
          return res.status(400).json({ error: 'Invalid policy id' });
        }

        const [existing] = await db
          .select()
          .from(attendanceSecurityPolicies)
          .where(eq(attendanceSecurityPolicies.id, policyId));

        if (!existing) {
          return sendNotFound(res, 'Policy not found');
        }

        const {
          policyMode,
          requireGps,
          geofenceRadiusOverride,
          maxGpsAccuracyMeters,
          requireIpVerification,
          allowRemoteWork,
          applyToRoles,
        } = req.body;

        // Block enforcement until Phase 7
        if (policyMode === 'enforced') {
          return sendBusinessError(res, 'ENFORCEMENT_NOT_AVAILABLE', 'Enforcement mode is not available until Phase 7. Only advisory and exempt modes are permitted in this phase.');
        }

        const allowedModes = ['advisory', 'exempt'];
        if (policyMode !== undefined && !allowedModes.includes(policyMode)) {
          return res.status(400).json({ error: `Invalid policy_mode. Allowed: ${allowedModes.join(', ')}` });
        }

        const updatePayload: Record<string, any> = {
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        };
        if (policyMode !== undefined) updatePayload.policyMode = policyMode;
        if (requireGps !== undefined) updatePayload.requireGps = requireGps;
        if (geofenceRadiusOverride !== undefined) updatePayload.geofenceRadiusOverride = geofenceRadiusOverride;
        if (maxGpsAccuracyMeters !== undefined) updatePayload.maxGpsAccuracyMeters = maxGpsAccuracyMeters;
        if (requireIpVerification !== undefined) updatePayload.requireIpVerification = requireIpVerification;
        if (allowRemoteWork !== undefined) updatePayload.allowRemoteWork = allowRemoteWork;
        if (applyToRoles !== undefined) updatePayload.applyToRoles = applyToRoles;

        const [updated] = await db
          .update(attendanceSecurityPolicies)
          .set(updatePayload)
          .where(eq(attendanceSecurityPolicies.id, policyId))
          .returning();

        res.json({ policy: updated, message: 'Policy updated successfully' });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/attendance/blocked-checkins
  // Stub — always empty in Phase 5 (enforcement is Phase 7).
  // Superuser / HR only.
  // -------------------------------------------------------------------------
  app.get('/api/attendance/blocked-checkins', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const role = req.user!.role;
      if (!isSuperuserOrHR(role)) {
        return sendPermissionError(res, 'Superuser or HR role required');
      }
      // Phase 5: enforcement not active — no check-ins are ever blocked
      res.json({
        rows: [],
        total: 0,
        message: 'Check-in blocking is not active. Enforcement is Phase 7 only.',
      });
    } catch (error) {
      sendError(res, error);
    }
  });
}
