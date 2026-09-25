---
name: Hydraulic runtime portability
description: Separate cross-runtime numerical agreement from byte parity and physical validation.
---

For portable hydraulic replay, compare all trial/scenario decisions, root and continuation structure, and the selected candidate independently of floating-point byte equality. Numerical comparison tolerances must remain separate from unchanged scientific screening limits.

**Why:** The user reported a full downstream Node 24 versus supplied Node 20 replay with unchanged screening decisions and selection but small numerical differences and different output hashes. This is downstream-reported evidence, not independently rerun verification in this workspace.

**How to apply:** Describe that result as numerical consistency for the tested case, not universal runtime equivalence or physical/grade validation. Verify each result hash against its own content; never change engine thresholds to force cross-runtime tests to pass.