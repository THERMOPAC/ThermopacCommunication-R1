# Predictive N_T queue integration isolation

`ecr-pre-pilot-nt-job.test.ts` replaces only the database module, not the queue
implementation. Each Vitest suite process creates a UUID-named PostgreSQL schema
using the development database connection. It requires schema-creation privileges,
but no existing users, designs, or queue tables.

Every test-pool connection starts with **only** that schema in its search path.
Users, numbering counters, serial sequences, designs, jobs, history, and queue
triggers belong to that schema. The small identity/allocation fixture mirrors the
foundation tables in `shared/schema.ts`; queue DDL comes from the production
migration. Missing tables fail rather than resolving to engineering tables.

Teardown stops polling, terminates remaining test children, waits for persistence,
closes the pool, and drops the exact generated schema. It verifies removal.
Initialization failure also invokes cleanup. No historical rows are selected,
updated, or deleted, and no engineering project numbers are consumed.

Run via `npm run validate:predictive-nt-release` (requires an already packaged
`dist`), or run the queue test directly with Vitest. A hard process kill cannot
execute JavaScript teardown: it can leave an isolated `test_predictive_nt_*`
schema, but never places test designs in the normal engineering tables. Do not
delete old public-schema projects by name; their ownership cannot be inferred.