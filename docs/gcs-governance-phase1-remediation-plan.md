# GCS Governance — Phase 1 Remediation Plan

**Status**: PLANNING — Phase 1a COMPLETE, Phase 1b pending approval  
**Prepared**: 2026-05-17  
**Amended**: 2026-05-17 (F-06 added; Phase 1b approach revised following codebase audit)  
**Triggered by**: Retroactive baseline validation (`docs/retroactive-baseline-validation-evidence.json`)  
**Total findings**: 9 check failures across 9 active v1 rules (original); 7 remaining after Phase 1a  
**Grouped defects**: 6 distinct issues (F-01 through F-06)

---

## Executive Summary

The retroactive baseline validation surfaced three categories of governance defect in the Phase 0 seed data. A subsequent codebase audit conducted for F-06 produced findings that fundamentally revise the Phase 1b remediation approach for F-03, F-04, F-05, and F-06.

| # | Category | Rules affected | Status |
|---|---|---|---|
| F-01 | `{ItemCode}` absent from token registry | 4 | **RESOLVED** (Phase 1a) |
| F-02 | Internal ephemeral tokens absent from registry | 1 | **RESOLVED** (Phase 1a) |
| F-03 | Duplicate path templates (DATASHEET / RFQ_ATTACHMENT) | 2 | Revised — see §F-06 Audit Amendment |
| F-04 | Duplicate path templates (MATERIAL_CERT / MATERIAL_ID_DOC) | 2 | Revised — see §F-06 Audit Amendment |
| F-05 | Revision mode inconsistency on RFQ_ATTACHMENT | 1 | Resolves automatically via F-03 revised approach |
| F-06 | 3-way template conflict (DESIGN_DRAWING / DRAWING / EPC_DRAWING) | 3 | Phase 1b — DB state correction |

**Original Phase 1b approach (F-03, F-04):** Create new v2 versions with differentiated path templates.

**Revised Phase 1b approach (F-03, F-04, F-05, F-06 combined):** The codebase audit reveals that 4 of the 7 remaining FAIL rules are marked `active: false` in the governance service seed data — meaning they were **incorrectly activated during the initial DB seed**. The correct remediation is retirement of those 4 rules, not new version creation. After retirement all remaining conflicts resolve automatically with no path or routing changes.

---

## RESOLVED: Finding F-01 — `{ItemCode}` Not Registered

**Resolved in Phase 1a.** Registry row `id=1992` inserted 2026-05-17.

- Affected rules: `design/DESIGN_DRAWING`, `epc/DDS`, `epc/DRAWING`, `epc/EPC_DRAWING`
- Failed checks cleared: `token_completeness` (Check 1), `synthetic_paths` (Check 3)
- Post-Phase-1a: `epc/DDS` moved to PASS. The three drawing rules had token checks cleared but exposed new `path_uniqueness` failures (see F-06).

---

## RESOLVED: Finding F-02 — Internal Ephemeral Tokens Not Registered

**Resolved in Phase 1a.** Registry rows `id=1993` (`DrawingControlId`), `id=1994` (`Timestamp`) inserted 2026-05-17.

- Affected rule: `internal/SLDDRW_JOB_RESULT`
- Failed checks cleared: `token_completeness` (Check 1), `synthetic_paths` (Check 3)
- Post-Phase-1a: `internal/SLDDRW_JOB_RESULT` moved to PASS.

---

## Finding F-03 — Duplicate Path Templates: `epc/DATASHEET` vs `epc/RFQ_ATTACHMENT`

### Original Finding

Both rules share the template `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{ListNo}/{Tag}/{Seq}_ds-rev-{rev}.{ext}`. Zero-Trust Check 4 flags a mutual conflict.

### Audit Amendment — Approach Revised

The codebase audit conducted for F-06 reveals the following in `server/services/gcs-governance-service.ts` (line 210):

```
{ moduleKey: 'epc', documentType: 'RFQ_ATTACHMENT',
  active: false,
  notes: 'REFERENCE-ONLY TYPE — no new GCS objects created. rfq-email-service.ts
          freezeAttachments() copies gcs_path verbatim from
          buy_list_line_selections.datasheet_gcs_object_path (a DATASHEET-governed
          path). plc_rfq_attachments table stores immutable snapshots. Files already
          governed as DATASHEET. Added 2026-05 for audit tracking.' }
```

**Key facts from the audit:**

1. `epc/RFQ_ATTACHMENT` is marked `active: false` in the seed data — it was **never intended to be an active routing rule**.
2. It is a **reference-only audit type**: no GCS object is ever created under this rule. `rfq-email-service.ts` (`freezeAttachments()`) does not call `issueUploadToken()` — it copies a GCS path that was already written under `epc/DATASHEET`.
3. The `plc_rfq_attachments` table stores immutable path snapshots pointing to DATASHEET-governed GCS objects. The file is one physical object governed by DATASHEET — RFQ_ATTACHMENT is only an audit label.
4. **DB confirmation**: zero `gcs_upload_tokens` rows exist for `rule_id=36` (RFQ_ATTACHMENT). No upload tokens have ever been issued through this rule.
5. The conflict with DATASHEET is therefore **semantically moot**: they point to the same file because RFQ_ATTACHMENT is an alias view of DATASHEET objects, not an independent GCS namespace.

**Root cause of DB activation:** The seed script activated all SEED_RULES entries without respecting the `active: false` flag. `epc/RFQ_ATTACHMENT` was seeded into the DB as `status='active'` despite the annotation intending it to remain inactive as an audit-tracking reference type.

### Revised Remediation

**Retire `epc/RFQ_ATTACHMENT` (rule_id=36, version_id=31) in the DB.**

Set `gcs_governance_rule_versions.status = 'superseded'` without a successor version. This removes it from the active routing layer, eliminating the Check 4 conflict with DATASHEET. No new v2, no path change, no routing change.

**The proposed Phase 1b path differentiation (PROCUREMENT/RFQ_ATTACHMENTS/) is withdrawn.** No path changes are required or correct.

---

## Finding F-04 — Duplicate Path Templates: `qms/MATERIAL_CERT` vs `qms/MATERIAL_ID_DOC`

### Original Finding

Both rules share the template `QMS/Material_Identification/{ProjectCode}/{Seq}/{filename}`. Check 4 flags a mutual conflict.

### Audit Amendment — Approach Revised

The codebase audit reveals in `server/services/gcs-governance-service.ts` (line 232):

```
{ moduleKey: 'qms', documentType: 'MATERIAL_CERT',
  active: false,
  notes: 'DEPRECATED 2026-05 — renamed to MATERIAL_ID_DOC. CERT suffix was misleading;
          this is an identification document, not a certificate. Use MATERIAL_ID_DOC.' }
```

And (line 233):

```
{ moduleKey: 'qms', documentType: 'MATERIAL_ID_DOC',
  notes: 'Renamed from MATERIAL_CERT 2026-05. TRANSITIONAL ROOT — Family A
          (project-specific). material-identification-routes.ts.' }
```

**Key facts:**

1. `qms/MATERIAL_CERT` is marked `active: false` — deprecated and renamed in 2026-05.
2. `qms/MATERIAL_ID_DOC` is the canonical replacement carrying the same template (the rename was a label correction, not a path change).
3. Having two active rules with the same template is a **DB state error** from the seed activation. The intent was always one canonical rule: `MATERIAL_ID_DOC`.
4. **DB confirmation**: zero `gcs_upload_tokens` rows exist for `rule_id=17` (MATERIAL_CERT). No upload tokens have ever been issued through this rule.
5. The proposed `/certificates/` subfolder differentiation is **incorrect** — MATERIAL_CERT and MATERIAL_ID_DOC are not different document types. MATERIAL_CERT is the old name for what is now MATERIAL_ID_DOC.

### Revised Remediation

**Retire `qms/MATERIAL_CERT` (rule_id=17, version_id=3) in the DB.**

Set status to `'superseded'` without a successor. MATERIAL_ID_DOC remains the single active rule. The Check 4 conflict resolves automatically.

**The proposed Phase 1b path differentiation (QMS/Material_Identification/{ProjectCode}/{Seq}/certificates/{filename}) is withdrawn.** It was based on a misread of the two rules as independent types.

---

## Finding F-05 — Revision Mode Inconsistency: `epc/RFQ_ATTACHMENT`

This finding is fully resolved as a consequence of the F-03 revised approach. Retiring `epc/RFQ_ATTACHMENT` removes the rule from the active set. Check 6 (`revision_mode_consistency`) will no longer be evaluated against it.

**No standalone remediation required.**

---

## Finding F-06 — 3-Way Template Conflict: `design/DESIGN_DRAWING` / `epc/DRAWING` / `epc/EPC_DRAWING`

### Why the Conflict Was Previously Masked

Before Phase 1a, `{ItemCode}` was absent from `gcs_governance_token_registry`. Zero-Trust Check 3 (`synthetic_paths`) cannot generate resolved example paths when any token in the template is unregistered — it fails early with an "unresolved token" error and Check 4 (`path_uniqueness`) is never reached. All three drawing rules failed only on Check 1 and Check 3.

After Phase 1a registered `{ItemCode}`, Check 3 completed successfully for all three rules, producing fully resolved synthetic paths. Check 4 then ran the cross-rule collision test and immediately found all three rules produce **identical** synthetic paths — a 3-way mutual conflict surfaced simultaneously.

### Affected Rules (DB State)

| rule_id | module_key | document_type | version_id | path_template | revisionMode | activated_at |
|---|---|---|---|---|---|---|
| 20 | design | DESIGN_DRAWING | 33 | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}` | alphabetic | 2026-05-16 |
| 2 | epc | DRAWING | 8 | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}` | alphabetic | 2026-05-16 |
| 34 | epc | EPC_DRAWING | 35 | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}` | alphabetic | 2026-05-16 |

All three carry identical templates and identical `revisionMode = 'alphabetic'`.

---

### 1 — Semantic Analysis

**Are these three rules semantically distinct document types?**

**No.** The audit confirms they describe a single document type: an engineering drawing for a THERMOPAC project item, stored as `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}`.

The governance service seed data (`server/services/gcs-governance-service.ts`) already encodes this conclusion explicitly:

```
epc/DRAWING (line 207):
  active: false,
  notes: 'DEPRECATED 2026-05 — renamed to EPC_DRAWING. Use EPC_DRAWING.'

epc/EPC_DRAWING (line 208):
  notes: 'Renamed from DRAWING 2026-05. Built by buildDrawingGcsPath() in epc-coding.ts.
          Also covers design module uploads (project-item-detail-routes.ts) — same builder,
          same path. DESIGN_DRAWING was retired and merged here.'

design/DESIGN_DRAWING (line 240):
  active: false,
  notes: 'RETIRED 2026-05 — merged into EPC_DRAWING. Code inspection confirmed both
          design-drawing-routes.ts and project-item-detail-routes.ts use the same
          buildDrawingGcsPath() builder producing identical path templates. Same physical
          GCS files. Having two active rules caused monitor ambiguity. EPC_DRAWING is now
          the single canonical type for all drawing uploads.'
```

The consolidation decision was made and documented **during the May 2026 governance baseline work**. `EPC_DRAWING` is the single canonical governance type. `DRAWING` (renamed) and `DESIGN_DRAWING` (retired and merged) are deprecated predecessors.

---

### 2 — Operational Usage Differences

| Dimension | epc/DRAWING | design/DESIGN_DRAWING | epc/EPC_DRAWING |
|---|---|---|---|
| Intended usage | Drawing upload for EPC project items (legacy name) | Drawing upload from design module (legacy name) | All drawing uploads — canonical |
| GCS path produced | `TPEL/…/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}` | `TPEL/…/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}` | `TPEL/…/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}` |
| **Path difference** | **None** | **None** | **None** |
| Physical GCS location | **Identical** | **Identical** | **Identical** |
| Upload tokens issued | 0 (confirmed by DB query) | 0 (confirmed by DB query) | 0 to date |

All three rules produce **physically identical GCS object paths** for the same input parameters. There is no storage separation between them. A document uploaded under any one of the three rules would land at the same GCS path as if uploaded under either of the other two.

---

### 3 — Route / Caller Differences

**`design-drawing-routes.ts`** (lines 321, 484):

```typescript
import { resolveProjectGeoCodes, buildDrawingGcsPath } from './epc-coding';
// ...
gcsPath = buildDrawingGcsPath(
  geo.continentCode, geo.countryCode, geo.customerShortCode,
  geo.fyCode, geo.projectSeq,
  itemCode, drawingNumber, finalRevision, fileExtension
);
```

This route handles drawings from the design module. It uses `buildDrawingGcsPath()` — the same function referenced in `epc/EPC_DRAWING`'s notes. **This route does not reference a governance rule ID at all** — it calls `uploadFileWithDiagnostics()` directly with the built path, bypassing `issueUploadToken()`.

**`project-item-detail-routes.ts`** (line 205):

```typescript
import { resolveProjectGeoCodes, buildDrawingGcsPath } from './epc-coding';
// ...
gcsObjectPath = buildDrawingGcsPath(
  geo.continentCode, geo.countryCode, geo.customerShortCode,
  geo.fyCode, geo.projectSeq,
  pi.itemCode!, pi.codeBars!, revision, ext
);
```

This route handles drawing uploads from the EPC project item view. Same builder, same path pattern, same direct upload call — no `issueUploadToken()`.

**`buildDrawingGcsPath()` in `epc-coding.ts`** (line 260–273):

```typescript
export function buildDrawingGcsPath(
  continentCode: string, countryCode: string, customerShortCode: string,
  fyCode: string, projectSeq: string,
  itemCode: string, codeBars: string, revision: string, ext: string
): string {
  const path = `TPEL/${continentCode}/${countryCode}/${customerShortCode}/${fyCode}/${projectSeq}/${itemCode}/DWG/${codeBars}_rev-${revision}.${ext}`;
  assertGcsPath(path, 'epc-coding.buildDrawingGcsPath');
  return path;
}
```

This is the only drawing path builder in the codebase. Both the design module route and the EPC project item route use it. The function produces a single, unambiguous path with no branching — there is no code path that could produce a different path for the same inputs.

**Conclusion**: There is no caller difference between the three rules at the code level. Both upload routes use the same builder and bypass the governance token layer entirely. **Neither route currently uses `issueUploadToken()` with any of the three rule IDs.** The governance rules exist for monitoring, auditability, and future token-gate enforcement — not for current upload routing.

---

### 4 — Revision / Workflow Differences

| Dimension | epc/DRAWING | design/DESIGN_DRAWING | epc/EPC_DRAWING |
|---|---|---|---|
| `revisionMode` | `alphabetic` | `alphabetic` | `alphabetic` |
| Revision progression | A, B, C, … | A, B, C, … | A, B, C, … |
| Workflow lifecycle | Same (upload → version record created) | Same | Same |
| Version state machine | Both routes create revision records in their respective tables (`drawingVersions`, `projectItemDrawings`) using the same GCS path | Same | Same |

No revision or workflow difference exists between the three rules. All use alphabetic revision mode. The revision is passed as a call argument to `buildDrawingGcsPath()` and appended as `_rev-{A}` in the path. There is no revision logic specific to any of the three governance types.

---

### 5 — Whether Separate Path Templates Are Truly Justified

**They are not.**

The physical evidence is unambiguous:

- Same path template (byte-for-byte identical across all three)
- Same builder function (`buildDrawingGcsPath()` from `epc-coding.ts`)
- Same GCS root and folder structure
- Same revision mode (`alphabetic`)
- Zero upload tokens issued against the two deprecated rules
- No route that distinguishes between them
- Governance service seed data explicitly records the decision to collapse them into one

There is no architectural, functional, operational, or storage justification for maintaining three separate governance rules for the same physical document type with the same path. This is not a case of "artificial separation that could be debated" — the codebase itself documented the consolidation decision and flagged two of the three rules as inactive.

---

### Root Cause

**DB state mismatch caused by the seed activation script.**

The `SEED_RULES` array in `gcs-governance-service.ts` includes `active: false` annotations for `epc/DRAWING` and `design/DESIGN_DRAWING`. These annotations communicate that those two rules should not be seeded into the DB as active versions — they are registry-level documentation of deprecated types.

The seed script that ran (or the raw SQL seed) activated all rules without reading or respecting the `active: false` flag. As a result:
- Both deprecated rules were inserted into `gcs_governance_rules`
- Both were given `status='active'` versions in `gcs_governance_rule_versions`
- All three rules entered Phase 0 as active versions — which is incorrect

The conflict is not a design flaw in the path template. It is an execution error in the DB seeding step.

---

### Production Risk

**Low — current uploads are unaffected.**

Neither `design-drawing-routes.ts` nor `project-item-detail-routes.ts` calls `issueUploadToken()`. Drawings are uploaded by calling `uploadFileWithDiagnostics()` directly with a path built by `buildDrawingGcsPath()`. The governance rule activation status has no effect on the current upload path.

Risk becomes **Medium** when the drawing routes are migrated to use `issueUploadToken()` (the intended Phase 2 migration): having two deprecated active rules would cause `issueUploadToken()` to be ambiguous about which rule to use for a drawing upload if the caller doesn't specify a rule ID explicitly.

Risk also applies to monitoring: the GCS dashboard service (`gcs-dashboard-service.ts`) may produce ambiguous attribution for drawing objects if three rules claim the same path pattern.

---

### Recommended Long-Term Governance Model

**Single canonical rule: `epc/EPC_DRAWING`.**

All drawing uploads — regardless of whether they originate from the design module, the EPC project item view, or any future drawing-related flow — are governed by a single rule: `epc/EPC_DRAWING`, path template `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}`.

This is the model the seed data already intends. It is confirmed by the `epc-coding.ts` builder and both upload routes.

The `design` module does not require its own drawing governance namespace because:
- All THERMOPAC design drawings are project-scoped (linked to an EPC project via `projectDbId`)
- The G5 constraint in `design-drawing-routes.ts` (line 313–317) already enforces this: uploads are blocked if the design project has no linked EPC project
- The path is generated from EPC project geo-codes (`resolveProjectGeoCodes(designProjectDbId)`)

The module boundary between `design/` and `epc/` in the governance registry is a logical grouping convenience — it does not correspond to different physical storage locations.

---

### Remediation

**Retire two deprecated rules in the DB to align with the seed data intent.**

| rule_id | module_key | document_type | version_id | Action |
|---|---|---|---|---|
| 2 | epc | DRAWING | 8 | Set `version.status = 'superseded'` |
| 20 | design | DESIGN_DRAWING | 33 | Set `version.status = 'superseded'` |
| 34 | epc | EPC_DRAWING | 35 | No change — remains `active` |

SQL (to be executed, not a migration):

```sql
UPDATE gcs_governance_rule_versions
SET status = 'superseded', superseded_at = NOW()
WHERE id IN (8, 20, 33)  -- DRAWING v1 and DESIGN_DRAWING v1
  AND status = 'active';
-- version_id=8: epc/DRAWING v1
-- version_id=33: design/DESIGN_DRAWING v1
-- version_id=35 (EPC_DRAWING v1) is NOT in this list — it remains active
```

Additionally, the rule rows should be annotated:

```sql
UPDATE gcs_governance_rules
SET notes = COALESCE(notes || ' ', '') || 'RETIRED 2026-05-17: merged into EPC_DRAWING (rule_id=34). DB state corrected from incorrect seed activation.'
WHERE id IN (2, 20);
```

**What this does NOT do:**
- Does not delete any rule or version row
- Does not move or delete any GCS object
- Does not change any upload token row
- Does not change the `epc/EPC_DRAWING` rule or version in any way
- Does not change any route or caller

**After retirement:** The active drawing governance set is reduced from 3 rules to 1. Check 4 will PASS for `epc/EPC_DRAWING` because it is the only active rule with that template.

---

### Backward Compatibility Impact

**None for uploads.** Neither route uses `issueUploadToken()`, so the retirement does not affect any upload. Drawings continue to be written to the same GCS paths by the same builder function.

**None for existing GCS objects.** No objects are moved or deleted.

**None for DB records.** Existing rows in `drawingVersions`, `projectItemDrawings`, or `designDrawings` that store GCS paths continue to be valid. Those paths resolve correctly regardless of which rule is active.

**Monitoring impact (minor):** Any GCS dashboard query that groups objects by `active` rule attribution will see fewer rules. Objects previously matching all three templates now match only `epc/EPC_DRAWING`. This is the correct behavior.

---

### Routing / Upload Behavior Changes

**No routing change. No upload behavior change.** Current upload routes do not use the governance token layer. Future routes that do will use `epc/EPC_DRAWING` (rule_id=34), which is unchanged.

---

### Migration / Testing Requirements

1. Verify zero upload tokens for rule_ids 2 and 20 before retirement (already confirmed: 0 rows).
2. Execute the retirement SQL above.
3. Verify `epc/DRAWING` and `design/DESIGN_DRAWING` versions now show `status='superseded'`.
4. Verify `epc/EPC_DRAWING` version still shows `status='active'`.
5. Re-run retroactive baseline validation `--force` — only the 34 remaining active v1 versions are processed. All drawing path_uniqueness failures should be absent.
6. Run a test drawing upload via `POST /api/project-items/:id/drawings` — confirm the GCS path is unchanged and the upload succeeds.

---

### Zero-Trust Validation Impact

After retirement of `epc/DRAWING` and `design/DESIGN_DRAWING`:
- `epc/EPC_DRAWING` Check 4 (`path_uniqueness`) will PASS — no other active rule shares its template.
- The two retired rules leave the active set and are no longer evaluated by Zero-Trust.

---

### Rollout Sequence

**Phase 1b — Step F-06.** No version lifecycle required (no new version is created). Direct DB status update only.

---

## Audit Amendment — Revised Phase 1b Scope

The F-06 codebase audit revealed a systemic pattern: **multiple rules were activated during the initial DB seed despite being marked `active: false` in the seed data.** This affects four rules in total, all of which are contributing to the 7 remaining FAIL findings.

| rule_id | module_key | document_type | version_id | Seed intent | DB state at seed | Correct action |
|---|---|---|---|---|---|---|
| 2 | epc | DRAWING | 8 | `active: false` (DEPRECATED) | incorrectly `active` | Retire |
| 20 | design | DESIGN_DRAWING | 33 | `active: false` (RETIRED) | incorrectly `active` | Retire |
| 17 | qms | MATERIAL_CERT | 3 | `active: false` (DEPRECATED, renamed) | incorrectly `active` | Retire |
| 36 | epc | RFQ_ATTACHMENT | 31 | `active: false` (REFERENCE-ONLY, no GCS writes) | incorrectly `active` | Retire |

**Original Phase 1b plan (create new v2 versions with differentiated paths) is withdrawn** for all four findings. Template differentiation would solve a symptom (path_uniqueness conflict) while leaving the root cause (incorrect activation) in place — and would create permanent path divergence for document types that should never have been separate.

### Revised Phase 1b — DB State Correction Only

Retire all four incorrectly activated rule versions:

```sql
-- Phase 1b retirement — all 4 deprecated/retired/reference-only rules
UPDATE gcs_governance_rule_versions
SET status = 'superseded', superseded_at = NOW()
WHERE id IN (8, 33, 3, 31)
  AND status = 'active';
-- id=8:  epc/DRAWING v1          (DEPRECATED → EPC_DRAWING)
-- id=33: design/DESIGN_DRAWING v1 (RETIRED → merged into EPC_DRAWING)
-- id=3:  qms/MATERIAL_CERT v1    (DEPRECATED → renamed to MATERIAL_ID_DOC)
-- id=31: epc/RFQ_ATTACHMENT v1   (REFERENCE-ONLY — should never have been active)
```

**Impact of this single operation:**

| Finding | Resolution mechanism |
|---|---|
| F-03 (DATASHEET / RFQ_ATTACHMENT path_uniqueness) | RFQ_ATTACHMENT retired → conflict gone |
| F-04 (MATERIAL_CERT / MATERIAL_ID_DOC path_uniqueness) | MATERIAL_CERT retired → conflict gone |
| F-05 (RFQ_ATTACHMENT revision_mode inconsistency) | RFQ_ATTACHMENT retired → rule not evaluated |
| F-06 (DESIGN_DRAWING / DRAWING / EPC_DRAWING path_uniqueness) | DRAWING + DESIGN_DRAWING retired → EPC_DRAWING is sole active drawing rule |

**Zero new GCS paths. Zero new version lifecycle events. Zero routing changes. Zero path changes.**

After this single SQL UPDATE, the active version count drops from 38 to 34. A `--force` re-run of the retroactive baseline validation will process only those 34 active versions, all of which should PASS.

---

## Revised Rollout Sequence

### Phase 1a — COMPLETE

Token registry additions. All token-related failures resolved. Evidence submitted.

| Step | Action | Status |
|---|---|---|
| 1a-1 | Add `{ItemCode}` to registry | Done — id=1992 |
| 1a-2 | Add `{DrawingControlId}` to registry | Done — id=1993 |
| 1a-3 | Add `{Timestamp}` to registry | Done — id=1994 |
| 1a-4 | Re-run retroactive baseline `--force` | Done — 31 PASS, 7 FAIL |

### Phase 1b — DB State Correction

One SQL UPDATE. No version lifecycle. No path changes. No routing changes.

| Step | Action | Expected outcome |
|---|---|---|
| 1b-0 | Verify zero upload tokens for version_ids 8, 33, 3, 31 | All 0 (already confirmed for ids 8, 33, 3, 31) |
| 1b-1 | Execute retirement UPDATE on version_ids 8, 33, 3, 31 | 4 rows updated |
| 1b-2 | Annotate rule rows 2, 20, 17, 36 with retirement notes | Metadata only |
| 1b-3 | Re-run retroactive baseline `--force` | 34 active versions processed, 34 PASS, 0 FAIL |
| 1b-4 | Run verification SQL — confirm no active versions for DRAWING / DESIGN_DRAWING / MATERIAL_CERT / RFQ_ATTACHMENT | 0 rows returned |
| 1b-5 | Run test drawing upload, test material-id upload — confirm unchanged behaviour | Uploads succeed at same paths |
| 1b-6 | Submit closure evidence | Complete |

---

## Zero-Trust Check Impact Summary (Revised)

| Check | Affected findings | After Phase 1a | After Phase 1b |
|---|---|---|---|
| 1 — token_completeness | F-01, F-02 | **All PASS** | All PASS |
| 2 — root_prefix | None | Unchanged | Unchanged |
| 3 — synthetic_paths | F-01, F-02 | **All PASS** | All PASS |
| 4 — path_uniqueness | F-03, F-04, F-06 | 7 rules FAIL | **0 FAIL** — conflicting rules retired |
| 5 — extension_safety | None | Unchanged | Unchanged |
| 6 — revision_mode | F-05 | 1 rule FAIL | **0 FAIL** — RFQ_ATTACHMENT retired |
| 7 — high_impact_diff | None | Unchanged | Unchanged |

**Target state after Phase 1b**: 34 active versions, 34 PASS, 0 FAIL.

---

## Constraints and Non-Negotiables

1. **Token immutability** — no UPDATE on `gcs_upload_tokens.version_id`, `resolved_path`, or `token_values`.
2. **Retirement without successor is valid** for deprecated/retired types — no new version creation required.
3. **No GCS object movement** — retirement is purely a DB state correction. All existing GCS objects at any path remain permanently.
4. **Retroactive baseline re-run required** after Phase 1b with `--force` to refresh evidence on all remaining active versions.
5. **Seed script must be corrected** (out of scope for Phase 1b, post-closure action): the SEED_RULES seeder must be updated to read the `active: false` flag and skip activation for those entries, preventing re-introduction of retired rules if the seed ever runs again.

---

## Post-Phase-1b Action (Out of Scope — Record Only)

The seed activation script does not currently respect the `active: false` property on SEED_RULES entries. If the seed runs again (e.g., in a fresh environment), the four retired rules would be reactivated. A guard should be added to the seeder:

```typescript
if (rule.active === false) continue; // skip deprecated/retired rules
```

This is a seeder correctness fix, not a governance change. Logged here for tracking; separate approval not required.

---

*Document status: Phase 1a COMPLETE. Phase 1b pending approval.*  
*Approver actions: confirm Phase 1b scope (DB state retirement of 4 deprecated rules, no path changes), then approve execution.*
