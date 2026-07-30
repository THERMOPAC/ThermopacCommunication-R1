---
name: CREATE_PROJECT_STRUCTURE Windows Agent Job
description: Architecture and implementation decisions for the folder-creation job triggered on SOR project creation.
---

## Rule
When a new SOR project is created, a CREATE_PROJECT_STRUCTURE job is enqueued to create the standard folder tree on the Windows network share.

## Path format
`TPEL/{CC}/{CO}/{Cust}/{FY}/{projectSeq}` — `project_seq` stores the full value e.g. `SOR_018`, no prefix needed.
`Cust` built via `buildCustToken(bp_code, bp_name)` from `server/utils/cust-token.ts`.

**Why:** `buildEpcGcsPath()` uses `${projectSeq}` directly; project_seq column stores `SOR_018`.

## Two enqueue call sites (post-COMMIT only)
- `server/project-routes.ts` — after `db.transaction()` resolves, non-blocking `.catch()`
- `server/offer-conversion.ts` — after `client.query('COMMIT')`, try/catch

**Why:** Job insert must never roll back the project row. These are the only two live project-creation paths.

## Shared service
`server/services/project-structure-job-service.ts` — `enqueueProjectStructureJob(projectId, userId)`

## Eligibility
project_type = 'SOR' AND status NOT IN ('draft','cancelled','on_hold') AND all path tokens non-null AND bpCode present AND active STANDARD_EPC template exists with items.

## Duplicate prevention
Service-level SELECT before INSERT: blocks if pending/claimed job exists for same project.
Two partial unique DB indexes: `uq_create_structure_pending`, `uq_create_structure_claimed`.
Failed/completed jobs remain as history; failed jobs are re-enqueueable.

## Folder template
DB tables: `project_folder_templates` + `project_folder_template_items`.
Template `STANDARD_EPC` seeded with 51 folders (43 explicit + 8 implicit parents), sort_order spaced by 10.
Folder list is SNAPSHOTTED into `document_agent_jobs.input_payload` at enqueue time — agent never queries DB.

## New DB column
`document_agent_jobs.input_payload JSONB` — added via raw SQL migration (drizzle-kit push hangs on this schema).

## Windows Agent
- `api-client.ts`: `inputPayload` added to `AgentJob` interface
- `path-guard.ts`: `validateFolderSegment()` added — checks traversal, absolute, tokens, Windows invalid chars, empty segments
- `job-runner.ts`: `CREATE_PROJECT_STRUCTURE` case — validates root path, creates root, iterates folders, tracks created/existing/errors, idempotent via `mkdirSync({recursive:true})`
- Job result: `success` if `errors.length === 0`; partial failure preserves created/existing, allows safe retry

## Assembly paths
Not included in V1 by user decision.
