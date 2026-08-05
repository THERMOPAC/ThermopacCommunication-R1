# Stage C5 Engineering Plan — ECR-Type Kühni Agitated Extraction Column Engine

**Status: PLAN ONLY — no code written. Awaiting engineering-basis approval.**

Engine: `llx-ecr` v1.0.0 (replaces the Stage B stub in `server/engines/llx/llx-ecr-engine.ts`).
Applies the governance framework proven in Stages C1–C4 (CEL, EPD, C2 process design, C3 common hydraulic screening, C4 common packed-column engine).

Applicability statement on every result:

> **PRELIMINARY ECR-TYPE AGITATED COLUMN SCREENING — NOT VENDOR RATING AND NOT FOR FABRICATION**

Limitations (verbatim, on every result):
1. No proprietary Kühni model
2. No vendor hydraulic guarantee
3. No validated droplet breakup/coalescence model
4. No axial back-mixing model
5. No rate-based mass-transfer model
6. No final shaft/seal/bearing design
7. No mechanical code design

---

## 1. Scope

Independent screening of an **ECR-type Kühni agitated extraction column** (rotating impellers in stator-divided compartments) for the RRBO/NMP LLX service:

- Diameter rating against ECR-specific vendor hydraulic capacity (normal + maximum cases)
- Rotor geometry, speed, dimensionless groups, and agitation power
- Compartment count from theoretical stages and a source-tagged compartment efficiency
- Active agitated height and full vessel height breakdown
- Mechanical screening (tip speed, shaft power, motor power, shaft support interval) against engineer/vendor limits

Vendor-neutral: the engine consumes "Vendor Hydraulic Capacity" / "Vendor Compartment-Efficiency Data" through data schemas — it does not claim to reproduce Sulzer (or any) proprietary design software, and no vendor name appears in code logic.

**Out of scope (refused, not silently skipped):** proprietary Sulzer ECR correlations; droplet-size prediction from RPM (unless a validated, source-tagged ECR correlation is supplied — none will be shipped); rate-based KoaV/Q design; shaft/seal/bearing mechanical design; technology comparison; cost estimation; report generation.

---

## 2. ECR Equation Register (proposed CORRELATION-REGISTER.md §10)

| ID | Name | Formula & rules | Classification behaviour |
|---|---|---|---|
| ECR-001 | Column loads & superficial velocities | A = π·D²/4; Q_i = m_i/ρ_i (RRBO ρ entered source-tagged via calculation-scoped context, NMP ρ from EPD at T); superficial velocities u_c = Q_c/A, u_d = Q_d/A (m/s and m³/(m²·h)); total load L_tot = u_c + u_d. Normal and maximum cases fully independent | Calculated once gated; Pending if any fluid property Assumed |
| ECR-002 | ECR hydraulic utilization | U = L_tot / (Vendor Hydraulic Capacity × system derating) × 100 %. Capacity from ECR-specific vendor data ONLY (curve vs flow ratio, or constant + applicability note, reusing the C4 `PerformanceBasis` architecture). Derating vendor-advised only; absent ⇒ 1.0 + `NO_SYSTEM_DERATING_DATA`. **The C3 generic hydraulic percentage is NEVER reused as ECR utilization.** Missing capacity ⇒ Pending Validation (loads still reported, run not blocked); curve out of data range ⇒ Not Calculable | data-gated |
| ECR-003 | Stator & rotor-region checks | Stator free-area velocity v_st = (Q_c+Q_d)/(A·f_stator); rotor swept area A_R = π·D_R²/4; rotor swept-area loading L_R = (Q_c+Q_d)/A_R. Compared against vendor/engineer limits when supplied; limits absent ⇒ value reported, check Not Calculable — never assumed | data-gated |
| ECR-004 | Rotor geometry & speed | D_R supplied directly OR as rotorToColumnDiameterRatio × D (if both supplied they must agree within 1 % or the run is blocked); rotational frequency N (rev/s) = RPM/60; speed range supported (min/max evaluated at both ends). Rotor type is a data label (disc turbine, blade impeller, …) — no geometry is designed | blocked if neither D_R nor ratio |
| ECR-005 | Dimensionless groups | Rotor Reynolds Re = ρ_c·N·D_R²/μ_c; rotor Weber We = ρ_c·N²·D_R³/σ (σ = source-tagged IFT; absent ⇒ We Not Calculable, others unaffected); rotational Froude Fr = N²·D_R/g. Continuous-phase properties per the entered phase configuration | data-gated |
| ECR-006 | Agitation power | Power per rotor P₁ = N_P·ρ_m·N³·D_R⁵ with **flow-averaged mixture density** ρ_m = (m_c+m_d)/(Q_c+Q_d) (basis stated in output; holdup-based ρ_m deferred — no validated holdup model in scope); total shaft power P_shaft = nCompartments × P₁ (one rotor per compartment; different rotor counts must be engineer-entered); motor design power P_motor = P_shaft / η_shaft × designMargin. N_P source-tagged mandatory — never defaulted | blocked if N_P missing |
| ECR-007 | Compartments (efficiency path) | estimatedCompartments = ceil(theoreticalStages / compartmentEfficiency). Efficiency source-tagged mandatory, 0 < η_st ≤ 1, never silently defaulted; Assumed ⇒ Pending Validation. Rate-based path (KoaV/Q, residence time, back-mixing) reserved placeholders only | blocked if efficiency missing |
| ECR-008 | Heights | Active agitated height H_active = nCompartments × compartmentHeight; lines: Top Head, Top Disengagement, Top Distributor, Active Agitated Section, Bottom Distributor, Bottom Disengagement, Bottom Head, plus Drive/Seal/Bearing allowance (above top head); Total T/T (heads excluded) and Overall Vessel Height (T/T + heads + drive/seal allowance). Every allowance source-tagged or explicitly Assumed | assembled |
| ECR-009 | Mechanical screening | Tip speed v_tip = π·D_R·N vs maxAllowableTipSpeed (`TIP_SPEED_LIMIT_EXCEEDED`); P_shaft vs maxAllowableShaftPower (`SHAFT_POWER_LIMIT_EXCEEDED`); shaft length ≈ overall vessel proxy vs maxUnsupportedShaftLength/supportInterval when supplied (`SHAFT_SUPPORT_REQUIRED`); bearing/support requirements always **Pending Validation** unless vendor/mechanical data exist. Screening only — no shaft/seal/bearing/code design | data-gated |

All items returned as **rich results** (result, units, source, status, validation, warnings, formula reference, engine version) per the C4 standard.

---

## 3. Exact input schema

Every scalar engineering input is a tagged value `{ value, unit, sourceType, sourceReference }` validated against a stated range; assumption status derives from `sourceType === 'Assumed'`. Untagged/defaulted values are blocked.

```ts
{
  operatingTemperature: number,                    // °C, 0 < T < 300
  normalCase:  { rrboMassFlow_kg_h: number, nmpMassFlow_kg_h: number },   // > 0, independent
  maximumCase: { rrboMassFlow_kg_h: number, nmpMassFlow_kg_h: number },
  phaseConfiguration: 'rrbo_continuous_nmp_dispersed' | 'nmp_continuous_rrbo_dispersed',

  feedDensity:   { value, referenceTemperatureC, sourceType, sourceReference },  // kg/m3, RRBO
  feedViscosity: { value, referenceTemperatureC, sourceType, sourceReference },  // Pa.s, RRBO
  continuousPhaseViscosity?: Tagged<'Pa.s'>,       // required for Re when continuous = RRBO it is feedViscosity; for NMP taken from EPD, entry overrides
  interfacialTension?: Tagged<'N/m'>,              // 0.0005–0.1; absent ⇒ We Not Calculable

  // Diameter basis — identical discipline to C3/C4
  diameterSweep?: { min, max, step },              // 0 < min < max, ≤ 200 points, mutually exclusive with:
  diameterValues?: number[],                       // 1–200 entries, each > 0
  selectedTrialDiameter?: number,                  // echoed & rated only — never engine-recommended

  // Rotor
  rotorType: string,                               // data label, mandatory non-empty
  rotorDiameter?: Tagged<'m'>,                     // 0.05–5; and/or:
  rotorToColumnDiameterRatio?: Tagged<'-'>,        // 0.2–0.8; both ⇒ must agree within 1 %
  rotorSpeed?: Tagged<'rpm'>,                      // 1–1000; or:
  rotorSpeedRange?: { min: Tagged<'rpm'>, max: Tagged<'rpm'> },  // min < max, both ends evaluated
  powerNumber: Tagged<'-'>,                        // 0.1–20, MANDATORY — never defaulted
  statorOpenAreaFraction?: Tagged<'-'>,            // 0.01–0.9
  statorVelocityLimits?: { min?: Tagged<'m/s'>, max?: Tagged<'m/s'> },
  rotorSweptLoadingLimit?: Tagged<'m3/(m2.h)'>,

  // Compartments
  theoreticalStages: number,                       // > 0 (from Stage C2)
  compartmentEfficiency: Tagged<'-'>,              // 0 < η ≤ 1, MANDATORY — never silently defaulted
  compartmentHeight: Tagged<'m'>,                  // 0.05–1, MANDATORY
  rotorsPerCompartment?: Tagged<'-'>,              // integer ≥ 1, default 1 WITH explicit note (engineer-visible)

  // Mechanical
  shaftEfficiency: Tagged<'-'>,                    // 0.5–1.0, MANDATORY
  mechanicalDesignMargin: Tagged<'-'>,             // 1.0–2.0, MANDATORY
  maxAllowableTipSpeed?: Tagged<'m/s'>,
  maxAllowableShaftPower?: Tagged<'kW'>,
  maxUnsupportedShaftLength?: Tagged<'m'>,

  // Vendor data (where available — absence ⇒ Pending Validation, never invented)
  vendorHydraulicCapacity?: PerformanceBasis,      // C4 architecture: table/polynomial (interpolation only) or constant + applicabilityNote; curves vs 'flowRatioDispersedToContinuous'
  systemDeratingFactor?: Tagged<'-'>,              // 0.1–1.0
  vendorCompartmentEfficiencyData?: PerformanceBasis,  // stored & echoed; overrides nothing — engineer must transcribe into compartmentEfficiency (traceable decision)

  // Height allowances — each mandatory, source-tagged or explicitly Assumed
  topHeadHeight, topDisengagementHeight, topDistributorAllowance,
  bottomDistributorAllowance, bottomDisengagementHeight, bottomHeadHeight,
  driveSealBearingAllowance: Tagged<'m'>,

  utilizationBandPercent?: { min, max },           // default 40–80, stored as configurable criterion
}
```

## 4. Output schema

```
{
  applicabilityStatement, limitations[7],
  calculationRunStatus: screening_complete | pending_validation | calculation_blocked,
  engineVersions: { cel, epd, processDesign (C2), hydraulicsCommon (C3), ecrAgitatedColumn (C5) },
  designBasis: { temperature, phase configuration, fluids as used, rotor basis, compartment basis, vendor data echo, utilization band },
  normalCase / maximumCase: {
    flows, utilizationBandPercent,
    diameters: [ per candidate D {
      diameter_m, area, loads { continuous, dispersed, total, superficialVelocities_m_s },   // ECR-001
      ecrHydraulicUtilization,                                                               // ECR-002
      statorFreeAreaVelocity + limit check, rotorSweptAreaLoading + limit check,             // ECR-003
      rotor { rotorDiameter, rotationalFrequency, tipSpeed, reynolds, weber, froude },       // ECR-004/005 (speed-range ⇒ atMinSpeed/atMaxSpeed)
      power { perRotor, totalShaft, motorDesign },                                           // ECR-006
      mechanicalScreening { tipSpeedCheck, shaftPowerCheck, shaftSupportCheck, bearingSupport: Pending Validation unless data }, // ECR-009
      feasibility: hydraulically_infeasible | above_screening_band | within_screening_band | below_minimum_loading_band | pending_validation | not_calculable
    } ],
    summary { banded diameter lists, minimumFeasibleDiameter, selectedTrialDiameter echo + "not engine-recommended" note }
  },
  compartments { estimatedCompartments, basis },                                             // ECR-007
  heightBreakdown { lines[], totalTangentToTangent, overallVesselHeight },                   // ECR-008
  rateBasedPlaceholders { compartmentMassTransferCoefficient: null, residenceTime: null,
                          stageEfficiencyFromKoaVQ: null, axialBackMixing: null },
  assumptions[], warnings[]
}
```
Every calculated item is a rich result (result, units, source, status, validation, warnings, formulaReference, engineVersion). Classifications: `Calculated Screening Result` / `Pending Validation` / `Not Calculable`.

## 5. Assumption rules

- Any input tagged `Assumed` ⇒ that item and all downstream items `Pending Validation`; run status `pending_validation`; entry in the assumptions register with consequence.
- Never silently defaulted: powerNumber, compartmentEfficiency, compartmentHeight, shaftEfficiency, mechanicalDesignMargin, all height allowances — missing ⇒ `calculation_blocked`.
- Never invented: vendor hydraulic capacity (missing ⇒ utilization Pending Validation, run continues), system derating (missing ⇒ 1.0 + warning), IFT (missing ⇒ We Not Calculable), stator/rotor/tip-speed/shaft-power/shaft-length limits (missing ⇒ that check Not Calculable or Pending Validation).
- Bearing/support requirements are always Pending Validation unless vendor/mechanical data are supplied.
- No droplet-size output exists. `calculate()` self-gates on `validate()`; no NaN ever; calculation-scoped property context for RRBO (registries never mutated).

## 6. Complete hand calculation (will be asserted in the suite)

Basis: T = 60 °C; normal 5 000 kg/h RRBO (ρ = 895) dispersed / 7 500 kg/h NMP (ρ = 1004.7) continuous; maximum NMP = 9 000 kg/h. D = 1.0 m. μ_c(NMP) = 0.00080 Pa·s (entered, Vendor-tagged for the example); σ = 0.025 N/m; ratio D_R/D = 0.5; N = 120 rpm; N_P = 3.5; η_st = 0.40; stages = 6; h_comp = 0.25 m; f_stator = 0.25; η_shaft = 0.95; margin = 1.2; v_tip,max = 4.0 m/s.

1. A = π/4 = **0.7854 m²**; Q_d = 5000/895 = **5.587**, Q_c = 7500/1004.7 = **7.465 m³/h**; L_tot = (5.587+7.465)/0.7854 = **16.62 m³/(m²·h)**; u_c = 2.640×10⁻³ m/s, u_d = 1.976×10⁻³ m/s.
2. Utilization (vendor constant capacity 30, derating 1.0): U_norm = 16.62/30 = **55.4 %**; maximum: Q_c = 8.958 → L = 18.52 → **61.7 %** — both within 40–80 %.
3. Stator velocity v_st = (13.05/3600)/(0.7854×0.25) = **0.01847 m/s**. Rotor swept area A_R = π·0.5²/4 = 0.19635 m²; swept loading = 13.05/0.19635 = **66.47 m³/(m²·h)**.
4. Rotor: D_R = **0.50 m**; N = 120 rpm = **2.000 rev/s**; v_tip = π·0.5·2 = **3.142 m/s** ≤ 4.0 → ok.
5. Groups: Re = 1004.7·2·0.5²/0.0008 = **6.28×10⁵**; We = 1004.7·2²·0.5³/0.025 = **20 094**; Fr = 2²·0.5/9.80665 = **0.2039**.
6. Power: ρ_m = 12 500/13.05 = **957.7 kg/m³** (flow-averaged); P₁ = 3.5·957.7·2³·0.5⁵ = **838.0 W**; compartments = ceil(6/0.40) = **15**; P_shaft = 15·838.0 = **12.57 kW**; P_motor = 12.57/0.95×1.2 = **15.88 kW**.
7. Heights: H_active = 15×0.25 = **3.75 m**; with allowances (top disengagement 0.8, top distributor 0.5, bottom distributor 0.5, bottom disengagement 1.0): T/T = 3.75+0.8+0.5+0.5+1.0 = **6.55 m**; heads 0.5+0.5 and drive/seal 0.6 ⇒ overall vessel = **8.15 m**.

## 7. Full test plan (`server/engine-framework/tests/c5-ecr-column.ts`)

1. Hand-calc benchmark (all §6 numbers, normal + maximum, rich-item shape, versions, applicability + 7 limitations, rate-based placeholders null)
2. Independent normal/maximum cases (maximum change never alters normal results)
3. Rotor basis: D_R direct, via ratio, both-agree, both-disagree ⇒ blocked; rotor speed range evaluated at both ends
4. Re/We/Fr formulas; missing IFT ⇒ We Not Calculable, Re/Fr unaffected
5. Power chain: per rotor (mixture density asserted), total, motor after efficiency + margin; rotorsPerCompartment > 1
6. Compartment count from efficiency incl. non-integer ceil; Assumed efficiency ⇒ Pending Validation; **missing efficiency blocked**
7. **Missing power number blocked**; missing shaft efficiency / margin blocked
8. Missing vendor hydraulic capacity ⇒ utilization Pending Validation, run continues, `NO_ECR_CAPACITY_DATA` warning; capacity curve out of range ⇒ Not Calculable; **no reuse of C3 generic percentage (asserted on output JSON)**
9. Tip-speed limit exceedance and shaft-power limit exceedance warnings; limits absent ⇒ Not Calculable; shaft support check; bearing/support Pending Validation
10. Stator/rotor-region checks with and without limits
11. Height breakdown lines, T/T vs overall vessel, Assumed allowances ⇒ pending; drive/seal allowance mandatory
12. Diameter paths: strict sweep (min = max rejected, >200 points rejected), explicit diameterValues, sweep+values rejected, trial diameter echoed only, band classification incl. custom band
13. Blocked-input matrix (≥16 cases, no NaN, `calculation_blocked`)
14. Assumed-input propagation matrix (each Assumed tag ⇒ pending run)
15. No automatic vendor recommendation (no `recommendedDiameter`/`recommendedSpeed` keys)
16. Concurrency/property-context isolation (10 parallel runs, shared registries untouched)

## 8. Register & versioning

- CORRELATION-REGISTER.md gains §10 (ECR-001…ECR-009) on implementation.
- Output stamps CEL, EPD, C2, C3 and ECR versions.
- Reuses C4's `PerformanceBasis` module for vendor curves (shared data governance, no duplication).

---

**No code will be written until this engineering basis is approved.**
