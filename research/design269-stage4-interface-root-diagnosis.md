# Design 269 Stage-4 interface-root diagnosis

## Scope and method

This is a read-only isolated reproduction. It loaded the normal
`loadStage4PrePilotSizingAuthority` authority for design 269, reconstructed
the first local state at `transfer=0`, and sent **one unique request** to the
manifest-verified immutable Job-B worker. It did not rerun the Stage-4 column,
Stage 2, or Stage 3; it did not modify thresholds, worker, engine, or stored
results.

The request fingerprint is `ed2340c6146e8de562a18b206970df77bd7fa7595cd0ef8f0caabc6c9b065f80`. For physical count
5, both FV meshes (2 and 4 cells/physical compartment) and
both K&H coefficients (0.0126 and 0.0105) have this same initial request:
coefficient, Ec, cell count, dz, and interfacial area are applied only after
the per-area Job-B response. Thus there is one, not four, first-root identity.

## Immutable response

Worker status: **BLOCKED_NO_ACCEPTED_PHYSICAL_INTERFACE_ROOT**. Worker/source binding hashes and the
complete request, response, exact vectors, coefficients, and thresholds are
stored in [the JSON evidence](./design269-stage4-interface-root-diagnosis.json).

## Measured per-start gate comparison

| start | optimizer | rank | isoactivity | scaled flux equality | separation | orientation | endpoint stability |
|---|---|---|---|---|---|---|---|
| ORIENTED_PHASE_TEMPLATE | PASS | PASS | FAIL | FAIL | PASS | PASS | NOT_REACHED_NO_REPRODUCED_ELIGIBLE_PAIR |
| FROZEN_BULK_BOUNDARIES | PASS | FAIL | FAIL | FAIL | PASS | PASS | NOT_REACHED_NO_REPRODUCED_ELIGIBLE_PAIR |
| ORIENTED_TEMPLATE_BULK_C | PASS | FAIL | FAIL | FAIL | PASS | PASS | NOT_REACHED_NO_REPRODUCED_ELIGIBLE_PAIR |
| ORIENTED_BULK_D_TEMPLATE | PASS | FAIL | PASS | FAIL | FAIL | PASS | NOT_REACHED_NO_REPRODUCED_ELIGIBLE_PAIR |
| ORIENTED_PHASE_TEMPLATE_PERTURB_PLUS | PASS | PASS | FAIL | FAIL | PASS | PASS | NOT_REACHED_NO_REPRODUCED_ELIGIBLE_PAIR |
| ORIENTED_PHASE_TEMPLATE_PERTURB_MINUS | PASS | PASS | FAIL | FAIL | PASS | PASS | NOT_REACHED_NO_REPRODUCED_ELIGIBLE_PAIR |

“NOT_REACHED” means no reproduced eligible pair reached the worker's endpoint
stability branch; it must not be interpreted as a stability result. The exact
measured residuals and unchanged acceptance thresholds are in the JSON rather
than rounded here.

## Evidence-bounded diagnosis

At the first state, the continuous boundary is the exact fresh wet-solvent
feed and the dispersed boundary is the exact fresh RRBO feed. Consequently
the submitted continuous hydrocarbon fractions and dispersed NMP/H2O fractions
are literal zero. This follows directly from the Stage-4 `feeds` and
`transfer=0` initialization, not from mesh/coefficient selection. The
worker's response is therefore consistent across all four failed initial
cases. The existing response evidence can distinguish optimizer/rank/residual/
separation/orientation gates, but cannot label endpoint stability failed when
that branch was not reached.

No mapping, unit, coefficient scaling, or initialization correction is
established by this one-state evidence. In particular, changing a zero feed,
forcing equimolar total flux, altering Job-A coefficients, or relaxing any
gate would change the governed request/closure rather than diagnose this
immutable failure. Any future correction requires a separately qualified
constitutive or boundary treatment and fresh evidence; this report makes no
process-infeasibility claim.
