# Genuine openCOSMO-RS LLE benchmark

This calculation uses vendored openCOSMO-RS_py commit `3db6614925ded5fc47a77d1e34f4a1975e518a9b`, raw LVPP v25 NWChem B3LYP/SVPD `.cosmo` surfaces, and `COSMORS('default_turbomole')` with `pure_component` reference-state activity coefficients. No fitted fallback, COSMO-SAC, Dortmund, NRTL, simulator, sizing, or hydrodynamics code is used.

**Cross-QC limitation:** `default_turbomole` was developed for Turbomole-style inputs, whereas these LVPP v25 surfaces are NWChem B3LYP/SVPD. This parameterization mismatch is disclosed and was not modified.

## Results
* Coto: 17/17 records; two-phase 0; categories {'TWO_PHASE': 0, 'PREDICTED_STABLE_SINGLE_PHASE': 15, 'NONCONVERGED_OR_BOUNDARY': 2}. Valid tie-line RMSD/max: None / None. Homogeneous diagnostic RMSD/max: 0.176437 / 0.374500; uncertainty exceedances: 170 over u(x), 152 over 3u(x).
* Multi-temperature: 219/219 supported, blocked 0; two-phase 0; categories {'TWO_PHASE': 0, 'PREDICTED_STABLE_SINGLE_PHASE': 193, 'NONCONVERGED_OR_BOUNDARY': 26}. Valid tie-line RMSD/max: None / None. Homogeneous diagnostic RMSD/max: 0.242183 / 0.459900.
* Maximum material-balance residual: 0.000e+00.
* Coto coarse TPD range: 0.078574891 to 0.171924824; multitemperature coarse TPD range: 0.000006877 to 0.041327688.
* Dortmund directly outperforms this route: 17/17 Coto rows accepted, RMSD 0.093210, maximum error 0.335025; Aljimaz analogue RMSD 0.077157, maximum error 0.256329.
* The rejected COSMO-SAC-2010 route also predicted 0/17 Coto and 0/219 multitemperature two-phase outcomes. Neither molecular route produced a valid tie-line RMSD or sulfur partition.

The six-family DBT composition `[0.45,0.12,0.10,0.06,0.07,0.20]` was evaluated at 25/50/75/100 C, with BT and thiophene 25 C sensitivity and explicit evidence labels in `results.json`.

| sulfur molecule | T (C) | temperature status | coarse full-simplex TPD minimum | result |
|---|---:|---|---:|---|
| DIBENZOTHIOPHENE | 25 | DIRECT_FIVE_COMPONENT_COTO_EVIDENCE | 0.291529100 | PREDICTED_STABLE_SINGLE_PHASE |
| DIBENZOTHIOPHENE | 50 | INTERPOLATED_WITHIN_MULTITEMPERATURE_ANALOGUE_RANGE | 0.291007337 | PREDICTED_STABLE_SINGLE_PHASE |
| DIBENZOTHIOPHENE | 75 | EXTRAPOLATED_ABOVE_ADMITTED_328_K_DATA | 0.290636447 | PREDICTED_STABLE_SINGLE_PHASE |
| DIBENZOTHIOPHENE | 100 | EXTRAPOLATED_ABOVE_ADMITTED_328_K_DATA | 0.290371120 | PREDICTED_STABLE_SINGLE_PHASE |
| BENZOTHIOPHENE | 25 | SENSITIVITY_AT_25_C | 0.291714113 | PREDICTED_STABLE_SINGLE_PHASE |
| THIOPHENE | 25 | SENSITIVITY_AT_25_C | 0.292494955 | PREDICTED_STABLE_SINGLE_PHASE |

No representative case produced two liquid phases. Consequently, both phase compositions, phase split, distribution coefficients, selectivity, and sulfur recovery are explicitly null. The single predicted liquid has the overall composition above and fraction 1.0. The 75 and 100 C cases are extrapolated above the admitted 328 K evidence range.

## Decision basis

This is a genuine, reproducible openCOSMO-RS execution, but the tested profile/parameterization route fails the governing qualitative gate: it does not reproduce the experimentally observed NMP/hydrocarbon two-liquid topology. The cross-QC parameterization mismatch is an additional limitation, not a reason to reinterpret the failed topology.

REJECT
