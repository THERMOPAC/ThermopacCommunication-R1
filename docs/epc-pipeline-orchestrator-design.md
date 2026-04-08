# EPC Pipeline Orchestrator — Design Document

**Status:** DRAFT — Pending Review & Approval  
**Author:** Agent  
**Date:** 2026-04-08  
**Scope:** End-to-end controlled automation from Approved Offer → IO Generation

---

## 1. Current Workflow Stages (As-Is)

The EPC project lifecycle has **12 discrete stages**, each with a source entity, status transitions, and gate conditions.

| # | Stage | Entity | Status Flow | Current Behavior |
|---|-------|--------|-------------|-----------------|
| S1 | Offer Approval | `offers` | Draft → Approved | Manual — Manager+ confirms |
| S2 | Offer → Project Conversion | `projects` | (created in `planning`) | Manual — user clicks "Convert" |
| S3 | Project Items Created | `project_items` | (created) | Auto during S2, BUT `project.item.added` event NOT emitted (bug) |
| S4 | Planning Records Created | `item_planning_records` | → `draft` | Should be auto via subscriber, broken due to S3 bug |
| S5 | Planning Review & Release | `item_planning_records` | draft → under_review → released | Manual — 3 clicks (submit, review, release) |
| S6 | Execution Records Created | `procurement_execution_records` / `production_execution_records` | → `draft` | Auto on S5 release |
| S7 | Execution Mark Ready | execution records | draft → under_preparation → ready | Manual — 2 clicks |
| S8 | Preparation Records Created | `wo_preparation_records` / `po_preparation_records` | → `draft` | Auto on S7 mark-ready |
| S9 | Preparation Review & Approve | prep records | draft → under_review → ready_for_creation | Manual — 2 clicks |
| S10 | WO/PO Created | `epc_work_orders` / `epc_purchase_orders` | → `draft` | Manual — 1 click |
| S11 | WO/PO Approve & Issue | WO/PO | draft → approved → released/issued | Manual — 2 clicks (separation of duties enforced) |
| S12 | IO Auto-Generated | `inspection_orders` | → `pending` | Auto on S11 issue/release |

**Total manual actions per item today: ~10 clicks across 6 stages.**

---

## 2. Stage-by-Stage Automation Policy Matrix

Each stage is classified with one of four automation policies:

| Policy | Meaning |
|--------|---------|
| **Always Auto** | No human needed. System advances unconditionally. |
| **Conditional Auto** | System advances if eligibility rules pass. Stops and alerts if any rule fails. |
| **Manual Approval Required** | Human must explicitly approve. System prepares the work and notifies, but does not advance. |
| **Never Auto** | Always requires human action. Cannot be automated regardless of mode. |

### Policy Matrix by Automation Mode

| # | Stage | Manual Mode | Assisted Mode | Express Mode | Full Auto Mode |
|---|-------|-------------|---------------|--------------|----------------|
| S1 | Offer Approval | Manual | Manual | Manual | Manual Approval Required |
| S2 | Offer → Project | Manual | Manual | Conditional Auto | Conditional Auto |
| S3 | Project Items Created | Always Auto | Always Auto | Always Auto | Always Auto |
| S4 | Planning Records Created | Always Auto | Always Auto | Always Auto | Always Auto |
| S5a | Planning Submit for Review | Manual | Conditional Auto | Conditional Auto | Conditional Auto |
| S5b | Planning Review | Manual | Manual | Conditional Auto | Conditional Auto |
| S5c | Planning Release | Manual | Manual Approval Required | Conditional Auto | Conditional Auto |
| S6 | Execution Records Created | Always Auto | Always Auto | Always Auto | Always Auto |
| S7a | Execution Start Preparation | Manual | Conditional Auto | Conditional Auto | Conditional Auto |
| S7b | Execution Mark Ready | Manual | Conditional Auto | Conditional Auto | Conditional Auto |
| S8 | Prep Records Created | Always Auto | Always Auto | Always Auto | Always Auto |
| S9a | Prep Submit for Review | Manual | Conditional Auto | Conditional Auto | Conditional Auto |
| S9b | Prep Approve | Manual | Manual Approval Required | Conditional Auto | Conditional Auto |
| S10 | WO/PO Created | Manual | Conditional Auto | Conditional Auto | Conditional Auto |
| S11a | WO/PO Approve | Manual | Manual Approval Required | Manual Approval Required | Conditional Auto |
| S11b | WO/PO Issue | Manual | Manual Approval Required | Manual Approval Required | Conditional Auto |
| S12 | IO Auto-Generated | Always Auto | Always Auto | Always Auto | Always Auto |

### Mode Descriptions

| Mode | When to Use | Human Involvement |
|------|------------|-------------------|
| **Manual** | Default. New customers, custom projects, first-time configurations. | Every stage requires explicit human action. |
| **Assisted** | Repeat customers, known project types. System does the routine work, humans approve key gates. | Auto-creates and auto-submits. Humans approve planning release, prep approval, and WO/PO issuance. |
| **Express** | Pre-approved customers with standard templates. Low-risk, repeat orders. | Auto-advances through planning and preparation. Humans approve WO/PO issuance only. |
| **Full Auto** | Strict eligibility required. Only for approved customers, standard templates, clean compliance. | System handles everything. Humans are notified and can intervene, but pipeline does not wait. |

---

## 3. Eligibility Rules for Full Auto Mode

A project may only run in Full Auto if ALL of the following rules pass. Each rule is evaluated independently. If ANY rule fails, the pipeline stops at that stage and creates an alert.

### 3.1 Customer Eligibility

| Rule ID | Rule | Check | Source |
|---------|------|-------|--------|
| CE-01 | Customer has SAP sync | `customers.sap_sync_status = 'synced'` | customers table |
| CE-02 | Customer has credit line | `customers.sap_credit_line > 0` | customers table |
| CE-03 | Customer balance within limit | `customers.sap_balance < customers.sap_credit_line` | customers table |
| CE-04 | Customer has geography codes | `continent_code IS NOT NULL AND country_code IS NOT NULL AND short_code IS NOT NULL` | customers table |
| CE-05 | Customer auto-approved flag | `customers.auto_pipeline_approved = true` | NEW field (to be added) |

### 3.2 Project Eligibility

| Rule ID | Rule | Check | Source |
|---------|------|-------|--------|
| PE-01 | Project type is standard | `projects.project_type IN (approved_types_list)` | config / feature flag |
| PE-02 | Project has manager assigned | `projects.manager_id IS NOT NULL` | projects table |
| PE-03 | Project has valid dates | `target_end_date > start_date` and both present | projects table |
| PE-04 | Project not frozen | `status NOT IN ('canceled', 'completed', 'on_hold')` | projects table |

### 3.3 Planning Data Completeness

| Rule ID | Rule | Check | Source |
|---------|------|-------|--------|
| PD-01 | All items have Make/Buy classification | No project_items with NULL make_or_buy | project_items |
| PD-02 | All Make items have drawings | Drawing control exists with released_for_manufacturing | epc_drawing_controls |
| PD-03 | All items have BOM (if applicable) | BOM header exists with status released/locked | epc_bom_headers |
| PD-04 | No items with missing master data | master_item_id IS NOT NULL for all project_items | project_items |

### 3.4 Compliance & Quality

| Rule ID | Rule | Check | Source |
|---------|------|-------|--------|
| CQ-01 | No open critical NCRs on customer | No NCRs with severity=critical AND status=open for this customer | non_conformance_reports |
| CQ-02 | BOM gating strict mode enabled | Feature flag `EPC_BOM_GATING_STRICT` is ON | epc_migration_feature_flags |
| CQ-03 | Planning gating strict mode enabled | Feature flag `EPC_PLANNING_GATING_STRICT` is ON | epc_migration_feature_flags |

### 3.5 Commercial & Procurement

| Rule ID | Rule | Check | Source |
|---------|------|-------|--------|
| CP-01 | Offer has delivery terms | `offers.delivery_terms IS NOT NULL` | offers table |
| CP-02 | Offer has payment terms | `offers.payment_terms IS NOT NULL` | offers table |
| CP-03 | No active CCOs on the offer chain | No open Commercial Change Orders | commercial_change_orders |
| CP-04 | Offer amount > 0 | `offers.total_amount > 0` | offers table |

---

## 4. Orchestrator Design

### 4.1 Architecture: State Machine, Not Chained Buttons

The orchestrator is a **centralized pipeline engine** that:
- Owns the state machine for each project's automation lifecycle
- Evaluates policies and eligibility rules at each stage gate
- Advances, pauses, or blocks based on policy + rule outcomes
- Logs every decision with full audit trail
- Creates tasks/alerts when human action is needed

```
┌─────────────────────────────────────────────────────────┐
│                  Pipeline Orchestrator                    │
│                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐            │
│  │  Policy   │   │Eligibility│   │  State   │            │
│  │  Engine   │──▶│  Checker  │──▶│ Machine  │            │
│  └──────────┘   └──────────┘   └──────────┘            │
│       │              │              │                    │
│       ▼              ▼              ▼                    │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐            │
│  │  Audit   │   │  Alert   │   │  Action  │            │
│  │  Logger  │   │ Creator  │   │ Executor │            │
│  └──────────┘   └──────────┘   └──────────┘            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Core Components

#### A. `pipeline_runs` table (NEW)
Tracks each project's pipeline execution state.

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| project_id | integer FK | Target project |
| offer_id | integer FK | Source offer |
| automation_mode | varchar(20) | `manual`, `assisted`, `express`, `full_auto` |
| current_stage | varchar(30) | Current pipeline stage (S1–S12) |
| stage_status | varchar(20) | `pending`, `in_progress`, `completed`, `blocked`, `skipped` |
| blocked_reason | text | Why pipeline stopped (null if not blocked) |
| blocked_rule_id | varchar(20) | Which rule failed (e.g., CE-03, PD-02) |
| started_at | timestamp | Pipeline start time |
| completed_at | timestamp | Pipeline completion time |
| started_by | integer FK | User who initiated |
| created_at | timestamp | |

#### B. `pipeline_stage_log` table (NEW)
Immutable audit log of every stage transition.

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| pipeline_run_id | integer FK | Parent run |
| stage | varchar(30) | Stage code (S1–S12) |
| action | varchar(30) | `advanced`, `blocked`, `manual_override`, `skipped` |
| automation_policy | varchar(30) | Policy that applied |
| eligibility_result | jsonb | Full rule evaluation results |
| entity_type | varchar(50) | Entity acted on (e.g., `item_planning_records`) |
| entity_id | integer | ID of the entity |
| performed_by | varchar(20) | `system` or user ID |
| reason | text | Human-readable explanation |
| created_at | timestamp | |

#### C. Pipeline Policy Engine (`server/pipeline/policy-engine.ts`)

```
function getStagePolicy(stage, automationMode) → AutomationPolicy
  - Reads from the policy matrix
  - Returns: 'always_auto' | 'conditional_auto' | 'manual_approval' | 'never_auto'

function evaluateEligibility(projectId, stage) → EligibilityResult
  - Runs all applicable rules for the stage
  - Returns: { eligible: boolean, failedRules: Rule[], passedRules: Rule[] }
```

#### D. Pipeline State Machine (`server/pipeline/state-machine.ts`)

```
function advancePipeline(pipelineRunId) → PipelineAdvanceResult
  1. Load current stage from pipeline_runs
  2. Get policy for current stage + automation mode
  3. If policy = 'always_auto':
       Execute stage action → advance to next stage → recurse
  4. If policy = 'conditional_auto':
       Run eligibility check
       If all rules pass → execute stage action → advance → recurse
       If any rule fails → block pipeline → create alert → stop
  5. If policy = 'manual_approval':
       Create task for approver → set stage_status = 'pending' → stop
  6. If policy = 'never_auto':
       Stop (should not reach here in automation)
  7. Log every decision to pipeline_stage_log
```

#### E. Pipeline Action Executor (`server/pipeline/action-executor.ts`)

Each stage has a corresponding action function:

| Stage | Action Function | What It Does |
|-------|----------------|--------------|
| S2 | `executeOfferConversion()` | Creates project, items, phases |
| S3 | `emitItemEvents()` | Fires `project.item.added` for each item |
| S4 | `createPlanningRecords()` | Creates planning records for all items |
| S5 | `advancePlanning()` | Submits → reviews → releases planning records |
| S6 | (auto from S5) | Execution records created by release handler |
| S7 | `advanceExecution()` | Starts and marks execution records ready |
| S8 | (auto from S7) | Prep records created by mark-ready handler |
| S9 | `advancePreparation()` | Submits and approves prep records |
| S10 | `createOrders()` | Creates WO/PO from approved prep records |
| S11 | `approveAndIssueOrders()` | Approves and issues WO/PO |
| S12 | (auto from S11) | IO auto-triggered by issue handler |

#### F. Pipeline Alert Creator (`server/pipeline/alert-creator.ts`)

When the pipeline blocks:
1. Creates an `alert` with priority = `high`
2. Creates a `task` assigned to the appropriate role:
   - Planning blocks → assigned to Project Manager
   - BOM/Drawing blocks → assigned to Design Lead
   - Approval blocks → assigned to Senior Manager
   - Compliance blocks → assigned to Quality Manager
3. Logs to `pipeline_stage_log` with full context

---

## 5. Exception Handling Model

### 5.1 Exception Categories

| Category | Examples | Pipeline Behavior |
|----------|----------|-------------------|
| **Data Missing** | No Make/Buy classification, missing drawing, no BOM | Block at affected stage. Create task for data owner. |
| **Gate Failed** | BOM not released, planning not released | Block at gate stage. Create task for approver. |
| **Compliance Block** | Open critical NCR, failed inspection | Block pipeline entirely. Create high-priority alert. |
| **Commercial Exception** | Active CCO, credit limit exceeded, missing terms | Block at commercial stage. Create task for sales/finance. |
| **System Error** | DB failure, GCS error, timeout | Block pipeline. Create alert for system admin. Retain pipeline state for retry. |

### 5.2 Exception Resolution Flow

```
Pipeline Blocked
    ↓
Alert + Task Created (with blocked_reason, blocked_rule_id, context)
    ↓
Human resolves the issue (uploads drawing, approves BOM, etc.)
    ↓
Human clicks "Resume Pipeline" (or system detects resolution via subscriber)
    ↓
Orchestrator re-evaluates eligibility from blocked stage
    ↓
If rules pass → advance    If rules still fail → remain blocked
```

### 5.3 Manual Override

- Authorized roles (Senior Manager+) can override a blocked stage
- Override requires a written justification
- Override is logged to `pipeline_stage_log` with action = `manual_override`
- Override does NOT skip eligibility — it marks the stage as "approved despite failure"
- All overrides are visible in the audit trail

---

## 6. Audit & Logging Model

### 6.1 What Gets Logged

Every pipeline action produces an immutable audit record in `pipeline_stage_log`:

| Event | Logged Data |
|-------|-------------|
| Stage advance (auto) | stage, policy, all eligibility rules evaluated, entity created, performed_by=system |
| Stage advance (manual) | stage, policy, user who approved, entity created |
| Stage blocked | stage, policy, failed rules with details, blocked_reason |
| Manual override | stage, user, justification, original failed rules |
| Pipeline started | offer_id, project_id, automation_mode, started_by |
| Pipeline completed | total duration, stages completed, stages blocked count |
| Pipeline error | stage, error message, stack context |

### 6.2 Audit Queries

The log supports these queries out of the box:
- "Show me every decision made for project X"
- "Show me all blocked pipelines and why"
- "Show me all manual overrides in the last 30 days"
- "What is the average time per stage?"
- "Which eligibility rule fails most often?"

### 6.3 Integration with Existing Systems

- Pipeline events are also written to `project_workflow_events` for backward compatibility
- Alerts use the existing `alerts` table with a new `source = 'pipeline_orchestrator'`
- Tasks use the existing `tasks` table with a new `source = 'pipeline_orchestrator'`

---

## 7. Schema Changes Required

### New Tables
1. `pipeline_runs` — tracks pipeline execution state per project
2. `pipeline_stage_log` — immutable audit trail per stage transition
3. `pipeline_eligibility_rules` — configurable rules (optional, can start hardcoded)

### Modified Tables
1. `customers` — add `auto_pipeline_approved` (boolean, default false)
2. `projects` — add `automation_mode` (varchar, default 'manual')
3. `projects` — add `pipeline_run_id` (integer FK, nullable)

### New Feature Flags
1. `EPC_PIPELINE_ORCHESTRATOR_ENABLED` — master switch for the orchestrator
2. `EPC_PIPELINE_FULL_AUTO_ENABLED` — enables Full Auto mode (separate from orchestrator)

---

## 8. New Server Files

| File | Purpose |
|------|---------|
| `server/pipeline/policy-engine.ts` | Policy matrix + eligibility rule evaluation |
| `server/pipeline/state-machine.ts` | Core state machine + advancePipeline() |
| `server/pipeline/action-executor.ts` | Stage action functions |
| `server/pipeline/alert-creator.ts` | Alert/task creation on blocks |
| `server/pipeline/eligibility-rules.ts` | Individual rule implementations |
| `server/pipeline/pipeline-routes.ts` | API endpoints for pipeline control |
| `server/pipeline/pipeline-types.ts` | TypeScript types and enums |

---

## 9. API Endpoints (Planned)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/pipeline/start` | Start pipeline for an approved offer |
| GET | `/api/pipeline/:projectId` | Get pipeline status for a project |
| POST | `/api/pipeline/:projectId/resume` | Resume a blocked pipeline |
| POST | `/api/pipeline/:projectId/override` | Manual override of a blocked stage |
| PATCH | `/api/pipeline/:projectId/mode` | Change automation mode |
| GET | `/api/pipeline/:projectId/log` | Get full audit log |
| GET | `/api/pipeline/dashboard` | Pipeline dashboard (all active runs) |
| POST | `/api/pipeline/:projectId/stop` | Manually stop a running pipeline |

---

## 10. Separation of Duties Enforcement

Even in Full Auto mode, the following separation rules are respected:

| Rule | Enforcement |
|------|------------|
| WO/PO approver ≠ creator | System uses different "virtual actors" (system-creator vs assigned-approver) |
| WO/PO issuer ≠ approver | System assigns issuance to a different authorized role |
| Planning releaser must be Senior Manager+ | System checks role before auto-release |
| Override requires Senior Manager+ | Hard-coded role check |

In Full Auto mode, the system performs actions as `performed_by = 'system'`, and approval/issuance actions are assigned to the project's designated approvers by role. If no qualifying approver is available, the pipeline blocks and creates a task.

---

## 11. Implementation Order (Proposed)

| Phase | Deliverable | Effort |
|-------|-------------|--------|
| Phase 1 | Schema + types + policy engine | Small |
| Phase 2 | State machine + action executor (Manual + Assisted modes) | Medium |
| Phase 3 | Eligibility rules engine + alert creator | Medium |
| Phase 4 | Express mode + pipeline API routes | Medium |
| Phase 5 | Full Auto mode + separation of duties | Medium |
| Phase 6 | Dashboard UI + audit log viewer | Medium |
| Phase 7 | Fix offer-conversion event emission bug (S3) | Small |

---

## 12. Open Questions for Review

1. **Separation of duties in Full Auto**: Should the system auto-assign approvers by role, or should each project pre-designate an "approval chain"?
2. **Pipeline retry policy**: Should blocked pipelines auto-retry when the blocking condition is resolved (event-driven), or only on manual "Resume"?
3. **Partial automation**: Should it be possible to set different modes per item (e.g., standard items on Express, custom items on Manual)?
4. **Existing projects**: Should existing projects be retroactively eligible for pipeline automation, or only new projects created after the feature is enabled?
5. **Pipeline timeout**: Should there be a maximum age for a pipeline run before it auto-pauses and alerts?

---

**END OF DESIGN DOCUMENT**

**Action Required:** Review and approve this design before implementation begins.
