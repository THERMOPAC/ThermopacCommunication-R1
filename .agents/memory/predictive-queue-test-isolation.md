---
name: Predictive queue test isolation
description: Why queue regressions must not use engineering identities or project numbering.
---

Queue regressions require separate PostgreSQL namespaces, not a test-name prefix
on ordinary engineering projects.

**Why:** Project allocations and job history are permanent audit records. Row
cleanup conflicts with append-only evidence, and shared counters consume real
engineering numbers even if test designs are later deleted.

**How to apply:** Keep test users, counters, sequences, and immutable history in
the same disposable namespace, with no public search-path fallback. Never infer
that historical public-schema records are disposable from their names.