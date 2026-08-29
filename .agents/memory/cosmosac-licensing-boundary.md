---
name: COSMO-SAC licensing boundary
description: Commercial-admission limits and the qualified open route for NIST-compatible project-generated molecular profiles.
---

The NIST COSMO-SAC implementation is MIT-licensed, but its bundled UD and VT2005 `.cosmo` files are not covered by that grant. NIST says BioVia permitted them for academic, non-commercial use; all other use requires separate permission. ThermoSAC's repository and package declare no software license, so its code is not admitted for reuse without explicit permission.

The project owner confirmed that the intended use is commercial/engineering, not academic non-commercial use. Accordingly, UD/VT2005 profiles remain excluded unless separate written permission is obtained.

The admitted project-generation route is deterministic RDKit conformer selection followed by GFN2-xTB geometry optimization and CPCM-X conductor surfaces/profiles. Software releases, publisher checksums, license notices, generated geometries/surfaces/profiles, and integrity hashes must remain frozen together. Qualification establishes profile/runtime compatibility only; it does not establish phase topology or quantitative LLE accuracy.

**Why:** A permissive engine license does not grant commercial rights to separately licensed molecular profiles, and a public source repository without a license grants no general reuse permission.

**How to apply:** Do not execute restricted profile data during project verification unless permission is established. Historical results may be reviewed only as fully hash-pinned artifacts. For project calculations, preserve the complete qualified open generation bundle and rerun downstream topology/LLE gates independently.
