# Job-C rejected continuation trial: bounded offline diagnostic report

**Selection:** `coupled-rejection:2:root:1e-08:trial:0:lambda:1e-08`<br>
**Job:** `d7262954-99be-49fb-b143-b303dd83d2bc`<br>
**Mode:** immutable-source, residual/Jacobian diagnostic only. The Job-C worker, `case`, continuation, optimizer, and acceptance gate were not invoked.<br>
**Full machine-readable evidence:** `research-results/job-c-offline-rejection-analysis.json`

## Bounded conclusion

The captured **189-equation residual** and the captured rank-aware Jacobian/correction algebra are reproducible from the preserved state plus hash-verified immutable sources. This does **not** validate a full solver run and does **not** establish physical infeasibility.

The capture's `physicalInfeasibilityClaimed` field is **false** (its separate reason is null); the analysis therefore records `physicalInfeasibilityEvidence: false` and makes no physical infeasibility claim.

## Rejected state and gates

The selected state is the optimizer-best base state at **H = 2 m**, rejected at **lambda = 1e-8**. Independent exact residual reconstruction agrees with the captured metrics:

| metric | captured | isolated exact replay |
|---|---:|---:|
| raw FV residual (mol/s) | 2.3824227473820609e-7 | 2.3824227473820609e-7 |
| scaled FV residual | 2.4955967788910114e-8 | 2.4955967788910114e-8 |
| maximum original Job-B interface residual | 1.0149281780390735e-9 | 1.0149281780390735e-9 |
| minimum flow (mol/s) | 4.689733645362799e-10 | 4.689733645362799e-10 |

The rejection is specifically the raw FV gate (`2.3824e-7 > 1e-7`); scaled FV, original interface, and strict-positivity gates pass. Exact replay of every captured residual element on all three captured linearization states has max-abs and L2 difference **0**.

## Weak retained singular-direction checks

For every captured linearization, the two weakest **retained original-coordinate** right-singular directions and two weakest **retained equilibrated** directions were checked at relative safe-width steps `1e-3`, `1e-4`, and `1e-5`. Equilibrated directions were mapped back as **`dx = columnScale * v_equilibrated`**; mapping residuals are approximately `4.5e-16`–`9.5e-16` L2.

At the first captured state, the raw retained directions have singular values `1.726043e-4` and `1.725218e-4`, with predicted response L2 `2.889321e-4` and `5.857952e-4`. Their largest relative central-difference errors over the three steps are `4.15e-5` and `2.14e-5` (absolute errors up to `1.25e-8`).

The corresponding equilibrated weak retained responses are only `8.10e-15` and `6.28e-15` L2. They are explicitly classified **near-zero response / absolute-error-only**; relative errors are not interpreted as validation. Across later states, some equilibrated mapped responses rise to approximately `1.54e-8`, but step-dependent absolute error remains reported alongside any ratio. No weak-direction validation claim is based on a tiny relative global error.

The JSON contains all four directions for each of the three captured linearizations, all three step sizes, finite-difference L2, captured-Jacobian response L2, absolute L2/∞ error, and interpretation.

## Limiter coordinates and tanh structure

The exact candidate transform is `n = bound * tanh(u[12])`. Limiter coordinates are all `total_flux_tanh`, at cell 6 for the first linearization and cell 5 for the next two. The analytic residual column includes both transfer/FV and local interface contributions and is compared with the captured Jacobian column; the finite-difference checks use the same three bound-safe step sizes.

| cell | `u[12]` | `tanh(u[12])` | `d n / d u[12]` | analytic residual-column L2 | captured-column L2 | interpretation |
|---:|---:|---:|---:|---:|---:|---|
| 6 | 13.1358271663 | 0.9999999999922 | 5.5265e-11 | 3.3503e-17 | 2.1848e-14 | near-zero derivative; absolute-error-only |
| 5 | -12.9983944478 | -0.9999999999897 | 7.2748e-11 | 4.4102e-17 | 1.0500e-11 | near-zero derivative; absolute-error-only |
| 5 | -7.2985851071 | -0.9999990847087 | 6.4955e-6 | 3.9378e-12 | 3.9378e-12 | near-zero derivative; absolute-error-only |

For all three limiter columns, the analytic derivative is overwhelmingly FV/transfer contribution (`>0.99999999997` of analytic column L2); the interface contribution is approximately `7.0e-6`–`8.0e-6` fraction. The first two are structurally tanh-saturated, with `1-|tanh|` of `7.79e-12` and `1.03e-11`; the third is also saturated (`9.15e-7`). The larger captured-column values in the first two cases are numerically unresolved discrepancies consistent with finite-difference/roundoff effects relative to the analytically supported `~1e-17` response. Their cause is not proven; a Jacobian implementation defect is not excluded.

These findings cover one rejected trial and three captured linearizations, not every column or every Job-C state. Residual reconstruction reuses the frozen equations and thermodynamic engine; it verifies reproducibility, not independent physical validity. Central finite differences and analytic columns provide separate derivative checks within that same model.

## Rank-aware correction replay

The first two retained correction transitions reproduce the next captured states to max errors `1.78e-15` and `8.88e-16`. The third retained candidate is hash-referenced but has no captured state vector, so no state was fabricated for comparison. Raw numerical rank is 184 at each linearization; equilibrated rank is 187, then 186, 186.

## Evidence and source binding

The JSON records the input/checkpoint paths, capture hash, all four captured Job-C source hashes, the pinned scientific-engine hash, and the pinned numerical runtime (`numpy 2.1.3`, `scipy 1.14.1`, Python 3.12.12). AST extraction found `raw_evaluate` and candidate `equations`; direct residual replay uses only their unchanged arithmetic and the pinned engine `mu` closure.
