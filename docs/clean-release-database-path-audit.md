# Clean release — database download-path audit (offline)

Follow-up: [read-only cloud and schema audit](clean-release-document-compatibility-audit.md)
verifies the 21 current effective WPQR objects with workspace credentials and documents
broader WPS compatibility blockers. The census below remains the earlier metadata-only snapshot.

## Boundary and method

Read-only SELECTs through executeSql against the **production replica** and, separately, the development database. The production schema was discovered independently of development; no production data or schema was modified. Scanned 122 production and 125 development download-bearing string columns (including legacy path, attachment, certificate, evidence, document, and PDF template fields). Grouped nonempty field occurrences and checked path-shaped references against the source workspace and temporary candidate without disclosing records, IDs, URLs, or raw paths. Per-table/column and category aggregates are in [the JSON report](clean-release-database-path-audit.json). A field occurrence is not a unique document, and neither database is assumed to reflect the other's state.

## Findings

- Production has **2,383** nonempty field occurrences: **1,186** GCS object keys, **375** remote URLs/gs URIs, **7** GCS filename-metadata attachment values, **21** WPQR cloud-first paths with a local-cache fallback, **369** remote-agent filesystem references, and **425** historical migration keys (not direct downloads). Development has **2,317** occurrences in the same categories: 1,157, 375, 7, 21, 332, and 425 respectively. These are metadata categorizations, **not GCS existence checks**.
- **No populated direct local application download path resolved to an existing source file omitted from the candidate.** The local or mirrored-local fields ` offer_templates.file_path and offers.template_pdf_path ` have **zero populated rows in both databases**; their use of local fs.existsSync matters for future/new records, but supplies no historical copy requirement today. Production and development WPQR each contain 21 path-bearing records; the route first streams from GCS and separately tries a document-ID-derived local WPQR cache. **3/21** have a matching nonempty source cache file and **3/21** have a matching candidate file; **0** source-only cache files. The other 18 cannot be declared broken: cloud object/revision availability was not probed. Neither the slash-prefixed WPQR key nor its URL is evidence that an absolute local file must be copied.
- The route for calibration reads legacy certificate_file_path as a GCS key (possibly with a QMS prefix), taking certificate_gcs_key first. Welder, reference-paper, inspection, travel, and other legacy file_path columns likewise have cloud routes; treating every relative path as a local workspace path would generate false blockers. document_agent_jobs.result_local_path is a remote Windows-agent reference, not a publishing-image asset. test_procedures.attachments stores filenames used to construct GCS candidate keys, not a local file path.
- Development-only columns checklist_item_results.evidence_file_path and wps_documents.combined_document_file_path exist but have zero populated entries; they are absent in the production replica schema. The WPS route also references pqr_document_file_path, but this column is absent from **both** discovered database schemas. Runtime/schema compatibility is a separate publishing gate, not evidence for an omitted historical file.

## Priority fields (nonempty occurrences)

| Table.column | Production | Development |
|---|---:|---:|
| offer_templates.file_path | 0 (empty) | 0 (empty) |
| offer_templates.gcs_object_path | 4 (gcs_object_key) | 4 (gcs_object_key) |
| offers.template_pdf_path | 0 (empty) | 0 (empty) |
| wpqr_documents.file_path | 21 (cloud_first_with_local_cache_fallback) | 21 (cloud_first_with_local_cache_fallback) |
| wpqr_documents.file_url | 21 (gcs_object_key, remote_url_or_gs_uri) | 21 (gcs_object_key, remote_url_or_gs_uri) |
| wps_documents.document_file_path | 0 (empty) | 0 (empty) |
| wps_documents.combined_document_file_path | not in scanned schema | 0 (empty) |
| calibration_instruments.certificate_file_path | 74 (gcs_object_key) | 74 (gcs_object_key) |
| calibration_instruments.certificate_gcs_key | 78 (gcs_object_key) | 78 (gcs_object_key) |
| checklist_item_results.evidence_path | 0 (empty) | 0 (empty) |
| checklist_item_results.evidence_file_path | not in scanned schema | 0 (empty) |
| dispatch_documents.document_path | 0 (empty) | 0 (empty) |
| change_documents.document_path | 0 (empty) | 0 (empty) |
| purchase_order_documents.document_path | 0 (empty) | 0 (empty) |
| payments.proof_document_path | 0 (empty) | 0 (empty) |
| document_agent_jobs.result_local_path | 173 (remote_agent_not_release_asset) | 153 (remote_agent_not_release_asset) |
| test_procedures.attachments | 7 (gcs_filename_metadata) | 7 (gcs_filename_metadata) |

## Release implication and limits

No historical DB path establishes another file to add to this candidate at this snapshot. Retain the existing WPQR cache and uploads; do not invent absent files. The root-level Google Ads design document and recovered Windows workflow are **route/source-code assets**, not database-backed findings and must be tracked by the separate release-assets audit. This audit did not inspect bucket existence, signed-URL validity, alternate external production databases, binary payloads, or correctness of every URL; a GCS key missing in the source filesystem is expected and is **not** a missing release asset. The production read replica may lag a deployment, so recheck immediately before a publishing test if data changes.
