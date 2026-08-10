---
name: Duss 2013 Governed Re–cf Dataset Architecture
description: How cf is auto-calculated in C3 hydraulics from Duss 2013 Table 2 governed datasets; range policy; UI and mapper pattern.
---

## Rule
`c_f` in C3 (hydraulics_common) is **auto-calculated** from governed Duss 2013 Table 2 datasets — never user-entered. The mapper auto-injects `governedReCfDataset` into `pressureDropBasis`; the engine evaluates it at each diameter's operating Re via `evaluateDuss2013ReCf()`.

## Datasets
- `DUSS2013_TABLE2_45Y` — 45° Y-type, a≈250 m²/m³, dh=0.016 m, Re_crit=250, 11 points Re 143–7144 in `packing-single-phase.ts`
- `DUSS2013_TABLE2_30X` — 30° X-type, a≈500 m²/m³, dh=0.008 m, Re_crit=450, 11 points Re 71–3572

Selected by `DUSS2013_DATASETS[corrugationAngle_deg]`. Default angle=45°, default a=250 m²/m³ when fields blank.

## Range Policy
- Within [tableMin, tableMax] → piecewise linear interpolation, `status: 'interpolated'`
- Below tableMin → `status: 'below_range'`, cf=null. A `pressureDropBoundaryMinimumEstimate` is reported using cf at Re_min — labelled "NOT design ΔP; lower bound only". **Do NOT use for column sizing.**
- Above tableMax → `status: 'above_range'`, cf=null, no estimate.

**Production RRBO-continuous case Re ≈ 0.36 → falls below_range (tableMin=143). Boundary estimate at cf=1.34.**

## Governance Note (Sulcol distinction)
- Sulcol as live design tool at design time → **PROHIBITED**
- Sulcol-computed values **reproduced in published Duss 2013 AIChE paper (Table 2)** → **PERMITTED** as controlled-literature tabulated data with full provenance

## Architecture
- `packing-single-phase.ts` — `Duss2013DatasetRecord` interface, `DUSS2013_TABLE2_45Y/30X`, `DUSS2013_DATASETS`, `evaluateDuss2013ReCf()`
- `common-engineering-library.ts` → `cel/index.ts` → `packing-single-phase.ts` (auto-exported)
- `llx-process-design-input-mapper.ts` — imports `DUSS2013_DATASETS` directly; auto-injects dataset; removes user cf fields; defaults a=250, φ=45
- `llx-hydraulics-engine.ts` — imports `evaluateDuss2013ReCf`, `Duss2013DatasetRecord` via CEL; validate() allows either governedReCfDataset OR frictionFactorBasis+Provenance; per-diameter block branches: governed first, then user cfBasis
- UI `design-software-workspace-page.tsx` — cf manual inputs removed; replaced with read-only blue info panel showing active dataset, range, out-of-range policy; panel adapts to φ=30° or φ=45°

**Why:** User-entered constant cf is not defensible for a project at Re≪100 (well below any published packing data); the governed tabulated dataset with an explicit range policy is the only approach that correctly signals "outside validated range" without silently producing a number the engineer might rely on.
