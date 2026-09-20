# RRBO-continuous / wet-NMP-dispersed reverse-hydraulic scientific audit

**Audit mode:** read-only, before any recalculation  
**Scope:** the actual Stage-3 reverse branch, its equations, evidence, callers, selection metadata, and downstream admission path  
**Excluded:** no hydraulic solve or optimizer replay; no database query; no application, database, drawing, memory, or scientific-input change  
**Evidence basis:** source code and tests as found; prior read-only audits; visually inspected retained primary-source page images

## 1. Executive disposition

### Governing finding

The reverse branch is **mathematically calculable but scientifically unqualified**. Its signed buoyancy and countercurrent kinematics are defensible necessary physics. Its `d32`, Myint drag/shape continuation, Garthe characteristic velocity, swarm/holdup closure, turning-point “flood” capacity, and resulting diameter/RPM window remain linked empirical extrapolations. A finite root, a closed force residual, an interior `floodHoldup`, or `actualLoading <= 0.7` does not qualify those links.

The unqualified status is **not** because reversal is inherently impossible and **not** because `abs(Δρ)` is always wrong. Magnitudes such as `|Δρ|`, Eötvös, Morton, Archimedes magnitude, and drag-speed magnitude can legitimately use an absolute density difference after direction is retained separately. Direction must still govern drift/relative velocity, ports, interface control, and branch stability. The current reverse kernel does retain the negative signed density difference and downward dispersed velocity. The scientific gap is the empirical domain and population/flooding routing—not a sign error in that narrow force balance.

### Governing-policy reconciliation: intentional two-level admission

The legacy V1.4/V1.5 resolver keeps reverse trials `CALCULATED_EXTRAPOLATED`, outside `hydraulicRpmEnvelope`, with no governed hydraulic diameter (`server/ecr-pre-pilot/kuhni-geometry-resolver-v140.ts:486-492, 570-623`; `kuhni-geometry-resolver-v150.ts:625-702`). Its additive presentation layer nevertheless intentionally admits an independently rechecked V1.5 root to **HETS-only pre-pilot screening**, while preserving `governed:false`, `stage4Input:false`, and `stage4HetsScreeningInput:true` (`kuhni-stage3-presentation.ts:16-43, 198-249, 274-355`; `tests/kuhni-stage3-presentation.test.ts:54-99`).

The **current additive Stage-3/4 optimizer implements a different, expressly preliminary policy**:

1. `evaluateTrial` dispatches RRBO-continuous cases to `evaluateKuhniReverseTrial` (`stage3-stage4-optimizer.ts:665-695`).
2. `reverseTrialFromRecord` places correlation limitations in `sourceDiagnostics`; it sets `hydraulicPass`, `status: FEASIBLE`, and `validity: SCALE_UP_EXTRAPOLATION` from numerical/physical screening checks (`:598-662`).
3. `optimizeOrientation` builds screening windows from every `status === FEASIBLE` trial (`:1119-1171`) and can select the Stage-1 reverse orientation (`:1371-1395`).
4. If selected, the result emits `status: OPTIMIZED_FIXED_GEOMETRY_WINDOW`, `classification: PRE_PILOT_HYDRAULIC_SCREENING_NOT_SEPARATION_QUALIFICATION`, and `stage4GeometryInput.status: SELECTED_IMMUTABLE_OPTIMIZER_GEOMETRY`; reverse limitations remain in `sourceDiagnostics` and assumptions (`:1400-1513`).
5. Stage 4 validates optimizer identity, geometry ranges, RPM, and lineage and intentionally converts the result to `classification: PRE-PILOT PREDICTIVE / SCREENING DESIGN`, with adopted efficiency explicitly “NOT_CALCULATED_PERFORMANCE” and no outlet/final-design claim (`stage4-pre-pilot-sizing-service.ts:254-307, 309-430`).

This behavior is **not established by the reviewed contract as a code bug**. The project policy says evidence status is metadata rather than an execution gate for Phase-1 screening, permits a complete chain to remain `CALCULATED_EXTRAPOLATED`, and expressly applies assumption-based Stage-4 screening to both orientations (`.agents/memory/prepilot-kuhni-phase1-boundary.md:6-18`; `.agents/memory/prepilot-kuhni-hydraulic-chain.md:6-10, 54-59`; `.agents/memory/stage4-hets-screening-boundary.md:6-28`). Tests intentionally accept either a selected reverse screening result or no bounded result while prohibiting a silent orientation swap (`tests/ecr-pre-pilot-stage3-stage4-optimizer.test.ts:158-205`).

There is nevertheless a **missing scientific-qualification gate for the user's stronger objective**: current `FEASIBLE`, `SELECTED`, `hydraulicPass`, empty `blockers`, and `stage4GeometryInput` fields mean bounded preliminary screening, not independent qualification. No reviewed field positively establishes the complete reverse empirical chain. If the product must expose a scientifically qualified or release-eligible hydraulic result, it needs a separate positive qualification/release contract; it should not reinterpret current screening flags as that contract.

### Required immediate disposition

* Keep reverse calculations explicitly classified as **preliminary extrapolated screening / comparison** unless a separate qualification record is present.
* Interpret “hydraulicPass,” “FEASIBLE,” “selected diameter,” and “RPM window” only inside the approved pre-pilot screening level; do not translate them into correlation-qualified, pilot-validated, or release-eligible claims.
* The existing **1.3 m comparison candidate** reported in the prior phase-orientation audit is comparison-only. It must not imply qualified selection, a validated diameter, or a transferable 30–50 rpm operating guarantee (`deliverables/phase-orientation-audit/report.md:108-115`).
* Before reverse results can control a scientifically qualified or release decision, add a separate positive qualification/release gate and close or formally approve each evidence requirement in §10. This recommendation does not revoke the existing approved preliminary-screening policy.

## 2. Actual phase/property authority

Stage 1 projects saved values without reconstructing properties: RRBO and wet-solvent flow, density, viscosity, interfacial tension, temperature, and phase configuration (`server/ecr-pre-pilot/stage1.ts:157-206`). In the audited reverse assignment:

* continuous phase = RRBO;
* dispersed phase = wet NMP;
* intended continuous flow is upward and dispersed flow downward;
* `κ = μd/μc`, so reversal materially inverts the viscosity ratio;
* `Δρ = ρc - ρd` is negative when wet NMP is denser.

The prior persisted-basis audit records 40 °C values of `ρc=869 kg/m³`, `μc=0.0598 Pa·s`, `ρd=1015 kg/m³`, `μd=0.001416 Pa·s`, `σ=0.011 N/m`, with `κ=0.0236789` and `Δρ=-146 kg/m³` (`research/rrbo-stage3-current-basis-audit.md:41-88`). These are prior evidence only; this audit did not query the database or recalculate them.

The wet-NMP label is important. The Stage-1 flow conversion uses the saved wet-solvent density and solvent/oil mass ratio (`stage1.ts:174-205`). Qualification therefore requires properties for the actual wet-NMP composition and operating temperature, not neat-NMP substitutions or room-temperature defaults. The current basis provides bulk `ρ`, `μ`, and `σ`; it does not provide reverse-drop interfacial mobility, contamination, coalescence, drop distribution, or flooding data.

## 3. Equation-by-equation trace of the current reverse branch

### 3.1 Geometry, power, and preliminary `d32`

For each candidate `D`, RPM, and geometry ratios:

```text
Dr = (Dr/D) D
hc = (hc/D) D
N = RPM/60
A = πD²/4
P = Np ρc N³ Dr⁵
ψ = P/(A hc ρc)
d32 = C (σ/ρc)^0.6 ψ^-0.4
```

Implemented at `kuhni-geometry-resolver-v140.ts:277-300`; the optimizer supplies `Np=1.2` and `C=0.42` at `stage3-stage4-optimizer.ts:674-685`.

**Disposition:** calculable dimensional breakup sensitivity, not a qualified RRBO/wet-NMP Kühni drop law. The `σ^0.6 ρc^-0.6 ε^-0.4` form is a generic Hinze/Kolmogorov-type turbulent-breakup asymptote in conceptual provenance; the controlled record does not establish a specific original Hinze primary citation for this exact executable form and coefficient. It is **not K&H 1996**. The exact `C=0.36–0.43` interval has no verified authoritative Kühni source and is project-controlled preliminary (`.agents/memory/ecr2-direct-turbulence-c-range.md:6-20`; `docs/ecr2-kh1996-droplet-size-evidence-verification.md:23-40, 63-92`). Viscous RRBO operation can retain low-agitation, viscosity, coalescence, geometry, and population effects. The K&H 1996 equation remains unavailable/unverified, and the legacy reconstruction is transcription-invalid (`docs/ecr2-kh1996-droplet-size-evidence-verification.md:9-21, 225-243`).

### 3.2 Signed terminal force balance

The code uses:

```text
Δρ = ρc - ρd
Ar = ρc |Δρ| g d32³ / μc²
Cd(Re,κ,0) Re² = 4 Ar/3
|w| = Re μc/(ρc d32)
w = sign(Δρ)|w|
0 = Δρ Vg - 0.5 ρc Cd Ap |w|w
```

with:

```text
Cd = 8(2+3κ+3λ)/[Re(1+κ+λ)] (1+0.15 Re^0.687), λ=0
κ = μd/μc
```

Implemented at `kuhni-geometry-resolver-v140.ts:188-261`.

**Intrinsic versus orientation-specific:**

* The vector force balance and positive drag magnitude are intrinsic.
* Using `|Δρ|` to solve speed magnitude is valid because the code restores `sign(Δρ)` to `w`.
* `Re`, `Eo`, and `Mo` are magnitude groups; their positivity does not convert a falling drop into a validated rising-drop experiment.
* The Myint scalar relation is empirical and source-bounded. The retained primary evidence covers rising isolated drops and states `0.1 < κ < 100`; the reverse persisted state is below that lower bound. Unknown interface contamination and deformation remain separate gates (`research/rrbo-low-kappa-terminal-audit.md:165-218`).

Therefore the force-balance implementation is not invalid merely because it uses an absolute density magnitude. The **substitution becomes invalid as qualification** when that magnitude is used to erase the falling direction, invert phase properties, or imply that rising-drop evidence automatically covers the falling low-κ state.

### 3.3 Shape relation

The code evaluates:

```text
Ta = Re Mo^0.23
E = 1 - 0.0487 Ta - 0.0289 Ta²
```

at `kuhni-geometry-resolver-v140.ts:239-255`, with source-range diagnostics at `:379-384`.

**Disposition:** secondary use of a primary Myint clean-drop fit, but reverse RRBO/wet-NMP applicability is unqualified. Passing `0<E<=1` is only numerical/shape plausibility. It does not establish clean-interface behavior, fore/aft symmetry, or low-κ falling-drop applicability.

### 3.4 Garthe characteristic velocity

The implemented factor is:

```text
NP,source = 1.08 + 10.94/ReR^0.5 + 257.37/ReR^1.5
vchar = vt [
  1 - 1.669 NP,source^-3.945
    - 2.807(d32/(D-Dr))^1.336
    - 1.159(hc/D)^2.049
    + 2.1 φs^1.032
]
```

at `kuhni-geometry-resolver-v140.ts:310-327`.

**Primary verification:** visually inspected retained Garthe equation evidence confirms Eq. 5.6 and the `ReR^0.5` and `ReR^1.5` terms in Eq. 5.7; the source envelope is pilot scale and low-viscosity liquid systems, not RRBO/wet NMP (`research/rrbo-stage3-kuhni-scale-up-qualification.md:134-168, 190-199`). Garthe explicitly requires preliminary tests for reliable dimensioning (`.agents/outputs/garthe-2005-review/garthe-evidence-audit.md:1-10`).

**Disposition:** correct retained equation structure, but empirical reverse transfer and scale-up are unqualified. The current fixed engineering `Np=1.2` used for power is separate from Garthe's source diagnostic `NP,source`; the code does keep them separate.

### 3.5 Hindered/swarm velocity and exponent 4.65

The implicit closure is:

```text
vs(h) = vchar sqrt[(Cd(Rechar)/Cd(Res)) (1-h)^4.65]
Res = ρc vs d32/μc
```

at `kuhni-geometry-resolver-v140.ts:327-337`.

The retained, visually inspected primary Garthe printed p.126 Eq. 8.3 shows the square root over the **complete** drag-ratio × `(1-hd)^4.65` product. Thus the code's grouping is correct; there is no missing-radical transcription defect.

The fixed `4.65` comes from the drag/swarm hindrance relation discussed by Garthe/Stichlmair, connected to Richardson–Zaki-style hindrance and rigid-sphere behavior. With the whole factor under the radical, the asymptotic constant-drag dependence is `(1-h)^2.325`, not `(1-h)^4.65` in velocity. Garthe's own page states that terminal and characteristic velocities must be known and discusses differences between rigid spheres and drops. This is not a universal liquid-drop exponent and not reverse RRBO/NMP evidence.

**Disposition:** source-faithful equation form; model applicability unqualified. Reusing the same Myint `Cd(Re)` at terminal, forced characteristic, and swarm states is an additional composite-model assumption, not established by terminal-drop validation.

### 3.6 Flood holdup and flood capacity

For flow ratio `r=Qd/Qc`, the code constructs:

```text
jT(h) = (1+r) vs(h) / [r/h + 1/(1-h)]
h_flood = arg max(0<h<1) jT(h)
Uflood = max jT(h)
```

at `kuhni-geometry-resolver-v140.ts:339-345`.

This follows countercurrent continuity if the available slip function `vs(h)` is valid. It is a reproducible turning point of the assumed closure, but it is **not independently observed flooding**. It does not itself establish the stable operating branch, entrainment onset, phase inversion, distributor/collector behavior, or interface-control limits.

### 3.7 Loading, operating `φ`, and flood `φ`

The reverse trial calculates:

```text
actualLoading = (Qc+Qd)/(A Uflood)
designFloodFraction = 0.7
```

at `kuhni-geometry-resolver-v140.ts:386-410`.

Important terminology:

* Reverse `holdup` passed into optimizer candidates is `record.floodHoldup`, not a separately solved operating holdup (`stage3-stage4-optimizer.ts:643-644`).
* The ordinary branch's `holdup` comes from K&H 1995 operating `φ` (`stage3-stage4-optimizer.ts:551-584`; `kuhni-hydrodynamics.ts:117-140`).
* K&H 1995's operating holdup and the Garthe turning-point `floodHoldup` are different quantities and source chains.
* In the reverse candidate, `a=6 h_flood/d32` is therefore interfacial area at the modeled turning point, not demonstrated operating interfacial area (`stage3-stage4-optimizer.ts:643-645`).

This semantic substitution is scientifically consequential. A reverse candidate at `actualLoading < 0.7` should not report the turning-point holdup as its operating `φ`; the operating holdup would require solving the lower stable branch at the actual superficial flows using a qualified `vs(h)`, and possibly checking multiple roots/hysteresis.

### 3.8 RPM feasibility and diameter selection

The optimizer labels reverse trials `FEASIBLE` when numerical state, force residual, tip speed, and `actualLoading <= 0.7` pass (`stage3-stage4-optimizer.ts:606-657`). It then creates contiguous RPM windows from those flags and ranks geometries (`:1119-1220`).

These are **search-feasible preliminary-screening flags**, not scientific qualification. That interpretation is intentional under the two-level project policy. The 20 rpm minimum window is only a ranking preference (`:1249-1281`), and the current selector chooses the second-smallest distinct adequate diameter as a design margin (`:1038-1088`). Neither ranking step supplies missing hydrodynamic evidence.

## 4. K&H 1995 operating-holdup source: verified but not a reverse closure

The visually inspected primary paper, Kumar & Hartland (1995), pp.3929–3931:

* Eq. 9 defines energy dissipation per unit mass as `ε=P/(Ac H ρc)`.
* Eqs. 15–19 define `φ=ΠΦΨΓ`.
* Table 2 gives the Kühni constants `CΠ=2.67×10^-2`, `CΨ=1` for no transfer / c→d and `0.56` for d→c, `CΓ=2.27`, and exponents `(0.77,0.64,20.7,-0.34,0,-0.77,0)`.
* Eq. 17 visibly contains `exp(20.7 Vc θ)`.

Those facts are primary verified. But they do not qualify the reverse optimizer because:

1. The reverse optimizer does not use the K&H operating-φ equation; it substitutes modeled flood holdup into candidate `holdup`.
2. The K&H dataset and correlation are direction/system specific; the current reverse multicomponent transfer direction has no automatically valid single `CΨ`.
3. Prior audit found the project operating point outside published Kühni ranges in flows, geometry, and dispersed viscosity (`.agents/memory/kh1995-primary-holdup-evidence.md:6-18`).
4. K&H supplies no generic flooding percentage; the ordinary hydrodynamics code explicitly says so (`kuhni-hydrodynamics.ts:176-182`).

## 5. Correlation/source-domain matrix

| Link/source | Primary/source domain actually stated | Current reverse relationship | Screening disposition / unresolved boundary |
|---|---|---|---|
| Signed force balance | Analytical; no empirical range | Direction retained with `Δρ=ρc-ρd`; magnitude uses `|Δρ|` | Intrinsically usable as sign/magnitude physics; does not qualify drop/population closure |
| K&H 1995 operating holdup | Kühni Table 1: water continuous; dispersed o-xylene, cumene, n-butanol, MIBK, butyl acetate, kerosene; `ρc=994–1003`, `ρd=801–882 kg/m³`; `μc=0.97–1.61`, `μd=0.66–3.92 mPa·s`; `σ=0.8–34.1 mN/m`; `D=72–200`, `Dr=50–85`, `H=50–90 mm`; `H/D=0.45–0.69`, `Dr/D=0.43–0.69`, free area `0.16–1.00`; `Vc=0.2–7.9`, `Vd=0.1–8.8 mm/s`; `R=0.09–5`; `N=0–5 s⁻¹`; `ε=0–0.83 W/kg`; `d32=0.35–8.49 mm`; `φ=0.010–0.542`; `Vslip=2.3–126 mm/s` (primary p.3927 Table 1). Eqs. 9, 15–19/Table 2 verified; DOI [10.1021/ie00038a032](https://doi.org/10.1021/ie00038a032) | Reverse optimizer does not use this operating-φ equation | No automatic multicomponent `CΨ`; current fluids/orientation/geometry/flows are not source-domain qualification |
| Direct-turbulence `d32` | Generic Hinze/Kolmogorov-type asymptotic provenance only; no controlled primary source establishes this exact executable coefficient interval | `C(σ/ρc)^0.6ψ^-0.4`, `C=0.42`; project interval `0.36–0.43` | Approved preliminary sensitivity; **not K&H 1996**, not literature-verified Kühni range, not release evidence |
| K&H 1996 `d32` | Bibliographic publisher record: eight extraction-column types including Kühni; DOI [10.1021/ie950674w](https://doi.org/10.1021/ie950674w) | Not executed as the current direct-turbulence equation | Exact primary equation/table/symbols/ranges unavailable; transcription-invalid route remains blocked |
| Myint 2006 terminal drag | Rising single drops in stagnant infinite liquids; `-11.6<log10 Mo<-0.9`, `0.17<Re<200`, `0.017<Eo<12.1`, `0.1<κ<100`; ≈10% maximum terminal-velocity error only over that set; DOI [10.1299/jfst.1.72](https://doi.org/10.1299/jfst.1.72) | Reverse prior state `κ≈0.02368`; clean-interface continuation; also reused at characteristic/swarm Re | Algebraically calculable; below κ range, falling/interface state unknown, and forced/slip reuse not source-qualified |
| Myint 2007 shape | Rising clean-drop fit: `-11.6≤log10 Mo≤-0.9`, `0.015≤Re≤850`, `0.017≤Eo≤9.3`, `0.0074≤Ta≤3.6`, `0.1≤κ≤100`; DOI [10.1299/jfst.2.184](https://doi.org/10.1299/jfst.2.184) | Prior reverse state lies inside reported scalar groups except `κ<0.1` | Low-κ falling fore/aft and contamination behavior unresolved |
| Garthe characteristic velocity | Printed p.86 Eqs. 5.6–5.7; Figure 5.20: 143 Kühni points, 10.7% relative error; `D=72–152`, agitator `41–85`, stator `47.5–83.2 mm`, `n=50–250 rpm`, drop `0.9–6.4 mm` | Current geometry/RPM may exceed or fall outside source apparatus; reverse chemistry/orientation differs | Equation transcription verified; scale/fluid/orientation transfer remains extrapolated |
| Garthe comparison corpus cited for current-root audit | Reported `D=80–152`, `h=50–72`, `n=28–220 rpm`, agitator `45–85 mm`; ≈23.5% average deviation for conventional liquids; swarm fit concern above `d32≈4.5 mm` in rotating-disc evidence | Prior reverse root `D=693`, `h=346.5 mm`, `n=25 rpm`, `d32=4.746 mm` | Strong geometry/speed/population extrapolation; corpus values are evidence bounds, not commercial limits |
| Garthe swarm relation | Printed p.126 Eq. 8.3; radical covers `[Cd(Reo)/Cd(Res)](1-h)^4.65` | Current code applies Myint drag at characteristic/swarm states | Equation grouping verified; no independent reverse RRBO/NMP swarm domain stated |
| Perry geometry guidance | `Dr/D=0.33–0.50`, `hc/D=0.20–0.30`, stator free area `0.20–0.40`; minimum 60 mm pilot maps to targets up to 1 m; 150 mm pilot for larger targets | Current optimizer grid matches ratio guidance | Recommendation supports bounded screening geometry, not correlation/fluid qualification |
| Sulzer ECR guidance | Product diameter `30 mm–3.5 m`; typical industrial speed revision-dependent `10–70` or `10–100 rpm`; 32/60/150 mm pilot columns; pilot trials precede design | Current `D≤1.5 m`, `30–70 rpm` is inside product/speed envelope | Vendor product range is not universal correlation validity |
| Flooding construction | No separate experimental source domain; mathematical maximum of assumed `vs(h)` | Interior maximum and loading are reproducible | Preliminary model capacity only; stable branch, entrainment, inversion, observed flooding, uncertainty unresolved |
| Shirvani flooding | Primary standard-system Kühni study retained | Not independent reverse RRBO/NMP validation | Do not transplant as reverse qualification |
| Rode et al. 2013 | Publisher preview says heavy or light dispersion is possible in a Kühni-type column; DOI [10.1016/j.ces.2013.03.059](https://doi.org/10.1016/j.ces.2013.03.059) | Supports physical possibility of either orientation | Full equation replay, RRBO/NMP closure, and control/ports remain unavailable |
| Barry–Parlange | Conditional spherical, steady, non-wobbling all-viscosity-ratio drag, Eq. 10 p.4/10; DOI [10.1371/journal.pone.0194907](https://doi.org/10.1371/journal.pone.0194907) | Possible low-κ comparator | Present shape gate not established; no population, characteristic/swarm, or flooding closure |

No literature validation is inferred where the primary equation was unavailable. In particular, K&H 1996 remains unverified for executable use, Rode remains a positive orientation lead rather than a closure, and agreement between two extrapolated models is not independent validation.

## 6. Why the branch is currently unqualified—exact classification

### Missing qualification data/evidence

* Actual-temperature RRBO/wet-NMP drop-size distribution versus RPM, geometry, throughput, composition, and transfer direction.
* Breakup/coalescence and representative-population mapping from `d32` to hydraulic slip.
* Falling low-κ drop interface mobility/contamination and deformation evidence.
* A terminal/forced-slip `Cd(Re)` or separate characteristic relation valid at terminal, characteristic, and swarm states.
* Reverse holdup curve, lower stable branch, hysteresis, phase inversion, entrainment, and observed flooding.
* Distributor, collector/coalescer, top dispersion interface, bottom disengagement, level control, start-up/shutdown, and port-direction qualification.
* Actual vendor geometry/power/torque/tip-speed limits and an approved scale-up law.

### Screening admission versus scientific qualification

The current optimizer recognizes the scientific limitations but intentionally does not make evidence status an execution gate for approved preliminary screening. `sourceDiagnostics` are not consulted when assigning numerical `FEASIBLE`; selected reverse results may get empty top-level blockers and a Stage-4 screening geometry payload. Stage 4 validates geometry/lineage and labels its output screening; it does not claim to be the missing empirical qualification. The unresolved issue for this audit's stronger scientific objective is not proof of a violated implementation contract, but the absence of a separate positive qualification/release field and the risk that generic words such as `FEASIBLE`, `SELECTED`, `hydraulicPass`, and empty `blockers` are misread outside their screening scope.

### Model-not-applicable versus merely out-of-range

* **Not automatically invalid:** signed buoyancy; magnitude dimensionless groups; countercurrent continuity; a turning-point construction if a valid `vs(h)` exists.
* **Out-of-range empirical use:** Myint at low κ/falling unknown interface; Garthe geometry/fluid/orientation transfer; current direct-turbulence coefficient and industrial scale-up.
* **Not established as the required model:** one `d32` used as a representative single drop; terminal drag reused for forced characteristic/swarm slip; model maximum called flooding without branch/inversion/entrainment qualification.

Thus the correct status is not blanket “no data” and not “reversal invalid.” It is: **analytical direction closure available; intentionally admitted preliminary numerical extrapolation available; empirical full-chain qualification absent; current fields express screening admission and must not be represented as scientific qualification or release eligibility.**

## 7. Caller and two-level admission audit

| Path | Current behavior | Audit finding |
|---|---|---|
| Historical V1.4 resolver | Reverse roots excluded from governed hydraulic envelope (`v140.ts:486-623`) | Partial diagnostic policy |
| Historical V1.5 resolver/presentation | Illustrative extrapolated root; separately rechecked and admitted HETS-only, non-governed (`v150.ts:625-702`; presentation `:198-355`) | Explicit two-level policy |
| Current optimizer trial adapter | Warnings copied to `sourceDiagnostics`; numerical checks alone set `FEASIBLE` (`stage3-stage4-optimizer.ts:598-662`) | Intentional preliminary-screening admission; not a scientific qualification verdict |
| Window builder | Uses all `FEASIBLE` trials (`:1119-1171`) | Intentional screening selection; not correlation qualification |
| Orientation selection | Stage-1 orientation is authoritative; comparison cannot replace it (`:1371-1395`) | Correct anti-swap rule; a reverse current orientation may be selected for preliminary screening |
| Result metadata | Selected reverse can emit optimized status, selected geometry, empty blockers, plus explicit screening/extrapolation classification (`:1400-1513`) | Contract-consistent for screening; ambiguous if consumed as scientific qualification |
| Persistence API | Persists immutable preliminary optimizer result (`server/ecr-pre-pilot-service.ts:486-538`) | Lineage authority, not scientific validation |
| Replay | Recomputes current optimizer by version (`server/ecr-pre-pilot-service.ts:688-709`) | Reproducibility/integrity, not scientific validity |
| Stage 4 | Checks current hash, ranges, RPM, lineage and emits screening classifications (`stage4-pre-pilot-sizing-service.ts:254-430`) | Intentional assumption-based pre-pilot admission for both orientations; no scientific release gate |
| HETS presentation qualifier | Explicitly labels V1.5 root non-governed and HETS-only (`kuhni-stage3-presentation.ts:302-355`) | Narrow safe path exists, but current optimized geometry path does not depend on it |
| HETS admission parameter | `stage3PrePilotHetsAdmission` is accepted but not used to gate current optimizer geometry (`stage4-pre-pilot-sizing-service.ts:236-244, 264-292`) | Current optimizer has its own approved screening path; this parameter is not evidence of a missing implementation requirement |

The 1.3 m alternative in the prior audit is safe only while explicitly labeled comparison-only. The metadata name `FEASIBLE_COMPARISON` means a numerical comparison in current code; it must not be read as scientific qualification.

## 8. Defensible current use

The model can defensibly calculate and report:

* selected Stage-1 phase identities and operating-temperature bulk properties;
* signed density difference, buoyancy direction, and proposed countercurrent velocity convention;
* power and `ψ` under explicitly stated geometry and `Np` assumptions;
* preliminary direct-turbulence `d32` sensitivity;
* extrapolated Myint terminal/shape diagnostics with every range warning;
* extrapolated Garthe characteristic/swarm quantities;
* the interior maximum and loading of that **assumed** closure;
* bounded search behavior, numerical failures, comparison candidates, and—under the approved two-level policy—a selected preliminary screening diameter/RPM window and assumption-based Stage-4 screening geometry.

At the **scientific-qualification or release level**, it cannot presently authorize:

* operating reverse holdup or operating interfacial area;
* a qualified flooding holdup/velocity;
* a pilot-validated or correlation-qualified diameter/RPM window;
* scientifically qualified Stage-4 geometry/height or final mechanical sizing;
* vendor or commercial feasibility;
* separation performance, mass transfer, or outlet quality.

## 9. Controls required before screening is represented as scientific qualification

1. **Separate flags:** persist `numericallyCalculable`, `screeningFeasible`, `scientificallyQualified`, and `releaseEligible` independently. Never derive scientific qualification from `status === FEASIBLE`.
2. **Preserve approved screening while gating stronger claims:** reverse evidence codes need not universally block the approved preliminary optimizer, but they must block any future `SCIENTIFICALLY_QUALIFIED`, pilot-validated, or release-eligible classification unless a positive versioned qualification record closes them.
3. **Preserve diagnostic selection:** comparison-only geometry may be retained, but use labels such as `EXTRAPOLATED_COMPARISON_ROOT`, never `SELECTED` or `FEASIBLE_COMPARISON` without an explicit non-governing qualifier.
4. **Fix holdup semantics:** do not map `floodHoldup` into candidate operating `holdup`; separately solve and label operating lower-branch `φ` only after the reverse `vs(h)` relation is qualified.
5. **Gate qualified/release consumers independently:** require a positive scientific-admission object tied to equation version, property snapshot, orientation, source range, and approved qualification evidence. Do not retroactively impose this on the explicitly approved HETS screening consumer.
6. **Keep alternate orientation non-substituting:** retain the existing Stage-1 authority rule; do not “fix” reverse failure by silently selecting NMP-continuous operation.
7. **Retain warnings on all compacted/persisted views:** source diagnostics must survive API compaction and be visible beside every diameter/RPM comparison.

## 10. Exact evidence required to promote reverse diameter/RPM

Minimum modular requirements—an exact-fluid pilot is one valid route, but not the only conceivable route:

1. **`d32`/population qualification**
   * authoritative source or validated model for viscous RRBO continuous / wet-NMP dispersed breakup in Kühni-like agitation;
   * defined geometry/power scaling and coefficient uncertainty;
   * measured or validated full size distribution, breakup/coalescence, and `d32`-to-slip representation.
2. **Falling-drop drag/shape/interface**
   * explicit low-κ domain covering the actual property state;
   * interface mobility/contamination and transfer-direction treatment;
   * shape/deformation/wobble gate with uncertainty.
3. **Characteristic and swarm motion**
   * validation of `Cd(Re)` at terminal, forced characteristic, and every swarm state, or a separately validated agitated-column slip closure;
   * wall, rotor, stator, circulation, and holdup effects;
   * independent reverse-orientation data or validated multiphase model—not agreement between two dependent extrapolations.
4. **Operating holdup and flooding**
   * actual-flow lower stable branch, multiplicity/hysteresis assessment;
   * observed or independently validated flooding, entrainment, phase inversion, and disengagement limits;
   * uncertainty and an approved design margin, not only a fixed 0.7 convention.
5. **Hardware/operation**
   * verified RRBO-up/NMP-down distributors, collection/coalescence, interface location/control, ports, start-up/shutdown;
   * vendor geometry, power, torque, shaft/seal, RPM, and tip-speed limits;
   * approved scale-up rule and applicable range.
6. **Governance**
   * versioned qualification record tied to Stage-1 property/composition/temperature bounds;
   * independent review approval;
   * regression tests proving preliminary reverse results cannot be presented as scientifically qualified or release-eligible, while retaining expressly approved Stage-4 preliminary screening.

## 11. Final answer

RRBO-continuous / wet-NMP-dispersed operation is **not disproved by density direction**. The code's signed force balance correctly distinguishes a negative `Δρ` from positive buoyancy/drag magnitudes, and its proposed RRBO-up/NMP-down kinematics are internally coherent. The complete hydraulic authority chain is nevertheless unqualified because the current `d32`, low-κ terminal/shape, characteristic, swarm, operating-holdup, and flooding links have not been independently established for this service.

The current optimizer intentionally converts numerically acceptable reverse extrapolations into preliminary `FEASIBLE` screening trials and may emit selected geometry with no numerical blockers. Stage 4 intentionally carries that geometry into assumption-based pre-pilot screening; its labels and project policy expressly deny separation qualification and final-design claims. This audit therefore does **not** classify that behavior as a demonstrated code-admission bug or demand universal fail-closed behavior. It finds instead that the complete empirical chain remains scientifically unqualified, no positive scientific-release gate exists, and current generic status words must not be promoted beyond their screening level. Independently, the concrete mapping of `floodHoldup` into the candidate `holdup`/interfacial-area field is a semantic/model mismatch that should be corrected or relabeled. The existing 1.3 m comparison remains preliminary comparison evidence—not scientifically qualified selection.
