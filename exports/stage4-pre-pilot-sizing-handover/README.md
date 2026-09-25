# Stage 4 adopted-efficiency pre-pilot sizing handover

## Run (Node 20+, no dependencies)

Unzip, enter `stage4-pre-pilot-sizing-handover`, then:

```sh
npm test
npm run replay
npm run verify
node replay.mjs input.json
```

No installation, ERP, database, scientific runtime, Stage 3 engine or thermodynamic bundle is required. `index.mjs` exports `replayStage4(input)`. This is a **portable local replay**, not the original authenticated database service. The reference output is **not a saved Project 236 Stage 4 run**.

## Current equations and source boundaries

- Fixed design theoretical stages: **7**.
- Adopted average physical-compartment efficiency: **0.35**.
- Physical compartments = `Math.ceil(7 / 0.35)` = **20**; not hard-coded.
- Installed active height = `Math.round(Nphysical * selected_hc * 1e12) / 1e12`.
- Required active height equals installed active height.
- Implied installed HETS = installed active height / 7, **diagnostic only**.

The fixture carries the current Stage 3 handover replay selection: D=0.7 m, hc=0.21 m, rotor diameter approximately 0.231 m (original floating-point representation retained), free area=0.4 and speed=30 rpm. Result: **20 compartments, 4.2 m active height, 0.6 m implied installed HETS**. Stage 2 actual Nt is optional reference evidence only and never changes sizing.

Exact source bounds: hc/D in [0.2, 0.3], rotor/D in [0.33, 0.5], free area in [0.2, 0.4], rpm in [30, 70]. All numeric geometry fields must be finite and positive. Both geometric ratio identities have absolute tolerance 1e-9 m. No diameter range beyond finite positivity is invented. Missing selection, invalid bounds, missing current lineage and stale identities fail closed. hc=0.5D is not accepted and never used as a fallback.

## Input/output contract and adaptation

`input.json` is a complete runnable example. Numbers are SI metres and rpm; ratios and free area are dimensionless.

Required:

- `provenance`: literal `PORTABLE_REPLAY_NOT_SAVED_PROJECT236_STAGE4_RUN`.
- `currentLineage`: nonempty `stage1SnapshotHash`, `selectionImplementation`, `selectionResultHash` strings.
- `selectedStage3.lineage`: matching values for all three identities.
- `selectedStage3.geometry`: `status` must be `SELECTED_IMMUTABLE_OPTIMIZER_GEOMETRY`; `columnDiameterM`, `compartmentHeightM`, `hcToColumn`, `rotorDiameterM`, `rotorToColumn`, `freeArea`, `rpm` are mandatory.

Optional `actualStage2NtReference`: null/absent, or `{value, evidenceId, resultHash}`; value must be a positive integer and both identity strings nonempty. This is local reference metadata, not scientific acceptance certification.

Output includes `provenance`, screening `status`, explicit local-only `authority`, a clone of `selectedStage3`, `sizing` with the exact named scalars listed in `output.json`, nullable reference evidence and limitations. The adapter intentionally does **not** reproduce the original full service response or claim its implementation identity. Input aliases map original `stage3.result.stage4GeometryInput` to `selectedStage3.geometry`, original `calculatedNt` to reference `value`, and original reference identifiers to `evidenceId`/`resultHash`. Unknown fields do not override constants or equations. Errors throw; CLI exits nonzero.

The adapter additionally rejects positive heights that underflow the source's twelve-decimal rounding to zero. The extracted core remains source-identical for that edge case. `sizing-core.mjs` is a numeric primitive, not an authority gate; use the wrapper for replay consistency checks.

## Integration authority — required, not supplied

Matching local identity strings are only consistency checks. They cannot establish authenticity, freshness, ownership, engine currency, or hydraulic qualification. The fixture's local lineage labels are deliberately not database hashes. Never trust a client-provided `currentLineage`, `integrityVerified`, or admission boolean as server authority.

A production integrator must authenticate owner/design, load the actual current trusted Stage 1 and selected Stage 3 server records, verify source immutable/calculation hashes and current selection/optimizer version and implementation identities, enforce phase-orientation compatibility, reject stale/superseded selection evidence and absence of current selected geometry, and map the verified selection without reselecting or deriving hc. Resolve current identities independently from trusted server state; do not merely compare two copies of a request field. Preserve Stage 2 scientific acceptance and Stage 1 compatibility checks when attaching accepted Stage 2 evidence. Those checks, persistence and authentication remain integration responsibilities; this package provides none of them.

Both approved phase orientations may use the same numerical equations after appropriate server admission. This replay does not broaden either orientation's admission. No saved run is created, updated, inferred or certified.

## Source provenance and parity

`source-extracts.json` contains only exact relevant text slices from the current original `stage4-pre-pilot-sizing-service.ts`, their original function/line mapping, slice SHA256s and the SHA256 of the complete original parent file. The complete service and its imports are not distributed. `provenance.json` records the replay source digest and the reviewed server authority function boundaries.

`prepare.mjs` is a packaging-only extraction tool requiring the original workspace, **not** needed for portable operation. It emits `sizing-core.mjs` from exact constants and the selected-geometry check/equation block, stripping only TypeScript non-null assertions and relocating constants into the generated function. Small helper predicates reproduce the original finite/positive/error behavior. The return object and wrapper are explicit adaptations, not purported original service code.

Tests check exact source-slice/runtime parity, source-block evaluation and independent equations across 100 geometries, inclusive source bounds, invalid numbers, geometric tolerance, missing selection, no half-D fallback, stale/missing lineage, and reference-only Stage 2 behavior. They establish software replay parity, not independently validated science. The parent digest is a provenance fingerprint, not a signature or proof of current deployed authority. `SHA256SUMS.json` covers package files except itself; the external ZIP checksum covers the complete archive.

## Engineering limitations

Efficiency 0.35 is an adopted pre-pilot engineering assumption, not a published Kühni constant or calculated RRBO/NMP performance. No physical or pilot validation is provided. This module does not qualify hydraulics, predict separation, certify target compliance, establish scale-up validity or provide release-ready mechanical sizing. Integer rounding is not a demonstrated uncertainty allowance. Active height excludes disengagement zones and is not total vessel height. Pilot/vendor confirmation and appropriate performance validation remain required.