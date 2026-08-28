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

## Fresh ECR Pre-Pilot NRTL disposition

Do not admit the tested fresh family-level NRTL regression as the governing ECR Pre-Pilot model. This decision applies to the tested fitted form, not to every possible NRTL formulation.

**Why:** after frozen-parameter solver isolation passed, held-out topology recall was 0.60 and mean tie-line RMSD was 0.1289; both fail the unchanged 0.90 and 0.03 gates. Its parameter estimation is also practically ill-conditioned, and the public evidence cannot resolve Polar Aromatics or DI/POLY temperature behavior beyond the Coto anchor.

**How to apply:** retain the five-family benchmark as rejection evidence. Keep governing six-family Stage 2 `NOT_CALCULABLE`, with no sulfur-removal inference. Any later empirical model must use independent holdouts and pass the unchanged topology and composition gates.

## Fresh NRTL solver-isolation boundary

Treat the tested NRTL flash-selection implementation as excluded within its qualified finite-candidate procedure, not as formally globally certified.

**Why:** frozen-hash, no-refit, independent equation/final-phase checks, synthetic recovery, all-basin multistart selection, ambiguity handling, and pre-holdout isolation passed; the resulting holdout metrics worsened.

**How to apply:** do not restore the earlier optimistic holdout metrics or keep tuning this frozen vector. Preserve the finite-candidate—not formal global proof—qualification.

## Fresh ECR Pre-Pilot UNIQUAC disposition

Do not admit the tested standard UNIQUAC regression as the governing ECR Pre-Pilot model. This decision applies to the tested family-interaction form with row-specific Original-UNIFAC structural constants.

**Why:** under the same data split, gates, and qualified finite-candidate solver procedure, held-out topology recall was 0.667 and mean tie-line RMSD was 0.175; both fail. Maximum error was about 0.848. The measurement Jacobian was also seriously ill-conditioned, with nine practically weak directions.

**How to apply:** retain UNIQUAC as independent rejection evidence. Do not use it for sulfur prediction, stage count, optimization, hydraulics, sizing, or release work. Keep Polar Aromatics and sulfur unresolved, and compare future candidates against the same frozen holdout and unchanged 0.03 RMSD gate.

## Molecular representation boundary

Treat the family-global SAT/MONO/DI/POLY interaction representation as inadequate for predictive equilibrium work. Molecular identity or physically meaningful descriptor information is required, but exact molecular-system dummy interactions are not a governing solution.

**Why:** in a controlled same-equation UNIQUAC comparison, molecular-system indexing materially improved composition on the identical 110-row valid-topology support, but it accepted only about half the phase splits, was severely ill-conditioned, and could not predict unseen molecular systems. This separates composition-representation information from overall model adequacy.

**How to apply:** preserve explicit molecular identities in admitted evidence and develop a hierarchical molecule/descriptor representation that shares parameters through carbon number, aromatic topology, branching/cycloalkane status, condensation, polarity/heteroatoms, and explicit sulfur identity. Require preregistered temperature and unseen-system holdouts to pass both topology and composition gates before simulator use. Do not deploy pair-specific dummy parameters or infer sulfur removal from aromatic transfer.

## Heavy-aromatics temperature boundary

Keep DI/POLY transfer away from 298.15 K fail-closed. Heating used to dissolve a heavy aromatic during sample preparation is not equilibrium-temperature evidence, and monoaromatic temperature trends cannot supply DI/POLY slopes.

**Why:** the admitted Coto system provides one DI identity and one POLY identity at one equilibrium temperature. For an interaction form `a+b/T`, that gives rank 1 of 2, so intercept and temperature slope are structurally confounded. The existing hierarchical descriptor fit did not estimate ring-count or condensation effects and was itself rejected.

**How to apply:** do not calculate off-anchor DI/POLY partitioning, sulfur transfer, stage count, optimization, or sizing from the current evidence. Require direct conjugate-phase NMP measurements at multiple operating temperatures and multiple DI/POLY identities, followed by independent topology and tie-line qualification.