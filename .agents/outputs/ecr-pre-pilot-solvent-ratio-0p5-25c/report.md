# Six-Component Counter-Current NMP/RRBO Extraction

**Research-only · calibration-required · non-pilot-validated · non-release-eligible**

Oil feed enters Stage 1; raffinate flows toward Stage N. Fresh NMP enters Stage N; extract flows toward Stage 1.
Every stage simultaneously solves six component balances and six activity-equality equations. No fixed K values or constant-flow approximation is used.

## 25°C

**Stage requirement:** `NO_ACCEPTED_SOLUTION_FOUND_WITHIN_NT_LIMIT_MULTISTART_OR_HIGHER_TRIALS_UNRESOLVED`

| NT | Primary closed | Both starts closed | Accepted | SAT wt% | Aromatics wt% | PA wt% | Recovery % | NMP in raffinate wt% |
|---:|:---:|:---:|:---:|---:|---:|---:|---:|---:|
| 1 | YES | NO | NO | 90.0399 | 8.9694 | 0.9907 | 91.2224 | 7.2497 |
| 2 | YES | NO | NO | 92.1753 | 7.2520 | 0.5727 | 88.6024 | 6.9455 |
| 3 | YES | NO | NO | 93.3387 | 6.3059 | 0.3553 | 87.2179 | 6.7866 |
| 4 | YES | NO | NO | 94.0502 | 5.7203 | 0.2296 | 86.3854 | 6.6913 |
| 5 | YES | NO | NO | 94.5146 | 5.3332 | 0.1522 | 85.8475 | 6.6296 |
| 6 | YES | NO | NO | 94.8308 | 5.0664 | 0.1028 | 85.4834 | 6.5877 |
| 7 | YES | NO | NO | 95.0529 | 4.8768 | 0.0703 | 85.2288 | 6.5583 |
| 8 | NO | NO | NO | 95.2518 | 4.6779 | 0.0704 | 85.0109 | 6.5283 |
| 9 | NO | NO | NO | 95.4176 | 4.5120 | 0.0705 | 84.8378 | 6.5022 |
| 10 | NO | NO | NO | 95.5458 | 4.3838 | 0.0704 | 84.7043 | 6.4841 |

- Primary coupled equation closure passed for NT = [1, 2, 3, 4, 5, 6, 7].
- Primary coupled equation closure failed for NT = [8, 9, 10].
- Both deterministic starts closed for NT = [].
- Every candidate raffinate and extract has a complete five-dimensional tangent-Hessian eigenspectrum from free-energy differences and an independent chemical-potential-Jacobian reconstruction, with three persisted step sizes.
- Every post-split TPD search combines global simplex seeds with explicit local perturbations around the returned phase.
- Stability evidence covers 110 phases: minimum tangent eigenvalue = 2.596618e-04; minimum post-split TPD = -7.484057e-01.
- Formal stability failures: negative TPD = 110; step-size convergence = 0; independent reconstruction agreement = 0.
- Any negative tangent eigenvalue, derivative-reconstruction disagreement, or negative post-split TPD formally downgrades that stationary phase pair; all product metrics remain diagnostic only.
- Recovery and NMP-carryover targets fail throughout the closed series, so no accepted NT exists within 10 stages.

Complete incoming/outgoing flows, six-component mole/mass profiles, K values, acceptance blockers, and closure residuals for every stage are in `results.json`.

## Governance decision

`FULL_SIX_COMPONENT_MODEL_QUALIFICATION = NOT_QUALIFIED`

These cascade values are numerical research diagnostics, not validated process-design results. The prior single-stage stationary split is not accepted as a stable phase pair unless the full tangent-Hessian and locally seeded TPD gates pass. The frozen blind LLE composition-RMSD verdict remains failed and unchanged. Sulfur remains `NOT_CALCULABLE`; PA transfer is provisional and is not sulfur removal.
