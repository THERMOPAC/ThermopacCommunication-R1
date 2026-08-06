// ─────────────────────────────────────────────────────────────────────────────
// LLX Process Design (C2) — workspace → engine input mapper.
//
// The workspace stores flat snake_case string fields per section; the C2
// engine expects structured camelCase inputs. This adapter ONLY restructures
// and unit-converts — it contains no process-design equations (those stay in
// the engine). If engine-ready keys are already present they win untouched.
//
// Basis conversions performed here (documented, not C2 equations):
//   • Design capacity LPH → feedFlow m³/h (÷ 1000)
//   • Volume-basis S/O ratio (NMP vol / RRBO vol, per Design Basis spec)
//       → mass-basis ratio expected by the engine: × ρNMP(OT) / ρRRBO
//   • Design Margin % → maxCirculationFactor (1 + margin/100)
//   • Stage Efficiency % → fraction (÷ 100)
// ─────────────────────────────────────────────────────────────────────────────

import { getProperty } from './engine-framework/epd/database';

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const n = Number(String(v).trim());
  return isFinite(n) && String(v).trim() !== '' ? n : undefined;
};

const SOURCE_TYPES = ['Measured', 'Vendor', 'Literature', 'Assumed'];

export function mapWorkspaceProcessDesignInputs(inputs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...inputs };
  // Per-key pass-through: any engine-ready camelCase key already present wins
  // untouched; only missing keys are mapped from the flat workspace fields.

  const ot = out.operatingTemperature !== undefined ? num(out.operatingTemperature) : num(inputs.operating_temperature);
  if (out.operatingTemperature === undefined && ot !== undefined) out.operatingTemperature = ot;

  // Feed flow — Design Basis capacity (LPH → m³/h, volumetric basis)
  const feedLph = num(inputs.design_capacity_lph) ?? num(inputs.design_capacity);
  if (out.feedFlow === undefined && feedLph !== undefined && feedLph > 0) {
    out.feedFlow = { value: feedLph / 1000, basis: 'volumetric' };
  }

  // Feed (RRBO) density — the source-tagged Fluid Properties entry is mapped.
  // Provenance rule: if the engineer selected a controlled source type
  // (Measured/Vendor/Literature/Assumed) it is passed through verbatim.
  // If no source type is selected, the value on the page is the auto-populated
  // Thermopac Feed Master default — mapped as sourceType 'Assumed' with a
  // sourceReference naming the master, so the provenance is traceable and the
  // engine never receives an untagged density. Nothing is invented: the value,
  // reference temperature, and master label all come from the workspace entry.
  let rho: number | undefined;
  if (out.feedDensity === undefined) {
    const fpRho = num(inputs.rrbo_density_value);
    if (fpRho !== undefined && fpRho > 0) {
      rho = fpRho;
      const srcRaw = String(inputs.rrbo_density_source ?? '').trim();
      const refT = num(String(inputs.rrbo_density_ref_temp ?? '15').replace(/°?C/gi, '')) ?? 15;
      const refRaw = String(inputs.rrbo_density_source_reference ?? '').trim();
      const tagged = SOURCE_TYPES.includes(srcRaw);
      out.feedDensity = {
        value: fpRho,
        referenceTemperatureC: refT,
        sourceType: tagged ? srcRaw : 'Assumed',
        sourceReference: refRaw !== ''
          ? refRaw
          : tagged
            ? `Fluid Properties workspace entry (engineer source type: ${srcRaw})`
            : 'Thermopac Feed Master (Default) — Fluid Properties auto-populated value, no engineer source type selected',
      };
    }
  } else {
    rho = num((out.feedDensity as Record<string, unknown>)?.value);
  }

  // S/O ratio — workspace basis is VOLUME (NMP vol flow / RRBO vol flow).
  // Engine expects mass basis: multiply by ρNMP(OT)/ρRRBO.
  const soVol = num(inputs.so_ratio);
  if (out.solventToOilRatio === undefined && soVol !== undefined && soVol > 0 && ot !== undefined && rho !== undefined && rho > 0) {
    try {
      const rhoNmp = getProperty('nmp', 'density', ot).value; // kg/m³
      out.solventToOilRatio = soVol * (rhoNmp / rho);
      out.solventToOilRatioBasisNote =
        `Converted from volume-basis S/O ratio ${soVol} (NMP vol / RRBO vol) using ρNMP(${ot} °C) = ${rhoNmp.toFixed(1)} kg/m³ / ρRRBO = ${rho} kg/m³`;
    } catch {
      /* EPD out of range — leave unset; engine validation reports it */
    }
  }

  const stages = num(inputs.theoretical_stages);
  if (out.theoreticalStages === undefined && stages !== undefined) out.theoreticalStages = stages;

  const eff = num(inputs.stage_efficiency);
  if (out.compartmentOrStageEfficiency === undefined && eff !== undefined && eff > 0 && eff <= 100) {
    out.compartmentOrStageEfficiency = eff / 100;
  }

  const margin = num(inputs.design_margin);
  if (out.maxCirculationFactor === undefined && margin !== undefined && margin >= 0) {
    out.maxCirculationFactor = 1 + margin / 100;
  }

  const phase = String(inputs.phase_configuration ?? '').trim();
  if (out.phaseConfiguration === undefined && phase !== '') out.phaseConfiguration = phase;

  // Component-balance assumptions — Thermopac Preliminary Screening Defaults
  // entered as percent in the workspace; the engine expects fractions.
  // These are component-split assumptions, distinct from the Raffinate/Extract
  // Yield product-requirement targets (never substituted for each other).
  // Engine contract: TaggedValue { value (fraction), sourceType, sourceReference }.
  // soluteMassFractionInFeed is a top-level engine input; the three split
  // fractions live under caseSplits.normal (engine reuses them for the
  // maximum case with an explicit reused-splits assumption).
  const taggedPct = (wsKey: string, defPct: number) => {
    const pct = num(inputs[wsKey]);
    if (pct === undefined || pct < 0 || pct > 100) return undefined;
    return {
      value: pct / 100,
      sourceType: 'Assumed',
      sourceReference: pct === defPct
        ? 'Thermopac Preliminary Screening Default'
        : 'Engineer-entered screening value (Process Design workspace) — pending laboratory validation',
    };
  };
  if (out.soluteMassFractionInFeed === undefined) {
    const xF = taggedPct('solute_mass_fraction_feed', 20);
    if (xF !== undefined) out.soluteMassFractionInFeed = xF;
  }
  if (out.caseSplits === undefined) {
    const normal: Record<string, unknown> = {};
    const r = taggedPct('solute_recovery_extract', 90);
    const sL = taggedPct('solvent_carryover_raffinate', 2);
    const oL = taggedPct('oil_loss_extract', 1);
    if (r !== undefined) normal.soluteRecoveryToExtract = r;
    if (sL !== undefined) normal.solventCarryoverFraction = sL;
    if (oL !== undefined) normal.oilLossToExtractFraction = oL;
    if (Object.keys(normal).length > 0) {
      out.caseSplits = { normal };
      // The workspace carries one set of screening splits for both cases —
      // the engine's explicit reuse flag applies them to the maximum case
      // and records its documented reused-splits assumption.
      if (out.applyNormalSplitsToMaximumCase === undefined) out.applyNormalSplitsToMaximumCase = true;
    }
  }

  // ── Stage 5 (Common Hydraulic Design) extras — same restructuring-only rule ──
  // Feed (RRBO) dynamic viscosity: workspace mPa·s → engine Pa·s.
  if (out.feedViscosity === undefined) {
    const mu = num(inputs.rrbo_viscosity_dynamic_value);
    if (mu !== undefined && mu > 0) {
      const src = String(inputs.rrbo_viscosity_dynamic_source ?? '').trim();
      const refT = num(String(inputs.rrbo_viscosity_dynamic_ref_temp ?? '40').replace(/°?C/gi, '')) ?? 40;
      out.feedViscosity = {
        value: mu / 1000,
        referenceTemperatureC: refT,
        sourceType: SOURCE_TYPES.includes(src) ? src : 'Assumed',
        sourceReference: SOURCE_TYPES.includes(src)
          ? 'Fluid Properties workspace entry (engineer source type)'
          : 'Thermopac Feed Master (Default) — Fluid Properties auto-populated dynamic viscosity',
      };
    }
  }
  // Interfacial tension: workspace mN/m → engine N/m (tagged, optional input).
  if (out.interfacialTension === undefined) {
    const ift = num(inputs.interfacial_tension_value);
    if (ift !== undefined && ift > 0) {
      const src = String(inputs.interfacial_tension_source ?? '').trim();
      const refT = num(String(inputs.interfacial_tension_ref_temp ?? '70').replace(/°?C/gi, '')) ?? 70;
      out.interfacialTension = {
        value: ift / 1000,
        referenceTemperatureC: refT,
        sourceType: SOURCE_TYPES.includes(src) ? src : 'Assumed',
        sourceReference: 'Thermopac Preliminary Screening Default (Two-Phase Properties workspace entry)',
      };
    }
  }
  // Diameter basis: engineer trial diameter when entered; the screening sweep
  // (a sweep configuration, not a process value) covers the practical LLX
  // column range when no trial is given.
  const trialD = num(inputs.column_diameter);
  if (out.selectedTrialDiameter === undefined && trialD !== undefined && trialD > 0) {
    out.selectedTrialDiameter = trialD;
  }
  if (out.diameterSweep === undefined && out.diameterValues === undefined) {
    out.diameterSweep = { min: 0.3, max: 2.0, step: 0.05 };
  }
  // Droplet basis — engineer-approved Thermopac screening defaults (2026-08-06):
  // Sauter mean diameter d32 (workspace mm → engine m) with terminal velocity
  // as the characteristic velocity, and hindrance exponent n = 1 as an explicit
  // Assumed entry (the engine's own required form for n = 1).
  const SCREENING_REF = 'Thermopac Preliminary Screening Default';
  const uKModel = String(inputs.hydraulic_model ?? '').trim() === 'characteristic_velocity';
  if (uKModel && out.characteristicVelocity === undefined) {
    const uk = num(inputs.characteristic_velocity);
    if (uk !== undefined && uk > 0) {
      out.characteristicVelocity = { value: uk, sourceType: 'Assumed', sourceReference: 'Engineer-entered characteristic velocity (Stage 5 workspace) — pending laboratory validation' };
    }
  }
  if (!uKModel && out.sauterMeanDiameter === undefined && out.characteristicVelocity === undefined) {
    const d32mm = num(inputs.sauter_mean_d32) ?? 1.5;
    if (d32mm > 0) {
      out.sauterMeanDiameter = { value: d32mm / 1000, sourceType: 'Assumed', sourceReference: SCREENING_REF };
      if (out.useTerminalVelocityAsCharacteristic === undefined) out.useTerminalVelocityAsCharacteristic = true;
    }
  }
  if (out.hindranceExponent === undefined && (out.useTerminalVelocityAsCharacteristic === true || out.characteristicVelocity !== undefined)) {
    // Engine contract: a characteristic-velocity basis always requires n; in the
    // default d32/terminal-velocity screening method n = 1 is carried as the
    // engine's explicit Assumed entry (recorded in the run's assumption register,
    // not surfaced as a workspace input).
    const n = num(inputs.hindrance_exponent) ?? 1;
    if (n > 0) out.hindranceExponent = { value: n, sourceType: 'Assumed', sourceReference: `${SCREENING_REF} — n pending laboratory validation` };
  }

  return out;
}
