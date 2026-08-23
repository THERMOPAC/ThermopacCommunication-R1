---
name: LLX product-quality basis
description: Boundary between Coto/NRTL full-phase LLE aromatics and NMP-free commercial raffinate product-quality reporting.
---

Use two explicitly separate aromatic-quality bases:

- `x_A,R^LLE` is the historical thermodynamic value: Mono + Di + Poly divided by the complete five-component phase vector, including NMP.
- `x_A,R^product` is the commercial hydrocarbon-only molar value: Mono + Di + Poly divided by Saturates + Mono + Di + Poly.
- `w_A,R^product` is the commercial hydrocarbon-only mass value using the same hydrocarbon-only denominator.

**Why:** residual NMP dilutes a full-phase equilibrium composition but is not product oil. Letting NMP appear in either product denominator would make solvent carryover appear to improve product quality and would silently change the meaning of the governed Coto/NRTL quantities.

**How to apply:** Preserve existing C2/Coto LLE fields and calculations unchanged. Add product-quality data only at a physical raffinate/reporting boundary; ECR-2 product values must derive from the BVP physical raffinate outlet and retain its preliminary/non-release-eligible status.