# Operational Intelligence — Phase 2B Execution Plan

**Status:** REVISED — SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT  
**Date:** 2026-05-22 (revised 2026-05-22)  
**Phase 2A Baseline:** `docs/operational-intelligence-phase2a-execution.md` (COMPLETE)  
**Amendment 001:** `docs/phase2a-amendment-001-sop-audit-governance.md` (APPROVED)  
**Phase 2B Scope:** ERP Enforcement Framework — SOP-to-ERP Control Mapping, Workflow Gate Definitions, Checklist Injection, Mandatory Evidence Rules, Hold Points, Dispatch Holds, QC Holds, Drawing/DVS Gates, Procurement Holds, FAT/SAT/Commissioning Blocks, Enforcement Approval Workflow, Enforcement Audit Logs, Enforcement Dashboards  
**Prepared by:** Architecture review session  
**Revision:** 2 (corrections C1–C9 incorporated)

---

## Governance Rules (Non-Negotiable — inherited from all prior phases)

- No assumptions. Every field, rule, and behaviour is explicitly stated in this document.
- No hidden logic. No silent auto-actions. No client-side-only validation.
- All enforcement is server-side. UI validation is supplementary only.
- All timestamps stored as UTC. Displayed as IST using `fmtDate` / `fmtDateTime` from `client/src/lib/date-format.ts`.
- **Schema migration: `psql` direct SQL only.** `drizzle-kit push` hangs on this schema size.
- **All prior phase server-side rules remain fully active.** Phase 2B does not modify or relax any prior rule.
- **`ALTER TYPE … ADD VALUE` statements must be executed as standalone commands, each on its own, outside any `BEGIN … COMMIT` transaction block.**
- `MANAGER_ROLES` = `['Manager', 'Senior Manager', 'General Manager', 'Superuser']`.
- `SM_ROLES` = `['Senior Manager', 'General Manager', 'Superuser']`.
- `SUPERUSER_ROLES` = `['Superuser']`.
- **Audit governance (Amendment 001 pattern):** All enforcement audit writes go to `oi_enforcement_audit_log` via `writeEnforcementAuditLog()`. The shared `oi_audit_log` table has `issue_id NOT NULL` and cannot receive enforcement audit entries. This pattern is identical to the SOP audit pattern approved in Amendment 001.
- Enforcement control numbers are server-assigned. Never accepted from client.
- Hold numbers are server-assigned. Never accepted from client.
- Role ladder (ascending): Staff → Manager → Senior Manager (SM) → General Manager (GM) → Superuser.

---

## Explicit Exclusions — Forbidden in Phase 2B Code

| Category | Prohibited |
|---|---|
| AI agents | OpenAI API calls, LLM-generated enforcement rules, AI-suggested hold raises, AI checklist generation |
| Predictive analytics | ML-based risk scoring, trend forecasting, automatic hold prediction |
| Automatic enforcement activation | Controls do not auto-activate on SOP activation, on ERP state changes, or on any system event. Activation is always a manual `activate` transition by an authorised SM+ user. |
| Automatic hold raising | Holds are never raised automatically by the system. Raising a hold is always a deliberate manual action by a Manager+ user. |
| Legal hold | Legal hold flags, immutability for legal purposes, legal hold lifecycle |
| Evidence hash | SHA-256 cryptographic proof, tamper detection, blockchain anchoring, hash verification |
| Lessons learned | Lessons learned records, lessons learned linkage |
| Email notifications | No SendGrid or any email dispatch in Phase 2B. All notification data is computed and audit-logged only. |
| File attachments to holds | GCS file upload against holds or checklist responses is excluded. Evidence is free-text only. |
| ERP state mutation | Phase 2B does NOT modify ERP entity states. It observes and records enforcement status. ERP state changes remain in their existing routes. |

---

## Future-Phase Leakage Guard (Non-Negotiable)

The following are explicitly prohibited from appearing in any Phase 2B code, routes, services, schemas, UI, or comments. Their presence in any Phase 2B file constitutes a critical deviation.

| Prohibited Pattern | Reason |
|---|---|
| AI-driven holds — any logic that auto-raises a hold based on an algorithm, score, or model output | Reserved for future AI phase only; not approved for Phase 2B |
| Automatic ERP transaction mutation — any code that writes to ERP entity tables (epc_purchase_orders, epc_work_orders, etc.) as a side effect of enforcement actions | Phase 2B observes only; never mutates ERP records |
| Autonomous enforcement escalation — any logic that promotes a hold, increases enforcement_level, or changes a control's status without a direct human actor triggering the transition | All transitions require an authenticated human actor |
| Predictive blocking — any logic that pre-emptively raises a hold or advisory based on trend data, risk score, or ML output | Not approved for any phase without explicit governance review |
| Auto-generated checklists — any logic that creates checklist items from templates, SOP text, AI output, or any source other than a Manager+ user manually adding items | Checklist items are human-authored only |

---

## Phase 2B Scope

### In Scope

| Area | Detail |
|---|---|
| Enforcement Control Master | Control definition: SOP → ERP entity type mapping, control type, enforcement level, scope, checklist, ownership |
| Control Numbering | Server-assigned format `ENF-{YYYY}-{NNN}` |
| Control Workflow | Four-state lifecycle: `draft → active → suspended → retired` |
| Enforcement Activation Governance | 4 mandatory pre-conditions checked at server before activation (see §5.1) |
| SOP-to-ERP Control Mapping | Each control links exactly one active SOP to one ERP entity type and one control/gate type |
| Enforcement Scope | 4 explicit scope types: `global`, `department`, `project`, `equipment_type`. No hidden inheritance. |
| Duplicate Control Prevention | Only one active control per (sop_id, erp_entity_type, control_type, scope combination). HTTP 409. |
| Checklist Injection | Ordered checklist items per control; injected at hold-raise time; versioned snapshot stored per response |
| Checklist Versioning | Responses store `sop_revision_number` and `checklist_revision_number` at raise time; immutable after submission |
| Workflow Gate Definitions | 9 gate types covering the full ERP workflow chain |
| Enforcement Level | `advisory` or `mandatory` |
| Hold Records | Per-entity-instance hold with designated hold approver |
| Hold Number | Server-assigned format `HLD-{YYYY}-{NNN}` |
| Hold Lifecycle | Five states: `open → approved_to_proceed → released / overridden / emergency_bypassed` |
| Hold Release Governance | 3 mandatory pre-conditions before release is permitted (see §6.3) |
| Override Governance | SM+ only; 4 mandatory fields; dedicated audit event; tagged in audit log |
| Emergency Bypass Governance | Superuser only; separate from override; mandatory reason; dashboard-visible; tagged in audit log |
| Enforcement Audit Logs | Dedicated `oi_enforcement_audit_log`; immutable; never hard deleted; override/bypass events specially tagged |
| Audit Retention Rule | All enforcement audit rows are permanent; no DELETE or UPDATE permitted at any layer |
| Enforcement Dashboards | 4 dashboard panels including emergency bypass count |
| SOP Reverse Lookup | List all controls linked to a given SOP |
| ERP Entity Lookup | List all active controls and open holds for a given ERP entity instance |

---

## 1. ERP Entity Landscape (Phase 2B Target Entities)

These are the ERP tables that enforcement controls target. Phase 2B observes their state — it does NOT mutate them.

| ERP Entity Type Enum Value | DB Table | Key Status Field | Lifecycle States |
|---|---|---|---|
| `epc_purchase_order` | `epc_purchase_orders` | `status` | draft → approved → issued → cancelled/superseded |
| `epc_work_order` | `epc_work_orders` | `status` | draft → approved → released → cancelled/superseded |
| `epc_dispatch_readiness` | `epc_dispatch_readiness` | `status` | draft → ready → dispatched → cancelled/superseded |
| `epc_commissioning_readiness` | `epc_commissioning_readiness` | `status` | draft → ready → commissioned → handover → cancelled |
| `inspection_execution` | `inspection_execution_records` | `status` | draft → scheduled → started → completed/failed/cancelled |
| `epc_drawing_verification` | `epc_drawing_verifications` | `overallStatus` + `accepted` | — (accepted boolean is the gate) |
| `purchase_order` | `purchase_orders` | `status` | draft → submitted → approved → ordered → shipped → received/on_hold/cancelled |
| `work_order` | `work_orders` | `status` | planned → in_progress → on_hold → completed/cancelled |

**Important:** The `erp_entity_type` value identifies which DB table the `erp_entity_id` refers to. Foreign keys across tables are enforced at the application layer only (no cross-table DB FK constraint is possible for polymorphic references).

---

## 2. Gate Type Definitions

Each control type maps to a specific point in the ERP workflow where the enforcement gate applies.

| `control_type` | Target Entity Types | Gate Description | What a Hold Blocks |
|---|---|---|---|
| `hold_point` | `epc_work_order`, `work_order` | In-process manufacturing hold point | Work order progression past the hold point step |
| `qc_hold` | `inspection_execution`, `epc_purchase_order`, `epc_work_order` | Quality clearance required before the next state | Quality clearance / status update to cleared |
| `dispatch_hold` | `epc_dispatch_readiness`, `dispatch_record` | Dispatch is blocked until hold released | `epc_dispatch_readiness` transition to dispatched |
| `procurement_hold` | `epc_purchase_order`, `purchase_order` | Procurement approval blocked | PO approval / issuance |
| `drawing_gate` | `epc_drawing_verification` | Drawing must pass DVS gate before dispatch | Drawing acceptance (`accepted = true`) |
| `dvs_gate` | `epc_drawing_verification` | DDS gate result must be `pass` | Drawing acceptance |
| `fat_block` | `inspection_execution` (type=FAT) | Factory Acceptance Test must pass | Inspection completion |
| `sat_block` | `epc_commissioning_readiness` | Site Acceptance Test must pass | Commissioning readiness approval |
| `commissioning_block` | `epc_commissioning_readiness` | Commissioning blocked until SOP checklist satisfied | Commissioning readiness transition to commissioned |

**Enforcement level modifier:**
- `advisory`: Hold is raised, visible to all parties, recorded in audit. The ERP entity can still proceed. No blocking enforced at the DB layer.
- `mandatory`: Hold is raised and recorded. The ERP entity's state-change route must check for open mandatory holds before permitting the transition. If an open mandatory hold exists → HTTP 422 with `hold_open` error code.

---

## 3. Enforcement Scope

Each control has an explicit `enforcement_scope` that defines which ERP entity instances the control applies to. There is no hidden inheritance logic. Scope is always explicit and always checked at hold-raise time.

| `enforcement_scope` | Description | Scope-Specific Field Required | Scope-Specific Field Null? |
|---|---|---|---|
| `global` | Applies to all instances of the `erp_entity_type` across all projects, departments, and equipment | None | `scope_project_id` must be null; `scope_equipment_type` must be null |
| `department` | Applies only to entity instances owned by or assigned to the control's `department` field | None (uses `department`) | `scope_project_id` must be null; `scope_equipment_type` must be null |
| `project` | Applies only to entity instances belonging to a specific project | `scope_project_id` (FK → projects.id) must be set | `scope_equipment_type` must be null |
| `equipment_type` | Applies only to entity instances for a specific equipment type | `scope_equipment_type` (free-text, min 2 chars) must be set | `scope_project_id` must be null |

**Server enforcement at hold-raise time:** When a Manager+ user raises a hold against a specific ERP entity instance, the server checks whether the control's scope covers that entity instance:
- `global` → no restriction; any entity of the correct type is in scope.
- `department` → the ERP entity's owning department must match the control's `department`. HTTP 422: `entity_out_of_scope`.
- `project` → the ERP entity's `project_id` must match `control.scope_project_id`. HTTP 422: `entity_out_of_scope`.
- `equipment_type` → the ERP entity's `item_description` or `equipment_type` field must contain the `control.scope_equipment_type` value (case-insensitive). HTTP 422: `entity_out_of_scope`.

No scope is inferred from any other scope. A `project` scope control does not apply to other projects in the same department. A `department` scope control does not apply to all projects in that department — only to entity instances where the owning department field matches.

---

## 4. New Tables (5 tables)

### 4.1 `oi_enforcement_controls`

The master control definition record. One row per control.

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `control_number` | varchar(30) | NOT NULL | UNIQUE | Server-assigned `ENF-{YYYY}-{NNN}` |
| `sop_id` | integer | NOT NULL | FK → oi_sop_records.id ON DELETE RESTRICT | The governing SOP |
| `sop_revision_number` | integer | NOT NULL | — | Snapshot of SOP revision at control creation time |
| `erp_entity_type` | varchar(50) | NOT NULL | — | One of the 8 enum values in §1 |
| `control_type` | varchar(30) | NOT NULL | — | One of the 9 gate types in §2 |
| `enforcement_level` | varchar(20) | NOT NULL | DEFAULT `advisory` | `advisory` or `mandatory` |
| `enforcement_scope` | varchar(30) | NOT NULL | DEFAULT `global` | `global`, `department`, `project`, `equipment_type` — see §3 |
| `scope_project_id` | integer | NULL | FK → projects.id ON DELETE RESTRICT | Required when `enforcement_scope = 'project'`; null otherwise |
| `scope_equipment_type` | varchar(100) | NULL | — | Required when `enforcement_scope = 'equipment_type'`; null otherwise |
| `title` | text | NOT NULL | min 5 chars | Control display name |
| `description` | text | NOT NULL | min 10 chars | What this control enforces |
| `rationale` | text | NOT NULL | min 10 chars | Why this control exists |
| `department` | varchar(100) | NOT NULL | — | Owning department (fixed list) |
| `process_area` | varchar(255) | NULL | — | Free-text process area |
| `control_checklist_version` | integer | NOT NULL | DEFAULT 0 | Incremented on each checklist item add/edit/delete |
| `status` | varchar(20) | NOT NULL | DEFAULT `draft` | `draft`, `active`, `suspended`, `retired` |
| `owner_id` | integer | NOT NULL | FK → users.id | Manager+; must be assigned |
| `approver_id` | integer | NOT NULL | FK → users.id | SM+; must be assigned; must ≠ owner_id |
| `approved_by` | integer | NULL | FK → users.id | Set on activation |
| `approved_at` | timestamp | NULL | — | Set on activation |
| `suspended_by` | integer | NULL | FK → users.id | Set on suspension |
| `suspended_at` | timestamp | NULL | — | |
| `suspension_reason` | text | NULL | — | Required on suspension (min 10 chars) |
| `retired_by` | integer | NULL | FK → users.id | Set on retirement |
| `retired_at` | timestamp | NULL | — | |
| `retirement_reason` | text | NULL | — | Required on retirement (min 10 chars) |
| `created_by` | integer | NOT NULL | FK → users.id | |
| `created_at` | timestamp | NOT NULL | DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL | DEFAULT NOW() | |

**Indexes:**
- `idx_oi_enforcement_controls_sop_id` ON `sop_id`
- `idx_oi_enforcement_controls_erp_type` ON `erp_entity_type`
- `idx_oi_enforcement_controls_status` ON `status`
- `idx_oi_enforcement_controls_department` ON `department`
- `idx_oi_enforcement_controls_scope_project` ON `scope_project_id` WHERE `scope_project_id IS NOT NULL`

**Business rules:**
- `owner_id ≠ approver_id` — enforced at create, update, and activation. HTTP 422: `approver_must_differ_from_owner`.
- `enforcement_scope = 'project'` → `scope_project_id` must be set, `scope_equipment_type` must be null. HTTP 422: `scope_field_required`.
- `enforcement_scope = 'equipment_type'` → `scope_equipment_type` must be set (min 2 chars), `scope_project_id` must be null. HTTP 422: `scope_field_required`.
- `enforcement_scope = 'global'` or `'department'` → both `scope_project_id` and `scope_equipment_type` must be null. HTTP 422: `scope_field_must_be_null`.
- `control_number` is server-assigned using advisory lock: `pg_advisory_xact_lock(hashtext('enforcement_control_number_seq'))`.
- `sop_revision_number` is snapshot-copied from `oi_sop_records.revision_number` at creation time. It is NOT updated if the SOP is later revised. If the SOP is revised, the control's SOP revision snapshot is stale — a warning banner is shown on the control detail page.
- A retired SOP's controls must be reviewed. Retiring a SOP does not auto-retire its controls. The system shows a warning banner if the linked SOP is retired.
- `control_checklist_version` is incremented (by 1) atomically by the server on each checklist item add, edit, or delete — before the checklist operation is committed. This increment is part of the same transaction as the checklist write.

---

### 4.2 `oi_enforcement_checklists`

Ordered checklist items belonging to a control. Items are injected (as response rows) when a hold is raised.

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `control_id` | integer | NOT NULL | FK → oi_enforcement_controls.id ON DELETE CASCADE | |
| `item_number` | integer | NOT NULL | — | Sequential within control (1, 2, 3…) |
| `title` | text | NOT NULL | min 5 chars | Short checklist item label |
| `description` | text | NULL | — | Detailed instruction |
| `is_required` | boolean | NOT NULL | DEFAULT true | If false, item is informational only |
| `evidence_required` | boolean | NOT NULL | DEFAULT false | If true, a non-empty `evidence_note` is required to check this item |
| `sort_order` | integer | NOT NULL | DEFAULT 0 | Display order |
| `created_at` | timestamp | NOT NULL | DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL | DEFAULT NOW() | |

**Index:**
- `idx_oi_enforcement_checklists_control_id` ON `control_id`

**Business rules:**
- Checklist items can only be added, edited, or deleted when the control is in `draft` status. HTTP 422: `control_not_draft`.
- `item_number` is auto-assigned: `MAX(item_number) + 1` within the control on insert.
- If `evidence_required = true` then `is_required` is forced to `true` by the server. Client cannot submit `evidence_required = true` with `is_required = false`.
- Each add/edit/delete of a checklist item increments `oi_enforcement_controls.control_checklist_version` atomically in the same transaction.

---

### 4.3 `oi_enforcement_holds`

Per-instance hold record raised against a specific ERP entity record by its numeric ID.

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `hold_number` | varchar(30) | NOT NULL | UNIQUE | Server-assigned `HLD-{YYYY}-{NNN}` |
| `control_id` | integer | NOT NULL | FK → oi_enforcement_controls.id ON DELETE RESTRICT | The parent control |
| `erp_entity_type` | varchar(50) | NOT NULL | — | Must match `control.erp_entity_type` |
| `erp_entity_id` | integer | NOT NULL | — | Polymorphic ID into the target ERP table |
| `erp_entity_ref` | varchar(100) | NULL | — | Denormalized display reference — server-populated at hold-raise time |
| `enforcement_level` | varchar(20) | NOT NULL | — | Snapshot from control at raise time |
| `hold_type` | varchar(30) | NOT NULL | — | Snapshot from `control.control_type` at raise time |
| `enforcement_scope` | varchar(30) | NOT NULL | — | Snapshot from `control.enforcement_scope` at raise time |
| `reason` | text | NOT NULL | min 10 chars | Why this hold is being raised on this entity |
| `status` | varchar(30) | NOT NULL | DEFAULT `open` | `open`, `approved_to_proceed`, `released`, `overridden`, `emergency_bypassed` |
| `hold_approver_id` | integer | NULL | FK → users.id | Designated approver for this hold (Manager+); must be set before hold can be released |
| `raised_by` | integer | NOT NULL | FK → users.id | Manager+ |
| `raised_at` | timestamp | NOT NULL | DEFAULT NOW() | |
| `approved_to_proceed_by` | integer | NULL | FK → users.id | Manager+ |
| `approved_to_proceed_at` | timestamp | NULL | — | |
| `approved_to_proceed_note` | text | NULL | — | Required on approval (min 10 chars) |
| `released_by` | integer | NULL | FK → users.id | Manager+ |
| `released_at` | timestamp | NULL | — | |
| `release_note` | text | NULL | — | Required on release (min 10 chars) |
| `override_by` | integer | NULL | FK → users.id | SM+ only |
| `override_at` | timestamp | NULL | — | |
| `override_reason` | text | NULL | — | Required on override (min 20 chars) |
| `bypass_by` | integer | NULL | FK → users.id | Superuser only |
| `bypass_at` | timestamp | NULL | — | |
| `bypass_reason` | text | NULL | — | Required on emergency bypass (min 20 chars) |
| `created_at` | timestamp | NOT NULL | DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL | DEFAULT NOW() | |

**Indexes:**
- `idx_oi_enforcement_holds_control_id` ON `control_id`
- `idx_oi_enforcement_holds_erp_entity` ON `(erp_entity_type, erp_entity_id)`
- `idx_oi_enforcement_holds_status` ON `status`

**Unique partial index (no duplicate open holds):**
```sql
CREATE UNIQUE INDEX idx_oi_enforcement_holds_no_duplicate_open
  ON oi_enforcement_holds (control_id, erp_entity_type, erp_entity_id)
  WHERE status = 'open';
```

**Business rules:**
- A hold can only be raised against a control in `active` status. HTTP 422: `control_not_active`.
- `erp_entity_type` of the hold must match `control.erp_entity_type`. HTTP 422: `erp_entity_type_mismatch`.
- The ERP entity's instance must be in scope per the control's `enforcement_scope` rule (§3). HTTP 422: `entity_out_of_scope`.
- `erp_entity_ref` is populated by the server at raise time. If the ERP entity is not found → HTTP 404: `erp_entity_not_found`.
- `enforcement_level`, `hold_type`, and `enforcement_scope` are snapshot-copied from the control at raise time.
- `hold_approver_id` can be set at raise time or updated by Manager+ while hold is `open`. It must be non-null before the hold can be released. HTTP 422: `hold_approver_not_assigned`.
- `approved_to_proceed` transition: only permitted for `mandatory` holds. HTTP 422: `advisory_hold_cannot_approve_to_proceed`.
- Terminal states: `released`, `overridden`, `emergency_bypassed` — no further transitions.

---

### 4.4 `oi_enforcement_checklist_responses`

Per-hold completion state of each injected checklist item. Rows are created automatically at hold-raise time. **Immutable after submission** — once `is_checked = true`, the row cannot be updated or unchecked.

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `hold_id` | integer | NOT NULL | FK → oi_enforcement_holds.id ON DELETE CASCADE | |
| `checklist_item_id` | integer | NOT NULL | FK → oi_enforcement_checklists.id ON DELETE RESTRICT | |
| `sop_revision_number` | integer | NOT NULL | — | Snapshot of `oi_enforcement_controls.sop_revision_number` at hold-raise time |
| `checklist_revision_number` | integer | NOT NULL | — | Snapshot of `oi_enforcement_controls.control_checklist_version` at hold-raise time |
| `is_checked` | boolean | NOT NULL | DEFAULT false | |
| `evidence_note` | text | NULL | — | Required (non-empty) when parent item has `evidence_required = true` |
| `responded_by` | integer | NULL | FK → users.id | Set by server when `is_checked` changes to true |
| `responded_at` | timestamp | NULL | — | Set by server when `is_checked` changes to true |
| `created_at` | timestamp | NOT NULL | DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL | DEFAULT NOW() | |

**Index:**
- `idx_oi_enforcement_checklist_resp_hold_id` ON `hold_id`

**Unique constraint:** `UNIQUE (hold_id, checklist_item_id)`

**Business rules:**
- `sop_revision_number` and `checklist_revision_number` are set by the server at hold-raise time. They are NOT accepted from client.
- Checklist responses can only be updated when the parent hold is in `open` or `approved_to_proceed` status. HTTP 422: `hold_not_open`.
- **Immutability after submission:** Once `is_checked = true`, the row is immutable. Any attempt to update (re-check or uncheck) an already-checked response returns HTTP 422: `response_immutable_after_submission`. Unchecking is not permitted.
- When `is_checked` is set to `true`: `responded_by` and `responded_at` are set by the server. Client cannot supply these fields.

---

### 4.5 `oi_enforcement_audit_log`

Dedicated enforcement audit table. Follows the Amendment 001 pattern — separate from `oi_audit_log`.

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `control_id` | integer | NULL | FK → oi_enforcement_controls.id ON DELETE SET NULL | Populated for control-level events |
| `hold_id` | integer | NULL | FK → oi_enforcement_holds.id ON DELETE SET NULL | Populated for hold-level events |
| `action` | oi_audit_action | NOT NULL | — | Uses the shared enum (11 new values added in Phase 2B — see §5) |
| `actor_id` | integer | NOT NULL | FK → users.id | |
| `actor_name` | text | NOT NULL | — | Denormalized |
| `actor_role` | text | NOT NULL | — | Denormalized |
| `field_name` | text | NULL | — | For `field_updated` events |
| `old_value` | text | NULL | — | |
| `new_value` | text | NULL | — | |
| `context` | text | NULL | — | E.g. `"ENF-2026-001 → HLD-2026-007"` |
| `ip_address` | text | NULL | — | |
| `is_override_event` | boolean | NOT NULL | DEFAULT false | `true` for `enforcement_hold_overridden` and `enforcement_hold_emergency_bypassed` actions |
| `created_at` | timestamp | NOT NULL | DEFAULT NOW() | |

**Indexes:**
- `idx_oi_enforcement_audit_control_id` ON `control_id`
- `idx_oi_enforcement_audit_hold_id` ON `hold_id`
- `idx_oi_enforcement_audit_override` ON `is_override_event` WHERE `is_override_event = true`

**Audit Retention Rules (non-negotiable):**
- `oi_enforcement_audit_log` rows are **immutable**. No UPDATE statement is ever issued against this table.
- `oi_enforcement_audit_log` rows are **never hard deleted**. No DELETE statement is ever issued against this table. Rows persist permanently, even if the parent control or hold is retired/cancelled.
- `is_override_event = true` for all rows with action = `enforcement_hold_overridden` or `enforcement_hold_emergency_bypassed`. This flag enables dashboard filtering of override and emergency bypass events without requiring knowledge of the enum values.
- `writeEnforcementAuditLog()` is the **only** permitted write path to this table. Direct DB inserts in route handlers are forbidden.
- At least one of `control_id` or `hold_id` must be non-null per row. Enforced in `writeEnforcementAuditLog()` before insert.

---

## 5. Enum Additions — `oi_audit_action`

**11 new values** added to the existing `oi_audit_action` Postgres enum (Phase 2B).

```sql
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_control_created';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_control_activated';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_control_suspended';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_control_retired';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_hold_raised';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_hold_approved_to_proceed';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_hold_released';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_hold_overridden';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_checklist_item_checked';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_checklist_item_unchecked';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_hold_emergency_bypassed';
```

Each statement is executed standalone, not in a transaction block.

---

## 6. Control Workflow

### 6.1 State Machine

```
draft ──activate──► active ──suspend──► suspended ──re-activate──► active
                         └──retire──► retired
                    suspended ──retire──► retired
```

### 6.2 Enforcement Activation Governance

Before a control can transition from `draft` (or `suspended`) to `active`, the server checks all four pre-conditions. All four must pass. If any fail, the transition is rejected with HTTP 422 and a specific error code.

| # | Pre-condition | Error Code if Failed |
|---|---|---|
| 1 | The linked SOP (`sop_id`) must currently have `status = 'active'` in `oi_sop_records` | `sop_not_active` |
| 2 | The linked SOP must have its current revision in an approved and activated state — specifically, there must be a revision record with `status = 'active'` for this SOP | `sop_revision_not_activated` |
| 3 | `owner_id` must be assigned (non-null) and the referenced user must exist and hold Manager+ role | `control_owner_not_assigned` |
| 4 | `erp_entity_type` must be assigned (non-null) and must be one of the 8 valid values from §1 | `erp_entity_type_not_assigned` |

Additionally:
- `approver_id ≠ owner_id`. HTTP 422: `approver_must_differ_from_owner`.
- The actor performing the activation must be SM+ and must be either the control's assigned `approver_id` or a Superuser. HTTP 403 otherwise.
- Duplicate active control check: see §7 (checked at activation, not at creation).

**Side effects on successful activation:** Set `approved_by` = actor.id, `approved_at` = NOW(). Write `enforcement_control_activated` audit. Clear `suspended_by`, `suspended_at`, `suspension_reason` if re-activating from suspended.

---

### 6.3 State Transition Table

| From | To | Action | Required Role | Pre-conditions | Side Effects |
|---|---|---|---|---|---|
| `draft` | `active` | `activate` | SM+ (must be `approver_id` or Superuser) | All 4 activation pre-conditions (§6.2); no duplicate active control for same scope (§7) | Set `approved_by`, `approved_at`; write `enforcement_control_activated` audit |
| `active` | `suspended` | `suspend` | SM+ | `suspension_reason` min 10 chars | Set `suspended_by`, `suspended_at`, `suspension_reason`; write `enforcement_control_suspended` audit |
| `suspended` | `active` | `activate` | SM+ (must be `approver_id` or Superuser) | All 4 activation pre-conditions; no duplicate active control | Clear suspension fields; set `approved_by`, `approved_at` (re-stamped); write `enforcement_control_activated` audit |
| `active` | `retired` | `retire` | SM+ | `retirement_reason` min 10 chars; zero open mandatory holds on this control (HTTP 422: `open_mandatory_holds_exist`) | Set `retired_by`, `retired_at`, `retirement_reason`; write `enforcement_control_retired` audit |
| `suspended` | `retired` | `retire` | SM+ | `retirement_reason` min 10 chars | Set `retired_by`, `retired_at`, `retirement_reason`; write `enforcement_control_retired` audit |

**Advisory holds do not block retirement.** Only open `mandatory` enforcement_level holds block a control from being retired.

---

### 6.4 Control Field Update Rules

`PATCH /api/oi/enforcement/controls/:controlId` permitted only in `draft` or `suspended` status.

| Field | Editable in `active`? | Notes |
|---|---|---|
| `title` | No | Requires draft or suspended |
| `description` | No | |
| `rationale` | No | |
| `enforcement_level` | No | Changing level after activation requires retire + new control |
| `enforcement_scope` | No | Scope change after activation requires retire + new control |
| `scope_project_id` | No | |
| `scope_equipment_type` | No | |
| `department` | No | |
| `process_area` | Yes | Editable in any non-retired status |
| `owner_id` | No | |
| `approver_id` | No | |

HTTP 422: `control_not_editable` when editing a non-editable field on an active or retired control.

---

## 7. Duplicate Control Prevention

Only one active enforcement control is permitted per unique combination of SOP, entity type, gate type, and scope. This is enforced at the application layer at activation time (not at creation time).

**Duplicate check algorithm (server-side, at activation):**

Query `oi_enforcement_controls` for rows where:
- `status = 'active'`
- `sop_id = :controlBeingActivated.sop_id`
- `erp_entity_type = :controlBeingActivated.erp_entity_type`
- `control_type = :controlBeingActivated.control_type`
- `enforcement_scope = :controlBeingActivated.enforcement_scope`
- AND the scope-specific field matches:
  - For `global`: no additional filter (one global control per sop+entity+gate is the limit)
  - For `department`: `department = :controlBeingActivated.department`
  - For `project`: `scope_project_id = :controlBeingActivated.scope_project_id`
  - For `equipment_type`: `scope_equipment_type = :controlBeingActivated.scope_equipment_type` (case-insensitive)
- AND `id ≠ :controlBeingActivated.id` (exclude self)

If any matching row exists → HTTP 409: `duplicate_active_control` with `{ conflicting_control_number: 'ENF-XXXX-NNN' }` in the response body.

**Note:** The duplicate check runs inside the activation transaction using `pg_advisory_xact_lock(hashtext('enforcement_control_activate_' || sop_id::text))` to prevent race conditions.

---

## 8. Hold Lifecycle

### 8.1 State Machine

```
(raise)
  │
  ▼
open ──approve_to_proceed──► approved_to_proceed
  │                                │
  └──release (if approver assigned + checklist complete)──► released  (terminal)
  │
  ├──override (SM+) ──────────────────────────────────────► overridden  (terminal)
  │
  └──emergency-bypass (Superuser only) ──────────────────► emergency_bypassed  (terminal)
```

### 8.2 Hold Raise Pre-conditions

Before a hold can be raised, the server checks all of the following. All must pass.

| # | Pre-condition | Error Code |
|---|---|---|
| 1 | Control must be in `active` status | `control_not_active` |
| 2 | `erp_entity_type` of the hold request must match `control.erp_entity_type` | `erp_entity_type_mismatch` |
| 3 | ERP entity with `erp_entity_id` must exist in the target table | `erp_entity_not_found` (HTTP 404) |
| 4 | The ERP entity instance must be in scope per `control.enforcement_scope` (§3) | `entity_out_of_scope` |
| 5 | No existing open hold for the same (control_id, erp_entity_type, erp_entity_id) | `hold_already_open` (HTTP 409) |

On successful raise: insert hold; insert one `oi_enforcement_checklist_responses` row per checklist item (with `is_checked = false`, `sop_revision_number` and `checklist_revision_number` snapshots populated from the control); set `erp_entity_ref`; write `enforcement_hold_raised` audit.

### 8.3 Hold Release Governance

A hold cannot be released unless all three pre-conditions are satisfied. The server checks all three before permitting the `released` transition.

| # | Pre-condition | Error Code |
|---|---|---|
| 1 | All `is_required = true` checklist items must have `is_checked = true` | `checklist_incomplete` with list of incomplete item IDs |
| 2 | All `is_required = true` AND `evidence_required = true` checklist items must have a non-empty `evidence_note` | `checklist_evidence_incomplete` with list of incomplete item IDs |
| 3 | `hold_approver_id` must be non-null (a designated approver must have been assigned to this hold) | `hold_approver_not_assigned` |

Additionally: `release_note` min 10 chars. HTTP 422: `release_note_required`.

Released from: `open` or `approved_to_proceed`. Role: Manager+.

### 8.4 Override Governance

Override is distinct from emergency bypass. Override is available to SM+ (Senior Manager, General Manager, Superuser). It permanently closes the hold without checklist completion.

| Field | Rule |
|---|---|
| `override_reason` | Required. Minimum 20 characters. HTTP 422: `override_reason_required`. |
| `override_by` | Set by the server from the authenticated actor's user ID. Not accepted from client. |
| `override_at` | Set by the server as NOW(). Not accepted from client. |
| Actor role | Must be SM+. HTTP 403 if actor is not SM+. Manager-only role is explicitly forbidden. |

**Mandatory audit event on override:** `writeEnforcementAuditLog()` with action = `enforcement_hold_overridden`, `is_override_event = true`. This is non-negotiable — the audit write is part of the same DB transaction as the hold status update.

Override is permitted from `open` or `approved_to_proceed` status. Override has no checklist completion gate — it is the escape valve for mandatory holds when immediate operational continuity is required.

### 8.5 Emergency Bypass Governance

Emergency bypass is a separate, more restricted action from override. It exists for situations where the normal override path is insufficient.

| Field | Rule |
|---|---|
| Actor role | **Superuser only.** HTTP 403 if actor is not Superuser. SM+ (non-Superuser) is explicitly forbidden from using emergency bypass. |
| `bypass_reason` | Required. Minimum 20 characters. HTTP 422: `bypass_reason_required`. |
| `bypass_by` | Set by the server from the authenticated actor's user ID. Not accepted from client. |
| `bypass_at` | Set by the server as NOW(). Not accepted from client. |

**Mandatory audit event:** `writeEnforcementAuditLog()` with action = `enforcement_hold_emergency_bypassed`, `is_override_event = true`. This is part of the same DB transaction as the hold status update.

**Dashboard visibility mandatory:** The enforcement summary dashboard endpoint (`GET /api/oi/dashboard/enforcement-summary`) must include `emergency_bypass_count` (count of holds with `status = 'emergency_bypassed'`) in the response body. Emergency bypasses must be visible to Superusers at a glance on the dashboard.

Emergency bypass is permitted from `open` or `approved_to_proceed` status. It is a terminal state.

### 8.6 Full State Transition Table

| From | To | Action | Required Role | Pre-conditions | Side Effects |
|---|---|---|---|---|---|
| — | `open` | raise | Manager+ | §8.2 (5 checks) | Insert hold; insert checklist response rows with version snapshots; set `erp_entity_ref`; write `enforcement_hold_raised` audit |
| `open` | `approved_to_proceed` | approve | Manager+ | `enforcement_level = 'mandatory'`; `approved_to_proceed_note` min 10 chars | Set `approved_to_proceed_by`, `approved_to_proceed_at`, `approved_to_proceed_note`; write `enforcement_hold_approved_to_proceed` audit |
| `open` or `approved_to_proceed` | `released` | release | Manager+ | §8.3 (3 checks) + `release_note` min 10 chars | Set `released_by`, `released_at`, `release_note`; write `enforcement_hold_released` audit |
| `open` or `approved_to_proceed` | `overridden` | override | SM+ | `override_reason` min 20 chars | Set `override_by`, `override_at`, `override_reason`; write `enforcement_hold_overridden` audit with `is_override_event = true` |
| `open` or `approved_to_proceed` | `emergency_bypassed` | emergency-bypass | **Superuser only** | `bypass_reason` min 20 chars | Set `bypass_by`, `bypass_at`, `bypass_reason`; write `enforcement_hold_emergency_bypassed` audit with `is_override_event = true` |

---

### 8.7 Mandatory Hold Check API

When an ERP route needs to check whether a mandatory hold exists before permitting a state transition, it calls:

`GET /api/oi/enforcement/erp/:erpEntityType/:erpEntityId/holds?status=open&enforcementLevel=mandatory`

Returns array of open mandatory hold summaries. The calling ERP route returns HTTP 422: `mandatory_hold_open` with `holds` array.

**Phase 2B does NOT modify any existing ERP routes.** This API is provided for future integration only.

---

## 9. API Endpoints (27 endpoints)

### 9.1 Controls (8 endpoints)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 1 | POST | `/api/oi/enforcement/controls` | Manager+ | Create control |
| 2 | GET | `/api/oi/enforcement/controls` | Any | List controls (filter: status, erp_entity_type, control_type, department, sop_id, enforcement_scope) |
| 3 | GET | `/api/oi/enforcement/controls/:controlId` | Any | Control detail |
| 4 | PATCH | `/api/oi/enforcement/controls/:controlId` | Manager+ | Update draft/suspended fields |
| 5 | POST | `/api/oi/enforcement/controls/:controlId/transition` | Role-gated | Activate / suspend / retire |
| 6 | GET | `/api/oi/enforcement/controls/:controlId/audit-log` | Any | Control audit log |
| 7 | GET | `/api/oi/sop/:sopId/enforcement-controls` | Any | All controls linked to a SOP |
| 8 | GET | `/api/oi/enforcement/erp/:erpEntityType/controls` | Any | All active controls for an ERP entity type |

### 9.2 Checklists (4 endpoints)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 9 | POST | `/api/oi/enforcement/controls/:controlId/checklist` | Manager+ | Add checklist item (draft only) |
| 10 | GET | `/api/oi/enforcement/controls/:controlId/checklist` | Any | List checklist items |
| 11 | PATCH | `/api/oi/enforcement/controls/:controlId/checklist/:itemId` | Manager+ | Update checklist item (draft only) |
| 12 | DELETE | `/api/oi/enforcement/controls/:controlId/checklist/:itemId` | Manager+ | Delete checklist item (draft only) |

### 9.3 Holds (13 endpoints)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 13 | POST | `/api/oi/enforcement/holds` | Manager+ | Raise hold |
| 14 | GET | `/api/oi/enforcement/holds` | Any | List holds (filter: status, control_id, erp_entity_type, hold_type, enforcement_level, enforcement_scope) |
| 15 | GET | `/api/oi/enforcement/holds/:holdId` | Any | Hold detail |
| 16 | PATCH | `/api/oi/enforcement/holds/:holdId` | Manager+ | Assign or update `hold_approver_id` (open holds only) |
| 17 | POST | `/api/oi/enforcement/holds/:holdId/approve` | Manager+ | Approve to proceed (mandatory holds only) |
| 18 | POST | `/api/oi/enforcement/holds/:holdId/release` | Manager+ | Release hold (§8.3 pre-conditions) |
| 19 | POST | `/api/oi/enforcement/holds/:holdId/override` | SM+ | Override hold (§8.4 governance) |
| 20 | POST | `/api/oi/enforcement/holds/:holdId/emergency-bypass` | Superuser only | Emergency bypass (§8.5 governance) |
| 21 | GET | `/api/oi/enforcement/holds/:holdId/audit-log` | Any | Hold audit log |
| 22 | GET | `/api/oi/enforcement/erp/:erpEntityType/:erpEntityId/holds` | Any | All holds for a specific ERP entity instance |
| 23 | POST | `/api/oi/enforcement/holds/:holdId/checklist-responses` | Manager+ | Submit checklist responses (batch; immutable after checked) |
| 24 | GET | `/api/oi/enforcement/holds/:holdId/checklist-responses` | Any | Get checklist responses for a hold |

### 9.4 Dashboards (4 endpoints)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 25 | GET | `/api/oi/dashboard/enforcement-summary` | Any | Total controls, active, holds open/released/overridden/emergency_bypassed (emergency_bypass_count mandatory) |
| 26 | GET | `/api/oi/dashboard/enforcement-holds-by-type` | Any | Hold count by `hold_type` and `status` |
| 27 | GET | `/api/oi/dashboard/enforcement-holds-by-department` | Any | Hold count by `department` |

**Note:** `enforcement-sop-coverage` (from v1) is removed; 27 total endpoints.

---

## 10. Enforcement Audit — Mandatory Events

Every enforcement mutation must write to `oi_enforcement_audit_log` via `writeEnforcementAuditLog()`.

| Event | Action | `control_id` | `hold_id` | `is_override_event` | `context` |
|---|---|---|---|---|---|
| Control created | `enforcement_control_created` | populated | null | false | `ENF-{num}` |
| Control field updated | `field_updated` | populated | null | false | `ENF-{num}` |
| Control activated | `enforcement_control_activated` | populated | null | false | `ENF-{num}` |
| Control suspended | `enforcement_control_suspended` | populated | null | false | `ENF-{num} reason=…` |
| Control retired | `enforcement_control_retired` | populated | null | false | `ENF-{num} reason=…` |
| Hold raised | `enforcement_hold_raised` | populated | populated | false | `HLD-{num} on {erpEntityType}:{erpEntityRef}` |
| Hold approved to proceed | `enforcement_hold_approved_to_proceed` | populated | populated | false | `HLD-{num}` |
| Hold released | `enforcement_hold_released` | populated | populated | false | `HLD-{num}` |
| Hold overridden | `enforcement_hold_overridden` | populated | populated | **true** | `HLD-{num} reason=…` |
| Hold emergency bypassed | `enforcement_hold_emergency_bypassed` | populated | populated | **true** | `HLD-{num} EMERGENCY-BYPASS reason=…` |
| Checklist item checked | `enforcement_checklist_item_checked` | populated | populated | false | `HLD-{num} item #{N}` |

---

## 11. Server Files (3 new files)

| File | Description |
|---|---|
| `server/oi-enforcement-audit-service.ts` | `writeEnforcementAuditLog()` — inserts into `oi_enforcement_audit_log`; validates at least one of `controlId`/`holdId` is non-null; sets `is_override_event` for override/bypass actions; never issues UPDATE or DELETE |
| `server/oi-enforcement-routes.ts` | 27 endpoints; imports `writeEnforcementAuditLog` from audit service; all governance checks per this document |
| `server/routes.ts` (patch) | Register `oiEnforcementRouter` after `oiSopRouter` |

**Registration pattern:**
```typescript
const { oiEnforcementRouter } = await import('./oi-enforcement-routes');
app.use('/api/oi', ensureAuthenticated, oiEnforcementRouter);
console.log('OI Enforcement routes registered');
```

---

## 12. Client Files (3 new + 5 patches)

### 12.1 New Client Files

| File | Description |
|---|---|
| `client/src/pages/oi/oi-enforcement-constants.ts` | Status labels, colour maps, control type labels, gate type labels, ERP entity type labels, enforcement level labels, scope labels |
| `client/src/pages/oi/oi-enforcement-register.tsx` | Control register page — filterable table; create control dialog |
| `client/src/pages/oi/oi-enforcement-detail.tsx` | 5-tab control detail page: Overview / Checklist / Holds / SOP Link / Audit Log |

### 12.2 Lazy Loader (`client/src/loaders/oi.ts` patch)

```typescript
export const OiEnforcementRegisterPage = lazy(() => import("../pages/oi/oi-enforcement-register"));
export const OiEnforcementDetailPage   = lazy(() => import("../pages/oi/oi-enforcement-detail"));
```

### 12.3 Router (`client/src/App.tsx` patch)

```tsx
<Route path="/oi/enforcement"            component={OiEnforcementRegisterPage} />
<Route path="/oi/enforcement/:controlId" component={OiEnforcementDetailPage} />
```

### 12.4 Sidebar (`client/src/components/layout.tsx` patch)

Add `ShieldAlert` to lucide imports. Add sidebar entry under the SOP Register entry:
```tsx
{ href: "/oi/enforcement", icon: ShieldAlert, label: "Enforcement Controls" }
```

### 12.5 Integration Patches (4 existing files)

| File | Patch |
|---|---|
| `client/src/pages/oi/oi-dashboard.tsx` | Add `EnforcementDashboardPanels` — renders summary panel (including emergency_bypass_count prominently), holds-by-type panel, holds-by-department panel |
| `client/src/pages/oi/oi-sop-detail.tsx` | Add `EnforcementControlsTab` as 7th tab — linked controls via `GET /api/oi/sop/:sopId/enforcement-controls` |
| `client/src/pages/oi/oi-enforcement-detail.tsx` | Holds tab: `HoldDetailPanel` with checklist responses inline; emergency bypass button visible only when actor is Superuser |
| `client/src/pages/oi/oi-enforcement-register.tsx` | Open hold count badge per control row; emergency_bypassed badge distinguishable from overridden |

---

## 13. `oi-enforcement-constants.ts` Vocabulary

```typescript
CONTROL_STATUS_LABELS: { draft, active, suspended, retired }
CONTROL_TYPE_LABELS: { hold_point, qc_hold, dispatch_hold, procurement_hold, drawing_gate, dvs_gate, fat_block, sat_block, commissioning_block }
ENFORCEMENT_LEVEL_LABELS: { advisory, mandatory }
ENFORCEMENT_SCOPE_LABELS: { global, department, project, equipment_type }
ERP_ENTITY_TYPE_LABELS: { epc_purchase_order, epc_work_order, epc_dispatch_readiness, epc_commissioning_readiness, inspection_execution, epc_drawing_verification, purchase_order, work_order }
HOLD_STATUS_LABELS: { open, approved_to_proceed, released, overridden, emergency_bypassed }
CONTROL_STATUS_COLORS: (badge color map)
HOLD_STATUS_COLORS: { open: 'yellow', approved_to_proceed: 'blue', released: 'green', overridden: 'orange', emergency_bypassed: 'red' }
ENFORCEMENT_LEVEL_COLORS: { advisory: 'blue', mandatory: 'red' }
VALID_CONTROL_TYPES: string[] (array for Zod enum)
VALID_ERP_ENTITY_TYPES: string[] (array for Zod enum)
VALID_ENFORCEMENT_LEVELS: ['advisory', 'mandatory'] as const
VALID_ENFORCEMENT_SCOPES: ['global', 'department', 'project', 'equipment_type'] as const
OI_DEPARTMENTS: (same fixed list as Phase 2A)
```

---

## 14. `oi-enforcement-detail.tsx` Tab Structure (5 tabs)

| Tab | Value | Content |
|---|---|---|
| Overview | `overview` | Control number, SOP link, erp_entity_type, control_type, enforcement_level, enforcement_scope, scope detail (project or equipment_type if set), status, department, process_area, description, rationale, owner, approver, control_checklist_version, timestamps; transition action buttons with role gates |
| Checklist | `checklist` | Ordered list of checklist items; add/edit/delete (draft only); item title, description, is_required badge, evidence_required badge, sort_order; checklist_version shown |
| Holds | `holds` | Table of all holds; hold_number, erp_entity_ref, status, enforcement_level, hold_approver, raised_by, raised_at; action buttons: approve / assign-approver / release / override (SM+) / emergency-bypass (Superuser only); emergency_bypassed rows highlighted red |
| SOP Link | `sop-link` | Linked SOP card: sopNumber, title, status, revision_number, department; link to SOP detail; warning banner if SOP not active or revision not activated |
| Audit Log | `audit-log` | Chronological from `oi_enforcement_audit_log` filtered by `control_id`; `is_override_event = true` rows highlighted distinctly |

---

## 15. Drizzle Schema Additions (`shared/schema.ts`)

The following must be added to `shared/schema.ts` in order:

1. 11 new values added to `oiAuditActionEnum` TypeScript array literal
2. `oiEnforcementControls` table (with `enforcement_scope`, `scope_project_id`, `scope_equipment_type`, `control_checklist_version`)
3. `oiEnforcementChecklists` table
4. `oiEnforcementHolds` table (with `enforcement_scope`, `hold_approver_id`, `bypass_*` columns)
5. `oiEnforcementChecklistResponses` table (with `sop_revision_number`, `checklist_revision_number`)
6. `oiEnforcementAuditLog` table (with `is_override_event`)
7. Insert schemas for all 5 tables (`createInsertSchema(...).omit({ id: true, createdAt: true, updatedAt: true })`)
8. Exported TypeScript types for all 5 tables

---

## 16. DB Migration (psql direct)

**5 tables + 11 enum values + 12 indexes + 1 unique partial index**

### Step 1: Enum additions (each standalone, NOT in transaction)
```sql
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_control_created';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_control_activated';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_control_suspended';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_control_retired';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_hold_raised';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_hold_approved_to_proceed';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_hold_released';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_hold_overridden';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_checklist_item_checked';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_checklist_item_unchecked';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_hold_emergency_bypassed';
```

### Step 2: Create tables (single transaction)
```sql
BEGIN;

CREATE TABLE oi_enforcement_controls (
  id                       SERIAL PRIMARY KEY,
  control_number           VARCHAR(30) NOT NULL UNIQUE,
  sop_id                   INTEGER NOT NULL REFERENCES oi_sop_records(id) ON DELETE RESTRICT,
  sop_revision_number      INTEGER NOT NULL,
  erp_entity_type          VARCHAR(50) NOT NULL,
  control_type             VARCHAR(30) NOT NULL,
  enforcement_level        VARCHAR(20) NOT NULL DEFAULT 'advisory',
  enforcement_scope        VARCHAR(30) NOT NULL DEFAULT 'global',
  scope_project_id         INTEGER REFERENCES projects(id) ON DELETE RESTRICT,
  scope_equipment_type     VARCHAR(100),
  title                    TEXT NOT NULL,
  description              TEXT NOT NULL,
  rationale                TEXT NOT NULL,
  department               VARCHAR(100) NOT NULL,
  process_area             VARCHAR(255),
  control_checklist_version INTEGER NOT NULL DEFAULT 0,
  status                   VARCHAR(20) NOT NULL DEFAULT 'draft',
  owner_id                 INTEGER NOT NULL REFERENCES users(id),
  approver_id              INTEGER NOT NULL REFERENCES users(id),
  approved_by              INTEGER REFERENCES users(id),
  approved_at              TIMESTAMP,
  suspended_by             INTEGER REFERENCES users(id),
  suspended_at             TIMESTAMP,
  suspension_reason        TEXT,
  retired_by               INTEGER REFERENCES users(id),
  retired_at               TIMESTAMP,
  retirement_reason        TEXT,
  created_by               INTEGER NOT NULL REFERENCES users(id),
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE oi_enforcement_checklists (
  id                SERIAL PRIMARY KEY,
  control_id        INTEGER NOT NULL REFERENCES oi_enforcement_controls(id) ON DELETE CASCADE,
  item_number       INTEGER NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  is_required       BOOLEAN NOT NULL DEFAULT TRUE,
  evidence_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE oi_enforcement_holds (
  id                        SERIAL PRIMARY KEY,
  hold_number               VARCHAR(30) NOT NULL UNIQUE,
  control_id                INTEGER NOT NULL REFERENCES oi_enforcement_controls(id) ON DELETE RESTRICT,
  erp_entity_type           VARCHAR(50) NOT NULL,
  erp_entity_id             INTEGER NOT NULL,
  erp_entity_ref            VARCHAR(100),
  enforcement_level         VARCHAR(20) NOT NULL,
  hold_type                 VARCHAR(30) NOT NULL,
  enforcement_scope         VARCHAR(30) NOT NULL,
  reason                    TEXT NOT NULL,
  status                    VARCHAR(30) NOT NULL DEFAULT 'open',
  hold_approver_id          INTEGER REFERENCES users(id),
  raised_by                 INTEGER NOT NULL REFERENCES users(id),
  raised_at                 TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_to_proceed_by    INTEGER REFERENCES users(id),
  approved_to_proceed_at    TIMESTAMP,
  approved_to_proceed_note  TEXT,
  released_by               INTEGER REFERENCES users(id),
  released_at               TIMESTAMP,
  release_note              TEXT,
  override_by               INTEGER REFERENCES users(id),
  override_at               TIMESTAMP,
  override_reason           TEXT,
  bypass_by                 INTEGER REFERENCES users(id),
  bypass_at                 TIMESTAMP,
  bypass_reason             TEXT,
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE oi_enforcement_checklist_responses (
  id                      SERIAL PRIMARY KEY,
  hold_id                 INTEGER NOT NULL REFERENCES oi_enforcement_holds(id) ON DELETE CASCADE,
  checklist_item_id       INTEGER NOT NULL REFERENCES oi_enforcement_checklists(id) ON DELETE RESTRICT,
  sop_revision_number     INTEGER NOT NULL,
  checklist_revision_number INTEGER NOT NULL,
  is_checked              BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_note           TEXT,
  responded_by            INTEGER REFERENCES users(id),
  responded_at            TIMESTAMP,
  created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (hold_id, checklist_item_id)
);

CREATE TABLE oi_enforcement_audit_log (
  id               SERIAL PRIMARY KEY,
  control_id       INTEGER REFERENCES oi_enforcement_controls(id) ON DELETE SET NULL,
  hold_id          INTEGER REFERENCES oi_enforcement_holds(id) ON DELETE SET NULL,
  action           oi_audit_action NOT NULL,
  actor_id         INTEGER NOT NULL REFERENCES users(id),
  actor_name       TEXT NOT NULL,
  actor_role       TEXT NOT NULL,
  field_name       TEXT,
  old_value        TEXT,
  new_value        TEXT,
  context          TEXT,
  ip_address       TEXT,
  is_override_event BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMIT;
```

### Step 3: Indexes
```sql
CREATE INDEX idx_oi_enforcement_controls_sop_id ON oi_enforcement_controls(sop_id);
CREATE INDEX idx_oi_enforcement_controls_erp_type ON oi_enforcement_controls(erp_entity_type);
CREATE INDEX idx_oi_enforcement_controls_status ON oi_enforcement_controls(status);
CREATE INDEX idx_oi_enforcement_controls_department ON oi_enforcement_controls(department);
CREATE INDEX idx_oi_enforcement_controls_scope_project ON oi_enforcement_controls(scope_project_id) WHERE scope_project_id IS NOT NULL;
CREATE INDEX idx_oi_enforcement_checklists_control_id ON oi_enforcement_checklists(control_id);
CREATE INDEX idx_oi_enforcement_holds_control_id ON oi_enforcement_holds(control_id);
CREATE INDEX idx_oi_enforcement_holds_erp_entity ON oi_enforcement_holds(erp_entity_type, erp_entity_id);
CREATE INDEX idx_oi_enforcement_holds_status ON oi_enforcement_holds(status);
CREATE INDEX idx_oi_enforcement_checklist_resp_hold_id ON oi_enforcement_checklist_responses(hold_id);
CREATE INDEX idx_oi_enforcement_audit_control_id ON oi_enforcement_audit_log(control_id);
CREATE INDEX idx_oi_enforcement_audit_hold_id ON oi_enforcement_audit_log(hold_id);
CREATE INDEX idx_oi_enforcement_audit_override ON oi_enforcement_audit_log(is_override_event) WHERE is_override_event = TRUE;

CREATE UNIQUE INDEX idx_oi_enforcement_holds_no_duplicate_open
  ON oi_enforcement_holds(control_id, erp_entity_type, erp_entity_id)
  WHERE status = 'open';
```

---

## 17. Mandatory Corrections — Consolidated (Phase 2A + Phase 2B revisions)

| # | Rule | Enforcement Point |
|---|---|---|
| C1 | `oi_audit_log` is NOT used for enforcement audit. Use `oi_enforcement_audit_log` only via `writeEnforcementAuditLog()`. | `writeEnforcementAuditLog()` must never import `oiAuditLog` |
| C2 | `approver_id ≠ owner_id` — enforced at create, update, and activation (3 points). | HTTP 422: `approver_must_differ_from_owner` |
| C3 | All 4 activation pre-conditions checked at activation time (SOP active, SOP revision activated, owner assigned, erp_entity_type assigned). | HTTP 422 with specific error code per condition (§6.2) |
| C4 | Duplicate active control check runs inside advisory lock at activation. HTTP 409 with conflicting control number. | Application-layer check; advisory lock prevents race |
| C5 | Hold raising checks scope compatibility before inserting. HTTP 422: `entity_out_of_scope`. | Server-side scope check against control's `enforcement_scope` |
| C6 | Hold raising verifies ERP entity exists. HTTP 404: `erp_entity_not_found`. | Server-side query of target ERP table |
| C7 | Checklist injection at hold-raise time snapshots `sop_revision_number` and `checklist_revision_number`. Both are server-populated; not accepted from client. | Server sets both fields in hold-raise transaction |
| C8 | Checklist responses are immutable after `is_checked = true`. HTTP 422: `response_immutable_after_submission`. | No UPDATE path for checked responses |
| C9 | `hold_approver_id` must be non-null before release. HTTP 422: `hold_approver_not_assigned`. | Server checks before `released` transition |
| C10 | Hold override is SM+ only. HTTP 403 if actor is not SM+. | Role check before override logic |
| C11 | Emergency bypass is Superuser only. HTTP 403 if actor is not Superuser. SM+ is explicitly forbidden. | `SUPERUSER_ROLES` check only |
| C12 | Override and emergency bypass audit events set `is_override_event = true`. | `writeEnforcementAuditLog()` receives explicit flag |
| C13 | `oi_enforcement_audit_log` rows: no DELETE, no UPDATE, ever. | No delete/update route exists; `writeEnforcementAuditLog()` is INSERT only |
| C14 | Emergency bypass count visible in enforcement summary dashboard. `emergency_bypass_count` is a mandatory field in the response. | Dashboard query includes `WHERE status = 'emergency_bypassed'` count |
| C15 | No AI, no auto-enforcement, no ERP state mutation, no auto-hold raising, no auto-generated checklists in Phase 2B code. | Per Future-Phase Leakage Guard section |

---

## 18. Existing Infrastructure Not Modified

| Item | Change |
|---|---|
| `oi_audit_log` | None |
| `oi_sop_audit_log` | None |
| `writeAuditLog()` | None — not used in Phase 2B |
| `writeSopAuditLog()` | None — not used in Phase 2B |
| All existing ERP routes | None — Phase 2B does not modify ERP state machines |
| `oi_audit_action` enum | Additive only (11 new values) |
| Any Phase 1A–2A client pages | Only `oi-dashboard.tsx` and `oi-sop-detail.tsx` patched (additive only) |

---

*Prepared by: Architecture review session — 2026-05-22 (Revision 2)*  
*STOP — awaiting approval before implementation.*
