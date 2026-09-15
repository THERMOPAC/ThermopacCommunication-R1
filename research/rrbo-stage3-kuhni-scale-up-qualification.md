# RRBO/NMP Stage-3 Kühni hydraulic scale-up qualification

**Status:** engineering qualification report; diagnostic only
**Scope:** Case A (NMP-continuous/RRBO-dispersed, 60 °C, historical
`D = 0.9742129194 m`, 30 rpm) and Case B (RRBO-continuous/wet-NMP-dispersed,
40 °C, current `D = 0.6930996971 m`, 25 rpm).

This report qualifies the existing calculation chain. It does not change the
frozen Stage-1 or Stage-3 records, promote a calculated root to a governed
design input, or change production behavior.

### Frozen-record guard

The report is an additive, read-only artifact. The Case-B persisted record
remains Stage-3 run `15`, engine `KUHNI_GEOMETRY_RESOLVER_V1.5.0`, with run
implementation hash
`26df76278f021c010f6057991c03b72362f003a1a6320fbb01a74fca2cbd3637`, immutable
hash `4cc3e2d3e99598fc5f01a13a0f397c2f5d00a4149ff6ce01a497a469d838b5d6`, result
hash `7e5999836fdeb7ffe6365eb8e4f72ddded266ec2a3b208e0b27445a8c7a04cf6`,
parent hydrodynamic run `9` hash
`d089a80918c6657c3d291046ec049d7a488d64f0f601f646f34a3ac0e2e26c27`, and
Stage-1 snapshot hash
`e4137f46b51c7eb17e0ec7bb7077fb5dd24cb93acedce531d40420b53bb4f8af`.
The Case-A frozen artifact retains its own lineage and Stage-3 hashes; this
report does not recalculate or overwrite either record.

## Executive conclusion

* **Case B, 0.6931 m — exact category:
  `B — major scale-up extrapolation, but not an invalid design`.** It is a
  pre-pilot estimate, not a proof of physical feasibility or a validated
  commercial diameter. It is inside Perry's explicit 60 mm pilot
  recommendation for columns up to 1 m, while remaining a major model and
  geometry extrapolation. Its `mu_D/mu_C = 0.02368` is below the reviewed
  Myint data boundary (`0.1`), and the reverse phase orientation is not
  validated by the current closure.
* **Case A, 0.9742 m — same category B.** It is also a pre-pilot estimate,
  below Perry's 1 m boundary for the 60 mm pilot recommendation, but remains
  substantially beyond the individual published apparatus evidence and
  retains the out-of-range `h_c/D` ratio. The historical/frozen diagnostic
  basis is not a proof of physical feasibility or a commercial qualification.
* **`h_c/D = 0.50`:** is outside Perry's published Kühni recommendation
  `0.20–0.30` and must be explicitly flagged. The recommendation should be
  evaluated toward `0.20–0.30`, or a vendor-specific deviation should be
  documented. It must not be silently changed: at fixed 25 rpm, the current
  bounded search has no 70%-loading root in the searched domain for
  `h_c/D = 0.20, 0.25, or 0.30` under the 4.5 m/s tip-speed bound. This is
  not a claim that those geometries are infeasible outside that domain.
* Before commercial design, confirm the actual rotor, stator, compartment,
  phase orientation/control, drop population, nonterminal slip, holdup and
  flooding behavior, phase inversion/entrainment behavior, and mechanical
  limits in an appropriately representative pilot/vendor program. A pilot is
  not a prerequisite for producing this pre-pilot prediction; it is evidence
  required to upgrade category B to a defensible design status.

### Rendered source-equation confirmation

The local Garthe PDF was rendered at printed p. 126 (PDF page 138) rather than
relying on `pdftotext` layout. The full-page screenshot is
`.agents/outputs/garthe-eq83-correct/pdf-page-138-printed-126.png`; the
focused equation screenshot is
`.agents/outputs/garthe-eq83-correct/eq83-radical-crop.png`. In the rendered
equation, the radical bar visibly spans the complete product, including the
holdup factor. The multiplication dot is inside the radical's horizontal bar;
it does not delimit the radical. Therefore the source equation is:

```
v_s/v_o = sqrt[C_D,o(Re_o)/C_D,o(Re_s) * (1-h_d)^4.65]
```

This matches the frozen resolver's as-coded closure:

```
v_swarm/v_char = sqrt[(C_D,char/C_D,swarm) * (1-h)^4.65]
```

The equation is source-consistent with the frozen resolver, so no
equation correction is required. The
existing values remain diagnostic/pre-pilot estimates because of the stated
scale-up, geometry, phase-orientation, and fluid-property limitations, not
because of a source-equation mismatch.

## 1. Basis, definitions, and qualification labels

The current resolver basis is:

* `D_R/D = 0.5`, `h_c/D = 0.5`, and stator free-area fraction
  `phi_s = 0.35`;
* fixed engineering power number `N_P = 1.2` in
  `P = N_P rho_C N^3 D_R^5`;
* source diagnostic power number
  `N_P = 1.08 + 10.94/Re_R^0.5 + 257.37/Re_R^1.5`;
* `d_32 = 0.42 (sigma/rho_C)^0.6 psi^-0.4`, where
  `psi = P/(rho_C V)` and `V = A h_c`;
* Garthe's characteristic-velocity factor, followed by the current
  square-root swarm/holdup closure; flooding is the interior maximum of that
  assumed capacity function. The local primary PDF is
  `attached_assets/Paper_1788587264307.pdf`, SHA-256
  `39a39035d63f0b84bc74957ccf17b7a8c67ec456e73e4277491bc2cbb2bd53fc`.

Perry p. 15-83 recommends `D_R/D = 0.33–0.50`,
`h_c/D = 0.20–0.30`, and stator fractional free area `0.20–0.40`.
Consequently, the current rotor ratio and free area are within the cited
recommendations, while the current `h_c/D=0.50` is outside them.

The terminal calculation retains signs and checks the actual particle force
balance. With `+z` upward and signed dispersed-phase slip
`w = u_D - u_C`:

```
V_d     = pi d_32^3/6              A_p = pi d_32^2/4
0       = (rho_C-rho_D) g V_d
          - 0.5 rho_C C_D A_p |w_t| w_t
Ar_s    = rho_C (rho_C-rho_D) g d_32^3 / mu_C^2
C_D |Re_s| Re_s = 4 Ar_s/3
Re_t    = rho_C |w_t| d_32 / mu_C
Eo      = |Delta rho| g d_32^2 / sigma
Mo      = g mu_C^4 |Delta rho| / (rho_C^2 sigma^3)
We_t    = rho_C |w_t|^2 d_32 / sigma
We_R    = rho_C u_tip^2 D_R / sigma
Ta      = Re_t Mo^0.23
```

The independent script reports `Ar_s`, signed `w_t` and `Re_s`, the buoyancy
and drag forces, their net-force residual, and a canonical countercurrent
sign check. For that check, `u_C = -sign(Delta rho) Q_C/A` and
`u_D = sign(Delta rho) Q_D/A`; both requested cases pass opposed bulk-flow
and terminal-slip-direction checks. This is a declared sign convention, not
measured plant direction. `Re_char = rho_C |w_char| d_32/mu_C` and
`Re_swarm = rho_C |w_swarm| d_32/mu_C` remain magnitude groups. The operating
fraction is `(Q_C+Q_D)/(A U_flood)` and is 0.7000 at each selected/as-coded
industrial root.

### Garthe and swarm equations used

The inspected Garthe thesis confirms the following equations in printed p. 86
(Eqs. 5.6–5.7):

```
v_char/v_o = 1 - 1.669 N_P^(-3.945)
               - 2.807 [d/(D_C-d_A)]^(1.336)
               - 1.159 (h_C/D_C)^(2.049)
               + 2.1 phi_s^(1.032)
N_P = 1.08 + 10.94/Re_R^(0.5) + 257.37/Re_R^(1.5)
```

The same PDF's printed p. 126 Eq. 8.3 is the full square-root swarm relation.
The rendered page, not only extracted text, is decisive: the radical spans
the complete product, including the holdup factor:

```
v_s/v_o = sqrt[C_D,o(Re_o)/C_D,o(Re_s) * (1-h_d)^(4.65)]
```

The frozen current resolver closure, which the independent script reproduces
without changing production behavior, is instead:

```
v_swarm(h) = v_char
             sqrt[(C_D,char/C_D,swarm) (1-h)^(4.65)]
C_D(Re,kappa,lambda) =
  8(2+3 kappa+3 lambda)/
  [Re(1+kappa+lambda)] [1+0.15 Re^(0.687)], lambda = 0
```

Thus the frozen resolver is a source-faithful transcription of Eq. 8.3:
`(1-h)^4.65` is inside the radical in both. No equation correction is
required.

The labels used below are:

* `IN_RANGE`: directly inside a reviewed experimental or explicitly stated
  source envelope for the stated quantity (not proof of RRBO/NMP transfer).
* `SCALE_UP_EXTRAPOLATION`: geometry, speed, or commercial-size transfer beyond
  a reviewed Kühni apparatus envelope.
* `CORRELATION_EXTRAPOLATION`: use of a correlation outside its fluid,
  orientation, drop, or closure evidence.
* `PROJECT_ASSUMPTION`: a current model/design choice without a verified
  universal published recommendation.
* `UNRESOLVED`: evidence needed to qualify the claim is absent.

## 2. Published guidance and its limits

The reviewed sources provide apparatus ranges and correlation validation
envelopes, not a universal industrial Kühni scale-up rule. A range in this
table is an evidence boundary, not a blanket prohibition above or below it.

### Table 1 — Published Kühni scale-up guidance

| Source or statement | Evidence class | Verified published evidence | What it supports | Qualification |
|---|---|---|---|---|
| Perry's Chemical Engineers' Handbook, 8th ed., §15, p. 15-83 (Mögli/Bühlmann; Pratt/Stevens) | Explicit recommendation | Minimum 60 mm pilot for specifying columns up to 1 m; minimum 150 mm pilot for larger diameter columns | The only explicit pilot-to-commercial diameter mapping located | `IN_RANGE` recommendation mapping for both 0.6931 m and 0.9742 m; not a guarantee and no upper limit is stated for a 150 mm pilot |
| Perry p. 15-83 Kühni geometry | Explicit recommendation | Rotor/turbine `D_i/D_t = 0.33–0.50`; compartment `h_c/D_t = 0.20–0.30`; stator fractional free area `0.20–0.40` | Geometry targets and a direct flag for current `h_c/D=0.50` | Rotor 0.50 is at the upper boundary; stator 0.35 is in range; compartment 0.50 is `CORRELATION_EXTRAPOLATION`/`PROJECT_ASSUMPTION` |
| Sulzer Kühni ECR product page | Vendor product envelope | ECR diameter `30 mm–3.5 m`; typical industrial speed `10–100 rpm`; geometry adaptable to changing hydrodynamic conditions | Verified industrial product-range evidence | Product envelope and vendor practice, not universal correlation validity or a hard maximum |
| Sulzer E10556 brochure (English, 5.2025), pp. 4, 8–9 | Vendor apparatus/process guidance | ECR `30 mm–3.5 m`; typical industrial speed `10–70 rpm`; agitated pilot columns `32, 60, 150 mm`; pilot trials precede scale-up/design and simple empirical methods normally fail | Industrial range, available pilot sizes, and need for hydrodynamic/mass-transfer scale-up | `IN_RANGE` as vendor evidence; pilot sizes are not commercial limits and the 10–70/10–100 rpm difference is revision-specific |
| Dongaonkar, Pratt & Stevens, AIChE J. 37 (1991) 694–704; Kentish et al., IEC Res. 36 (1997) 4928–4933 | Observed primary experiments | 25-stage Kühni apparatus approximately `72.45 mm`; Kentish reports 50 mm stator spacing | Direct pilot/laboratory evidence | Apparatus observations, not diameter or speed limits |
| Garthe, *Fluiddynamics and Mass Transfer of Single Particles and Swarms of Particles in Extraction Columns*, TU München dissertation, accepted 3 Apr 2006; local PDF SHA-256 `39a39035…53fc` | Inspected primary source | Printed p. 86 Eq. 5.6 gives the full Kühni characteristic-velocity factor and Eq. 5.7 gives `N_P = 1.08 + 10.94/Re_R^0.5 + 257.37/Re_R^1.5`; rendered printed p. 126 Eq. 8.3 gives `v_s/v_o = sqrt[C_D,o(Re_o)/C_D,o(Re_s) * (1-h_d)^4.65]`, with the radical visibly spanning the full product. Figure 5.20 reports 143 Kühni points, 10.7% relative error, and listed ranges `D_C=72–152 mm`, `d_A=41–85 mm`, `d_s=47.5–83.2 mm`, `n_R=50–250 rpm`, `d=0.9–6.4 mm`. | Primary correlation and swarm-equation source; printed ranges are evidence envelope, not commercial limits | The rendered Eq. 8.3 matches the frozen resolver's inside-radical closure; focused screenshot: `.agents/outputs/garthe-eq83-correct/eq83-radical-crop.png`. Eq. 5.6 itself says compartment height and stator design should be investigated |
| Weber, Meyer & Jupke, Chemie Ingenieur Technik 91 (2019) 1674–1680; Hlawitschka et al. 2020 review | Accessible secondary evidence | Weber reproduces a Garthe pilot as DN80, height 2.95 m, `h_c=50 mm`, rotor 45 mm, stator free cross section 40%, with 150/200 rpm points; review includes Kühni studies at 32 and 152 mm | Independent secondary confirmation of selected apparatus records | Do not render selected secondary points as a universal validity envelope or commercial limit |
| Sulzer/Perry commercial guidance as a whole | Explicit guidance plus vendor range | Perry maps 60 mm to targets up to 1 m and 150 mm to larger targets; Sulzer sells ECR equipment through 3.5 m | Answers the commercial-range and pilot-mapping questions | A 3.5 m product range is not an explicit universal maximum or correlation-validity limit |

Perry's ratios are explicit recommendations, not merely observations. For
Case B (`D=0.693099697 m`), the recommended rotor range is
`0.228722900–0.346549849 m` and the recommended compartment-height range is
`0.138619939–0.207929909 m`. For Case A (`D=0.974212919 m`), the corresponding
ranges are `0.321490263–0.487106460 m` and
`0.194842584–0.292263876 m`. The current rotor is at the Perry upper boundary;
the current compartment is above the published range.

## 3. Industrial calculations

The calculations below reproduce the frozen diagnostic basis. Industrial flow
rates are used only for the Table 2 capacity calculation. The pilot table does
not retain, resize, or assume a pilot flow; it is a geometry/agitation
comparison, not a pilot capacity design.

All values in the following industrial table are frozen/as-coded diagnostic
outputs from the source-consistent closure. They remain pre-pilot estimates
subject to the scale-up, geometry, phase-orientation, and fluid-property
limitations stated in this report.

### Table 2 — Industrial Case A versus Case B

| Quantity | Case A: NMP continuous / RRBO dispersed | Case B: RRBO continuous / wet-NMP dispersed |
|---|---:|---:|
| Temperature; speed | 60 °C; 30 rpm | 40 °C; 25 rpm |
| Continuous phase `rho_C` (kg/m3); `mu_C` (Pa s); `Q_C` (m3/s) | 997; 0.001083; 0.0007154797726512872 | 869; 0.0598; 0.0011111111111111111 |
| Dispersed phase `rho_D` (kg/m3); `mu_D` (Pa s); `Q_D` (m3/s) | 856; 0.030; 0.0011111111111111111 | 1015; 0.001416; 0.0005707717569786535 |
| `sigma` (N/m); `Delta rho` (kg/m3); `mu_D/mu_C` | 0.0103; +141; 27.70083 | 0.011; -146; 0.023678929765886286 |
| `D` (m) | 0.9742129194 | 0.6930996971 |
| `D_R` (m); `h_c` (m) | 0.4871064597; 0.4871064597 | 0.3465498485; 0.3465498485 |
| `D_R/D`; `h_c/D`; `phi_s` | 0.500; 0.500; 0.35 | 0.500; 0.500; 0.35 |
| Rotor tip speed (m/s) | 0.765145 | 0.453633 |
| Rotor Weber `We_R = rho_C u_tip^2 D_R/sigma` | 27603.83 | 5633.80 |
| `P` (W) using fixed `N_P=1.2` | 4.101152 | 0.3770473 |
| `P/V` (W/m3); `P/m` (W/kg) | 11.29495; 0.01132894 | 2.883692; 0.003318403 |
| `d_32` (mm); `d_32/D`; `d_32/D_R` | 2.570744; 0.00263879; 0.00527758 | 4.745712; 0.00684708; 0.01369417 |
| `Re_R`; source diagnostic `N_P` | 109215.55; 1.11311 | 727.1747; 1.498818 |
| Signed terminal direction; `w_t`; `Re_s` | rise; `+0.0754551 m/s`; `+178.5724` | fall; `-0.0348664 m/s`; `-2.404515` |
| Signed `Ar_s`; `C_D`; buoyancy / drag force (N) | `+19968.9223`; 0.834958; `+1.230028e-5 / -1.230028e-5` | `-37.18734`; 8.575884; `-8.012654e-5 / +8.012654e-5` |
| Force-balance net residual (N); relative residual | `3.38813e-21`; `2.75e-16` | `1.35525e-20`; `1.69e-16` |
| `Re_t`; `Re_char`; `Re_swarm` | 178.5724; 59.7308; 29.1604 | 2.404515; 2.605025; 1.369037 |
| `Eo`; `Mo`; `We_t`; `Ta` | 0.88720; `1.7513e-9`; 1.41675; 1.72896 | 2.93146; 0.0182163; 0.455768; 0.957047 |
| Flood holdup; `U_flood` (m/s) | 0.200776; 0.003500625 | 0.144726; 0.006368196 |
| `Q_C/A`; `Q_D/A`; total superficial flow (m/s) | 0.000959842; 0.001490596; 0.002450438 | 0.002944938; 0.001512799; 0.004457737 |
| Canonical signed countercurrent `(u_C,u_D,u_D-u_C)` (m/s) | `(-0.000959842,+0.001490596,+0.002450438)`; checks pass | `(+0.002944938,-0.001512799,-0.004457737)`; checks pass |
| Operating fraction | 0.7000 | 0.7000 |
| Primary qualification | `B — major scale-up extrapolation, but not an invalid design`; 30 rpm is inside Sulzer's typical industrial speed practice, but target correlation evidence is extrapolated | `B — major scale-up extrapolation, but not an invalid design`; `SCALE_UP_EXTRAPOLATION` plus reverse-orientation and low-`kappa` `CORRELATION_EXTRAPOLATION`; 25 rpm is inside Sulzer's typical industrial speed practice |

Case A has `mu_D/mu_C` approximately 27.70; its terminal `Re`, `Eo`,
`Mo`, and `Ta` are within the reviewed scalar-drop comparator ranges, but
the source systems are not RRBO/NMP and the column geometry is much larger
than the Kühni validation envelope. Case B has
`mu_D/mu_C = 0.02367893`; this is below the reviewed Myint empirical lower
boundary of 0.1. Its finite-Re, shape, and terminal calculations are
therefore mathematical diagnostics, not validated reverse-drop evidence.

## 4. Equivalent pilot points

For each point below, `D_R/D = h_c/D = 0.5` and `phi_s = 0.35` are retained.
The Case-B physical properties are used. No pilot flow rate is assumed or
needed: these are geometry/agitation points, and the pilot rows report only
quantities determined by geometry, speed, and physical properties. Capacity,
holdup, and flooding remain industrial-flow calculations in Table 2. The
candidate invariants imply:

* constant tip speed: `N` proportional to `D^-1`;
* constant `P/V` or `P/m`: `N` proportional to `D^(-2/3)`;
* constant `Re_R`: `N` proportional to `D^-2`.

### Table 3 — Case-B 60 mm and 150 mm diagnostic points

| Invariant | Pilot `D` (mm) | `D_R/h_c` (mm) | Speed (rpm) | Tip (m/s) | `We_R` | `P` (W) | `d_32` (mm) | `Re_R` | `P/V` (W/m3) | `P/m` (W/kg) | Result |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Constant tip | 60 | 30 / 30 | 288.7915 | 0.453633 | 487.7048 | 0.00282558 | 1.783379 | 62.9498 | 33.31143 | 0.0383331 | Diagnostic point; `IN_RANGE` in tip speed only |
| Constant tip | 150 | 75 / 75 | 115.5166 | 0.453633 | 1219.2620 | 0.01765985 | 2.572881 | 157.3745 | 13.32457 | 0.0153332 | Diagnostic point; `IN_RANGE` in tip speed only |
| Constant `P/V` and `P/m` | 60 | 30 / 30 | 127.7526 | 0.200673 | 95.4393 | 0.000244603 | 4.745712 | 27.8471 | 2.883692 | 0.00331840 | `d_32` equals industrial value by implemented closure |
| Constant `P/V` and `P/m` | 150 | 75 / 75 | 69.3548 | 0.272356 | 439.5019 | 0.00382193 | 4.745712 | 94.4857 | 2.883692 | 0.00331840 | `d_32` equals industrial value by implemented closure |
| Constant `Re_R` | 60 | 30 / 30 | 3336.0222 | 5.240211 | 65079.76 | 4.355523 | 0.094639 | 727.1747 | 51348.37 | 59.08904 | Fails the current 4.5 m/s tip-speed ceiling |
| Constant `Re_R` | 150 | 75 / 75 | 533.7635 | 2.096085 | 26031.90 | 1.742209 | 0.409991 | 727.1747 | 1314.518 | 1.512679 | Below tip ceiling, but extreme power/input extrapolation |

These points do not establish that any invariant is the correct commercial
scale-up criterion. Perry's p. 15-88 and following discuss equal power per
volume, geometric similarity, and equal tip speed for generic agitated
vessels, not as Kühni-specific invariants. Constant `P/V` is retained as an
admissible engineering scenario because it leaves the implemented `d_32`
closure unchanged; it is not presented as a published Kühni law. No fixed
pilot flow is used or required for these points.

## 5. Case-B compartment-height sensitivity

The following sensitivity holds Case-B flows and 25 rpm fixed, applies the
same current equations, and searches
`D = max(0.10, 0.05/(h_c/D))` through the 4.5 m/s tip-speed bound
`D = 6.8754935 m`. A “no bounded root” result is not replaced with an
unconstrained diameter.

### Table 4 — Case-B sensitivity to `h_c/D`

| `h_c/D` | Search interval (m) | All 70%-loading diameters in bounded domain | `D_R/h_c` at result or upper bound (m) | `d_32` (mm) | Tip at result/bound (m/s) | Loading at upper bound | Flood holdup; `U_flood` (m/s) | Qualification |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 0.20 | 0.250–6.875 | No bounded root | 3.43775 / 1.37510 | 0.524709 | 4.500 | 0.890803 | 0.135681; 0.000050853 | `UNRESOLVED`; no accepted root under bound |
| 0.25 | 0.200–6.875 | No bounded root | 3.43775 / 1.71887 | 0.573697 | 4.500 | 0.777549 | 0.135697; 0.000058260 | `UNRESOLVED`; no accepted root under bound |
| 0.30 | 0.1667–6.875 | No bounded root | 3.43775 / 2.06265 | 0.617100 | 4.500 | 0.709968 | 0.135709; 0.000063806 | `UNRESOLVED`; do not round the near-boundary value into a root |
| 0.50 | 0.100–6.875 | `0.693100` (selected smallest); `4.958642` (second) | `0.34655/0.34655`; `2.479321/2.479321` | `4.745712`; `0.983213` | `0.453633`; `3.245424` | — | `0.144726; 0.006368196` (selected root) | Two roots; select smallest by explicit policy. Second root is beyond Sulzer's 3.5 m product envelope; neither root proves physical feasibility |

The sensitivity shows that `h_c/D` is materially coupled to the current
capacity closure. It does not show that 0.50 is physically correct, nor that
0.20–0.30 is physically preferred. For 0.20–0.30 the result is specifically
“no root in the bounded domain,” not a proof of infeasibility: a root outside
the 4.5 m/s bound is not searched or promoted. The actual compartment, stator
type, and rotor/stator clearance must be measured or obtained from the vendor
before choosing a ratio.

## 6. Reproducibility and independent verification

The numerical artifact is generated without importing production resolver
code:

* Script:
  `research/rrbo-stage3-kuhni-scale-up/scale-up-calculation.js`
* Numerical JSON:
  `research/rrbo-stage3-kuhni-scale-up/scale-up-calculation-results.json`

Commands run:

```text
node research/rrbo-stage3-kuhni-scale-up/scale-up-calculation.js \
  --output research/rrbo-stage3-kuhni-scale-up/scale-up-calculation-results.json
node research/rrbo-stage3-kuhni-scale-up/scale-up-calculation.js --verify
```

The verification command returned successfully with
`checks.allChecksPass = true`, including explicit Case-A assertions. This
verifies numerical reproduction of the frozen/as-coded closure, which is
consistent with rendered Garthe Eq. 8.3:
`D=0.9742129194448474 m`, `d_32=2.5707441992382585 mm`,
`Re_t=178.57240730624966`, flood holdup `0.20077600313512306`,
`U_flood=0.0035006250415678046 m/s`, tip `0.7651450376900494 m/s`, and
0.7000 loading. Case A's signed force-balance and canonical countercurrent
checks also pass. The Case-B assertions reproduce
`D=0.6930996970569214 m`, `d_32=4.745712291978037 mm`,
`Re_t=2.40451506518235`, flood holdup `0.1447261647352734`,
`U_flood=0.00636819579102804 m/s`, `We_R=5633.800880473315`, and 0.7000
loading. The sensitivity enumerates both `h_c/D=0.50` roots:
`0.6930996970569214 m` (selected smallest) and
`4.9586421805663115 m` (second). The latter exceeds Sulzer's 3.5 m product
envelope. It verifies no root **in the bounded domain** at
`h_c/D=0.20, 0.25, 0.30`; that result is not an infeasibility proof. Pilot
rows invoke no capacity or flooding calculation and therefore make no fixed
pilot-flow assumption.

## 7. Qualification matrix

### Table 5 — Engineering qualification matrix

| Item | Case A | Case B | Evidence/disposition |
|---|---|---|---|
| 60/150 mm pilot apparatus sizes | `IN_RANGE` as apparatus sizes | `IN_RANGE` as apparatus sizes | Published pilot/laboratory points exist; this does not transfer RRBO/NMP performance |
| 0.974 m or 0.693 m commercial diameter | `SCALE_UP_EXTRAPOLATION` | `SCALE_UP_EXTRAPOLATION` | Both are within Perry's 60 mm pilot recommendation for targets up to 1 m, but are major extrapolations beyond individual apparatus evidence; Sulzer product range reaches 3.5 m |
| 30 or 25 rpm | `IN_RANGE` for Sulzer's typical 10–70/10–100 rpm industrial practice; correlation evidence is extrapolated from highlighted 150/200 rpm pilot points | `IN_RANGE` for Sulzer's typical industrial speed practice; correlation evidence is extrapolated | Not a speed prohibition; vendor practice and pilot correlation evidence are distinct classifications |
| `D_R/D = 0.50` | `PROJECT_ASSUMPTION` | `PROJECT_ASSUMPTION` | Observed pilots vary; no unique published Kühni invariant |
| `h_c/D = 0.50` | `CORRELATION_EXTRAPOLATION` plus `PROJECT_ASSUMPTION` | `CORRELATION_EXTRAPOLATION` plus `PROJECT_ASSUMPTION` | Perry explicitly recommends 0.20–0.30; current 0.50 is outside and must be justified or moved toward the recommendation |
| `phi_s = 0.35` | `IN_RANGE` recommendation plus `PROJECT_ASSUMPTION` invariant | `IN_RANGE` recommendation plus `PROJECT_ASSUMPTION` invariant | Perry recommends 0.20–0.40; free area is adjustable/stage-specific, not a mandatory invariant |
| Fixed `N_P = 1.2` | `PROJECT_ASSUMPTION` | `PROJECT_ASSUMPTION` | Source diagnostic `N_P` differs with `Re_R`; fixed value is an engineering closure |
| `d_32` closure | `CORRELATION_EXTRAPOLATION` | `CORRELATION_EXTRAPOLATION` | Current equation is not validated for RRBO/NMP. The cited `d_32≈4.5 mm` caution comes from Garthe rotating-disc (RDC) evidence, not Kühni, and is not applied as a Kühni limit |
| Terminal scalar drag groups | Conditional `IN_RANGE` comparator | `CORRELATION_EXTRAPOLATION` | A scalar groups are inside comparator ranges but chemistry differs; B `mu_D/mu_C=0.02368` is below the 0.1 Myint data boundary |
| Characteristic-velocity correlation | `CORRELATION_EXTRAPOLATION` | `CORRELATION_EXTRAPOLATION` | Accessible literature documents pilot points, but no target-size validation; B also reverses phase orientation |
| Swarm/holdup closure | `CORRELATION_EXTRAPOLATION` | `CORRELATION_EXTRAPOLATION` | Garthe reported 23.5% relative error over a small pilot envelope; the separate RDC `d_32≈4.5 mm` observation is not a Kühni limit |
| Flooding | `UNRESOLVED` for RRBO/NMP | `UNRESOLVED` for reverse RRBO/NMP | Current result is an interior maximum of an assumed function, not direct measured flooding evidence |
| Reverse phase orientation | Not applicable to the requested A orientation | `UNRESOLVED` | Falling low-viscosity-ratio drop shape/drag, nonterminal slip, reverse swarm, phase inversion, and entrainment remain unverified |
| 4.5 m/s tip-speed ceiling | `PROJECT_ASSUMPTION` | `PROJECT_ASSUMPTION` | Screening/mechanical bound; vendor torque, stress, seal, and rotor limits are still required |
| 0.6931 m calculated root | Not applicable | `B — major scale-up extrapolation, but not an invalid design` | Illustrative pre-pilot estimate only, not proof of physical feasibility or a governed Stage-3/Stage-4 input |
| Published commercial range and pilot-to-commercial mapping | `IN_RANGE` recommendation mapping, with extrapolation caveat | `IN_RANGE` recommendation mapping, with extrapolation caveat | Perry: 60 mm pilot up to 1 m, 150 mm pilot for larger; Sulzer: 30 mm–3.5 m product range; neither is a universal validity guarantee |

## 8. Required confirmation before commercial design

1. **Geometry and mechanical package:** vendor drawing for column ID, active
   height, compartment height, rotor diameter, blade/shroud geometry, shaft
   diameter, stator type (ring or perforated), free area, clearances, ports,
   support, seal, torque, power, allowable rpm, and tip-speed limits.
2. **Phase orientation and control:** confirm which phase is continuous and
   dispersed, interface location/control logic, start-up/shutdown behavior,
   phase inversion boundary, entrainment, and outlet/settler capacity for both
   orientations.
3. **Drop population:** measure `d_32` and the full drop-size distribution,
   breakage/coalescence, daughter populations, and their dependence on speed,
   flow ratio, temperature, interfacial tension, and composition. A single
   representative `d_32` is not distribution-level evidence.
4. **Nonterminal motion:** measure terminal and compartment/ swarm velocities
   in the actual phase pair, including slip relative to the continuous phase,
   circulation, wall/stator interactions, and the effect of holdup.
5. **Holdup and flooding:** perform a controlled throughput/speed map to
   observe holdup, flooding onset, entrainment, pressure/interface behavior,
   and hysteresis. Do not infer reverse-orientation flooding from the current
   interior maximum.
6. **Scale-up trial:** test at least one representative pilot with the actual
   fluids or a fully justified surrogate, preserving candidate geometry
   ratios and a bounded set of tip speed, `P/V`, and flow-ratio points. The
   60/150 mm rows in Table 3 are diagnostic targets, not a substitute for
   that program.

## 9. Sources and traceability

* `server/research/ecr-pre-pilot-kuhni-scale-up/scale-up-audit.md` and
  `provenance-manifest.json`: source-agent audit, exact decision category,
  Perry mapping, Sulzer product/pilot evidence, and provenance.
* Perry's Chemical Engineers' Handbook, 8th ed. (McGraw-Hill, 2008),
  Section 15, “Agitated Extraction Columns,” printed p. 15-83; generic
  stirred-vessel scale-up discussion pp. 15-88 and following. The cited
  recommendation is 60 mm pilot for columns up to 1 m and 150 mm pilot for
  larger columns; no upper commercial limit is stated for the 150 mm mapping.
* Sulzer, “Kühni agitated columns (ECR),”
  [product page](https://www.sulzer.com/en/shared/products/kuehni-agitated-columns-ecr),
  and *OptimEXT: Advanced solutions for extraction and solvent recovery*,
  E10556 en 5.2025, pp. 4, 8–9
  ([brochure](https://www.sulzer.com/en/-/media/files/products/separation-technology/brochures/english/liquid_liquid_extraction_technology_e10556_en_web.pdf)):
  ECR 30 mm–3.5 m, typical industrial speed 10–100 rpm on the page and
  10–70 rpm in the brochure, and 32/60/150 mm agitated pilot columns.
* Garthe, *Fluiddynamics and Mass Transfer of Single Particles and Swarms of
  Particles in Extraction Columns*, TU München dissertation (accepted
  2006-04-03), local PDF
  (`attached_assets/Paper_1788587264307.pdf`), SHA-256
  `39a39035d63f0b84bc74957ccf17b7a8c67ec456e73e4277491bc2cbb2bd53fc`.
  Printed p. 86 Eqs. 5.6–5.7 and printed p. 126 Eq. 8.3 were inspected by
  text extraction and page rendering; the listed Figure 5.20 ranges are
  treated as an evidence envelope, not a commercial limit.
* Shirvani, Ghaemi and Torab-Mostaedi, “Experimental Investigation of
  Flooding and Drop Size in a Kühni Extraction Column,” IJE Transactions C
  29 (2016) 288–296
  (`attached_assets/Shirvani_2016_Kühni_flooding_drop-size_paper_1788586188612.pdf`).
* Asadollahzadeh et al., “Experimental Determination of Continuous Phase
  Overall Mass Transfer Coefficients — Case Study: Kühni Extraction Column,”
  verified source audit (`research/sources/kuhni-mass-transfer/asadollahzadeh-2017.md`).
* Current resolver equations:
  `server/ecr-pre-pilot/kuhni-geometry-resolver.ts`,
  `kuhni-geometry-resolver-v110.ts`, `v140.ts`, and `v150.ts`.
* Frozen Case-A and Case-B numerical bases:
  `research/design269-stage4-frozen-residual-controlled-whole-column-diagnostic.json`
  and `research/rrbo-stage3-current-basis-audit.md`.
* Supporting qualification boundaries:
  `research/kuhni-hydraulic-audit.md`,
  `research/kuhni-phase-orientation-assessment.md`,
  `research/kuhni-reverse-orientation-qualification.md`,
  `research/kuhni-drag-shape/garthe-stichlmair-audit.md`, and
  `research/rrbo-low-kappa-terminal-audit.md`.

## Final disposition

**Case B industrial scale-up status is
`B — major scale-up extrapolation, but not an invalid design`.** The current
0.693099697 m value remains an illustrative pre-pilot hydraulic prediction,
not proof of physical feasibility. Perry's 60 mm-to-1 m recommendation and
Sulzer's 30 mm–3.5 m ECR product evidence remove any claim that the diameter
is prohibited, while the published `h_c/D=0.20–0.30` recommendation and
unresolved reverse RRBO/NMP hydraulics prevent commercial qualification.

The rendered Garthe Eq. 8.3 places the holdup exponent inside the radical,
matching the frozen resolver and independent script. The independent script
and JSON verify the frozen/as-coded baseline and sensitivity; the pilot
invariant rows require no fixed pilot flow assumption.