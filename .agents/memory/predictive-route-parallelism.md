---
name: Predictive route parallelism
description: Deterministic and cancellation-safe multiprocessing rules for expensive Predictive N_T thermodynamic searches.
---

Parallelize only independently reproducible route families. Sequential cascade sweeps, trial progression, clustering, polishing, and classification remain serial. Collect parallel results by immutable route index and restore canonical order before any selection.

**Why:** Python threads made identical TPD results slower, while forked processes gave useful scaling. Naive short-lived forks discarded valuable thermodynamic caches, and unmanaged descendants could survive cancellation or hang the parent after a route failure.

**How to apply:** Fork from the already initialized model, return only exact composition-keyed cache additions, merge them into a bounded parent cache, and keep timing outside canonical trial payloads. Every wait must monitor child liveness; SIGTERM and error paths must terminate and reap all descendants.