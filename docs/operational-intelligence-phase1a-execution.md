# Operational Intelligence — Phase 1A Execution Plan

**Status:** APPROVED FOR IMPLEMENTATION
**Date:** 21-May-2026
**Baseline Ref:** `docs/operational-intelligence-baseline-v1.2.md` (APPROVED)
**Phase:** 1A — Core DB Schema, Issue Lifecycle, Capture, Register, Detail, Classification, Risk, Ownership, Escalation, Notifications, Audit, Basic Dashboards
**Prepared by:** Architecture review session

---

## Governance Rules (Non-Negotiable)

- No assumptions. Every field, rule, and behaviour is explicitly stated in this document.
- No hidden logic. No silent auto-actions. No client-side-only validation.
- All enforcement is server-side. UI validation is supplementary only.
- All timestamps stored as UTC in the database. Displayed as IST using `fmtDate` / `fmtDateTime` from `client/src/lib/date-format.ts`.
- All actions are audit logged to `oi_audit_log` at the API layer — not at the UI layer.
- Explicit transition map enforced server-side. Any unlisted transition returns HTTP 422.
- No future-phase logic (RCA, CAPA, SOP, ERP enforcement, AI, evidence integrity, legal hold) may appear in Phase 1A code.
- Forward-compatibility: all status enum values for the full lifecycle are defined in Phase 1A. Only Phase 1A transitions are permitted at runtime. Later phases activate additional transitions without schema changes.

---

## Phase 1A Scope

### In Scope

| Area | Detail |
|---|---|
| DB Schema | `oi_issues`, `oi_audit_log`, `oi_escalations`, `oi_risk_weight_config`, `oi_risk_matrix_config` |
| Issue Lifecycle | captured → classified → investigating → verified → closed (S3/S4); S1/S2 stop at investigating |
| Issue Capture | Form — any authenticated user |
| Issue Register | Filterable, sortable list view |
| Issue Detail | Full detail page with timeline, ownership, risk panel |
| Classification | Manager+ sets severity, category, phase, investigator |
| Risk Fields | probability, impact, risk_score, all criticality dimensions, oi_risk_score |
| Ownership Fields | reported_by, assigned_to, risk_owner, escalation_owner, technical_owner, compliance_owner, financial_owner, legal_owner, business_owner |
| Escalation Engine | Rule-based; writes to `oi_escalations`; triggers notifications |
| Notification Framework | In-app notifications via `createNotification`; types defined in this document |
| Audit Logging | Append-only `oi_audit_log`; every API mutation logged |
| Basic Dashboards | OI Summary Dashboard, OI Risk Heatmap, Open Issues by Status |

### Explicitly Excluded from Phase 1A

RCA, CAPA, SOP, ERP Enforcement, AI Agents, AI Governance, Lessons Learned, Predictive Analytics, Legal Hold, Evidence Integrity / SHA-256, Cross-project semantic clustering, Fleet-wide pattern detection, Insurance/claim lifecycle, Business continuity module, Commissioning checklists, FAT/SAT reference linkage (fields reserved in schema, not activated).

---

## 1. Enums

All enums are defined in `shared/schema.ts` using `pgEnum`. All are forward-compatible with later phases.

### 1.1 `oiIssueStatus`

```
captured | classified | investigating | rca_draft | rca_review | rca_approved |
capa_open | capa_in_progress | capa_verified | sop_review | erp_enforcement |
verified | closed | reopened | withdrawn
```

**Phase 1A permitted transitions only** (enforced server-side — see Section 8):

| From | Allowed To (Phase 1A) |
|---|---|
| `captured` | `classified`, `withdrawn` |
| `classified` | `investigating`, `withdrawn` |
| `investigating` | `verified` (S3/S4 only), `withdrawn` |
| `verified` | `closed`, `reopened` |
| `closed` | `reopened` |
| `reopened` | `classified` |

S1/S2 issues at `investigating` cannot advance in Phase 1A. Attempt to advance S1/S2 past `investigating` returns HTTP 422 with error code `phase_not_implemented`.

### 1.2 `oiSeverity`

```
S1 | S2 | S3 | S4
```

### 1.3 `oiCategory`

```
QC | DWG | PROC | MFG | SITE | COMM | LOG | DOC | SAP | COMP |
SAFETY | FIN | LEGAL | HR | CUST | SYS | INT | OTHER
```

### 1.4 `oiProjectPhase`

```
SALES | ENG | DVS | PROC | MFG | QC | FAT | DISP | LOG |
SITE | ERECT | SAT | COMM | PERF | WARR | AFTS
```

### 1.5 `oiProbabilityLevel`

```
very_low | low | medium | high | very_high
```

### 1.6 `oiImpactLevel`

```
negligible | minor | moderate | major | catastrophic
```

### 1.7 `oiRiskRating`

```
low | medium | high | critical
```

### 1.8 `oiCriticalityLevel`

```
none | low | medium | high | critical
```

### 1.9 `oiEscalationType`

```
s1_immediate | safety_escalation | statutory_escalation | financial_escalation |
overdue_response | overdue_closure | severity_change | manual
```

### 1.10 `oiAuditAction`

```
created | status_changed | field_updated | severity_changed | assigned |
escalated | comment_added | withdrawn | reopened | closed | verified
```

---

## 2. Database Tables

### 2.1 `oi_issues`

Primary issues table.

```sql
CREATE TABLE oi_issues (
  id                        SERIAL PRIMARY KEY,
  issue_number              TEXT NOT NULL UNIQUE,          -- OI-YYYY-NNNN, zero-padded 4 digits
  title                     TEXT NOT NULL,
  description               TEXT NOT NULL,
  category                  oi_category NOT NULL,
  sub_category              TEXT,                          -- free text sub-category or tag
  project_phase             oi_project_phase NOT NULL,
  severity                  oi_severity NOT NULL,
  status                    oi_issue_status NOT NULL DEFAULT 'captured',

  -- EPC reference fields (Phase 1A: stored; linkage UI in later phases)
  project_id                INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  equipment_family          TEXT,
  equipment_type            TEXT,
  package_type              TEXT,
  process_system            TEXT,
  utility_system            TEXT,
  skid_system               TEXT,
  customer_industry         TEXT,
  critical_equipment_flag   BOOLEAN NOT NULL DEFAULT FALSE,
  critical_path_flag        BOOLEAN NOT NULL DEFAULT FALSE,
  project_complexity        TEXT,                          -- low | medium | high | critical

  -- Risk fields
  probability_level         oi_probability_level,
  impact_level              oi_impact_level,
  risk_score                INTEGER,                       -- computed: probability_weight × impact_weight (1–25)
  risk_rating               oi_risk_rating,                -- derived from risk_score bands
  recurrence_risk           TEXT,                          -- low | medium | high
  business_criticality      oi_criticality_level,
  customer_criticality      oi_criticality_level,
  safety_criticality        oi_criticality_level,
  statutory_criticality     oi_criticality_level,
  financial_criticality     oi_criticality_level,
  operational_criticality   oi_criticality_level,
  schedule_criticality      oi_criticality_level,
  oi_risk_score             INTEGER,                       -- composite 0–100+ score; computed server-side

  -- Ownership fields
  reported_by               INTEGER NOT NULL REFERENCES users(id),
  assigned_to               INTEGER REFERENCES users(id),
  risk_owner                INTEGER REFERENCES users(id),
  escalation_owner          INTEGER REFERENCES users(id),
  technical_owner           INTEGER REFERENCES users(id),
  compliance_owner          INTEGER REFERENCES users(id),
  financial_owner           INTEGER REFERENCES users(id),
  legal_owner               INTEGER REFERENCES users(id),
  business_owner            INTEGER REFERENCES users(id),

  -- Classification metadata
  classified_by             INTEGER REFERENCES users(id),
  classified_at             TIMESTAMP,
  investigating_started_at  TIMESTAMP,
  verified_by               INTEGER REFERENCES users(id),
  verified_at               TIMESTAMP,
  closed_by                 INTEGER REFERENCES users(id),
  closed_at                 TIMESTAMP,
  reopened_by               INTEGER REFERENCES users(id),
  reopened_at               TIMESTAMP,
  reopen_reason             TEXT,
  withdrawn_by              INTEGER REFERENCES users(id),
  withdrawn_at              TIMESTAMP,
  withdrawal_reason         TEXT,

  -- Severity change tracking
  severity_changed_by       INTEGER REFERENCES users(id),
  severity_changed_at       TIMESTAMP,
  severity_change_reason    TEXT,
  previous_severity         oi_severity,

  -- Time intelligence (Phase 1A: occurrence and detection; response/closure SLA computed)
  occurred_at               TIMESTAMP,                     -- when the event actually occurred
  detected_at               TIMESTAMP,                     -- when it was detected
  response_due_at           TIMESTAMP,                     -- computed from severity SLA at classification
  closure_due_at            TIMESTAMP,                     -- computed from severity SLA at classification
  response_sla_breached     BOOLEAN NOT NULL DEFAULT FALSE,
  closure_sla_breached      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Repeat issue tracking
  repeat_issue              BOOLEAN NOT NULL DEFAULT FALSE,
  parent_issue_id           INTEGER REFERENCES oi_issues(id) ON DELETE SET NULL,

  -- Financial fields (Phase 1A: fields present; values optional)
  estimated_loss_amount     DECIMAL(15,2),
  liability_severity        TEXT,                          -- low | medium | high | critical
  consequential_damage_flag BOOLEAN NOT NULL DEFAULT FALSE,
  business_interruption_flag BOOLEAN NOT NULL DEFAULT FALSE,

  -- Statutory fields (Phase 1A: fields present; values optional)
  statutory_authority       TEXT,
  compliance_status         TEXT,
  statutory_severity        TEXT,
  legal_review_required     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Site/commissioning references (Phase 1A: reserved; not activated in UI)
  fat_reference             TEXT,
  sat_reference             TEXT,
  punch_point_reference     TEXT,
  readiness_status          TEXT,

  -- Timestamps
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Indexes:**

```sql
CREATE INDEX idx_oi_issues_status         ON oi_issues(status);
CREATE INDEX idx_oi_issues_severity       ON oi_issues(severity);
CREATE INDEX idx_oi_issues_category       ON oi_issues(category);
CREATE INDEX idx_oi_issues_reported_by    ON oi_issues(reported_by);
CREATE INDEX idx_oi_issues_assigned_to    ON oi_issues(assigned_to);
CREATE INDEX idx_oi_issues_project_id     ON oi_issues(project_id);
CREATE INDEX idx_oi_issues_created_at     ON oi_issues(created_at DESC);
CREATE INDEX idx_oi_issues_severity_status ON oi_issues(severity, status);
CREATE UNIQUE INDEX idx_oi_issues_number  ON oi_issues(issue_number);
```

**Issue number generation rule:**

Format: `OI-{YYYY}-{NNNN}` — year from IST date at capture time; NNNN is a zero-padded 4-digit sequence resetting each calendar year. Sequence managed via `SELECT MAX(id)` scoped to the current year, not a DB sequence, to avoid gaps. Generated server-side only. Never accepted from client.

---

### 2.2 `oi_audit_log`

Append-only. No UPDATE or DELETE permitted on this table. Enforced at the application layer (no UPDATE/DELETE routes exist for this table).

```sql
CREATE TABLE oi_audit_log (
  id            SERIAL PRIMARY KEY,
  issue_id      INTEGER NOT NULL REFERENCES oi_issues(id) ON DELETE CASCADE,
  action        oi_audit_action NOT NULL,
  actor_id      INTEGER NOT NULL REFERENCES users(id),
  actor_name    TEXT NOT NULL,                -- denormalised snapshot at time of action
  actor_role    TEXT NOT NULL,                -- denormalised snapshot at time of action
  field_name    TEXT,                         -- NULL for status changes; field name for field edits
  old_value     TEXT,                         -- serialised previous value
  new_value     TEXT,                         -- serialised new value
  context       TEXT,                         -- human-readable description of what happened
  ip_address    TEXT,                         -- request IP
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Indexes:**

```sql
CREATE INDEX idx_oi_audit_issue_id   ON oi_audit_log(issue_id);
CREATE INDEX idx_oi_audit_actor_id   ON oi_audit_log(actor_id);
CREATE INDEX idx_oi_audit_created_at ON oi_audit_log(created_at DESC);
CREATE INDEX idx_oi_audit_action     ON oi_audit_log(action);
```

**Mandatory audit events in Phase 1A** (written by every mutating API handler before returning 200):

| Trigger | Action | Fields Logged |
|---|---|---|
| Issue created | `created` | All initial field values |
| Status changed | `status_changed` | old_value: previous status, new_value: new status |
| Severity changed | `severity_changed` | old_value: previous severity, new_value: new severity, context: reason |
| Any field updated | `field_updated` | field_name, old_value, new_value |
| Investigator assigned | `assigned` | old_value: NULL or previous, new_value: new assignee id+name |
| Issue escalated | `escalated` | context: escalation type and reason |
| Issue withdrawn | `withdrawn` | context: withdrawal reason |
| Issue reopened | `reopened` | context: reopen reason |
| Issue verified | `verified` | — |
| Issue closed | `closed` | — |

---

### 2.3 `oi_escalations`

One record per escalation event.

```sql
CREATE TABLE oi_escalations (
  id                  SERIAL PRIMARY KEY,
  issue_id            INTEGER NOT NULL REFERENCES oi_issues(id) ON DELETE CASCADE,
  escalation_type     oi_escalation_type NOT NULL,
  triggered_by        INTEGER REFERENCES users(id),   -- NULL = system-triggered
  triggered_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  escalated_to        INTEGER REFERENCES users(id),   -- primary recipient
  notification_sent   BOOLEAN NOT NULL DEFAULT FALSE,
  notification_sent_at TIMESTAMP,
  context             TEXT,                           -- reason / trigger description
  resolved            BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at         TIMESTAMP,
  resolved_by         INTEGER REFERENCES users(id)
);
```

**Indexes:**

```sql
CREATE INDEX idx_oi_escalations_issue_id ON oi_escalations(issue_id);
CREATE INDEX idx_oi_escalations_type     ON oi_escalations(escalation_type);
```

---

### 2.4 `oi_risk_weight_config`

Single-row configuration table. Superuser only may update. All changes audit logged externally.

```sql
CREATE TABLE oi_risk_weight_config (
  id                    SERIAL PRIMARY KEY,
  technical_weight      DECIMAL(4,2) NOT NULL DEFAULT 1.0,
  quality_weight        DECIMAL(4,2) NOT NULL DEFAULT 1.2,
  safety_weight         DECIMAL(4,2) NOT NULL DEFAULT 2.0,
  financial_weight      DECIMAL(4,2) NOT NULL DEFAULT 1.5,
  compliance_weight     DECIMAL(4,2) NOT NULL DEFAULT 1.8,
  schedule_weight       DECIMAL(4,2) NOT NULL DEFAULT 1.0,
  liability_weight      DECIMAL(4,2) NOT NULL DEFAULT 2.0,
  customer_weight       DECIMAL(4,2) NOT NULL DEFAULT 1.5,
  operational_weight    DECIMAL(4,2) NOT NULL DEFAULT 1.0,
  updated_by            INTEGER REFERENCES users(id),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Seed: one row with default weights inserted at migration time.

---

### 2.5 `oi_risk_matrix_config`

5×5 matrix: probability (1–5) × impact (1–5) → risk_rating.

```sql
CREATE TABLE oi_risk_matrix_config (
  id              SERIAL PRIMARY KEY,
  probability     INTEGER NOT NULL CHECK (probability BETWEEN 1 AND 5),
  impact          INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
  risk_rating     oi_risk_rating NOT NULL,
  updated_by      INTEGER REFERENCES users(id),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (probability, impact)
);
```

Seed: 25 rows with standard EPC risk matrix defaults inserted at migration time:

| P\I | 1 (negligible) | 2 (minor) | 3 (moderate) | 4 (major) | 5 (catastrophic) |
|---|---|---|---|---|---|
| 1 (very_low) | low | low | low | medium | medium |
| 2 (low) | low | low | medium | medium | high |
| 3 (medium) | low | medium | medium | high | high |
| 4 (high) | medium | medium | high | high | critical |
| 5 (very_high) | medium | high | high | critical | critical |

---

## 3. Computed Fields — Server-Side Rules

### 3.1 `risk_score`

Computed when both `probability_level` and `impact_level` are set.

Probability weight map: `very_low=1, low=2, medium=3, high=4, very_high=5`
Impact weight map: `negligible=1, minor=2, moderate=3, major=4, catastrophic=5`

```
risk_score = probability_weight × impact_weight   (range: 1–25)
```

`risk_rating` derived from `oi_risk_matrix_config` using `probability_weight` and `impact_weight`. If matrix lookup fails, fallback bands: 1–4 = low, 5–9 = medium, 10–19 = high, 20–25 = critical.

### 3.2 `oi_risk_score`

Computed server-side using `oi_risk_weight_config` active weights. Each dimension scored 0–10 (stored separately). Composite:

```
oi_risk_score = ROUND(
  (technical_score   × technical_weight)
+ (quality_score     × quality_weight)
+ (safety_score      × safety_weight)
+ (financial_score   × financial_weight)
+ (compliance_score  × compliance_weight)
+ (schedule_score    × schedule_weight)
+ (liability_score   × liability_weight)
+ (customer_score    × customer_weight)
+ (operational_score × operational_weight)
)
```

Score bands: 0–20 = Low, 21–50 = Medium, 51–80 = High, 81+ = Critical.

Phase 1A: `oi_risk_score` is computed when scores are submitted. If no dimension scores provided, `oi_risk_score` is NULL (not zero).

### 3.3 `response_due_at` and `closure_due_at`

Computed at classification time (when `classified_at` is set):

| Severity | Response SLA | Closure SLA |
|---|---|---|
| S1 | 24 hours from `classified_at` | 30 days |
| S2 | 72 hours from `classified_at` | 60 days |
| S3 | 7 days from `classified_at` | 90 days |
| S4 | 30 days from `classified_at` | 180 days |

Both stored as UTC timestamps. Never recalculated after initial set (SLA date is immutable once set).

### 3.4 `issue_number`

Generated server-side at creation:

```typescript
// IST year at capture time
const istNow = toISTDate(new Date());
const year = istNow.getFullYear();
const count = await db.select({ n: count() })
  .from(oiIssues)
  .where(like(oiIssues.issueNumber, `OI-${year}-%`));
const seq = (count[0].n + 1).toString().padStart(4, '0');
return `OI-${year}-${seq}`;
```

---

## 4. Drizzle ORM Schema Additions

**File:** `shared/schema.ts`

Add the following exports (after existing tables, before the end of file):

```typescript
// --- Operational Intelligence Enums ---
export const oiIssueStatusEnum = pgEnum('oi_issue_status', [
  'captured','classified','investigating','rca_draft','rca_review','rca_approved',
  'capa_open','capa_in_progress','capa_verified','sop_review','erp_enforcement',
  'verified','closed','reopened','withdrawn'
]);
export const oiSeverityEnum = pgEnum('oi_severity', ['S1','S2','S3','S4']);
export const oiCategoryEnum = pgEnum('oi_category', [
  'QC','DWG','PROC','MFG','SITE','COMM','LOG','DOC','SAP','COMP',
  'SAFETY','FIN','LEGAL','HR','CUST','SYS','INT','OTHER'
]);
export const oiProjectPhaseEnum = pgEnum('oi_project_phase', [
  'SALES','ENG','DVS','PROC','MFG','QC','FAT','DISP','LOG',
  'SITE','ERECT','SAT','COMM','PERF','WARR','AFTS'
]);
export const oiProbabilityLevelEnum = pgEnum('oi_probability_level', [
  'very_low','low','medium','high','very_high'
]);
export const oiImpactLevelEnum = pgEnum('oi_impact_level', [
  'negligible','minor','moderate','major','catastrophic'
]);
export const oiRiskRatingEnum = pgEnum('oi_risk_rating', ['low','medium','high','critical']);
export const oiCriticalityLevelEnum = pgEnum('oi_criticality_level', [
  'none','low','medium','high','critical'
]);
export const oiEscalationTypeEnum = pgEnum('oi_escalation_type', [
  's1_immediate','safety_escalation','statutory_escalation','financial_escalation',
  'overdue_response','overdue_closure','severity_change','manual'
]);
export const oiAuditActionEnum = pgEnum('oi_audit_action', [
  'created','status_changed','field_updated','severity_changed','assigned',
  'escalated','comment_added','withdrawn','reopened','closed','verified'
]);

// --- OI Issues Table ---
export const oiIssues = pgTable('oi_issues', {
  id:                       serial('id').primaryKey(),
  issueNumber:              text('issue_number').notNull().unique(),
  title:                    text('title').notNull(),
  description:              text('description').notNull(),
  category:                 oiCategoryEnum('category').notNull(),
  subCategory:              text('sub_category'),
  projectPhase:             oiProjectPhaseEnum('project_phase').notNull(),
  severity:                 oiSeverityEnum('severity').notNull(),
  status:                   oiIssueStatusEnum('status').notNull().default('captured'),
  projectId:                integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  equipmentFamily:          text('equipment_family'),
  equipmentType:            text('equipment_type'),
  packageType:              text('package_type'),
  processSystem:            text('process_system'),
  utilitySystem:            text('utility_system'),
  skidSystem:               text('skid_system'),
  customerIndustry:         text('customer_industry'),
  criticalEquipmentFlag:    boolean('critical_equipment_flag').notNull().default(false),
  criticalPathFlag:         boolean('critical_path_flag').notNull().default(false),
  projectComplexity:        text('project_complexity'),
  probabilityLevel:         oiProbabilityLevelEnum('probability_level'),
  impactLevel:              oiImpactLevelEnum('impact_level'),
  riskScore:                integer('risk_score'),
  riskRating:               oiRiskRatingEnum('risk_rating'),
  recurrenceRisk:           text('recurrence_risk'),
  businessCriticality:      oiCriticalityLevelEnum('business_criticality'),
  customerCriticality:      oiCriticalityLevelEnum('customer_criticality'),
  safetyCriticality:        oiCriticalityLevelEnum('safety_criticality'),
  statutoryCriticality:     oiCriticalityLevelEnum('statutory_criticality'),
  financialCriticality:     oiCriticalityLevelEnum('financial_criticality'),
  operationalCriticality:   oiCriticalityLevelEnum('operational_criticality'),
  scheduleCriticality:      oiCriticalityLevelEnum('schedule_criticality'),
  oiRiskScore:              integer('oi_risk_score'),
  reportedBy:               integer('reported_by').notNull().references(() => users.id),
  assignedTo:               integer('assigned_to').references(() => users.id),
  riskOwner:                integer('risk_owner').references(() => users.id),
  escalationOwner:          integer('escalation_owner').references(() => users.id),
  technicalOwner:           integer('technical_owner').references(() => users.id),
  complianceOwner:          integer('compliance_owner').references(() => users.id),
  financialOwner:           integer('financial_owner').references(() => users.id),
  legalOwner:               integer('legal_owner').references(() => users.id),
  businessOwner:            integer('business_owner').references(() => users.id),
  classifiedBy:             integer('classified_by').references(() => users.id),
  classifiedAt:             timestamp('classified_at'),
  investigatingStartedAt:   timestamp('investigating_started_at'),
  verifiedBy:               integer('verified_by').references(() => users.id),
  verifiedAt:               timestamp('verified_at'),
  closedBy:                 integer('closed_by').references(() => users.id),
  closedAt:                 timestamp('closed_at'),
  reopenedBy:               integer('reopened_by').references(() => users.id),
  reopenedAt:               timestamp('reopened_at'),
  reopenReason:             text('reopen_reason'),
  withdrawnBy:              integer('withdrawn_by').references(() => users.id),
  withdrawnAt:              timestamp('withdrawn_at'),
  withdrawalReason:         text('withdrawal_reason'),
  severityChangedBy:        integer('severity_changed_by').references(() => users.id),
  severityChangedAt:        timestamp('severity_changed_at'),
  severityChangeReason:     text('severity_change_reason'),
  previousSeverity:         oiSeverityEnum('previous_severity'),
  occurredAt:               timestamp('occurred_at'),
  detectedAt:               timestamp('detected_at'),
  responseDueAt:            timestamp('response_due_at'),
  closureDueAt:             timestamp('closure_due_at'),
  responseSlaBreached:      boolean('response_sla_breached').notNull().default(false),
  closureSlaBreached:       boolean('closure_sla_breached').notNull().default(false),
  repeatIssue:              boolean('repeat_issue').notNull().default(false),
  parentIssueId:            integer('parent_issue_id'),
  estimatedLossAmount:      decimal('estimated_loss_amount', { precision: 15, scale: 2 }),
  liabilitySeverity:        text('liability_severity'),
  consequentialDamageFlag:  boolean('consequential_damage_flag').notNull().default(false),
  businessInterruptionFlag: boolean('business_interruption_flag').notNull().default(false),
  statutoryAuthority:       text('statutory_authority'),
  complianceStatus:         text('compliance_status'),
  statutorySeverity:        text('statutory_severity'),
  legalReviewRequired:      boolean('legal_review_required').notNull().default(false),
  fatReference:             text('fat_reference'),
  satReference:             text('sat_reference'),
  punchPointReference:      text('punch_point_reference'),
  readinessStatus:          text('readiness_status'),
  createdAt:                timestamp('created_at').notNull().defaultNow(),
  updatedAt:                timestamp('updated_at').notNull().defaultNow(),
});

// --- OI Audit Log ---
export const oiAuditLog = pgTable('oi_audit_log', {
  id:          serial('id').primaryKey(),
  issueId:     integer('issue_id').notNull().references(() => oiIssues.id, { onDelete: 'cascade' }),
  action:      oiAuditActionEnum('action').notNull(),
  actorId:     integer('actor_id').notNull().references(() => users.id),
  actorName:   text('actor_name').notNull(),
  actorRole:   text('actor_role').notNull(),
  fieldName:   text('field_name'),
  oldValue:    text('old_value'),
  newValue:    text('new_value'),
  context:     text('context'),
  ipAddress:   text('ip_address'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
});

// --- OI Escalations ---
export const oiEscalations = pgTable('oi_escalations', {
  id:                  serial('id').primaryKey(),
  issueId:             integer('issue_id').notNull().references(() => oiIssues.id, { onDelete: 'cascade' }),
  escalationType:      oiEscalationTypeEnum('escalation_type').notNull(),
  triggeredBy:         integer('triggered_by').references(() => users.id),
  triggeredAt:         timestamp('triggered_at').notNull().defaultNow(),
  escalatedTo:         integer('escalated_to').references(() => users.id),
  notificationSent:    boolean('notification_sent').notNull().default(false),
  notificationSentAt:  timestamp('notification_sent_at'),
  context:             text('context'),
  resolved:            boolean('resolved').notNull().default(false),
  resolvedAt:          timestamp('resolved_at'),
  resolvedBy:          integer('resolved_by').references(() => users.id),
});

// --- OI Risk Weight Config ---
export const oiRiskWeightConfig = pgTable('oi_risk_weight_config', {
  id:                serial('id').primaryKey(),
  technicalWeight:   decimal('technical_weight', { precision: 4, scale: 2 }).notNull().default('1.0'),
  qualityWeight:     decimal('quality_weight', { precision: 4, scale: 2 }).notNull().default('1.2'),
  safetyWeight:      decimal('safety_weight', { precision: 4, scale: 2 }).notNull().default('2.0'),
  financialWeight:   decimal('financial_weight', { precision: 4, scale: 2 }).notNull().default('1.5'),
  complianceWeight:  decimal('compliance_weight', { precision: 4, scale: 2 }).notNull().default('1.8'),
  scheduleWeight:    decimal('schedule_weight', { precision: 4, scale: 2 }).notNull().default('1.0'),
  liabilityWeight:   decimal('liability_weight', { precision: 4, scale: 2 }).notNull().default('2.0'),
  customerWeight:    decimal('customer_weight', { precision: 4, scale: 2 }).notNull().default('1.5'),
  operationalWeight: decimal('operational_weight', { precision: 4, scale: 2 }).notNull().default('1.0'),
  updatedBy:         integer('updated_by').references(() => users.id),
  updatedAt:         timestamp('updated_at').notNull().defaultNow(),
});

// --- OI Risk Matrix Config ---
export const oiRiskMatrixConfig = pgTable('oi_risk_matrix_config', {
  id:          serial('id').primaryKey(),
  probability: integer('probability').notNull(),
  impact:      integer('impact').notNull(),
  riskRating:  oiRiskRatingEnum('risk_rating').notNull(),
  updatedBy:   integer('updated_by').references(() => users.id),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

// --- Insert Schemas ---
export const insertOiIssueSchema = createInsertSchema(oiIssues).omit({
  id: true, issueNumber: true, status: true, riskScore: true, riskRating: true,
  oiRiskScore: true, classifiedBy: true, classifiedAt: true,
  investigatingStartedAt: true, verifiedBy: true, verifiedAt: true,
  closedBy: true, closedAt: true, reopenedBy: true, reopenedAt: true,
  reopenReason: true, withdrawnBy: true, withdrawnAt: true, withdrawalReason: true,
  severityChangedBy: true, severityChangedAt: true, previousSeverity: true,
  responseDueAt: true, closureDueAt: true, responseSlaBreached: true,
  closureSlaBreached: true, createdAt: true, updatedAt: true,
});

export type OiIssue = typeof oiIssues.$inferSelect;
export type InsertOiIssue = z.infer<typeof insertOiIssueSchema>;
export type OiAuditLog = typeof oiAuditLog.$inferSelect;
export type OiEscalation = typeof oiEscalations.$inferSelect;
```

---

## 5. API Routes

**File:** `server/oi-routes.ts` (new file)
**Registration:** `app.use('/api/oi', ensureAuthenticated, oiRouter)` in `server/routes.ts`

All routes require authentication. Role checks are performed inside each handler. Unauthenticated requests return HTTP 401. Insufficient role returns HTTP 403.

### 5.1 Issue CRUD

| Method | Path | Description | Min Role | Notes |
|---|---|---|---|---|
| `POST` | `/api/oi/issues` | Create issue | Any authenticated | reportedBy = req.user.id |
| `GET` | `/api/oi/issues` | List issues (paginated, filtered) | Any authenticated | Scope filtered by role |
| `GET` | `/api/oi/issues/:id` | Get issue detail | Any authenticated | Scope filtered by role |
| `PATCH` | `/api/oi/issues/:id` | Update issue fields | Manager (classification) / Owner (limited) | See field-level permissions |
| `POST` | `/api/oi/issues/:id/transition` | Transition status | Role-dependent per transition | See Section 8 |
| `POST` | `/api/oi/issues/:id/severity` | Change severity | Manager | Requires reason |
| `POST` | `/api/oi/issues/:id/assign` | Assign investigator | Manager | — |
| `POST` | `/api/oi/issues/:id/withdraw` | Withdraw issue | Superuser | Requires reason |
| `POST` | `/api/oi/issues/:id/reopen` | Reopen issue | Manager | Requires reason |

### 5.2 Audit Log

| Method | Path | Description | Min Role |
|---|---|---|---|
| `GET` | `/api/oi/issues/:id/audit` | Get audit log for issue | Manager |

No POST/PATCH/DELETE on audit log. Audit log is written only by API handlers internally.

### 5.3 Escalations

| Method | Path | Description | Min Role |
|---|---|---|---|
| `GET` | `/api/oi/issues/:id/escalations` | List escalations for issue | Manager |
| `POST` | `/api/oi/issues/:id/escalate` | Manual escalation | Manager |

### 5.4 Dashboard / Analytics

| Method | Path | Description | Min Role |
|---|---|---|---|
| `GET` | `/api/oi/dashboard/summary` | Open/closed counts by status, severity | Any authenticated (scoped) |
| `GET` | `/api/oi/dashboard/risk-heatmap` | Risk distribution by category and severity | Manager |
| `GET` | `/api/oi/dashboard/by-status` | Issues grouped by status | Any authenticated (scoped) |
| `GET` | `/api/oi/dashboard/sla-breaches` | Response and closure SLA breach counts | Manager |
| `GET` | `/api/oi/dashboard/escalations` | Active escalation summary | Manager |

### 5.5 Config (Superuser only)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/oi/config/risk-weights` | Get active risk weight config |
| `PUT` | `/api/oi/config/risk-weights` | Update risk weights |
| `GET` | `/api/oi/config/risk-matrix` | Get 5×5 risk matrix |
| `PUT` | `/api/oi/config/risk-matrix` | Update risk matrix cell |

---

## 6. Request / Response Validation Rules

### 6.1 `POST /api/oi/issues` — Create

**Required fields:** `title`, `description`, `category`, `project_phase`, `severity`
**Optional:** all other fields except those explicitly excluded in insert schema
**Server sets:** `issue_number`, `status = 'captured'`, `reported_by = req.user.id`, `created_at`, `updated_at`
**Client must not send:** `issue_number`, `status`, `risk_score`, `risk_rating`, `oi_risk_score`, any `*_by` / `*_at` classification/closure fields

**Validation:**
- `title`: non-empty string, max 500 chars
- `description`: non-empty string
- `category`: must be valid `oiCategory` enum value
- `project_phase`: must be valid `oiProjectPhase` enum value
- `severity`: must be valid `oiSeverity` enum value (`S1`–`S4`)
- `project_id`: if provided, must exist in `projects` table

### 6.2 `PATCH /api/oi/issues/:id` — Field Update

**Permitted updatable fields by role:**

| Field Group | Min Role |
|---|---|
| `title`, `description`, `sub_category` | Reported_by (own issue) or Manager |
| `category`, `project_phase`, `equipment_family`, `equipment_type`, `package_type`, `process_system`, `utility_system`, `skid_system`, `customer_industry`, `critical_equipment_flag`, `critical_path_flag`, `project_complexity` | Manager |
| `assigned_to`, `technical_owner`, `business_owner` | Manager |
| `probability_level`, `impact_level`, `recurrence_risk`, `business_criticality`, `customer_criticality`, `safety_criticality`, `statutory_criticality`, `financial_criticality`, `operational_criticality`, `schedule_criticality` | Manager |
| `risk_owner`, `escalation_owner`, `compliance_owner`, `financial_owner`, `legal_owner` | Senior Manager |
| `estimated_loss_amount`, `liability_severity`, `consequential_damage_flag`, `business_interruption_flag` | Senior Manager |
| `statutory_authority`, `compliance_status`, `statutory_severity`, `legal_review_required` | Senior Manager |
| `occurred_at`, `detected_at`, `repeat_issue`, `parent_issue_id` | Manager |

**Server recomputes** `risk_score`, `risk_rating`, `oi_risk_score` whenever relevant fields change. Client must not send computed fields.

Every changed field is written as a separate `field_updated` audit log entry.

### 6.3 `POST /api/oi/issues/:id/transition` — Status Transition

**Request body:** `{ to: string, reason?: string }`

**Validation:**
- `to` must be a valid `oiIssueStatus` value
- Transition from current status to `to` must exist in Phase 1A allowed-transitions map (Section 8)
- Role must be permitted for the target status (Section 7)
- If `to = 'withdrawn'`: `reason` is mandatory; role must be Superuser
- If `to = 'reopened'`: `reason` is mandatory
- If `to = 'verified'` and issue severity is S1/S2: HTTP 422 `phase_not_implemented`
- If `to = 'verified'` and issue severity is S3/S4: permitted if status is `investigating`

---

## 7. Role Permissions (Server-Side Enforcement)

### 7.1 Issue Visibility Scope

Applied to all `GET /api/oi/issues` and `GET /api/oi/issues/:id` queries:

| Role | Scope |
|---|---|
| Employee, Senior Executive | Own issues only (`reported_by = req.user.id OR assigned_to = req.user.id`) |
| Manager | Own department issues (requires `department` field on `users` table) + own issues |
| Senior Manager | Own department + subordinate departments |
| General Manager, Superuser | All issues |

**Note:** If `department` is not on the `users` table, scope for Manager falls back to own issues until department field is confirmed. This must be verified at implementation time.

### 7.2 Transition Role Map

| Transition | Permitted Roles |
|---|---|
| `captured → classified` | Manager, Senior Manager, General Manager, Superuser |
| `classified → investigating` | Manager, Senior Manager, General Manager, Superuser |
| `classified → withdrawn` | Superuser |
| `captured → withdrawn` | Superuser |
| `investigating → verified` (S3/S4 only) | Senior Manager, General Manager, Superuser |
| `investigating → withdrawn` | Superuser |
| `verified → closed` | General Manager, Superuser |
| `verified → reopened` | Manager, Senior Manager, General Manager, Superuser |
| `closed → reopened` | Manager, Senior Manager, General Manager, Superuser |
| `reopened → classified` | Manager, Senior Manager, General Manager, Superuser |

### 7.3 Config Route Permissions

| Route | Permitted Roles |
|---|---|
| `PUT /api/oi/config/risk-weights` | Superuser |
| `PUT /api/oi/config/risk-matrix` | Superuser |
| `GET /api/oi/config/*` | Manager and above |

---

## 8. Transition Enforcement — Server-Side State Machine

Implemented in `server/oi-transition-service.ts` (new file). Every transition attempt calls `validateTransition(issue, toStatus, actor)` before any DB write.

```typescript
// Phase 1A allowed transitions (forward-compatible — later phases extend this map)
const PHASE_1A_TRANSITIONS: Record<string, string[]> = {
  captured:      ['classified', 'withdrawn'],
  classified:    ['investigating', 'withdrawn'],
  investigating: ['verified', 'withdrawn'],   // 'verified' only for S3/S4 at runtime
  verified:      ['closed', 'reopened'],
  closed:        ['reopened'],
  reopened:      ['classified'],
};

// Future-phase transitions (NOT active in Phase 1A — listed for forward reference only)
// investigating → rca_draft (Phase 1B, S1/S2)
// rca_draft → rca_review, investigating
// rca_review → rca_approved, rca_draft
// rca_approved → capa_open
// capa_open → capa_in_progress
// capa_in_progress → capa_verified
// capa_verified → sop_review (S1/S2), verified (S3/S4 no repeat)
// sop_review → erp_enforcement (if required), verified
// erp_enforcement → verified

function validateTransition(issue: OiIssue, to: string, actor: User): void {
  const allowed = PHASE_1A_TRANSITIONS[issue.status];
  if (!allowed || !allowed.includes(to)) {
    throw new TransitionError('transition_not_allowed', 422);
  }
  // Phase 1A: block S1/S2 from reaching 'verified' via investigating
  if (to === 'verified' && (issue.severity === 'S1' || issue.severity === 'S2')) {
    throw new TransitionError('phase_not_implemented', 422);
  }
  // Role check
  if (!isRolePermittedForTransition(issue.status, to, actor.role)) {
    throw new TransitionError('forbidden', 403);
  }
  // Mandatory fields check
  if (to === 'withdrawn' && !body.reason) {
    throw new ValidationError('withdrawal_reason_required', 422);
  }
  if (to === 'reopened' && !body.reason) {
    throw new ValidationError('reopen_reason_required', 422);
  }
}
```

Any transition outside this map returns HTTP 422 with JSON body:
```json
{ "error": "transition_not_allowed", "from": "<current_status>", "to": "<requested_status>" }
```

---

## 9. Escalation Engine

Implemented in `server/oi-escalation-service.ts` (new file).

### 9.1 Automatic Escalation Triggers (Phase 1A)

Escalations are evaluated:
- On issue creation (for S1 immediate escalation)
- On classification (severity confirmation)
- On scheduler run (SLA breach checks — see Section 13)
- On manual trigger via `POST /api/oi/issues/:id/escalate`

| Trigger | Escalation Type | Recipients | Condition |
|---|---|---|---|
| S1 issue created | `s1_immediate` | GM, Superuser, all Managers | `severity = 'S1'` at creation |
| `safety_criticality = 'critical'` set | `safety_escalation` | GM, Superuser, compliance_owner | On field update |
| `statutory_criticality = 'high'` set | `statutory_escalation` | compliance_owner, GM, Superuser | On field update |
| `consequential_damage_flag = true` set | `financial_escalation` | financial_owner, GM, Superuser | On field update |
| Response SLA breached | `overdue_response` | assigned_to, Manager, escalation_owner | Scheduler check |
| Closure SLA breached | `overdue_closure` | assigned_to, GM, escalation_owner | Scheduler check |

### 9.2 Escalation Record Creation

Every automatic escalation:
1. Inserts a row into `oi_escalations`
2. Calls `createNotification()` for each recipient
3. Writes an `escalated` audit log entry to `oi_audit_log`
4. Sets `notification_sent = true` and `notification_sent_at = NOW()` after notifications are sent

No escalation is silent. Every escalation is traceable via `oi_escalations` and `oi_audit_log`.

---

## 10. Notification Types (Phase 1A)

All notifications use the existing `createNotification()` from `server/notification-routes.ts`.

| Event | Notification Type | Recipients | Message |
|---|---|---|---|
| Issue captured (S1) | `oi_s1_captured` | GM, Superuser, all Managers | "S1 issue OI-YYYY-NNNN captured: {title}" |
| Issue classified | `oi_classified` | assigned_to | "Issue OI-YYYY-NNNN assigned to you for investigation" |
| Investigator assigned | `oi_assigned` | new assignee | "You have been assigned as investigator on OI-YYYY-NNNN" |
| Severity escalated | `oi_severity_escalated` | assigned_to, GM | "Severity of OI-YYYY-NNNN escalated to {severity}" |
| Response SLA breached | `oi_response_overdue` | assigned_to, Manager, escalation_owner | "Response SLA breached on OI-YYYY-NNNN" |
| Closure SLA breached | `oi_closure_overdue` | assigned_to, GM, escalation_owner | "Closure SLA breached on OI-YYYY-NNNN" |
| Issue verified | `oi_verified` | reported_by, GM | "Issue OI-YYYY-NNNN has been verified and is pending closure" |
| Issue closed | `oi_closed` | reported_by, assigned_to | "Issue OI-YYYY-NNNN has been closed" |
| Issue reopened | `oi_reopened` | assigned_to, GM | "Issue OI-YYYY-NNNN has been reopened: {reason}" |
| Safety escalation | `oi_safety_escalation` | GM, Superuser, compliance_owner | "Safety critical issue OI-YYYY-NNNN requires immediate attention" |
| Statutory escalation | `oi_statutory_escalation` | compliance_owner, GM | "Statutory high-risk issue OI-YYYY-NNNN requires compliance attention" |

---

## 11. Scheduler Requirements

**File:** Cron job added to the existing scheduler pattern in the server.

**Phase 1A scheduler tasks:**

| Task | Frequency | Logic |
|---|---|---|
| SLA breach check | Every 1 hour | For all non-closed issues: if `response_due_at < NOW()` and `response_sla_breached = false`, set `response_sla_breached = true`, trigger `overdue_response` escalation, log audit. Same for `closure_due_at` / `closure_sla_breached`. |
| Escalation notification retry | Every 4 hours | For `oi_escalations` where `notification_sent = false` and `triggered_at < NOW() - 30 min`, retry notification |

No SLA recalculation occurs during scheduler runs. Dates are immutable once set. Scheduler only checks and flags.

---

## 12. UI Pages

### 12.1 Page List

| Route | Component File | Description | Access |
|---|---|---|---|
| `/oi` | `client/src/pages/oi/oi-dashboard.tsx` | OI Summary Dashboard | Any authenticated |
| `/oi/issues` | `client/src/pages/oi/oi-issue-register.tsx` | Issue Register (list) | Any authenticated |
| `/oi/issues/new` | `client/src/pages/oi/oi-issue-capture.tsx` | Capture new issue | Any authenticated |
| `/oi/issues/:id` | `client/src/pages/oi/oi-issue-detail.tsx` | Issue Detail + Timeline | Any authenticated (scoped) |
| `/oi/issues/:id/classify` | `client/src/pages/oi/oi-issue-classify.tsx` | Classification form | Manager and above |
| `/oi/config` | `client/src/pages/oi/oi-config.tsx` | Risk weights + matrix config | Superuser |

### 12.2 Navigation Change

**File:** `client/src/App.tsx` and the sidebar/nav component

Add OI module entry to the main sidebar navigation:

```
Operational Intelligence
  ├── Dashboard        (/oi)
  ├── Issue Register   (/oi/issues)
  └── Capture Issue    (/oi/issues/new)
```

OI Config (`/oi/config`) appears under Settings navigation for Superuser only.

All six routes are registered with `ProtectedRoute` wrapping. `/oi/issues/:id/classify` must additionally check Manager+ role server-side (client-side role check is supplementary).

### 12.3 OI Dashboard (`/oi`)

Three panels:

**Panel 1 — Summary Cards (from `GET /api/oi/dashboard/summary`):**
- Total open issues
- Critical (S1) open
- Major (S2) open
- SLA breaches (response + closure combined)
- Issues assigned to me

**Panel 2 — Status Distribution (from `GET /api/oi/dashboard/by-status`):**
- Horizontal bar chart or count tiles by status
- Clickable — filters the Issue Register

**Panel 3 — Risk Heatmap (from `GET /api/oi/dashboard/risk-heatmap`, Manager+ only):**
- 5×5 grid (probability × impact) with issue count per cell
- Color-coded: low=green, medium=amber, high=orange, critical=red

### 12.4 Issue Register (`/oi/issues`)

**Filters (client-side URL params, server applies):**
- Status (multi-select)
- Severity (multi-select)
- Category (multi-select)
- Project Phase (multi-select)
- Assigned To (user picker, Manager+)
- Date range (captured_at)
- SLA breach toggle (show only breached)
- Search (title, issue_number, description — server-side `ILIKE`)

**Columns displayed:**
Issue No. | Title | Category | Phase | Severity | Status | Assigned To | Captured | Response Due | Risk Rating

**Pagination:** 25 per page. Total count returned in `X-Total-Count` header.

**Row colour coding:**
- S1 + open: red left border
- S2 + open: amber left border
- SLA breached: orange background tint
- Closed/Withdrawn: muted text

### 12.5 Issue Capture Form (`/oi/issues/new`)

**Required fields on form:**
- Title (text, max 500)
- Description (textarea)
- Category (dropdown — `oiCategory` values with labels)
- Project Phase (dropdown — `oiProjectPhase` values with labels)
- Severity (radio buttons with definition shown for each)

**Optional fields on form:**
- Project (searchable dropdown from projects table)
- Occurred At (date-time picker)
- Detected At (date-time picker)
- Sub-category (text)

**On submit:**
- Client validates required fields
- POST to `/api/oi/issues`
- On success: redirect to `/oi/issues/:id` (new issue detail)
- On error: show field-level errors returned by server

### 12.6 Issue Detail (`/oi/issues/:id`)

**Layout:** Three-column (header + main + right panel)

**Header:** Issue number, title, severity badge, status badge, category tag, phase tag

**Main — Tabs:**
1. **Overview:** Description, EPC fields, occurrence/detection dates
2. **Classification:** Severity, category, phase, investigator (Manager+ editable)
3. **Risk & Ownership:** All risk fields, all ownership fields (role-gated editing)
4. **Timeline:** `oi_audit_log` entries in reverse chronological order — every status change, field edit, escalation, assignment shown as timeline cards
5. **Escalations:** List of `oi_escalations` records (Manager+)

**Right Panel:**
- Status card (current status, allowed next actions as buttons)
- Ownership summary
- SLA countdown (response_due_at, closure_due_at — IST display, colour coded)
- Risk score display (risk_score / 25, oi_risk_score with band label)

**Status action buttons** (shown only when user has permission for that transition):
- "Classify" → opens classification tab / modal
- "Start Investigation" → POST transition to `investigating`
- "Verify" → POST transition to `verified` (S3/S4 only; disabled + tooltip for S1/S2)
- "Close" → POST transition to `closed` (GM+)
- "Reopen" → POST transition to `reopened` (with reason modal)
- "Withdraw" → POST transition to `withdrawn` (Superuser only, with reason modal)

### 12.7 Classification Form (`/oi/issues/:id/classify`)

Accessible from Issue Detail > Classify button or directly at route.

**Fields:**
- Confirm or change Severity (with change reason mandatory if different from current)
- Confirm or change Category
- Confirm or change Project Phase
- Assign Investigator (user picker — only active users)
- Set Occurred At / Detected At if not already set
- Set risk fields: probability_level, impact_level, all criticality dimensions
- Set ownership: risk_owner, technical_owner, business_owner (Manager minimum)
- Set financial/statutory flags (Senior Manager minimum)

**On submit:**
- PATCH to `/api/oi/issues/:id` for field updates (one by one or batch)
- POST to `/api/oi/issues/:id/transition` with `{ to: 'classified' }` only after field saves succeed
- Both calls must succeed; if transition fails, show error — do not leave issue in inconsistent state

---

## 13. Server-Side Enforcement Summary

The following rules are enforced exclusively at the API layer. UI may show/hide controls as a UX aid only. These rules apply regardless of UI state.

| Rule | Enforcement Point |
|---|---|
| Only authenticated users can access any `/api/oi` route | `ensureAuthenticated` middleware |
| Issue number is generated server-side | `POST /api/oi/issues` handler |
| `reported_by` is always `req.user.id` | `POST /api/oi/issues` handler |
| Client cannot set `status`, `risk_score`, `risk_rating`, `oi_risk_score` on create | Insert schema `.omit()` |
| Transition must exist in `PHASE_1A_TRANSITIONS` map | `oi-transition-service.ts` |
| S1/S2 cannot reach `verified` in Phase 1A | `oi-transition-service.ts` |
| Severity change requires reason | `POST /api/oi/issues/:id/severity` |
| Withdrawal requires reason | `POST /api/oi/issues/:id/withdraw` |
| Reopen requires reason | `POST /api/oi/issues/:id/reopen` / transition handler |
| All mutations write to `oi_audit_log` | Each handler, before response |
| S1 capture triggers `s1_immediate` escalation | `POST /api/oi/issues` handler |
| SLA dates set at classification; never recalculated | `POST /api/oi/issues/:id/transition → classified` |
| Risk score computed server-side on relevant field change | `PATCH /api/oi/issues/:id` handler |
| Escalation always creates `oi_escalations` row + notification | `oi-escalation-service.ts` |
| Audit log has no UPDATE/DELETE routes | Route file — these endpoints simply do not exist |
| Config updates (risk weights, matrix) restricted to Superuser | Role check in handler |

---

## 14. Validation Rules (Zod, Server-Side)

All Zod schemas are in `server/oi-routes.ts` or a dedicated `shared/oi-schemas.ts`.

```typescript
// Create issue
const createIssueSchema = z.object({
  title:          z.string().min(1).max(500),
  description:    z.string().min(1),
  category:       z.enum(['QC','DWG','PROC','MFG','SITE','COMM','LOG','DOC',
                          'SAP','COMP','SAFETY','FIN','LEGAL','HR','CUST','SYS','INT','OTHER']),
  projectPhase:   z.enum(['SALES','ENG','DVS','PROC','MFG','QC','FAT','DISP',
                          'LOG','SITE','ERECT','SAT','COMM','PERF','WARR','AFTS']),
  severity:       z.enum(['S1','S2','S3','S4']),
  projectId:      z.number().int().positive().optional(),
  subCategory:    z.string().max(200).optional(),
  occurredAt:     z.string().datetime().optional(),
  detectedAt:     z.string().datetime().optional(),
  // All other optional fields — typed with enums
});

// Transition
const transitionSchema = z.object({
  to:     z.enum([/* all 15 status values */]),
  reason: z.string().min(1).optional(),
});

// Severity change
const severityChangeSchema = z.object({
  severity: z.enum(['S1','S2','S3','S4']),
  reason:   z.string().min(1),  // mandatory
});

// Assign
const assignSchema = z.object({
  userId: z.number().int().positive(),
});
```

All schemas reject unknown keys (`z.object(...).strict()` or `z.object(...).strip()`).

---

## 15. File Changes

### New Files

| File | Purpose |
|---|---|
| `server/oi-routes.ts` | All OI API route handlers |
| `server/oi-transition-service.ts` | State machine validation + transition execution |
| `server/oi-escalation-service.ts` | Escalation trigger logic + notification dispatch |
| `server/oi-scheduler.ts` | SLA breach check + notification retry cron jobs |
| `server/oi-audit-service.ts` | Single `writeAuditLog()` helper used by all handlers |
| `client/src/pages/oi/oi-dashboard.tsx` | OI Dashboard page |
| `client/src/pages/oi/oi-issue-register.tsx` | Issue Register page |
| `client/src/pages/oi/oi-issue-capture.tsx` | Capture form page |
| `client/src/pages/oi/oi-issue-detail.tsx` | Issue Detail page |
| `client/src/pages/oi/oi-issue-classify.tsx` | Classification form page |
| `client/src/pages/oi/oi-config.tsx` | Risk config page (Superuser) |

### Modified Files

| File | Change |
|---|---|
| `shared/schema.ts` | Add all OI enums and tables (Section 4) |
| `server/routes.ts` | Register `app.use('/api/oi', ensureAuthenticated, oiRouter)` |
| `client/src/App.tsx` | Add 6 OI routes with `ProtectedRoute` |
| Sidebar / nav component | Add OI section to navigation |

### Unchanged Files (must not be touched)

`vite.config.ts`, `drizzle.config.ts`, `package.json`, `server/vite.ts`, all existing route files (no modification to existing handlers).

---

## 16. Rollback Strategy

If Phase 1A must be rolled back after deployment:

**Step 1 — Remove routes:**
Remove `app.use('/api/oi', ...)` from `server/routes.ts`. All OI API calls return 404. No data loss.

**Step 2 — Remove UI routes:**
Remove OI routes from `client/src/App.tsx` and sidebar. Frontend reverts to pre-OI state.

**Step 3 — Drop tables (if required):**
```sql
DROP TABLE IF EXISTS oi_audit_log CASCADE;
DROP TABLE IF EXISTS oi_escalations CASCADE;
DROP TABLE IF EXISTS oi_risk_matrix_config CASCADE;
DROP TABLE IF EXISTS oi_risk_weight_config CASCADE;
DROP TABLE IF EXISTS oi_issues CASCADE;
DROP TYPE IF EXISTS oi_audit_action CASCADE;
DROP TYPE IF EXISTS oi_escalation_type CASCADE;
DROP TYPE IF EXISTS oi_criticality_level CASCADE;
DROP TYPE IF EXISTS oi_risk_rating CASCADE;
DROP TYPE IF EXISTS oi_impact_level CASCADE;
DROP TYPE IF EXISTS oi_probability_level CASCADE;
DROP TYPE IF EXISTS oi_project_phase CASCADE;
DROP TYPE IF EXISTS oi_category CASCADE;
DROP TYPE IF EXISTS oi_severity CASCADE;
DROP TYPE IF EXISTS oi_issue_status CASCADE;
```

**Step 4 — Remove schema additions from `shared/schema.ts`.**

The rollback does not affect any existing table. All OI tables are new and isolated.

---

## 17. UAT Checklist

### 17.1 Issue Capture

- [ ] Any logged-in user can capture an issue via `/oi/issues/new`
- [ ] Required fields enforced: title, description, category, project_phase, severity
- [ ] Issue number auto-generated in `OI-YYYY-NNNN` format; client cannot override it
- [ ] Issue created with status `captured`
- [ ] S1 issue creation triggers `s1_immediate` notification to GM and Superuser
- [ ] Non-S1 capture sends no notification
- [ ] `reported_by` is set to the logged-in user; cannot be overridden by client

### 17.2 Classification

- [ ] Employee cannot access classification — returns 403
- [ ] Manager can classify (set severity, category, phase, assign investigator)
- [ ] Severity change from S3 to S1 requires a reason; missing reason returns 422
- [ ] `classified_at` and `classified_by` set server-side at classification transition
- [ ] `response_due_at` and `closure_due_at` computed and stored at classification; not modifiable after
- [ ] Assigned investigator receives notification
- [ ] Transition `captured → classified` writes audit log entry

### 17.3 Status Transitions

- [ ] `classified → investigating` permitted for Manager+
- [ ] `investigating → verified` permitted for S3/S4 only; returns 422 for S1/S2 with code `phase_not_implemented`
- [ ] `verified → closed` permitted for GM+ only; Employee/Manager/SM returns 403
- [ ] `verified → reopened` requires reason; missing reason returns 422
- [ ] `captured → withdrawn` permitted for Superuser only; other roles return 403
- [ ] Any transition not in the allowed map returns 422 with `transition_not_allowed`
- [ ] Every transition writes a `status_changed` audit log entry

### 17.4 Risk and Ownership Fields

- [ ] `risk_score` recomputed when `probability_level` or `impact_level` changes
- [ ] `risk_rating` derived from risk matrix config
- [ ] `oi_risk_score` computed when criticality fields are updated
- [ ] Employee cannot update ownership fields; returns 403
- [ ] Senior Manager required for financial/statutory fields
- [ ] Every field change writes a `field_updated` audit log entry

### 17.5 Escalation

- [ ] S1 issue creation writes `oi_escalations` row with type `s1_immediate`
- [ ] `safety_criticality = 'critical'` triggers `safety_escalation`
- [ ] Response SLA breach detected by scheduler; `response_sla_breached` set to true; escalation created
- [ ] Escalation always sends notification to target recipients
- [ ] Escalation always writes audit log entry

### 17.6 Audit Log

- [ ] Every create, transition, field edit, assignment, escalation writes to `oi_audit_log`
- [ ] `GET /api/oi/issues/:id/audit` returns all log entries for the issue
- [ ] No POST/PATCH/DELETE route exists for `oi_audit_log`
- [ ] `actor_name` and `actor_role` are denormalised snapshots, not joins

### 17.7 Dashboard

- [ ] `/oi` loads for any authenticated user
- [ ] Summary counts are scoped by role (Employee sees only own issues in count)
- [ ] Risk heatmap not visible to Employee / Senior Executive
- [ ] Status distribution clickable links to register with filter applied

### 17.8 Register

- [ ] Issue register filterable by status, severity, category, phase
- [ ] Pagination works; 25 per page
- [ ] Employee sees only own issues (reported_by or assigned_to)
- [ ] Manager sees department issues
- [ ] GM/Superuser sees all issues
- [ ] Search by title/issue_number works (server-side ILIKE)

---

## 18. Production Smoke Tests

Run immediately after deployment, before announcing go-live:

1. **Auth gate:** `GET /api/oi/issues` without session cookie → must return 401.
2. **Create issue:** POST a minimal valid issue as Employee → must return 201 with `issue_number` = `OI-{current_year}-0001` (or correct sequence).
3. **Forbidden transition:** Employee attempts `POST /api/oi/issues/:id/transition { to: 'classified' }` → must return 403.
4. **Manager classify:** Manager classifies the issue → must return 200; `response_due_at` set; audit log written.
5. **S1 escalation:** Create S1 issue → `oi_escalations` must have 1 row of type `s1_immediate`; notifications exist in `notifications` table.
6. **Invalid transition:** POST `{ to: 'rca_draft' }` → must return 422 with `transition_not_allowed`.
7. **S1 phase block:** S1 issue at `investigating`: POST `{ to: 'verified' }` → must return 422 with `phase_not_implemented`.
8. **Audit log immutability:** Verify no `UPDATE` or `DELETE` route exists for `/api/oi/audit*` endpoints by attempting them — must return 404 or 405.
9. **Risk score:** PATCH `probability_level` and `impact_level` on an issue → `risk_score` and `risk_rating` updated server-side in response.
10. **Dashboard:** `GET /api/oi/dashboard/summary` returns valid JSON with expected keys.
11. **Config gate:** Employee attempts `PUT /api/oi/config/risk-weights` → must return 403.

---

## 19. Zero-Trust Validation Checklist

This checklist confirms that no security, data integrity, or governance rule depends on client-side behaviour.

| Check | Verification Method |
|---|---|
| `issue_number` cannot be set by client | Confirm insert schema omits field; API generates it |
| `status` cannot be set to arbitrary value by client on create | Confirm insert schema omits status; default is `captured` |
| `reported_by` cannot be spoofed by client | Confirm handler ignores body.reportedBy; always uses `req.user.id` |
| Role check is in the handler, not only in frontend guard | Code review: handler reads `req.user.role`; no route relies on frontend-only guard |
| Transition map enforced in `oi-transition-service.ts`, not only in UI button visibility | Code review + smoke test #6 |
| Audit log written before API returns 200 | Code review: `writeAuditLog()` called before `res.json()` in every mutating handler |
| SLA dates immutable after set | Code review: `response_due_at` and `closure_due_at` not in PATCH schema |
| Risk scores computed server-side; not accepted from client | Confirm PATCH schema excludes `risk_score`, `risk_rating`, `oi_risk_score` |
| Withdrawal requires Superuser + reason | Smoke test: non-Superuser attempt returns 403; missing reason returns 422 |
| Audit log has no mutation routes | Run `grep -r 'oi_audit_log' server/` and verify no UPDATE/DELETE SQL exists |
| S1/S2 cannot advance past `investigating` in Phase 1A | Smoke test #7 |
| Config changes restricted to Superuser | Smoke test #11 |
| All timestamps stored as UTC | Verify `timestamp('...')` columns with no timezone suffix in schema; IST display via `fmtDate` |

---

## 20. Open Items for Implementation Review

The following must be confirmed by the implementer before writing any code:

| # | Item | Resolution Required |
|---|---|---|
| 1 | Does the `users` table have a `department` field? | Required for Manager-level issue visibility scope. If absent, implement scope as own issues only until confirmed. |
| 2 | What is the existing scheduler mechanism (cron library, node-cron, pg-boss)? | Needed to wire `oi-scheduler.ts` correctly. |
| 3 | What is the exact signature of `createNotification()` in `server/notification-routes.ts`? | Required for notification dispatch in escalation service. |
| 4 | Does the sidebar nav have a component file to modify, or is it inline in App.tsx? | Required to add OI navigation entry correctly. |
| 5 | Confirm `projects` table name and PK column for FK reference in `oi_issues.project_id`. | Verify FK reference is correct before migration. |

---

**STOP. Do not implement. Awaiting approval.**
