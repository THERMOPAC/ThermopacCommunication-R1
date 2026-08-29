# 236-record COSMO-SAC reported-overall-composition benchmark

## Verdict

`INPUT_NOT_AVAILABLE`

All 236 experimentally biphasic records were inventoried. None reports the
experimental overall composition or phase fraction required to define the
feed state for TPD minimization and constrained total-Gibbs minimization.
No midpoint, nominal-feed reconstruction, assumed split, or fitted lever-rule
composition was substituted.

This is an input-admissibility result, not a failed COSMO-SAC topology result.
The corrected profiles and pinned COSMO-SAC contract were verified and frozen,
but the model was invoked zero times.

## Topology recall

| Scope | Experimental two-phase records | Flash eligible | Input unavailable | Topology recall |
| --- | ---: | ---: | ---: | --- |
| Overall | 236 | 0 | 236 | `NOT_CALCULABLE` |
| Coto | 17 | 0 | 17 | `NOT_CALCULABLE` |
| Multi-temperature ThermoML-derived | 219 | 0 | 219 | `NOT_CALCULABLE` |

The recall values are null in the machine-readable result. They are not zero:
there were no evaluable experimental positives and therefore no valid recall
denominator.

## Source inventory

| Source | Records |
| --- | ---: |
| aljimaz2006 | 35 |
| coto2022 | 17 |
| fahim2005 | 106 |
| fandary2006 | 78 |

The 17 Coto Table 3 records report two phase compositions at 298.15 K.
Nominal feed-family labels and NMP/SC ratios are provenance annotations only:
their governed reconstruction fails closure for 12 of 17 rows and is excluded.

The 219 controlled ThermoML-derived records report temperatures and conjugate
phase compositions. The raw ThermoML files identify those measurements as
composition at phase equilibrium in liquid mixtures 1 and 2; they contain no
reported overall-composition or phase-fraction field.

## Requested per-record diagnostics

Every record in `results.json` preserves source identity, temperature, component
identity, both measured phase compositions, and available mole-fraction
uncertainty. The following requested flash outputs are present but null:

- predicted phase count;
- TPD minimum;
- Gibbs reduction;
- solver convergence;
- predicted phase compositions and phase fraction;
- equilibrium and material-balance closure;
- RMSD, maximum absolute deviation, and component tie-line errors.

Their status is `INPUT_NOT_AVAILABLE` or
`NOT_CALCULABLE_NO_ACCEPTED_TWO_PHASE_FLASH`. This prevents missing input from
being misreported as predicted single phase, nonconvergence, or zero topology
recall.

## Corrected profile and model freeze

| Family | Corrected profile SHA-256 |
| --- | --- |
| DI | `7e8664f594afa70a232f845dfafbfbb1efd2e10e13c586187b556102a97503ed` |
| MONO | `0afc9a2a69c0f3c7827ecdd7553f7ebf1a6e35f8b64597ffc8a6b780c324c275` |
| NMP | `58dcecc755994f7955aec100dfb26de62c3ad933dcfd25c11f68ddec3b1efa69` |
| PA | `474736e63fd99749f7dad0cd5569959e9dd47a8a2dfe55b6ef80642ed3d1c03e` |
| POLY | `682828484416f124e3207f246d23954197502cba83d9b4744ace239d91fe8854` |
| SAT | `6f51a75fbfa70df9b410fae88614e5c27d003eea228bc91318edb2854b5c26c2` |

Profile semantics decision: `PROFILE_SEMANTICS_GATE_PASSED`.
Model contract: NIST COSMO-SAC-2010 at source commit
`1b82456be38026719b16cad4076109bef3fcb309`, using
`get_lngamma_comb(T,x)+get_lngamma_resid(T,x)`. No COSMO-SAC parameter or numerical
threshold was fitted or changed.

## Governance

This artifact is research-only, `CALIBRATION_REQUIRED`,
non-pilot-validated, and non-release-eligible. Sulfur remains
`NOT_CALCULABLE`. PA prediction, UNIQUAC regression, theoretical stages,
hydrodynamics, mass transfer, diameter, height, and sizing were not performed.

`INPUT_NOT_AVAILABLE`
