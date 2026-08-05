# Stage C6 Engineering Plan — Common Mechanical Design Engine

**Status: PLAN ONLY — no code written. Awaiting engineering-basis approval.**

Engine: `mech-vessel` v1.0.0 (NEW, `server/engines/common/mechanical-vessel-engine.ts`).
A **common downstream engine** — NOT an ECP engine, NOT an ECR engine. It receives the process/equipment sizing result from Stage C4 (ECP) or Stage C5 (ECR) — and, in future, from distillation, evaporator, reactor, absorber, stripper, heat-exchanger and pressure-vessel modules — and converts the calculated process dimensions into a **preliminary mechanical vessel definition suitable for EPC engineering**.

Applicability statement on every result:

> **PRELIMINARY MECHANICAL SCREENING — NOT A CODE CALCULATION AND NOT FOR FABRICATION**

Limitations (verbatim, on every result):
1. No ASME VIII / EN 13445 / IS 2825 code calculation
2. No PV Elite or FEA verification
3. No wind or seismic analysis
4. No nozzle reinforcement calculation
5. No detailed support or lifting-lug structural design
6. Thicknesses are thin-wall membrane screening values only
7. Weights are estimates from stated assumptions only

---

## 1. Scope & architecture

**Technology-neutral input contract.** The engine consumes a `MechanicalGeometryInput` snapshot — NOT the full ECP/ECR result object — so any future module can feed it:

```
MechanicalGeometryInput {
  sourceEngine: { engineId, engineVersion, calculationType }   // e.g. llx-ecp v1.0.0 / llx-ecr v1.0.0
  sourceRunReference: string                                    // run id / snapshot reference (traceability)
  orientation: 'vertical' | 'horizontal'
  insideDiameter_m            // adopted from the selected/confirmed technology diameter
  tangentToTangentHeight_m    // from the technology height breakdown (T/T excludes heads)
  overallVesselHeight_m       // T/T + heads + drive/seal (ECR) or T/T + heads (ECP)
  operatingLiquidBasis: 'liquid_full' | { holdupFraction: TaggedValue }   // LLX columns run liquid-full
}
```

Geometry is **adopted, never re-entered**: the LLX workspace builds this snapshot from the approved C4/C5 run for the selected technology. A geometry snapshot that disagrees with hand re-entry is impossible by construction; the engine echoes the source engine id/version/reference in `designBasis`.

**Code-extensibility architecture.** `designCode` is a declared placeholder (`'NOT_ASSIGNED'` or an entered label such as `'ASME VIII Div 1 (future)'`). Thickness calculations are dispatched through a `ThicknessMethod` interface; Stage C6 ships exactly one method, `thin_wall_membrane_screening`. Future code methods (ASME/EN/IS, nozzle reinforcement, wind/seismic, support design) register as new methods **without changing the workflow or output schema** — results simply upgrade from `Calculated Screening Result` to code-verified classifications.

All C1–C5 governance carries over unchanged: tagged inputs `{ value, unit, sourceType, sourceReference }`, no hidden defaults, no fabricated values, calculation-scoped contexts, rich result items (result, units, source, status, validation, warnings, formulaReference, engineVersion), classifications `Calculated Screening Result` / `Pending Validation` / `Not Calculable`, run statuses `screening_complete` / `pending_validation` / `calculation_blocked`, any `Assumed` ⇒ pending, `calculate()` self-gates on `validate()`, never NaN, versioned engine + register + assumption register + input/output snapshots.

**Out of scope (refused, not silently skipped):** all items in the "Do NOT implement" list; material allowable-stress libraries (allowable stress is engineer-entered and source-tagged — the engine never looks up S from a material name); vessel cost estimation; drawing generation.

---

## 2. Mechanical Equation Register (proposed CORRELATION-REGISTER.md §11)

| ID | Name | Formula & rules | Classification behaviour |
|---|---|---|---|
| MEC-001 | Design conditions | Design P/T and operating P/T all entered source-tagged (design values never derived by an invented margin). Gates: P_design ≥ P_operating, T_design ≥ T_operating, else blocked. Corrosion allowance CA entered (0 allowed only if explicitly tagged). Material of construction = data label + entered allowable stress S at design T (source-tagged, e.g. code table reference). Joint efficiency E entered, 0 < E ≤ 1. Design code = placeholder label only | blocked if any missing |
| MEC-002 | Vessel geometry adoption | D, T/T, overall height, orientation adopted from `MechanicalGeometryInput` (source engine echoed). Straight shell length L_ss = T/T. Head type entered from {`ellipsoidal_2_1`, `hemispherical`, `torispherical`, `flat` (rejected for pressure service with warning)}. Head depth: 2:1 ⇒ D/4; hemispherical ⇒ D/2; torispherical ⇒ entered dish geometry (crown/knuckle radii) — never assumed | blocked if snapshot incomplete |
| MEC-003 | Shell thickness (screening) | Thin-wall membrane: t_shell = P·R_i/(S·E − 0.6·P) with P in MPa, R_i = D/2 in mm. Explicitly labelled a **screening formula pending code calculation**; validity gate t/R ≤ 0.10 else Not Calculable (`THIN_WALL_LIMIT_EXCEEDED` — thick-wall code method required) | Calculated Screening Result |
| MEC-004 | Head thickness (screening) | 2:1 ellipsoidal: t_head = P·D/(2·S·E − 0.2·P). Hemispherical: t_head = P·R_i/(2·S·E − 0.2·P). Torispherical: t_head = 0.885·P·L_crown/(S·E − 0.1·P) (entered crown radius). Same thin-wall gate | Calculated Screening Result |
| MEC-005 | Thickness selection | t_required = t_calc + CA (+ entered mill/forming allowances if supplied — never invented). Selected thickness = next value ≥ t_required from an **entered plate-thickness series** (source-tagged, e.g. mill standard); series absent ⇒ t_required reported, selection Not Calculable + `NO_PLATE_SERIES_DATA`. Minimum-thickness floor only if entered | data-gated |
| MEC-006 | Nozzle schedule | Mandatory services: Feed, Solvent Inlet, Raffinate Outlet, Extract Outlet, Vent, Drain, ≥1 Instrument; Spare optional. Per nozzle: Tag (N1…, auto-sequenced), Service, Size, Rating, Facing, Remarks. Size either entered directly OR screened from d = √(4·Q/(π·v_design)) with entered line-velocity criterion, rounded UP to the next entered DN series value; velocity criterion or DN series absent ⇒ size Not Calculable, schedule row still emitted. Rating & facing entered per nozzle or as entered project defaults (source-tagged) — never invented. **No reinforcement calculation** (remark on every row) | data-gated |
| MEC-007 | Support selection | Rule matrix: vertical column ⇒ **skirt** (basis stated: industry practice for process columns; overridable by entered engineer selection); vertical small vessel ⇒ legs permitted only when engineer-entered height/weight criteria supplied and satisfied; horizontal ⇒ **saddle** (2 off); lug ⇒ only by explicit engineer selection. Selection + rationale + rejected alternatives reported. **No structural calculation** | Calculated Screening Result |
| MEC-008 | Weights | Shell: W_s = π·D_m·t_sel·L_ss·ρ_steel (ρ entered source-tagged, e.g. 7850). Heads: W_h = k_blank·D²·t_sel·ρ per head with **entered** blank-mass factor k_blank (e.g. vendor/handbook 1.084 for 2:1) — never hard-coded. Internals, attachments/piping allowance: entered tagged values or explicit Assumed. Empty = shell + heads + internals + attachments. Operating = empty + operating liquid: V_op from geometry × basis (liquid-full: V = π/4·D²·L_ss + 2·V_head, V_head 2:1 = π·D³/24) × entered operating density. Hydrotest = empty + water-full (ρ_w = 1000 entered-tagged). Every assumption in the assumption register | Pending if any factor Assumed |
| MEC-009 | Lifting (preliminary) | Vertical: 2 top lifting lugs at top-head tangent line (180° apart) + 1 tailing lug at skirt base — stated rigging convention, quantity/locations only. Horizontal: 2 lugs above saddles. Erection weight = empty weight + entered erection allowance (or explicit Assumed). **No structural verification** — item always carries warning `LIFTING_NOT_VERIFIED` | Calculated Screening Result |
| MEC-010 | Mechanical summary & validation checklist | Assembles Vessel Dimensions, Thickness Summary, Weight Summary, Support Summary, Nozzle Summary. Checklist (all boolean, each with evidence pointer): geometry complete ✓, thickness calculated ✓, all mandatory nozzles defined ✓, support selected ✓, weights calculated ✓, mechanical assumptions acknowledged ✓ (true only when every Assumed input appears in the assumption register AND the run is flagged pending_validation) | assembled |

---

## 3. Exact input schema

```
inputs = {
  geometry: MechanicalGeometryInput                       // §1 — from C4/C5 result, mandatory
  designPressure, operatingPressure: TaggedValue (barg)   // mandatory; Pd ≥ Pop
  designTemperature, operatingTemperature: TaggedValue (°C) // mandatory; Td ≥ Top
  corrosionAllowance: TaggedValue (mm)                    // mandatory (0 allowed if tagged)
  material: { designation: string, allowableStress: TaggedValue (MPa), density: TaggedValue (kg/m3) } // mandatory
  jointEfficiency: TaggedValue (-)                        // mandatory, 0 < E ≤ 1
  designCode: string                                      // placeholder label, mandatory (may be 'NOT_ASSIGNED')
  headType: 'ellipsoidal_2_1' | 'hemispherical' | 'torispherical'  // mandatory
  torisphericalGeometry?: { crownRadius, knuckleRadius: TaggedValue } // mandatory iff torispherical
  plateThicknessSeries?: { values_mm: number[], sourceType, sourceReference }   // optional; absent ⇒ selection Not Calculable
  minimumThickness?: TaggedValue (mm)                     // optional floor
  nozzles: {                                              // mandatory services checked by tag/service
    service, tag?, size?: TaggedValue (DN) | undefined,
    flowForSizing?: { volumetricFlow: TaggedValue (m3/h), designVelocity: TaggedValue (m/s) },
    rating?: string, facing?: string, remarks?: string
  }[]
  nozzleDefaults?: { rating?: TaggedValue-like label, facing?: label, dnSeries?: number[] (source-tagged) }
  supportOverride?: 'skirt' | 'legs' | 'saddle' | 'lug'   // engineer selection, else rule matrix
  legCriteria?: { maxHeight: TaggedValue, maxWeight: TaggedValue } // required iff legs requested
  internalsWeight, attachmentsWeight: TaggedValue (kg)    // mandatory (Assumed allowed ⇒ pending)
  headBlankFactor: TaggedValue (-)                        // mandatory (e.g. 1.084, handbook-tagged)
  operatingLiquidDensity: TaggedValue (kg/m3)             // mandatory
  waterDensity: TaggedValue (kg/m3)                       // mandatory (1000, tagged)
  erectionAllowance?: TaggedValue (kg)
}
```

Blocked (never defaulted): missing geometry snapshot fields; Pd < Pop or Td < Top; missing CA/material/S/E/head type; torispherical without dish geometry; flat head for pressure service; E outside (0,1]; nozzle list missing any mandatory service; legs requested without criteria; missing weight factors/densities; S·E − 0.6·P ≤ 0 (non-physical).

## 4. Output schema

`designConditions` (MEC-001 items incl. design-code placeholder), `geometry` (adopted values + source-engine echo, head depth), `shellDesign` (t_calc shell/head, t_required, t_selected or Not Calculable, thin-wall gate result), `nozzleSchedule` (full table, rich items per row), `support` (selection, rationale, alternatives), `weights` (empty/operating/hydrotest with component breakdown), `lifting` (lug quantity, locations, warnings), `mechanicalSummary` (5 summary blocks), `validationChecklist` (6 checks with evidence), `assumptions[]`, `warnings[]`, `applicabilityStatement`, `limitations[7]`, `engineVersions` (mech-vessel + source engine echo), `calculationRunStatus`.

---

## 5. Hand-calculated benchmark (asserted in the suite)

Basis: C5 ECR result D = 1.0 m, T/T = 6.55 m, overall 8.15 m, vertical, liquid-full. P_design = 6.0 barg = 0.60 MPa, T_design = 80 °C, CA = 3 mm, S = 118 MPa (entered, tagged), E = 0.85, head 2:1 ellipsoidal, plate series [6, 8, 10, 12, 14, 16] mm, ρ_steel = 7850, k_blank = 1.084, internals 400 kg, attachments 250 kg, ρ_op = 957.7, ρ_w = 1000.

- S·E = 100.30 MPa
- **Shell:** t = 0.60·500/(100.30 − 0.36) = 300/99.94 = **3.002 mm**; t_req = 6.002 mm; **selected 8 mm**; t/R = 0.016 ≤ 0.10 ✓
- **Head (2:1):** t = 0.60·1000/(2·100.30 − 0.12) = 600/200.48 = **2.993 mm**; t_req = 5.993 mm; **selected 8 mm**; head depth = D/4 = **0.250 m**
- **Shell weight:** π·1.008·0.008·6.55·7850 = **1302.6 kg** (mean diameter D + t)
- **Heads:** 2 × 1.084·1.0²·0.008·7850 = **136.1 kg**
- **Empty:** 1302.6 + 136.1 + 400 + 250 = **2088.7 kg**
- **Volume:** π/4·1²·6.55 + 2·π·1³/24 = 5.1444 + 0.2618 = **5.4062 m³**
- **Operating:** 2088.7 + 5.4062·957.7 = 2088.7 + 5177.5 = **7266.2 kg**
- **Hydrotest:** 2088.7 + 5406.2 = **7494.9 kg**
- **Nozzle sizing example:** Feed Q = 12.5 m³/h, v_design = 1.5 m/s ⇒ d = √(4·12.5/3600/(π·1.5)) = 0.0543 m ⇒ next DN from series [25, 40, 50, 80, 100…] = **DN 80**
- **Support:** vertical column ⇒ skirt. **Lifting:** 2 top lugs + 1 tailing lug.

## 6. Unit test plan (~12 groups)

1. **Hand-calc benchmark** — every number in §5 asserted to tolerance.
2. **Geometry adoption** — snapshot echoed, never re-entered; incomplete snapshot blocked; source engine id/version in output; horizontal orientation path.
3. **Design-condition gates** — Pd < Pop blocked; Td < Top blocked; missing CA/S/E/material blocked; E boundary values.
4. **Head types** — 2:1, hemispherical, torispherical (with dish geometry) thicknesses & depths; torispherical without geometry blocked; flat head refused.
5. **Thin-wall gate** — high-pressure case with t/R > 0.10 ⇒ Not Calculable + `THIN_WALL_LIMIT_EXCEEDED`; S·E − 0.6P ≤ 0 blocked.
6. **Plate selection** — rounding up; exact-match; t_req above series max ⇒ Not Calculable; no series ⇒ `NO_PLATE_SERIES_DATA`; minimum-thickness floor.
7. **Nozzle schedule** — all mandatory services enforced (each omission blocked); sizing from flow vs direct entry; no velocity criterion ⇒ size Not Calculable, row still present; tags sequenced; reinforcement remark on every row.
8. **Support matrix** — vertical ⇒ skirt; horizontal ⇒ saddle; legs without criteria blocked; explicit override honored with rationale.
9. **Weights** — component breakdown sums; liquid-full vs holdup-fraction basis; Assumed internals weight ⇒ pending + assumption register.
10. **Lifting** — quantities/locations per orientation; `LIFTING_NOT_VERIFIED` always present.
11. **Validation checklist** — all six checks true on the benchmark; each check false path exercised; "assumptions acknowledged" true only when Assumed inputs are registered and run is pending.
12. **Governance** — Assumed propagation for every tagged input; no NaN in any blocked case (blocked matrix); concurrency isolation (10 parallel runs); rich-item completeness; applicability + 7 limitations on every result; register/version stamps; ECP-sourced and ECR-sourced snapshots both accepted (technology-neutrality proof).

---

**No implementation will be written until this engineering basis is reviewed and approved.**
