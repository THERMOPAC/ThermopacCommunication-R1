# Release document availability and schema compatibility

Checked 2026-09-24. **Audit complete; WPS compatibility gate blocked. Not approval to publish.**

Inputs: `clean-release-candidate-audit.md` and `clean-release-database-path-audit.md/json`.
Machine-readable evidence: `clean-release-document-compatibility-audit.json`.
The earlier inclusion audit remains valid within its stated snapshot boundary.

## Read-only boundary

- Used database skill SELECTs separately against the managed production replica and development.
  `server/db.ts` uses `DATABASE_URL`; no alternate/external production database is claimed audited.
- No migrations, record changes, cloud uploads/deletes, credential changes, deployment, ERP
  startup, worker, scientific solve, or candidate rebuild.
- No IDs, document numbers, raw object keys, signed URLs, credentials, or PDF contents are in
  the durable report. Object metadata was handled privately and only aggregate outcomes retained.
- Did **not** request the WPQR HTTP download endpoint: it calls `logDownload` after starting
  the stream (`server/quality/wpqr-routes.ts:891–906`) and therefore is not a read-only
  database operation. Direct storage reads avoid this side effect.

## WPQR cloud-first verification

For each path-bearing record, selected the latest active/latest-marked WPQR revision ordered
by revision number, matching `getLatestRevision('WPQR', documentId)`, otherwise the stored
file path. Removed one leading slash, matching `streamFileFromGCS`.

`scripts/audit-wpqr-cloud-readonly.mjs` receives private JSON on stdin, never imports the ERP,
and outputs aggregates only. It uses the existing workspace explicit GCS credential through
the SDK, the same bucket selection as the route, and performs:

1. Object metadata read (nonempty object).
2. Full SDK stream consumed to EOF, with PDF magic-header validation.
3. Short-lived V4 signed GET, reading only the PDF header; URL never logged or persisted.

| Effective-record population | Production replica | Development |
|---|---:|---:|
| WPQR records / path-bearing records | 21 / 21 | 21 / 21 |
| Governed latest-revision selections | 7 | 7 |
| Nonempty cloud objects | 21 | 21 |
| Full streams completed with PDF header | 21 | 21 |
| Signed GET returned PDF header | 21 | 21 |

There were **21 distinct effective objects across both environments**; shared objects were
probed once and counted against both inventories. No cloud failure was inferred from missing
local files. The previously retained three local fallback files remain fallback assets;
the other eighteen do not need invented local copies.

**Limits:** this establishes point-in-time object availability using workspace credentials,
not deployed ADC permissions, browser sessions, PDF semantic correctness, all historical
revisions, every ERP document family, or the HTTP route end-to-end. Signed URL checks read
only a prefix, not the full PDF. The direct cloud stream—not a signed redirect—is the primary
WPQR route. Its helper returns success when piping starts, not when the stream completes;
this audit explicitly waited for EOF instead.

## WPS schema compatibility: broader than file paths

Both environments contain **zero WPS rows** and **zero checklist result rows**.
This explains empty historical path counts but does not make invalid queries safe.
The separate WPQR table is populated and is not the WPS/PQR table.

### Production versus development

Production `wps_documents` has legacy quoted camelCase names such as `"wpsId"`, `"pqrId"`,
`"createdBy"`, `"baseMetalGrade"`, and `"createdAt"`. Development retains these **and**
the newer snake_case columns expected by `shared/schema.ts:6217–6243`.
Production lacks the snake_case counterparts and the primary `document_url`,
`combined_document_file_path`, and `combined_document_url` fields.

Consequences:

- List/detail/report raw SQL selects missing columns; production fails independently of
  whether records exist.
- Production primary and combined download handlers use the Drizzle WPS model and cannot
  read that model's full projection. WPS create/update also require absent columns.
- In development, adding the snake_case columns did **not** retire required legacy columns.
  Both schemas still require legacy `"wpsId"`, `"pqrId"`, `"baseMetalGrade"`,
  `"baseMetalThickness"`, `"fillerMaterial"`, `"jointType"`, `"weldPosition"`,
  `"welderProcess"`, `"createdAt"`, and `"updatedAt"` with no defaults.
  The current raw INSERT supplies snake_case names, not these legacy fields.
  Both environments have zero non-internal WPS triggers, so no user trigger supplies them.
  Thus an additive-only alignment is insufficient for development create compatibility too.
  This is a catalog-based finding; no INSERT was attempted.
- `mirror_status` and `mirror_job_id` **exist in both live schemas**; do not propose adding
  them based solely on their absence from the Drizzle model.

### PQR fields absent in both environments

The missing `pqr_document_file_path` is not an isolated omission. Current WPS route SQL also
references absent `has_pqr`, `pqr_test_date`, `pqr_test_laboratory`, `pqr_test_type`,
`pqr_test_results`, `pqr_status`, `pqr_remarks`, `pqr_document_url`, `pqr_created_by`,
and `pqr_created_at`. These fields are also absent from the current WPS Drizzle model.

Affected handlers in `server/quality/wps-pqr-routes.ts`:

- list/detail SELECTs, lines 17–138;
- PQR upload UPDATE, lines 458–538 (may upload before the SQL failure);
- report SELECT, lines 569–683.

The report additionally joins `w.createdBy` / `w.approvedBy` **without quotes**. PostgreSQL
folds those to `createdby` / `approvedby`, which match neither quoted legacy names nor
snake_case names. Development SELECT-only probing confirmed this error.

The registered mount is `/wps-pqr` under the quality router
(`server/quality-routes.ts:35`); WPQR has its separate `/wpqr` mount.
Repairing only the named PQR file column cannot clear this gate.

### Checklist evidence

Both schemas have `checklist_item_results.evidence_path`; only development has
`evidence_file_path`. The Drizzle model declares both (`shared/schema.ts:3259`).
There are no stored values to reconcile at this snapshot (zero rows).
Repository search found no current server consumer of `checklistItemResults`,
`evidenceFilePath`, or raw `checklist_item_results` SQL. This is therefore a **latent
model/schema drift**, not proof of an exercised failing checklist endpoint. It is not
a WPS-specific checklist relation, and the two names must not be assumed aliases
without an approved evidence-field contract.

## Verification and interpretation

- Fresh schema catalog queries, row-count aggregates, and required-column/default discovery.
- Development SELECT-only probes: primary/combined projection and checklist evidence
  projection succeed; PQR field and unquoted report join fail with missing-column errors.
- Production zero-row probes return `START TRANSACTION / ROLLBACK` and a success flag without
  projected column headers. **Do not treat that response as SQL compatibility success.**
  Production findings rely on the independently returned information-schema catalog.
- Script syntax checked; generated JSON parsed and aggregate counts asserted.
- No app code changed and no app launched for screenshots: starting the ERP merely for this
  audit could start workers or write data. Full isolated release exercise remains separate.

## Required approval before remediation

1. Decide whether the WPS/PQR feature remains supported alongside simplified WPQR. If supported,
   agree one schema contract, resolve required legacy/snake_case duplication deliberately,
   model the intended PQR fields, and correct report joins. If retired, explicitly retire its
   routes/UI rather than silently returning empty data. Review uploads that precede failed writes.
2. Agree the checklist evidence-field meaning before any schema alignment.
3. Any schema/data remediation requires separate approval. Do not execute broad schema push,
   drop/rename legacy columns, or write production as part of this audit.
4. Deployed ADC and full HTTP behavior remain unverified. Any future endpoint check must account
   for audit writes rather than claiming to be read-only. All-document cloud coverage and the
   isolated candidate/image test remain distinct from the successful WPQR object probe.