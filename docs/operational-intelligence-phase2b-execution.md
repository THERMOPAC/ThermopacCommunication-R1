# Operational Intelligence — Phase 2B Execution Plan

**Status:** REVISED — SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT  
**Date:** 2026-05-22 (revised 2026-05-22)  
**Phase 2A Baseline:** `docs/operational-intelligence-phase2a-execution.md` (COMPLETE)  
**Amendment 001:** `docs/phase2a-amendment-001-sop-audit-governance.md` (APPROVED)  
**Phase 2B Scope:** ERP Enforcement Framework — SOP-to-ERP Control Mapping, Workflow Gate Definitions, Checklist Injection, Mandatory Evidence Rules, Hold Points, Dispatch Holds, QC Holds, DVS Gates, Procurement Holds, FAT/SAT/Commissioning Blocks, Enforcement Approval Workflow, Enforcement Audit Logs, Enforcement Dashboards  
**Prepared by:** Architecture review session  
**Revision:** 3 (corrections R1–R10 incorporated)

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
- **Audit governance (Amendment 001 pattern):** All enforcement audit writes go to `oi_enforcement_audit_log` via `writeEnforcementAuditLog()`. See §A (Audit Governance) for the formal architectural decision record.
- Enforcement control numbers are server-assigned. Never accepted from client.
- Hold numbers are server-assigned. Never accepted from client.
- Role ladder (ascending): Staff → Manager → Senior Manager (SM) → General Manager (GM) → Superuser.

---

## Explicit Exclusions — Forbidden in Phase 2B Code

**Important clarification (R1):** Phase 2B IS the ERP Enforcement Framework. The word "enforcement" in the module name refers to SOP-compliance enforcement within ERP workflows via controlled hold gates. The exclusion below is NOT "ERP enforcement" — it is specifically "automatic ERP transaction mutation". Controlled workflow blocking via human-raised holds IS the purpose of this phase and IS permitted.

| Category | Prohibited |
|---|---|
| AI agents | OpenAI API calls, LLM-generated enforcement rules, AI-suggested hold raises, AI checklist generation |
| Predictive analytics | ML-based risk scoring, trend forecasting, automatic hold prediction |
| Automatic enforcement activation | Controls do not auto-activate on SOP activation, on ERP state changes, or on any system event. Activation is always a manual `activate` transition by an authorised SM+ user. |
| Automatic hold raising | Holds are never raised automatically by the system. Raising a hold is always a deliberate manual action by a Manager+ user. |
| **Automatic ERP transaction mutation** | Phase 2B code must never write to ERP entity tables (`epc_purchase_orders`, `epc_work_orders`, `epc_dispatch_readiness`, `epc_commissioning_readiness`, `inspection_execution_records`, `purchase_orders`, `work_orders`) as a side effect of enforcement actions. ERP state changes remain in their own existing routes only. |
| Legal hold | Legal hold flags, immutability for legal purposes, legal hold lifecycle |
| Evidence hash | SHA-256 cryptographic proof, tamper detection, blockchain anchoring, hash verification |
| Lessons learned | Lessons learned records, lessons learned linkage |
| Email notifications | No SendGrid or any email dispatch in Phase 2B. All notification data is computed and audit-logged only. |
| File attachments to holds | GCS file upload against holds or checklist responses is excluded. Evidence is free-text only. |

**What IS permitted in Phase 2B (to avoid all ambiguity):**
- Creating, activating, suspending, and retiring enforcement controls
- Raising, approving, releasing, overriding, and emergency-bypassing holds on ERP entity instances (by ID reference only — no mutation of the ERP entity itself)
- Reading ERP entity data to validate scope and populate `erp_entity_ref`
- Providing a hold-check query API for ERP routes to call voluntarily (not wired in Phase 2B)
- Enforcing checklist completion before hold release
- Logging all enforcement actions in `oi_enforcement_audit_log`

---

## Future-Phase Leakage Guard (Non-Negotiable)

The following are explicitly prohibited from appearing in any Phase 2B code, routes, services, schemas, UI, or comments.

| Prohibited Pattern | Reason |
|---|---|
| AI-driven holds — any logic that auto-raises a hold based on an algorithm, score, or model output | Reserved for future AI phase only |
| Automatic ERP transaction mutation — any code that writes to ERP entity tables as a side effect of enforcement | Phase 2B observes and gates only; never mutates ERP records |
| Autonomous enforcement escalation — any logic that promotes a hold, increases enforcement_level, or changes a control's status without a direct human actor | All transitions require an authenticated human actor |
| Predictive blocking — any logic that pre-emptively raises a hold based on trend data, risk score, or ML output | Not approved for any phase without explicit governance review |
| Auto-generated checklists — any logic that creates checklist items from templates, SOP text, AI output, or any non-human source | Checklist items are human-authored only |

---

## Phase 2B Scope

### In Scope

| Area | Detail |
|---|---|
| Enforcement Control Master | Control definition: SOP → ERP entity type mapping, control type, enforcement level, scope, checklist, ownership |
| Control Numbering | Server-assigned `ENF-{YYYY}-{NNN}` |
| Control Workflow | Four-state lifecycle: `draft → active → suspended → retired` |
| Enforcement Activation Approval Rule | Named rule: SM+ approval, `approved_by`, `approved_at`, activation audit event — all mandatory (see §6.2) |
| 4 Activation Pre-conditions | SOP active, SOP revision activated, owner assigned, erp_entity_type assigned |
| SOP-to-ERP Control Mapping | Each control links exactly one active SOP to one ERP entity type and one control/gate type |
| Enforcement Scope | 4 explicit scope types: `global`, `department`, `project`, `equipment_type`. No hidden inheritance. |
| Enforcement Applicability Precedence | Deterministic precedence when multiple controls apply to the same ERP entity instance (see §4) |
| Gate Type Vocabulary | 16 control types: 9 core gates + 3 DVS-specific + 4 procurement-specific |
| DVS Enforcement Specificity | 3 exact DVS control types: revision_mismatch, unverified_drawing, missing_custom_property |
| Procurement Enforcement Specificity | 4 exact procurement control types: blocked_vendor, missing_tbe_cbe, missing_qc_requirement, expired_vendor_qualification |
| Duplicate Control Prevention | One active control per (sop_id, erp_entity_type, control_type, scope). HTTP 409. |
| Checklist Injection | Ordered items per control; injected at hold-raise time; versioned |
| Checklist Versioning | Responses store `sop_revision_number` and `checklist_revision_number` at raise time |
| Checklist Response Governance | Response statuses: pending/submitted/rejected; rejection workflow; immutable after submission by submitter |
| Hold Ownership Governance | Every hold requires `hold_owner_id`, `responsible_department`, `escalation_owner_id` |
| Hold Lifecycle | Five terminal paths: released / overridden / emergency_bypassed |
| Enforcement Activation Approval Rule | SM+ approval; `approved_by`/`approved_at` server-set; mandatory activation audit |
| Mandatory Release Evidence Rule | `release_note` (min 10 chars), `released_by`, `released_at` — server-set atomically |
| Override Governance | SM+ only; 4 mandatory fields; dedicated audit event; `is_override_event = true` |
| Emergency Bypass Governance | Superuser only; 4 mandatory visibility surfaces: dashboard, hold detail, audit log, management KPI |
| Enforcement Audit Logs | Dedicated `oi_enforcement_audit_log`; immutable; never deleted; see §A |
| Audit Governance — Amendment 001 | Formal decision record: why `oi_audit_log` cannot be reused (see §A) |
| Management KPI Dashboard | Emergency bypass count, hold override rate, avg hold duration, release rate |

---

## 1. ERP Entity Landscape (Phase 2B Target Entities)

Phase 2B reads these tables to validate entity existence and extract `erp_entity_ref`. It never writes to them.

| ERP Entity Type Value | DB Table | Key Status Field | Lifecycle States |
|---|---|---|---|
| `epc_purchase_order` | `epc_purchase_orders` | `status` | draft → approved → issued → cancelled/superseded |
| `epc_work_order` | `epc_work_orders` | `status` | draft → approved → released → cancelled/superseded |
| `epc_dispatch_readiness` | `epc_dispatch_readiness` | `status` | draft → ready → dispatched → cancelled/superseded |
| `epc_commissioning_readiness` | `epc_commissioning_readiness` | `status` | draft → ready → commissioned → handover → cancelled |
| `inspection_execution` | `inspection_execution_records` | `status` | draft → scheduled → started → completed/failed/cancelled |
| `epc_drawing_verification` | `epc_drawing_verifications` | `overallStatus` + `accepted` | — (accepted boolean is the gate) |
| `purchase_order` | `purchase_orders` | `status` | draft → submitted → approved → ordered → shipped → received/on_hold/cancelled |
| `work_order` | `work_orders` | `status` | planned → in_progress → on_hold → completed/cancelled |

**Polymorphic FK:** `erp_entity_type` identifies the DB table; `erp_entity_id` is the numeric PK in that table. Cross-table FK constraints are not possible in Postgres for polymorphic references — enforced at the application layer only.

---

## 2. Gate Type Definitions (16 control types)

### 2.1 Core Gate Types (9)

| `control_type` | Target Entity Types | Gate Description | What a Hold Blocks |
|---|---|---|---|
| `hold_point` | `epc_work_order`, `work_order` | In-process manufacturing hold point | Work order progression past the hold point step |
| `qc_hold` | `inspection_execution`, `epc_purchase_order`, `epc_work_order` | Quality clearance required | Quality clearance / status update to cleared |
| `dispatch_hold` | `epc_dispatch_readiness` | Dispatch blocked until hold released | Transition to dispatched |
| `procurement_hold` | `epc_purchase_order`, `purchase_order` | Procurement approval blocked | PO approval / issuance |
| `drawing_gate` | `epc_drawing_verification` | Drawing must pass DVS gate before dispatch | Drawing acceptance (`accepted = true`) |
| `dvs_gate` | `epc_drawing_verification` | DDS gate result must be `pass` | Drawing acceptance |
| `fat_block` | `inspection_execution` (type=FAT) | Factory Acceptance Test must pass | Inspection completion |
| `sat_block` | `epc_commissioning_readiness` | Site Acceptance Test must pass | Commissioning readiness approval |
| `commissioning_block` | `epc_commissioning_readiness` | Commissioning blocked until SOP checklist satisfied | Transition to commissioned |

### 2.2 DVS-Specific Control Types (3)

These are exact enforcement control definitions for Drawing Verification System (DVS) gates. Each maps to `epc_drawing_verification` entity type.

| `control_type` | Description | What It Checks | What a Hold Blocks |
|---|---|---|---|
| `dvs_revision_mismatch` | Drawing revision does not match the revision specified in the associated DDS | Compares `epc_drawing_verifications.layer1Results` revision fields against DDS `drawingRevision` | Drawing cannot be accepted; dispatch readiness for the linked item is blocked |
| `dvs_unverified_drawing` | Drawing has not been submitted for or completed DVS verification | Checks whether an `epc_drawing_verifications` record exists with `overallStatus` = `pass` or `warn` for the drawing control | Linked dispatch readiness cannot proceed to dispatched state |
| `dvs_missing_custom_property` | Required custom properties (tag number, item code, revision, title block fields) are absent in drawing extraction result | Checks `epc_drawing_verifications.extractionResult` and `layer2Results` for missing or null required fields | Drawing cannot be accepted; blocks `accepted = true` |

**DVS hold raise context:** When raising a hold of a DVS-specific type, the server populates `erp_entity_ref` with the drawing control number and filename from `epc_drawing_verifications`. The `reason` field supplied by the Manager+ user must describe the specific mismatch or missing property. Min 10 chars enforced.

### 2.3 Procurement-Specific Control Types (4)

These are exact enforcement control definitions for procurement workflow gates. Each maps to `epc_purchase_order` or `purchase_order` entity types.

| `control_type` | Description | What It Checks | What a Hold Blocks |
|---|---|---|---|
| `procurement_blocked_vendor` | Vendor is on the blocked list, is disqualified, or has `is_active = false` in the vendor master | Checks `vendors.is_active` and any disqualification flag in vendor data | PO cannot be approved or issued |
| `procurement_missing_tbe_cbe` | Techno-Commercial Bid Evaluation (TBE/CBE) document is absent for this PO | Checks whether a TBE or CBE document has been attached or referenced in the procurement record | PO cannot proceed past draft/submitted |
| `procurement_missing_qc_requirement` | Quality Control plan or inspection requirement is not defined for the procured item | Checks whether a `qualityPlanId` is set on the PO or whether inspection type is defined | PO cannot be approved |
| `procurement_expired_vendor_qualification` | Vendor qualification, approval certificate, or audit validity has expired | Checks vendor qualification expiry date against the hold-raise date (server compares at raise time) | PO cannot be issued |

**Procurement hold raise context:** The `reason` field must identify which specific check failed (e.g. vendor name and blocked status, missing document reference). Min 10 chars. `erp_entity_ref` populated from `po_number` or `purchaseOrderNumber`.

### 2.4 Enforcement Level Modifier

- `advisory`: Hold raised, visible, audited. The ERP entity can still proceed. No hard block.
- `mandatory`: Hold raised. The hold-check API (`GET /api/oi/enforcement/erp/:erpEntityType/:erpEntityId/holds?status=open&enforcementLevel=mandatory`) must return this hold. Consuming ERP route returns HTTP 422: `mandatory_hold_open`. (Not wired in Phase 2B — ERP routes unmodified.)

---

## 3. Enforcement Scope

Each control has an explicit `enforcement_scope`. No hidden inheritance. Scope always explicit, always checked at hold-raise time.

| `enforcement_scope` | Description | Required Scope Field | Null Fields |
|---|---|---|---|
| `global` | Applies to all instances of the `erp_entity_type` | None | `scope_project_id` null; `scope_equipment_type` null |
| `department` | Applies only where ERP entity's department matches `control.department` | None (uses `department`) | `scope_project_id` null; `scope_equipment_type` null |
| `project` | Applies only to entity instances in a specific project | `scope_project_id` (FK → projects.id) | `scope_equipment_type` null |
| `equipment_type` | Applies only to entity instances for a specific equipment type | `scope_equipment_type` (min 2 chars) | `scope_project_id` null |

**Server enforcement at hold-raise time:**
- `global` → no restriction.
- `department` → ERP entity's owning department must match `control.department`. HTTP 422: `entity_out_of_scope`.
- `project` → ERP entity's `project_id` must match `control.scope_project_id`. HTTP 422: `entity_out_of_scope`.
- `equipment_type` → ERP entity's `item_description` must contain `control.scope_equipment_type` (case-insensitive match). HTTP 422: `entity_out_of_scope`.

No scope is inferred from any other scope. A `project` scope control does not apply to other projects in the same department.

---

## 4. Enforcement Applicability Precedence

When a Manager+ user raises holds for an ERP entity instance, multiple active controls may apply (each from a different SOP or a different control_type). Phase 2B raises separate holds for EACH applicable control — there is no silent de-duplication. However, a deterministic precedence order governs which hold is displayed as the "primary" hold for reporting and KPI purposes.

### 4.1 Precedence Rules

| Rule | Precedence |
|---|---|
| project scope vs department scope | `project` scope control is primary over `department` scope control when both apply to the same entity |
| project scope vs global scope | `project` scope control is primary over `global` scope control |
| department scope vs global scope | `department` scope control is primary over `global` scope control |
| equipment_type scope vs global scope | `equipment_type` scope control is primary over `global` scope control |
| project scope vs equipment_type scope | `project` scope control is primary over `equipment_type` scope control |
| Same scope level, different SOPs | All controls at the same scope level apply equally — all generate holds — no de-duplication — no primary designation between them |
| Same scope level, same SOP, same gate_type | Prevented by duplicate active control check at activation. Cannot occur. |

### 4.2 No Ambiguous Control Resolution

- The system never silently picks one control over another when multiple apply.
- All applicable controls at all scope levels generate separate, independent holds.
- Precedence affects only the `is_primary_hold` flag on `oi_enforcement_holds` (see §5.3), not whether a hold is raised.
- A mandatory hold at any precedence level blocks the ERP entity transition. All mandatory holds must be released/overridden before the ERP route permits the state change (when wired in a future phase).
- If no applicable active control exists for an ERP entity instance, no hold can be raised. The server returns HTTP 422: `no_applicable_control` if a hold raise is attempted for an entity/control combination that is out of scope.

---

## 5. New Tables (5 tables)

### 5.1 `oi_enforcement_controls`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `control_number` | varchar(30) | NOT NULL | UNIQUE | Server-assigned `ENF-{YYYY}-{NNN}` |
| `sop_id` | integer | NOT NULL | FK → oi_sop_records.id ON DELETE RESTRICT | |
| `sop_revision_number` | integer | NOT NULL | — | Snapshot of SOP revision at creation time |
| `erp_entity_type` | varchar(50) | NOT NULL | — | One of the 8 values in §1 |
| `control_type` | varchar(50) | NOT NULL | — | One of the 16 gate types in §2 |
| `enforcement_level` | varchar(20) | NOT NULL | DEFAULT `advisory` | `advisory` or `mandatory` |
| `enforcement_scope` | varchar(30) | NOT NULL | DEFAULT `global` | `global`, `department`, `project`, `equipment_type` |
| `scope_project_id` | integer | NULL | FK → projects.id ON DELETE RESTRICT | Required when scope = `project` |
| `scope_equipment_type` | varchar(100) | NULL | — | Required when scope = `equipment_type` (min 2 chars) |
| `title` | text | NOT NULL | min 5 chars | |
| `description` | text | NOT NULL | min 10 chars | |
| `rationale` | text | NOT NULL | min 10 chars | |
| `department` | varchar(100) | NOT NULL | — | Fixed list |
| `process_area` | varchar(255) | NULL | — | |
| `control_checklist_version` | integer | NOT NULL | DEFAULT 0 | Incremented on each checklist item add/edit/delete |
| `status` | varchar(20) | NOT NULL | DEFAULT `draft` | `draft`, `active`, `suspended`, `retired` |
| `owner_id` | integer | NOT NULL | FK → users.id | Manager+; must be assigned |
| `approver_id` | integer | NOT NULL | FK → users.id | SM+; must be assigned; must ≠ owner_id |
| `approved_by` | integer | NULL | FK → users.id | Server-set on activation |
| `approved_at` | timestamp | NULL | — | Server-set on activation |
| `suspended_by` | integer | NULL | FK → users.id | |
| `suspended_at` | timestamp | NULL | — | |
| `suspension_reason` | text | NULL | — | min 10 chars; required on suspension |
| `retired_by` | integer | NULL | FK → users.id | |
| `retired_at` | timestamp | NULL | — | |
| `retirement_reason` | text | NULL | — | min 10 chars; required on retirement |
| `created_by` | integer | NOT NULL | FK → users.id | |
| `created_at` | timestamp | NOT NULL | DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL | DEFAULT NOW() | |

**Indexes:** `sop_id`, `erp_entity_type`, `status`, `department`, `scope_project_id` (partial, WHERE NOT NULL)

**Business rules:**
- `owner_id ≠ approver_id`. HTTP 422: `approver_must_differ_from_owner`.
- Scope field consistency enforced at create and update (§3).
- `control_checklist_version` incremented atomically in same transaction as each checklist mutation.
- `sop_revision_number` snapshot at creation only; not auto-updated on SOP revision.

---

### 5.2 `oi_enforcement_checklists`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `control_id` | integer | NOT NULL | FK → oi_enforcement_controls.id ON DELETE CASCADE | |
| `item_number` | integer | NOT NULL | — | Sequential within control |
| `title` | text | NOT NULL | min 5 chars | |
| `description` | text | NULL | — | |
| `is_required` | boolean | NOT NULL | DEFAULT true | |
| `evidence_required` | boolean | NOT NULL | DEFAULT false | |
| `sort_order` | integer | NOT NULL | DEFAULT 0 | |
| `created_at` | timestamp | NOT NULL | DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL | DEFAULT NOW() | |

**Business rules:**
- Add/edit/delete only when control is `draft`. HTTP 422: `control_not_draft`.
- `evidence_required = true` forces `is_required = true` server-side.
- Each write increments `oi_enforcement_controls.control_checklist_version` atomically.

---

### 5.3 `oi_enforcement_holds`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `hold_number` | varchar(30) | NOT NULL | UNIQUE | Server-assigned `HLD-{YYYY}-{NNN}` |
| `control_id` | integer | NOT NULL | FK → oi_enforcement_controls.id ON DELETE RESTRICT | |
| `erp_entity_type` | varchar(50) | NOT NULL | — | Must match `control.erp_entity_type` |
| `erp_entity_id` | integer | NOT NULL | — | Polymorphic PK into target ERP table |
| `erp_entity_ref` | varchar(100) | NULL | — | Server-populated at raise time; denormalized display ref |
| `enforcement_level` | varchar(20) | NOT NULL | — | Snapshot from control at raise time |
| `hold_type` | varchar(50) | NOT NULL | — | Snapshot from `control.control_type` at raise time |
| `enforcement_scope` | varchar(30) | NOT NULL | — | Snapshot from `control.enforcement_scope` at raise time |
| `is_primary_hold` | boolean | NOT NULL | DEFAULT false | Set by server per §4 precedence rules at raise time |
| `reason` | text | NOT NULL | min 10 chars | Why this hold is raised on this entity |
| `status` | varchar(30) | NOT NULL | DEFAULT `open` | `open`, `approved_to_proceed`, `released`, `overridden`, `emergency_bypassed` |
| `hold_owner_id` | integer | NOT NULL | FK → users.id | Manager+; designated hold owner; required at hold-raise time |
| `responsible_department` | varchar(100) | NOT NULL | — | Department responsible for resolving this hold; required at hold-raise time |
| `escalation_owner_id` | integer | NOT NULL | FK → users.id | SM+; designated escalation owner if hold is not resolved; required at hold-raise time |
| `hold_approver_id` | integer | NULL | FK → users.id | Designated approver; Manager+; can be set at raise time or updated while open |
| `raised_by` | integer | NOT NULL | FK → users.id | Manager+ |
| `raised_at` | timestamp | NOT NULL | DEFAULT NOW() | |
| `approved_to_proceed_by` | integer | NULL | FK → users.id | Manager+ |
| `approved_to_proceed_at` | timestamp | NULL | — | |
| `approved_to_proceed_note` | text | NULL | — | min 10 chars; required on approval |
| `released_by` | integer | NULL | FK → users.id | Manager+; server-set |
| `released_at` | timestamp | NULL | — | Server-set |
| `release_note` | text | NULL | — | min 10 chars; required on release |
| `override_by` | integer | NULL | FK → users.id | SM+ only; server-set |
| `override_at` | timestamp | NULL | — | Server-set |
| `override_reason` | text | NULL | — | min 20 chars; required on override |
| `bypass_by` | integer | NULL | FK → users.id | Superuser only; server-set |
| `bypass_at` | timestamp | NULL | — | Server-set |
| `bypass_reason` | text | NULL | — | min 20 chars; required on emergency bypass |
| `created_at` | timestamp | NOT NULL | DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL | DEFAULT NOW() | |

**Indexes:** `control_id`, `(erp_entity_type, erp_entity_id)`, `status`

**Unique partial index:**
```sql
CREATE UNIQUE INDEX idx_oi_enforcement_holds_no_duplicate_open
  ON oi_enforcement_holds (control_id, erp_entity_type, erp_entity_id)
  WHERE status = 'open';
```

**Hold Ownership Governance (R3):** `hold_owner_id`, `responsible_department`, and `escalation_owner_id` are mandatory at hold-raise time. They cannot be null on insert. HTTP 422: `hold_owner_required` / `responsible_department_required` / `escalation_owner_required` if any are absent.

- `hold_owner_id`: Manager+ user responsible for tracking and resolving this hold. May be the same as `raised_by`.
- `responsible_department`: Explicit department string (from fixed list). Does not auto-inherit from the control or ERP entity.
- `escalation_owner_id`: SM+ user who owns escalation if the hold is not resolved within an acceptable time. Must hold SM+ role at raise time. HTTP 422: `escalation_owner_must_be_sm_plus`.

---

### 5.4 `oi_enforcement_checklist_responses`

Per-hold completion state of each injected checklist item. Rows created automatically at hold-raise time.

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `hold_id` | integer | NOT NULL | FK → oi_enforcement_holds.id ON DELETE CASCADE | |
| `checklist_item_id` | integer | NOT NULL | FK → oi_enforcement_checklists.id ON DELETE RESTRICT | |
| `sop_revision_number` | integer | NOT NULL | — | Snapshot from `control.sop_revision_number` at hold-raise time |
| `checklist_revision_number` | integer | NOT NULL | — | Snapshot from `control.control_checklist_version` at hold-raise time |
| `response_status` | varchar(20) | NOT NULL | DEFAULT `pending` | `pending`, `submitted`, `rejected` |
| `is_checked` | boolean | NOT NULL | DEFAULT false | |
| `evidence_note` | text | NULL | — | Required (non-empty) when item has `evidence_required = true` |
| `responded_by` | integer | NULL | FK → users.id | Server-set when `response_status` → `submitted` |
| `responded_at` | timestamp | NULL | — | Server-set when `response_status` → `submitted` |
| `rejection_reason` | text | NULL | — | Required (min 10 chars) when `response_status` → `rejected` |
| `rejected_by` | integer | NULL | FK → users.id | Server-set when `response_status` → `rejected` |
| `rejected_at` | timestamp | NULL | — | Server-set when `response_status` → `rejected` |
| `created_at` | timestamp | NOT NULL | DEFAULT NOW() | |
| `updated_at` | timestamp | NOT NULL | DEFAULT NOW() | |

**UNIQUE:** `(hold_id, checklist_item_id)`

**Checklist Response Governance (R5):**

**Submission (`pending` → `submitted`):**
- Only possible when parent hold is `open` or `approved_to_proceed`. HTTP 422: `hold_not_open`.
- `responded_by` and `responded_at` set by server. Not accepted from client.
- `sop_revision_number` and `checklist_revision_number` are set at row creation (hold-raise time). Immutable thereafter.
- If parent checklist item has `evidence_required = true`, `evidence_note` must be non-empty before submission. HTTP 422: `evidence_note_required`.

**Immutability after submission:** Once `response_status = 'submitted'`, the submitter cannot alter the response. HTTP 422: `response_immutable_after_submission` if the original submitter attempts to modify.

**Rejection workflow (`submitted` → `rejected` → `pending`):**
- The hold's `hold_approver_id` or any SM+ user can reject a submitted response if it is inadequate.
- On rejection: `rejection_reason` (min 10 chars) must be provided; `rejected_by` and `rejected_at` set by server; `response_status` set to `rejected`; `is_checked` reset to `false`; `responded_by` and `responded_at` cleared; `evidence_note` cleared.
- After rejection: `response_status` returns to `pending`. The original submitter (or any Manager+ user) may resubmit.
- Rejection is audited: `enforcement_checklist_item_rejected` audit event written (see §10).
- A rejected response can be resubmitted (`pending` → `submitted`) following the same rules as initial submission.

---

### 5.5 `oi_enforcement_audit_log`

Dedicated enforcement audit table. See §A for the formal architectural decision record.

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `control_id` | integer | NULL | FK → oi_enforcement_controls.id ON DELETE SET NULL | |
| `hold_id` | integer | NULL | FK → oi_enforcement_holds.id ON DELETE SET NULL | |
| `action` | oi_audit_action | NOT NULL | — | 12 new values added in Phase 2B (§6) |
| `actor_id` | integer | NOT NULL | FK → users.id | |
| `actor_name` | text | NOT NULL | — | Denormalized |
| `actor_role` | text | NOT NULL | — | Denormalized |
| `field_name` | text | NULL | — | For `field_updated` events |
| `old_value` | text | NULL | — | |
| `new_value` | text | NULL | — | |
| `context` | text | NULL | — | e.g. `"ENF-2026-001 → HLD-2026-007"` |
| `ip_address` | text | NULL | — | |
| `is_override_event` | boolean | NOT NULL | DEFAULT false | `true` for override and emergency bypass actions |
| `created_at` | timestamp | NOT NULL | DEFAULT NOW() | |

**Indexes:** `control_id`, `hold_id`, partial index on `is_override_event = true`

**Audit Retention Rules (non-negotiable):**
- Rows are **immutable**. No UPDATE ever.
- Rows are **never deleted**. No DELETE ever. Persists even after control/hold retirement.
- `is_override_event = true` for `enforcement_hold_overridden` and `enforcement_hold_emergency_bypassed` — enables dashboard filter without enum knowledge.
- `writeEnforcementAuditLog()` is the **only** permitted write path. Direct route-level inserts are forbidden.
- At least one of `control_id` or `hold_id` must be non-null. Enforced in `writeEnforcementAuditLog()`.

---

## 6. Enum Additions — `oi_audit_action`

**12 new values** (Phase 2B):

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
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_checklist_item_rejected';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_hold_emergency_bypassed';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_checklist_item_resubmitted';
```

Each statement standalone, NOT in a transaction block.

---

## 7. Control Workflow

### 7.1 State Machine

```
draft ──activate──► active ──suspend──► suspended ──re-activate──► active
                         └──retire──► retired
                    suspended ──retire──► retired
```

### 7.2 Enforcement Activation Approval Rule (R2)

This is a named governance rule. All four items are mandatory. No partial compliance.

| Item | Rule |
|---|---|
| Approving role | Actor must be SM+. The actor must be the control's designated `approver_id` OR a Superuser. HTTP 403 otherwise. |
| `approved_by` | Set by the server from the authenticated actor's user ID at the moment of activation. Not accepted from client. |
| `approved_at` | Set by the server as `NOW()` at the moment of activation. Not accepted from client. |
| Activation audit event | `writeEnforcementAuditLog()` called with action = `enforcement_control_activated`, `control_id` populated. This is mandatory and part of the same DB transaction as the status update. The activation is not committed if the audit write fails. |

### 7.3 Enforcement Activation Pre-conditions

All four must pass before activation proceeds. Checked in order. First failure returns HTTP 422 with its specific error code.

| # | Pre-condition | Error Code |
|---|---|---|
| 1 | The linked SOP (`sop_id`) must have `status = 'active'` in `oi_sop_records` | `sop_not_active` |
| 2 | The linked SOP must have a revision record with `status = 'active'` — i.e. the current revision is approved and activated | `sop_revision_not_activated` |
| 3 | `owner_id` must be non-null and the referenced user must hold Manager+ role | `control_owner_not_assigned` |
| 4 | `erp_entity_type` must be non-null and must be one of the 8 valid values from §1 | `erp_entity_type_not_assigned` |

Additionally: `approver_id ≠ owner_id`. HTTP 422: `approver_must_differ_from_owner`.  
Additionally: Duplicate active control check (§4.1). HTTP 409: `duplicate_active_control`.

### 7.4 State Transition Table

| From | To | Action | Required Role | Pre-conditions | Side Effects |
|---|---|---|---|---|---|
| `draft` | `active` | `activate` | SM+ (must be `approver_id` or Superuser) | §7.3 (4 checks) + approver ≠ owner + duplicate check | Set `approved_by`, `approved_at` (server); write `enforcement_control_activated` audit (mandatory) |
| `active` | `suspended` | `suspend` | SM+ | `suspension_reason` min 10 chars | Set `suspended_by`, `suspended_at`, `suspension_reason`; write `enforcement_control_suspended` audit |
| `suspended` | `active` | `activate` | SM+ (must be `approver_id` or Superuser) | §7.3 (4 checks) + duplicate check | Clear suspension fields; set `approved_by`, `approved_at` (re-stamped); write `enforcement_control_activated` audit |
| `active` | `retired` | `retire` | SM+ | `retirement_reason` min 10 chars; zero open mandatory holds (HTTP 422: `open_mandatory_holds_exist`) | Set `retired_by`, `retired_at`, `retirement_reason`; write `enforcement_control_retired` audit |
| `suspended` | `retired` | `retire` | SM+ | `retirement_reason` min 10 chars | Set `retired_by`, `retired_at`, `retirement_reason`; write `enforcement_control_retired` audit |

### 7.5 Control Field Update Rules

`PATCH` permitted only in `draft` or `suspended` status.

| Field | Editable in `active`? |
|---|---|
| title, description, rationale, enforcement_level, enforcement_scope, scope_project_id, scope_equipment_type, department, owner_id, approver_id | No |
| `process_area` | Yes |

HTTP 422: `control_not_editable`.

---

## 8. Duplicate Control Prevention

Only one active enforcement control per (sop_id, erp_entity_type, control_type, scope combination).

**Duplicate check algorithm** (server-side, inside advisory lock at activation):

Lock: `pg_advisory_xact_lock(hashtext('enf_activate_' || sop_id::text))`

Query `oi_enforcement_controls` WHERE: `status = 'active'` AND `sop_id = :x` AND `erp_entity_type = :x` AND `control_type = :x` AND `enforcement_scope = :x` AND scope-specific field matches (see §3) AND `id ≠ :x` (exclude self).

If any row found → HTTP 409: `duplicate_active_control` with `{ conflicting_control_number: 'ENF-XXXX-NNN' }`.

---

## 9. Hold Lifecycle

### 9.1 State Machine

```
(raise) → open ──approve_to_proceed──► approved_to_proceed
           │                                  │
           └──release (§9.3 pre-conditions) ──► released  (terminal)
           │
           ├──override (SM+, §9.4) ──────────────────────► overridden  (terminal)
           │
           └──emergency-bypass (Superuser only, §9.5) ──► emergency_bypassed  (terminal)
```

### 9.2 Hold Raise Pre-conditions

| # | Pre-condition | Error Code |
|---|---|---|
| 1 | Control must be `active` | `control_not_active` |
| 2 | `erp_entity_type` must match `control.erp_entity_type` | `erp_entity_type_mismatch` |
| 3 | ERP entity with `erp_entity_id` must exist in target table | `erp_entity_not_found` (HTTP 404) |
| 4 | ERP entity in scope per `control.enforcement_scope` (§3) | `entity_out_of_scope` |
| 5 | No existing open hold for same (control_id, erp_entity_type, erp_entity_id) | `hold_already_open` (HTTP 409) |

On raise: insert hold with `hold_owner_id`, `responsible_department`, `escalation_owner_id` (all required); set `is_primary_hold` per §4; insert response rows with version snapshots; populate `erp_entity_ref`; write `enforcement_hold_raised` audit.

### 9.3 Mandatory Release Evidence Rule (R4)

A hold cannot be released unless all three pre-conditions are satisfied. Checked server-side before the `released` transition is committed. This is a named governance rule.

| # | Pre-condition | Error Code |
|---|---|---|
| 1 | All `is_required = true` checklist items must have `response_status = 'submitted'` (i.e. `is_checked = true`) | `checklist_incomplete` with list of incomplete item IDs |
| 2 | All `is_required = true` AND `evidence_required = true` items must have a non-empty `evidence_note` in submitted state | `checklist_evidence_incomplete` with list of item IDs |
| 3 | `hold_approver_id` must be non-null | `hold_approver_not_assigned` |

Additionally: `release_note` minimum 10 chars — enforced server-side. HTTP 422: `release_note_required`.

**Mandatory release evidence fields (R4 named fields):**
- `release_note` — TEXT NOT NULL at release time; min 10 chars; not accepted before release action is invoked.
- `released_by` — set by server from the authenticated actor's user ID. Not accepted from client.
- `released_at` — set by server as `NOW()`. Not accepted from client.

All three are set atomically in the same DB transaction as the `released` status update.

Release permitted from: `open` or `approved_to_proceed`. Role: Manager+.

### 9.4 Override Governance

SM+ only. Bypasses checklist completion gate.

| Field | Rule |
|---|---|
| `override_reason` | Required. Min 20 chars. HTTP 422: `override_reason_required`. |
| `override_by` | Server-set from actor. Not accepted from client. |
| `override_at` | Server-set as `NOW()`. Not accepted from client. |
| Actor role | SM+. HTTP 403 if not SM+. Manager-only is explicitly forbidden. |
| Audit | `writeEnforcementAuditLog()` with action = `enforcement_hold_overridden`, `is_override_event = true`. Same transaction as status update. Mandatory. |

Permitted from: `open` or `approved_to_proceed`.

### 9.5 Emergency Bypass Governance

Superuser only. Separate from override. Higher visibility.

| Field | Rule |
|---|---|
| `bypass_reason` | Required. Min 20 chars. HTTP 422: `bypass_reason_required`. |
| `bypass_by` | Server-set from actor. Not accepted from client. |
| `bypass_at` | Server-set as `NOW()`. Not accepted from client. |
| Actor role | **Superuser only**. HTTP 403 if not Superuser. SM+ (non-Superuser) explicitly forbidden. |
| Audit | `writeEnforcementAuditLog()` with action = `enforcement_hold_emergency_bypassed`, `is_override_event = true`. Same transaction. Mandatory. |

**Emergency Bypass Visibility (R10) — 4 mandatory surfaces:**

| Surface | Requirement |
|---|---|
| Dashboard | `GET /api/oi/dashboard/enforcement-summary` must include `emergency_bypass_count` (all-time) and `emergency_bypass_count_this_month`. Both fields are mandatory in the response. |
| Hold detail | The hold detail response (`GET /api/oi/enforcement/holds/:holdId`) must include a top-level `emergency_bypass` object when `status = 'emergency_bypassed'`: `{ bypass_by_name, bypass_at, bypass_reason }`. This section is always present and clearly labelled in the UI hold detail panel. |
| Audit log | All emergency bypass events have `is_override_event = true` in `oi_enforcement_audit_log`. The audit log UI renders these rows with a distinct visual indicator (red badge "EMERGENCY BYPASS"). |
| Management KPI | `GET /api/oi/dashboard/enforcement-management-kpi` (see §11.4) must include `emergency_bypass_count_this_month` and `emergency_bypass_count_total` as dedicated KPI fields, displayed prominently in the management KPI panel. |

Permitted from: `open` or `approved_to_proceed`. Terminal state.

### 9.6 Full State Transition Table

| From | To | Action | Required Role | Pre-conditions | Side Effects |
|---|---|---|---|---|---|
| — | `open` | raise | Manager+ | §9.2 (5 checks) + ownership fields required | Insert hold; insert response rows (version snapshots); set `erp_entity_ref`; set `is_primary_hold`; write `enforcement_hold_raised` audit |
| `open` | `approved_to_proceed` | approve | Manager+ | `enforcement_level = 'mandatory'`; `approved_to_proceed_note` min 10 chars | Set `approved_to_proceed_by/at/note`; write `enforcement_hold_approved_to_proceed` audit |
| `open` or `approved_to_proceed` | `released` | release | Manager+ | §9.3 (3 checks) + `release_note` min 10 chars | Set `released_by`, `released_at`, `release_note` (all server-set, atomic); write `enforcement_hold_released` audit |
| `open` or `approved_to_proceed` | `overridden` | override | SM+ | `override_reason` min 20 chars | Set `override_by/at/reason` (server-set); write `enforcement_hold_overridden` audit (`is_override_event = true`) |
| `open` or `approved_to_proceed` | `emergency_bypassed` | emergency-bypass | **Superuser only** | `bypass_reason` min 20 chars | Set `bypass_by/at/reason` (server-set); write `enforcement_hold_emergency_bypassed` audit (`is_override_event = true`) |

---

## A. Audit Governance — Why `oi_audit_log` Cannot Be Reused (Amendment 001 Pattern)

This is the formal architectural decision record for the Phase 2B dedicated audit table.

### A.1 The DB Constraint

The `oi_audit_log` table (created in Phase 1A) has the following column definition in `shared/schema.ts`:

```
issueId: integer('issue_id').notNull().references(() => oiIssues.id, ...)
```

The `issue_id` column is `NOT NULL`. It is a foreign key to `oi_issues.id`. This is a hard DB constraint — not a soft rule. Any INSERT into `oi_audit_log` without a valid `issue_id` will be rejected by Postgres with a `NOT NULL constraint violation`. This cannot be bypassed without altering the table — which would break all Phase 1A–2A code that relies on `issue_id` being present.

### A.2 Amendment 001 Precedent

In Phase 2A, the same constraint was discovered when SOP audit entries were needed. The approved resolution (Amendment 001, `docs/phase2a-amendment-001-sop-audit-governance.md`) was:

> "Create a dedicated `oi_sop_audit_log` table with `sop_id NOT NULL`. Do not modify `oi_audit_log`. Use `writeSopAuditLog()` for all SOP audit writes."

Phase 2B enforcement audit follows identical reasoning:
- Enforcement events are not subordinate to any `oi_issues` record.
- `oi_audit_log.issue_id` is `NOT NULL` — it cannot receive enforcement audit entries.
- Creating `oi_enforcement_audit_log` with `control_id` and `hold_id` (both nullable; at least one required) is the correct pattern, consistent with Amendment 001.

### A.3 Architectural Principle

Each OI audit domain has its own dedicated audit table, keyed to its own primary entities:

| Domain | Audit Table | Primary FK | Audit Service |
|---|---|---|---|
| Issues (Phase 1A) | `oi_audit_log` | `issue_id NOT NULL` | `writeAuditLog()` |
| SOP (Phase 2A) | `oi_sop_audit_log` | `sop_id NOT NULL` | `writeSopAuditLog()` |
| Enforcement (Phase 2B) | `oi_enforcement_audit_log` | `control_id` or `hold_id` (one required) | `writeEnforcementAuditLog()` |

This pattern prevents cross-domain coupling and ensures each domain's audit trail is independently queryable, independently retainable, and independently governable.

### A.4 `writeEnforcementAuditLog()` Contract

- Signature: `writeEnforcementAuditLog(params: { controlId?: number, holdId?: number, action: OiAuditAction, actorId: number, actorName: string, actorRole: string, fieldName?: string, oldValue?: string, newValue?: string, context?: string, ipAddress?: string, isOverrideEvent?: boolean }): Promise<void>`
- Validates: at least one of `controlId` or `holdId` is non-null. Throws if both are null.
- Sets `is_override_event = true` automatically when action is `enforcement_hold_overridden` or `enforcement_hold_emergency_bypassed`.
- Issues INSERT only. Never UPDATE or DELETE.
- Must be called in the same DB transaction as the triggering mutation. Activation/release/override/bypass are only committed if the audit write succeeds.

---

## 10. Enforcement Audit — Mandatory Events

| Event | Action | `control_id` | `hold_id` | `is_override_event` |
|---|---|---|---|---|
| Control created | `enforcement_control_created` | populated | null | false |
| Control field updated | `field_updated` | populated | null | false |
| Control activated | `enforcement_control_activated` | populated | null | false |
| Control suspended | `enforcement_control_suspended` | populated | null | false |
| Control retired | `enforcement_control_retired` | populated | null | false |
| Hold raised | `enforcement_hold_raised` | populated | populated | false |
| Hold approved to proceed | `enforcement_hold_approved_to_proceed` | populated | populated | false |
| Hold released | `enforcement_hold_released` | populated | populated | false |
| Hold overridden | `enforcement_hold_overridden` | populated | populated | **true** |
| Hold emergency bypassed | `enforcement_hold_emergency_bypassed` | populated | populated | **true** |
| Checklist item submitted (checked) | `enforcement_checklist_item_checked` | populated | populated | false |
| Checklist item rejected | `enforcement_checklist_item_rejected` | populated | populated | false |
| Checklist item resubmitted | `enforcement_checklist_item_resubmitted` | populated | populated | false |

---

## 11. API Endpoints (28 endpoints)

### 11.1 Controls (8)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 1 | POST | `/api/oi/enforcement/controls` | Manager+ | Create control |
| 2 | GET | `/api/oi/enforcement/controls` | Any | List (filter: status, erp_entity_type, control_type, department, sop_id, enforcement_scope) |
| 3 | GET | `/api/oi/enforcement/controls/:controlId` | Any | Detail |
| 4 | PATCH | `/api/oi/enforcement/controls/:controlId` | Manager+ | Update (draft/suspended only) |
| 5 | POST | `/api/oi/enforcement/controls/:controlId/transition` | Role-gated | Activate / suspend / retire |
| 6 | GET | `/api/oi/enforcement/controls/:controlId/audit-log` | Any | Control audit log |
| 7 | GET | `/api/oi/sop/:sopId/enforcement-controls` | Any | All controls linked to a SOP |
| 8 | GET | `/api/oi/enforcement/erp/:erpEntityType/controls` | Any | All active controls for an ERP entity type |

### 11.2 Checklists (4)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 9 | POST | `/api/oi/enforcement/controls/:controlId/checklist` | Manager+ | Add item (draft only) |
| 10 | GET | `/api/oi/enforcement/controls/:controlId/checklist` | Any | List items |
| 11 | PATCH | `/api/oi/enforcement/controls/:controlId/checklist/:itemId` | Manager+ | Update item (draft only) |
| 12 | DELETE | `/api/oi/enforcement/controls/:controlId/checklist/:itemId` | Manager+ | Delete item (draft only) |

### 11.3 Holds (16)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 13 | POST | `/api/oi/enforcement/holds` | Manager+ | Raise hold (§9.2; ownership fields required) |
| 14 | GET | `/api/oi/enforcement/holds` | Any | List (filter: status, control_id, erp_entity_type, hold_type, enforcement_level, responsible_department) |
| 15 | GET | `/api/oi/enforcement/holds/:holdId` | Any | Detail (includes emergency_bypass object when applicable) |
| 16 | PATCH | `/api/oi/enforcement/holds/:holdId` | Manager+ | Assign/update `hold_approver_id`, `hold_owner_id`, `responsible_department`, `escalation_owner_id` (open only) |
| 17 | POST | `/api/oi/enforcement/holds/:holdId/approve` | Manager+ | Approve to proceed (mandatory only) |
| 18 | POST | `/api/oi/enforcement/holds/:holdId/release` | Manager+ | Release (§9.3 pre-conditions) |
| 19 | POST | `/api/oi/enforcement/holds/:holdId/override` | SM+ | Override (§9.4) |
| 20 | POST | `/api/oi/enforcement/holds/:holdId/emergency-bypass` | Superuser only | Emergency bypass (§9.5) |
| 21 | GET | `/api/oi/enforcement/holds/:holdId/audit-log` | Any | Hold audit log (bypass events displayed distinctly) |
| 22 | GET | `/api/oi/enforcement/erp/:erpEntityType/:erpEntityId/holds` | Any | All holds for a specific ERP entity instance |
| 23 | POST | `/api/oi/enforcement/holds/:holdId/checklist-responses` | Manager+ | Submit/update responses (batch) |
| 24 | GET | `/api/oi/enforcement/holds/:holdId/checklist-responses` | Any | Get responses |
| 25 | POST | `/api/oi/enforcement/holds/:holdId/checklist-responses/:responseId/reject` | Hold approver or SM+ | Reject a submitted response (§5.4 rejection workflow) |

### 11.4 Dashboards (4)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 26 | GET | `/api/oi/dashboard/enforcement-summary` | Any | Controls active, holds open/released/overridden; `emergency_bypass_count` and `emergency_bypass_count_this_month` mandatory |
| 27 | GET | `/api/oi/dashboard/enforcement-holds-by-type` | Any | Hold count by `hold_type` and `status` |
| 28 | GET | `/api/oi/dashboard/enforcement-management-kpi` | SM+ | `emergency_bypass_count_total`, `emergency_bypass_count_this_month`, `holds_overridden_count_this_month`, `avg_hold_open_duration_hours`, `released_without_override_pct`, `active_controls_count`, `controls_with_open_holds_count` |

---

## 12. Server Files (3 new files)

| File | Description |
|---|---|
| `server/oi-enforcement-audit-service.ts` | `writeEnforcementAuditLog()` — §A.4 contract; INSERT only; validates at least one of controlId/holdId; sets `is_override_event` automatically for override/bypass actions |
| `server/oi-enforcement-routes.ts` | 28 endpoints; all governance rules per this document; imports `writeEnforcementAuditLog` |
| `server/routes.ts` (patch) | Register `oiEnforcementRouter` after `oiSopRouter` |

---

## 13. Client Files (3 new + 5 patches)

### 13.1 New Files

| File | Description |
|---|---|
| `client/src/pages/oi/oi-enforcement-constants.ts` | All vocabulary: status labels, control_type labels (16), scope labels, hold_status labels, colour maps, VALID_* arrays |
| `client/src/pages/oi/oi-enforcement-register.tsx` | Control register: filterable table; create control dialog |
| `client/src/pages/oi/oi-enforcement-detail.tsx` | 5-tab control detail: Overview / Checklist / Holds / SOP Link / Audit Log |

### 13.2 Lazy Loader, Router, Sidebar (same as Revision 2 — no changes)

### 13.3 Integration Patches

| File | Patch |
|---|---|
| `client/src/pages/oi/oi-dashboard.tsx` | `EnforcementDashboardPanels`: summary (with emergency_bypass_count prominently), holds-by-type, management KPI panel (emergency bypass in red, SM+ only) |
| `client/src/pages/oi/oi-sop-detail.tsx` | `EnforcementControlsTab` as 7th tab |
| `client/src/pages/oi/oi-enforcement-detail.tsx` | Holds tab: `HoldDetailPanel` with checklist responses; emergency bypass section visible and prominent when status = `emergency_bypassed`; audit log renders `is_override_event = true` rows with red "EMERGENCY BYPASS" badge |
| `client/src/pages/oi/oi-enforcement-register.tsx` | Open hold count badge; `emergency_bypassed` rows visually distinct |

### 13.4 `oi-enforcement-constants.ts` Vocabulary

```typescript
VALID_CONTROL_TYPES (16): hold_point, qc_hold, dispatch_hold, procurement_hold,
  drawing_gate, dvs_gate, fat_block, sat_block, commissioning_block,
  dvs_revision_mismatch, dvs_unverified_drawing, dvs_missing_custom_property,
  procurement_blocked_vendor, procurement_missing_tbe_cbe,
  procurement_missing_qc_requirement, procurement_expired_vendor_qualification

VALID_ERP_ENTITY_TYPES (8): (same as §1)
VALID_ENFORCEMENT_SCOPES: ['global', 'department', 'project', 'equipment_type']
VALID_ENFORCEMENT_LEVELS: ['advisory', 'mandatory']
VALID_HOLD_STATUSES: ['open', 'approved_to_proceed', 'released', 'overridden', 'emergency_bypassed']
VALID_RESPONSE_STATUSES: ['pending', 'submitted', 'rejected']
HOLD_STATUS_COLORS: { open: 'yellow', approved_to_proceed: 'blue', released: 'green', overridden: 'orange', emergency_bypassed: 'red' }
RESPONSE_STATUS_COLORS: { pending: 'gray', submitted: 'green', rejected: 'red' }
```

---

## 14. Drizzle Schema Additions (`shared/schema.ts`)

In order:
1. 12 new values in `oiAuditActionEnum` TypeScript array
2. `oiEnforcementControls` (with `enforcement_scope`, `scope_project_id`, `scope_equipment_type`, `control_checklist_version`)
3. `oiEnforcementChecklists`
4. `oiEnforcementHolds` (with `hold_owner_id`, `responsible_department`, `escalation_owner_id`, `is_primary_hold`, `bypass_*`)
5. `oiEnforcementChecklistResponses` (with `sop_revision_number`, `checklist_revision_number`, `response_status`, `rejection_*`)
6. `oiEnforcementAuditLog` (with `is_override_event`)
7. Insert schemas: `createInsertSchema(...).omit({ id: true, createdAt: true, updatedAt: true })` for all 5 tables
8. Exported TypeScript types for all 5 tables

---

## 15. DB Migration (psql direct)

**5 tables + 12 enum values + 14 indexes + 1 unique partial index**

### Step 1: Enum additions (each standalone)
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
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_checklist_item_rejected';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_hold_emergency_bypassed';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'enforcement_checklist_item_resubmitted';
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
  control_type             VARCHAR(50) NOT NULL,
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
  hold_type                 VARCHAR(50) NOT NULL,
  enforcement_scope         VARCHAR(30) NOT NULL,
  is_primary_hold           BOOLEAN NOT NULL DEFAULT FALSE,
  reason                    TEXT NOT NULL,
  status                    VARCHAR(30) NOT NULL DEFAULT 'open',
  hold_owner_id             INTEGER NOT NULL REFERENCES users(id),
  responsible_department    VARCHAR(100) NOT NULL,
  escalation_owner_id       INTEGER NOT NULL REFERENCES users(id),
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
  id                        SERIAL PRIMARY KEY,
  hold_id                   INTEGER NOT NULL REFERENCES oi_enforcement_holds(id) ON DELETE CASCADE,
  checklist_item_id         INTEGER NOT NULL REFERENCES oi_enforcement_checklists(id) ON DELETE RESTRICT,
  sop_revision_number       INTEGER NOT NULL,
  checklist_revision_number INTEGER NOT NULL,
  response_status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  is_checked                BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_note             TEXT,
  responded_by              INTEGER REFERENCES users(id),
  responded_at              TIMESTAMP,
  rejection_reason          TEXT,
  rejected_by               INTEGER REFERENCES users(id),
  rejected_at               TIMESTAMP,
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (hold_id, checklist_item_id)
);

CREATE TABLE oi_enforcement_audit_log (
  id                SERIAL PRIMARY KEY,
  control_id        INTEGER REFERENCES oi_enforcement_controls(id) ON DELETE SET NULL,
  hold_id           INTEGER REFERENCES oi_enforcement_holds(id) ON DELETE SET NULL,
  action            oi_audit_action NOT NULL,
  actor_id          INTEGER NOT NULL REFERENCES users(id),
  actor_name        TEXT NOT NULL,
  actor_role        TEXT NOT NULL,
  field_name        TEXT,
  old_value         TEXT,
  new_value         TEXT,
  context           TEXT,
  ip_address        TEXT,
  is_override_event BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
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
CREATE INDEX idx_oi_enforcement_holds_owner ON oi_enforcement_holds(hold_owner_id);
CREATE INDEX idx_oi_enforcement_holds_dept ON oi_enforcement_holds(responsible_department);
CREATE INDEX idx_oi_enforcement_checklist_resp_hold_id ON oi_enforcement_checklist_responses(hold_id);
CREATE INDEX idx_oi_enforcement_audit_control_id ON oi_enforcement_audit_log(control_id);
CREATE INDEX idx_oi_enforcement_audit_hold_id ON oi_enforcement_audit_log(hold_id);
CREATE INDEX idx_oi_enforcement_audit_override ON oi_enforcement_audit_log(is_override_event) WHERE is_override_event = TRUE;

CREATE UNIQUE INDEX idx_oi_enforcement_holds_no_duplicate_open
  ON oi_enforcement_holds(control_id, erp_entity_type, erp_entity_id)
  WHERE status = 'open';
```

---

## 16. Mandatory Corrections — Consolidated

| # | Rule | Error Code / Enforcement |
|---|---|---|
| C1 | `oi_audit_log` NOT used for enforcement. Use `oi_enforcement_audit_log` only via `writeEnforcementAuditLog()`. | Never import `oiAuditLog` in `oi-enforcement-*.ts` |
| C2 | `approver_id ≠ owner_id` at create, update, activation. | HTTP 422: `approver_must_differ_from_owner` |
| C3 | All 4 activation pre-conditions checked at activation (§7.3). | HTTP 422 with specific code per condition |
| C4 | Enforcement activation approval rule (§7.2): `approved_by`/`approved_at` server-set; audit mandatory in same transaction. | Activation rolled back if audit write fails |
| C5 | Duplicate active control check inside advisory lock at activation. | HTTP 409: `duplicate_active_control` |
| C6 | Hold ownership: `hold_owner_id`, `responsible_department`, `escalation_owner_id` all required at raise time. | HTTP 422: `hold_owner_required` / `responsible_department_required` / `escalation_owner_required` |
| C7 | Hold raise scope check per §3. | HTTP 422: `entity_out_of_scope` |
| C8 | `erp_entity_ref` server-populated; ERP entity existence verified. | HTTP 404: `erp_entity_not_found` |
| C9 | Response `sop_revision_number` and `checklist_revision_number` server-populated at raise time. Immutable. | Not accepted from client |
| C10 | Checklist responses immutable after submission by submitter. Only hold_approver or SM+ can reject. | HTTP 422: `response_immutable_after_submission` |
| C11 | Mandatory release evidence rule (§9.3): 3 checks; `released_by`/`released_at`/`release_note` server-set atomically. | HTTP 422 with specific codes; server-set fields not accepted from client |
| C12 | `hold_approver_id` non-null required before release. | HTTP 422: `hold_approver_not_assigned` |
| C13 | Override SM+ only. | HTTP 403 if not SM+ |
| C14 | Emergency bypass Superuser only. SM+ (non-Superuser) forbidden. | HTTP 403 if not Superuser |
| C15 | Override and bypass: `is_override_event = true` in audit log. Audit in same transaction. | `writeEnforcementAuditLog()` auto-sets flag |
| C16 | Emergency bypass visible in 4 surfaces (§9.5). `emergency_bypass_count` and `emergency_bypass_count_this_month` mandatory in summary and KPI responses. | Dashboard endpoint tests must verify both fields |
| C17 | `oi_enforcement_audit_log` immutable: no UPDATE, no DELETE, ever. | No delete/update route; INSERT-only service |
| C18 | `writeEnforcementAuditLog()` INSERT-only; validated; auto-sets `is_override_event`. | §A.4 contract |
| C19 | No automatic ERP transaction mutation. No writes to ERP entity tables in enforcement code. | Zero writes to `epc_purchase_orders`, `epc_work_orders`, etc. in `oi-enforcement-*.ts` |
| C20 | No AI, auto-enforcement, auto-hold raising, predictive blocking, auto-generated checklists. | Per Future-Phase Leakage Guard section |

---

## 17. Existing Infrastructure Not Modified

| Item | Status |
|---|---|
| `oi_audit_log` | Unchanged |
| `oi_sop_audit_log` | Unchanged |
| `writeAuditLog()`, `writeSopAuditLog()` | Unchanged — not used in Phase 2B |
| All existing ERP routes | Unchanged — Phase 2B does not modify ERP state machines |
| `oi_audit_action` enum | Additive only (12 new values) |
| Phase 1A–2A client pages | Only `oi-dashboard.tsx` and `oi-sop-detail.tsx` patched (additive) |

---

*Prepared by: Architecture review session — 2026-05-22 (Revision 3)*  
*STOP — awaiting approval before implementation.*
