---
name: ECR-2 axial diagnostic selection
description: The accepted trial diagnostic must remain visible when the primary BVP is unavailable.
---

An axial transfer diagnostic is owned by its accepted diameter trial, not by the simulator's primary BVP. The snapshot may expose the accepted trial's frozen diagnostic and display basis, but must not reconstruct local terms, transfer, or reconciliation values in the client.

**Why:** Independent diameter trials can yield an accepted preliminary physical-height result while the primary (lowest-diameter) BVP is dependency-blocked. Binding the diagnostic UI to the primary BVP hides the very accepted trial engineers need to inspect and risks a second, divergent client calculation path.

**How to apply:** Select the accepted trial server-side, preserve its D/H/cell identity alongside its existing diagnostic, and render that payload outside primary-performance gates. Keep unavailable diagnostics empty and explicitly statused.