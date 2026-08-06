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

export function mapWorkspaceProcessDesignInputs(inputs: Record<string, unknown>, calculationType?: string): Record<string, unknown> {
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
  // The Stage 5 override field wins over the Fluid Properties entry; the
  // engineer-selected source type/reference is propagated, not hard-coded.
  if (out.interfacialTension === undefined) {
    const iftOverride = num(inputs.interfacial_tension); // Stage 5 hydraulic_design field
    const iftFp = num(inputs.interfacial_tension_value); // Fluid Properties entry
    const overridden = iftOverride !== undefined && iftOverride > 0 && iftOverride !== iftFp;
    const ift = overridden ? iftOverride : iftFp;
    if (ift !== undefined && ift > 0) {
      const src = String(inputs.interfacial_tension_source ?? '').trim();
      const refRaw = String(inputs.interfacial_tension_source_reference ?? '').trim();
      const refT = num(String(inputs.interfacial_tension_ref_temp ?? '70').replace(/°?C/gi, '')) ?? 70;
      out.interfacialTension = {
        value: ift / 1000,
        referenceTemperatureC: refT,
        sourceType: overridden ? 'Assumed' : (SOURCE_TYPES.includes(src) ? src : 'Assumed'),
        sourceReference: overridden
          ? 'Engineer-entered interfacial tension (Stage 5 Common Hydraulic workspace) — pending validation'
          : refRaw !== ''
            ? refRaw
            : SOURCE_TYPES.includes(src)
              ? `Two-Phase Properties workspace entry (engineer source type: ${src})`
              : 'Thermopac Preliminary Screening Default (Two-Phase Properties workspace entry)',
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

  // ── Stage 7 (Equipment Design) extras — restructuring/unit conversion only ──
  // Applied ONLY for the equipment calculation types: ECR/ECP-specific keys
  // must never leak into C2 (process_design) or C3 (hydraulics_common) snapshots.
  const isEquipment = calculationType === 'ecp' || calculationType === 'ecr';
  if (!isEquipment) return out;
  // Case mass flows (kg/h) from the established volumetric basis:
  //   RRBO: feed LPH × ρRRBO / 1000 ;  NMP: feed LPH × S/O(vol) × ρNMP(OT) / 1000
  //   maximum NMP flow = normal × maxCirculationFactor (Design Margin rule).
  if ((out.normalCase === undefined || out.maximumCase === undefined)
      && feedLph !== undefined && feedLph > 0 && rho !== undefined && rho > 0
      && soVol !== undefined && soVol > 0 && ot !== undefined) {
    try {
      const rhoNmp = getProperty('nmp', 'density', ot).value;
      const mRRBO = (feedLph / 1000) * rho;
      const mNMPn = (feedLph / 1000) * soVol * rhoNmp;
      const circ = num(out.maxCirculationFactor) ?? 1;
      if (out.normalCase === undefined) out.normalCase = { rrboMassFlow_kg_h: mRRBO, nmpMassFlow_kg_h: mNMPn };
      if (out.maximumCase === undefined) out.maximumCase = { rrboMassFlow_kg_h: mRRBO, nmpMassFlow_kg_h: mNMPn * circ };
    } catch { /* EPD out of range — engine validation reports the gap */ }
  }

  // Generic engineer-entered tagged mapper for Stage 7 flat fields.
  const ENG_REF = 'Engineer-entered (Stage 7 Equipment Design workspace) — pending validation';
  const taggedFrom = (wsKey: string, engineKey: string, opts?: { scale?: number; pctToFraction?: boolean; ref?: string }) => {
    if (out[engineKey] !== undefined) return;
    let v = num(inputs[wsKey]);
    if (v === undefined || v <= 0) return;
    if (opts?.pctToFraction && v > 1) v = v / 100;
    if (opts?.scale) v = v * opts.scale;
    out[engineKey] = { value: v, sourceType: 'Assumed', sourceReference: opts?.ref ?? ENG_REF };
  };

  // ECR — genuine engineering inputs (Stage 7 ECR panel)
  taggedFrom('rotor_diameter', 'rotorDiameter');
  taggedFrom('rotor_ratio', 'rotorToColumnDiameterRatio');
  taggedFrom('rotor_speed', 'rotorSpeed');
  taggedFrom('power_number', 'powerNumber');
  taggedFrom('compartment_height', 'compartmentHeight');
  taggedFrom('compartment_efficiency', 'compartmentEfficiency', { pctToFraction: true });
  taggedFrom('shaft_efficiency', 'shaftEfficiency', { pctToFraction: true });
  taggedFrom('mechanical_design_margin', 'mechanicalDesignMargin');
  taggedFrom('rotors_per_compartment', 'rotorsPerCompartment');
  const VENDOR_REF = 'Engineer/vendor-entered limit (Stage 7 workspace) — pending vendor confirmation';
  taggedFrom('max_tip_speed', 'maxAllowableTipSpeed', { ref: VENDOR_REF });
  taggedFrom('max_shaft_power', 'maxAllowableShaftPower', { ref: VENDOR_REF });
  taggedFrom('max_unsupported_shaft_length', 'maxUnsupportedShaftLength', { ref: VENDOR_REF });
  if (out.rotorType === undefined) {
    const rt = String(inputs.rotor_type ?? '').trim();
    // Identification label only (engine carries no rotor-type correlation) —
    // the workspace default label is applied when the engineer leaves it as-is.
    out.rotorType = rt !== '' ? rt : 'Kühni turbine (default label)';
  }
  if (out.powerDensityBasis === undefined) out.powerDensityBasis = 'continuous_phase';
  // Continuous-phase viscosity (required by ECR when NMP is continuous):
  // NMP dynamic viscosity, workspace mPa·s → Pa·s.
  if (out.continuousPhaseViscosity === undefined) {
    const isNmpCont = String(out.phaseConfiguration ?? '') === 'nmp_continuous_rrbo_dispersed';
    const muKey = isNmpCont ? 'nmp_viscosity_dynamic_value' : 'rrbo_viscosity_dynamic_value';
    const muC = num(inputs[muKey]);
    if (muC !== undefined && muC > 0) {
      const refT = num(String(inputs[isNmpCont ? 'nmp_viscosity_dynamic_ref_temp' : 'rrbo_viscosity_dynamic_ref_temp'] ?? '').replace(/°?C/gi, ''));
      out.continuousPhaseViscosity = {
        value: muC / 1000,
        referenceTemperatureC: refT ?? ot ?? 70,
        sourceType: 'Assumed',
        sourceReference: 'Fluid Properties workspace entry (dynamic viscosity, mPa·s converted to Pa·s)',
      };
    }
  }
  // Height allowances — engineer/vendor dimensions, mapped ONLY when entered
  // (the engines list missing ones explicitly; nothing is defaulted here).
  taggedFrom('drive_seal_bearing_allowance', 'driveSealBearingAllowance');
  taggedFrom('top_head_height', 'topHeadHeight');
  taggedFrom('top_disengagement_height', 'topDisengagementHeight');
  taggedFrom('top_distributor_allowance', 'topDistributorAllowance');
  taggedFrom('packing_support_allowance', 'packingSupportAllowance');
  taggedFrom('hold_down_allowance', 'holdDownAllowance');
  taggedFrom('bottom_distributor_allowance', 'bottomDistributorAllowance');
  taggedFrom('bottom_disengagement_height', 'bottomDisengagementHeight');
  taggedFrom('bottom_head_height', 'bottomHeadHeight');
  taggedFrom('redistributor_allowance', 'redistributorAllowance');

  // ECP — Packing Database reference + system HETS record
  if (out.packingId === undefined && String(inputs.packing_id ?? '').trim() !== '') {
    out.packingId = String(inputs.packing_id).trim();
  }
  const hetsVal = num(inputs.hets);
  if (out.hets === undefined && hetsVal !== undefined && hetsVal > 0) {
    const src = String(inputs.hets_source ?? '').trim();
    out.hets = {
      value: hetsVal,
      unit: 'm',
      operatingTemperatureC: ot ?? 0,
      solvent: 'NMP',
      feed: 'RRBO (Re-Refined Base Oil)',
      packing: String(inputs.packing_id ?? inputs.packing_type ?? 'unspecified packing').trim(),
      sourceType: SOURCE_TYPES.includes(src) ? src : 'Assumed',
      sourceReference: String(inputs.hets_source_reference ?? '').trim() !== ''
        ? String(inputs.hets_source_reference).trim()
        : 'Engineer-entered system HETS (Stage 7 ECP workspace) — pending validation',
    };
    if (out.heightBasis === undefined) out.heightBasis = 'HETS';
  }

  return out;
}
