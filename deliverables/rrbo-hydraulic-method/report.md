# Proposed pre-pilot hydraulic method: RRBO-continuous / wet-NMP-dispersed Kühni operation

**Decision class:** `PROPOSED — ACCEPTANCE_REQUIRED`  
**Purpose:** one internally consistent hydraulic method specification for pre-pilot planning; not implementation-ready until the unresolved gates are defined, and not a validated design guarantee  
**Method ID proposed:** `RRBO_WETNMP_KUHNI_HYDRAULIC_P0`  
**Property basis:** 40 °C, RRBO continuous and upward; wet NMP dispersed and downward  
**Excluded:** no Stage-3 run, no diameter/RPM optimization, no final equipment sizing, no database/application/drawing/memory change

## 1. Recommendation

Adopt, only after the acceptance items in §10 are signed, this single chain:

1. Use the fixed 40 °C phase/property snapshot and signed countercurrent convention.
2. Retain the present `d32 ∝ (σ/ρc)^0.6 ε^-0.4` expression only as a **project-controlled Sauter-mean screening closure**, not as “the Hinze equation” and not as a maximum stable diameter. Do not add an invented viscosity multiplier. Propagate the already controlled coefficient interval as an epistemic interval, and require a turbulence-regime gate and pre-pilot drop-size measurements.
3. Replace Myint in the low-κ isolated-drop calculation with two mandatory interface scenarios: Barry–Parlange Eq. (10) for a clean/mobile spherical drop and Schiller–Naumann for an immobile spherical interface. Until mobility evidence selects one, carry both through the complete chain and use the lower predicted capacity as the conservative pre-pilot envelope.
4. Retain Garthe Eq. (8.3) as the one Kühni-preferred swarm closure. Use the same accepted drag law consistently at its isolated/characteristic and swarm Reynolds numbers. Preserve Garthe’s definition: his `vs` is superficial swarm velocity, so convert it to interphase slip before solving holdup.
5. Solve actual operating holdup independently from flood holdup:

   `jd/φ + jc/(1-φ) = vslip(φ)`.

   Select the root connected continuously to the dilute, lower-holdup branch as flow is ramped from zero. This is the **quasi-steady admissible lower branch**, not proof of dynamical stability. Do not copy the turning-point holdup into operating holdup.
6. Construct modeled capacity separately by maximizing allowable total superficial throughput at fixed `r = jd/jc`. Label the maximizer `φf,model`, not operating `φ`.
7. Treat phase inversion, entrainment, disengagement, and hardware limits as separate measured/accepted constraints. Do not infer inversion from the mathematical turning point or from `φ = 0.5`.

This is one chain with a required two-scenario interface envelope, not a menu. Neither the clean/mobile nor immobile scenario is presently established as actual. The direct `d32` expression remains the governing pre-pilot proxy because the preferable extraction-column alternative, Kumar–Hartland (1996), could not be obtained in executable primary form. That unavailability is not converted into a guessed transcription.

**Readiness:** this document specifies the equations and decision logic but is **not implementation-ready**. Numeric definitions for the turbulence gate, spherical/non-wobbling gate, Schiller–Naumann range, root mesh/tolerances, and interface-scenario acceptance remain `ACCEPTANCE_REQUIRED`.

## 2. Fixed basis and non-hydraulic calculations

### 2.1 Inputs

| Quantity | Symbol | Value | Unit |
|---|---:|---:|---|
| RRBO density | `ρc` | 869 | kg m^-3 |
| Wet-NMP density | `ρd` | 1015 | kg m^-3 |
| RRBO viscosity | `μc` | 0.0598 | Pa s |
| Wet-NMP viscosity | `μd` | 0.001416 | Pa s |
| Interfacial tension | `σ` | 0.011 | N m^-1 |
| RRBO volumetric flow | `Qc` | 4.000 | m^3 h^-1 |
| Solvent/oil mass ratio | `Sd/Sc` | 0.600 | kg kg^-1 |
| Gravity used for dimensionless evaluation | `g` | 9.80665 | m s^-2 |

The wet-NMP flow implied solely by mass conversion is

`Qd = 0.6 ρc Qc / ρd = 2.05478 m^3 h^-1`.

Thus `Qd/Qc = 0.513695` and total flow is `6.05478 m^3 h^-1`. These are feed-basis conversions, not a hydraulic solution.

### 2.2 Property ratios and extrapolation measures

| Diagnostic | Definition | Current value | Meaning |
|---|---|---:|---|
| Signed density difference | `ρc-ρd` | -146 kg m^-3 | Wet-NMP drops fall relative to RRBO |
| Density ratio | `P=ρd/ρc` | 1.16801 | Barry–Parlange input |
| Viscosity ratio | `κ=X=μd/μc` | 0.0236789 | Very mobile clean-interface limit |
| Inverse viscosity ratio | `μc/μd` | 42.2316 | RRBO is much more viscous |
| Morton number | `Mo=g μc^4 |Δρ|/(ρc^2 σ^3)` | 0.0182163; `log10 Mo=-1.73954` | Inside the reported Myint Morton interval, but κ is not |
| Myint κ lower-bound distance | `0.1/κ` | 4.223 | Current κ is 4.22-fold below the source lower bound |

Against the Kumar–Hartland (1995) Kühni property table retained in the prior audit, current `μc=59.8 mPa s` is 37.1 times the table maximum of `1.61 mPa s` and 61.6 times its minimum of `0.97 mPa s`. Current `μd=1.416 mPa s` and `σ=11 mN m^-1` lie within that table’s dispersed-viscosity and interfacial-tension spans, but this does not repair the continuous-viscosity, phase-orientation, geometry, or system mismatch.

No diameter-dependent `Re`, `Eo`, `We`, rotor Reynolds number, power density, terminal velocity, operating holdup, or capacity is calculated here.

## 3. Governing equations and implementation order

### 3.1 Sign convention

Use magnitudes `jc=Qc/A > 0` upward and `jd=Qd/A > 0` downward. Let downward dispersed velocity relative to the upward continuous phase be positive. Keep `Δρs=ρd-ρc=+146 kg m^-3` in the magnitude balance, while metadata retains the signed project convention `ρc-ρd=-146 kg m^-3`.

### 3.2 Power and the proposed `d32` closure

For accepted Kühni geometry and speed:

`Dr = (Dr/D)D`  
`hc = (hc/D)D`  
`N = RPM/60`  
`A = πD²/4`  
`P = Np ρc N³ Dr⁵`  
`ε = P/(A hc ρc)`  
`d32 = C32 (σ/ρc)^0.6 ε^-0.4`.

Units: `P` in W, `ε` in W kg^-1 = m² s^-3, and `d32` in m.

**Required interpretation.** Hinze (1955) derived a turbulent-breakup stability scale/maximum stable drop concept. It did not establish that an arbitrary coefficient on this scaling is a Kühni `d32` for RRBO/wet NMP. Pacek et al. (1998) further emphasize that `d32` depends on the full size distribution, including its lower and upper limits and shape. The proposed expression is therefore a project closure for `d32`, not a relabeled `dmax`.

**Why retain rather than modify or replace now.**

* **Do not modify:** no primary source was found that licenses a viscosity correction for this exact geometry, orientation, and property ratio. Adding a multiplier would create an unaudited coefficient on top of an unaudited coefficient.
* **Do not execute Kumar–Hartland (1996) yet:** the ACS primary record confirms the paper, eight column families including Kühni, pages 2682–2695, and DOI, but the equation/table needed for exact implementation remained paywalled. Search did not locate a lawful, reliable primary full text. Existing project transcriptions are already classified invalid.
* **Retain conditionally:** the direct scaling is dimensionally coherent and already controlled, so it is the least-inventive executable pre-pilot placeholder if every result remains interval-valued and measured `d32` is an acceptance gate.

`C32` shall be propagated as the existing epistemic interval `[0.36, 0.43]`, with `0.42` as the nominated nominal only if accepted. This interval is not demonstrated to be exhaustive of model-form or scale-up uncertainty. Do not assign a probability distribution or confidence level without data. `Np=1.2` remains a separate fixed engineering assumption, not Garthe’s diagnostic power number. The **saved/known basis value** `σ=0.011 N m^-1` is fixed for the nominal snapshot; no primary measurement evidence was identified here, so provenance, method, repeatability, aging/contamination effects, and uncertainty remain required.

An execution must fail its **method-domain gate** unless the accepted geometry/speed case demonstrates a turbulent breakup regime appropriate to the inertial scaling. The acceptance review must define the exact rotor/compartment Reynolds or local-dissipation criterion; this report does not invent one.

### 3.3 Clean/mobile isolated-drop scenario: Barry–Parlange

Barry and Parlange (2018), pp. 3–7, define

`Re = ρc |u| d / μc`, `X=μd/μc`, and `P=ρd/ρc`.

Their exact low-Re Hadamard–Rybczynski limit (Eq. 3, p. 4) is

`Cd = [16/Re] [(1 + 1.5X)/(1+X)]`.

Their general spherical-fluid-particle drag (Eq. 10, p. 6) is

`Cd = [48/(Re(1+X))](1+1.5X) ×`

`[Re^0.5 + A Z + τ exp(-λ Re^0.5)] /`

`[Re^0.5/(1+X) + 3 A Z + 3τ exp(-ω Re^0.5)]`,

where

`A = [2√2/(5√π)](6√3 + 5√2 - 14) = 1.10535`,

`Z = 1 + [(α-2)(XP)^0.5 + (β-1)XP] [1+(XP)^0.5]^-2`,

`α=2.5891`, `β=0.9879`,

`τ(τ+AZ) = (8/9)(4+3X)/(1+X)`,

`λτ=1`, and `ωτ=1/[3(1+X)]`.

The positive root of the quadratic for `τ` is required. The source says the equation is for a single steady spherical particle/drop/bubble in an infinite homogeneous liquid, for any viscosity and density ratios, and comparisons support Reynolds numbers up to a few hundred. Surface tension must be sufficient to maintain sphericity. It is not a swarm, wall, rotor, or deformed-drop model.

Solve terminal speed from

`(π/6)d³(ρd-ρc)g = (1/2)ρc Cd(Re,X,P)(π/4)d² ut²`.

Equivalently,

`Cd(Re,X,P) Re² = (4/3) Ar`,

`Ar = ρc(ρd-ρc)g d³/μc²`,

then `ut = Re μc/(ρc d)`, directed downward.

**Shape gate:** Barry–Parlange is usable only while an accepted `Eo`, deformation, and non-wobble criterion classifies the representative drop as spherical. The paper itself points to shape maps rather than declaring a universal numeric cutoff. Therefore this report does not invent one. The missing numeric gate is one reason the method is not implementation-ready. If the gate fails, the hydraulic method returns `OUTSIDE_METHOD_DOMAIN`; it does not silently switch correlations.

### 3.4 Mandatory interface-mobility sensitivity

Unknown RRBO/wet-NMP contamination can immobilize the interface. Evaluate as the second required scenario,

`Cd,SN = (24/Re)(1+0.15 Re^0.687)`

over the Schiller–Naumann range accepted by the reviewer.

At `Re→0`, the clean/mobile Barry–Parlange coefficient for current `X=0.0236789` is

`Cd Re = 16(1+1.5X)/(1+X) = 16.1850`,

whereas an immobile rigid sphere has `Cd Re=24`. The low-Re drag coefficient ratio is `24/16.1850 = 1.48285`; consequently the clean Hadamard–Rybczynski terminal speed is up to 1.48285 times the rigid Stokes speed for the same spherical diameter and properties. This is a transparent clean-versus-immobile sensitivity, not a claim about the actual interface.

The current Myint formula has the same Hadamard–Rybczynski low-Re prefactor multiplied by a Schiller–Naumann-type inertial factor, but Myint’s experiments report `0.1<κ<100` and rising drops. Current `κ=0.02368` is outside that interval. Barry–Parlange is preferred for the clean scenario because its viscosity-ratio limit is analytical and explicit, not because it validates contamination or falling drops in a Kühni column. Until actual mobility is established, calculate both complete hydraulic scenarios and define conservative modeled capacity as `min(jf,model,clean, jf,model,immobile)`.

### 3.5 Characteristic velocity

Retain Garthe (2006 dissertation), printed p. 86, Eqs. (5.6)–(5.7), exactly as the prior source-verified Kühni closure:

`NP,G = 1.08 + 10.94/ReR^0.5 + 257.37/ReR^1.5`

`vchar = ut [1 - 1.669 NP,G^-3.945`

`             - 2.807(d32/(D-Dr))^1.336`

`             - 1.159(hc/D)^2.049`

`             + 2.1 φs^1.032]`.

Here `NP,G` is Garthe’s source quantity; it is not the fixed `Np=1.2` in the power equation. Symbols and units must follow the source transcription already visually verified in the predecessor audit. The source fit used 143 Kühni points with 10.7% relative error and pilot dimensions/speeds, not RRBO/wet NMP.

The proposed method uses Barry–Parlange consistently wherever a spherical single-drop drag is needed. It must not mix Barry terminal drag with a Myint drag ratio downstream.

### 3.6 Garthe swarm law and the low-Re limit

Garthe printed p. 126, Eq. (8.3), gives

`vs(φ)/v0 = { [Cd(Re0)/Cd(Res)] (1-φ)^4.65 }^0.5`.

The entire drag-ratio × hindrance term is under the square root. `Cd` must be evaluated at the isolated/characteristic state `Re0` and the swarm state `Res`. In this proposed chain both evaluations use Barry–Parlange, subject to the same spherical/mobile-interface gate.

Garthe’s definitions matter. Printed pp. 29–31, Eqs. (2.37)–(2.38), distinguish relative swarm/slip velocity `vrs` from superficial swarm velocity `vs`:

`vrs = jd/φ + jc/(1-φ)`,

`vs = vrs(1-φ)`.

Therefore the closure used in the operating root is

`vslip(φ) = vs(φ)/(1-φ)`.

This conversion is mandatory. Calling Garthe’s `vs` directly an interphase slip velocity would lose a factor `(1-φ)` and would not reproduce his definitions.

**Required current-model correction.** Visual review of the primary dissertation confirms Eq. (2.37) on printed p. 29 (`vrs=vd/hd+vc/(1-hd)`), Eq. (2.38) on printed p. 29 (`vs=vrs(1-hd)`), the laminar limit in Eqs. (2.41)–(2.42) on printed p. 31, and the superficial swarm relation in Eq. (8.3) on printed p. 126. The current reverse implementation solves `swarmVelocityMagnitude` from Eq. (8.3) and passes that value directly into `capacityAtHoldup` (`server/ecr-pre-pilot/kuhni-geometry-resolver-v140.ts:328-343`). It does not divide by `(1-holdup)` before using a relative-slip capacity expression. The proposed method therefore requires a model correction: calculate `vslip=vs/(1-φ)` first, then use it in both the operating-root and capacity equations. This report changes no application code.

**Low-Re interpretation.** For `Cd ∝ 1/Re`, Eq. (8.3) reduces algebraically to

`vs/v0 = (1-φ)^4.65`,

not `(1-φ)^2.325`. The exponent `2.325` is the constant-drag high-Re limit because the radical then halves `4.65`. Garthe printed p. 31 states these two limits explicitly in Eqs. (2.42)–(2.43). Thus the very viscous/low-Re case trends toward the stronger `4.65` superficial-velocity hindrance. The source does not prove that an RRBO/wet-NMP drop swarm follows rigid-sphere Richardson–Zaki behavior.

Garthe’s Kühni validation, printed p. 139, Figure 8.11, reports 118 points and 23.5% average relative error for conventional systems, `Dc=80–152 mm`, compartment height `5.0–7.2 cm`, agitator `45–85 mm`, `28–220 min^-1`, and stator free area `20–40%`. Printed p. 139 also notes larger errors for a few 20% free-area cases. The preceding validation states that drop swarms with `d32<4.5 mm` showed minor deviations in RDCs, while larger drops were not satisfactorily predicted. These are source-domain diagnostics, not rejection limits invented for the current service.

### 3.7 Actual operating holdup

At actual superficial velocities, solve

`F(φ) = jd/φ + jc/(1-φ) - vslip(φ) = 0`, `0<φ<1`.

Root policy:

1. Use bounded bracketing, never an unconstrained Newton-only solve.
2. Identify all sign-changing intervals on an accepted mesh and refine each root.
3. Starting from a small positive flow multiplier, continue roots as both feed flows are ramped proportionally to their actual values.
4. Select `φop` only as the lowest-holdup root continuously connected to the dilute branch; label it `LOWER_QUASI_STEADY_ADMISSIBLE`, not dynamically stable.
5. Report every other root as a mathematical root, not an operating state.
6. If branch continuation terminates, folds, jumps, or reaches an accepted inversion/entrainment limit before actual flow, return no operating holdup.

The method shall output `φop`, `aop=6φop/d32` only after this root succeeds. It shall never substitute flood holdup into `φop` or `aop`. Branch continuation is a quasi-steady algebraic admissibility rule; dynamical stability requires separate transient/perturbation evidence.

### 3.8 Modeled turning capacity and flood holdup

For fixed flow ratio `r=jd/jc=Qd/Qc=0.513695`, parameterize total superficial throughput `jT=jd+jc`:

`jd = [r/(1+r)]jT`, `jc=[1/(1+r)]jT`.

The slip balance gives

`jT,allow(φ) = (1+r) vslip(φ) / [r/φ + 1/(1-φ)]`.

Define

`jf,model = max jT,allow(φ)`,

`φf,model = arg max jT,allow(φ)`.

This is a mathematical turning capacity of the accepted slip closure. It is not observed flood. Evaluate it for both clean/mobile and immobile-interface scenarios; before mobility qualification, the reported conservative capacity is their minimum. Actual loading for each scenario is

`Lmodel = jT,actual/jf,model`.

Any design fraction such as `0.70` is a policy margin and must be separately accepted; Garthe Eq. (8.3) does not supply it.

### 3.9 Phase inversion is a different unknown

Define an independent `φinv` or inversion boundary from measured exact-fluid behavior. It is not:

* `φop`;
* `φf,model`;
* automatically `0.5`;
* a consequence of the local maximum in `jT,allow`;
* supplied by Barry–Parlange or Garthe.

The usable pre-pilot envelope is constrained by the first accepted limit among lower-branch loss, model turning capacity with accepted margin, measured inversion, entrainment, disengagement, distributor/collector behavior, and mechanical limits. Until `φinv` and the other empirical limits exist, the method may report `jf,model` only with status `MODELED_TURNING_CAPACITY_NOT_OBSERVED_FLOOD`.

## 4. Why alternatives were not selected

### 4.1 Myint remains a comparator, not the governing low-κ law

Myint et al. (2006) is primary experimental work and includes surfactant effects, but its stated clean-drop correlation domain is rising drops with `0.1<κ<100`. Current κ is 4.22-fold below that bound and the drop falls. Its continuation is calculable but does not address the exact missing limit. Barry–Parlange reproduces Hadamard–Rybczynski for all viscosity ratios and explicitly includes density ratio; its narrower weakness—sphericity and clean mobility—is visible and gateable.

### 4.2 Schiller–Naumann alone is too conservative to call the nominal liquid-drop model

Schiller–Naumann treats the interface as immobile/rigid. It is valuable because trace contamination may create that behavior, but choosing it alone without evidence would be as arbitrary as choosing a clean interface. The proposed method carries both complete scenarios and uses the lower capacity as the conservative pre-pilot envelope until mobility is measured.

### 4.3 Richardson–Zaki by itself is not Kühni evidence

Richardson and Zaki (1954) established approximately `n=4.65` below particle `Re≈0.2` for uniform rigid spheres when wall effects are negligible. Garthe explicitly warns that directly applying Richardson–Zaki to extraction columns with internals is risky, then develops the drag-ratio form and validates it in several extraction-column types including Kühni. Garthe is therefore the selected swarm route, while the `4.65` provenance and low-Re limiting behavior remain explicit.

### 4.4 No arbitrary viscous correction to `d32`

Primary and review literature confirms that viscosity and coalescence can affect breakup and the size distribution. Calabrese, Chang and Dang (1986) specifically studied dispersed-phase-viscosity effects in turbulent stirred tanks. That does not yield a verified continuous-RRBO correction for the current Kühni closure. The current dispersed viscosity is low, but the continuous viscosity is 59.8 mPa s and may prevent the assumed inertial turbulence. The defensible response is a regime gate plus measured `d32`, not coefficient invention.

## 5. Uncertainty treatment

The method must keep these layers separate:

1. **Property uncertainty:** `ρc`, `ρd`, `μc`, `μd`, and particularly `σ` at actual water/solute content and 40 °C.
2. **`d32` parametric interval:** evaluate at `C32=0.36`, nominal `0.42`, and `0.43`; this is an interval, not a statistical distribution and not an exhaustive model-form uncertainty bound.
3. **Drop population/model form:** measure number/volume distributions and report `d10`, `d32`, `d43`, upper tail, and deformation class. A single `d32` does not prove equivalent slip.
4. **Interface mobility:** carry clean Barry–Parlange and immobile Schiller–Naumann through terminal, swarm, roots and capacity; conservatively envelope capacity by the lower result until evidence selects a state.
5. **Characteristic/swarm extrapolation:** carry Garthe’s reported errors as source-fit diagnostics, not transferable confidence intervals. Add explicit geometry/property/rate extrapolation ratios.
6. **Branch uncertainty:** record root count, continuation history, turning point, and distance to independently measured inversion/entrainment limits.

Do not combine these into a probabilistic confidence level until distributions and dependence are accepted. Do not tune `C32` so that the drag/swarm/flood chain matches a desired capacity.

## 6. Source-domain extrapolation

| Link | Primary domain/evidence | Current relationship | Quantified extrapolation/status |
|---|---|---|---|
| Kumar–Hartland 1996 `d32` | Eight extractor types including Kühni; ACS record, pp. 2682–2695 | Exact primary equation unavailable | Not executable; no guessed transcription |
| Direct turbulent proxy | Inertial breakup scaling; present project `C32` interval | Continuous RRBO is highly viscous | Requires turbulence gate; model-form extrapolation remains |
| Myint terminal drag | Rising drops, `0.1<κ<100`, `-11.6<log10Mo<-0.9` | `κ=0.02368`, `log10Mo=-1.740`, falling drop | κ is 4.22-fold below lower bound; not governing |
| Barry–Parlange | Spherical, steady, isolated fluid sphere; all viscosity/density ratios; `Re` to a few hundred by comparison | `X=0.02368`, `P=1.168` are covered as scalar ratios | Shape, cleanliness, infinity/wall/agitation assumptions unverified |
| Richardson–Zaki | Uniform rigid spheres; wall effects negligible; `n≈4.65` for `Re<0.2` | Liquid drops with internals | Not used directly |
| Garthe swarm | Extraction columns; Kühni Figure 8.11: 118 points, 23.5% relative error, `D=80–152 mm`, `n=28–220 rpm`, conventional systems | RRBO/wet NMP and any commercial geometry are outside fluid/scale corpus | Retained as closest primary Kühni law; explicit extrapolation |
| Historical reference geometry only | Prior audited `D=600 mm`, `hc=180 mm`, `Dr=198 mm`; no new solve here | Compared with Garthe maxima `152`, `72`, and `85 mm` | Ratios: `D/Dmax=3.95`, `hc/hc,max=2.50`, `Dr/Dr,max=2.33`; reference extrapolation, not a current candidate |
| Garthe large-drop observation | Minor RDC deviations below `d32=4.5 mm`; unsatisfactory above | Current `d32` not solved here | Prospective gate/diagnostic, not a current pass |
| K&H 1995 property table | `μc=0.97–1.61 mPa s`, water continuous | `μc=59.8 mPa s`, oil continuous | 37.1× above source maximum |

The historical 600 mm geometry is included only to quantify the already-known source-domain distance. Geometry extrapolation must be recalculated for any later candidate; this report does not run hydraulics or promote that reference geometry.

## 7. Required outputs from any later execution

Every case must emit:

* method ID/version and acceptance-record ID;
* fixed property snapshot and uncertainty;
* phase direction and signed density difference;
* geometry, `Np`, `C32`, `σ`, power and turbulence-gate evidence;
* `d32` interval and measured-distribution status;
* Barry–Parlange terminal result and force residual;
* numeric turbulence and spherical-gate definitions, or explicit `NOT_IMPLEMENTATION_READY`;
* both clean/mobile and immobile-interface scenario results and their conservative capacity envelope;
* Garthe characteristic and swarm quantities with exact velocity definitions;
* all operating roots, continuation path, selected lower branch `φop`;
* separate `φf,model`, `jf,model`, and `Lmodel`;
* inversion/entrainment/disengagement inputs or explicit `UNKNOWN`;
* every source-range ratio and model-domain failure;
* classification `PREPILOT_EXTRAPOLATED_METHOD`, never `VALIDATED` or `GUARANTEED`.

## 8. Primary source matrix

| ID | Primary source and locator | What was directly verified | Use in proposed method | Limitation |
|---|---|---|---|---|
| S1 | Hinze, J.O. (1955), *AIChE Journal* 1, 289–295. DOI [10.1002/aic.690010303](https://doi.org/10.1002/aic.690010303) | Foundational turbulent breakup / maximum-stable-scale provenance | Exponent provenance only | Does not supply current Kühni `d32` coefficient |
| S2 | Kumar, A.; Hartland, S. (1996), *Ind. Eng. Chem. Res.* 35, 2682–2695. DOI [10.1021/ie950674w](https://doi.org/10.1021/ie950674w) | ACS primary record/abstract: average drop size, eight extractor types including Kühni | Preferred future replacement if exact primary equation is obtained and verified | Full equation/table unavailable; not executable now |
| S3 | Kumar, A.; Hartland, S. (1995), *Ind. Eng. Chem. Res.* 34, 3925–3940. DOI [10.1021/ie00038a032](https://doi.org/10.1021/ie00038a032) | Prior audit visually verified Eq. 9, Eqs. 15–19, Table 1 and Table 2 | Domain comparison only | Operating-holdup correlation is not the proposed reverse slip closure |
| S4 | Myint, W.; Yamaguchi, M.; Takemura, F. (2006), *J. Fluid Sci. Technol.* 1, 72–81. DOI [10.1299/jfst.1.72](https://doi.org/10.1299/jfst.1.72) | Rising-drop range and viscosity-ratio lower bound; surfactant sensitivity | Comparator only | Current low κ and falling orientation outside stated set |
| S5 | Barry, D.A.; Parlange, J.-Y. (2018), *PLOS ONE* 13, e0194907, pp. 3–9, especially Eqs. 3 and 7–12. DOI [10.1371/journal.pone.0194907](https://doi.org/10.1371/journal.pone.0194907) | Primary PDF visually inspected; all-ratio spherical drag, exact low-Re limit, coefficients and applicability | Clean/mobile interface scenario | No deformation, contamination, wall, agitation, or swarm closure; immobile scenario also required |
| S6 | Richardson, J.F.; Zaki, W.N. (1954), *Trans. Inst. Chem. Eng.* 32, 35–53 | `n≈4.65` at particle `Re<0.2`, wall effects excluded, via author retrospective and Garthe’s primary treatment | Provenance/limit only | Rigid particles, no Kühni internals |
| S7 | Garthe, D. (2006 repository record; dissertation dated 2005), *Fluiddynamics and Mass Transfer of Single Particles and Swarms of Particles in Extraction Columns*, TUM mediaTUM [record 601973](https://mediatum.ub.tum.de/601973) | Primary PDF visually inspected: Eqs. 2.37–2.44 pp. 29–31; Eqs. 5.6–5.7 p. 86; Eq. 8.3 p. 126; Figure 8.11 p. 139 | Characteristic velocity, swarm, definitions, source range | Conventional fluids/pilot geometries; reported error is not current uncertainty |
| S8 | Calabrese, R.V.; Chang, T.P.K.; Dang, P.T. (1986), *AIChE Journal* 32, 657–666. DOI [10.1002/aic.690320416](https://doi.org/10.1002/aic.690320416) | Primary bibliographic record and abstract identify dispersed-viscosity effect on equilibrium mean size/distribution | Evidence against ignoring viscosity physics | Stirred-tank evidence; no direct current correction |
| S9 | Pacek, A.W.; Man, C.C.; Nienow, A.W. (1998), *Chemical Engineering Science* 53, 2005–2011. DOI [10.1016/S0009-2509(98)00068-2](https://doi.org/10.1016/S0009-2509(98)00068-2) | Publisher abstract: `d32` depends on distribution bounds and shape | Population warning | Not a current Kühni closure |
| S10 | Sathyagal, A.N.; Ramkrishna, D.; Narsimhan, G. (1996), *AIChE Journal* 42, 1421–1431. DOI [10.1002/aic.690420606](https://doi.org/10.1002/aic.690420606) | Publisher primary abstract: continued breakup up to 10 h challenges a simple maximum-stable-drop concept | Supports not equating `dmax` and `d32` | Stirred dispersion, not RRBO/wet NMP |

No inaccessible equation is represented as verified. Web search snippets were used to locate sources, not as equation authority. The retained primary PDFs and extracted text are under `deliverables/rrbo-hydraulic-method/sources/`.

## 9. Assumptions register

| ID | Assumption / decision | Proposed state | Acceptance evidence |
|---|---|---|---|
| A01 | 40 °C property snapshot represents actual RRBO and wet NMP | `ACCEPTANCE_REQUIRED` | Traceable samples/composition, temperature-controlled measurements |
| A02 | `σ=0.011 N m^-1` nominal | `ACCEPTANCE_REQUIRED` | Method, repeatability, aging/contamination and uncertainty |
| A03 | `Np=1.2` fixed in power law | `ACCEPTANCE_REQUIRED` | Vendor/geometry-specific power data |
| A04 | Direct turbulent scaling represents `d32` | `ACCEPTANCE_REQUIRED` | Turbulence gate plus measured distributions |
| A05 | `C32∈[0.36,0.43]`, nominal `0.42` | `ACCEPTANCE_REQUIRED` | Controlled rationale; interval is not exhaustive; no probability claim |
| A06 | One `d32` is adequate for hydraulic slip | `ACCEPTANCE_REQUIRED` | Distribution-tail and population/slip sensitivity |
| A07 | Barry–Parlange clean spherical scenario | `ACCEPTANCE_REQUIRED` | Numeric shape gate and interface-mobility observations |
| A08 | Schiller–Naumann immobile scenario | `ACCEPTANCE_REQUIRED` | Accepted applicability range; carry full scenario and conservative envelope |
| A09 | Garthe Eqs. 5.6–5.7 transfer to current system | `ACCEPTANCE_REQUIRED` | Pre-pilot velocity/holdup measurements |
| A10 | Garthe Eq. 8.3 transfers to current swarm | `ACCEPTANCE_REQUIRED` | Exact-fluid holdup/slip curve |
| A11 | Garthe `vs` is converted to `vslip=vs/(1-φ)` | `REQUIRED_MODEL_CORRECTION` | Primary pp. 29, 31, 126; current code omits conversion before capacity |
| A12 | Lower continuation root is quasi-steady admissible holdup | `ACCEPTANCE_REQUIRED` | Ramp-up/ramp-down holdup; no dynamical-stability claim |
| A13 | Turning maximum represents model capacity only | `PROPOSED_SOURCE_REQUIRED` | Reviewer confirms terminology and implementation |
| A14 | Design flood fraction (including legacy 0.70) | `ACCEPTANCE_REQUIRED` | Approved uncertainty/margin basis |
| A15 | Phase-inversion boundary | `UNKNOWN — REQUIRED` | Exact-fluid inversion tests; do not use `φ=0.5` default |
| A16 | Entrainment/disengagement and interface control | `UNKNOWN — REQUIRED` | Pre-pilot observations and hardware review |
| A17 | Geometry/scale extrapolation is acceptable for pre-pilot only | `ACCEPTANCE_REQUIRED` | Explicit ratios and vendor/pilot review |
| A18 | No final diameter/RPM or release claim follows | `REQUIRED` | Governance and consumer tests |
| A19 | Implementation readiness | `NOT_READY` | Define numeric turbulence/shape/range gates and solver tolerances |

## 10. Acceptance record required before use

The method is not approved by this report. A versioned acceptance record must resolve:

1. **Coefficients:** `C32` interval and nominal; no tuned value after seeing capacity.
2. **Models:** direct `d32`, Garthe characteristic/swarm, mandatory clean Barry–Parlange and immobile Schiller–Naumann scenarios, and conservative capacity-envelope rule.
3. **Properties:** actual composition/temperature ranges and uncertainty, especially `σ`.
4. **Power:** fixed `Np` and geometry-specific applicability.
5. **Distribution:** required measured drop-size statistics and representative-size policy.
6. **Holdup branch:** continuation algorithm, root mesh/tolerances, hysteresis handling, and quasi-steady—not dynamical-stability—label.
7. **Flood/capacity:** turning-point terminology, accepted margin, and independent observed-flood program.
8. **Inversion:** separate measured boundary and no default substitution.
9. **Interface mobility/shape:** numeric spherical/non-wobbling gate, Schiller–Naumann range, and evidence required to retire the two-scenario conservative envelope.
10. **Extrapolation:** explicit approval of fluid, geometry, speed, scale, and transfer-direction ratios.

Minimum acceptance tests should measure, at several sub-capacity operating points and on both flow ramp directions: full drop-size distribution, shape class, holdup, slip/phase velocities, interface behavior, entrainment, inversion onset, and observed capacity. Tests must span at least the proposed speed/power and flow-ratio envelope and include property remeasurement.

## 11. Disposition

`RRBO_WETNMP_KUHNI_HYDRAULIC_P0` is the recommended single pre-pilot method **conditional on acceptance**. It is more defensible than the current chain because it:

* separates operating `φop` from modeled flood `φf,model`;
* restores Garthe’s superficial-versus-relative velocity definition;
* uses an all-viscosity-ratio spherical drag at `κ=0.02368`;
* carries clean/immobile uncertainty through a conservative two-scenario capacity envelope;
* preserves the low-Re `4.65` Garthe/Richardson–Zaki limit;
* refuses an invented viscous `d32` correction or an unverified Kumar–Hartland transcription;
* keeps model turning capacity and phase inversion as different unknowns.

It remains extrapolated and not implementation-ready until the numeric regime/shape gates and solver tolerances are accepted. “Dependable” here means equations, units, branches, assumptions, source pages, and failure states are auditable enough to plan and interpret a pre-pilot campaign. It does not mean validated hydraulic performance, dynamical branch stability, guaranteed capacity, or authorization for diameter/RPM optimization.

## Bibliography

1. Barry, D.A.; Parlange, J.-Y. “Universal expression for the drag on a fluid sphere.” *PLOS ONE* 13 (2018), e0194907. DOI: 10.1371/journal.pone.0194907.
2. Calabrese, R.V.; Chang, T.P.K.; Dang, P.T. “Drop breakup in turbulent stirred-tank contactors. Part I: Effect of dispersed-phase viscosity.” *AIChE Journal* 32 (1986), 657–666. DOI: 10.1002/aic.690320416.
3. Garthe, D. *Fluiddynamics and Mass Transfer of Single Particles and Swarms of Particles in Extraction Columns.* Dissertation, Technische Universität München, repository publication 2006, record 601973.
4. Hinze, J.O. “Fundamentals of the Hydrodynamic Mechanism of Splitting in Dispersion Processes.” *AIChE Journal* 1 (1955), 289–295. DOI: 10.1002/aic.690010303.
5. Kumar, A.; Hartland, S. “A Unified Correlation for the Prediction of Dispersed-Phase Hold-Up in Liquid-Liquid Extraction Columns.” *Industrial & Engineering Chemistry Research* 34 (1995), 3925–3940. DOI: 10.1021/ie00038a032.
6. Kumar, A.; Hartland, S. “Unified Correlations for the Prediction of Drop Size in Liquid–Liquid Extraction Columns.” *Industrial & Engineering Chemistry Research* 35 (1996), 2682–2695. DOI: 10.1021/ie950674w.
7. Myint, W.; Yamaguchi, M.; Takemura, F. “Terminal Velocities of Single Drops in Stagnant Liquids.” *Journal of Fluid Science and Technology* 1 (2006), 72–81. DOI: 10.1299/jfst.1.72.
8. Pacek, A.W.; Man, C.C.; Nienow, A.W. “On the Sauter mean diameter and size distributions in turbulent liquid/liquid dispersions in a stirred vessel.” *Chemical Engineering Science* 53 (1998), 2005–2011. DOI: 10.1016/S0009-2509(98)00068-2.
9. Richardson, J.F.; Zaki, W.N. “Sedimentation and Fluidisation: Part I.” *Transactions of the Institution of Chemical Engineers* 32 (1954), 35–53.
10. Sathyagal, A.N.; Ramkrishna, D.; Narsimhan, G. “Maximum stable drop diameter in stirred dispersions.” *AIChE Journal* 42 (1996), 1421–1431. DOI: 10.1002/aic.690420606.