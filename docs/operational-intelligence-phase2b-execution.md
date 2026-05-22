# Operational Intelligence — Phase 2B Execution Plan

**Status:** SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT  
**Date:** 2026-05-22  
**Phase 2A Baseline:** `docs/operational-intelligence-phase2a-execution.md` (COMPLETE)  
**Amendment 001:** `docs/phase2a-amendment-001-sop-audit-governance.md` (APPROVED)  
**Phase 2B Scope:** ERP Enforcement Framework — SOP-to-ERP Control Mapping, Workflow Gate Definitions, Checklist Injection, Mandatory Evidence Rules, Hold Points, Dispatch Holds, QC Holds, Drawing/DVS Gates, Procurement Holds, FAT/SAT/Commissioning Blocks, Enforcement Approval Workflow, Enforcement Audit Logs, Enforcement Dashboards  
**Prepared by:** Architecture review session

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

## Phase 2B Scope

### In Scope

| Area | Detail |
|---|---|
| Enforcement Control Master | Control definition: SOP → ERP entity type mapping, control type, enforcement level, checklist, ownership |
| Control Numbering | Server-assigned format `ENF-{YYYY}-{NNN}` |
| Control Workflow | Four-state lifecycle: `draft → active → suspended → retired` |
| SOP-to-ERP Control Mapping | Each control links exactly one active SOP to one ERP entity type and one control/gate type |
| Checklist Injection | Ordered checklist items per control; injected as required steps when a hold is raised |
| Workflow Gate Definitions | 9 gate types covering the full ERP workflow chain: hold_point, qc_hold, dispatch_hold, procurement_hold, drawing_gate, dvs_gate, fat_block, sat_block, commissioning_block |
| Enforcement Level | `advisory` (informational, can proceed) or `mandatory` (hold blocks until released or overridden) |
| Hold Records | Per-entity-instance hold: raised against a specific EPC PO / WO / DR / CR / inspection record by ID |
| Hold Number | Server-assigned format `HLD-{YYYY}-{NNN}` |
| Hold Lifecycle | Four states: `open → approved_to_proceed → released → overridden` |
| Hold Approval | Manager+ approves to proceed after checklist review; SM+ can override with mandatory reason |
| Hold Release | Manager+ releases the hold after the blocking condition is resolved |
| Checklist Responses | Per-hold completion of injected checklist items; `evidence_note` required when item has `evidence_required = true` |
| Enforcement Approval Workflow | Control activation requires SM+ approval; transition audit mandatory |
| Enforcement Audit Logs | Dedicated `oi_enforcement_audit_log` table; `writeEnforcementAuditLog()` for all enforcement mutations |
| Enforcement Dashboards | 4 dashboard panels: summary, holds by type, holds by department, SOP coverage |
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

**Important:** The `epc_entity_type` enum is stored in `oi_enforcement_controls.erp_entity_type` and `oi_enforcement_holds.erp_entity_type`. The value identifies which DB table the `erp_entity_id` FK refers to. Foreign keys across tables are enforced at the application layer only (no cross-table DB FK constraint is possible for polymorphic references).

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
- `mandatory`: Hold is raised and recorded. The ERP entity's state-change route must check for open mandatory holds before permitting the transition. If an open mandatory hold exists → HTTP 422 with `hold_open` error code. (See Section 7 for the checking API.)

---

## 3. New Tables (5 tables)

### 3.1 `oi_enforcement_controls`

The master control definition record. One row per control. Controls the mapping from a SOP to an ERP entity type via a specific gate type.

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `control_number` | varchar(30) | NOT NULL | UNIQUE | Server-assigned `ENF-{YYYY}-{NNN}` |
| `sop_id` | integer | NOT NULL | FK → oi_sop_records.id ON DELETE RESTRICT | The governing SOP |
| `sop_revision_number` | integer | NOT NULL | — | The SOP revision at time of control creation (snapshot) |
| `erp_entity_type` | varchar(50) | NOT NULL | — | One of the 8 enum values in Section 1 |
| `control_type` | varchar(30) | NOT NULL | — | One of the 9 gate types in Section 2 |
| `enforcement_level` | varchar(20) | NOT NULL | DEFAULT `advisory` | `advisory` or `mandatory` |
| `title` | text | NOT NULL | min 5 chars | Control display name |
| `description` | text | NOT NULL | min 10 chars | What this control enforces |
| `rationale` | text | NOT NULL | min 10 chars | Why this control exists |
| `department` | varchar(100) | NOT NULL | — | Owning department (fixed list) |
| `process_area` | varchar(255) | NULL | — | Free-text process area |
| `status` | varchar(20) | NOT NULL | DEFAULT `draft` | `draft`, `active`, `suspended`, `retired` |
| `owner_id` | integer | NOT NULL | FK → users.id | Manager+ |
| `approver_id` | integer | NOT NULL | FK → users.id | SM+; must ≠ owner_id |
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

**Business rules:**
- `owner_id ≠ approver_id` — enforced at create, update, and activation. HTTP 422: `approver_must_differ_from_owner`.
- `sop_id` must reference an `active` SOP at the time of control creation. HTTP 422: `sop_not_active`.
- `control_number` is server-assigned using advisory lock: `pg_advisory_xact_lock(hashtext('enforcement_control_number_seq'))`.
- `sop_revision_number` is snapshot-copied from `oi_sop_records.revision_number` at creation time. It is NOT updated if the SOP is later revised. The control remains bound to the creating revision for traceability. If the SOP is revised, Manager+ must review and update the control manually.
- A retired SOP's controls must be reviewed. Retiring a SOP does not auto-retire its controls. The system shows a warning banner on the control if the linked SOP is retired.

---

### 3.2 `oi_enforcement_checklists`

Ordered checklist items belonging to a control. These items are injected when a hold is raised against an ERP entity, creating corresponding `oi_enforcement_checklist_responses` rows.

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
- Checklist items can only be added, edited, or deleted when the control is in `draft` status. Modifying a checklist on an `active` control is not permitted. HTTP 422: `control_not_draft`.
- `item_number` is auto-assigned: `MAX(item_number) + 1` within the control on insert.
- If `evidence_required = true` then `is_required` is implicitly `true` — the server forces `is_required = true` if `evidence_required = true` is submitted.

---

### 3.3 `oi_enforcement_holds`

Per-instance hold record raised against a specific ERP entity record by its numeric ID. One hold record per (control, erp_entity_type, erp_entity_id) combination. A control cannot have two open holds for the same ERP entity instance.

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `hold_number` | varchar(30) | NOT NULL | UNIQUE | Server-assigned `HLD-{YYYY}-{NNN}` |
| `control_id` | integer | NOT NULL | FK → oi_enforcement_controls.id ON DELETE RESTRICT | The parent control |
| `erp_entity_type` | varchar(50) | NOT NULL | — | Must match `control.erp_entity_type` |
| `erp_entity_id` | integer | NOT NULL | — | Polymorphic ID into the target ERP table |
| `erp_entity_ref` | varchar(100) | NULL | — | Denormalized display reference (PO number, WO number, etc.) — copied at hold-raise time |
| `enforcement_level` | varchar(20) | NOT NULL | — | Copied from control at raise time (snapshot) |
| `hold_type` | varchar(30) | NOT NULL | — | Copied from `control.control_type` at raise time |
| `reason` | text | NOT NULL | min 10 chars | Why this hold is being raised on this entity |
| `status` | varchar(30) | NOT NULL | DEFAULT `open` | `open`, `approved_to_proceed`, `released`, `overridden` |
| `raised_by` | integer | NOT NULL | FK → users.id | Manager+ who raised the hold |
| `raised_at` | timestamp | NOT NULL | DEFAULT NOW() | |
| `approved_to_proceed_by` | integer | NULL | FK → users.id | Manager+ |
| `approved_to_proceed_at` | timestamp | NULL | — | |
| `approved_to_proceed_note` | text | NULL | — | Required on approval (min 10 chars) |
| `released_by` | integer | NULL | FK → users.id | Manager+ |
| `released_at` | timestamp | NULL | — | |
| `release_note` | text | NULL | — | Required on release (min 10 chars) |
| `override_by` | integer | NULL | FK → users.id | SM+ only |
| `override_at` | timestamp | NULL | — | |
| `override_reason` | text | NULL | — | Required on override (min 20 chars — higher minimum for override) |
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
- `erp_entity_ref` is populated by the server at raise time: server queries the target ERP table and extracts the display number (e.g. `po_number`, `wo_number`, `dr_number`, `cr_number`, `inspection_number`). If the ERP entity is not found → HTTP 404: `erp_entity_not_found`.
- `enforcement_level` and `hold_type` are snapshot-copied from the control at raise time. Later changes to the control do not retroactively change open holds.
- On hold raise, server inserts one `oi_enforcement_checklist_responses` row per `oi_enforcement_checklists` item belonging to the control (with `is_checked = false`).
- `approved_to_proceed` transition: only permitted for `mandatory` holds. Advisory holds cannot be `approved_to_proceed` — they can only be `released` or `overridden`. HTTP 422: `advisory_hold_cannot_approve_to_proceed`.
- `released` transition: permitted from `open` or `approved_to_proceed`. All `is_required = true` checklist items that have `evidence_required = true` must have a non-empty `evidence_note` in their response before release. HTTP 422: `checklist_evidence_incomplete` with list of incomplete item IDs.
- `overridden` transition: SM+ only. Permitted from `open` or `approved_to_proceed`. `override_reason` minimum 20 chars. HTTP 403 if actor is not SM+. No checklist completion gate for override (override is the escape valve).
- Status terminal states: `released` and `overridden` are terminal — no further transitions.

---

### 3.4 `oi_enforcement_checklist_responses`

Per-hold completion state of each injected checklist item. Rows are created automatically when a hold is raised (one row per checklist item, `is_checked = false`). Updated by Manager+ users as they work through the checklist.

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `hold_id` | integer | NOT NULL | FK → oi_enforcement_holds.id ON DELETE CASCADE | |
| `checklist_item_id` | integer | NOT NULL | FK → oi_enforcement_checklists.id ON DELETE RESTRICT | |
| `is_checked` | boolean | NOT NULL | DEFAULT false | |
| `evidence_note` | text | NULL | — | Required (non-empty) when parent item has `evidence_required = true` |
| `responded_by` | integer | NULL | FK → users.id | Set when `is_checked` changes to true |
| `responded_at` | timestamp | NULL | — | Set when `is_checked` changes to true |
| `created_at` | timestamp | NOT NULL | DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL | DEFAULT NOW() | |

**Index:**
- `idx_oi_enforcement_checklist_resp_hold_id` ON `hold_id`

**Unique constraint:** `UNIQUE (hold_id, checklist_item_id)` — one response per item per hold.

**Business rules:**
- Checklist responses can only be updated when the parent hold is in `open` or `approved_to_proceed` status. HTTP 422: `hold_not_open`.
- When `is_checked` is set to `true`, `responded_by` and `responded_at` are set by the server. They are NOT accepted from client.
- When `is_checked` is reset to `false`, `responded_by`, `responded_at`, and `evidence_note` are cleared by the server.
- Unchecking is permitted for Manager+ while the hold is open — there is no one-way ratchet on checklist items.

---

### 3.5 `oi_enforcement_audit_log`

Dedicated enforcement audit table. Follows the Amendment 001 pattern — separate from `oi_audit_log` (which has `issue_id NOT NULL` and cannot receive non-issue-subordinate audit entries).

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `control_id` | integer | NULL | FK → oi_enforcement_controls.id ON DELETE SET NULL | Populated for control-level events; null for hold-only events |
| `hold_id` | integer | NULL | FK → oi_enforcement_holds.id ON DELETE SET NULL | Populated for hold-level events; null for control-only events |
| `action` | oi_audit_action | NOT NULL | — | Uses the shared enum (10 new values added in Phase 2B — see Section 4) |
| `actor_id` | integer | NOT NULL | FK → users.id | |
| `actor_name` | text | NOT NULL | — | Denormalized |
| `actor_role` | text | NOT NULL | — | Denormalized |
| `field_name` | text | NULL | — | For `field_updated` events |
| `old_value` | text | NULL | — | |
| `new_value` | text | NULL | — | |
| `context` | text | NULL | — | E.g. `"ENF-2026-001 → HLD-2026-007"` |
| `ip_address` | text | NULL | — | |
| `created_at` | timestamp | NOT NULL | DEFAULT NOW() | |

**Index:**
- `idx_oi_enforcement_audit_control_id` ON `control_id`
- `idx_oi_enforcement_audit_hold_id` ON `hold_id`

**Note:** `control_id` and `hold_id` are both nullable. At least one must be non-null per record. Enforced at the application layer in `writeEnforcementAuditLog()`.

---

## 4. Enum Additions — `oi_audit_action`

**10 new values** added to the existing `oi_audit_action` Postgres enum (Phase 2B).

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
```

Each statement is executed standalone, not in a transaction block.

---

## 5. Control Workflow

### 5.1 State Machine

```
draft ──activate──► active ──suspend──► suspended ──re-activate──► active
                         └──retire──► retired
                    suspended ──retire──► retired
```

| From | To | Action | Required Role | Pre-conditions | Side Effects |
|---|---|---|---|---|---|
| `draft` | `active` | `activate` | SM+ (must be the control's `approver_id` or Superuser) | `sop_id` references an `active` SOP; `approver_id` ≠ `owner_id`; control has title, description, rationale, department | Set `approved_by`, `approved_at`; write `enforcement_control_activated` audit |
| `active` | `suspended` | `suspend` | SM+ | `suspension_reason` min 10 chars | Set `suspended_by`, `suspended_at`, `suspension_reason`; write `enforcement_control_suspended` audit |
| `suspended` | `active` | `activate` | SM+ (must be the `approver_id` or Superuser) | SOP still active | Clear suspension fields; set `approved_by`, `approved_at` (re-stamped); write `enforcement_control_activated` audit |
| `active` | `retired` | `retire` | SM+ | `retirement_reason` min 10 chars; no open mandatory holds referencing this control (HTTP 422: `open_mandatory_holds_exist` with count) | Set `retired_by`, `retired_at`, `retirement_reason`; write `enforcement_control_retired` audit |
| `suspended` | `retired` | `retire` | SM+ | `retirement_reason` min 10 chars | Set `retired_by`, `retired_at`, `retirement_reason`; write `enforcement_control_retired` audit |

**Advisory holds do not block retirement.** Only open `mandatory` enforcement_level holds block a control from being retired.

---

### 5.2 Control Field Update Rules

`PATCH /api/oi/enforcement/controls/:controlId` is only permitted when control is in `draft` or `suspended` status.

| Field | Editable in `active`? | Notes |
|---|---|---|
| `title` | No | Edit requires draft or suspended |
| `description` | No | |
| `rationale` | No | |
| `enforcement_level` | No | Changing level after activation requires retire + new control |
| `department` | No | |
| `process_area` | Yes | Process area can be updated in any non-retired status |
| `owner_id` | No | |
| `approver_id` | No | |

HTTP 422: `control_not_editable` when editing a non-editable field on an active control.

---

## 6. Hold Lifecycle

### 6.1 State Machine

```
(raise)
  │
  ▼
open ──approve_to_proceed──► approved_to_proceed
  │                                │
  └──release──────────────────────► released  (terminal)
  │
  └──override──────────────────────► overridden  (terminal)
                                     (SM+ only)
```

| From | To | Action | Required Role | Pre-conditions | Side Effects |
|---|---|---|---|---|---|
| — | `open` | raise | Manager+ | Control is `active`; `erp_entity_type` matches control; ERP entity exists (server queries target table); no existing open hold for same (control, erp_entity_type, erp_entity_id) — HTTP 409: `hold_already_open` | Insert hold; insert checklist response rows; set `erp_entity_ref` from ERP record; write `enforcement_hold_raised` audit |
| `open` | `approved_to_proceed` | approve | Manager+ | `enforcement_level = 'mandatory'`; `approved_to_proceed_note` min 10 chars | Set `approved_to_proceed_by`, `approved_to_proceed_at`, `approved_to_proceed_note`; write `enforcement_hold_approved_to_proceed` audit |
| `open` or `approved_to_proceed` | `released` | release | Manager+ | All `is_required = true` checklist items with `evidence_required = true` must have non-empty `evidence_note`; `release_note` min 10 chars | Set `released_by`, `released_at`, `release_note`; write `enforcement_hold_released` audit |
| `open` or `approved_to_proceed` | `overridden` | override | SM+ only | `override_reason` min 20 chars | Set `override_by`, `override_at`, `override_reason`; write `enforcement_hold_overridden` audit |

---

### 6.2 Mandatory Hold Check API

When an ERP route needs to check whether a mandatory hold exists before permitting a state transition, it calls:

`GET /api/oi/enforcement/erp/:erpEntityType/:erpEntityId/holds?status=open&enforcementLevel=mandatory`

Returns array of open mandatory hold summaries. The calling ERP route is responsible for returning HTTP 422: `mandatory_hold_open` with `holds` array in the response body.

**Phase 2B does NOT modify any existing ERP routes.** The hold check API is provided for ERP routes to use in future phases or at the discretion of the engineering team. Phase 2B only builds the enforcement framework — it does not wire it into existing ERP state machines. That integration is a separate future decision.

---

## 7. API Endpoints (26 endpoints)

### 7.1 Controls (8 endpoints)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 1 | POST | `/api/oi/enforcement/controls` | Manager+ | Create control |
| 2 | GET | `/api/oi/enforcement/controls` | Any | List controls (filter: status, erp_entity_type, control_type, department, sop_id) |
| 3 | GET | `/api/oi/enforcement/controls/:controlId` | Any | Control detail |
| 4 | PATCH | `/api/oi/enforcement/controls/:controlId` | Manager+ | Update draft/suspended fields |
| 5 | POST | `/api/oi/enforcement/controls/:controlId/transition` | Role-gated | Activate / suspend / retire |
| 6 | GET | `/api/oi/enforcement/controls/:controlId/audit-log` | Any | Control audit log |
| 7 | GET | `/api/oi/sop/:sopId/enforcement-controls` | Any | All controls linked to a SOP |
| 8 | GET | `/api/oi/enforcement/erp/:erpEntityType/controls` | Any | All active controls for an ERP entity type |

### 7.2 Checklists (4 endpoints)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 9 | POST | `/api/oi/enforcement/controls/:controlId/checklist` | Manager+ | Add checklist item (draft only) |
| 10 | GET | `/api/oi/enforcement/controls/:controlId/checklist` | Any | List checklist items |
| 11 | PATCH | `/api/oi/enforcement/controls/:controlId/checklist/:itemId` | Manager+ | Update checklist item (draft only) |
| 12 | DELETE | `/api/oi/enforcement/controls/:controlId/checklist/:itemId` | Manager+ | Delete checklist item (draft only) |

### 7.3 Holds (12 endpoints)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 13 | POST | `/api/oi/enforcement/holds` | Manager+ | Raise hold |
| 14 | GET | `/api/oi/enforcement/holds` | Any | List holds (filter: status, control_id, erp_entity_type, hold_type, enforcement_level) |
| 15 | GET | `/api/oi/enforcement/holds/:holdId` | Any | Hold detail |
| 16 | POST | `/api/oi/enforcement/holds/:holdId/approve` | Manager+ | Approve to proceed (mandatory holds only) |
| 17 | POST | `/api/oi/enforcement/holds/:holdId/release` | Manager+ | Release hold |
| 18 | POST | `/api/oi/enforcement/holds/:holdId/override` | SM+ | Override hold (with mandatory reason) |
| 19 | GET | `/api/oi/enforcement/holds/:holdId/audit-log` | Any | Hold audit log |
| 20 | GET | `/api/oi/enforcement/erp/:erpEntityType/:erpEntityId/holds` | Any | All holds for a specific ERP entity instance |
| 21 | POST | `/api/oi/enforcement/holds/:holdId/checklist-responses` | Manager+ | Submit / update checklist responses (batch) |
| 22 | GET | `/api/oi/enforcement/holds/:holdId/checklist-responses` | Any | Get checklist responses for a hold |

### 7.4 Dashboards (4 endpoints)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 23 | GET | `/api/oi/dashboard/enforcement-summary` | Any | Total controls, active, holds open, holds released, holds overridden |
| 24 | GET | `/api/oi/dashboard/enforcement-holds-by-type` | Any | Hold count by `hold_type` and `status` |
| 25 | GET | `/api/oi/dashboard/enforcement-holds-by-department` | Any | Hold count by `department` |
| 26 | GET | `/api/oi/dashboard/enforcement-sop-coverage` | Any | Count of active controls per SOP; SOPs with no controls |

---

## 8. Enforcement Audit — Mandatory Events

Every enforcement mutation must write to `oi_enforcement_audit_log` via `writeEnforcementAuditLog()` in `server/oi-enforcement-audit-service.ts`.

| Event | Action | `control_id` | `hold_id` | `fieldName` | `context` |
|---|---|---|---|---|---|
| Control created | `enforcement_control_created` | populated | null | null | `ENF-{num}` |
| Control field updated | `field_updated` | populated | null | changed field | `ENF-{num}` |
| Control activated | `enforcement_control_activated` | populated | null | `status` | `ENF-{num}` |
| Control suspended | `enforcement_control_suspended` | populated | null | `status` | `ENF-{num} reason=…` |
| Control retired | `enforcement_control_retired` | populated | null | `status` | `ENF-{num} reason=…` |
| Hold raised | `enforcement_hold_raised` | populated | populated | null | `HLD-{num} on {erpEntityType}:{erpEntityRef}` |
| Hold approved to proceed | `enforcement_hold_approved_to_proceed` | populated | populated | `status` | `HLD-{num}` |
| Hold released | `enforcement_hold_released` | populated | populated | `status` | `HLD-{num}` |
| Hold overridden | `enforcement_hold_overridden` | populated | populated | `status` | `HLD-{num} reason=…` |
| Checklist item checked | `enforcement_checklist_item_checked` | populated | populated | `checklist_item_id` | `HLD-{num} item #{N}` |
| Checklist item unchecked | `enforcement_checklist_item_unchecked` | populated | populated | `checklist_item_id` | `HLD-{num} item #{N}` |

---

## 9. Server Files (3 new files)

| File | Description |
|---|---|
| `server/oi-enforcement-audit-service.ts` | `writeEnforcementAuditLog()` — inserts into `oi_enforcement_audit_log`; validates at least one of `controlId` / `holdId` is non-null |
| `server/oi-enforcement-routes.ts` | 26 endpoints; imports `writeEnforcementAuditLog` from audit service |
| `server/routes.ts` (patch) | Register `oiEnforcementRouter` after `oiSopRouter` with same `ensureAuthenticated` middleware |

**Registration pattern** (in `server/routes.ts`, immediately after SOP router):
```typescript
const { oiEnforcementRouter } = await import('./oi-enforcement-routes');
app.use('/api/oi', ensureAuthenticated, oiEnforcementRouter);
console.log('OI Enforcement routes registered');
```

---

## 10. Client Files (3 new + 5 patches)

### 10.1 New Client Files

| File | Description |
|---|---|
| `client/src/pages/oi/oi-enforcement-constants.ts` | Status labels, colour maps, control type labels, gate type labels, ERP entity type labels, enforcement level labels |
| `client/src/pages/oi/oi-enforcement-register.tsx` | Control register page — filterable table with status, erp_entity_type, control_type, department filters; create control dialog |
| `client/src/pages/oi/oi-enforcement-detail.tsx` | 5-tab control detail page: Overview / Checklist / Holds / SOP Link / Audit Log |

### 10.2 Lazy Loader (`client/src/loaders/oi.ts` patch)

Add:
```typescript
export const OiEnforcementRegisterPage = lazy(() => import("../pages/oi/oi-enforcement-register"));
export const OiEnforcementDetailPage   = lazy(() => import("../pages/oi/oi-enforcement-detail"));
```

### 10.3 Router (`client/src/App.tsx` patch)

Add inside the authenticated route section:
```tsx
<Route path="/oi/enforcement"        component={OiEnforcementRegisterPage} />
<Route path="/oi/enforcement/:controlId" component={OiEnforcementDetailPage} />
```

### 10.4 Sidebar (`client/src/components/layout.tsx` patch)

Add `ShieldAlert` to lucide imports. Add sidebar entry under the SOP Register entry:
```tsx
{ href: "/oi/enforcement", icon: ShieldAlert, label: "Enforcement Controls" }
```

### 10.5 Integration Patches (4 existing files)

| File | Patch |
|---|---|
| `client/src/pages/oi/oi-dashboard.tsx` | Add `EnforcementDashboardPanels` component (fetches 4 enforcement dashboard endpoints); render after `SopDashboardPanels` |
| `client/src/pages/oi/oi-sop-detail.tsx` | Add `EnforcementControlsTab` as 7th tab — shows linked controls via `GET /api/oi/sop/:sopId/enforcement-controls` |
| `client/src/pages/oi/oi-enforcement-detail.tsx` | Holds tab shows the `HoldDetailPanel` with checklist responses inline |
| `client/src/pages/oi/oi-enforcement-register.tsx` | Register page shows open hold count badge per control row |

---

## 11. `oi-enforcement-constants.ts` Vocabulary

```typescript
CONTROL_STATUS_LABELS: { draft, active, suspended, retired }
CONTROL_TYPE_LABELS: { hold_point, qc_hold, dispatch_hold, procurement_hold, drawing_gate, dvs_gate, fat_block, sat_block, commissioning_block }
ENFORCEMENT_LEVEL_LABELS: { advisory, mandatory }
ERP_ENTITY_TYPE_LABELS: { epc_purchase_order, epc_work_order, epc_dispatch_readiness, epc_commissioning_readiness, inspection_execution, epc_drawing_verification, purchase_order, work_order }
HOLD_STATUS_LABELS: { open, approved_to_proceed, released, overridden }
CONTROL_STATUS_COLORS: (badge color map for status values)
HOLD_STATUS_COLORS: (badge color map for hold status values)
ENFORCEMENT_LEVEL_COLORS: { advisory: 'blue', mandatory: 'red' }
VALID_CONTROL_TYPES: string[] (array for Zod enum)
VALID_ERP_ENTITY_TYPES: string[] (array for Zod enum)
VALID_ENFORCEMENT_LEVELS: ['advisory', 'mandatory'] as const
OI_DEPARTMENTS: (same fixed list as Phase 2A)
```

---

## 12. `oi-enforcement-detail.tsx` Tab Structure (5 tabs)

| Tab | Value | Content |
|---|---|---|
| Overview | `overview` | Control number, SOP link (sopNumber + title), erp_entity_type, control_type, enforcement_level, status, department, process_area, description, rationale, owner, approver, timestamps; transition action buttons (activate / suspend / retire) with role gates |
| Checklist | `checklist` | Ordered list of checklist items; add/edit/delete (draft only); item title, description, is_required badge, evidence_required badge, sort_order |
| Holds | `holds` | Table of all holds raised against this control; each row shows hold_number, erp_entity_ref, status, enforcement_level, raised_by, raised_at, open hold actions (approve / release / override); click-through to inline hold detail panel |
| SOP Link | `sop-link` | Linked SOP card: sopNumber, title, status, revision_number, department; link to SOP detail page; warning banner if SOP status is not `active` |
| Audit Log | `audit-log` | Chronological list from `oi_enforcement_audit_log` filtered by `control_id`; shows action, actor, context, fieldName, oldValue/newValue, timestamp |

---

## 13. Drizzle Schema Additions (`shared/schema.ts`)

The following must be added to `shared/schema.ts` in order:

1. New enum values in the `oiAuditActionEnum` array (10 values — same as listed in Section 4 but added to the TypeScript array literal for Drizzle type safety)
2. `oiEnforcementControls` table definition
3. `oiEnforcementChecklists` table definition
4. `oiEnforcementHolds` table definition
5. `oiEnforcementChecklistResponses` table definition
6. `oiEnforcementAuditLog` table definition
7. Insert schemas (using `createInsertSchema(...).omit({ id: true, createdAt: true, updatedAt: true })`) for all 5 tables
8. Exported TypeScript types for all 5 tables

---

## 14. DB Migration (psql direct — 5 tables + 10 enum values + 5 indexes + 1 unique partial index)

### Step 1: Enum additions (run each standalone, NOT in transaction)
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
```

### Step 2: Create tables (in a single transaction)
```sql
BEGIN;

CREATE TABLE oi_enforcement_controls (
  id                 SERIAL PRIMARY KEY,
  control_number     VARCHAR(30) NOT NULL UNIQUE,
  sop_id             INTEGER NOT NULL REFERENCES oi_sop_records(id) ON DELETE RESTRICT,
  sop_revision_number INTEGER NOT NULL,
  erp_entity_type    VARCHAR(50) NOT NULL,
  control_type       VARCHAR(30) NOT NULL,
  enforcement_level  VARCHAR(20) NOT NULL DEFAULT 'advisory',
  title              TEXT NOT NULL,
  description        TEXT NOT NULL,
  rationale          TEXT NOT NULL,
  department         VARCHAR(100) NOT NULL,
  process_area       VARCHAR(255),
  status             VARCHAR(20) NOT NULL DEFAULT 'draft',
  owner_id           INTEGER NOT NULL REFERENCES users(id),
  approver_id        INTEGER NOT NULL REFERENCES users(id),
  approved_by        INTEGER REFERENCES users(id),
  approved_at        TIMESTAMP,
  suspended_by       INTEGER REFERENCES users(id),
  suspended_at       TIMESTAMP,
  suspension_reason  TEXT,
  retired_by         INTEGER REFERENCES users(id),
  retired_at         TIMESTAMP,
  retirement_reason  TEXT,
  created_by         INTEGER NOT NULL REFERENCES users(id),
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE oi_enforcement_checklists (
  id              SERIAL PRIMARY KEY,
  control_id      INTEGER NOT NULL REFERENCES oi_enforcement_controls(id) ON DELETE CASCADE,
  item_number     INTEGER NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  is_required     BOOLEAN NOT NULL DEFAULT TRUE,
  evidence_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
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
  reason                    TEXT NOT NULL,
  status                    VARCHAR(30) NOT NULL DEFAULT 'open',
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
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE oi_enforcement_checklist_responses (
  id                SERIAL PRIMARY KEY,
  hold_id           INTEGER NOT NULL REFERENCES oi_enforcement_holds(id) ON DELETE CASCADE,
  checklist_item_id INTEGER NOT NULL REFERENCES oi_enforcement_checklists(id) ON DELETE RESTRICT,
  is_checked        BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_note     TEXT,
  responded_by      INTEGER REFERENCES users(id),
  responded_at      TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (hold_id, checklist_item_id)
);

CREATE TABLE oi_enforcement_audit_log (
  id           SERIAL PRIMARY KEY,
  control_id   INTEGER REFERENCES oi_enforcement_controls(id) ON DELETE SET NULL,
  hold_id      INTEGER REFERENCES oi_enforcement_holds(id) ON DELETE SET NULL,
  action       oi_audit_action NOT NULL,
  actor_id     INTEGER NOT NULL REFERENCES users(id),
  actor_name   TEXT NOT NULL,
  actor_role   TEXT NOT NULL,
  field_name   TEXT,
  old_value    TEXT,
  new_value    TEXT,
  context      TEXT,
  ip_address   TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMIT;
```

### Step 3: Create indexes
```sql
CREATE INDEX idx_oi_enforcement_controls_sop_id ON oi_enforcement_controls(sop_id);
CREATE INDEX idx_oi_enforcement_controls_erp_type ON oi_enforcement_controls(erp_entity_type);
CREATE INDEX idx_oi_enforcement_controls_status ON oi_enforcement_controls(status);
CREATE INDEX idx_oi_enforcement_controls_department ON oi_enforcement_controls(department);
CREATE INDEX idx_oi_enforcement_checklists_control_id ON oi_enforcement_checklists(control_id);
CREATE INDEX idx_oi_enforcement_holds_control_id ON oi_enforcement_holds(control_id);
CREATE INDEX idx_oi_enforcement_holds_erp_entity ON oi_enforcement_holds(erp_entity_type, erp_entity_id);
CREATE INDEX idx_oi_enforcement_holds_status ON oi_enforcement_holds(status);
CREATE INDEX idx_oi_enforcement_checklist_resp_hold_id ON oi_enforcement_checklist_responses(hold_id);
CREATE INDEX idx_oi_enforcement_audit_control_id ON oi_enforcement_audit_log(control_id);
CREATE INDEX idx_oi_enforcement_audit_hold_id ON oi_enforcement_audit_log(hold_id);

CREATE UNIQUE INDEX idx_oi_enforcement_holds_no_duplicate_open
  ON oi_enforcement_holds(control_id, erp_entity_type, erp_entity_id)
  WHERE status = 'open';
```

---

## 15. Mandatory Corrections — Learned from Phase 2A

The following rules apply in Phase 2B implementation to prevent deviations discovered in Phase 2A:

| # | Rule | Enforcement |
|---|---|---|
| C1 | `oi_audit_log` is NOT used for enforcement audit. Use `oi_enforcement_audit_log` only. | `writeEnforcementAuditLog()` must never import `oiAuditLog` from schema |
| C2 | Approver ≠ Owner at create, update, and activation. 3 enforcement points. | HTTP 422: `approver_must_differ_from_owner` |
| C3 | Hold raising verifies the ERP entity exists by querying the target table. HTTP 404 if not found. | Server-side lookup required; client-provided `erp_entity_ref` is not trusted |
| C4 | Checklist is injected at hold-raise time (server creates response rows). Client does not create response rows directly. | Responses created via insert in hold-raise transaction |
| C5 | Open mandatory hold uniqueness enforced by partial unique index, not only application logic. DB index is the hard constraint. | `idx_oi_enforcement_holds_no_duplicate_open` |
| C6 | Control retirement blocked when open mandatory holds exist. Advisory holds do not block. | `WHERE status = 'open' AND enforcement_level = 'mandatory'` count check |
| C7 | Hold override is SM+ only. Manager+ is forbidden. HTTP 403 if actor not SM+. | Role check before any override logic |
| C8 | `evidence_required = true` forces `is_required = true` at the server. Client cannot submit a non-required evidence item. | Server-side coercion on checklist item create/update |
| C9 | No AI / no auto-enforcement activation / no ERP state mutation in Phase 2B code. | Zero `openai`, `llm`, `sap` references in `oi-enforcement-*.ts` |

---

## 16. Existing Infrastructure Not Modified

| Item | Change |
|---|---|
| `oi_audit_log` | None — not touched |
| `oi_sop_audit_log` | None — not touched |
| `writeAuditLog()` | None — not used in Phase 2B |
| `writeSopAuditLog()` | None — not used in Phase 2B |
| All existing ERP routes | None — Phase 2B does not modify ERP state machines |
| `oi_audit_action` enum | Additive only (10 new values) |
| Any Phase 1A–2A client pages | Only `oi-dashboard.tsx` and `oi-sop-detail.tsx` are patched (additive only) |

---

## 17. Explicit Exclusions (reiterated from scope)

The following are **not implemented** in Phase 2B and must not appear in any Phase 2B code, routes, services, or UI:

- AI agents, LLM calls, embedding, semantic search
- Predictive analytics, ML-based hold scoring
- Automatic enforcement activation (control activation is always manual SM+ action)
- Automatic hold raising (hold raising is always manual Manager+ action)
- Legal hold flags or legal immutability
- SHA-256 evidence hash or tamper detection
- Lessons learned records or linkage
- Email or SendGrid notifications
- GCS file uploads on holds or checklist responses
- Modification of existing ERP route state machines (dispatch, PO, WO, inspection routes remain unchanged)

---

*Prepared by: Architecture review session — 2026-05-22*  
*STOP — awaiting approval before implementation.*
