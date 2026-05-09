/**
 * admin-security-enforcement-routes.ts
 * Unified Security Enforcement Scope — 7-layer policy control
 *
 * GET  /api/admin/security-enforcement-scope   Superuser only
 * PUT  /api/admin/security-enforcement-scope   Superuser + TOTP (always)
 *
 * Architecture separation (non-negotiable):
 *   Plane A — Application Access (Layers 1-3)
 *   Plane B — Attendance Enforcement (Layers 4-5)
 *   Plane C — Payroll Logic: payroll-salary-core.ts — ZERO changes
 *
 * Layers 6-7 are cross-plane governance controls.
 */

import { Express, Request, Response } from 'express';
import { db } from './db';
import {
  twoFaGlobalPolicy,
  twoFaPolicyAuditLog,
  epcMigrationFeatureFlags,
  workLocations,
  trustedDevices,
  attendanceSecurityPolicies,
} from '@shared/schema';
import { eq, sql, count, inArray } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { requireReauth } from './middleware/require-reauth';
import { sendError, sendPermissionError } from './utils/error-response';

// ---------------------------------------------------------------------------
// Flag name constants
// ---------------------------------------------------------------------------

const FLAGS = {
  LAYER_1_2FA:                    'SECURITY_2FA_POLICY_ENABLED',
  LAYER_2_TRUSTED_DEVICE:         'SECURITY_DEVICE_TRUST_ENABLED',
  LAYER_3_APP_ACCESS:             'SECURITY_APP_ACCESS_ENFORCEMENT_ENABLED',
  LAYER_4_ATTENDANCE_GPS:         'SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED',
  LAYER_5_REAUTH:                 'SECURITY_ATTENDANCE_PAYROLL_REAUTH_ENABLED',
  LAYER_6_LOGIN_AUDIT:            'SECURITY_LOGIN_AUDIT_ENABLED',
  LAYER_6_ATTENDANCE_AUDIT:       'SECURITY_ATTENDANCE_AUDIT_ENABLED',
  LAYER_6_ARCHIVAL:               'SECURITY_ARCHIVAL_ENABLED',
  LAYER_6_MONITORING:             'SECURITY_MONITORING_ENABLED',
  LAYER_7_PAYROLL_REVIEW:         'SECURITY_PAYROLL_IMPACT_REVIEW_ENABLED',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getFlags(names: string[]): Promise<Record<string, boolean>> {
  const rows = await db
    .select({ flagName: epcMigrationFeatureFlags.flagName, enabled: epcMigrationFeatureFlags.enabled })
    .from(epcMigrationFeatureFlags)
    .where(inArray(epcMigrationFeatureFlags.flagName, names));
  const map: Record<string, boolean> = {};
  for (const row of rows) {
    map[row.flagName] = row.enabled === true;
  }
  return map;
}

async function setFlag(name: string, value: boolean, userId: number): Promise<void> {
  await db.execute(
    sql`UPDATE epc_migration_feature_flags
        SET enabled = ${value}, updated_by = ${userId}, updated_at = NOW()
        WHERE flag_name = ${name}`
  );
}

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerSecurityEnforcementRoutes(app: Express): void {

  // ── GET /api/admin/security-enforcement-scope ─────────────────────────────

  app.get(
    '/api/admin/security-enforcement-scope',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const user = (req as any).user;
      if (user?.role !== 'Superuser') return sendPermissionError(res);

      try {
        const flagNames = Object.values(FLAGS);
        const [flags, twoFaRows, wlRows, deviceRows, attendancePolicies] = await Promise.all([
          getFlags(flagNames),
          db.select().from(twoFaGlobalPolicy).limit(1),
          db.execute(
            sql`SELECT COUNT(*) AS total,
                       COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) AS with_coords
                FROM work_locations WHERE is_active = true`
          ),
          db.execute(
            sql`SELECT COUNT(*) AS total,
                       COUNT(CASE WHEN is_active = true THEN 1 END) AS active_count
                FROM trusted_devices`
          ),
          db.select({
            policyName: attendanceSecurityPolicies.policyName,
            policyMode: attendanceSecurityPolicies.policyMode,
            applyToRoles: attendanceSecurityPolicies.applyToRoles,
            requireGps: attendanceSecurityPolicies.requireGps,
            requireIpVerification: attendanceSecurityPolicies.requireIpVerification,
          }).from(attendanceSecurityPolicies).orderBy(attendanceSecurityPolicies.id),
        ]);

        const twofaPolicy = twoFaRows[0] ?? null;
        const wlMeta = (wlRows.rows[0] as any) ?? {};
        const deviceMeta = (deviceRows.rows[0] as any) ?? {};
        const wlTotal = Number(wlMeta.total ?? 0);
        const wlWithCoords = Number(wlMeta.with_coords ?? 0);
        const gpsWarning = wlTotal > 0 && wlWithCoords === 0;

        return res.json({
          twoFa: {
            enabled:            flags[FLAGS.LAYER_1_2FA] ?? false,
            enforcementMode:    twofaPolicy?.enforcementMode ?? 'optional',
            applyToRoles:       twofaPolicy?.applyToRoles ?? [],
            enforcementFromDate: twofaPolicy?.enforcementFromDate ?? null,
            gracePeriodEnabled: twofaPolicy?.gracePeriodEnabled ?? true,
            gracePeriodDays:    twofaPolicy?.gracePeriodDays ?? 14,
            updatedAt:          twofaPolicy?.updatedAt?.toISOString() ?? null,
          },
          trustedDevice: {
            enabled:       flags[FLAGS.LAYER_2_TRUSTED_DEVICE] ?? false,
            totalDevices:  Number(deviceMeta.total ?? 0),
            activeDevices: Number(deviceMeta.active_count ?? 0),
          },
          appAccessGpsIp: {
            enabled:              flags[FLAGS.LAYER_3_APP_ACCESS] ?? false,
            workLocationsTotal:   wlTotal,
            workLocationsWithCoords: wlWithCoords,
            gpsWarning,
          },
          attendanceGpsIp: {
            enabled:              flags[FLAGS.LAYER_4_ATTENDANCE_GPS] ?? false,
            workLocationsTotal:   wlTotal,
            workLocationsWithCoords: wlWithCoords,
            gpsWarning,
            policies:             attendancePolicies,
          },
          attendancePayrollReauth: {
            enabled: flags[FLAGS.LAYER_5_REAUTH] ?? false,
          },
          auditLogging: {
            loginAuditEnabled:      flags[FLAGS.LAYER_6_LOGIN_AUDIT] ?? false,
            attendanceAuditEnabled: flags[FLAGS.LAYER_6_ATTENDANCE_AUDIT] ?? false,
            archivalEnabled:        flags[FLAGS.LAYER_6_ARCHIVAL] ?? false,
            monitoringEnabled:      flags[FLAGS.LAYER_6_MONITORING] ?? false,
          },
          payrollImpactReview: {
            enabled: flags[FLAGS.LAYER_7_PAYROLL_REVIEW] ?? false,
          },
        });
      } catch (err) {
        console.error('GET security-enforcement-scope error:', err);
        return sendError(res, 'Failed to load security enforcement scope', 500);
      }
    }
  );

  // ── PUT /api/admin/security-enforcement-scope ─────────────────────────────

  app.put(
    '/api/admin/security-enforcement-scope',
    ensureAuthenticated,
    requireReauth('security.update_2fa_policy'),
    async (req: Request, res: Response) => {
      const user = (req as any).user;
      if (user?.role !== 'Superuser') return sendPermissionError(res);

      try {
        const {
          twoFa,
          trustedDevice,
          appAccessGpsIp,
          attendanceGpsIp,
          attendancePayrollReauth,
          auditLogging,
          payrollImpactReview,
        } = req.body;

        // ── Layer 1: 2FA ───────────────────────────────────────────────────
        if (twoFa !== undefined) {
          const effectiveMode  = twoFa.enabled ? (twoFa.enforcementMode ?? 'enforced') : 'optional';
          const effectiveRoles = twoFa.enabled ? (twoFa.applyToRoles ?? []) : [];
          const effectiveDate  =
            twoFa.enabled && twoFa.enforcementMode === 'required_from_date'
              ? (twoFa.enforcementFromDate || null) : null;
          const graceEnabled   = twoFa.enabled && twoFa.enforcementMode === 'enforced'
              ? (twoFa.gracePeriodEnabled ?? true) : false;

          // Read previous for audit
          const [prev] = await db.select().from(twoFaGlobalPolicy).limit(1);

          await db.update(twoFaGlobalPolicy).set({
            enforcementMode:    effectiveMode,
            applyToRoles:       effectiveRoles,
            enforcementFromDate: effectiveDate,
            gracePeriodEnabled: graceEnabled,
            gracePeriodDays:    twoFa.gracePeriodDays ?? 14,
            updatedBy: user.id,
            updatedAt: new Date(),
          }).where(eq(twoFaGlobalPolicy.id, 1));

          await db.insert(twoFaPolicyAuditLog).values({
            changedBy:      user.id,
            previousMode:   prev?.enforcementMode ?? null,
            newMode:        effectiveMode,
            previousRoles:  prev?.applyToRoles ?? [],
            newRoles:       effectiveRoles,
            notes:          JSON.stringify({ severity: 'info', source: 'security_enforcement_scope' }),
          });

          await setFlag(FLAGS.LAYER_1_2FA, twoFa.enabled === true, user.id);
        }

        // ── Layers 2–7: flag flips ─────────────────────────────────────────
        const flagUpdates: Array<{ name: string; value: boolean }> = [];

        if (trustedDevice !== undefined)
          flagUpdates.push({ name: FLAGS.LAYER_2_TRUSTED_DEVICE, value: trustedDevice.enabled === true });

        if (appAccessGpsIp !== undefined)
          flagUpdates.push({ name: FLAGS.LAYER_3_APP_ACCESS, value: appAccessGpsIp.enabled === true });

        if (attendanceGpsIp !== undefined)
          flagUpdates.push({ name: FLAGS.LAYER_4_ATTENDANCE_GPS, value: attendanceGpsIp.enabled === true });

        if (attendancePayrollReauth !== undefined)
          flagUpdates.push({ name: FLAGS.LAYER_5_REAUTH, value: attendancePayrollReauth.enabled === true });

        if (auditLogging !== undefined) {
          if (auditLogging.loginAuditEnabled      !== undefined)
            flagUpdates.push({ name: FLAGS.LAYER_6_LOGIN_AUDIT,       value: auditLogging.loginAuditEnabled });
          if (auditLogging.attendanceAuditEnabled !== undefined)
            flagUpdates.push({ name: FLAGS.LAYER_6_ATTENDANCE_AUDIT,  value: auditLogging.attendanceAuditEnabled });
          if (auditLogging.archivalEnabled        !== undefined)
            flagUpdates.push({ name: FLAGS.LAYER_6_ARCHIVAL,          value: auditLogging.archivalEnabled });
          if (auditLogging.monitoringEnabled      !== undefined)
            flagUpdates.push({ name: FLAGS.LAYER_6_MONITORING,        value: auditLogging.monitoringEnabled });
        }

        if (payrollImpactReview !== undefined)
          flagUpdates.push({ name: FLAGS.LAYER_7_PAYROLL_REVIEW, value: payrollImpactReview.enabled === true });

        await Promise.all(flagUpdates.map(({ name, value }) => setFlag(name, value, user.id)));

        return res.json({ success: true, updatedAt: new Date().toISOString() });
      } catch (err) {
        console.error('PUT security-enforcement-scope error:', err);
        return sendError(res, 'Failed to save security enforcement scope', 500);
      }
    }
  );
}
