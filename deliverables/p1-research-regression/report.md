# P1 saved-output research regression

## Result

EXACT MATCH of compared saved numerical outputs; 0 non-exact raw comparisons; 0 outside comparator tolerance. 2569321 / 2569321 primitive/array-length comparisons exact.

Project 236 / design 269. Latest current-Stage1-hash completed candidate **b4b44349-5471-4b9c-acf8-d06e2cea8d42**, ledger **69**. Database verified at 2026-09-21T04:42:24.304Z using explicit repeatable-read READ ONLY SELECT transaction, rolled back. No run, adoption, optimizer solve, input change or authority write. Ledger canonical integrity and complete saved-result calculation hash verified.

Full RRBO-only universe: **378 geometries, 3402 geometry/RPM trials, 20412 scenarios**. Accepted 158; rejected 3244. Duplicate/missing/extra keys: 0. Cartesian coverage checked independently against saved controls × C32 {0.36, 0.42, 0.43} × both interface scenarios, not just equal row counts. Alternate phase excluded. Every accepted and rejected scenario, null root and branch status retained.

## Numerical comparison (unrounded parsed doubles)

| Metric | Count | Exact | Within tolerance incl exact | Null pairs | Max absolute | Max relative |
| --- | --- | --- | --- | --- | --- | --- |
| scenario.d32M | 20412 | 20412 | 20412 | 0 | 0 | 0 |
| scenario.operatingHoldup | 20412 | 20412 | 20412 | 16565 | 0 | 0 |
| scenario.floodHoldup | 20412 | 20412 | 20412 | 0 | 0 | 0 |
| scenario.capacityMS | 20412 | 20412 | 20412 | 0 | 0 | 0 |
| scenario.loading | 20412 | 20412 | 20412 | 0 | 0 | 0 |
| scenario.interfacialAreaM2M3 | 20412 | 20412 | 20412 | 16565 | 0 | 0 |
| scenario.branchStatus | 20412 | 20412 | 20412 | 0 | 0 | 0 |
| scenario.trialStatus | 20412 | 20412 | 20412 | 0 | 0 | 0 |
| scenario.operatingRoots.length | 20412 | 20412 | 20412 | 0 | 0 | 0 |
| scenario.operatingRoots.[] | 7694 | 7694 | 7694 | 0 | 0 | 0 |

All exported columns, nested roots, continuation, signed velocities, diagnostics and saved trial validity/qualification are checked; metric-summary.csv contains every metric. numerical-differences.csv contains every non-exact value, even within tolerance (header-only means no non-exact values).

Comparator: absolute 1e-12 plus relative 1e-12 × max(|research|,|integrated|); relative error = absolute error / max(|research|,|integrated|), both zero gives 0. No denominator floor. This is a reporting comparator, **not** a changed 70% loading gate or 20-rpm adequacy policy. Blank CSV cells mean null, never zero; NaN/Infinity cause an explicit error. Array positions retain root/continuation sequence semantics; scenario and geometry joins never use row order.

Keys: D on 0.1-m stored grid; hc/D, Dr/D, free area and C32 at hundredths; RPM integer. Each numeric key must be within 1e-12 of that grid. Binary decimal representations such as 0.30000000000000004 are normalized only for joins; raw numerical comparisons remain unrounded. 972 key-coordinate normalization events (including repeated lookups).

## Controlling scenario and validity

Checked all 3402 trials against minimum **raw** scenario capacity, not rounded loading. 0 exact ties; implementation tie semantics retain the first scenario in stored scenario sequence (capacity <=). Governing full object and trial d32, operating/flood holdup, loading and area are checked. Controlling labels: {"0.36 SCHILLER_NAUMANN_IMMOBILE":3402}.

Uploaded scenarios CSV has no governing-boolean column. No governing flag was fabricated: labels and validity are compared using the supplementary research result.json, whose sibling CSV files are byte-identical to both uploads. The raw-capacity minimum is independently checked as a selection reduction only, not a hydraulic solve.

Trial validity: {"PHYSICAL_INVALID":3244,"SCALE_UP_EXTRAPOLATION":158}. Branch statuses: {"NO_DILUTE_CONNECTED_ROOT":16565,"LOWER_QUASI_STEADY_ADMISSIBLE":3847}. Null operating holdup: 16565. Validity and qualifications remain preliminary/unqualified where saved; a regression match is not scientific qualification.

## Feasible RPM sets

| D m | Union RPMs across geometries | Union RPM count | Accepted geometry/RPM trials | Feasible fixed geometries / 27 |
| --- | --- | --- | --- | --- |
| 0.2 | none | 0 | 0 | 0 / 27 |
| 0.3 | 30 | 1 | 1 | 1 / 27 |
| 0.4 | 30 | 1 | 5 | 5 / 27 |
| 0.5 | 30, 35 | 2 | 10 | 8 / 27 |
| 0.6 | 30, 35 | 2 | 11 | 8 / 27 |
| 0.7 | 30, 35 | 2 | 12 | 9 / 27 |
| 0.8 | 30, 35 | 2 | 14 | 9 / 27 |
| 0.9 | 30, 35, 40 | 3 | 15 | 9 / 27 |
| 1 | 30, 35, 40 | 3 | 15 | 9 / 27 |
| 1.1 | 30, 35, 40 | 3 | 15 | 9 / 27 |
| 1.2 | 30, 35, 40 | 3 | 15 | 9 / 27 |
| 1.3 | 30, 35, 40 | 3 | 15 | 9 / 27 |
| 1.4 | 30, 35, 40 | 3 | 15 | 9 / 27 |
| 1.5 | 30, 35, 40 | 3 | 15 | 9 / 27 |

feasible-rpm-comparison.csv has all 378 **fixed-geometry** rows plus 14 explicitly labeled **diameter unions**. A union is not a fixed-geometry operating window. Discrete runs, longest grid run and rejection counts are separately compared. Saved selection: {"status":"NO_SECOND_ADEQUATE_DIAMETER","selectedGeometry":null,"selectedRpm":null}.

## Scientific inputs and provenance

Research Stage1 hash: 549dffa428356ee5e94d8baff297c114e1f0c6f345b84e121181e7b5f6b5f15b. Original frozen research phase: nmp-continuous-rrbo-dispersed; research used an isolated RRBO override. Current saved Stage1 hash: 06bb9227b30f1f4c67b3ed557db34f61fe749037addf66163194dd46e2e98c5f, with RRBO actually saved. Hash metadata differs; it is not evidence of different scientific properties.

Every process-basis field (not merely selected rho/mu fields) is compared after excluding only stage1SnapshotHash: densities, viscosities, both flows, compositions, sigma, phase, temperatures, pressure, S/O, units/conversions/schema. Controls are recursively compared in full, including D/ratio/free-area/RPM grids and 20-rpm adequacy. Current saved Stage1 basis is also checked against result basis without removing its hash.

Scientific basis:

```json
{
  "rrboFeed": {
    "flowM3S": 0.0011111111111111111,
    "identity": "RRBO_FEED",
    "valueLph": 4000,
    "conversion": "L/h * 1e-3 m3/L / 3600 s/h",
    "densityKgM3": 869,
    "dynamicViscosityPaS": 0.0598
  },
  "composition": {
    "rrboGrade": "SN300",
    "rrboFeedWt": {
      "nmp": 0,
      "saturates": 85,
      "diAromatics": 4,
      "monoAromatics": 7,
      "polyAromatics": 2,
      "polarAromatics": 2
    },
    "wetSolventWt": {
      "nmp": 99.5,
      "water": 0.5
    }
  },
  "temperatureK": 313.15,
  "schemaVersion": "ECR_PRE_PILOT_HYDRODYNAMIC_PROCESS_BASIS_V1",
  "wetSolventPhase": {
    "flowM3S": 0.0005707717569786535,
    "identity": "WET_NMP_SOLVENT_PHASE",
    "conversion": "(RRBO m3/s * RRBO kg/m3 * S/O) / wet-solvent kg/m3",
    "densityKgM3": 1015,
    "dynamicViscosityPaS": 0.001416,
    "solventOilMassRatio": 0.6
  },
  "operatingPressure": "2.0",
  "phaseConfiguration": "rrbo-continuous-nmp-dispersed",
  "interfacialTensionNM": 0.011,
  "operatingTemperatureC": 40
}
```

Controls:

```json
{
  "rpmMax": 70,
  "rpmMin": 30,
  "rpmStep": 5,
  "freeArea": [
    0.2,
    0.3,
    0.4
  ],
  "hcToColumn": [
    0.2,
    0.25,
    0.3
  ],
  "diameterMaxM": 1.5,
  "diameterMinM": 0.2,
  "diameterStepM": 0.1,
  "rotorToColumn": [
    0.33,
    0.4,
    0.5
  ],
  "compareOrientations": true,
  "minimumUsefulWindowRpm": 20
}
```

## Integrity and reproducibility

Ledger immutable hash: 4b60bbd4396e508ce58a2de945540035e46062396d94b000f89fdecd335c8e82

Result calculation hash: 1ad764e887ffe30a158367ee8298b5f8bfc61523d6bbaa30992feb4cfdcab896

| Artifact | SHA-256 |
| --- | --- |
| geometryUpload | 995b15e2323a53e6cd0817ef2404d5010162e72c672e7c6e914fe951da2b2aab |
| scenariosUpload | 366e0304e25a9e254e9da5a407b1a96f515e6e3a6b9c77f81774d6648a46825e |
| integrated | a05bde53ec44dfcbd8a1d60247536361887f2244f0ba8460f992fec5137457dc |
| researchResult | 8bef79ff9be32bfd16c2c219eba321c2d8c9a024729a886f30213b9b71995b05 |
| researchInput | 061fa3f2d28e60938138cb55a5a43667da11ccdda466fac9a18098468ba618ec |
| researchSource | aeef586f907f9b1ccaef7ba4af837d667a2d64a09bf34be768c1dbd9bda091fd |
| researchManifest | 523abe1eebaf1460784ce979455481bf4e647f271235f63147bb2b411504eb3d |

The integrated artifact omits session/actor identities and credentials. Its full saved numerical result is retained; canonical result hash is rechecked by comparison. The extraction verifies the original ledger envelope before omitting session metadata.

Reproduce from repository root: `npx tsx deliverables/p1-research-regression/extract.ts` (read-only DB export), then `node deliverables/p1-research-regression/compare.mjs` (offline, streamed uploaded CSV parsing). The exports use JSON-escaped quoted cells, explicitly parsed as that dialect. No optimizer or scientific solver is imported by the comparison. Original research input/source/result companions are required and hashed above.

This compares saved outputs; **it is not independent validation of the original model, correlations, phase assumptions, or physical operating safety**. No mismatch is repaired.
