# COSMO-SAC qualification checkpoint — Stage 1 six-component case

## Frozen design charge

- Temperature: 323.15 K
- Component order: SAT, MONO, DI, POLY, PA, NMP
- Overall molar composition: SAT=0.3308924468, MONO=0.0386177142, DI=0.0186526510, POLY=0.0065570952, PA=0.0032698270, NMP=0.6020102657

## Numerical result

- Activity calculation executed: YES
- TPD calculation executed: YES
- Minimum TPD: -1.807246053806e-18
- Stability verdict: STABLE_NO_NEGATIVE_TPD
- TPD refinements converged: True
- Two-liquid flash attempted: YES
- Split optimizer converged: True
- Accepted two-liquid solution: False
- Predicted phase count: 1
- Gibbs reduction: 4.440892098501e-15
- Material-balance maximum residual: 0.000000000000e+00

Under the declared bounded full-simplex TPD search and deterministic Gibbs minimizations, the unchanged corrected-profile COSMO-SAC model found no negative TPD or Gibbs-lowering two-liquid split for the Stage 1 charge at 323.15 K. The optimizer did not fail.

## Qualification decision

`FULL_SIX_COMPONENT_QUALIFICATION = INPUT_NOT_AVAILABLE`

This calculation is a valid research-only Stage 1 design prediction, but no independent experimental six-component observation is registered to qualify it. It remains `CALIBRATION_REQUIRED`, non-pilot-validated, and non-release-eligible. Sulfur remains `NOT_CALCULABLE`.
