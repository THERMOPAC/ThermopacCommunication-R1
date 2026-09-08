---
name: ECR Job-B state ownership
description: Separate Stage-2 bulk authority and the distinction between algebraic interface closure and finite-film admissibility.
---

Job B is bounded to seven-component interfacial flux and frozen local Stage-3
coupling. Compartment count, height, efficiency, and final RPM are outside this
authorization.

**Why:** The user explicitly separated local transfer validation from column
sizing. A broader existing solver is not authority to expand that scope.

**How to apply:** Preserve NT=calculated-or-7 independently of equilibrium
engine authority. Keep 7C-1.5.0 and its acceptance thresholds frozen.

The user explicitly requires separate continuous/dispersed bulk compositions
from governed Stage-2 state as simultaneous two-film interface boundary states.
Do not form thermodynamic composition by mixing bulk concentrations with
Stage-3 holdup. Do not supply an assumed/global partition ratio.

**Why:** The earlier pooled inventory was a Job-B construction, not Stage-2
authority. A failed flash on that constructed state does not classify the
RRBO/NMP system as single-phase.

**How to apply:** Report both seven-component bulk vectors and provenance,
Stage-3 operating holdup and d32, Job-A kc/kd, and the exact separate-boundary
interface request. Use holdup only for phase volumes/interfacial area.
Distinguish recorded Stage-2 incoming boundary streams from accepted
equilibrium outlets; never promote rejected outlet states or target failure
into an assertion about the real fluid system.

## Finite-film admissibility

Algebraic isoactivity, film-flux matching, and zero-sum molar diffusion do not
establish an admissible finite-film concentration profile. A nonzero total
molar flux is legitimate in principle; do not force equimolar transfer to
repair a solvent boundary failure.

**Why:** A saved interface root had positive NMP/water interfacial fractions,
effectively solvent-free dispersed bulk, and negative solvent fluxes. It
passed the frame identities but violated necessary nonnegative-profile
bounds for a local projected-Fick film with the frozen positive coefficients.
The endpoint projection can reverse a zero-bulk component's flux without
checking whether any connecting film profile exists.

**How to apply:** Distinguish the implemented endpoint-resistance approximation
from a local transport law. Any profile bound obtained by interpreting film
coefficients as constant local coefficients is conditional on that additional
assumption, not a proof about all transport physics. At a literal zero bulk
boundary the local projected-Fick law gives a negative interior concentration
for outward component flux, assuming steady nonreacting films and finite
positive transport coefficients. Preserve exact-zero feeds and original
gates; do not infer process infeasibility or silently reinterpret dilute
film inputs as Maxwell–Stefan coefficients. Qualify the transport closure
before treating interface algebra alone as physical branch evidence.

## Candidate derivation boundary

Treat a distributed representation of Job-A conductances as an explicit
effective-resistance model, not a proven molecular film thickness or a measured
Maxwell–Stefan matrix. Integrated concentration-gradient Fick transport is an
ideal benchmark; nonideal thermodynamic consistency needs its own assessment.

**Why:** Correcting the endpoint approximation alone does not establish
nonnegative Gibbs dissipation for a nonideal liquid. Also, differentiating
a floored log-activity evaluator would suppress the true zero-component
ideal limit, even while the physical feed remains exactly zero.

**How to apply:** For the proposed nonideal candidate, separate the ideal
logarithm analytically and qualify excess-activity derivatives and boundary
limits independently, without changing upstream physical states. A symmetric
positive mobility construction is a new constitutive assumption, not
experimental transport validation. Distinguish formula checks from numerical
film qualification and never transfer historical Job-B acceptance to changed
equations automatically.

Derivative refinement must vary the actual one-sided boundary step, not only
the nominal central step. Check unsymmetrized tangent integrability separately
from Gibbs–Duhem and relative derivative drift.

**Why:** A capped one-sided step can make two nominally refined calculations
identical. Through a floored excess-activity API, near-dry integrability error
can instead grow roughly inversely with step even while Gibbs–Duhem passes.
That is failed boundary derivative evidence, not proof that the unfloored
thermodynamic theory or extraction process is infeasible.

**How to apply:** Keep thresholds fixed, record per-direction actual step
sizes, and stop the real film solve when this qualification fails. Synthetic
numerical BVP success must never override a failed real-state derivative gate.

An unfloored native-excess extension may be admitted only with source-grounded
zero-limit reasoning, pinned-binary agreement and independent numerical
qualification; merely bypassing wrapper floors is not sufficient. Preserve
the native excess and additive scalar-Gibbs correction, with ideal logs separate.

**Why:** Nested floors can generate the apparent boundary inconsistency even
when the underlying excess equations have a regular limit. Conversely, a
positive segment-activity return alone does not establish convergence or
differentiability. Exact-equation regularity and a finite-tolerance evaluator's
numerical qualification are different claims.

**How to apply:** Check profile support/normalization, the actual segment
fixed-point residual against the derived stopping-rule implication, and
independent excess reconstruction. Scope qualification to its source,
temperature and numerical evidence; it never certifies a finite-film root.
When a bounded solve stops, inspect exception causes: an operational timeout
wrapped by a native evaluator must not be misreported as undefined physics.