---
name: ECR-2 ideal-cascade two-basis architecture
description: Governs physical mass/mole closure versus the Coto NRTL coordinate in ECR-2 ideal-stage cascades.
---

ECR-2 ideal-stage cascades must remain fail-closed until a governed mapping establishes how each project RRBO pseudo-component is represented in the Coto NRTL component-mole coordinate. Neither physical pseudo-component MW mole fractions nor Coto surrogate-MW mole fractions can currently be treated as a validated physical ECR-2 NRTL material balance.

**Why:** the Coto NRTL parameters are fitted to n-dodecane/xylene/methylnaphthalene/pyrene/NMP mole fractions, while RRBO classes are distinct, broad physical pseudo-components with different MWs. The one-to-one class analogy is a screening analogy, not an experimentally supported pseudo-mole↔surrogate-mole conversion. The historical 61.0131% and 53.6715% N=1 recovery figures arise from two different unvalidated coordinate bridges.

**How to apply:** expose both feed-coordinate vectors and component MW pairs, return `THERMODYNAMIC SURROGATE-TO-PHYSICAL MAPPING NOT CLOSED`, and calculate no ideal-stage NRTL recovery or N_T. A future mapping must define the conserved quantity and phase-flow transformation, then be independently evidenced or calibrated; do not change NRTL parameters, operating conditions, BVP, K&H, d32, or hydraulics to reconcile the result.