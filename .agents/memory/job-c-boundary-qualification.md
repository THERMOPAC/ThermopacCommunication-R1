---
name: Job C boundary qualification
description: Governs independent root reproduction and numerically reliable local-stability evidence for Job C boundary interfaces.
---

Count a Job C boundary root as independently reproduced only when the selected, stability-checked representative is reached from a distinct initialization lineage with a different seed hash, adequate scaled seed separation, and direct endpoint agreement. Labels or representative-based class membership alone are insufficient.

**Why:** A strong boundary root was initially reached from only one start. A deterministic, well-separated witness reproduced it, but review exposed that approximate root classes are not transitive and could otherwise pair two endpoints that do not directly agree or return an endpoint different from the one stability-checked.

**How to apply:** Keep the representative as the returned endpoint, compare each witness directly with it, and preserve all rank, residual, phase, compatibility, TPD, and endpoint-agreement gates.

Initialization independence is measured on the full solved state, not composition coordinates alone. A deterministic nonzero initial total-flux coordinate is a valid witness only when its hash and lineage differ, its scaled seed separation passes, and it reproduces the endpoint directly.

**Why:** One axial contact had a narrow valid basin: broad composition perturbations missed it, while materially separated positive and negative total-flux seeds independently reached the same full-rank root at machine-scale residuals.

**How to apply:** Define flux witnesses from immutable bulk/template inputs before solving. Never derive them from a converged root, and never waive the minimum seed-separation check.

For Job C local stability, cross-qualify the log-ratio Hessian through a projected chemical-potential Jacobian and an independent coarser scalar tangent-plane reconstruction. Both routes, their step ladders, and raw projection symmetry must agree within the governed modewise tolerances; the curvature threshold remains unchanged.

**Why:** Fine scalar second differences amplified numerical noise and failed step agreement even though positive curvature, stable TPD, a coarser scalar ladder, and the projected reconstruction all converged. Selecting a convenient scalar step would be unsafe; cross-route agreement makes the numerical-method amendment fail-closed.

**How to apply:** Never treat TPD stability or positive minimum curvature alone as a substitute for Hessian step convergence. Version and hash any qualification-method change so cached or queued evidence cannot cross the method boundary.