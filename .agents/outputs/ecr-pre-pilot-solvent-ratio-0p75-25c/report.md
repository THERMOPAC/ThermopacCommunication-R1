# Six-Component Counter-Current NMP/RRBO Extraction

**Research-only · calibration-required · non-pilot-validated · non-release-eligible**

Oil feed enters Stage 1; raffinate flows toward Stage N. Fresh NMP enters Stage N; extract flows toward Stage 1.
Every stage simultaneously solves six component balances and six activity-equality equations. No fixed K values or constant-flow approximation is used.

## 25°C

**Stage requirement:** `NO_ACCEPTED_SOLUTION_FOUND_WITHIN_NT_LIMIT_MULTISTART_OR_HIGHER_TRIALS_UNRESOLVED`

| NT | Primary closed | Both starts closed | Accepted | SAT wt% | Aromatics wt% | PA wt% | Recovery % | NMP in raffinate wt% |
|---:|:---:|:---:|:---:|---:|---:|---:|---:|---:|
| 1 | YES | NO | NO | 91.6233 | 7.6156 | 0.7611 | 88.1553 | 7.0103 |
| 2 | YES | NO | NO | 94.3698 | 5.3031 | 0.3271 | 85.0131 | 6.6284 |
| 3 | YES | NO | NO | 95.8231 | 4.0300 | 0.1469 | 83.4167 | 6.4331 |
| 4 | YES | NO | NO | 96.6993 | 3.2335 | 0.0672 | 82.4736 | 6.3159 |
| 5 | YES | NO | NO | 97.2760 | 2.6931 | 0.0309 | 81.8600 | 6.2386 |
| 6 | YES | NO | NO | 97.6809 | 2.3048 | 0.0143 | 81.4324 | 6.1840 |
| 7 | YES | NO | NO | 97.9795 | 2.0139 | 0.0066 | 81.1186 | 6.1436 |
| 8 | NO | NO | NO | 98.1201 | 1.8733 | 0.0066 | 80.9315 | 6.1227 |
| 9 | NO | NO | NO | 98.2288 | 1.7646 | 0.0066 | 80.7960 | 6.1066 |
| 10 | NO | NO | NO | 98.2974 | 1.6960 | 0.0066 | 80.7169 | 6.0964 |

- Primary coupled equation closure passed for NT = [1, 2, 3, 4, 5, 6, 7].
- Primary coupled equation closure failed for NT = [8, 9, 10].
- Both deterministic starts closed for NT = [].
- Every candidate raffinate and extract has a complete five-dimensional tangent-Hessian eigenspectrum from free-energy differences and an independent chemical-potential-Jacobian reconstruction, with three persisted step sizes.
- Every post-split TPD search combines global simplex seeds with explicit local perturbations around the returned phase.
- Stability evidence covers 110 phases: minimum tangent eigenvalue = 2.472071e-05; minimum post-split TPD = -7.434640e-01.
- Formal stability failures: negative TPD = 98; step-size convergence = 2; independent reconstruction agreement = 2.
- Any negative tangent eigenvalue, derivative-reconstruction disagreement, or negative post-split TPD formally downgrades that stationary phase pair; all product metrics remain diagnostic only.
- Recovery and NMP-carryover targets fail throughout the closed series, so no accepted NT exists within 10 stages.

Complete incoming/outgoing flows, six-component mole/mass profiles, K values, acceptance blockers, and closure residuals for every stage are in `results.json`.

## Governance decision

`FULL_SIX_COMPONENT_MODEL_QUALIFICATION = NOT_QUALIFIED`

These cascade values are numerical research diagnostics, not validated process-design results. The prior single-stage stationary split is not accepted as a stable phase pair unless the full tangent-Hessian and locally seeded TPD gates pass. The frozen blind LLE composition-RMSD verdict remains failed and unchanged. Sulfur remains `NOT_CALCULABLE`; PA transfer is provisional and is not sulfur removal.
