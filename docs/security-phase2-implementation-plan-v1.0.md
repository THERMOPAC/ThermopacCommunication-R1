# Security Enforcement Phase 2 — Implementation Plan v1.0
**THERMOPAC QMS**
**Prepared:** 09 May 2026
**Revised:** 09 May 2026 — added race condition analysis + rollback integrity control
**Status:** AWAITING APPROVAL — no implementation until approved

---

## Scope

Phase 2 covers exactly two deliverables:

1. **Layer 4 route consumption gate** — add the enforcement gate in `attendance-routes.ts` that acts on `auditResult.blocked = true` by rejecting the check-in and rolling back the saved record.
2. **Controlled enforcement activation protocol** — the exact sequence to enable `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` only after the gate is verified.

**Explicitly out of scope for Phase 2:**
- Layer 1 (TOTP) end-to-end testing — separate enablement decision
- Layer 2 (device trust) end-to-end testing — separate enablement decision
- Layer 5 frontend re-auth UI walkthrough — separate verification activity
- Any changes to `payroll-salary-core.ts` — permanently zero-diff
- Any `shared/schema.ts` or `drizzle.config.ts` changes
- Any `client/` changes
- Any new feature flags

---

## Pre-Condition (Non-Negotiable)

**`SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` must remain `false` at all times during Phase 2 implementation and testing until P2-ACT is explicitly approved.**

The service-level `blocked` field is already correctly computed (`blocked = enforcing && BLOCKING_OUTCOMES.has(outcome)`). With the flag false, `blocked` is always false — the new route gate is a no-op until the flag is flipped. This means the route gate can be safely deployed before any enforcement decision is made.

---

## Architectural Analysis — Gate Placement

### Current check-in flow (post-Phase 1)

```
Step 1:  Validate request params
Step 2:  Upsert attendance record → savedRecord (DB write, checkInTime set)
Step 3:  Run audit pipeline with savedRecord.id → auditResult (DB write: audit row)
Step 4:  res.json({ success: true, record: savedRecord, attendanceAudit: auditResult })
         ^^ auditResult.blocked is IGNORED here — gap confirmed in Phase 1 closure
```

### Problem

The attendance record is written to the DB (Step 2) before the audit result is available (Step 3). If `blocked = true`, the record already exists with `checkInTime` populated. Two architectural options exist:

**Option A — Post-save gate with record rollback (APPROVED)**

```
Step 1:  Validate request params
Step 2:  Upsert attendance record → savedRecord
Step 3:  Run audit pipeline with savedRecord.id → auditResult
Step 4:  [NEW GATE] if auditResult?.blocked:
           → DELETE savedRecord from DB (rollback)
           → if DELETE fails → return 500 ATTENDANCE_ENFORCEMENT_ROLLBACK_FAILED
           → if DELETE succeeds → return 403 ATTENDANCE_BLOCKED
Step 5:  res.json({ success: true, ... })   ← only reached when not blocked
```

- Audit row is written inside the pipeline (Step 9 of the service) before the pipeline returns — audit evidence is committed to DB before any gate decision.
- If rollback DELETE succeeds: attendance record removed, 403 returned, audit trail preserved.
- If rollback DELETE fails: 500 returned (not 403 — see Rollback Integrity section below), audit trail preserved, orphaned record identifiable via `auditId`.
- Minimal diff — ~20 lines added after the existing `catch (auditErr)` block.

**Option B — Pre-save audit (Rejected for Phase 2)**

- Run a lightweight pre-check before saving, skip record creation if blocked.
- Requires `attendanceRecordId: null` in audit call — breaks FK reference in audit log.
- Requires restructuring the entire check-in flow and a second audit-update call to backfill the record ID.
- Higher risk, larger diff, more complex rollback. Rejected.

---

## Race Condition Analysis

### Transient window definition

The transient window is the interval between:
- **T0** — attendance record INSERT commits (end of Step 2)
- **T1** — attendance record DELETE commits (rollback in Step 4)

Estimated width: **50–200 ms** (bounded by audit pipeline: one SELECT on `attendance_security_policies` + in-memory geofence math + one INSERT to audit log).

### All downstream processors analysed

| Processor | Trigger | Date filter | Can reach today's record? | Risk |
|---|---|---|---|---|
| `AttendanceMidnightProcessor` | node-cron `0 0 * * *` IST midnight | `date = yesterdayStr` only | **No** — filters yesterday only | Zero |
| `payroll-run-engine.ts` | Manual admin HTTP request | `period.startDate ≤ date ≤ period.endDate` (closed months) | **No** — active period is a closed past month; today is never inside `period.endDate` | Effectively zero |
| `payroll-trial-routes.ts` | Manual admin HTTP request | `period.startDate ≤ date ≤ period.endDate` | **No** — same date-range constraint as above | Effectively zero |
| `leave-service.ts` | User-triggered leave approval (inside `tx`) | `userId + specific date` | Theoretically yes (same user, same date) | Negligible — 50-200ms concurrent overlap is astronomically unlikely; even if it occurred, the UPDATE targets a record that is about to be deleted — no persistent state corruption |
| AI agents (communications, production-management, administration-control) | node-cron 1–6 AM IST | Historical/monthly ranges | **No** — agents run pre-dawn, check-ins during business hours | Zero temporal overlap |
| `business-intelligence-routes.ts` | On-demand HTTP | Aggregate counts, no per-record mutations | Read-only | No enforcement consequence |
| `dwar-routes.ts` | On-demand HTTP | Date ranges for reports | Read-only | No enforcement consequence |
| `payroll-calculation-verifier.ts` | On-demand HTTP | Historical period | Read-only | No enforcement consequence |

**No PostgreSQL triggers exist.** Confirmed via full codebase search — zero `CREATE TRIGGER`, `NOTIFY`, or `pg_notify` declarations anywhere in the server directory.

**No event emitters on record creation.** Confirmed — `attendance-routes.ts` emits no events on INSERT.

### PostgreSQL isolation level

Neon Postgres default: **Read Committed**. Under this isolation level, a concurrent SELECT sees committed rows at the time of that specific statement. A transient record inserted but not yet deleted is visible to concurrent reads in the T0–T1 window.

This is acceptable because:
1. No background processor runs a SELECT on today's records during business hours (confirmed above).
2. On-demand analytics reads are stateless — they compute aggregates and return; no downstream mutation is triggered by the transient record.
3. The payroll engine and leave service only process closed/historical periods or leave dates — not today's open check-in date.

### Conclusion

**No automated background job can consume a transient record in the T0–T1 window. No downstream state mutation is triggered by today's date during the request cycle. The race condition risk is zero for all background processors and negligible (astronomically unlikely concurrent request + no downstream mutation) for on-demand endpoints.**

No advisory lock, transaction isolation upgrade, or additional serialisation is required for Phase 2.

---

## Rollback Integrity Control

### Problem with original proposal

```typescript
try {
  await db.delete(attendanceRecords).where(eq(attendanceRecords.id, savedRecord.id));
} catch (rollbackErr) {
  console.error('Attendance enforcement rollback error:', rollbackErr);
}
return res.status(403).json({ ... });  // ← 403 returned even if DELETE failed
```

If the DELETE throws, this code silently returns 403 while the attendance record persists in DB. This is a **security integrity failure**:
- The user's device receives a blocked response and does not show a check-in
- But the record exists with `checkInTime` populated
- The midnight processor at IST midnight will process this as a valid check-in
- Payroll will count it as a present day

### Required control

**If rollback DELETE fails → return `HTTP 500`, not `HTTP 403`.**

Rationale:
- `403 ATTENDANCE_BLOCKED` semantically guarantees the check-in was not recorded. It must only be returned when the record is confirmed deleted.
- `500 ATTENDANCE_ENFORCEMENT_ROLLBACK_FAILED` signals an infrastructure failure. The user receives an error (not a false "blocked"), and the admin can identify the orphaned record via `auditId`.
- The audit row is already committed before this path is reached — evidence is always preserved regardless of outcome.

### Required gate implementation

```typescript
// Phase 5 enforcement gate — only active when SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = true.
// blocked is computed by attendance-security-service.ts as:
//   blocked = enforcing && BLOCKING_OUTCOMES.has(outcome)
// When enforcement flag is false, blocked is always false — this gate is a complete no-op.
if (auditResult?.blocked) {
  let rollbackOk = false;
  try {
    if (savedRecord?.id) {
      await db.delete(attendanceRecords).where(eq(attendanceRecords.id, savedRecord.id));
    }
    rollbackOk = true;
  } catch (rollbackErr) {
    console.error(
      '[SECURITY][ERROR] Attendance enforcement rollback failed — record may persist in DB:',
      rollbackErr,
      { recordId: savedRecord?.id, userId, auditId: auditResult.auditId }
    );
  }

  if (!rollbackOk) {
    return res.status(500).json({
      code: 'ATTENDANCE_ENFORCEMENT_ROLLBACK_FAILED',
      message: 'Attendance security check failed. Please contact your administrator.',
      auditId: auditResult.auditId,
    });
  }

  return res.status(403).json({
    code: 'ATTENDANCE_BLOCKED',
    message: 'Check-in blocked by attendance security policy.',
    reason: auditResult.outcome,
    severity: auditResult.severity,
    auditId: auditResult.auditId,
  });
}
```

### Integrity guarantees of this design

| Scenario | HTTP response | Attendance record in DB | Audit row in DB |
|---|---|---|---|
| Not blocked (flag false or clean location) | 200 success | Persists | Written |
| Blocked + rollback DELETE succeeds | 403 ATTENDANCE_BLOCKED | **Deleted** | Written |
| Blocked + rollback DELETE fails | 500 ROLLBACK_FAILED | Persists (needs manual cleanup) | Written |
| Audit pipeline throws (non-fatal catch) | 200 success (advisory failure) | Persists | Not written |

In the `500` case:
- `auditId` in the response body allows the admin to locate the audit row and identify the orphaned attendance record by cross-referencing `attendance_location_audit_log.attendance_record_id`.
- The `[SECURITY][ERROR]` log prefix ensures this surfaces in any log-level monitoring.

---

## File Changes

### Exactly 1 file modified: `server/attendance-routes.ts`

No other files are touched.

#### Imports already present (no new imports needed)

- `db` — already imported
- `attendanceRecords` — already imported (used throughout the file)
- `eq` — already imported (used throughout the file)

#### Change: Add enforcement gate and rollback block

**Location:** Lines 230–241 (post-Phase 1 line numbers) — between `catch (auditErr)` block and `res.json`.

**Before (current state):**

```typescript
    } catch (auditErr) {
      console.error('Attendance audit pipeline error (non-fatal):', auditErr);
    }

    res.json({
      success: true,
      message: 'Checked in successfully',
      record: savedRecord,
      locationVerified: isLocationVerified,
      ipVerified: isIpVerified,
      ...(auditResult ? { attendanceAudit: auditResult } : {}),
    });
```

**After (Phase 2 gate — exact code to be applied):**

```typescript
    } catch (auditErr) {
      console.error('Attendance audit pipeline error (non-fatal):', auditErr);
    }

    // Phase 5 enforcement gate — only active when SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = true.
    // blocked is computed by attendance-security-service.ts as:
    //   blocked = enforcing && BLOCKING_OUTCOMES.has(outcome)
    // When enforcement flag is false, blocked is always false — this gate is a complete no-op.
    if (auditResult?.blocked) {
      let rollbackOk = false;
      try {
        if (savedRecord?.id) {
          await db.delete(attendanceRecords).where(eq(attendanceRecords.id, savedRecord.id));
        }
        rollbackOk = true;
      } catch (rollbackErr) {
        console.error(
          '[SECURITY][ERROR] Attendance enforcement rollback failed — record may persist in DB:',
          rollbackErr,
          { recordId: savedRecord?.id, userId, auditId: auditResult.auditId }
        );
      }

      if (!rollbackOk) {
        return res.status(500).json({
          code: 'ATTENDANCE_ENFORCEMENT_ROLLBACK_FAILED',
          message: 'Attendance security check failed. Please contact your administrator.',
          auditId: auditResult.auditId,
        });
      }

      return res.status(403).json({
        code: 'ATTENDANCE_BLOCKED',
        message: 'Check-in blocked by attendance security policy.',
        reason: auditResult.outcome,
        severity: auditResult.severity,
        auditId: auditResult.auditId,
      });
    }

    res.json({
      success: true,
      message: 'Checked in successfully',
      record: savedRecord,
      locationVerified: isLocationVerified,
      ipVerified: isIpVerified,
      ...(auditResult ? { attendanceAudit: auditResult } : {}),
    });
```

---

## Task Sequence

| Task | Depends On | Action | Flag state |
|---|---|---|---|
| P2-PRE | — | Confirm `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = false` in DB before touching any code | false |
| P2-T1 | P2-PRE | Add enforcement gate + rollback block to `attendance-routes.ts` | false |
| P2-VFY-1 | P2-T1 | Server restarts clean, zero new TS errors, only `attendance-routes.ts` in `git diff` | false |
| P2-VFY-2 | P2-VFY-1 | Advisory mode: normal check-in returns 200, `blocked=false` in audit result, gate is no-op | false |
| P2-VFY-3 | P2-VFY-2 | Enforcement mode: flag temporarily `true` in test session, spoofed/geofence-violating check-in returns 403 `ATTENDANCE_BLOCKED`, record confirmed absent from DB, audit row present | **true (test only)** |
| P2-VFY-4 | P2-VFY-3 | Set flag back to `false`, confirm advisory behaviour restored | false |
| P2-ACT | P2-VFY-3 + separate approval | Production activation — set `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED = true` | **true (production)** |

**P2-ACT requires explicit separate approval after P2-VFY-3 is confirmed. It is not part of the implementation task.**

---

## Verification Criteria

### P2-VFY-1 — Clean restart
- Server starts with zero new log errors
- `npx tsc --noEmit` reports zero new errors in the modified file
- Only `server/attendance-routes.ts` in `git diff HEAD`

### P2-VFY-2 — Advisory mode (flag = false)
- Normal check-in: `HTTP 200`, `success: true`
- `attendanceAudit.blocked = false` in response regardless of GPS quality
- Attendance record persists in DB
- No rollback triggered, no `[SECURITY][ERROR]` in logs

### P2-VFY-3 — Enforcement mode (flag = true, test session only)
- Spoofing / geofence violation / IP unverified check-in: `HTTP 403`
- Response body: `{ code: 'ATTENDANCE_BLOCKED', reason: 'advisory_spoofing_detected' | 'advisory_outside_geofence' | 'advisory_ip_unverified', auditId: <number> }`
- Attendance record **not present** in DB (confirmed via SQL: `SELECT id FROM attendance_records WHERE id = <savedRecord.id>` → 0 rows)
- Audit row present in `attendance_location_audit_log` with correct `outcome` and `blocked = true`
- Normal compliant check-in: `HTTP 200`, record persists — no false positives
- `low_accuracy` check-in: `HTTP 200`, record persists — low accuracy is not a blocking outcome
- Rollback failure simulation (if testable): confirm `HTTP 500` is returned, not `HTTP 403`

### P2-VFY-4 — Re-disable (flag = false after P2-VFY-3)
- Normal check-in: `HTTP 200`
- Spoofed check-in: `HTTP 200`, `blocked = false` in audit result
- Gate is confirmed no-op with flag false

---

## Rollback Plan

**Code rollback:** Remove the `if (auditResult?.blocked) { ... }` block. Route reverts to exact Phase 1 state. One file, one removal.

**Flag rollback (if P2-ACT has run):**
```sql
UPDATE epc_migration_feature_flags SET enabled = false
WHERE flag_name = 'SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED';
```
Effect: `blocked` is immediately false on all subsequent check-in requests. Gate becomes a no-op. No service restart needed.

**Orphaned record cleanup (if 500 ROLLBACK_FAILED was returned):**
```sql
-- Identify orphaned record from auditId
SELECT ar.*
FROM attendance_records ar
JOIN attendance_location_audit_log al ON al.attendance_record_id = ar.id
WHERE al.id = <auditId>;

-- Manual delete after admin review
DELETE FROM attendance_records WHERE id = <recordId>;
```

---

## Constraints (Non-Negotiable)

| Constraint | Rationale |
|---|---|
| `payroll-salary-core.ts` — zero diff | Payroll arithmetic is frozen |
| `shared/schema.ts` — zero diff | No new columns or tables |
| `drizzle.config.ts` — zero diff | Migration config is locked |
| All `client/` files — zero diff | No frontend changes in Phase 2 |
| `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` stays false until P2-VFY-3 confirmed | Premature activation without route gate is insecure (Phase 1 gap) |
| P2-ACT is a separate approval gate | Enforcement activation is a production operations decision, not an implementation decision |
| 403 only returned after confirmed rollback DELETE | Returning 403 with a persisted record is a security integrity failure — this is non-negotiable |

---

## Exempt Roles Reminder

From `attendance-security-service.ts` line 54:
```typescript
const EXEMPT_ROLES = ['Superuser', 'GM', 'SM'];
```

These roles return `outcome: 'exempt'` from the pipeline. `BLOCKING_OUTCOMES` does not include `'exempt'`. `blocked` is always false for exempt roles regardless of flag state. No route gate change is needed for these roles.

---

## Open Items Not in Phase 2 Scope

Deferred at Phase 1 closure — require separate planning decisions:

| Item | Status |
|---|---|
| Layer 1 TOTP_SETUP_REQUIRED end-to-end test | Deferred — requires `SECURITY_2FA_POLICY_ENABLED = true` + enrolled/unenrolled test users |
| Layer 2 DEVICE_NOT_TRUSTED end-to-end test | Deferred — requires `SECURITY_DEVICE_TRUST_ENABLED = true` + device pre-registration |
| Layer 5 re-auth frontend UI walkthrough | Deferred — requires a dedicated UI test session |

---

## Summary

Phase 2 is a single-file, minimal-diff change closing the Layer 4 enforcement gate gap identified in Phase 1. The gate is safe to deploy with the enforcement flag false (complete no-op). The rollback integrity control ensures `403` is only returned when the attendance record is confirmed deleted — if the delete fails, `500` is returned instead, preserving the security guarantee that `403` means "not recorded." Race condition analysis confirms zero automated background processor can consume the transient record during the ~50-200ms T0–T1 window.

| Item | Value |
|---|---|
| Files modified | `server/attendance-routes.ts` (1 file) |
| Lines added | ~20 |
| New flags | None |
| Schema changes | None |
| Frontend changes | None |
| Payroll changes | None |
| New imports required | None |
| 403 integrity guarantee | Conditional on confirmed rollback DELETE |
| Race condition risk | Zero (all processors confirmed, no triggers) |
