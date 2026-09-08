# Isolated finite-film research

This directory is not imported by the application. It does not replace Job B,
run Job C, change a physical feed, or authorize a design result.

## Commands

```sh
OPENBLAS_NUM_THREADS=1 python -B research/finite_film/verify_thermo.py
OPENBLAS_NUM_THREADS=1 python -B research/finite_film/verify_solver.py
OPENBLAS_NUM_THREADS=1 python -B research/finite_film/verify_guardrails.py
```

`verify_thermo.py` constructs the exact pinned scientific runtime for local
excess-activity evaluations only. It does not call a flash, interface solver,
Job-A/Job-B calculation, column solver, or the scientific qualification job.
The numeric libraries are the pinned runtime's libraries in that process.
It independently verifies archived source/input/state hashes and reads the
actual saved continuous/dispersed compositions and interfaces—not axial seeds.

`verify_solver.py` runs synthetic numerical BVP benchmarks, not project cases.
It covers specified nonzero total flux, exact-zero solvent boundaries,
unequal component conductances, a coupled two-film problem with independently
started interface/flux determination, and nonideal derivative reconstruction.
Refinement changes numerical resolution and iteration budget, not acceptance
thresholds. A solver status is required alongside independently reconstructed
profile, flux and interface residuals.

`verify_guardrails.py` checks the full coordinate chain rule, literal boundary
preservation and rejection of negative interpolated profiles between nodes.

## Saved-cell gate

The **original floored adapter** remains unqualified. Its original validation
and report are historical evidence and have not been overwritten.

A separate source-grounded boundary adapter now passes the independent
qualification in `finite-film-boundary-qualification.json`, scoped to the
frozen 298.15 K case and exact recorded source/runtime hashes. It preserves the
underlying native plus RK equations, passes literal zeros unchanged, and keeps
the ideal logarithm separate. Read the archived native proof and source caveat
before using it; this is not an experimental transport qualification.

The subsequent bounded cell-1 attempts did **not** produce an admissible
numerical candidate. All seven starts were attempted with verified exact-state
caching: four were rejected on negative numerical trial profiles, and three
hit the time budget. No negative trial or timeout was accepted. Thus there is
still no qualified new cell profile, flux, height or downstream design output.

```sh
OPENBLAS_NUM_THREADS=1 python -B research/finite_film/verify_boundary.py
OPENBLAS_NUM_THREADS=1 timeout 195s python -B research/finite_film/attempt_cell1.py
```

The cell-attempt entry point checks the external qualification evidence and
source/runtime hashes before loading the model. It enforces no zero-total-flux
constraint: zero flux is only an initial numerical guess, with all seven
component fluxes free. Its output is numerical evidence, not acceptance.

The complete first failed boundary-approach check is retained. The pure-water
corner's nonzero approach at epsilon 1e-12 missed the 2e-10 limit; adding epsilon
1e-18 supplied three finer consecutive passing limit checks without changing
that limit or any physical feed. The original point is not relabelled passed.

The admitted positive interior checks pass, but the almost solvent-free
dispersed-bulk tangent-integrability error increases under forward-step
refinement. Additionally, the pinned assembled excess model floors its
argument at 1e-12. The separate original log-activity wrapper has its own 1e-10
floor. Neither internal rule is a changed physical feed, and neither counts as
proof of a true unfloored boundary derivative.

The next dependency is a domain-preserving, sufficiently efficient numerical
film solve—not another column run or a relaxed acceptance threshold. There is
no candidate yet on which to complete profile refinement, rank, independent
reproduction or interface stability/TPD acceptance. A negative intermediate
numerical trial does not show that every possible physical film is negative.

The version-2 isolated attempt uses six additive log ratios per phase, so
finite Newton iterates map to the open simplex without clipping or an epsilon
feed. Its synthetic manufactured two-film cases passed from two starts,
including an extreme-positive-boundary round trip. On the saved cell, the
legacy negative was localized to the *unprescribed* dispersed interface at
`s=0`: MONO reached -0.168893, about 7.6e14 machine epsilons, so it was not
Dirichlet roundoff. All three transformed saved-cell starts subsequently drove
a log ratio beyond double-precision interior representability and were
rejected. No candidate or refinement resulted. See
`finite-film-domain-solver-v2-validation.json` and
`finite-film-cell1-domain-v2-attempt.json`; prior evidence is preserved.

The later physical-coordinate work is retained as progressive numerical
evidence, not as an accepted profile. The original midpoint v3 outputs are
explicitly discrete seeds only. Dominant-component gauges (continuous NMP,
dispersed SAT) remove the tiny-H2O subtraction, and Lobatto defects converge,
but the historical power-basis endpoint override is not used for positivity.
The authoritative v5 representation stores cubic Hermite segments as Bernstein
controls and evaluates them by de Casteljau; the completed 17-node profile has
nonnegative controls (minimum dispersed control 2.506e-37) and a full-rank
199-by-199 reduced Jacobian under its recorded criterion. It nevertheless
misses the unchanged independent profile gate: scaled defects are 3.66e-8
(continuous) and 1.300e-6 (dispersed), while common-coordinate profile drift
from 13 nodes is 1.145e-7. The 33-node refinement did not complete inside the
300 s outer budget. Therefore two successive <=1e-8 refinements do not exist
and `finite-film-cell1-lobatto-v7-final-hold.json` records an honest numerical
hold, not process infeasibility.

## Numerical representation and limits

The solver uses full composition coordinates with a normalization gauge.
The complete value and derivative chain rule is applied. Normalization is
not component clipping or physical-boundary substitution.

Prescribed Dirichlet values are imposed by an explicit affine lifting of the
computed piecewise-cubic profile. The lifting magnitude is reported and all
constitutive defects are recomputed after lifting. Negative interior values
are never clipped. Every cubic's componentwise stationary roots are checked,
not merely the mesh nodes. This floating-point check is not certified interval
arithmetic, and a successful synthetic benchmark is not thermodynamic
qualification of a real profile.

True nonideal out-of-domain numerical trials raise an explicit domain error.
An algebraic signed-trial extension exists only for the ideal/constant-excess
benchmark branch, never as an accepted negative profile.

The proposed mobility remains an effective-resistance model assumption.
Its symmetric positive force pairing does not establish measured transport
accuracy, phase-path stability, interface global stability, or a unique real
solution. Those remain separate requirements before any future Job-C use.