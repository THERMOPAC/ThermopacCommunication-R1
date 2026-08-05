# Engineering Correlation Register — Design Software

**CEL Level 1: v1.0.0 · EPD Level 1: v1.0.0** (versions exported from `common-engineering-library.ts`; calculation runs must record them)

Governance: no equation may be implemented without an entry here (identifier, formula, coefficients, units, valid range, exact reference, implementation file, validation benchmarks, classification). Source types are the controlled vocabulary `Measured | Vendor | Literature | Assumed`.

## 1. Dimensionless numbers — `cel/dimensionless.ts` (all Generic)

| ID | Formula | Inputs (units) → Output | Valid range | Reference | Benchmarks |
|---|---|---|---|---|---|
| DIM-RE-001 | Re = ρ·u·L/μ | kg/m³, m/s, m, Pa·s → – | universal | standard definition | ρ=997, u=1, L=0.05, μ=8.9e-4 → 56011.2 |
| DIM-WE-001 | We = ρ·u²·L/σ | kg/m³, m/s, m, N/m → – | universal | standard definition | ρ=997, u=0.5, L=0.002, σ=0.025 → 19.94 |
| DIM-FR-001 | Fr = u/√(g·L) | m/s, m → – | universal | standard definition | u=1, L=0.1 → 1.00981 |
| DIM-FR-002 | Fr² = u²/(g·L) | m/s, m → – | universal | standard definition | = DIM-FR-001² |
| DIM-FR-003 | Fr_rot = N²·D/g | rev/s, m → – | rotating equipment | standard definition | N=2, D=0.3 → 0.12237 |
| DIM-EO-001 | Eo = Δρ·g·d²/σ | kg/m³, m, N/m → – | universal | standard definition (Bond) | Δρ=85, d=0.003, σ=0.025 → 0.30008 |
| DIM-MO-001 | Mo = g·μc⁴·Δρ/(ρc²·σ³) | Pa·s, kg/m³, kg/m³, N/m → – | universal | standard definition (Grace diagram group) | μc=1e-3, Δρ=100, ρc=1000, σ=0.03 → 3.632e-11 |

Eo/Mo are pure definitions — no drop-shape or liquid-drop drag correlation is implemented or claimed.

## 2. Drag & terminal velocity — `cel/hydraulics.ts` (Generic, rigid sphere)

| ID | Formula | Regime | Valid range | Reference | Benchmarks |
|---|---|---|---|---|---|
| HYD-CD-001 | Cd = 24/Re | Stokes | Re < 0.1 | Stokes (1851) | Re=0.01 → 2400 |
| HYD-CD-002 | Cd = (24/Re)(1 + 0.15·Re^0.687) | intermediate | 0.1 ≤ Re < 1000 | Schiller & Naumann, Z. Ver. Dtsch. Ing. 77 (1933) | Re=100 → 1.09173 |
| HYD-CD-003 | Cd = 0.44 | Newton | 10³ ≤ Re ≤ 2×10⁵ (warns beyond — drag crisis) | standard | Re=5000 → 0.44 |
| HYD-UT-001 | u_t = √(4·g·d·\|Δρ\|/(3·Cd·ρc)), Cd = f(Re(u_t)), damped fixed-point iteration | **Rigid-Sphere Terminal-Velocity SCREENING only** | per Cd pieces | Clift, Grace & Weber, *Bubbles, Drops and Particles* (1978), rigid-sphere baseline | d=1 mm, ρd=912, ρc=997, μc=8.9e-4 → 22.06 mm/s (Re=24.7). Every result carries `RIGID_SPHERE_SCREENING` warning: real drops may deform/circulate/oscillate/have immobilized interfaces — NOT a validated liquid-drop velocity |

## 3. Column hydraulic utilities — `cel/hydraulics.ts` (Generic math — no technology claim)

| ID | Formula | Inputs → Output | Reference | Benchmarks |
|---|---|---|---|---|
| HYD-GEO-001 | A = π·D²/4 | m → m² | geometry | D=1 → 0.785398 |
| HYD-USF-001 | u = Q/A | m³/s, m² → m/s | definition | Q=0.01, A=0.785398 → 0.0127324 |
| HYD-IA-001 | a = 6·φ/d₃₂ | –, m → m²/m³ | Sauter-mean definition | φ=0.1, d₃₂=2 mm → 300 |
| HYD-SLIP-001 | u_slip = u_d/φ + u_c/(1−φ) | m/s, m/s, – → m/s | counter-current kinematic identity | u_d=0.005, u_c=0.01, φ=0.2 → 0.0375 |
| HYD-HOLD-001 | `solveCounterCurrentHoldup`: roots of u_d/φ + u_c/(1−φ) = slipFn(φ); slipFn **engine-supplied** | scan + bisection over bounded φ ∈ (0,1); returns ALL roots | numerical utility | slipFn = 0.05(1−φ), u_d=u_c=0.004 → root satisfies balance to <1e-6; no-root case warns `NO_HOLDUP_SOLUTION` |
| HYD-FMAX-001 | `maximizeThroughputAtFixedFlowRatio`: max of **engine-supplied** u_d(φ) over bounded φ, golden-section | result binds flow-ratio definition `R = u_c/u_d`, R value, holdup bounds; NOT an ECP/ECR flooding correlation | numerical utility | test function u_d(φ)=u₀φ(1−φ)²/((1−φ)+Rφ), R=1 → analytic φ*=1/3, u_d*=4u₀/27 ✓ |
| HYD-PCT-001 | % of maximum = (u_d+u_c)/(u_d*+u_c*)·100, valid ONLY at the bound flow ratio | off-ratio comparison throws (override → `FLOW_RATIO_MISMATCH` warning); 40–80 % design-practice window warnings | numerical utility | matching ratio ✓; off-ratio rejection ✓ |

## 4. Property database — `epd/` (classification: Property)

### Water — LIBRARY fluid, `epd/fluids/water.ts`

| ID | Property | Formula & coefficients | Equation units | Valid range | Exact reference | Benchmarks |
|---|---|---|---|---|---|---|
| EPD-W-RHO-001 | density | Kell exact rational: ρ = (999.83952 + 16.945176·T − 7.9870401e-3·T² − 46.170461e-6·T³ + 105.56302e-9·T⁴ − 280.54253e-12·T⁵)/(1 + **16.879850e-3**·T) | T °C → kg/m³, 1 atm | 0–150 °C | G. S. Kell, "Density, Thermal Expansivity, and Compressibility of Liquid Water from 0° to 150 °C", *J. Chem. Eng. Data* 20(1), 1975 | 999.972 @3.98 °C; 998.204 @20; 997.045 @25; 971.798 @80; 958.364 @100. Denominator coefficient verified 16.879850e-3 (the transcription variant 16.897850e-3 gives 996.73 @25 °C and fails all five benchmarks) |
| EPD-W-MU-001 | dynamic viscosity | Vogel: ln μ[mPa·s] = −3.7188 + 578.919/(T[K] − 137.546) | T K → mPa·s (stored as Pa·s) | 0–100 °C | D. S. Viswanath & G. Natarajan, *Data Book on the Viscosity of Liquids*, Hemisphere Publishing, 1989 | 0.892 mPa·s @25 °C; 0.356 @80 °C |
| EPD-W-SIG-001 | surface tension | IAPWS: σ = 235.8e-3·τ^1.256·(1 − 0.625·τ), τ = 1 − T[K]/647.096 | T K → N/m | 0.01–100 °C (Level 1 restriction of triple-point-to-critical validity) | IAPWS R1-76(2014), "Revised Release on Surface Tension of Ordinary Water Substance", 2014 — official formulation, no polynomial substitute | 71.97 mN/m @25 °C; 58.91 @100 °C |

Water cp/k are NOT implemented in Level 1 (out of LLX screening scope; calling them throws).

### NMP — LIBRARY fluid, source-tagged TABULAR (no fitted correlation approved), `epd/fluids/nmp.ts`

| ID | Property | Data points (linear interpolation, T °C) | Valid range | Benchmarks |
|---|---|---|---|---|
| EPD-N-RHO-001 | density | 25 °C: 1028 kg/m³ — **Literature**, CRC Handbook of Chemistry and Physics, 97th ed., CRC Press (2016); 80 °C: 977 kg/m³ — **Assumed**, provisional | 20–80 °C | exact table values; Assumed point warns on every use |
| EPD-N-MU-001 | dynamic viscosity | 25 °C: 1.666 mPa·s — **Literature**, CRC 97th ed. (2016); 80 °C: 0.75 mPa·s — **Assumed**, provisional. Linear interpolation over-estimates vs true exponential trend — screening only | 20–80 °C | exact table values; Assumed warns |
| EPD-N-SIG-001 | surface tension (pure NMP vs air — NOT interfacial tension vs RRBO) | 25 °C: 40.7 mN/m — **Literature**, J. J. Jasper, "The Surface Tension of Pure Liquid Compounds", *J. Phys. Chem. Ref. Data* 1 (1972); 80 °C: 35.2 mN/m — **Assumed**, provisional | 20–80 °C | exact table values; Assumed warns |

Provisional (Assumed) points: every use emits `EPD_ASSUMED_VALUE`; `containsAssumedData()` (`epd/database.ts`) is the hook design-validation (workspace Step 12) must use — results carrying assumed data must NOT satisfy mandatory validation checks, and a design using them cannot be marked fully validated.

### RRBO (Re-Refined Base Oil) — PROJECT fluid, `epd/types.ts` + `epd/database.ts`

No library correlations exist or may be added. Engineer-entered per property: value, unit (SI-validated), reference temperature, sourceType (controlled vocabulary), mandatory sourceReference, optional valid range, optional explicit linear temperature coefficient with its own provenance. RRBO/NMP and RRBO/water interfacial tension are project-specific source-tagged inputs on the project fluid (`getInterfacialTension`); pure-component surface tension is never used as a substitute.

## 5. Numerical methods — `cel/numerical.ts` (Generic utilities)

| ID | Method | Guarantees | Benchmarks |
|---|---|---|---|
| NUM-BIS-001 | Bisection | requires sign-change bracket; returns root, iterations, converged, residual | √2 on [0,2] to 1e-10 |
| NUM-NEW-001 | Newton-Raphson | convergence requires small step AND \|residual\| ≤ tol; vanishing derivative → controlled failure or explicit bracketed bisection fallback; never returns last iterate as success | √2; bogus-derivative case reports converged=false; fallback case flagged in `method` |
| NUM-INT-001 | Linear interpolation | strictly increasing table; extrapolation opt-in only | midpoint exact |
| NUM-GSM-001 | Golden-section maximize | rejects NaN/±Inf objective values; returns x, fx, iterations, converged | max of −(x−3)²+7 at x=3 |

## 6. Unit conversion — `cel/unit-conversion.ts`

SI-internal factor tables; dimensionally incompatible conversions throw; temperature via offset arithmetic (never multiplicative), below-absolute-zero rejected. Tested LLX set: m³/h, L/h, kg/m³, g/cm³, Pa·s, mPa·s, cP, m²/s, cSt, Pa, kPa, bar, mbar, mmWC, N/m, mN/m, °C, K, m, mm, rpm, 1/s.

---

## 7. Stage C2 — LLX Process Design Engine (`server/engines/llx/llx-process-design-engine.ts`, engine `llx-process-design` v1.0.0)

Pseudo-components: Oil carrier / Extractable solute (aromatic fraction) / NMP solvent.
Result-item classifications: `Calculated Screening Result` / `Pending Validation` / `Not Calculable`. Run status: `screening_complete` / `pending_validation` / `calculation_blocked`. All items classification **Generic — technology-independent** (no ECP/ECR assumptions).

| ID | Name | Formula & rules | Units | Reference / basis | Benchmarks |
|---|---|---|---|---|---|
| PD-001 | Flow basis conversion | ṁ = Q·ρ(T); Q = ṁ/ρ(T) for feed and solvent (normal + maximum). ρ_NMP from EPD library; ρ_RRBO from mandatory source-tagged project-fluid entry (no default correlations) | kg/h, m³/h, kg/m³ | mass conservation identity | F = 5000 kg/h, ρ_RRBO = 895 kg/m³ (Measured) → 5.587 m³/h |
| PD-002 | Solvent-to-oil ratio | R_SO = normalSolventMassFlow / feedMassFlow. **Basis: normal NMP mass flow / total RRBO feed mass flow** (`ratioBasis: total_feed_mass`; future alternative `de_solvated_oil_carrier_mass` reserved, never mixed) | kg/kg | definition | S = 7500, F = 5000 → 1.5 |
| PD-003 | Solvent-flow consistency | relativeDifference = \|impliedRatio − enteredRatio\| / max(\|enteredRatio\|, 1e-12); reject > 0.001 (0.1 %). Stores entered flow, entered ratio, implied ratio, absolute & relative difference, acceptance tolerance | – | input governance | 7500 & 1.5 accepted; 7600 & 1.5 (1.33 %) → `calculation_blocked` |
| PD-004 | Design cases | maximumSolventMassFlow = maxCirculationFactor × normalSolventMassFlow. maxCirculationFactor is a design-case multiplier (required; warn outside 1.1–1.5). Normal and maximum continuous cases are **fully independent balances** with separate split inputs; reuse only via explicit `applyNormalSplitsToMaximumCase` ⇒ `CASE_SPLIT_ASSUMPTIONS_REUSED` + maximum case Pending Validation | kg/h | design practice | 1.2 × 7500 = 9000 |
| PD-005 | Phase configuration | Controlled inputs: `rrbo_continuous_nmp_dispersed` \| `nmp_continuous_rrbo_dispersed`. Continuity from engineer input ONLY; density gives buoyancy direction (lighter/heavier phase) and Δρ = \|ρ_NMP − ρ_RRBO\|. Δρ = 0 → Not Calculable; Δρ < 30 kg/m³ → `LOW_DENSITY_DIFFERENCE` | kg/m³ | governance rule | ρ_RRBO 895 vs ρ_NMP ≈ 1005 @60 °C → RRBO lighter; continuity honoured for both density orderings |
| PD-006 | Three-pseudo-component balance | oilCarrier = F(1−x_F); solute = F·x_F; soluteToExtract = r·F·x_F; soluteToRaffinate = (1−r)·F·x_F; nmpToRaffinate = s_L·S; nmpToExtract = (1−s_L)·S; oilToExtract = o_L·F(1−x_F); oilToRaffinate = (1−o_L)·F(1−x_F); R and E by summation; verify F + S = R + E with absolute & relative closure error. **No zero defaults**: any of x_F, r, s_L, o_L missing ⇒ only gross inlet balance F + S calculated; outlet split Pending Validation with named missing inputs. Zero loss only as explicit source-tagged entry, stored in the assumptions register | kg/h | screening mass balance | Approved hand calc: F=5000, S=7500, x_F=0.30, r=0.90, s_L=0.02, o_L=0.01 → R = 3465+150+150 = 3765; E = 35+1350+7350 = 8735; closure 0.0 kg/h. Max case (S=9000, splits reused): R=3795, E=10205 |
| PD-007 | Yield definitions | grossRaffinateToFeedRatio = R/F; grossExtractToFeedRatio = E/F; solventFreeRaffinateYield = (oilToRaffinate+soluteToRaffinate)/F; recoveredOilCarrierYield = oilToRaffinate/oilCarrierInFeed; extractedSoluteRecovery = soluteToExtract/soluteInFeed; solventRecoveryToExtract = nmpToExtract/S; nmpCarryoverToRaffinate = nmpToRaffinate/S. **Solvent-containing stream ratios are never presented as product yields** | – | definitions | 0.753 / 1.747 / 0.723 / 0.990 / 0.900 / 0.98 / 0.02 |
| PD-008 | Extraction factor (definition only) | **A** = m·S/F (symbol A — never E or ε, to avoid confusion with the extract stream). m = engineer-supplied, source-tagged equilibrium solute distribution ratio with mandatory metadata: numerator phase, denominator phase, concentration basis, temperature, sourceType, sourceReference. Incomplete basis or Assumed source ⇒ Pending Validation. **Never used to predict recovery in Stage C2** | – | definition (Treybal, *Mass-Transfer Operations*, 3rd ed., for the group definition) | m=1.8, S/F=1.5 → A=2.70 |
| ~~PD-009~~ | *Retired* | Kremser removed from Stage C2 (immiscibility, distribution ratio and solute-free basis unproven for NMP/RRBO). Reserved for a future equilibrium-analysis module after measured LLE data | – | — | — |
| PD-010 | Preliminary Stage-Equivalent Estimate | estimatedPhysicalStages = ceil(theoreticalStages / compartmentOrStageEfficiency). Labelled **Preliminary Stage-Equivalent Estimate** — NOT an ECP packing-stage or ECR compartment count (those engines compute their own active height/compartment count) | – | screening practice | ceil(6/0.60) = 10 |

Assumption register (stored in every result snapshot & calculation history): no accumulation; isothermal operation; negligible evaporation; complete phase disengagement; plus every explicit zero-loss entry (zero NMP loss to raffinate, zero oil loss to extract) and any case-split reuse. Every run records `celVersion`, `epdVersion`, `engineVersion`. Runs touching Assumed property or split data can never be `screening_complete`.

**Not implemented in Stage C2 (by direction):** Kremser recovery prediction, equilibrium-stage calculation from LLE data, ternary phase equilibrium, mutual-solubility prediction, common hydraulics, ECP sizing, ECR sizing.

**C2 validation suite:** `server/engine-framework/tests/c2-process-design.ts`.

---

## 8. Stage C3 — LLX Common Hydraulic Screening Engine (`server/engines/llx/llx-hydraulics-engine.ts`, engine `llx-hydraulics` v1.0.0)

**PRELIMINARY GENERIC HYDRAULIC SCREENING — NOT ECP OR ECR RATING.** All items classification **Generic — technology-independent**. Terminology: *Generic Hydraulic Throughput Maximum*, *Percentage of Generic Hydraulic Throughput Maximum*, *Generic Hydraulic Feasibility* — never "flooding percentage", ECP/ECR flooding, or vendor diameters.

| ID | Name | Formula & rules | Units | Reference / basis | Benchmarks |
|---|---|---|---|---|---|
| HYD-001 | Geometry & superficial velocities | A = π·D²/4; u = Q/A per phase per case. RRBO ρ and μ are mandatory source-tagged project-fluid entries (calculation-scoped context); NMP ρ, μ from the EPD library. Flow basis / solvent-consistency rules identical to PD-001/PD-003 | m², m/s | definitions | D = 1.0 m → A = 0.7854 m²; F = 5000 kg/h, ρ = 895 → u_RRBO = Q/A checked exactly in suite |
| HYD-002 | Phase-dependent velocity assignment | Engineer-selected configuration ONLY (continuity never from density): RRBO-continuous → u_c = u_RRBO, u_d = u_NMP; NMP-continuous → u_c = u_NMP, u_d = u_RRBO. Changing NMP circulation changes u_d in the first configuration and u_c in the second. Flow-ratio definition R = u_c/u_d and phase names stored in every result. Δρ ≈ 0 → blocked; Δρ < 30 kg/m³ → LOW_DENSITY_DIFFERENCE | – | governance rule | max case (×1.2) changes u_c only when NMP continuous, u_d only when RRBO continuous — both asserted in suite |
| HYD-003 | Droplet-size treatment | NO droplet-size prediction (technology-specific — deferred to ECP/ECR). Sauter mean d₃₂ is an optional engineer-supplied source-tagged input. Warning band is configurable and source-tagged; without a defensible reference it is labelled **User-defined screening range** (no citation invented). Assumed d₃₂ ⇒ Pending Validation | m | governance rule | d₃₂ = 8 mm outside user band [0.5, 5] mm → D32_OUTSIDE_SCREENING_BAND |
| HYD-004 | Rigid-sphere terminal-velocity screening | CEL terminalVelocitySphere (CEL-HYD force balance, piecewise Stokes/Schiller-Naumann/Newton Cd). Isolated-droplet SCREENING value only — every result carries RIGID_SPHERE_SCREENING. Independent of interfacial tension | m/s | Level 1 CEL register entries | 50 µm drop → Stokes regime, u_t = g·d²·Δρ/(18·μc) within 2 % |
| HYD-005 | Shape-regime indicators | Eo = Δρ·g·d²/σ, Mo = g·μc⁴·Δρ/(ρc²·σ³), We = ρc·u_t²·d/σ — indicators only, no drop-drag correlation applied. Require engineer-entered source-tagged NMP/RRBO interfacial tension. **Missing IFT ⇒ these items Not Calculable; it never blocks area, velocities, Δρ, terminal velocity, or holdup with an independent u_K.** Eo > 40 → EOTVOS_ABOVE_RIGID_SPHERE_RANGE | – | Level 1 CEL register entries | partial-calculation behaviour asserted in suite |
| HYD-006 | Generic slip model | u_slip(φ) = u_K·(1−φ)^n. u_K (characteristic swarm/slip velocity) and n (hindrance exponent) BOTH engineer-supplied source-tagged — no defaults; n = 1 permitted only as an explicit Assumed entry (ASSUMED_HINDRANCE_EXPONENT, Pending Validation) and is NOT presented as a universal LLE relationship. u_K ≠ terminal velocity: rigid-sphere u_t may be reused as provisional u_K only via explicit option (CHARACTERISTIC_VELOCITY_FROM_RIGID_SPHERE_SCREENING; all holdup/throughput Pending Validation). No u_K basis ⇒ holdup items Not Calculable, everything else proceeds | m/s | generic screening form; u_K and n require experimental/vendor validation | slip-balance residual at reported operating root < 1e-8 (suite) |
| HYD-007 | Counter-current holdup & root selection | CEL slip balance u_d/φ + u_c/(1−φ) = u_slip(φ) solved on CONFIGURABLE bounds (default φ ∈ [0.005, 0.60]; bounds stored in snapshot; upper bound > 0.60 flagged outside the model's moderate-holdup applicability). ALL roots returned and classified (lower operating candidate / upper approach-to-limit). Preliminary operating branch = lowest root below φ* only when inside bounds AND isolated from every other root by the configured tolerance (default 0.02, stored); otherwise AMBIGUOUS_HOLDUP_BRANCH + Pending Validation, no silent choice. Interfacial area a = 6·φ/d₃₂ ONLY from an established (non-ambiguous) operating holdup | – | screening practice | analytic: R = 1, n = 1 ⇒ φ* = 1/3, u_d* = 4·u_K/27 (asserted ≤ 1e-5) |
| HYD-008 | Generic throughput sensitivity & diameter sweep | u_d(φ) = u_K·(1−φ)^(n+1)·φ/((1−φ)+R·φ) maximized per case per diameter at THAT case's ratio (CEL golden-section; normal and maximum cases fully independent — no reuse of ratio or optimum). Percentage of Generic Hydraulic Throughput Maximum vs a CONFIGURABLE screening band (default 40–80 %, stored, explicitly "not a universal engineering rule"). Sweep returns CLASSIFICATIONS: hydraulically infeasible / above band / within band / below minimum loading band, plus minimum feasible diameter and screening-band diameter range. NO recommended diameter — selectedTrialDiameter is echoed only when engineer-chosen | %, m | screening practice | band change reclassifies diameters (suite); no-root diameter → hydraulically_infeasible + NO_HOLDUP_SOLUTION |

Applicability statement on every result: **PRELIMINARY GENERIC HYDRAULIC SCREENING — NOT ECP OR ECR RATING.** Limitations: no packing effect; no rotor/stator effect; no axial dispersion; no droplet breakup/coalescence model; no phase inversion model; no entrainment model; rigid-sphere screening limitations; u_K and n require experimental or vendor validation.

**Not implemented in Stage C3 (by direction):** ECP/ECR hydraulic rating, pressure drop, packing height, rotor sizing, technology-selection logic, droplet-size prediction.

**C3 validation suite:** `server/engine-framework/tests/c3-hydraulics.ts`.

---

**Deferred (throw `NotImplementedError`, never fabricate values):** schmidt, sherwood, lookupDiffusivity, pressureDropDarcyWeisbach, moodyFrictionFactor, overallMassTransferCoefficient, numberOfTransferUnits, nusseltDittusBoelter.

**Validation suite:** `server/engine-framework/tests/level1-validation.ts` (run `npx tsx server/engine-framework/tests/level1-validation.ts`).
