---
name: ECR Pre-Pilot thermodynamic model selection
description: Select the LLE model by demonstrated reproduction of relevant evidence, not by making NRTL mandatory
---

## Rule
Do not currently develop NRTL as the governing thermodynamic model for the ECR Pre-Pilot simulator. NRTL remains an evaluated candidate, but the next governing-model work must compare or develop alternatives and select the method that reproduces relevant LLE evidence reliably over the intended temperature, composition, and component domain. This work is isolated from legacy LLX routes, code, assumptions, and governance. Polar Aromatics remains an explicit Stage 1 feed component in the six-component process basis; a first five-component Dortmund benchmark may exclude it only as a temporary thermodynamic-coverage limitation, never as a generic external quality parameter.

**Why:** the existing NRTL regression exposed a representability and validation gap before the simulator was built around it; hard-coding NRTL would convert a useful finding into a weak foundation. The product is a predictive pre-pilot simulator, so absence of pilot validation or weak benchmark accuracy must reduce confidence and release eligibility without suppressing a converged, physically admissible prediction.

**How to apply:** use only the ECR Pre-Pilot six-component process basis, Stage 1 inputs, and explicitly admitted external evidence. Preserve Polar Aromatics in feed, mass-balance, quality, and optimization vectors even when the initial thermodynamic benchmark cannot yet calculate its LLE partitioning. Compare candidate models using direct and analogue LLE evidence, held-out temperatures/feed compositions, phase-topology and tie-line behavior, distribution/selectivity trends, and physical admissibility. Return a converged, physically valid result as `PREDICTIVE`, `PRELIMINARY`, or `EXTRAPOLATED` according to its evidence; benchmark error changes confidence and limitations, not calculability. Reserve `NOT_CALCULABLE` for missing required model parameters, an undefined selected-component representation, or a nonphysical/non-converged calculation. Never silently fall back, widen tolerances, or fold unresolved Polar Aromatics into another component.

## COSMO-SAC-2010 candidate disposition

Do not use the NIST cCOSMO COSMO-SAC-2010 route with the admitted University of Delaware sigma profiles as the ECR Pre-Pilot governing LLE model.

**Why:** it reproducibly predicts a homogeneous liquid rather than the observed NMP/hydrocarbon liquid split across the admitted direct and multitemperature evidence. It therefore cannot produce defensible tie-lines or sulfur partitioning, even though the molecular inputs and calculations are reproducible.

**How to apply:** retain the benchmark as rejection evidence. Do not reinterpret unit distribution coefficients from a homogeneous state as partition data, and do not proceed to NT, hydrodynamics, sizing, simulator, or optimizer work using this candidate.

## openCOSMO-RS candidate disposition

Do not use the tested openCOSMO-RS route with LVPP v25 NWChem B3LYP/SVPD surfaces and the unmodified `default_turbomole` parameterization as the governing ECR Pre-Pilot LLE model.

**Why:** the genuine, reproducible molecular calculation produced no accepted two-liquid outcome across the admitted direct and multitemperature benchmarks. The NWChem-surface/Turbomole-parameterization mismatch is an additional limitation, but the governing rejection is the failure to reproduce observed liquid-phase topology.

**How to apply:** retain the benchmark as rejection evidence and keep all phase split, distribution, selectivity, and sulfur-recovery outputs null. Do not tune COSMO-RS parameters against these datasets under the guise of prediction. Any future molecular route requires a QC-compatible parameterization and must pass the topology gate independently.