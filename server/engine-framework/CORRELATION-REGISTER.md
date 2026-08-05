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

**Deferred (throw `NotImplementedError`, never fabricate values):** schmidt, sherwood, lookupDiffusivity, pressureDropDarcyWeisbach, moodyFrictionFactor, overallMassTransferCoefficient, numberOfTransferUnits, nusseltDittusBoelter.

**Validation suite:** `server/engine-framework/tests/level1-validation.ts` (run `npx tsx server/engine-framework/tests/level1-validation.ts`).
