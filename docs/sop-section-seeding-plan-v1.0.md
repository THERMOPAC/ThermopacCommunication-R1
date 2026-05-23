# SOP Section Seeding Plan v1.0
**Status: APPROVED BASELINE — Do not seed until execution is authorised.**  
**Date: 2026-05-23**  
**Scope: 10 active departments × 6 roles = up to 60 master SOPs**

---

## 1. Governing Rules

| Rule | Detail |
|---|---|
| SOP Model | One SOP per Department + Role combination |
| Max SOPs | 60 (10 active depts × 6 roles) |
| Sections per SOP | 20 standard sections (fixed template) |
| Total sections at full seeding | 1,200 (60 × 20) |
| Description field | Short summary only — 1–2 sentences |
| Full content | Lives entirely in `oi_sop_sections` rows |
| Seeding actor | Superuser (system seed — `created_by = Superuser user ID`) |
| Hard-delete | Never — soft-delete only (`is_active = false`) |
| AI write rule | AI/OI may only submit `oi_sop_revision_suggestions` — never writes to `oi_sop_sections` or `oi_sop_records` directly |

---

## 2. Active Department List (10)

| # | Department | Priority Wave |
|---|---|---|
| 1 | Production | Wave 1 |
| 2 | Quality Control | Wave 1 |
| 3 | Projects | Wave 1 |
| 4 | Purchase | Wave 2 |
| 5 | Accounts | Wave 2 |
| 6 | Design | Wave 2 |
| 7 | After Sales | Wave 3 |
| 8 | Stores | Wave 3 |
| 9 | Marketing | Wave 3 |
| 10 | Administration | Wave 3 |

---

## 3. Role List (6) — Ordered Highest to Lowest

| Role | ROLE_RANK | Applicable To |
|---|---|---|
| Superuser | 0 | System administrators only |
| General Manager | 1 | GM-level operations |
| Senior Manager | 2 | SM-level execution + oversight |
| Manager | 3 | Manager-level execution |
| Senior Executive | 4 | Senior individual contributors |
| Employee | 5 | All staff — broadest access SOP |

> **Seeding Priority per Department:** Start with `Manager` and `Employee` SOPs first (highest operational value). Then `Senior Manager`, then `Senior Executive`, then `General Manager`. `Superuser` SOPs to be defined last.

---

## 4. Standard Section Template (20 Sections)

Each of the 60 SOPs will contain the following 20 sections in this exact order.  
`section_no` uses decimal notation (1.0 through 20.0).  
`sequence` equals `(section_no × 10)` — e.g., 1.0 → sequence 10, 2.0 → sequence 20.  
This leaves gaps for sub-sections (1.1, 1.2…) in future without reordering.

### Section Definitions

| No | Title | Content Scope |
|---|---|---|
| 1.0 | Purpose | Why this SOP exists; the business outcome it governs for this department and role |
| 2.0 | Scope | What processes, systems, and transactions are covered; what is explicitly excluded |
| 3.0 | Definitions | Key terms, abbreviations, ERP module names, THERMOPAC-specific terminology used in this SOP |
| 4.0 | Role Responsibility Matrix (RASI) | RASI table: Responsible / Accountable / Supporting / Informed — mapped to all 6 roles for each process step |
| 5.0 | Preconditions | What must be true before this SOP can be executed (approvals, system states, prior SOPs completed) |
| 6.0 | System Access Control | SAP B1 modules, THERMOPAC QMS pages, and external tools the role is authorised to access; what is explicitly blocked |
| 7.0 | Master Process Flow | High-level numbered process flow (1 → 2 → 3 …) covering the end-to-end operation for this role |
| 8.0 | Detailed Execution Procedure | Step-by-step operational instructions — numbered, actionable, ERP-field-level specificity |
| 9.0 | Exception Handling | Known failure modes, error states, system exceptions — and the prescribed response for each |
| 10.0 | Escalation Matrix | Who to escalate to, under what condition, within what timeframe, and via what channel |
| 11.0 | KPI Requirements | Measurable performance indicators this role is accountable for under this SOP |
| 12.0 | ERP Validation Rules | SAP B1 field validation rules, mandatory fields, posting conditions, and journal requirements enforced by this SOP |
| 13.0 | AI / Agent Interaction Rules | How OI agents may assist this role; what AI is permitted to read, suggest, flag; what AI must never do |
| 14.0 | Audit Requirements | Records that must be created, retained, and verifiable; timestamps; approval trails |
| 15.0 | Compliance Requirements | Regulatory, statutory, or customer-driven compliance obligations this SOP satisfies |
| 16.0 | Linked Documents | Other SOPs, Work Instructions, forms, templates, and ERP reports referenced by this SOP |
| 17.0 | Training Requirements | Minimum training and competency requirements before a person may operate under this SOP |
| 18.0 | Zero-Trust Governance Controls | Data access minimisation; dual-control triggers; read-only vs. write thresholds; system boundary controls |
| 19.0 | Revision Control | Version history of this SOP section; change triggers; review cycle |
| 20.0 | SOP Acknowledgement | Acknowledgement statement — role, date, and confirmation of understanding |

---

## 5. Placeholder Content Standard

When seeding, each section receives structured placeholder content built from the following template:

```
[DEPARTMENT] — [ROLE] SOP
Section [N.0]: [TITLE]

--- DRAFT PLACEHOLDER — Requires review and approval before activation ---

[SECTION-SPECIFIC STRUCTURED CONTENT — see Section 6 below]

Last reviewed: [DATE]
Reviewed by: [ROLE]
Next review due: [DATE + 12 months]
```

All placeholder content must be factually neutral — no invented data, no specific names or numbers.  
Content must be written such that a subject matter expert can fill it in without misunderstanding the structure.

---

## 6. Section-by-Section Content Template

### 1.0 Purpose
```
This Standard Operating Procedure (SOP) governs the responsibilities, actions, 
and decision authority of the [ROLE] within the [DEPARTMENT] at THERMOPAC.

The purpose of this document is to:
- Define the operational mandate for this role.
- Ensure consistent execution of all department processes.
- Provide a single reference point for compliance, training, and audit.
- Establish the boundary conditions under which the role operates.

This SOP is mandatory reading and acknowledgement for all individuals 
performing the [ROLE] function in [DEPARTMENT].
```

### 2.0 Scope
```
IN SCOPE:
- All [DEPARTMENT] transactions initiated or approved by the [ROLE].
- SAP B1 modules used by [DEPARTMENT] in the [ROLE] capacity.
- THERMOPAC QMS modules accessible to [ROLE] within [DEPARTMENT].

OUT OF SCOPE:
- Transactions belonging to other departments.
- System administration tasks outside the [ROLE] permission boundary.
- Customer-facing activities not routed through [DEPARTMENT].

INTER-DEPARTMENT TOUCHPOINTS:
- [To be defined by department head — list departments this SOP interfaces with]
```

### 3.0 Definitions
```
TERM              | MEANING
------------------|----------------------------------------------------------
SOP               | Standard Operating Procedure
RASI              | Responsible / Accountable / Supporting / Informed
ERP               | Enterprise Resource Planning (SAP Business One at THERMOPAC)
QMS               | Quality Management System (THERMOPAC internal platform)
NCR               | Non-Conformance Report
CAPA              | Corrective and Preventive Action
DO                | Delivery Order
WO                | Work Order
PO                | Purchase Order
IO                | Inspection Order
BOM               | Bill of Materials
OI                | Operational Intelligence (AI layer)

[DEPARTMENT-SPECIFIC TERMS — to be added by department head]
```

### 4.0 Role Responsibility Matrix (RASI)
```
PROCESS STEP                  | Superuser | GM | SM | Manager | Sr Exec | Employee
------------------------------|-----------|----|----|---------|---------|----------
[STEP 1 — to be defined]     |     A     |  A |  R |    R    |    S    |    I
[STEP 2 — to be defined]     |     A     |  I |  A |    R    |    R    |    S
[STEP 3 — to be defined]     |     A     |  I |  S |    A    |    R    |    R
[STEP 4 — to be defined]     |     A     |  I |  A |    R    |    I    |    I

KEY: R = Responsible | A = Accountable | S = Supporting | I = Informed
```

### 5.0 Preconditions
```
Before executing any process governed by this SOP, the following must be confirmed:

SYSTEM PRECONDITIONS:
□ SAP B1 session is active and the correct company database is selected.
□ THERMOPAC QMS is accessible and the user is authenticated.
□ All upstream approvals for the current transaction are complete.

ROLE PRECONDITIONS:
□ The individual holds the [ROLE] designation in the HR system.
□ Acknowledgement of the current revision of this SOP is recorded.
□ All training requirements listed in Section 17 are completed.

PROCESS PRECONDITIONS:
□ [To be defined — list specific process pre-states required]
```

### 6.0 System Access Control
```
AUTHORISED SYSTEM ACCESS FOR [ROLE] IN [DEPARTMENT]:

SAP B1 MODULES:
□ [Module name] — [Read / Write / Approve]
□ [Module name] — [Read only]

THERMOPAC QMS MODULES:
□ [Module name] — [Read / Write / Approve]

EXPLICITLY BLOCKED:
□ Payroll processing (unless HR/Accounts role)
□ User administration (Superuser only)
□ System configuration pages

ACCESS REVIEW FREQUENCY: Quarterly by IT + Department Head
BREACH RESPONSE: Immediate escalation to General Manager + IT
```

### 7.0 Master Process Flow
```
MASTER PROCESS FLOW — [DEPARTMENT] [ROLE] OPERATIONS

START
  │
  ▼
[1] Receive / Initiate transaction or request
  │
  ▼
[2] Verify preconditions (Section 5)
  │
  ▼
[3] Execute primary action per Section 8
  │
  ▼
[4] Validate in ERP per Section 12
  │
  ▼
[5] Record and audit per Section 14
  │
  ▼
[6] Escalate if exception — per Section 10
  │
  ▼
END / NEXT PROCESS

[Detailed sub-flows to be mapped by department head and process owner]
```

### 8.0 Detailed Execution Procedure
```
STEP-BY-STEP EXECUTION PROCEDURE

Step 1: [Action title]
  - System: [SAP B1 / THERMOPAC QMS / Manual]
  - Screen / Menu: [Path]
  - Action: [Exact action to take]
  - Field: [Field name] → [Value or rule]
  - Validation: [How to confirm step completed correctly]
  - Time limit: [If applicable]

Step 2: [Action title]
  - [Same structure as Step 1]

Step 3: [Action title]
  - [Same structure as Step 1]

[All steps to be defined by process owner with Manager sign-off]

COMPLETION CRITERIA:
□ All ERP fields populated per Section 12
□ Audit record created per Section 14
□ Downstream notification sent where required
```

### 9.0 Exception Handling
```
EXCEPTION HANDLING REGISTER

EXCEPTION                     | TRIGGER CONDITION        | PRESCRIBED RESPONSE         | OWNER
------------------------------|--------------------------|-----------------------------|---------
System unavailability         | SAP / QMS unreachable    | Log, notify IT, hold txn   | [ROLE]
Approval timeout              | >24h no response         | Escalate per Section 10    | [ROLE]
Data validation failure       | ERP rejects posting      | Do not override — log NCR  | [ROLE]
Unauthorised access attempt   | Permission denied error  | Log + notify IT immediately| [ROLE]
Duplicate transaction         | System duplicate alert   | Hold, cross-check, report  | [ROLE]

[Department-specific exceptions to be added by process owner]

EXCEPTION LOG: All exceptions must be logged in THERMOPAC QMS Issue Register.
```

### 10.0 Escalation Matrix
```
ESCALATION MATRIX

LEVEL | TRIGGER                              | ESCALATE TO      | CHANNEL        | TIME LIMIT
------|--------------------------------------|------------------|----------------|----------
L1    | Process blocked — cannot proceed    | Manager          | QMS / Direct   | 2 hours
L2    | Manager unavailable / unresolved    | Senior Manager   | QMS / Phone    | 4 hours
L3    | SM unresolved / compliance risk     | General Manager  | Email + QMS    | Same day
L4    | Business-critical / legal risk      | Superuser + GM   | Direct + Email | Immediate

AFTER-HOURS ESCALATION:
Primary: [To be defined by GM]
Backup: [To be defined by GM]
```

### 11.0 KPI Requirements
```
KEY PERFORMANCE INDICATORS — [ROLE] — [DEPARTMENT]

KPI                               | Target    | Measurement Frequency | Owner
----------------------------------|-----------|----------------------|---------
[KPI 1 — to be defined]          | [Target]  | Daily / Weekly       | [ROLE]
[KPI 2 — to be defined]          | [Target]  | Monthly              | SM
[KPI 3 — to be defined]          | [Target]  | Quarterly            | GM

REPORTING:
- KPIs reviewed in [frequency] performance review.
- Breaches trigger immediate review under Section 10 escalation.
- KPI data source: THERMOPAC QMS Reports + SAP B1 Reports.

[Final KPI targets to be approved by General Manager before SOP activation]
```

### 12.0 ERP Validation Rules
```
SAP B1 ERP VALIDATION RULES — [DEPARTMENT] [ROLE]

MANDATORY FIELDS — [TRANSACTION TYPE]:
□ [Field name]        — Required: Yes | Format: [Text/Date/Number] | Rule: [Validation rule]
□ [Field name]        — Required: Yes | Format: [Text/Date/Number] | Rule: [Validation rule]
□ [Field name]        — Required: Conditional | Condition: [When required]

POSTING CONDITIONS:
□ All mandatory fields populated before posting
□ [Specific posting rule for this department's transactions]

JOURNAL REQUIREMENTS:
□ [Journal entry requirements if financial transaction]

OVERRIDE POLICY:
- No field override without SM written approval
- Override actions must be audit-logged in THERMOPAC QMS

[ERP rules to be validated against current SAP B1 configuration by IT + Department Head]
```

### 13.0 AI / Agent Interaction Rules
```
AI / OI AGENT INTERACTION RULES — [DEPARTMENT] [ROLE]

PERMITTED AI ACTIONS (Read-only advisory only):
□ Summarise SOP content on request
□ Flag anomalies in data for human review
□ Suggest revision improvements via oi_sop_revision_suggestions only
□ Provide linked document references
□ Surface escalation triggers as alerts

PROHIBITED AI ACTIONS (Hard rules — non-negotiable):
✗ AI must never write to oi_sop_records
✗ AI must never write to oi_sop_sections
✗ AI must never approve or reject SOP revisions
✗ AI must never acknowledge a SOP on behalf of a user
✗ AI must never post ERP transactions
✗ AI must never override escalation decisions

HUMAN-IN-THE-LOOP REQUIREMENTS:
- All AI suggestions require SM+ review before any action is taken
- AI cannot initiate process flows — only assist in execution
- AI output must be logged and attributable

OI LEARNING SOURCE:
- Lessons Learned → Suggestion only (never direct edit)
- Reported Issues → Suggestion only (never direct edit)
- AI suggestions status tracked in oi_sop_revision_suggestions table
```

### 14.0 Audit Requirements
```
AUDIT REQUIREMENTS — [DEPARTMENT] [ROLE]

RECORDS THAT MUST BE CREATED:
□ Every transaction must generate an ERP document number
□ All SOP-governed actions must create a THERMOPAC QMS audit log entry
□ Approvals must record approver ID, timestamp, and approval reference
□ Exceptions must be logged in the Issue Register with root cause

RETENTION REQUIREMENTS:
- Operational records: 7 years minimum
- Financial records: Per statutory requirement (consult Accounts)
- NCR / CAPA records: Until closure + 3 years

AUDIT TRAIL FIELDS (minimum per transaction):
□ Actor ID + Name + Role
□ Timestamp (IST)
□ Action performed
□ System / Module
□ Outcome (success / exception)

INTERNAL AUDIT FREQUENCY: [Quarterly / Per project / Per GM directive]
EXTERNAL AUDIT SUPPORT: Department Head is primary contact
```

### 15.0 Compliance Requirements
```
COMPLIANCE REQUIREMENTS — [DEPARTMENT] [ROLE]

APPLICABLE FRAMEWORKS:
□ [ISO standard if applicable — e.g., ISO 9001:2015 for Quality Control]
□ [Statutory requirement — e.g., GST filing for Accounts]
□ [Customer-contractual requirement — e.g., approved supplier list]

NON-NEGOTIABLE CONTROLS:
□ No transaction may be posted without required approvals
□ Financial segregation of duties must be maintained
□ Data localisation rules apply to all customer data

BREACH RESPONSE:
- Immediate hold on affected transactions
- Escalation to GM within same business day
- Documentation for corrective action in THERMOPAC QMS

[Final compliance mapping to be validated by department head and GM]
```

### 16.0 Linked Documents
```
LINKED DOCUMENTS

SOP REFERENCES:
- [SOP Number] — [Title] — [Department] — [Role]
- [SOP Number] — [Title] — [Department] — [Role]

WORK INSTRUCTIONS:
- [WI Number] — [Title]

FORMS & TEMPLATES:
- [Form name / reference]

ERP REPORTS:
- [SAP B1 Report name / transaction code]

THERMOPAC QMS REPORTS:
- [Report name / module path]

[All linked documents to be validated for current version before SOP activation]
```

### 17.0 Training Requirements
```
TRAINING REQUIREMENTS — [ROLE] — [DEPARTMENT]

MANDATORY BEFORE OPERATING UNDER THIS SOP:
□ THERMOPAC QMS orientation and login
□ SAP B1 module training for [DEPARTMENT] role
□ This SOP read, understood, and acknowledged in system
□ Supervised execution of [N] transactions before independent operation
□ [Department-specific training — to be defined by department head]

COMPETENCY ASSESSMENT:
- Minimum score: [To be defined]
- Assessment method: [Practical / Written / System test]
- Assessor: [Senior Manager / Department Head]

REFRESHER TRAINING:
- On every major SOP revision
- Annual refresher mandatory for all roles
- After any compliance breach in the department

TRAINING RECORDS:
- Stored in THERMOPAC QMS HR module
- Reviewed quarterly by SM
```

### 18.0 Zero-Trust Governance Controls
```
ZERO-TRUST GOVERNANCE CONTROLS — [DEPARTMENT] [ROLE]

DATA ACCESS MINIMISATION:
□ This role may only access records within its own department scope
□ Cross-department data access requires SM written approval + QMS log entry
□ Financial data access limited to amounts within [ROLE] authority level

DUAL-CONTROL TRIGGERS (require second approver):
□ Any transaction above [AMOUNT / THRESHOLD] — defined by GM
□ Any reversal or cancellation of posted documents
□ Any system access outside normal operating hours

READ-ONLY BOUNDARIES:
□ Payroll data — Read-only for SM and above only
□ HR disciplinary records — GM only
□ System configuration — Superuser only

WRITE THRESHOLDS:
□ [ROLE] write authority: [Defined limit — to be approved by GM]

SYSTEM BOUNDARY CONTROLS:
□ No USB / external storage on production ERP machines
□ All session activity logged automatically via THERMOPAC QMS
□ Inactive sessions timeout after [duration — to be set by IT]

ANNUAL REVIEW: Zero-trust controls reviewed by GM + IT Head annually
```

### 19.0 Revision Control
```
REVISION CONTROL

CURRENT REVISION: v0 (Draft — not yet activated)

REVISION HISTORY:
Rev | Date       | Summary             | Author         | Approved By
----|------------|---------------------|----------------|-------------
v0  | 2026-05-23 | Initial draft seed  | System (Admin) | Pending

REVISION TRIGGERS (any of the following requires a new revision):
□ Change in role responsibilities
□ Change in ERP module or field mapping
□ Regulatory or compliance update
□ Post-NCR corrective action
□ AI/OI suggestion accepted and approved by SM+
□ Annual review date reached

REVISION PROCESS:
1. Manager creates revision in THERMOPAC QMS → status: draft
2. SM reviews and approves → status: approved
3. GM activates → status: active
4. All users in scope must re-acknowledge

NEXT REVIEW DUE: 12 months from activation date
```

### 20.0 SOP Acknowledgement
```
SOP ACKNOWLEDGEMENT STATEMENT

By acknowledging this SOP in the THERMOPAC QMS, I confirm that:

□ I have read and understood the full content of this SOP including all 20 sections.
□ I understand my responsibilities as defined in Section 4 (RASI) and Section 8.
□ I agree to operate within the system access boundaries defined in Section 6.
□ I understand the escalation protocol in Section 10 and will follow it without deviation.
□ I understand that AI/OI agents operate in an advisory role only (Section 13).
□ I acknowledge that this SOP is subject to revision and I will re-acknowledge on each revision.
□ I understand that operating outside this SOP is a compliance breach.

Acknowledgement is recorded electronically in the THERMOPAC QMS with:
- User ID
- Full name
- Role at time of acknowledgement
- Timestamp (IST)
- SOP revision number

ACKNOWLEDGEMENT IS MANDATORY — SOP access requires acknowledgement of current revision.
```

---

## 7. SOP Naming Convention

| Field | Rule |
|---|---|
| `title` | `[Department] [Role] Operations SOP` — e.g., `Production Manager Operations SOP` |
| `description` | `Master SOP governing all [Department] processes for the [Role] role. Covers [N] process sections.` |
| `sop_number` | Auto-generated by system — format: `SOP-[DEPT_CODE]-[ROLE_CODE]-001` |
| `sop_type` | `procedure` |
| `process_area` | `[Department] Operations` |
| `applicable_role` | Exact role string from `VALID_SOP_ROLES` |
| `department` | Exact department name from `department_master` |
| `status` | `draft` at seeding — must follow full activation workflow before going live |

**Department Codes for SOP Number:**
| Department | Code |
|---|---|
| Production | PROD |
| Quality Control | QC |
| Projects | PROJ |
| Purchase | PURCH |
| Accounts | ACC |
| Design | DES |
| After Sales | AS |
| Stores | STR |
| Marketing | MKT |
| Administration | ADMIN |

**Role Codes for SOP Number:**
| Role | Code |
|---|---|
| Superuser | SU |
| General Manager | GM |
| Senior Manager | SM |
| Manager | MGR |
| Senior Executive | SE |
| Employee | EMP |

---

## 8. Seeding Wave Plan

| Wave | Departments | Roles | SOPs | Sections | Status |
|---|---|---|---|---|---|
| Wave 1A | Production, Quality Control, Projects | Manager, Employee | 6 | 120 | Ready to seed |
| Wave 1B | Production, Quality Control, Projects | Senior Manager, Senior Executive | 6 | 120 | Ready to seed |
| Wave 1C | Production, Quality Control, Projects | General Manager, Superuser | 6 | 120 | Ready to seed |
| Wave 2A | Purchase, Accounts, Design | Manager, Employee | 6 | 120 | After Wave 1 complete |
| Wave 2B | Purchase, Accounts, Design | SM, SE, GM, Superuser | 12 | 240 | After Wave 2A |
| Wave 3A | After Sales, Stores, Marketing, Administration | Manager, Employee | 8 | 160 | After Wave 2 |
| Wave 3B | After Sales, Stores, Marketing, Administration | SM, SE, GM, Superuser | 16 | 320 | After Wave 3A |
| **TOTAL** | **10** | **6** | **60** | **1,200** | |

---

## 9. Seeding Script Approach

**Method:** Node.js direct-DB insert script  
**Location:** `scripts/seed-sop-sections.ts` (to be created at seeding time)  
**Execution:** `node -r ts-node/register scripts/seed-sop-sections.ts --wave=1A`  
**Idempotency:** Script checks for existing SOP by `(department, applicable_role)` before inserting — skips if already exists  
**Seeding actor:** Superuser user (ID looked up from DB at runtime — never hardcoded)

**Script structure:**
```
1. Load Superuser user ID from DB
2. For each (department, role) in the specified wave:
   a. Check if SOP already exists — skip if so
   b. INSERT into oi_sop_records with status = 'draft'
   c. For each of 20 standard sections:
      - Substitute [DEPARTMENT] and [ROLE] placeholders
      - INSERT into oi_sop_sections
3. Report: X SOPs created, Y skipped, Z sections inserted
```

---

## 10. Pre-Seeding Checklist

Before executing any wave, verify:

- [ ] All 10 active departments confirmed in `department_master`
- [ ] Superuser account exists and has ID confirmed
- [ ] `oi_sop_sections` table created and indexed (done — 2026-05-23)
- [ ] SOP number auto-generation format confirmed
- [ ] Department codes and role codes approved by user
- [ ] Content placeholder text reviewed by department head before activation
- [ ] Wave scope confirmed in writing before running script
- [ ] Backup checkpoint created before running script
- [ ] Script run in dev first, reviewed, then production

---

*This plan is a baseline only. No seeding has occurred. All section content is placeholder — it requires review, editing, and SM+ approval before any SOP is activated.*
