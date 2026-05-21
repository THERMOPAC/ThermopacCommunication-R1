# Operational Intelligence — Phase 1B Execution Plan

**Status:** SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT
**Date:** 21-May-2026
**Phase 1A Baseline:** `docs/operational-intelligence-phase1a-execution.md` (COMPLETE)
**Phase 1B Scope:** EPC Reference Linkage, Extended Risk Scoring, Financial Exposure, Liability, Time Intelligence, Advanced Filters, Expanded Dashboards
**Prepared by:** Architecture review session

---

## Governance Rules (Non-Negotiable — inherited from Phase 1A, extended here)

- No assumptions. Every field, rule, and behaviour is explicitly stated in this document.
- No hidden logic. No silent auto-actions. No client-side-only validation.
- All enforcement is server-side. UI validation is supplementary only.
- All timestamps stored as UTC. Displayed as IST using `fmtDate` / `fmtDateTime` from `client/src/lib/date-format.ts`.
- All mutations write to `oi_audit_log`. Every new field that can be patched must produce an `field_updated` audit entry.
- **Phase 1B adds columns to `oi_issues` only.** No new standalone tables are introduced.
- **Schema migration: `psql` direct SQL only.** `drizzle-kit push` hangs on this schema size. All ALTER TABLE statements in this document are the authoritative migration. `shared/schema.ts` is updated in parallel to keep ORM in sync.
- **All Phase 1A server-side rules remain fully active.** Phase 1B does not modify or relax any rule from Phase 1A.
- **No future-phase logic** (RCA, CAPA, SOP, ERP enforcement, AI agents, lessons learned, predictive analytics, legal hold, evidence integrity, AI governance) may appear in Phase 1B code.

---

## Phase 1B Scope

### In Scope

| Area | Detail |
|---|---|
| EPC Reference Fields | Activate linkage UI for `project_id` (Phase 1A: capture only); add display of project display name and project code in issue detail |
| Project Linkage | `project_id` FK already in `oi_issues`; Phase 1B populates project metadata (code, customer, financial year) in API responses |
| Customer Linkage | Add `customer_id` FK → `customers.id`; captured at issue creation or classification; shown in detail and register |
| Vendor Linkage | Add `vendor_id` FK → `vendors.id`; for PROC/MFG category issues linked to a specific vendor |
| Drawing Linkage | Add `epc_drawing_control_id` FK → `epc_drawing_controls.id`; for DWG category issues |
| PO Linkage | Add `epc_po_id` FK → `epc_purchase_orders.id`; for PROC category issues |
| WO Linkage | Add `epc_wo_id` FK → `epc_work_orders.id`; for MFG/QC category issues |
| IO Linkage | Add `inspection_order_id` FK → `inspection_orders.id`; for QC/FAT/SAT category issues |
| FAT/SAT Linkage | Activate `fat_reference` and `sat_reference` text fields in UI; add `fat_inspection_order_id` and `sat_inspection_order_id` FKs → `inspection_orders.id` |
| Contract Linkage | Add `contract_id` FK → `contracts.id`; for LEGAL/COMM/CUST category issues |
| Risk Scoring Enhancements | Add 9 individual dimension score columns (0–10 integer) to `oi_issues`; `oi_risk_score` now computed from these stored scores rather than transient values |
| Financial Exposure Fields | Add `actual_loss_amount`, `insurance_claim_flag`, `claim_reference`, `recovery_amount`, `net_financial_exposure` (computed server-side) |
| Liability Fields | Add `liability_type`, `indemnity_required`, `warranty_claim_flag`, `warranty_claim_reference` |
| Time Intelligence Fields | Add `capture_delay_hours`, `response_time_actual_hours`, `investigation_duration_hours`, `total_resolution_hours` — all computed server-side at the relevant lifecycle event; never accepted from client |
| Advanced Issue Filters | API filter params: `customerId`, `vendorId`, `contractId`, `epcPoId`, `epcWoId`, `inspectionOrderId`, `epcDrawingControlId`, `slaBreached`, `hasFinancialExposure`, `dateFrom`, `dateTo` |
| Expanded Dashboards | New endpoints: financial exposure summary, MTTR trends, by-customer breakdown, by-vendor breakdown, linkage coverage summary |

### Explicitly Excluded from Phase 1B

RCA workflow, CAPA workflow, SOP review workflow, ERP enforcement workflow, AI agents, AI governance, lessons learned, predictive analytics, legal hold, evidence integrity / SHA-256, cross-project semantic clustering, fleet-wide pattern detection, insurance claim lifecycle management, business continuity module, commissioning checklists (beyond reference linkage).

---

## 1. Schema Changes — `oi_issues` (ALTER TABLE)

All changes are additive `ALTER TABLE` statements. No existing columns are modified or dropped. No data loss.

### 1.1 Customer and Vendor Linkage

```sql
ALTER TABLE oi_issues
  ADD COLUMN customer_id              INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN vendor_id                INTEGER REFERENCES vendors(id)   ON DELETE SET NULL;
```

**Rules:**
- `customer_id` — optional on capture. If `project_id` is set, the server auto-populates `customer_id` from `projects.customer_id` at creation time if not explicitly provided. Client may override.
- `vendor_id` — optional. Relevant when `category` is `PROC`, `MFG`, or `LOG`.
- Both may be null.

### 1.2 Drawing Linkage

```sql
ALTER TABLE oi_issues
  ADD COLUMN epc_drawing_control_id   INTEGER REFERENCES epc_drawing_controls(id) ON DELETE SET NULL;
```

**Rules:**
- Optional. Relevant when `category` is `DWG`.
- UI shows a searchable dropdown filtered to drawings belonging to the linked `project_id` (if set).
- If `epc_drawing_control_id` is set, the API response includes `drawingNumber`, `drawingTitle`, `drawingRevision`, `dwgControlNumber` as denormalised display fields (joined read-only — never stored in `oi_issues`).

### 1.3 PO, WO, IO Linkage

```sql
ALTER TABLE oi_issues
  ADD COLUMN epc_po_id                INTEGER REFERENCES epc_purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN epc_wo_id                INTEGER REFERENCES epc_work_orders(id)     ON DELETE SET NULL,
  ADD COLUMN inspection_order_id      INTEGER REFERENCES inspection_orders(id)   ON DELETE SET NULL;
```

**Rules:**
- All optional. Any combination may be set.
- `epc_po_id` — relevant for `PROC` category issues.
- `epc_wo_id` — relevant for `MFG` and `QC` category issues.
- `inspection_order_id` — relevant for `QC`, `FAT`, `SAT` category issues.
- UI dropdowns filtered to project-scoped records when `project_id` is set.
- API response denormalises: PO number, WO number, IO number as display-only fields.

### 1.4 FAT/SAT Linkage (Activate Reserved Fields + FK Columns)

`fat_reference` and `sat_reference` TEXT columns already exist in `oi_issues` from Phase 1A (stored but not exposed in UI). Phase 1B activates them in the UI and adds FK columns for structured linkage:

```sql
ALTER TABLE oi_issues
  ADD COLUMN fat_inspection_order_id  INTEGER REFERENCES inspection_orders(id) ON DELETE SET NULL,
  ADD COLUMN sat_inspection_order_id  INTEGER REFERENCES inspection_orders(id) ON DELETE SET NULL;
```

**Rules:**
- `fat_reference` (text) and `sat_reference` (text) — free-text reference for external/non-ERP FAT/SAT identifiers. Activated in UI.
- `fat_inspection_order_id` / `sat_inspection_order_id` — structured FK for ERP-tracked inspection orders where `project_phase` is `FAT` or `SAT`.
- Both the text reference and the FK may coexist on the same issue. The FK takes precedence for display; the text is shown as supplementary if set.

### 1.5 Contract Linkage

```sql
ALTER TABLE oi_issues
  ADD COLUMN contract_id              INTEGER REFERENCES contracts(id) ON DELETE SET NULL;
```

**Rules:**
- Optional. Relevant for `LEGAL`, `COMM`, `CUST`, and `FIN` category issues.
- API response denormalises: `contractNumber`, `contractTitle`, `contractType`, `contractValue` as display-only fields.

### 1.6 Risk Scoring Dimension Score Columns

Phase 1A stores only the composite `oi_risk_score`. Phase 1B stores the 9 individual dimension scores so they are persistent and auditable:

```sql
ALTER TABLE oi_issues
  ADD COLUMN technical_score          SMALLINT CHECK (technical_score   BETWEEN 0 AND 10),
  ADD COLUMN quality_score            SMALLINT CHECK (quality_score     BETWEEN 0 AND 10),
  ADD COLUMN safety_score             SMALLINT CHECK (safety_score      BETWEEN 0 AND 10),
  ADD COLUMN financial_score          SMALLINT CHECK (financial_score   BETWEEN 0 AND 10),
  ADD COLUMN compliance_score         SMALLINT CHECK (compliance_score  BETWEEN 0 AND 10),
  ADD COLUMN schedule_score           SMALLINT CHECK (schedule_score    BETWEEN 0 AND 10),
  ADD COLUMN liability_score          SMALLINT CHECK (liability_score   BETWEEN 0 AND 10),
  ADD COLUMN customer_score           SMALLINT CHECK (customer_score    BETWEEN 0 AND 10),
  ADD COLUMN operational_score        SMALLINT CHECK (operational_score BETWEEN 0 AND 10);
```

**Rules:**
- All NULL by default. NULL means "not scored yet" — not zero.
- Any subset may be scored independently.
- When any dimension score is updated via PATCH, the server recomputes `oi_risk_score` using the stored values of all nine dimensions and the active `oi_risk_weight_config`.
- Dimension scores not accepted from client at issue creation. Only available via PATCH by Manager+.
- Every individual score change writes a `field_updated` audit entry.

**`oi_risk_score` recomputation formula (unchanged from Phase 1A, now using stored columns):**

```
oi_risk_score = ROUND(
  COALESCE(technical_score,   0) × technical_weight
+ COALESCE(quality_score,     0) × quality_weight
+ COALESCE(safety_score,      0) × safety_weight
+ COALESCE(financial_score,   0) × financial_weight
+ COALESCE(compliance_score,  0) × compliance_weight
+ COALESCE(schedule_score,    0) × schedule_weight
+ COALESCE(liability_score,   0) × liability_weight
+ COALESCE(customer_score,    0) × customer_weight
+ COALESCE(operational_score, 0) × operational_weight
)
```

If all 9 scores are NULL, `oi_risk_score` is set to NULL (not zero).

### 1.7 Financial Exposure Fields

```sql
ALTER TABLE oi_issues
  ADD COLUMN actual_loss_amount       DECIMAL(15,2),
  ADD COLUMN insurance_claim_flag     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN claim_reference          TEXT,
  ADD COLUMN recovery_amount          DECIMAL(15,2),
  ADD COLUMN net_financial_exposure   DECIMAL(15,2);
```

**Rules:**
- `actual_loss_amount` — confirmed/actual financial loss. Distinct from `estimated_loss_amount` (Phase 1A). Editable by SM+.
- `insurance_claim_flag` — set to TRUE when an insurance claim has been raised. Editable by SM+.
- `claim_reference` — free-text claim number or reference. Editable by SM+.
- `recovery_amount` — amount recovered through insurance or other means. Editable by SM+.
- `net_financial_exposure` — computed server-side: `actual_loss_amount - COALESCE(recovery_amount, 0)`. Never accepted from client. Recomputed whenever `actual_loss_amount` or `recovery_amount` is patched.
- All NULL by default. NULL means not yet quantified.
- Every change writes a `field_updated` audit entry.

### 1.8 Liability Fields

```sql
ALTER TABLE oi_issues
  ADD COLUMN liability_type           TEXT,
  ADD COLUMN indemnity_required       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN warranty_claim_flag      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN warranty_claim_reference TEXT;
```

**Rules:**
- `liability_type` — one of: `warranty | indemnity | third_party | regulatory | internal | none`. Free-text to allow future extension without enum migration; validated by Zod enum on the server.
- `indemnity_required` — TRUE when legal review determines indemnity clause applies.
- `warranty_claim_flag` — TRUE when a warranty claim has been raised against a vendor or subcontractor.
- `warranty_claim_reference` — free-text warranty claim number.
- All editable by SM+ only.
- Every change writes a `field_updated` audit entry.

### 1.9 Time Intelligence Fields

```sql
ALTER TABLE oi_issues
  ADD COLUMN capture_delay_hours      DECIMAL(10,2),
  ADD COLUMN response_time_actual_hours DECIMAL(10,2),
  ADD COLUMN investigation_duration_hours DECIMAL(10,2),
  ADD COLUMN total_resolution_hours   DECIMAL(10,2);
```

**Rules — all computed server-side; never accepted from client:**

| Column | Computed When | Formula |
|---|---|---|
| `capture_delay_hours` | Issue created | `(created_at - detected_at)` in fractional hours. NULL if `detected_at` is NULL. |
| `response_time_actual_hours` | Issue moves to `investigating` | `(investigating_started_at - classified_at)` in fractional hours. |
| `investigation_duration_hours` | Issue moves to `verified` | `(verified_at - investigating_started_at)` in fractional hours. |
| `total_resolution_hours` | Issue moves to `closed` | `(closed_at - classified_at)` in fractional hours. |

All values are stored in hours as `DECIMAL(10,2)`. Display in UI as hours:minutes (e.g. "3h 22m"). Never negative (NULL if formula would produce negative due to clock anomaly).

**MTTR (Mean Time To Resolution):** Computed by the dashboard endpoint only — `AVG(total_resolution_hours)` over closed issues in the requested period. Not stored.

### 1.10 Indexes for New Columns

```sql
CREATE INDEX idx_oi_issues_customer_id       ON oi_issues(customer_id);
CREATE INDEX idx_oi_issues_vendor_id         ON oi_issues(vendor_id);
CREATE INDEX idx_oi_issues_contract_id       ON oi_issues(contract_id);
CREATE INDEX idx_oi_issues_epc_po_id         ON oi_issues(epc_po_id);
CREATE INDEX idx_oi_issues_epc_wo_id         ON oi_issues(epc_wo_id);
CREATE INDEX idx_oi_issues_inspection_order  ON oi_issues(inspection_order_id);
```

---

## 2. Drizzle ORM Schema Additions (`shared/schema.ts`)

The `oiIssues` table definition already exists. Phase 1B appends the following columns to the existing Drizzle table object. **Do not redefine the table — add only the new fields to the existing `pgTable` call.**

New fields to add to the `oiIssues` `pgTable` definition:

```typescript
// ─── Phase 1B: Linkage FKs ───────────────────────────────────────────────────
customerId:               integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
vendorId:                 integer('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
epcDrawingControlId:      integer('epc_drawing_control_id').references(() => epcDrawingControls.id, { onDelete: 'set null' }),
epcPoId:                  integer('epc_po_id').references(() => epcPurchaseOrders.id, { onDelete: 'set null' }),
epcWoId:                  integer('epc_wo_id').references(() => epcWorkOrders.id, { onDelete: 'set null' }),
inspectionOrderId:        integer('inspection_order_id').references(() => inspectionOrders.id, { onDelete: 'set null' }),
fatInspectionOrderId:     integer('fat_inspection_order_id').references(() => inspectionOrders.id, { onDelete: 'set null' }),
satInspectionOrderId:     integer('sat_inspection_order_id').references(() => inspectionOrders.id, { onDelete: 'set null' }),
contractId:               integer('contract_id').references(() => contracts.id, { onDelete: 'set null' }),

// ─── Phase 1B: Dimension Scores ──────────────────────────────────────────────
technicalScore:           smallint('technical_score'),
qualityScore:             smallint('quality_score'),
safetyScore:              smallint('safety_score'),
financialScore:           smallint('financial_score'),
complianceScore:          smallint('compliance_score'),
scheduleScore:            smallint('schedule_score'),
liabilityScore:           smallint('liability_score'),
customerScore:            smallint('customer_score'),
operationalScore:         smallint('operational_score'),

// ─── Phase 1B: Financial Exposure ────────────────────────────────────────────
actualLossAmount:         decimal('actual_loss_amount', { precision: 15, scale: 2 }),
insuranceClaimFlag:       boolean('insurance_claim_flag').notNull().default(false),
claimReference:           text('claim_reference'),
recoveryAmount:           decimal('recovery_amount', { precision: 15, scale: 2 }),
netFinancialExposure:     decimal('net_financial_exposure', { precision: 15, scale: 2 }),

// ─── Phase 1B: Liability ─────────────────────────────────────────────────────
liabilityType:            text('liability_type'),
indemnityRequired:        boolean('indemnity_required').notNull().default(false),
warrantyClaimFlag:        boolean('warranty_claim_flag').notNull().default(false),
warrantyClaimReference:   text('warranty_claim_reference'),

// ─── Phase 1B: Time Intelligence ─────────────────────────────────────────────
captureDelayHours:        decimal('capture_delay_hours', { precision: 10, scale: 2 }),
responseTimeActualHours:  decimal('response_time_actual_hours', { precision: 10, scale: 2 }),
investigationDurationHours: decimal('investigation_duration_hours', { precision: 10, scale: 2 }),
totalResolutionHours:     decimal('total_resolution_hours', { precision: 10, scale: 2 }),
```

**Verify before adding:** Confirm that `epcDrawingControls`, `epcPurchaseOrders`, `epcWorkOrders`, `inspectionOrders`, `customers`, `vendors`, `contracts` are exported from `shared/schema.ts` before referencing them. If any are missing, import the relevant table — do not define a duplicate.

**insertOiIssueSchema omit additions:** Add all computed fields to the `.omit()` call:

```typescript
insertOiIssueSchema = createInsertSchema(oiIssues).omit({
  // ... existing Phase 1A omissions ...
  netFinancialExposure:        true,  // computed: actualLossAmount - recoveryAmount
  captureDelayHours:           true,  // computed at creation
  responseTimeActualHours:     true,  // computed at investigating transition
  investigationDurationHours:  true,  // computed at verified transition
  totalResolutionHours:        true,  // computed at closed transition
});
```

---

## 3. Computed Field Rules — Phase 1B Additions

### 3.1 `customer_id` Auto-Population

At `POST /api/oi/issues`, if `projectId` is supplied and `customerId` is not:

```typescript
if (body.projectId && !body.customerId) {
  const [project] = await db.select({ customerId: projects.customerId })
    .from(projects).where(eq(projects.id, body.projectId)).limit(1);
  if (project?.customerId) insertData.customerId = project.customerId;
}
```

Client-supplied `customerId` always takes precedence over auto-population. Auto-population never overwrites an explicit client value.

### 3.2 `net_financial_exposure`

Computed and stored whenever `actual_loss_amount` or `recovery_amount` is patched:

```typescript
if ('actualLossAmount' in updates || 'recoveryAmount' in updates) {
  const loss     = parseFloat(updates.actualLossAmount ?? current.actualLossAmount ?? '0');
  const recovery = parseFloat(updates.recoveryAmount   ?? current.recoveryAmount   ?? '0');
  updates.netFinancialExposure = (loss - recovery).toFixed(2);
}
```

NULL if `actual_loss_amount` is NULL. Not negative — if `recovery_amount` exceeds `actual_loss_amount`, `net_financial_exposure` is stored as `0.00`.

### 3.3 `oi_risk_score` Recomputation (Enhanced)

In Phase 1A, `oi_risk_score` was computed from transient values passed in the PATCH body. In Phase 1B, it is computed from the **stored dimension score columns**. The recomputation logic in `server/oi-routes.ts` is updated:

```typescript
async function computeOiRiskScore(issue: OiIssue, updates: Partial<OiIssue>): Promise<number | null> {
  const get = (col: keyof OiIssue) => Number(updates[col] ?? issue[col] ?? 0);
  const cfg = await db.select().from(oiRiskWeightConfig).limit(1);
  if (!cfg[0]) return null;
  const w = cfg[0];
  const scores = [
    get('technicalScore')   * Number(w.technicalWeight),
    get('qualityScore')     * Number(w.qualityWeight),
    get('safetyScore')      * Number(w.safetyWeight),
    get('financialScore')   * Number(w.financialWeight),
    get('complianceScore')  * Number(w.complianceWeight),
    get('scheduleScore')    * Number(w.scheduleWeight),
    get('liabilityScore')   * Number(w.liabilityWeight),
    get('customerScore')    * Number(w.customerWeight),
    get('operationalScore') * Number(w.operationalWeight),
  ];
  const allNull = ['technicalScore','qualityScore','safetyScore','financialScore',
    'complianceScore','scheduleScore','liabilityScore','customerScore','operationalScore']
    .every(k => (updates[k as keyof OiIssue] ?? issue[k as keyof OiIssue]) == null);
  if (allNull) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0));
}
```

Triggered whenever any dimension score column changes via PATCH.

### 3.4 Time Intelligence Computation

**`capture_delay_hours`** — computed at issue creation:

```typescript
if (insertData.detectedAt) {
  const delayMs = new Date(insertData.createdAt).getTime() - new Date(insertData.detectedAt).getTime();
  insertData.captureDelayHours = delayMs > 0 ? (delayMs / 3_600_000).toFixed(2) : null;
}
```

**`response_time_actual_hours`** — computed when transition to `investigating` is confirmed:

```typescript
if (to === 'investigating' && issue.classifiedAt) {
  const ms = now.getTime() - new Date(issue.classifiedAt).getTime();
  updates.responseTimeActualHours = ms > 0 ? (ms / 3_600_000).toFixed(2) : null;
}
```

**`investigation_duration_hours`** — computed when transition to `verified`:

```typescript
if (to === 'verified' && issue.investigatingStartedAt) {
  const ms = now.getTime() - new Date(issue.investigatingStartedAt).getTime();
  updates.investigationDurationHours = ms > 0 ? (ms / 3_600_000).toFixed(2) : null;
}
```

**`total_resolution_hours`** — computed when transition to `closed`:

```typescript
if (to === 'closed' && issue.classifiedAt) {
  const ms = now.getTime() - new Date(issue.classifiedAt).getTime();
  updates.totalResolutionHours = ms > 0 ? (ms / 3_600_000).toFixed(2) : null;
}
```

All time computations write a `field_updated` audit log entry with `field_name` = the column name.

---

## 4. API Changes — `server/oi-routes.ts`

### 4.1 Modified: `GET /api/oi/issues` (Issue Register — filter expansion)

**New query parameters accepted:**

| Param | Type | Description |
|---|---|---|
| `customerId` | integer | Filter by `customer_id` |
| `vendorId` | integer | Filter by `vendor_id` |
| `contractId` | integer | Filter by `contract_id` |
| `epcPoId` | integer | Filter by `epc_po_id` |
| `epcWoId` | integer | Filter by `epc_wo_id` |
| `inspectionOrderId` | integer | Filter by `inspection_order_id` |
| `epcDrawingControlId` | integer | Filter by `epc_drawing_control_id` |
| `slaBreached` | `response` \| `closure` \| `any` | Filter issues with SLA breaches |
| `hasFinancialExposure` | boolean | Filter issues where `actual_loss_amount IS NOT NULL` |
| `dateFrom` | ISO date string | Filter `created_at >= dateFrom` |
| `dateTo` | ISO date string | Filter `created_at <= dateTo` |

All new params are optional and stack with existing Phase 1A filters. Invalid values are ignored silently (no 422 for unknown filter — malformed integer values return 400).

### 4.2 Modified: `GET /api/oi/issues/:id` (Issue Detail — enriched response)

Response object extended with joined display fields (read-only, denormalised):

```typescript
{
  // ... all Phase 1A fields ...

  // Customer
  customerName: string | null,         // customers.bp_name
  customerBpCode: string | null,       // customers.bp_code

  // Vendor
  vendorName: string | null,           // vendors.name or vendors.display_name
  vendorSapCode: string | null,        // vendors.sap_card_code

  // Drawing
  drawingNumber: string | null,        // epc_drawing_controls.drawing_number
  drawingTitle: string | null,         // epc_drawing_controls.drawing_title
  drawingRevision: string | null,      // epc_drawing_controls.drawing_revision
  dwgControlNumber: string | null,     // epc_drawing_controls.dwg_control_number

  // PO
  poNumber: string | null,             // epc_purchase_orders.po_number

  // WO
  woNumber: string | null,             // epc_work_orders.wo_number

  // Inspection Order
  inspectionOrderNumber: string | null, // inspection_orders.inspection_order_number

  // FAT/SAT
  fatInspectionOrderNumber: string | null,
  satInspectionOrderNumber: string | null,

  // Contract
  contractNumber: string | null,       // contracts.contract_number
  contractTitle: string | null,        // contracts.title
  contractType: string | null,         // contracts.contract_type
  contractValue: string | null,        // contracts.contract_value

  // Project (enhanced — already present in Phase 1A as projectId only)
  projectCode: string | null,          // projects.code
  projectDisplayName: string | null,   // computeProjectDisplayName() — see project-utils.ts

  // Phase 1B computed / new fields
  netFinancialExposure: string | null,
  captureDelayHours: string | null,
  responseTimeActualHours: string | null,
  investigationDurationHours: string | null,
  totalResolutionHours: string | null,
}
```

Joins are LEFT JOINs — missing linked records produce null display fields, not 404s.

### 4.3 Modified: `PATCH /api/oi/issues/:id` (Field Update — new allowed fields)

**New fields added to allowed field sets:**

Added to `ALLOWED_MANAGER_FIELDS`:
```
customerId, vendorId, epcDrawingControlId, epcPoId, epcWoId, inspectionOrderId,
fatInspectionOrderId, satInspectionOrderId, contractId,
technicalScore, qualityScore, safetyScore, financialScore, complianceScore,
scheduleScore, liabilityScore, customerScore, operationalScore
```

Added to `ALLOWED_SM_FIELDS` (Senior Manager+):
```
actualLossAmount, insuranceClaimFlag, claimReference, recoveryAmount,
liabilityType, indemnityRequired, warrantyClaimFlag, warrantyClaimReference
```

`netFinancialExposure`, `captureDelayHours`, `responseTimeActualHours`, `investigationDurationHours`, `totalResolutionHours` remain **excluded from all PATCH schemas** — computed only.

### 4.4 New: `GET /api/oi/dashboard/financial-exposure`

Returns financial exposure summary across all open issues.

**Role gate:** SM+ only (403 for Manager and below).

**Response:**
```typescript
{
  totalEstimatedLoss: number,       // SUM(estimated_loss_amount)
  totalActualLoss: number,          // SUM(actual_loss_amount)
  totalRecovery: number,            // SUM(recovery_amount)
  totalNetExposure: number,         // SUM(net_financial_exposure)
  insuranceClaimsOpen: number,      // COUNT where insurance_claim_flag=true AND status NOT IN (closed, withdrawn)
  warrantyClaimsOpen: number,       // COUNT where warranty_claim_flag=true AND status NOT IN (closed, withdrawn)
  byCategory: Array<{
    category: string,
    totalNetExposure: number,
    count: number
  }>
}
```

### 4.5 New: `GET /api/oi/dashboard/mttr`

Returns MTTR (Mean Time To Resolution) trends.

**Role gate:** Manager+ only.

**Query params:**
- `periodDays` — integer, default 90, max 365. Lookback window in days.

**Response:**
```typescript
{
  overallMttrHours: number | null,       // AVG(total_resolution_hours) for closed issues in period
  bySeverity: Array<{
    severity: string,                    // S1 | S2 | S3 | S4
    avgMttrHours: number | null,
    closedCount: number
  }>,
  byCategory: Array<{
    category: string,
    avgMttrHours: number | null,
    closedCount: number
  }>,
  trend: Array<{
    weekStart: string,                   // ISO date — Monday of each week
    avgMttrHours: number | null,
    closedCount: number
  }>
}
```

### 4.6 New: `GET /api/oi/dashboard/by-customer`

Returns issue counts grouped by customer.

**Role gate:** Manager+ only.

**Response:**
```typescript
Array<{
  customerId: number,
  customerName: string,
  customerBpCode: string,
  openCount: number,
  closedCount: number,
  totalCount: number,
  criticalCount: number,              // severity = S1 or S2 and status != closed/withdrawn
  avgMttrHours: number | null
}>
```

Sorted by `totalCount` descending. Limit 50.

### 4.7 New: `GET /api/oi/dashboard/by-vendor`

Returns issue counts grouped by vendor.

**Role gate:** Manager+ only.

**Response:**
```typescript
Array<{
  vendorId: number,
  vendorName: string,
  vendorSapCode: string,
  openCount: number,
  closedCount: number,
  totalCount: number,
  criticalCount: number,
  avgMttrHours: number | null
}>
```

Sorted by `totalCount` descending. Limit 50.

### 4.8 New: `GET /api/oi/dashboard/linkage-coverage`

Returns completeness metrics for linkage fields across open issues.

**Role gate:** Manager+ only.

**Response:**
```typescript
{
  totalOpenIssues: number,
  withProject: number,        // project_id IS NOT NULL
  withCustomer: number,       // customer_id IS NOT NULL
  withVendor: number,         // vendor_id IS NOT NULL
  withDrawing: number,        // epc_drawing_control_id IS NOT NULL
  withPo: number,             // epc_po_id IS NOT NULL
  withWo: number,             // epc_wo_id IS NOT NULL
  withIo: number,             // inspection_order_id IS NOT NULL
  withContract: number,       // contract_id IS NOT NULL
  withRiskScored: number,     // oi_risk_score IS NOT NULL
  withFinancialQuantified: number, // actual_loss_amount IS NOT NULL
  coveragePct: {
    project: number,          // percentage of open issues with each linkage set
    customer: number,
    vendor: number,
    drawing: number,
    po: number,
    wo: number,
    io: number,
    contract: number,
    riskScored: number,
    financialQuantified: number
  }
}
```

---

## 5. Server-Side Enforcement Summary (Phase 1B Additions)

Inherits all Phase 1A rules. The following additional rules apply:

| Rule | Enforcement Point |
|---|---|
| `net_financial_exposure` computed server-side; not accepted from client | PATCH schema omit + handler recomputation |
| `capture_delay_hours` computed at creation only; never patched | Insert handler + omit from PATCH schema |
| `response_time_actual_hours` computed at `investigating` transition only | Transition handler |
| `investigation_duration_hours` computed at `verified` transition only | Transition handler |
| `total_resolution_hours` computed at `closed` transition only | Transition handler |
| `oi_risk_score` recomputed from stored dimension scores; not accepted from client | PATCH handler; dimension score change triggers recomputation |
| Linkage FKs validated: server confirms referenced record exists before storing | PATCH handler SELECT before UPDATE |
| `customer_id` auto-populated from `project_id` only if not explicitly supplied | POST handler |
| Financial/liability fields restricted to SM+ | Role check in PATCH handler |
| Linkage fields restricted to Manager+ | Role check in PATCH handler |
| Financial exposure dashboard restricted to SM+ | Role check in GET handler |
| `liability_type` validated against allowed values via Zod enum | Zod schema in PATCH handler |
| Every new field change writes `field_updated` audit log entry | PATCH handler, before `res.json()` |

---

## 6. Validation Rules (Zod additions)

All in `server/oi-routes.ts`. Extend existing PATCH schema with new fields:

```typescript
// Linkage fields (Manager+)
customerId:             z.number().int().positive().nullable().optional(),
vendorId:               z.number().int().positive().nullable().optional(),
epcDrawingControlId:    z.number().int().positive().nullable().optional(),
epcPoId:                z.number().int().positive().nullable().optional(),
epcWoId:                z.number().int().positive().nullable().optional(),
inspectionOrderId:      z.number().int().positive().nullable().optional(),
fatInspectionOrderId:   z.number().int().positive().nullable().optional(),
satInspectionOrderId:   z.number().int().positive().nullable().optional(),
contractId:             z.number().int().positive().nullable().optional(),

// Dimension scores (Manager+)
technicalScore:    z.number().int().min(0).max(10).nullable().optional(),
qualityScore:      z.number().int().min(0).max(10).nullable().optional(),
safetyScore:       z.number().int().min(0).max(10).nullable().optional(),
financialScore:    z.number().int().min(0).max(10).nullable().optional(),
complianceScore:   z.number().int().min(0).max(10).nullable().optional(),
scheduleScore:     z.number().int().min(0).max(10).nullable().optional(),
liabilityScore:    z.number().int().min(0).max(10).nullable().optional(),
customerScore:     z.number().int().min(0).max(10).nullable().optional(),
operationalScore:  z.number().int().min(0).max(10).nullable().optional(),

// Financial/Liability (SM+) — validated separately before applying
actualLossAmount:       z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
insuranceClaimFlag:     z.boolean().optional(),
claimReference:         z.string().max(200).nullable().optional(),
recoveryAmount:         z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
liabilityType:          z.enum(['warranty','indemnity','third_party','regulatory','internal','none']).nullable().optional(),
indemnityRequired:      z.boolean().optional(),
warrantyClaimFlag:      z.boolean().optional(),
warrantyClaimReference: z.string().max(200).nullable().optional(),
```

`net_financial_exposure`, `captureDelayHours`, `responseTimeActualHours`, `investigationDurationHours`, `totalResolutionHours` are explicitly absent from all Zod schemas.

---

## 7. UI Pages — Changes

### 7.1 Modified: Issue Capture Form (`/oi/issues/new`)

Add optional fields to the capture form:

- **Customer** — searchable dropdown from `GET /api/customers?active=true` (or existing customer API). Shown after Project selection. Auto-populates from selected project's customer.
- **Vendor** — searchable dropdown. Shown only when `category` is `PROC`, `MFG`, or `LOG`.

All new capture fields are optional. Form still submits if blank.

### 7.2 Modified: Issue Classification Form (`/oi/issues/:id/classify`)

Add linkage fields section (visible to Manager+):

**EPC References panel:**
- Drawing (searchable dropdown filtered to project's drawings — `GET /api/epc/drawing-controls?projectId=X`)
- Purchase Order (searchable dropdown filtered to project's POs — `GET /api/epc/purchase-orders?projectId=X`)
- Work Order (searchable dropdown filtered to project's WOs)
- Inspection Order (searchable dropdown filtered to project's IOs)
- FAT Reference (text input, and/or FAT IO dropdown)
- SAT Reference (text input, and/or SAT IO dropdown)
- Contract (searchable dropdown from `GET /api/contracts`)

**OI Risk Score panel:**
Nine sliders (0–10) for dimension scores: Technical, Quality, Safety, Financial, Compliance, Schedule, Liability, Customer, Operational.
Each slider label shows the weight from `oi_risk_weight_config`.
Composite `oi_risk_score` computed in real-time as sliders move (preview only — actual value set server-side on save).

**Financial/Liability panel (SM+ only):**
- Actual Loss Amount (number input, INR)
- Recovery Amount (number input, INR)
- Net Exposure (read-only, computed display)
- Insurance Claim Flag (checkbox)
- Claim Reference (text)
- Liability Type (dropdown: warranty | indemnity | third_party | regulatory | internal | none)
- Indemnity Required (checkbox)
- Warranty Claim Flag (checkbox)
- Warranty Claim Reference (text)

### 7.3 Modified: Issue Detail (`/oi/issues/:id`)

**Overview tab:** Add "EPC References" section showing linkage cards:
- Project: `{projectCode} — {customerName}` with link to project page
- Customer: `{customerBpCode} — {customerName}`
- Vendor: `{vendorName}` (`{vendorSapCode}`)
- Drawing: `{dwgControlNumber} — {drawingNumber} Rev {drawingRevision}`
- PO: `{poNumber}`
- WO: `{woNumber}`
- IO: `{inspectionOrderNumber}`
- FAT IO / SAT IO: `{fatInspectionOrderNumber}` / `{satInspectionOrderNumber}`
- Contract: `{contractNumber} — {contractTitle}` ({contractType}, value shown to SM+)

Null linkages shown as "Not linked" in muted text. Each non-null linkage is a clickable link to the relevant module page.

**Risk & Ownership tab:** Add dimension score display — 9 labelled score bars (0–10) with weight annotation. OI Risk Score displayed as a coloured gauge (0–100+ with band labels: Low / Medium / High / Critical).

**Financial tab (new tab — visible to SM+ only):**
- Estimated Loss vs Actual Loss comparison
- Recovery Amount
- Net Financial Exposure (highlighted)
- Insurance claim status and reference
- Liability type, indemnity required, warranty claim details

**Time Intelligence panel (right panel, visible to Manager+):**
Below existing SLA countdown:
- Capture Delay: `{captureDelayHours}h` (time from detection to reporting)
- Response Time: `{responseTimeActualHours}h` (time from classification to investigation start)
- Investigation Duration: `{investigationDurationHours}h`
- Total Resolution: `{totalResolutionHours}h`
All displayed as "Xh Ym" format. NULL shown as "—".

### 7.4 Modified: Issue Register (`/oi/issues`)

**New filter bar additions:**
- Customer dropdown (populated from unique customer values in `oi_issues`)
- Vendor dropdown
- SLA Breach toggle (Response / Closure / Any)
- Date range picker (From / To)
- Financial Exposure flag toggle (has quantified exposure)

**New column option:** "Net Exposure" column (opt-in via column selector, visible to SM+ only).

### 7.5 Modified: OI Dashboard (`/oi`)

**New dashboard cards/panels:**

1. **Financial Exposure Summary** (SM+ only) — cards showing Total Estimated Loss, Total Actual Loss, Net Exposure, Open Insurance Claims, Open Warranty Claims. Fetched from `GET /api/oi/dashboard/financial-exposure`.

2. **MTTR Trend** (Manager+) — line chart showing average resolution time per week over the last 90 days. Fetched from `GET /api/oi/dashboard/mttr`.

3. **Top Customers by Issue Count** (Manager+) — horizontal bar chart, top 10 customers. Fetched from `GET /api/oi/dashboard/by-customer`.

4. **Top Vendors by Issue Count** (Manager+) — horizontal bar chart, top 10 vendors. Fetched from `GET /api/oi/dashboard/by-vendor`.

5. **Linkage Coverage** (Manager+) — percentage completion indicators for each linkage field across open issues. Fetched from `GET /api/oi/dashboard/linkage-coverage`.

Use `recharts` (already in the project) for all new charts. No new charting libraries.

---

## 8. File Changes

### Modified Files

| File | Change |
|---|---|
| `shared/schema.ts` | Add Phase 1B columns to existing `oiIssues` `pgTable` definition; update `insertOiIssueSchema` `.omit()` |
| `server/oi-routes.ts` | Add new filter params; add left joins for display fields; add linkage field PATCH logic; add 5 new dashboard endpoints; update `oi_risk_score` recomputation; add time intelligence computation at transition points |
| `client/src/pages/oi/oi-issue-capture.tsx` | Add Customer and Vendor optional fields |
| `client/src/pages/oi/oi-issue-classify.tsx` | Add EPC References panel, dimension score sliders, Financial/Liability panel |
| `client/src/pages/oi/oi-issue-detail.tsx` | Add EPC References section, Financial tab, Time Intelligence panel, dimension score display |
| `client/src/pages/oi/oi-issue-register.tsx` | Add new filter bar fields, optional Net Exposure column |
| `client/src/pages/oi/oi-dashboard.tsx` | Add 5 new dashboard panels |

### New Files

None. All Phase 1B changes are additions to existing Phase 1A files.

### Unchanged Files (must not be touched)

`vite.config.ts`, `drizzle.config.ts`, `package.json`, `server/vite.ts`, `server/oi-audit-service.ts`, `server/oi-transition-service.ts`, `server/oi-escalation-service.ts`, `server/oi-scheduler.ts`. All non-OI route files.

---

## 9. Migration Script (psql direct SQL)

Run in this exact order. Each step is idempotent-safe via `IF NOT EXISTS` / conditional column adds (PostgreSQL 9.6+: use column existence check before ADD COLUMN).

```sql
-- Step 1: Linkage FK columns
ALTER TABLE oi_issues
  ADD COLUMN IF NOT EXISTS customer_id              INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_id                INTEGER REFERENCES vendors(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS epc_drawing_control_id   INTEGER REFERENCES epc_drawing_controls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS epc_po_id                INTEGER REFERENCES epc_purchase_orders(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS epc_wo_id                INTEGER REFERENCES epc_work_orders(id)       ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inspection_order_id      INTEGER REFERENCES inspection_orders(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fat_inspection_order_id  INTEGER REFERENCES inspection_orders(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sat_inspection_order_id  INTEGER REFERENCES inspection_orders(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_id              INTEGER REFERENCES contracts(id) ON DELETE SET NULL;

-- Step 2: Dimension score columns
ALTER TABLE oi_issues
  ADD COLUMN IF NOT EXISTS technical_score    SMALLINT CHECK (technical_score   BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS quality_score      SMALLINT CHECK (quality_score     BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS safety_score       SMALLINT CHECK (safety_score      BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS financial_score    SMALLINT CHECK (financial_score   BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS compliance_score   SMALLINT CHECK (compliance_score  BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS schedule_score     SMALLINT CHECK (schedule_score    BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS liability_score    SMALLINT CHECK (liability_score   BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS customer_score     SMALLINT CHECK (customer_score    BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS operational_score  SMALLINT CHECK (operational_score BETWEEN 0 AND 10);

-- Step 3: Financial exposure columns
ALTER TABLE oi_issues
  ADD COLUMN IF NOT EXISTS actual_loss_amount     DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS insurance_claim_flag   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS claim_reference        TEXT,
  ADD COLUMN IF NOT EXISTS recovery_amount        DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS net_financial_exposure DECIMAL(15,2);

-- Step 4: Liability columns
ALTER TABLE oi_issues
  ADD COLUMN IF NOT EXISTS liability_type           TEXT,
  ADD COLUMN IF NOT EXISTS indemnity_required       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS warranty_claim_flag      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS warranty_claim_reference TEXT;

-- Step 5: Time intelligence columns
ALTER TABLE oi_issues
  ADD COLUMN IF NOT EXISTS capture_delay_hours           DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS response_time_actual_hours    DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS investigation_duration_hours  DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS total_resolution_hours        DECIMAL(10,2);

-- Step 6: Indexes
CREATE INDEX IF NOT EXISTS idx_oi_issues_customer_id      ON oi_issues(customer_id);
CREATE INDEX IF NOT EXISTS idx_oi_issues_vendor_id        ON oi_issues(vendor_id);
CREATE INDEX IF NOT EXISTS idx_oi_issues_contract_id      ON oi_issues(contract_id);
CREATE INDEX IF NOT EXISTS idx_oi_issues_epc_po_id        ON oi_issues(epc_po_id);
CREATE INDEX IF NOT EXISTS idx_oi_issues_epc_wo_id        ON oi_issues(epc_wo_id);
CREATE INDEX IF NOT EXISTS idx_oi_issues_inspection_order ON oi_issues(inspection_order_id);
```

**Verification query after migration:**

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'oi_issues'
  AND column_name IN (
    'customer_id','vendor_id','epc_drawing_control_id','epc_po_id','epc_wo_id',
    'inspection_order_id','fat_inspection_order_id','sat_inspection_order_id','contract_id',
    'technical_score','quality_score','safety_score','financial_score','compliance_score',
    'schedule_score','liability_score','customer_score','operational_score',
    'actual_loss_amount','insurance_claim_flag','claim_reference','recovery_amount',
    'net_financial_exposure','liability_type','indemnity_required',
    'warranty_claim_flag','warranty_claim_reference',
    'capture_delay_hours','response_time_actual_hours',
    'investigation_duration_hours','total_resolution_hours'
  )
ORDER BY column_name;
-- Expected: 31 rows
```

---

## 10. Rollback Strategy

Phase 1B adds only columns to `oi_issues`. No new tables. Rollback:

**Step 1 — Remove new API code** (revert `server/oi-routes.ts` to Phase 1A state; remove 5 new dashboard endpoints and filter params).

**Step 2 — Remove UI additions** (revert 5 UI pages to Phase 1A state).

**Step 3 — Drop columns** (only if data loss is acceptable and approved by GM):

```sql
ALTER TABLE oi_issues
  DROP COLUMN IF EXISTS customer_id,
  DROP COLUMN IF EXISTS vendor_id,
  DROP COLUMN IF EXISTS epc_drawing_control_id,
  DROP COLUMN IF EXISTS epc_po_id,
  DROP COLUMN IF EXISTS epc_wo_id,
  DROP COLUMN IF EXISTS inspection_order_id,
  DROP COLUMN IF EXISTS fat_inspection_order_id,
  DROP COLUMN IF EXISTS sat_inspection_order_id,
  DROP COLUMN IF EXISTS contract_id,
  DROP COLUMN IF EXISTS technical_score,
  DROP COLUMN IF EXISTS quality_score,
  DROP COLUMN IF EXISTS safety_score,
  DROP COLUMN IF EXISTS financial_score,
  DROP COLUMN IF EXISTS compliance_score,
  DROP COLUMN IF EXISTS schedule_score,
  DROP COLUMN IF EXISTS liability_score,
  DROP COLUMN IF EXISTS customer_score,
  DROP COLUMN IF EXISTS operational_score,
  DROP COLUMN IF EXISTS actual_loss_amount,
  DROP COLUMN IF EXISTS insurance_claim_flag,
  DROP COLUMN IF EXISTS claim_reference,
  DROP COLUMN IF EXISTS recovery_amount,
  DROP COLUMN IF EXISTS net_financial_exposure,
  DROP COLUMN IF EXISTS liability_type,
  DROP COLUMN IF EXISTS indemnity_required,
  DROP COLUMN IF EXISTS warranty_claim_flag,
  DROP COLUMN IF EXISTS warranty_claim_reference,
  DROP COLUMN IF EXISTS capture_delay_hours,
  DROP COLUMN IF EXISTS response_time_actual_hours,
  DROP COLUMN IF EXISTS investigation_duration_hours,
  DROP COLUMN IF EXISTS total_resolution_hours;
```

Step 3 is irreversible. Requires GM approval before execution.

---

## 11. UAT Checklist

### 11.1 Linkage Fields

- [ ] Customer auto-populated from project at issue creation when project is selected
- [ ] Client-supplied `customerId` overrides auto-population
- [ ] Drawing dropdown shows only drawings for the selected project
- [ ] PO dropdown shows only POs for the selected project
- [ ] WO dropdown shows only WOs for the selected project
- [ ] IO dropdown shows only IOs for the selected project
- [ ] Linking a drawing that does not belong to the selected project is rejected (if project set) — or permitted (if no project set)
- [ ] `fat_reference` text and `fat_inspection_order_id` FK can coexist on same issue
- [ ] All linkage display fields appear in `GET /api/oi/issues/:id` response
- [ ] Null linkages display "Not linked" in UI, not empty/broken
- [ ] Each linkage card in detail view links to correct module page

### 11.2 Risk Scoring

- [ ] Dimension scores 0–10 accepted; values outside range rejected (400)
- [ ] Null dimension score accepted (means "not scored")
- [ ] `oi_risk_score` recomputed when any dimension score changes
- [ ] `oi_risk_score` = NULL when all 9 dimension scores are NULL
- [ ] `oi_risk_score` cannot be set directly by client (ignored/rejected)
- [ ] Audit log entry written for each dimension score change

### 11.3 Financial Exposure

- [ ] `actual_loss_amount` and `recovery_amount` patched by SM+; rejected (403) for Manager and below
- [ ] `net_financial_exposure` = `actual_loss_amount - recovery_amount`; never negative (floor at 0.00)
- [ ] `net_financial_exposure` = NULL when `actual_loss_amount` is NULL
- [ ] Financial exposure dashboard endpoint returns 403 for Manager and below
- [ ] Insurance and warranty claim flags and references stored and displayed correctly

### 11.4 Liability Fields

- [ ] `liability_type` validates against allowed enum values; invalid value returns 400
- [ ] SM+ can set all liability fields; Manager and below returns 403
- [ ] All liability fields written to audit log on change

### 11.5 Time Intelligence

- [ ] `capture_delay_hours` computed at creation when `detected_at` is set
- [ ] `capture_delay_hours` is NULL when `detected_at` is NULL
- [ ] `response_time_actual_hours` computed at `classified → investigating` transition
- [ ] `investigation_duration_hours` computed at `investigating → verified` transition
- [ ] `total_resolution_hours` computed at `verified → closed` transition
- [ ] All time intelligence fields are NULL when the relevant lifecycle event has not yet occurred
- [ ] None of these fields can be patched by client (ignored if supplied)
- [ ] MTTR dashboard returns correct `AVG(total_resolution_hours)` for closed issues in period

### 11.6 Advanced Filters

- [ ] `customerId` filter returns only issues linked to that customer
- [ ] `vendorId` filter returns only issues linked to that vendor
- [ ] `slaBreached=response` returns only issues with `response_sla_breached = true`
- [ ] `dateFrom` / `dateTo` filter by `created_at` correctly
- [ ] `hasFinancialExposure=true` returns only issues with `actual_loss_amount IS NOT NULL`
- [ ] Multiple filters stack correctly
- [ ] Invalid integer params return 400; unknown params are ignored

### 11.7 Dashboard

- [ ] Financial exposure summary visible to SM+ only; 403 for others
- [ ] MTTR trend chart renders correctly with no closed issues (empty state shown)
- [ ] By-customer and by-vendor charts limited to top 10 each
- [ ] Linkage coverage percentages sum correctly
- [ ] All new dashboard panels absent for Employee / Senior Executive

---

## 12. Production Smoke Tests

Run immediately after deployment, before announcing Phase 1B go-live:

1. **Migration verification:** `SELECT COUNT(*) FROM information_schema.columns WHERE table_name='oi_issues'` → must return 112 (81 Phase 1A + 31 Phase 1B).
2. **Customer auto-populate:** Create issue with `projectId` set, no `customerId` → verify response has `customerId` matching `projects.customer_id`.
3. **Linkage display:** GET issue detail after linking PO → verify `poNumber` in response.
4. **Dimension scores:** PATCH `safetyScore=8` → verify `oi_risk_score` recomputed; verify `field_updated` audit entry.
5. **Net exposure:** PATCH `actualLossAmount="100000.00"`, `recoveryAmount="30000.00"` → verify `netFinancialExposure="70000.00"`.
6. **Computed immutability:** PATCH `netFinancialExposure="999"` → verify stored value is unchanged (still server-computed value).
7. **Capture delay:** Create issue with `detectedAt` = 2 hours ago → verify `captureDelayHours ≈ 2.00`.
8. **Time intelligence at transition:** Progress issue to `closed` → verify `totalResolutionHours` is set and non-null.
9. **Financial gate:** Manager session → PATCH `actualLossAmount="1000"` → must return 403.
10. **MTTR endpoint:** `GET /api/oi/dashboard/mttr` as Manager → must return valid JSON with `overallMttrHours`.
11. **Filter stack:** `GET /api/oi/issues?slaBreached=response&hasFinancialExposure=true` → must return correct filtered set.
12. **Linkage coverage:** `GET /api/oi/dashboard/linkage-coverage` → `totalOpenIssues` matches count of open issues.

---

## 13. Zero-Trust Validation Checklist (Phase 1B Additions)

| Check | Verification Method |
|---|---|
| `net_financial_exposure` cannot be set by client | Confirm absent from PATCH Zod schema; PATCH attempt ignored |
| `capture_delay_hours` cannot be set by client | Confirm absent from PATCH Zod schema; computed at creation only |
| `response_time_actual_hours` cannot be set by client | Confirm absent from PATCH Zod schema; computed at transition only |
| `investigation_duration_hours` cannot be set by client | Confirm absent from PATCH Zod schema; computed at transition only |
| `total_resolution_hours` cannot be set by client | Confirm absent from PATCH Zod schema; computed at transition only |
| `oi_risk_score` cannot be set by client (Phase 1B: still omitted) | Confirm omitted from schema; recomputed from stored dimension scores |
| Financial/liability fields restricted to SM+ | Code review + smoke test #9 |
| Linkage FK existence validated server-side before storing | Code review: SELECT before UPDATE |
| All new field changes write `field_updated` audit log | Code review: every PATCH branch calls `writeAuditLog` before `res.json` |
| `customer_id` auto-population cannot be exploited to override explicit client value | Code review: explicit client value takes precedence |

---

## 14. Open Items for Implementation Review

| # | Item | Resolution Required |
|---|---|---|
| 1 | Confirm the exact export name for `epcDrawingControls` in `shared/schema.ts` | Required for FK reference in Drizzle schema |
| 2 | Confirm the exact export name for `epcPurchaseOrders` in `shared/schema.ts` | Required for FK reference |
| 3 | Confirm the exact export name for `epcWorkOrders` in `shared/schema.ts` | Required for FK reference |
| 4 | Confirm the exact export name for `inspectionOrders` in `shared/schema.ts` | Required for FK reference |
| 5 | Which API endpoint to use for searching drawings by project? (`/api/epc/drawing-controls?projectId=X` or existing endpoint) | Required for drawing linkage dropdown in UI |
| 6 | Which API endpoint to use for searching POs by project? | Required for PO linkage dropdown |
| 7 | Which API endpoint to use for searching WOs by project? | Required for WO linkage dropdown |
| 8 | Which API endpoint to use for searching IOs by project? | Required for IO linkage dropdown |
| 9 | Confirm `recharts` is available and sufficient for MTTR trend line chart | Check `package.json` before implementation |
| 10 | Phase 1A `oi_risk_score` was computed from transient PATCH body values. Phase 1B stores dimension scores. Confirm: existing issues with `oi_risk_score` set but no dimension scores stored — should they be left with their existing composite score, or should the score be nulled pending re-scoring? | Data migration decision required before implementation |

---

**STOP. Do not implement. Awaiting approval.**
