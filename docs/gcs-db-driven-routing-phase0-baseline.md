# GCS DB-Driven Routing — Phase 0 Baseline

**Document status:** APPROVED — AMENDED  
**Version:** 1.1  
**Date:** 2026-05-16  
**Scope:** Infrastructure only — zero routing behavior change  
**Prerequisite for:** Phase 1 (QMS parity gate removal) through Phase 4 (unmanaged modules)

**Amendments in v1.1 (approved additions, no implementation yet):**
- §3.6 — Token-version immutability (explicit write-once contract)
- §3.7 / §5.8 — Dry-run activation mode (simulation before commit)
- §6.5 — Activation freeze protection (in-flight upload guard)
- §8.2, §9.1 updated accordingly

---

## 1. Governing Principle: Strict DB-Only Routing

The entire system operates under one non-negotiable invariant:

> **The only code in the codebase that produces a GCS path string is `issueUploadToken()` in `server/services/gcs-governance-service.ts`. Every other module is a consumer of that function's output.**

No other function, inline string, template literal, or utility may independently construct a GCS object path and pass it to `bucket.file()` for a write operation.

This invariant applies to:
- All upload flows (multipart, buffer, stream)
- All save flows (PDF generation to GCS, export artifacts)
- All file-generation flows (DDS, quotation PDFs, final dossier output)
- All signed URL generation for downloads (validated against stored path — not re-resolved)

This invariant does **not** apply to:
- Read-only signed URL generation from a stored `gcsPath` DB field (downloads of existing files)
- GCS listing / audit / monitoring scans

---

## 2. `issueUploadToken()` as Sole Path Authority

### 2.1 Function contract

`issueUploadToken()` is the sole authority for GCS path resolution. Its contract:

```
Input:
  ruleId               INT        (preferred — avoids extra lookup)
  OR
  moduleKey            TEXT       (alternative resolution by logical key)
  submoduleKey         TEXT|NULL
  documentType         TEXT

  tokenValues          Record<string, string>   (caller-supplied substitution values)
  issuedTo             INT        (userId)
  ttlSeconds           INT        (upload window)
  notes                TEXT|NULL  (audit trail)

Resolution:
  1. Fetch the single gcs_governance_rule_versions row WHERE rule_id = ruleId AND status = 'active'
  2. If none → throw GcsGovernanceError: "No active version. Upload rejected."
  3. Substitute tokenValues into version.pathTemplate → raw GCS path string
  4. Run assertGcsPath() on the resolved path (no double slashes, no illegal chars, correct prefix)
  5. Insert row into gcs_upload_tokens:
       { rule_id, version_id, resolved_path, issued_to, expires_at, status='pending' }
  6. Return { rawToken, resolvedPath, expiresAt, versionId, versionNumber }

Output (to caller):
  resolvedPath         TEXT       — the only GCS path the caller ever uses
  rawToken             TEXT       — passed to validateUploadToken() after upload completes
  versionId            INT        — recorded on entity row for traceability
  versionNumber        SMALLINT   — for human-readable audit log
```

### 2.2 What the caller must do

```
const { resolvedPath, rawToken } = await issueUploadToken({ … });
await bucket.file(resolvedPath).save(buffer, { contentType });
await validateUploadToken({ rawToken, actualPath: resolvedPath });
// Only after validateUploadToken() succeeds → write resolvedPath to entity DB record
```

No caller may derive, modify, or construct any path string before passing it to `bucket.file()`. `resolvedPath` from `issueUploadToken()` is used verbatim.

### 2.3 Failure behavior

If `issueUploadToken()` throws for any reason:
- The upload is rejected with HTTP 503
- No fallback to any hardcoded path
- The error message explicitly states governance resolution failed
- No silent fallback exists anywhere in the call stack

---

## 3. Rule Versioning Design

### 3.1 Model

Each governance rule (`gcs_governance_rules`) has an identity layer (immutable keys) and a version layer (mutable path configuration):

```
gcs_governance_rules                        ← identity layer (keys never change)
  id, moduleKey, submoduleKey, documentType, active, active_version_id

gcs_governance_rule_versions                ← version layer (path configuration)
  id
  rule_id              → FK → gcs_governance_rules.id
  version_number       SMALLINT (1, 2, 3, …  monotonically increasing)
  path_template        TEXT NOT NULL          ← immutable once created
  revision_mode        TEXT NOT NULL          ← immutable once created
  root_prefix          TEXT NOT NULL          ← immutable once created
  display_name         TEXT                   ← mutable (non-routing)
  notes                TEXT                   ← mutable (non-routing)
  status               ENUM see §3.2
  created_by           INT → users.id
  created_at           TIMESTAMP
  approved_by          INT → users.id (nullable)
  approved_at          TIMESTAMP (nullable)
  activated_by         INT → users.id (nullable)
  activated_at         TIMESTAMP (nullable)
  superseded_at        TIMESTAMP (nullable)
  validation_evidence  JSONB        ← Zero-Trust check results + dry-run results (see §5, §5.8)
  diff_from_prev       JSONB        ← computed diff vs previous version
```

### 3.2 Version status state machine

```
              ┌─────────┐
              │  draft  │  ← created by any Superuser via UI
              └────┬────┘
                   │ submit for approval
              ┌────▼─────────────┐
              │ pending_approval │  ← Zero-Trust validation runs here (all 8 checks must pass)
              └────┬─────────────┘
                   │ Superuser approves (MUST be a different user from the creator)
              ┌────▼────────┐
              │  approved   │  ← ready to activate; no routing change yet
              └────┬────────┘
                   │ dry-run activation (§3.7, §5.8)
                   │   → simulates paths against real token samples
                   │   → stores dry-run evidence in validation_evidence
                   │   → no routing change; must PASS before final activation
                   │
                   │ freeze check (§6.5)
                   │   → blocked if any live pending tokens exist for rule
                   │   → blocked if any in-progress uploads for rule
                   │
                   │ Superuser activates (explicit action; requires typing "ACTIVATE")
              ┌────▼───────┐   atomically supersedes   ┌────────────┐
              │   active   │ ─────────────────────────▶ │ superseded │
              └────────────┘                            └────────────┘
                   │ manual retirement (only if zero uploads ever used this version)
              ┌────▼───────┐
              │  retired   │
              └────────────┘
```

**Dry-run and freeze checks are mandatory gates that run between `approved` and the final `activate` commit.** The activation API call accepts a `dryRun: true` parameter to run simulation and freeze check without committing the routing change. The final commit (routing change) is only permitted after a dry-run has been stored in `validation_evidence` and returned `overall_dry_run: "PASS"`.

### 3.3 Immutability rules (version rows)

| Field | Mutable after creation? | Enforcement |
|---|---|---|
| `moduleKey` | Never | Server-enforced (existing) |
| `submoduleKey` | Never | Server-enforced (existing) |
| `documentType` | Never | Server-enforced (existing) |
| `path_template` | Never on an existing version row | A new version must be created |
| `revision_mode` | Never on an existing version row | A new version must be created |
| `root_prefix` | Never on an existing version row | A new version must be created |
| `display_name` | Yes (non-routing metadata) | Direct edit permitted |
| `notes` | Yes (non-routing metadata) | Direct edit permitted |
| `active` flag on rule row | Yes (global kill switch) | Superuser only |

### 3.4 DB constraints enforcing single active version

```sql
CREATE UNIQUE INDEX gcs_rule_versions_one_active
  ON gcs_governance_rule_versions (rule_id)
  WHERE status = 'active';
```

This index makes it impossible for two versions of the same rule to be active simultaneously, even under concurrent activation attempts. One will commit; the other will hit a unique constraint and abort.

### 3.5 `path_schema_version` field

Every version row carries an implicit `path_schema_version` via its `version_number`. In addition, the `gcs_upload_tokens` table records `version_id` on every issued token, which pins each uploaded file to the exact schema version used to generate its path.

This means:
- Any file can be traced back to the exact `path_template` used to generate its GCS path
- Any future audit can reconstruct the path formula for any file from first principles
- `path_schema_version` is surfaced in the governance UI on each token ledger entry

### 3.6 Token-version immutability (write-once contract)

Once `issueUploadToken()` inserts a row into `gcs_upload_tokens`, the following three fields on that row are **permanently immutable** — they may never be updated by any code path, migration, backfill, or admin operation:

| Field | Written at | Why immutable |
|---|---|---|
| `version_id` | Token issuance | Identifies the exact `path_template` used to generate the path |
| `resolved_path` | Token issuance | The GCS object path is already being written at this address |
| (implicit) `path_schema_version` | Derived from `version_id → version_number` | Audit integrity — the schema used to produce the path must be traceable forever |

**This immutability holds unconditionally, including after a version rollback.**

If a version is rolled back (superseded version re-activated), tokens issued while that version was active continue to reference it. Only new tokens issued after the rollback use the restored active version. The token ledger is a permanent, append-only record of which path template generated which file.

Enforcement:
- No `UPDATE gcs_upload_tokens SET version_id = …` or `SET resolved_path = …` statement may exist anywhere in the codebase
- No migration may bulk-update these fields
- The governance audit log records a `WARN` event if any attempt is detected

### 3.7 Dry-run activation mode

Before any routing change takes effect, an activation dry-run must be performed and must pass. The dry-run:

1. **Samples real token data** — queries the last 10 (or all, if fewer) `gcs_upload_tokens` rows for the rule, extracting the `tokenValues` that were used to generate their `resolved_path`
2. **Simulates path generation** — runs those same `tokenValues` through the candidate version's `path_template` to produce simulated resolved paths
3. **Compares simulated vs historical** — verifies the simulated paths are structurally valid (pass `assertGcsPath()`) and checks whether any simulated path would collide with an existing active token's `resolved_path`
4. **Records evidence** — stores all results in `validation_evidence.dry_run` (see §5.8 for structure)
5. **Makes no routing change** — the version status remains `approved`; nothing is written to `gcs_upload_tokens`

The dry-run is exposed as `POST /activate` with `{ dryRun: true }`. The final commit is `POST /activate` with `{ dryRun: false, confirmation: "ACTIVATE" }`, which is only accepted if a dry-run with `overall_dry_run: "PASS"` is already stored in `validation_evidence` for this version.

---

## 4. No Hardcoded Routing Invariant

### 4.1 What this means

No function anywhere in the server codebase may independently construct a GCS object path string and pass it to a write operation. Specifically prohibited in production routing:

- Template literals: `` `TPEL/${cc}/${co}/${cust}/${fy}/${seq}/…` ``
- String concatenation producing GCS paths
- Dedicated builder functions (`buildEpcGcsPath`, `buildDrawingGcsPath`, `generateQmsPath`, `generateVisaGCSPath`, `generateGCSPath`, etc.)
- Legacy utility wrappers (`uploadFileToGCS(buffer, fileName, mimetype)` where `fileName` is caller-constructed)

### 4.2 The complete deletion list (executed in later phases, listed here for reference)

| Function / Pattern | File | Deleted in Phase |
|---|---|---|
| `buildEpcGcsPath()` | `server/epc-coding.ts` | 2A |
| `buildDrawingGcsPath()` | `server/epc-coding.ts` | 2A |
| `buildDdsGcsPath()` | `server/epc-coding.ts` | 2D |
| `buildQuotationGcsPath()` | `server/epc-coding.ts` | 2E |
| `buildEpcQtnGcsPath()` | `server/epc-coding.ts` | 2E |
| `generateQmsPath()` | `server/utils/qms-file-governance.ts` | 1 |
| Parity gate block in `createRevision()` | `server/utils/qms-file-governance.ts` | 1 |
| Inline TPEL path string | `server/utils/inspection-document-upload.ts` | 2F |
| Inline TPEL path string | `server/pppc-routes.ts` | 2F |
| Inline TPEL path string | `server/drawing-verification-routes.ts` | 2G |
| `generateVisaGCSPath()` | `server/visa-management-routes.ts` | 4 |
| `generateGCSPath()` | `server/trip-management-routes.ts` | 4 |
| Inline `QMS/WELDERS/…` path | `server/quality/welder-photo-routes.ts` | 4 |
| `uploadFileToGCS(buffer, fileName)` calls (legal) | `server/legal-management-routes.ts` | 4 |
| `uploadCalibrationCertificate()` utility | legacy calibration utility | 4 |

### 4.3 What Phase 0 does not delete

Phase 0 does not delete or modify any of the above. These deletions happen in Phases 1 through 4, after the routing infrastructure is confirmed stable. Phase 0 only builds the infrastructure that will receive routing once builders are removed.

---

## 5. Zero-Trust Validation (Template-Intrinsic, No Builder Dependency)

Zero-Trust validation runs at the `pending_approval` stage. It validates the `path_template` string itself — no builder function is consulted. All results are stored in `validation_evidence` JSONB on the version row.

### Check 1 — Token completeness

Parse all `{TokenName}` placeholders from `path_template`. Every placeholder must exist in `gcs_governance_token_registry` with `active = true`. If any token is unknown or inactive → FAIL.

### Check 2 — Root prefix conformance

The `path_template` must begin with one of the approved root prefixes:

```
TPEL/{CC}/
QMS/
TPEL/STAGING/
TPEL/SAP/
TPEL/LEGAL/
TPEL/HR/
TPEL/FINANCE/
```

Any other root requires an explicit Superuser override with documented rationale stored in `notes`. Override is recorded in `validation_evidence` as `root_override: true`.

### Check 3 — Synthetic path generation (3 scenarios)

Substitute `example_value` from `gcs_governance_token_registry` for each token. Generate 3 paths:
- (a) `example_values` as-is
- (b) minimum-length values (single char per token)
- (c) values with safe special characters (hyphens, underscores, digits)

All 3 generated paths must:
- Pass `assertGcsPath()` (no double slashes, no illegal characters, starts with declared root prefix)
- Not match any path already stored in `gcs_upload_tokens.resolved_path`
- Not match any path stored in any entity table's GCS path column

### Check 4 — Path uniqueness across active rules

No two active rule versions may produce the same resolved path for the same token values. Run Check 3 synthetic examples against all other active rules' synthetic examples. Assert no match.

### Check 5 — Extension safety

- If `path_template` ends with `.{ext}` → confirm `{ext}` is in the token registry with `source_description` confirming it is derived from file content-type at upload time, not a hardcoded literal.
- If `path_template` ends with a literal extension (`.pdf`) → confirm `notes` documents this as an intentional PDF-generation-only flow.

### Check 6 — Revision mode consistency

- If `path_template` contains `{rev}` → `revision_mode` must not be `'none'`. FAIL on mismatch.
- If `path_template` does not contain `{rev}` → `revision_mode` must be `'none'`. FAIL on mismatch.

### Check 7 — High-impact diff detection

Compute character-level diff between this version's `path_template` and the current active version's `path_template`. Store diff in `diff_from_prev`. If the diff:
- Changes the `root_prefix`, OR
- Removes a security-critical token (`CC`, `CO`, `FY`, `NNN`, `DocNumber`, `rev`)

→ flag as `HIGH_IMPACT: true` in `validation_evidence`. HIGH_IMPACT versions require a second independent Superuser approver before activation.

### Check 8 — Dry-run simulation against real token samples

This check runs at activation time, not at submit time. It is stored in `validation_evidence.dry_run` and is a prerequisite for final activation (see §3.7).

Query the last 10 `gcs_upload_tokens` rows for this rule (ordered by `created_at DESC`, any status). For each sampled token:

1. Extract the `tokenValues` that were originally substituted (reconstructed from `resolved_path` by reverse-parsing against the current active version's `path_template`)
2. Substitute those same `tokenValues` into the candidate version's `path_template` → produces a simulated resolved path
3. Run `assertGcsPath()` on the simulated path
4. Record whether the simulated path collides with the original `resolved_path` (collision = routing change would affect an existing file's expected location)

Result:
- `overall_dry_run: "PASS"` — all sampled tokens produced structurally valid paths and no unexpected collisions detected
- `overall_dry_run: "FAIL"` — any sampled token produced an invalid path, OR the reverse-parse of tokenValues was ambiguous

If the rule has zero historical tokens (new rule), synthetic-only paths from Check 3 are used instead and `sample_source: "synthetic"` is recorded.

Dry-run results are stored in `validation_evidence.dry_run` alongside the 7 static checks. The final activation API call is rejected with HTTP 409 if `overall_dry_run` is absent or not `"PASS"`.

### Validation evidence structure

```jsonc
{
  "ran_at": "2026-05-16T10:30:00Z",
  "ran_by": 42,
  "checks": {
    "token_completeness":    { "passed": true,  "detail": "All 6 tokens found and active" },
    "root_prefix":           { "passed": true,  "root": "TPEL/{CC}/", "override": false },
    "synthetic_paths":       { "passed": true,  "examples": ["TPEL/AS/IN/TPEL/FY26/001/…", …] },
    "path_uniqueness":       { "passed": true,  "conflicts": [] },
    "extension_safety":      { "passed": true,  "mode": "dynamic_from_content_type" },
    "revision_mode":         { "passed": true,  "rev_in_template": true, "revision_mode": "numeric" },
    "high_impact_diff":      { "passed": true,  "high_impact": false, "diff": "…" }
  },
  "overall": "PASS",
  "dry_run": {
    "ran_at": "2026-05-16T11:00:00Z",
    "ran_by": 42,
    "sample_count": 8,
    "sample_source": "real_tokens",
    "results": [
      {
        "original_resolved_path": "TPEL/AS/IN/TPEL/FY25/042/EPC/…",
        "simulated_resolved_path": "TPEL/AS/IN/TPEL/FY25/042/EPC/…",
        "assert_passed": true,
        "path_collision": false
      }
    ],
    "overall_dry_run": "PASS"
  }
}
```

A version cannot advance from `pending_approval` to `approved` unless `overall = "PASS"` or each failing check has an explicit Superuser override recorded. Final activation is additionally blocked unless `dry_run.overall_dry_run = "PASS"`.

---

## 6. Phase 0 Scope (Infrastructure Only)

Phase 0 installs the versioning infrastructure without changing how any upload resolves its GCS path.

### 6.1 DB changes

#### New table: `gcs_governance_rule_versions`

```sql
CREATE TABLE gcs_governance_rule_versions (
  id                   SERIAL PRIMARY KEY,
  rule_id              INTEGER NOT NULL REFERENCES gcs_governance_rules(id),
  version_number       SMALLINT NOT NULL,
  path_template        TEXT NOT NULL,
  revision_mode        VARCHAR(20) NOT NULL DEFAULT 'numeric',
  root_prefix          VARCHAR(50) NOT NULL,
  display_name         TEXT NOT NULL,
  notes                TEXT,
  status               VARCHAR(20) NOT NULL DEFAULT 'draft'
                         CHECK (status IN
                           ('draft','pending_approval','approved','active','superseded','retired')),
  created_by           INTEGER REFERENCES users(id),
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_by          INTEGER REFERENCES users(id),
  approved_at          TIMESTAMP,
  activated_by         INTEGER REFERENCES users(id),
  activated_at         TIMESTAMP,
  superseded_at        TIMESTAMP,
  validation_evidence  JSONB,   -- contains both static checks and dry_run results (§5, §5.8)
  diff_from_prev       JSONB,
  UNIQUE (rule_id, version_number)
);

CREATE UNIQUE INDEX gcs_rule_versions_one_active
  ON gcs_governance_rule_versions (rule_id)
  WHERE status = 'active';
```

#### New table: `gcs_governance_audit_log`

```sql
CREATE TABLE gcs_governance_audit_log (
  id            SERIAL PRIMARY KEY,
  event_type    VARCHAR(60) NOT NULL,
  -- values: version_created | version_submitted | version_approved | version_activated
  --         version_superseded | version_rolled_back | version_retired
  --         upload_token_issued | upload_token_consumed | validation_ran
  --         dry_run_ran | activation_freeze_blocked | token_immutability_violation_attempt
  rule_id       INTEGER REFERENCES gcs_governance_rules(id),
  version_id    INTEGER REFERENCES gcs_governance_rule_versions(id),
  actor_id      INTEGER REFERENCES users(id),
  actor_role    VARCHAR(50),
  event_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  payload       JSONB,
  ip_address    VARCHAR(45)
);
```

#### New table: `gcs_path_migration_log`

Tracks every hardcoded route that must be migrated in later phases:

```sql
CREATE TABLE gcs_path_migration_log (
  id                SERIAL PRIMARY KEY,
  rule_id           INTEGER NOT NULL REFERENCES gcs_governance_rules(id),
  route_file        VARCHAR(200) NOT NULL,
  route_function    VARCHAR(100),
  old_method        VARCHAR(100) NOT NULL,
  migration_phase   VARCHAR(10) NOT NULL,
  migrated_at       TIMESTAMP,
  migrated_by       INTEGER REFERENCES users(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','migrated','verified','exempt'))
);
```

#### Additions to existing tables

```sql
-- gcs_governance_rules: add pointer to active version and deprecation marker
ALTER TABLE gcs_governance_rules
  ADD COLUMN active_version_id    INTEGER REFERENCES gcs_governance_rule_versions(id),
  ADD COLUMN routing_deprecated_at TIMESTAMP;

-- gcs_upload_tokens: add version traceability
-- IMPORTANT: version_id and resolved_path are write-once after insert (§3.6)
ALTER TABLE gcs_upload_tokens
  ADD COLUMN version_id INTEGER REFERENCES gcs_governance_rule_versions(id);
```

### 6.2 Backend changes

#### `server/services/gcs-governance-service.ts` — `issueUploadToken()`

Change the path resolution query from reading `path_template` on the rule row to reading from the active version row:

```typescript
// BEFORE (reads from rule row):
const [rule] = await db
  .select()
  .from(gcsGovernanceRules)
  .where(eq(gcsGovernanceRules.id, params.ruleId));
const template = rule.pathTemplate;

// AFTER (reads from active version row):
const [version] = await db
  .select()
  .from(gcsGovernanceRuleVersions)
  .where(
    and(
      eq(gcsGovernanceRuleVersions.ruleId, resolvedRuleId),
      eq(gcsGovernanceRuleVersions.status, 'active')
    )
  );
if (!version) {
  throw new GcsGovernanceError(
    `No active version for rule ${resolvedRuleId}. Upload rejected.`
  );
}
const template = version.pathTemplate;
// … token substitution, assertGcsPath, insert token with version_id …
```

The `issueUploadToken()` return value gains `versionId` and `versionNumber` fields.

**All existing callers of `issueUploadToken()` continue to work unchanged.** The function signature is backward-compatible because the resolution logic is internal.

#### New file: `server/services/gcs-governance-zero-trust.ts`

Implements the 7-check Zero-Trust validation service (§5, Checks 1–7). Callable from the submit-for-approval API endpoint and independently from a manual admin trigger.

#### New versioning API endpoints (`server/gcs-governance-routes.ts`)

```
POST   /api/gcs-governance/rules/:ruleId/versions
       Create a new draft version.
       Body: { pathTemplate, revisionMode, rootPrefix, displayName, notes }
       Access: Superuser only
       Computes: diffFromPrev, version_number = max(existing) + 1

GET    /api/gcs-governance/rules/:ruleId/versions
       List all versions for a rule, ordered by version_number DESC.
       Returns: id, versionNumber, status, pathTemplate, createdAt, createdByName,
                approvedByName, activatedAt, diffFromPrev (summary)

GET    /api/gcs-governance/rules/:ruleId/versions/:versionId
       Full version detail including validationEvidence (static checks + dry_run).

POST   /api/gcs-governance/rules/:ruleId/versions/:versionId/submit
       Move draft → pending_approval.
       Triggers Zero-Trust validation (Checks 1–7, runs synchronously; returns evidence).
       Access: Superuser only

POST   /api/gcs-governance/rules/:ruleId/versions/:versionId/approve
       Move pending_approval → approved.
       Requires: actor_id ≠ created_by (enforced server-side).
       Requires: validation_evidence.overall = 'PASS' (or all overrides documented).
       Access: Superuser only

POST   /api/gcs-governance/rules/:ruleId/versions/:versionId/activate
       Two modes controlled by request body:

       DRY-RUN mode { dryRun: true }:
         Runs Check 8 (§5.8) — samples real tokens, simulates paths, stores dry_run
         evidence in validation_evidence. Returns dry-run results. No routing change.
         HTTP 200 with { dryRun: true, overall_dry_run: "PASS"|"FAIL", results: […] }

       COMMIT mode { dryRun: false, confirmation: "ACTIVATE" }:
         Blocked if: dry_run result absent or not "PASS" in validation_evidence (→ 409)
         Runs freeze check (§6.5) (→ 409 if blocked)
         Atomically moves approved → active, supersedes current active.
         Writes activation_freeze_checked_at to payload in audit_log.

       Access: Superuser only for both modes.

POST   /api/gcs-governance/rules/:ruleId/versions/:versionId/rollback
       Promote a superseded version back to active.
       Body: { reason: string, confirmation: "ROLLBACK" }
       Runs freeze check (§6.5) before committing (same guard as activation).
       Existing tokens issued under the previous active version retain their
       original version_id and resolved_path unchanged (§3.6).
       Access: Superuser only

POST   /api/gcs-governance/rules/:ruleId/versions/:versionId/retire
       Move draft or approved → retired.
       Blocked if any gcs_upload_tokens.version_id = this versionId.
       Access: Superuser only

POST   /api/gcs-governance/rules/:ruleId/versions/seed-v1
       Admin-only internal endpoint.
       Creates the v1 version row from the rule row's current pathTemplate.
       Sets status = 'active' immediately (bypasses approval — one-time seeding only).
       Writes routing_deprecated_at on the rule row.
       Idempotent — no-op if v1 already exists.
       Access: Superuser only
```

#### Seeding script (Phase 0 task, not a migration file)

A one-time admin call to `POST /api/gcs-governance/rules/:ruleId/versions/seed-v1` for every existing rule. This can be run via a Superuser-triggered UI button or via a controlled admin script. It must be run for all rules before any Phase 1 work begins.

### 6.3 Drizzle ORM schema additions (`shared/schema.ts`)

Add table definitions for `gcsGovernanceRuleVersions`, `gcsGovernanceAuditLog`, `gcsPathMigrationLog` using the Drizzle ORM patterns already in the codebase. Add column additions to `gcsGovernanceRules` and `gcsUploadTokens`.

### 6.4 Frontend changes (`client/src/pages/gcs-doc-governance-page.tsx`)

#### Version history panel (read-only in Phase 0)

Each rule card in `GovernanceRulesTab` gains a collapsible "Version History" section showing:
- Current active version: version number, `path_template` (with syntax highlighting of `{tokens}`), `activated_at`, activated_by username
- Past versions: version number, status badge, `superseded_at`
- "Create new version" button (opens `RuleVersionForm`) — Superuser only

#### `RuleVersionForm` component

A form for creating a new draft version:
- `pathTemplate` — text field (pre-filled from current active version for reference)
- `revisionMode` — dropdown
- `rootPrefix` — dropdown (restricted to approved root list)
- `displayName` — text field
- `notes` — textarea
- Live diff panel — shows character-level diff between new `pathTemplate` and current active version's `pathTemplate`
- Live path preview panel — same `PathPreviewPanel` as used in the rule form, substituting token `example_value` values

#### Version lifecycle action buttons

Available to Superuser only, contextual to version status:
- **Draft**: "Submit for Approval" (runs Zero-Trust validation Checks 1–7, shows all check results inline)
- **Pending Approval**: "Approve" (disabled if current user = creator; shows diff + HIGH_IMPACT warning if applicable)
- **Approved**: Two-step activation:
  1. "Run Dry-Run" — triggers Check 8 dry-run simulation; displays sampled token count, simulated paths, and PASS/FAIL result; stores evidence
  2. "Activate" (enabled only after dry-run PASS) — opens confirmation modal displaying full diff, dry-run summary, freeze check result, and text field requiring `ACTIVATE`
- **Superseded**: "Rollback to this version" — opens confirmation modal with upload count under current active version, upload count under rollback target, freeze check result, text field requiring `ROLLBACK`

#### Builder migration tracker (new tab)

Reads from `gcs_path_migration_log`. Shows:
- Total flows tracked, breakdown by status: pending / migrated / verified / exempt
- Table: rule name | route file | old method | phase | status

### 6.5 Activation freeze protection

The freeze check runs immediately before the routing change is committed in both `/activate` (commit mode) and `/rollback`. It is **not** part of the dry-run.

**Block condition A — Live pending tokens:**

```sql
SELECT COUNT(*)
FROM gcs_upload_tokens
WHERE rule_id = :ruleId
  AND status = 'pending'
  AND expires_at > NOW();
```

If count > 0 → reject with HTTP 409:
```json
{
  "error": "ACTIVATION_FREEZE",
  "reason": "live_pending_tokens",
  "count": 3,
  "token_ids": [1042, 1043, 1044],
  "earliest_expiry": "2026-05-16T11:05:00Z",
  "message": "3 upload token(s) are currently live for this rule. Wait for them to expire or be consumed before activating."
}
```

**Block condition B — In-progress uploads:**

A token is considered in-progress if `status = 'pending'` and `expires_at > NOW()`. This is identical to condition A. There is no separate "in-progress" status — a pending unexpired token is by definition in-progress or at least reserved.

**Freeze check behavior:**

- The check is atomic within the same DB transaction as the activation commit
- The activation proceeds only if the count is zero at the moment of commit
- A `gcs_governance_audit_log` row with `event_type = 'activation_freeze_blocked'` is written on every rejection, including the token IDs and expiry window
- The UI surfaces the freeze result in the activation modal before the user types `ACTIVATE`, with a refresh button to re-check

**Retry guidance:**

The maximum token TTL is the longest `ttlSeconds` ever passed to `issueUploadToken()`. The UI calculates the wait time as `max(expires_at) - NOW()` across all blocking tokens and displays: *"Earliest retry: in N minutes (at HH:MM IST)"*.

**Rollback freeze check:**

The same freeze check applies to rollback. A rollback that would switch routing mid-upload is equally dangerous to a forward activation.

---

## 7. Zero Routing Behavior Change Guarantee

Phase 0 makes the following changes to `issueUploadToken()`:
- It reads `path_template` from `gcs_governance_rule_versions` (active version) instead of from `gcs_governance_rules` directly.
- The v1 seed for each rule is seeded from the rule row's own `path_template` — so the resolved path is byte-for-byte identical before and after.

**Every other upload flow (EPC builders, QMS createRevision parity gate, Finance BRC, PPPC inline path, etc.) is completely untouched in Phase 0.**

The zero-behavior-change guarantee is verified by the following evidence gate (required before Phase 0 is considered complete):

1. All rule v1 seed rows created and confirmed `status = 'active'`
2. The Finance/BRC flow (the only flow currently using `issueUploadToken()` directly) performs a test upload in staging → GCS path must be identical to a path generated by the pre-Phase-0 code
3. All 7 static Zero-Trust checks pass for every seeded v1 version
4. `gcs_upload_tokens.version_id` is populated on all new tokens
5. Version history UI displays correctly for all rules
6. No errors in `gcs_governance_audit_log` for the seeding run

---

## 8. Rollback Strategy

### 8.1 Phase 0 rollback (infrastructure)

Phase 0 only adds new tables and changes the internal resolution path of `issueUploadToken()`. If Phase 0 must be rolled back:

1. Revert `issueUploadToken()` to read from the rule row directly (one-function change)
2. The new tables (`gcs_governance_rule_versions`, `gcs_governance_audit_log`, `gcs_path_migration_log`) can remain — they have no effect if not read
3. The `active_version_id` and `routing_deprecated_at` columns on `gcs_governance_rules` can remain (nullable — no effect if null)
4. The `version_id` column on `gcs_upload_tokens` can remain (nullable — no effect if null)

**No data loss. No file moves. No routing changes to revert.**

### 8.2 Per-version rollback (post-activation, future phases)

For any phase where a new rule version was activated and found problematic:

1. Superuser navigates to the rule's version history in the governance UI
2. Identifies the previous `superseded` version
3. Clicks "Rollback to this version" → freeze check runs first (§6.5) → types `ROLLBACK` in confirmation modal
4. Server atomically:
   - Sets current `active` version → `superseded` (writes `superseded_at = NOW()`)
   - Sets rollback target version → `active` (writes new `activated_at`, `activated_by`)
   - Writes `gcs_governance_audit_log` row with `event_type = 'version_rolled_back'`
5. All upload token requests from that moment forward resolve from the restored version's `path_template`
6. **Token immutability during rollback:** All tokens issued while the now-superseded version was active retain their original `version_id` and `resolved_path` permanently. They are not updated. Files uploaded under those tokens remain at their GCS paths and continue to be served via the stored `resolved_path`. The rollback affects only future token issuance.

**Rollback takes effect immediately on the next upload token request. No deployment required.**

### 8.3 Emergency kill switch

A `governance_routing_enabled` feature flag (stored in a config table or environment variable) can be set to `false` by a Superuser. When `false`, `issueUploadToken()` returns a `503 GCS governance temporarily unavailable` response. No upload proceeds. No fallback path is generated. The application surface-exposes the outage rather than silently routing incorrectly.

---

## 9. Test / Evidence Plan

### 9.1 Phase 0 acceptance criteria (all must be met before Phase 1 begins)

| Test | Expected result |
|---|---|
| v1 seed for every existing rule row | All rules have exactly one `status = 'active'` version row in `gcs_governance_rule_versions` |
| Unique index enforcement | Attempt to insert a second `status = 'active'` row for the same rule → unique constraint violation |
| Finance/BRC staging upload (pre vs post Phase 0) | GCS object path is byte-for-byte identical before and after the `issueUploadToken()` change |
| `gcs_upload_tokens.version_id` populated | All tokens issued after Phase 0 deployment have a non-null `version_id` |
| Zero-Trust validation: all v1 rules | All 7 static checks pass for every seeded v1 rule (evidence stored in `validation_evidence`) |
| Version lifecycle state machine | UI and API correctly enforce: draft → pending_approval → approved → active; wrong-user approve blocked; activate requires dry-run PASS + "ACTIVATE" string |
| Dry-run mode | `POST /activate { dryRun: true }` returns results without changing routing; `validation_evidence.dry_run` populated; commit blocked if `overall_dry_run ≠ "PASS"` |
| Dry-run on zero-history rule | Dry-run with no historical tokens falls back to synthetic samples; `sample_source: "synthetic"` recorded |
| Activation freeze — live tokens | Issue a token (pending, not expired) for a rule; attempt activation → HTTP 409 with `reason: "live_pending_tokens"` and correct token_ids |
| Activation freeze — rollback | Same as above but via rollback endpoint → same 409 behavior |
| Activation freeze — cleared | Token expires or is consumed; retry activation → proceeds without block |
| Token-version immutability | After activation of v2 and rollback to v1: tokens issued under v2 retain `version_id → v2` and original `resolved_path`; new tokens issued under restored v1 use `version_id → v1` |
| No UPDATE on token fields | Grep codebase for `UPDATE gcs_upload_tokens SET version_id` or `SET resolved_path` → zero results |
| Rollback (staging drill) | Activate a test v2, upload a file, rollback to v1; confirm next upload uses v1 path; confirm v2 file still downloadable via stored path |
| Retirement block | Attempt to retire a version that has issued tokens → rejected with explicit error |
| Creator-cannot-approve | Attempt to approve a version as the same user who created it → rejected with explicit error |
| HIGH_IMPACT flag | Create a version that removes `{NNN}` from pathTemplate → `validation_evidence.high_impact = true` |
| Audit log completeness | After full lifecycle (create → submit → approve → dry-run → activate): `gcs_governance_audit_log` contains one row per event type including `dry_run_ran` and activation freeze check result |

### 9.2 Monitoring during Phase 0

- `gcs_governance_audit_log` — watch for any `event_type` values containing `failed` or `rejected` or `freeze_blocked`
- `gcs_upload_tokens` — confirm `version_id` is non-null on all new rows; confirm no `UPDATE` statements alter `version_id` or `resolved_path`
- No new GCS objects appearing at unexpected paths (bucket scan in staging)

### 9.3 Evidence gate for Phase 1 clearance

Phase 1 (QMS parity gate removal) may not begin until:
1. All Phase 0 acceptance criteria above are met and documented
2. Zero-Trust validation passes for all 5 QMS rule v1 versions (WPQR, PMA, TestProcedures, Calibration, WelderCerts)
3. A staging rollback drill has been completed successfully (including token immutability verification)
4. At least one dry-run cycle has been completed end-to-end in staging (dry-run → PASS → commit activation)
5. A Superuser sign-off is recorded in `gcs_governance_audit_log` with `event_type = 'phase0_signed_off'`

---

## 10. Out of Scope for Phase 0

The following are explicitly **not** part of Phase 0:

- Deleting or modifying any hardcoded path builder function
- Removing the parity gate from `createRevision()`
- Migrating any EPC, Design, DVS, HR, Legal, or QMS upload route to use `issueUploadToken()`
- Moving any existing GCS file to a new path
- Changing the Finance/BRC root prefix (that is Phase 3)
- Creating governance rules for currently-unmanaged modules (Legal, HR, Welder Photos — that is Phase 4)

---

## 11. Affected Files Summary

### New files (Phase 0)

| File | Purpose |
|---|---|
| `server/services/gcs-governance-zero-trust.ts` | Zero-Trust validation service (7 static checks) |
| `docs/gcs-db-driven-routing-phase0-baseline.md` | This document |

### Modified files (Phase 0)

| File | Change |
|---|---|
| `shared/schema.ts` | Add `gcsGovernanceRuleVersions`, `gcsGovernanceAuditLog`, `gcsPathMigrationLog` table definitions; add columns to `gcsGovernanceRules` and `gcsUploadTokens` |
| `server/services/gcs-governance-service.ts` | `issueUploadToken()` reads from version table; return type adds `versionId`, `versionNumber` |
| `server/gcs-governance-routes.ts` | Add 8 new versioning endpoints including dry-run mode on activate, freeze check on activate + rollback, seed endpoint |
| `client/src/pages/gcs-doc-governance-page.tsx` | Version history panel, `RuleVersionForm`, lifecycle action buttons (two-step activate with dry-run gate), migration tracker |

### Unchanged files (Phase 0 — modified in later phases)

`server/epc-coding.ts`, `server/utils/qms-file-governance.ts`, `server/utils/inspection-document-upload.ts`, `server/pppc-routes.ts`, `server/drawing-verification-routes.ts`, `server/visa-management-routes.ts`, `server/trip-management-routes.ts`, `server/quality/welder-photo-routes.ts`, `server/legal-management-routes.ts`, all EPC document/drawing/ECR/ECN/dispatch/CO/DDS/quotation route files.

---

*v1.0 submitted for Superuser approval before Phase 0 implementation began.*  
*v1.1 amendments (dry-run activation, freeze protection, token immutability) approved 2026-05-16. Implementation deferred to Phase 0 implementation sprint.*
