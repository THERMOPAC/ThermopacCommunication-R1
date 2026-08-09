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

## ECP-009/ECP-010 dry pressure-drop framework (engine v1.1.0, Duss 2013)
- Only explicitly published equations implemented (CEL `cel/packing-single-phase.ts`): dh=4/a; Re=u·ρ·dh/η (superficial basis); Fv=u·√ρ; Δp/Δz=cf·ρ·u²/(2dh); f=16/Re is PIPE reference only — NEVER a packing cf (packing laminar cf ~10× higher, Zogg).
- The paper publishes NO packing cf(Re) correlation; its tabulated cf values are vendor-SOFTWARE outputs, excluded by directive. cf must come from packing record `frictionFactorData` (constant or curve vs phaseReynoldsNumber, interpolation only) plus MANDATORY `frictionFactorProvenance` ∈ {measured, controlled_literature, vendor_document} — vendor_software has no permitted value.
- Flow regime only vs published anchors (45°→Re_crit≈250, 30°→≈450, Zogg); no angle: Laminar only when Re < 250 (bounding), else Not Determinable. No interpolation over angle.
- EVERY pressure-drop quantity (incl. Not Calculable dispositions and ECP-010 back-calc cf) carries immutable field `pressureDropClassification` = "Preliminary Pressure Drop Prediction — Pending RRBO/NMP Validation" — LLX liquid-liquid duty is OUTSIDE the paper's gas-phase validated range (mandatory ECP-010 range statement).
- Dry framework NEVER substitutes the vendor WET basis (ECP-007).
- New DRR report type (design-review-report.ts) reviews capability/gaps/dispositions; NOT a PCB part.
- Regression case 3 (llx-ecp) deliberately re-baselined to the v1.1.0 run; harness scripts must call registerPreliminaryPackingRecords() or the packingId lookup blocks the run (false failure).
