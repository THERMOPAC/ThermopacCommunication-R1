# Project 236 Kühni/ECR Complete Drag Architecture Audit

**Audit date:** 2026-09-05  
**Status:** QUALIFICATION COMPLETE — CLOSURE REJECTED / GOVERNED IMPLEMENTATION HOLD
**Production impact:** None  
**Optimizer impact:** None; the diameter optimizer was not rerun  

## Executive verdict

The current `Re_t <= 50` limit is an artificial boundary of the historical
Oliver–Chung/Rivkind–Ryskin branch selection. Barry and Parlange Eq. 10 provides
a reproducible spherical-fluid drag equation beyond `Re=50`, with numerical
comparisons through `Re=200`.

It does **not** complete the physical drag architecture for Project 236.
Barry Eq. 10 explicitly assumes a steady, non-oscillating sphere. Across the
requested diameter range, Wellek's non-oscillating-drop correlation predicts
progressively lower axis ratios, but the Project 236 shape states remain
unconfirmed. No zero-fit deformation-aware liquid-drop `Cd(Re)` law was found
that is demonstrated for the complete Project 236 region:

- `Mo = 2.86028733e-9`
- `X = mu_D/mu_C = 33.6`
- `Eo = 0.0333–3.3306`
- terminal `Re` potentially above 200

Grace is a useful drop/bubble terminal-velocity and shape sensitivity, but it
does not provide the constitutive `Cd(Re)` curve required by the
Garthe/Stichlmair swarm ratio. Henschke/ReDrop supplies the correct type of
liquid-liquid architecture only after system-specific single-drop fitting.
Bozzano–Dente and Tomiyama are bubble models and are not admitted for an
RRBO liquid drop.

Therefore:

> Barry Eq. 10 may replace the old drag branches only inside a separately
> confirmed spherical, steady, non-wobbling envelope. The complete optimizer
> drag architecture remains on hold at the spherical-to-deformed transition.

No arbitrary `Re`, `Eo`, or axis-ratio cutoff is introduced by this audit.

This is a completed negative qualification, not an approved drag closure. The
source search, fixed-grid reproduction, and Eq. 8.3 contract review establish
that the available evidence cannot support a deformed-drop optimizer rerun.

## Final equipment boundary

The final equipment is a **multistage counter-current Kühni/ECR extraction
column**. The models audited here are local submodels:

`representative drop -> free terminal velocity -> compartment characteristic
velocity -> swarm slip -> holdup/flooding`.

They do not describe an isolated stirred vessel or single equilibrium
contactor. Local hydraulic closure does not establish stage efficiency, mass
transfer, active height, recovery, product quality, or final equipment sizing.

Any admitted drag law must provide consistent drag values at free-terminal,
characteristic, and swarm-slip Reynolds numbers.

## Persisted Project 236 basis

| Quantity | Value |
|---|---:|
| Continuous density | `1006 kg/m3` |
| Dispersed density | `862 kg/m3` |
| Continuous viscosity | `0.00125 Pa s` |
| Dispersed viscosity | `0.042 Pa s` |
| Interfacial tension | `0.0106 N/m` |
| Temperature | `50 degC` |
| Viscosity ratio, `X` | `33.6` |
| Density ratio, `P` | `0.8568588469` |
| Morton number, `Mo` | `2.8602873308e-9` |

Temperature enters through the persisted physical properties. Barry's density
ratio is calculated from the actual Project 236 densities; the paper's
`P = X` fallback is not used.

## 1. Barry and Parlange spherical-fluid equation

### Definitions

Barry and Parlange (2018), PDF p. 2/10, Eq. 2:

`Re = 2 U rho_C a / mu_C = rho_C U d / mu_C`

`X = mu_D/mu_C`

The paper defines `P = rho_D/rho_C` below Eq. 6.

### Governing equation

Barry and Parlange, PDF p. 4/10, Eq. 10:

`Cd = 48/[Re(1+X)] (1+3X/2)`

`     * [sqrt(Re) + A Z + tau exp(-lambda sqrt(Re))]`

`     / [sqrt(Re)/(1+X) + 3 A Z + 3 tau exp(-omega sqrt(Re))]`.

Auxiliaries from Eqs. 6–8 and 11–12:

`alpha = 2.5891`

`beta = 0.9879`

`A = (2/5)sqrt(2/pi)(6sqrt(3)+5sqrt(2)-14) = 1.10534862862`

`Z = 1 + {[(alpha-2)sqrt(XP) + (beta-1)XP]}/{[1+sqrt(XP)]^2}`

`lambda tau = 1`

`omega tau = 1/[3(1+X)]`

`tau(tau + A Z) = (8/9)(4+3X)/(1+X)`.

The positive `tau` root is used.

For Project 236:

| Auxiliary | Value |
|---|---:|
| `Z` | `1.06940840848` |
| `tau` | `1.15300642309` |
| `lambda` | `0.86729785713` |
| `omega` | `0.00835547068524` |

### Actual applicability evidence

The paper states:

- one sphere moving in an otherwise quiescent, infinite homogeneous liquid;
- no interphase mass transfer;
- surface tension sufficient to preserve sphericity;
- steady, laminar, non-oscillating motion;
- applicability up to “a few hundred” Reynolds number.

Numerical comparisons include:

- gas-bubble agreement through approximately `Re=200`;
- Juncu data at `Re=100` over broad viscosity and density ratios;
- Saboni–Alexandrova values at `Re=100` and `Re=200`;
- high-viscosity-ratio examples bracketing, but not directly equal to, `X=33.6`.

The paper expressly states that its bubble comparison does not apply to the
`Re=300` and `Re=400` Clift interpolation points. Beyond the demonstrated
region, Eq. 10 continues its imposed asymptote algebraically; that is not
additional validation.

### Relation to the historical branches

Barry Eq. 1 reproduces Rivkind–Ryskin:

`Cd = {X[24/Re + 4 Re^(-1/3)] + 14.9 Re^(-0.78)}/(1+X)`.

Barry Eq. 5 reproduces Oliver–Chung with `chi=8/5`:

`Cd = 16(1+1.5X)/[Re(1+X)]`

`     + (8/5)(1+1.5X)^2/(1+X)^2`.

At the current switching points:

| `Re` | Barry Eq. 10 | Historical branch | Difference |
|---:|---:|---:|---:|
| 2 | 14.93448 | Oliver–Chung 15.41536 | -3.12% |
| 2 | 14.93448 | Rivkind–Ryskin 14.98701 | -0.35% |
| 50 | 1.67927 | Rivkind–Ryskin 1.54088 | +8.98% |
| 100 | 1.13634 | Rivkind extrapolation 1.08179 | +5.04% |
| 200 | 0.77735 | Rivkind extrapolation 0.78766 | -1.31% |

Appending Barry above `Re=50` would introduce an approximately 9% `Cd` jump.
The defensible proposal is one Barry equation throughout a confirmed spherical
envelope, not a third piecewise branch.

## 2. Dimensionless and shape framework

`Eo = (rho_C-rho_D) g d^2 / sigma`

`Mo = g mu_C^4 (rho_C-rho_D)/(rho_C^2 sigma^3)`

`We = rho_C U^2 d/sigma`

`Re = rho_C U d/mu_C`

`We = Re^2 sqrt(Mo/Eo)`.

Terminal force balance is:

`Cd Re^2 = (4/3) sqrt(Eo^3/Mo)`.

Grace, Wairegi and Nguyen (1976) and Clift, Grace and Weber (1978),
Chapter 2, Fig. 2.5, provide a generalized compiled `Re-Eo-Mo` map for
preliminary shape screening rather than a one-dimensional Eötvös cutoff. The
dispersed viscosity is not explicit in those coordinates, so the map does not
by itself establish a validated Project 236 spherical/deformed boundary.

For Project 236, the Hadamard–Rybczynski creeping-limit coefficient at
`X=33.6` is within approximately 1% of the rigid-sphere creeping coefficient.
That is a creeping-limit drag comparison only. It does not establish internal
circulation, mobility, or shape behavior at the grid's finite Reynolds
numbers.

### Continuous deformation check

Wellek, Agrawal and Skelland (1966) report for non-oscillating liquid drops:

`major_axis/minor_axis = 1 + 0.163 Eo^0.757`.

This is used only as a continuous aspect-ratio estimate. It is not a
Grace/Clift regime boundary, an oscillation/stability criterion, or a binary
model switch.

## 3. Fixed diameter grid

Barry columns are spherical-model predictions. Grace columns are independent
terminal-velocity sensitivities and are not admitted inside the swarm drag
ratio.

| `d` mm | `Eo` | Barry `Re` | Barry `Cd` | Barry `U`, m/s | `We` | Wellek minor/major | Grace `Re` | Architecture result |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 0.50 | 0.03331 | 4.316 | 8.1360 | 0.010725 | 0.00546 | 0.9877 | outside `H>=2` fit | shape unconfirmed; Barry inside demonstrated `Re` range |
| 1.00 | 0.13322 | 20.703 | 2.8282 | 0.025725 | 0.06281 | 0.9658 | 26.251 | shape unconfirmed; Barry inside demonstrated `Re` range |
| 1.47 | 0.28788 | 47.061 | 1.7388 | 0.039779 | 0.22076 | 0.9403 | 59.765 | shape unconfirmed; Barry inside demonstrated `Re` range |
| 1.75 | 0.40799 | 67.839 | 1.4117 | 0.048167 | 0.38533 | 0.9236 | 82.674 | shape unconfirmed; Barry inside demonstrated `Re` range |
| 2.00 | 0.53289 | 89.608 | 1.2078 | 0.055671 | 0.58827 | 0.9081 | 104.797 | shape unconfirmed; Barry inside demonstrated `Re` range |
| 2.50 | 0.83264 | 142.278 | 0.9357 | 0.070714 | 1.18645 | 0.8757 | 153.375 | shape unconfirmed; Barry inside demonstrated `Re` range |
| 3.00 | 1.19900 | 207.163 | 0.7627 | 0.085803 | 2.09613 | 0.8425 | 207.240 | shape unconfirmed; Barry outside demonstrated `Re` range |
| 4.00 | 2.13156 | 373.793 | 0.5553 | 0.116114 | 5.11821 | 0.7757 | 329.125 | shape unconfirmed; Barry outside demonstrated `Re` range |
| 5.00 | 3.33056 | 590.002 | 0.4353 | 0.146621 | 10.20123 | 0.7116 | 425.636 | shape unconfirmed; Barry outside demonstrated `Re` range |

The similarity between Barry and Grace near 3 mm is not validation. The two
models reach that point through different assumptions, and Grace lacks the
Project 236 dispersed-viscosity term.

No row is labeled “oscillating” from equations alone. The high dispersed
viscosity may damp oscillation, but a source-backed Project 236 stability
boundary was not established.

## 4. Deformation-aware model audit

### Grace terminal map — sensitivity only

For `Mo<1e-3`, `Eo<40`, and `Re>1`, the accessible Grace form is:

`H = (4/3) Eo Mo^(-0.149) (mu_C/0.0009)^(-0.14)`

`J = 0.94 H^0.757`, for `2 <= H <= 59.3`

`J = 3.42 H^0.441`, for `H > 59.3`

`Re = Mo^(-0.149)(J-0.857)`.

It supplies one terminal Reynolds number for a fixed `Eo` and `Mo`. Converting
that terminal point to `Cd` through force balance does not create a
constitutive `Cd(Re)` relation away from terminal conditions.

**Status:** admitted as a terminal-velocity sensitivity. Shape screening
requires separately locating the terminal point on the graphical map. The
equation itself does not determine shape and has no `mu_D` or `X` term. It is
rejected as the Garthe/Stichlmair drag-ratio function.

### Henschke/ReDrop — correct phase class, calibration required

Henschke's single-drop model, summarized by Adinata, provides a liquid-liquid
architecture connecting spherical, deformed, and oscillating velocities. It
uses system-dependent transition and deformation parameters fitted from
single-drop experiments.

No authentic RRBO/NMP parameters were found.

**Status:** physically appropriate future terminal-velocity route; unavailable
as a zero-fit predictive model. Even after fitting, its conversion into the
Garthe Eq. 8.3 drag-ratio closure would require separate RRBO/NMP Kühni swarm
and holdup validation.

### Bozzano–Dente — rejected

The model provides a smooth deformation-aware `Cd` relation but explicitly
models a gas bubble and neglects gas density/internal viscosity.

**Status:** rejected as a governing high-viscosity liquid-drop model.

### Tomiyama — rejected

Tomiyama provides deformation-aware pure, slightly contaminated, and fully
contaminated gas-bubble drag relations. High internal liquid viscosity is not
equivalent to a contaminated gas-liquid interface.

**Status:** rejected as a governing RRBO/NMP liquid-drop model.

### Feng–Michaelides — rejected

This is a spherical viscous-particle equation and is reported for viscosity
ratios no higher than approximately 2. It contains no deformation variable.

**Status:** rejected at `X=33.6` and outside the spherical regime.

### Rigid-sphere correlation — sensitivity only

At `X=33.6`, spherical mobility approaches rigid behavior, so a
Schiller–Naumann calculation can be informative. It does not account for
liquid-drop deformation and is not direct RRBO/NMP validation.

**Status:** sensitivity only.

## 5. Multistage Kühni/ECR compatibility

Garthe/Stichlmair Eq. 8.3 prints:

`v_s/v_o = sqrt{[Cd,o(Re_o)/Cd,o(Re_s)](1-h)^4.65}`.

Using the Kühni characteristic velocity as `v_o` is the present
agitated-column specialization. Garthe constructs `Cd,o(Re)` from
terminal-velocity correlations or data over a range of drop sizes; Eq. 8.3 is
not direct validation of a fixed-diameter changing-shape constitutive law.
Barry Eq. 10 can supply the required Reynolds-dependent values only while its
spherical assumptions remain valid. Grace's terminal map cannot supply this
curve.

If a drop is deformed at free terminal velocity but less deformed at
characteristic or swarm velocity, the shape state must be solved separately
at each local condition. Freezing one terminal shape and forcing it through
the swarm equation is not source-backed.

The final governed relation must therefore be callable as:

`Cd = f(Re, Eo, Mo, X, P, shape_state, interface_state)`.

It must return a physically admissible result for:

1. free-terminal `Re`;
2. characteristic `Re`;
3. every swarm-slip `Re` visited during the holdup/flooding root.

## 6. `d32` interpretation

Calabrese predicts a Sauter population mean:

`d32 = sum(n_i d_i^3)/sum(n_i d_i^2)`.

Single-drop shape correlations use equivalent-volume diameter. Using `d32` as
that diameter is a representative-drop approximation, not proof that the
whole dispersion has one shape. Larger diameter classes may occupy different
map locations than `d32`; whether they deform or oscillate requires their
local equivalent-volume diameter, slip condition, and qualified shape
evidence.

A final multistage Kühni/ECR model should retain this limitation until a
governed drop-size distribution or population balance is available.

## 7. Proposed governed implementation

### Admissible now

1. Implement Barry Eq. 10 in a new, separately versioned research kernel.
2. Use actual `X` and `P`.
3. Use it continuously throughout a confirmed spherical, steady,
   non-oscillating envelope.
4. Apply the same equation at terminal, characteristic, and swarm Reynolds
   numbers while each local state remains spherical.
5. Retain Oliver–Chung and Rivkind–Ryskin only as audit comparators.

### Required decision structure

`d_rep -> properties -> Eo, Mo, X, P`

`-> provisional spherical terminal solve`

`-> source-backed shape/stability assessment`

`-> if spherical: Barry Cd(Re)`

`-> if transition/deformed: calibrated liquid-liquid model`

`-> if no qualified model: DEPENDENCY_BLOCKED`.

### Not admissible

- appending Barry only above `Re=50`;
- continuing Barry through deformed states because its algebra remains finite;
- using a fixed arbitrary `Eo`, `Re`, or axis-ratio transition;
- blending equations only to manufacture continuity;
- using bubble-only models for RRBO;
- inserting Grace terminal `Cd` into the swarm ratio;
- rerunning the diameter optimizer before the deformation path is qualified.

## Final gate

**Decision: RESEARCH HOLD — COMPLETE DRAG ARCHITECTURE NOT YET ESTABLISHED.**

Barry resolves the old equation seam only inside the spherical regime. Wellek
predicts progressively lower non-oscillating-drop axis ratios across the
Project 236 grid, but the actual shape states remain unconfirmed. No unfitted
constitutive liquid-drop drag model was found that closes any non-spherical
states for the local swarm calculation in a multistage counter-current
Kühni/ECR column.

The next defensible routes are:

1. obtain system-representative RRBO/NMP single-drop terminal-velocity and
   deformation measurements and fit the Henschke/ReDrop parameters; or
2. locate and reproduce a primary deformation-aware liquid-drop `Cd(Re)` model
   independently demonstrated at high viscosity ratio and low Morton number.

Until one route is completed, the optimizer must not cross the unresolved
shape transition.

## Independent review and disposition

| Required gate | Evidence reviewed | Disposition |
|---|---|---|
| RRBO/NMP velocity and shape evidence, or a demonstrated primary model | Grace/Clift map, Wellek shape correlation, Barry, Henschke/ReDrop, and deformation-aware bubble/low-`X` alternatives | `NOT SATISFIED` — no RRBO/NMP data and no unfitted liquid-drop model demonstrated at `X=33.6`, `Mo=2.86e-9` |
| Source-backed spherical/non-spherical decision | Local-state shape must come from qualified map placement plus phase-specific evidence; Wellek is continuous screening only | `NOT SATISFIED` — every requested diameter remains `UNCONFIRMED`; no arbitrary cutoff admitted |
| Reynolds-dependent drag at terminal, characteristic, and swarm conditions | Barry supplies a curve only for confirmed steady spheres; Grace supplies one terminal point; Henschke requires fitting | `NOT SATISFIED` for any unconfirmed/deformed state |
| Garthe/Stichlmair Eq. 8.3 compatibility | Eq. 8.3 requires the same applicable constitutive `Cd(Re)` at characteristic and every swarm root state | `DEPENDENCY_BLOCKED` — terminal-map substitution or frozen terminal shape is rejected |
| Engineering approval before optimizer rerun | Complete evidence and equation audit | `NOT APPROVED`; optimizer status `HOLD` |

**Review decision:** the spherical Barry research kernel is reproducible, but
the requested deformed-drop closure is rejected for design use. Approval is
withheld rather than manufactured from a finite equation. The generated CSV
persists the shape-evidence, deformed-closure, Eq. 8.3, and optimizer-release
statuses for every diameter so downstream review cannot mistake a sensitivity
value for an approved state.

The archived hydraulic sizing entry points now consume a process-basis-bound
qualification record and fail closed by default. Their command-line calculation
can run only with explicit `--audit-only`, which prints a
`NOT_APPROVED_FOR_RESIZING` banner and does not change the approval state.

## Reproducibility

- Calculation:
  `research/kuhni_drag_architecture_audit.py`
- Numerical results:
  `research/kuhni_drag_architecture_results.csv`
- Source registry:
  `research/sources.json`
- Barry equation extraction:
  `research/sources/terminal-velocity-review-pmc.md`
- Barry source HTML/MathML:
  `research/sources/terminal-velocity-review-raw.html`

## Principal sources

- Barry, D. A. and Parlange, J.-Y. (2018), “Universal Expression for the
  Drag on a Fluid Sphere,” *PLOS ONE* 13(4), e0194907,
  DOI `10.1371/journal.pone.0194907`.
- Grace, J. R., Wairegi, T. and Nguyen, T. H. (1976), “Shapes and Velocities
  of Single Drops and Bubbles Moving Freely through Immiscible Liquids,”
  *Transactions of the Institution of Chemical Engineers* 54, 167–173.
- Clift, R., Grace, J. R. and Weber, M. E. (1978), *Bubbles, Drops, and
  Particles*, Chapter 2.
- Wellek, R. M., Agrawal, A. K. and Skelland, A. H. P. (1966), “Shape of
  Liquid Drops Moving in Liquid Media,” *AIChE Journal* 12, 854–862,
  DOI `10.1002/aic.690120506`.
- Wegener, M., Paul, N. and Kraume, M. (2014), “Fluid Dynamics and Mass
  Transfer at Single Droplets in Liquid/Liquid Systems,” *International
  Journal of Heat and Mass Transfer* 71, 475–495,
  DOI `10.1016/j.ijheatmasstransfer.2013.12.024`.
- Adinata, D. (2011), *Single-Drop Based Modelling of Solvent Extraction in
  High-Viscosity Systems*.