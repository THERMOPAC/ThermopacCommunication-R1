---
name: ECR-2 two-level execution
description: Architectural boundary between pre-pilot predictive calculation and governed release-ready design.
---

ECR-2 must have two explicit execution classes: PRE_PILOT_PREDICTIVE — NOT PILOT VALIDATED, which may calculate defensible preliminary N_T, D, H, holdup, d32, capacity/flooding, recovery, sulfur and operating-envelope outputs with model applicability and uncertainty reported; and GOVERNED_RELEASE, which remains fail-closed until approved evidence and engineering acceptance exist.

**Why:** The simulator is intended to design the pilot, so future pilot validation cannot be a prerequisite for running the predictive calculation. Mixing predictive execution with release acceptance either blocks useful pre-pilot work or risks treating preliminary outputs as release design.

**How to apply:** Use an explicit server-controlled execution mode and separate result/acceptance namespace. Predictive runs may persist auditable snapshots but must never overwrite accepted governed results or satisfy release gates. Structural invalidity and missing required model inputs may block a predictive run; lack of future pilot validation must be reported as uncertainty/status, not treated as process infeasibility.