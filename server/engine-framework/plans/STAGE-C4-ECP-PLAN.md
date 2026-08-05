# Stage C4 Engineering Plan — ECP-Type Packed Extraction Column Engine

**Status: PLAN — awaiting approval. No code written.**
Engine (proposed): `llx-ecp-packed-column` v1.0.0, type `hydraulics_ecp`.

Applicability statement on every result:
**PRELIMINARY ECP-TYPE PACKED COLUMN SCREENING — NOT VENDOR RATING AND NOT FOR FABRICATION**

Limitations (all results): no proprietary packing model; no vendor hydraulic guarantee; HETS requires vendor/test confirmation; no droplet breakup/coalescence model; no axial-dispersion model; no rate-based mass-transfer model; no mechanical code design.

---

## 1. Scope

Independent screening of an **ECP-type packed extraction column** (agitation-free, packed liquid–liquid extraction column of the ECP class). The engine:

- rates candidate diameters against **engineer/vendor-supplied packing-specific hydraulic-capacity data** — it does NOT reuse the C3 generic-throughput percentage as ECP utilization;
- computes packing height ONLY via the HETS path (`packingHeight = theoreticalStages × HETS`); architecture keeps a `heightBasis` discriminator open for a future `HTU × NTU` rate-based path (not implemented);
- calculates pressure drop only from source-tagged vendor data or an explicitly supplied correlation/table;
- performs distributor loading checks from supplied distributor data — no proprietary distributor geometry design;
- returns a full column-height breakdown to total tangent-to-tangent height.

It does not claim to reproduce Sulzer proprietary design software or vendor-certified hydraulic rating.

**Out of scope (Stage C4):** ECR engine, Sulzer proprietary correlations, HTU/NTU sizing, packing recommendation, mechanical shell design, cost estimation, report generation.

Governance carried over unchanged from C2/C3: calculation-scoped `PropertyContext` (no shared-registry mutation); RRBO properties always engineer-entered source-tagged; `calculate()` self-gates on `validate()`; classifications `Calculated Screening Result` / `Pending Validation` / `Not Calculable`; run statuses `screening_complete` / `pending_validation` / `calculation_blocked`; any Assumed data forces pending; every run records CEL, EPD, C2 (`llx-process-design`), C3 (`llx-hydraulics`) and ECP engine versions.

---

## 2. Input schema (exact)

All engineering-value inputs use the established tagged-entry form:

```ts
interface TaggedValue {
  value: number;
  unit: string;                    // stored and checked against the expected unit for the field
  sourceType: 'Measured' | 'Vendor' | 'Literature' | 'Assumed';
  sourceReference: string;         // mandatory, non-empty
  // valid range is enforced per field by the engine (see table); assumption
  // status is derived from sourceType === 'Assumed' and echoed per item.
}
```

```ts
interface ECPColumnInputs {
  // ── Process basis (from Stage C3 cases — re-entered/forwarded, both mandatory) ──
  operatingTemperature: number;                       // °C, 0 < T < 300
  normalCase: ECPCaseFlows;                           // independent case
  maximumCase: ECPCaseFlows;                          // independent case — own flows
  phaseConfiguration: 'rrbo_continuous_nmp_dispersed' | 'nmp_continuous_rrbo_dispersed';
  feedDensity: TaggedValue;                           // kg/m³ RRBO (project fluid, mandatory)
  feedViscosity: TaggedValue;                         // Pa·s RRBO (mandatory)
  interfacialTension?: TaggedValue;                   // N/m (optional; used only for echo/context)

  // ── Diameter basis (exactly one) ──
  diameterSweep?: { min: number; max: number; step: number };  // m, strictly 0 < min < max, step > 0, ≤ 200 pts
  diameterValues?: number[];                          // m, explicit list, 1–200 entries, each > 0
  selectedTrialDiameter?: number;                     // m — echoed & rated, never recommended

  // ── Packing definition (all mandatory) ──
  packingManufacturer: string;                        // free text, non-empty
  packingType: string;                                // e.g. structured / random designation, non-empty
  packingMaterial: string;                            // non-empty
  packingSize: TaggedValue;                           // mm nominal or crimp designation value
  specificSurfaceArea: TaggedValue;                   // m²/m³, 50–1500
  voidFraction: TaggedValue;                          // –, 0.5–0.99

  // ── Packing hydraulic capacity (vendor/test data — the ONLY capacity basis) ──
  packingHydraulicCapacity?: {
    maxTotalLiquidLoad: TaggedValue;                  // m³/(m²·h) combined both-phase load at limit
    referenceSystemNote: string;                      // vendor's stated reference system/properties
    systemDeratingFactor?: TaggedValue;               // – (0.1–1.0), vendor-advised correction; NEVER invented
  };                                                  // absent ⇒ utilization items Pending Validation (see §3)
  minimumContinuousPhaseLoad?: TaggedValue;           // m³/(m²·h) — minimum wetting/loading limit
  maximumContinuousPhaseLoad?: TaggedValue;           // m³/(m²·h) — vendor max liquid loading, if distinct

  // ── Distributor (checks run only when data present) ──
  distributorType?: string;                           // e.g. ladder / pipe / plate — description only
  distributorFreeAreaFraction?: TaggedValue;          // – (0.001–0.5) open area / column area
  distributorHoleVelocityLimits?: { min: TaggedValue; max: TaggedValue };  // m/s vendor window
  maxDistributorCapacity?: TaggedValue;               // m³/h vendor max volumetric capacity

  // ── Height basis (HETS path only in C4) ──
  heightBasis: 'HETS';                                // discriminator; 'HTU_NTU' reserved, rejected in C4
  theoreticalStages: number;                          // > 0; engineer-entered (typically from C2 result)
  hets: TaggedValue;                                  // m, 0.1–3.0 — engineer/vendor; NEVER defaulted
  maxBedHeight?: TaggedValue;                         // m — vendor per-bed limit; triggers redistributors

  // ── Pressure drop (optional; exactly one basis when present) ──
  pressureDropBasis?:
    | { kind: 'vendor_table'; points: { load_m3m2h: number; dp_Pa_per_m: number }[]; source: TaggedValue }
    | { kind: 'correlation'; expression: 'linear_in_load'; coefficients: { a: number; b: number }; source: TaggedValue };

  // ── Height allowances (each mandatory, source-tagged or explicitly Assumed) ──
  topDisengagementHeight: TaggedValue;                // m, 0.1–5
  topDistributorAllowance: TaggedValue;               // m, 0.05–2
  packingSupportAllowance: TaggedValue;               // m, 0.02–1
  holdDownAllowance: TaggedValue;                     // m, 0.02–1
  redistributorAllowance?: TaggedValue;               // m per redistributor, 0.3–2 (mandatory if redistributors required)
  bottomDistributorAllowance: TaggedValue;            // m, 0.05–2
  bottomDisengagementHeight: TaggedValue;             // m, 0.1–5
}

interface ECPCaseFlows {
  rrboMassFlow_kg_h: number;                          // > 0
  nmpMassFlow_kg_h: number;                           // > 0
}
```

Validation rules: units checked per field; ranges as above; `sourceReference` non-empty on every TaggedValue; `heightBasis !== 'HETS'` → blocked with message that HTU/NTU is a later rate-based path; both `diameterSweep` and `diameterValues` → blocked; missing both → blocked.

---

## 3. Equation register (proposed §9, ECP-001…ECP-008)

All items classified **ECP-type screening — technology-class specific, vendor-data driven**.

| ID | Name | Formula & rules | Classification behaviour |
|---|---|---|---|
| ECP-001 | Column loadings | A = πD²/4; per phase per case: Q_i = m_i/ρ_i (RRBO ρ entered; NMP ρ from EPD via context at T); u_i = Q_i/A; total liquid load L_tot = (Q_c + Q_d)/A in m³/(m²·h); continuous-phase load L_c = Q_c/A. Normal and maximum cases fully independent | Always calculable once gated |
| ECP-002 | ECP hydraulic utilization | U = L_tot / (C_max · f_derate) where C_max = vendor `maxTotalLiquidLoad` and f_derate = vendor `systemDeratingFactor` (1.0 only if vendor states no correction — never invented). **Independent of and never derived from the C3 generic-throughput percentage.** Missing capacity data ⇒ utilization items **Pending Validation** (per correction file §3) with explicit reason; other outputs unaffected | Vendor data ⇒ Calculated Screening Result (Assumed anywhere ⇒ Pending); missing ⇒ Pending Validation |
| ECP-003 | Minimum wetting / loading check | L_c ≥ `minimumContinuousPhaseLoad` ⇒ pass; below ⇒ `BELOW_MINIMUM_WETTING`. If `maximumContinuousPhaseLoad` present: L_c ≤ limit else `ABOVE_MAXIMUM_LIQUID_LOAD`. Data absent ⇒ Not Calculable (never assumed) | data-gated |
| ECP-004 | Distributor checks | When data present: dispersed-phase distributor load Q_d/A; total load L_tot; open-area velocity v = Q_d/(A · freeAreaFraction) checked against vendor hole-velocity window; Q_d+Q_c vs `maxDistributorCapacity`. Run per case. No proprietary geometry designed | each sub-check independently Not Calculable when its datum missing |
| ECP-005 | Packing height (HETS path) | H_pack = N_theoretical × HETS. HETS mandatory source-tagged; never defaulted; Assumed HETS ⇒ Pending Validation. Architecture reserves `heightBasis: 'HTU_NTU'` (rejected in C4) | blocked if HETS missing |
| ECP-006 | Bed split & redistributors | If `maxBedHeight` present and H_pack > maxBedHeight: nBeds = ceil(H_pack/maxBedHeight), nRedistributors = nBeds − 1, each consuming `redistributorAllowance` (mandatory in that event). No vendor data ⇒ single bed, `NO_BED_HEIGHT_LIMIT_DATA` warning | data-gated |
| ECP-007 | Pressure drop | Only from supplied basis: vendor table — piecewise-linear interpolation in L_tot, extrapolation refused (`PRESSURE_DROP_OUT_OF_DATA_RANGE`, Not Calculable); or explicit linear correlation dp/m = a + b·L_tot with source tag. Δp_total = (dp/m) × H_pack. **No universal Pa/m value is ever invented. Missing basis ⇒ pressure-drop item Not Calculable WITHOUT blocking any other output** | data-gated |
| ECP-008 | Column height breakdown & diameter rating table | T/T = topDisengagement + topDistributor + H_pack + Σredistributor + support + holdDown + bottomDistributor + bottomDisengagement (every term source-tagged/Assumed, echoed per item). Per-diameter classification per case: `hydraulically_infeasible` (U > 100 %), `above_screening_band`, `within_screening_band`, `below_minimum_loading` (configurable utilization band, default 40–80 %, stored, "not a universal engineering rule") plus wetting/distributor status. NO recommended diameter; `selectedTrialDiameter` echoed and rated only when engineer-chosen | assembled from above |

---

## 4. Output schema (exact)

```ts
interface ECPColumnResults {
  applicabilityStatement: string;          // fixed text (§ above)
  limitations: string[];                   // fixed 7 items
  calculationRunStatus: 'screening_complete' | 'pending_validation' | 'calculation_blocked';
  engineVersions: { cel: string; epd: string; processDesign: string; hydraulicsCommon: string; ecp: string };
  designBasis: {                           // full echo of every tagged input incl. assumption status
    phaseConfiguration; temperature; cases; packing; capacityData; distributor;
    heightBasis: 'HETS'; utilizationBandPercent: { min; max; note };  // configurable, default 40–80
  };
  normalCase: ECPCaseResult;               // computed with its OWN flows/loads/utilization
  maximumCase: ECPCaseResult;
  packingHeight: { classification; theoreticalStages; hets; height_m } | NotCalculable;
  bedArrangement: { beds; bedHeights_m[]; redistributors } | warningOnly;
  heightBreakdown: {                       // every line: { value_m, sourceType, sourceReference, assumed }
    topDisengagement; topDistributorAllowance; activePackingHeight; redistributorAllowanceTotal;
    packingSupportAllowance; holdDownAllowance; bottomDistributorAllowance; bottomDisengagement;
    totalTangentToTangent_m;
  };
  pressureDrop: { classification; dpPerMeter_Pa_m; total_Pa; basis } | NotCalculable;
  assumptions: AssumptionRecord[];         // every Assumed entry, with consequence
  warnings: EngineWarning[];               // all propagated, deduplicated by code
}

interface ECPCaseResult {
  solventMassFlow_kg_h: number;
  diameters: Array<{
    diameter_m; area_m2;
    loads: { continuous_m3m2h; dispersed_m3m2h; total_m3m2h; phaseNames };
    ecpHydraulicUtilizationPercent?: number;          // ECP-002 — absent ⇒ see classification
    utilizationClassification: 'Calculated Screening Result' | 'Pending Validation' | 'Not Calculable';
    minimumWettingStatus: 'ok' | 'below_minimum_wetting' | 'not_calculable';
    maximumLoadingStatus: 'ok' | 'above_maximum_liquid_load' | 'not_calculable';
    distributor: { dispersedLoad; totalLoad; openAreaVelocity_m_s; withinVendorWindow; capacityStatus } | NotCalculable;
    feasibility: 'hydraulically_infeasible' | 'above_screening_band' | 'within_screening_band' | 'below_minimum_loading' | 'pending_validation';
  }>;
  summary: { infeasible[]; aboveBand[]; withinBand[]; belowBand[]; minimumFeasibleDiameter_m;
             screeningBandDiameterRange_m; selectedTrialDiameter_m | null;
             selectedTrialDiameterNote: 'echoed only — the engine does not recommend a diameter' };
}
```

---

## 5. Assumption rules

1. `sourceType: 'Assumed'` anywhere ⇒ that item Pending Validation ⇒ run `pending_validation`; recorded in `assumptions` with stated consequence.
2. HETS: never defaulted; missing ⇒ gate blocks; Assumed ⇒ packing height + T/T Pending Validation.
3. Packing capacity data missing ⇒ utilization Pending Validation (not blocked, per correction); Assumed capacity ⇒ Pending Validation.
4. `systemDeratingFactor` never invented; absent ⇒ 1.0 used ONLY with explicit `NO_SYSTEM_DERATING_DATA` warning + vendor reference-system note echoed.
5. Pressure-drop basis missing ⇒ Not Calculable, nothing else blocked; table extrapolation refused.
6. Distributor/wetting checks: each sub-check Not Calculable when its datum is absent — never silently passed.
7. All allowances mandatory and tagged; Assumed allowances ⇒ height breakdown Pending Validation.
8. C3 generic percentage is neither an input nor derivable — utilization computed exclusively from ECP-002.

---

## 6. Hand calculation (verification basis for the test suite)

Basis (C2/C3 flows): F = 5000 kg/h RRBO (ρ = 895 kg/m³ Measured, μ = 0.012 Pa·s Measured), S_normal = 7500 kg/h NMP, S_max = 9000 kg/h; T = 60 °C; ρ_NMP(60 °C) = 1004.7 kg/m³ (EPD); NMP continuous / RRBO dispersed. Packing (all Vendor, ref "VH-77-ECP"): 250 m²/m³, ε = 0.975, C_max = 30 m³/(m²·h), f_derate = 1.0 (vendor-stated), min continuous load 5 m³/(m²·h). Distributor: free area 2 %, hole-velocity window 0.05–0.30 m/s. N = 6 theoretical stages; HETS = 0.45 m (Vendor). Allowances (m): top diseng. 0.80, top distr. 0.50, support 0.15, hold-down 0.10, bottom distr. 0.50, bottom diseng. 1.00 (all Assumed). Δp table: {10 → 50 Pa/m, 20 → 120 Pa/m, 30 → 250 Pa/m} (Vendor). Trial D = 1.0 m.

- A = π·1.0²/4 = **0.7854 m²**
- Q_d = 5000/895 = 5.587 m³/h; Q_c,normal = 7500/1004.7 = 7.465 m³/h; Q_c,max = 9000/1004.7 = 8.958 m³/h
- L_tot,normal = (5.587 + 7.465)/0.7854 = **16.62 m³/(m²·h)**; L_tot,max = (5.587 + 8.958)/0.7854 = **18.52 m³/(m²·h)**
- ECP utilization: normal 16.62/30 = **55.4 %** (within 40–80 band); max 18.52/30 = **61.7 %** (within band)
- Wetting: L_c,normal = 7.465/0.7854 = 9.50 ≥ 5 ⇒ **ok** (max case 11.41 ⇒ ok)
- Distributor: v = Q_d/(A·0.02) = (5.587/3600)/(0.7854·0.02) = **0.0988 m/s** ⇒ within 0.05–0.30 window
- Packing height: H = 6 × 0.45 = **2.70 m** (single bed — no vendor bed limit supplied ⇒ warning)
- Δp: interpolate table at 16.62 → 50 + (120−50)·(16.62−10)/10 = **96.3 Pa/m**; total = 96.3 × 2.70 = **260 Pa** (normal case)
- T/T = 0.80 + 0.50 + 2.70 + 0 + 0.15 + 0.10 + 0.50 + 1.00 = **5.75 m**
- Run status: **pending_validation** (Assumed allowances + provisional NMP 80 °C EPD point)

Every figure above becomes a numeric assertion in the suite.

---

## 7. Test plan (`server/engine-framework/tests/c4-ecp-column.ts`)

1. **Hand-calc benchmark** — all §6 numbers within tight tolerances.
2. **HETS packing height** — H = N × HETS exact; Assumed HETS ⇒ Pending Validation; missing HETS blocked (never defaulted); `heightBasis: 'HTU_NTU'` rejected.
3. **Independent normal/maximum cases** — own loads and utilizations; max-case NMP change moves the correct phase load per configuration.
4. **Missing packing-capacity data** — utilization Pending Validation with reason; loads/wetting/height still produced.
5. **Missing pressure-drop basis** — pressure drop Not Calculable; all other outputs intact; table extrapolation refused beyond data range.
6. **Distributor loading** — velocity inside/below/above vendor window; capacity exceeded; each sub-check Not Calculable when its datum absent.
7. **Minimum wetting failure** — L_c below vendor minimum ⇒ `BELOW_MINIMUM_WETTING` + status.
8. **Assumed vendor inputs** — Assumed capacity/HETS/allowances each force Pending Validation and appear in assumptions register.
9. **No recommendation** — no recommended-diameter key; `selectedTrialDiameter` echoed only; note string asserted.
10. **No C3 reuse** — utilization computed from ECP-002 only; result contains no generic-throughput percentage key; C3 percentage ≠ ECP utilization on same basis (55.4 % vs C3's 56.8 % at D = 1.0 — numerically distinct, independently derived).
11. **Diameter paths** — strict sweep (0 < min < max), explicit `diameterValues: [D]`, both-given rejected, min = max rejected.
12. **Concurrency/context isolation** — ≥ 10 parallel runs with different RRBO ρ/μ; no cross-contamination; shared registries untouched.
13. **Blocked-input matrix** — every mandatory field missing/out-of-range/untagged ⇒ `calculation_blocked`, never NaN.
14. **Version stamps & applicability** — CEL/EPD/C2/C3/ECP versions and the applicability statement + 7 limitations on every result.

---

**Deferred beyond C4 (explicit):** ECR engine, HTU/NTU rate-based height, Sulzer proprietary correlations, packing recommendation, mechanical shell design, cost estimation, report generation.
