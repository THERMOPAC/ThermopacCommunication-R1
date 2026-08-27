# COSMO-SAC-2010 molecular LLE research evaluation

This reproducible research-only calculation uses genuine vendored NIST cCOSMO `COSMO3`; ln(gamma) is exactly `get_lngamma_comb(T,x)+get_lngamma_resid(T,x)`. No NRTL, Dortmund runner, or simulator code was used.

## Results
* Coto: 17 / 17 records; predicted two-phase 0, predicted stable single-phase 17. A valid tie-line RMSD/max cannot be calculated. The failed-outcome diagnostic (one predicted liquid versus both observed phases) is RMSD 0.176437, max 0.374500. Maximum mass-balance residual is 0.000e+00.
* Multi-temperature: 219 / 219 supported records, predicted two-phase 0, predicted stable single-phase 219, blocked 0. Valid tie-line RMSD/max are unavailable. Failed-outcome diagnostic RMSD 0.242183, max 0.459900. Maximum mass-balance residual is 0.000e+00.
* Dortmund directly outperforms this route: it accepted all 17 Coto rows with RMSD 0.093210 and max 0.335025; its Aljimaz analogue result was RMSD 0.077157 and max 0.256329. COSMO-SAC-2010 produced no LLE tie-line to score.

The fixed six-family overall composition is [0.45,0.12,0.10,0.06,0.07,0.20] for [dodecane,p-xylene,1-methylnaphthalene,pyrene,sulfur,NMP]. DBT is primary; benzothiophene and thiophene are limited 25 C sensitivities.

| sulfur molecule | T (C) | temperature status | coarse full-simplex TPD minimum | result |
|---|---:|---|---:|---|
| DIBENZOTHIOPHENE | 25 | DIRECT_FIVE_COMPONENT_COTO_EVIDENCE | 0.289783814 | PREDICTED_STABLE_SINGLE_PHASE |
| DIBENZOTHIOPHENE | 50 | INTERPOLATED_WITHIN_MULTITEMPERATURE_ANALOGUE_RANGE | 0.295561815 | PREDICTED_STABLE_SINGLE_PHASE |
| DIBENZOTHIOPHENE | 75 | EXTRAPOLATED_ABOVE_ADMITTED_328_K_DATA | 0.294814945 | PREDICTED_STABLE_SINGLE_PHASE |
| DIBENZOTHIOPHENE | 100 | EXTRAPOLATED_ABOVE_ADMITTED_328_K_DATA | 0.293931257 | PREDICTED_STABLE_SINGLE_PHASE |
| BENZOTHIOPHENE | 25 | SENSITIVITY_AT_25_C | 0.291597720 | PREDICTED_STABLE_SINGLE_PHASE |
| THIOPHENE | 25 | SENSITIVITY_AT_25_C | 0.287118826 | PREDICTED_STABLE_SINGLE_PHASE |

All refined TPD minima were zero within numerical precision at the feed composition; no negative TPD was found. Therefore there are no two liquid compositions, phase fraction, distribution coefficients, selectivities, or sulfur recovery values to report: those fields are explicitly null rather than fabricated. The single predicted liquid composition is the overall composition above, with fraction 1.0 and exact material-balance closure. The 75 and 100 C cases are extrapolated above the admitted 328 K evidence range.

## Decision basis

This COSMO-SAC-2010/profile route is reproducible, but it fails the essential qualitative test: it predicts one stable liquid for every experimentally two-phase benchmark record (17/17 Coto and 219/219 multitemperature). It also cannot calculate sulfur partitioning for the six-family case because it predicts no NMP-rich phase.

REJECT
