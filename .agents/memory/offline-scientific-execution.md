---
name: Offline scientific execution
description: Durable supervision and truthful disposition of long, isolated research calculations.
---

Launch long offline scientific calculations as managed background tasks, not detached processes inside a one-shot helper shell. A saved RUNNING status is not proof that its process is still alive.

**Why:** Detached launchers and their workers disappeared before producing evidence while the cgroup reported no OOM events. That did not establish resource exhaustion, a numerical failure, or physical infeasibility. The exact external termination cause was not proven.

**How to apply:** Capture the actual background-task identifier returned by the main execution tool, retain source-bound input/output records, and reconcile terminal status with the process outcome. Cancellation and deadlines must terminate the entire scientific process group even if its leader has already exited; test a TERM-resistant descendant that has closed standard streams. Preserve interrupted artifacts and record the observed cause separately. Do not reinterpret missing evidence as a completed scientific result or invent a resource-limit explanation.