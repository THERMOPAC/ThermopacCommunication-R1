# Thermopac Stage 2 handover

Prepared 2026-09-25. This is a file export, NOT an application build, scientific rerun, deployment, or database export.

## Contents

- `dist/predictive-nt-runtime-7c-1-6/`: complete existing frozen runtime, with every file and relative path preserved.
- `reference/`: one existing saved job, exact saved Stage-1 snapshot, expected persisted result, worker request derived from that job, matching PDF, and verification evidence.
- `integration-source/`: selected original service/report/validation source and its local static-import closure; deliberately excludes the ERP database/auth/bootstrap boundary. Original API route files are reference-only; do not register their unrelated routes wholesale.
- `build-reference/`: original packaging/runtime preparation scripts, Nix configuration, dependency lock and package metadata. These are reference material, NOT a standalone installer.
- `native-source/`: available pinned NIST source excerpts, licence and provenance. This is NOT a complete native rebuild tree.
- `licenses-and-provenance/`: generated-profile admission evidence and NIST licence.
- `verification-source/`: selected existing tests and fixtures. Test doubles are NOT scientific solvers.
- `INVENTORY.json`, `SHA256SUMS`: full export inventory.
- `verify-export.py`: offline, read-only inventory/runtime verification; does not import the application, native engine or database.

## First steps in the NEW application only

1. Extract the ZIP preserving paths. Keep `dist/predictive-nt-runtime-7c-1-6/` intact.
2. Run `python3 verify-export.py` from the extracted root. This checks file bytes and runtime inventory, not numerical execution.
3. Provision a compatible CPython 3.12 Linux x86-64 environment and native libraries. Read NATIVE-BUILD.md. Do not install arbitrary newer NumPy/SciPy over the vendored versions.
4. Adapt the isolated job service to the new app's own database and authentication. Read INTEGRATION.md before invoking the worker: a bare stdin JSON pipe hangs/fails when checkpoint ACKs are required.
5. Validate native imports and the current worker's `--preflight` in the NEW environment; then run the reference request through a controller implementing checkpoint validation, persistence and ACKs.
6. Compare scientific results and trial dispositions against the frozen reference using existing tolerances, retaining numerical provenance and preliminary labels.

No startup, preflight, solver execution, dependency install or schema migration was performed in the source application to prepare this export.

## Reference calculation

Source: deliverables/stage2-report-corrected/frozen-job.json.
Job: 145e962e-892a-4424-aab9-91532af9f5ef; design ID 269; project reference 236.
Contract: 7C-1.6.0.
Engine hash: ff35a410554e3f30bb43715691752fdc2f6a016a4689c885bf91272a17c7b486.
Completed at: 2026-09-15T07:34:35.795Z.
Ten recorded trials (N_T=1..10), containing 55 stage records in total.
Accepted trial counts in the persisted result: 4, 5, 6, 7, 8, 10.
Selected Predictive N_T: 4. Trial 9 is NOT accepted.
releaseEligible=false; pilotValidated=false.

This is a verified historical completed reference, not a newly rerun benchmark or a claim of pilot/release qualification. Its temperature is 40 C and its saved recovery target is 80%; use the actual saved snapshot, not UI defaults.

The matching PDF is Project-236-Stage2-corrected.pdf:
SHA-256 1e1fa6d33d77d7cbf040bb95473e671842cdf93f347b933f598473b8ab1fdafe.
The similarly named UUID PDF in the original directory is NOT the matching artifact and is not included.

`reference/worker-request.json` is derived from input_snapshot plus the recorded engine hash and ACK protocol. It does not claim to be a captured historical stdin byte stream. `reference/expected-result.json` is the PERSISTED service result, which can include server-side governance enrichment; it is not necessarily identical to raw worker stdout. Keep frozen-job.json as the unmodified source record.

The archived verification hashes use SHA256(JSON.stringify(value)) in Node, preserving object order. File hashes are different. The export checks both independently.

## Qualifications and known limitations

- This transfers existing engineering material to the owner's new app; treat it as proprietary. No passwords, API keys, environment files, sessions, database dumps or source database connections are included.
- Project-generated sigma profiles are included with existing licence/provenance evidence. Restricted NIST UD/VT profile datasets and ThermoSAC data are excluded.
- COSMO-SAC compatibility and frozen-profile identity do NOT establish experimental water-bearing LLE accuracy.
- Sulfur remains the existing allocation/retention post-processing, not explicit sulfur-species equilibrium. Its historical reported ppm calculation retains the feed-mass basis and must not be promoted to demonstrated product sulfur compliance.
- The current runtime manifest includes five Python bytecode files. They are preserved. Do not remove them or regenerate an allegedly identical package without reconciling reproducibility. Disable incidental bytecode writing when verifying.
- Do not alter worker/profile/evidence bytes to make hashes pass.
- A replacement/rebuilt native extension changes binary identity. Do not overwrite the pinned binary and update hashes casually; qualify a separate candidate.
- Raw solver floats, timings, PDF timestamps and process metadata can differ across environments. Preserve tolerances and compare scientific payloads, statuses and acceptance, not just PDF byte equality.
- No promise is made that importing the original monolith package.json creates a standalone app. It is an exact dependency reference only.
- Foundation users/design tables and authentication must exist in the new database before the included predictive job migration is applied. Do not run source-app production-run.sh or unrestricted schema push.

The runtime manifest file SHA-256 is 2482213baab825170ffd9af67b66319674095f5864a9ceccb897b25a5b72e017.
Its aggregate payload SHA-256 is 617d26175b5355418ed5b987eb1655bff571dfbc039455b1a4891f35b98652d0.
Those are different hash definitions, not a mismatch.