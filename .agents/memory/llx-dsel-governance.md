---
name: LLX DS-SEL autonomous design selection governance
description: Deterministic selection rules, decision-record semantics, and prohibitions for the LLX autonomous design selection layer
---
DS-SEL is the autonomous Process Design Engineer layer: consumes frozen ECP/ECR run snapshots verbatim (never recomputes), applies deterministic rules DS-SEL-001…005.
**Rules:** D_min formula → round UP to 50 mm only → smallest feasible increment with utilization ≤ limit (default 0.80) → capacity hierarchy Vendor > Pilot > ECP preliminary threshold 60 m³/(m²·h) (Sulzer SMV/SMVP screening upper bound, Rauber AIChE 2006, Assumed) → cascade feasibility → direct flooding-margin comparison (exact values, NO tie band) → ΔP only when validated for all.
**Prohibitions (user-negotiated, 3 revision rounds):** NO weighted scoring, NO CAPEX/OPEX, NO confidence tie-breaks (confidence = data maturity info only), no invented preference. Residual tie ⇒ exact text "Multiple technically acceptable solutions identified. Engineering review required."
**ECR:** packing threshold is NOT transferable to agitated columns — ECR gets NO basis (Not Recommendable with declared reason) unless `ecr_validated_flooding_capacity` input entered. C3 generic % never a substitute.
**Records:** superseded-not-edited; regenerated automatically after every ecp/ecr run (non-fatal hook). Engineer actions only Approve / Request Verification / Override (mandatory engineer + reason; autonomous values retained; impact read from frozen evaluation table).
**Why:** strict reviewer rejected any softening/invention; determinism and exact citations are the acceptance criteria.
**How to apply:** any change to selection logic must stay deterministic, keep exact review-required wording, and never let confidence or invented preferences influence selection.
