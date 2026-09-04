---
name: Predictive job contract rollover
description: How engine-version changes interact with already-enqueued Predictive N_T jobs and server restarts.
---

**Rule:** A Predictive \(N_T\) job’s input snapshot and engine hash are immutable. Restart/reclaim must continue that exact historical worker; it must never upgrade an existing job to the current engine.

**Why:** A job enqueued immediately after a code merge but before the running server restarted was stamped with the prior engine contract. After restart, the current service correctly resumed the historical worker, so its output looked stale even though the source tree and active preflight had the new engine.

**How to apply:** After an engine-contract rollout, inspect the job’s persisted contract and hash, not the repository HEAD or submission wall-clock alone. Stop and resubmit any pre-restart job that is expected to use the new engine. Verify the replacement job carries the new contract and preflight hash before interpreting its scientific output.