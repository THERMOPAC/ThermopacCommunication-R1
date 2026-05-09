# Phase 5 — Attendance GPS Audit (Advisory): Pre-Approval Document
## Baseline: `docs/security-baseline-v1.0.md`
## Date Submitted: 09 May 2026
## Revision: Rev 2 — GPS degraded state handling added
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
  gpsStatus: GpsStatus | null;   // 'granted' | 'denied' | 'unavailable' | 'timeout' | 'not_supported' | null
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
type GpsStatus = 'granted' | 'denied' | 'unavailable' | 'timeout' | 'not_supported';

interface AttendanceAuditResult {
  auditId: number | null;      // null if audit write failed (non-fatal)
  policyMode: string;          // 'exempt' | 'advisory' | 'enforced'
  outcome: string;             // see Outcome Vocabulary below
  distanceToOfficeMeters: number | null;
  spoofingFlags: string[];
  gpsStatus: GpsStatus | null; // as reported by client
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
     → write minimal audit row (lat/lon/flags all null); return

2. if policy.policy_mode === 'exempt':
   → outcome = 'exempt'; severity = 'info'
   → spoofingFlags = []; distanceToOfficeMeters = null
   → write audit row; return

3. [GPS degraded state pre-check — runs BEFORE distance/spoofing logic]
   if gpsStatus is one of 'denied' | 'unavailable' | 'timeout' | 'not_supported':
     → See "GPS Degraded State Handling" section for outcome/severity/flag assignment
     → Write audit row with lat=null, lon=null, accuracy=null, appropriate flag+outcome
     → RETURN immediately — skip steps 4–8
     → Check-in still proceeds (no blocking in Phase 5)

4. [Normal advisory pipeline — only reached when gpsStatus === 'granted' or null]

   distanceToOfficeMeters = null
   if workLocationId AND latitude AND longitude AND workLocation.latitude AND workLocation.longitude:
     distanceToOfficeMeters = haversineDistanceMeters(
       latitude, longitude, workLocation.latitude, workLocation.longitude
     )

5. spoofingFlags = detectSpoofingFlags({ latitude, longitude, gpsAccuracyMeters, gpsStatus, ipAddress, policy })

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

Only called from pipeline step 5 — i.e., only when `gpsStatus === 'granted'` or null (GPS data present). Degraded-state flags (`gps_denied`, `gps_unavailable`, `gps_timeout`, `gps_not_supported`) are set in the degraded-state pre-check (step 3), not here.

```typescript
flags: string[] = []

// Flag 1: mock_location — suspiciously perfect GPS accuracy (emulator/mock GPS app pattern)
if gpsAccuracyMeters !== null AND gpsAccuracyMeters < 5:
  flags.push('mock_location')

// Flag 2: gps_accuracy_low — exceeds policy accuracy threshold
if gpsAccuracyMeters !== null
   AND policy.max_gps_accuracy_meters !== null
   AND gpsAccuracyMeters > policy.max_gps_accuracy_meters:
  flags.push('gps_accuracy_low')

// Flag 3: no_gps — coordinates absent with no status reason given (policy requires GPS)
// Note: if gpsStatus is 'denied'/'unavailable'/etc., that flag is set in step 3 instead
if policy.require_gps AND (latitude === null OR longitude === null) AND gpsStatus === null:
  flags.push('no_gps')

// Flag 4: ip_mismatch — IP check failed when policy requires it
if policy.require_ip_verification AND !isIpVerified:
  flags.push('ip_mismatch')

return flags
```

**All flags are purely informational in Phase 5.** No flag causes a 4xx response.

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
| `advisory_gps_denied` | warning | 5 | User denied GPS permission in browser |
| `advisory_gps_unavailable` | warning | 5 | GPS hardware/signal unavailable |
| `advisory_gps_timeout` | warning | 5 | GPS fix timed out before check-in |
| `advisory_gps_not_supported` | info | 5 | Device has no GPS (desktop/kiosk) |
| `enforced_ok` | info | 7 | All checks passed (enforcement) |
| `enforced_blocked` | critical | 7 | Geofence/IP failed — check-in BLOCKED |

Phase 5 only produces `exempt`, `policy_not_found`, `advisory_*` outcomes. `enforced_*` are Phase 7.

**Degraded-state outcomes are always advisory in Phase 5.** In Phase 7, `advisory_gps_denied`, `advisory_gps_unavailable`, and `advisory_gps_timeout` may become blocking under enforced policy if `require_gps = true`. `advisory_gps_not_supported` (desktop) will never block if `allow_remote_work = true`. This Phase 7 behaviour is noted here for governance completeness — not implemented in Phase 5.

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
      gpsAccuracyMeters: gpsAccuracy ?? null,   // new optional field
      gpsStatus: gpsStatus ?? null,            // new optional field: 'granted'|'denied'|'unavailable'|'timeout'|'not_supported'
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

### New optional request body fields

Two new optional fields are added to `POST /api/attendance/check-in` body:

| Field | Type | Description |
|---|---|---|
| `gpsAccuracy` | `number \| null` | GPS accuracy in metres as reported by `navigator.geolocation`. Stored in `gps_accuracy_meters`. Not used to block check-in. |
| `gpsStatus` | `string \| null` | Client-reported GPS status. Accepted values: `'granted'`, `'denied'`, `'unavailable'`, `'timeout'`, `'not_supported'`. Null/absent treated as unknown. |

The existing `latitude`, `longitude`, `address`, `deviceInfo`, `workLocationId` body fields are unchanged.

Both new fields are strictly optional. If absent, the pipeline treats them as null — the audit row is still written with whatever data is available. Check-in is never blocked due to missing GPS fields.

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

## GPS Degraded State Handling

This section is the required explicit specification for all GPS failure modes. All cases are **advisory only in Phase 5** — no check-in is blocked, and an audit row is always written.

### Signal sources

The `gpsStatus` field is set by the client-side frontend using the browser's [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API):

```typescript
// Frontend (client) — how gpsStatus is determined before calling POST /check-in
navigator.geolocation.getCurrentPosition(
  (pos) => { gpsStatus = 'granted'; latitude = pos.coords.latitude; ... },
  (err) => {
    if (err.code === GeolocationPositionError.PERMISSION_DENIED)   gpsStatus = 'denied';
    if (err.code === GeolocationPositionError.POSITION_UNAVAILABLE) gpsStatus = 'unavailable';
    if (err.code === GeolocationPositionError.TIMEOUT)              gpsStatus = 'timeout';
  },
  { timeout: 10000, enableHighAccuracy: true }
);
// Desktop / device with no GPS hardware: navigator.geolocation is undefined
if (typeof navigator.geolocation === 'undefined') gpsStatus = 'not_supported';
```

### Per-case server-side handling

All cases write an audit row. No case blocks check-in in Phase 5.

---

#### Case 1 — GPS Permission Denied (`gpsStatus = 'denied'`)

**What it means:** The user explicitly denied the browser GPS permission prompt, or the site has no permission. Latitude, longitude, and accuracy are null.

**Severity:** `warning` — deliberate denial by an advisory-policy user is notable. Could indicate evasion intent, though may also be a privacy choice.

**Server pipeline action:**
```
spoofingFlags = ['gps_denied']
outcome       = 'advisory_gps_denied'
severity      = 'warning'
lat/lon/accuracy = null   (not available)
distanceToOfficeMeters = null
→ Write audit row; check-in proceeds
```

**Phase 7 note:** Under enforced policy with `require_gps = true`, `gps_denied` would produce `enforced_blocked`. Not in Phase 5.

---

#### Case 2 — GPS Unavailable (`gpsStatus = 'unavailable'`)

**What it means:** GPS hardware is present but the fix could not be obtained — device is indoors, airplane mode is on, satellite signal is blocked, or the OS GPS service is disabled. Latitude, longitude, and accuracy are null.

**Severity:** `warning` — common indoors but noteworthy; repeated occurrences from the same user warrant supervisor review.

**Server pipeline action:**
```
spoofingFlags = ['gps_unavailable']
outcome       = 'advisory_gps_unavailable'
severity      = 'warning'
lat/lon/accuracy = null
distanceToOfficeMeters = null
→ Write audit row; check-in proceeds
```

**Phase 7 note:** Treated same as `gps_denied` under enforcement.

---

#### Case 3 — GPS Timeout (`gpsStatus = 'timeout'`)

**What it means:** The GPS fix request timed out (client-side timeout = 10 seconds). Device has GPS hardware but could not get a fix in time. May indicate poor signal, indoor location, or a device under load. Latitude, longitude, and accuracy are null.

**Severity:** `warning` — intermittent occurrences are expected; a pattern of timeouts from the same user is a review trigger.

**Server pipeline action:**
```
spoofingFlags = ['gps_timeout']
outcome       = 'advisory_gps_timeout'
severity      = 'warning'
lat/lon/accuracy = null
distanceToOfficeMeters = null
→ Write audit row; check-in proceeds
```

**Phase 7 note:** Treated same as `gps_denied` under enforcement.

---

#### Case 4 — GPS Not Supported / Desktop (`gpsStatus = 'not_supported'`)

**What it means:** The device does not have GPS hardware — a desktop computer, office kiosk, or a browser environment where `navigator.geolocation` is undefined. This is a **known legitimate scenario** for office admin workers, HR staff, finance teams, and managers who work exclusively from their desks. Latitude, longitude, and accuracy are null.

**Severity:** `info` — desktop check-in is expected and legitimate. Not suspicious.

**Server pipeline action:**
```
spoofingFlags = ['gps_not_supported']
outcome       = 'advisory_gps_not_supported'
severity      = 'info'
lat/lon/accuracy = null
distanceToOfficeMeters = null
→ Write audit row; check-in proceeds
```

**Phase 7 note:** Under enforced policy, desktop check-in is allowed if `allow_remote_work = true` (policy default). If `allow_remote_work = false` and `require_gps = true`, enforcement would block. The `allow_remote_work` field on `attendance_security_policies` covers this case and defaults to `true` for all policies.

---

#### Case 5 — Low Accuracy GPS (`gpsStatus = 'granted'`, `gpsAccuracy > threshold`)

**What it means:** GPS permission was granted and a fix was obtained, but the reported accuracy is worse than the policy threshold (`max_gps_accuracy_meters`, default 100 m). Latitude and longitude are present but imprecise. Could indicate a device relying on cell tower / Wi-Fi positioning instead of satellite GPS.

**Severity:** `warning` — logged for review; geofence distance may be inaccurate.

**Server pipeline action:**
```
[Falls into normal advisory pipeline — step 3 does NOT intercept 'granted' status]
spoofingFlags includes 'gps_accuracy_low'
outcome       = 'advisory_spoofing_detected'  (if accuracy_low is the only flag)
             or 'advisory_low_accuracy'        (see outcome priority order in step 8)
severity      = 'warning'
lat/lon = present; accuracy = reported value
distanceToOfficeMeters = computed (from reported lat/lon)
→ Write audit row; check-in proceeds
```

**Note on outcome priority (step 8):** `advisory_spoofing_detected` fires first if any flag is set, which includes `gps_accuracy_low`. The raw flag is always stored in `spoofing_flags` regardless of outcome label.

---

#### Case 6 — No GPS data, no status (`gpsStatus = null`, `latitude = null`)

**What it means:** Client sent check-in without any GPS fields and without a `gpsStatus` reason. Could be an older version of the frontend, an API call from a non-browser client, or a bug. The server cannot distinguish between "user chose not to provide GPS" and "GPS failed silently".

**Severity:** `warning` — flagged as `no_gps` for policy-aware roles.

**Server pipeline action:**
```
[Falls into normal advisory pipeline — gpsStatus null, lat/lon null]
spoofingFlags includes 'no_gps' (if policy.require_gps = true)
outcome       = 'advisory_spoofing_detected'
severity      = 'warning'
lat/lon/accuracy = null; distanceToOfficeMeters = null
→ Write audit row; check-in proceeds
```

For exempt roles (Case 6 + exempt): spoofingFlags = [] regardless; outcome = 'exempt'.

---

### GPS Degraded State Summary Table

| gpsStatus | lat/lon | Spoofing flag | Outcome | Severity | Check-in blocked (Phase 5) |
|---|---|---|---|---|---|
| `denied` | null | `gps_denied` | `advisory_gps_denied` | warning | ❌ Never |
| `unavailable` | null | `gps_unavailable` | `advisory_gps_unavailable` | warning | ❌ Never |
| `timeout` | null | `gps_timeout` | `advisory_gps_timeout` | warning | ❌ Never |
| `not_supported` | null | `gps_not_supported` | `advisory_gps_not_supported` | info | ❌ Never |
| `granted`, accuracy > threshold | present | `gps_accuracy_low` | `advisory_spoofing_detected` | warning | ❌ Never |
| `null`, lat/lon null | null | `no_gps` (if required) | `advisory_spoofing_detected` | warning | ❌ Never |
| `granted`, accuracy ok | present | none | `advisory_ok` | info | ❌ Never |

**Non-negotiable for Phase 5:** Every row in this table results in HTTP 200 and a successful check-in record. The audit row is always written. The only variation is the outcome label and severity in `attendance_location_audit_log`.

---

## Deviations from Baseline

**None.** All route names, table names, column names, and policy modes match `docs/security-baseline-v1.0.md` Section 2 and Section 3 exactly.

---

## Verification Tests — T-B01 through T-B18

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
| T-B14 | GPS denied: audit row written, check-in succeeds | Flag ON; Employee; `gpsStatus='denied'`, no lat/lon | `POST /check-in` | HTTP 200; row: `outcome='advisory_gps_denied'`, `spoofing_flags=['gps_denied']`, `severity='warning'`, `latitude=null`, `longitude=null` |
| T-B15 | GPS unavailable: audit row written, check-in succeeds | Flag ON; Employee; `gpsStatus='unavailable'` | `POST /check-in` | HTTP 200; row: `outcome='advisory_gps_unavailable'`, `spoofing_flags=['gps_unavailable']`, `severity='warning'`, `latitude=null` |
| T-B16 | GPS timeout: audit row written, check-in succeeds | Flag ON; Employee; `gpsStatus='timeout'` | `POST /check-in` | HTTP 200; row: `outcome='advisory_gps_timeout'`, `spoofing_flags=['gps_timeout']`, `severity='warning'`, `latitude=null` |
| T-B17 | Desktop / no GPS: audit row written, check-in succeeds, severity=info | Flag ON; Employee; `gpsStatus='not_supported'` | `POST /check-in` | HTTP 200; row: `outcome='advisory_gps_not_supported'`, `spoofing_flags=['gps_not_supported']`, `severity='info'`, `latitude=null` |
| T-B18 | Exempt role + GPS denied: audit row outcome=exempt, no spoofing flags | Flag ON; Superuser; `gpsStatus='denied'` | `POST /check-in` | HTTP 200; row: `outcome='exempt'`, `spoofing_flags={}` (exempt role bypasses all flag logic) |

---

## Zero-Trust Audit Plan — ZT-P5-01 through ZT-P5-15

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
| ZT-P5-14 | All GPS degraded states produce advisory outcomes, never blocks | Send T-B14 through T-B17 requests with flag ON | All return HTTP 200; `outcome` matches table in GPS Degraded State Summary; `spoofing_flags` populated; `latitude=null` |
| ZT-P5-15 | Exempt role: degraded GPS state never produces spoofing flags | Superuser sends `gpsStatus='denied'` | `spoofing_flags={}`, `outcome='exempt'` — degraded-state pre-check short-circuits after exempt check |

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

**Core pipeline:**
- [ ] Attendance audit pipeline (advisory only — no blocking) approved
- [ ] `gpsAccuracy` and `gpsStatus` as new optional check-in body fields approved
- [ ] Spoofing detection flags (`mock_location`, `gps_accuracy_low`, `no_gps`, `ip_mismatch`) approved
- [ ] Outcome vocabulary (12 outcomes; only advisory/exempt in Phase 5) approved
- [ ] `policy_mode=enforced` write blocked until Phase 7 approved
- [ ] 2 new files + 2 modified files scope approved
- [ ] Zero new npm packages approved

**GPS degraded state handling (Rev 2):**
- [ ] Case 1: GPS permission denied (`gps_denied` flag, `advisory_gps_denied`, severity=warning, check-in succeeds) approved
- [ ] Case 2: GPS unavailable (`gps_unavailable` flag, `advisory_gps_unavailable`, severity=warning, check-in succeeds) approved
- [ ] Case 3: GPS timeout (`gps_timeout` flag, `advisory_gps_timeout`, severity=warning, check-in succeeds) approved
- [ ] Case 4: Desktop/no GPS (`gps_not_supported` flag, `advisory_gps_not_supported`, severity=info, check-in succeeds) approved
- [ ] Case 5: Low accuracy GPS (falls into normal pipeline; `gps_accuracy_low` flag, severity=warning, check-in succeeds) approved
- [ ] Case 6: No GPS data, no status (`no_gps` flag for policy-requiring roles, check-in succeeds) approved
- [ ] Exempt roles bypass degraded-state flag logic entirely (outcome=exempt, no flags) approved
- [ ] Audit row always written regardless of GPS state approved

**Flags and feature flags:**
- [ ] `SECURITY_ATTENDANCE_AUDIT_ENABLED` only flag enabled in this phase approved
- [ ] `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` stays false (Phase 7) approved
- [ ] Rollback plan (SQL flag toggle) approved
- [ ] T-B01 through T-B18 verification tests approved (T-B14–T-B18 are GPS degraded state tests)
- [ ] ZT-P5-01 through ZT-P5-15 zero-trust audit plan approved (ZT-P5-14–ZT-P5-15 are GPS degraded state checks)
- [ ] Plane isolation maintained (GPS never in login flow; device trust never in check-in) approved

---

*No deviations from `docs/security-baseline-v1.0.md`. Submit for approval.*
