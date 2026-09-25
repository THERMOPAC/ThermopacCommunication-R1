---
name: Production read-only query evidence
description: Distinguish a tool success flag from actual PostgreSQL query results.
---

Production read-only zero-row probes can return only `START TRANSACTION` / `ROLLBACK`
with `success: true`; that is not evidence that a requested projection compiled.

**Why:** Missing-column probes produced that wrapper-only result while independent catalog
queries established the columns were absent. Development returned explicit SQL errors.

**How to apply:** Require actual expected headers/results before calling a probe successful.
For schema compatibility, inspect `information_schema` independently and report inconclusive
wrapper-only probes honestly. Never infer schema compatibility from the tool flag alone.