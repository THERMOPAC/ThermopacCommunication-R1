/**
 * attendance-security-service.ts
 * Phase 5 — Attendance GPS Audit (Advisory)
 *
 * Core audit pipeline. ADVISORY ONLY — never blocks check-in.
 * All GPS failure modes write an audit row and return; the check-in
 * request continues to completion regardless of outcome.
 *
 * Feature flag: SECURITY_ATTENDANCE_AUDIT_ENABLED (must be true for any DB writes)
 * Enforcement flag: SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED (always false in Phase 5)
 */

import { db } from './db';
import { attendanceSecurityPolicies, attendanceLocationAuditLog, workLocations } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { isFeatureFlagEnabled } from './utils/epc-migration-helpers';
import { Request } from 'express';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GpsStatus = 'granted' | 'denied' | 'unavailable' | 'timeout' | 'not_supported';

export interface AttendanceAuditParams {
  userId: number;
  role: string;
  attendanceRecordId: number | null;
  workLocationId: number | null;
  latitude: number | null;
  longitude: number | null;
  gpsAccuracyMeters: number | null;
  gpsStatus: GpsStatus | null;
  ipAddress: string;
  isIpVerified: boolean;
  req: Request;
}

export interface AttendanceAuditResult {
  auditId: number | null;
  policyMode: string;
  outcome: string;
  distanceToOfficeMeters: number | null;
  spoofingFlags: string[];
  gpsStatus: GpsStatus | null;
  severity: string;
  blocked: boolean;
}

// ---------------------------------------------------------------------------
// Exempt roles — bypass ALL flag logic; outcome always 'exempt'
// ---------------------------------------------------------------------------

const EXEMPT_ROLES = ['Superuser', 'GM', 'SM'];

// ---------------------------------------------------------------------------
// Haversine distance (metres)
// ---------------------------------------------------------------------------

export function haversineDistanceMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Policy lookup
// ---------------------------------------------------------------------------

export async function getAttendancePolicy(role: string) {
  const policies = await db
    .select()
    .from(attendanceSecurityPolicies)
    .orderBy(attendanceSecurityPolicies.id);

  // Find most-specific match: exact role in apply_to_roles array
  for (const policy of policies) {
    if (policy.applyToRoles && policy.applyToRoles.includes(role)) {
      return policy;
    }
  }

  // Fallback: first policy that has an empty apply_to_roles (catch-all)
  const catchAll = policies.find(
    (p) => !p.applyToRoles || p.applyToRoles.length === 0
  );
  return catchAll ?? null;
}

// ---------------------------------------------------------------------------
// Spoofing flag detection (only called for granted/null GPS status)
// ---------------------------------------------------------------------------

export function detectSpoofingFlags(params: {
  latitude: number | null;
  longitude: number | null;
  gpsAccuracyMeters: number | null;
  gpsStatus: GpsStatus | null;
  isIpVerified: boolean;
  policy: { requireGps: boolean; maxGpsAccuracyMeters: number | null; requireIpVerification: boolean };
}): string[] {
  const { latitude, longitude, gpsAccuracyMeters, gpsStatus, isIpVerified, policy } = params;
  const flags: string[] = [];

  // Flag 1: mock_location — suspiciously perfect accuracy (< 5 m)
  if (gpsAccuracyMeters !== null && gpsAccuracyMeters < 5) {
    flags.push('mock_location');
  }

  // Flag 2: gps_accuracy_low — exceeds policy threshold
  if (
    gpsAccuracyMeters !== null &&
    policy.maxGpsAccuracyMeters !== null &&
    gpsAccuracyMeters > policy.maxGpsAccuracyMeters
  ) {
    flags.push('gps_accuracy_low');
  }

  // Flag 3: no_gps — coordinates absent, no status reason, policy requires GPS
  if (policy.requireGps && (latitude === null || longitude === null) && gpsStatus === null) {
    flags.push('no_gps');
  }

  // Flag 4: ip_mismatch — IP check failed when policy requires it
  if (policy.requireIpVerification && !isIpVerified) {
    flags.push('ip_mismatch');
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Write audit row to DB (non-fatal — errors are caught by caller)
// ---------------------------------------------------------------------------

async function writeAuditRow(params: {
  userId: number;
  attendanceRecordId: number | null;
  policyMode: string;
  outcome: string;
  latitude: number | null;
  longitude: number | null;
  gpsAccuracyMeters: number | null;
  distanceToOfficeMeters: number | null;
  workLocationId: number | null;
  ipAddress: string;
  isIpVerified: boolean;
  spoofingFlags: string[];
  severity: string;
}): Promise<number | null> {
  const [row] = await db
    .insert(attendanceLocationAuditLog)
    .values({
      userId: params.userId,
      attendanceRecordId: params.attendanceRecordId,
      attemptType: 'check_in',
      policyMode: params.policyMode,
      outcome: params.outcome,
      latitude: params.latitude,
      longitude: params.longitude,
      gpsAccuracyMeters: params.gpsAccuracyMeters,
      distanceToOfficeMeters: params.distanceToOfficeMeters,
      workLocationId: params.workLocationId,
      ipAddress: params.ipAddress,
      isIpVerified: params.isIpVerified,
      spoofingFlags: params.spoofingFlags,
      severity: params.severity,
    })
    .returning({ id: attendanceLocationAuditLog.id });
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function runAttendanceAuditPipeline(
  params: AttendanceAuditParams
): Promise<AttendanceAuditResult | null> {
  // Step 0: Feature flag guard
  const flagEnabled = await isFeatureFlagEnabled('SECURITY_ATTENDANCE_AUDIT_ENABLED');
  if (!flagEnabled) return null;
  const enforcing = await isFeatureFlagEnabled('SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED');

  const {
    userId, role, attendanceRecordId, workLocationId,
    latitude, longitude, gpsAccuracyMeters, gpsStatus,
    ipAddress, isIpVerified,
  } = params;

  // Step 1: Policy lookup
  const policy = await getAttendancePolicy(role);
  if (!policy) {
    const auditId = await writeAuditRow({
      userId, attendanceRecordId,
      policyMode: 'unknown', outcome: 'policy_not_found',
      latitude: null, longitude: null, gpsAccuracyMeters: null,
      distanceToOfficeMeters: null, workLocationId: null,
      ipAddress, isIpVerified, spoofingFlags: [], severity: 'warning',
    });
    return {
      auditId, policyMode: 'unknown', outcome: 'policy_not_found',
      distanceToOfficeMeters: null, spoofingFlags: [],
      gpsStatus, severity: 'warning', blocked: false,
    };
  }

  const policyMode = policy.policyMode;

  // Step 2: Exempt role — bypass ALL flag logic
  if (EXEMPT_ROLES.includes(role) || policyMode === 'exempt') {
    const auditId = await writeAuditRow({
      userId, attendanceRecordId,
      policyMode, outcome: 'exempt',
      latitude: null, longitude: null, gpsAccuracyMeters: null,
      distanceToOfficeMeters: null, workLocationId,
      ipAddress, isIpVerified, spoofingFlags: [], severity: 'info',
    });
    return {
      auditId, policyMode, outcome: 'exempt',
      distanceToOfficeMeters: null, spoofingFlags: [],
      gpsStatus, severity: 'info', blocked: false,
    };
  }

  // Step 3: GPS degraded state pre-check (intercepts before geofence/spoofing)
  if (gpsStatus === 'denied' || gpsStatus === 'unavailable' || gpsStatus === 'timeout' || gpsStatus === 'not_supported') {
    let outcome: string;
    let flag: string;
    let severity: string;

    switch (gpsStatus) {
      case 'denied':
        outcome = 'advisory_gps_denied';
        flag = 'gps_denied';
        severity = 'warning';
        break;
      case 'unavailable':
        outcome = 'advisory_gps_unavailable';
        flag = 'gps_unavailable';
        severity = 'warning';
        break;
      case 'timeout':
        outcome = 'advisory_gps_timeout';
        flag = 'gps_timeout';
        severity = 'warning';
        break;
      case 'not_supported':
        outcome = 'advisory_gps_not_supported';
        flag = 'gps_not_supported';
        severity = 'info';
        break;
      default:
        outcome = 'advisory_gps_unavailable';
        flag = 'gps_unavailable';
        severity = 'warning';
    }

    const auditId = await writeAuditRow({
      userId, attendanceRecordId,
      policyMode, outcome,
      latitude: null, longitude: null, gpsAccuracyMeters: null,
      distanceToOfficeMeters: null, workLocationId,
      ipAddress, isIpVerified, spoofingFlags: [flag], severity,
    });
    return {
      auditId, policyMode, outcome,
      distanceToOfficeMeters: null, spoofingFlags: [flag],
      gpsStatus, severity, blocked: false,
    };
  }

  // Step 4: Normal advisory pipeline (gpsStatus === 'granted' or null with data)

  // Fetch work location for geofence calculation
  let workLocation: { latitude: number | null; longitude: number | null; radiusMeters: number | null } | null = null;
  if (workLocationId) {
    const [wl] = await db
      .select({ latitude: workLocations.latitude, longitude: workLocations.longitude, radiusMeters: workLocations.radiusMeters })
      .from(workLocations)
      .where(eq(workLocations.id, workLocationId));
    workLocation = wl ?? null;
  }

  let distanceToOfficeMeters: number | null = null;
  if (latitude !== null && longitude !== null && workLocation?.latitude && workLocation?.longitude) {
    distanceToOfficeMeters = haversineDistanceMeters(
      latitude, longitude,
      workLocation.latitude, workLocation.longitude
    );
  }

  // Step 5: Spoofing flags
  const spoofingFlags = detectSpoofingFlags({
    latitude, longitude, gpsAccuracyMeters, gpsStatus,
    isIpVerified,
    policy: {
      requireGps: policy.requireGps,
      maxGpsAccuracyMeters: policy.maxGpsAccuracyMeters ?? null,
      requireIpVerification: policy.requireIpVerification,
    },
  });

  // Step 6: Geofence check
  let inGeofence = true;
  if (
    latitude !== null && longitude !== null &&
    workLocation?.latitude && workLocation?.longitude &&
    distanceToOfficeMeters !== null
  ) {
    const radius = policy.geofenceRadiusOverride ?? workLocation.radiusMeters ?? 100;
    inGeofence = distanceToOfficeMeters <= radius;
  }

  // Step 7: GPS accuracy check
  let gpsAccuracyOk = true;
  if (gpsAccuracyMeters !== null && policy.maxGpsAccuracyMeters !== null) {
    gpsAccuracyOk = gpsAccuracyMeters <= policy.maxGpsAccuracyMeters;
  }

  // Step 8: Outcome determination
  // Advisory mode (enforcing = false): all outcomes pass, blocked always false.
  // Enforced mode (enforcing = true): spoofing/geofence/IP violations set blocked = true.
  // Low accuracy is never a block condition — advisory only in both modes.
  let outcome: string;
  let severity: string;

  if (spoofingFlags.length > 0) {
    outcome = 'advisory_spoofing_detected';
    severity = 'warning';
  } else if (!inGeofence) {
    outcome = 'advisory_outside_geofence';
    severity = 'warning';
  } else if (!gpsAccuracyOk) {
    outcome = 'advisory_low_accuracy';
    severity = 'warning';
  } else if (policy.requireIpVerification && !isIpVerified) {
    outcome = 'advisory_ip_unverified';
    severity = 'warning';
  } else {
    outcome = 'advisory_ok';
    severity = 'info';
  }

  // Enforcement decision — low_accuracy and advisory_ok are never blocked
  const BLOCKING_OUTCOMES = new Set([
    'advisory_spoofing_detected',
    'advisory_outside_geofence',
    'advisory_ip_unverified',
  ]);
  const blocked = enforcing && BLOCKING_OUTCOMES.has(outcome);

  // Step 9: Write audit row
  const auditId = await writeAuditRow({
    userId, attendanceRecordId,
    policyMode, outcome,
    latitude, longitude, gpsAccuracyMeters,
    distanceToOfficeMeters, workLocationId,
    ipAddress, isIpVerified, spoofingFlags, severity,
  });

  return {
    auditId, policyMode, outcome,
    distanceToOfficeMeters, spoofingFlags,
    gpsStatus, severity, blocked,
  };
}
