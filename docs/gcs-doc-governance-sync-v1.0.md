# GCS-to-Doc Governance Sync — Baseline v1.0

**Status**: Approved for implementation  
**Date**: 2026-06-10  
**Policy owner**: THERMOPAC ERP

---

## 1. Principle

GCS Doc Governance (`/document-control/gcs-doc-governance`) is the **single source of truth** for path definitions.

Doc Governance path templates (`/document-control/doc-governance` → Path Templates tab) that are GCS-managed must **not** be edited directly by users. All changes go through GCS Doc Governance.

---

## 2. Governing Rules

### R1 — GCS is master
Creating, editing, or deactivating a GCS Governance Rule automatically creates, updates, or deactivates the matching `document_path_templates` row. The user must not maintain two separate path definitions.

### R2 — On GCS rule CREATE
After a GCS rule is inserted into `gcs_governance_rules`:

1. Derive `templateCode` = `{moduleKey}_{documentType}` if `submoduleKey` is null, else `{moduleKey}_{submoduleKey}_{documentType}`. All lowercase, underscores.
2. Derive `relativePathTemplate` = `'{COMPANY}' + pathTemplate.substring(rootPrefix.length)`.  
   Example: rootPrefix=`TPEL`, pathTemplate=`TPEL/COMPANY/{CompanyCode}/GST_CERTIFICATE/rev-{RevNo}/001-gst-certificate.{Ext}` → relativePathTemplate=`{COMPANY}/COMPANY/{CompanyCode}/GST_CERTIFICATE/rev-{RevNo}/001-gst-certificate.{Ext}`
3. Set `documentCategory` = `moduleKey`.
4. Set `revisionMode` = GCS rule's `revisionMode`.
5. Set `documentType` = GCS rule's `documentType`.
6. Set `fileExtension` = null (not derivable from GCS rule).
7. Set `fileNameTemplate` = null (not derivable from GCS rule).
8. Set `active` = true.
9. Store `gcs_rule_id` = new GCS rule's id on the inserted `document_path_templates` row.
10. If a `document_path_templates` row with the derived `templateCode` already exists AND has `gcs_rule_id` IS NULL: link it by setting `gcs_rule_id` = new GCS rule's id (and update its `relativePathTemplate`, `revisionMode`, `documentCategory`, `active`). Do NOT create a duplicate.
11. If a `document_path_templates` row with the derived `templateCode` already exists AND already has a `gcs_rule_id` (belongs to a different rule): log an error, do not create a doc template, include `docTemplateSyncError` in the API response. This does NOT fail the GCS rule creation.

### R3 — On GCS rule PATCH (edit)
After `gcs_governance_rules` is updated:

1. Find the linked `document_path_templates` row via `gcs_rule_id = gcsRule.id`.
2. If found:
   - If `pathTemplate` or `rootPrefix` changed → recompute and update `relativePathTemplate`.
   - If `revisionMode` changed → update `revisionMode`.
   - If `active` changed → update `active`.
   - `templateCode`, `documentType`, `documentCategory` are NOT re-derived on PATCH (immutable in GCS rules after creation).
3. If not found: attempt to create it using R2 logic. Log the gap.

### R4 — On GCS rule DEACTIVATE (`POST /api/gcs-governance/rules/:id/deactivate`)
After the GCS rule's `active` is set to false:
- Find linked doc path template via `gcs_rule_id` and set `active = false`.

### R5 — On GCS rule ACTIVATE (`POST /api/gcs-governance/rules/:id/activate`)
After the GCS rule's `active` is set to true:
- Find linked doc path template via `gcs_rule_id` and set `active = true`.

### R6 — Sync failure is non-blocking
Doc path template sync failures do NOT fail the GCS rule operation (create/patch/deactivate/activate). The GCS rule operation always succeeds or fails on its own merits. Sync failures are:
- Logged to server console with prefix `[GCS-DocSync]`.
- Returned as a non-error field `docTemplateSyncError: "<message>"` in the API response JSON, so the UI can show a warning.

### R7 — GCS-managed templates are read-only in Doc Governance UI
`document_path_templates` rows with `gcs_rule_id IS NOT NULL` are displayed as read-only in the Doc Governance UI. The edit and toggle-active controls are disabled for these rows. A badge "GCS-managed" is shown.

### R8 — Scope
This sync applies only to `document_path_templates`. It does NOT apply to `folder_templates` or `folder_template_nodes`.

---

## 3. Database Change Required

Add one column to `document_path_templates`:

```sql
ALTER TABLE document_path_templates
  ADD COLUMN IF NOT EXISTS gcs_rule_id INTEGER REFERENCES gcs_governance_rules(id) ON DELETE SET NULL;
```

Add to `shared/schema.ts` → `documentPathTemplates` table definition:
```typescript
gcsRuleId: integer('gcs_rule_id'),
```

---

## 4. Path Conversion Formula

```
relativePathTemplate = '{COMPANY}' + gcsRule.pathTemplate.substring(gcsRule.rootPrefix.length)
```

Where `rootPrefix` is the literal leading segment of the GCS path (e.g. `TPEL`).

| Layer | Value |
|---|---|
| GCS `rootPrefix` | `TPEL` |
| GCS `pathTemplate` | `TPEL/COMPANY/{CompanyCode}/GST_CERTIFICATE/rev-{RevNo}/001-gst.{Ext}` |
| Doc `relativePathTemplate` | `{COMPANY}/COMPANY/{CompanyCode}/GST_CERTIFICATE/rev-{RevNo}/001-gst.{Ext}` |
| Agent resolved (local) | `\\SERVER\d\THERMOPAC\TPEL\COMPANY\{CompanyCode}\GST_CERTIFICATE\...` |

---

## 5. templateCode Derivation

| GCS fields | Derived templateCode |
|---|---|
| `moduleKey=company`, `submoduleKey=null`, `documentType=GST_CERTIFICATE` | `company_gst_certificate` |
| `moduleKey=quality`, `submoduleKey=pma`, `documentType=TEST_REPORT` | `quality_pma_test_report` |

Rule: lowercase, underscores, no hyphens.  
Formula: `(submoduleKey ? moduleKey + '_' + submoduleKey : moduleKey) + '_' + documentType` — all `.toLowerCase()`.

---

## 6. API Response Shape (augmented)

GCS rule create/patch/deactivate/activate responses include an optional `docTemplate` field:

```json
{
  "id": 42,
  "moduleKey": "company",
  "documentType": "GST_CERTIFICATE",
  ...
  "docTemplate": {
    "id": 17,
    "templateCode": "company_gst_certificate",
    "action": "created"   // "created" | "updated" | "linked" | "not_found"
  }
}
```

On sync error:
```json
{
  "id": 42,
  ...
  "docTemplateSyncError": "templateCode 'company_gst_certificate' already belongs to gcs_rule_id=5"
}
```

---

## 7. Out of Scope

- `fileExtension` and `fileNameTemplate` on doc path templates are NOT auto-populated. Users may set them manually in Doc Governance (allowed since they are supplementary fields not derivable from GCS rules).
- `folderTemplates` and `folderTemplateNodes` are not affected.
- Existing `document_path_templates` rows that were manually created before this feature remain as-is (`gcs_rule_id = null`). They continue to be editable in Doc Governance UI.
- Retroactive backfill of existing GCS rules → doc templates is a separate admin operation not in this baseline.
