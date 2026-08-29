---
name: COSMO-SAC licensing boundary
description: Commercial-admission limits for the NIST COSMO-SAC implementation, bundled molecular profiles, and ThermoSAC.
---

The NIST COSMO-SAC implementation is MIT-licensed, but its bundled UD and VT2005 `.cosmo` files are not covered by that grant. NIST says BioVia permitted them for academic, non-commercial use; all other use requires separate permission. ThermoSAC's repository and package declare no software license, so its code is not admitted for reuse without explicit permission.

**Why:** A permissive engine license does not grant commercial rights to separately licensed molecular profiles, and a public source repository without a license grants no general reuse permission.

**How to apply:** Do not execute restricted profile data during project verification unless permission is established. Historical results may be reviewed only as fully hash-pinned artifacts, including the generating code, model binary, inputs, profile inventory, manifest, results, and report. For project calculations, use independently generated profiles with documented rights and either obtain an explicit ThermoSAC license or implement the required equilibrium algorithms under a clearly compatible license.

The project owner confirmed that the intended use is commercial/engineering, not academic non-commercial use. Accordingly, UD/VT2005 profiles remain excluded unless separate written permission is obtained.