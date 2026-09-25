# Native engine: available material and rebuild limits

## Supplied runtime

The full runtime includes cCOSMO.cpython-312-x86_64-linux-gnu.so plus vendored NumPy 2.1.3, SciPy 1.14.1 and their library directories. Preserve all of them. The extension targets Linux x86-64 and CPython 3.12; the provenance records Python 3.12.12.

Native libraries include libstdc++ and zlib requirements. build-reference/scripts/prepare-production-runtime.mjs and production-python312-wrapper.sh show the existing Nix-based environment preparation. Nix store paths are environment-specific: the source app's generated shim is NOT a portable binary dependency.

The provided replit.nix declares glibcLocales, which, poppler_utils, zlib, python312 and chromium. This is the existing compatibility baseline, not proof that every package is scientifically required.

Run native import/preflight checks in the destination only after its environment is ready. Do not execute application startup/migrations simply to test a Python import.

## Available native source (incomplete)

native-source/research/sources/job-b/boundary-native contains:

- COSMO.hpp
- pybind11_interface.cxx
- LICENSE
- BOUNDARY-PROOF.md

The existing provenance identifies upstream:

    https://github.com/usnistgov/COSMOSAC
    commit 1b82456be38026719b16cad4076109bef3fcb309

These files are pinned source excerpts, not the full upstream build tree. In particular COSMO.hpp includes COSMO_SAC/profile_db.hpp, and the binding includes COSMO_SAC/COSMO.hpp plus pybind11/eigen headers.

Missing from this local source subset:

- The complete matching upstream source/header/build-system tree.
- Required pybind11 and Eigen development headers.
- A verified end-to-end rebuild recipe and compiler/linker version closure.

Do not claim this export alone can rebuild a byte-identical native extension.

## If a rebuild becomes necessary

In the destination, obtain the exact pinned upstream source and inspect its own build instructions/submodule requirements. Provision the target CPython 3.12 development ABI, C++ toolchain, pybind11, Eigen and matching headers. Preserve the NIST licence. Compare the supplied source excerpts with upstream before assuming they are interchangeable.

Build a separate candidate, not over the frozen binary. Check imports, profile parsing/semantics, scientific preflight and numerical parity using unchanged criteria. A rebuilt binary has a different hash unless proved otherwise and needs an explicitly managed new runtime identity; do not silently edit frozen manifests.

No native rebuild was attempted during export. No claimed compiler command or unverified build recipe is supplied.

## Profile licensing

Only project-generated profiles are transferred. Their existing generation/licence evidence is in licenses-and-provenance and the runtime. This generation route used RDKit, xTB and CPCM-X. Generator executables are not required for frozen-profile inference and are not included.

NIST software licensing does not automatically cover NIST UD/VT profile datasets. Those restricted datasets and ThermoSAC material are excluded. Preserve the native MIT-style licence and all NumPy/SciPy third-party notices already present in the frozen payload.