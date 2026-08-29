---
name: COSMO-SAC licensing boundary
description: Commercial-admission limits for the NIST COSMO-SAC implementation, bundled molecular profiles, and ThermoSAC.
---

The NIST COSMO-SAC implementation is MIT-licensed, but its bundled UD and VT2005 molecular profile databases are not covered by that permissive grant. Their published terms limit use to non-profit academic work and restrict redistribution. ThermoSAC's repository and published package declare no software license, so its code is not admitted for commercial reuse without explicit permission.

**Why:** A permissive engine license does not grant commercial rights to separately licensed molecular profiles, and a public source repository without a license grants no general reuse permission.

**How to apply:** Treat these assets as research-preflight inputs only. For commercial calculations, use independently generated profiles with documented rights and either obtain an explicit ThermoSAC license or implement the required equilibrium algorithms under a clearly compatible license.