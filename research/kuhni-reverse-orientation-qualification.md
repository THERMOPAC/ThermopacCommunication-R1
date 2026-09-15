# RRBO-continuous / downward NMP-drop hydraulic qualification

Review date: 2026-09-15  
Verdict: **CONTINUED UNSUPPORTED — no defensible hydraulic diameter established.**

## Decision and scope

This is a bounded source assessment, not a claim that reverse operation is
physically impossible or that no relevant literature exists. General agitated
column literature explicitly permits dispersion of either phase. What remains
unqualified is the complete phase-specific RRBO/NMP Kühni chain from drop
generation through terminal motion, swarm holdup, flooding and diameter.

No application equations, resolver hashes, inputs, database records, Stage-2
equilibrium calculations or Job-C runs were changed. V1.2.0 remains the active
unsupported-orientation contract; V1.0.0, V1.0.1 and V1.1.0 are untouched.
No new resolver version is justified because no new executable route is admitted.
Successful Stage-2 equilibrium still does not establish hydraulic applicability.

## Source retrieval and evidence boundaries

Retrieved publisher pages on the review date. Search result summaries were used
only to locate sources, not as qualification evidence. Reproduction URLs and
section locators follow; access depth is explicit so a missing full-text equation
cannot be mistaken for an equation that the paper never supplies.

| Source and locator | What was actually available and established | What it does not establish |
|---|---|---|
| Rode, Durand, Mabille & Favre (2013), *Flooding characteristics of an aqueous two-phase system in a counter-current Kühni-type column*, Chemical Engineering Science 98, 98–103, DOI [10.1016/j.ces.2013.03.059](https://doi.org/10.1016/j.ces.2013.03.059). [Publisher preview](https://www.sciencedirect.com/science/article/abs/pii/S0009250913002480), Introduction, Abstract, “Prediction of flooding”, “Concluding remarks”. | Primary publisher abstract/introduction and section snippets, not full experimental tables/equations. Introduction explicitly allows heavy or light phase dispersion. Experiments concern aqueous PEG–salt phases; abstract reports useful flooding prediction outside ordinary aqueous–organic density-difference/interfacial-tension ranges. Conclusions flag uncertain swarm and characteristic velocities. | Preview does not identify enough experimental phase assignment, complete coefficients, ports or raw flooding points for an independent reverse-orientation replay. No RRBO/NMP validation. This is a positive lead, not proof that all agitated-column closures are orientation-invariant. |
| Myint, Hosokawa & Tomiyama (2006), *Terminal Velocity of Single Drops in Stagnant Liquids*, JFST 1(2), 72–81, DOI [10.1299/jfst.1.72](https://doi.org/10.1299/jfst.1.72). [Publisher](https://www.jstage.jst.go.jp/article/jfst/1/2/1_2_72/_article/-char/en), Abstract; local primary-text extraction `research/kuhni-drag-shape/sources/gap-hua-myint-terminal-2006.md`, experimental-method and results sections. | Rising isolated drops in infinite stagnant liquids; drag depends on Re, viscosity ratio and contamination. Published range: −11.6 < log10 M < −0.9; 0.17 < Re < 200; 0.017 < Eo < 12.1; 0.1 < κ < 100. Clean and fully contaminated branches are distinguished. | Not direct falling-NMP-in-RRBO or agitated swarm evidence. A finite drag root does not supply interface state, shape validation or flooding. Reverse viscosity ratio on the existing fixture is below the stated range. |
| Myint, Hosokawa & Tomiyama (2007), *Shapes of Single Drops Rising Through Stagnant Liquids*, JFST 2(1), 184–195, DOI [10.1299/jfst.2.184](https://doi.org/10.1299/jfst.2.184). [Publisher](https://www.jstage.jst.go.jp/article/jfst/2/1/2_1_184/_article), Abstract. | Primary abstract: clean-drop shape range −11.6 ≤ log M ≤ −0.9; 0.015 ≤ Re ≤ 850; 0.017 ≤ Eo ≤ 9.3; 0.0074 ≤ Ta ≤ 3.6; 0.1 ≤ κ ≤ 100. Surfactants alter aspect ratio and fore/aft symmetry; viscosity ratio affects distortion. | Clean shape law cannot silently qualify an unknown RRBO interface or the κ < 0.1 reversed fixture. Rising terminal conditions do not validate forced Kühni characteristic/swarm states. |
| Shirvani, Torab-Mostaedi & Ghaemi (2016), *Experimental Investigation of Flooding and Drop Size in a Kuhni Extraction Column*. [Primary publisher landing page](https://www.ije.ir/article_72678.html), Abstract and linked paper. | Abstract reports two standard systems, no mass transfer, measured drop size/flooding and an empirical flooding correlation with 11.54% mean deviation. Existing primary-paper audit is preserved in `.agents/outputs/shirvani-2016-audit/`. | Abstract does not establish reverse RRBO/NMP applicability. Prior equation-replay and viscosity-exponent limitations are not cured by the reported fit error. No new qualification granted. |
| Garthe dissertation and existing primary evidence audit, `.agents/outputs/garthe-2005-review/garthe-evidence-audit.md`, source pp.143, 146, 149–150; `research/kuhni-hydraulic-audit.md`, §§4–6. | Source audit identifies bounded validation systems and conditions; characteristic-velocity and swarm equations are empirical closures, not chemistry-independent conservation laws. | No new independently reproduced downward-NMP/continuous-RRBO holdup or flood dataset was located. Do not replace the established Eq.8.3 square-root structure with a terminal-speed shortcut. |
| Laitinen 2019 §4.1 and Eqs.1,3; Weber 2019 §§2.2–2.4; local sources listed in `kuhni-phase-orientation-assessment.md`. | The previously assessed heavy-continuous/downward, light-dispersed/upward experiments remain valid within their evidence boundaries. | Signed fractional-power expressions cannot be extended to negative density differences by changing signs or relabeling phases without a qualified derivation. |

Searches covered “Kuhni column heavy phase dispersed holdup flooding”,
“Kühni column aqueous dispersed organic continuous”, “Kumar Hartland 1995
holdup dispersed heavy phase”, “Garthe 2006 extraction column heavy dispersed
thesis”, “Myint Hosokawa Tomiyama terminal velocity single drops”, and
“Flooding characteristics Kühni” with Rode/PEG/reverse-phase refinements.
Other column types (Karr, packed, pulsed, raining-bucket) were not admitted as
Kühni flooding evidence merely because they use a characteristic velocity.

## Independently checkable physics — necessary, not a sizing closure

Take upward as positive z, gravity vector −g, and retain physical labels
C = RRBO continuous, D = wet NMP dispersed. Define w = u_D − u_C.
For an isolated spherical drop at terminal relative velocity, after subtraction
of the continuous hydrostatic pressure contribution:

```
0 = (rho_C - rho_D) V g - 0.5 rho_C C_D A_p |w| w
V = pi d^3/6; A_p = pi d^2/4
sign(w) = sign(rho_C - rho_D), if C_D > 0
C_D |w| w = (4/3) ((rho_C-rho_D)/rho_C) g d
```

This follows force balance; it is not an empirical downward-drop validation.
The standard spherical/projected-area convention is stated rather than a claim
that actual drops remain spherical. For denser NMP, w is negative. Only *after*
retaining that sign can a speed magnitude be introduced. An absolute density
difference in a magnitude equation does not qualify a correlation's domain.

Clean, creeping spherical-drop theory would additionally give the
Hadamard–Rybczynski limiting speed
`|w| = |rho_C-rho_D| g d^2/(6 mu_C) * (1+kappa)/(2+3 kappa)`,
where `kappa = mu_D/mu_C`. Its κ→∞ limit is Stokes speed
`|delta rho| g d^2/(18 mu_C)`; κ→0 gives `/12 mu_C`.
These limiting checks are analytical consistency only. They require negligible
inertia/deformation, isolated drops and a mobile clean interface; none establishes
a real d32 distribution, contamination branch or Kühni flood capacity. No terminal
speed or diameter is calculated from this limiting model in the application.

### Countercurrent boundary mapping

If the two intended throughflows remain countercurrent, conservation gives:

| Role | Velocity sign | Required inlet | Required outlet |
|---|---|---|---|
| continuous RRBO | positive/upward | bottom | top |
| dispersed wet NMP | negative/downward | top | bottom |

With positive superficial magnitudes `j_C=Q_C/A`, `j_D=Q_D/A` and dispersed
holdup `0<h<1`, `u_C=j_C/(1-h)`, `u_D=-j_D/h`, hence
`w=-(j_D/h+j_C/(1-h))`. This is a **proposed physical mapping**, not an
approved hardware arrangement. Distributors, wetting, top dispersion interface,
bottom drop collection/coalescence, level control, entrainment and start-up
continuity require verification. Existing unsupported resolver port fields
correctly remain null rather than publishing this proposal as qualified.
Equilibrium extract/raffinate identities are not renamed by this mapping.

### Reproducible phase-property counterexample

Use only the existing synthetic 50 °C test fixture in
`tests/kuhni-geometry-resolver-v120.test.ts`, not a live project input:

```
rho_C = 878 kg/m3; rho_D = 1028 kg/m3
mu_C = 0.056 Pa.s; mu_D = 0.001666 Pa.s; sigma = 0.012 N/m
delta rho = -150 kg/m3
kappa = 0.001666/0.056 = 0.02975
```

The force balance has downward relative motion, but κ is below the 0.1
lower bound of both Myint papers. For comparison the supported fixture's
κ = 0.056/0.001666 ≈ 33.61. Relabeling this higher ratio or taking |Δρ|
would conceal a materially different drag/interface regime. This example alone
prevents promotion of the current Myint chain on that fixture. It is not a
universal impossibility proof for every RRBO grade or temperature.

## Qualification matrix and release conditions

| Link | Present result | Required before admission |
|---|---|---|
| Signed buoyancy | Analytical sign is established; negative for the fixture. | Retain signed vectors and verify direction at each admitted property state; zero buoyancy/nonphysical properties fail closed. |
| Drop generation/d32 | Existing stirred-tank-to-Kühni assumptions do not validate reverse dispersion. | Phase-specific breakup/coalescence and geometry/power scaling evidence, uncertainty and temperature/property bounds. No fixed-RPM scale-up substitution. |
| Terminal drag and shape | Current reverse fixture fails published κ range; actual interface unknown. | Qualified low-κ downward liquid-drop route; explicit Re/Eo/M/κ and shape gates, interface mobility/contamination evidence; source replay at terminal and forced states as applicable. |
| Ports and continuity | Proposed signed conservation mapping is coherent. | Verify distributors, collectors, phase interface/control arrangement and phase-inversion behavior for upward continuous RRBO. |
| Characteristic velocity and holdup | Conservation determines required slip but not available swarm slip. | Independently replay reverse-orientation agitated-column data or validated multiphase physics with explicit wall, stator, rotor, coalescence and holdup limits. Two empirical curves agreeing is not independent validation. |
| Flooding and diameter | No qualified available-slip curve or limiting operating branch. | Verify stable low-holdup branch and flood/entrainment/inversion limits; source-backed capacity versus diameter/RPM and declared operating margin. A turning-point maximum is at most a model limit until physical flooding is qualified. |

If a validated function `s(h,D,N)` were available, the conservation requirement
would be `s=j_D/h+j_C/(1-h)` in speed magnitudes. At fixed `r=Q_D/Q_C`,
`j_C=s/[r/h+1/(1-h)]`. Maximizing throughput over h and then solving a diameter
at a fraction of that maximum is mathematically reproducible, but **not currently
admissible**: unknown s and unverified inversion/entrainment limits are exactly
the missing physical closure. Do not produce an “illustrative diameter” from it.

No measured RRBO/NMP data are asserted to be mandatory for every preliminary
prediction: independently validated physics with disclosed extrapolation could
qualify a future route. Merely completing the algebra does not meet that bar.
If subsequently admitted, implement an immutable new resolver version with
explicit gates and source lineage, leaving every historical implementation and
snapshot replay intact. Any Stage-2/Job-C run or input change needs separate
authorization.

## Verification

Executed without database access or scientific job dispatch:

```
npx vitest run tests/kuhni-geometry-resolver-v120.test.ts \
  tests/kuhni-geometry-resolver.test.ts --reporter=dot
```

Result: 2 test files, 10 tests passed. These cover supported orientation,
reverse no-diameter/no-closure execution, signed metadata, equal/nonphysical
density rejection and historical resolver/version behavior. They verify the
software boundary, not scientific validation of the rejected route.