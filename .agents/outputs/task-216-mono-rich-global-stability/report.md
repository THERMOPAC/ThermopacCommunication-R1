# Task 216 MONO-rich global stability harness

Status: `BLOCKED_FAIL_CLOSED`

All 110 exact returned Task-215 phase endpoints were independently assessed with complete coverage at the unchanged -1e-8 threshold.
Fully reproduced lower-Gibbs minima: 57.
Negative or unresolved phase searches: 96.
Task 206 is comparison-only and cannot qualify because its frozen composition validation fails.

## Per-phase evidence

| N_T | Stage | Phase | Direct minimum | Classification | simplex KKT | logit KKT | max gradient error | Fully reproduced |
|---:|---:|---|---:|---|---:|---:|---:|---|
| 1 | 1 | raffinate | -0.619988 | GENUINE_LOWER_GIBBS_BASIN | 1.55e-06 | 1.84e-08 | 4.89e-08 | True |
| 1 | 1 | extract | -0.619988 | GENUINE_LOWER_GIBBS_BASIN | 1.37e-06 | 2.75e-08 | 5.02e-08 | True |
| 2 | 1 | raffinate | -0.719121 | GENUINE_LOWER_GIBBS_BASIN | 1.51e-06 | 4.25e-09 | 5.68e-08 | True |
| 2 | 1 | extract | -0.719121 | GENUINE_LOWER_GIBBS_BASIN | 6.82e-06 | 4.12e-08 | 6.02e-08 | True |
| 2 | 2 | raffinate | -0.424569 | GENUINE_LOWER_GIBBS_BASIN | 1.44e-06 | 9.46e-09 | 1.01e-07 | True |
| 2 | 2 | extract | -0.424569 | GENUINE_LOWER_GIBBS_BASIN | 1.81e-06 | 4e-09 | 9.25e-08 | True |
| 3 | 1 | raffinate | -0.748674 | GENUINE_LOWER_GIBBS_BASIN | 4.8e-06 | 3.49e-08 | 6.56e-08 | True |
| 3 | 1 | extract | -0.748674 | GENUINE_LOWER_GIBBS_BASIN | 2.58e-06 | 2.48e-08 | 6.8e-08 | True |
| 3 | 2 | raffinate | -0.611043 | GENUINE_LOWER_GIBBS_BASIN | 1.74e-06 | 5.05e-09 | 9.86e-08 | True |
| 3 | 2 | extract | -0.611043 | GENUINE_LOWER_GIBBS_BASIN | 3.71e-06 | 3.91e-08 | 9.91e-08 | True |
| 3 | 3 | raffinate | -0.251861 | OPTIMIZER_REFINEMENT_FAILURE | 1.27e-06 | 4.93e-09 | 3.01e-07 | False |
| 3 | 3 | extract | -0.251861 | GENUINE_LOWER_GIBBS_BASIN | 9.83e-06 | 3.95e-08 | 2.98e-07 | True |
| 4 | 1 | raffinate | -0.761823 | GENUINE_LOWER_GIBBS_BASIN | 2.55e-06 | 7.2e-09 | 7.33e-08 | True |
| 4 | 1 | extract | -0.761823 | GENUINE_LOWER_GIBBS_BASIN | 1.36e-06 | 2.8e-08 | 6.22e-08 | True |
| 4 | 2 | raffinate | -0.675396 | GENUINE_LOWER_GIBBS_BASIN | 2.91e-06 | 3.57e-08 | 9.92e-08 | True |
| 4 | 2 | extract | -0.675396 | OPTIMIZER_REFINEMENT_FAILURE | 3.41e-06 | 3.43e-08 | 9.73e-08 | False |
| 4 | 3 | raffinate | -0.503962 | GENUINE_LOWER_GIBBS_BASIN | 3.43e-06 | 2.59e-08 | 3.1e-07 | True |
| 4 | 3 | extract | -0.503962 | GENUINE_LOWER_GIBBS_BASIN | 3.98e-06 | 4.98e-08 | 3.13e-07 | True |
| 4 | 4 | raffinate | -0.104426 | GENUINE_LOWER_GIBBS_BASIN | 8.81e-06 | 8.79e-09 | 9.71e-07 | True |
| 4 | 4 | extract | -0.104426 | GENUINE_LOWER_GIBBS_BASIN | 6.16e-06 | 2.47e-08 | 9.7e-07 | True |
| 5 | 1 | raffinate | -0.76899 | GENUINE_LOWER_GIBBS_BASIN | 6.47e-07 | 3.08e-09 | 7.02e-08 | True |
| 5 | 1 | extract | -0.76899 | GENUINE_LOWER_GIBBS_BASIN | 2.78e-06 | 1.99e-08 | 7e-08 | True |
| 5 | 2 | raffinate | -0.706199 | OPTIMIZER_REFINEMENT_FAILURE | 1.05e-05 | 4.03e-08 | 9.89e-08 | False |
| 5 | 2 | extract | -0.706199 | GENUINE_LOWER_GIBBS_BASIN | 8.49e-07 | 1.87e-08 | 1.02e-07 | True |
| 5 | 3 | raffinate | -0.599737 | GENUINE_LOWER_GIBBS_BASIN | 2.93e-06 | 1.48e-08 | 3.32e-07 | True |
| 5 | 3 | extract | -0.599737 | GENUINE_LOWER_GIBBS_BASIN | 4.28e-06 | 2.19e-08 | 3.4e-07 | True |
| 5 | 4 | raffinate | -0.40507 | GENUINE_LOWER_GIBBS_BASIN | 5.22e-06 | 2.77e-08 | 1.09e-06 | True |
| 5 | 4 | extract | -0.40507 | GENUINE_LOWER_GIBBS_BASIN | 6.4e-06 | 1.96e-08 | 1.09e-06 | True |
| 5 | 5 | raffinate | -1.23555e-14 | LOCAL_HESSIAN_ONLY_ARTIFACT | 6.29e-08 | 4.3e-09 | 1.24e-05 | False |
| 5 | 5 | extract | -4.80261e-15 | LOCAL_HESSIAN_ONLY_ARTIFACT | 3.96e-06 | 8.57e-10 | 5.09e-06 | False |
| 6 | 1 | raffinate | -0.773405 | GENUINE_LOWER_GIBBS_BASIN | 1.28e-06 | 4.32e-08 | 6.8e-08 | True |
| 6 | 1 | extract | -0.773405 | GENUINE_LOWER_GIBBS_BASIN | 2.61e-06 | 3.26e-08 | 6.83e-08 | True |
| 6 | 2 | raffinate | -0.7237 | GENUINE_LOWER_GIBBS_BASIN | 1.81e-06 | 1.62e-08 | 1.07e-07 | True |
| 6 | 2 | extract | -0.7237 | GENUINE_LOWER_GIBBS_BASIN | 1.49e-06 | 7.31e-09 | 1.04e-07 | True |
| 6 | 3 | raffinate | -0.648114 | OPTIMIZER_REFINEMENT_FAILURE | 1.28e-05 | 2.22e-08 | 3.69e-07 | False |
| 6 | 3 | extract | -0.648114 | GENUINE_LOWER_GIBBS_BASIN | 1.31e-05 | 1.11e-08 | 3.66e-07 | True |
| 6 | 4 | raffinate | -0.527179 | GENUINE_LOWER_GIBBS_BASIN | 6.84e-06 | 9.96e-09 | 1.21e-06 | True |
| 6 | 4 | extract | -0.527179 | GENUINE_LOWER_GIBBS_BASIN | 1.15e-05 | 3e-08 | 1.21e-06 | True |
| 6 | 5 | raffinate | -0.315824 | GENUINE_LOWER_GIBBS_BASIN | 1.01e-05 | 5.97e-09 | 3.91e-06 | True |
| 6 | 5 | extract | -0.315824 | GENUINE_LOWER_GIBBS_BASIN | 1.52e-05 | 2.42e-08 | 3.91e-06 | True |
| 6 | 6 | raffinate | -1.03605e-14 | LOCAL_HESSIAN_ONLY_ARTIFACT | 1.44e-10 | 2.62e-12 | 5.82e-05 | False |
| 6 | 6 | extract | -9.10453e-15 | LOCAL_HESSIAN_ONLY_ARTIFACT | 5.07e-06 | 5.08e-10 | 2.38e-05 | False |
| 7 | 1 | raffinate | -0.776356 | GENUINE_LOWER_GIBBS_BASIN | 2.95e-06 | 2.15e-08 | 6.99e-08 | True |
| 7 | 1 | extract | -0.776356 | GENUINE_LOWER_GIBBS_BASIN | 1.02e-06 | 1.26e-08 | 7.1e-08 | True |
| 7 | 2 | raffinate | -0.734767 | GENUINE_LOWER_GIBBS_BASIN | 4.73e-06 | 2.73e-08 | 1.02e-07 | True |
| 7 | 2 | extract | -0.734767 | GENUINE_LOWER_GIBBS_BASIN | 2.36e-06 | 3.95e-08 | 1.17e-07 | True |
| 7 | 3 | raffinate | -0.676536 | OPTIMIZER_REFINEMENT_FAILURE | 6.3e-06 | 4.15e-08 | 3.84e-07 | False |
| 7 | 3 | extract | -0.676536 | OPTIMIZER_REFINEMENT_FAILURE | 2.05e-05 | 2.32e-08 | 3.89e-07 | False |
| 7 | 4 | raffinate | -0.591395 | OPTIMIZER_REFINEMENT_FAILURE | 2.62e-05 | 1.11e-08 | 1.34e-06 | False |
| 7 | 4 | extract | -0.591395 | OPTIMIZER_REFINEMENT_FAILURE | 2.02e-05 | 3.82e-08 | 1.34e-06 | False |
| 7 | 5 | raffinate | -0.459603 | OPTIMIZER_REFINEMENT_FAILURE | 7.65e-06 | 8.17e-09 | 4.5e-06 | False |
| 7 | 5 | extract | -0.459603 | OPTIMIZER_REFINEMENT_FAILURE | 1.06e-05 | 2.25e-08 | 4.51e-06 | False |
| 7 | 6 | raffinate | -0.235818 | OPTIMIZER_REFINEMENT_FAILURE | 1.98e-05 | 6.4e-09 | 1.45e-05 | False |
| 7 | 6 | extract | -0.235818 | OPTIMIZER_REFINEMENT_FAILURE | 2.02e-05 | 1.95e-08 | 1.45e-05 | False |
| 7 | 7 | raffinate | -1.04133e-14 | LOCAL_HESSIAN_ONLY_ARTIFACT | 7.07e-06 | 2.1e-10 | 0.000272 | False |
| 7 | 7 | extract | -2.05281e-15 | LOCAL_HESSIAN_ONLY_ARTIFACT | 1.4e-07 | 1.44e-09 | 0.000111 | False |
| 8 | 1 | raffinate | -0.778446 | GENUINE_LOWER_GIBBS_BASIN | 6.04e-07 | 2.31e-09 | 7.54e-08 | True |
| 8 | 1 | extract | -0.778446 | GENUINE_LOWER_GIBBS_BASIN | 1.49e-06 | 1.9e-08 | 6.84e-08 | True |
| 8 | 2 | raffinate | -0.742298 | GENUINE_LOWER_GIBBS_BASIN | 1.85e-06 | 1.91e-08 | 1.16e-07 | True |
| 8 | 2 | extract | -0.742298 | GENUINE_LOWER_GIBBS_BASIN | 2.06e-06 | 8.4e-09 | 1.14e-07 | True |
| 8 | 3 | raffinate | -0.694916 | GENUINE_LOWER_GIBBS_BASIN | 1.14e-05 | 3.41e-08 | 4.13e-07 | True |
| 8 | 3 | extract | -0.694916 | GENUINE_LOWER_GIBBS_BASIN | 1.89e-05 | 1.6e-08 | 4.07e-07 | True |
| 8 | 4 | raffinate | -0.630139 | GENUINE_LOWER_GIBBS_BASIN | 6.71e-06 | 2.4e-08 | 1.46e-06 | True |
| 8 | 4 | extract | -0.630139 | GENUINE_LOWER_GIBBS_BASIN | 1.96e-05 | 3.36e-08 | 1.45e-06 | True |
| 8 | 5 | raffinate | -0.537621 | GENUINE_LOWER_GIBBS_BASIN | 1.19e-05 | 1.37e-08 | 5.09e-06 | True |
| 8 | 5 | extract | -0.537621 | GENUINE_LOWER_GIBBS_BASIN | 1.28e-05 | 8.25e-09 | 5.08e-06 | True |
| 8 | 6 | raffinate | -0.397424 | OPTIMIZER_REFINEMENT_FAILURE | 2.4e-05 | 1.48e-08 | 1.73e-05 | False |
| 8 | 6 | extract | -0.397424 | OPTIMIZER_REFINEMENT_FAILURE | 2.19e-05 | 2.07e-08 | 1.73e-05 | False |
| 8 | 7 | raffinate | -0.164105 | OPTIMIZER_REFINEMENT_FAILURE | 4.02e-05 | 4.01e-08 | 5.54e-05 | False |
| 8 | 7 | extract | -0.164105 | OPTIMIZER_REFINEMENT_FAILURE | 4.07e-05 | 3.07e-08 | 5.54e-05 | False |
| 8 | 8 | raffinate | -2.7294e-14 | LOCAL_HESSIAN_ONLY_ARTIFACT | 1.9e-07 | 5.92e-09 | 0.00128 | False |
| 8 | 8 | extract | -4.52442e-15 | LOCAL_HESSIAN_ONLY_ARTIFACT | 3.62e-07 | 1.79e-09 | 0.000518 | False |
| 9 | 1 | raffinate | -0.779993 | GENUINE_LOWER_GIBBS_BASIN | 3.87e-06 | 1.18e-08 | 6.82e-08 | True |
| 9 | 1 | extract | -0.779993 | GENUINE_LOWER_GIBBS_BASIN | 1.74e-06 | 8.96e-09 | 7.16e-08 | True |
| 9 | 2 | raffinate | -0.747706 | GENUINE_LOWER_GIBBS_BASIN | 1.32e-06 | 1.94e-08 | 1.2e-07 | True |
| 9 | 2 | extract | -0.747706 | GENUINE_LOWER_GIBBS_BASIN | 2.09e-06 | 3.1e-08 | 1.2e-07 | True |
| 9 | 3 | raffinate | -0.707626 | OPTIMIZER_REFINEMENT_FAILURE | 6.47e-06 | 4.39e-08 | 4.34e-07 | False |
| 9 | 3 | extract | -0.707626 | OPTIMIZER_REFINEMENT_FAILURE | 3.74e-06 | 2.5e-08 | 4.3e-07 | False |
| 9 | 4 | raffinate | -0.655667 | OPTIMIZER_REFINEMENT_FAILURE | 6.02e-06 | 3.3e-08 | 1.57e-06 | False |
| 9 | 4 | extract | -0.655667 | OPTIMIZER_REFINEMENT_FAILURE | 7.08e-06 | 1.91e-08 | 1.56e-06 | False |
| 9 | 5 | raffinate | -0.58572 | OPTIMIZER_REFINEMENT_FAILURE | 1.39e-05 | 2.08e-08 | 5.65e-06 | False |
| 9 | 5 | extract | -0.58572 | OPTIMIZER_REFINEMENT_FAILURE | 1.29e-05 | 2.9e-08 | 5.64e-06 | False |
| 9 | 6 | raffinate | -0.48734 | OPTIMIZER_REFINEMENT_FAILURE | 3.42e-05 | 5.42e-08 | 1.99e-05 | False |
| 9 | 6 | extract | -0.48734 | OPTIMIZER_REFINEMENT_FAILURE | 2.33e-05 | 3.76e-08 | 1.99e-05 | False |
| 9 | 7 | raffinate | -0.340469 | OPTIMIZER_REFINEMENT_FAILURE | 4.39e-05 | 2.55e-08 | 6.79e-05 | False |
| 9 | 7 | extract | -0.340469 | OPTIMIZER_REFINEMENT_FAILURE | 4.56e-05 | 2.31e-08 | 6.79e-05 | False |
| 9 | 8 | raffinate | -0.0996701 | OPTIMIZER_REFINEMENT_FAILURE | 8.06e-05 | 3.99e-08 | 0.000217 | False |
| 9 | 8 | extract | -0.0996701 | OPTIMIZER_REFINEMENT_FAILURE | 7.74e-05 | 6.79e-08 | 0.000217 | False |
| 9 | 9 | raffinate | -1.65849e-14 | LOCAL_HESSIAN_ONLY_ARTIFACT | 8.33e-05 | 5.29e-10 | 0.00603 | False |
| 9 | 9 | extract | -3.39609e-15 | LOCAL_HESSIAN_ONLY_ARTIFACT | 4.17e-10 | 4.38e-12 | 0.00243 | False |
| 10 | 1 | raffinate | -0.781179 | OPTIMIZER_REFINEMENT_FAILURE | 3.78e-06 | 2.77e-08 | 7.67e-08 | False |
| 10 | 1 | extract | -0.781179 | GENUINE_LOWER_GIBBS_BASIN | 3.24e-06 | 2.13e-08 | 7.37e-08 | True |
| 10 | 2 | raffinate | -0.751751 | GENUINE_LOWER_GIBBS_BASIN | 2.55e-06 | 2.28e-08 | 1.28e-07 | True |
| 10 | 2 | extract | -0.751751 | GENUINE_LOWER_GIBBS_BASIN | 3.61e-06 | 2.49e-08 | 1.21e-07 | True |
| 10 | 3 | raffinate | -0.71686 | GENUINE_LOWER_GIBBS_BASIN | 7.67e-06 | 3.17e-08 | 4.52e-07 | True |
| 10 | 3 | extract | -0.71686 | GENUINE_LOWER_GIBBS_BASIN | 1.65e-06 | 1.07e-08 | 4.44e-07 | True |
| 10 | 4 | raffinate | -0.67356 | OPTIMIZER_REFINEMENT_FAILURE | 7.08e-06 | 2.52e-08 | 1.66e-06 | False |
| 10 | 4 | extract | -0.67356 | OPTIMIZER_REFINEMENT_FAILURE | 6.79e-06 | 1.09e-08 | 1.65e-06 | False |
| 10 | 5 | raffinate | -0.617911 | OPTIMIZER_REFINEMENT_FAILURE | 1.48e-05 | 4.82e-08 | 6.13e-06 | False |
| 10 | 5 | extract | -0.617911 | OPTIMIZER_REFINEMENT_FAILURE | 1.25e-05 | 8.55e-09 | 6.14e-06 | False |
| 10 | 6 | raffinate | -0.543775 | OPTIMIZER_REFINEMENT_FAILURE | 6.71e-05 | 1.57e-07 | 2.24e-05 | False |
| 10 | 6 | extract | -0.543775 | OPTIMIZER_REFINEMENT_FAILURE | 2.7e-05 | 7.9e-09 | 2.24e-05 | False |
| 10 | 7 | raffinate | -0.440628 | OPTIMIZER_REFINEMENT_FAILURE | 4.82e-05 | 5.58e-09 | 7.97e-05 | False |
| 10 | 7 | extract | -0.440628 | OPTIMIZER_REFINEMENT_FAILURE | 4.93e-05 | 1.21e-08 | 7.97e-05 | False |
| 10 | 8 | raffinate | -0.288348 | OPTIMIZER_REFINEMENT_FAILURE | 8.26e-05 | 1.46e-08 | 0.000272 | False |
| 10 | 8 | extract | -0.288348 | OPTIMIZER_REFINEMENT_FAILURE | 8.83e-05 | 3.88e-09 | 0.000272 | False |
| 10 | 9 | raffinate | -1.70283e-14 | LOCAL_HESSIAN_ONLY_ARTIFACT | 1.24e-05 | 1.14e-10 | 0.00284 | False |
| 10 | 9 | extract | -7.19617e-15 | LOCAL_HESSIAN_ONLY_ARTIFACT | 4.92e-15 | 8.59e-17 | 0.00116 | False |
| 10 | 10 | raffinate | -2.45905e-14 | LOCAL_HESSIAN_ONLY_ARTIFACT | 3.87e-08 | 1.78e-09 | 0.00675 | False |
| 10 | 10 | extract | -1.05374e-15 | LOCAL_HESSIAN_ONLY_ARTIFACT | 1.72e-09 | 1.22e-11 | 0.00675 | False |

## Blockers
- `FROZEN_COMPOSITION_VALIDATION_FAILED`
- `POST_SPLIT_TPD_STABILITY_FAILED`
- `DIRECT_MATCHING_SIX_COMPONENT_LLE_EVIDENCE_MISSING`
