# JSON contract

## Input: STAGE3_HANDOVER_INPUT_V1

The exact executable example is `input.json`.

- `schemaVersion`: literal `STAGE3_HANDOVER_INPUT_V1`.
- `snapshot`: full original saved `inputData` object, including `stage1` and `immutableHash`. The existing `makeStage1HydrodynamicProcessBasis` projects it without changing saved properties. This function is a basis projector, not an independent database-authority verifier; original byte provenance is separately checked.
- `grid`: nonempty arrays of positive finite numbers: `diameterM` (column diameter, m), `hcToColumn` (compartment height / column D), `rotorToColumn` (rotor / column D), `freeArea` (stator free-area fraction), `rpm` (rev/min). Cartesian product is evaluated.

Delivered grid: D=0.2 through 1.5 m in 0.1 m increments; hc/D=[0.2,0.25,0.3]; rotor/D=[0.33,0.4,0.5]; freeArea=[0.2,0.3,0.4]; RPM=[30,35,40,45,50,55,60,65,70]. Grid settings are explicit local replay controls, not claimed to be saved Stage-1 fields.

Stage-1 properties: feed L/h -> m³/s using 1e-3/3600; viscosity cP -> Pa·s using 1e-3; interfacial tension mN/m -> N/m using 1e-3. Wet-solvent volume flow = RRBO volume flow × RRBO density × mass S/O / wet-solvent density. Composition remains wt%; temperature 40 °C / 313.15 K; operatingPressure `"2.0"` is preserved as saved, not interpreted as a new hydraulic property correlation.

The trial API `evaluateRrboHydraulicTrial(diameterM,rpm,basis,geometry)` expects `geometry={rotorToColumn,compartmentToColumn,statorFreeArea}`; do not confuse those field names with grid names. `basis` is the existing Stage-1 projection in SI, not a handcrafted substitute.

## Output: STAGE3_HANDOVER_OUTPUT_V1

- `provenance`: literal `NEW_LOCAL_REPLAY_NOT_DATABASE_AUTHORITY`.
- `run`: labeled local selector-compatible envelope, `status="completed"`, current `sourceSnapshotHash`, `basis`, phase configuration and `result`.
- `run.result.engine`: unchanged P1 review version/hash identifiers, not an application-run attestation.
- `run.result.calculationHash`: existing canonical `kuhniRunHash` of result excluding this field.
- `run.result.orientationComparison[0].geometryGrid`: geometry plus all trial objects from existing `evaluateP1ReviewTrial`. No alternate orientation execution.
- `trial.hydraulicMethod`: complete six-scenario P1 kernel results; dimensions, powers, properties, qualifications, numerical policy, source extrapolation, branch/roots/continuation and governing scenario. Some infeasible trials have null hydraulicMethod; preserve reasons/status rather than silently replacing them.
- `selection`: exact existing `resolveAutomaticHydraulicSelection` output: selected representative (or null), per-diameter references, feasible/rejected counts, selector status/policy/hash, configured search and unknown qualifications. Numerical values use native JavaScript double precision.

Scenario units: d32 m; speed m/s; capacity m/s (total superficial flux at modeled turning point); holdup/root/loading dimensionless; area m²/m³; force residual N; velocity residual m/s; power W; dissipation W/kg; power density W/m³. Signed velocities use upward positive. `floodHoldup` is a code field for modeled capacity-turning holdup, **not observed flood**. Null operating root means no connected admissible root was established.

Errors: malformed schema/grid and unsupported phase/temperature throw explicit errors and CLI exits nonzero. Kernel rejects nonpositive/nonfinite physical inputs, invalid density/geometry and unbracketed/nonfinite roots. The existing trial adapter can convert a physical trial failure into a diagnostic trial; inspect its status/reasons. Selector rejects stale/mismatched identity, process basis, engine identity or content hash. It validates six-scenario eligibility, but is not a substitute for an authority access-control boundary.

Do not use the bundled `makeStage1HydrodynamicProcessBasis` to forge an immutable saved snapshot. The replay assumes the supplied original snapshot; SHA256 byte checks and the explicit DEV provenance preserve that distinction.