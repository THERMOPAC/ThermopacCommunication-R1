# Operational Intelligence — Baseline v1.0

**Status:** DRAFT — Awaiting approval. Do NOT implement until approved.  
**Date:** 21-May-2026  
**Prepared by:** Architecture review session  
**Scope:** New top-level module — Issue Capture → Closure lifecycle with RCA, CAPA, SOP, ERP enforcement, AI assistance, and prevention loop.

---

## Table of Contents

1. [Module Purpose](#1-module-purpose)
2. [Governing Principles](#2-governing-principles)
3. [Issue Categories](#3-issue-categories)
4. [Severity Levels](#4-severity-levels)
5. [Status Lifecycle](#5-status-lifecycle)
6. [Role Permissions](#6-role-permissions)
7. [RCA Workflow](#7-rca-workflow)
8. [CAPA Workflow](#8-capa-workflow)
9. [SOP Generation and Update Rules](#9-sop-generation-and-update-rules)
10. [ERP Enforcement Rules](#10-erp-enforcement-rules)
11. [AI Agent Scope](#11-ai-agent-scope)
12. [Closure Blocking Rules](#12-closure-blocking-rules)
13. [Audit Logging Rules](#13-audit-logging-rules)
14. [Integration Points](#14-integration-points)
15. [Required Database Tables](#15-required-database-tables)
16. [Required UI Pages](#16-required-ui-pages)
17. [API Endpoints](#17-api-endpoints)
18. [Notification Rules](#18-notification-rules)
19. [Prevention Alert Rules](#19-prevention-alert-rules)
20. [Implementation Sequence](#20-implementation-sequence)
21. [Complete File Change List](#21-complete-file-change-list)

---

## 1. Module Purpose

Operational Intelligence (OI) is the cross-functional issue management and organisational learning system for THERMOPAC. Its purpose is to:

1. Capture every operational failure, near-miss, observation, or deviation — from any module — in a single structured record.
2. Drive a governed investigation and root-cause analysis (RCA) process with human approval gates.
3. Generate corrective and preventive actions (CAPA) that are linked to real tasks, assignees, and deadlines.
4. Convert approved learnings into SOPs and, where applicable, into hard controls inside SAP B1 (item block lists, tolerance rules, vendor flags).
5. Feed a knowledge base of past issues and resolutions to enable AI-assisted pattern recognition and prevention alerts.
6. Close the loop: no issue is archived without verified closure evidence.

OI is **not** a replacement for the existing NCR module. NCR remains the quality-control instrument for project-specific non-conformances. OI is the organisation-wide learning layer that sits above NCR, procurement failures, drawing deviations, process breakdowns, safety near-misses, and any other class of operational event.

---

## 2. Governing Principles

> **Principle 1 — No close without RCA approval.**  
> An issue at severity Major or Critical cannot transition to `verified` or `closed` unless an RCA record exists with `status = 'approved'`. Enforced at the API layer — not just UI.

> **Principle 2 — No close without CAPA completion.**  
> At least one CAPA action must exist and all required CAPA actions must have `status = 'verified'` before the issue can close. Issues with zero CAPA actions cannot close regardless of severity.

> **Principle 3 — No Major/Critical close without SOP review.**  
> Issues at severity Major or Critical must have at least one SOP record with `review_status = 'approved'` before closure. Minor issues may close without an SOP.

> **Principle 4 — SOPs must become ERP controls wherever applicable.**  
> If an approved SOP carries `erp_control_required = true`, the linked ERP enforcement record must reach `status = 'active'` before the issue can close.

> **Principle 5 — AI may suggest, humans approve.**  
> AI agents may pre-populate RCA suggestions, CAPA drafts, SOP drafts, and similar content into `status = 'ai_draft'`. No AI-generated content is treated as approved. A named human approver must explicitly transition it.

> **Principle 6 — Every action is audit logged.**  
> Every status transition, field edit, comment, file attachment, AI suggestion, and approval decision on every record in OI is written to `oi_audit_log` with actor, timestamp (IST), old value, new value, and context.

> **Principle 7 — Forward-only state machine.**  
> Status transitions are governed by an explicit allowed-transitions map. No backward transitions are permitted except via an explicit `reopen` action (which itself is audit logged and requires a reason).

---

## 3. Issue Categories

Each issue is tagged with exactly one primary category and optionally one sub-category.

| Code | Category | Description | Typical Source |
|---|---|---|---|
| `QC` | Quality Control | Dimensional deviation, material rejection, surface defect, test failure | NCR, Inspection Order, QAP |
| `DWG` | Drawing & Design | Wrong revision used, missing tolerance, design error, drawing-BOM mismatch | EPC Drawing Controls |
| `PROC` | Procurement | Wrong item supplied, late delivery, vendor non-compliance, datasheet mismatch | PLC, PPPC, GRN |
| `MFG` | Manufacturing / Production | Process deviation, rework, scrap, equipment failure | Work Orders, Dispatch |
| `DOC` | Documentation | Missing document, wrong revision filed, GCS mis-routing, superseded doc used | Document Control, GCS |
| `SAP` | SAP / ERP Data | Wrong item master, duplicate entry, incorrect UOM, pricing error | SAP B1 sync |
| `HR` | Human Resources | Attendance breach, policy violation, role gap | Leave, Attendance, Payroll |
| `SAFETY` | Safety & Environment | Near-miss, unsafe act, regulatory non-compliance | Direct capture, EPC |
| `CUST` | Customer Complaint | Field failure, delivery complaint, warranty claim | Direct capture |
| `SYS` | System / Process | System downtime, data loss, workflow gap, missing control | IT / Process review |
| `OTHER` | Other | Does not fit above | Direct capture |

---

## 4. Severity Levels

| Code | Label | Definition | Response SLA | RCA Required | SOP Required |
|---|---|---|---|---|---|
| `S1` | Critical | Customer impact, safety risk, regulatory breach, or financial exposure > ₹5L | 24 h to RCA initiation | Yes | Yes |
| `S2` | Major | Significant rework, production stoppage > 4 h, repeated occurrence of a Minor, or financial exposure ₹1L–5L | 72 h to RCA initiation | Yes | Yes |
| `S3` | Minor | Isolated incident, no customer impact, correctable without rework | 7 days to CAPA initiation | No | No |
| `S4` | Observation | Potential risk identified before any failure; improvement suggestion | 30 days to CAPA initiation | No | No |

Severity is set at capture time by the reporter. It may be escalated or de-escalated by a Manager or above during the classification step. Every severity change is audit logged with the reason.

---

## 5. Status Lifecycle

### 5.1 Status Map

```
[CAPTURED] → [CLASSIFIED] → [INVESTIGATING] → [RCA_DRAFT] → [RCA_REVIEW] → [RCA_APPROVED]
                                                                                    ↓
                                                              [CAPA_OPEN] → [CAPA_IN_PROGRESS]
                                                                                    ↓
                                                              [CAPA_VERIFIED] → [SOP_REVIEW]
                                                                                    ↓
                                                              [ERP_ENFORCEMENT] → [VERIFIED] → [CLOSED]

Any status (except CLOSED) → [REOPENED]  (mandatory reason required)
Any status                 → [WITHDRAWN]  (Superuser only, mandatory reason required)

S3/S4 shortcut: INVESTIGATING → CAPA_OPEN  (RCA step skipped)
S3/S4 shortcut: CAPA_VERIFIED → VERIFIED   (SOP_REVIEW step skipped unless repeat_issue = true)
```

### 5.2 Status Definitions

| Status | Description | Who Can Enter | Blocking Conditions |
|---|---|---|---|
| `captured` | Issue submitted, not yet reviewed | Any authenticated user | None |
| `classified` | Severity, category, and owner confirmed | Manager or above | None |
| `investigating` | Investigation actively in progress | Assigned investigator | Must be `classified` first |
| `rca_draft` | RCA record created, AI or human draft in progress | Investigator or AI | Must be `investigating` |
| `rca_review` | RCA submitted for approval | Investigator | RCA `findings` field non-empty |
| `rca_approved` | RCA approved by authorised approver | SM / GM / Superuser | Approver ≠ author |
| `capa_open` | At least one CAPA action created | Owner / Manager | RCA approved (S1/S2); skipped for S3/S4 |
| `capa_in_progress` | At least one CAPA action accepted | CAPA assignee | — |
| `capa_verified` | All CAPA actions verified complete | Manager or above | All CAPA actions `status = 'verified'` |
| `sop_review` | SOP created or existing SOP flagged for update | Manager or above | Required only for S1/S2 and S3 repeat |
| `erp_enforcement` | ERP controls being configured in SAP B1 | Superuser | Required only if SOP has `erp_control_required = true` |
| `verified` | All closure conditions met, pending final sign-off | GM or above | All blocking rules in Section 12 checked |
| `closed` | Issue archived; knowledge base entry created | GM or Superuser | All closure blocking rules passed |
| `reopened` | Issue re-activated after being verified or closed | Manager or above | Mandatory reopen reason |
| `withdrawn` | Issue voided — not a valid issue | Superuser | Mandatory withdrawal reason |

### 5.3 Allowed Transitions

| From | Allowed To |
|---|---|
| `captured` | `classified`, `withdrawn` |
| `classified` | `investigating`, `withdrawn` |
| `investigating` | `rca_draft` (S1/S2), `capa_open` (S3/S4), `withdrawn` |
| `rca_draft` | `rca_review`, `investigating` |
| `rca_review` | `rca_approved`, `rca_draft` (rejected back) |
| `rca_approved` | `capa_open` |
| `capa_open` | `capa_in_progress` |
| `capa_in_progress` | `capa_verified` |
| `capa_verified` | `sop_review` (S1/S2), `verified` (S3/S4 without repeat) |
| `sop_review` | `erp_enforcement` (if ERP required), `verified` |
| `erp_enforcement` | `verified` |
| `verified` | `closed`, `reopened` |
| `closed` | `reopened` |
| `reopened` | `classified` |

No transition outside this map is permitted. Any attempt returns HTTP 422 with error code `transition_not_allowed`.

---

## 6. Role Permissions

### 6.1 Issue-Level Actions

| Action | Employee | Manager | Senior Manager | General Manager | Superuser |
|---|---|---|---|---|---|
| Capture issue | ✓ | ✓ | ✓ | ✓ | ✓ |
| View own issues | ✓ | ✓ | ✓ | ✓ | ✓ |
| View all issues | — | Own dept | Own dept + subordinates | All | All |
| Classify / set severity | — | ✓ | ✓ | ✓ | ✓ |
| Assign investigator | — | ✓ | ✓ | ✓ | ✓ |
| Escalate severity | — | ✓ | ✓ | ✓ | ✓ |
| De-escalate severity | — | — | ✓ | ✓ | ✓ |
| Reopen issue | — | ✓ | ✓ | ✓ | ✓ |
| Withdraw issue | — | — | — | — | ✓ |

### 6.2 RCA Actions

| Action | Employee | Manager | Senior Manager | General Manager | Superuser |
|---|---|---|---|---|---|
| Create / edit RCA draft | Investigator only | ✓ | ✓ | ✓ | ✓ |
| Submit RCA for review | Investigator only | ✓ | ✓ | ✓ | ✓ |
| Approve RCA | — | — | ✓ | ✓ | ✓ |
| Reject RCA (return to draft) | — | — | ✓ | ✓ | ✓ |

RCA approver must be a different person than the RCA author. Enforced at API layer.

### 6.3 CAPA Actions

| Action | Employee | Manager | Senior Manager | General Manager | Superuser |
|---|---|---|---|---|---|
| Create CAPA action | — | ✓ | ✓ | ✓ | ✓ |
| Accept CAPA assignment | Assigned only | ✓ | ✓ | ✓ | ✓ |
| Update CAPA progress | Assigned only | ✓ | ✓ | ✓ | ✓ |
| Verify CAPA completion | — | ✓ | ✓ | ✓ | ✓ |
| Extend CAPA due date | — | — | ✓ | ✓ | ✓ |

CAPA verifier must be a different person than the CAPA assignee. Enforced at API layer.

### 6.4 SOP and Closure Actions

| Action | Employee | Manager | Senior Manager | General Manager | Superuser |
|---|---|---|---|---|---|
| Create / edit SOP draft | — | ✓ | ✓ | ✓ | ✓ |
| Approve SOP | — | — | ✓ | ✓ | ✓ |
| Mark ERP enforcement active | — | — | — | — | ✓ |
| Verify issue | — | — | ✓ | ✓ | ✓ |
| Close issue | — | — | — | ✓ | ✓ |

---

## 7. RCA Workflow

### 7.1 RCA Record Fields

| Field | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `issue_id` | FK → `oi_issues` | Parent issue |
| `method` | text | `5_why`, `fishbone`, `fault_tree`, `fmea`, `free_form` |
| `ai_suggested` | boolean | Whether AI pre-populated this record |
| `why_1` … `why_5` | text nullable | 5-Why chain (populated if method = `5_why`) |
| `fishbone_json` | jsonb nullable | Cause categories for Ishikawa diagram |
| `findings` | text | Narrative root cause conclusion — mandatory before submission |
| `contributing_factors` | text[] | List of contributing factors |
| `escaped_defect` | boolean | Whether the defect escaped detection at a prior gate |
| `detection_gap` | text nullable | Where detection should have occurred |
| `status` | text | `ai_draft`, `draft`, `submitted`, `approved`, `rejected` |
| `submitted_by` | FK → `users` | — |
| `submitted_at` | timestamp | — |
| `approved_by` | FK → `users` nullable | — |
| `approved_at` | timestamp nullable | — |
| `rejection_reason` | text nullable | Required on rejection |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | — |

### 7.2 RCA Approval Gate

- Approver must be Senior Manager, General Manager, or Superuser.
- Approver must not be the `submitted_by` user.
- `findings` must be non-empty.
- If `method = '5_why'`, at least `why_1` must be non-empty.
- All checks enforced at `POST /api/oi/rca/:id/approve`.

### 7.3 RCA Rejection

- Approver provides `rejection_reason` (mandatory).
- RCA record status returns to `draft`.
- Issue status returns to `rca_draft`.
- Notification sent to the investigator.

---

## 8. CAPA Workflow

### 8.1 CAPA Action Record Fields

| Field | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `issue_id` | FK → `oi_issues` | Parent issue |
| `type` | text | `corrective` or `preventive` |
| `description` | text | What must be done |
| `assignee_id` | FK → `users` | Person responsible |
| `due_date` | date | Target completion |
| `priority` | text | `high`, `medium`, `low` |
| `task_id` | FK → `tasks` nullable | Linked task record in task management module |
| `evidence_required` | boolean | Whether evidence upload is mandatory before verify |
| `evidence_description` | text nullable | What evidence must be provided |
| `evidence_gcs_path` | text nullable | GCS path of uploaded evidence |
| `status` | text | `open`, `accepted`, `in_progress`, `completed`, `verified`, `overdue`, `cancelled` |
| `completion_note` | text nullable | Assignee's completion description |
| `verified_by` | FK → `users` nullable | — |
| `verified_at` | timestamp nullable | — |
| `verification_note` | text nullable | — |
| `overdue_waived_by` | FK → `users` nullable | — |
| `overdue_waiver_reason` | text nullable | — |
| `created_by` | FK → `users` | — |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | — |

### 8.2 CAPA Task Linkage

When a CAPA action is created, a corresponding `tasks` record is automatically created with:
- `title` = `"[CAPA] {issue_number}: {capa_description truncated to 100 chars}"`
- `assignedTo` = CAPA `assignee_id`
- `dueDate` = CAPA `due_date`
- `priority` = CAPA `priority`
- `link` = `/operational-intelligence/issues/{issue_id}`

The task is linked back via `oi_capa_actions.task_id`. If the linked task is completed, the CAPA action automatically transitions to `completed` (pending human verification). If a CAPA action is cancelled, the linked task is also cancelled.

### 8.3 CAPA Overdue Processing

A scheduled job runs daily at 06:00 IST. Any CAPA action with `status IN ('open', 'accepted', 'in_progress')` and `due_date < TODAY` is transitioned to `overdue`. Notification is sent to the assignee and the issue owner. Issue severity may be escalated (Observation → Minor, Minor → Major) if CAPA is overdue by more than 7 days — subject to human confirmation, not automatic.

### 8.4 CAPA Verification Gate

- Verifier must not be the CAPA `assignee_id`.
- If `evidence_required = true`, `evidence_gcs_path` must be non-null.
- `completion_note` must be non-empty.
- All checks enforced at `POST /api/oi/capa/:id/verify`.

### 8.5 Issue CAPA Completion Gate

Issue advances to `capa_verified` when ALL are true:
- At least one non-cancelled CAPA action exists.
- All CAPA actions with `status != 'cancelled'` have `status = 'verified'`.
- No CAPA action has `status = 'overdue'` unless explicitly waived by GM or Superuser with a recorded reason.

---

## 9. SOP Generation and Update Rules

### 9.1 SOP Record Fields

| Field | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `issue_id` | FK → `oi_issues` | Parent issue |
| `sop_number` | text | Format: `SOP-{YYYY}-{NNN}` |
| `revision` | text | `rev-00`, `rev-01`, etc. |
| `is_current` | boolean | Only one revision per SOP number may be `true` |
| `title` | text | SOP title |
| `scope` | text | What this SOP covers |
| `process_steps` | jsonb | Ordered list of `{ step_number, action, responsible_role, checkpoint }` |
| `ai_generated` | boolean | Whether AI drafted this SOP |
| `existing_sop_id` | FK → `oi_sops` nullable | If this is a revision of an existing SOP |
| `change_summary` | text nullable | What changed from prior version |
| `erp_control_required` | boolean | Whether this SOP requires an ERP control |
| `erp_control_description` | text nullable | What ERP control is needed |
| `review_status` | text | `ai_draft`, `draft`, `submitted`, `approved`, `rejected` |
| `reviewed_by` | FK → `users` nullable | — |
| `reviewed_at` | timestamp nullable | — |
| `approved_by` | FK → `users` nullable | — |
| `approved_at` | timestamp nullable | — |
| `gcs_path` | text nullable | GCS path of exported SOP PDF |
| `doc_type` | text | Always `SOP` |
| `created_by` | FK → `users` | — |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | — |

### 9.2 SOP Trigger Rules

An SOP record is required when:
- Issue severity is `S1` (Critical) — mandatory, no exceptions.
- Issue severity is `S2` (Major) — mandatory, no exceptions.
- Issue severity is `S3` (Minor) and `repeat_issue = true` — mandatory.
- Issue severity is `S4` (Observation) — optional.

A new SOP is created when no matching SOP exists. An existing SOP is flagged for revision when a match exists — the issue owner selects which SOP needs updating.

### 9.3 SOP Approval Gate

- `scope` and `process_steps` must be non-empty.
- Approver must be Senior Manager, General Manager, or Superuser.
- Approver must not be the SOP author.
- Approval transitions `review_status` to `approved` and triggers GCS PDF upload.

### 9.4 SOP GCS Upload Rules

On approval, the SOP is exported as PDF and uploaded to:

```
TPEL/QC/SOP/{sop_number}/{sop_number}-{revision}.pdf
```

The path is written to `oi_sops.gcs_path` and registered in `gcs_file_index`.

### 9.5 SOP Versioning

Each revision creates a new `oi_sops` row with an incremented revision. The previous revision is retained with `is_current = false`. Only one revision per `sop_number` may have `is_current = true`.

---

## 10. ERP Enforcement Rules

### 10.1 ERP Enforcement Record Fields

| Field | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `issue_id` | FK → `oi_issues` | Parent issue |
| `sop_id` | FK → `oi_sops` | Which SOP triggered this enforcement |
| `erp_control_type` | text | `item_block`, `vendor_flag`, `tolerance_rule`, `mandatory_inspection`, `procurement_hold`, `approval_gate`, `other` |
| `description` | text | What control is being enforced |
| `sap_entity_type` | text nullable | `item`, `vendor`, `purchase_order`, `grn`, `other` |
| `sap_entity_id` | text nullable | SAP card code / item code |
| `control_parameters` | jsonb nullable | Machine-readable enforcement parameters |
| `status` | text | `pending`, `in_progress`, `active`, `deactivated` |
| `implemented_by` | FK → `users` nullable | Superuser who activated |
| `implemented_at` | timestamp nullable | — |
| `deactivated_by` | FK → `users` nullable | — |
| `deactivated_at` | timestamp nullable | — |
| `deactivation_reason` | text nullable | — |
| `created_by` | FK → `users` | — |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | — |

### 10.2 ERP Control Types

| Type | SAP B1 Mechanism | THERMOPAC Action |
|---|---|---|
| `item_block` | Set Item Master `Inactive = Yes` | Flag item in SAP; add warning note |
| `vendor_flag` | Add note to BP Master; set `On Hold` if Critical | Update via SAP Service Layer |
| `tolerance_rule` | Enforce GRN inspection tolerance at QC module | Add mandatory QC gate to procurement list |
| `mandatory_inspection` | Route all GRN lines through inspection | Set `inspection_required = true` on matching buy lines |
| `procurement_hold` | Add PR/PO approval gate | Insert additional approval step in procurement workflow |
| `approval_gate` | Require SM/GM sign-off on specific item/vendor combinations | Override logic in PPPC/PLC |
| `other` | Manual enforcement | Documented process control |

### 10.3 ERP Activation Gate

Only Superuser may mark an ERP enforcement record as `active`. Before marking active, the system prompts the user to confirm the SAP B1 change has been made manually (the system cannot write directly to SAP for enforcement controls in v1 — direct SAP writes are a future phase). The confirmation is audit logged.

### 10.4 Deactivation

Deactivation requires Superuser and a mandatory reason. Deactivation does not reopen the parent issue. If the same issue recurs after deactivation, a new issue is captured and the knowledge base links it to the original.

---

## 11. AI Agent Scope

### 11.1 Permitted AI Actions

All AI actions produce records in `status = 'ai_draft'` only. No AI action may transition a record to `approved`, `active`, or any status with downstream effect.

| AI Action | Trigger | Output |
|---|---|---|
| **Auto-classify issue** | On issue capture | Suggest `category`, `severity`, `tags` based on description and similar historical issues |
| **RCA suggestion** | When issue enters `investigating` | Pre-populate RCA with method suggestion, 5-Why or fishbone skeleton, links to similar past issues |
| **CAPA draft** | When RCA is approved | Suggest corrective + preventive actions based on RCA findings and knowledge base patterns |
| **SOP draft** | When CAPA is verified | Draft SOP process steps from CAPA actions and past SOP templates |
| **Pattern detection** | Nightly batch | Flag repeat issues (same category + similar description within 90 days); escalation pending human confirmation |
| **Prevention alert** | Real-time on capture | Surface similar past issues from knowledge base on the capture confirmation screen |

### 11.2 AI Model

Uses OpenAI GPT via the installed `javascript_openai==1.0.0` integration. Prompts are structured and deterministic. All AI output is stored verbatim with `ai_generated = true`.

### 11.3 Prohibited AI Actions

- AI may not approve any record.
- AI may not create tasks autonomously.
- AI may not modify SAP B1.
- AI may not send notifications to customers or external parties.
- AI may not close or withdraw any issue.

---

## 12. Closure Blocking Rules

All checks enforced server-side at `POST /api/oi/issues/:id/close`. If any check fails, HTTP 422 is returned with a structured `closure_blocked` error listing each failed condition.

| # | Rule | Applies To |
|---|---|---|
| 1 | RCA record must exist with `status = 'approved'` | S1, S2 only |
| 2 | All non-cancelled CAPA actions must have `status = 'verified'` | All severities |
| 3 | At least one non-cancelled CAPA action must exist | All severities |
| 4 | At least one SOP record must have `review_status = 'approved'` | S1, S2; S3 if `repeat_issue = true` |
| 5 | If any approved SOP has `erp_control_required = true`, the linked enforcement record must have `status = 'active'` | S1, S2 with ERP control required |
| 6 | Issue must be in `verified` status before closure can be called | All |
| 7 | Closing user must be General Manager or Superuser | All |
| 8 | `closure_evidence` text field must be non-empty | All |
| 9 | Knowledge base entry is auto-created by the close endpoint on success | All |

---

## 13. Audit Logging Rules

### 13.1 `oi_audit_log` — Append-Only

Every OI action writes to `oi_audit_log`. This table is append-only — no row may be deleted or updated.

| Field | Type | Description |
|---|---|---|
| `id` | bigserial PK | — |
| `issue_id` | FK → `oi_issues` | Parent issue |
| `entity_type` | text | `issue`, `rca`, `capa`, `sop`, `erp_enforcement`, `comment`, `attachment` |
| `entity_id` | integer | ID of the record acted on |
| `action` | text | `created`, `updated`, `status_changed`, `approved`, `rejected`, `commented`, `attached`, `ai_suggested` |
| `actor_id` | FK → `users` | Who performed the action |
| `actor_name` | text | Username snapshot at time of action (denormalised) |
| `old_value` | jsonb nullable | Previous field values |
| `new_value` | jsonb nullable | New field values |
| `context` | text nullable | Human-readable note |
| `ip_address` | text nullable | Request IP |
| `created_at` | timestamp | Stored UTC, displayed IST. Never client-supplied. |

### 13.2 Required Audit Events

Failure to log any of the following is a governance violation:

- Issue created
- Issue status changed (every transition — old + new status)
- Issue severity changed (with reason)
- Issue assignee changed
- RCA created, updated, submitted, approved, rejected
- CAPA created, updated, accepted, completed, verified, overdue, cancelled
- CAPA due date extended (with reason)
- SOP created, updated, submitted, approved, rejected
- ERP enforcement created, activated, deactivated
- Comment added
- File attached or deleted
- AI suggestion generated (entity type + entity id)
- Issue verified
- Issue closed (with closure evidence snapshot)
- Issue reopened (with reopen reason)
- Issue withdrawn (with withdrawal reason)

---

## 14. Integration Points

### 14.1 EPC Drawing Controls

- "Report Issue" action button on Drawing Controls table row pre-populates: `category = 'DWG'`, `source_module = 'drawing_controls'`, `source_record_id = {dwg_control_id}`.
- Drawing control records display a badge with linked open OI issue count.

### 14.2 Quality Control (NCR, Inspection Orders)

- "Escalate to OI" button on NCR detail pre-populates: `category = 'QC'`, `source_module = 'ncr'`, `source_record_id = {ncr_id}`, `ncr_number` → `reference_number`.
- Inspection Orders linkable via `source_module = 'inspection_orders'`.
- OI CAPA actions may generate mandatory inspection gates for the same item/vendor in future QAP records.

### 14.3 Procurement (PPPC / PLC)

- Issue capture from PLC line row pre-populates: `category = 'PROC'`, `source_module = 'plc'`, `source_record_id = {plc_line_id}`.
- ERP enforcement type `mandatory_inspection` sets `inspection_required = true` on matching `project_buy_list_lines` via internal service call.

### 14.4 SAP B1

- OI does not write directly to SAP B1 for enforcement controls in v1.
- OI generates a structured "SAP Action Required" notification to Superuser with the exact SAP B1 field changes needed.
- Superuser confirms manual completion in OI, which activates the `erp_enforcement` record.
- Future phase: direct SAP B1 PATCH calls via the existing Service Layer integration.

### 14.5 Task Management

- Every CAPA action automatically creates a linked `tasks` record (Section 8.2).
- CAPA task completion events mirror back to the CAPA record.
- Overdue CAPA tasks appear in Task Management with an OI badge.

### 14.6 Document Control (GCS)

- Approved SOPs uploaded to `TPEL/QC/SOP/` (Section 9.4).
- Registered in `gcs_file_index`.
- Issues with `category = 'DOC'` may reference a GCS path as the source document.

### 14.7 Notifications Module

All OI events requiring human action generate entries in the existing `notifications` table. Links follow `/operational-intelligence/issues/{issue_id}`.

| Event | Recipient | Notification Type |
|---|---|---|
| Issue captured (S1/S2) | All Managers, GM, Superuser | `oi_critical_issue` |
| Issue assigned | Assignee | `oi_assignment` |
| RCA submitted for review | SM, GM, Superuser | `oi_rca_review` |
| RCA approved | Issue owner + investigator | `oi_rca_approved` |
| RCA rejected | Investigator | `oi_rca_rejected` |
| CAPA created | CAPA assignee | `oi_capa_assigned` |
| CAPA overdue | Assignee + issue owner | `oi_capa_overdue` |
| CAPA verified | Issue owner | `oi_capa_verified` |
| SOP submitted for approval | SM, GM, Superuser | `oi_sop_review` |
| ERP enforcement required | Superuser | `oi_erp_required` |
| Issue ready for closure | GM, Superuser | `oi_ready_to_close` |
| Prevention alert triggered | Issue reporter | `oi_prevention_alert` |

---

## 15. Required Database Tables

All tables go in `shared/schema.ts` using Drizzle ORM `pgTable`. All timestamps are `timestamp` (UTC stored, IST displayed via `fmtDateTime` from `client/src/lib/date-format.ts`).

### 15.1 `oi_issues`

```sql
CREATE TABLE oi_issues (
  id                     serial PRIMARY KEY,
  issue_number           text NOT NULL UNIQUE,       -- OI-{YYYY}-{NNN} zero-padded 4 digits
  title                  text NOT NULL,
  description            text NOT NULL,
  category               text NOT NULL,              -- QC DWG PROC MFG DOC SAP HR SAFETY CUST SYS OTHER
  sub_category           text,
  severity               text NOT NULL,              -- S1 S2 S3 S4
  severity_changed_at    timestamp,
  severity_change_reason text,
  status                 text NOT NULL DEFAULT 'captured',
  status_changed_at      timestamp NOT NULL DEFAULT NOW(),
  source_module          text,                       -- ncr drawing_controls plc inspection_orders direct
  source_record_id       integer,
  reference_number       text,
  reported_by            integer NOT NULL REFERENCES users(id),
  assigned_to            integer REFERENCES users(id),
  department             text,
  repeat_issue           boolean NOT NULL DEFAULT false,
  related_issue_ids      integer[],
  tags                   text[],
  closure_evidence       text,
  closed_at              timestamp,
  closed_by              integer REFERENCES users(id),
  withdrawn_at           timestamp,
  withdrawn_by           integer REFERENCES users(id),
  withdrawal_reason      text,
  created_at             timestamp NOT NULL DEFAULT NOW(),
  updated_at             timestamp NOT NULL DEFAULT NOW()
);
```

### 15.2 `oi_rca`

```sql
CREATE TABLE oi_rca (
  id                   serial PRIMARY KEY,
  issue_id             integer NOT NULL REFERENCES oi_issues(id),
  method               text NOT NULL,               -- 5_why fishbone fault_tree fmea free_form
  ai_suggested         boolean NOT NULL DEFAULT false,
  why_1                text,
  why_2                text,
  why_3                text,
  why_4                text,
  why_5                text,
  fishbone_json        jsonb,
  findings             text,
  contributing_factors text[],
  escaped_defect       boolean NOT NULL DEFAULT false,
  detection_gap        text,
  status               text NOT NULL DEFAULT 'draft', -- ai_draft draft submitted approved rejected
  submitted_by         integer REFERENCES users(id),
  submitted_at         timestamp,
  approved_by          integer REFERENCES users(id),
  approved_at          timestamp,
  rejection_reason     text,
  created_at           timestamp NOT NULL DEFAULT NOW(),
  updated_at           timestamp NOT NULL DEFAULT NOW()
);
```

### 15.3 `oi_capa_actions`

```sql
CREATE TABLE oi_capa_actions (
  id                    serial PRIMARY KEY,
  issue_id              integer NOT NULL REFERENCES oi_issues(id),
  type                  text NOT NULL,              -- corrective preventive
  description           text NOT NULL,
  assignee_id           integer NOT NULL REFERENCES users(id),
  due_date              date NOT NULL,
  priority              text NOT NULL DEFAULT 'medium', -- high medium low
  task_id               integer REFERENCES tasks(id),
  evidence_required     boolean NOT NULL DEFAULT false,
  evidence_description  text,
  evidence_gcs_path     text,
  status                text NOT NULL DEFAULT 'open', -- open accepted in_progress completed verified overdue cancelled
  completion_note       text,
  verified_by           integer REFERENCES users(id),
  verified_at           timestamp,
  verification_note     text,
  overdue_waived_by     integer REFERENCES users(id),
  overdue_waiver_reason text,
  created_by            integer NOT NULL REFERENCES users(id),
  created_at            timestamp NOT NULL DEFAULT NOW(),
  updated_at            timestamp NOT NULL DEFAULT NOW()
);
```

### 15.4 `oi_sops`

```sql
CREATE TABLE oi_sops (
  id                      serial PRIMARY KEY,
  issue_id                integer NOT NULL REFERENCES oi_issues(id),
  sop_number              text NOT NULL,
  revision                text NOT NULL DEFAULT 'rev-00',
  is_current              boolean NOT NULL DEFAULT true,
  title                   text NOT NULL,
  scope                   text NOT NULL,
  process_steps           jsonb NOT NULL DEFAULT '[]',
  ai_generated            boolean NOT NULL DEFAULT false,
  existing_sop_id         integer REFERENCES oi_sops(id),
  change_summary          text,
  erp_control_required    boolean NOT NULL DEFAULT false,
  erp_control_description text,
  review_status           text NOT NULL DEFAULT 'draft', -- ai_draft draft submitted approved rejected
  reviewed_by             integer REFERENCES users(id),
  reviewed_at             timestamp,
  approved_by             integer REFERENCES users(id),
  approved_at             timestamp,
  gcs_path                text,
  doc_type                text NOT NULL DEFAULT 'SOP',
  created_by              integer NOT NULL REFERENCES users(id),
  created_at              timestamp NOT NULL DEFAULT NOW(),
  updated_at              timestamp NOT NULL DEFAULT NOW(),
  UNIQUE (sop_number, revision)
);
```

### 15.5 `oi_erp_enforcements`

```sql
CREATE TABLE oi_erp_enforcements (
  id                  serial PRIMARY KEY,
  issue_id            integer NOT NULL REFERENCES oi_issues(id),
  sop_id              integer NOT NULL REFERENCES oi_sops(id),
  erp_control_type    text NOT NULL,               -- item_block vendor_flag tolerance_rule mandatory_inspection procurement_hold approval_gate other
  description         text NOT NULL,
  sap_entity_type     text,                        -- item vendor purchase_order grn other
  sap_entity_id       text,
  control_parameters  jsonb,
  status              text NOT NULL DEFAULT 'pending', -- pending in_progress active deactivated
  implemented_by      integer REFERENCES users(id),
  implemented_at      timestamp,
  deactivated_by      integer REFERENCES users(id),
  deactivated_at      timestamp,
  deactivation_reason text,
  created_by          integer NOT NULL REFERENCES users(id),
  created_at          timestamp NOT NULL DEFAULT NOW(),
  updated_at          timestamp NOT NULL DEFAULT NOW()
);
```

### 15.6 `oi_comments`

```sql
CREATE TABLE oi_comments (
  id          serial PRIMARY KEY,
  issue_id    integer NOT NULL REFERENCES oi_issues(id),
  comment     text NOT NULL,
  author_id   integer NOT NULL REFERENCES users(id),
  is_internal boolean NOT NULL DEFAULT true,
  created_at  timestamp NOT NULL DEFAULT NOW(),
  updated_at  timestamp NOT NULL DEFAULT NOW()
);
```

### 15.7 `oi_attachments`

```sql
CREATE TABLE oi_attachments (
  id           serial PRIMARY KEY,
  issue_id     integer NOT NULL REFERENCES oi_issues(id),
  entity_type  text NOT NULL,                      -- issue rca capa sop
  entity_id    integer NOT NULL,
  file_name    text NOT NULL,
  gcs_path     text NOT NULL,
  uploaded_by  integer NOT NULL REFERENCES users(id),
  created_at   timestamp NOT NULL DEFAULT NOW()
);
```

### 15.8 `oi_knowledge_base`

```sql
CREATE TABLE oi_knowledge_base (
  id                   serial PRIMARY KEY,
  issue_id             integer NOT NULL REFERENCES oi_issues(id) UNIQUE,
  issue_number         text NOT NULL,
  category             text NOT NULL,
  severity             text NOT NULL,
  title                text NOT NULL,
  description_summary  text NOT NULL,
  root_cause_summary   text NOT NULL,
  resolution_summary   text NOT NULL,
  tags                 text[],
  sop_ids              integer[],
  erp_enforcement_ids  integer[],
  created_at           timestamp NOT NULL DEFAULT NOW(),
  updated_at           timestamp NOT NULL DEFAULT NOW()
);
```

### 15.9 `oi_audit_log`

```sql
CREATE TABLE oi_audit_log (
  id          bigserial PRIMARY KEY,
  issue_id    integer NOT NULL REFERENCES oi_issues(id),
  entity_type text NOT NULL,
  entity_id   integer NOT NULL,
  action      text NOT NULL,
  actor_id    integer NOT NULL REFERENCES users(id),
  actor_name  text NOT NULL,
  old_value   jsonb,
  new_value   jsonb,
  context     text,
  ip_address  text,
  created_at  timestamp NOT NULL DEFAULT NOW()
);
```

### 15.10 `oi_prevention_alerts`

```sql
CREATE TABLE oi_prevention_alerts (
  id               serial PRIMARY KEY,
  new_issue_id     integer NOT NULL REFERENCES oi_issues(id),
  matched_issue_id integer NOT NULL REFERENCES oi_issues(id),
  match_reason     text NOT NULL,
  match_score      numeric(4,3),
  alert_status     text NOT NULL DEFAULT 'pending', -- pending acknowledged dismissed
  acknowledged_by  integer REFERENCES users(id),
  acknowledged_at  timestamp,
  created_at       timestamp NOT NULL DEFAULT NOW()
);
```

---

## 16. Required UI Pages

All pages: container `p-4 space-y-4` (no `max-w-*`). All dates via `fmtDate` / `fmtDateTime` from `client/src/lib/date-format.ts`.

### 16.1 `/operational-intelligence` — Dashboard

- KPI cards: Open S1, Open S2, CAPA Overdue, SOP Pending Approval, Closed This Month
- Trend chart: Issues captured vs closed by month (last 6 months)
- Status funnel: Count by status
- Table: Issues requiring my action (RCA to approve / CAPA to verify / SOP to approve / issue to close)
- Table: My open issues (reported by or assigned to current user)
- Prevention alerts panel: Unacknowledged pattern alerts

### 16.2 `/operational-intelligence/issues` — Issue List

- Filters: Status (multi), Severity (multi), Category (multi), Assigned To, Date Range, Search
- Columns: Issue No., Title, Category, Severity badge, Status badge, Assigned To, Days Open, CAPA count, SOP count, Created date

### 16.3 `/operational-intelligence/issues/new` — Capture Issue

- Fields: Title, Description, Category, Sub-category, Severity, Source Module (optional), Reference Number (optional), Tags
- On submit: AI auto-classify triggers and displays suggestion chips — user may accept or override before saving

### 16.4 `/operational-intelligence/issues/:id` — Issue Detail

Tabs:
1. **Overview** — Issue details, classification, status, timeline
2. **Investigation & RCA** — RCA form, AI suggestion display, approval action
3. **CAPA** — CAPA action list, create, progress, verify
4. **SOP** — SOP process step editor, AI draft, approve
5. **ERP Enforcement** — Enforcement records, SAP action instructions, confirm active
6. **Comments** — Discussion thread
7. **Attachments** — File uploads
8. **Audit Trail** — Full chronological log of all actions

Sticky action bar: Available next actions for current user based on status and role.

### 16.5 `/operational-intelligence/rca` — RCA Register

All RCA records with filter by status and method.

### 16.6 `/operational-intelligence/capa` — CAPA Register

All CAPA actions with filter by status, priority, assignee, overdue flag. My CAPAs panel with quick accept / update / complete buttons.

### 16.7 `/operational-intelligence/sops` — SOP Library

All approved SOPs. Searchable by category, keyword, SOP number. Actions: Download PDF, View change history, Create new version.

### 16.8 `/operational-intelligence/knowledge-base` — Knowledge Base

Full-text searchable library of closed issue resolutions. Entry view: linked issue, RCA summary, CAPA actions taken, SOP generated, ERP controls activated.

### 16.9 `/operational-intelligence/analytics` — Analytics

Charts: Issues by category (12-month bar), mean time to close by severity, CAPA on-time vs overdue ratio, repeat issue rate by category, top 5 root causes, prevention alert acknowledgement rate.

---

## 17. API Endpoints

All endpoints require authentication. Role checks enforced server-side per Section 6.

### Issues

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/oi/issues` | List with filters |
| `POST` | `/api/oi/issues` | Capture new issue |
| `GET` | `/api/oi/issues/:id` | Full detail |
| `PATCH` | `/api/oi/issues/:id` | Update fields |
| `POST` | `/api/oi/issues/:id/classify` | Set severity + category + assignee |
| `POST` | `/api/oi/issues/:id/transition` | Transition status (`{ to_status, reason? }`) |
| `POST` | `/api/oi/issues/:id/close` | Close (all blocking checks enforced) |
| `POST` | `/api/oi/issues/:id/reopen` | Reopen (requires reason) |
| `POST` | `/api/oi/issues/:id/withdraw` | Withdraw (Superuser only) |

### RCA

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/oi/issues/:id/rca` | Get RCA for issue |
| `POST` | `/api/oi/issues/:id/rca` | Create RCA |
| `PATCH` | `/api/oi/rca/:id` | Update RCA |
| `POST` | `/api/oi/rca/:id/submit` | Submit for approval |
| `POST` | `/api/oi/rca/:id/approve` | Approve |
| `POST` | `/api/oi/rca/:id/reject` | Reject (requires reason) |
| `POST` | `/api/oi/issues/:id/rca/ai-suggest` | Trigger AI suggestion |

### CAPA

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/oi/issues/:id/capa` | List CAPA actions |
| `POST` | `/api/oi/issues/:id/capa` | Create CAPA + auto-create linked task |
| `PATCH` | `/api/oi/capa/:id` | Update |
| `POST` | `/api/oi/capa/:id/accept` | Assignee accepts |
| `POST` | `/api/oi/capa/:id/complete` | Assignee marks complete |
| `POST` | `/api/oi/capa/:id/verify` | Verify completion |
| `POST` | `/api/oi/capa/:id/cancel` | Cancel (with reason) |
| `POST` | `/api/oi/capa/:id/extend-due-date` | Extend due date (SM+ only) |
| `POST` | `/api/oi/capa/:id/waive-overdue` | Waive overdue (GM+ only, with reason) |

### SOP

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/oi/issues/:id/sops` | List SOPs for issue |
| `POST` | `/api/oi/issues/:id/sops` | Create SOP |
| `PATCH` | `/api/oi/sops/:id` | Update |
| `POST` | `/api/oi/sops/:id/submit` | Submit for approval |
| `POST` | `/api/oi/sops/:id/approve` | Approve + trigger GCS PDF upload |
| `POST` | `/api/oi/sops/:id/reject` | Reject |
| `POST` | `/api/oi/issues/:id/sops/ai-suggest` | Trigger AI SOP draft |
| `GET` | `/api/oi/sops` | SOP library (approved only) |

### ERP Enforcement

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/oi/issues/:id/erp-enforcement` | List records |
| `POST` | `/api/oi/issues/:id/erp-enforcement` | Create |
| `PATCH` | `/api/oi/erp-enforcement/:id` | Update |
| `POST` | `/api/oi/erp-enforcement/:id/activate` | Activate (Superuser only) |
| `POST` | `/api/oi/erp-enforcement/:id/deactivate` | Deactivate (Superuser only, requires reason) |

### Knowledge Base and Analytics

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/oi/knowledge-base` | Search knowledge base |
| `GET` | `/api/oi/analytics/summary` | KPI summary |
| `GET` | `/api/oi/analytics/trends` | Trend data |
| `GET` | `/api/oi/prevention-alerts` | Unacknowledged alerts for current user |
| `POST` | `/api/oi/prevention-alerts/:id/acknowledge` | Acknowledge alert |
| `POST` | `/api/oi/prevention-alerts/:id/dismiss` | Dismiss alert |

---

## 18. Notification Rules

All OI notifications use the existing `notifications` table. All links: `/operational-intelligence/issues/{issue_id}`.

New `type` values to register in `notification-routes.ts` and the alerts redirect map in `App.tsx`:

```
oi_critical_issue  oi_assignment      oi_rca_review    oi_rca_approved
oi_rca_rejected    oi_capa_assigned   oi_capa_overdue  oi_capa_verified
oi_sop_review      oi_erp_required    oi_ready_to_close  oi_prevention_alert
```

---

## 19. Prevention Alert Rules

### 19.1 Real-time Similarity Check (on capture)

On issue capture, query `oi_knowledge_base` for records with:
- Matching `category` AND at least two matching `tags`, OR
- Title Levenshtein distance < 30% of the longer title length.

If matches found: create `oi_prevention_alerts` rows and display warning on capture confirmation: "This issue is similar to {issue_number} which was resolved by: {resolution_summary}."

### 19.2 Nightly Pattern Detection (02:30 IST)

Scan all issues captured in the last 90 days. If more than 2 issues share the same `category`, fall within 30 days of each other, and have keyword overlap > 50% in description or root cause text, and `repeat_issue = false`: set `repeat_issue = true` on all matching issues and notify GM + Superuser.

### 19.3 Severity Auto-Escalation (human confirmation required)

If a CAPA action is overdue by more than 7 days and the parent issue is at S4: create a notification recommending escalation to S3. GM or Superuser must explicitly confirm — not automatic.

---

## 20. Implementation Sequence

Each phase requires a separate implementation approval before work begins.

| Phase | Scope | Dependency |
|---|---|---|
| **Phase 1** | All 10 DB tables + core issue CRUD routes + Issue List + Capture + Detail page (Overview + CAPA tabs) | None |
| **Phase 2** | RCA workflow + RCA approval routes + RCA tab on detail page + notifications | Phase 1 |
| **Phase 3** | SOP workflow + SOP library page + GCS PDF upload | Phase 2 |
| **Phase 4** | ERP enforcement workflow + SAP action instruction generation | Phase 3 |
| **Phase 5** | Knowledge base + prevention alert engine + Analytics page | Phases 1–4 |
| **Phase 6** | AI agent integration (auto-classify, RCA suggest, CAPA suggest, SOP draft) | Phases 1–4 |
| **Phase 7** | Source module integration (NCR escalate button, Drawing Controls "Report Issue", PLC issue capture) | Phase 1 |

---

## 21. Complete File Change List

### New Files

| File | Purpose |
|---|---|
| `server/oi-routes.ts` | All OI API routes |
| `server/oi-service.ts` | Business logic: status transitions, closure checks, notification dispatch |
| `server/oi-audit-service.ts` | Centralised audit log writer — all OI audit events |
| `server/oi-ai-service.ts` | AI suggestion logic (auto-classify, RCA, CAPA, SOP drafts) |
| `server/oi-capa-scheduler.ts` | Nightly CAPA overdue processing + pattern detection cron |
| `client/src/pages/operational-intelligence/oi-dashboard-page.tsx` | Dashboard |
| `client/src/pages/operational-intelligence/oi-issues-page.tsx` | Issue list |
| `client/src/pages/operational-intelligence/oi-issue-detail-page.tsx` | Issue detail (all tabs) |
| `client/src/pages/operational-intelligence/oi-capture-page.tsx` | Capture form |
| `client/src/pages/operational-intelligence/oi-rca-register-page.tsx` | RCA register |
| `client/src/pages/operational-intelligence/oi-capa-register-page.tsx` | CAPA register |
| `client/src/pages/operational-intelligence/oi-sop-library-page.tsx` | SOP library |
| `client/src/pages/operational-intelligence/oi-knowledge-base-page.tsx` | Knowledge base |
| `client/src/pages/operational-intelligence/oi-analytics-page.tsx` | Analytics |

### Modified Files

| File | Change |
|---|---|
| `shared/schema.ts` | Add 10 new OI tables |
| `server/index.ts` | Register `oi-routes.ts`; register `oi-capa-scheduler.ts` cron |
| `client/src/App.tsx` | Add 9 OI routes; add all OI notification `type` values to the alerts redirect map |
| `client/src/components/layout.tsx` | Add "Operational Intelligence" to top-level navigation |
| `server/notification-routes.ts` | Handle new OI notification type values |

### Explicitly Unchanged Files

- `server/leave-service.ts` — No change
- `server/payroll-salary-core.ts` — No change
- `server/dds-pdf-service.ts` — No change
- `shared/roles.ts` — No change (existing roles are sufficient)
- All SAP sync routes — No change

---

**END OF BASELINE v1.0**

**This document requires explicit approval from THERMOPAC management before any implementation begins.**  
**No code may be written, no schema may be migrated, and no routes may be registered until approval is confirmed.**
