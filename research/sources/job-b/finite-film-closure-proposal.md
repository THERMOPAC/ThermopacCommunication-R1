# Finite-film transport: derivation and qualification contract

**Status: proposed research formulation, not an implemented or qualified Job-B replacement.**

This document completes the equation/verification stage only. It authorizes no
production model change, Job-A/Job-B rerun, Job-C continuation, height search,
physical-stage assignment, efficiency assumption, or final RPM/diameter claim.

## 1. Frozen authorities and scope

- Component order: SAT, MONO, DI, POLY, PA, NMP, H2O.
- Keep the exact-zero NMP/H2O fresh-RRBO feed, Stage-2 bulk/thermodynamic
  authority, frozen Job-A coefficients, Stage-3 hydrodynamics, and historical
  Job-B/C records unchanged.
- Positive interphase flux is continuous to dispersed.
- No trace solvent, forced equimolar transfer, flux clipping, accepted negative
  profiles, widened existing gates, or invented Maxwell-Stefan pair coefficients.
- The saved cell is a future qualification case, not an operating state. This
  derivation does not solve it again or transfer its old qualification.

## 2. What Job-A coefficients support

For each phase p, define g[p,i] = k[p,i] C_T[p], in mol/(m2 s). These are
positive frozen **effective conductances**, not a multicomponent diffusion
matrix. Wilke-Chang and the Sherwood route provide an approximate dilute
calibration, not a derivation of concentration-dependent cross diffusion.

Use s in [0,1] as an **effective resistance coordinate**. Distributing these
conductances uniformly is an explicit new phenomenological model assumption.
It is not a measured film thickness, geometric drop profile, or molecular
diffusivity reconstruction. Different component Sherwood numbers must not be
silently converted into one supposedly proven common physical film thickness.

The integrated ideal-dilute resistance is calibrated to 1/g[p,i]. Outside that
limit the model needs transport evidence and sensitivity qualification; this
choice is not uniquely implied by Job A.

## 3. Coordinates, conservation and interfaces

Use a steady, isothermal, isobaric, nonreacting, locally planar effective-film
model with frozen phase total concentrations and conductances.

    Continuous: s_c = 0 at bulk;      s_c = 1 at interface
    Dispersed:  s_d = 0 at interface; s_d = 1 at bulk

Both coordinates point in the positive continuous-to-dispersed direction.
No dispersed-phase sign reversal is introduced.

The seven component fluxes N_i are constant through both films in this
planar model. Define n = sum_i N_i, rather than an additional independently
specified scalar. At every point:

    sum_i x_i = 1
    J_i = N_i - x_i(s) n
    sum_i J_i = 0

At the interface retain seven equalities of the existing dimensionless
chemical potentials:

    muhat_i(x_c^I,T) = muhat_i(x_d^I,T)

Here muhat = ln(x_i) + ln(gamma_i), not a dimensional energy. The existing
engine returns this dimensionless quantity; do not divide it by RT again.
For dimensional chemical potential multiply by RT once.

Bulk conditions are the actual two independent upstream compositions, not
an inventory mixture using holdup. Non-equimolar n is co-determined by the
coupled transport and interface conditions; it is not set to the sum of raw
endpoint gradient terms and no unqualified tanh bound is prescribed here.

## 4. Ideal benchmark model: local projected Fick transport

Let G = diag(g_i), 1 be the vector of ones, P = I - x 1^T, and prime mean
d/ds in the relevant film.

    J = -P G x'
    N = -G x' + x sum_i(g_i x_i') + x n

Eliminating the normalization constraint gives the explicit interior ODE:

    q(s) = [sum_i N_i/g_i] / [sum_i x_i(s)/g_i]
    x_i' = [x_i q(s) - N_i] / g_i

The denominator is positive on the simplex for positive finite g. This q(s)
is a local auxiliary quantity, not the frozen endpoint q of the old model.
This representation retains the composition-dependent molar transport term.

For ideal chemical potentials, its dissipation is

    -J dot muhat' = sum_i g_i (x_i')^2/x_i >= 0.

However, concentration gradients alone do not guarantee this sign when the
chemical potentials are nonideal. **Use this model as an exact benchmark,
not an automatically qualified RRBO/NMP replacement.**

## 5. Recommended nonideal candidate: explicit mobility assumption

The proposed research closure uses the existing nonideal thermodynamic force
with a new phenomenological mobility:

    L(x) = P diag(g_i x_i) P^T
    J = -L(x) muhat'
    N = J + x(s) n

This is not a fitted or measured Onsager matrix and not a Maxwell-Stefan
binary-friction model. Constructing L from the frozen conductances is an
explicit approximation with no new fitted parameters; Job A does not uniquely
determine this choice. The proposal needs its own qualification.

The matrix is symmetric positive semidefinite, L 1 = 0, and

    -J dot muhat' = (P^T muhat')^T diag(g_i x_i) (P^T muhat') >= 0.

Thus the reference-frame identities and the nonnegative force/flux pairing
hold algebraically. Calling this physical Gibbs dissipation additionally
requires a consistent thermodynamic chemical-potential field. Symmetry and
positivity of L do not certify the engine's derivatives or actual transport
accuracy.

For ideal muhat = ln x and sum_i x_i' = 0, this reduces exactly to Section 4.
For nonideal muhat = ln x + ln gamma, write the regularized, equivalent form:

    N = x n - P G x' - L(x) (ln gamma)'

This separates the analytic ideal logarithm from the excess contribution.
It avoids evaluating ln(0) or differentiating a clipped ideal logarithm at a
physical zero. It does not establish that the excess derivative is available.

To integrate a nonideal film, solve the resulting derivative relation on the
six-dimensional composition tangent space. A singular derivative operator,
unstable phase path, or inconsistent thermodynamic derivative is a reported
domain/qualification failure, not permission to regularize away the physics.

## 6. Exact-zero boundary and thermodynamic derivative contract

With finite g_i and a regular finite excess derivative, x_i = 0 implies that
the i-th row of L vanishes. The regularized law therefore gives

    N_i = -g_i x_i'  at x_i = 0.

At a dispersed bulk endpoint, negative N_i would give x_i' > 0 and hence a
negative profile just inside the film. This is an admissibility condition,
not an instruction to clip N_i to a chosen sign.

**Implementation prerequisite:** the existing 7C evaluator normalizes with a
1e-10 composition floor before calculating muhat. This is an internal
thermodynamic evaluation rule, not evidence of trace solvent in the physical
feed and not evidence that this floor caused the saved negative flux.

Blindly finite-differencing that clipped muhat would not qualify a true
zero-boundary derivative. A separate candidate adapter must:

1. Keep physical boundary compositions literal and unchanged.
2. Separate the analytic ideal ln(x) contribution.
3. Qualify simplex-tangent derivatives and one-sided limits of ln(gamma)
   against the unchanged thermodynamic model in its admitted domain.
4. Audit unsymmetrized derivative consistency, Gibbs-Duhem behavior,
   step convergence, and the relevant stability criteria.
5. Disclose a blocked/undefined boundary limit rather than substitute a
   positive boundary concentration. Mathematical limiting probes, if later
   needed, are derivative evidence only, never amended physical feeds.

No analytical Hessian/Gibbs-Duhem qualification was established by this source
inspection. Existing finite-difference, symmetrized stability diagnostics
cannot be relabeled as that qualification.

## 7. Unknowns and determination of n

One equivalent boundary formulation has 19 unknowns:

    6 continuous interface fractions
    6 dispersed interface fractions
    7 common component fluxes

It has 12 film endpoint constraints and 7 interface isoactivity equations.
The seventh fraction in each phase follows from normalization, and n=sum N.

A reduced shooting formulation has 13 unknowns: 6 dispersed interface
fractions plus 7 common fluxes. Integrate the continuous film from its fixed
bulk to obtain its interface, and the dispersed film from its trial interface
to its fixed bulk. Six dispersed endpoint constraints plus seven isoactivity
equations close that system. Either representation needs a full-rank
Jacobian for its own independent coordinates and reproducible roots.

No common-flux array may serve as its own conservation proof: reconstruct
each film's flux independently from the profiles and constitutive law,
including all seven components, and audit integration defects.

**Degeneracy:** an isolated film with identical endpoint compositions admits
J=0 and N=x n for arbitrary n. Therefore equal compositions do not, alone,
force n=0. For two distinct coexisting equilibrium phases with constant
profiles, N=x_c n=x_d n implies n=0. A vanishing-phase-contrast/rank-deficient
case must be reported as underdetermined or outside the admitted two-phase
domain, not “fixed” by forcing equimolar transfer.

## 8. Exact benchmarks

### A. All component conductances equal

For g_i=g, endpoints x_L, x_R and finite n:

    Pe = n/g
    N_i = n [x_L,i exp(Pe) - x_R,i] / expm1(Pe)
    alpha(s) = expm1(Pe s) / expm1(Pe)
    x_i(s) = (1-alpha) x_L,i + alpha x_R,i

The n=0 limits are N_i=g(x_L,i-x_R,i) and a linear profile. Stable exponential
evaluation is required; do not evaluate the removable 0/0 singularity.

For nonnegative endpoints alpha is between zero and one. If x_R,i=0 and
x_L,i>0, N_i is positive for every finite n, including negative n. This is a
direct non-equimolar, exact-zero benchmark without adding solvent.

### B. Binary unequal conductances, equimolar limit

Let x=x_1, N_2=-N_1 and n=0:

    x' = -N_1 / [g_1 + (g_2-g_1)x]
    N_1 = (x_L-x_R)[g_1 + (g_2-g_1)(x_L+x_R)/2]

This tests more than the equal-conductance simplification.

### C. Structural and limiting checks

Test component permutation invariance; reversal of the coordinate with reversal
of N and n; frame conservation; ideal reduction of the nonideal mobility;
finite excess-force behavior at an exact-zero component; the equilibrium
two-phase no-transfer case; and the equal-composition throughflow degeneracy.

## 9. Verification and qualification gates

**Completed now:** nine formula-level checks in finite-film-algebra-checks.py,
using synthetic compositions/conductances only. They exercise the identities,
exact profiles, unequal binary result, nonideal algebra and degeneracy above.
They do not call the project engine, integrate a numerical BVP, solve a saved
interface, or qualify transport accuracy.

**Required before saved-cell qualification:**

| Area | Required evidence |
|---|---|
| Input lineage | Frozen component order, temperature, both independent bulk vectors, g arrays, zero feeds and upstream hashes. |
| Thermodynamic derivatives | Dimensionless convention verified; ideal logarithm separated; excess derivatives/limits, unsymmetrized consistency, Gibbs-Duhem and step convergence assessed. No silent floor. |
| Numerical integrator | Independently recover equal-g finite-n and unequal-g binary benchmarks; scaled flux/profile error <=1e-8 on the finer solution. This is a new proposed benchmark requirement, not a changed historical gate. |
| Composition domain | sum(x)=1 within 1e-12; no accepted negative fractions or post-solve clipping. Exact prescribed endpoint zeros remain zero. Between-node/error-bound checks must support the claimed profile domain; unresolved tiny margins are not accepted. |
| Force/flux consistency | L symmetric/PSD and frame identities to roundoff; report local force pairing and thermodynamic derivative/domain validity. Never modify a Hessian to manufacture stability. |
| Interface chemistry | Preserve the pinned isoactivity and phase orientation/separation gates and all existing stability/TPD evidence requirements. |
| Film flux match | Independently reconstruct all seven film fluxes; preserve Job-B's <=1e-8 scaled equality gate with scale max(g_c,i,g_d,i,1e-12). The 1e-12 value is a scale floor, not a separate universal absolute acceptance tolerance. |
| Reproduction | Independent starts and profile resolution/tolerance refinement; preserve the pinned multistart agreement criterion. Candidate profile/flux drift <=1e-8 on appropriate scales in two successive refinements. No optimizer-success-only acceptance. |
| Non-uniqueness | Report phase-collapse/rank loss or multiple admissible roots. Do not choose a root merely for the desired solvent-flux sign. |
| Physical confidence | State infinite-dilution conductance and mobility assumptions; analytical success is not RRBO/NMP transport validation. |

If a candidate later enters Job C, preserve its existing 1e-7 raw FV and
interface gates and add independent terminal component/total balance checks
as already required. Passing local component residuals must not conceal their
same-sign column-wide accumulation. No existing threshold is widened here.

## 10. Decision and next boundary

Select the chemical-potential-driven mobility formulation as the **proposed
nonideal research candidate**. Keep projected Fick as its exact ideal benchmark,
not as a thermodynamically guaranteed nonideal replacement.

The derivation and formula checks are complete. The nonideal derivative/zero-
boundary adapter, numerical film BVP, saved-cell multistart qualification,
remaining axial-state qualification, and Job-C integration are **not done**.
The next bounded implementation would be an isolated derivative adapter and
film verification harness, not a production Job-B swap or column run.

No accepted height, physical stages, efficiency, RPM or diameter follows from
this document.

## Sources and evidence boundaries

- Project: research/sources/job-a/revised-closure-report.md, especially the
  frozen K&H base route and infinite-dilution fallback. These support conductance
  provenance, not the new mobility assumption.
- Project: server/ecr-pre-pilot/job-b-interface/worker.py, declared model,
  equations and gates. Archived candidate_interface.py preserves the old
  endpoint projection; this proposal does not edit it.
- Project: server/research/ecr-pre-pilot-seven-component-h2o-profile/
  run_qualification.py, normalize(), mu(), and finite-difference stability
  diagnostics. Inspection is not a rerun or an independent thermodynamic
  qualification.
- NYU, Mass Transfer: Definitions and Fundamental Equations, equations 34-35:
  https://research.engineering.nyu.edu/~rlevicky/Files/Other/Handout9_6333.pdf
  Supports the local molar-flux decomposition, not this project's coefficients.
- Bird and Klingenberg (2013), Multicomponent diffusion—A brief review,
  DOI 10.1016/j.advwatres.2013.05.010. Abstract/section preview consulted:
  https://www.sciencedirect.com/science/article/abs/pii/S0309170813000900
  Background on thermodynamic driving forces; no full-text equation replay claimed.
- Taylor and Krishna (1993), Multicomponent Mass Transfer:
  https://www.osti.gov/biblio/6453922
  Bibliographic/contents record only; not a primary derivation of the selected L.

The mobility construction, regularized form, unknown count and benchmark
derivations were independently reviewed. This does not substitute for
experimental transport validation or full numerical qualification.