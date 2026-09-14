# Stage 4 interface-root diagnosis and correction

**Design 269 — PRE-PILOT PREDICTIVE / SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN.**

## Finding

The original interface solver could terminate successfully at a nonzero-residual
minimum. Optimizer success did not establish either chemical equilibrium or
agreement between the two films.

In the isolated reconstructed-inlet baseline, the best full-rank starts had
chemical-equilibrium residuals near 0.0019487 against a 0.000020 limit and
scaled flux-matching residuals near 0.0162908 against a 0.00000001 limit.
No start was numerically eligible. Stability checks were not reached.
This was not evidence that the feeds or physical process were infeasible.

## Qualified correction

A separately pinned Stage-4 numerical strategy uses bounded dogbox with
Jacobian scaling. It delegates to the original interface implementation,
retaining its equations, bounds, six starting points and complete original
acceptance checks. It does not modify the legacy worker or Stage 2/Stage 3.

The correction was qualified against both exact requests captured from the
production finite-volume assembly:

| Check | Limit | Coarse-mesh inlet | Refined-mesh inlet |
|---|---:|---:|---:|
| Numerical Jacobian rank | 13 | 13 | 13 |
| Maximum chemical-equilibrium log residual | ≤ 2 × 10⁻⁵ | 1.155 × 10⁻¹⁴ | 1.954 × 10⁻¹⁴ |
| Maximum scaled flux-equality residual | ≤ 1 × 10⁻⁸ | 1.214 × 10⁻¹⁷ | 5.613 × 10⁻¹⁸ |
| Interface composition separation | ≥ 1 × 10⁻⁴ | 0.855337 | 0.855337 |
| Independent-start reproduction difference | ≤ 1 × 10⁻⁶ | 2.276 × 10⁻¹⁵ | 2.442 × 10⁻¹⁵ |
| Phase orientation | Required | PASS | PASS |
| Local stability and step convergence | Original gates | PASS | PASS |
| Post-interface TPD, refinements and mono-rich search | Original gates | PASS | PASS |

Each selected root took nine function evaluations. This count is not the
total cost of the multistart and stability qualification.

## Exact-request boundary

The first requests are identical between coefficients within each mesh, but
coarse and refined requests are not bitwise identical. Finite-volume assembly
introduces floating-point differences, despite the analytically uniform
zero-transfer state. Therefore the original hand-reconstructed baseline
was not treated as sufficient production qualification.

Both exact payloads, full responses, runtime identities and selection gates
are preserved in `design269-stage4-dogbox-exact-request-qualification.json`.
The earlier baseline and its separate correction assessment remain preserved.

## Application changes

- Stage 4 uses the independently packaged and hash-verified numerical strategy.
- Failed local solves retain their exact request, full response, request hash,
  iteration and cell index for each coefficient and numerical mesh.
- The UI can show per-start measured checks, thresholds and expandable exact
  evidence. Checks that were not run are not reported as passing.
- The default legacy interface path, feeds, hydraulics and acceptance limits
  are unchanged.

## What this establishes

The original inlet-interface blocker is resolved under the unchanged
screening acceptance contract. This permits a bounded column calculation.
It does **not** establish convergence of other local states, target compliance,
physical compartment count, active height, overall efficiency or robustness.
Those require the separate conserved and mesh-qualified column calculation.