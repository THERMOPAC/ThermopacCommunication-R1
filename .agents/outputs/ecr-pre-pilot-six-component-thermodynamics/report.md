# Six-component COSMO profile-basis qualification

## Decision

`PROFILE_BASIS_QUALIFIED_FOR_NIST_TOPOLOGY_GATE`

Six exact neutral-singlet molecular profiles were generated with one route:
RDKit ETKDGv3/MMFF94s conformer selection, GFN2-xTB geometry optimization,
and CPCM-X 1.1.0 conductor surfaces/profiles. The exact PA is CAS 10081-67-1.

## Rights boundary

Rights are documented separately for NIST cCOSMO software, generation software,
the quantum method, generated surfaces, profile conversion, and resulting data.
NIST UD/VT and ThermoSAC profiles were not used as generation or calculation inputs.

## Frozen profile contract

- charge/spin: 0 / singlet for all six identities
- conformers: deterministic ETKDGv3 seed 20260829, MMFF94s minimum, retained geometry hashes
- geometry/surface method: GFN2-xTB 6.7.1 and CPCM-X 1.1.0, epsilon=infinity
- sigma grid: -0.025 to +0.025 e/A2, 0.001 step, 51 points per NHB/OH/OT partition
- area/volume: frozen per molecule with source/profile integrity hashes
- reference state: neutral singlet conductor surface at 298.15 K

## NIST runtime test

All six project-generated profiles loaded in pinned NIST cCOSMO commit
`1b82456be38026719b16cad4076109bef3fcb309`. All 20 temperature/composition test
points produced finite, composition-dependent activities and repeated bitwise
within the process.

This qualifies the profile basis for the separate phase-topology gate. It does
not itself validate phase topology, quantitative LLE, sulfur prediction, or
release eligibility.
