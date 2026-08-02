---
name: Offer Communication Register V1
description: Architecture and implementation notes for the Offer Communication Register feature (offer_comm_* tables, path builders, routes, UI, conversion lifecycle, document generation).
---

## Key decisions

**Route file:** `server/offer-comm-routes.ts` → registered via `registerOfferCommRoutes(router)` called at the end of `setupSalesMarketingRoutes()` in `server/sales-marketing-routes.ts`.

**Template routes:** `server/offer-comm-template-routes.ts` → registered via `registerOfferCommTemplateRoutes(router)` also in `setupSalesMarketingRoutes()`, after `registerOfferCommRoutes()`.

**UI component:** `client/src/components/offer-comm-register.tsx` → imported and rendered inside `offers-page.tsx` after the Notes & Terms card, gated on `editingOffer` (only visible when editing an existing offer, not creating new).

**Tables (5):** `offer_comm_categories`, `offer_communications`, `offer_comm_documents`, `offer_comm_doc_conversions`, `offer_comm_templates` — created via raw SQL (drizzle-kit push hangs on large schema — use raw SQL for new tables).

**Categories migration:** `scripts/migrate-offer-comm-categories.ts` — run manually via `npx tsx scripts/...`. 20 rows inserted, idempotent (`ON CONFLICT DO NOTHING`). DO NOT re-seed at startup.

**Path builders** (two independent functions in `server/epc-coding.ts`):
- `buildOfferCommDocPath()` → `TPEL/PROJECTS/{CC}/{CO}/{Cust}/{FY}/Open_Quotations/{OfferNo}/{categoryPath}/{seq}-{label}-rev-{rev}.{ext}` (label is lowercased/slugified)
- `buildProjectDocPath()` → `TPEL/PROJECTS/{CC}/{CO}/{Cust}/{FY}/{projectRoot}/{categoryPath}/{fileName}` (filename preserved exactly)

**Template GCS path:** `TPEL/COMM-TEMPLATES/{type}/{safeFileName}` — hardcoded in `offer-comm-template-routes.ts`, NOT governed by COMM_DOCUMENT rule. Templates are master files, not communications.

**Conversion post-commit:** `copyCommDocsToSorProject()` in `server/offer-conversion.ts` — called after COMMIT, non-blocking, fire-and-forget. Failures log per-document, never throw. Uses `pool.query` (not drizzle ORM) for all operations.

**mirror_status on offer_comm_doc_conversions:** starts as `'not_started'` (not `'pending'`). Set to `'pending'` ONLY after GCS copy succeeds AND mirror job enqueues successfully.

**GCS copy_status on offer_comm_doc_conversions:** starts as `'pending'`. Set to `'copied'` or `'failed'` after GCS server-side copy attempt.

**Why two separate path builders:** `buildOfferCommDocPath` always emits Open_Quotations segment; `buildProjectDocPath` never does. Neither calls the other. Architectural constraint from approved design.

**SHA-256 storage:** `offer_comm_documents.sha256` — computed from file buffer at upload/generation time, stored permanently, reused for SOR mirror job (no re-read from GCS).

**Schema defined in:** `shared/schema.ts` at end of file. Zod insert types exported for all 4 main tables. `offerCommDocuments` has `templateId` FK to `offerCommTemplates.id` (nullable — set only when generated from a template).

## Document Generation — Phase 1

**Generator service:** `server/services/offer-comm-generator-service.ts`
- Single dispatcher: `generateCommDocument({ templateBuffer, templateType, variables })`
- WORD: docxtemplater + pizzip — template `.docx` from GCS, `{token}` substitution
- EXCEL: ExcelJS — template `.xlsx` from GCS (optional); generates header sheet if no template
- PPT: pptxgenjs — code-first, no template file in Phase 1; two-slide deck
- PDF: Puppeteer + HTML template — `{{token}}` substitution in HTML; built-in default template if none uploaded

**Generate route:** `POST /offers/:id/communications/:commId/documents/generate`
- Body: `{ templateType, templateId?, label, revisionOf? }`
- Uses `resolveGcsPathWithMeta('COMM_DOCUMENT', ...)` for GCS governance
- For PPT and EXCEL: templateBuffer is empty Buffer if no template uploaded (both can generate from scratch)
- For WORD and PDF: requires an uploaded template (or falls back to default); returns 422 if none found

**Template types:** WORD | EXCEL | PPT | PDF (PPT added to Phase 1; Phase 2 deferred template versioning)

**is_default per (templateType, commCategoryId):** clearing existing default is done before setting new default (separate UPDATE before INSERT/PATCH).

**Phase 2 (deferred, needs separate approval):** Template version groups, active/inactive version history, default-per-type/category versioning, restore.

## note_text validation

**`note_text` requires summary:** enforced server-side in both POST and PATCH handlers. PATCH reads effective values (merged body + existing row) before checking.

## UI GENERATE_TYPE_MAP

`GENERATE_TYPE_MAP` in offer-comm-register.tsx maps response type keys → template type strings:
`{ create_word: 'WORD', create_excel: 'EXCEL', create_ppt: 'PPT', create_pdf: 'PDF' }`
DocumentPanel accepts `responseType` and `communicationCategoryId` props and uses this map to determine whether to show the Generate button.

## Why raw SQL for category migration and DDL

drizzle-kit push is not used for data migrations, only DDL. Data seed moved to explicit one-time script. DDL for new tables also done raw (drizzle-kit hangs on large schema).
