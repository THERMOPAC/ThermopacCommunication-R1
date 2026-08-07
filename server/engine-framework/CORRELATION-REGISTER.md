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
| HYD-008 | Generic throughput sensitivity & diameter sweep | u_d(φ) = u_K·(1−φ)^(n+1)·φ/((1−φ)+R·φ) maximized per case per diameter at THAT case's ratio (CEL golden-section; normal and maximum cases fully independent — no reuse of ratio or optimum). Percentage of Generic Hydraulic Throughput Maximum vs a CONFIGURABLE screening band (default 40–80 %, stored, explicitly "not a universal engineering rule"). Sweep returns CLASSIFICATIONS: hydraulically infeasible / above band / within band / below minimum loading band, plus minimum feasible diameter and screening-band diameter range. NO recommended diameter — selectedTrialDiameter is echoed only when engineer-chosen. Diameter basis: diameterSweep requires strictly 0 < min < max, step > 0; a single diameter must be given explicitly via diameterValues: [D] (never a degenerate min = max sweep) | %, m | screening practice | band change reclassifies diameters (suite); no-root diameter → hydraulically_infeasible + NO_HOLDUP_SOLUTION |

Applicability statement on every result: **PRELIMINARY GENERIC HYDRAULIC SCREENING — NOT ECP OR ECR RATING.** Limitations: no packing effect; no rotor/stator effect; no axial dispersion; no droplet breakup/coalescence model; no phase inversion model; no entrainment model; rigid-sphere screening limitations; u_K and n require experimental or vendor validation.

**Not implemented in Stage C3 (by direction):** ECP/ECR hydraulic rating, pressure drop, packing height, rotor sizing, technology-selection logic, droplet-size prediction.

**C3 validation suite:** `server/engine-framework/tests/c3-hydraulics.ts`.

---

## 9. Stage C4 — Common Packed-Column Engine, ECP-Type (`server/engines/llx/llx-ecp-engine.ts`, engine `llx-ecp` v1.0.0; Packing Database `server/engine-framework/packing/database.ts`; distributor modules `server/engine-framework/packing/distributors.ts`)

**PRELIMINARY ECP-TYPE PACKED COLUMN SCREENING — NOT VENDOR RATING AND NOT FOR FABRICATION.** Vendor neutral: the engine consumes only "Vendor Packing Capacity", "Vendor Pressure Drop", "Vendor Packing Performance" through the Packing Database schema — vendor identity is data, not code. The engine CONSUMES packing data; it never owns packing data. Performance data are curves (tabulated / polynomial with stated valid range) or constants with a stated applicability note; interpolation only — extrapolation is refused. HETS is SYSTEM data (value, unit, operating temperature, solvent, feed, packing, source) — never packing data alone. Rate-based placeholders (HTU, NTU, Ka, interfacial area) and dry pressure drop are reserved architecture, not calculated. The C3 generic-throughput percentage is neither an input nor reused as ECP utilization.

| ID | Name | Formula & rules | Classification behaviour |
|---|---|---|---|
| ECP-001 | Column loadings | A = π·D²/4; Q_i = m_i/ρ_i (RRBO ρ entered source-tagged via calculation-scoped context; NMP ρ from EPD at T); phase-specific loads L_c, L_d and total load L_tot = (Q_c+Q_d)/A in m³/(m²·h); flow ratio Q_d/Q_c stored. Normal and maximum cases fully independent | Always calculable once gated |
| ECP-002 | ECP hydraulic utilization | U = L_tot / (Vendor Packing Capacity × system derating factor) × 100 %. Capacity from the packing record only (curve vs flow ratio, or constant with applicability note); derating vendor-advised only — absent ⇒ 1.0 with NO_SYSTEM_DERATING_DATA warning, never invented. NOT derived from the C3 generic percentage. Missing capacity ⇒ Pending Validation (not blocked); curve out of data range ⇒ Not Calculable + VENDOR_CAPACITY_OUT_OF_DATA_RANGE | Vendor data ⇒ Calculated Screening Result; Assumed anywhere ⇒ Pending Validation |
| ECP-003 | Minimum wetting / recommended loading | L_c vs vendor minimumWettingRate (BELOW_MINIMUM_WETTING); L_tot vs vendor recommendedLoadingRange (ABOVE_MAXIMUM_LIQUID_LOAD). Data absent ⇒ Not Calculable — never assumed | data-gated |
| ECP-004 | Distributor checks (modular) | IDistributorCheckModule interface — Stage C4 ships the generic open-area module: dispersed load Q_d/A, total load, open-area velocity v = Q_d/(A·freeArea) vs vendor window, total flow vs vendor max capacity. Each sub-check independently Not Calculable when its datum is missing. Future types (orifice pan, trough, ladder, pipe, spray, chimney tray) plug in without engine changes. No proprietary geometry designed | data-gated |
| ECP-005 | Packing height (HETS path) | H_pack = theoreticalStages × HETS. HETS a full system record, mandatory, never defaulted; Assumed ⇒ Pending Validation; mismatch warnings when HETS system/temperature differ from the run. heightBasis 'HTU_NTU' reserved and rejected in C4 | blocked if HETS missing |
| ECP-006 | Bed split & redistributors | H_pack > vendor maximumBedHeight ⇒ nBeds = ⌈H/maxBed⌉ equal beds, nBeds−1 redistributors, each consuming the mandatory source-tagged redistributorAllowance. No vendor limit ⇒ single bed + NO_BED_HEIGHT_LIMIT_DATA | data-gated |
| ECP-007 | Pressure drop (WET only) | Δp/m from the packing record's WET basis only (table interpolation inside range, or polynomial inside stated valid range, or constant with applicability note); Δp_total = Δp/m × H_pack. Extrapolation refused (PRESSURE_DROP_OUT_OF_DATA_RANGE ⇒ Not Calculable). Missing basis ⇒ Not Calculable without blocking anything else. No universal Pa/m is ever invented. Dry Δp is reserved architecture | data-gated |
| ECP-008 | Height breakdown & diameter rating | Lines: Top Head, Top Disengagement, Top Distributor, Packing Bed 1, Redistributor 1, …, Hold-Down, Packing Support, Bottom Distributor, Bottom Disengagement, Bottom Head; Total T/T (heads excluded) and Overall Vessel Height (T/T + heads). Every line source-tagged or explicitly Assumed. Per-diameter classification vs a configurable utilization band (default 40–80 %, stored, not a universal rule): hydraulically_infeasible (≥100 %) / above / within / below band. NO recommended diameter — selectedTrialDiameter echoed and rated only. Every calculated item is a rich result: result, units, source, status, validation, warnings, formula reference, engine version | assembled from above |

Benchmarks (asserted in the suite): D = 1.0 m, C2/C3 flows ⇒ L_tot = 16.62 m³/(m²·h), U_normal = 55.4 %, U_max = 61.7 % (S = 9000); distributor v = 0.0988 m/s; H_pack = 6 × 0.45 = 2.70 m; Δp/m = 96.3 Pa/m interpolated, Δp = 260 Pa; T/T = 5.75 m; overall vessel = 6.75 m.

Applicability statement + 7 limitations on every result: no proprietary packing model; no vendor hydraulic guarantee; HETS requires vendor/test confirmation; no droplet breakup/coalescence model; no axial-dispersion model; no rate-based mass-transfer model; no mechanical code design.

**Not implemented in Stage C4 (by direction):** ECR engine, Sulzer proprietary correlations, HTU/NTU sizing, packing recommendation, mechanical shell design, cost estimation, report generation.

**C4 validation suite:** `server/engine-framework/tests/c4-ecp-column.ts`.

---

## 10. Stage C5 — ECR-Type Kühni Agitated Extraction Column Engine (`server/engines/llx/llx-ecr-engine.ts`, engine `llx-ecr` v1.0.0)

**PRELIMINARY ECR-TYPE AGITATED COLUMN SCREENING — NOT VENDOR RATING AND NOT FOR FABRICATION.** Vendor neutral — no proprietary Kühni/Sulzer model; vendor data consumed via the C4 `PerformanceBasis` architecture (interpolation only, extrapolation refused). The C3 generic hydraulic percentage is never reused as ECR utilization. No droplet-size prediction from RPM. Approved refinements: R1 selectable power-density basis (recorded every run; `holdup_corrected` reserved and rejected); R2 rotor geometry via direct diameter and/or ratio with ±1 % consistency gate; R3 four-way tip-speed classification.

| ID | Name | Formula & rules | Classification behaviour |
|---|---|---|---|
| ECR-001 | Loads & superficial velocities | A = π·D²/4; Q_i = m_i/ρ_i (RRBO ρ entered source-tagged via calculation-scoped context; NMP ρ from EPD at T); u_c, u_d (m/s), phase loads and total load (m³/(m²·h)); flow ratio Q_d/Q_c stored (capacity-curve variable). Normal/maximum cases independent | Pending if any fluid property Assumed |
| ECR-002 | ECR hydraulic utilization | U = L_tot/(Vendor Hydraulic Capacity × derating) × 100 %. ECR-specific vendor data only (constant + applicabilityNote, or curve vs `flowRatioDispersedToContinuous`); derating never invented (absent ⇒ 1.0 + `NO_SYSTEM_DERATING_DATA`); missing capacity ⇒ Pending Validation + `NO_ECR_CAPACITY_DATA` (loads still reported); out of data range ⇒ Not Calculable + `VENDOR_CAPACITY_OUT_OF_DATA_RANGE` | data-gated |
| ECR-003 | Stator & rotor-region checks | v_st = (Q_c+Q_d)/(A·f_stator) vs optional vendor limits; A_R = π·D_R²/4; swept loading (Q_c+Q_d)/A_R vs optional limit. Data absent ⇒ value reported / check Not Calculable — never assumed | data-gated |
| ECR-004 | Rotor geometry & speed (R2) | D_R direct AND/OR ratio×D; both ⇒ agree within ±1 % else blocked; one ⇒ other calculated. N = rpm/60; single speed or range (both ends evaluated as atMinSpeed/atMaxSpeed). rotorType is a data label | blocked if neither geometry input |
| ECR-005 | Dimensionless groups | Re = ρ_c·N·D_R²/μ_c (μ_c mandatory entered when NMP continuous — never silently taken); We = ρ_c·N²·D_R³/σ (σ absent ⇒ We Not Calculable, others unaffected); Fr = N²·D_R/g. No droplet size derived from any group | data-gated |
| ECR-006 | Agitation power (R1) | P₁ = N_P·ρ_m·N³·D_R⁵ with SELECTED density basis: 'continuous_phase' (ρ_c) or 'volume_averaged' ((m_c+m_d)/(Q_c+Q_d)); basis + value recorded on every item; 'holdup_corrected' reserved/rejected. P_shaft = P₁ × nCompartments × rotorsPerCompartment (default 1 with explicit warning); P_motor = P_shaft/η_shaft × designMargin. N_P, η_shaft, margin mandatory tagged — never defaulted | blocked if N_P/η/margin missing |
| ECR-007 | Compartments (efficiency path) | estimatedCompartments = ceil(theoreticalStages/compartmentEfficiency); efficiency mandatory tagged, 0 < η ≤ 1, never silently defaulted; Assumed ⇒ Pending Validation. Rate-based path (KoaV/Q, residence time, back-mixing) reserved null placeholders | blocked if efficiency missing |
| ECR-008 | Heights | H_active = nCompartments × compartmentHeight; lines: Drive/Seal/Bearing, Top Head, Top Disengagement, Top Distributor, Active Agitated Section, Bottom Distributor, Bottom Disengagement, Bottom Head; T/T excludes heads and drive/seal; overall vessel = T/T + heads + drive/seal. All allowances mandatory source-tagged or explicitly Assumed | assembled |
| ECR-009 | Mechanical screening (R3) | Tip speed v_tip = π·D_R·N classified: below_preferred_range / preferred_range / above_preferred_range / above_vendor_limit (`TIP_SPEED_LIMIT_EXCEEDED`); no preferred range ⇒ classification Not Calculable (limit still enforced); no criteria ⇒ no_limit_data. P_shaft vs maxAllowableShaftPower (`SHAFT_POWER_LIMIT_EXCEEDED`); overall-vessel proxy vs maxUnsupportedShaftLength (`SHAFT_SUPPORT_REQUIRED`); bearing/support requirements ALWAYS Pending Validation unless vendor/mechanical data. Screening only — no shaft/seal/bearing/code design | data-gated |

Benchmarks (asserted): D = 1.0 m, D_R = 0.5 m, 120 rpm ⇒ v_tip = 3.142 m/s (preferred_range); Re = 6.28×10⁵; We = 20 094; Fr = 0.2039; ρ_m(vol-avg) = 957.7 kg/m³; P₁ = 838 W; 15 compartments; P_shaft = 12.57 kW; P_motor = 15.88 kW; U = 55.4 %/61.7 %; H_active = 3.75 m; T/T = 6.55 m; overall vessel = 8.15 m.

Applicability statement + 7 limitations on every result: no proprietary Kühni model; no vendor hydraulic guarantee; no validated droplet breakup/coalescence model; no axial back-mixing model; no rate-based mass-transfer model; no final shaft/seal/bearing design; no mechanical code design.

**Not implemented in Stage C5 (by direction):** proprietary Sulzer ECR correlations, droplet-size prediction from RPM, rate-based KoaV/Q design, shaft/seal/bearing mechanical design, technology comparison, cost estimation, report generation.

**C5 validation suite:** `server/engine-framework/tests/c5-ecr-column.ts`.

---

## 11. Stage C6 — Common Mechanical Design Engine (`server/engines/common/mechanical-vessel-engine.ts`, engine `mech-vessel` v1.0.0)

**PRELIMINARY MECHANICAL SCREENING — NOT A CODE CALCULATION AND NOT FOR FABRICATION.** Common downstream engine: consumes a technology-neutral `MechanicalGeometryInput` snapshot from C4 (ECP) / C5 (ECR) — and any future Thermopac module — and produces a preliminary mechanical vessel definition. No ASME VIII / EN 13445 / IS 2825 / PV Elite / FEA / wind / seismic / reinforcement / detailed support design; these register as future methods without workflow changes. Allowable stress is engineer-entered, never looked up from a material name. Approved refinements: R1 explicit mandatory orientation (never inferred); R2 Material Interface (name/spec/grade/S/ρ/CA/source — future ASME Section II hook); R3 five head types with type-driven head depth; R4 nozzle projection + flange class + flange standard; R5 complete weight breakdown incl. optional insulation and a future-platforms placeholder; R6 reserved wind/seismic/transportation/foundation/nozzle-load placeholders; R7 structured Mechanical Datasheet object (internal, not a PDF).

| ID | Name | Formula & rules | Classification behaviour |
|---|---|---|---|
| MEC-001 | Design conditions | P/T design & operating all entered source-tagged; gates P_d ≥ P_op, T_d ≥ T_op (margins engineer-set, never invented). Material Interface mandatory; joint efficiency 0 < E ≤ 1; designCode is a declared placeholder label. Physicality gate S·E − 0.6·P > 0 | blocked if any missing |
| MEC-002 | Geometry adoption | D, T/T, overall height adopted from the snapshot (source engine id/version/run echoed); orientation is an explicit input, never inferred; L_ss = T/T. Head depth from type: 2:1 ⇒ D/4; hemispherical ⇒ D/2; flat ⇒ 0; torispherical/custom ⇒ entered depth (+ entered head volume). Flat head under pressure ⇒ warning | blocked if snapshot incomplete |
| MEC-003 | Shell thickness (screening) | t = P·R_i/(S·E − 0.6·P), P (MPa) = barg × 0.1; thin-wall validity gate t/R ≤ 0.10 else Not Calculable + `THIN_WALL_LIMIT_EXCEEDED` (thick-wall code method required). Method label `thin_wall_membrane_screening` — code methods are future ThicknessMethods | Calculated Screening Result |
| MEC-004 | Head thickness (screening) | 2:1: t = P·D/(2·S·E − 0.2·P); hemispherical: t = P·R/(2·S·E − 0.2·P); torispherical: t = 0.885·P·L/(S·E − 0.1·P) (entered crown radius); flat ⇒ Not Calculable + `FLAT_HEAD_REQUIRES_CODE_METHOD`; custom ⇒ engineer-entered thickness or Not Calculable. Same thin-wall gate | data-gated |
| MEC-005 | Thickness selection | t_req = t_calc + CA; selected = next plate ≥ t_req (and ≥ entered minimum floor) from an entered source-tagged plate series; no series ⇒ `NO_PLATE_SERIES_DATA`; series exceeded ⇒ Not Calculable | data-gated |
| MEC-006 | Nozzle schedule | Mandatory services Feed, Solvent, Raffinate, Extract, Vent, Drain, ≥1 Instrument (Spare optional); exact word-match on normalized service (substrings forbidden). Per row: Tag (auto N1…), Service, Size, Rating, Facing, Projection, Flange Class, Flange Standard, Remarks. Size entered OR d = √(4·Q/(π·v)) with entered velocity, rounded up in the entered DN series; missing criteria ⇒ Not Calculable, row still emitted. Ratings/facings/flange data entered per nozzle or via entered project defaults — never invented (`NOT ENTERED` + warning). No reinforcement calculation (remark on every row) | data-gated |
| MEC-007 | Support selection | Rule matrix: vertical ⇒ skirt (stated industry-practice basis); horizontal ⇒ 2 saddles; legs only by explicit selection WITH entered height/weight criteria (checked, exceedances warned); lug only by explicit selection. Selection + rationale + rejected alternatives reported. No structural calculation | Calculated Screening Result |
| MEC-008 | Weights | Shell π·(D+t)·t·L_ss·ρ; heads 2·k_blank·D²·t·ρ (k_blank entered — never hard-coded); nozzles/internals/supports entered tagged; insulation optional (0 with explicit note if absent); future platforms = reserved null placeholder. Volume π/4·D²·L_ss + 2·V_head (2:1 πD³/24, hemi πD³/12, flat 0, tori/custom entered). Operating = empty + V × basis (liquid-full or entered holdup) × ρ_op; hydrotest = empty + V·ρ_w. Thickness unavailable ⇒ weights Not Calculable | Pending if any factor Assumed |
| MEC-009 | Lifting (preliminary) | Vertical: 2 top lugs (tangent line, 0°/180°) + 1 tailing lug; horizontal: 2 lugs above saddles. Erection weight = empty + entered allowance. Always `LIFTING_NOT_VERIFIED` — no structural verification | Calculated Screening Result |
| MEC-010 | Summary, datasheet & checklist | Mechanical summary (dimensions/thickness/weights/support/nozzles); structured Mechanical Datasheet object (R7, internal engineering object); 6-point checklist with evidence: geometry complete, thickness calculated, mandatory nozzles defined, support selected, weights calculated, assumptions acknowledged (true only when every Assumed input is registered and the run is pending_validation) | assembled |

Benchmarks (asserted): D = 1.0 m, T/T = 6.55 m at 6 barg, S = 118 MPa, E = 0.85, CA = 3 mm ⇒ shell t_calc = 3.002 mm → 8 mm plate; 2:1 head t_calc = 2.993 mm → 6 mm plate (next ≥ 5.993 from series [6, 8, …]); shell 1302.6 kg; heads 102.1 kg; volume 5.406 m³; feed nozzle DN 80 from 12.5 m³/h at 1.5 m/s; vertical ⇒ skirt; 2 top + 1 tailing lug.

Reserved placeholders (R6, no implementation): wind load, seismic load, transportation, foundation load, nozzle load.

**Not implemented in Stage C6 (by direction):** ASME VIII / EN 13445 / IS 2825 calculations, PV Elite integration, FEA, wind analysis, seismic analysis, detailed nozzle reinforcement, detailed support design.

**C6 validation suite:** `server/engine-framework/tests/c6-mechanical-vessel.ts`.

---

**Deferred (throw `NotImplementedError`, never fabricate values):** schmidt, sherwood, lookupDiffusivity, pressureDropDarcyWeisbach, moodyFrictionFactor, overallMassTransferCoefficient, numberOfTransferUnits, nusseltDittusBoelter.

**Validation suite:** `server/engine-framework/tests/level1-validation.ts` (run `npx tsx server/engine-framework/tests/level1-validation.ts`).

---

## 12. DS-SEL — Autonomous Design Selection Layer (`server/design-selection/design-selection-service.ts`, `llx-design-selection` v1.0.0)

**DETERMINISTIC DESIGN-SELECTION RULES — NOT A CALCULATION ENGINE.** The DS-SEL layer is the autonomous Process Design Engineer step: it CONSUMES the frozen C4/C5 calculation run snapshots (loadings read verbatim, never recomputed) and applies governed deterministic selection rules to determine the technology and column diameter. CAPEX/OPEX are excluded by direction. Confidence level is data-maturity information only and is NEVER a selection criterion or tie-breaker. Terminology governance (engineering audit correction 2026-08-06): when the capacity basis is the screening threshold, U is reported as "utilization against preliminary capacity-screening basis" and (1 − U) as "preliminary hydraulic loading margin"; TRUE flooding utilization and TRUE flooding margin remain Not Calculable until approved vendor, pilot or RRBO/NMP experimental flooding data are entered. Output is a superseded-not-edited Engineering Decision Record (`design_selection_records`); the engineer may only Approve, Request Verification, or Override with a mandatory engineering justification (the autonomous values are always retained).

| ID | Name | Rule | Behaviour |
|---|---|---|---|
| DS-SEL-001 | Calculated minimum diameter | D_min = √(4·Q_max/(π·u_allow·C_basis)); Q_max from the frozen maximum-continuous-case flows; u_allow governed utilization limit; C_basis per DS-SEL-004 | Recorded on every EDR alongside the selected diameter |
| DS-SEL-002 | Practical rounding rule | Round UP to the next 50 mm increment; never down; exact increment used as-is | Approved increment series: 50 mm (user directive 2026-08-06) |
| DS-SEL-003 | Hydraulic feasibility & diameter selection | U = L_total/C_basis from the frozen sweep row; feasible when U ≤ u_allow; select the SMALLEST practical increment ≥ rounded minimum that is feasible (the selected PRELIMINARY diameter); ungoverned checks (wetting, distributor, recommended loading) skipped-with-notation. Screening-basis U/(1 − U) are preliminary quantities, never true flooding quantities | Sweep exhaustion ⇒ Not Recommendable, never extrapolated |
| DS-SEL-004 | Capacity-basis hierarchy | Validated entry (Vendor/Pilot, source-referenced) > Thermopac preliminary SMVP throughput threshold (upper bound of the Sulzer SMV/SMVP published screening throughput range 35–60 m³/(m²·h), Rauber, Sulzer Chemtech, AIChE 2006 — a published typical SMVP throughput characteristic, NOT validated RRBO/NMP flooding capacity; Assumed — Pending Hydraulic and Pressure-Drop Validation). The packing throughput threshold is NOT transferable to ECR; without validated ECR capacity data ECR is "Not Assessable for Autonomous Hydraulic Selection — validated ECR capacity basis unavailable" (non-assessability does not imply technical inferiority) | Active tier always named; no silent substitution; C3 generic % never a substitute |
| DS-SEL-005 | Technology cascade | (1) assessability + hydraulic feasibility (a sole assessable technology is selected as the only currently assessable technology under the available preliminary hydraulic basis — this does not establish technical superiority); (2) direct comparison of actual calculated hydraulic loading margins (no tie band); (3) pressure drop only when validated ΔP data exist for all remaining technologies. Residual equivalence ⇒ "Multiple technically acceptable solutions identified. Engineering review required." | No preference is invented; confidence never breaks ties |
| DS-SEL-006 | Governed user diameter selection | The engineer may select a governing diameter from the governed 50 mm increment series, ≥ the autonomous calculated diameter (DS-SEL-003); lower or off-series values are rejected server-side, limited to the frozen sweep range (never extrapolated). Effective design diameter = user-selected when entered and valid, else autonomous; the autonomous diameter is always retained. A valid selection auto re-runs C3/C4/C5 (where applicable)/mechanical with the effective diameter, supersedes the record (decision resets to pending), stores the impact assessment (previous/new run IDs, loading, utilization, margin, ΔP, holdup where calculable, heights) and reconciles reports (drafts regenerated; for_review/released marked stale + new record; approval/issue blocked while stale) | Governed conservative selection — NOT an Engineer Override of an unsafe design (user directive 2026-08-07) |

**Confidence ladder (data maturity only):** Preliminary Screening → Engineering Standard → Vendor Validated → Pilot Validated → Commercially Proven; weakest-link rule over the selection-path inputs. Engineering Standard requires an approved Thermopac standard basis; Commercially Proven requires an approved operating-reference record (register not yet established).

**V&V registration:** `server/vv/seed-dsel-equation-register.ts` (engine `llx-design-selection`, refs DS-SEL-001…006).
