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

The current real-state derivative result is **not qualified**. Saved cell 1
must not be passed to `solve_two_films` with those derivatives. The saved-cell
attempt is stopped before solving; there are no new real-state profiles,
component fluxes or total molar flux.

The admitted positive interior checks pass, but the almost solvent-free
dispersed-bulk tangent-integrability error increases under forward-step
refinement. Additionally, the pinned assembled excess model floors its
argument at 1e-12. The separate original log-activity wrapper has its own 1e-10
floor. Neither internal rule is a changed physical feed, and neither counts as
proof of a true unfloored boundary derivative.

The next scientific dependency is a qualified excess-activity boundary limit,
not another column run or relaxed numerical threshold. The report distinguishes
numerical derivative failure from independently unqualified boundary physics;
it does not classify the real extraction process as infeasible.

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