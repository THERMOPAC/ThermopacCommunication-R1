---
name: Offline scientific execution
description: Durable supervision and truthful disposition of long, isolated research calculations.
---

Launch long offline scientific calculations as managed background tasks, not detached processes inside a one-shot helper shell. A saved RUNNING status is not proof that its process is still alive.

**Why:** Detached launchers and their workers disappeared before producing evidence while the cgroup reported no OOM events. That did not establish resource exhaustion, a numerical failure, or physical infeasibility. The exact external termination cause was not proven.

**How to apply:** Capture the actual background-task identifier returned by the main execution tool, retain source-bound input/output records, and reconcile terminal status with the process outcome. Cancellation and deadlines must terminate the entire scientific process group even if its leader has already exited; test a TERM-resistant descendant that has closed standard streams. Preserve interrupted artifacts and record the observed cause separately. Do not reinterpret missing evidence as a completed scientific result or invent a resource-limit explanation.

Inspect active scientific workers with bounded, nonblocking, out-of-process sampling rather than changing their runtime or installing project dependencies during the run.

**Why:** Dependency installation can restart workflows and destroy the calculation being investigated. CPU activity and a renewed lease prove activity, not numerical convergence; a short live stack sample can distinguish expensive computation from waiting without changing the scientific model.

**How to apply:** Keep diagnostic tools isolated from the project dependency environment, use the package firewall for downloads, avoid pausing the worker or collecting local-variable values, and correlate sampled stacks with the job record. State the sampling window explicitly; never turn hotspot percentages into percentage-complete estimates.

Job-C qualification is intentionally allowed to finish without a wall-clock cap, independently of the nonlinear solver's bounded runtime.

**Why:** The user explicitly requested removal of the qualification deadline after it stopped legitimate contact qualification before the column solver began. This trades bounded qualification time for potentially longer, cancellable runs, not weaker scientific acceptance.

**How to apply:** Do not reintroduce an implicit qualification deadline through a whole-job watchdog. Keep cancellation and lease-loss termination active, and report elapsed time separately from convergence or acceptance.