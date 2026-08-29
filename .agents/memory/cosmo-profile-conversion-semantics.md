---
name: COSMO profile conversion semantics
description: Governing boundary between CPCM-X-emitted sigma profiles and the NIST Hsieh three-profile contract.
---

Do not treat CPCM-X-emitted sigma3 bins as NIST Hsieh bins merely by adding NIST constants to metadata. Recalculate the profile from the raw surface. CPCM-X invokes xTB `--cosmo`, whose native zeta becomes the xTB TM convention only after multiplication by -1; that TM sign is consumed directly by the NIST positive-acceptor mask.

**Why:** Independent reconstruction showed that CPCM-X used its own much smaller averaging radius and a decay coefficient of one, while copied rows were labelled with NIST Hsieh constants. Pinned xTB source proves `--tmcosmo` negates native zeta, pinned CPCM-X source proves it uses `--cosmo`, and pinned NIST source consumes charge/area directly. Applying the authenticated bridge restores carbonyl oxygen to OT.

**How to apply:** Authenticate complete pinned upstream files by hash; execute Hsieh averaging, masks, linear binning, and P_hb directly; independently recompute all emitted bins and segment audits; bind downstream use to the verification hash.