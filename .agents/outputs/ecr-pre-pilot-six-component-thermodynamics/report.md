# Six-component thermodynamics qualification

## Decision

`STOPPED_NON_PA_TOPOLOGY_GATE_FAILED`

The required system is **SAT + MONO + DI + POLY + PA + NMP**. The primary objective is
simultaneous six-component thermodynamic closure; fitting ten PA-directed UNIQUAC terms is
not a substitute for that closure.

## Executable qualification

- NIST COSMO-SAC implementation: **FROZEN HISTORICAL EXECUTABLE EVIDENCE**
- Composition-dependent activity coefficients: **HISTORICALLY EXECUTED**
- Gibbs mixing energy: **HISTORICALLY EXECUTED**
- Research multicomponent TPD and constrained Gibbs flash: **HISTORICALLY EXECUTED**
- Restricted profiles executed during this verification: **NO**
- NIST UD/VT profile admission for project calculations: **NOT ADMITTED**
- ThermoSAC admission: **NOT ADMITTED** because no declared software license was found
- Exact PA sigma profile: **UNAVAILABLE**
- Qualified open-source six-profile generation route: **UNAVAILABLE**

## Mandatory non-PA topology gate

| evidence set | experimentally two-phase records | predicted two-phase | predicted stable single phase |
|---|---:|---:|---:|
| Coto | 17 | 0 | 17 |
| Multi-temperature | 219 | 0 | 219 |

Combined two-phase topology recall: **0.000000**

The previously generated NIST COSMO-SAC-2010/restricted-profile candidate therefore fails the prerequisite
qualitative phase-topology test. This rejects the candidate basis; it does not prove that
every possible independently generated NIST-compatible profile basis must fail.

## Six-component status

The six-component calculation was not executed after the mandatory gate failure. Both
liquid compositions, phase fraction, all six distribution coefficients, SAT loss,
MONO/DI/POLY/PA extraction, total aromatic extraction, NMP carryover, NMP-free RRBO
recovery, and all equilibrium residuals remain explicitly null.

No molecular profiles were generated. No PA activities were estimated. No UNIQUAC
interactions were fitted. Sulfur remains independently `NOT_CALCULABLE`.

## Production boundary

Stage 1, the production thermodynamic runtime, positive-PA gating, sulfur status, and
release eligibility are unchanged. Results remain `CALIBRATION_REQUIRED`, research-only,
non-pilot-validated, and non-release-eligible.
