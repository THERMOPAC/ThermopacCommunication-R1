---
name: C4 packed-column engine governance
description: Binding rules for the common packed-column (ECP) engine and Packing Database
---
- Engine `llx-ecp` consumes packing data via Packing Database module; registry ships EMPTY and returns structuredClone snapshots (immutability is a review-mandated invariant).
- Performance bases: table/polynomial (interpolation only, extrapolation refused) or constant with applicabilityNote; finite-value checks enforced in validation AND evaluation.
- Engine enforces curve semantics: capacity curves must be vs 'flowRatioDispersedToContinuous', wet Δp vs 'totalLiquidLoad' — blocked otherwise.
- ECP utilization comes ONLY from Vendor Packing Capacity × derating (never the C3 generic throughput %); missing capacity ⇒ pending_validation, not blocked.
- HETS is SYSTEM data (solvent+feed+packing+temperature record), never defaulted; heightBasis 'HTU_NTU' reserved/rejected; rate-based outputs are null placeholders.
- **Why:** user-approved 10 refinements are binding for ALL future packed-column reuse (distillation/absorption/stripping) — only the mass-transfer model may change.
- **How to apply:** any future packed-column module must reuse llx-ecp hydraulics and these data-governance rules unchanged.
