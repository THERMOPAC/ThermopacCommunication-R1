# Verification report

- Runtime: Node v20.20.0, built-in Node test runner; no dependencies installed.
- Workspace package test: **82 passed, 0 failed**.
- Separate clean temporary-directory copy, empty environment except PATH/HOME and npm update-notifier setting: **82 passed, 0 failed** using `npm test`.
- Equation/source-evaluation sweep: 100 selected geometries within one of the 82 tests.
- Original parent SHA256 and each extracted line range were independently checked against the current workspace source after generation.
- Source parent SHA256: `5b7e7a9fc485d1be79ac15a723171322efee4374566ec08f7a86d3017d3881f7`.
- Reference replay: 20 physical compartments, 4.2 m required/installed active height, implied installed HETS 0.6 m per design theoretical stage.
- Full TAP results are in `test-output.txt` and `clean-environment-test-output.txt`.

These are portable software tests only. The reference replay is not a saved Project 236 Stage 4 run and is not authenticated server authority. No hydraulic, physical or pilot validation was performed.

## Extraction mapping

Original parent: `server/ecr-pre-pilot/stage4-pre-pilot-sizing-service.ts`.

| Original location | Packaged role |
| --- | --- |
| Lines 29–30, fixed constants | Exact extraction in source-extracts.json; constants local to generated core |
| Lines 281–320, deriveStage4PrePilotSizing | Exact selected-geometry bounds and formula block; only non-null assertions removed in runtime |
| Lines 21–22, finite predicate | Equivalent standalone helper, not claimed as exact text extraction |
| Lines 69–71, fail | Equivalent standalone helper |
| Lines 239–241, positiveFinite | Equivalent standalone helper |
| loadStage4PrePilotSizingAuthority | Reviewed integration boundary only; not included or executed |

The generated return object, portable lineage consistency checks, provenance and reference metadata schema are explicitly adapted. The source's complete service response, authentication and persistence are not reproduced. Package file integrity is checked with `npm run verify`; the separate ZIP SHA256 protects the complete archive.