# Six-Component Counter-Current NMP/RRBO Extraction

**Research-only · calibration-required · non-pilot-validated · non-release-eligible**

Oil feed enters Stage 1; raffinate flows toward Stage N. Fresh NMP enters Stage N; extract flows toward Stage 1.
Every stage simultaneously solves six component balances and six activity-equality equations. No fixed K values or constant-flow approximation is used.

## 25°C

**Stage requirement:** `NO_ACCEPTED_SOLUTION_FOUND_WITHIN_NT_LIMIT_MULTISTART_OR_HIGHER_TRIALS_UNRESOLVED`

| NT | Primary closed | Both starts closed | Accepted | SAT wt% | Aromatics wt% | PA wt% | Recovery % | NMP in raffinate wt% |
|---:|:---:|:---:|:---:|---:|---:|---:|---:|---:|
| 1 | YES | YES | NO | 92.3448 | 6.9873 | 0.6680 | 86.6310 | 6.9034 |
| 2 | YES | NO | NO | 95.3024 | 4.4514 | 0.2463 | 83.3551 | 6.4967 |
| 3 | YES | NO | NO | 96.8127 | 3.0940 | 0.0934 | 81.7541 | 6.2953 |
| 4 | YES | NO | NO | 97.6938 | 2.2705 | 0.0356 | 80.8394 | 6.1782 |
| 5 | YES | NO | NO | 98.2565 | 1.7299 | 0.0136 | 80.2621 | 6.1031 |
| 6 | YES | NO | NO | 98.6399 | 1.3549 | 0.0052 | 79.8716 | 6.0517 |
| 7 | YES | NO | NO | 98.9138 | 1.0842 | 0.0020 | 79.5939 | 6.0150 |
| 8 | NO | NO | NO | 98.9755 | 1.0226 | 0.0020 | 79.4700 | 6.0059 |
| 9 | NO | NO | NO | 99.0250 | 0.9730 | 0.0020 | 79.3763 | 5.9987 |
| 10 | NO | NO | NO | 99.0564 | 0.9417 | 0.0020 | 79.2994 | 5.9941 |

- Primary coupled equation closure passed for NT = [1, 2, 3, 4, 5, 6, 7].
- Primary coupled equation closure failed for NT = [8, 9, 10].
- Both deterministic starts closed for NT = [1].
- Every candidate raffinate and extract has a complete five-dimensional tangent-Hessian eigenspectrum from free-energy differences and an independent chemical-potential-Jacobian reconstruction, with three persisted step sizes.
- Every post-split TPD search combines global simplex seeds with explicit local perturbations around the returned phase.
- Stability evidence covers 110 phases: minimum tangent eigenvalue = 6.868204e-06; minimum post-split TPD = -7.318696e-01.
- Formal stability failures: negative TPD = 84; step-size convergence = 7; independent reconstruction agreement = 7.
- Any negative tangent eigenvalue, derivative-reconstruction disagreement, or negative post-split TPD formally downgrades that stationary phase pair; all product metrics remain diagnostic only.
- Recovery and NMP-carryover targets fail throughout the closed series, so no accepted NT exists within 10 stages.

Complete incoming/outgoing flows, six-component mole/mass profiles, K values, acceptance blockers, and closure residuals for every stage are in `results.json`.

## 50°C

**Stage requirement:** `NO_ACCEPTED_SOLUTION_FOUND_WITHIN_NT_LIMIT_MULTISTART_OR_HIGHER_TRIALS_UNRESOLVED`

| NT | Primary closed | Both starts closed | Accepted | SAT wt% | Aromatics wt% | PA wt% | Recovery % | NMP in raffinate wt% |
|---:|:---:|:---:|:---:|---:|---:|---:|---:|---:|
| 1 | YES | NO | NO | 92.4573 | 6.8674 | 0.6754 | 83.6486 | 10.1845 |
| 2 | YES | NO | NO | 95.6168 | 4.1432 | 0.2400 | 79.9251 | 9.6076 |
| 3 | YES | NO | NO | 97.2133 | 2.7003 | 0.0864 | 78.1333 | 9.3252 |
| 4 | YES | NO | NO | 98.1167 | 1.8522 | 0.0311 | 77.1423 | 9.1661 |
| 5 | YES | NO | NO | 98.6716 | 1.3172 | 0.0112 | 76.5408 | 9.0680 |
| 6 | YES | NO | NO | 99.0339 | 0.9621 | 0.0040 | 76.1508 | 9.0037 |
| 7 | YES | NO | NO | 99.2812 | 0.7174 | 0.0014 | 75.8859 | 8.9598 |
| 8 | NO | NO | NO | 99.3043 | 0.6943 | 0.0014 | 75.7554 | 8.9553 |
| 9 | NO | NO | NO | 99.3150 | 0.6836 | 0.0014 | 75.6523 | 8.9531 |
| 10 | NO | NO | NO | 99.3441 | 0.6545 | 0.0014 | 75.5573 | 8.9475 |

- Primary coupled equation closure passed for NT = [1, 2, 3, 4, 5, 6, 7].
- Primary coupled equation closure failed for NT = [8, 9, 10].
- Both deterministic starts closed for NT = [].
- Every candidate raffinate and extract has a complete five-dimensional tangent-Hessian eigenspectrum from free-energy differences and an independent chemical-potential-Jacobian reconstruction, with three persisted step sizes.
- Every post-split TPD search combines global simplex seeds with explicit local perturbations around the returned phase.
- Stability evidence covers 110 phases: minimum tangent eigenvalue = 4.644957e-06; minimum post-split TPD = -6.763632e-02.
- Formal stability failures: negative TPD = 16; step-size convergence = 11; independent reconstruction agreement = 14.
- Any negative tangent eigenvalue, derivative-reconstruction disagreement, or negative post-split TPD formally downgrades that stationary phase pair; all product metrics remain diagnostic only.
- Recovery and NMP-carryover targets fail throughout the closed series, so no accepted NT exists within 10 stages.

Complete incoming/outgoing flows, six-component mole/mass profiles, K values, acceptance blockers, and closure residuals for every stage are in `results.json`.

## Governance decision

`FULL_SIX_COMPONENT_MODEL_QUALIFICATION = NOT_QUALIFIED`

These cascade values are numerical research diagnostics, not validated process-design results. The prior single-stage stationary split is not accepted as a stable phase pair unless the full tangent-Hessian and locally seeded TPD gates pass. The frozen blind LLE composition-RMSD verdict remains failed and unchanged. Sulfur remains `NOT_CALCULABLE`; PA transfer is provisional and is not sulfur removal.
