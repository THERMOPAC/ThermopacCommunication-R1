# Predictive Kühni Hydraulic Screening Diameter

**Audit date:** 2026-09-05  
**Status:** Research calculation complete  
**Production impact:** None. `KUHNI_PHASE1_V1.0.3` was not modified.

## Executive verdict

**YES — a PRE-PILOT HYDRAULIC SCREENING DIAMETER can be calculated without new experimental data.**

The result is not a unique validated equipment diameter. It is a scenario-controlled,
`CALCULATED_EXTRAPOLATED` hydraulic screen. The governing choices must be visible:
agitation intensity/scale-up rule, geometry ratios, flood design fraction, d32 model,
terminal-drag model, and swarm model.

For the immutable Stage-1/run-2 basis and geometric similarity at constant `P/V`, the
primary chain gives:

| Saved 0.15 m reference speed | d32 | Diameter at flood | Diameter at 80% flood | Diameter at 70% flood |
|---:|---:|---:|---:|---:|
| 60 rpm | 0.865 mm | 1.636 m | 1.860 m | **2.008 m** |
| 120 rpm | 0.461 mm | 3.025 m | 3.420 m | **3.679 m** |
| 180 rpm | 0.324 mm | 4.314 m | 4.861 m | **5.219 m** |
| 240 rpm | 0.254 mm | 5.515 m | 6.203 m | **6.653 m** |
| 300 rpm | 0.211 mm | 6.680 m | 7.504 m | **8.044 m** |

The independent Richardson-Zaki swarm branch gives 70%-flood diameters of
1.971, 3.687, 5.220, 6.684, and 8.065 m: agreement within about 2% across the
screen.

These values are far outside Garthe's 72–152 mm validation diameter and most
predicted drops are below his 0.9 mm lower drop-size bound. They therefore remain
extrapolated even though every equation is finite and each physical root closes.

## Immutable calculation basis

- RRBO dispersed: `Q_D=0.001111111111 m3/s`, `rho_D=878 kg/m3`,
  `mu_D=0.106 Pa.s`.
- Wet NMP continuous: `Q_C=0.000474492002 m3/s`, `rho_C=1028 kg/m3`,
  `mu_C=0.001666 Pa.s`.
- Interfacial tension: `0.012 N/m`.
- Phase-flow ratio: `Q_D/Q_C=2.34168`.
- Saved geometry: `d_R/D=0.50`, `h_c/D=0.50`, stator free fraction `0.35`,
  saved power number `1.20`.
- Saved speed screen at `D_ref=0.15 m`: 60, 120, 180, 240, and 300 rpm.

No property was defaulted, reconstructed, or temperature-corrected.

## Admitted model chain

### 1. Scale-up scenario

Geometric similarity is preserved at constant compartment `P/V`:

`N(D) = N_ref (D_ref/D)^(2/3)`.

This follows from `P=Po rho_C N^3 d_R^5` and `V_comp proportional to D^3`,
so `P/V proportional to N^3 D^2`.

Holding RPM fixed while scaling the rotor was separately tested and rejected as a
scale-up strategy: it drives `P/V proportional to D^2`, sends Weber number through
many orders of magnitude, and collapses d32 into micron-scale values. Its enormous
34–696 m mathematical roots are artifacts of that physically incoherent scale-up
assumption, not usable hydraulic diameters.

### 2. Explicit-viscosity d32

Calabrese-Chang-Dang predicts Sauter mean diameter directly [@calabrese1986]:

`d32/d0 = (1 + 11.5 Nv)^(3/5)`

`Nv = sqrt(rho_C/rho_D) mu_D epsilon^(1/3) d32^(1/3) / sigma`

`d0/d_R = 0.053 We^(-3/5)`

`We = rho_C N^2 d_R^3 / sigma`.

The positive implicit root is unique. Stage-1 `mu_D=0.106 Pa.s` is inside the
source's moderate-viscosity data. Source geometry was a baffled tank with a
six-blade Rushton turbine, not a Kühni rotor; source sigma was 0.0378 N/m and
the dispersion was dilute. Application to the Kühni compartment is therefore
`CALCULATED_EXTRAPOLATED`, not rejected.

Kumar-Hartland remains an important extraction-column comparator, but the
accessible primary evidence did not establish explicit dispersed-viscosity
dependence or expose a complete reproducible Kühni coefficient table
[@kumarHartland1996]. It was not used to hide the Calabrese geometry extrapolation.

### 3. High-viscosity terminal drag

The accepted branch is the equation-level fluid-sphere interpolation summarized
and validated by Barry et al. [@barry2018]. It explicitly includes
`X=mu_D/mu_C=63.63`.

For `Re <= 2`, the Oliver-Chung expression is used:

`Cd = 16(1+1.5X)/(Re(1+X)) + (8/5)(1+1.5X)^2/(1+X)^2`.

For `2 < Re <= 50`, Rivkind-Ryskin is used:

`Cd = [X(24/Re + 4 Re^(-1/3)) + 14.9 Re^(-0.78)]/(1+X)`.

Terminal velocity is the positive force-balance root:

`Cd Re^2 = (4/3) Ar`,

`Ar = rho_C (rho_C-rho_D) g d32^3 / mu_C^2`.

The five screens give `Re_t=10.84, 2.31, 0.91, 0.47, 0.27` and
`Eo=0.092, 0.026, 0.013, 0.0079, 0.0054`. The drops are spherical and all
roots remain inside the audited equation branches. Grace/Clift deformation maps
are useful checks but are not required in this small-Eötvös regime
[@grace1976] [@clift1978].

### 4. Kühni characteristic velocity

Garthe Eq. 5.6 is applied exactly [@garthe2006]:

`v_char/v_t = 1 - 1.669 Np^(-3.945)
 - 2.807[d/(D-d_R)]^1.336 - 1.159(h_c/D)^2.049
 + 2.1 phi_s^1.032`

with

`Np = 1.08 + 10.94/Re_R^0.5 + 257.37/Re_R^1.5`.

Every calculated factor is positive (0.225–0.356 at the 70%-flood roots).
The source validates 143 points with 10.7% relative error, but only for
`D=72–152 mm`, `d=0.9–6.4 mm`, and `50–250 rpm`. The present use is therefore
an explicit extrapolation.

### 5. Swarm and holdup

Primary sensitivity: Garthe/Stichlmair Eq. 8.3 [@garthe2006]:

`v_s/v_char = sqrt([Cd(Re_char)/Cd(Re_s)] (1-h)^4.65)`.

Countercurrent continuity is:

`v_s = j_D/h + j_C/(1-h)`.

The coupled positive root uses the same drag law for both Reynolds numbers.

Independent check: Richardson-Zaki,

`v_s = v_char (1-h)^n`,

with the published Reynolds-dependent exponent. Agreement between the two
branches is numerical consistency, not validation.

### 6. Turning-point capacity and diameter

For fixed `r=Q_D/Q_C`:

`j_C(h,D) = v_s(h,D) / [r/h + 1/(1-h)]`

`j_T(h,D) = (1+r) j_C(h,D)`.

Flood capacity is the interior maximum:

`j_T,f(D) = max_(0<h<1) j_T(h,D)`.

The shell diameter at design fraction `F` solves:

`F [pi D^2/4] j_T,f(D) = Q_D + Q_C`.

Stator free area is already present in Garthe Eq. 5.6. Shell superficial
velocities therefore use shell area; dividing by free area again would double
count the internal restriction. Aperture velocity remains a separate mechanical
check.

## Applicability classification

### CALCULATED_EXTRAPOLATED

- All reported constant-`P/V` diameter roots.
- Calabrese d32 transferred from Rushton stirred tanks to Kühni compartments.
- Garthe Eq. 5.6 outside its diameter, drop-size, and speed ranges.
- Either swarm closure at the Stage-1 phase ratio and viscosity ratio.
- Turning-point flooding derived from the admitted swarm function rather than a
  directly fitted RRBO/NMP flooding envelope.

### REJECTED_PHYSICAL_INVALID

- Fixed-RPM geometric scale-up as a diameter-sizing rule, because it makes
  specific power diverge with `D^2` and produces micron-scale breakup artifacts.
- Any non-positive d32, drag, characteristic-velocity factor, capacity, or
  diameter.
- Any root without `0<h_f<1`, a stable lower-holdup operating branch, or an
  interior capacity maximum.
- Applying a drag branch outside its defined Reynolds interval.
- Treating stator free area as both a characteristic-velocity correction and an
  area divisor.

### CORRELATION_UNAVAILABLE

- A uniquely validated RRBO/NMP Kühni diameter.
- A source-validated coalescence model for actual RRBO contaminants.
- A published RRBO/NMP-specific Kuhni flooding envelope.

These unavailable validations do not prevent the pre-pilot calculation.

## Final engineering interpretation

The requested chain is closed:

`viscosity-aware d32 -> fluid-sphere terminal velocity -> Kuhni characteristic
velocity -> swarm/holdup -> turning-point capacity -> D_C`.

No new experiment is required to execute it. The best current reporting basis is
an agitation/flood-fraction envelope, not one selected diameter. At a 70% design
fraction, the present model envelope is **2.01–8.04 m**. Lower agitation gives
larger drops and greater hydraulic capacity; this screen deliberately does not
claim adequate mass transfer, efficiency, stage count, or final mechanical
sizing.

The model is suitable for a new, separately versioned pre-pilot hydraulic kernel.
It must not overwrite or alter `KUHNI_PHASE1_V1.0.3`.

## Reproducibility

- Calculation: `research/kuhni_hydraulic_screen.py`
- Full numerical output: `research/kuhni_hydraulic_screen_results.csv`
- Source registry: `research/sources.json`
- Primary fetched equations:
  - `research/sources/calabrese-viscous-d32-primary.md`
  - `research/sources/terminal-velocity-review-pmc.md`
  - `research/sources/weber-performance-map.md`