# Final standalone verification

## Executed

- Node v20.20.0, Linux; esbuild 0.25.0 used to produce the supplied runtime.
- Copied the finished current-only package to a newly created directory outside the ERP workspace: `/tmp/stage3-final-IgXaMf`.
- Ran the full current-input replay with an empty environment except PATH and temporary HOME:
  `env -i PATH="$PATH" HOME="$TEMP_DIR" node replay.mjs input.json replay-output/result.json`
- Compared the entire newly generated result with the first independently isolated current-input replay: **byte-identical**.
- Ran `env -i PATH="$PATH" HOME="$TEMP_DIR" npm_config_update_notifier=false npm test`.
- **16 tests passed, 0 failed, 0 skipped** (Node test duration 6461.809895 ms). Full output: `test-output.txt`.
- No npm dependencies were installed for replay/tests. No ERP server, database, secrets, network services or Stage-2 engine were used.

## Result scope

Full Cartesian current-input grid: 3,402 trials, 378 geometries, one requested orientation only; 158 eligible configurations and 3,244 rejected by the existing selector. Automatic discrete knee: D=0.7 m, hc=0.21 m, rotor=0.231 m, free area=0.40, 30 rpm. Output is a new local replay, not a saved app result.

Tests cover original snapshot equality/identity, physical basis and unit projection, six mandatory scenarios, roots/continuation/signs/residuals, Stokes limit, swarm/slip distinction, wrong-phase/temperature/density rejection, selector JSON reproducibility, stale-source and tamper rejection, complete grid cardinality, 36 freshly recomputed trial parity checks across four geometries, malformed grid rejection, original-source and authority SHA256, and local calculation hash.

The first test iteration found a test-only JSON round-trip mismatch caused by an undefined optional local-envelope provenance field (omitted by JSON). The assertion was corrected to compare JSON contracts; no scientific source or selector was changed. The final clean run above passes all tests.

## Evidence integrity and exclusions

Original source dependencies were copied byte-for-byte and checked against SHA256 provenance. The complete package has a self-excluding `SHA256SUMS.json` and `node verify-manifest.mjs` verification command. The separate ZIP checksum covers the archive bytes.

No older project snapshot or historical Stage-3 result artifact is included or used by final tests. No formulas were recreated. No app/server/scientific source, database, build workflow, publish state or saved result authority was modified.

## Not established

No independent primary-literature revalidation, pilot validation, grade validation, dynamic-stability proof, observed flooding threshold, sulfur-removal prediction, full ERP optimizer orchestration, application UI test, release approval or final equipment design is claimed. Full replay reproducibility and numerical closure are not physical validation.