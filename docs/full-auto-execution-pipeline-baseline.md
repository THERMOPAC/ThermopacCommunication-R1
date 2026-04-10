# Full-Auto Execution Pipeline — Frozen Baseline

**Status**: FROZEN BASELINE  
**Version**: 1.0  
**Date**: 2026-04-10  
**Author**: System Architect  

---

## 1. Purpose

Define a deterministic, auditable, zero-trust automation pipeline that converts an offer-to-project action into a fully-executed EPC lifecycle — generating, approving, activating, releasing/issuing all execution entities (DO, WO, PO, IO) and creating quality plans and inspection records — without human approval gates, while preserving every technical validity check.

## 2. Scope

| In Scope | Out of Scope |
|----------|-------------|
| Projects with `automation_mode = 'full_auto'` | Manual-mode projects (unchanged) |
| DO / WO / PO / IO lifecycle automation | BOM creation or modification |
| Quality Plan creation for WOs only | Quality Plans for POs |
| Inspection Execution Record creation + scheduling | Inspection execution/completion |
| Audit event coverage for every automated step | UI redesign of existing pages |
| Pipeline lock, heartbeat, retry/resume | Multi-project batch automation |

## 3. Automation Modes

| Mode | Behavior |
|------|----------|
| `manual` (default) | Current behavior. All approvals, activations, releases require human action. |
| `full_auto` | System orchestrator executes entire pipeline after draft generation. No human approval gates. All technical validity checks preserved. |

The `automation_mode` is set on the `projects` table and determined at offer-to-project conversion time. It is immutable after pipeline execution begins.

## 4. Structured Audit Identity

### 4.1 System Attribution Model

The orchestrator does NOT impersonate any human user. All automated actions use structured system identity:

```
actor_type   = 'system'
actor_ref    = 'full_auto_orchestrator'
trigger_user_id = <the user who initiated the conversion>
```

- `trigger_user_id` is stored ONLY in audit event payloads and the `automation_pipeline_runs` table.
- Entity-level action fields (`approved_by`, `released_by`, `issued_by`) are set to NULL for system-automated actions. These fields remain non-null only for human actions.
- Separation-of-duties checks are bypassed for `actor_type = 'system'` — no human identity means no conflict.
- Self-action checks use `created_source_type = 'system'` to identify system-generated entities.

### 4.2 Source Tracking Fields

Added to 6 entity tables (`execution_drafts`, `epc_drawing_orders`, `epc_work_orders`, `epc_purchase_orders`, `quality_planning_records`, `inspection_execution_records`):

| Column | Type | Purpose |
|--------|------|---------|
| `created_source_type` | `varchar(20)` | `'manual'` or `'system'` |
| `created_source_ref` | `varchar(100)` | e.g. `'full_auto_orchestrator'`, `'offer_conversion'` |
| `automation_run_id` | `uuid` | Links to `automation_pipeline_runs.run_id` (NULL for manual) |

## 5. Orchestrator Context Object

```typescript
interface AutomationContext {
  runId: string;           // UUID, unique per pipeline execution
  projectId: number;
  triggerUserId: number;   // Human who initiated conversion
  actorType: 'system';
  actorRef: 'full_auto_orchestrator';
  startedAt: Date;
  currentPhase: number;
  currentStep: string;
}
```

Passed to every step handler. Never mutated — new context created for each phase.

## 6. Dependency-Aware Phase Sequence

### Phase 1: Independent Draft Approval
- Auto-approve all applicable DO drafts (no dependencies)
- Auto-approve all applicable PO drafts (no dependencies)
- Idempotency: skip drafts already in `approved` status

### Phase 2: Cascade-Unblocked Draft Approval
- DO approval cascades unblock WO drafts (`dependency_status: blocked → met`)
- Auto-approve all applicable WO drafts (now unblocked)
- Idempotency: skip drafts already in `approved` status

### Phase 3: Draft Activation + Entity Approval/Release
- Activate all approved DO drafts → create `epc_drawing_orders`
- Activate all approved WO drafts → create `epc_work_orders`
- Activate all approved PO drafts → create `epc_purchase_orders`
- Auto-approve WOs (draft → approved)
- Auto-release WOs (approved → released)
- Auto-approve POs (draft → approved)
- Auto-issue POs (approved → issued)
- Idempotency: skip already-activated drafts; skip entities already in target status

### Phase 4: Quality & Inspection Automation
- Create Quality Plans for released WOs only (not POs)
- Create Inspection Execution Records for each Quality Plan
- Auto-schedule inspections with QC Senior Executive (by dept+role lookup)
- Trigger Inspection Orders via existing WO-release and PO-issuance triggers
- Link IO drafts to triggered inspection orders
- Idempotency: skip if quality plan / inspection already exists for WO

### Phase 5: Completion
- Verify all applicable entities are in terminal states
- Mark pipeline run as `completed`
- Set `automation_completed_at` on project
- Emit `full_auto.pipeline_complete` event

## 7. WO Quality vs PO Inspection Separation

| Entity | Quality Plan | Inspection Execution | Inspection Order |
|--------|-------------|---------------------|-----------------|
| WO (released) | YES — auto-created | YES — auto-created + scheduled | YES — via existing trigger |
| PO (issued) | NO | NO | YES — via existing trigger |

Quality Plans are manufacturing-context only. PO inspection orders are triggered by the existing `triggerInspectionOnPoIssuance()` mechanism.

## 8. Execution-Ready Computed Rules

Execution-ready is NOT assumed — it is computed per entity:

```
project_execution_ready = ALL applicable drafts are in terminal state
  WHERE applicable = true
  AND (
    activation_status = 'activated'
    OR approval_status IN ('approved', 'activated')  -- for items proceeding through pipeline
  )
```

Only `applicable = true` entities are considered. Non-applicable drafts are excluded from readiness computation.

## 9. Pipeline Lock & Re-Entry Protection

### 9.1 Pipeline Runs Table

```sql
automation_pipeline_runs (
  id           SERIAL PRIMARY KEY,
  run_id       UUID NOT NULL UNIQUE,
  project_id   INTEGER NOT NULL REFERENCES projects(id),
  status       VARCHAR(30) NOT NULL DEFAULT 'running',
  current_phase INTEGER NOT NULL DEFAULT 1,
  current_step  VARCHAR(100),
  trigger_user_id INTEGER NOT NULL,
  started_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  failed_at    TIMESTAMP,
  failure_step VARCHAR(100),
  failure_message TEXT,
  failure_entity_id INTEGER,
  failure_entity_type VARCHAR(50),
  step_results JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
)
```

### 9.2 Lock Mechanism

- Before starting: check for existing `status = 'running'` run for this project
- If found and `heartbeat_at` < NOW() - 10 minutes → mark as `stale`, allow new run
- If found and `heartbeat_at` >= NOW() - 10 minutes → reject with `PIPELINE_ALREADY_RUNNING`
- Heartbeat updated at each phase boundary

### 9.3 Re-Entry Protection

- Each step checks entity existence before creating
- Re-entry of a failed run: same `run_id` resumes from `current_phase` / `current_step`
- New run for same project: new `run_id`, skips already-existing entities by existence checks (not only by runId)

## 10. Retry/Resume Rules

| Scenario | Behavior |
|----------|----------|
| Same run resume | Resume from `current_step` using `step_results` to skip completed steps |
| New run after failure | New `run_id`; each step does existence check before creating entities |
| Entity already exists | Skip creation, log `full_auto.entity_skipped` event, continue |
| Step fails | Log failure, set `status = 'failed'`, halt pipeline. No partial rollback — each step leaves system in valid state. |

### Step-Level Transaction Safety

Each step is wrapped in its own transaction boundary. If a step fails mid-execution, the transaction rolls back, leaving the system in the state it was before that step began. No partial invalid transitions are possible.

## 11. Stuck Pipeline Protection

- `heartbeat_at` column updated at each phase boundary
- Stale threshold: 10 minutes without heartbeat update
- Recovery: any new run attempt marks stale runs as `stale` status before proceeding
- Stale detection query: `WHERE project_id = ? AND status = 'running' AND heartbeat_at < NOW() - INTERVAL '10 minutes'`

## 12. Event Idempotency Keys

Every audit event includes an `idempotency_key` in its payload:

```
idempotency_key = '{run_id}:{step_name}:{entity_type}:{entity_id}'
```

Before inserting an audit event, check:
```sql
SELECT 1 FROM project_workflow_events
WHERE project_id = ? AND event_payload->>'idempotency_key' = ?
```

If exists, skip insertion. This prevents duplicate events on retry/resume.

## 13. Failure Handling Rules

| Failure Type | Response |
|-------------|----------|
| Draft approval fails (non-applicable) | Skip, log warning, continue |
| Draft activation fails | Log failure, halt pipeline |
| WO/PO status transition fails | Log failure, halt pipeline |
| Quality plan creation fails | Log failure, halt pipeline |
| Inspection creation fails | Log warning, continue (non-critical) |
| Database error | Transaction rollback for current step, halt pipeline |
| Stale heartbeat | Recoverable by new run |

On halt: `automation_pipeline_runs.status = 'failed'`, `failure_step`, `failure_message`, `failure_entity_id`, `failure_entity_type` populated.

## 14. IO Lifecycle Definition

### 14.1 Creation Trigger
- WO release → `triggerInspectionOnWoRelease()` → creates IO with `inspection_type = 'in-process'`
- PO issuance → `triggerInspectionOnPoIssuance()` → creates IO with `inspection_type = 'incoming'`
- These existing trigger functions are called by the orchestrator after WO release / PO issuance steps

### 14.2 Link to WO / PO
- IO is linked to the source WO/PO via `source_type` and `source_id` fields on `inspection_orders`
- IO is project-item scoped: one IO per `(project_id, project_item_id, inspection_type)` combination
- Duplicate check prevents multiple IOs for same item+type

### 14.3 Deterministic Mapping Rules
- WO → IO: 1:1 per project item, `inspection_type = 'in-process'`
- PO → IO: 1:1 per project item, `inspection_type = 'incoming'`
- IO draft linking: after IO creation, `linkIODraftToTriggeredIO()` links the IO execution draft to the created IO entity

### 14.4 IO Draft Activation
- IO drafts are NOT activated by the orchestrator directly
- They are linked to triggered IOs via `linkIODraftToTriggeredIO()` after WO-release/PO-issuance triggers fire
- This preserves the existing IO lifecycle contract

## 15. Audit Event Map

| Event Name | Trigger | Payload |
|-----------|---------|---------|
| `full_auto.pipeline_started` | Pipeline begins | `{ runId, projectId, triggerUserId, automationMode }` |
| `full_auto.draft_approved` | Draft auto-approved | `{ runId, draftId, docType, docNumber, phase }` |
| `full_auto.draft_activated` | Draft auto-activated | `{ runId, draftId, docType, entityId, entityType }` |
| `full_auto.entity_skipped` | Entity already exists | `{ runId, entityType, reason }` |
| `full_auto.wo_approved` | WO auto-approved | `{ runId, woId, woNumber }` |
| `full_auto.wo_released` | WO auto-released | `{ runId, woId, woNumber }` |
| `full_auto.po_approved` | PO auto-approved | `{ runId, poId, poNumber }` |
| `full_auto.po_issued` | PO auto-issued | `{ runId, poId, poNumber }` |
| `full_auto.quality_plan_created` | QPL created for WO | `{ runId, qplId, qplNumber, woId }` |
| `full_auto.inspection_created` | Inspection record created | `{ runId, inspectionId, inspectionNumber, qplId }` |
| `full_auto.inspection_scheduled` | Inspection auto-scheduled | `{ runId, inspectionId, assignedTo }` |
| `full_auto.io_triggered` | IO created via trigger | `{ runId, ioId, ioNumber, sourceType, sourceId }` |
| `full_auto.io_draft_linked` | IO draft linked to IO | `{ runId, draftId, ioId }` |
| `full_auto.pipeline_complete` | All steps done | `{ runId, projectId, phasesCompleted, duration }` |
| `full_auto.pipeline_failed` | Step failed | `{ runId, projectId, failedStep, failedEntity, error }` |
| `full_auto.pipeline_stale_recovered` | Stale run detected | `{ runId, staleRunId, projectId }` |

All events include `idempotency_key` in payload.

## 16. Schema Changes

### 16.1 New Table: `automation_pipeline_runs`

See Section 9.1 for full DDL.

### 16.2 Modified Table: `projects`

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `automation_mode` | `varchar(20)` | `'manual'` | Pipeline mode |
| `automation_run_id` | `uuid` | NULL | Current/last pipeline run |
| `automation_completed_at` | `timestamp` | NULL | When pipeline completed |

### 16.3 Source Tracking on 6 Entity Tables

Tables: `execution_drafts`, `epc_drawing_orders`, `epc_work_orders`, `epc_purchase_orders`, `quality_planning_records`, `inspection_execution_records`

| Column | Type | Default |
|--------|------|---------|
| `created_source_type` | `varchar(20)` | `'manual'` |
| `created_source_ref` | `varchar(100)` | NULL |
| `automation_run_id` | `uuid` | NULL |

## 17. Files to Create/Update

### New Files
- `server/pipeline/full-auto-orchestrator.ts` — Main orchestrator service
- `server/pipeline/full-auto-types.ts` — AutomationContext, step result types
- `docs/full-auto-execution-pipeline-baseline.md` — This document

### Updated Files
- `shared/schema.ts` — Schema additions (Section 16)
- `server/offer-conversion.ts` — Trigger orchestrator for full_auto projects
- `server/pipeline/draft-approval.ts` — Bypass separation-of-duties for system actor
- `server/pipeline/draft-activation.ts` — Accept system actor context
- `server/pipeline/pipeline-routes.ts` — Accept automation_mode param (if needed)
- `client/src/pages/epc-execution-drafts-page.tsx` — Automation status display (Phase 5)

---

## Amendment Rules

This document is a frozen baseline. Changes require:
1. Formal amendment with version increment
2. Rationale documented
3. Impact analysis on existing pipeline runs
