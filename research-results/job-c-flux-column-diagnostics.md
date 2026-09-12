# Job C: saturated-flux derivative diagnosis — offline only

## Finding and recommendation

**The six captured cell-5/cell-6 finite-difference columns are reproducible exactly.** At these saved states, the discrepancy from the analytic columns is attributable to floating-point rounding in the two-film flux arithmetic, amplified by subtraction and finite differencing. This is measured deterministic cancellation, not an assumed random-noise explanation. No cache or colored-block discrepancy was found in the tested columns.

**Do not apply an analytic-column-only production change.** Replacing these columns alone leaves the raw/equilibrated ranks unchanged and makes the unconstrained Ruiz corrections larger. A bound-aware linear correction is a better candidate for further qualification, but it closes the checked residual thresholds at only the first of the three saved states. Later states demonstrate substantial disagreement between the linear prediction and the true residual.

**User approval is required before production work.** No production solver, equations, physics, bounds, tolerances, gates, continuation logic, or workflow was changed. No Job C was started/restarted. No result is promoted to a design or reproducible branch, and no physical-infeasibility conclusion is justified.

## Evidence and reproducibility

- Baseline: `job-c-offline-rejection-analysis.md/json` (unchanged historical interpretation, supplemented here).
- New complete measurements: `job-c-flux-column-diagnostics.json`.
- Reproducer: `scripts/diagnose-job-c-flux-columns.py`, using `scripts/analyze-job-c-rejection.py` for the unchanged residual and Ruiz algebra.
- Persistent scientific-only inputs: `job-c-flux-column-evidence/request.json` and `checkpoint.json`. These retain the original worker request and selected rejected row, not unrelated queue records.
- Selection: `coupled-rejection:2:root:1e-08:trial:0:lambda:1e-08`, H = 2 m, λ = 1e-8.
- Capture hash: `0a80922cdf29ce668ae40055ef1e4d8681ea03c78a1f67c41cd3538294924fd0`.
- The old `/tmp` snapshots were absent. Matching snapshots were recovered through read-only development-database queries. The archived request, capture, attempts, states, residuals, Jacobians, bounds/scales payloads, and four worker sources pass the existing canonical validation. All files in the pinned scientific runtime manifest are hash-checked.
- The result binds the reference, diagnostic source files, selected audit payloads, scientific engine/runtime, request/checkpoint, and a canonical report digest.

The three unique captured linearizations are called **S0, S1, S2** below, in captured sequence order. They are not three independent starts. The final selected rejected state is not assigned a fabricated Jacobian.

Reproduce from the workspace root (no application workflow is needed):

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 PYTHONDONTWRITEBYTECODE=1 \
python scripts/diagnose-job-c-flux-columns.py \
  --checkpoint research-results/job-c-flux-column-evidence/checkpoint.json \
  --request research-results/job-c-flux-column-evidence/request.json \
  --runtime-root . \
  --runtime-artifact-root dist/predictive-nt-runtime-7c-1-5 \
  --id coupled-rejection:2:root:1e-08:trial:0:lambda:1e-08 \
  --output research-results/job-c-flux-column-diagnostics.json

OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 PYTHONDONTWRITEBYTECODE=1 \
python tests/job-c-flux-column-diagnostics.py
```

## 1. Exact residual, stencil, assembly, and cache checks

All **189 original residual entries** match the captured residual bit-for-bit at each linearization: max error **0**.

The pinned SciPy 1.14.1 stencil is `3-point`, with default step `eps**(1/3) * max(1, abs(x))` and the original recorded bounds. Both target columns use central differences. The cell-5 color also contains coordinates 3 and 69, which use the bound-adjusted one-sided stencil; these were reproduced as `x+h, x+2h`, while central coordinates use `x-h, x+h`. A color can contain both stencil types.

At each of the six state/column combinations:

| comparison | maximum absolute difference |
|---|---:|
| reconstructed default column vs captured column | **0** |
| individual column vs same-color simultaneous probes | **0** |
| cached vs uncached colored probes | **0** |
| repeated warm-cache probes | **0** |
| individual derivative outside declared support | **0** |

The original conservative sparsity mask has no support collisions within these target colors. The tested local cache uses exact byte keys and frozen arrays, extracted from the hash-verified source; uncached residuals are used for correction checks. These are targeted checks, not a proof of every Jacobian column or every future cache state. The Jacobian cache is source-inspected (exact λ/state match and copied return); no live cache was accessed.

## 2. Cancellation isolated in the unchanged two-film arithmetic

The analytic column includes both FV transfer signs and the six local film-equality rows. It uses the stable derivative

`dn/du = bound * 4 exp(-2|u|) / (1 + exp(-2|u|))²`.

This avoids the separate rounding loss in `1 - tanh(u)²`. Isoactivity rows have zero derivative with respect to total flux.

| state, cell | u | default absolute h | analytic column L2 | captured/default FD column L2 |
|---|---:|---:|---:|---:|
| S0, 5 | −12.97711819 | 7.85823481e-5 | 4.60195358e-17 | 1.05168894e-11 |
| S0, 6 | 13.13582717 | 7.95434031e-5 | 3.35034373e-17 | 2.18478565e-14 |
| S1, 5 | −12.99839445 | 7.87111855e-5 | 4.41023678e-17 | 1.04997810e-11 |
| S2, 5 | −7.29858511 | 4.41962497e-5 | 3.93779405e-12 | 3.93780658e-12 |

S1/S2 cell 6 is no longer tanh-saturated (u ≈ 1.70/1.73); it is retained as a control in the JSON. Near-equal interfacial compositions still make its *film* derivative small even when its FV derivative is resolved.

**Concrete isolation, S0/cell 5/NMP (zero-based residual row 162):**

- `nc` and `nd` are approximately −3.344635, with binary64 ULP = **4.44089210e-16**.
- The two stencil points change total flux by **1.19904087e-14**.
- Repeating the original `jc + xi_c*n`, `jd + xi_d*n`, subtraction and scaling reproduces the exact full-residual film values, with error **0** and no thermodynamic calls.
- The rounded, scaled residual difference is **1.65288332e-15**, giving FD derivative **1.05168868e-11**.
- Seventy-digit decimal arithmetic on the *same binary input operands*, before the flux additions/subtraction round, gives a scaled residual difference **2.91781494e-26**, or derivative **1.85653332e-22**.

For S0/cell 6/DI, the corresponding binary derivative is **2.14603704e-14**, versus **3.71596665e-24** before rounding. Full component-level `nc`, `nd`, ULPs, and differences are recorded for all six columns.

This locates the discrepancy upstream of the final finite-difference subtraction: nearly equal phase fluxes round differently when formed, and division by a small stencil width amplifies that difference. It is not explained by a wrong dependency mask or stale thermodynamic cache at these states.

A separate 70-digit tanh secant calculation gives relative central-stencil truncation error only **5.77e-11–4.22e-9** across the six default probes. That cannot explain the observed large absolute discrepancy relative to the tiny film derivative.

The step sweep confirms non-monotone quantization rather than stable derivative convergence. For S0/cell 5, column L2 is **3.42e-16** at h=1e-2, **1.05e-11** at the default h≈7.86e-5, **3.26e-14** at h=1e-5, and exactly **0** at h=1e-6 and 1e-7. Smaller h is not a remedy. All probes remain within the recorded bounds.

## 3. Ruiz amplification and analytic-column replacement

Both cell-5/cell-6 columns were replaced **only in a diagnostic matrix copy**; every other entry and all 189 rows/unknowns were retained.

At S0, the original Ruiz column scales are **1.7707e10** (cell 5) and **4.1506e11** (cell 6). Under the original row/column scales, `||R (J_FD − J_analytic) C||₂` for those columns is **0.21964** and **0.21408**. Thus tiny original-coordinate errors become material in equilibrated coordinates.

| state | raw rank, before/after | Ruiz rank, before/after | original correction L2 | analytic-replacement correction L2 |
|---|---|---|---:|---:|
| S0 | 184 / 184 | 187 / 187 | 7.7145e6 | 2.4458e14 |
| S1 | 184 / 184 | 186 / 186 | 7.9538e3 | 1.5891e13 |
| S2 | 184 / 184 | 186 / 186 | 6.9172e5 | 4.7855e7 |

For S0 the largest admissible scalar step shrinks from **6.2403e-6** to **1.0990e-13** after replacement. The replacement does not fix a fundamentally unconstrained correction through near-null directions. Its bounded scalar trials still fail the raw FV threshold. This is not evidence that analytic derivatives are intrinsically unsuitable; it is evidence against this isolated replacement as a sufficient remedy.

## 4. Bound-aware linear correction and true residual checks

For both matrices, an independent bounded linear least-squares subproblem minimized the **original solver-residual L2**, with original variable scales. Its diagnostic box is `0.99*(lower−x) ≤ delta ≤ 0.99*(upper−x)`; this merely keeps evaluations strictly inside the unchanged original bounds. BVLS used tolerance 1e-14 and at most 300 iterations; those are offline linear-subproblem settings, not changes to any Job-C tolerance.

Each direction was checked at four bounded scalar steps (1, 1/2, 1/4, 1/8 of the maximum tested step) using the **full unchanged uncached residual**, original raw/scaled FV and original seven-component Job-B residual metrics, and strict positive flow. The JSON records every direction, trial-state hash, prediction, exact metrics, and threshold comparisons.

| state | matrix | full-step predicted L2 | full-step true L2 | true raw FV mol/s | four residual thresholds |
|---|---|---:|---:|---:|---|
| S0 | captured | 8.8683e-9 | 8.8683e-9 | 3.0734e-9 | pass |
| S0 | two analytic columns | 8.8683e-9 | 8.8683e-9 | 3.0734e-9 | pass |
| S1 | captured | 1.6155e-14 | 2.1355e-6 | 1.5012e-6 | fail |
| S1 | two analytic columns | 1.6155e-14 | 2.1355e-6 | 1.5012e-6 | fail |
| S2 | captured | 9.5425e-15 | 2.1356e-6 | 1.5013e-6 | fail |
| S2 | two analytic columns | 9.5409e-15 | 2.1356e-6 | 1.5013e-6 | fail |

At S0, scaled FV = **7.9290e-10**, original Job-B residual = **7.2831e-14**, and minimum flow = **6.2261e-12 mol/s**, strictly positive. Direction L2 is **5.6447e-6**. Both matrix variants give essentially the same result; **the improvement is not attributable to replacing the analytic columns**.

At S1/S2 the direction L2 rises to approximately **7.59 / 7.98**. Every tested scalar step still fails the raw FV threshold. Successful termination of a bounded *linear* optimizer is therefore not evidence of nonlinear residual closure.

**The S0 result is one offline residual-threshold candidate, not a qualified solution.** No independent starts, branch reproduction, local stability, full solver/global acceptance, continuation, or design qualification was performed. The historical rejection is unchanged.

## Proposed next work, subject to approval

Qualify a bound-aware, residual-checked correction with nonlinear step control against these immutable states before considering a production patch. Require true original residual decrease and unchanged independent thresholds, retain all equations/bounds/gates/continuation, and address the S1/S2 failures explicitly. Compare captured and analytic matrices without assuming analytic replacement is necessary.

Do not simply enlarge the FD step, suppress small columns by an arbitrary threshold, loosen tolerances, change the tanh physical mapping, or interpret this rejection as physical infeasibility. Any later production implementation and Job-C rerun need separate approval and the existing full scientific qualification.