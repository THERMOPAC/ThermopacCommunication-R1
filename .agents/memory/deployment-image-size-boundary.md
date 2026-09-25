---
name: Deployment image size boundary
description: Build-output size is not total publishing-image size; editor-hidden files are not documented publishing exclusions.
---

Do not use `dist` size or workspace `du` totals as the deployment image size. The publishing limit applies to combined image layers, including Nix/runtime layers whose inclusion and sizes are not fully exposed by build metadata.

**Why:** Publishing still exceeded the image limit after the current-only scientific runtime reduced `dist` substantially. Logs identify the combined-layer limit but do not report individual layer sizes.

**How to apply:** Report exact build-output savings separately from unverified image savings. The `.replit` `hidden` property controls file-tree visibility, not documented publishing exclusions. Never delete Replit-managed state, historical assets, or mixed evidence directories based only on their size. Audit active PDF and scientific consumers before removing system dependencies.

Build both server and frontend from inside an isolated release candidate, not from the original workspace with an external output directory.

**Why:** A workspace-based bundle can silently resolve imports from omitted directories and falsely suggest the candidate is self-contained. Generated-output folders can contain source-imported authorities; directory labels alone do not establish safe exclusion.

**How to apply:** Keep narrow, hash-verified exceptions for actual imports and download consumers. Run only the bundlers with a minimal environment, not application startup or the scientific packager.

Nix closure membership does not establish shared-library discoverability for the
vendored scientific wheels.

**Why:** Clean Python imports failed first on libstdc++.so.6 and then on libz.so.1,
even though retained Nix closures contained their providers. Supplying both GCC
runtime and zlib library paths made the pinned numerical imports succeed.

**How to apply:** When testing a reduced production environment, verify native
imports with a credential-free environment and explicitly resolved library paths;
do not infer success from retained dependencies or ambient workspace imports.

Scope the old-channel GCC/zlib library path to Python, not the whole ERP.

**Why:** Applying it globally made the newer Node module's ICU fail with
`CXXABI_1.3.15 not found`; a Python-only wrapper preserved Node and numerical imports.

**How to apply:** Validate Node, browser and Python together when changing native
library resolution. A successful standalone Python import is insufficient.