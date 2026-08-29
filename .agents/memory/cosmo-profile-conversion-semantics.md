---
name: COSMO profile conversion semantics
description: Governing boundary between CPCM-X-emitted sigma profiles and the NIST Hsieh three-profile contract.
---

Do not treat CPCM-X-emitted sigma3 bins as NIST Hsieh bins merely by adding NIST constants to metadata. The equations and actual runtime parameters must match, and the raw surface charge-sign convention must be mapped to the NIST positive-acceptor mask using source-supported evidence.

**Why:** Independent reconstruction showed that CPCM-X used its own much smaller averaging radius and a decay coefficient of one, while the copied rows were labelled with NIST Hsieh constants. Under the retained raw charge sign, carbonyl oxygen also falls outside the NIST OT mask. Whole-surface sign inversion is only a sensitivity diagnostic, not an established correction.

**How to apply:** Before any topology or measured-LLE validation, make profile generation execute the selected governed conversion directly, verify heteroatom partitions at segment level, regenerate every component consistently, and keep downstream gates closed until both averaging and sign semantics pass.