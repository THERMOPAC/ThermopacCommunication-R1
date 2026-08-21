---
name: ECR-2 five-component local transfer
description: Governing rule for preserving the complete NRTL component order in local mass-transfer calculations.
---

The ECR-2 local mass-transfer kernel must retain all five frozen thermodynamic
components—Sat, Mono, Di, Poly, and NMP—through diffusivity provenance,
Schmidt numbers, concentration conversion, local rates, and conservation
checks.

**Why:** A four-component loop silently omits NMP from local transfer and
invalidates five-component conservation before any axial solver can safely use
the local kernel.

**How to apply:** When adding or changing a local-transfer input, output, or
test, verify that it preserves this exact five-component order and that NMP
receives the same provenance validation as the pseudo-components. This rule
does not imply a change to the existing preliminary-governance labels.