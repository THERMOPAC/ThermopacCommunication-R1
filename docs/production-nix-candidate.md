# Minimum production Nix candidate

Status: finalized inactive candidate; all defined offline checks pass.
Full application validation and publishing belong to the separate isolated project.
NOT approved for production adoption here.
Active replit.nix and .replit are unchanged. No rebuild or publish was performed.

The candidate evaluates successfully on stable-24_05. Its deduplicated runtime
closure is 368 paths / 1,987,457,160 NAR bytes (1.851 GiB), excluding additional
Replit module/platform roots. Relative to the previously measured explicit
replit.nix plus .replit Nix roots (4,315,155,992 bytes), this is a potential
2,327,698,832-byte reduction (2.168 GiB), not a measured publishing-image saving.

## Candidate

Use `production-nix-candidate.nix` only in the separately authorized test project.
Resolve against the current stable-24_05 channel; do not upgrade the channel as
part of this experiment.

| Root | Reason |
| --- | --- |
| python312 | Current predictive worker invokes python3.12 |
| stdenv.cc.cc.lib | Vendored NumPy/SciPy/cCOSMO require C/C++ runtime libraries |
| zlib | Vendored numerical imports require libz.so.1 |
| chromium | DDS PDF rendering via server/dds-pdf-service.ts |
| poppler_utils | pdftoppm in server/utils/drawing-ai-extractor.ts converts PDF pages for extraction |
| which | Portable system Chromium discovery; already in the closure, zero additional NAR bytes |
| glibcLocales | Conservative hold until isolated locale/report checks; not proven irreducible |

GCC runtime and zlib are already transitive dependencies of Chromium. Explicit
roots document the scientific dependency without relying on the browser forever
retaining it. Native dependencies such as expat, NSS, NSPR, fonts and codecs remain
in their consumers' closures even without explicit declarations.

## Required launch environment

Installing library roots is NOT sufficient to make their shared libraries
discoverable by the bundled Python wheels. Supply LD_LIBRARY_PATH **only to the
Python child**, using a scoped python3.12 wrapper and this evaluated value:

```sh
nix-instantiate --eval --strict --json -E \
  'let pkgs = import <nixpkgs> {}; in pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib pkgs.zlib ]'
```

This returns a JSON string: decode it before use. Do NOT set it globally for
Node or Chromium: runtime validation found that the older GCC library breaks
the current Node module's ICU with `CXXABI_1.3.15 not found`.
Set it only within the Python wrapper; do not copy arbitrary workspace LD_LIBRARY_PATH or
hard-code the current store hashes into application code. Ensure python3.12,
chromium and pdftoppm resolve from the candidate roots. This document does not
change the active launch command or environment.

### Installing the scoped launcher in the separate test project

Copy `scripts/production-python312-wrapper.sh` as an executable named `python3.12`
in a dedicated launcher directory placed before the candidate Python directory
on PATH. Do not replace the Nix-store executable.

Set `PRODUCTION_PYTHON312_BIN` to the decoded result of:

```sh
nix-instantiate --eval --strict --json -E \
  'let pkgs = import <nixpkgs> {}; in "${pkgs.python312}/bin/python3.12"'
```

Set `PRODUCTION_PYTHON312_LIBRARY_PATH` to the decoded library-path expression
above. These are non-secret configuration values. The wrapper sets
LD_LIBRARY_PATH only in its own process before executing Python. Neither Node
nor Chromium receives that override. The offline harness installs and exercises
this exact checked-in wrapper, rather than a separate approximation.

Final measured closure including explicit `which`: **368 paths,
1,987,457,160 bytes (1.850964 GiB)**. Adding the declaration costs zero additional
closure bytes because the package was already a transitive dependency; making it
an explicit root exposes its executable on the candidate PATH.

See [runtime validation results](production-nix-runtime-validation.md) for the
partial component checks and remaining full-ERP blockers.

## Evidence

A credential-free Python 3.12.3 process, with `-S` and bytecode writes disabled,
imported only the frozen vendor directory:
`dist/predictive-nt-runtime-7c-1-6/server/research/ecr-pre-pilot-cosmosac/vendor/python`.

- Without a library path: failed on libstdc++.so.6.
- With GCC runtime only: failed on libz.so.1.
- With GCC runtime plus zlib: imported NumPy 2.1.3, SciPy 1.14.1,
  scipy.optimize, scipy.linalg and cCOSMO successfully. Each top-level module's
  file location was verified inside the frozen vendor directory.
- No application, worker, scientific solver or database connection was started.

This checks import compatibility, not full scientific results or confinement:
the process still sees the workspace's Nix store. A separately isolated publishing
test remains necessary.

## Proposed configuration reconciliation — not applied

- Replace the ten active replit.nix roots with this candidate only in the test project.
- Remove duplicate `.replit` Nix package declarations there, retaining locale
  data through the candidate. Otherwise historical MuPDF/SWIG/Xcode tooling
  continues to be included and reduces savings.
- Preserve Node.js and Python modules initially. Module-provided Python may differ
  in patch version; explicitly verify which python3.12 the worker launches.
- Do not remove the PostgreSQL module from this workspace. For the disposable
  publishing project, verify external database connectivity before omitting local
  database tooling. JavaScript pg/Neon clients do not need postgres binaries.
- Preserve all npm dependencies, lockfiles and the complete pinned 7C-1.6 runtime.
- Retired worker runtimes must remain absent.

PyMuPDF and RDKit are report inspection/profile-generation tooling, not current
production request consumers. The Nix NumPy/SciPy copies are not the pinned
libraries selected by the production scientific loader. SWIG, Xcode tooling
and standalone MuPDF have no identified current production build consumer.
Those conclusions do not authorize removing research/development support here.

## Gates before adoption

1. Separate project, restricted test storage/database, no live credentials, explicit
   worker/integration controls; schema work requires separate authorization.
2. Candidate-only build with unchanged package lock and scientific manifest.
3. Clean-environment numerical imports and governed worker preflight; scientific
   regression verification must retain unchanged tolerances.
4. Authenticated DDS PDF, drawing PDF-to-image extraction and representative
   reports, fonts, locale/timezone formatting and document downloads.
5. Verify deployed library search paths and executable resolution. Do not rely on
   workspace-only runtime binaries or `.pythonlibs`.
6. Measure actual publishing image layers. Nix NAR closure savings are not an
   image-size measurement.