# Six-component COSMO-SAC-2010 topology evaluation

This reproducible research-only calculation uses NIST cCOSMO `COSMO3` with only the six project-generated profiles. No NIST UD/VT, ThermoSAC, NRTL, Dortmund, or simulator profile/model inputs were used.

## Results
* Frozen points evaluated: 20
* Two phase: 0
* Stable single phase: 17
* Nonconverged or boundary: 3
* Required behavior: two phases at every declared temperature/composition point
* Topology decision: QUALITATIVE_TOPOLOGY_FAILED

## Decision basis

Every case records its pinned-input hash, TPD search, Gibbs objectives, optimizer status, boundary status, isoactivity residual, and material-balance residual. A failed or nonconverged case fails the topology gate honestly.

This result is qualitative only. Quantitative LLE validation and sulfur-prediction admission remain separate, not evaluated, and not admitted. This artifact is never release eligible.

REJECT
