# Job C bound-aware correction qualification — offline only

## Recommendation

**Historical offline recommendation (superseded for implementation by explicit
user authorization):** this bounded nonlinear experiment is diagnostic-only.
Its local threshold candidates do not establish independent-start reproduction,
local stability, continuation-range acceptance, or design acceptance.  The
production bounded-BVLS implementation must therefore report a retained
intermediate residual decrease separately from final two-uncached-evaluation
four-gate admission; it must not promote either to design acceptance.

**Durable production selection principle:** admission priority precedes scalar
gate score. A non-repeatable or otherwise unadmitted candidate may be retained
only as diagnostic evidence; it must never outrank an admitted candidate merely
because its numerical gate score is smaller. Among admitted candidates, the
unchanged four-gate score supplies deterministic selection.

True unchanged 189-residual L2 decrease plus strict positivity decide intermediate line-search acceptance. The four unchanged gate checks classify a local threshold candidate; they never soften an intermediate step. Linear predictions are recorded only for comparison.

## Measured results

| state | matrix | accepted corrections | final residual L2 | final raw FV | final scaled FV | final original Job-B metric | all four gates | classification |
|---|---|---:|---:|---:|---:|---:|---|---|
| S0 | CAPTURED_FD | 9 | 8.67421e-09 | 3.00569e-09 | 7.78667e-10 | 2.88149e-14 | PASS | LOCAL_THRESHOLD_CANDIDATE_ONLY |
| S0 | ANALYTIC_CELLS_5_6 | 9 | 8.67421e-09 | 3.00569e-09 | 7.78667e-10 | 2.88149e-14 | PASS | LOCAL_THRESHOLD_CANDIDATE_ONLY |
| S1 | CAPTURED_FD | 7 | 1.1047e-13 | 3.61701e-14 | 6.6956e-15 | 3.90799e-14 | PASS | LOCAL_THRESHOLD_CANDIDATE_ONLY |
| S1 | ANALYTIC_CELLS_5_6 | 5 | 1.94629e-13 | 1.03865e-13 | 1.58971e-14 | 3.19744e-14 | PASS | LOCAL_THRESHOLD_CANDIDATE_ONLY |
| S2 | CAPTURED_FD | 8 | 1.30635e-13 | 7.36597e-14 | 2.29542e-14 | 4.26326e-14 | PASS | LOCAL_THRESHOLD_CANDIDATE_ONLY |
| S2 | ANALYTIC_CELLS_5_6 | 6 | 2.45082e-13 | 1.59298e-13 | 1.66865e-14 | 2.70894e-14 | PASS | LOCAL_THRESHOLD_CANDIDATE_ONLY |

## Controls and limits

- States are the three captured sequential linearizations S0/S1/S2, not independent starts. λ=1e-08, H=2 m, seven compartments, all 189 equations, captured bounds/scales, unchanged physics, and unchanged gate thresholds were retained.
- Fixed diagnostic budget: at most 12 sequential corrections and 6 true-residual trials per correction; fresh sparse-coloured FD is computed after accepted moves.
- Intermediate line-search acceptance uses true residual L2 decrease plus strict positivity. Local-candidate classification requires all four unchanged checks, including the original Job-B metric `maximumOriginalJobBGateResidual <= 1e-7`; no gate is softened.
- Full attempted states and 189-entry residual vectors are in the JSON. Hashes bind request/checkpoint, worker sources, pinned runtime, matrices, states, residuals, and trials.
- Independent-start reproduction, stability, production solver behavior, continuation range, and design qualification were not tested by design.

## Exact reproducer

From the workspace root, with the pinned numerical stack and single-threaded BLAS:

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 PYTHONDONTWRITEBYTECODE=1 \
python3 scripts/qualify-job-c-bound-aware.py \
  --diagnostics research-results/job-c-flux-column-diagnostics.json \
  --diagnostic-markdown research-results/job-c-flux-column-diagnostics.md \
  --checkpoint research-results/job-c-flux-column-evidence/checkpoint.json \
  --request research-results/job-c-flux-column-evidence/request.json \
  --runtime-root . \
  --runtime-artifact-root dist/predictive-nt-runtime-7c-1-5 \
  --id coupled-rejection:2:root:1e-08:trial:0:lambda:1e-08 \
  --output research-results/job-c-bound-aware-qualification.json
```

## Integrity and reproducibility

- Report hash: `689008854b42427e81e5be3bfddecc8effe359485fcef15b2116e546d312bc45`
- Capture hash: `0a80922cdf29ce668ae40055ef1e4d8681ea03c78a1f67c41cd3538294924fd0`
- Request file hash: `0ef527906b3da0e0b52135bd188decf02c9f97039e5b30a3af71f467df2bfa05`
- Checkpoint file hash: `8fc7dfb24b502ee127cd624c87cf098e51dd464b0738071452e59377969dda5d`
- Pinned runtime manifest hash: `f4e6e0156e6dc82dfaa3bf012a67ff143eb8cb45dd7c8208d9f924cec0d023fc`
- Qualification script hash: `c578934057a58eeb3c6569e8c00d5b7affaa93bf02afa52c507a3bbaad65326d`

No worker execution, Job C start/restart, workflow restart, database access, or production edit was performed.
