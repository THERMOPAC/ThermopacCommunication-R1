---
name: Predictive N_T runtime freeze
description: Why deployment packaging must cover Python runtime dependencies outside the scientific artifact manifest.
---

**Rule:** Treat the scientific model manifest and executable deployment bundle as distinct integrity boundaries. Hash the complete vendored scientific tree plus linked native dependencies; packaged runs must verify an exact path/size/content manifest.

**Why:** Hashing only package entry points and one principal binary missed executed SciPy optimizer/sparse code and native libraries. Also, Python checkpoint serialization can preserve integral-float spelling (`100.0`) that JavaScript normalizes to `100`, breaking strict ACK/final equality despite equal values.

**How to apply:** Any import-graph change must update packaging and runtime closure atomically. Qualification evidence used to unlock a result is executable input: bundle its decision, provenance, and pinned upstream artifacts, then verify every digest and every explicit acceptance invariant in the worker. Never unlock from a mutable status label alone. Exclude derived bytecode caches. Keep source/package hashes location-invariant, require packaged-manifest verification in production, recheck the hash after a solve, and normalize ACK payloads to JavaScript number semantics before persistence.