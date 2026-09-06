# Superseded implementation record

The historical algebraic/pooled-inventory route below is no longer used by
the active Job-B service. Its rejected constructed-state flash does **not**
classify RRBO/NMP as single-phase. The corrected separate-boundary simultaneous
interface run is documented in `corrected-state-mapping-report.html` and
`corrected-saved-design-result.json`. That real saved-design rerun returned
seven fluxes with accepted interface gates; it remains preliminary.

# Job B implementation verification report

## Verdict

**Implementation checks: PASS — bounded seven-component local algebraic two-film flux.**

**Current saved-design evaluation: BLOCKED_NO_PHYSICAL_LLE.**
This is not a successful seven-component flux evaluation for that design.

Job B consumes Job-A's fourteen frozen film coefficients and diffusivities,
the exact selected Stage-3 operating holdup and d32, and an actual
`LOCAL_EQUILIBRIUM` result from the separately hashed pinned 7C-1.5.0 adapter.
Adapter preflight is rejected as equilibrium evidence.

This is a pre-pilot approximation, not a release-qualified thermodynamic or
mass-transfer result. Numerical validity is derived at runtime, separately from
that qualification status. Every Job-A `kc`, `kd`, and diffusivity must be
positive and finite; every active `m`, denominator, interface concentration,
`Kc`, `N`, and `aN` must be finite.

## Equations and units

Following Laitinen et al. (2019), Eqs. 9--11, and the two-film presentation in
Fells et al. (2022), Eq. 14--16:

```text
a = 6 phi_d / d32                                      [m2/m3]
m_i = C_d,i* / C_c,i*                                  [-]
C_ci = (kc C_c + kd C_d) / (kc + m_i kd)               [mol/m3]
C_di = m_i C_ci                                        [mol/m3]
N_i = kc kd/(kc + m_i kd) (m_i C_c - C_d)              [mol/m2/s]
Kc_i = m_i kc kd/(kc + m_i kd)                         [m/s]
N_i = Kc_i (C_c - C_d/m_i)                             [mol/m2/s]
1/Kc_i = 1/kc_i + 1/(m_i kd_i)                         [s/m]
r_i = a N_i                                             [mol/m3/s]
```

Positive `N_i` is continuous to dispersed. Corresponding component source
rates are `-r_i` and `+r_i`; Job B does **not** claim that the sum of
independent component fluxes is zero. The implementation calculates `a` with
the holdup factor once and performs no volume, compartment, or height
conversion.

`m_i` comes from the pinned solved flash tie-line *concentrations*. Flash
endpoints are never used as interface concentrations; the interface
concentrations above are solved analytically. The fixed bulk concentration
closure is `C_t = rho/MW_phase_average; C_i=x_i C_t`, tagged
`PRELIMINARY_FIXED_DENSITY_MOLECULAR_WEIGHT_CLOSURE`.

An absent-in-both-bulks component is explicitly inactive (`m=null`, `N=0`);
it does not produce a 0/0 partition failure. A missing/nonpositive partition
for a present component fails closed.

Both film fluxes are independently recomputed from their respective solved
interface concentrations. Closure requires each analytic-vs-film residual to
be no larger than `1e-12 mol/m2/s + 1e-10 * max(|fluxes|,1)`. Phase
conservation is independently evaluated from `-a*N_continuousFilm` and
`+a*N_dispersedFilm`, rather than subtracting a value from itself. Tolerances,
per-row bounds, and maximum observed residuals are included in the hashed
result. Any nonfinite value or closure exceedance blocks the calculation.

## Boundary and provenance

- Fixed order: SAT, MONO, DI, POLY, PA, NMP, H2O.
- Stage 1 remains physical-property authority.
- Stage 3 supplies only the frozen selected operating holdup/d32; Job B does
  not recompute holdup, power, drop size, slip, or hydraulics.
- The Stage-3 record reread immediately before equilibrium must match both the
  exact Job-A Stage-3 run ID and immutable hash.
- Phase orientation comes only from the verified Stage-3
  `phaseConfiguration`; both supported configurations are explicit and no NMP
  mole-fraction heuristic is used.
- Valid calculated Stage-2 NT, otherwise exactly NT=7, remains inherited
  lineage and is explicitly independent of the pinned equilibrium engine.
- No C2, legacy five-component authority, compartment count, active height,
  efficiency, broader sizing, or final RPM was added.

## API/UI and checks

Authenticated, body-free endpoints:

- `POST /api/ecr-pre-pilot/designs/:id/job-b/evaluate`

The Stage-4 **Test Job-B flux** action renders `m`, `kc`, `kd`, `Kc`, `N`,
`aN`, analytic film residuals, frozen local hydraulics, and hashes.

Focused tests cover component order, single-holdup area coupling, positive
sign/source conservation, equivalent reciprocal-basis equation, zero-flux at
tie-line equilibrium, finite two-film continuity, absent component handling,
invalid partition/state rejection, preflight rejection, deterministic hashes,
and no scope expansion. Adversarial tests cover zero/negative transport
properties, overflow, unsupported phase configuration, and changed Stage-3
parent ID/hash.

The POST route returns HTTP 409 with a bounded `details` object when the
pinned adapter blocks local equilibrium. It includes adapter status/result
hash, engine identity, and available scalar optimizer, isoactivity, balance,
separation, and Gibbs gates. It explicitly states that no flux metrics were
returned and does not weaken the frozen thermodynamic gates.

## Verification execution

- Job-A, Job-B, and Stage-3 focused suite: **23/23 passed**.
- Stage-4 UI server-rendering regression suite: **4/4 passed**. Covered
  independent Job-B display, per-job progress labels, all seven displayed
  rows/units, and blocked-equilibrium diagnostics without a flux table.
- Focused numerical and regression checks cover all seven rows, both film
  continuity equations, source signs, reciprocal partition convention,
  zero-inventory species, and fail-closed input/lineage handling.
- Focused esbuild transpile/syntax check across the changed Job-B engine,
  service, and routes — **PASS**.
- A direct service execution supplied by the owning agent for design 269/user
  3 reached the frozen adapter in about 90 seconds and correctly blocked with
  `JOB_B_DEPENDENCY_BLOCKED:SOLVED_7C_1_5_LOCAL_EQUILIBRIUM_REQUIRED`.
  This is not represented as a successful flux calculation. The route now
  preserves actionable bounded adapter diagnostics for that path.

Sources: `research/sources/kuhni-mass-transfer/laitinen-2019.md` (Eqs. 9--11,
18--21) and `research/sources/kuhni-mass-transfer/fells-2022.md` (Eqs.
13--16).

## Saved-design local thermodynamic replay

The direct server-service integration used saved design 269 and its existing
verified Job-A/Stage-3 dependencies. No browser login was bypassed, no session
was fabricated, and no design inputs were changed. The run took 72 seconds.

| Gate observation | Value |
|---|---:|
| Adapter status | BLOCKED_NO_PHYSICAL_LLE |
| Engine contract | 7C-1.5.0 |
| Optimizer converged | true |
| Isoactivity log residual | 4.796163466380676e-14 |
| Material balance residual | 1.1102230246251565e-16 |
| Maximum phase-composition separation | 1.3444106938820255e-17 |
| Gibbs reduction | -1.609823385706477e-15 |
| Flux metrics returned | false |

The numerical solve returned essentially coincident phase compositions, not an
accepted physical tie-line at this local state. Job B therefore does not
invent distribution ratios or publish fluxes. This result does not negate
Job A, forbid the default NT=7, or establish whole-process infeasibility.
The UI displays the structured thermodynamic blocker and its hashes separately
from a calculated flux result. No model gates were weakened.

The application restarted and serves on port 5000. The clean screenshot
browser remained signed out at the protected login page; authenticated
end-to-end browser interaction was not verified. The UI render tests use
explicit fixtures and do not claim a successful real-design flux run.