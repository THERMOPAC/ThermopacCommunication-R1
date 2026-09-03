---
name: Predictive N_T cancellation
description: Cross-process rule for safely stopping queued or running predictive solver jobs.
---

A user stop request must first move the job to a terminal database state, clear its claim and lease, and record audit history. Every lease-owning process must treat failure to renew its exact job-and-claim pair as a signal to terminate its own Python child.

**Why:** The HTTP stop request and solver child may run in different application processes. A process-local child map alone can report success while the real solver continues consuming CPU.

**How to apply:** Keep immediate local child termination as an optimization, but always enforce cooperative cross-process termination through persisted claim/status state. Late worker close handlers must remain claim-token guarded so they cannot overwrite a stopped job.