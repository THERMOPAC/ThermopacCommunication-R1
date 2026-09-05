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

`KUHNI_GEOMETRY_RESOLVER_V1.0.0` is the approved target architecture, with these additional boundaries:

- Only diagnostic mode may be developed until the required local drop-shape and liquid-drop drag closure is qualified.
- Stage 3 reports the hydraulically admissible RPM envelope and may identify a clearly labelled hydraulic diagnostic point; it must not establish “lowest acceptable RPM” or any other hydraulic-only point as the final operating RPM.
- Final RPM selection belongs to the later coupled assessment that includes mass transfer and compartment efficiency for the multistage Kühni/ECR.
- Column-diameter bounds must be physically or mechanically derived wherever possible; arbitrary bounds must not be introduced.
- Existing Stage-1 and Stage-2 authority, historical Stage-3 results, hashes, and APIs remain unchanged.

**Why:** The user explicitly approved these bounds after fixed-speed calculations showed that unrestricted diameter roots can become physically meaningless. A bounded actual-machine search must remain distinct from the accepted constant-\(P/V\) comparison scenario, but both are production-workflow calculations. Treating local hydrodynamics as the final equipment model could produce equations or transitions that cannot support counter-current multistage operation. Hydraulically admissible RPM is not necessarily the RPM that satisfies later mass-transfer and compartment-efficiency requirements.

**How to apply:** Preserve the frozen Project 236 Stage-1 basis and equation chain, enforce all bounds together, retain extrapolation labels, reject undefined or physically impossible states, and return the diagnostic for review before persisting any selection. Keep governed geometry/RPM selection disabled until drop-shape/drag closure is qualified. Report an RPM envelope plus diagnostic point, and defer final RPM to the future coupled mass-transfer stage. Audit every new local drag or holdup relation for its role and compatibility in a compartmented multistage Kühni/ECR column.