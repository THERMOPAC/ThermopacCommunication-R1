---
name: Offer Comm Governance integration
description: COMM_DOCUMENT + COMM_SOR_COPY governance rules wired into offer-comm-routes and offer-conversion. resolveGcsPathWithMeta() pattern, token sanitization requirements, and parity behaviour.
---

## Rules
- `COMM_DOCUMENT` id=95 — `sales/offer_comm` — revision_mode=numeric — 4 MIME types (docx/xlsx/pptx/pdf) — 50 MB
- `COMM_SOR_COPY` id=96 — `sales/offer_comm` — revision_mode=none — null MIME (any) — 50 MB
- Both synced to `document_path_templates` (template codes: `sales_offer_comm_comm_document`, `sales_offer_comm_comm_sor_copy`)

## Tokens used
- `CategoryPath` id=50268 — from `offer_comm_categories.category_path`
- `NNN` id=5 (pre-existed) — project_seq zero-padded string
- `OriginalFileName` id=50269 — source revision `file_name` preserved verbatim

## resolveGcsPathWithMeta()
- Added to `server/utils/gcs-path-resolver.ts` as a NEW function — `resolveGcsPath()` is UNCHANGED
- Returns `{ path, ruleId, allowedMimeTypes, maxFileSizeMb }`
- Validates MIME type and file size against rule constraints when `validate` arg is provided
- Throws `GcsGovernanceError` (name='GcsGovernanceError') — routes catch this and return HTTP 422

## Token sanitization (MUST happen before calling resolveGcsPathWithMeta)
The resolver does plain string substitution — it does NOT sanitize. Routes must sanitize before passing:
- `{OfferNo}`: `offerNumber.replace(/\//g, '-')`
- `{Label}`: `.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'doc'`
- `{Seq}`: `String(seq).padStart(3, '0')`

**Why:** These match `buildOfferCommDocPath()` behaviour in epc-coding.ts which was replaced.

## Schema
- `offer_comm_documents.gcs_rule_id` — nullable integer FK → gcs_governance_rules(id)
- `offer_comm_doc_conversions.gcs_rule_id` — nullable integer FK → gcs_governance_rules(id)

## logUploadEvent()
- Called with `void` (fire-and-forget) after every GCS write/copy — never awaited, never stored
- NO `monitor_log_id` column on any table

## Parity check behaviour (post-integration)
- `gcs_governance_rules` total=86, `document_path_templates` total=86 — exact parity
- 4 templates have `active=false` while their rules have `active=true` — pre-existing, not introduced here
- Server startup parity check logs `PARITY OK — rules=86, templates=86`
