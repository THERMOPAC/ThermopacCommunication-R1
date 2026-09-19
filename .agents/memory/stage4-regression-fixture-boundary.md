---
name: Stage-4 regression fixture boundary
description: Mutable persisted designs and retired research workloads need explicit regression baselines.
---

A code checkout does not freeze the database. A persisted design previously used
to prove missing authority may later acquire a valid current optimizer; isolate
the absent-authority input instead of treating that design's identity as proof
that resolution must fail.

**Why:** A historical-rejection regression failed even on unchanged source
because the saved design legitimately gained current HETS optimizer authority.
Changing the service to satisfy the stale assertion would have broken the
approved operational path.

**How to apply:** Reproduce against unchanged source, record database-state
assumptions, and exercise both current-authority admission and missing-authority
rejection explicitly. Do not substitute historical geometry or change scientific
thresholds to make a state-dependent assertion pass.