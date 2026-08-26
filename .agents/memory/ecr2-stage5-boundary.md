---
name: ECR-2 vs Stage 5 hydraulic boundary
description: Confirmed separation between generic Stage 5 screening and governed ECR-2 hydrodynamics.
---

Stage 5 Common Hydraulic Design is generic preliminary C3 screening only. It must not unlock, govern, or supply the hydrodynamic basis for ECR-2. Stage 8 ECR-2 may consume only an independently approved ECR RRBO/NMP hydrodynamic route.

**Why:** Stage 5 includes generic slip/diameter screening and an optional legacy packing pressure-drop branch; neither is an ECR agitated-column hydrodynamic validation. Using it for ECR-2 would turn preliminary or obsolete packing evidence into a production BVP, height, recovery, or stage-count result.

**How to apply:** Keep `hydraulics_common`, `ecr`, and `ecr_simulator` as separate calculation paths. When mapping Stage 5 for an ECR-selected revision, strip stale packing pressure-drop inputs and never substitute the C3 result for ECR-2 holdup, transfer, or sizing dependencies.