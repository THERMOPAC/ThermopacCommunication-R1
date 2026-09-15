# Kühni compartment-height rule (`h_c/D`) — read-only investigation

**Status:** source review and standalone arithmetic only. No application code,
database row, or existing result was changed. This report does not establish a
validated geometry range or a vendor prerequisite for making a pre-pilot
prediction.

## Decision summary

There is **no source-verified universal mandate for `h_c = 0.5D`**.

The two current `0.5` constants are different quantities:

* **Rotor ratio:** `D_R/D = 0.5`. Perry's Kühni recommendation is
  `D_R/D = 0.33–0.50` (printed p. 15-83), so the current rotor ratio is at
  the upper edge of that recommendation.
* **Compartment ratio:** `h_c/D = 0.5`. Perry's separate recommendation is
  `h_c/D = 0.20–0.30` (printed p. 15-83). Thus the current compartment ratio is
  outside the cited recommendation and is a **project/pre-pilot assumption**,
  not a universal rule.

The `.5` compartment value did **not** come from a Garthe statement that
compartment height must be half the column diameter. Garthe's primary
Kühni apparatus records an actual compartment height of **50 mm**; its own
drop-swarm extractor drawing shows an approximately **80 mm** column
(printed pp. 60–63), so that particular apparatus is approximately
`h_c/D = 50/80 = 0.625`, not `0.5`. Garthe's own six-blade Kühni geometry
also records `d_A = 45 mm`, `h_A = 7 mm`, `h_c = 50 mm`, and stator free area
`phi_s = 0.40` (printed p. 177, Table A.1). These are apparatus facts, not
scale-up invariants.

The exact primary data envelope associated with Garthe Figure 5.20 is
`D_C = 72–152 mm`, `d_A = 41–85 mm`, `d_s = 47.5–83.2 mm`,
`n_R = 50–250 rpm`, and drop diameter `d = 0.9–6.4 mm` (143 points,
10.7% relative error; printed p. 86). The same page says the own data use
`h_c = 50 mm`, cites literature heights of 37 and 70 mm, and concludes that
compartment height and stator design should be investigated. It does not
prescribe `h_c/D = 0.5`. If the own 50 mm height is divided by the Figure
5.20 diameter endpoints, the arithmetic is approximately `0.329–0.694`;
that is not a normalized source range because the figure combines apparatus
and literature geometries.

## Where the rule occurs in the project

### Stage 3 — coupled hydraulic input

The first retained implementation authority is the Stage-3 Kühni resolver:

* `server/ecr-pre-pilot/kuhni-geometry-resolver.ts` defines
  `ROTOR_TO_COLUMN = 0.5` and `COMPARTMENT_TO_COLUMN = 0.5` (lines 39–41).
  Its implementation descriptor explicitly records
  `ratios:Dr/Dc=.5,Hc/Dc=.5` (line 59).
* Candidate evaluation uses both values to form `D_R` and `h_c` (lines
  151–159). The independent, read-only reproduction in
  `research/rrbo-stage3-kuhni-scale-up/scale-up-calculation.js` does the same
  (lines 174–191 and 285–329).
* The current Stage-3 report calls `h_c/D = 0.50`
  `CORRELATION_EXTRAPOLATION + PROJECT_ASSUMPTION`, while identifying Perry's
  `0.20–0.30` as the published recommendation
  ([Stage-3 qualification, §§1–2 and Table 5](rrbo-stage3-kuhni-scale-up-qualification.md)).

Therefore, in Stage 3, changing `h_c/D` is not a post-sizing presentation
change. It changes the hydraulic closure and the resulting diameter search.

### Stage 4 — repeated provisional physical pitch

The latest HETS route is
`ECR_STAGE4_HETS_SCREENING_V3_FIXED_DESIGN_NT7` in
`server/ecr-pre-pilot/stage4-pre-pilot-sizing-service.ts` (lines 23–37).
It independently repeats `compartmentHeightM = .5 * diameterM` (lines
239–247), exposes `compartmentHeightRule: '0.5D'` (lines 303–318), and labels
the pitch **“PROVISIONAL PRE-PILOT GEOMETRY — PILOT / VENDOR CONFIRMATION
REQUIRED”**. The same service explicitly fixes `Ndesign = 7` for both
NMP-continuous/RRBO-dispersed and RRBO-continuous/NMP-dispersed orientations
(lines 324–334); any accepted Stage-2 `N_T` is reference-only.

Stage 4 therefore **repeats a Stage-3 project assumption**; it does not
retroactively validate it. Its HETS arithmetic is:

```text
HETS = 1.0 m/theoretical stage
Hrequired = 7 × HETS
Nphysical = ceil(Hrequired / h_c)
Hinstalled = Nphysical × h_c
```

The separate Stage-4 mixing expression also contains `h_c` through both
`E_c/(V_c h_c)` and `(D/h_c)^0.10`; see
[Stage-4 mixing audit, §§Source and notation boundary and Implemented equations](stage4-mixing-calculation-audit.md).
Consequently, a future change cannot be made only in the Stage-4 count
display while leaving the coupled equations silently on a different height.

## What the primary equations make sensitive

At fixed diameter, speed, and properties, the Stage-3 chain uses:

```text
V = A h_c
P = N_P rho_C N^3 D_R^5
psi = P/(rho_C V)
d32 = 0.42 (sigma/rho_C)^0.6 psi^-0.4
v_char/v_o = ... - 1.159 (h_c/D)^2.049 + ...
v_s/v_o = sqrt[(C_D,char/C_D,swarm) (1-h_d)^4.65]
U_f = max_h(capacity(h))
loading = (Q_C+Q_D)/(A U_f)
```

Thus `h_c` affects volume and specific power, `d_32` (at fixed `D` and
speed, `d_32` scales as approximately `h_c^0.4` in this closure),
Garthe characteristic velocity, the swarm/flooding capacity, and the
diameter root. This is a **coupled impact**, not merely installed-height
arithmetic. The rendered Garthe Eq. 8.3 is the primary source for the
complete inside-radical product, including the holdup factor (printed p. 126);
the frozen resolver agrees with it. See the
[source-consistent Stage-3 report](rrbo-stage3-kuhni-scale-up-qualification.md#rendered-source-equation-confirmation).

By contrast, the table below deliberately holds `D` fixed and applies only
the Stage-4 fixed-`Ndesign=7`, `HETS=1.0 m` arithmetic. It is a **hypothetical
fixed-D comparison, not a coupled design, hydraulic re-solve, validated
geometry, or recommendation**. Values use the requested rounded diameters
`D_B = 0.693099697 m` and `D_A = 0.974212919 m`; the persisted values carry
additional digits.

| Case / fixed `D` (m) | `h_c/D` | `h_c` (m) | `7/h_c` | `ceil(7/h_c)` | `Hinstalled` (m) |
|---|---:|---:|---:|---:|---:|
| B / 0.693099697 | 0.20 | 0.138619939 | 50.497786 | 51 | 7.069616909 |
| B / 0.693099697 | 0.25 | 0.173274924 | 40.398229 | 41 | 7.104271894 |
| B / 0.693099697 | 0.30 | 0.207929909 | 33.665190 | 34 | 7.069616909 |
| B / 0.693099697 | 0.50 | 0.346549849 | 20.199114 | 21 | 7.277546819 |
| A / 0.974212919 | 0.20 | 0.194842584 | 35.926438 | 36 | 7.014333017 |
| A / 0.974212919 | 0.25 | 0.243553230 | 28.741150 | 29 | 7.063043663 |
| A / 0.974212919 | 0.30 | 0.292263876 | 23.950959 | 24 | 7.014333017 |
| A / 0.974212919 | 0.50 | 0.487106460 | 14.370575 | 15 | 7.306596893 |

The installed height in this table is active compartment height only; it is
not total vessel height, a mass-transfer prediction, or an outlet-compliance
claim.

## Existing B sensitivity: correct interpretation

The existing Stage-3 independent sensitivity holds B's flows and **25 rpm**
fixed, uses the current equations, and searches only through the **4.5 m/s
tip-speed bound** ([Stage-3 qualification, §5 and Table 4](rrbo-stage3-kuhni-scale-up-qualification.md#case-b-compartment-height-sensitivity)):

| `h_c/D` | Result in bounded search | Upper-bound loading |
|---:|---|---:|
| 0.20 | No bounded root | 0.890803 |
| 0.25 | No bounded root | 0.777549 |
| 0.30 | No bounded root; do not round the near-boundary value into a root | 0.709968 |
| 0.50 | Roots `0.693099697 m` (selected smallest) and `4.958642 m` | — |

“No bounded root” means **not found under the declared search bound**. It is
not evidence that the `0.20–0.30` geometry is physically infeasible. The
`0.693099697 m` value itself is an illustrative/extrapolated B root in the
current reverse-orientation record, not proof of physical feasibility or a
governed commercial diameter; the second `0.5D` root is beyond Sulzer's
3.5 m product envelope and neither root is a physical qualification. The
existing source audit's overall disposition is **B — major scale-up
extrapolation, but not an invalid design**; that evidence category must not be
read as a physical-feasibility finding.

## Engineering decision recommended next

1. **Do not silently replace `0.5D` in Stage 4.** The latest fixed-NT7 HETS
   screen may remain a clearly labelled pre-pilot scenario for both
   orientations, with the current fixed-D table used only to show arithmetic
   consequences.
2. Decide explicitly whether the next geometry basis is (a) continued
   provisional `0.5D`, or (b) a source-directed **scenario** in Perry's
   `0.20–0.30` recommendation. Do not call either choice a validated range.
3. If the decision is (b), run a new immutable Stage-3 sensitivity with the
   selected `h_c/D`, a declared RPM/scale-up rule, and the full coupled
   equations. Preserve “no bounded root” as unresolved under the 25-rpm,
   4.5 m/s search; do not relabel it physically infeasible.
4. Before final mechanical/commercial geometry, obtain the actual compartment,
   rotor, stator, clearance, free-area, and control arrangement from a
   representative pilot/vendor package. That evidence is a final-design
   decision input, **not a prerequisite merely to publish this pre-pilot
   arithmetic or diagnostic**. Garthe itself says reliable dimensioning still
   requires preliminary tests (printed pp. 149–150).

## Primary and project sources

* [Garthe, *Fluiddynamics and Mass Transfer of Single Particles and Swarms of
  Particles in Extraction Columns* — local primary PDF](../attached_assets/Paper_1788587264307.pdf),
  SHA-256 `39a39035d63f0b84bc74957ccf17b7a8c67ec456e73e4277491bc2cbb2bd53fc`:
  apparatus/internals pp. 60–63 and 177 Table A.1; Eq. 5.6–5.7 and Figure
  5.20 pp. 85–86; Eq. 8.3 p. 126; preliminary-test qualification
  pp. 149–150.
* [Perry's Chemical Engineers' Handbook, 8th ed., publisher record](https://www.mheducation.com/highered/mhp/product/perry-s-chemical-engineers-handbook-eighth-edition.html),
  Section 15, printed p. 15-83: Kühni geometry recommendations and pilot
  mapping. Generic stirred-vessel scale-up discussion begins at pp. 15-88
  and following and is not a Kühni-specific `h_c/D` rule.
* [Weber, Meyer & Jupke (2019)](https://doi.org/10.1002/cite.201900057),
  pp. 1674–1680, §2.1/Table 1: secondary confirmation of the DN80,
  `h_c=50 mm`, `d_A=45 mm`, free-area 40% apparatus; not a universal rule.
* [Existing Stage-3 qualification](rrbo-stage3-kuhni-scale-up-qualification.md)
  and [scale-up provenance audit](../server/research/ecr-pre-pilot-kuhni-scale-up/scale-up-audit.md).
* [Stage-4 fixed HETS sizing service](../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service.ts)
  and [Stage-4 mixing audit](stage4-mixing-calculation-audit.md).