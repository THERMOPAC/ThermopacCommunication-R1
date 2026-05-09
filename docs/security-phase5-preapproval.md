# Phase 5 — Attendance GPS Audit (Advisory): Pre-Approval Document
## Baseline: `docs/security-baseline-v1.0.md`
## Date Submitted: 09 May 2026
## Status: AWAITING APPROVAL — DO NOT IMPLEMENT UNTIL APPROVED

---

## Approval Gate

| Field | Value |
|---|---|
| Phase | 5 — Attendance GPS Audit (Advisory) |
| Blocked by | Phase 4 COMPLETE ✅ (09 May 2026) |
| Prepared by | THERMOPAC ERP Architect |
| Approved by | — |
| Approval date | — |
| Implementation start | Pending approval |

---

## Objective

Instrument the `POST /api/attendance/check-in` route with a full policy-driven GPS audit pipeline. Every check-in attempt is evaluated against the user's role-based attendance security policy, a structured audit row is written to `attendance_location_audit_log`, and spoofing indicators are detected and flagged.

**Phase 5 is purely advisory — no check-in is blocked.** The `policy_mode` for all non-exempt roles is `advisory` (seeded in Phase 1). The `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` flag is NOT enabled in this phase — that is Phase 7.

The audit log produced in Phase 5 is the forensic and compliance foundation for Phase 7 enforcement and Phase 8 monitoring.

**Plane isolation is strictly maintained**: This is Plane B (Attendance). Plane A controls (device trust, lockout, 2FA, re-auth) are not referenced here. GPS data is never used in the login flow. No cross-plane logic.

**`server/payroll-salary-core.ts` — ZERO changes. Confirmed not in scope.**

**Zero new database tables.** All required tables were provisioned in Phase 1:
- `attendance_location_audit_log` — confirmed existing (17 columns)
- `attendance_security_policies` — confirmed existing (3 seeded rows)

**Zero new npm packages.** All distance calculation and GPS logic implemented in pure TypeScript.

---

## Current State

### attendance_security_policies (Phase 1 seeded)

| id | policy_name | apply_to_roles | policy_mode | require_gps | max_gps_accuracy_meters | allow_remote_work |
|---|---|---|---|---|---|---|
| 1 | exempt_policy | Superuser, General Manager, Senior Manager | `exempt` | false | 100 | true |
| 2 | advisory_manager | Manager | `advisory` | true | 100 | true |
| 3 | advisory_standard | Senior Executive, Employee | `advisory` | true | 100 | true |

### attendance_location_audit_log (Phase 1 provisioned)

Columns: `id`, `user_id`, `attendance_record_id`, `attempt_type`, `policy_mode`, `outcome`, `latitude`, `longitude`, `gps_accuracy_meters`, `distance_to_office_meters`, `work_location_id`, `ip_address`, `is_ip_verified`, `spoofing_flags` (text[]), `severity`, `archived_at`, `archive_path`, `created_at`

Immutability trigger: confirmed active (UPDATE/DELETE blocked).

### Feature Flags

| Flag | Current | Phase 5 Action |
|---|---|---|
| `SECURITY_ATTENDANCE_AUDIT_ENABLED` | `false` | Set `true` after verification |
| `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` | `false` | NOT touched — Phase 7 only |

### Current check-in route

`POST /api/attendance/check-in` in `server/attendance-routes.ts` already captures: `latitude`, `longitude`, `address`, `deviceInfo`, `workLocationId`, `ipAddress`, `isLocationVerified`, `isIpVerified`. Phase 5 wraps this with a policy-aware audit pipeline without removing any existing logic.

---

## Exact Files Changed

### New Files (2)

| File | Purpose |
|---|---|
| `server/attendance-security-service.ts` | Policy lookup, spoofing detection, audit write, distance calculation |
| `server/attendance-security-routes.ts` | Admin read routes + policy update endpoint |

### Modified Files (2)

| File | Change |
|---|---|
| `server/attendance-routes.ts` | Insert audit pipeline call in `POST /check-in` handler (flag-gated) |
| `server/routes.ts` | Register `attendanceSecurityRoutes` |

**Total: 2 new files, 2 modified files.**  
**`server/payroll-salary-core.ts` — ZERO changes. Confirmed not in scope.**

---

## File 1 — `server/attendance-security-service.ts` (NEW)

### Exports

```typescript
// Look up the attendance security policy for a given role.
// Returns the matching row from attendance_security_policies or null if not found.
getAttendancePolicy(role: string): Promise<AttendanceSecurityPolicy | null>

// Core pipeline: evaluate a check-in attempt against policy.
// Writes an audit row to attendance_location_audit_log.
// Returns the audit result for the route handler to include in its response.
// NEVER throws on audit failure — errors are caught and logged; check-in always proceeds.
runAttendanceAuditPipeline(params: {
  userId: number;
  attendanceRecordId: number | null;
  role: string;
  workLocationId: number | null;
  latitude: number | null;
  longitude: number | null;
  gpsAccuracyMeters: number | null;
  ipAddress: string;
  isIpVerified: boolean;
  req: Request;
}): Promise<AttendanceAuditResult>

// Write a single audit row directly (used internally and for test/recovery flows).
writeAttendanceAudit(row: AttendanceAuditRow): Promise<void>

// Compute straight-line distance in metres between two GPS coordinates.
// Haversine formula — pure TypeScript, no external library.
haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number

// Detect spoofing indicators from request context and GPS data.
// Returns an array of flag strings (may be empty).
detectSpoofingFlags(params: {
  latitude: number | null;
  longitude: number | null;
  gpsAccuracyMeters: number | null;
  ipAddress: string;
  policy: AttendanceSecurityPolicy;
}): string[]
```

### Types

```typescript
interface AttendanceAuditResult {
  auditId: number | null;      // null if audit write failed (non-fatal)
  policyMode: string;          // 'exempt' | 'advisory' | 'enforced'
  outcome: string;             // see Outcome Vocabulary below
  distanceToOfficeMeters: number | null;
  spoofingFlags: string[];
  severity: string;            // 'info' | 'warning' | 'critical'
  blocked: false;              // always false in Phase 5
}
```

---

## Check-in Audit Pipeline (Full Specification)

### Step-by-step

```
POST /api/attendance/check-in
  [existing logic: lockout check, duplicate check, workLocation fetch, distance calc, IP check]

  if SECURITY_ATTENDANCE_AUDIT_ENABLED === false:
    → skip pipeline entirely; existing behaviour unchanged

  if SECURITY_ATTENDANCE_AUDIT_ENABLED === true:
    → runAttendanceAuditPipeline(params) [non-blocking — errors caught internally]
    → check-in proceeds regardless of audit result
    → audit result included in response JSON as { auditResult } (advisory info only)

  [existing logic: INSERT/UPDATE attendance_records, return 200]
```

### Pipeline internals (runAttendanceAuditPipeline)

```
1. policy = getAttendancePolicy(user.role)
   if policy === null:
     → outcome = 'policy_not_found'; severity = 'warning'
     → write minimal audit row; return

2. if policy.policy_mode === 'exempt':
   → outcome = 'exempt'
   → severity = 'info'
   → spoofingFlags = []
   → distanceToOfficeMeters = null
   → write audit row; return

3. [advisory or enforced — Phase 5 only runs advisory]

4. distanceToOfficeMeters = null
   if workLocationId AND latitude AND longitude AND workLocation.latitude AND workLocation.longitude:
     distanceToOfficeMeters = haversineDistanceMeters(
       latitude, longitude,
       workLocation.latitude, workLocation.longitude
     )

5. spoofingFlags = detectSpoofingFlags({ latitude, longitude, gpsAccuracyMeters, ipAddress, policy })

6. inGeofence = true
   if latitude AND longitude AND workLocation.latitude AND workLocation.longitude:
     radius = policy.geofence_radius_override ?? workLocation.radiusMeters ?? 100
     inGeofence = distanceToOfficeMeters <= radius

7. gpsAccuracyOk = true
   if gpsAccuracyMeters !== null AND policy.max_gps_accuracy_meters !== null:
     gpsAccuracyOk = gpsAccuracyMeters <= policy.max_gps_accuracy_meters

8. outcome determination (advisory mode — informational only):
   if spoofingFlags.length > 0        → outcome = 'advisory_spoofing_detected'; severity = 'warning'
   else if !inGeofence                → outcome = 'advisory_outside_geofence'; severity = 'warning'
   else if !gpsAccuracyOk             → outcome = 'advisory_low_accuracy';      severity = 'warning'
   else if !isIpVerified AND policy.require_ip_verification
                                      → outcome = 'advisory_ip_unverified';     severity = 'warning'
   else                               → outcome = 'advisory_ok';                severity = 'info'

   NOTE: In Phase 5, advisory outcomes NEVER block check-in.
         'enforced_blocked' outcome is Phase 7 only.

9. Write audit row:
   INSERT INTO attendance_location_audit_log {
     user_id, attendance_record_id, attempt_type='check_in',
     policy_mode, outcome, latitude, longitude, gps_accuracy_meters,
     distance_to_office_meters, work_location_id, ip_address, is_ip_verified,
     spoofing_flags, severity
   }
```

### Spoofing Detection (detectSpoofingFlags)

```typescript
flags: string[] = []

// Flag 1: mock_location — emulator/mock GPS patterns
if gpsAccuracyMeters !== null AND gpsAccuracyMeters < 5:
  flags.push('mock_location')  // suspiciously perfect accuracy

// Flag 2: gps_accuracy_low — exceeds policy threshold
if gpsAccuracyMeters !== null
   AND policy.max_gps_accuracy_meters !== null
   AND gpsAccuracyMeters > policy.max_gps_accuracy_meters:
  flags.push('gps_accuracy_low')

// Flag 3: no_gps — GPS omitted but policy requires it
if policy.require_gps AND (latitude === null OR longitude === null):
  flags.push('no_gps')

// Flag 4: ip_mismatch — IP check failed when policy requires it
if policy.require_ip_verification AND !isIpVerified:
  flags.push('ip_mismatch')

return flags
```

**Flags are purely informational in Phase 5.** No flag causes a 4xx response.

---

## Outcome Vocabulary

All outcome strings written to `attendance_location_audit_log.outcome`:

| Outcome | Severity | Phase | Meaning |
|---|---|---|---|
| `exempt` | info | 5 | Role is exempt — no checks run |
| `policy_not_found` | warning | 5 | No policy row matched user's role |
| `advisory_ok` | info | 5 | All checks passed (advisory) |
| `advisory_outside_geofence` | warning | 5 | User outside radius (advisory — logged only) |
| `advisory_low_accuracy` | warning | 5 | GPS accuracy poor (advisory) |
| `advisory_spoofing_detected` | warning | 5 | Spoofing flag(s) set (advisory) |
| `advisory_ip_unverified` | warning | 5 | IP not in approved list (advisory) |
| `enforced_ok` | info | 7 | All checks passed (enforcement) |
| `enforced_blocked` | critical | 7 | Geofence/IP failed — check-in BLOCKED |

Phase 5 only produces `exempt`, `policy_not_found`, `advisory_*` outcomes. `enforced_*` are Phase 7.

---

## File 2 — `server/attendance-security-routes.ts` (NEW)

### Routes registered

| Method | Route | Auth | Re-Auth | Purpose |
|---|---|---|---|---|
| `GET` | `/api/attendance/location-audit` | Superuser / HR | — | Paginated audit log (all users) |
| `GET` | `/api/attendance/location-audit/:userId` | Superuser / HR / Manager (own reports) | — | Per-user audit log |
| `GET` | `/api/attendance/spoofing-flags` | Superuser / HR | — | Rows with non-empty spoofing_flags |
| `GET` | `/api/attendance/security-policies` | Superuser | — | List all 3 policy rows |
| `PUT` | `/api/attendance/security-policies/:id` | Superuser | `requireReauth('security.update_attendance_policy')` (TOTP, 0 min) | Update policy fields |
| `GET` | `/api/attendance/blocked-checkins` | Superuser / HR | — | Today's enforced-blocked rows (empty in Phase 5) |
| `GET` | `/api/attendance/security-policies/my` | Session | — | Policy for current user's role |

### Policy update constraint

`PUT /api/attendance/security-policies/:id` validates:
- `policy_mode` cannot be changed to `'enforced'` in Phase 5. If attempted: `400 Bad Request: { code: 'ENFORCEMENT_NOT_AVAILABLE', message: 'Enforcement mode requires Phase 7. Contact your Superuser.' }`.
- Only `require_gps`, `geofence_radius_override`, `max_gps_accuracy_meters`, `require_ip_verification`, `allow_remote_work` may be updated.

This constraint is enforced in code and is lifted in Phase 7 when `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` is enabled.

---

## Modified File — `server/attendance-routes.ts`

Single addition inside `router.post('/check-in', ...)` — after the existing location verification block and **before** the `INSERT`/`UPDATE` of `attendance_records`:

```typescript
// Phase 5 — Attendance GPS Audit Pipeline (advisory — non-blocking)
let auditResult: AttendanceAuditResult | null = null;
if (await isFeatureFlagEnabled('SECURITY_ATTENDANCE_AUDIT_ENABLED')) {
  try {
    auditResult = await runAttendanceAuditPipeline({
      userId,
      attendanceRecordId: existingRecord?.id ?? null,
      role: req.user!.role,
      workLocationId: workLocationId ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      gpsAccuracyMeters: gpsAccuracy ?? null,   // new optional field from request body
      ipAddress: ipAddress ?? '',
      isIpVerified,
      req,
    });
  } catch (auditErr) {
    console.error('Attendance audit pipeline error (non-fatal):', auditErr);
    // Never block check-in on audit failure — Phase 5 is advisory only
  }
}
```

The response JSON is extended with `auditResult` when non-null (advisory info for client):

```typescript
res.json({
  success: true,
  message: 'Checked in successfully',
  record: newRecord ?? updatedRecord,
  locationVerified: isLocationVerified,
  ipVerified: isIpVerified,
  ...(auditResult ? { attendanceAudit: auditResult } : {}),
});
```

### New optional request body field

`gpsAccuracy?: number` — GPS accuracy in metres as reported by the browser's Geolocation API. Optional; null if not provided. Stored in `attendance_location_audit_log.gps_accuracy_meters`. Not used to block check-in in Phase 5.

The existing `latitude`, `longitude`, `address`, `deviceInfo`, `workLocationId` body fields are unchanged.

---

## Audit Log Governance

`attendance_location_audit_log` is append-only (immutability trigger confirmed active). Phase 5 writes to it; it never reads from it in the check-in path (the pipeline reads only from `attendance_security_policies` and `work_locations`).

Access control for admin routes:

| Log | View | Export |
|---|---|---|
| `attendance_location_audit_log` | Superuser (all), HR (all), Manager (own reports only), self (own) | Superuser, HR |

---

## Feature Flag Behaviour

| State | Effect |
|---|---|
| `SECURITY_ATTENDANCE_AUDIT_ENABLED = false` | Pipeline entirely skipped; check-in unchanged; zero DB writes; zero performance impact |
| `SECURITY_ATTENDANCE_AUDIT_ENABLED = true` | Pipeline runs; audit row written for every check-in; spoofing flags computed; check-in never blocked |
| `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = false` (always in Phase 5) | `enforced_blocked` outcome never produced; `policy_mode = enforced` not writable via API |

---

## Rollback Plan

### Immediate (< 1 minute, zero code change)

```sql
UPDATE epc_migration_feature_flags
SET enabled = false, updated_at = NOW()
WHERE flag_name = 'SECURITY_ATTENDANCE_AUDIT_ENABLED';
```

Effect: pipeline completely bypassed; check-in reverts to existing behaviour. Existing audit rows are preserved (immutable).

### Rollback Decision Criteria

Rollback if within 48 hours of enabling:
- Any check-in request latency increase > 100 ms (audit pipeline is non-blocking but should be fast)
- Any `attendance_location_audit_log` write error causing check-in failure (should never happen — errors are caught)
- Any incorrect `auditResult` data reported by admin UI

### Code Rollback (if needed)

Git checkpoint: `32457ff7515d78acc1de39f38901cce2b9916584` (Phase 4 complete).

---

## Deviations from Baseline

**None.** All route names, table names, column names, and policy modes match `docs/security-baseline-v1.0.md` Section 2 and Section 3 exactly.

---

## Verification Tests — T-B01 through T-B13

| ID | Test | Setup | Action | Expected |
|---|---|---|---|---|
| T-B01 | Flag OFF bypass | `SECURITY_ATTENDANCE_AUDIT_ENABLED = false` | Any role checks in | Check-in succeeds; zero rows written to `attendance_location_audit_log` |
| T-B02 | Exempt role: audit row outcome=exempt | Flag ON; Superuser/GM/SM checks in | `POST /check-in` | Row written: `outcome='exempt'`, `severity='info'`, `spoofing_flags={}` |
| T-B03 | Advisory role inside geofence: outcome=advisory_ok | Flag ON; Employee at office GPS | `POST /check-in` with accurate GPS | Row: `outcome='advisory_ok'`, `severity='info'`; check-in succeeds |
| T-B04 | Advisory role outside geofence: outcome=advisory_outside_geofence | Flag ON; Employee at home GPS (>100m from office) | `POST /check-in` | Row: `outcome='advisory_outside_geofence'`, `severity='warning'`; check-in succeeds (not blocked) |
| T-B05 | Spoofing: mock_location flag | Flag ON; `gpsAccuracy=2` (< 5m) | `POST /check-in` | Row: `spoofing_flags=['mock_location']`, `severity='warning'`; check-in succeeds |
| T-B06 | Spoofing: gps_accuracy_low flag | Flag ON; `gpsAccuracy=150` (> 100m threshold) | `POST /check-in` | Row: `spoofing_flags=['gps_accuracy_low']`; check-in succeeds |
| T-B07 | Spoofing: no_gps flag | Flag ON; advisory role submits check-in with no GPS | `POST /check-in` without lat/lon | Row: `spoofing_flags=['no_gps']`; check-in succeeds |
| T-B08 | Audit write failure: non-fatal | Flag ON; simulate DB error in audit write | `POST /check-in` | Check-in succeeds; error logged to console; no 5xx to client |
| T-B09 | `GET /api/attendance/location-audit` — Superuser | Flag ON; 3 rows written | GET as Superuser | Paginated list of audit rows returned |
| T-B10 | `GET /api/attendance/location-audit/:userId` — Manager (own reports) | Flag ON | GET for own subordinate | Returns rows for that user |
| T-B11 | `GET /api/attendance/spoofing-flags` — returns only flagged rows | 2 plain rows + 1 flagged | GET | Only flagged row returned |
| T-B12 | `PUT /api/attendance/security-policies/:id` — mode=enforced rejected | TOTP passed | PUT `{ policy_mode: 'enforced' }` | `400 ENFORCEMENT_NOT_AVAILABLE` |
| T-B13 | `GET /api/attendance/security-policies/my` — returns correct policy | Flag ON; Employee | GET | Returns `advisory_standard` policy row |

---

## Zero-Trust Audit Plan — ZT-P5-01 through ZT-P5-13

Performed after enabling `SECURITY_ATTENDANCE_AUDIT_ENABLED = true` and all T-B tests pass:

| ID | Check | Method | Pass Condition |
|---|---|---|---|
| ZT-P5-01 | `attendance_location_audit_log` UPDATE blocked | `UPDATE attendance_location_audit_log SET outcome='x'` | SQL error (immutability trigger) |
| ZT-P5-02 | `attendance_location_audit_log` DELETE blocked | `DELETE FROM attendance_location_audit_log WHERE id=<any>` | SQL error (immutability trigger) |
| ZT-P5-03 | No server code UPDATE/DELETE on audit log | `grep -rn "UPDATE attendance_location_audit\|DELETE FROM attendance_location_audit" server/` | Zero results |
| ZT-P5-04 | Flag OFF = zero audit writes | Flag false; check in 3 times | `SELECT COUNT(*) FROM attendance_location_audit_log` = 0 |
| ZT-P5-05 | Exempt role: no spoofing flags ever set | Superuser checks in with `gpsAccuracy=2` | `spoofing_flags={}` in audit row |
| ZT-P5-06 | Advisory outcome never blocks check-in | Employee outside geofence | HTTP 200; `outcome='advisory_outside_geofence'` |
| ZT-P5-07 | `policy_mode=enforced` write rejected | PUT with enforced mode | `400 ENFORCEMENT_NOT_AVAILABLE` |
| ZT-P5-08 | Policy update requires TOTP re-auth | PUT without re-auth session token | `403 REAUTH_REQUIRED` |
| ZT-P5-09 | Manager cannot view audit for non-subordinate | Manager GETs audit for unrelated userId | `403 Forbidden` |
| ZT-P5-10 | `payroll-salary-core.ts` unchanged | `git diff HEAD server/payroll-salary-core.ts` | Empty diff |
| ZT-P5-11 | Audit write failure never breaks check-in | Simulate DB error in `writeAttendanceAudit` | HTTP 200; error in server console only |
| ZT-P5-12 | `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` stays false | Direct DB read | `enabled = false` |
| ZT-P5-13 | Spoofing flags stored as text array | `SELECT spoofing_flags FROM attendance_location_audit_log WHERE id=<flagged>` | Array type; e.g., `{mock_location}` |

---

## Routes Summary

| Method | Route | File | Auth | Re-Auth | New/Modified |
|---|---|---|---|---|---|
| `POST` | `/api/attendance/check-in` | `attendance-routes.ts` | Session | — | MODIFIED |
| `GET` | `/api/attendance/location-audit` | `attendance-security-routes.ts` | Superuser / HR | — | NEW |
| `GET` | `/api/attendance/location-audit/:userId` | `attendance-security-routes.ts` | Superuser / HR / Manager | — | NEW |
| `GET` | `/api/attendance/spoofing-flags` | `attendance-security-routes.ts` | Superuser / HR | — | NEW |
| `GET` | `/api/attendance/security-policies` | `attendance-security-routes.ts` | Superuser | — | NEW |
| `PUT` | `/api/attendance/security-policies/:id` | `attendance-security-routes.ts` | Superuser | TOTP / 0 min | NEW |
| `GET` | `/api/attendance/blocked-checkins` | `attendance-security-routes.ts` | Superuser / HR | — | NEW (stub — always empty in Phase 5) |
| `GET` | `/api/attendance/security-policies/my` | `attendance-security-routes.ts` | Session | — | NEW |

---

## Pre-Approval Checklist

- [ ] Attendance audit pipeline (advisory only — no blocking) approved
- [ ] `gpsAccuracy` as new optional check-in body field approved
- [ ] Spoofing detection flags (`mock_location`, `gps_accuracy_low`, `no_gps`, `ip_mismatch`) approved
- [ ] Outcome vocabulary (8 outcomes; only advisory/exempt in Phase 5) approved
- [ ] `policy_mode=enforced` write blocked until Phase 7 approved
- [ ] 2 new files + 2 modified files scope approved
- [ ] Zero new npm packages approved
- [ ] `SECURITY_ATTENDANCE_AUDIT_ENABLED` only flag enabled in this phase approved
- [ ] `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` stays false (Phase 7) approved
- [ ] Rollback plan (SQL flag toggle) approved
- [ ] T-B01 through T-B13 verification tests approved
- [ ] ZT-P5-01 through ZT-P5-13 zero-trust audit plan approved
- [ ] Plane isolation maintained (GPS never in login flow; device trust never in check-in) approved

---

*No deviations from `docs/security-baseline-v1.0.md`. Submit for approval.*
