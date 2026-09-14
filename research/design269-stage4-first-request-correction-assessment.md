# Design 269 first-request correction assessment

## Supersession scope

This assessment corrects only the earlier **bitwise identity** interpretation.
It does not alter the executed baseline script
(`1851ed4484b74eef7a711b1f1fc744876f2cff75372156cd1c7ecf9a8ebaf005`)
or its immutable JSON evidence
(`1e6774cfb5a714bbf4ee595f2e5e854e5c70347d5d336cd7fdcd075fb1b4aafa`).

The direct capture evidence is
[`design269-stage4-first-request-capture.json`](./design269-stage4-first-request-capture.json),
schema `DESIGN269_STAGE4_ENGINE_ASSEMBLED_FIRST_REQUEST_CAPTURE_V1`. It used
the production `runStage4PredictivePhysicalSizing` assembly with capture-only
injected evaluators, count bounded to five. The inlet callback is explicitly a
structural extraction-orientation stub, not a scientific flash; Job-B is never
launched and no column proceeds beyond the first blocked local cell.

## Corrected request identity

| K&H coefficient | mesh | actual production assembly request SHA-256 |
|---:|---|---|
| .0126 | 2 cells/physical compartment | `b595ab74f3c6c14e288fa22258fe2d9a55714735c5d8114010536f702a3b83cc` |
| .0126 | 4 cells/physical compartment | `57f466d9540ad09bdb71372204f94bf78ec3d3532391df19acd1414a7c3dba8d` |
| .0105 | 2 cells/physical compartment | `b595ab74f3c6c14e288fa22258fe2d9a55714735c5d8114010536f702a3b83cc` |
| .0105 | 4 cells/physical compartment | `57f466d9540ad09bdb71372204f94bf78ec3d3532391df19acd1414a7c3dba8d` |

Thus coefficient does not change the captured first request for a given mesh,
but the coarse and refined first requests are **not bitwise identical**. Each
was captured at iteration 1, cell 0 by both the interceptor and the
engine's new `interfaceFailure` diagnostic hook.

The actual requests remain extremely close to the baseline manual request:
all `kc`, `kd`, dispersed fractions, `CtD`, and temperature match exactly; the
largest observed deviation is `CtC=1.819e-12 mol m^-3` (coarse) and
`x_bulk_continuous=1.110e-16`. The refined values differ by at most
`6.939e-18` in continuous composition. This is consistent with the
dispersion-backed backward floating-point assembly preceding the interface
call. It is not support for a claim of bitwise request identity.

## Bounded numerical evidence

The two already-authorized isolated root experiments are preserved in
[`design269-stage4-interface-root-experiments.json`](./design269-stage4-interface-root-experiments.json),
schema `DESIGN269_STAGE4_INTERFACE_ROOT_NUMERICAL_EXPERIMENTS_V1`; they use the
baseline captured request and the immutable worker residual algebra without a
column run or gate change. The bounded alternate `dogbox` method finds three
full-rank roots from the oriented template family in nine function evaluations
each. The primary has maximum isoactivity residual `1.77635684e-14` (limit
`2e-5`), maximum scaled flux residual `8.09094432e-18` (limit `1e-8`),
separation `0.8553367833` (minimum `1e-4`), and total molar flux
`-0.008344032879 mol m^-2 s^-1`, inside the unchanged bound
`±3.575815621068`.

The separate no-optimizer unchanged gate assessment
[`design269-stage4-interface-root-gate-assessment.json`](./design269-stage4-interface-root-gate-assessment.json),
schema `DESIGN269_STAGE4_INTERFACE_ROOT_UNCHANGED_GATE_ASSESSMENT_V1`, selects
the original oriented template and independent plus-perturbed solution.
Their maximum relative difference is `2.6645352591e-15` versus `1e-6`.
Both endpoint curvature checks pass (minimum eigenvalues `2.38744575e-4` and
`1.30584947e-4`, versus `-1e-6`), and both post-interface TPD assessments are
`ROUTINE_STABLE`, minimum `0`, with every refinement and explicit mono-rich
basin search accepted.

## Evidence-bounded conclusion

For the evaluated manual baseline request, the original immutable worker's
bounded `trf` multistarts terminate at non-root local minima while an
alternative bounded method reaches a reproduced, stable root under all
unchanged local gates. This supports a **numerical-method correction
investigation**, not a change to feeds, units, coefficients, phase mapping, or
scientific thresholds.

It does not modify the pinned worker, establish that the alternate method
solves the two mesh-specific bitwise production requests, or establish a
physical-column result. Any production correction must retain the exact
residuals, bounds, multistart reproduction, stability gates, and immutable
lineage; it requires owner review and new source-bound execution evidence.