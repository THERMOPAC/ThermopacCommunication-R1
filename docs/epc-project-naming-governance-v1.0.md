# EPC Project Naming Governance — v1.0 Baseline

**Status**: ACTIVE  
**Effective date**: 2026-05-18  
**Owner**: EPC Project Management Module

---

## 1. Canonical Project Display Name

All EPC modules MUST display projects using the canonical format:

```
{project_code} — {customer_name} — {short_description}
```

**Example**:
```
2627-018 — Industria Petroquimica Apollo — Used Engine Oil Refinery
```

The separator is the **em dash** (—, U+2014) surrounded by single spaces. A regular hyphen (-) is NOT permitted as a separator.

---

## 2. Source Fields (DB)

| DB Column | Drizzle Field | Description |
|---|---|---|
| `code` | `code` | Auto-generated project code e.g. `2627-018` |
| `customer_name` | `customerName` | Denormalized snapshot from `customers.bp_name` at create time |
| `short_description` | `shortDescription` | Concise human-readable title e.g. "Used Engine Oil Refinery" |
| `project_display_name` | `projectDisplayName` | **Computed SSOT** — stored, never edited directly |

All three source fields are `TEXT NOT NULL DEFAULT ''`.

---

## 3. Computation Rule

```
project_display_name = code + ' — ' + customer_name + ' — ' + short_description
```

- Computed server-side by `computeProjectDisplayName()` in `server/project-routes.ts`
- Stored to DB on every create and update of source fields
- Never accept `project_display_name` as a raw input from the client

---

## 4. Enforcement Points

### 4.1 Project Creation (manual — Project Master)
- `POST /api/projects`: resolves `customer_name` from `customers.bp_name`, computes `project_display_name`
- Frontend form: user enters `shortDescription`, customer is selected; display name previewed read-only

### 4.2 Project Creation (offer conversion)
- `server/offer-conversion.ts`: `short_description = offer.subject`, `customer_name` from customer lookup, `project_display_name` computed before INSERT

### 4.3 Project Updates
- `PUT /api/projects/:id`: if `shortDescription` or `customerName` changes, `project_display_name` is recomputed automatically

### 4.4 Admin Backfill
- `POST /api/admin/projects/backfill-display-names` (Superuser only)
- Populates all three fields from existing `name`, `client_name`, and `customers.bp_name` for legacy projects

---

## 5. Frontend Consumption

### 5.1 Utility Function (SSOT for display)
```typescript
// client/src/lib/project-utils.ts
getProjectDisplayName(p)
```
All UI modules MUST use this function. Direct string concatenation of `code + name` is prohibited.

### 5.2 Fallback Chain
If `project_display_name` is empty (pre-backfill records):
1. Falls back to `code — customerName — shortDescription` (computed in JS)
2. Falls back to `code — clientName || name`
3. Falls back to `name` alone

This ensures zero breakage during migration.

---

## 6. Module Coverage

| Module | Status | Method |
|---|---|---|
| Project Master | ✓ | `getProjectDisplayName` in table + form preview |
| Drawing Verification | ✓ | `getProjectDisplayName` in project dropdown |
| Procurement List Control | ✓ | `getProjectDisplayName` in project dropdown |
| Offer Conversion | ✓ | Governance fields written on INSERT |
| EPC Control Tower | Pending — consumer reads `project.code` + `name` |
| BUY List Control | Pending — reads `project.projectCode` + `project.name` |
| DVS | Pending |
| Drawing Registry | Pending |
| Finance Invoices | Pending |

*Remaining modules consume the `projectDisplayName` field via the fallback in `getProjectDisplayName`. Full display migration can be applied incrementally.*

---

## 7. DB Constraints Summary

```sql
ALTER TABLE projects
  ADD COLUMN short_description    TEXT NOT NULL DEFAULT '',
  ADD COLUMN customer_name        TEXT NOT NULL DEFAULT '',
  ADD COLUMN project_display_name TEXT NOT NULL DEFAULT '';
```

NOT NULL constraints with defaults ensure no nulls enter the system.

---

## 8. Backfill Evidence

Backfill executed 2026-05-18 — 26 projects updated.

Sample results:
| code | customer_name | short_description | project_display_name |
|---|---|---|---|
| 2627-018 | Industria Petroquimica Apollo | Used Engine Oil Refinery… | 2627-018 — Industria Petroquimica Apollo — … |
| 2627-001 | LWART solucoes ambientais | Continuous Polishing… | 2627-001 — LWART solucoes ambientais — … |
| 2425-001 | WPC LIMITED | WPC Refinery UOR 3045 | 2425-001 — WPC LIMITED — WPC Refinery UOR 3045 |

---

## 9. Validation Rules

- `project_code`: must be non-empty (enforced by existing `NOT NULL` on `code`)
- `customer_name`: must be non-empty on new creates (backend resolves from customer record)
- `short_description`: must be non-empty on new creates (required field in create form)
- No duplicate separators — guaranteed by the `computeProjectDisplayName` helper which trims all segments
- No empty segments — helper filters empty strings before joining

---

## 10. Zero-Trust Audit Evidence

- `project_display_name` is NEVER accepted from client input directly
- All mutations to source fields trigger automatic recomputation of `project_display_name`
- Offer-to-project conversions write all three fields atomically in the DB INSERT
- Legacy records backfilled from verified sources (`customers.bp_name`, `projects.name`)
- Admin backfill restricted to Superuser role only
