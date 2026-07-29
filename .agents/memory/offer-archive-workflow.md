---
name: Offer Archive Workflow
description: Architecture and gotchas for the offer save → auto-archive pipeline (all three quotation PDFs archived on every create/update).
---

## Architecture

Every `POST /offers` or `PATCH /offers/:id` now runs a full archive pipeline:
1. Create/update offer with `status = 'archiving'`
2. Upsert items (stable IDs via tempKey convention)
3. Run `runDocumentArchive()` from `server/utils/document-archive-engine.ts`
4. On success: set `status = 'Draft'` (or original status) and increment revision
5. On failure: restore snapshot + set `status = 'archive_failed'`

New tables: `offer_archive_revisions` (one per save transaction), `quotation_pdf_artifacts.archive_revision_id + action_type`.

New utility: `server/utils/document-archive-engine.ts` — `DocumentArchiveStrategy` interface, `QuotationArchiveStrategy` class, `runDocumentArchive()`, `rollbackDocumentArchive()`.

New function in `quotation-pdf-artifact.ts`: `storeQuotationPdfArtifactBlocking()` — mirror failure throws (blocking contract required for archive integrity).

## Key gotchas

**Why:** Production correctness requires these precise patterns.

### `pg_advisory_xact_lock` requires a dedicated client
`pool.query('BEGIN')` spreads queries across pool connections — the lock and subsequent queries may land on different sessions. Must use `pool.connect()` to get a dedicated client and run all transactional queries on it.

### `upsertOfferItemsWithHierarchy` client parameter
Function accepts an optional `client` parameter. When a locked client is passed (PATCH transaction), all item queries run on that client. When `null`/undefined (POST flow, no lock needed), falls back to `pool.query()`.

### tempKey convention for existing vs new items
- `tempKey = String(item.id)` for existing DB items (numeric string = existing row ID)
- `tempKey = crypto.randomUUID()` for new items (UUID string = new insert)
- `parentTempKey` follows the same convention for hierarchy resolution

### Migration execution: use Node.js pool, not psql
`psql "$DATABASE_URL"` connects to the same database as the server but DDL run via psql may not be visible to the Neon serverless pool (different WebSocket routing). Always run schema migrations via the server's actual pool using `@neondatabase/serverless` to guarantee visibility.

### Revision increment timing
`offers.revision` is NOT incremented until after archiving succeeds. The `offer_archive_revisions` table stores the target revision so the scheduler's crash recovery can read it back.

### Stuck-offer recovery (Pass 3 in scheduler)
Case A (3 active artifacts + 3 mirror jobs): archive was complete, status UPDATE crashed → auto-recover.
Case B (partial): mark `archive_failed` for admin retry.
Case C (no artifacts): mark `archive_failed` immediately.
All transitions logged at INFO level; nothing silently changes.

### Retry endpoint
`POST /offers/:id/retry-archive` — Manager+ only. Reads the most recent failed `offer_archive_revisions` row for revision + action_type, then re-runs the full archive. On success, writes revision + activates status.
