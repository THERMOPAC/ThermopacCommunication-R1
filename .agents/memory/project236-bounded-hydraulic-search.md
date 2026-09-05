---
name: Project 236 bounded hydraulic search
description: Approved governance for research-only actual-full-scale-speed optimization of the Project 236 Kühni hydraulic screen.
---

Project 236 may use a research-only bounded actual-machine search with:

- \(0.43 \le D_R/D_C \le 0.69\)
- \(0.45 \le H_C/D_C \le 0.69\)
- \(0.94 \le D_R/H_C \le 1.21\), enforced simultaneously
- actual full-scale speed from 5 to 60 rpm
- tip speed no greater than 4.5 m/s at every candidate
- no arbitrary fixed upper diameter bound; each candidate's diameter ceiling comes from the tip-speed constraint

These are literature-derived/project-declared diagnostic search bounds, not validated full-scale design limits. Production code and historical runs remain unchanged until a diagnostic result is separately reviewed.

**Why:** The user explicitly approved these bounds after fixed-speed calculations showed that unrestricted diameter roots can become physically meaningless. A bounded actual-machine search must remain distinct from the accepted constant-\(P/V\) comparison scenario.

**How to apply:** Preserve the frozen Project 236 Stage-1 basis and equation chain, enforce all bounds together, retain extrapolation labels, reject undefined or physically impossible states, and return the diagnostic for review before persisting any selection.