# Operational Intelligence — Baseline v1.2

**Status:** DRAFT — Awaiting approval. Do NOT implement until approved.  
**Date:** 21-May-2026  
**Supersedes:** Baseline v1.0 (21-May-2026)  
**Prepared by:** Architecture review session  
**Scope:** Enterprise-grade Operational, Risk, Compliance, Financial, Liability, Learning, Prevention, and Organisational Intelligence Platform for THERMOPAC EPC operations.

---

## System Objective

> **Every operational issue must become organisational learning, prevention intelligence, risk reduction, compliance assurance, and margin protection.**

Operational Intelligence must function as:
- Organisational memory
- Learning engine
- Prevention engine
- EPC intelligence platform
- Operational risk platform
- Financial risk platform
- Compliance intelligence platform
- Project protection platform
- Margin protection platform
- Continuous improvement platform
- Legal defensibility platform
- Enterprise resilience platform

---

## Table of Contents

1. [Module Purpose](#1-module-purpose)
2. [Governing Principles](#2-governing-principles)
3. [Issue Categories and EPC Scenario Coverage](#3-issue-categories-and-epc-scenario-coverage)
4. [EPC Project Phase Mapping](#4-epc-project-phase-mapping)
5. [Severity Levels](#5-severity-levels)
6. [Status Lifecycle](#6-status-lifecycle)
7. [Role Permissions and RACI Governance](#7-role-permissions-and-raci-governance)
8. [Risk Intelligence Architecture](#8-risk-intelligence-architecture)
9. [Ownership, Accountability, and Escalation](#9-ownership-accountability-and-escalation)
10. [EPC Operational Reference Fields](#10-epc-operational-reference-fields)
11. [Time Intelligence](#11-time-intelligence)
12. [Financial Risk and Exposure Intelligence](#12-financial-risk-and-exposure-intelligence)
13. [Liability and Consequential Damage Intelligence](#13-liability-and-consequential-damage-intelligence)
14. [Process Performance Intelligence](#14-process-performance-intelligence)
15. [Statutory and Compliance Governance](#15-statutory-and-compliance-governance)
16. [Site and Commissioning Intelligence](#16-site-and-commissioning-intelligence)
17. [RCA Workflow](#17-rca-workflow)
18. [CAPA Workflow](#18-capa-workflow)
19. [Lessons Learned and Continuous Improvement](#19-lessons-learned-and-continuous-improvement)
20. [Human Factor and Training Intelligence](#20-human-factor-and-training-intelligence)
21. [SOP Generation and Update Rules](#21-sop-generation-and-update-rules)
22. [ERP Enforcement Architecture](#22-erp-enforcement-architecture)
23. [Evidence Governance and Legal Defensibility](#23-evidence-governance-and-legal-defensibility)
24. [Change Impact and Dependency Intelligence](#24-change-impact-and-dependency-intelligence)
25. [AI Agent Scope and Governance](#25-ai-agent-scope-and-governance)
26. [Closure Blocking Rules](#26-closure-blocking-rules)
27. [Audit Logging Rules](#27-audit-logging-rules)
28. [Integration Points](#28-integration-points)
29. [Required Database Tables](#29-required-database-tables)
30. [Required UI Pages and Dashboards](#30-required-ui-pages-and-dashboards)
31. [API Endpoints](#31-api-endpoints)
32. [Notification Rules](#32-notification-rules)
33. [Prevention Alert Rules](#33-prevention-alert-rules)
34. [Implementation Roadmap](#34-implementation-roadmap)
35. [Complete File Change List](#35-complete-file-change-list)

---

## 1. Module Purpose

Operational Intelligence (OI) is the enterprise-grade cross-functional issue management, risk intelligence, compliance assurance, and organisational learning platform for THERMOPAC. It spans the full EPC project lifecycle — from Sales and Engineering through Commissioning, Warranty, and After-sales.

OI is **not** a replacement for the existing NCR module. NCR remains the quality-control instrument for project-specific non-conformances raised during manufacturing inspection. OI is the organisation-wide intelligence layer above NCR, procurement failures, drawing deviations, site failures, statutory non-compliances, financial exposure events, legal/liability risks, and any other class of operational event across all phases and departments.

---

## 2. Governing Principles

> **Principle 1 — No close without RCA approval.**  
> S1/S2 issues cannot transition to `verified` or `closed` unless an RCA record exists with `status = 'approved'`. Enforced at the API layer — not just UI.

> **Principle 2 — No close without CAPA completion.**  
> At least one CAPA action must exist and all non-cancelled CAPA actions must have `status = 'verified'` before any issue can close.

> **Principle 3 — No Major/Critical close without SOP review.**  
> S1/S2 issues must have at least one approved SOP before closure. S3 repeat issues also require an approved SOP.

> **Principle 4 — SOPs must become ERP controls wherever applicable.**  
> If an approved SOP carries `erp_control_required = true`, the linked ERP enforcement record must reach `status = 'active'` before closure.

> **Principle 5 — AI may suggest, humans approve.**  
> All AI output lands in `status = 'ai_draft'`. No AI action may trigger approval, task creation, or any status change with downstream effect. All AI outputs carry a confidence score and are fully traceable.

> **Principle 6 — Every action is audit logged.**  
> Every transition, edit, comment, attachment, AI suggestion, approval, and escalation is written to `oi_audit_log` with actor, IST timestamp, old value, new value, and context. The log is append-only.

> **Principle 7 — Forward-only state machine.**  
> Transitions follow an explicit allowed-transitions map. No backward transitions except via a governed `reopen` action with mandatory reason.

> **Principle 8 — Critical liability issues require GM approval.**  
> Issues with `liability_severity = 'critical'` or `consequential_damage_flag = true` cannot close without GM or Superuser sign-off.

> **Principle 9 — Statutory/legal exposure issues require compliance verification.**  
> Issues with `statutory_criticality = 'high'` or `legal_review_required = true` must have a compliance verification record before closure.

> **Principle 10 — Evidence is immutable.**  
> All uploaded evidence files are SHA-256 hashed at upload. Hashes are stored. Any tampering is detectable. Evidence linked to issues with `legal_hold = true` cannot be deleted.

> **Principle 11 — ERP enforcement is not SAP-only.**  
> Enforcement controls apply across the THERMOPAC platform — drawing approval gates, DVS blocks, QC hold points, dispatch holds, workflow restrictions, and GCS document validation — in addition to SAP B1 actions.

> **Principle 12 — Insurance, customer claim, and vendor recovery workflows must be tracked.**  
> All financial claims triggered by an OI issue (insurance, customer claim, vendor recovery) must have lifecycle tracking inside OI.

---

## 3. Issue Categories and EPC Scenario Coverage

Each issue carries exactly one primary category and one sub-category (from the lists below).

### 3.1 Primary Categories

| Code | Category | Description |
|---|---|---|
| `QC` | Quality Control | NCRs, inspection failures, dimensional deviations, test failures, FAT/SAT failures |
| `DWG` | Drawing & Design | Wrong revision, missing tolerance, design error, drawing-BOM mismatch, clash, HAZOP finding |
| `PROC` | Procurement | Wrong item, late delivery, vendor non-compliance, PO error, WO error, BOM error |
| `MFG` | Manufacturing | Process deviation, rework, scrap, welding failure, painting/coating failure, fabrication error |
| `SITE` | Site / Erection | Construction error, alignment issue, nozzle orientation, piping clash, civil foundation issue |
| `COMM` | Commissioning | SAT failure, performance trial failure, utility mismatch, capacity shortfall, process instability |
| `LOG` | Logistics & Dispatch | Packing/shipping damage, container damage, wrong dispatch, customs/export issue, logistics delay |
| `DOC` | Documentation | Missing document, wrong revision filed, GCS mis-routing, superseded doc used, lost/deleted file |
| `SAP` | SAP / ERP Data | Wrong master data, duplicate entry, incorrect UOM, pricing error, unauthorized data change |
| `COMP` | Compliance & Statutory | Regulatory non-compliance, license breach, calibration expiry, audit finding, PESO/ASME/API violation |
| `SAFETY` | Safety & Environment | Near-miss, unsafe act, fire/explosion, environmental release, pressure vessel violation |
| `FIN` | Financial & Commercial | LD exposure, bank guarantee risk, retention dispute, contract scope deviation, change order dispute |
| `LEGAL` | Legal & Liability | Contractual liability, warranty claim, consequential damage, arbitration, performance guarantee |
| `HR` | Human Resources | Attendance breach, competency gap, certification expiry, supervision failure, skill gap |
| `CUST` | Customer Complaint | Field failure, delivery complaint, customer production loss, repeat complaint |
| `SYS` | System / Process | System downtime, integration failure, access control failure, cyber incident, backup failure |
| `INT` | Integrity & Fraud | Unauthorized approval, fake inspection evidence, procurement fraud, compliance bypass, duplicate billing |
| `OTHER` | Other | Does not fit above |

### 3.2 EPC Scenario Sub-categories (non-exhaustive reference list)

The following specific scenarios must be capturable as sub-categories or tags:

**Engineering & Design:** Wrong design basis, wrong customer input, missing customer approval, wrong design assumption, design code mismatch, process guarantee mismatch, utility data mismatch, site condition mismatch, BEDD non-compliance, datasheet mismatch, P&ID error, 3D model clash, pipe routing clash, DVS verification failure, ECR/ECN error, revision mismatch, unauthorized revision, GCS document mismatch, HAZOP finding, risk assessment finding.

**Procurement & Manufacturing:** Wrong material dispatch, wrong BOM, wrong PO, wrong WO, missing approvals, vendor quality failure, vendor delay, material shortage, subcontractor poor performance, fabrication error, welding failure, hydrotest failure, painting/coating failure, wrong motor rotation, instrument calibration issue.

**Site, Commissioning & Warranty:** Nozzle orientation mismatch, erection alignment issue, foundation mismatch, site access issue, work permit delay, customer site readiness issue, utility readiness issue, civil foundation readiness issue, crane/lifting issue, FAT failure, SAT failure, commissioning failure, performance guarantee failure, capacity shortfall, energy consumption issue, heat transfer underperformance, process instability, leakage, vibration issue, excessive noise, spare part failure, repeat failure, warranty claim.

**Commercial & Contractual:** Contract scope deviation, change order dispute, variation order delay, unapproved extra work, scope creep, customer specification ambiguity, contractual milestone failure, payment delay impact, retention release issue, bank guarantee exposure, advance BG risk, performance BG risk, contract termination risk, force majeure impact, customer-caused delay, vendor/subcontractor-caused delay, interface responsibility dispute.

**Compliance & Safety:** Boiler inspector observation, PESO compliance issue, factory inspector observation, electrical inspector non-conformance, environmental violation, fire & safety non-conformance, pressure vessel code violation, ASME/API/IS code non-compliance, calibration expiry violation, ISO audit finding, customer audit finding, statutory compliance failure, pollution control violation.

**Financial & Legal:** Liquidated damages exposure, vendor claim exposure, customer claim exposure, insurance exposure, logistics loss, customs penalty, site rework cost, emergency procurement cost, production downtime cost, reputation risk, consequential damage, business interruption claim.

**Integrity & System:** ERP data corruption, unauthorized approval, conflict of interest, vendor favoritism, fake inspection evidence, manipulated report, duplicate billing, procurement fraud suspicion, compliance bypass, cyber/security incident, backup failure, integration failure, AI wrong recommendation risk.

**Catastrophic Events:** Emergency shutdown, catastrophic equipment failure, fire/explosion, major environmental release, business continuity disruption, disaster recovery failure.

---

## 4. EPC Project Phase Mapping

Every issue must be classified with the EPC project phase in which it occurred or was detected.

| Code | Phase | Description |
|---|---|---|
| `SALES` | Sales | Bid, tender, customer negotiation, scope definition |
| `ENG` | Engineering | Basic engineering, detailed engineering, design calculations |
| `DVS` | Design Verification | DVS check, drawing approval, code compliance review |
| `PROC` | Procurement | PO placement, vendor selection, expediting |
| `MFG` | Manufacturing | Fabrication, machining, assembly |
| `QC` | Quality Control | Inspection, testing, QAP execution, NCR |
| `FAT` | FAT | Factory Acceptance Test |
| `DISP` | Dispatch | Packing, documentation, loading |
| `LOG` | Logistics | Transport, customs, delivery |
| `SITE` | Site Construction | Civil, structural, piping, mechanical erection |
| `ERECT` | Erection | Equipment setting, alignment, grouting |
| `SAT` | SAT | Site Acceptance Test |
| `COMM` | Commissioning | Pre-commissioning, commissioning, startup |
| `PERF` | Performance Trial | Performance guarantee test, capacity demonstration |
| `WARR` | Warranty | Post-commissioning warranty period |
| `AFTS` | After-sales | Spare parts, retrofits, extended support |

---

## 5. Severity Levels

| Code | Label | Definition | RCA Required | SOP Required | GM Approval to Close |
|---|---|---|---|---|---|
| `S1` | Critical | Customer impact, safety risk, regulatory breach, financial exposure > ₹5L, catastrophic event | Yes | Yes | Yes |
| `S2` | Major | Significant rework, production stoppage > 4 h, repeat Minor, financial exposure ₹1L–5L, LD trigger | Yes | Yes | No (SM sufficient) |
| `S3` | Minor | Isolated incident, no customer impact, correctable without major rework | No | No (Yes if repeat) | No |
| `S4` | Observation | Potential risk before failure; improvement suggestion | No | No | No |

Severity is set at capture. Escalation or de-escalation by Manager or above requires a reason, which is audit logged.

Auto-escalation rules (subject to human confirmation — not automatic):
- S4 with CAPA overdue > 7 days → recommend S3
- S3 with `repeat_issue = true` → recommend S2
- Any issue with `statutory_criticality = 'high'` → recommend minimum S2
- Any issue with `consequential_damage_flag = true` → recommend minimum S1

---

## 6. Status Lifecycle

### 6.1 Status Map

```
[CAPTURED] → [CLASSIFIED] → [INVESTIGATING]
                                   │
                          ┌────────┴────────────┐
                     (S1/S2)               (S3/S4)
                          │                     │
                    [RCA_DRAFT]            [CAPA_OPEN]
                          │
                    [RCA_REVIEW]
                          │
                   [RCA_APPROVED]
                          │
                    [CAPA_OPEN] → [CAPA_IN_PROGRESS] → [CAPA_VERIFIED]
                                                              │
                                              ┌───────────────┴─────────────────────┐
                                         (S1/S2)                              (S3/S4 no repeat)
                                              │                                      │
                                        [SOP_REVIEW]                          [VERIFIED]
                                              │
                                  [ERP_ENFORCEMENT] (if required)
                                              │
                                        [VERIFIED] → [CLOSED]

Any status (except CLOSED) → [REOPENED]   (mandatory reason)
Any status                 → [WITHDRAWN]  (Superuser only, mandatory reason)
```

### 6.2 Status Definitions

| Status | Description | Who Can Enter | Blocking Conditions |
|---|---|---|---|
| `captured` | Issue submitted | Any authenticated user | None |
| `classified` | Severity, category, phase, and owner confirmed | Manager or above | None |
| `investigating` | Investigation in progress | Assigned investigator | Must be `classified` |
| `rca_draft` | RCA being drafted | Investigator or AI | Must be `investigating` (S1/S2 only) |
| `rca_review` | RCA submitted for approval | Investigator | `findings` non-empty |
| `rca_approved` | RCA approved | SM / GM / Superuser | Approver ≠ author |
| `capa_open` | At least one CAPA action created | Manager or above | RCA approved (S1/S2); skipped for S3/S4 |
| `capa_in_progress` | CAPA accepted by assignee | CAPA assignee | — |
| `capa_verified` | All CAPA actions verified | Manager or above | All non-cancelled CAPA `status = 'verified'` |
| `sop_review` | SOP created or flagged for update | Manager or above | S1/S2 mandatory; S3 repeat mandatory |
| `erp_enforcement` | ERP controls being configured | Superuser | Only if `erp_control_required = true` |
| `verified` | All closure conditions met | GM or above (S1), SM or above (S2/S3/S4) | All blocking rules in Section 26 pass |
| `closed` | Archived; knowledge base entry created | GM or Superuser (S1); GM or Superuser (all if `liability_severity = 'critical'`) | All closure blocking rules pass |
| `reopened` | Re-activated | Manager or above | Mandatory reason |
| `withdrawn` | Voided | Superuser | Mandatory reason |

### 6.3 Allowed Transitions

| From | Allowed To |
|---|---|
| `captured` | `classified`, `withdrawn` |
| `classified` | `investigating`, `withdrawn` |
| `investigating` | `rca_draft` (S1/S2), `capa_open` (S3/S4), `withdrawn` |
| `rca_draft` | `rca_review`, `investigating` |
| `rca_review` | `rca_approved`, `rca_draft` |
| `rca_approved` | `capa_open` |
| `capa_open` | `capa_in_progress` |
| `capa_in_progress` | `capa_verified` |
| `capa_verified` | `sop_review` (S1/S2), `verified` (S3/S4 no repeat) |
| `sop_review` | `erp_enforcement` (if required), `verified` |
| `erp_enforcement` | `verified` |
| `verified` | `closed`, `reopened` |
| `closed` | `reopened` |
| `reopened` | `classified` |

Any attempt outside this map returns HTTP 422 with error code `transition_not_allowed`.

---

## 7. Role Permissions and RACI Governance

### 7.1 Issue Actions

| Action | Employee | Manager | Senior Manager | General Manager | Superuser |
|---|---|---|---|---|---|
| Capture issue | ✓ | ✓ | ✓ | ✓ | ✓ |
| View own issues | ✓ | ✓ | ✓ | ✓ | ✓ |
| View all issues | — | Own dept | Own dept + below | All | All |
| Classify / set severity | — | ✓ | ✓ | ✓ | ✓ |
| Assign investigator | — | ✓ | ✓ | ✓ | ✓ |
| Escalate severity | — | ✓ | ✓ | ✓ | ✓ |
| De-escalate severity | — | — | ✓ | ✓ | ✓ |
| Set risk scores | — | ✓ | ✓ | ✓ | ✓ |
| Set financial exposure fields | — | — | ✓ | ✓ | ✓ |
| Set liability fields | — | — | ✓ | ✓ | ✓ |
| Reopen issue | — | ✓ | ✓ | ✓ | ✓ |
| Withdraw issue | — | — | — | — | ✓ |

### 7.2 RCA Actions

| Action | Employee | Manager | Senior Manager | General Manager | Superuser |
|---|---|---|---|---|---|
| Create / edit RCA draft | Investigator only | ✓ | ✓ | ✓ | ✓ |
| Submit RCA for review | Investigator only | ✓ | ✓ | ✓ | ✓ |
| Approve RCA | — | — | ✓ | ✓ | ✓ |
| Reject RCA | — | — | ✓ | ✓ | ✓ |

RCA approver ≠ RCA author. Enforced at API layer.

### 7.3 CAPA Actions

| Action | Employee | Manager | Senior Manager | General Manager | Superuser |
|---|---|---|---|---|---|
| Create CAPA action | — | ✓ | ✓ | ✓ | ✓ |
| Accept CAPA | Assigned only | ✓ | ✓ | ✓ | ✓ |
| Update CAPA progress | Assigned only | ✓ | ✓ | ✓ | ✓ |
| Verify CAPA | — | ✓ | ✓ | ✓ | ✓ |
| Extend CAPA due date | — | — | ✓ | ✓ | ✓ |

CAPA verifier ≠ CAPA assignee. Enforced at API layer.

### 7.4 SOP and Closure Actions

| Action | Employee | Manager | Senior Manager | General Manager | Superuser |
|---|---|---|---|---|---|
| Create / edit SOP draft | — | ✓ | ✓ | ✓ | ✓ |
| Approve SOP | — | — | ✓ | ✓ | ✓ |
| Mark ERP enforcement active | — | — | — | — | ✓ |
| Verify issue | — | — | ✓ | ✓ | ✓ |
| Close issue (standard) | — | — | — | ✓ | ✓ |
| Close S1 / liability critical | — | — | — | ✓ | ✓ |

### 7.5 RACI Governance Table

| Activity | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| RCA | Investigator | SM / GM | Technical Owner | Issue Owner, QC, Management |
| CAPA | CAPA Assignee | Manager | Issue Owner | Investigator, GM |
| SOP | Ops / QC Lead | SM / GM | Compliance Owner | All Managers |
| ERP Enforcement | Superuser | GM | Technical Owner | SAP Admin, Finance |
| Closure | GM / Superuser | GM | Legal Owner (if applicable) | All Stakeholders |

---

## 8. Risk Intelligence Architecture

### 8.1 Risk Fields on `oi_issues`

| Field | Type | Description |
|---|---|---|
| `probability_level` | text | `very_low`, `low`, `medium`, `high`, `very_high` |
| `impact_level` | text | `negligible`, `minor`, `moderate`, `major`, `catastrophic` |
| `risk_score` | integer | Computed: `probability_weight × impact_weight` (1–25 scale) |
| `risk_rating` | text | `low`, `medium`, `high`, `critical` (derived from score bands) |
| `recurrence_risk` | text | `low`, `medium`, `high` |
| `business_criticality` | text | `low`, `medium`, `high`, `critical` |
| `customer_criticality` | text | `low`, `medium`, `high`, `critical` |
| `safety_criticality` | text | `none`, `low`, `medium`, `high`, `critical` |
| `statutory_criticality` | text | `none`, `low`, `medium`, `high`, `critical` |
| `financial_criticality` | text | `low`, `medium`, `high`, `critical` |
| `operational_criticality` | text | `low`, `medium`, `high`, `critical` |
| `schedule_criticality` | text | `low`, `medium`, `high`, `critical` |
| `oi_risk_score` | integer | Unified OI Risk Score (see 8.2) |

### 8.2 Unified OI Risk Score

The OI Risk Score is a composite integer computed server-side across nine dimensions. Each dimension is scored 0–10 by the issue owner or system. The composite score is the weighted sum.

```
OI Risk Score =
  (Technical Risk × 1.0)
+ (Quality Risk × 1.2)
+ (Safety Risk × 2.0)
+ (Financial Risk × 1.5)
+ (Compliance Risk × 1.8)
+ (Schedule Risk × 1.0)
+ (Liability Risk × 2.0)
+ (Customer Impact × 1.5)
+ (Operational Impact × 1.0)
```

Weights are configurable in a system settings table (`oi_risk_weight_config`). Default weights listed above. Score bands: 0–20 = Low, 21–50 = Medium, 51–80 = High, 81+ = Critical.

### 8.3 Configurable Risk Matrix

A 5×5 risk matrix is maintained in a `oi_risk_matrix_config` table (Probability 1–5 × Impact 1–5 → Risk Rating). Default matrix follows standard EPC risk management convention. Configurable by Superuser only. All matrix changes are audit logged.

---

## 9. Ownership, Accountability, and Escalation

### 9.1 Ownership Fields on `oi_issues`

| Field | FK to | Description |
|---|---|---|
| `reported_by` | `users` | Issue reporter |
| `assigned_to` | `users` | Primary investigator / owner |
| `risk_owner` | `users` nullable | Person accountable for risk mitigation |
| `escalation_owner` | `users` nullable | Person responsible for escalation resolution |
| `business_owner` | `users` nullable | Business unit owner |
| `technical_owner` | `users` nullable | Technical lead for the issue |
| `compliance_owner` | `users` nullable | Compliance/statutory responsibility |
| `financial_owner` | `users` nullable | Financial exposure owner |
| `legal_owner` | `users` nullable | Legal/liability responsibility |

### 9.2 Escalation Architecture

Escalation is event-driven and rule-based. Escalation records are written to `oi_escalations`.

| Trigger | Escalation Type | Auto-notification Recipients |
|---|---|---|
| S1 issue captured | `s1_immediate` | GM, Superuser, all Managers |
| `safety_criticality = 'critical'` | `safety_escalation` | GM, Superuser, Safety Owner |
| `statutory_criticality = 'high'` | `statutory_escalation` | Compliance Owner, GM, Superuser |
| `financial_criticality = 'critical'` | `financial_escalation` | Financial Owner, GM, Superuser |
| `legal_review_required = true` | `legal_escalation` | Legal Owner, GM, Superuser |
| `customer_criticality = 'critical'` | `customer_escalation` | Escalation Owner, GM |
| RCA SLA breached | `rca_sla_breach` | GM, Superuser |
| CAPA overdue > 7 days | `capa_overdue_escalation` | GM, Escalation Owner |
| `consequential_damage_flag = true` | `management_escalation` | GM, Superuser, Financial Owner, Legal Owner |

### 9.3 Escalation SLA Logic

| Severity | RCA Initiation SLA | CAPA Initiation SLA | Closure SLA |
|---|---|---|---|
| S1 | 24 hours | 72 hours from RCA approval | 30 days |
| S2 | 72 hours | 7 days from RCA approval | 60 days |
| S3 | — | 7 days from classification | 90 days |
| S4 | — | 30 days from classification | 180 days |

SLA breach triggers escalation notifications. SLA dates are stored in `oi_issues` as `rca_due_date`, `capa_due_date`, `closure_due_date`.

---

## 10. EPC Operational Reference Fields

Every issue optionally links to the relevant operational records. No FK constraint is enforced at DB level for cross-module references where the referenced table may not always exist (stored as text codes or nullable integer IDs).

| Field | Type | Description |
|---|---|---|
| `project_id` | FK → `projects` nullable | Linked EPC project |
| `customer_id` | integer nullable | Customer (linked to SAP BP) |
| `vendor_id` | integer nullable | Vendor (linked to SAP BP) |
| `subcontractor_id` | integer nullable | Subcontractor |
| `equipment_tag` | text nullable | Equipment tag number |
| `item_code` | text nullable | SAP item code |
| `package_code` | text nullable | Package/sub-package code |
| `drawing_number` | text nullable | Drawing number |
| `drawing_revision` | text nullable | Drawing revision at time of issue |
| `pid_reference` | text nullable | P&ID document reference |
| `dds_reference` | text nullable | DDS document reference |
| `bom_reference` | text nullable | BOM reference |
| `po_reference` | text nullable | PO number |
| `wo_reference` | text nullable | Work order number |
| `io_reference` | text nullable | Inspection order reference |
| `fat_reference` | text nullable | FAT record reference |
| `sat_reference` | text nullable | SAT record reference |
| `commissioning_reference` | text nullable | Commissioning record reference |
| `inspection_reference` | text nullable | Inspection report reference |
| `gcs_path_reference` | text nullable | GCS path of source document |
| `sap_document_reference` | text nullable | SAP document number |
| `contract_reference` | text nullable | Contract number |
| `clause_reference` | text nullable | Contract clause |
| `change_order_reference` | text nullable | Change/variation order number |
| `ecr_reference` | text nullable | Engineering Change Request number |
| `ecn_reference` | text nullable | Engineering Change Notice number |
| `mom_reference` | text nullable | Minutes of Meeting reference |
| `risk_register_reference` | text nullable | Risk register entry reference |

---

## 11. Time Intelligence

Time metrics are computed fields derived from timestamps on `oi_issues` and related records. They are stored for analytics and SLA tracking.

| Field | Type | Description |
|---|---|---|
| `occurrence_time` | timestamp nullable | When the event actually occurred (may differ from capture time) |
| `detection_time` | timestamp nullable | When the issue was detected |
| `capture_time` | timestamp | When it was entered into OI (= `created_at`) |
| `response_time_hours` | numeric nullable | Hours from detection to first action taken |
| `containment_time_hours` | numeric nullable | Hours from detection to containment |
| `recovery_time_hours` | numeric nullable | Hours from containment to full recovery |
| `downtime_duration_hours` | numeric nullable | Total downtime caused |
| `closure_time_days` | numeric nullable | Days from capture to closure |
| `rca_due_date` | date nullable | SLA deadline for RCA initiation |
| `capa_due_date` | date nullable | SLA deadline for CAPA initiation |
| `closure_due_date` | date nullable | SLA deadline for closure |
| `mttr_hours` | numeric nullable | Mean Time to Repair (populated from equipment tag history) |
| `mtbf_hours` | numeric nullable | Mean Time Between Failures (populated from equipment tag history) |

---

## 12. Financial Risk and Exposure Intelligence

### 12.1 Financial Fields on `oi_issues`

| Field | Type | Description |
|---|---|---|
| `estimated_loss_amount` | numeric(14,2) nullable | Estimated total financial loss (INR) |
| `actual_loss_amount` | numeric(14,2) nullable | Confirmed actual loss (INR) |
| `rework_cost` | numeric(14,2) nullable | Rework/repair cost |
| `scrap_cost` | numeric(14,2) nullable | Scrap material cost |
| `potential_liability_amount` | numeric(14,2) nullable | Maximum potential liability |
| `emergency_procurement_cost` | numeric(14,2) nullable | Emergency buy cost |
| `site_rework_cost` | numeric(14,2) nullable | Site rework / rectification cost |
| `logistics_loss` | numeric(14,2) nullable | Logistics/shipping damage loss |
| `downtime_cost` | numeric(14,2) nullable | Production downtime cost |
| `opportunity_loss` | numeric(14,2) nullable | Lost business/margin opportunity |
| `ld_applicable` | boolean | Whether liquidated damages apply |
| `ld_estimated_amount` | numeric(14,2) nullable | Estimated LD exposure |
| `payment_impact_amount` | numeric(14,2) nullable | Impact on scheduled payment |
| `bg_exposure_amount` | numeric(14,2) nullable | Bank guarantee at risk |
| `retention_amount` | numeric(14,2) nullable | Retention money at risk |
| `margin_erosion_risk` | text nullable | `low`, `medium`, `high`, `critical` |
| `recovery_possible` | boolean | Whether cost recovery is possible |
| `recovery_source` | text nullable | `insurance`, `vendor`, `customer`, `internal`, `other` |
| `insurance_claim_flag` | boolean | Whether an insurance claim is being raised |
| `customer_claim_flag` | boolean | Whether a customer has raised a financial claim |
| `vendor_recovery_flag` | boolean | Whether vendor recovery is being pursued |
| `claim_status` | text nullable | `not_raised`, `raised`, `under_negotiation`, `settled`, `disputed`, `closed` |

### 12.2 COPQ Tracking

Cost of Poor Quality is computed from `rework_cost + scrap_cost + site_rework_cost + emergency_procurement_cost` and surfaced in the COPQ dashboard per category, project, vendor, and time period.

---

## 13. Liability and Consequential Damage Intelligence

### 13.1 Liability Fields on `oi_issues`

| Field | Type | Description |
|---|---|---|
| `liability_type` | text nullable | `contractual`, `consequential`, `indirect`, `ld`, `performance_guarantee`, `warranty`, `product`, `safety`, `environmental`, `statutory`, `regulatory`, `third_party`, `other` |
| `liability_severity` | text nullable | `low`, `medium`, `high`, `critical` |
| `liability_probability` | text nullable | `low`, `medium`, `high` |
| `consequential_damage_flag` | boolean | True if consequential damages may arise |
| `consequential_damage_description` | text nullable | Nature of consequential damage |
| `estimated_consequential_loss` | numeric(14,2) nullable | INR |
| `direct_loss_amount` | numeric(14,2) nullable | INR |
| `indirect_loss_amount` | numeric(14,2) nullable | INR |
| `customer_claim_amount` | numeric(14,2) nullable | Amount claimed by customer |
| `third_party_claim_amount` | numeric(14,2) nullable | Third-party claim amount |
| `insurance_coverage_available` | boolean | Whether insurance covers this |
| `insurance_claim_reference` | text nullable | Insurer claim reference |
| `legal_case_reference` | text nullable | Court/legal case reference |
| `legal_status` | text nullable | `none`, `notice_sent`, `dispute`, `litigation`, `arbitration`, `settled`, `closed` |
| `arbitration_flag` | boolean | Whether arbitration has been invoked |
| `arbitration_reference` | text nullable | Arbitration case reference |
| `contractual_clause_reference` | text nullable | Relevant contract clause |
| `ld_clause_reference` | text nullable | LD clause reference |
| `pg_clause_reference` | text nullable | Performance guarantee clause |
| `warranty_clause_reference` | text nullable | Warranty clause reference |
| `liability_owner` | FK → `users` nullable | Person accountable for liability management |
| `legal_review_required` | boolean | Whether legal review is mandatory before closure |
| `management_review_required` | boolean | Whether management review board is required |
| `legal_hold` | boolean | Evidence under legal hold — deletion blocked |

---

## 14. Process Performance Intelligence

Applicable to issues in categories `COMM`, `SITE`, `QC`, `MFG` where process parameters are relevant.

| Field | Type | Description |
|---|---|---|
| `design_capacity` | numeric(12,3) nullable | Design rated capacity (unit specified in `capacity_unit`) |
| `actual_capacity` | numeric(12,3) nullable | Measured actual capacity |
| `capacity_unit` | text nullable | e.g. `m3/hr`, `kW`, `tonnes/hr` |
| `design_utility_consumption` | numeric(12,3) nullable | Designed utility consumption |
| `actual_utility_consumption` | numeric(12,3) nullable | Measured utility consumption |
| `utility_unit` | text nullable | e.g. `kWh`, `m3/hr`, `kg/hr` |
| `design_temperature` | numeric(8,2) nullable | °C |
| `actual_temperature` | numeric(8,2) nullable | °C |
| `design_pressure` | numeric(8,3) nullable | bar(g) |
| `actual_pressure` | numeric(8,3) nullable | bar(g) |
| `process_efficiency` | numeric(5,2) nullable | % |
| `performance_deviation` | numeric(5,2) nullable | % deviation from design |
| `heat_transfer_deviation` | numeric(5,2) nullable | % deviation |
| `pressure_drop_deviation` | numeric(5,2) nullable | % deviation |
| `thermal_efficiency_deviation` | numeric(5,2) nullable | % deviation |

---

## 15. Statutory and Compliance Governance

### 15.1 Compliance Fields on `oi_issues`

| Field | Type | Description |
|---|---|---|
| `statutory_authority` | text nullable | PESO, Boiler Inspectorate, Factory Inspector, CPCB, CEA, DGMS, etc. |
| `compliance_standard` | text nullable | ASME, API, IS, ISO 9001, ISO 14001, ISO 45001, IBR, etc. |
| `compliance_due_date` | date nullable | Date by which compliance must be demonstrated |
| `non_compliance_severity` | text nullable | `minor`, `major`, `critical` |
| `legal_exposure_level` | text nullable | `none`, `low`, `medium`, `high`, `extreme` |
| `regulatory_closure_verified` | boolean | Whether statutory authority has accepted closure |
| `regulatory_closure_reference` | text nullable | Reference number from authority |
| `audit_finding_reference` | text nullable | Audit report reference |
| `calibration_expiry_date` | date nullable | If issue relates to calibration compliance |
| `license_number` | text nullable | Relevant license/certificate number |
| `inspection_body` | text nullable | Third-party inspection body |

### 15.2 Compliance Closure Rule

Issues with `statutory_criticality = 'high'` or `regulatory_closure_verified = false` and `compliance_standard` set cannot close until `regulatory_closure_verified = true` and `regulatory_closure_reference` is non-empty.

---

## 16. Site and Commissioning Intelligence

### 16.1 Site Fields on `oi_issues`

| Field | Type | Description |
|---|---|---|
| `site_issue_type` | text nullable | `erection`, `alignment`, `civil`, `electrical`, `instrumentation`, `piping`, `structural`, `commissioning`, `utility`, `access`, `safety`, `other` |
| `punch_point_reference` | text nullable | Linked punch list item reference |
| `erection_checklist_reference` | text nullable | Linked erection checklist |
| `commissioning_checklist_reference` | text nullable | Linked commissioning checklist |
| `sat_checklist_reference` | text nullable | Linked SAT checklist |
| `customer_signoff_reference` | text nullable | Customer sign-off document reference |
| `unresolved_punch_points` | integer nullable | Count of unresolved punch points blocking this issue |
| `punch_points_block_closure` | boolean | If true, unresolved punch points block closure |
| `site_readiness_status` | text nullable | `not_ready`, `partially_ready`, `ready` |
| `commissioning_readiness_status` | text nullable | `not_ready`, `partially_ready`, `ready` |
| `utility_readiness_status` | text nullable | `not_ready`, `partially_ready`, `ready` |
| `documentation_readiness_status` | text nullable | `not_ready`, `partially_ready`, `ready` |
| `spare_readiness_status` | text nullable | `not_ready`, `partially_ready`, `ready` |
| `training_readiness_status` | text nullable | `not_ready`, `partially_ready`, `ready` |

---

## 17. RCA Workflow

### 17.1 RCA Record Fields

| Field | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `issue_id` | FK → `oi_issues` | — |
| `method` | text | `5_why`, `fishbone`, `fault_tree`, `fmea`, `free_form` |
| `ai_suggested` | boolean | AI pre-populated |
| `ai_confidence_score` | numeric(3,2) nullable | AI confidence 0.00–1.00 |
| `why_1` … `why_5` | text nullable | 5-Why chain |
| `fishbone_json` | jsonb nullable | Ishikawa cause categories |
| `findings` | text | Root cause conclusion — mandatory before submission |
| `contributing_factors` | text[] | List of contributing factors |
| `escaped_defect` | boolean | Defect escaped a detection gate |
| `detection_gap` | text nullable | Where detection should have occurred |
| `human_factor_involved` | boolean | Whether human error contributed |
| `human_factor_details` | text nullable | Nature of human factor |
| `status` | text | `ai_draft`, `draft`, `submitted`, `approved`, `rejected` |
| `submitted_by` | FK → `users` | — |
| `submitted_at` | timestamp | — |
| `approved_by` | FK → `users` nullable | — |
| `approved_at` | timestamp nullable | — |
| `rejection_reason` | text nullable | Mandatory on rejection |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | — |

### 17.2 RCA Approval Gate

- Approver: SM, GM, or Superuser.
- Approver ≠ `submitted_by`.
- `findings` non-empty.
- If `method = '5_why'`, at least `why_1` non-empty.
- All checks at `POST /api/oi/rca/:id/approve`.

### 17.3 RCA Rejection

- `rejection_reason` mandatory.
- RCA → `draft`; issue → `rca_draft`.
- Notification to investigator.

---

## 18. CAPA Workflow

### 18.1 CAPA Action Record Fields

| Field | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `issue_id` | FK → `oi_issues` | — |
| `type` | text | `corrective`, `preventive` |
| `description` | text | — |
| `assignee_id` | FK → `users` | — |
| `due_date` | date | — |
| `priority` | text | `high`, `medium`, `low` |
| `task_id` | FK → `tasks` nullable | Auto-linked task |
| `evidence_required` | boolean | — |
| `evidence_description` | text nullable | — |
| `evidence_gcs_path` | text nullable | — |
| `evidence_sha256` | text nullable | SHA-256 hash of uploaded evidence |
| `status` | text | `open`, `accepted`, `in_progress`, `completed`, `verified`, `overdue`, `cancelled` |
| `completion_note` | text nullable | — |
| `verified_by` | FK → `users` nullable | — |
| `verified_at` | timestamp nullable | — |
| `verification_note` | text nullable | — |
| `effectiveness_score` | integer nullable | 1–5 score assessed at periodic review |
| `overdue_waived_by` | FK → `users` nullable | — |
| `overdue_waiver_reason` | text nullable | — |
| `created_by` | FK → `users` | — |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | — |

### 18.2 CAPA Task Linkage

On CAPA creation, a `tasks` record is auto-created:
- `title` = `"[CAPA] {issue_number}: {description[:100]}"`
- `assignedTo` = `assignee_id`
- `dueDate` = `due_date`
- `priority` = `priority`
- `link` = `/operational-intelligence/issues/{issue_id}`

Task linked back via `task_id`. Task completion → CAPA `completed` (pending verify). CAPA cancelled → task cancelled.

### 18.3 CAPA Overdue Processing

Daily at 06:00 IST. Any CAPA with `status IN ('open','accepted','in_progress')` and `due_date < TODAY` → `overdue`. Notifications to assignee and issue owner. Escalation recommendations per Section 9.3 (human confirmation required, not automatic).

### 18.4 CAPA Verification Gate

- Verifier ≠ assignee.
- If `evidence_required = true`: `evidence_gcs_path` non-null.
- `completion_note` non-empty.
- Enforced at `POST /api/oi/capa/:id/verify`.

### 18.5 CAPA Effectiveness Scoring

At the periodic review cycle (configurable, default 90 days post-closure), the issue owner is prompted to score each CAPA action's effectiveness (1–5). Score stored in `oi_capa_actions.effectiveness_score`. Averaged score contributes to CAPA effectiveness dashboard and knowledge base entry.

---

## 19. Lessons Learned and Continuous Improvement

### 19.1 Lessons Learned Workflow

Every closed issue automatically generates a lessons learned draft in `oi_lessons_learned`. Workflow:

`draft` → `review` → `approved` → `published`

Published lessons are searchable across the organisation and linked to the issue, the relevant project phase, category, equipment tag, and vendor.

### 19.2 `oi_lessons_learned` Table Fields

| Field | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `issue_id` | FK → `oi_issues` UNIQUE | — |
| `lesson_title` | text | — |
| `what_happened` | text | — |
| `what_caused_it` | text | Root cause summary |
| `what_was_done` | text | Resolution summary |
| `what_should_be_done_differently` | text | Future prevention guidance |
| `applicable_phases` | text[] | EPC phases where lesson is relevant |
| `applicable_categories` | text[] | Issue categories |
| `equipment_families` | text[] | Equipment types affected |
| `vendor_codes` | text[] | Vendor card codes (if vendor-specific) |
| `status` | text | `draft`, `review`, `approved`, `published` |
| `reviewed_by` | FK → `users` nullable | — |
| `approved_by` | FK → `users` nullable | — |
| `published_at` | timestamp nullable | — |
| `effectiveness_review_due` | date nullable | When to re-assess effectiveness |
| `recurrence_detected` | boolean | Whether same lesson has appeared again |
| `recurrence_issue_ids` | integer[] | Recurrence-linked issue IDs |
| `capa_effectiveness_score` | numeric(3,2) nullable | Average CAPA effectiveness |
| `sop_effectiveness_score` | numeric(3,2) nullable | Assessed SOP impact |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | — |

### 19.3 Continuous Improvement Metrics

The analytics engine tracks:
- CAPA effectiveness score by category and department
- SOP effectiveness score (recurrence rate after SOP publication)
- Cross-project failure correlation (same equipment family, same vendor, same phase)
- Recurring vendor failure detection
- Recurring equipment family failure detection
- Organisational learning metrics (issues per quarter, closure rate, repeat rate, MTTR trend)

---

## 20. Human Factor and Training Intelligence

Fields on `oi_issues`:

| Field | Type | Description |
|---|---|---|
| `human_factor_type` | text nullable | `competency_gap`, `training_deficiency`, `certification_expiry`, `operator_error`, `supervision_failure`, `fatigue_risk`, `unsafe_behavior`, `procedure_violation`, `communication_failure`, `other` |
| `training_required` | boolean | Whether corrective training is needed |
| `training_description` | text nullable | What training is required |
| `certification_expired` | boolean | Whether a certificate was expired at time of issue |
| `certification_details` | text nullable | Which certification and who |
| `workforce_category` | text nullable | `employee`, `subcontractor`, `vendor_technician`, `site_labour`, `supervisor` |

---

## 21. SOP Generation and Update Rules

### 21.1 SOP Record Fields

| Field | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `issue_id` | FK → `oi_issues` | — |
| `sop_number` | text | Format: `SOP-{YYYY}-{NNN}` |
| `revision` | text | `rev-00`, `rev-01`, etc. |
| `is_current` | boolean | One revision per SOP number may be `true` |
| `department` | text | Owning department (governs GCS path) |
| `title` | text | — |
| `scope` | text | — |
| `process_steps` | jsonb | `[{ step_number, action, responsible_role, checkpoint }]` |
| `ai_generated` | boolean | — |
| `existing_sop_id` | FK → `oi_sops` nullable | If updating an existing SOP |
| `change_summary` | text nullable | — |
| `erp_control_required` | boolean | — |
| `erp_control_description` | text nullable | — |
| `review_status` | text | `ai_draft`, `draft`, `submitted`, `approved`, `rejected` |
| `reviewed_by` | FK → `users` nullable | — |
| `reviewed_at` | timestamp nullable | — |
| `approved_by` | FK → `users` nullable | — |
| `approved_at` | timestamp nullable | — |
| `gcs_path` | text nullable | GCS path of exported PDF |
| `doc_type` | text | Always `SOP` |
| `effectiveness_score` | numeric(3,2) nullable | Periodic effectiveness rating |
| `created_by` | FK → `users` | — |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | — |

### 21.2 SOP Trigger Rules

| Condition | SOP Required |
|---|---|
| S1 (Critical) | Yes — mandatory |
| S2 (Major) | Yes — mandatory |
| S3 (Minor) with `repeat_issue = true` | Yes — mandatory |
| S4 (Observation) | Optional |

### 21.3 SOP GCS Path — CORRECTED

SOPs are **not** stored under `QC` only. The GCS path is department-based:

```
TPEL/{Department}/SOP/{sop_number}/{sop_number}-{revision}.pdf
```

`{Department}` is the `oi_sops.department` field value (e.g. `ENG`, `QC`, `PROC`, `SITE`, `HR`, `SAFETY`, `FIN`). The path is registered in `gcs_file_index`.

### 21.4 SOP Approval Gate

- `scope` and `process_steps` non-empty.
- Approver: SM, GM, or Superuser.
- Approver ≠ SOP author.
- Approval triggers GCS PDF upload.

### 21.5 SOP Versioning

Each revision creates a new row with incremented revision. Previous revision: `is_current = false`. Only one revision per `sop_number` may have `is_current = true`.

---

## 22. ERP Enforcement Architecture

ERP enforcement is **not SAP-only**. It applies across the full THERMOPAC platform.

### 22.1 Enforcement Types

| Type | Target System | Effect |
|---|---|---|
| `drawing_approval_gate` | Drawing Controls | Require additional approval before drawing can be issued |
| `dvs_verification_block` | DVS module | Block DVS release until resolved |
| `qc_hold_point` | QC / Inspection | Mandatory hold point before next stage |
| `dispatch_hold` | Dispatch module | Prevent dispatch until cleared |
| `procurement_hold` | PPPC / PLC | Block new PO/PR for affected item/vendor |
| `vendor_restriction` | Vendor Management | Flag vendor; require SM approval to use |
| `mandatory_inspection` | Inspection Orders | Force inspection for affected item/vendor |
| `mandatory_attachment` | Any module | Require evidence attachment before action |
| `fat_checklist_block` | FAT module | Block FAT completion |
| `sat_checklist_block` | SAT module | Block SAT completion |
| `commissioning_checklist_block` | Commissioning | Block commissioning step |
| `customer_approval_required` | Any module | Customer sign-off required |
| `revision_lock` | Drawing Controls | Lock revision until issue resolved |
| `gcs_document_validation` | GCS | Validate document before allowing use |
| `workflow_restriction` | Any module | Restrict a workflow step |
| `sap_action_required` | SAP B1 | Manual SAP B1 action required (with structured instructions) |

### 22.2 ERP Enforcement Record Fields

| Field | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `issue_id` | FK → `oi_issues` | — |
| `sop_id` | FK → `oi_sops` | — |
| `erp_control_type` | text | From list in 22.1 |
| `target_module` | text | Which THERMOPAC module is enforced |
| `description` | text | — |
| `sap_entity_type` | text nullable | `item`, `vendor`, `purchase_order`, `grn`, `other` |
| `sap_entity_id` | text nullable | — |
| `control_parameters` | jsonb nullable | — |
| `version` | integer | Incremented on every change |
| `status` | text | `pending`, `in_progress`, `active`, `deactivated` |
| `implemented_by` | FK → `users` nullable | — |
| `implemented_at` | timestamp nullable | — |
| `deactivated_by` | FK → `users` nullable | — |
| `deactivated_at` | timestamp nullable | — |
| `deactivation_reason` | text nullable | — |
| `created_by` | FK → `users` | — |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | — |

All enforcement record changes are version-controlled: every change increments `version` and an audit row is written. Deactivation requires Superuser with mandatory reason.

---

## 23. Evidence Governance and Legal Defensibility

### 23.1 Evidence Rules

- All uploaded files are SHA-256 hashed at upload time. Hash is stored in `oi_attachments.sha256_hash`.
- On every subsequent access, the hash is recomputed from the GCS file and compared. A mismatch triggers a `tamper_detected` audit event and alerts Superuser.
- Files attached to issues with `legal_hold = true` cannot be deleted by any user. Deletion attempts return HTTP 403.
- Evidence chain-of-custody is maintained by `oi_audit_log` — every upload, access, and deletion attempt is logged.
- Forensic audit: `oi_audit_log` for an issue can be exported to a signed PDF by Superuser for legal proceedings.

### 23.2 Evidence Retention Policy

| Issue Category | Minimum Retention |
|---|---|
| Safety / environmental | 10 years |
| Statutory / compliance | 7 years |
| Financial / legal liability | 7 years or until legal case closed + 2 years |
| Standard operational | 3 years |

Retention policy is stored in `oi_evidence_retention_config` (configurable by Superuser). Automated deletion is blocked for issues within retention period.

### 23.3 `oi_attachments` Table (updated)

| Field | Type | Description |
|---|---|---|
| `id` | serial PK | — |
| `issue_id` | FK → `oi_issues` | — |
| `entity_type` | text | `issue`, `rca`, `capa`, `sop`, `erp_enforcement`, `lessons_learned` |
| `entity_id` | integer | — |
| `file_name` | text | — |
| `gcs_path` | text | — |
| `sha256_hash` | text | Computed at upload |
| `file_size_bytes` | bigint | — |
| `mime_type` | text | — |
| `legal_hold` | boolean | Inherited from `oi_issues.legal_hold` |
| `retention_until` | date nullable | Computed from retention policy |
| `uploaded_by` | FK → `users` | — |
| `created_at` | timestamp | — |

---

## 24. Change Impact and Dependency Intelligence

Fields on `oi_issues`:

| Field | Type | Description |
|---|---|---|
| `impact_of_change` | text nullable | Description of downstream impact |
| `downstream_affected_modules` | text[] | Module names affected |
| `affected_project_ids` | integer[] | Other projects affected |
| `affected_customer_ids` | integer[] | Other customers affected |
| `affected_vendor_ids` | integer[] | Vendors affected |
| `affected_document_refs` | text[] | GCS paths / document references |
| `predecessor_issue_id` | FK → `oi_issues` nullable | Issue this originated from |
| `cascading_issue_ids` | integer[] | Issues triggered by this issue |
| `linked_risk_references` | text[] | Risk register entries |
| `linked_capa_ids` | integer[] | Cross-issue CAPA links |
| `linked_audit_references` | text[] | Audit report references |
| `linked_change_request_refs` | text[] | ECR/ECN/change order references |

---

## 25. AI Agent Scope and Governance

### 25.1 AI Prevention Agents

Seventeen specialised AI agents operate within OI. All agents output to `status = 'ai_draft'` only. No agent may approve, close, or transition any record.

| Agent | Trigger | Output |
|---|---|---|
| **Design Risk Agent** | New DWG/ENG issue captured | RCA skeleton, similar past design issues, ERP enforcement suggestions |
| **DVS/Drawing Risk Agent** | DVS-linked issue captured | Drawing revision history anomalies, cross-project revision conflicts |
| **Procurement Risk Agent** | PROC issue captured | Vendor performance history, similar procurement failures, CAPA suggestions |
| **Vendor Risk Agent** | Vendor-linked issue captured | Vendor reliability score, repeat failure pattern, restriction recommendation |
| **Manufacturing Risk Agent** | MFG issue captured | Process deviation patterns, equipment tag failure history, FMEA suggestions |
| **Quality Risk Agent** | QC issue captured | NCR pattern analysis, inspection failure trends, QAP gap suggestions |
| **Site Risk Agent** | SITE issue captured | Site punch point cross-reference, similar site failure history |
| **Commissioning Risk Agent** | COMM issue captured | Performance deviation analysis, similar commissioning failure history |
| **Warranty Risk Agent** | WARR phase issue | Warranty exposure calculation, repeat failure detection |
| **Project Delay Agent** | Schedule-critical issue | Schedule impact simulation, delay chain detection |
| **Process Performance Agent** | Performance deviation detected | Thermal efficiency analysis, utility balance check |
| **Customer Complaint Agent** | CUST issue captured | Customer complaint history, satisfaction risk score |
| **Statutory Compliance Agent** | COMP issue captured | Statutory deadline tracking, authority notification requirements |
| **Safety Risk Agent** | SAFETY issue captured | Incident pattern analysis, regulatory notification requirements |
| **Financial Risk Agent** | Financial fields set | COPQ calculation, LD exposure projection, margin erosion estimate |
| **Legal Risk Agent** | Liability fields set | Contract clause cross-reference, liability exposure summary |
| **Operational Resilience Agent** | Business continuity issue | BCP impact assessment, recovery time estimate |

### 25.2 AI Governance Rules

| Rule | Description |
|---|---|
| No auto-approval | AI output always lands in `ai_draft`. A named human must explicitly approve. |
| Confidence score | Every AI output carries `ai_confidence_score` (0.00–1.00). Low confidence (<0.6) shown with warning. |
| Prompt logging | Every AI call logs: prompt, model version, temperature, response, token count, latency to `oi_ai_audit_log`. |
| Model version tracking | `model_version` recorded per AI call. Baseline model version configurable in system settings. |
| Hallucination prevention | AI responses are validated against structured schemas before storage. Free-text fields are length-limited and flagged if they contain entity names not found in the THERMOPAC DB. |
| Human acknowledgement | AI suggestions are surfaced with an explicit "Accept / Modify / Reject" action. Rejection reason is stored. |
| No external communication | AI agents may not send any notification to external parties (customers, vendors, regulators). |
| Cross-module correlation | AI agents may read (not write) data from EPC Projects, Drawing Controls, Procurement, QC, Task Management, and SAP sync tables. |
| Live ERP monitoring | AI agents may query live ERP-synced data (vendor records, item masters, inspection records) for pattern detection. |

### 25.3 `oi_ai_audit_log` Table

| Field | Type | Description |
|---|---|---|
| `id` | bigserial PK | — |
| `issue_id` | FK → `oi_issues` | — |
| `agent_name` | text | Agent identifier |
| `trigger_event` | text | What triggered the agent |
| `model_version` | text | OpenAI model identifier |
| `prompt_hash` | text | SHA-256 of prompt (not full prompt for size) |
| `confidence_score` | numeric(3,2) | — |
| `output_entity_type` | text | `rca`, `capa`, `sop`, `classification`, `prevention_alert` |
| `output_entity_id` | integer nullable | — |
| `tokens_used` | integer | — |
| `latency_ms` | integer | — |
| `accepted_by` | FK → `users` nullable | — |
| `accepted_at` | timestamp nullable | — |
| `rejected_by` | FK → `users` nullable | — |
| `rejection_reason` | text nullable | — |
| `created_at` | timestamp | — |

---

## 26. Closure Blocking Rules

All checks enforced server-side at `POST /api/oi/issues/:id/close`. Any failure returns HTTP 422 with `closure_blocked` error listing each failed condition.

| # | Rule | Applies To |
|---|---|---|
| 1 | RCA must exist with `status = 'approved'` | S1, S2 |
| 2 | All non-cancelled CAPA actions must have `status = 'verified'` | All |
| 3 | At least one non-cancelled CAPA action must exist | All |
| 4 | At least one SOP must have `review_status = 'approved'` | S1, S2; S3 if `repeat_issue = true` |
| 5 | If approved SOP has `erp_control_required = true`, enforcement record must have `status = 'active'` | S1, S2 with ERP required |
| 6 | Issue must be in `verified` status | All |
| 7 | Closing user must be GM or Superuser | All |
| 8 | `closure_evidence` must be non-empty | All |
| 9 | If `legal_review_required = true`, `legal_status` must be `settled` or `closed` | All with legal flag |
| 10 | If `statutory_criticality = 'high'`, `regulatory_closure_verified = true` and `regulatory_closure_reference` non-empty | All with statutory flag |
| 11 | If `liability_severity = 'critical'` or `consequential_damage_flag = true`, closing user must be GM or Superuser (already covered by rule 7) and `management_review_required` must have been addressed | S1, any with critical liability |
| 12 | If `punch_points_block_closure = true` and `unresolved_punch_points > 0`, closure blocked | SITE/COMM issues |
| 13 | Knowledge base entry is auto-created on success | All |
| 14 | Lessons learned record is auto-created on success | All |

---

## 27. Audit Logging Rules

### 27.1 `oi_audit_log` — Append-Only

| Field | Type | Description |
|---|---|---|
| `id` | bigserial PK | — |
| `issue_id` | FK → `oi_issues` | — |
| `entity_type` | text | `issue`, `rca`, `capa`, `sop`, `erp_enforcement`, `comment`, `attachment`, `lessons_learned`, `escalation`, `ai_suggestion` |
| `entity_id` | integer | — |
| `action` | text | `created`, `updated`, `status_changed`, `approved`, `rejected`, `commented`, `attached`, `deleted_attempt`, `tamper_detected`, `escalated`, `ai_suggested`, `ai_accepted`, `ai_rejected` |
| `actor_id` | FK → `users` | — |
| `actor_name` | text | Snapshot at time of action |
| `old_value` | jsonb nullable | — |
| `new_value` | jsonb nullable | — |
| `context` | text nullable | — |
| `ip_address` | text nullable | — |
| `created_at` | timestamp | UTC stored, IST displayed. Never client-supplied. |

### 27.2 Required Audit Events

All of the following must be logged. Failure to log any is a governance violation:

- Issue created, updated, status changed (old+new), severity changed (with reason), assignee changed
- All ownership field changes
- All risk score / financial field updates
- All liability field updates
- Escalation triggered
- RCA: created, updated, submitted, approved, rejected
- CAPA: created, updated, accepted, completed, verified, overdue, cancelled, due date extended, overdue waived
- SOP: created, updated, submitted, approved, rejected
- ERP enforcement: created, version incremented, activated, deactivated
- Evidence: uploaded, hash computed, tamper check passed/failed, deletion attempt (blocked or allowed), legal hold set/cleared
- Lessons learned: created, reviewed, approved, published
- AI agent: triggered, output created, accepted, rejected
- Issue verified, closed (with closure evidence snapshot), reopened (with reason), withdrawn (with reason)
- All compliance field changes

---

## 28. Integration Points

### 28.1 EPC Projects

- All issues optionally linked to `project_id`.
- Project detail page shows open OI issue count badge.
- OI dashboard has a per-project risk heatmap.

### 28.2 Drawing Control

- "Report Issue" on Drawing Controls row → pre-populates `category = 'DWG'`, `source_module = 'drawing_controls'`, `source_record_id`.
- ERP enforcement type `drawing_approval_gate` or `revision_lock` is enforced in the Drawing Controls module.

### 28.3 DVS

- Issues with `source_module = 'dvs'` link to DVS records.
- ERP enforcement type `dvs_verification_block` blocks DVS release.

### 28.4 DDS

- DDS document references linkable via `dds_reference`.
- Issues with `category = 'DOC'` may reference DDS PDF paths.

### 28.5 BOM Controls

- Issues with wrong BOM linkable via `bom_reference`.
- CAPA may generate a BOM correction task.

### 28.6 Planning Control

- Schedule-critical issues linked to project phases and milestones.
- Project Delay Agent reads planning data for impact assessment.

### 28.7 Procurement List Control (PLC) and PPPC

- Procurement issues captured from PLC line row: `source_module = 'plc'`.
- ERP enforcement `mandatory_inspection` sets `inspection_required = true` on matching buy lines.
- ERP enforcement `procurement_hold` blocks new PO/PR.

### 28.8 Work Orders

- Issues linkable via `wo_reference`.
- Work Order module shows open OI issue badge.

### 28.9 Inspection Orders

- NCR escalation button: `source_module = 'ncr'`, `source_record_id = {ncr_id}`.
- Inspection Orders linkable: `source_module = 'inspection_orders'`.
- ERP enforcement `qc_hold_point` creates mandatory hold in Inspection Orders.

### 28.10 FAT / SAT

- FAT/SAT failures linkable via `fat_reference` / `sat_reference`.
- ERP enforcement `fat_checklist_block` / `sat_checklist_block` blocks FAT/SAT completion.

### 28.11 Commissioning

- Commissioning failures linkable via `commissioning_reference`.
- ERP enforcement `commissioning_checklist_block` blocks commissioning step.

### 28.12 Punch Lists

- Site punch points referenced via `punch_point_reference`.
- `punch_points_block_closure = true` enforces closure block (Section 26, Rule 12).

### 28.13 Dispatch

- ERP enforcement `dispatch_hold` prevents dispatch for affected items.

### 28.14 Document Control and GCS Governance

- Approved SOPs uploaded to `TPEL/{Department}/SOP/` (Section 21.3).
- All OI attachments stored in GCS with SHA-256 hashing.
- GCS path validation enforcements via `gcs_document_validation` enforcement type.

### 28.15 SAP B1

- OI generates "SAP Action Required" structured notifications to Superuser.
- Superuser confirms manual SAP B1 change; activates `erp_enforcement` record.
- Vendor Reliability Agent reads SAP-synced vendor records.
- Future phase: direct SAP B1 PATCH for item blocks and vendor flags.

### 28.16 Task Management

- CAPA actions auto-create linked `tasks` records (Section 18.2).
- Overdue CAPA tasks show OI badge in Task Management.

### 28.17 Meetings and Commitments

- MOM references linkable via `mom_reference`.
- Issues arising from meeting commitments link back to meeting records.

### 28.18 Vendor Management

- ERP enforcement `vendor_restriction` flags vendor in vendor records.
- Vendor Reliability Agent reads vendor history.

### 28.19 Customer Management

- Customer issues linkable via `customer_id`.
- Customer Complaint Agent tracks complaint history per customer.

### 28.20 Quality Management

- Cross-referencing with NCR, qualityPlanningRecords, inspectionReports.

### 28.21 Compliance Management

- Statutory Compliance Agent monitors compliance due dates.

### 28.22 Contract Management

- Contract references, clause references, LD/PG clause references.

### 28.23 Warranty Management

- Warranty Agent tracks warranty claims and exposure.

### 28.24 Insurance Documentation

- Insurance claim references, coverage tracking, recovery workflow.

### 28.25 Legal Correspondence

- Legal case references, arbitration references, legal status tracking.

### 28.26 Business Continuity and Disaster Recovery

- Operational Resilience Agent handles BCP/DR event issues.

### 28.27 Notifications Module

All OI events use the existing `notifications` table. Links: `/operational-intelligence/issues/{issue_id}`.

---

## 29. Required Database Tables

All in `shared/schema.ts` using Drizzle ORM `pgTable`. All timestamps: `timestamp` (UTC stored, IST displayed via `fmtDateTime`).

### Core Tables (required in Phase 1)

1. `oi_issues` — master issue record (all fields from Sections 8–16 included)
2. `oi_rca` — root cause analysis
3. `oi_capa_actions` — corrective and preventive actions
4. `oi_audit_log` — append-only audit trail (bigserial)
5. `oi_comments` — discussion thread
6. `oi_attachments` — file attachments with SHA-256 hash

### Workflow Tables (Phase 2–3)

7. `oi_sops` — SOP records with department field
8. `oi_erp_enforcements` — enforcement controls with version column
9. `oi_escalations` — escalation records

### Intelligence Tables (Phase 4–5)

10. `oi_knowledge_base` — resolved issue summaries
11. `oi_prevention_alerts` — pattern-match alerts
12. `oi_lessons_learned` — lessons learned workflow
13. `oi_ai_audit_log` — AI agent call audit trail

### Configuration Tables

14. `oi_risk_matrix_config` — configurable 5×5 risk matrix
15. `oi_risk_weight_config` — configurable OI Risk Score weights
16. `oi_evidence_retention_config` — retention policy by category

Full SQL DDL for each table to be defined in the Phase implementation specs before each phase begins (per operating protocol: field names confirmed from authoritative source before code is written).

---

## 30. Required UI Pages and Dashboards

All pages: `p-4 space-y-4` container (no `max-w-*`). All dates: `fmtDate` / `fmtDateTime`.

### Core Pages

| Route | Page | Phase |
|---|---|---|
| `/operational-intelligence` | Command Centre Dashboard | 1E |
| `/operational-intelligence/issues` | Issue Register | 1A |
| `/operational-intelligence/issues/new` | Capture Issue | 1A |
| `/operational-intelligence/issues/:id` | Issue Detail (all tabs) | 1A–4B |
| `/operational-intelligence/rca` | RCA Register | 1C |
| `/operational-intelligence/capa` | CAPA Register | 1D |
| `/operational-intelligence/sops` | SOP Library | 2A |
| `/operational-intelligence/knowledge-base` | Knowledge Base | 3A |
| `/operational-intelligence/lessons-learned` | Lessons Learned Library | 3A |
| `/operational-intelligence/analytics` | Analytics Hub | 3B |

### Dashboards (all within Analytics Hub or Command Centre)

| Dashboard | Phase |
|---|---|
| Management Intelligence Dashboard | 1E |
| Project Risk Heatmap | 3B |
| Department Issue Trend | 1E |
| Vendor Reliability Dashboard | 3B |
| Customer Complaint Dashboard | 3B |
| Equipment Reliability Dashboard | 3B |
| Site / Commissioning Dashboard | 3B |
| Cost of Poor Quality (COPQ) Dashboard | 3B |
| Financial Exposure Dashboard | 3B |
| Delay Intelligence Dashboard | 3B |
| Repeat Failure Dashboard | 3A |
| CAPA Effectiveness Dashboard | 3A |
| SOP Effectiveness Dashboard | 3A |
| Compliance / Statutory Risk Dashboard | 3B |
| Warranty Intelligence Dashboard | 3B |
| Liability Exposure Dashboard | 3B |
| Consequential Damage Dashboard | 3B |
| Insurance Recovery Dashboard | 3B |
| Margin Erosion Dashboard | 3B |
| Business Continuity Dashboard | 5A |

### Issue Detail Tabs

1. Overview — classification, risk scores, ownership, references
2. Impact — financial, liability, process performance, site fields
3. Investigation & RCA
4. CAPA
5. SOP
6. ERP Enforcement
7. Compliance & Statutory
8. Lessons Learned
9. Comments
10. Attachments (with tamper status indicator)
11. Audit Trail

---

## 31. API Endpoints

All require authentication. Role checks server-side per Section 7.

### Issues
`GET /api/oi/issues` · `POST /api/oi/issues` · `GET /api/oi/issues/:id` · `PATCH /api/oi/issues/:id` · `POST /api/oi/issues/:id/classify` · `POST /api/oi/issues/:id/transition` · `POST /api/oi/issues/:id/close` · `POST /api/oi/issues/:id/reopen` · `POST /api/oi/issues/:id/withdraw` · `POST /api/oi/issues/:id/set-legal-hold` · `POST /api/oi/issues/:id/escalate`

### RCA
`GET /api/oi/issues/:id/rca` · `POST /api/oi/issues/:id/rca` · `PATCH /api/oi/rca/:id` · `POST /api/oi/rca/:id/submit` · `POST /api/oi/rca/:id/approve` · `POST /api/oi/rca/:id/reject` · `POST /api/oi/issues/:id/rca/ai-suggest`

### CAPA
`GET /api/oi/issues/:id/capa` · `POST /api/oi/issues/:id/capa` · `PATCH /api/oi/capa/:id` · `POST /api/oi/capa/:id/accept` · `POST /api/oi/capa/:id/complete` · `POST /api/oi/capa/:id/verify` · `POST /api/oi/capa/:id/cancel` · `POST /api/oi/capa/:id/extend-due-date` · `POST /api/oi/capa/:id/waive-overdue` · `POST /api/oi/capa/:id/score-effectiveness`

### SOP
`GET /api/oi/issues/:id/sops` · `POST /api/oi/issues/:id/sops` · `PATCH /api/oi/sops/:id` · `POST /api/oi/sops/:id/submit` · `POST /api/oi/sops/:id/approve` · `POST /api/oi/sops/:id/reject` · `POST /api/oi/issues/:id/sops/ai-suggest` · `GET /api/oi/sops`

### ERP Enforcement
`GET /api/oi/issues/:id/erp-enforcement` · `POST /api/oi/issues/:id/erp-enforcement` · `PATCH /api/oi/erp-enforcement/:id` · `POST /api/oi/erp-enforcement/:id/activate` · `POST /api/oi/erp-enforcement/:id/deactivate`

### Lessons Learned
`GET /api/oi/lessons-learned` · `GET /api/oi/lessons-learned/:id` · `PATCH /api/oi/lessons-learned/:id` · `POST /api/oi/lessons-learned/:id/submit` · `POST /api/oi/lessons-learned/:id/approve` · `POST /api/oi/lessons-learned/:id/publish`

### Knowledge Base and Intelligence
`GET /api/oi/knowledge-base` · `GET /api/oi/analytics/summary` · `GET /api/oi/analytics/trends` · `GET /api/oi/analytics/copq` · `GET /api/oi/analytics/vendor-reliability` · `GET /api/oi/analytics/equipment-reliability` · `GET /api/oi/analytics/financial-exposure` · `GET /api/oi/prevention-alerts` · `POST /api/oi/prevention-alerts/:id/acknowledge` · `POST /api/oi/prevention-alerts/:id/dismiss`

### Evidence
`POST /api/oi/issues/:id/attachments` (upload + hash) · `GET /api/oi/issues/:id/attachments` · `POST /api/oi/attachments/:id/verify-integrity` (re-hash check) · `DELETE /api/oi/attachments/:id` (blocked if legal hold)

### Configuration (Superuser only)
`GET /api/oi/config/risk-matrix` · `PUT /api/oi/config/risk-matrix` · `GET /api/oi/config/risk-weights` · `PUT /api/oi/config/risk-weights` · `GET /api/oi/config/retention-policy` · `PUT /api/oi/config/retention-policy`

---

## 32. Notification Rules

All OI notifications use the existing `notifications` table. Link pattern: `/operational-intelligence/issues/{issue_id}`.

New `type` values (to register in `notification-routes.ts` and alerts redirect map in `App.tsx`):

```
oi_critical_issue      oi_assignment          oi_rca_review          oi_rca_approved
oi_rca_rejected        oi_capa_assigned       oi_capa_overdue        oi_capa_verified
oi_sop_review          oi_erp_required        oi_ready_to_close      oi_prevention_alert
oi_escalation          oi_sla_breach          oi_tamper_detected     oi_legal_hold_set
oi_compliance_due      oi_lesson_published    oi_ai_suggestion       oi_liability_flagged
```

---

## 33. Prevention Alert Rules

### 33.1 Real-time Similarity Check (on capture)

Query `oi_knowledge_base` for records with matching `category` + ≥2 matching `tags`, or title Levenshtein distance < 30% of longer title. Matches create `oi_prevention_alerts` and surface on capture confirmation.

### 33.2 Nightly Pattern Detection (02:30 IST)

Scan last 90 days. Category + 30-day window + keyword overlap > 50% → set `repeat_issue = true` + notify GM, Superuser.

### 33.3 Equipment Family Failure Detection

Nightly: group issues by `equipment_tag` prefix (first 3 chars, e.g. HE for heat exchangers). If ≥3 issues on same family within 90 days → alert Superuser. Populate `oi_lessons_learned.equipment_families`.

### 33.4 Vendor Failure Pattern Detection

Nightly: group issues by `vendor_id`. If ≥2 issues for same vendor within 60 days → alert Procurement Manager and GM. Vendor Reliability Agent runs risk assessment.

### 33.5 Severity Auto-Escalation (human confirmation required — not automatic)

| Condition | Recommendation |
|---|---|
| S4 CAPA overdue > 7 days | Recommend S3 |
| S3 `repeat_issue = true` | Recommend S2 |
| `statutory_criticality = 'high'` | Recommend minimum S2 |
| `consequential_damage_flag = true` | Recommend minimum S1 |

GM or Superuser must explicitly confirm any escalation.

---

## 34. Implementation Roadmap

Each phase/sub-phase requires a separate implementation approval before work begins. No code may be written without explicit approval for that sub-phase.

| Phase | Scope | Dependency |
|---|---|---|
| **1A** | DB schema (core 6 tables) + issue CRUD routes + Issue List + Capture + Detail (Overview + Impact tabs) | None |
| **1B** | EPC reference fields + risk intelligence fields + ownership/escalation fields + financial/liability fields on `oi_issues` | 1A |
| **1C** | RCA workflow + RCA approval routes + RCA tab + notifications | 1A |
| **1D** | CAPA workflow + task linkage + CAPA scheduler | 1A, 1C |
| **1E** | Command Centre Dashboard + Department Issue Trend | 1A–1D |
| **2A** | SOP workflow + SOP library page + GCS PDF upload (department-based path) | 1D |
| **2B** | ERP enforcement workflow (all 16 types) + ERP version control | 2A |
| **3A** | Lessons learned workflow + CAPA effectiveness scoring + Repeat / Recurrence detection | 1A–2B |
| **3B** | Full analytics suite (all 20 dashboards) + risk intelligence dashboards | 3A |
| **4A** | AI prevention agents (all 17) + AI governance (`oi_ai_audit_log`) | 1A–3A |
| **4B** | Predictive operational intelligence (cross-project correlation, proactive alerts, confidence scoring) | 4A |
| **5A** | Enterprise resilience, legal defensibility (legal hold, evidence integrity, forensic audit export), BCP/DR intelligence, configuration management | 1A–4B |

### Source Module Integration (parallel track)

| Phase | Scope | Dependency |
|---|---|---|
| **S1** | NCR escalation button + Drawing Controls "Report Issue" + PLC issue capture | 1A |
| **S2** | FAT/SAT failure linkage + Commissioning checklist linkage + Punch list linkage | 1B |
| **S3** | Vendor restriction integration + Dispatch hold integration + DVS block integration | 2B |

---

## 35. Complete File Change List

### New Files

| File | Purpose |
|---|---|
| `server/oi-routes.ts` | All OI API routes |
| `server/oi-service.ts` | Business logic: transitions, closure checks, escalation, notification dispatch |
| `server/oi-audit-service.ts` | Centralised append-only audit log writer |
| `server/oi-ai-service.ts` | 17 AI prevention agents + governance |
| `server/oi-capa-scheduler.ts` | Nightly CAPA overdue, pattern detection, vendor/equipment failure detection |
| `server/oi-evidence-service.ts` | SHA-256 hashing, tamper detection, legal hold enforcement, retention checks |
| `server/oi-risk-engine.ts` | OI Risk Score computation, risk matrix evaluation |
| `client/src/pages/operational-intelligence/oi-dashboard-page.tsx` | Command Centre Dashboard |
| `client/src/pages/operational-intelligence/oi-issues-page.tsx` | Issue Register |
| `client/src/pages/operational-intelligence/oi-issue-detail-page.tsx` | Issue Detail (11 tabs) |
| `client/src/pages/operational-intelligence/oi-capture-page.tsx` | Capture Form |
| `client/src/pages/operational-intelligence/oi-rca-register-page.tsx` | RCA Register |
| `client/src/pages/operational-intelligence/oi-capa-register-page.tsx` | CAPA Register |
| `client/src/pages/operational-intelligence/oi-sop-library-page.tsx` | SOP Library |
| `client/src/pages/operational-intelligence/oi-knowledge-base-page.tsx` | Knowledge Base |
| `client/src/pages/operational-intelligence/oi-lessons-learned-page.tsx` | Lessons Learned |
| `client/src/pages/operational-intelligence/oi-analytics-page.tsx` | Analytics Hub (all 20 dashboards) |

### Modified Files

| File | Change |
|---|---|
| `shared/schema.ts` | Add 16 new OI tables |
| `server/index.ts` | Register `oi-routes.ts`; register `oi-capa-scheduler.ts` cron |
| `client/src/App.tsx` | Add OI routes; add all OI notification types to alerts redirect map |
| `client/src/components/layout.tsx` | Add "Operational Intelligence" to top-level navigation |
| `server/notification-routes.ts` | Handle all new OI notification type values |

### Explicitly Unchanged Files

- `server/leave-service.ts`
- `server/payroll-salary-core.ts`
- `server/dds-pdf-service.ts`
- `shared/roles.ts` (existing roles sufficient)
- All SAP sync routes (SAP enforcement is manual-confirm in v1)

---

**END OF BASELINE v1.2**

**This document requires explicit approval from THERMOPAC management before any implementation begins.**  
**No code, no schema migrations, no routes, no UI — until each phase is individually approved.**
