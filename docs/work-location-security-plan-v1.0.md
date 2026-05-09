# Work Location Settings — Security & Enforcement Readiness Plan v1.0

**Date:** 09 May 2026  
**Status:** APPROVED FOR REVIEW — implementation not started  
**Author:** Security Architecture Review  
**Prerequisite:** Phase 1 + Phase 2 security implementations complete and verified

---

## 1. Context and Constraint

Work Location records are the source of truth for GPS geofence coordinates and IP allowlists that feed directly into the attendance security enforcement pipeline (Layers 3 and 4). Any misconfiguration or unauthorised mutation of these records undermines the entire enforcement model.

GPS/IP enforcement **must not be activated** (i.e., `SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` and `SECURITY_APP_ACCESS_GPS_IP_ENABLED` must remain `false`) until every item in Priority 1 and Priority 2 below is implemented and verified.

`locationCountryCode` is noted as a DB-only placeholder; its activation path is out of scope for this plan.

---

## 2. Full Findings Summary (from audit)

| # | Finding | Severity |
|---|---|---|
| F-1 | All 8 endpoints in `work-location-routes.ts` have zero authentication | **Critical** |
| F-2 | POST/PUT routes spread `req.body` directly — no Zod parse | **High** |
| F-3 | `insertWorkLocationSchema` has no range/format validation | **High** |
| F-4 | IP matching uses string `.includes()` — CIDR notation never works | **High** |
| F-5 | IP restrictions UI section is a placeholder — no input field rendered | **High** |
| F-6 | Zero audit logging on any work location mutation | **Medium** |
| F-7 | `locationCountryCode` unused end-to-end | **Low** |
| F-8 | All 3 DB locations: null GPS coordinates, empty IP restrictions | **Operational** |
| F-9 | No GPS coverage indicator in location list table | **Low** |
| F-10 | No assigned-users view within Work Locations page | **Low** |
| F-11 | No map picker for coordinate entry | **Low** |

---

## 3. Scope of Changes

### Files Modified

| File | What changes |
|---|---|
| `shared/schema.ts` | Add `work_location_audit_log` table; add `createdBy`/`updatedBy` to `workLocations`; extend `insertWorkLocationSchema` with validation |
| `server/work-location-routes.ts` | Add auth guards; add Zod parse; add audit writes |
| `server/utils/cidr-matcher.ts` | **NEW** — pure-TS CIDR/IP matching utility |
| `server/attendance-routes.ts` | Replace naive `.includes()` IP check with CIDR utility (check-in path only) |
| `client/src/pages/work-locations-page.tsx` | Add IP restrictions input; GPS coverage badge in list; assigned-users panel |

### Files NOT Modified

| File | Reason |
|---|---|
| `drizzle.config.ts` | Frozen — never edit |
| `package.json` | Frozen — no new npm packages (CIDR matcher is pure TS, no dependency) |
| `server/vite.ts` / `vite.config.ts` | Frozen |
| `server/payroll-salary-core.ts` | Permanently zero-diff |
| `server/attendance-security-service.ts` | No change needed — consumes `isIpVerified` which is set upstream in attendance-routes; CIDR fix is in attendance-routes |

---

## 4. Priority 1 — Immediate Security Fix

### P1-T1: Add authentication and role guards to all work-location-routes.ts endpoints

**File:** `server/work-location-routes.ts`

**Current state:** No imports for auth middleware. All 8 route handlers have no guards whatsoever.

**Required changes:**

Add to imports:
```typescript
import { ensureAuthenticated } from './auth-middleware';
```

Apply the following guard matrix:

| Route | Guard |
|---|---|
| `GET /work-locations` | `ensureAuthenticated` |
| `GET /work-locations/active` | `ensureAuthenticated` |
| `GET /work-locations/:id` | `ensureAuthenticated` |
| `GET /work-locations/:id/users` | `ensureAuthenticated` |
| `POST /work-locations` | `ensureAuthenticated` + Superuser-only inline check |
| `PUT /work-locations/:id` | `ensureAuthenticated` + Superuser-only inline check |
| `DELETE /work-locations/:id` | `ensureAuthenticated` + Superuser-only inline check |
| `PATCH /work-locations/:id/toggle-status` | `ensureAuthenticated` + Superuser-only inline check |

The inline Superuser check pattern (consistent with the rest of the codebase):
```typescript
if ((req.user as any)?.role !== 'Superuser') {
  return res.status(403).json({ error: 'Superuser access required' });
}
```

**Why read routes get only `ensureAuthenticated` (not Superuser-only):**  
`GET /work-locations/active` is consumed by `user-edit-dialog.tsx` for the location dropdown — restricting it to Superuser would break the User Management page for non-Superuser admins. Reads remain auth-gated but role-open.

### P1-T2: Add Zod body validation to POST and PUT routes

**File:** `server/work-location-routes.ts`

**Current state:** `const locationData: InsertWorkLocation = req.body` — no parse, no validation.

**Required change in POST:**
```typescript
const parseResult = insertWorkLocationSchema.safeParse(req.body);
if (!parseResult.success) {
  return res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
}
const locationData = parseResult.data;
```

**Required change in PUT:**
```typescript
const parseResult = insertWorkLocationSchema.partial().safeParse(req.body);
if (!parseResult.success) {
  return res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
}
const locationData = parseResult.data;
```

---

## 5. Priority 2 — GPS/IP Enforcement Readiness

### P2-T1: Schema validation extensions

**File:** `shared/schema.ts` — extend `insertWorkLocationSchema` starting at line 6959

**Current:**
```typescript
export const insertWorkLocationSchema = createInsertSchema(workLocations)
  .omit({ id: true, createdAt: true, updatedAt: true });
```

**Replace with:**
```typescript
export const insertWorkLocationSchema = createInsertSchema(workLocations)
  .omit({ id: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true })
  .extend({
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    radiusMeters: z.number().int().min(10).max(10000).nullable().optional(),
    ipRestrictions: z.array(
      z.string()
        .regex(
          /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/,
          'Each entry must be a valid IPv4 address or CIDR block (e.g. 192.168.1.0/24 or 203.0.113.5)'
        )
    ).nullable().optional(),
  });
```

**Validation rules:**
- `latitude`: −90 to +90 inclusive (Earth bounds)
- `longitude`: −180 to +180 inclusive (Earth bounds)
- `radiusMeters`: 10 m minimum (prevents zero-radius locks), 10,000 m maximum (10 km — prevents accidental global allow)
- `ipRestrictions` entries: regex validates IPv4 bare address or IPv4/CIDR notation; IPv6 is out of scope for this plan

### P2-T2: Add audit table and createdBy/updatedBy to schema

**File:** `shared/schema.ts`

**Step A — Add columns to `workLocations` table** (after `updatedAt`):
```typescript
createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
```

**Step B — Add `workLocationAuditLog` table** (after the `workLocations` definition):
```typescript
export const workLocationAuditLog = pgTable('work_location_audit_log', {
  id: serial('id').primaryKey(),
  workLocationId: integer('work_location_id'),   // nullable — kept after delete
  action: text('action').notNull(),              // 'create' | 'update' | 'delete' | 'toggle_status'
  changedBy: integer('changed_by').references(() => users.id, { onDelete: 'set null' }),
  changedAt: timestamp('changed_at').notNull().defaultNow(),
  previousValues: jsonb('previous_values'),      // full previous row snapshot
  newValues: jsonb('new_values'),                // full new row snapshot (null on delete)
});

export type WorkLocationAuditLog = typeof workLocationAuditLog.$inferSelect;
```

**DB migration:** After schema edit, run `drizzle-kit push:pg` (via the project `npm run generate:db-schema` then manual push). This is a purely additive migration — adds 2 nullable columns and 1 new table. No data is touched. Safe on a live database.

### P2-T3: Create CIDR matching utility

**File:** `server/utils/cidr-matcher.ts` (NEW)

**Purpose:** Replace the broken string `.includes()` check with correct IPv4/CIDR matching. No npm package — pure TypeScript, zero dependencies.

**Full implementation to write:**
```typescript
/**
 * cidr-matcher.ts
 * Pure TypeScript IPv4 and CIDR matching utility.
 * No external dependencies.
 */

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isValidIpv4(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every(o => parseInt(o, 10) <= 255);
}

/**
 * Returns true if `clientIp` matches the `allowedEntry`.
 * `allowedEntry` may be:
 *   - A bare IPv4 address:   "203.0.113.5"
 *   - A CIDR block:           "192.168.1.0/24"
 */
export function ipMatchesCidr(clientIp: string, allowedEntry: string): boolean {
  // Strip IPv6-mapped IPv4 prefix (::ffff:) if present
  const normalised = clientIp.replace(/^::ffff:/, '');

  if (!isValidIpv4(normalised)) return false;

  if (allowedEntry.includes('/')) {
    const [networkAddr, prefixStr] = allowedEntry.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (prefix < 0 || prefix > 32 || !isValidIpv4(networkAddr)) return false;

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipToInt(normalised) & mask) === (ipToInt(networkAddr) & mask);
  }

  // Bare IP — exact match
  return isValidIpv4(allowedEntry) && ipToInt(normalised) === ipToInt(allowedEntry);
}

/**
 * Returns true if `clientIp` matches ANY entry in the `allowedList`.
 * If `allowedList` is empty or null, returns true (no restriction).
 */
export function isIpAllowed(clientIp: string | undefined | null, allowedList: string[] | null): boolean {
  if (!allowedList || allowedList.length === 0) return true;
  if (!clientIp) return false;
  return allowedList.some(entry => ipMatchesCidr(clientIp, entry));
}
```

### P2-T4: Replace IP matching in attendance-routes.ts

**File:** `server/attendance-routes.ts`

**Scope:** Lines 162–165 (the only place IP matching occurs; check-out does not re-run IP matching — confirmed).

**Add import at top of file:**
```typescript
import { isIpAllowed } from './utils/cidr-matcher';
```

**Replace lines 162–168:**

Current (broken):
```typescript
if (location.ipRestrictions && location.ipRestrictions.length > 0 && ipAddress) {
  isIpVerified = location.ipRestrictions.some((allowedIp: string) =>
    ipAddress.includes(allowedIp) || allowedIp.includes(ipAddress)
  );
} else {
  isIpVerified = true; // No IP restrictions
}
```

Replace with:
```typescript
isIpVerified = isIpAllowed(ipAddress ?? null, location.ipRestrictions ?? null);
```

The `isIpAllowed` function handles the "no restrictions → true" case internally, so the else branch becomes implicit.

### P2-T5: Add audit writes to work-location-routes.ts

**File:** `server/work-location-routes.ts`

**Add import:**
```typescript
import { workLocationAuditLog } from '@shared/schema';
```

**Pattern for each mutating route** — insert one audit row after each successful DB operation, before `res.json()`:

```typescript
await db.insert(workLocationAuditLog).values({
  workLocationId: <affected id>,
  action: 'create' | 'update' | 'delete' | 'toggle_status',
  changedBy: (req.user as any)?.id ?? null,
  previousValues: <previous snapshot or null>,
  newValues: <new snapshot or null>,
});
```

**Per-route audit writes:**

| Route | `action` | `previousValues` | `newValues` |
|---|---|---|---|
| `POST /work-locations` | `'create'` | `null` | full `newLocation` |
| `PUT /work-locations/:id` | `'update'` | full pre-update snapshot | full `updatedLocation` |
| `DELETE /work-locations/:id` | `'delete'` | full `deletedLocation` | `null` |
| `PATCH /:id/toggle-status` | `'toggle_status'` | `{ isActive: location.isActive }` | `{ isActive: !location.isActive }` |

For `PUT`, a `SELECT` before the update is needed to capture `previousValues` (already present conceptually since we read for 404 checks in toggle; for PUT we will add a pre-fetch).

**Audit writes are best-effort:** wrap in `try/catch` — audit failure must never cause the primary operation to fail.

### P2-T6: IP restrictions UI input

**File:** `client/src/pages/work-locations-page.tsx`

**Current state:** Both Add and Edit dialogs have an "IP Restrictions" section that renders only static text. `ipRestrictions` is always submitted as `[]`.

**Required changes:**

Replace the static placeholder `<div>` in both the Add and Edit "Network IP Restrictions" sections with a functional multi-value input. Implementation approach:

1. **State per dialog:** Add local state `ipInput` (string) for the currently-typed entry and surface the form-managed `ipRestrictions` array.

2. **Rendered UI** (inside the existing `<div className="border rounded-lg p-4">` for IP Restrictions):
   - A read/display row showing current entries as removable badges: e.g. `192.168.1.0/24 ×`
   - A text `<Input>` with placeholder `"e.g. 192.168.1.0/24 or 203.0.113.5"` + `Add` button
   - On Add: validate format with the same regex used in schema, push to the array, clear input
   - On remove (× button): splice from the array

3. **Connect to form:** `FormField` wrapping using `addForm.control` / `editForm.control` on `name="ipRestrictions"` — render prop receives `field.value` (array) and `field.onChange`.

4. **No new packages needed** — shadcn `Badge` (already imported), `Input`, `Button` (already imported).

**Exact insertion points:**
- Add dialog: replace lines 403–415 (the static IP restriction `<div>`)
- Edit dialog: replace lines 719–731 (the equivalent static section)

---

## 6. Priority 3 — Operational Improvements

### P3-T1: GPS coverage indicator in location list table

**File:** `client/src/pages/work-locations-page.tsx`

**Current table columns:** Name, Address, City/State, Status, Timezone, Actions (6 columns).

**Add a "GPS / IP" column** between Status and Timezone showing:
- A green `MapPin` badge if latitude is non-null
- A grey `MapPin` badge with "No GPS" if null
- A green `Network` (or `Shield`) badge if `ipRestrictions.length > 0`
- A grey `Network` badge with "No IP" if empty

This is purely a read-side display change. No API changes needed — the existing GET response already returns these fields.

### P3-T2: Assigned-users panel

**File:** `client/src/pages/work-locations-page.tsx`

**Current:** `Users` icon imported but not rendered. `GET /api/work-locations/:id/users` endpoint exists but has no UI.

**Add a "View Users" action button** in the table Actions column (using the already-imported `Users` icon). On click:
- Open a Sheet (slide-over) component
- Fetch `GET /api/work-locations/${id}/users` using a `useQuery` keyed on `['/api/work-locations', id, 'users']`
- Display a simple table: Name, Email, Role
- Read-only (reassignment is done via User Management page)

**No backend changes needed** — endpoint already exists and returns `{id, username, email, role, mobileNumber, countryCode}`.

### P3-T3: Map/coordinate picker evaluation

**Decision:** Do NOT add a third-party map library (Leaflet, Google Maps, Mapbox) at this stage. Reasons:
- All three require either API keys or large bundle additions
- The three current work locations are permanent, known, fixed offices — coordinates can be looked up once from Google Maps and typed in. This is not a high-frequency operation.
- The existing `<Input type="number" step="any">` with lat/lng labels is sufficient for a Superuser-only admin page

**Mitigating measure instead of a map picker:**
- Add a helper text below the Latitude/Longitude inputs: "Tip: right-click your location on Google Maps → 'What's here?' to get exact coordinates."
- Validate and show a formatted preview: `"±X.XXXXXX, ±Y.YYYYYY — approx. Zm from [Location Name] reference" ` — requires a Haversine call in the browser. Deferred to a follow-on task.

**Re-evaluate** if work locations become high-frequency (multi-site rollout, remote work, etc.).

---

## 7. Operational Pre-Activation Checklist (not code tasks)

These are data entry tasks for the Superuser to complete **before** enabling GPS/IP enforcement flags:

| # | Task | Responsible |
|---|---|---|
| OPS-1 | Enter real GPS coordinates for all 3 work locations (lat/lng from Google Maps) | Superuser |
| OPS-2 | Confirm `radiusMeters` per site (suggested: 150m for open sites, 50m for compact factory floors) | Superuser |
| OPS-3 | Obtain corporate office network IP ranges from IT/networking team | IT Admin |
| OPS-4 | Enter CIDR blocks for each location's `ipRestrictions` field | Superuser |
| OPS-5 | Set `locationCountryCode = 'IN'` on all 3 locations | Superuser |
| OPS-6 | Verify Security Enforcement Dashboard shows `gpsWarning = false` and coverage `3/3` | Superuser |
| OPS-7 | Test a single check-in from within the office geofence — confirm `isLocationVerified = true` | Superuser |
| OPS-8 | Test a single check-in from a known IP — confirm `isIpVerified = true` | Superuser |
| OPS-9 | Only after OPS-1 through OPS-8 pass: enable enforcement flags in the correct order | Superuser |

---

## 8. Rollout Strategy

### Phase ordering

```
Phase 3-A  (P1 only)    → merge → verify → no DB migration required
Phase 3-B  (P2-T1/T2)   → merge → run drizzle-kit push:pg → verify schema
Phase 3-C  (P2-T3/T4)   → merge → CIDR unit test → verify
Phase 3-D  (P2-T5)      → merge → audit log smoke test
Phase 3-E  (P2-T6)      → merge → UI test of IP input
Phase 3-F  (P3-T1/T2)   → merge → smoke test
OPS checklist           → data entry → flag activation (separate session)
```

Phases 3-A through 3-F can be batched into one implementation session since the DB migration (3-B) is purely additive and there are no destructive steps.

### Flag state throughout

`SECURITY_ATTENDANCE_ENFORCEMENT_ENABLED` stays `false` throughout all phases until the OPS checklist is complete.

---

## 9. Rollback Plan

| Component | Rollback |
|---|---|
| `work-location-routes.ts` auth guards (P1-T1) | Revert to checkpoint; no data change |
| Schema validation extensions (P2-T1) | Schema revert; no DB change needed (validation is app-side only) |
| `work_location_audit_log` table (P2-T2) | `DROP TABLE work_location_audit_log;` — safe, no foreign key dependencies from other tables |
| `created_by` / `updated_by` columns on `work_locations` (P2-T2) | `ALTER TABLE work_locations DROP COLUMN created_by, DROP COLUMN updated_by;` — both nullable, no data loss |
| CIDR utility (P2-T3) | Delete `server/utils/cidr-matcher.ts`; revert import and IP-check block in `attendance-routes.ts` |
| IP restrictions UI (P2-T6) | Revert frontend; no backend or DB impact |

All rollback steps are additive-only reversals. No existing data rows are modified at any point in this plan.

---

## 10. Verification Tests

### VFY-P1 (Security Fix)

| Test | Method | Expected |
|---|---|---|
| P1-VFY-1: Unauthenticated GET | `curl -s http://localhost:5000/api/work-locations` (no session) | `401 Unauthorized` |
| P1-VFY-2: Unauthenticated POST | `curl -s -X POST http://localhost:5000/api/work-locations -H "Content-Type: application/json" -d '{...}'` (no session) | `401 Unauthorized` |
| P1-VFY-3: Non-Superuser write | Authenticate as Employee; attempt `POST /api/work-locations` | `403 Superuser access required` |
| P1-VFY-4: Non-Superuser read | Authenticate as Manager; `GET /api/work-locations/active` | `200 OK` with location list |
| P1-VFY-5: Superuser write | Authenticate as Superuser; `POST /api/work-locations` with valid body | `201` with new location |
| P1-VFY-6: Bad body rejected | Superuser; `POST` with `latitude: 999` | `400 Validation failed` |

### VFY-P2 (GPS/IP Readiness)

| Test | Method | Expected |
|---|---|---|
| P2-VFY-1: Lat/lng boundary | `PUT` with `{ latitude: 91 }` | `400` — validation error |
| P2-VFY-2: Valid CIDR accepted | `PUT` with `ipRestrictions: ["192.168.1.0/24"]` | `200` — saves correctly |
| P2-VFY-3: Invalid IP rejected | `PUT` with `ipRestrictions: ["not-an-ip"]` | `400` — validation error |
| P2-VFY-4: CIDR match (unit test) | `isIpAllowed("192.168.1.45", ["192.168.1.0/24"])` in Node | `true` |
| P2-VFY-5: CIDR no-match | `isIpAllowed("10.0.0.1", ["192.168.1.0/24"])` | `false` |
| P2-VFY-6: Empty list allows all | `isIpAllowed("1.2.3.4", [])` | `true` |
| P2-VFY-7: IPv6-mapped IPv4 | `isIpAllowed("::ffff:192.168.1.45", ["192.168.1.0/24"])` | `true` |
| P2-VFY-8: Audit row written | After `PUT /api/work-locations/1`, query `SELECT * FROM work_location_audit_log` | Row exists with `action='update'`, `changed_by` = Superuser ID |
| P2-VFY-9: IP input saves | Add `192.168.1.0/24` via UI Add dialog → Submit → `GET /api/work-locations` | `ipRestrictions: ["192.168.1.0/24"]` |

### VFY-P3 (Operational)

| Test | Method | Expected |
|---|---|---|
| P3-VFY-1: GPS badge in list | Open `/work-locations` with location having lat=null | Grey "No GPS" badge shown |
| P3-VFY-2: GPS badge after coords | Edit location, enter lat/lng, save, reload list | Green GPS badge shown |
| P3-VFY-3: Users panel | Click Users icon for a location with assigned users | Slide-over shows user list |

---

## 11. Zero-Trust Audit Plan

After all phases and OPS checklist are complete, the following zero-trust review verifies the enforcement chain end-to-end:

| Audit Point | Check |
|---|---|
| ZT-1: No unauthenticated surface | `grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/work-location-routes.ts` — every route must have `ensureAuthenticated` |
| ZT-2: Write routes Superuser-gated | Confirm each write handler has the `role !== 'Superuser'` → 403 guard before any DB operation |
| ZT-3: Input always parsed | Every `POST` and `PUT` handler calls `insertWorkLocationSchema.safeParse(req.body)` before data touches DB |
| ZT-4: CIDR utility coverage | Manually run the VFY-P2 CIDR tests (VFY-4 through VFY-7) in `node` REPL |
| ZT-5: Audit log completeness | Trigger one create, one update, one delete, one toggle from the UI; confirm 4 rows in `work_location_audit_log` with correct `changedBy`, `previousValues`, `newValues` |
| ZT-6: GPS coordinates populated | Confirm all active work locations have non-null `latitude` and `longitude` in DB |
| ZT-7: IP restrictions populated | Confirm at least one location has non-empty `ipRestrictions` and a valid CIDR block |
| ZT-8: Enforcement page shows green | Security Enforcement page: `workLocationsWithCoords = 3/3`, `gpsWarning = false` |
| ZT-9: Actual check-in GPS pass | Test check-in from within geofence → `isLocationVerified = true` in `attendance_records` |
| ZT-10: Actual check-in IP pass | Test check-in from allowed network → `isIpVerified = true` in `attendance_records` |
| ZT-11: Actual check-in GPS fail | Test check-in from outside geofence → `isLocationVerified = false` (advisory mode: allowed but flagged) |
| ZT-12: locationCountryCode | Confirm field is set for all locations before any country-code-based enforcement logic is added |

---

## 12. Task Index

| Task ID | Priority | Description | File(s) |
|---|---|---|---|
| P1-T1 | **P1** | Add `ensureAuthenticated` + Superuser guard to all 8 endpoints | `work-location-routes.ts` |
| P1-T2 | **P1** | Add Zod `safeParse` to POST and PUT routes | `work-location-routes.ts` |
| P2-T1 | **P2** | Extend `insertWorkLocationSchema` with lat/lng/radius/IP validation | `shared/schema.ts` |
| P2-T2 | **P2** | Add `createdBy`/`updatedBy` columns + `work_location_audit_log` table | `shared/schema.ts` + DB push |
| P2-T3 | **P2** | Create `cidr-matcher.ts` utility | `server/utils/cidr-matcher.ts` (NEW) |
| P2-T4 | **P2** | Replace naive IP matching with `isIpAllowed()` in check-in route | `server/attendance-routes.ts` |
| P2-T5 | **P2** | Add audit log writes to all mutating routes | `server/work-location-routes.ts` |
| P2-T6 | **P2** | Replace IP restrictions placeholder with functional tag input in UI | `client/src/pages/work-locations-page.tsx` |
| P3-T1 | **P3** | Add GPS / IP coverage badges to location list table | `client/src/pages/work-locations-page.tsx` |
| P3-T2 | **P3** | Add assigned-users slide-over panel | `client/src/pages/work-locations-page.tsx` |
| P3-T3 | **P3** | Map picker — deferred; add coordinate hint text instead | `client/src/pages/work-locations-page.tsx` |
| OPS-1–9 | **OPS** | Data entry: GPS coordinates + CIDR blocks + flag activation | DB / Admin UI |

---

*End of Plan v1.0 — ready for implementation approval.*
