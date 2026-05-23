"use strict";
/**
 * Wave 1A SOP Seeding Script
 * Scope: Production + Quality Control + Projects × Manager + Employee = 6 SOPs × 20 sections = 120 sections
 *
 * SOP Number format: SOP-[DEPT_CODE]-[ROLE_CODE]-[FY]-[NNN]
 *   - FY = Indian financial year code (YYZZ, e.g. 2627 for FY 2026-27)
 *   - Sequence scoped per (deptCode, roleCode, FY) — resets each FY
 *   - Example: SOP-PROD-MGR-2627-001
 *
 * Rules:
 * - Idempotent: skips any (department, applicable_role) pair that already exists
 * - Draft only — no activation, no acknowledgements
 * - Superuser actor looked up at runtime — never hardcoded
 * - Uses pg_advisory_xact_lock scoped per (dept, role, FY) for sequence safety
 * - All inserts inside per-SOP transactions
 * - Placeholder content only — no invented operational data
 */

const { Client } = require("pg");

// ─── FY + Code Helpers ─────────────────────────────────────────────────────────
// Indian FY: April 1 – March 31. Code = YY of start year + YY of end year.
// e.g. May 2026 → FY 2026-27 → "2627"
function indianFYCode() {
  const now     = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const yr      = now.getFullYear();
  const mo      = now.getMonth() + 1;
  const startYr = mo >= 4 ? yr : yr - 1;
  const endYr   = startYr + 1;
  return `${String(startYr).slice(-2)}${String(endYr).slice(-2)}`;
}

const DEPT_CODES = {
  "Production":      "PROD",
  "Quality Control": "QC",
  "Projects":        "PROJ",
  "Purchase":        "PURCH",
  "Accounts":        "ACC",
  "Design":          "DES",
  "After Sales":     "AS",
  "Stores":          "STR",
  "Marketing":       "MKT",
  "Administration":  "ADMIN",
};

const ROLE_CODES = {
  "Superuser":        "SU",
  "General Manager":  "GM",
  "Senior Manager":   "SM",
  "Manager":          "MGR",
  "Senior Executive": "SE",
  "Employee":         "EMP",
};

// Generates next SOP number scoped per (dept, role, FY).
// Must be called inside an open transaction (advisory lock is transaction-scoped).
async function nextSopNumber(client, department, role) {
  const deptCode = DEPT_CODES[department];
  const roleCode = ROLE_CODES[role];
  if (!deptCode) throw new Error(`Unknown department for SOP numbering: '${department}'`);
  if (!roleCode) throw new Error(`Unknown role for SOP numbering: '${role}'`);

  const fy      = indianFYCode();
  const lockKey = `sop_seq_${deptCode}_${roleCode}_${fy}`;

  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);

  const prefix = `SOP-${deptCode}-${roleCode}-${fy}-`;
  const cntRes = await client.query(
    "SELECT COUNT(*)::int AS cnt FROM oi_sop_records WHERE sop_number LIKE $1",
    [prefix + "%"]
  );
  const seq = parseInt(cntRes.rows[0].cnt, 10) + 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// ─── Wave 1A Matrix ───────────────────────────────────────────────────────────
const WAVE_1A = [
  { department: "Production",     role: "Manager"  },
  { department: "Production",     role: "Employee" },
  { department: "Quality Control",role: "Manager"  },
  { department: "Quality Control",role: "Employee" },
  { department: "Projects",       role: "Manager"  },
  { department: "Projects",       role: "Employee" },
];

// ─── Section Content Builder ───────────────────────────────────────────────────
// Returns 20 section objects for a given (department, role) pair.
// All content uses placeholder text only. [DEPARTMENT] and [ROLE] are substituted.
function buildSections(department, role) {
  const D = department;
  const R = role;
  const TODAY = new Date().toISOString().split("T")[0];

  return [
    {
      sectionNo:    "1.0",
      sectionTitle: "Purpose",
      sequence:     10,
      content:
`This Standard Operating Procedure (SOP) governs the responsibilities, actions, and decision authority of the ${R} within the ${D} department at THERMOPAC.

The purpose of this document is to:
- Define the operational mandate of the ${R} role in ${D}.
- Ensure consistent execution of all ${D} department processes.
- Provide a single reference point for compliance, training, and audit.
- Establish the boundary conditions under which the ${R} role operates.

This SOP is mandatory reading and acknowledgement for all individuals performing the ${R} function in ${D}.

--- DRAFT PLACEHOLDER — Requires SM review and GM approval before activation ---
Last reviewed: ${TODAY} | Next review due: 12 months from activation`,
    },
    {
      sectionNo:    "2.0",
      sectionTitle: "Scope",
      sequence:     20,
      content:
`IN SCOPE:
- All ${D} transactions initiated or approved by the ${R} role.
- SAP B1 modules used by ${D} in the ${R} capacity.
- THERMOPAC QMS modules accessible to ${R} within ${D}.
- All handoffs to and from ${D} that are owned by the ${R} role.

OUT OF SCOPE:
- Transactions belonging to other departments not directly interfacing with ${D}.
- System administration tasks outside the ${R} permission boundary.
- Customer-facing activities not routed through ${D}.
- Financial postings beyond the ${R} authority level defined in Section 6.

INTER-DEPARTMENT TOUCHPOINTS:
- [To be defined by ${D} Head — list departments this SOP interfaces with]

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "3.0",
      sectionTitle: "Definitions",
      sequence:     30,
      content:
`TERM              | MEANING
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
OI                | Operational Intelligence (AI advisory layer)
SM                | Senior Manager
GM                | General Manager
IST               | Indian Standard Time (all timestamps)
RASI              | Responsible / Accountable / Supporting / Informed

${D.toUpperCase()}-SPECIFIC TERMS:
[To be added by ${D} Head — department-specific terminology, abbreviations, and system codes]

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "4.0",
      sectionTitle: "Role Responsibility Matrix (RASI)",
      sequence:     40,
      content:
`ROLE RESPONSIBILITY MATRIX — ${D} / ${R}

KEY: R = Responsible | A = Accountable | S = Supporting | I = Informed

PROCESS STEP                        | Superuser | GM | SM | Manager | Sr Exec | Employee
------------------------------------|-----------|----|----|---------|---------|----------
Initiate / receive process request  |     A     |  I |  S |    R    |    R    |    R
Verify preconditions (Section 5)    |     A     |  I |  S |    R    |    R    |    S
Execute primary action (Section 8)  |     A     |  I |  S |    A    |    R    |    R
Validate in ERP (Section 12)        |     A     |  I |  A |    R    |    S    |    I
Record and audit (Section 14)       |     A     |  I |  A |    R    |    S    |    S
Escalate if exception (Section 10)  |     A     |  R |  R |    R    |    I    |    I
Close / complete transaction        |     A     |  I |  A |    R    |    S    |    S

[RASI assignments above are placeholder defaults. Final RASI must be reviewed and approved
by ${D} Head and GM before SOP activation. All R and A assignments must be traceable
to named roles — not individuals.]

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "5.0",
      sectionTitle: "Preconditions",
      sequence:     50,
      content:
`Before executing any process governed by this SOP, the following must be confirmed:

SYSTEM PRECONDITIONS:
□ SAP B1 session is active and the correct THERMOPAC company database is selected.
□ THERMOPAC QMS is accessible and the ${R} is authenticated.
□ All upstream approvals required for the current transaction are complete.
□ No active system maintenance window is in progress.

ROLE PRECONDITIONS:
□ The individual holds the ${R} designation in the THERMOPAC HR system.
□ Acknowledgement of the current revision of this SOP is recorded in QMS.
□ All training requirements listed in Section 17 are completed and verified.
□ The ${R} has been assigned to the ${D} department in the system.

PROCESS PRECONDITIONS:
□ [To be defined by ${D} Head — list specific process pre-states required before this SOP can begin]
□ [Example: Work order approved / Purchase request raised / Inspection scheduled]

FAILURE TO MEET PRECONDITIONS:
- Do not proceed. Log the missing precondition in THERMOPAC QMS Issue Register.
- Escalate per Section 10.

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "6.0",
      sectionTitle: "System Access Control",
      sequence:     60,
      content:
`AUTHORISED SYSTEM ACCESS — ${R} IN ${D}

SAP B1 MODULES (to be confirmed by IT + ${D} Head):
□ [Module name] — [Read / Write / Approve] — Required for: [process step]
□ [Module name] — [Read only] — Required for: [process step]
□ [Module name] — [Not accessible]

THERMOPAC QMS MODULES:
□ Issue Register — [Read / Write / Close] — ${R} authority level
□ SOP Register — Read only (view active SOPs for ${D})
□ Task Manager — [Assign / Complete / Escalate]
□ [Other module] — [Access level]

EXPLICITLY BLOCKED FOR ${R.toUpperCase()}:
□ Payroll processing (HR / Accounts only)
□ User administration (Superuser only)
□ System configuration and environment settings
□ Other departments' confidential data outside defined touchpoints

FINANCIAL AUTHORITY LIMIT:
□ ${R} transaction authority limit: [To be defined by GM — INR amount]
□ Above limit: Requires SM co-approval before posting

ACCESS REVIEW FREQUENCY: Quarterly by IT + ${D} Head
BREACH RESPONSE: Immediate escalation to GM + IT — log in QMS within 1 hour

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "7.0",
      sectionTitle: "Master Process Flow",
      sequence:     70,
      content:
`MASTER PROCESS FLOW — ${D} / ${R} OPERATIONS

START
  │
  ▼
[1] Receive or initiate transaction / request (${R} role initiates or receives)
  │
  ▼
[2] Verify all preconditions are met (Section 5)
  │  If preconditions NOT met → Log exception → Escalate per Section 10 → HOLD
  ▼
[3] Confirm system access and authority level (Section 6)
  │
  ▼
[4] Execute detailed procedure steps (Section 8)
  │
  ▼
[5] Validate in ERP per rules in Section 12
  │  If ERP validation fails → Log NCR → Do NOT override → Escalate
  ▼
[6] Create audit record per Section 14
  │
  ▼
[7] Notify downstream stakeholders (per RASI Section 4)
  │
  ▼
[8] Close transaction or hand off to next role/process
  │  If exception at any step → Section 9 → Escalate per Section 10
  ▼
END

[Sub-process flows for each major ${D} operation to be mapped by ${D} Head
and process owner. Each sub-flow should reference the relevant step in Section 8.]

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "8.0",
      sectionTitle: "Detailed Execution Procedure",
      sequence:     80,
      content:
`STEP-BY-STEP EXECUTION PROCEDURE — ${D} / ${R}

Step 1: [Action title — to be defined by ${D} Head]
  - System: [SAP B1 / THERMOPAC QMS / Manual record]
  - Screen / Menu path: [Exact path in system]
  - Action: [Exact action to take]
  - Field: [Field name] → [Value rule or validation]
  - Completion check: [How to confirm step completed correctly]
  - Time limit: [If applicable — e.g., must be completed within same business day]

Step 2: [Action title — to be defined]
  - System: [System name]
  - Screen / Menu path: [Path]
  - Action: [Action description]
  - Field: [Field name] → [Rule]
  - Completion check: [Check description]

Step 3: [Action title — to be defined]
  - [Same structure — repeat for each major action in this role's process]

[INSTRUCTION TO ${D.toUpperCase()} HEAD:
Each step must be:
- Numbered sequentially
- System-specific (which screen, which field, which value)
- Verifiable (what does "done" look like?)
- Linked to RASI (who performs this step)
No step should require inference — all actions must be explicit.]

COMPLETION CRITERIA FOR THIS PROCEDURE:
□ All ERP fields populated per Section 12
□ Audit record created per Section 14
□ Downstream notification sent where required by RASI (Section 4)
□ No open exceptions — all exceptions resolved or escalated

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "9.0",
      sectionTitle: "Exception Handling",
      sequence:     90,
      content:
`EXCEPTION HANDLING REGISTER — ${D} / ${R}

EXCEPTION                          | TRIGGER CONDITION              | PRESCRIBED RESPONSE                    | OWNER
-----------------------------------|--------------------------------|----------------------------------------|---------
System unavailability              | SAP / QMS unreachable          | Log, notify IT, hold transaction       | ${R}
Approval timeout                   | No response within 24 hours    | Escalate per Section 10                | ${R}
ERP validation failure             | System rejects posting         | Do NOT override — log NCR in QMS       | ${R}
Unauthorised access attempt        | Permission denied error        | Log immediately + notify IT            | ${R}
Duplicate transaction detected     | System duplicate alert         | Hold, cross-check, report to SM        | ${R}
Precondition not met               | Required approval missing      | Hold transaction — do not proceed      | ${R}
Data discrepancy                   | ERP data vs physical mismatch  | Log NCR — do not self-resolve          | ${R}
Process deadline breach            | KPI threshold exceeded         | Escalate per Section 10 Level L2       | ${R}

[${D}-specific exceptions to be added by ${D} Head — cover the top 5 failure modes
historically observed in this department for the ${R} role.]

EXCEPTION LOG RULE:
All exceptions must be logged in THERMOPAC QMS Issue Register within 1 hour of occurrence.
Exception log must include: Actor, Timestamp (IST), Transaction reference, Description, Action taken.

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "10.0",
      sectionTitle: "Escalation Matrix",
      sequence:     100,
      content:
`ESCALATION MATRIX — ${D} / ${R}

LEVEL | TRIGGER CONDITION                                | ESCALATE TO      | CHANNEL             | TIME LIMIT
------|--------------------------------------------------|------------------|---------------------|------------
L1    | Process blocked — cannot proceed independently  | Manager          | QMS Task + Direct   | 2 hours
L2    | Manager unavailable or issue unresolved at L1   | Senior Manager   | QMS + Phone         | 4 hours
L3    | SM unresolved / compliance or audit risk        | General Manager  | Email + QMS + Phone | Same business day
L4    | Business-critical / legal / financial risk      | Superuser + GM   | Direct + Email      | Immediate

ESCALATION RULES:
- Always log the escalation in THERMOPAC QMS before or immediately after verbal escalation.
- Do not skip levels except in L4 (business-critical) situations.
- The escalation owner must provide a resolution update within the stated time limit.
- Unresolved L3+ escalations must be documented in the monthly QMS review.

AFTER-HOURS ESCALATION:
Primary contact: [To be defined by ${D} Head + GM]
Backup contact: [To be defined by GM]
Emergency protocol: [To be defined — e.g., WhatsApp group, on-call number]

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "11.0",
      sectionTitle: "KPI Requirements",
      sequence:     110,
      content:
`KEY PERFORMANCE INDICATORS — ${R} — ${D}

KPI                                         | Target        | Frequency     | Measurement Source       | Owner
--------------------------------------------|---------------|---------------|--------------------------|-------
[KPI 1 — to be defined by ${D} Head]       | [Target]      | Daily/Weekly  | QMS / SAP B1 Report      | ${R}
[KPI 2 — to be defined]                    | [Target]      | Monthly       | QMS Dashboard            | SM
[KPI 3 — to be defined]                    | [Target]      | Monthly       | SAP B1 Analytics         | SM
[KPI 4 — SOP compliance rate]              | 100%          | Monthly       | QMS Audit Log            | SM
[KPI 5 — Exception resolution time]        | < 4 hours     | Per exception | QMS Issue Register       | ${R}
[KPI 6 — Acknowledgement completion]       | 100%          | Per revision  | QMS SOP Module           | ${R}

REPORTING:
- KPIs reviewed in [frequency] performance review.
- KPI breach triggers immediate review under Section 10 escalation.
- KPI data sourced from THERMOPAC QMS Reports + SAP B1 Reports only.
- No manual KPI tracking — all measurements must be system-sourced.

[Final KPI targets must be approved by GM before SOP activation.
Targets must be realistic, measurable, and tied to business outcomes.]

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "12.0",
      sectionTitle: "ERP Validation Rules",
      sequence:     120,
      content:
`SAP B1 ERP VALIDATION RULES — ${D} / ${R}

MANDATORY FIELDS — [Transaction type to be defined by ${D} Head]:
□ [Field name]     — Required: Yes       | Format: [Text/Date/Number/Code]  | Rule: [Validation rule]
□ [Field name]     — Required: Yes       | Format: [Text/Date/Number/Code]  | Rule: [Validation rule]
□ [Field name]     — Required: Conditional| Condition: [When this field is required]

POSTING CONDITIONS:
□ All mandatory fields must be populated before posting.
□ Required approvals must be recorded before any document is posted.
□ [${D}-specific posting rule — to be defined by ${D} Head and IT]

JOURNAL REQUIREMENTS (if financial):
□ [Journal entry requirements — to be defined by Accounts in coordination with ${D}]
□ Cost centre: [${D} cost centre code — to be confirmed by Accounts]

OVERRIDE POLICY:
- No field validation override is permitted without SM written approval.
- Every override must be logged in THERMOPAC QMS within 30 minutes.
- Repeat overrides (>2 in a month) trigger a compliance review.

ERP CHANGE MANAGEMENT:
- Any change to ERP field mapping or validation rules that affects this SOP
  must trigger a SOP revision (Section 19) before the change is deployed.

[ERP rules must be validated against the current live SAP B1 configuration
by IT + ${D} Head before this SOP is activated.]

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "13.0",
      sectionTitle: "AI / Agent Interaction Rules",
      sequence:     130,
      content:
`AI / OI AGENT INTERACTION RULES — ${D} / ${R}

PERMITTED AI ACTIONS (advisory and read-only only):
□ Summarise SOP content on request
□ Flag data anomalies for human review — no auto-correction
□ Submit improvement suggestions via oi_sop_revision_suggestions only
□ Provide linked document references (Section 16)
□ Surface escalation triggers as informational alerts
□ Highlight KPI threshold breaches for human action
□ Assist in drafting — never finalise or post

PROHIBITED AI ACTIONS (hard rules — zero exceptions):
✗ AI must never write to oi_sop_records (SOP master)
✗ AI must never write to oi_sop_sections (SOP content)
✗ AI must never approve, reject, or activate SOP revisions
✗ AI must never acknowledge a SOP on behalf of a user
✗ AI must never post ERP transactions of any type
✗ AI must never override escalation decisions
✗ AI must never action NCRs, CAPAs, or audit findings independently
✗ AI must never access salary, payroll, or disciplinary data

HUMAN-IN-THE-LOOP REQUIREMENTS:
- All AI suggestions require SM+ review before any action is taken.
- AI cannot initiate process flows — it may only assist in execution.
- AI output must be logged and attributable to a session and timestamp.
- AI recommendations must be labelled as advisory — not instructions.

OI LEARNING SOURCE FOR ${D} / ${R}:
- Lessons Learned → Suggestion only (oi_sop_revision_suggestions — never direct edit)
- Reported Issues → Suggestion only (never direct edit)
- All AI suggestion statuses are tracked and audited in the QMS.

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "14.0",
      sectionTitle: "Audit Requirements",
      sequence:     140,
      content:
`AUDIT REQUIREMENTS — ${D} / ${R}

RECORDS THAT MUST BE CREATED FOR EVERY GOVERNED TRANSACTION:
□ ERP document number generated and recorded
□ THERMOPAC QMS audit log entry created with action, actor, and timestamp
□ Approval records: approver ID, timestamp, approval reference
□ Exception log (if applicable): see Section 9

AUDIT TRAIL MINIMUM FIELDS (per transaction):
□ Actor ID + Full Name + Role at time of action
□ Timestamp (IST — Indian Standard Time)
□ Action performed (descriptive — not just a code)
□ System / Module used
□ Transaction reference number
□ Outcome: success / exception / escalated

RETENTION REQUIREMENTS:
- Operational records: 7 years minimum
- Financial records: Per statutory requirement (confirm with Accounts)
- NCR / CAPA records: Until closure + 3 years
- SOP acknowledgement records: Until role change or termination + 3 years

AUDIT LOG IMMUTABILITY:
- Audit records must never be edited or deleted.
- All audit writes go through THERMOPAC QMS audit service only.
- Direct DB edits to audit tables are a compliance breach.

INTERNAL AUDIT FREQUENCY: [Quarterly / Per project / Per GM directive]
EXTERNAL AUDIT SUPPORT: ${D} Head is primary contact — all requests routed via GM.

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "15.0",
      sectionTitle: "Compliance Requirements",
      sequence:     150,
      content:
`COMPLIANCE REQUIREMENTS — ${D} / ${R}

APPLICABLE FRAMEWORKS (to be confirmed by ${D} Head + GM):
□ [ISO standard if applicable — e.g., ISO 9001:2015 for Quality Control]
□ [Statutory requirement — e.g., GST filing for Accounts, Factory Act for Production]
□ [Customer-contractual requirement — e.g., approved supplier qualification]
□ [Industry standard — e.g., ASME, IBR for engineering departments]

NON-NEGOTIABLE CONTROLS:
□ No transaction may be posted without required approvals.
□ Financial segregation of duties must be maintained at all times.
□ All customer data must remain within THERMOPAC-controlled systems.
□ Data localisation rules apply — no customer data on personal devices.

BREACH RESPONSE:
1. Immediately hold all affected transactions.
2. Escalate to GM within same business day — use Section 10 L3.
3. Document for corrective action in THERMOPAC QMS CAPA module.
4. No self-resolution — all breaches require SM+ sign-off on closure.

COMPLIANCE CALENDAR:
[${D}-specific compliance deadlines — to be populated by ${D} Head
in coordination with Accounts and GM. Example: monthly returns, quarterly audits.]

[Final compliance mapping must be validated by ${D} Head and GM before SOP activation.]

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "16.0",
      sectionTitle: "Linked Documents",
      sequence:     160,
      content:
`LINKED DOCUMENTS — ${D} / ${R}

RELATED SOPs:
- [SOP Number] — [Title] — Department: [Dept] — Role: [Role]
  Relationship: [Upstream / Downstream / Parallel]
- [SOP Number] — [Title] — Department: [Dept] — Role: [Role]
  Relationship: [Upstream / Downstream / Parallel]

WORK INSTRUCTIONS (WI):
- [WI Number] — [Title] — [Process step this WI supports]

FORMS AND TEMPLATES:
- [Form name / reference] — Used in: [Section 8 step reference]

SAP B1 REPORTS:
- [Report name / transaction code] — Purpose: [What this report validates]

THERMOPAC QMS REPORTS:
- [Report name / module path] — Purpose: [What this report validates]

EXTERNAL REFERENCES:
- [Standard / regulation reference] — Source: [ISO / BIS / Customer spec]

DOCUMENT CONTROL RULE:
- All linked documents must be at their current revision at time of SOP activation.
- A linked document revision that changes the governing process must trigger
  a review of this SOP within 30 days.
- Broken links must be reported to ${D} Head and corrected before next audit.

[Linked documents to be populated by ${D} Head before SOP activation.]

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "17.0",
      sectionTitle: "Training Requirements",
      sequence:     170,
      content:
`TRAINING REQUIREMENTS — ${R} — ${D}

MANDATORY BEFORE OPERATING UNDER THIS SOP:
□ THERMOPAC QMS system orientation and login confirmation
□ SAP B1 module training for ${D} — ${R} level (conducted by IT or SM)
□ This SOP read in full and acknowledged in THERMOPAC QMS system
□ Supervised execution of minimum [N — to be defined] transactions before independent operation
□ Escalation protocol briefing (Section 10) — confirmed by SM
□ [${D}-specific training — to be defined by ${D} Head]

COMPETENCY ASSESSMENT:
- Minimum passing score: [To be defined by SM]
- Assessment method: [Practical demonstration / Written test / System test]
- Assessor: [SM / Department Head — not the trainee's direct peer]
- Assessment must be documented in THERMOPAC QMS HR module

REFRESHER TRAINING (mandatory):
- On every major SOP revision (new revision → re-acknowledge → re-train if content changed)
- Annual refresher mandatory for all ${R} roles in ${D}
- After any compliance breach attributed to the ${R} role in ${D}
- After any significant ERP system change affecting ${D} operations

TRAINING RECORDS:
- All training completions stored in THERMOPAC QMS HR module
- Records reviewed quarterly by SM
- Incomplete training records = SOP access blocked until resolved

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "18.0",
      sectionTitle: "Zero-Trust Governance Controls",
      sequence:     180,
      content:
`ZERO-TRUST GOVERNANCE CONTROLS — ${D} / ${R}

PRINCIPLE: No implicit trust. Every access, action, and transaction must be
explicitly authorised, logged, and attributable.

DATA ACCESS MINIMISATION:
□ The ${R} role may only access records within ${D} scope.
□ Cross-department data access requires SM written approval + QMS log entry.
□ Financial data access limited to amounts within ${R} authority level (Section 6).
□ Personal data (HR, salary, disciplinary) — blocked unless role requires it.

DUAL-CONTROL TRIGGERS (require a second authorised approver):
□ Any transaction above the ${R} financial authority limit
□ Any reversal or cancellation of a posted ERP document
□ Any system access outside normal operating hours (to be defined by IT)
□ Any data correction that overwrites a previously audited record

READ-ONLY BOUNDARIES FOR ${R.toUpperCase()}:
□ Payroll data — blocked (Accounts / Superuser only)
□ HR disciplinary records — GM only
□ System configuration — Superuser only
□ Other department financial data — blocked

WRITE THRESHOLDS:
□ ${R} write authority: As defined in Section 6 financial authority limit
□ Exceeding threshold without dual approval = compliance breach (Section 15)

SYSTEM BOUNDARY CONTROLS:
□ No USB or external storage on ERP / QMS production machines
□ All session activity logged automatically in THERMOPAC QMS
□ Inactive sessions timeout per IT policy
□ Password policy enforced — no shared credentials

ANNUAL ZERO-TRUST REVIEW:
Controls reviewed annually by GM + IT Head. Any control relaxation requires
GM written sign-off and must be recorded in THERMOPAC QMS.

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "19.0",
      sectionTitle: "Revision Control",
      sequence:     190,
      content:
`REVISION CONTROL — ${D} / ${R} OPERATIONS SOP

CURRENT REVISION: v0 (Draft — not yet activated)

REVISION HISTORY:
Rev | Date       | Summary                    | Author              | Approved By
----|------------|----------------------------|---------------------|-------------
v0  | ${TODAY}   | Initial draft — Wave 1A seed | System (Superuser) | Pending SM review

REVISION TRIGGERS (any one of the following mandates a new revision):
□ Change in ${R} responsibilities or reporting line
□ Change in ERP module, field mapping, or transaction type
□ Regulatory, statutory, or customer compliance update
□ Post-NCR corrective action that changes the process
□ AI/OI suggestion accepted and approved by SM+ (via oi_sop_revision_suggestions)
□ Annual review date reached (12 months from last activation)
□ Significant system change (SAP B1 upgrade, QMS module change)

REVISION PROCESS IN THERMOPAC QMS:
1. Manager creates revision → status: draft
2. Manager submits revision → status: under_review
3. SM reviews and approves → status: approved
4. GM activates → status: active
5. All ${R} users in ${D} must re-acknowledge within [N] days

OWNERSHIP:
- Revision owner: ${D} Head (Manager role)
- Approval authority: Senior Manager
- Activation authority: General Manager

NEXT REVIEW DUE: 12 months from activation date (not from seeding date)

--- DRAFT PLACEHOLDER --- Last reviewed: ${TODAY}`,
    },
    {
      sectionNo:    "20.0",
      sectionTitle: "SOP Acknowledgement",
      sequence:     200,
      content:
`SOP ACKNOWLEDGEMENT STATEMENT — ${D} / ${R}

By acknowledging this SOP in the THERMOPAC QMS, I confirm that:

□ I have read and understood the full content of this SOP including all 20 sections.
□ I understand my responsibilities as the ${R} in ${D} as defined in Section 4 (RASI).
□ I will execute all processes per the procedure defined in Section 8.
□ I agree to operate within the system access boundaries defined in Section 6.
□ I understand the escalation protocol in Section 10 and will follow it without deviation.
□ I acknowledge that AI/OI agents operate in an advisory role only (Section 13).
□ I understand that this SOP will be revised and I must re-acknowledge each revision.
□ I understand that operating outside this SOP constitutes a compliance breach.
□ I will report any precondition failure, exception, or breach immediately per Section 9.

ACKNOWLEDGEMENT IS RECORDED ELECTRONICALLY IN THERMOPAC QMS WITH:
- User ID (system-assigned)
- Full legal name
- Role at time of acknowledgement
- Department at time of acknowledgement
- SOP revision number acknowledged
- Timestamp (IST — Indian Standard Time)

ACKNOWLEDGEMENT IS MANDATORY:
Access to this SOP's governed processes requires acknowledgement of the current revision.
Unacknowledged status blocks process participation per Section 5 (Preconditions).

[Acknowledgement is collected via the THERMOPAC QMS SOP Acknowledgement module.
Paper acknowledgements are not accepted. No proxy acknowledgements permitted.]`,
    },
  ];
}

// ─── Main Seeding Function ─────────────────────────────────────────────────────
async function seed() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Connected to database.");

  // 1. Look up Superuser at runtime — never hardcoded
  const suResult = await client.query(
    "SELECT id, username FROM users WHERE role = 'Superuser' ORDER BY id ASC LIMIT 1"
  );
  if (!suResult.rows.length) {
    throw new Error("No Superuser found in users table — cannot proceed.");
  }
  const superuserId = suResult.rows[0].id;
  console.log(`Seeding actor: Superuser '${suResult.rows[0].username}' (ID=${superuserId})`);

  let created = 0;
  let skipped = 0;
  let sectionsCreated = 0;
  const report = [];

  for (const { department, role } of WAVE_1A) {
    await client.query("BEGIN");
    try {
      // 2. Idempotency check — skip if (department, applicable_role) already exists
      const existing = await client.query(
        "SELECT id, sop_number FROM oi_sop_records WHERE department = $1 AND applicable_role = $2 LIMIT 1",
        [department, role]
      );

      if (existing.rows.length > 0) {
        await client.query("ROLLBACK");
        skipped++;
        const rec = existing.rows[0];
        report.push({ department, role, status: "SKIPPED", sopNumber: rec.sop_number, sopId: rec.id });
        console.log(`  SKIP  ${department} / ${role} — already exists as ${rec.sop_number}`);
        continue;
      }

      // 3. Generate SOP number — scoped advisory lock per (dept, role, FY)
      const sopNumber = await nextSopNumber(client, department, role);

      // 4. Build SOP record fields
      const title       = `${department} ${role} Operations SOP`;
      const description = `Master SOP governing all ${department} processes for the ${role} role. Covers 20 process sections including purpose, RASI, execution procedure, ERP rules, AI governance, and zero-trust controls.`;
      const processArea = `${department} Operations`;

      // 5. Insert SOP record
      const sopResult = await client.query(
        `INSERT INTO oi_sop_records
           (sop_number, title, description, sop_type, department, applicable_role,
            process_area, status, revision_number, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, 'procedure', $4, $5, $6, 'draft', 0, $7, NOW(), NOW())
         RETURNING id, sop_number`,
        [sopNumber, title, description, department, role, processArea, superuserId]
      );
      const sopId = sopResult.rows[0].id;

      // 6. Build and insert 20 sections
      const sections = buildSections(department, role);
      if (sections.length !== 20) {
        throw new Error(`Expected 20 sections, got ${sections.length} for ${department}/${role}`);
      }

      const sectionNos = sections.map(s => s.sectionNo);
      const uniqueNos  = new Set(sectionNos);
      if (uniqueNos.size !== 20) {
        throw new Error(`Duplicate section_no detected for ${department}/${role}`);
      }

      for (const s of sections) {
        await client.query(
          `INSERT INTO oi_sop_sections
             (sop_id, section_no, section_title, section_content, sequence,
              is_active, created_by, updated_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, TRUE, $6, $6, NOW(), NOW())`,
          [sopId, s.sectionNo, s.sectionTitle, s.content, s.sequence, superuserId]
        );
      }

      await client.query("COMMIT");
      created++;
      sectionsCreated += 20;
      report.push({ department, role, status: "CREATED", sopNumber, sopId });
      console.log(`  CREATE ${sopNumber} — ${title} (id=${sopId}, sections=20)`);

    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  ERROR  ${department}/${role}:`, err.message);
      throw err;
    }
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("  Wave 1A Seeding Complete");
  console.log("═══════════════════════════════════════════════");
  console.log(`  SOPs created:                   ${created}`);
  console.log(`  SOPs skipped (already existed): ${skipped}`);
  console.log(`  Sections created:               ${sectionsCreated}`);
  console.log("───────────────────────────────────────────────");
  report.forEach(r => {
    const marker = r.status === "CREATED" ? "✓" : "↷";
    console.log(`  ${marker} [${r.status}] ${r.sopNumber ?? "n/a"} — ${r.department} / ${r.role} (id=${r.sopId ?? "n/a"})`);
  });
  console.log("═══════════════════════════════════════════════\n");

  await client.end();
  return { created, skipped, sectionsCreated, report };
}

seed().catch(err => {
  console.error("\nSEED FAILED:", err.message);
  process.exit(1);
});
