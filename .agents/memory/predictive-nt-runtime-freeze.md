---
name: Predictive N_T runtime freeze
description: Why deployment packaging must cover Python runtime dependencies outside the scientific artifact manifest.
---

**Rule:** Treat the scientific model manifest and the executable deployment bundle as related but distinct integrity boundaries. Bundle every transitive Python support file and hash-check non-manifest solver support before starting the queue worker.

**Why:** The scientific manifest binds admitted model evidence, but dynamically imported flash code can depend on additional source and structural files. A build can therefore preserve the model hash while still producing an incomplete or altered executable runtime.

**How to apply:** Any change to the Predictive N_T Python import graph must update deployment packaging and its runtime support hashes atomically. Startup preflight must import and initialize the exact packaged runtime before jobs can be accepted.