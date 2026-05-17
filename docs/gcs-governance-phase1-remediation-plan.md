# GCS Governance — Phase 1 Remediation Plan

**Status**: PLANNING  
**Prepared**: 2026-05-17  
**Triggered by**: Retroactive baseline validation (`docs/retroactive-baseline-validation-evidence.json`)  
**Total findings**: 9 check failures across 9 active v1 rules  
**Grouped defects**: 5 distinct issues (3 finding categories)

---

## Executive Summary

The retroactive baseline validation surfaced three categories of governance defect in the Phase 0 seed data:

| # | Category | Rules affected | Routing change | Path change |
|---|---|---|---|---|
| F-01 | `{ItemCode}` absent from token registry | 4 | No | No |
| F-02 | Internal ephemeral tokens absent from registry | 1 | No | No |
| F-03 | Duplicate path templates (DATASHEET / RFQ_ATTACHMENT) | 2 | Yes (RFQ_ATTACHMENT only) | Yes (RFQ_ATTACHMENT only) |
| F-04 | Duplicate path templates (MATERIAL_CERT / MATERIAL_ID_DOC) | 2 | Yes (MATERIAL_CERT only) | Yes (MATERIAL_CERT only) |
| F-05 | Revision mode inconsistency on RFQ_ATTACHMENT | 1 | No | No |

**Proposed rollout**: Two phases.  
- **Phase 1a** (no routing/path changes): F-01, F-02, F-05 — token registry additions + metadata fix.  
- **Phase 1b** (routing/path changes, full version lifecycle required): F-03, F-04 — template deduplication via new active versions.

---

## Finding F-01 — `{ItemCode}` Not Registered

### Affected Rules

| module_key | document_type | path_template |
|---|---|---|
| design | DESIGN_DRAWING | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}` |
| epc | DDS | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DDS/{DrawingNo}_dds-rev-{rev}.pdf` |
| epc | DRAWING | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}` |
| epc | EPC_DRAWING | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}` |

Failed checks per rule: `token_completeness` (Check 1), `synthetic_paths` (Check 3).

### Root Cause

`{ItemCode}` is a BOM-level tag that identifies the physical equipment item within a project (e.g., `V-101`, `P-201`). It is used as a path segment to organise design and engineering documents by equipment item within the project folder. The token was present in all four templates at seed time but was never inserted into `gcs_governance_token_registry`. The initial registry was seeded with structural tokens (`{CC}`, `{CO}`, `{FY}`, `{NNN}`, `{rev}`, etc.) but omitted BOM-specific contextual tokens.

### Production Risk

**Low — current uploads are unaffected.**  
`issueUploadToken()` resolves `{ItemCode}` from caller-supplied `tokenValues` at runtime. The token registry is used only by Zero-Trust validation (Check 1, Check 3), not by the path resolution function itself. Production uploads work correctly today.

Risk becomes **Medium** if a new version draft is submitted for any of these four rules: Zero-Trust Check 1 will FAIL, blocking the version from advancing to `pending_approval`. No new version can be activated for these rules until the registry is corrected.

### Proposed Correction

Insert one row into `gcs_governance_token_registry`:

```sql
INSERT INTO gcs_governance_token_registry
  (token_name, display_name, description, source_description, example_value, active)
VALUES
  ('ItemCode',
   'Item Code',
   'BOM-level equipment item code within the project (e.g. V-101, P-201, E-301). Segment that organises drawings and technical documents by physical equipment item.',
   'Passed by caller from project BOM / EPC item record at upload time.',
   'V-101',
   true);
```

`exampleValue = 'V-101'` (short, realistic, passes path-segment safety checks in Check 3).

### Backward Compatibility Impact

**None.** The registry is read only during Zero-Trust validation. Path resolution in `issueUploadToken()` does not consult the registry. Existing v1 active versions continue to route identically. No GCS object paths change.

### Routing / Upload Behavior Changes

**No routing change. No upload behavior change.**

### Migration / Testing Requirements

1. Insert the registry row (idempotent if guarded by `ON CONFLICT DO NOTHING`).
2. Re-run retroactive baseline validation with `--force`:
   ```bash
   npx tsx server/scripts/retroactive-baseline-validation.ts --force
   ```
3. Confirm all four affected rules move from `overall: FAIL` to `overall: PASS` in the refreshed evidence.
4. Verify via: `SELECT token_name, active FROM gcs_governance_token_registry WHERE token_name = 'ItemCode'`.

### Zero-Trust Validation Impact

After correction: Check 1 (`token_completeness`) and Check 3 (`synthetic_paths`) will both PASS for all four rules. The 9-FAIL baseline count drops by 8 failures (4 rules × 2 failed checks each).

### Rollout Sequence

**Phase 1a** — no dependencies. Can be executed first, standalone.

---

## Finding F-02 — Internal Ephemeral Tokens Not Registered (`{DrawingControlId}`, `{Timestamp}`)

### Affected Rules

| module_key | document_type | path_template |
|---|---|---|
| internal | SLDDRW_JOB_RESULT | `epc-slddrw/{DrawingControlId}/{Timestamp}-{filename}` |

Failed checks: `token_completeness` (Check 1), `synthetic_paths` (Check 3).

### Root Cause

`{DrawingControlId}` and `{Timestamp}` are internal ephemeral tokens used exclusively by the SolidWorks extraction agent. `DrawingControlId` is the integer primary key of the EPC drawing control record. `Timestamp` is a UTC epoch or ISO-8601 datetime string injected at job-completion time to guarantee GCS object uniqueness across retries. Both tokens are caller-generated internally by the agent job-result upload handler and are never surfaced to end users.

These tokens were absent from the registry because the `internal` module was designed as an agent-only pathway outside the normal document lifecycle, and the registry seeding did not account for agent-specific tokens.

### Production Risk

**Low — current SolidWorks agent uploads are unaffected.**  
The agent result upload path (`server/epc-slddrw-job-routes.ts`) does not use `issueUploadToken()` for its own path resolution — the path is constructed directly within the job-completion handler using the drawing control ID and a timestamp. The governance rule exists for monitoring and auditability, not for active routing.

Risk becomes **Medium** if the `internal/SLDDRW_JOB_RESULT` rule is ever migrated to use `issueUploadToken()` (Phase 1 migration roadmap): Check 1 failure would block that migration.

### Proposed Correction

Insert two rows into `gcs_governance_token_registry`:

```sql
INSERT INTO gcs_governance_token_registry
  (token_name, display_name, description, source_description, example_value, active)
VALUES
  ('DrawingControlId',
   'Drawing Control ID',
   'Integer primary key of the EPC drawing control record. Used as a stable folder identifier for SolidWorks agent result uploads.',
   'Injected by epc-slddrw-job-routes.ts at job completion from drawing_controls.id.',
   '4271',
   true),
  ('Timestamp',
   'Upload Timestamp',
   'UTC timestamp (epoch or ISO-8601 compact) injected at upload time to ensure GCS object uniqueness across retries for the same drawing control.',
   'Generated at job-completion time within the SolidWorks agent upload handler.',
   '20260517T004800Z',
   true);
```

`exampleValue` for `Timestamp` uses a compact ISO-8601 format (`20260517T004800Z`) that is safe as a path segment (no colons, no spaces).

### Backward Compatibility Impact

**None.** Registry-only addition. No path resolution change. Agent uploads continue to use the same path construction logic.

### Routing / Upload Behavior Changes

**No routing change. No upload behavior change.**

### Migration / Testing Requirements

1. Insert the two registry rows.
2. Re-run retroactive baseline validation `--force`.
3. Confirm `internal/SLDDRW_JOB_RESULT` moves to `overall: PASS`.
4. Verify Check 3 synthetic example resolves as: `epc-slddrw/4271/20260517T004800Z-report.pdf` (or similar depending on `{filename}` example value in registry).

### Zero-Trust Validation Impact

After correction: Check 1 and Check 3 PASS for `internal/SLDDRW_JOB_RESULT`. Reduces failure count by 2.

### Rollout Sequence

**Phase 1a** — no dependencies. Can be executed alongside F-01.

---

## Finding F-03 — Duplicate Path Templates: `epc/DATASHEET` vs `epc/RFQ_ATTACHMENT`

### Affected Rules

| module_key | document_type | current path_template |
|---|---|---|
| epc | DATASHEET | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{ListNo}/{Tag}/{Seq}_ds-rev-{rev}.{ext}` |
| epc | RFQ_ATTACHMENT | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{ListNo}/{Tag}/{Seq}_ds-rev-{rev}.{ext}` |

Failed check per rule: `path_uniqueness` (Check 4) — mutual conflict. Zero-Trust synthetic examples for both rules resolve to the same path.

### Root Cause

During seeding, `RFQ_ATTACHMENT` was assigned the same template as `DATASHEET` because both document types represent vendor/supplier datasheets placed in the procurement folder. The intent was shared folder co-location: project datasheets and RFQ-attached vendor datasheets both live in `PROCUREMENT/DATASHEETS/`. However, two distinct governance rules with the same template violate Check 4 (path uniqueness across active rules) and create a genuine production collision risk if callers for both rules happen to use the same `{Tag}` and `{Seq}` values in a given project.

**Functional distinction:**
- `DATASHEET` — vendor datasheet requested as part of procurement package control (PPPC). Caller is the PPPC buy-list upload flow. Associated with a specific PPPC line item.
- `RFQ_ATTACHMENT` — vendor datasheet attached to an RFQ email dispatch. Caller is the RFQ dispatch flow. May arrive before a PPPC line item is formalised.

### Production Risk

**Medium.** In practice, `{Tag}` values used by the PPPC flow (e.g., `V-101`) may differ from those used by the RFQ flow (e.g., `VENDOR-DS`) in many cases. However, there is no structural enforcement preventing a collision — if both callers pass identical tokenValues, the paths are identical and one would overwrite the other in GCS (GCS does not protect against overwrites). This is a real data-integrity risk in a concurrent system.

### Proposed Correction

**Differentiate the `epc/RFQ_ATTACHMENT` template in a new v2.**

Proposed v2 template for `RFQ_ATTACHMENT`:
```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/RFQ/{ListNo}/{Tag}/{Seq}_rfq-ds-rev-{rev}.{ext}
```

Changes from v1:
- `DATASHEETS/` → `RFQ/` (folder renamed to make RFQ attachments a distinct location)
- filename prefix `ds-` → `rfq-ds-` (file-level discriminator)

`DATASHEET` v1 remains unchanged and active.

**Alternative if business requires co-location in the same folder:**  
Add a document-type prefix to the filename only:
```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{ListNo}/{Tag}/rfq-{Seq}_ds-rev-{rev}.{ext}
```
This keeps both in the same GCS folder but makes filenames distinct. However, the recommended approach is full folder separation for clearer auditability.

### Backward Compatibility Impact

- **Existing RFQ attachment uploads** (GCS objects already written under the v1 path) are **unaffected** — they remain at their existing paths permanently. GCS objects are never moved or deleted.
- **Future RFQ attachment uploads** (post-v2 activation) will land in the new `RFQ/` path structure.
- **DATASHEET** uploads are **completely unaffected** — no change to their rule.
- Callers of `issueUploadToken({ ruleId: RFQ_ATTACHMENT_RULE_ID, … })` will receive a `resolvedPath` in the new format after v2 activation. If callers store `resolvedPath` in their own DB records (as they should), those records will reflect the new path for new uploads and the old path for pre-migration uploads. This is expected and correct.

### Routing / Upload Behavior Changes

**Yes — for `epc/RFQ_ATTACHMENT` only.**  
- Future uploads route to `TPEL/…/PROCUREMENT/RFQ/…` instead of `TPEL/…/PROCUREMENT/DATASHEETS/…`.
- `epc/DATASHEET` routing is unchanged.

### Migration / Testing Requirements

1. Identify all call sites for `epc/RFQ_ATTACHMENT` rule in the codebase:
   - `server/plc-rfq-routes.ts` (primary suspect — RFQ dispatch flow)
   - `server/gcs-governance-routes.ts` (governance API — passes ruleId externally)
2. Confirm no call site relies on the resolved path being under `PROCUREMENT/DATASHEETS/`.
3. Create `RFQ_ATTACHMENT` v2 via the version lifecycle:
   - Draft with new template
   - Submit → Zero-Trust validation must PASS (Check 4 now clear since templates differ)
   - Approve → dry-run → activate
4. After activation, issue a test token for `RFQ_ATTACHMENT` and confirm `resolvedPath` contains `PROCUREMENT/RFQ/`.
5. Issue a test token for `DATASHEET` and confirm `resolvedPath` still contains `PROCUREMENT/DATASHEETS/` (no regression).
6. Confirm Check 4 passes for both rules in a re-run of Zero-Trust validation on both active versions.

### Zero-Trust Validation Impact

After `RFQ_ATTACHMENT` v2 activation: Check 4 passes for both rules. Reduces FAIL count by 2 (one failure per rule, reciprocal conflict).

### Rollout Sequence

**Phase 1b** — requires a full version lifecycle (draft → submit → approve → dry-run → activate). Must be planned with advance notice to RFQ flow callers. Can proceed in parallel with F-04. No dependency on F-01/F-02 beyond desirability of a clean token registry first.

---

## Finding F-04 — Duplicate Path Templates: `qms/MATERIAL_CERT` vs `qms/MATERIAL_ID_DOC`

### Affected Rules

| module_key | document_type | current path_template |
|---|---|---|
| qms | MATERIAL_CERT | `QMS/Material_Identification/{ProjectCode}/{Seq}/{filename}` |
| qms | MATERIAL_ID_DOC | `QMS/Material_Identification/{ProjectCode}/{Seq}/{filename}` |

Failed check per rule: `path_uniqueness` (Check 4) — mutual conflict.

### Root Cause

Both document types relate to material traceability within the QMS. During seeding, they were co-located in the same `Material_Identification/` folder because both belong to the same QMS workflow. However, assigning identical templates to two distinct governance rules means there is no structural path separator — only the `{filename}` segment provides any de-facto distinction. If callers for both rules use the same `{ProjectCode}`, `{Seq}`, and `{filename}`, a GCS path collision occurs.

**Functional distinction:**
- `MATERIAL_CERT` — third-party material test certificate (e.g., mill certificate, heat certificate). An external document supplied by the material vendor.
- `MATERIAL_ID_DOC` — internal material identification record created by the QMS team, referencing the certificate. A THERMOPAC-generated document.

These two document types naturally belong together in storage (same project, same material lot) but should be in distinct sub-locations to prevent collision and make folder browsing unambiguous.

### Production Risk

**Medium.** The `{filename}` token is the only de-facto discriminator. If a mill certificate is stored as `material-cert.pdf` and an identification document is also stored as `material-cert.pdf` (or any identical filename), one would silently overwrite the other. The QMS team uses predictable filename conventions which may or may not prevent this in practice. No enforcement exists at the GCS layer.

### Proposed Correction

**Differentiate the `qms/MATERIAL_CERT` template in a new v2.**

`MATERIAL_ID_DOC` is the more foundational document (it is created by THERMOPAC staff and references the certificate). `MATERIAL_CERT` is the third-party document. Proposed v2 template for `MATERIAL_CERT`:

```
QMS/Material_Identification/{ProjectCode}/{Seq}/certificates/{filename}
```

Changes from v1:
- Adds `/certificates/` subfolder as a discriminator segment.

`MATERIAL_ID_DOC` v1 remains unchanged and active at `QMS/Material_Identification/{ProjectCode}/{Seq}/{filename}`.

### Backward Compatibility Impact

- **Existing MATERIAL_CERT GCS objects** remain at their v1 paths permanently — no movement.
- **Future MATERIAL_CERT uploads** land in the new `/certificates/` subfolder.
- **MATERIAL_ID_DOC** is completely unaffected.
- QMS callers uploading material certificates will receive paths under `/certificates/` after v2 activation.

### Routing / Upload Behavior Changes

**Yes — for `qms/MATERIAL_CERT` only.**  
- Future certificate uploads route to `QMS/Material_Identification/{ProjectCode}/{Seq}/certificates/` instead of the flat `QMS/Material_Identification/{ProjectCode}/{Seq}/`.
- `MATERIAL_ID_DOC` routing unchanged.

### Migration / Testing Requirements

1. Identify all call sites for `qms/MATERIAL_CERT` rule:
   - QMS calibration or inspection routes that upload third-party certificates.
   - `server/utils/qms-file-governance.ts` if `createRevision()` is used with a `MATERIAL_CERT` ruleId.
2. Confirm no UI or API consumer hard-codes the resolved path.
3. Create `MATERIAL_CERT` v2 via version lifecycle with new template.
4. Full lifecycle: draft → submit (Zero-Trust must PASS, especially Check 4) → approve → dry-run → activate.
5. After activation, confirm test token for `MATERIAL_CERT` resolves to `/certificates/` suffix.
6. Confirm test token for `MATERIAL_ID_DOC` is unchanged.
7. Re-run Zero-Trust on both versions — Check 4 must PASS for both.

### Zero-Trust Validation Impact

After `MATERIAL_CERT` v2 activation: Check 4 passes for both rules. Reduces FAIL count by 2.

### Rollout Sequence

**Phase 1b** — full version lifecycle required. Can proceed in parallel with F-03. No dependency on F-01/F-02, though completing the token registry first (F-01/F-02) ensures the Zero-Trust run during `submit` produces a clean PASS report.

---

## Finding F-05 — Revision Mode Inconsistency: `epc/RFQ_ATTACHMENT`

### Affected Rule

| module_key | document_type | path_template | current revisionMode |
|---|---|---|---|
| epc | RFQ_ATTACHMENT | `TPEL/…/{ListNo}/{Tag}/{Seq}_ds-rev-{rev}.{ext}` | `none` |

Failed check: `revision_mode` (Check 6).  
Detail: `{rev}` is present in the template but `revisionMode = 'none'`. Zero-Trust Check 6 requires `revisionMode ∈ {minor, major}` when `{rev}` appears in the template.

### Root Cause

During seeding, `revisionMode` was set to `'none'` for `epc/RFQ_ATTACHMENT`, likely because RFQ datasheets were considered non-revisioned documents. However, the template itself contains `{rev}` because the path pattern was copied from the DATASHEET template (see F-03), which does carry revisions. The `revisionMode` metadata was not updated to match.

### Production Risk

**Low.** `revisionMode` is a metadata field on the rule — it does not affect `issueUploadToken()` path resolution or any upload routing. Callers must supply `{rev}` in `tokenValues` regardless of this field. The only impact is that Zero-Trust Check 6 fails, which blocks future version submissions for this rule until corrected.

Additionally, the `revisionMode = 'none'` setting misrepresents the true behavior of this document type: if the template contains `{rev}`, revisions are in fact being tracked in the path, even if the business intent is that they are not formally versioned.

### Proposed Correction

Two options:

**Option A (recommended) — align `revisionMode` with the template:**  
Set `revisionMode = 'minor'` on the `epc/RFQ_ATTACHMENT` rule row. This can be done as a direct DB update (does not require a new version):

```sql
UPDATE gcs_governance_rules
SET revision_mode = 'minor', updated_at = NOW()
WHERE module_key = 'epc' AND document_type = 'RFQ_ATTACHMENT';
```

Then update the v1 version row to match:
```sql
UPDATE gcs_governance_rule_versions
SET revision_mode = 'minor'
WHERE rule_id = (SELECT id FROM gcs_governance_rules WHERE module_key='epc' AND document_type='RFQ_ATTACHMENT')
  AND version_number = 1;
```

**Option B — remove `{rev}` from the template:**  
If RFQ datasheets are genuinely non-revisioned, create a v2 with `{rev}` removed from the path and `revisionMode = 'none'`. This is the higher-effort option and should only be chosen if the business confirms RFQ attachments are never revised. Template becomes: `TPEL/…/{ListNo}/{Tag}/{Seq}_ds.{ext}`.

**Recommended: Option A.** Simpler, no routing change, consistent with the actual path format in use.

**Note:** This finding also interacts with F-03. If a new v2 for `RFQ_ATTACHMENT` is created to resolve F-03, the `revisionMode` should be set to `'minor'` in that v2 rather than as a separate DB patch.

### Backward Compatibility Impact

**None** for Option A. `revisionMode` is metadata only. No path change, no routing change, no upload behavior change.

### Routing / Upload Behavior Changes

**No routing change. No upload behavior change** for Option A.

### Migration / Testing Requirements

For Option A:
1. Execute the two SQL UPDATE statements above.
2. Re-run `--force` retroactive baseline validation to refresh evidence.
3. Confirm `epc/RFQ_ATTACHMENT` Check 6 now shows `passed: true`.
4. Confirm no other checks regressed.

For Option B: full version lifecycle (F-03 and F-05 can be addressed together in a single `RFQ_ATTACHMENT` v2).

### Zero-Trust Validation Impact

After correction: Check 6 (`revision_mode_consistency`) passes for `epc/RFQ_ATTACHMENT`. Reduces FAIL count by 1.

### Rollout Sequence

**Phase 1a** if using Option A (direct metadata fix, no version lifecycle).  
**Phase 1b** if bundled with F-03 (combined into a single `RFQ_ATTACHMENT` v2 that resolves both the template duplication and the revision mode in one version lifecycle).  
**Recommended: bundle with F-03 Phase 1b** to avoid creating two separate lifecycle events for the same rule.

---

## Rollout Sequence

### Phase 1a — Token Registry and Metadata Fixes

**Scope:** F-01, F-02, F-05 (Option A).  
**Routing change:** None.  
**Path change:** None.  
**Lifecycle events:** None (direct registry/metadata inserts and a rule-level UPDATE).  
**Expected outcome:** Retroactive baseline FAIL count drops from 9 → 5 (the 4 path_uniqueness failures for F-03/F-04 remain).

| Step | Action | What changes |
|---|---|---|
| 1a-1 | Add `{ItemCode}` to `gcs_governance_token_registry` | Registry row only |
| 1a-2 | Add `{DrawingControlId}` to `gcs_governance_token_registry` | Registry row only |
| 1a-3 | Add `{Timestamp}` to `gcs_governance_token_registry` | Registry row only |
| 1a-4 | Set `epc/RFQ_ATTACHMENT.revisionMode = 'minor'` on rule and v1 version rows | Metadata only (if not bundled with Phase 1b) |
| 1a-5 | Re-run retroactive baseline with `--force` | Updates `validation_evidence` on all 38 active v1 rows |
| 1a-6 | Verify: 5 FAIL → PASS, 4 path_uniqueness FAILs remain | Live DB query |

### Phase 1b — Template Deduplication (Version Lifecycle)

**Scope:** F-03 (RFQ_ATTACHMENT v2), F-04 (MATERIAL_CERT v2).  
**Routing change:** Yes — RFQ_ATTACHMENT and MATERIAL_CERT.  
**Path change:** Yes — future uploads for those two rules.  
**Lifecycle events:** Two full version workflows (draft → submit → approve → dry-run → activate).  
**Expected outcome:** All 9 original FAILs resolved. All 38 active rules have PASS evidence.

| Step | Rule | Action |
|---|---|---|
| 1b-1 | epc/RFQ_ATTACHMENT | Create v2 draft with path `TPEL/…/PROCUREMENT/RFQ/{ListNo}/{Tag}/{Seq}_rfq-ds-rev-{rev}.{ext}` and `revisionMode='minor'` |
| 1b-2 | epc/RFQ_ATTACHMENT | Submit v2 → Zero-Trust validation must PASS all 7 checks |
| 1b-3 | epc/RFQ_ATTACHMENT | Approve v2 |
| 1b-4 | epc/RFQ_ATTACHMENT | Run dry-run → verify PASS |
| 1b-5 | epc/RFQ_ATTACHMENT | Activate v2 (with freeze check + ACTIVATE confirmation) |
| 1b-6 | qms/MATERIAL_CERT | Create v2 draft with path `QMS/Material_Identification/{ProjectCode}/{Seq}/certificates/{filename}` |
| 1b-7 | qms/MATERIAL_CERT | Submit v2 → Zero-Trust validation must PASS |
| 1b-8 | qms/MATERIAL_CERT | Approve v2 |
| 1b-9 | qms/MATERIAL_CERT | Run dry-run → verify PASS |
| 1b-10 | qms/MATERIAL_CERT | Activate v2 |
| 1b-11 | All 38 | Re-run retroactive baseline with `--force` | Refreshes evidence on all active versions (v1 and v2) |
| 1b-12 | All | Verify: 0 FAIL, 38 PASS | Live DB query |

---

## Zero-Trust Check Impact Summary

| Check | Affected findings | Status after Phase 1a | Status after Phase 1b |
|---|---|---|---|
| 1 — token_completeness | F-01 (×4 rules), F-02 (×1 rule) | All PASS | All PASS |
| 2 — root_prefix | None | Unchanged | Unchanged |
| 3 — synthetic_paths | F-01 (×4 rules), F-02 (×1 rule) | All PASS | All PASS |
| 4 — path_uniqueness | F-03 (×2 rules), F-04 (×2 rules) | 4 still FAIL | All PASS |
| 5 — extension_safety | None | Unchanged | Unchanged |
| 6 — revision_mode | F-05 (×1 rule) | PASS (if Option A applied) | PASS |
| 7 — high_impact_diff | None | Unchanged | PASS on v2 diffs |

---

## Constraints and Non-Negotiables

These constraints apply to every remediation step:

1. **Token immutability** — no UPDATE on `gcs_upload_tokens.version_id`, `resolved_path`, or `token_values` under any circumstances.
2. **v1 status preserved** — no `status` change on any active v1 version row. All v1 rows remain `active` until superseded by an explicit activation of v2.
3. **No silent fallback** — if `issueUploadToken()` is called for a rule with no active version (e.g., between v1 supersession and v2 activation), it throws explicitly. Activation must be atomic and the freeze check must pass before the routing swap.
4. **Freeze check required** — both `RFQ_ATTACHMENT` and `MATERIAL_CERT` activations must pass `checkActivationFreeze()` before the version swap.
5. **Dry-run required** — both Phase 1b activations require a dry-run PASS stored in `validationEvidence.dry_run` before the commit path is unblocked.
6. **Retroactive baseline re-run** — after each phase completes, `retroactive-baseline-validation.ts --force` is re-run and the refreshed evidence is submitted.

---

## Open Questions for Approval

1. **F-03 path choice**: Is `PROCUREMENT/RFQ/` the correct folder name for the differentiated RFQ_ATTACHMENT path, or should it be `PROCUREMENT/RFQ-ATTACHMENTS/` or another name? Decision affects all future RFQ attachment GCS paths permanently.

2. **F-04 path choice**: Is `/certificates/` the correct subfolder name for MATERIAL_CERT, or should it be `/mill-certs/`, `/vendor-certs/`, or another name? Decision affects all future material certificate GCS paths permanently.

3. **F-05 bundling**: Confirm whether F-05 should be fixed as a Phase 1a standalone DB patch or bundled into the Phase 1b `RFQ_ATTACHMENT` v2 lifecycle event.

4. **Retroactive evidence re-run**: Confirm that re-running `--force` after Phase 1a (and again after Phase 1b) is acceptable for the audit trail — each `--force` run overwrites the `validation_evidence` on all 38 rows with fresh check results and a new `ranAt` timestamp.

---

*Document status: PLANNING. No implementation until approved.*  
*Approver actions: answer open questions, confirm path choices, approve Phase 1a and Phase 1b separately or together.*
