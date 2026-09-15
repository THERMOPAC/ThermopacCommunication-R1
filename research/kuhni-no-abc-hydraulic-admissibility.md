# STEP 2 — RRBO/NMP hydraulic-equation and joint ECR-geometry admissibility

**Decision:** The current software is **READY for its deliberately narrow,
deterministic Stage-4 HETS pre-pilot screening admission for both
orientations**, subject to current immutable lineage and the independently
checked presentation candidate. It is **NOT READY for governed hydraulics,
finite-rate Stage 4, correlation-based optimization, safe-throughput/power
screening, or commercial release for either orientation.** The distinction is
intentional: the HETS route carries a qualified presentation candidate's
diameter into fixed-\(N_T=7\), fixed-HETS arithmetic; it does not assert that
the underlying full hydraulic correlation chain is qualified.

This conclusion does not prohibit an ECR of the candidate diameters and does
not treat published apparatus sizes as commercial limits.

**Scope and execution boundary.** This is an additive source/equation
qualification. It reads the current dispatch and the existing Stage-3,
scale-up, low-\(\kappa\), and compartment audits. It does not call or modify
Job A, Job B, Job C, an application endpoint, a workflow, or the database. It
does not add an optimizer, constants, a design setpoint, a throughput bound, or
a power limit.

## 1. Current service path — qualification must follow this, not an obsolete base

The current save-time dispatch in
`server/ecr-pre-pilot-service.ts` is explicit:

```text
rrbo-continuous-nmp-dispersed  -> resolveKuhniGeometryV150(...)
all other configured orientations -> resolveKuhniGeometryV130(...)
```

Thus:

| Service/orientation route | Current engine role | Hydraulic admission disposition |
|---|---|---|
| Normal, NMP-continuous / RRBO-dispersed | V1.3.0 (`resolveKuhniGeometryV130`) | The source-supported heavy-continuous/downward, light-dispersed/upward route may retain calculated-in-range trials. A current, integrity-verified presentation candidate is admitted to the narrow HETS screen. |
| Reverse, RRBO-continuous / wet-NMP-dispersed | V1.5.0 (`resolveKuhniGeometryV150`) | The resolver's governed `hydraulicDiagnosticPoint` and finite-rate input remain null/blocked. Its selected, invariant-checked `CALCULATED_EXTRAPOLATED` root is independently rechecked by the presentation qualifier and is then admitted **only** to the same narrow HETS screen. |
| V1.4.0 | Historical/replay and the V1.5 reverse-diagnostic predecessor | Not the normal dispatch base. V1.5 composes its reverse diagnostic from V1.4, which in turn preserves V1.3 lineage. V1.4 is retained for immutable replay, not substituted for the current dispatch. |

The legacy `kuhni-geometry-resolver.ts`/V1.0–V1.1 equations are consequently
not the authority for a new qualification decision. V1.3 is the current
normal route, and V1.5 is the current reverse route. This distinction matters:
the normal route has a source-orientation prerequisite, while V1.5 deliberately
keeps the reverse numerical root outside the governed envelope. That
governance boundary must not be misreported as a block on the separate,
post-verification HETS-only presentation admission.

The V1.5 result's mandatory warnings remain applicable: unsupported reverse
Myint drag, unsupported reverse Myint shape, unsupported reverse Garthe
characteristic velocity, unqualified reverse swarm/holdup, and unqualified
reverse flooding. Passing V1.5 primitive force, finite-state, shape, holdup,
and loading checks establishes internal numerical consistency under those
assumptions; it does **not** turn them into evidence qualification. It does
provide the exact independently checked input required by the software's
HETS-only presentation path.

### Actual narrow Stage-4 HETS admission (both orientations)

`qualifyKuhniStage3Presentation(...)` is an additive, read-only qualifier of a
current, integrity-verified Stage-3 snapshot. It admits:

* a normal `CALCULATED_IN_RANGE_TRIAL`; or
* a reverse V1.5 selected `V150_EXTRAPOLATED_MODEL_ROOT` only after
  `assessReverseExtrapolatedModelRoot(...)` returns
  `EXTRAPOLATED_MODEL_ROOT` and `CALCULATED_EXTRAPOLATED`.

In both cases the resulting candidate is explicitly non-governed:
`governed=false`, `stage4Input=false`, and
`stage4HetsScreeningInput=true`. The presentation classification is
`CALCULATED_PRE_PILOT_WITH_MAJOR_SCALE_UP_EXTRAPOLATION`.

`admitIndependentlyCheckedStage3PrePilotHetsCandidate(...)` accepts either
candidate source, requires current lineage and `independentCheck='PASSED'`,
and returns `INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE`. Then
`deriveStage4PrePilotSizing(...)` accepts either a persisted calculated-in-
range hydraulic point **or** that HETS admission. For the latter it takes the
admitted diameter only, applies the explicit provisional \(h_c=0.5D\) rule,
and calculates the deterministic V3 screen:

```text
N_design = 7                 HETS = 1.0 m/theoretical stage
H_required = 7 m             N_physical = ceil(H_required / (0.5D))
H_installed = N_physical(0.5D)
```

The implementation explicitly declares both NMP-continuous/RRBO-dispersed and
RRBO-continuous/NMP-dispersed orientations and labels this output
`CALCULATED_HETS_PRE_PILOT_SCREENING` / `PRE-PILOT SCREENING`. This is the
software admission that already works for both routes. It never upgrades
either route to governed hydraulics, a finite-rate/mass-transfer result, an
outlet/target claim, or commercial release.

## 2. Exact equation chain and dimensional dependency

The reviewed/current chain uses the following existing constants and equations;
none are introduced or altered here:

```text
D_R = 0.5 D                         h_c = 0.5 D
A = pi D^2/4                        V = A h_c
P = N_P rho_C n^3 D_R^5             N_P = 1.2 (engineering input)
psi = P/(rho_C V)
d32 = 0.42 (sigma/rho_C)^0.6 psi^-0.4

C_D = [8(2+3 kappa+3 lambda)/(Re(1+kappa+lambda))]
      [1+0.15 Re^0.687],             lambda = 0

v_char/v_t = 1 - 1.669 N_P,G^-3.945
  - 2.807[d32/(D-D_R)]^1.336 - 1.159(h_c/D)^2.049
  + 2.1 phi_s^1.032
N_P,G = 1.08 + 10.94/Re_R^0.5 + 257.37/Re_R^1.5

v_swarm/v_char = sqrt[(C_D,char/C_D,swarm)(1-h)^4.65]
U_f = max_h(capacity(h));            loading = (Q_C+Q_D)/(A U_f)
```

The rendered primary Garthe Eq. 8.3 has already been visually verified:
the radical spans the **entire** product
\((C_{D,o}(Re_o)/C_{D,o}(Re_s))(1-h_d)^{4.65}\). The current closure places
the equivalent product inside its radical. There is no Eq. 8.3 transcription
error to correct or use as a reason to change the model.

At fixed geometric ratios \(D_R/D\), \(h_c/D\), and fixed engineering
\(N_P\),

\[
P\ \propto\ \rho_C n^3D^5,\qquad
V\ \propto\ D^3,\qquad
\frac{P}{V}\ \propto\ \rho_C n^3D^2,\qquad
\psi=\frac{P/V}{\rho_C}\ \propto\ n^3D^2.
\]

This is the requested dimensional result: **\(P/V\) scales as
\(n^3D^2\) at fixed ratios** (and \(\psi\) has the same \(n,D\) exponents).
It means varying diameter through an RPM 30–70 screen does not preserve
power-per-volume, tip speed, rotor Reynolds number, drop size, capacity, or
throughput. No source in the reviewed set selects one of those quantities as a
universal Kühni scale-up invariant.

## 3. Input records and available numerical checks

| Case | Configuration and properties | Existing illustrative point | Immediate qualification consequence |
|---|---|---|---|
| A | 60 °C; NMP continuous: \(\rho_C=997\ {\rm kg/m^3}\), \(\mu_C=0.001083\ {\rm Pa\,s}\); RRBO dispersed: \(\rho_D=856\ {\rm kg/m^3}\), \(\mu_D=0.030\ {\rm Pa\,s}\); \(\sigma=0.0103\ {\rm N/m}\) | \(D=0.9742129194\ {\rm m}\), 30 rpm, \(\kappa=27.7008\) | Normal source orientation, but target geometry and 30 rpm remain correlation/scale-up extrapolations. |
| B | 40 °C; RRBO continuous: \(\rho_C=869\ {\rm kg/m^3}\), \(\mu_C=0.0598\ {\rm Pa\,s}\); wet-NMP dispersed: \(\rho_D=1015\ {\rm kg/m^3}\), \(\mu_D=0.001416\ {\rm Pa\,s}\); \(\sigma=0.011\ {\rm N/m}\) | \(D=0.6930996971\ {\rm m}\), 25 rpm, \(\kappa=0.02367893\) | Reverse/falling dispersed-drop route; V1.5 numerical illustration only. Its 25 rpm point is not relabelled as a 30–70 rpm result. |

For B, the existing independent reproduction closes the signed terminal force
balance and the 70%-loading numerical root at
\(d_{32}=4.7457123\ {\rm mm}\), \(Re_t=2.4045\), flood holdup
\(0.1447262\), and \(U_f=0.00636820\ {\rm m/s}\). Those are numerical
reproduction facts, not measured reverse holdup/flooding facts. For A, the
corresponding as-coded point has \(d_{32}=2.5707442\ {\rm mm}\),
\(Re_t=178.5724\), flood holdup \(0.2007760\), and
\(U_f=0.003500625\ {\rm m/s}\).

## 4. Joint ECR geometry window: separate fraction, shape, and apparatus evidence

The following windows have different meanings and must not be intersected into
a fictitious universal “approved operating envelope.”

| Variable/evidence | Published record | Candidate/current value | Correct treatment |
|---|---|---|---|
| ECR product diameter | Sulzer: 30 mm–3.5 m | A 0.974 m; B 0.693 m | Inside a vendor **product** range; not correlation validation, a hydraulic capacity guarantee, or a commercial prohibition outside an apparatus study. |
| Typical industrial speed | Sulzer brochure E10556: 10–70 rpm; product page reports 10–100 rpm | Requested screening band 30–70 rpm; A is 30 rpm; B saved point is 25 rpm | 30–70 is a conservative vendor-practice screening band, not a validated setpoint or correlation range. Do not silently substitute it for B's saved 25 rpm. |
| Garthe Figure 5.20 correlation/data envelope | \(D_C=72\)–152 mm; \(d_A=41\)–85 mm; \(d_s=47.5\)–83.2 mm; \(n_R=50\)–250 rpm; \(d=0.9\)–6.4 mm | Both target diameters and rotors are larger; A at 30 rpm and B at 25 rpm are below its RPM span | A source/evidence envelope for the correlation, **not** an apparatus or commercial maximum. The 50–70 rpm overlap with the requested vendor screen does not cure target-diameter, internal-shape, fluid, or orientation extrapolation. |
| Rotor diameter ratio | Perry: \(D_R/D=0.33\)–0.50 | 0.50 | At the recommendation boundary. This dimensionless ratio does not establish blade form, rotor height, shroud, clearance, or actual rotor construction. |
| Compartment ratio | Perry: \(h_c/D=0.20\)–0.30 | 0.50 | Outside the cited recommendation; a project assumption/correlation extrapolation. It is hydraulically coupled, not an installed-height-only choice. |
| Stator free-area **fraction** | Perry: 0.20–0.40 | 0.35 | Fraction is inside the recommendation, but it is an adjustable design variable, not a demonstrated invariant. |
| Stator/partition **shape** | Garthe/Weber apparatus records dimensions and one 40% free-cross-section example; Perry says free area may be adjusted via openings/perforations | Only nominal \(\phi_s=0.35\) is in the model | **Unresolved.** Equal free-area fraction does not identify hole/opening shape, pitch, thickness, plate type, stator diameter, edge effects, or clearance. A fraction must not be used as a surrogate for partition geometry. |

The existing fixed-25-rpm B sensitivity is also retained without reinterpretation:
at \(h_c/D=0.20, 0.25,\) and \(0.30\), it found no 70%-loading root before
the declared 4.5 m/s tip-speed search ceiling; at 0.50 it found two roots.
This is a bounded numerical result, **not** proof that a Perry-ratio geometry
is physically infeasible. It likewise cannot select 0.50 as physically
correct.

## 5. Exact-dependence admissibility matrix

Definitions: **SUPPORTED** means the equation/statement is directly sourced
for the limited stated claim; **BOUNDED EXTRAPOLATION** means it may be
calculated and retained with explicit source/domain bounds but is not a full
correlation qualification; **UNSUPPORTED** means a prerequisite or required
physical closure is absent. These scientific labels are separate from the
software's HETS-only admission: a current, independently checked presentation
candidate may enter that fixed-design screen even when the full correlation
chain remains extrapolated. “In range” for a scalar is not a transfer of
apparatus, geometry, orientation, or population evidence.

| Link / exact dependence | A normal route | B reverse route | Admissibility and required separation |
|---|---|---|---|
| Positive \(\rho,\mu,\sigma,Q\); signed buoyancy direction | SUPPORTED as a physical/numerical prerequisite | SUPPORTED as a physical/numerical prerequisite; \(\Delta\rho=-146\) correctly implies falling dispersed phase | A sign-correct force balance is not a reverse column qualification. |
| \(P=N_P\rho_Cn^3D_R^5\), \(N_P=1.2\) | BOUNDED EXTRAPOLATION | BOUNDED EXTRAPOLATION | Dimensional engineering identity is usable with a declared input \(N_P\); 1.2 is not verified as a Kühni scale-up invariant or vendor power curve. No allowable motor/torque/power value is available. |
| \(\psi\), \(d_{32}=0.42(\sigma/\rho_C)^{0.6}\psi^{-0.4}\) | BOUNDED EXTRAPOLATION | BOUNDED EXTRAPOLATION | The scalar output is calculable, but no RRBO/NMP, target-geometry breakup/coalescence, or distribution transfer is qualified. \(d_{32}\) is a Sauter population mean, not automatically the isolated drop used in a drag equation. |
| Myint terminal \(C_D(Re,\kappa,\lambda=0)\) | BOUNDED EXTRAPOLATION | UNSUPPORTED as full-correlation evidence | A's \(\kappa=27.70\) is within the published scalar \(\kappa\) interval but its fluid pair, geometry and transfer remain unverified. B's \(\kappa=0.02368<0.1\), falling direction, and unknown interface state fail the finite-\(Re\) empirical transfer gate. This does not undo the separate HETS-only software admission. |
| Myint shape relation | BOUNDED EXTRAPOLATION | UNSUPPORTED as full-correlation evidence | Keep **shape** separate from drag and from free-area fraction. A finite aspect-ratio calculation is not measured drop shape. B is below the source \(\kappa\) bound and the rising/falling interface/fore-aft state is unresolved. |
| Garthe \(N_{P,G}(Re_R)\) and characteristic factor | BOUNDED EXTRAPOLATION | UNSUPPORTED for governed/correlation-optimization use | Equations 5.6–5.7 are source-transcribed, but the target \(D,D_R,h_c\), internal shape, and speed depart from the correlation/data record; B adds reverse orientation. |
| Eq. 8.3 full-radical swarm relation | BOUNDED EXTRAPOLATION | UNSUPPORTED as full-correlation evidence | Equation transcription is **SUPPORTED** and needs no correction. Its service use still needs a valid local/nonterminal \(C_D(Re)\), representative drop population, geometry, and orientation evidence at every characteristic/swarm state. |
| Interior holdup maximization and flood turning point | BOUNDED EXTRAPOLATION | UNSUPPORTED as a physical flooding claim | A turning point in the assumed capacity function is not measured flooding. B lacks reverse holdup, stable-branch, entrainment, inversion, interface-control and flooding evidence. |
| Diameter root at 70% assumed loading | BOUNDED EXTRAPOLATION | UNSUPPORTED as governed/correlation-optimization diameter | Root closure only proves the stated algebraic target. It does not supply an actual throughput limit, a safe operating margin, or mechanical power availability. Either independently checked candidate may nevertheless provide diameter to fixed-\(N_T=7\) HETS arithmetic only. |
| Geometry partition: \(D_R/D,h_c/D,\phi_s\) | BOUNDED EXTRAPOLATION | BOUNDED EXTRAPOLATION | Ratio and fraction checks are as in §4. Actual partition/rotor/stator shape, clearance, and local geometry remain unsupported for both. |
| Current presentation-to-HETS admission | SUPPORTED software path when current/integrity-verified in-range candidate exists | SUPPORTED software path when current V1.5 selected root passes its independent recheck | Both are `INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE` inputs to the deterministic V3 fixed-\(N_T=7\) screen only; neither is a scientific correlation qualification. |

## 6. Screening readiness and deliberately missing constraints

A limited ECR **screening descriptor** can be recorded as: variable diameter,
requested 30–70 rpm vendor-practice band, rotor ratio 0.50, compartment ratio
0.50, and nominal free-area fraction 0.35, with the classifications in §4–5.
It is only a way to expose where a proposed point lies relative to cited
records. It is not an optimization domain and not a safe operating envelope.

The vendor product page provides useful non-prohibitive screening evidence:
the listed product features are diameter 30 mm–3.5 m, density difference
greater than 50 kg/m3, viscosity up to 500 mPa s, and interfacial tension
greater than 1 mN/m. Both tabulated property snapshots meet those broad
product-feature values. That result cannot replace correlation applicability
or a design review.

The following constraints are absent and are **not invented**:

* allowable shaft/motor power, torque curve, rotor/stator stress, shaft,
  bearing, seal, support, vibration, and tip-speed limits for the actual
  internals;
* vendor-specific actual partition/rotor dimensions, blade and opening shape,
  clearances, measured free area, ports, interface-control arrangement, and
  active height;
* an actual throughput/power map, turndown for these fluids, pressure drop,
  residence-time and settler/outlet capacity;
* measured drop-size distribution, breakage/coalescence, falling shape and
  interfacial mobility; a scalar \(d_{32}\) cannot fill these gaps;
* holdup, flooding onset, entrainment, phase-inversion, hysteresis, and
  stable-control observations for either target geometry, especially B's
  reverse orientation;
* a source-backed scale-up invariant selecting constant tip speed, \(P/V\),
  rotor Reynolds number, characteristic velocity, or another rule.

Accordingly, the deterministic V3 fixed-\(N_T=7\) HETS **software screen is
ready for either current, independently checked presentation candidate**, but
the safe *hydraulic/optimization* screening decision is **not ready** to
screen safe throughput, required/available power, or an optimum diameter/RPM.
The difference is not semantic: HETS arithmetic consumes the admitted
diameter without recalculating/reselecting hydraulics, whereas hydraulic
screening would make the unresolved closures and absent constraints decisive.

## 7. Gate decision paths

### Path A — normal NMP-continuous / RRBO-dispersed

1. Use the current V1.3 normal dispatch and preserve source-range warnings.
2. A current, integrity-verified `CALCULATED_IN_RANGE_TRIAL` can be passed by
   the presentation qualifier and admitted to the deterministic Stage-4 V3
   HETS pre-pilot screen. Its 30 rpm is vendor-practice compatible but below
   Garthe's 50 rpm data lower bound.
3. Do **not** promote the HETS screen, diameter, flood point, or \(P/V\) to
   governed/correlation-optimization status until a representative
   pilot/vendor package establishes actual geometry, power/mechanical limits,
   drop population, nonterminal slip, holdup/flooding, entrainment/inversion,
   and the selected scale-up basis.

### Path B — reverse RRBO-continuous / wet-NMP-dispersed

1. Use the current V1.5 reverse dispatch only. Retain its V1.4/V1.3 lineage
   and its explicit extrapolation warnings; do not route through an obsolete
   base closure.
2. Keep the \(0.6930996971\) m, 25 rpm result as an illustrative
   `CALCULATED_EXTRAPOLATED` model root. If its persisted primitive-basis
   recheck passes, the current presentation qualifier admits it to the **same
   narrow V3 fixed-\(N_T=7\) HETS pre-pilot screen** as Path A. It is not made
   compliant with the requested 30–70 rpm screen by relabelling.
3. **Governed/correlation-optimization gate remains closed:** V1.5 continues
   to provide no governed hydraulic diagnostic point and no finite-rate
   Stage-4 input. A future route needs, at minimum, a justified falling
   low-\(\kappa\) drop/interface/shape closure, a valid nonterminal
   characteristic/swarm slip closure, and reverse
   holdup/flooding/inversion/control evidence, plus the common geometry and
   mechanical evidence above.

### Commercial/pilot evidence path — neither a prohibition nor automatic release

Perry's 60 mm pilot recommendation for targets up to 1 m and Sulzer's 30
mm–3.5 m product range mean neither candidate diameter is prohibited by the
located evidence. They do not validate these equation closures. A
representative pilot/vendor campaign is the path to narrow the specific
geometry, power, throughput, and hydraulic uncertainties; it is evidence for
upgrading the result, not a precondition for retaining this diagnostic report.

## 8. Source manifest

| ID | Primary/source record and locator | Used only for |
|---|---|---|
| `garthe-2006-local-primary` | D. Garthe, *Fluiddynamics and Mass Transfer of Single Particles and Swarms of Particles in Extraction Columns*, TU München dissertation, accepted 2006-04-03; local `attached_assets/Paper_1788587264307.pdf`, SHA-256 `39a39035d63f0b84bc74957ccf17b7a8c67ec456e73e4277491bc2cbb2bd53fc`; printed p. 86 Eqs. 5.6–5.7/Fig. 5.20 and p. 126 Eq. 8.3 | Primary equation transcription, visually verified full radical, and correlation/data envelope. The data envelope is not a commercial/apparatus prohibition. |
| `myint-2006-web-primary` | Myint, Hosokawa & Tomiyama, “Terminal Velocity of Single Drops in Stagnant Liquids,” *Journal of Fluid Science and Technology* 1 (2006), 72–81, DOI [10.1299/jfst.1.72](https://doi.org/10.1299/jfst.1.72), [publisher full text](https://www.jstage.jst.go.jp/article/jfst/1/2/1_2_72/_article/-char/en) | Primary web record states measurements of single drops rising through infinite stagnant liquids and identifies viscosity ratio/surfactants as drag variables. Existing low-\(\kappa\) audit supplies the inspected equation/range transcription. |
| `myint-2007-web-primary` | Myint, Hosokawa & Tomiyama, “Shapes of Single Drops Rising Through Stagnant Liquids,” *Journal of Fluid Science and Technology* 2 (2007), 184–195, DOI [10.1299/jfst.2.184](https://doi.org/10.1299/jfst.2.184), [publisher full text](https://www.jstage.jst.go.jp/article/jfst/2/1/2_1_184/_article/-char/en) | Primary web confirmation that shape measurements are rising, terminal, single-drop evidence; it must not be conflated with a free-area fraction or reverse falling-drop evidence. |
| `sulzer-ecr-web` | Sulzer, [“Kühni agitated columns (ECR)”](https://www.sulzer.com/en/shared/products/kuehni-agitated-columns-ecr), accessed for this review; and E10556 en 5.2025, pp. 4, 8–9, linked on that page | Vendor product/practice and pilot-apparatus evidence only. Product features and ranges are not a universal model-validity or safety boundary. |
| `perry-8e-15-83` | *Perry's Chemical Engineers' Handbook*, 8th ed. (2008), §15 “Agitated Extraction Columns,” printed p. 15-83; publisher record [here](https://www.mheducation.com/highered/mhp/product/perry-s-chemical-engineers-handbook-eighth-edition.html) | Explicit geometry and pilot-size recommendations. Not a performance guarantee; generic agitated-vessel discussion later in §15 is not elevated to a Kühni-specific invariant. |
| `project-scale-up-audit` | `server/research/ecr-pre-pilot-kuhni-scale-up/scale-up-audit.md` and `provenance-manifest.json` | Existing source classification, references, and non-prohibition interpretation. |
| `project-stage3-qualification` | `research/rrbo-stage3-kuhni-scale-up-qualification.md`, `research/rrbo-stage3-current-basis-audit.md`, and `research/rrbo-low-kappa-terminal-audit.md` | Existing current-basis reproduction, low-\(\kappa\)/shape boundary, Eq. 8.3 verification, and no-governed-admission conclusion. |
| `project-compartment-audit` | `research/kuhni-compartment-height-rule-investigation.md` | Coupling of \(h_c/D\) to \(P/V\), \(d_{32}\), characteristic velocity, swarm/flood capacity, and diameter; bounded root interpretation. |

**Final gates (do not conflate them):**

1. **Software HETS pre-pilot gate — OPEN for both orientations** when the
   current snapshot and immutable lineage pass the presentation qualifier:
   V1.3 supplies a calculated-in-range candidate and V1.5 supplies only an
   independently checked extrapolated presentation candidate. Both are
   admitted solely as
   `INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE` to
   `ECR_STAGE4_HETS_SCREENING_V3_FIXED_DESIGN_NT7`.
2. **Governed hydraulics, finite-rate Stage 4, safe throughput/power
   screening, and correlation optimization — NOT ESTABLISHED for both
   orientations.** For reverse B, the resolver-level
   `BLOCKED_REQUIRES_CALCULATED_IN_RANGE_STAGE3_TRIAL` remains true for
   governed/finite-rate admission; it does not block the separate HETS-only
   software path.
3. **Commercial release — NOT ESTABLISHED for both orientations.**

No Job A/B/C result is needed, used, or changed by this STEP 2 qualification.