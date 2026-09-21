---
name: Garthe swarm velocity convention
description: Primary-source velocity definitions must precede reverse holdup/capacity use.
---

Garthe's superficial swarm velocity and relative interphase slip are not interchangeable: v_s = v_rs (1 − φ_d). His drag-ratio hindrance equation has the whole product under a square root; its implicit low-Re limit is superficial velocity proportional to (1 − φ_d)^4.65, not ^2.325.

**Why:** Primary printed p.29 Eqs. 2.37–2.38, p.31 limiting equations, and p.126 Eq. 8.3 were visually verified during method selection. Treating the swarm output as relative slip changes both operating-holdup and capacity equations. A model turning-point holdup is also not operating holdup.

**How to apply:** Recheck source definitions before implementing any swarm/capacity amendment. Reports and primary source copies are in deliverables/rrbo-hydraulic-method/. The user approved the conditional pre-pilot chain, both interface scenarios, C32 sensitivity, and 70% modeled-capacity loading on 2026-09-21; numeric regime diagnostics are not evidence of qualification. Preserve approved preliminary screening separately from scientific qualification.

Review-only scientific amendments must not change active authority version/hash constants, including downstream hashes.

**Why:** Even without database writes, changing the current engine identity excludes existing saved authority from lookup/admission. Permission to implement and test a new model is not permission to retire the current design.

**How to apply:** Keep review identity/entry points separate until an explicitly authorized replacement calculation. Check downstream authority admission and hashes with pure or mocked tests, not just input immutability.