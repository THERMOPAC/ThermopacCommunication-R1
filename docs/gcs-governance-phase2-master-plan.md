# GCS Governance — Phase 2 Migration Master Plan

**Status**: PLANNING BASELINE — approved for reference; implementation not yet started  
**Prerequisite**: Phase 0 + Phase 1 complete (current-state baseline: `docs/gcs-governance-current-state-baseline.md`)  
**Scope**: Migration of all 34 active canonical rules to DB-driven token-gated upload routing  
**Implementation directive**: Do not begin until explicit per-rule authorisation  
**End state**: No hardcoded GCS path routing anywhere in the upload stack

---

## 1. Migration Philosophy

Phase 2 is a routing migration, not a storage migration. Files do not move. Governance is enforced at upload time on new objects going forward. Existing GCS objects in place before a rule's migration cutover are unaffected and continue to be served as-is.

**Core principles:**

1. **Additive, never destructive.** The token gate is inserted alongside existing code before the existing code path is removed. No upload can break during migration.

2. **One rule at a time.** Each rule is its own migration unit with its own evidence package, observation window, and sign-off. Batch migrations are prohibited.

3. **Evidence-first.** A migration does not proceed to cutover until all required pre-migration evidence is assembled. Evidence is not retroactive — it must be captured as part of the migration execution.

4. **Path template is the authority.** Once a rule is DB-driven, the GCS path for any new upload is derived exclusively from the active version's `path_template`. No hardcoded fallback is permitted.

5. **No path changes during migration.** The only permissible change during a rule's migration is the switch from hardcoded path construction to token-derived path construction. The resulting GCS paths must be byte-for-byte identical to what the old code would have produced (verified by parity test). If a path correction is required (e.g. D-01 BRC root migration), it is executed as a separate governance version bump in a separate deployment, never bundled with the token gate insertion.

6. **DB version changes and code changes are independent.** A new governance rule version (path template change) is never deployed in the same release as the token gate wiring. These are two separate operations with separate evidence packages.

7. **Reversibility before cutover.** Until the old path builder call is removed, the migration is reversible by reverting a single function call. After the builder call is removed, rollback requires a code revert.

8. **Freeze windows block all migrations.** No migration proceeds when a governance activation freeze is active.

---

## 2. Migration Sequencing Strategy

Migrations proceed in four waves, determined by current routing category, risk level, and cross-rule dependencies. No wave starts until all migrations in the preceding wave are in observation or complete.

**Wave 0 — Confirm live (1 rule)**  
`finance/BRC_DOCUMENT` is already wired for DB-driven routing. Confirm it is issuing tokens in production. Resolve any issues before Wave 1 begins. This is not a new migration — it is a confirmation gate.

**Wave 1 — Parity-gated → DB-driven (5 rules)**  
EPC builder-backed flows. Parity is already confirmed. Migration is a contained refactor: replace builder call with `issueUploadToken()` + `validateUploadToken()`. Lowest code change surface.

**Wave 2 — QMS caller update (11 rules)**  
QMS file governance utility already calls `issueUploadToken()` when `ruleId` is supplied. Migration is updating each QMS route caller to look up and supply `ruleId`. No new wiring pattern to introduce — the pattern exists.

**Wave 3 — EPC unmanaged → DB-driven (5 rules)**  
EPC flows with no existing governance integration. Full wiring required. Medium risk: EPC paths are well-understood and structured; token values are available from DB entities.

**Wave 4 — Support modules → DB-driven (11 rules)**  
HR, Legal, Sales, SAP, Design, DVS, Internal. Higher diversity of path structures and upload mechanisms. Some require special handling (agent-driven, external system integration). Each scoped individually.

**Legacy exempt**  
`legacy/LEGACY_FILE` is read-only. No migration planned.

---

## 3. Onboarding Criteria

A rule is ready to enter the migration queue when all of the following are true:

| # | criterion | verification method |
|---|---|---|
| OB-1 | Active canonical rule confirmed `status='active'` in DB | DB query: `SELECT status FROM gcs_governance_rule_versions WHERE rule_id = :id AND status = 'active'` |
| OB-2 | Rule passes all 7 Zero-Trust checks | Retroactive validation evidence `overall='PASS'`; re-run `--force` if evidence is stale |
| OB-3 | Path template is final — no pending version bump is planned before migration | Engineering review — confirm no deferred path template corrections (see D-01 through D-06) are scheduled to precede the migration |
| OB-4 | All tokens in the path template are resolvable at upload time | Token resolution analysis: confirm each `{token}` in the template can be derived from data available in the upload request handler (DB entity, request body, or session) |
| OB-5 | Upload route file is identified and reviewed | Code audit: single identified route handler file per rule; no ambiguous callers |
| OB-6 | Upload completion handler is identified (signed URL callback or direct upload confirm endpoint) | Code audit: `validateUploadToken()` insertion point confirmed |
| OB-7 | No other in-flight migration is in its observation window | Migration queue check |
| OB-8 | No activation freeze is active | `GET /api/gcs-governance/freeze-status` |

Rules that have a pending path template correction (deferred items D-01 through D-06) must have that correction completed, validated, and observed in production **before** their token gate migration begins.

---

## 4. Migration Safety Rules

The following are non-negotiable constraints on every migration, regardless of risk classification:

**SR-1 — No removal before confirmation.**  
The existing hardcoded path builder call or path string must remain in the codebase until the token-derived path has been confirmed to produce identical paths in production (parity confirmed via production tokens). The builder call is removed only in a follow-up deployment after the observation window closes cleanly.

**SR-2 — No bundled changes.**  
A migration PR contains only: the `issueUploadToken()` call insertion, the `validateUploadToken()` call insertion, and the `logUploadEvent()` call insertion. No unrelated refactors, feature additions, or path template changes in the same PR.

**SR-3 — No migration during freeze.**  
`checkActivationFreeze()` returns active → migration is blocked. No exceptions.

**SR-4 — No simultaneous rule migrations.**  
Only one rule migration may be active at a time. A rule is considered active from the moment its PR is merged until its 48-hour (minimum) observation window closes cleanly.

**SR-5 — Token values sourced from DB.**  
All token substitution values (e.g. `{CC}`, `{CO}`, `{Cust}`, `{FY}`, `{NNN}`) must be sourced from authoritative DB entities, never derived from user-supplied input strings or request body fields that bypass validation.

**SR-6 — Signed URL generation blocked without a valid token.**  
Once migrated, no signed URL for the upload target path may be generated unless `issueUploadToken()` returns a valid `rawToken`. Error on token issuance failure — do not fall back to unvalidated path construction.

**SR-7 — validateUploadToken() is not optional.**  
Upload completion without a `validateUploadToken()` call is a governance violation. If the upload completion flow does not currently call back to the server (e.g. client-side GCS direct upload), the upload completion endpoint must be added before migration.

**SR-8 — DB path template is the exclusive source.**  
After a rule is DB-driven, no hardcoded path string for that rule may remain in any upload handler. Comments, fallback strings, and legacy builder imports for the upload path must be removed.

**SR-9 — Each migration has its own deployment.**  
Token gate insertion and builder removal are separate deployments. Never merge both in the same release.

---

## 5. Rollback Policy

### Rollback Scenarios

**Scenario A — Pre-cutover rollback** (builder call still present): Revert the single PR that inserted the token gate call. The builder path resumes. Zero data impact — no files were uploaded via the token gate yet, or any that were remain at the same path.

**Scenario B — Post-cutover rollback** (builder call removed): A code revert to the previous release is required. Any tokens issued after cutover and before rollback remain in `gcs_upload_tokens` as `used` records (immutable). Files uploaded via those tokens remain at the correct governance-derived paths and are not affected by the rollback.

**Scenario C — Path template error detected post-migration**: Do NOT rollback the route. The token gate is correct — the error is in the template. Activate a version freeze immediately. Create a corrected v2 template. Submit → approve → dry-run → activate the v2 version. The v1 version is superseded. Files uploaded under v1 remain at v1 paths and are served from stored GCS paths in DB — they are not affected by the v2 activation.

### What Cannot Be Rolled Back

- Governance version activations (v1 → superseded is permanent; no reactivation)
- `gcs_upload_tokens` rows (immutable once written)
- `gcs_governance_audit_log` entries (append-only)
- Files uploaded to GCS under a valid governance token (these are correctly placed; no rollback needed)

### Rollback Decision Authority

A post-cutover rollback (Scenario B) requires sign-off from the engineering lead. The rollback decision must be recorded in the `gcs_governance_audit_log` with reason and actor.

---

## 6. Zero-Trust Requirements Before Cutover

For a rule to proceed to cutover, the following Zero-Trust gates must all be satisfied:

| gate | requirement | evidence required |
|---|---|---|
| ZT-1 | All 7 Zero-Trust checks PASS on the active v1 version | `validation_evidence->>'overall' = 'PASS'` in DB; `--force` rerun if >7 days since last run |
| ZT-2 | Dry-run activation PASS on the active version | `validation_evidence->>'dry_run'->>'overall' = 'PASS'` recorded on the version row |
| ZT-3 | Synthetic paths from dry-run match paths produced by the existing builder (parity test) | At least 5 synthetic path examples generated; each matches the corresponding builder output character-for-character |
| ZT-4 | `{rev}` / `revision_mode` consistency verified | Check 6 PASS on current version; confirms revision mode is correct before tokens carry `rev` values |
| ZT-5 | No path uniqueness conflict with any other active rule | Check 4 PASS; synthetic paths do not overlap any peer rule's namespace |
| ZT-6 | All token values resolvable at upload time | Token resolution map documented in the rule's migration evidence package (see Section 9) |
| ZT-7 | No freeze active at cutover time | `GET /api/gcs-governance/freeze-status` returns no active freeze at moment of deployment |

---

## 7. Upload / Download Parity Requirements

### Upload Parity

Before removing the old path builder from the upload route, the following parity test must pass:

1. Run 5+ real upload operations through the migrated route in a staging or production environment
2. For each upload, record:
   - the path produced by the old builder (logged pre-migration from the same inputs)
   - the path produced by `issueUploadToken()` (recorded in `gcs_upload_tokens.resolved_path`)
3. The two paths must be **byte-for-byte identical** for all 5+ test cases
4. Any mismatch is a blocker — the migration does not proceed until the discrepancy is resolved

If the rule has never had a real upload (0 existing GCS objects), use the dry-run synthetic paths as a proxy and increase test cases to 10+.

### Download Parity

Download (signed URL generation for existing files) must not be affected by migration. Download routes read the `gcs_path` stored in the DB record (or `gcs_upload_tokens.used_for_path`) — they do not call the governance service. Migration of the upload route has zero impact on download routes. Verify this explicitly by:

1. Confirming no download route calls `issueUploadToken()` or any governance service function
2. Confirming all existing GCS paths in DB records remain valid (files still at those paths in GCS)
3. Running a download of an existing file before and after the migration to confirm no regression

### Revision Display Parity

Revision history UI must display the same path metadata before and after migration. Confirm that the revision metadata table (`project_documents`, `qms_document_revisions`, or equivalent) records the `gcs_path` value from `gcs_upload_tokens.resolved_path` identically to how it was previously recorded from the builder output.

---

## 8. Token Issuance Requirements

Every DB-driven upload route must implement the following token lifecycle exactly:

```
1. Resolve rule_id from DB
   SELECT id FROM gcs_governance_rules
   WHERE module_key = :module AND document_type = :type AND active = true
   LIMIT 1

2. Assemble tokenValues map
   { token: value } for every {token} in the path_template
   All values sourced from DB entities or validated application context
   No raw user input

3. issueUploadToken(ruleId, tokenValues, actorId)
   → rawToken  (UUID, single-use)
   → resolvedPath  (the GCS path — use this as the upload target)
   → expiresAt  (max 15 minutes from issue for signed URL flows)

4. Generate signed GCS upload URL for resolvedPath
   (or pass resolvedPath to direct upload handler)

5. Return { signedUrl OR resolvedPath, rawToken, expiresAt } to client

6. Client performs upload to GCS

7. Upload completion endpoint receives rawToken
   validateUploadToken(rawToken, uploadedPath)
   → confirms uploadedPath matches resolvedPath
   → sets used_at on the token row

8. logUploadEvent(ruleId, versionId, actorId, resolvedPath, metadata)
   → writes to gcs_governance_audit_log

9. Continue with DB record creation (project_documents, qms_document_revisions, etc.)
   using resolvedPath as the gcs_path value to store
```

### Additional constraints

- Tokens expire. A token that has not been used within `expiresAt` is rejected by `validateUploadToken()` and cannot be consumed
- Tokens are single-use. A used token (non-null `used_at`) is rejected by `validateUploadToken()` regardless of path match
- Token values are frozen at issue time. The resolved path is immutable from the moment the token is created
- `ruleId` resolution must fail hard if no active version exists — do not fall back to any other path generation method
- Token issuance failure must surface as an HTTP 500 or 503 to the client — never silently ignored

---

## 9. Required Evidence for Each Migration

Each rule's migration must produce a complete evidence package before cutover is authorised.

### Pre-Migration Evidence Package

| item | description |
|---|---|
| E-PRE-1 | Zero-Trust PASS report: `validation_evidence` JSON for the active version, showing `overall='PASS'` and per-check results |
| E-PRE-2 | Dry-run PASS report: dry-run simulation output showing synthetic paths, diff from predecessor, and `overall='PASS'` |
| E-PRE-3 | Token resolution map: for every `{token}` in the path_template, document the exact source (DB table, column, function) used to resolve it at upload time |
| E-PRE-4 | Route audit: the specific route file(s) and line numbers where `issueUploadToken()` will be inserted (upload path) and where `validateUploadToken()` will be inserted (completion path) |
| E-PRE-5 | Parity samples: for Tier 1 (parity-gated) and Tier 2 (QMS caller), 5+ example paths showing builder output vs. governance template synthetic output — byte-for-byte match confirmed |
| E-PRE-6 | Download route confirmation: written statement that no download route for this rule uses governance service calls; existing files will not be affected |
| E-PRE-7 | Deferred item check: written confirmation that no deferred path template correction (D-01 through D-10) applies to this rule, or that the applicable deferred item has been fully resolved and observed |

### Post-Migration Evidence Package (collected during observation window)

| item | description |
|---|---|
| E-POST-1 | Token issuance count: at least 1 production `gcs_upload_tokens` row with `version_id` of the migrated rule's active version, `used_at IS NOT NULL` |
| E-POST-2 | Audit log entries: at least 1 `gcs_governance_audit_log` row from `logUploadEvent()` for this rule, with correct `module_key` and `document_type` |
| E-POST-3 | Path correctness sample: resolved paths from E-POST-1 tokens match the template structure (no unresolved `{token}` placeholders, correct root prefix, correct extension) |
| E-POST-4 | Zero validation failures: `gcs_upload_tokens` contains no rows where `version_id` = this rule's version and `used_at IS NULL` AND `expires_at < NOW()` (no expired-unused tokens from production uploads) |
| E-POST-5 | Download smoke test: confirmed that existing file downloads for this document type continue to work using stored `gcs_path` values |
| E-POST-6 | Error log clear: zero application error log entries attributable to the governance token gate for this rule during the observation window |
| E-POST-7 | Builder removal PR ready: confirms the old path builder call has been identified for removal in the follow-on PR |

---

## 10. Production Observation Requirements

### Minimum Observation Window

**48 hours** from first production upload token issued and validated for the migrated rule. No subsequent rule migration begins until this window closes cleanly.

### Active Monitoring During Window

| signal | monitor target | alert threshold |
|---|---|---|
| `gcs_upload_tokens` | `expires_at < NOW() AND used_at IS NULL` for this rule's version_id | Any count > 0 → immediate investigation (tokens issued but upload never completed) |
| `gcs_upload_tokens` | error / rejection events (application log pattern `validateUploadToken.*FAIL`) | Any occurrence → pause next migration, investigate |
| `gcs_governance_audit_log` | `logUploadEvent` entries for this module/type | Confirm entries appear for each production upload |
| Application error logs | HTTP 500/503 in upload endpoints for this module | Any occurrence → investigate before window close |
| GCS bucket | No unexpected file locations (files appear under the correct root prefix and path structure) | Manual spot-check on 3+ production uploads |

### Window Close Criteria

All of the following must be true at window close:

- E-POST-1 through E-POST-6 evidence assembled (at least 1 production upload observed)
- Zero alert thresholds breached during the 48-hour window
- Engineering review sign-off recorded

If the rule receives zero production uploads during the 48-hour window (e.g. infrequently used document type), the window is extended until at least 1 production token is issued and validated, or a staging simulation is accepted as a proxy with explicit engineering sign-off.

---

## 11. Migration Risk Classification

### Low-Risk

Conditions: token gate wiring exists or is minimal; path structure is simple and well-understood; parity confirmed; no external system dependencies; path template change is not bundled.

| rule | module | document_type | risk rationale |
|---|---|---|---|
| LR-1 | finance | BRC_DOCUMENT | Already wired; issueUploadToken() in production code; wave 0 confirmation only |
| LR-2 | qms | CALIBRATION_CERT | createRevision() wired; caller update only; simple QMS path |
| LR-3 | qms | WPQR | createRevision() wired; caller update only |
| LR-4 | qms | PMA | createRevision() wired; caller update only |
| LR-5 | qms | WPS_PQR | createRevision() wired; caller update only |
| LR-6 | qms | TEST_PROCEDURE | createRevision() wired; caller update only |
| LR-7 | qms | WELDER_CERT | createRevision() wired; caller update only |
| LR-8 | qms | WELDER_PHOTO | createRevision() wired; simple no-rev path |
| LR-9 | epc | EPC_DRAWING | Parity confirmed; buildDrawingGcsPath() well-tested; two callers (consolidation to single issueUploadToken() call) |
| LR-10 | epc | DDS | Parity confirmed; buildDdsGcsPath() server-side only (PDF generation); controlled caller |
| LR-11 | epc | EPC_DOCUMENT | Parity confirmed; buildEpcGcsPath() well-understood |
| LR-12 | epc | QUOTATION | Parity confirmed; buildQuotationGcsPath() |
| LR-13 | epc | EPC_QUOTATION | Parity confirmed; buildEpcQtnGcsPath() |

### Medium-Risk

Conditions: full wiring required but path structure is straightforward and token values are reliably available from DB entities; no external system dependency; moderate upload volume.

| rule | module | document_type | risk rationale |
|---|---|---|---|
| MR-1 | qms | INSPECTION_DOC | createRevision() wired; caller update; complex TabName token requires validation |
| MR-2 | qms | FINAL_DOSSIER | createRevision() wired; caller update; auto-generated PDF flow (less obvious completion callback) |
| MR-3 | qms | MATERIAL_ID_DOC | createRevision() wired; caller update |
| MR-4 | qms | NCR | createRevision() wired; caller update; NcrNumber token resolution to verify |
| MR-5 | epc | DATASHEET | Full wiring; well-structured PPPC path; Token values from buy-list entities (ListNo, Tag, Seq reliable) |
| MR-6 | epc | CO_DOCUMENT | Full wiring; project-scoped path; moderate complexity |
| MR-7 | epc | ECR | Full wiring; project-scoped path; document-number-based |
| MR-8 | epc | ECN | Full wiring; project-scoped path; document-number-based |
| MR-9 | epc | DISPATCH | Full wiring; project-scoped path |
| MR-10 | legal | LEGAL_DOCUMENT | Full wiring; simple admin path; low upload volume |
| MR-11 | sales | OFFER_TEMPLATE | Full wiring; TemplateSlug token derivation to verify; minor existing path alignment correction (D-05) must precede |
| MR-12 | sap | SAP_ATTACHMENT | Full wiring; VendorCode and CompanyFY from SAP sync; DocType token resolution to verify |

### High-Risk

Conditions: external system integration dependency; agent-driven or asynchronous upload mechanism; legacy path migration required before or alongside token gate; complex token resolution; high production volume making errors visible.

| rule | module | document_type | risk rationale |
|---|---|---|---|
| HR-1 | internal | SLDDRW_JOB_RESULT | Windows SolidWorks agent constructs and uploads the file directly; token must be pre-issued to the agent via job payload before upload; requires agent protocol change |
| HR-2 | dvs | DVS_STAGING | Staging bucket; used by drawing verification pipeline; path feeds downstream verification steps that must be re-verified post-migration |
| HR-3 | design | BASIC_DRAWING | Existing files at legacy `Design_Management/` paths; path alignment correction (D-04) must precede; manual verification of existing file continuity required |
| HR-4 | design | DESIGN_BACKUP | Existing files at legacy paths; D-04 correction must precede; backup restoration flows depend on path stability |
| HR-5 | design | TRANSMITTAL | Legacy path alignment; multiple upload points in design transmittal workflow |
| HR-6 | design | DESIGN_STANDARD | Non-project-scoped path; upload volume low but paths feed company-wide template access |
| HR-7 | hr | TRIP_DOCUMENT | HR module; EmployeeName and Destination tokens require sanitised slug derivation from free-text fields; CompanyFY computation must be consistent |
| HR-8 | hr | VISA_DOCUMENT | HR module; same slug derivation concern; Category token enumeration to verify |

---

## 12. Recommended Migration Order — All 34 Active Rules

The following sequence is the recommended execution order. Each row identifies the rule, wave, risk class, and the primary dependency that must be satisfied before it begins.

| order | wave | risk | module | document_type | rule_id | dependency |
|---|---|---|---|---|---|---|
| 1 | 0 | Low | finance | BRC_DOCUMENT | 27 | Confirm wave 0 (production token issuance); no code change needed |
| 2 | 1 | Low | epc | DDS | 3 | OB-1→8 clear; dry-run PASS; DDS is server-side only (simplest EPC parity caller) |
| 3 | 1 | Low | epc | EPC_DOCUMENT | 1 | OB-1→8 clear; dry-run PASS; single route caller |
| 4 | 1 | Low | epc | QUOTATION | 8 | OB-1→8 clear; dry-run PASS |
| 5 | 1 | Low | epc | EPC_QUOTATION | 32 | OB-1→8 clear; dry-run PASS |
| 6 | 1 | Low | epc | EPC_DRAWING | 34 | OB-1→8 clear; dry-run PASS; two callers consolidated to one issueUploadToken() call |
| 7 | 2 | Low | qms | CALIBRATION_CERT | 12 | Wave 1 observation closed; QMS first — simple numeric path |
| 8 | 2 | Low | qms | WPQR | 10 | QMS sequential; alphabetic revision mode |
| 9 | 2 | Low | qms | PMA | 11 | QMS sequential |
| 10 | 2 | Low | qms | WPS_PQR | 19 | QMS sequential |
| 11 | 2 | Low | qms | TEST_PROCEDURE | 18 | QMS sequential |
| 12 | 2 | Low | qms | WELDER_CERT | 15 | QMS sequential |
| 13 | 2 | Low | qms | WELDER_PHOTO | 16 | QMS sequential; no-rev path |
| 14 | 2 | Medium | qms | INSPECTION_DOC | 13 | After simpler QMS types confirmed; TabName token validation complete |
| 15 | 2 | Medium | qms | FINAL_DOSSIER | 14 | PDF auto-generation flow mapped; completion callback confirmed |
| 16 | 2 | Medium | qms | MATERIAL_ID_DOC | 37 | QMS final |
| 17 | 2 | Medium | qms | NCR | 38 | NcrNumber token resolution confirmed; QMS complete |
| 18 | 3 | Medium | epc | DATASHEET | 7 | Wave 2 observation closed; PPPC token values (ListNo, Tag, Seq) from buy-list DB |
| 19 | 3 | Medium | epc | CO_DOCUMENT | 4 | After DATASHEET confirmed |
| 20 | 3 | Medium | epc | ECR | 5 | EPC sequential |
| 21 | 3 | Medium | epc | ECN | 35 | EPC sequential |
| 22 | 3 | Medium | epc | DISPATCH | 6 | EPC sequential |
| 23 | 4 | Medium | legal | LEGAL_DOCUMENT | 26 | Wave 3 observation closed; standalone admin upload |
| 24 | 4 | Medium | sales | OFFER_TEMPLATE | 28 | D-05 path alignment resolved + observed before this migration |
| 25 | 4 | Medium | sap | SAP_ATTACHMENT | 29 | SAP VendorCode and DocType token resolution tested |
| 26 | 4 | High | hr | TRIP_DOCUMENT | 24 | EmployeeName + Destination slug derivation validated |
| 27 | 4 | High | hr | VISA_DOCUMENT | 25 | HR wave; Category enumeration confirmed |
| 28 | 4 | High | design | DESIGN_STANDARD | 33 | D-04 path alignment resolved + observed; company-wide templates; non-project path |
| 29 | 4 | High | design | TRANSMITTAL | 22 | D-04 correction confirmed; upload points mapped |
| 30 | 4 | High | design | BASIC_DRAWING | 21 | D-04 correction confirmed; existing files continuity verified |
| 31 | 4 | High | design | DESIGN_BACKUP | 23 | D-04 correction confirmed; restoration flows tested |
| 32 | 4 | High | dvs | DVS_STAGING | 9 | Downstream verification pipeline impact analysis complete |
| 33 | 4 | High | internal | SLDDRW_JOB_RESULT | 31 | Agent protocol updated to accept pre-issued token in job payload |
| — | exempt | — | legacy | LEGACY_FILE | 30 | Read-only; no migration |

---

## 13. Criteria for Moving Between States

### Unmanaged → Parity-Gated

A rule's upload route advances from unmanaged to parity-gated when:

| criterion | detail |
|---|---|
| P1 | The upload path construction logic is extracted from inline string interpolation into a named, testable builder function in a dedicated coding module (e.g. `epc-coding.ts` or module equivalent) |
| P2 | The builder function output is verified against the governance template: for 5+ representative inputs, the builder produces a path that matches the resolved governance template character-for-character |
| P3 | The builder function is the exclusive source of the GCS path for upload — no other path construction occurs in the route handler |
| P4 | The governance rule passes all 7 Zero-Trust checks (OB-2) |
| P5 | The governance template's synthetic path matches the builder output for the same input set (dry-run comparison) |
| P6 | The parity confirmation is documented in the rule's evidence package |

Parity-gated is an intermediate state only. It is not a valid long-term resting state. Parity-gated rules must proceed to DB-driven as soon as the wave schedule permits.

### Parity-Gated → DB-Driven

A rule's upload route advances from parity-gated to DB-driven when all of the following are complete:

| criterion | detail |
|---|---|
| D1 | All unmanaged → parity-gated criteria (P1–P6) are satisfied |
| D2 | All onboarding criteria (OB-1–OB-8) are satisfied |
| D3 | All Zero-Trust gates (ZT-1–ZT-7) are satisfied |
| D4 | Full pre-migration evidence package (E-PRE-1 through E-PRE-7) is assembled |
| D5 | Upload parity test passes (Section 7): 5+ examples, byte-for-byte match |
| D6 | `issueUploadToken()` is inserted in the upload initiation handler |
| D7 | `validateUploadToken()` is inserted in the upload completion handler |
| D8 | `logUploadEvent()` is inserted after successful validation |
| D9 | Token values map is implemented: every `{token}` in the template is resolved from DB or application context at upload time |
| D10 | Migration deployed to production |
| D11 | Post-migration observation window (48h minimum) completes cleanly (E-POST-1 through E-POST-6 satisfied) |
| D12 | Builder call removed in follow-on PR (separate deployment) |
| D13 | Post-builder-removal smoke test confirms uploads continue using token-derived paths |

After D13, the rule is fully DB-driven. The builder function may remain in code for other uses (e.g. path display, breadcrumb rendering) but must not be called in any upload path.

### Unmanaged → DB-Driven (direct, skipping parity-gated)

Permitted for rules that have never had a hardcoded builder function and whose path structure is simple enough that parity testing against a builder is not applicable. Criteria:

- All DB-driven criteria (D1–D13) apply, with P1–P6 replaced by: document the path construction logic and verify 5+ synthetic paths against the governance template
- This path is appropriate for Tier 3 rules where writing a new builder function would be purely transitional scaffolding with no value

---

## 14. End State: No-Hardcoded-Routing Definition

The Phase 2 migration is complete when all of the following are true:

### Code-Level End State

1. **Zero calls to any hardcoded path-builder function in any upload route handler.** Specifically:
   - `buildDrawingGcsPath()` — not called in any upload handler
   - `buildDdsGcsPath()` — not called in any upload handler
   - `buildEpcGcsPath()` — not called in any upload handler
   - `buildQuotationGcsPath()` — not called in any upload handler
   - `buildEpcQtnGcsPath()` — not called in any upload handler
   - Any module-level path string construction — not present in any upload route handler

2. **Zero hardcoded GCS path strings in upload route handlers.** No upload handler contains a string literal that constructs a GCS path (e.g. `` `TPEL/${cc}/${co}/…` ``). Token resolution exclusively via `issueUploadToken()`.

3. **Every upload route calls `issueUploadToken()` before generating a signed URL or initiating a GCS write.** No exceptions.

4. **Every upload completion calls `validateUploadToken()`.** No exceptions.

5. **Every validated upload calls `logUploadEvent()`.** Every successful upload is observable in `gcs_governance_audit_log`.

### DB-Level End State

6. **All 34 active canonical rules have at least 1 production `gcs_upload_tokens` row** with `used_at IS NOT NULL` (demonstrating the token gate was exercised in production).

7. **`gcs_governance_audit_log` contains at least 1 `logUploadEvent` entry for each of the 34 active canonical rules.**

8. **Zero active governance rules have a corresponding hardcoded upload path in the codebase.** A rule is not DB-governed until its upload route has been migrated. Any rule with `status='active'` that still has a hardcoded upload path is an open finding.

### Operational End State

9. **A path template change on any active rule does not require a code change.** Changing a GCS path layout requires only: submit new version → approve → dry-run → activate. No route file modification needed.

10. **A new document type can be onboarded by:** creating a rule row + seeding a v1 version → running Zero-Trust checks → activating → wiring a route to `issueUploadToken(ruleId, tokens)`. No path string engineering required.

11. **Path governance violations are detectable.** Any file upload that reaches GCS without a corresponding `gcs_upload_tokens` row is a governance violation and is detectable via periodic reconciliation (files in GCS bucket vs. `gcs_upload_tokens.used_for_path`).

### Explicitly Not Required at End State

- Migration of existing GCS objects (files stored before a rule's migration cutover remain at their original paths — they are not moved)
- 100% upload token coverage of historical files (retroactive tokenisation of past uploads is not planned)
- Enforcement on read operations (signed URL generation for downloads does not require a governance token)

---

## Appendix A — Deferred Item Resolution Dependency Map

Certain deferred items (from the current-state baseline D-01 through D-10) must be resolved **before** the token gate migration for the affected rule. This table shows which migrations are blocked by which deferred items.

| deferred item | description | blocks migration of |
|---|---|---|
| D-01 | BRC_DOCUMENT root migration `Accounts/` → `TPEL/FINANCE/BRC/` | finance/BRC_DOCUMENT token gate wiring must wait until after path correction is observed |
| D-04 | Design module existing file path correction | design/BASIC_DRAWING, DESIGN_BACKUP, TRANSMITTAL, DESIGN_STANDARD |
| D-05 | OFFER_TEMPLATE path alignment `TPEL/Templates/Offers/` → `TPEL/SALES/TEMPLATES/` | sales/OFFER_TEMPLATE |
| D-06 | SAP_ATTACHMENT path correction | sap/SAP_ATTACHMENT |
| D-07 | Seeder guard (`active: false` respected) | Prevents incorrect rule reactivation on re-seed; must be merged before any re-seed event |

Items D-02, D-03 (QMS root migrations) are structural path changes that affect large numbers of existing files. These are independent of the token gate migration and should be planned as separate operations. The token gate migration for QMS can proceed on the current paths; the root migration is handled via a separate governance version bump after migration.

---

## Appendix B — Token Resolution Map Template

For each rule migration, the pre-migration evidence package must include a completed token resolution map in this format:

```
Rule: {module}/{document_type}  (rule_id={N})
Path template: {template}

Token resolution:
  {CC}         → project.continentCode     (table: projects, column: continent_code)
  {CO}         → project.customerOrderNo   (table: projects, column: co_number)
  {Cust}       → project.customerCode      (table: projects, column: customer_code)
  {FY}         → project.financialYear     (table: projects, column: financial_year)
  {NNN}        → project.sequenceNo        (table: projects, column: sequence_no)
  {ItemCode}   → bom_item.item_code        (table: bom_items, column: item_code)
  {DrawingNo}  → drawing.drawing_number    (table: epc_drawing_control, column: drawing_number)
  {rev}        → derived from current active revision + revision_mode
  {ext}        → file extension from upload MIME type (validated whitelist)
  {filename}   → sanitised original filename (slug-safe)
```

All token sources must be authoritative DB columns, never user-supplied strings. Free-text fields (e.g. EmployeeName, Destination) must be slug-sanitised before use as token values.

---

*Document prepared: 2026-05-17*  
*Baseline status: approved for planning reference*  
*Implementation: pending explicit per-rule authorisation*
