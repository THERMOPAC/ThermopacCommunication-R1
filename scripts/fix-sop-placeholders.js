"use strict";
const { Pool } = require("@neondatabase/serverless");
const ws = require("ws");
const { neonConfig } = require("@neondatabase/serverless");

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const UPDATES = [
  {
    id: 226, sectionNo: "6.0",
    content: `AUTHORISED SYSTEM ACCESS — Employee IN Projects

SAP B1 MODULES (IT-confirmed, Projects scope):
• Projects Module — Read / Write (own transactions only)
  Required for: Logging project activity and recording man-hour postings
• Purchase Orders — Read only
  Required for: Verifying PO status linked to active project
• Goods Receipt PO — Read only
  Required for: Confirming material receipt against project BOM
• Inventory Module — Read only
  Required for: Checking stock levels for project-specific materials
• Service Call / Work Order — Read / Write (own records only)
  Required for: Creating and updating work orders under project scope
• Activity / Labour Posting — Write
  Required for: Recording man-hours against approved project cost codes
• Sales Quotation / Delivery Order — Read only
  Required for: Verifying dispatch readiness against project milestones

THERMOPAC QMS MODULES:
• Issue Register — Read / Write / Close (Employee level — own issues only)
• SOP Register — Read only (view active SOPs for Projects department)
• Task Manager — Assign / Complete / Escalate (own tasks only)
• Document Control — Read only (approved and current-revision documents)
• NCR Log — Initiate only (cannot close, approve, or reassign NCRs)
• Audit Log — Read only (own records only)

EXPLICITLY BLOCKED FOR EMPLOYEE:
• Payroll processing — Accounts / Superuser only
• User administration and role assignment — Superuser only
• System configuration and environment settings — Superuser only
• Other departments' financial data outside defined Projects touchpoints
• Purchase Order creation or modification — Manager approval required first
• BOM creation or modification — Design / Projects Head only
• Customer pricing, quotation approval, and contract data — SM and above only

FINANCIAL AUTHORITY LIMIT:
• Employee transaction authority: Up to INR 10,000 per transaction (subject to GM confirmation)
• Above limit: Requires Manager co-approval before any SAP B1 posting is permitted

ACCESS REVIEW FREQUENCY: Quarterly by IT + Projects Head
BREACH RESPONSE: Immediate escalation to GM + IT — log in QMS within 1 hour

--- DRAFT PLACEHOLDER --- Last reviewed: 2026-05-23`
  },

  {
    id: 228, sectionNo: "8.0",
    content: `STEP-BY-STEP EXECUTION PROCEDURE — Projects / Employee

Step 1: Receive and verify the project work instruction
  - System: THERMOPAC QMS — Task Manager module
  - Menu path: QMS → Projects → My Tasks
  - Action: Open assigned task; verify project code, transaction type, and required outputs
  - Field: Project Code → must match active project in SAP B1 Project Master
  - Completion check: Task status = Assigned; project code verified against SAP B1
  - Time limit: Acknowledgement within 2 working hours of assignment

Step 2: Confirm all preconditions (Section 5)
  - System: SAP B1 + THERMOPAC QMS
  - Action: Verify all Section 5 checkboxes — upstream approvals recorded, system is live
  - Field: Approval Reference → enter QMS approval record number in task log
  - Completion check: All precondition boxes confirmed in QMS task; no open holds on project
  - Time limit: Must be completed before any ERP action is taken

Step 3: Execute the transaction in SAP B1
  - System: SAP B1 — Projects Module
  - Menu path: SAP B1 → Projects → Project Management → Activity / Resource Posting
  - Action: Enter all mandatory fields per Section 12 validation rules
  - Field: Project Code (mandatory) → active project code from Project Master
  - Field: Cost Code (mandatory) → approved cost code for this project phase
  - Field: Transaction Date → current business date (DD/MM/YYYY format)
  - Field: Document Reference → PO number, WO number, or QMS task reference
  - Field: Description → clear description of action; no abbreviations without legend
  - Field: Quantity / Hours → actual hours; cannot exceed 8 hours without SM approval
  - Completion check: SAP B1 confirmation message; SAP document number generated

Step 4: Create the audit record in THERMOPAC QMS
  - System: THERMOPAC QMS — Audit / Issue Register
  - Menu path: QMS → Audit → New Entry
  - Action: Log completed transaction with actor, SAP doc number, project code, action, outcome
  - Field: Transaction Reference → SAP B1 document number from Step 3
  - Field: Timestamp → system-stamped IST (do not manually edit)
  - Completion check: QMS log entry visible to SM; entry status = Logged

Step 5: Notify downstream stakeholder and close task
  - System: THERMOPAC QMS — Task Manager
  - Action: Mark task as Complete; add completion note with SAP B1 reference number
  - If exception encountered: Do NOT mark complete — follow Section 9 and escalate per Section 10
  - Completion check: Task status = Complete; Manager notified via QMS system notification

COMPLETION CRITERIA:
• SAP B1 document number generated and recorded in QMS audit log
• QMS audit entry created — actor, timestamp (IST), SAP reference, outcome
• Downstream notification delivered to Manager or next approver in flow
• No open exceptions or unresolved ERP validation errors
• All transactions posted within the same business day they are initiated

OPERATING HOURS:
Transactions must be posted within the same business day they are initiated.
Out-of-hours posting requires prior SM authorisation — log reason in QMS before posting.

--- DRAFT PLACEHOLDER --- Last reviewed: 2026-05-23`
  },

  {
    id: 231, sectionNo: "11.0",
    content: `KEY PERFORMANCE INDICATORS — Employee — Projects

KPI                                          | Target          | Frequency      | Measurement Source             | Owner
---------------------------------------------|-----------------|----------------|--------------------------------|----------
SOP acknowledgement compliance               | 100%            | Per revision   | QMS SOP Module                 | SM
Task completion within assigned time limit   | >= 95%          | Monthly        | QMS Task Manager Report        | Employee
SAP B1 document creation accuracy           | Zero rework      | Monthly        | SAP B1 Audit Trail             | SM
QMS audit log entry completion rate         | 100%            | Monthly        | QMS Audit Log Report           | SM
Exception log submission within 1 hour      | 100%            | Per exception  | QMS Issue Register             | Employee
Escalation response time — Level L1         | Within 2 hours  | Per event      | QMS Escalation Log             | Employee
ERP validation error rate                   | < 2 per month   | Monthly        | SAP B1 Error Log               | SM
Precondition bypass incidents               | Zero            | Monthly        | QMS Audit Log                  | SM
Training completion rate on SOP revision    | Within 7 days   | Per revision   | QMS HR Training Module         | SM
Manual transaction override requests        | < 1 per quarter | Quarterly      | QMS Override Request Log       | SM

REPORTING:
• KPIs reviewed in monthly performance review chaired by Senior Manager with Manager attendance.
• KPI breach triggers immediate review under Section 10 escalation protocol — no deferral permitted.
• KPI data sourced exclusively from THERMOPAC QMS Reports and SAP B1 Reports — manual tracking is not permitted.
• Employee is responsible for self-monitoring and must flag any deviation to Manager on the same working day.

ESCALATION ON KPI BREACH:
• Single breach: Employee self-reports to Manager within same working day and logs in QMS.
• Two or more breaches in one month: SM initiates formal performance review within 5 business days.
• Critical breach (missing audit record or precondition bypass): Treated as compliance breach per Section 15 — immediate action required.

--- DRAFT PLACEHOLDER --- Last reviewed: 2026-05-23`
  },

  {
    id: 232, sectionNo: "12.0",
    content: `SAP B1 ERP VALIDATION RULES — Projects / Employee

MANDATORY FIELDS — Project Activity / Resource Posting (SAP B1 Projects Module):
• Project Code           — Required: Yes          | Format: Alphanumeric code (8 char) | Rule: Must match active project in SAP B1 Project Master — system-validated on entry
• Cost Code              — Required: Yes          | Format: Alphanumeric code (6 char) | Rule: Must be an approved cost code assigned to this project and phase by Projects Head
• Transaction Date       — Required: Yes          | Format: DD/MM/YYYY                 | Rule: Must be current business date; backdating requires SM written approval in QMS
• Document Reference     — Required: Yes          | Format: Free text, max 50 char     | Rule: Must include PO number, WO number, or QMS task reference — generic text not permitted
• Description            — Required: Yes          | Format: Free text, max 200 char    | Rule: Must clearly describe the action; abbreviations require a legend entry
• Employee ID            — Required: Yes          | Format: System-assigned ID         | Rule: Auto-populated from active SAP B1 session — must not be overridden manually
• Quantity / Hours       — Required: Yes          | Format: Numeric, 2 decimal places  | Rule: Cannot exceed 8.00 hours per day without SM written approval logged in QMS
• Approval Reference     — Required: Conditional  | Format: QMS record number          | Condition: Mandatory when transaction amount exceeds Employee authority limit per Section 6
• Material Batch Number  — Required: Conditional  | Format: SAP B1 batch code          | Condition: Required for any Goods Issue transaction linked to project BOM

POSTING CONDITIONS:
• All mandatory fields must be fully populated before SAP B1 permits posting — partial saves are not allowed.
• Manager approval must be recorded in THERMOPAC QMS before posting any transaction above the Employee authority limit.
• Goods Issues must have a corresponding Goods Receipt PO reference — standalone Goods Issues are not permitted.
• Labour postings must reference an open Work Order — free-text posting without a WO link is blocked.

JOURNAL REQUIREMENTS:
• Labour postings automatically generate a cost centre journal to the Projects cost centre (confirm code with Accounts).
• Material issues post to the project Work-in-Progress (WIP) account — Accounts reconciles and validates monthly.
• No manual journal creation by Employee — all financial entries are generated automatically from SAP B1 transaction postings.

OVERRIDE POLICY:
• No field validation override is permitted without SM written approval — approval must be logged in QMS within 30 minutes of override action.
• Repeat overrides exceeding 2 in any calendar month trigger a mandatory compliance review per Section 15.
• Any override attempt without recorded SM approval is a zero-tolerance compliance breach requiring immediate GM escalation.

ERP CHANGE MANAGEMENT:
• Any change to SAP B1 field mapping, validation rules, or project cost codes that affects this SOP must trigger a SOP revision per Section 19 before the change is deployed to production.
• IT must notify Projects Head of any ERP configuration change impacting the Projects module with minimum 5 business days advance notice.

--- DRAFT PLACEHOLDER --- Last reviewed: 2026-05-23`
  },

  {
    id: 235, sectionNo: "15.0",
    content: `COMPLIANCE REQUIREMENTS — Projects / Employee

APPLICABLE FRAMEWORKS:
• ISO 9001:2015 — Quality Management System (Projects delivery processes, document control, NCR and CAPA management)
• Companies Act 2013 — Statutory record retention and financial document requirements for all THERMOPAC operations in India
• GST Act (India) — Tax invoice and e-way bill compliance for dispatches and deliveries linked to project milestones
• Customer Purchase Order Terms — Contractual delivery, quality inspection, and progress reporting obligations per individual customer POs
• ASME BPVC / IBR Engineering Standards — Applicable to pressure vessel and heat exchanger projects (confirm applicable clauses with Projects Head and Design)
• THERMOPAC Internal Control Policy — Defined and maintained by GM; enforced via QMS audit controls and access governance framework

NON-NEGOTIABLE CONTROLS:
• No transaction may be posted without all required approvals — zero exceptions, no workarounds under any circumstances.
• Financial segregation of duties must be maintained at all times — Employee cannot self-approve any financial posting.
• All customer-related data (specifications, drawings, pricing, contracts) must remain exclusively within THERMOPAC-controlled systems.
• Data localisation applies — no project data, customer drawings, or pricing information on personal devices or external storage.
• Cost centre integrity must be maintained — no cross-posting between unrelated projects or departments is permitted.

BREACH RESPONSE:
1. Immediately hold all affected transactions — do not continue any further postings.
2. Notify Manager verbally within 15 minutes of detection.
3. Escalate to GM within the same business day using Section 10 Level L3 channel.
4. Document breach details in THERMOPAC QMS CAPA module within 1 hour of detection.
5. No self-resolution permitted — all compliance breaches require SM+ written sign-off on closure.

COMPLIANCE CALENDAR:
• Month-end project cost reconciliation: Last working day of each calendar month — coordinate with Accounts.
• Quarterly internal audit: Projects Head and IT review all access logs, transaction records, and open exceptions.
• Annual ISO 9001 surveillance audit: All SOPs at current revision; all employees with valid acknowledgements on record.
• Customer delivery compliance reviews: Per individual project PO terms — Projects Head is primary accountable party.
• Annual zero-trust controls review: GM + IT Head — refer to Section 18.

--- DRAFT PLACEHOLDER --- Last reviewed: 2026-05-23`
  },

  {
    id: 236, sectionNo: "16.0",
    content: `LINKED DOCUMENTS — Projects / Employee

RELATED SOPs:
• SOP-PROJ-MGR-2627-001 — Projects Manager Operations SOP — Department: Projects — Role: Manager
  Relationship: Upstream — Manager approves Employee transactions, reviews exceptions, and authorises escalations
• SOP-PROJ-SM-2627-001 — Projects Senior Manager Operations SOP — Department: Projects — Role: Senior Manager
  Relationship: Upstream — SM authorises overrides, KPI reviews, compliance actions, and SOP revisions
• SOP-PURCH-EMP-2627-001 — Purchase Employee Operations SOP — Department: Purchase — Role: Employee
  Relationship: Parallel — Purchase processes linked to project procurement; reference for PO coordination
• SOP-STR-EMP-2627-001 — Stores Employee Operations SOP — Department: Stores — Role: Employee
  Relationship: Parallel — Material issue from Stores triggers Projects recording and audit obligation
• SOP-DES-EMP-2627-001 — Design Employee Operations SOP — Department: Design — Role: Employee
  Relationship: Parallel — BOM and drawing releases from Design feed into Projects execution

WORK INSTRUCTIONS (WI):
• WI-PROJ-001 — SAP B1 Projects Module Navigation Guide — Supports: Section 8, Steps 1 to 5
• WI-PROJ-002 — THERMOPAC QMS Task Logging Procedure — Supports: Section 8, Step 4
• WI-PROJ-003 — Exception Identification and Logging Checklist — Supports: Section 9
• WI-PROJ-004 — Escalation Communication Template — Supports: Section 10

FORMS AND TEMPLATES:
• FORM-PROJ-001 — Project Activity Log Sheet (manual backup when system unavailable) — Used in: Section 8
• FORM-PROJ-002 — Escalation Notification Record — Used in: Section 10
• FORM-PROJ-003 — Precondition Verification Checklist — Used in: Section 5

SAP B1 REPORTS:
• Project Status Report (SAP B1 → Projects → Project Management → Status Report) — Validates transaction completeness
• Cost Centre Summary (SAP B1 → Financials → Cost Accounting → Cost Centre Report) — Validates posting accuracy
• Open Purchase Orders by Project (SAP B1 → Purchase → Open PO Report) — Validates procurement alignment
• Goods Receipt vs. Goods Issue Reconciliation (SAP B1 → Inventory → Stock Reports) — Validates material movement integrity

THERMOPAC QMS REPORTS:
• Projects Task Completion Report (QMS → Reports → Projects → Task Summary) — Validates KPI requirements per Section 11
• Escalation Log Report (QMS → Reports → Escalation → By Department → Projects) — Validates Section 10 compliance
• Audit Trail Report (QMS → Audit → By User → By Date Range) — Validates Section 14 requirements
• SOP Acknowledgement Status Report (QMS → SOP → Acknowledgements → By SOP) — Validates Section 20

EXTERNAL REFERENCES:
• ISO 9001:2015 Clause 8 — Operations (current certified version held by Quality Control department)
• ASME BPVC Section VIII — Pressure Vessel Design Requirements (Design and Projects library)
• Customer PO Terms and Special Conditions — Individual customer contracts (Projects Document Control)

DOCUMENT CONTROL RULE:
• All linked documents must be at their current approved revision at time of SOP activation.
• A linked document revision that changes a governed process must trigger a review of this SOP within 30 days.
• Broken or superseded links must be reported to Projects Head and corrected before the next internal audit.

--- DRAFT PLACEHOLDER --- Last reviewed: 2026-05-23`
  },

  {
    id: 237, sectionNo: "17.0",
    content: `TRAINING REQUIREMENTS — Employee — Projects

MANDATORY BEFORE OPERATING UNDER THIS SOP:
• THERMOPAC QMS system orientation — login confirmation recorded in QMS HR Training module
• SAP B1 Projects module hands-on training — minimum 4 hours practical session conducted by IT or SM
• This SOP read in full and formally acknowledged in THERMOPAC QMS (electronic acknowledgement per Section 20)
• Supervised execution of minimum 10 live transactions under SM or Manager observation before independent operation
• Escalation protocol briefing (Section 10) — confirmed in writing by SM before go-live clearance is granted
• Exception handling simulation (Section 9) — minimum 1 drill exercise with IT before first independent posting
• SAP B1 field validation walkthrough (Section 12) — conducted by IT; employee must demonstrate field-by-field compliance

COMPETENCY ASSESSMENT:
• Minimum passing score: 80% (combined written scenario test and practical SAP B1 demonstration)
• Assessment method: Practical demonstration on a live SAP B1 session plus written scenario test (minimum 10 questions)
• Assessor: Senior Manager or Projects Head — assessor must not be the trainee's direct reporting manager
• Assessment must be documented and signed off in THERMOPAC QMS HR module before SOP posting access is granted
• Failed assessment: One re-attempt permitted after 5 additional business days of supervised practice

REFRESHER TRAINING (mandatory):
• On every major SOP revision — employee must re-acknowledge and re-train on changed sections within 7 days of activation
• Annual refresher mandatory for all Employee roles in Projects (12-month cycle from last acknowledgement date)
• After any compliance breach attributed to the Employee role — refresher training required before reinstatement of posting access
• After any significant ERP change affecting the SAP B1 Projects module — IT to notify Projects Head with minimum 5 business days notice

TRAINING RECORDS:
• All training completions stored in THERMOPAC QMS HR module (Training Register — Projects tab)
• Records reviewed quarterly by SM — incomplete or expired records flagged to GM within 5 business days
• Incomplete training records result in SOP posting access being blocked until resolved (enforced by QMS access control)
• External training certificates must be uploaded to QMS HR module within 5 business days of course completion

--- DRAFT PLACEHOLDER --- Last reviewed: 2026-05-23`
  }
];

async function main() {
  console.log("Updating SOP placeholder content — Projects / Employee...\n");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const u of UPDATES) {
      const r = await client.query(
        "UPDATE oi_sop_sections SET section_content = $1, updated_at = NOW() WHERE id = $2 RETURNING id, section_no",
        [u.content, u.id]
      );
      if (r.rowCount > 0) {
        console.log(`  OK  Section ${u.sectionNo} (id=${u.id})`);
      } else {
        console.warn(`  MISS  id=${u.id} not found`);
      }
    }
    await client.query("COMMIT");
    console.log(`\nDone — ${UPDATES.length} sections updated.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ROLLBACK:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
