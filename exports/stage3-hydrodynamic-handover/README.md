# Stage-3 hydrodynamic screening handover

**Conditional pre-pilot screening, extrapolated and not grade-validated. Not final equipment design, release authority, or a sulfur-removal prediction.**

## Contents and authority

The only project snapshot is the exact saved Project 236 / design ID 269 development input, last updated `2026-09-22 09:28:35.260509`, supplied by a read-only DEV SELECT. Original bytes are in `authority/project236-dev-snapshot.json`. Its original `inputData.immutableHash` is `4dfea564340a448b809860657eccebd5ea96c1a33c0f9af63e5875eebec2e3ce`. This is saved Stage-1 input authority, **not proof of a saved Stage-3 run**.

`input.json` embeds that inputData unchanged and specifies the local replay grid. `replay-output/result.json` is newly calculated standalone evidence, explicitly `NEW_LOCAL_REPLAY_NOT_DATABASE_AUTHORITY`. It is neither a saved application result nor an optimizer authority. No older project snapshots or historical Stage-3 result artifacts are included.

The current route is **40 °C, upward RRBO continuous / downward denser wet-NMP dispersed**. RRBO density 869 kg/m³; wet NMP 1015 kg/m³. The negative signed dispersed-minus-direction buoyancy result is deliberate, not a reversed-density mistake. S/O 0.6 is a mass ratio, not a volume ratio.

## Run without ERP

Node.js 20+ is required. No npm installation, ERP, database, credentials, network, Python or UI is required.

```sh
unzip Stage-3-Hydrodynamic-Screening-Handover.zip
cd stage3-hydrodynamic-handover
npm test
npm run replay
# Equivalent, with explicit filenames:
node replay.mjs input.json replay-output/result.json
node verify-manifest.mjs
```

Replay takes several minutes and overwrites the local output file only. Copy the folder elsewhere before changing inputs. `npm test` uses the included full replay result and independently recomputes 36 representative trials, as well as standalone numerical checks. The delivered full grid contains 3,402 trials / 378 geometries, with 158 eligible configurations. The existing automatic discrete-chord selector selects D=0.7 m, hc/D=0.30, rotor/D=0.33, free area=0.40, 30 rpm **within this specified grid only**. This numerical knee is not a unique engineering optimum.

`runtime/engine.mjs` is the runnable, tree-shaken bundle of unchanged scientific exports. `source/` contains the full runtime transitive original source dependencies used to build it (including legacy resolver modules required by original imports, not historical run data). `entry.ts` is packaging exports only. `build-metafile.json` records build inputs and built-in-only imports. The only runtime external module is `node:crypto`.

`reference-only/` contains current presentation/qualification source, not executed by this runner; it is not a second validated standalone entry. In particular, the V1.5 presentation qualification is not applied to relabel a P1 run. `provenance.json` records original paths and SHA256 for unmodified sources and authority bytes. `SHA256SUMS.json` covers the completed package except itself. ZIP checksum is supplied alongside the ZIP.

Optional source rebuild (not needed to run):

```sh
npm exec --yes --package=esbuild@0.25.0 -- esbuild entry.ts --bundle --platform=node --format=esm --tree-shaking=true --outfile=runtime/engine.mjs
npm test
```

The provided runtime was built with esbuild 0.25.0. Rebuilding needs npm registry access, unlike the delivered runtime. Scientific formulas are not reimplemented in the handover adapter. The adapter only projects existing Stage-1 basis, iterates the explicit grid, calls the existing P1 trial adapter, constructs a labeled local envelope and calls the existing selector. It does not execute the full ERP optimizer orchestration, create Stage-4 authority, write DB state or rerun Stage-2.

## Integration

Import the named exports from `runtime/engine.mjs` or import `replay` from `replay.mjs`. See `CONTRACT.md` for the exact units, input structure and error behavior. Keep snapshot identity and process basis together. Never promote a local envelope to trusted server evidence without independent application authorization and validation. Untrusted JSON must not be allowed to assert its own authority merely by supplying a hash.

Review `EQUATIONS-AND-LIMITATIONS.md` and `TEST-REPORT.md` before using any number. Numerical reproducibility does not qualify the physical model.