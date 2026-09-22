---
name: Scientific snapshot read isolation
description: Large scientific revisions need consistent read-only snapshots without exclusive reader locks.
---

Read-only scientific views must not hold exclusive owner-row locks while hydrating large frozen results. All authority reads in one validation must share the same transaction snapshot; mutations retain their locking and expected-source checks.

**Why:** Concurrent drawing and PDF reads timed out against exclusive reader locks while processing a roughly 50 MB saved scientific revision. Mocked database tests did not reproduce this real-data contention.

**How to apply:** Use consistent read-only transactions, fetch only the required heavy revision, and inspect lightweight metadata before hydrating candidates. Verify concurrency against real development snapshots without modifying them. Frozen historical downloads need ownership and integrity verification, not current upstream recalculation; label their currentness as not rechecked.