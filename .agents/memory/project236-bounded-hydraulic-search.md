---
name: Project 236 bounded hydraulic search
description: Approved governance for diagnostic actual-full-scale-speed optimization within the production Project 236 Kühni workflow.
---

Project 236 may use a bounded diagnostic actual-machine search within its production workflow with:

- \(0.43 \le D_R/D_C \le 0.69\)
- \(0.45 \le H_C/D_C \le 0.69\)
- \(0.94 \le D_R/H_C \le 1.21\), enforced simultaneously
- actual full-scale speed from 5 to 60 rpm
- tip speed no greater than 4.5 m/s at every candidate
- no arbitrary fixed upper diameter bound; each candidate's diameter ceiling comes from the tip-speed constraint

These are literature-derived/project-declared diagnostic search bounds, not validated full-scale design limits. Project 236 has no separate research system: diagnostic and held calculations belong to the production workflow, but they do not become selected operating values until approved.

The final equipment is a multistage counter-current Kühni/ECR column. Isolated-drop, compartment, swarm, and flooding calculations are local submodels that must remain compatible with the eventual multistage column architecture; they are not an isolated stirred-vessel or single-contactor design.

**Why:** The user explicitly approved these bounds after fixed-speed calculations showed that unrestricted diameter roots can become physically meaningless. A bounded actual-machine search must remain distinct from the accepted constant-\(P/V\) comparison scenario, but both are production-workflow calculations. Treating local hydrodynamics as the final equipment model could produce equations or transitions that cannot support counter-current multistage operation.

**How to apply:** Preserve the frozen Project 236 Stage-1 basis and equation chain, enforce all bounds together, retain extrapolation labels, reject undefined or physically impossible states, and return the diagnostic for review before persisting any selection. Audit every new local drag or holdup relation for its role and compatibility in a compartmented multistage Kühni/ECR column.