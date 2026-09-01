# Stability–accuracy causal audit

Research only. No production/model/solver file or parameter was changed, and no candidate model is proposed or admitted.

## Exact proofs

- All 512 endpoint hybrids were enumerated. At the 57 frozen genuine states, TPD and activity-equilibrium residuals are exact affine forms in the nine coefficients (floating-point reconstruction error 1.22e-15). Exact Shapley values exhaust all coalitions.
- Task206 only partially stabilizes the later 57-state set: stable 0→47, minimum TPD -0.781179→-0.042868.
- The minimum-TPD change is dominated jointly by reductions in A_MONO_NMP_ref and A_SAT_MONO_ref: exact Shapley contributions +0.375971 and +0.374181; other terms largely offset or are negligible.
- Unchanged validation_metrics proves no observed Task206 stability-versus-LLE-accuracy trade-off between the endpoints: composition RMSD training 0.350245→0.276929, temperature holdout 0.078565→0.070372, molecular holdout 0.069442→0.057213. All six endpoint values remain above 0.03.
- Unconstrained training activity-equilibrium least squares has rank 9, condition number 234.894, and global minimum RMS 0.219422895586. Thus its misfit is irreducible for this exact affine nine-parameter model/objective even without stability constraints. This is not a mathematical lower bound on composition RMSD.

## Strongly supported interpretations (not exact proofs)

Error localization under the unchanged fixed-point validation algorithm concentrates error in low-temperature heptadecane + pentylbenzene/propylbenzene rows and in MONO/NMP. The failure predates Task206 and is strongly supported as model-form/data-transfer mismatch: one universal SAT/MONO/NMP correction has no molecular-system identity dependence.
The remaining negative basin is the same systematic MONO-rich basin already proven to arise from the residual amendment. Native COSMO-SAC is not claimed globally stable outside the governed search.

## Scope and decision

Exact claims above concern exhaustive hybrids at fixed states, affine activity residuals, and unchanged endpoint validation. Interpretations are explicitly non-proof. No production change or candidate model is proposed/admitted.
