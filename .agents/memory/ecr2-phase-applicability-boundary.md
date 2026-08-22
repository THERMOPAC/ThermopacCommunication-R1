---
name: ECR-2 phase applicability boundary
description: How unsupported phase orientations must report Phase-1 d32 while remaining outside the governed BVP path.
---

Unsupported ECR-2 phase orientations must retain their explicit Phase-1 d32 applicability/safety result (including an engineer-supplied d32 where provided), but the counter-current five-component BVP must return a structured `phase_configuration` dependency block unless the configuration is NMP-continuous/RRBO-dispersed.

**Why:** Suppressing the whole result for an unsupported BVP orientation hides the d32 applicability signal engineers need to see. Letting the solver proceed would imply approval for an ungoverned flow direction.

**How to apply:** Treat phase orientation as a BVP execution gate, not a global engine-data gate. Keep the result payload and its d32/interfacial diagnostics available, label the BVP not accepted, and retain regression coverage for both behaviors.