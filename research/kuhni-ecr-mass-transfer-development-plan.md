# Development and Qualification Plan
## Kühni/ECR Mass Transfer, Physical Compartments, and Active Height

**Status:** Evidence-first plan; implementation not authorized  
**Model class:** Rate-based, multicomponent, physical-compartment model  
**Prohibited shortcut:** Assumed fixed stage efficiency  
**Target workflow:** Stage 1 Inputs → Stage 2 Thermodynamics → Stage 3 Hydrodynamics → Stage 4 Mass Transfer / ECR Sizing

---

## 1. Executive decision

Do **not** calculate physical compartments as:

\[
N_{\mathrm{comp}}=\left\lceil \frac{N_T}{\eta_{\mathrm{assumed}}}\right\rceil
\]

Instead:

1. Stage 2 defines the equilibrium separation duty: validated local LLE equilibrium, inlet states, product targets, and theoretical \(N_T\).
2. The required Stage‑3 operating-point handoff supplies each admitted hydraulic candidate: \(D_C\), governed compartment geometry, RPM, operating \(d_{32}\)/DSD and holdup, slip/contact time, flooding load, \(P/V\), uncertainty, and applicability. The current Stage‑3 record does not yet provide this complete handoff.
3. A Stage‑4 rate-based model solves real counter-current physical compartments with finite interphase transfer and measured/qualified axial mixing.
4. Increase integer \(N_{\mathrm{comp}}\) and rerun until the Stage‑2 duty is met.
5. Calculate:

\[
H_{\mathrm{active}}=N_{\mathrm{comp}}h_{\mathrm{comp}}
\]

\[
\eta_{\mathrm{overall}}=\frac{N_T}{N_{\mathrm{comp}}}
\]

\[
\mathrm{HETS}=\frac{H_{\mathrm{active}}}{N_T}
\]

Efficiency and HETS are **results**, never inputs.

This architecture is supported by direct Kühni rate/axial-dispersion work, physical-compartment models, and pilot-calibrated population-balance sizing [S1, S2, S3, S4].

### Critical prerequisite finding

The current Stage‑3 record is **not yet a sufficient mass-transfer handoff**:

- `floodHoldup` is the holdup at the turning-point capacity maximum, not the operating holdup at the selected flow/load;
- Stage‑3 has no local operating holdup/DSD/residence-time profile;
- its compartment height is currently a resolver geometry ratio, not an approved ECR hardware pitch;
- a run using the \(N_T=7\) hydraulic fallback has no Stage‑2 separation result to convert.

These are Stage‑3/parent-contract prerequisites, not values Stage 4 may assume.

---

## 2. Scope and boundaries

### In scope

- Local continuous- and dispersed-film transfer.
- Nonlinear multicomponent interfacial equilibrium.
- Hydrodynamic interfacial area.
- Counter-current physical-compartment balances.
- Both-phase axial mixing/backflow.
- Integer compartment search and active-height calculation.
- Coupled evaluation of every Stage‑3 `CALCULATED_IN_RANGE` RPM candidate.
- Applicability, uncertainty, immutable lineage, and validation.

### Out of scope for the first qualified kernel

- Assumed or user-entered stage efficiency.
- A single global distribution coefficient.
- Sulfur removal inferred from aromatic transfer.
- Use of `floodHoldup` as operating holdup or interfacial-area input.
- Use of the Stage‑3 \(N_T=7\) fallback as a Stage‑4 separation target.
- Use of the current resolver compartment-height ratio as final hardware pitch without governed geometry evidence.
- Release-ready RRBO/NMP results before actual-system pilot validation.
- CFD as the production solver.
- Unverified OCR equations.
- Silent transfer of water/toluene/acetone correlations to viscous RRBO/NMP.
- Automatic final-RPM selection before a deterministic engineering objective is approved.

---

## 3. Evidence position

### What the literature establishes

1. `d32 + holdup → interfacial area → finite-rate transfer → concentration profile` is an accepted calculation chain [S1, S2, S4].
2. Kühni axial mixing materially affects performance and may change when mass transfer occurs [S1, S5].
3. Transfer direction matters; direction-specific fits cannot be interchanged [S3, S7].
4. Published Kühni models require calibration or fitted transfer/mixing quantities and show material profile error outside their calibration systems [S1, S2].
5. Population-balance/HETS methods still require at least one pilot coalescence calibration [S2].
6. Multicomponent diffusion is not generally equivalent to independent scalar Fick diffusion [S12].

### What is not established

No located source validates one model across:

- RRBO/NMP/H2O seven-component thermodynamics;
- sulfur-family transfer;
- RRBO viscosity and interface contamination;
- project temperature and composition range;
- project-scale diameter;
- local drop population and both-phase backmixing;
- final active-height prediction.

Therefore, literature correlations may enter as **candidates and public benchmark routes**, not as governed RRBO/NMP design correlations.

---

## 4. Governing calculation chain

### 4.1 Immutable parent selection

Each Stage‑4 run must pin:

- Stage‑1 snapshot hash;
- Stage‑2 job ID, model/engine hashes, result hash, and equilibrium model identity;
- exact Stage‑3 resolver run ID, version, implementation hash, and immutable hash;
- exact admitted RPM trial from that Stage‑3 run;
- property/evidence package versions;
- mass-transfer kernel version and implementation hash.

Never read “latest” during replay. Parent selection is resolved and frozen when the run is created.

The Stage‑2 parent is admissible only when it has:

- a positive calculated \(N_T\), never the Stage‑3 default;
- a Stage‑1 hash matching the Stage‑4 design basis;
- the same transported-component mapping used by Stage 4;
- a pinned local-LLE/interface-equilibrium contract valid across the Stage‑4 path;
- explicit per-target calculability.

If sulfur is a required sizing target, Stage 4 must return
`SULFUR_TRANSFER_EVIDENCE_BLOCKED` until species-resolved sulfur equilibrium,
diffusion, and transfer evidence is admitted. Aromatic transfer may not satisfy
or proxy a sulfur target.

### 4.2 Hydraulic candidate loop

Evaluate every Stage‑3 trial classified `CALCULATED_IN_RANGE`. For trial \(r\), consume:

\[
D_C,\ D_R,\ h_{\mathrm{comp}},\ N,\ P/V,\ d_{32},\ \phi_d,\ 
u_{\mathrm{slip}},\ u_c,\ u_d,\ \text{flooding load}
\]

Do not use an extrapolated trial for a physical sizing result.

Before Stage 4 can consume that trial, Stage 3 must issue a new immutable
operating-point handoff containing, by physical compartment or qualified
uniform closure:

- operating holdup, distinct from flood-point holdup;
- operating \(d_{32}\) or DSD;
- slip/contact-time or residence-time distribution;
- local \(P/V\), velocities, and phase continuity;
- uncertainty and applicability;
- an approved hardware compartment pitch/geometry reference.

The present Stage‑3 flood-point quantities remain useful for capacity screening
but are prohibited as operating mass-transfer inputs. If a uniform operating
closure is proposed for pre-pilot use, it must be separately versioned,
validated, and labelled; it cannot be inferred from `floodHoldup`.

### 4.3 Interfacial area

For a spherical-drop representation using **operating** holdup:

\[
a_j=\frac{6\phi_{d,j}}{d_{32,j}}
\]

This is exact for the Sauter mean definition of a spherical population. Flood-point holdup is not admissible in this equation. If the Myint shape state indicates material deformation, Stage 4 must either:

- consume a qualified shape-corrected area model or measured area/DSD; or
- stop with `INTERFACIAL_AREA_MODEL_NOT_QUALIFIED`.

It must not silently retain the spherical identity.

### 4.4 Local interfacial equilibrium

For each component \(i\) at the interface, the governing condition is:

\[
\mu_{i,c}^{I}(T,P,x_c^I;\Theta_c)
=
\mu_{i,d}^{I}(T,P,x_d^I;\Theta_d)
\]

or the exactly equivalent phase-fugacity equality under the Stage‑2 model's
documented standard-state and pressure convention:

\[
f_{i,c}^{I}=f_{i,d}^{I}
\]

with:

\[
\sum_i x_{i,c}^{I}=1,\qquad \sum_i x_{i,d}^{I}=1
\]

Equality of \(x_i\gamma_i\) may be used only if the Stage‑2 model explicitly
proves a common standard-state convention that makes that reduction valid.
Stage 4 must not independently recreate or reinterpret activity conventions
for RRBO/NMP pseudo-components.

The Stage‑2 thermodynamic engine must expose a versioned local
interface-equilibrium callable or a frozen equivalent table valid over the
complete Stage‑4 composition path. That contract is the sole interfacial
thermodynamic authority and must document:

- phase-specific standard states/reference chemical potentials;
- fugacity/activity and pressure conventions;
- component and representative mapping;
- temperature/composition applicability;
- numerical phase-stability and interface residual criteria.

Admission requires numerical reproduction of the parent Stage‑2 tie-lines,
phase splits, and interface-flash results throughout the Stage‑4 composition
path. A single global \(K_D\) or slope is not admissible for the nonlinear
seven-component system. Every required sizing target must identify whether the
Stage‑2 thermodynamic model can calculate it; unavailable sulfur targets stay
independently blocked.

### 4.5 Two-film transfer

For each component and physical compartment:

\[
N_{i,j}
=k_{c,i,j}\left(C_{c,i,j}-C_{c,i,j}^{I}\right)
=k_{d,i,j}\left(C_{d,i,j}^{I}-C_{d,i,j}\right)
\]

For a locally linear equilibrium relation only:

\[
\frac{1}{K_{oc,i}}
=\frac{1}{k_{c,i}}
+\frac{1}{m_i k_{d,i}}
\]

The nonlinear production solve must calculate interface compositions and fluxes simultaneously. It must not freeze one \(m_i\) over the column.

### 4.5.1 Multicomponent flux closure

Independent componentwise Fick coefficients do not by themselves close a
concentrated seven-component flux model. Before production use, the contract
must define:

- mass-, molar-, or volume-average reference frame;
- dependent-component treatment;
- zero-net-molar/mass or volume-flux constraint, as applicable;
- thermodynamic-factor matrix;
- complete admitted generalized-Fick or Maxwell–Stefan diffusion matrix;
- phase-flow/property changes caused by transfer;
- mass-to-molar mapping for every pseudo-component representative.

A scalar Fick/two-film implementation is admissible only as a narrowly scoped,
validated dilute-solute benchmark. It is prohibited from assigning physical
height to the concentrated RRBO/NMP seven-component design unless its
approximation error is independently bounded and approved.

### 4.6 Candidate coefficient routes

No route is presently qualified for RRBO/NMP. Admission work must compare:

| Route | Intended use | Evidence state | Admission decision |
|---|---|---|---|
| Asadollahzadeh Kühni overall-\(Sh\) fits | Direct Kühni empirical benchmark, both directions | One leg recovered as \(Sh_{oc}=-5.19+5.39Re^{0.78}(1-\phi)^{-0.46}\); second leg and typesetting still require manual verification [S3] | Do not implement until both exact primary equations and ranges are checked |
| Kumar–Hartland column/single-drop correlations | Literature benchmark and possible preliminary closure | Used by Kühni studies, but exact primary equations/ranges not yet captured [S1, S2, S9] | Evidence acquisition required |
| Treybal swarm \(k_c\) + penetration \(k_d\) | Transparent two-film baseline | Validated by Fells for RDC/PSEC, not Kühni/RRBO [S4] | Implement only as a separately labelled benchmark after primary equation verification |
| Newman stagnant drop | Lower-mobility analytical limit | Spherical diffusion-only limit | Verification/reference kernel, not default |
| Kronig–Brink circulating drop | Clean mobile-interface limit | Ideal internal circulation; real drops may circulate less [S10, S11] | Verification/reference kernel, not default |
| Handlos–Baron | High-Re circulating/oscillating limit | Can overpredict dispersed-side transfer; velocity notation must be resolved [S4, S10] | Sensitivity/reference only until applicability is demonstrated |
| Maxwell–Stefan films | Concentrated multicomponent production candidate | Mechanistically appropriate but requires complete binary MS diffusivities and thermodynamic factors [S12] | Later qualification phase |

Before implementation, every admitted equation must have:

- primary typeset equation image/text;
- variable and basis definitions;
- units;
- direction;
- valid ranges for \(Re, Sc, We/Eo, Mo\), viscosity ratio, holdup, geometry, and phase continuity;
- original calibration systems;
- error statistics;
- exact numerical reproduction tests.

### 4.7 Physical-compartment balances

Use finite-volume balances on actual Kühni compartments. For component \(i\), compartment \(j\):

\[
0=
\dot n_{c,i,j-1}-\dot n_{c,i,j}
+B_{c,j}\left(C_{c,i,j-1}-2C_{c,i,j}+C_{c,i,j+1}\right)
-R_{i,j}
\]

\[
0=
\dot n_{d,i,j+1}-\dot n_{d,i,j}
+B_{d,j}\left(C_{d,i,j+1}-2C_{d,i,j}+C_{d,i,j-1}\right)
+R_{i,j}
\]

\[
R_{i,j}=N_{i,j}a_jV_j
\]

Equivalent axial-dispersion form is acceptable:

\[
\frac{d}{dz}
\left(u_p C_{p,i}-E_p\frac{dC_{p,i}}{dz}\right)
\pm N_i a=0
\]

provided the exact Danckwerts boundary conditions and signs are independently derived and tested. Apparent notation defects in accessible manuscripts must not be copied [S1].

The balance must additionally close total phase mass/moles and update local
phase flow, composition, density/viscosity, and equilibrium inputs consistently.
The six-family Stage‑1 basis and wet seven-component Stage‑2 basis require an
explicit conserved child mapping; adding or deleting “water” during basis
conversion is prohibited.

### 4.8 Axial mixing/backflow closure

Use a physical mixing-cell/backflow representation for the first production architecture because it:

- maps directly to integer Kühni compartments;
- preserves component conservation transparently;
- accepts phase-specific tracer-derived backflow;
- avoids treating HETS as an input.

However, \(B_c\), \(B_d\), \(E_c\), and \(E_d\) are not universal constants. They must come from:

1. phase-specific tracer RTD experiments over the operating envelope; or
2. a separately qualified, exact literature correlation inside its validated range.

Published 20–30% continuous-phase backflow and “negligible dispersed backmixing” are dataset observations, not defaults [S1, S5]. `Ed = 0` may be tested as a hypothesis but cannot be hardcoded.

### 4.9 Integer sizing loop

For each admitted RPM trial:

1. Set \(N_{\mathrm{comp}}=1\).
2. Set \(H=N_{\mathrm{comp}}h_{\mathrm{comp}}\), where \(h_{\mathrm{comp}}\) comes from a governed hardware geometry source rather than the current hydraulic ratio alone.
3. Rebuild all height-dependent residence, backflow/dispersion, and axial properties.
4. Solve the complete counter-current multicomponent system.
5. Apply numerical, thermodynamic, hydraulic, and duty acceptance gates.
6. Increment \(N_{\mathrm{comp}}\) and rerun until every Stage‑2 product target is met.
7. Rerun at the accepted integer count; do not interpolate fractional compartments.
8. Record:
   - physical compartments;
   - active height;
   - component concentration profiles;
   - \(k_c,k_d,K_o,a,k_oa\) profiles;
   - local driving forces and fluxes;
   - phase RTD/backflow basis;
   - emergent \(\eta_{\mathrm{overall}}\) and HETS;
   - uncertainty and applicability.

The search must be bounded by approved maximum compartments, maximum active
height, mechanical geometry, pressure-drop/flooding, and phase-continuity
limits. Every changed height must revalidate hydraulics and phase continuity.
If no integer candidate passes, return `NO_FEASIBLE_PHYSICAL_HEIGHT`; never
return the last attempted height as a design.

### 4.10 Coupled RPM outcome

Stage 4 must return a coupled feasible envelope over all in-range Stage‑3 RPM trials. It may not automatically select the lowest RPM, smallest diameter, shortest height, or lowest volume unless a deterministic objective is approved.

Potential objectives conflict:

- lower RPM reduces energy;
- higher RPM may reduce \(d_{32}\) and height;
- higher RPM may require a larger hydraulic diameter in the current Stage‑3 chain;
- total active volume and equipment cost may move differently.

Until the selection rule is governed, report:

- `MINIMUM_IN_RANGE_HYDRAULIC_RPM`;
- `COUPLED_MASS_TRANSFER_FEASIBLE_TRIALS`;
- `FINAL_OPERATING_RPM = REVIEW_REQUIRED`.

---

## 5. Required input and authority matrix

| Input | Owner | Current state | Stage‑4 rule |
|---|---|---|---|
| Temperature, pressure, phase configuration | Stage 1 | Available and hashed | Consume unchanged |
| Phase flows, densities, viscosities, interfacial tension | Stage 1 | Available | Consume unchanged; no downstream reconstruction |
| Seven-component composition basis | Stage 1/Stage 2 | Split across six-family Stage‑1 and wet 7C Stage‑2 contracts | Create a conserved mass↔molar child mapping with representative identity and phase-flow updates; do not mutate historical schemas |
| Local LLE equilibrium | Stage 2 | Engine-internal; result proves \(N_T\) but no stable Stage‑4 callable contract | Add frozen interface-equilibrium contract/table |
| Product duty and \(N_T\) | Stage 2 | Available only for valid matching result | Require calculated matching \(N_T\); reject hydraulic fallback and unavailable targets |
| \(D_C,D_R,RPM,d_{32},P/V,\) slip/flooding | Stage 3 | Capacity-screening values available by trial | Admit only `CALCULATED_IN_RANGE`; do not treat flood holdup as operating holdup |
| Operating holdup/DSD/contact time by compartment | New Stage‑3 handoff | Missing | Prerequisite; measured or independently qualified closure |
| Governed hardware compartment pitch | Mechanical/vendor evidence | Missing | Prerequisite for physical height |
| Multicomponent diffusion matrix and flux frame | New evidence package | Missing | Production fails closed; scalar Fick is benchmark-only unless dilute scope is validated |
| Interface mobility/contamination state | New evidence package | Missing | Fail closed or bounded reference-limits only |
| Both-phase RTD/backflow/dispersion | New evidence package | Missing | Fail closed for physical height |
| Local DSD/area correction | New evidence package or Stage‑3 extension | d32 only | Spherical identity only within qualified shape range |
| Inactive end-zone/disengagement allowances | Mechanical/process design | Missing | Report separately; do not add to active height silently |
| Final-RPM objective | Engineering governance | Missing | Return feasible envelope; no automatic final selection |

---

## 6. Evidence acquisition program

### Work Package A — Primary correlation dossier

Acquire and independently transcribe:

- Garthe thesis transfer, breakage/coalescence, slowing, and mixing equations [S8];
- Kumar–Hartland exact phase/overall coefficient correlations, database ranges, and errors [S9];
- both Asadollahzadeh direction equations and exact geometry/ranges [S3];
- exact correlations selected by Laitinen and Weber [S1, S2];
- Newman, Kronig–Brink, Handlos–Baron, and penetration/swarm equations from primary sources [S10, S11].

**Gate A:** no equation enters code until a second engineer reproduces the source equation, units, and at least one published numeric point.

### Work Package B — RRBO/NMP equilibrium and diffusion

Obtain over the complete temperature/composition envelope:

- direct multicomponent LLE/tie-lines;
- phase densities, viscosities, and interfacial tension;
- component Fick diffusivities for dilute benchmark work;
- binary Maxwell–Stefan/generalized-Fick matrices, thermodynamic factors, and a declared flux frame for concentrated production work;
- conserved representative mapping between six-family Stage‑1 and wet 7C Stage‑2 mass/molar bases;
- sulfur-species partition/transfer evidence independent from aromatic transfer.

**Gate B:** Stage‑4 remains `THERMODYNAMIC_OR_DIFFUSION_EVIDENCE_BLOCKED` until each transported component has an admitted phase-pair property route.

### Work Package B2 — Stage‑3 operating handoff and hardware geometry

Develop and qualify, without changing historical resolver runs:

- operating holdup at actual load, separate from flood holdup;
- compartment-local or qualified uniform d32/DSD and slip/contact time;
- local phase continuity and hydraulic uncertainty;
- approved rotor/stator/compartment pitch and mechanical bounds.

**Gate B2:** no mass-transfer area, residence time, physical compartment count,
or active height may be calculated from the current flood-point snapshot.

### Work Package C — Single-drop transfer

For both mass-transfer directions:

- bracket the Stage‑3 predicted in-range \(d_{32}\);
- measure formation, rise/fall, and coalescence contact periods;
- characterize deformation and internal circulation;
- test clean and representative contaminated RRBO interfaces;
- compare stagnant, circulating, penetration, and empirical coefficient routes.

**Gate C:** select the local film model by blind reproduction, not best calibration fit alone.

### Work Package D — Hydrodynamic/RTD pilot campaign

At multiple in-range RPM/load combinations:

- phase-specific pulse/step tracer RTDs;
- \(d_{32}\)/DSD and holdup by axial position;
- phase flow and pressure profile;
- flooding approach;
- both-phase backmixing/dispersion estimates with uncertainty.

Use separate tracers for both phases. Do not infer \(E\) or backflow solely from outlet solute concentration because it is confounded with \(k_oa\).

### Work Package E — Mass-transfer pilot campaign

Measure:

- both-phase inlet/outlet compositions;
- axial concentration profiles;
- actual transfer direction(s);
- d32/DSD and holdup concurrently;
- at least one calibration operating point;
- multiple withheld RPM/load points;
- preferably a withheld temperature or composition condition.

**Gate E:** freeze fitted parameters before blind runs.

---

## 7. Qualification strategy

### Level 0 — Equation transcription

- Exact primary equation and range.
- Dimensional consistency.
- Published-point numerical reproduction.
- Independent review.

### Level 1 — Mathematical verification

- Zero driving force gives zero transfer.
- Infinite-transfer limit approaches Stage‑2 equilibrium stages.
- Zero-transfer limit gives unchanged outlet compositions.
- Equal-and-opposite component transfer in every cell.
- Nonnegative flows, holdup, and compositions.
- \(\sum x_i=1\) and total/component conservation.
- Grid/cells-per-compartment refinement.
- Integer-height rerun consistency.
- Stable two-phase interface equilibrium.
- Stage‑2 tie-line, phase-split, chemical-potential/fugacity, and interface-flash reproduction under the identical standard-state convention.
- Closed multicomponent reference-frame constraint.
- Exact mass↔molar and six-family↔7C mapping conservation.
- Flood-point holdup rejected as an operating transfer input.
- Stage‑3 fallback \(N_T\) rejected as a sizing parent.

### Level 2 — Public literature reproduction

Reproduce, without refitting where possible:

- Laitinen ECR60/50G concentration profiles and balances [S1];
- Weber DN80 hydrodynamics/HETS holdout behavior [S2];
- Asadollahzadeh directional \(Sh\) points [S3];
- Fells two-film/compartment benchmarks [S4];
- Dongaonkar axial-mixing behavior [S5].

Acceptance is “no worse than the source’s reported metrics” with the same data exclusions and definitions—not a newly invented universal percentage.

### Level 3 — RRBO/NMP calibration

- Fit only predeclared identifiable parameters.
- Do not fit equilibrium error into \(k_La\).
- Do not fit both \(k_La\) and backmixing from outlet-only data.
- Report covariance, profile likelihood, or equivalent identifiability diagnostics.

### Level 4 — Blind RRBO/NMP validation

Pre-register measurement uncertainty and pass/fail metrics for:

- outlet composition/recovery;
- full axial concentration profiles;
- d32/DSD;
- holdup;
- RTD/backmixing;
- flooding margin;
- predicted physical compartments and height.

Report AARE/RMSE, signed bias, maximum error, and confidence intervals separately. A converged solver is not a validation pass.

### Level 5 — Scale-up validation

At least one larger-diameter or changed-geometry holdout is required before any industrial scale-up claim. Existing public evidence is mainly 60–117 mm and does not govern project-scale RRBO/NMP.

---

## 8. Proposed software architecture

### New modules

- `kuhni-mass-transfer-contract.ts`
  - canonical parent references;
  - component/property/evidence packages;
  - applicability and result statuses;
  - no calculation logic.
- `kuhni-interface-equilibrium.ts`
  - frozen Stage‑2 thermodynamic interface.
- `kuhni-film-transfer.ts`
  - versioned candidate coefficient kernels and range checks.
- `kuhni-compartment-model.ts`
  - conservative finite-volume balances and axial mixing.
- `kuhni-mass-transfer-resolver.ts`
  - RPM candidate loop, integer compartment search, uncertainty.
- `kuhni-mass-transfer-report.ts`
  - immutable engineering report.

In addition, Stage 3 needs a new versioned
`kuhni-operating-hydrodynamic-handoff` contract. It must not mutate or
reinterpret `KUHNI_GEOMETRY_RESOLVER_V1.0.0` or `V1.0.1`.

### New immutable persistence

Create a dedicated append-only `ecr_pre_pilot_kuhni_mass_transfer_runs` record containing:

- all parent IDs/hashes;
- selected correlation/evidence package IDs and hashes;
- complete input snapshot;
- result and diagnostic snapshots;
- implementation and calculation hashes;
- calibration/validation applicability;
- pre-pilot/release admission status.

Do not add these results to Stage‑3 geometry rows.

### API behavior

- POST carries parent selectors only, never physical-property or efficiency overrides.
- Server resolves and validates immutable parents.
- Create, latest, history, report, and numerical-replay endpoints.
- Historical engine versions replay through their original kernels.
- Missing evidence returns a dependency-blocked immutable outcome, not a fabricated result.

---

## 9. Status model

Recommended statuses:

1. `EVIDENCE_BLOCKED`
2. `STAGE2_PARENT_NOT_ADMISSIBLE`
3. `SULFUR_TRANSFER_EVIDENCE_BLOCKED`
4. `OPERATING_HYDRODYNAMIC_HANDOFF_BLOCKED`
5. `MULTICOMPONENT_DIFFUSION_CLOSURE_BLOCKED`
6. `INPUT_CONTRACT_READY`
7. `PUBLIC_BENCHMARK_REPRODUCED`
8. `RRBO_NMP_CALIBRATED`
9. `RRBO_NMP_BLIND_VALIDATED`
10. `NO_FEASIBLE_PHYSICAL_HEIGHT`
11. `PRE_PILOT_COUPLED_ENVELOPE_CALCULATED`
12. `FINAL_RPM_REVIEW_REQUIRED`
13. `RELEASE_ELIGIBLE` only after separate engineering approval

An execution failure, evidence blocker, physical infeasibility, and validation failure must remain distinct.

---

## 10. Implementation phases and stop/go gates

### Phase 0 — Evidence freeze

Deliver correlation dossiers, digitized datasets, exact equations/ranges, property requirements, and validation protocol.

**Stop/go:** no numeric mass-transfer code before Gates A and B are approved,
the six-family↔7C conserved mapping is defined, and a calculated Stage‑2 parent
with per-target calculability is available.

### Phase 1 — Contracts and immutable lineage

Implement types, evidence registry, parent binding, status model, migrations, and tamper-proof replay skeleton. All numerical outputs remain blocked.

### Phase 2 — Stage‑3 operating handoff

Implement a new immutable operating-point hydrodynamic contract and governed
hardware geometry source. Prove that operating holdup, local d32/DSD,
contact/residence time, and uncertainty are distinct from turning-point
capacity values.

### Phase 3 — Reference mathematics

Implement:

- local nonlinear interface solve;
- two-film flux framework;
- spherical interfacial area with shape gate;
- physical-compartment balances;
- no-transfer/equilibrium/reference limits.
- the declared multicomponent reference frame and conservation constraints.

### Phase 4 — Public benchmark engines

Implement versioned literature routes only after exact transcription. Reproduce S1–S5 datasets and freeze benchmark fixtures.

### Phase 5 — RRBO/NMP evidence ingestion

Add governed diffusivity, interface-mobility, RTD/backflow, DSD, and pilot datasets. Fit only approved identifiable parameters and freeze calibration revisions.

### Phase 6 — Blind qualification

Run withheld operating points, uncertainty propagation, sensitivity, and scale checks. Failed metrics remain visible and block promotion.

### Phase 7 — Stage‑4 integration

For every in-range Stage‑3 RPM trial:

- solve physical compartments;
- calculate active height;
- return coupled feasible envelope;
- calculate emergent efficiency/HETS;
- keep final RPM review-required until the objective is approved.
- enforce maximum compartment/height bounds and `NO_FEASIBLE_PHYSICAL_HEIGHT`.

### Phase 8 — Controlled release review

Independent review of evidence, software verification, blind validation, operating envelope, uncertainty, and report wording. Promotion creates a new immutable model version; historical records remain unchanged.

---

## 11. Definition of done

The model is complete only when it can:

1. bind and replay exact Stage‑1/2/3 parents;
2. solve componentwise nonlinear interface transfer conservatively;
3. consume local Stage‑3 hydrodynamics without user overrides;
4. account for both-phase axial mixing from qualified evidence;
5. search integer physical compartments and rerun accepted height;
6. meet Stage‑2 separation targets with reported balances and residuals;
7. reproduce selected public Kühni benchmarks;
8. pass blind RRBO/NMP pilot validation;
9. report applicability and uncertainty;
10. calculate, rather than assume, efficiency and HETS;
11. distinguish coupled feasible RPMs from final engineering selection;
12. preserve every historical model, hash, and run.
13. reject Stage‑2 fallback authority and unavailable sulfur targets.
14. consume operating—not flood-point—hydrodynamics.
15. use governed hardware pitch and bounded height search.
16. close the multicomponent diffusion reference frame and six-family↔7C mapping.

---

## 12. Source register

- **S1** Laitinen et al. (2019), direct Kühni axial-dispersion/CFD model: https://doi.org/10.1016/j.cherd.2019.04.018
- **S2** Weber et al. (2019), pilot-calibrated PBM/HETS performance maps: https://doi.org/10.1002/cite.201900057
- **S3** Asadollahzadeh et al. (2017), directional Kühni overall mass-transfer coefficients: https://www.ijcce.ac.ir/article_26471_73b33dd0fbb7a616c8563e5ff6be32a5.pdf
- **S4** Fells et al. (2022), two-film/compartment liquid-liquid transfer methodology: https://doi.org/10.3390/pr10050968
- **S5** Dongaonkar, Pratt & Stevens (1991), mass transfer and axial mixing in a Kühni column: https://doi.org/10.1002/aic.690370508
- **S6** Tahershamsi et al. (2016), Kühni rate-based/PBM modelling: https://ijogst.put.ac.ir/article_41600_21cdf688f400d856a6f3a37f87db1eae.pdf
- **S7** Hemmati et al. (2015), mass-transfer coefficients in a Kühni column: https://doi.org/10.1016/j.cherd.2014.07.011
- **S8** Garthe (2006), primary extraction-column thesis: https://mediatum.ub.tum.de/601973
- **S9** Kumar & Hartland (1999), transfer-correlation assessment: https://www.sciencedirect.com/science/article/pii/S0263876299718022
- **S10** Wegener, Paul & Kraume (2014), single-drop transfer review: https://doi.org/10.1016/j.ijheatmasstransfer.2013.10.070
- **S11** Kronig & Brink (1951), circulating-drop theory: https://link.springer.com/article/10.1007/BF00411978
- **S12** Bothe (2010), Maxwell–Stefan multicomponent diffusion: https://arxiv.org/pdf/1007.1775
- **S13** Sanpui, Singh & Khanna (2004), validated rate-based LLX: https://doi.org/10.1002/aic.10033
- **S14** Torkaman et al. (2024), forward-mixing/drop-distribution model: https://pmc.ncbi.nlm.nih.gov/articles/PMC10901875/
- **S15** Sulzer ECR product context, not qualification evidence: https://www.sulzer.com/en/shared/products/kuehni-agitated-columns-ecr

Detailed source metadata is in `research/kuhni-mass-transfer-sources.json`.