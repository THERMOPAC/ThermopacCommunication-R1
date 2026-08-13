---
name: LLX direct NRTL cascade N_T solver
description: Architecture decision replacing the Hunter-Nash locus solver for temperature-extrapolation N_T at off-calibration extraction temperatures.
---

# LLX Direct NRTL Counter-Current Cascade

## Rule
At **extrapolation** temperatures (outside 298.15 K ± 0.5 K), the N_T solver is `computeNrtlDirectCascadeNt()` in `llx-nrtl-direct-cascade.ts` — NOT the Hunter-Nash locus via `computeGovernedTheoreticalStages()` with an `equilibriumBasis`.

At **interpolation** temperatures (inside the window), the Hunter-Nash solver with governed experimental tie-lines is unchanged.

**Why:** The Hunter-Nash solver interpolates on the x1R envelope of the NRTL model tie-line family. At 60°C, the model x1R_max ≈ 0.837, but the design feed n-dodecane fraction is 0.881 — above the envelope. This caused "outside envelope" failures for every design at off-calibration temperatures. The direct cascade calls `nrtlFlash()` per stage for arbitrary compositions, eliminating the envelope restriction.

**How to apply:** Engine switch is in `llx-process-design-engine.ts` at the `tModel.mode === 'extrapolation'` branch. The extrapolationBasisError fail-closed path (< 4 anchor tie-lines surviving) remains as a proxy for "NRTL model degenerate at this T".

## Key architecture points
- No circular imports: `llx-nrtl-direct-cascade.ts` imports FROM both `llx-temperature-lle-model.ts` and `coto2022-nmp-lle.ts`; neither imports back.
- `stageTrace: []` — Hunter-Nash trace field is empty; full detail in `directCascadeTrace` (spread into lleStageCalculation).
- `temperatureStatus: 'model_at_design_temperature'` — triggers `tExtrap` label path in the engine.
- Fail-closed gates: non-convergence, trivial flash, balance > 1e-7 mol, isoactivity > 1e-8.
- Fractional N_T labelled "Interpolated Fractional Theoretical Stages" — linear interpolation between N−1 and N raffinate-aromatics profiles.

## Verified result (LLX-RND-2026-0002 at 60°C)
Feed: 88.1% n-C12, 5.2% xylene, 3.9% 1-MeNaph, 2.7% pyrene; S/F = 2.52 mol/mol; target 10 mol%.
- N_T fractional: 0.189; N_T integer: 1 (converged in 1 outer iteration; balance ✓; isoactivity max 0.00).
- 1 stage achieves 1.87 mol% raffinate aromatics (well below 10% target at this solvent ratio).
