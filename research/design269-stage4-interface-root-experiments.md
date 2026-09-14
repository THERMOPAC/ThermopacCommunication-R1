# Design 269 first-root bounded numerical experiments

Two isolated experiments used the exact request and copied immutable
Job-B residual equations without running a column or changing any gate.
Baseline request fingerprint: `ed2340c6146e8de562a18b206970df77bd7fa7595cd0ef8f0caabc6c9b065f80`.
Immutable worker SHA-256: `70229d3eacfde61d906f39bc3dec8a29387cabfc96944493ffb5318653e02f2d`.

## Results

| experiment/start | rank | max isoactivity | max scaled flux | numerical eligibility |
|---|---:|---:|---:|---|
| dogbox: ORIENTED_PHASE_TEMPLATE | 13/13 | 1.77635684e-14 | 8.09094432e-18 | True |
| dogbox: FROZEN_BULK_BOUNDARIES | 9/13 | 4.0160294e-05 | 0.973092704 | False |
| dogbox: ORIENTED_TEMPLATE_BULK_C | 3/13 | 24.26506 | 0.0269072955 | False |
| dogbox: ORIENTED_BULK_D_TEMPLATE | 2/13 | 1.20081722e-12 | 0.0591766871 | False |
| dogbox: ORIENTED_PHASE_TEMPLATE_PERTURB_PLUS | 13/13 | 2.13162821e-14 | 4.4098631e-18 | True |
| dogbox: ORIENTED_PHASE_TEMPLATE_PERTURB_MINUS | 13/13 | 2.66453526e-14 | 2.83183051e-17 | True |
| scaled warm TRF: EXPERIMENT1_LOWEST_NORMALIZED_RESIDUAL_ENDPOINT | 13/13 | 1.77635684e-14 | 8.09094432e-18 | True |
| scaled warm TRF: EXPERIMENT1_ENDPOINT_INDEPENDENT_LOGIT_PERTURBATION | 13/13 | 1.77635684e-14 | 1.48331759e-17 | True |

Acceptance claim: **none**. The detailed JSON records exact
per-start optimizer, rank, residual, separation, orientation, bounded-state,
diffusive-frame, and total-flux-identity measurements. Reproduction and
endpoint-stability gates are not run unless an unchanged numerical candidate
first qualifies; absence of this branch is not an inference of infeasibility.
