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
import { getPacking } from './engine-framework/packing/database';
import { DUSS2013_DATASETS } from './engine-framework/cel/packing-single-phase';
import {
  ecr2Stage8EvidenceFingerprint,
  findEcr2Stage8Evidence,
  resolveEcr2Stage8Evidence,
} from '../shared/ecr2-stage8-evidence';
import { getEcr2PhysicalComponentBasis } from '../shared/ecr2-physical-property-basis';
import { resolveRrboSn300DynamicViscosityAtTemperature } from '../shared/ecr2-stage8-transport-basis';
import { signEcr2Stage8ResolverRecord } from './engines/llx/llx-ecr2-stage8-resolution-signature';

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

  // Governing equilibrium temperature: the workspace Extraction Temperature
  // field (auto-populated from the Design Basis Operating Temperature until
  // manually changed) governs the C2 N_T equilibrium basis. It takes
  // precedence over operating_temperature so a manual extraction-temperature
  // entry actually drives the Coto/NRTL model selection.
  const ot = out.operatingTemperature !== undefined
    ? num(out.operatingTemperature)
    : (num(inputs.extraction_temperature) ?? num(inputs.operating_temperature));
  if (out.operatingTemperature === undefined && ot !== undefined) out.operatingTemperature = ot;

  // Extraction Temperature — the governing LLE calculation input. The
  // workspace tracks Design Basis OT unless the engineer manually overrides
  // it (extraction_temperature_manual = "true"). Provenance is carried so the
  // engine's temperature-model trace names the actual source.
  const extT = num(inputs.extraction_temperature);
  if (out.extractionTemperature === undefined && extT !== undefined) {
    out.extractionTemperature = extT;
    if (out.extractionTemperatureProvenance === undefined) {
      out.extractionTemperatureProvenance = String(inputs.extraction_temperature_manual ?? '') === 'true'
        ? 'Extraction Temperature — engineer-entered manual override (Process Design workspace)'
        : 'Extraction Temperature — tracking Design Basis Operating Temperature (Process Design workspace)';
    }
  }

  // Feed flow — Design Basis capacity (LPH → m³/h, volumetric basis)
  const feedLph = num(inputs.design_capacity_lph) ?? num(inputs.design_capacity);
  if (out.feedFlow === undefined && feedLph !== undefined && feedLph > 0) {
    out.feedFlow = { value: feedLph / 1000, basis: 'volumetric' };
  }

  // RRBO grade → EPD fluid ID (governed; no cross-grade fallback).
  // The workspace stores the Feed Service label (e.g. "Re-Refined Base Oil SN300").
  const RRBO_GRADE_FLUID_IDS: Record<string, string> = {
    'Re-Refined Base Oil SN150': 'rrbo-sn150',
    'Re-Refined Base Oil SN200': 'rrbo-sn200',
    'Re-Refined Base Oil SN300': 'rrbo-sn300',
    'Re-Refined Base Oil SN500': 'rrbo-sn500',
  };
  const feedService = String(inputs.feed_service ?? '').trim();
  const rrboFluidId = RRBO_GRADE_FLUID_IDS[feedService] ?? 'rrbo-sn300';
  // Stage 8 physical-family eligibility must be derived from the governed
  // workspace Feed Service label, not an engine-shaped/client-carried fluid ID.
  // Unknown or blank grades deliberately receive no physical-MW registry basis.
  const authoritativeRrboGradeId = Object.prototype.hasOwnProperty.call(RRBO_GRADE_FLUID_IDS, feedService)
    ? RRBO_GRADE_FLUID_IDS[feedService]
    : undefined;
  if (out.rrboFluidId === undefined) out.rrboFluidId = rrboFluidId;

  // S/O ratio — workspace basis is VOLUME (NMP vol flow / RRBO vol flow).
  // Engine expects mass basis: multiply by ρNMP(OT)/ρRRBO(grade, OT).
  // Both densities are evaluated from the governed EPD library — no user entry.
  const soVol = num(inputs.so_ratio);
  if (out.solventToOilRatio === undefined && soVol !== undefined && soVol > 0 && ot !== undefined) {
    try {
      const rhoNmp  = getProperty('nmp',        'density', ot).value; // kg/m³
      const rhoRrbo = getProperty(rrboFluidId,  'density', ot).value; // kg/m³
      out.solventToOilRatio = soVol * (rhoNmp / rhoRrbo);
      out.solventToOilRatioBasisNote =
        `Converted from volume-basis S/O ratio ${soVol} (NMP vol / RRBO vol) using ρNMP(${ot} °C) = ${rhoNmp.toFixed(1)} kg/m³ / ρRRBO ${feedService || rrboFluidId}(${ot} °C) = ${rhoRrbo.toFixed(1)} kg/m³`;
    } catch {
      /* EPD out of range — leave unset; engine validation reports it */
    }
  }

  const stages = num(inputs.theoretical_stages);
  const stagesSource = String(inputs.theoretical_stages_source ?? '').trim();
  // Pass to the engine as Engineer Override ONLY when the user explicitly entered/changed
  // the value (source === 'override'). Never re-pass an auto-calculated value back as an
  // override — that would suppress the Coto 2022 LLE calculation on subsequent runs.
  if (out.theoreticalStages === undefined && stages !== undefined && stagesSource !== 'calculated') {
    out.theoreticalStages = stages;
  }

  // ── Governed Coto 2022 LLE stage inputs (N_T auto-calculation) ─────────────
  // Restructuring only: flat workspace fields → lleStageInputs TaggedValues.
  // Nothing is defaulted or invented — missing fields simply stay absent and
  // the engine fails closed listing them.
  if (out.lleStageInputs === undefined) {
    const taggedFrom = (valueKey: string, srcKey: string, refKey: string, scale = 1): Record<string, unknown> | undefined => {
      const v = num(inputs[valueKey]);
      if (v === undefined) return undefined;
      const src = String(inputs[srcKey] ?? '').trim();
      const ref = String(inputs[refKey] ?? '').trim();
      const tagged = SOURCE_TYPES.includes(src);
      return {
        value: v * scale,
        sourceType: tagged ? src : 'Assumed',
        sourceReference: ref !== '' ? ref : (tagged ? 'Process Design workspace entry (engineer source type)' : 'Process Design workspace entry — no engineer source type selected'),
      };
    };
    const lle: Record<string, unknown> = {};
    const ch: Record<string, unknown> = {};
    const chPairs: Array<[string, string]> = [
      ['saturates', 'rrbo_saturates_wt'], ['monoAromatics', 'rrbo_mono_aromatics_wt'],
      ['diAromatics', 'rrbo_di_aromatics_wt'], ['polyAromatics', 'rrbo_poly_aromatics_wt'],
    ];
    for (const [k, wsKey] of chPairs) {
      const t = taggedFrom(wsKey, 'rrbo_characterisation_source', 'rrbo_characterisation_source_reference');
      if (t) ch[k] = t;
    }
    if (Object.keys(ch).length > 0) lle.rrboCharacterisationWtPct = ch;
    // Class MWs and Total Aromatics are NOT passed to the engine:
    //   • wt%→mol uses fixed Coto 2022 surrogate MWs (engine constants — no user entry).
    //   • Total Aromatics is derived by the engine as mono + di + poly.
    // Target Raffinate Aromatics — governed provenance handling.
    // The generic taggedFrom fallback is NOT used here: a source reference that
    // is numerically identical to the target value is not a real reference
    // (it means the field was left blank or mistyped). Store blank in that case.
    // Never invent a sourceReference from the numeric target value itself.
    const tgtV = num(inputs['target_raffinate_aromatics_mol']);
    if (tgtV !== undefined) {
      const tgtSrc = String(inputs['target_raffinate_aromatics_source'] ?? '').trim();
      const tgtRefRaw = String(inputs['target_raffinate_aromatics_source_reference'] ?? '').trim();
      // Reject numeric-mirror refs (e.g. ref === "10" when target value is 10)
      const isNumericMirror = tgtRefRaw !== '' &&
        Number.isFinite(parseFloat(tgtRefRaw)) &&
        Math.abs(parseFloat(tgtRefRaw) - tgtV) < 1e-9;
      const tgtRef = isNumericMirror ? '' : tgtRefRaw;
      lle.targetRaffinateAromaticsMolePct = {
        value: tgtV,
        sourceType: SOURCE_TYPES.includes(tgtSrc) ? tgtSrc : 'Assumed',
        // Engine parseTagged requires a non-blank sourceReference.
        // Fall back to a descriptive placeholder when the engineer has not yet
        // entered a reference — never mirror the numeric value itself (A-ref rule).
        sourceReference: tgtRef !== ''
          ? tgtRef
          : 'Target raffinate aromatics — source reference not entered; enter the product-quality specification document (Stage 4)',
      };
    }
    const sPur = taggedFrom('solvent_nmp_mole_fraction', 'solvent_nmp_mole_fraction_source', 'solvent_nmp_mole_fraction_source_reference');
    if (sPur) lle.solventNmpMoleFraction = sPur;
    if (Object.keys(lle).length > 0) out.lleStageInputs = lle;
  }

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
  // feedViscosity — value, reference temperature, and source must all be present.
  // No fallback on referenceTemperatureC (A-11). If blank → block; engine reports missing input.
  if (out.feedViscosity === undefined) {
    const mu = num(inputs.rrbo_viscosity_dynamic_value);
    const refT = num(String(inputs.rrbo_viscosity_dynamic_ref_temp ?? '').replace(/°?C/gi, ''));
    if (mu !== undefined && mu > 0 && refT !== undefined) {
      const src = String(inputs.rrbo_viscosity_dynamic_source ?? '').trim();
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
  // feedDensity: RRBO (dispersed phase / feed oil) density — auto-populated from
  // the governed EPD tabular library at operating temperature. No user entry is
  // required or accepted for this property (governed A-5; no default correlations).
  // The same getProperty call is already used for the S/O ratio conversion above.
  if (out.feedDensity === undefined && ot !== undefined) {
    try {
      const rhoRrbo = getProperty(rrboFluidId, 'density', ot);
      out.feedDensity = {
        value: rhoRrbo.value,           // kg/m³
        referenceTemperatureC: ot,
        sourceType: 'Assumed',
        sourceReference: `EPD library — ${feedService || rrboFluidId} density at ${ot} °C (governed tabular interpolation, Assumed — no user entry)`,
      };
    } catch {
      /* EPD out of range — engine validation will report the missing density */
    }
  }

  // Interfacial tension: workspace mN/m → engine N/m (tagged, optional input).
  // The Stage 5 override field wins over the Fluid Properties entry; the
  // engineer-selected source type/reference is propagated, not hard-coded.
  // interfacialTension — value, reference temperature, and source must travel together (A-11).
  // No fallback on referenceTemperatureC. If blank → block; engine reports missing input.
  if (out.interfacialTension === undefined) {
    const iftOverride = num(inputs.interfacial_tension); // Stage 5 hydraulic_design field
    const iftFp = num(inputs.interfacial_tension_value); // Fluid Properties entry
    const overridden = iftOverride !== undefined && iftOverride > 0 && iftOverride !== iftFp;
    const ift = overridden ? iftOverride : iftFp;
    const refT = num(String(inputs.interfacial_tension_ref_temp ?? '').replace(/°?C/gi, ''));
    if (ift !== undefined && ift > 0 && refT !== undefined) {
      const src = String(inputs.interfacial_tension_source ?? '').trim();
      const refRaw = String(inputs.interfacial_tension_source_reference ?? '').trim();
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
  // Task #69 — Forward engineer-entered throughput utilisation band upper limit to C3.
  // The engine slot is screeningBandPercent: { min, max }. The governed lower limit is
  // 40% — immovable project criterion. The engineer may tighten the upper limit below
  // the governed 80% default (e.g. 65% for a more conservative screening).
  // Values above 80% are accepted by the engine validator but are outside the agreed
  // project screening basis — leave them to the engineer's judgment.
  if (out.screeningBandPercent === undefined) {
    const bandMax = num(inputs.flooding_margin_design);
    const BAND_MIN = 40; // GOVERNED_SCREENING_BAND.min — immovable project criterion
    if (bandMax !== undefined && bandMax > BAND_MIN && bandMax <= 100) {
      out.screeningBandPercent = { min: BAND_MIN, max: bandMax };
    }
  }
  // Droplet basis — Sauter mean diameter d32 (workspace mm → engine m) with rigid-sphere
  // terminal velocity used as the provisional characteristic velocity (u_K = u_T,
  // Preliminary / Pending Validation — see engine warning CHARACTERISTIC_VELOCITY_FROM_RIGID_SPHERE_SCREENING).
  // Hindrance exponent n is a governed, source-tagged engineering input for BOTH hydraulic
  // models. Both d32 and n are pre-populated in the UI with screening defaults
  // (d32 = 3 mm, n = 1, both Assumed — Preliminary / Pending Validation) and stored
  // explicitly in the workspace. The mapper uses only the values present in the workspace —
  // no hidden fallbacks for either parameter.
  const SCREENING_REF = 'Thermopac Preliminary Screening Default';
  const uKModel = String(inputs.hydraulic_model ?? '').trim() === 'characteristic_velocity';
  if (uKModel && out.characteristicVelocity === undefined) {
    const uk = num(inputs.characteristic_velocity);
    if (uk !== undefined && uk > 0) {
      const VALID_SRC_UK = ['Measured', 'Vendor', 'Literature', 'Assumed'];
      const ukSrc = String(inputs.characteristic_velocity_source ?? '').trim();
      const ukRef = String(inputs.characteristic_velocity_source_ref ?? '').trim();
      out.characteristicVelocity = {
        value: uk,
        sourceType: VALID_SRC_UK.includes(ukSrc) ? ukSrc : 'Assumed',
        sourceReference: ukRef !== '' ? ukRef : 'Engineer-entered characteristic velocity (Stage 5 workspace) — source not specified',
      };
    }
  }
  // d32 has no silent default — A-5. If blank the engine receives no sauterMeanDiameter
  // and blocks with a missing-input error (fail-closed).
  // useTerminalVelocityAsCharacteristic is set unconditionally when in d32_terminal mode
  // so the engine's existing validation ("useTerminalVelocityAsCharacteristic requires
  // sauterMeanDiameter") fires and returns a proper error status — instead of silently
  // running the sweep with all rows 'not_calculable' and minimumFeasibleDiameter_m = null.
  if (!uKModel && out.sauterMeanDiameter === undefined && out.characteristicVelocity === undefined) {
    const d32mm = num(inputs.sauter_mean_d32);
    if (d32mm !== undefined && d32mm > 0) {
      const VALID_SRC = ['Measured', 'Vendor', 'Literature', 'Assumed'];
      const d32src = String(inputs.sauter_mean_d32_source ?? '').trim();
      const d32ref = String(inputs.sauter_mean_d32_source_ref ?? '').trim();
      out.sauterMeanDiameter = {
        value: d32mm / 1000,
        sourceType: VALID_SRC.includes(d32src) ? d32src : 'Assumed',
        sourceReference: d32ref !== '' ? d32ref : SCREENING_REF,
      };
    }
    if (out.useTerminalVelocityAsCharacteristic === undefined) out.useTerminalVelocityAsCharacteristic = true;
  }
  if (out.hindranceExponent === undefined) {
    // n is a governed, source-tagged engineering parameter for BOTH hydraulic models.
    // The UI pre-populates n = 1 (Assumed — Preliminary / Pending Validation) for
    // new d32_terminal cases so the value is always explicit and visible in the
    // workspace. No hidden fallback is applied here — if n is absent from the
    // workspace the engine blocks with a missing-input error (fail-closed, both modes).
    const VALID_SRC_N = ['Measured', 'Vendor', 'Literature', 'Assumed'];
    const nRaw = num(inputs.hindrance_exponent);
    const nSrc = String(inputs.hindrance_exponent_source ?? '').trim();
    const nRef = String(inputs.hindrance_exponent_source_ref ?? '').trim();

    if (nRaw !== undefined && nRaw > 0) {
      out.hindranceExponent = {
        value: nRaw,
        sourceType: VALID_SRC_N.includes(nSrc) ? nSrc : 'Assumed',
        sourceReference: nRef !== '' ? nRef : 'Engineer-entered hindrance exponent (Stage 5 workspace)',
      };
    }
    // n absent: no hindranceExponent emitted → engine blocks with a missing-input
    // error (fail-closed). New cases should never reach here because the UI
    // pre-populates n = 1 at first load.
  }

  // ── Pressure drop basis (HYD-009) — Duss 2013 / Zogg (Stage 5 workspace fields)
  // cf is AUTO-CALCULATED from the governed Duss 2013 Table 2 dataset — NOT user-entered.
  // Governed dataset is selected by SSA (not by corrugation angle):
  //   a = 250 m²/m³ → Table 2-A (45°/Y-type, MellapakPlus 252.Y basis, Re 143–7144)
  //   a = 500 m²/m³ → Table 2-B (30°/X-type, BXPlus basis, Re 71–3572)
  //   a = 300/350/400/450 m²/m³ → dh = 4/a calculable; cf/ΔP Not Calculable (no governed dataset)
  // No silent defaults — all packing geometry fields fail closed when blank (A-series).
  // Out-of-range policy is enforced in the engine by evaluateDuss2013ReCf().
  if (out.pressureDropBasis === undefined && calculationType === 'hydraulics_common') {
    // Packing geometry — no silent defaults (A-series). Fail closed when blank.
    const psaVal = num(inputs.packing_specific_surface_value);
    const psaSrc = String(inputs.packing_specific_surface_source_type ?? '').trim();
    const psaRef = String(inputs.packing_specific_surface_source_ref ?? '').trim();

    // Corrugation angle — no silent defaults (A-series). Fail closed when blank.
    const angVal = num(inputs.packing_corrugation_angle_value);
    const angSrc = String(inputs.packing_corrugation_angle_source_type ?? '').trim();
    const angRef = String(inputs.packing_corrugation_angle_source_ref ?? '').trim();

    // Governed Duss 2013 dataset selected by SSA — never by corrugation angle alone.
    // 300/350/400/450 m²/m³ have no governed cf characterisation in Duss 2013.
    const governedDataset = psaVal === 250 ? DUSS2013_DATASETS[45]
                          : psaVal === 500 ? DUSS2013_DATASETS[30]
                          : null;

    if (psaVal !== undefined && psaVal > 0 && psaSrc && psaRef) {
      const pdBasis: Record<string, unknown> = {
        packingSpecificSurface: { value: psaVal, sourceType: psaSrc, sourceReference: psaRef },
      };
      if (angVal !== undefined && angSrc && angRef) {
        pdBasis.packingCorrugationAngleDeg = { value: angVal, sourceType: angSrc, sourceReference: angRef };
      }
      if (governedDataset) {
        // Inject the full governed dataset — engine evaluates cf at run-time Re
        pdBasis.governedReCfDataset = governedDataset;
      } else {
        // No governed cf dataset for this SSA — engine marks pressure drop Not Calculable.
        // d_h = 4/a is still calculable; only cf/ΔP are blocked.
        const INTERMEDIATE = [300, 350, 400, 450];
        pdBasis.governedReCfDatasetNote = INTERMEDIATE.includes(psaVal as number)
          ? `No governed Duss 2013 cf dataset for a = ${psaVal} m²/m³. ` +
            'Duss 2013 characterises only 250 m²/m³ (MellapakPlus 252.Y, Table 2-A) and 500 m²/m³ (BXPlus, Table 2-B). ' +
            'Hydraulic diameter d_h = 4/a is calculable; friction factor and pressure drop: Not Calculable. ' +
            'Provide a vendor pressure-drop override to proceed.'
          : `No governed Duss 2013 dataset for a = ${psaVal} m²/m³.`;
      }
      // Optional vendor pressure drop override — supersedes governed calculation
      const vdpVal = num(inputs.vendor_dp_value);
      const vdpSrc = String(inputs.vendor_dp_source_type ?? '').trim();
      const vdpRef = String(inputs.vendor_dp_source_ref ?? '').trim();
      if (vdpVal !== undefined && vdpVal > 0 && vdpSrc && vdpRef) {
        pdBasis.vendorPressureDropBasis = {
          kind: 'constant',
          value: vdpVal,
          unit: 'Pa/m',
          applicabilityNote: 'Vendor pressure drop datum — supersedes the governed-literature basis; literature calculation retained for comparison.',
          sourceType: vdpSrc,
          sourceReference: vdpRef,
        };
      }
      out.pressureDropBasis = pdBasis;
    }
  }

  // ── Stage 7 (Equipment Design) extras — restructuring/unit conversion only ──
  // Applied ONLY for the equipment calculation types: ECR/ECP-specific keys
  // must never leak into C2 (process_design) or C3 (hydraulics_common) snapshots.
  const isEquipment = calculationType === 'ecp' || calculationType === 'ecr' || calculationType === 'ecr_simulator';
  if (!isEquipment) return out;
  // Case mass flows (kg/h) from the established volumetric basis:
  //   RRBO: feed LPH × ρRRBO / 1000 ;  NMP: feed LPH × S/O(vol) × ρNMP(OT) / 1000
  //   maximum NMP flow = normal × maxCirculationFactor (Design Margin rule).
  if ((out.normalCase === undefined || out.maximumCase === undefined)
      && feedLph !== undefined && feedLph > 0
      && soVol !== undefined && soVol > 0 && ot !== undefined) {
    try {
      const rhoNmp  = getProperty('nmp',       'density', ot).value;
      const rhoRrbo = getProperty(rrboFluidId, 'density', ot).value;
      const mRRBO = (feedLph / 1000) * rhoRrbo;
      const mNMPn = (feedLph / 1000) * soVol * rhoNmp;
      const circ = num(out.maxCirculationFactor) ?? 1;
      if (out.normalCase === undefined) out.normalCase = { rrboMassFlow_kg_h: mRRBO, nmpMassFlow_kg_h: mNMPn };
      if (out.maximumCase === undefined) out.maximumCase = { rrboMassFlow_kg_h: mRRBO, nmpMassFlow_kg_h: mNMPn * circ };
    } catch { /* EPD out of range — engine validation reports the gap */ }
  }

  // ECR-2 simulator boundary. This is an adapter only: it derives inherited
  // workspace values and leaves the explicit simulator/BVP activation section
  // untouched. No BVP equation or physical-property correlation belongs here.
  if (calculationType === 'ecr_simulator') {
    const normal = out.normalCase as Record<string, unknown> | undefined;
    const rrboMassFlow = num(normal?.rrboMassFlow_kg_h);
    const nmpMassFlow = num(normal?.nmpMassFlow_kg_h);
    const pct = (key: string) => {
      const value = num(inputs[key]);
      return value === undefined ? undefined : value / 100;
    };
    const comp = {
      saturates: pct('rrbo_saturates_wt'),
      mono: pct('rrbo_mono_aromatics_wt'),
      di: pct('rrbo_di_aromatics_wt'),
      poly: pct('rrbo_poly_aromatics_wt'),
    };
    if (out.operatingTemperatureC === undefined && ot !== undefined) out.operatingTemperatureC = ot;
    if (out.rrboMassFlow_kg_h === undefined && rrboMassFlow !== undefined) out.rrboMassFlow_kg_h = rrboMassFlow;
    if (out.nmpMassFlow_kg_h === undefined && nmpMassFlow !== undefined) out.nmpMassFlow_kg_h = nmpMassFlow;
    if (out.feedCompositionMassFraction === undefined && Object.values(comp).every(v => v !== undefined)) {
      out.feedCompositionMassFraction = comp;
    }
    // Fluid Properties seeds NMP purity as nmp_purity (wt.%); retain the
    // legacy solvent_nmp_mole_fraction field only as a fallback for older
    // workspace payloads. The simulator requires a mass fraction.
    //
    // The simulator section can also persist the camelCase nmpPurity key. A
    // saved 99.5 there is still the workspace's wt.% representation, not an
    // engine-ready fraction, so normalize it too rather than letting it bypass
    // the adapter merely because its key already has camelCase spelling.
    // The Stage 3 PropertyRow persistence shape is `${property}_value`, so
    // nmp_purity_value is the authoritative workspace field. Check it before
    // legacy or engine-shaped aliases: purity is inherited from Fluid
    // Properties and is not an ECR-2 simulator override.
    const nmpPurity = num(inputs.nmp_purity_value)
      ?? num(inputs.nmp_purity)
      ?? num(inputs.solvent_nmp_mole_fraction)
      ?? num(out.nmpPurity);
    if (nmpPurity !== undefined) out.nmpPurity = nmpPurity > 1 ? nmpPurity / 100 : nmpPurity;
    // Stage 4 owns the phase orientation. Do not let a stale engine-shaped
    // alias from another saved section override its selected configuration.
    const workspacePhase = String(inputs.phase_configuration ?? '').trim();
    if (workspacePhase !== '') out.phaseConfiguration = workspacePhase;
    else if (out.phaseConfiguration === undefined) out.phaseConfiguration = 'nmp_continuous_rrbo_dispersed';

    // Stage 7 is the governed owner of ECR geometry and operating values.
    // Stage 8 retains only its explicitly simulator-owned BVP inputs and one
    // permitted diameter override. Legacy simulator geometry keys are retained
    // in storage for audit/history but must not override the Stage 7 basis.
    const nested = (inputs.ecr2Simulator ?? inputs.ecr2_simulator ?? {}) as Record<string, unknown>;
    // runCalculation merges the ecr_simulator section directly into the input
    // record. Therefore its persisted UI fields are flat, not nested. Prefer a
    // nested API payload when present, then fall back to those exact flat keys.
    const simValue = (key: string) => nested[key] ?? inputs[key] ?? inputs[`simulator_${key}`];
    const simNum = (key: string) => num(simValue(key));
    // mapWorkspaceProcessDesignInputs begins with a flat copy of every saved
    // section. Remove old Stage-8 simulator geometry aliases before the normal
    // Stage-7 tagged mapper runs below; otherwise a raw legacy string would
    // falsely count as an engine-ready value and bypass its governing source.
    for (const key of [
      'powerNumber', 'statorOpenAreaFraction', 'shaftEfficiency',
      'mechanicalDesignMargin', 'compartmentHeight',
    ]) {
      delete out[key];
    }
    out.columnDiameter_m = simNum('columnDiameter_m') ?? num(inputs.column_diameter);
    out.activeHeight_m = num(inputs.ecr_active_height_m);
    out.compartmentHeight_m = num(inputs.compartment_height);
    out.rotorToColumnDiameterRatio = num(inputs.rotor_ratio);
    out.rotorSpeed_rpm = num(inputs.rotor_speed);
    // Do not write an empty Stage 7 label into the mapped payload. The generic
    // ECR mapper below applies the explicit workspace identification fallback
    // when the field is blank; assigning "" here would suppress that fallback
    // and make the simulator fail its mandatory rotorType check.
    const stage7RotorType = String(inputs.rotor_type ?? '').trim();
    if (stage7RotorType !== '') out.rotorType = stage7RotorType;
    const parseJson = (value: unknown) => {
      if (typeof value !== 'string') return value;
      try { return JSON.parse(value); } catch { return undefined; }
    };
    // Flat workspace data arrives in `out` first. JSON strings are legacy
    // storage values, not engine-ready contracts, so release those keys for
    // the independent-field adapter below. Pre-structured programmatic inputs
    // retain their normal mapper precedence.
    for (const key of ['d32Config', 'molecularWeights', 'bvp']) {
      if (typeof out[key] === 'string') delete out[key];
    }
    const asRecord = (value: unknown): Record<string, any> =>
      value && typeof value === 'object' ? value as Record<string, any> : {};
    const legacyD32 = asRecord(parseJson(simValue('d32Config')));
    const d32Mode = String(simValue('d32_mode') ?? '').trim();
    if (out.d32Config === undefined) {
      if (d32Mode === 'engineer_supplied') {
        out.d32Config = {
          mode: 'engineer_supplied',
          value_m: (simNum('d32_value_mm') ?? Number.NaN) / 1000,
          sourceType: String(simValue('d32_source_type') ?? ''),
          sourceReference: String(simValue('d32_source_reference') ?? ''),
        };
      } else if (d32Mode === 'published_correlation') {
        out.d32Config = { mode: 'published_correlation', correlationId: 'ecr2_d32_kh1996' };
      } else if (legacyD32.mode) {
        // Backwards compatibility only. New Stage 8 workspaces do not edit
        // this JSON field; they select the route above.
        out.d32Config = legacyD32;
      } else {
        // The governed preliminary d₃₂ route is a calculated dependency, not
        // an engineer-entered numeric default.
        out.d32Config = { mode: 'published_correlation', correlationId: 'ecr2_d32_kh1996' };
      }
    }

    // Resolve the catalog at the calculation boundary, not in the browser.
    // Stage 8 owns the preliminary transport-property closure used to estimate
    // diffusivities. No browser-carried diffusivity or Coto surrogate MW can
    // become an automatic basis.
    let nmpViscosity: { value: number; source: string; evidenceLevel: 'PRIMARY_EQUATION_VERIFIED' | 'ENGINEER_APPROVED_PRELIMINARY'; warnings: string[] } | undefined;
    let nmpDensity: { value: number; source: string; evidenceLevel: 'PRIMARY_EQUATION_VERIFIED' | 'ENGINEER_APPROVED_PRELIMINARY'; warnings: string[] } | undefined;
    if (ot !== undefined) {
      try {
        const property = getProperty('nmp', 'dynamicViscosity', ot);
        nmpViscosity = {
          value: property.value,
          source: property.source,
          evidenceLevel: property.warnings.some((warning) => warning.code === 'EPD_ASSUMED_VALUE')
            ? 'ENGINEER_APPROVED_PRELIMINARY'
            : 'PRIMARY_EQUATION_VERIFIED',
          warnings: property.warnings.map((warning) => warning.message),
        };
      } catch {
        // The resolver will report operating-temperature availability as a
        // prerequisite rather than allowing a failed EPD lookup to escape.
      }
      try {
        const property = getProperty('nmp', 'density', ot);
        nmpDensity = {
          value: property.value,
          source: property.source,
          evidenceLevel: property.warnings.some((warning) => warning.code === 'EPD_ASSUMED_VALUE')
            ? 'ENGINEER_APPROVED_PRELIMINARY'
            : 'PRIMARY_EQUATION_VERIFIED',
          warnings: property.warnings.map((warning) => warning.message),
        };
      } catch {
        // The resolver preserves the named root gap when the EPD route cannot
        // produce a positive operating-temperature density.
      }
    }
    const registeredPhysicalBasis = getEcr2PhysicalComponentBasis(authoritativeRrboGradeId);
    const physicalComponents = registeredPhysicalBasis
      ? Object.fromEntries(Object.entries(registeredPhysicalBasis).map(([key, basis]) => [
        key,
        {
          molecularWeight_g_mol: {
            value: basis.physicalMw_g_mol,
            source: `${basis.source} Basis ${basis.sourceVersion}`,
            evidenceLevel: basis.evidenceLevel,
          },
          density_kg_m3: {
            value: basis.density_kg_m3,
            source: `RRBO SN300 physical family density anchor, ${basis.sourceVersion}`,
            evidenceLevel: basis.evidenceLevel,
          },
          method: basis.equation,
          physicalMwDecision: basis.decision,
        },
      ]))
      : undefined;
    const composition = asRecord(out.feedCompositionMassFraction);
    const componentMassFractions = ['sat', 'mono', 'di', 'poly'].map((key) => num(
      composition[key === 'sat' ? 'saturates' : key] ?? inputs[`rrbo_${key === 'sat' ? 'saturates' : `${key}_aromatics`}_wt`],
    ));
    const compositionSum = componentMassFractions.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const normalizedMassFractions = compositionSum > 0
      ? componentMassFractions.map((value) => (value ?? 0) / (compositionSum > 1.5 ? 100 : 1))
      : [];
    const rrboMolecularWeight = registeredPhysicalBasis
      && normalizedMassFractions.length === 4
      && normalizedMassFractions.every((value) => Number.isFinite(value) && value > 0)
      && Math.abs(normalizedMassFractions.reduce((sum, value) => sum + value, 0) - 1) < 1e-6
      ? (() => {
        const bases = ['sat', 'mono', 'di', 'poly'] as const;
        const inverseAverage = bases.reduce((sum, key, index) =>
          sum + normalizedMassFractions[index] / registeredPhysicalBasis[key].physicalMw_g_mol, 0);
        if (!Number.isFinite(inverseAverage) || inverseAverage <= 0) return undefined;
        return {
          value: 1 / inverseAverage,
          source: 'Task #92 RRBO SN300 physical pseudo-component basis; mass-fraction harmonic-average solvent MW for Wilke–Chang.',
          evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY' as const,
          warnings: [
            'RRBO_NMP_VALIDATION_PENDING',
            'RRBO solvent molecular weight is a feed-composition harmonic average of Task #92 physical pseudo-components; it is not a Coto/NRTL surrogate value.',
          ],
        };
      })()
      : undefined;
    let rrboViscosity: { value: number; source: string; evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY'; warnings: string[] } | undefined;
    if (authoritativeRrboGradeId === 'rrbo-sn300' && ot !== undefined) {
      try {
        const rrboDensityAtOt = getProperty('rrbo-sn300', 'density', ot);
        const workspaceViscosity_mPa_s = num(inputs.rrbo_viscosity_dynamic_value);
        const workspaceReferenceTemperature_C = num(String(inputs.rrbo_viscosity_dynamic_ref_temp ?? '').replace(/°?C/gi, ''));
        if (workspaceViscosity_mPa_s !== undefined && workspaceViscosity_mPa_s > 0
          && workspaceReferenceTemperature_C !== undefined
          && Math.abs(workspaceReferenceTemperature_C - ot) < 1e-9) {
          rrboViscosity = {
            value: workspaceViscosity_mPa_s / 1000,
            source: `Fluid Properties workspace RRBO dynamic viscosity at ${ot} °C`,
            evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY',
            warnings: ['RRBO_NMP_VALIDATION_PENDING', 'RRBO operating-temperature viscosity is a preliminary workspace property; replace with controlled vendor or laboratory data before release-grade use.'],
          };
        } else {
          let kinematicViscosity40_cSt: number | undefined;
          if (workspaceViscosity_mPa_s !== undefined && workspaceViscosity_mPa_s > 0
            && workspaceReferenceTemperature_C !== undefined
            && Math.abs(workspaceReferenceTemperature_C - 40) < 1e-9) {
            const densityAt40 = getProperty('rrbo-sn300', 'density', 40).value;
            kinematicViscosity40_cSt = workspaceViscosity_mPa_s * 1000 / densityAt40;
          }
          const resolved = resolveRrboSn300DynamicViscosityAtTemperature({
            temperature_C: ot,
            density_kg_m3: rrboDensityAtOt.value,
            kinematicViscosity40_cSt,
          });
          if (resolved) {
            rrboViscosity = {
              value: resolved.value_Pa_s,
              source: `${resolved.source}; RRBO density at ${ot} °C: ${rrboDensityAtOt.source}`,
              evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY',
              warnings: [...resolved.warnings, ...rrboDensityAtOt.warnings.map((warning) => warning.message)],
            };
          }
        }
      } catch {
        // The resolver reports a named RRBO operating-temperature property gap.
      }
    }
    const stage8Resolution = resolveEcr2Stage8Evidence({
      temperature_C: ot,
      nmp: registeredPhysicalBasis && (nmpViscosity || nmpDensity) ? {
        viscosity_Pa_s: nmpViscosity,
        molecularWeight_g_mol: {
          value: 99.13,
          source: 'NMP molecular weight 99.13 g/mol — CRC Handbook of Chemistry and Physics, 97th ed. (2016), 1-methyl-2-pyrrolidinone.',
          evidenceLevel: 'PRIMARY_EQUATION_VERIFIED',
          warnings: ['NMP pure-solvent molecular-weight basis; not a Coto/NRTL surrogate input.'],
        },
        associationFactor: {
          value: 1,
          source: 'Wilke–Chang (1955) solvent association-factor convention: non-hydrogen-bonding aprotic NMP preliminary φ = 1.0.',
          evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY',
          warnings: ['NMP Wilke–Chang association factor is a preliminary non-associating-solvent convention; validate for RRBO/NMP use before release-grade design.'],
        },
        density_kg_m3: nmpDensity,
      } : undefined,
      rrbo: rrboViscosity && rrboMolecularWeight ? {
        viscosity_Pa_s: rrboViscosity,
        molecularWeight_g_mol: rrboMolecularWeight,
        associationFactor: {
          value: 1,
          source: 'Wilke–Chang (1955) solvent association-factor convention: hydrocarbon-like RRBO preliminary φ = 1.0.',
          evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY',
          warnings: ['RRBO Wilke–Chang association factor is a preliminary hydrocarbon-solvent convention; validate for RRBO/NMP use before release-grade design.'],
        },
      } : undefined,
      physicalComponents: physicalComponents as any,
    });
    const legacyMw = asRecord(parseJson(simValue('molecularWeights')));
    const stage8Evidence: Record<string, {
      status: string;
      originalEvidence: string;
      resolverFingerprint: string;
      overrideReason: string;
      overrideUser: string;
      overrideAt: string;
      acceptedBy: string;
      acceptedAt: string;
    }> = {};
    const stage8Audit = (id: Parameters<typeof findEcr2Stage8Evidence>[0], prefix: string) => {
      const record = stage8Resolution.records[id] ?? findEcr2Stage8Evidence(id);
      const requestedStatus = String(simValue(`${prefix}_evidence_status`) ?? '');
      const isOverride = requestedStatus === 'ENGINEER_OVERRIDE';
      const originalEvidence = String(simValue(`${prefix}_original_evidence`) ?? '');
      const requestedFingerprint = String(simValue(`${prefix}_resolver_fingerprint`) ?? '');
      const isAcceptedAutoBasis = requestedStatus === 'ACCEPTED_AUTO_BASIS'
        && (record.status === 'AUTO_RESOLVED_PENDING_ACCEPTANCE' || record.status === 'CALCULATED_PRELIMINARY')
        && typeof record.value === 'number'
        && originalEvidence === ecr2Stage8EvidenceFingerprint(record)
        && requestedFingerprint === ecr2Stage8EvidenceFingerprint(record);
      const fingerprint = ecr2Stage8EvidenceFingerprint(record);
      return {
      // The workspace never authorizes an auto-resolution. Only a trusted catalog
      // candidate may be accepted; otherwise its blocking state is preserved.
      status: isOverride ? 'ENGINEER_OVERRIDE' : isAcceptedAutoBasis ? 'ACCEPTED_AUTO_BASIS' : record.status,
       originalEvidence: fingerprint,
      resolverFingerprint: fingerprint,
      overrideReason: String(simValue(`${prefix}_override_reason`) ?? ''),
      overrideUser: isOverride ? String(inputs.__stage8_actor_id ?? '') : '',
      overrideAt: isOverride ? String(inputs.__stage8_server_timestamp ?? '') : '',
       acceptedBy: isAcceptedAutoBasis ? String(inputs.__stage8_actor_id ?? '') : '',
       acceptedAt: isAcceptedAutoBasis ? String(inputs.__stage8_server_timestamp ?? '') : '',
       resolverRecord: record,
       resolverSignature: signEcr2Stage8ResolverRecord(fingerprint),
      };
    };
    const physicalMwFields = [
      ['sat', 'saturates_g_mol'],
      ['mono', 'mono_g_mol'],
      ['di', 'di_g_mol'],
      ['poly', 'poly_g_mol'],
    ] as const;
    const readPhysicalMw = (key: string, legacyKey: string) => {
      const prefix = `molecular_weight_${key}`;
      const audit = stage8Audit(
        `physical_mw_${key}` as 'physical_mw_sat' | 'physical_mw_mono' | 'physical_mw_di' | 'physical_mw_poly',
        prefix,
      );
      stage8Evidence[`physical_mw_${key}`] = audit;
      const value = simNum(`molecular_weight_${key}_value`);
      const sourceType = String(simValue(`molecular_weight_${key}_source_type`) ?? '').trim();
      const sourceReference = String(simValue(`molecular_weight_${key}_source_reference`) ?? '').trim();
      const automatic = (audit as any).resolverRecord;
       if ((automatic?.status === 'AUTO_RESOLVED_PENDING_ACCEPTANCE' || automatic?.status === 'CALCULATED_PRELIMINARY')
         && typeof automatic.value === 'number') {
        return {
          value: automatic.value,
          unit: 'g/mol',
          sourceType: automatic.evidenceLevel === 'ENGINEER_APPROVED_PRELIMINARY' ? 'Assumed' : 'Literature',
          sourceReference: automatic.source,
          evidenceStatus: audit.status,
          originalEvidence: audit.originalEvidence,
          resolverMethod: automatic.method,
          resolverInputs: automatic.inputSnapshot ?? automatic.resolutionInputs,
        };
      }
      if (audit.status === 'ENGINEER_OVERRIDE' && (value !== undefined || sourceType !== '' || sourceReference !== '')) {
        return {
          value: value ?? Number.NaN,
          unit: 'g/mol',
          sourceType,
          sourceReference,
          evidenceStatus: audit.status,
          originalEvidence: audit.originalEvidence,
          overrideReason: audit.overrideReason,
          overrideUser: audit.overrideUser,
          overrideAt: audit.overrideAt,
        };
      }
      return legacyMw[legacyKey];
    };
    if (out.molecularWeights === undefined) {
      const mappedMw = Object.fromEntries(
        physicalMwFields.map(([key, legacyKey]) => [legacyKey, readPhysicalMw(key, legacyKey)]),
      );
      if (Object.values(mappedMw).some((value) => value !== undefined)) out.molecularWeights = mappedMw;
    }

    const legacyBvp = asRecord(parseJson(simValue('bvp')));
    const bvp: Record<string, any> = { ...legacyBvp };
    if (!bvp.rrboGradeId) bvp.rrboGradeId = String(out.rrboFluidId ?? inputs.rrboFluidId ?? '');

    const diffusivityComponents = [
      ['sat', 'Sat'], ['mono', 'Mono'], ['di', 'Di'], ['poly', 'Poly'], ['nmp', 'NMP'],
    ] as const;
    const diffusivity: Record<string, any> = {};
    let hasDiffusivityInput = false;
    for (const [key, component] of diffusivityComponents) {
      const legacyComponent = asRecord(legacyBvp.diffusivity?.[component]);
      const pair: Record<string, any> = {};
      for (const phase of ['c', 'd'] as const) {
        const prefix = `diffusivity_${key}_${phase}`;
        const value = simNum(`${prefix}_value`);
        const sourceType = String(simValue(`${prefix}_source_type`) ?? '').trim();
        const sourceReference = String(simValue(`${prefix}_source_reference`) ?? '').trim();
        const referenceTemperature_C = simNum(`${prefix}_reference_temperature_c`);
        const method = String(simValue(`${prefix}_method`) ?? '').trim();
        stage8Evidence[prefix] = stage8Audit(
          prefix as Parameters<typeof findEcr2Stage8Evidence>[0],
          prefix,
        );
        const hasFlatValue = value !== undefined || sourceType !== '' || sourceReference !== ''
          || referenceTemperature_C !== undefined || method !== '';
        const automatic = (stage8Evidence[prefix] as any).resolverRecord;
        if ((automatic?.status === 'AUTO_RESOLVED_PENDING_ACCEPTANCE' || automatic?.status === 'CALCULATED_PRELIMINARY')
          && typeof automatic.value === 'number') {
          hasDiffusivityInput = true;
          pair[phase === 'c' ? 'De_c' : 'De_d'] = {
            value_m2_s: automatic.value,
            sourceType: 'Literature',
            sourceReference: automatic.source,
            referenceTemperature_C: ot ?? Number.NaN,
            method: automatic.method,
            status: 'system_resolved_preliminary',
            resolverInputs: automatic.inputSnapshot ?? automatic.resolutionInputs,
          };
        } else if (stage8Evidence[prefix].status === 'ENGINEER_OVERRIDE' && hasFlatValue) {
          hasDiffusivityInput = true;
          pair[phase === 'c' ? 'De_c' : 'De_d'] = {
            value_m2_s: value ?? Number.NaN,
            sourceType,
            sourceReference,
            referenceTemperature_C: referenceTemperature_C ?? Number.NaN,
            method,
            status: 'engineer_supplied',
          };
        } else {
          pair[phase === 'c' ? 'De_c' : 'De_d'] = legacyComponent[phase === 'c' ? 'De_c' : 'De_d'] ?? null;
          if (pair[phase === 'c' ? 'De_c' : 'De_d'] !== null) hasDiffusivityInput = true;
        }
      }
      diffusivity[component] = pair;
    }
    if (hasDiffusivityInput) bvp.diffusivity = diffusivity;

    const shdValue = simNum('kuhni_shd_c2_value');
    const shdSourceType = String(simValue('kuhni_shd_c2_source_type') ?? '').trim();
    const shdSourceReference = String(simValue('kuhni_shd_c2_source_reference') ?? '').trim();
    stage8Evidence.kuhni_shd_c2 = stage8Audit('kuhni_shd_c2', 'kuhni_shd_c2');
    const automaticC2 = (stage8Evidence.kuhni_shd_c2 as any).resolverRecord;
    if ((automaticC2?.status === 'AUTO_RESOLVED_PENDING_ACCEPTANCE' || automaticC2?.status === 'CALCULATED_PRELIMINARY')
      && typeof automaticC2.value === 'number') {
      bvp.kuhniShdC2 = {
        value: automaticC2.value,
        sourceType: 'Literature',
        sourceReference: automaticC2.source,
        scope: 'kuhni_shd_preliminary',
        method: automaticC2.method,
        resolverInputs: automaticC2.inputSnapshot ?? automaticC2.resolutionInputs,
      };
    } else if (stage8Evidence.kuhni_shd_c2.status === 'ENGINEER_OVERRIDE'
      && (shdValue !== undefined || shdSourceType !== '' || shdSourceReference !== '')) {
      bvp.kuhniShdC2 = {
        value: shdValue ?? Number.NaN,
        sourceType: shdSourceType,
        sourceReference: shdSourceReference,
        scope: 'kuhni_shd_preliminary',
      };
    } else if (legacyBvp.kuhniShdC2 !== undefined) {
      bvp.kuhniShdC2 = legacyBvp.kuhniShdC2;
    }

    const approvalStatus = String(simValue('partition_basis_approval_status') ?? '').trim();
    const approvalReference = String(simValue('partition_basis_source_reference') ?? '').trim();
    if (approvalStatus !== '' || approvalReference !== '') {
      bvp.partitionBasis = {
        basis: 'K_d_concentration',
        approvalStatus,
        sourceReference: approvalReference,
        approvedBy: String(simValue('partition_basis_approved_by') ?? '').trim(),
        approvedAt: String(simValue('partition_basis_approved_at') ?? '').trim(),
      };
    } else if (legacyBvp.partitionBasis !== undefined) {
      bvp.partitionBasis = legacyBvp.partitionBasis;
    }
    // bvp is now an engine-ready adapter object assembled from independent
    // Stage 8 fields. The legacy JSON blob is never required; it is read only
    // to preserve older revisions during migration.
    bvp.stage8Evidence = stage8Evidence;
    bvp.stage8Resolution = {
      resolver: 'ecr2-stage8-governed-resolver-v1',
      operatingTemperature_C: ot ?? null,
      autoPopulatedCount: stage8Resolution.autoPopulatedCount,
      unresolvedCount: stage8Resolution.unresolvedCount,
      records: stage8Resolution.records,
    };
    out.bvp = bvp;
  }

  // Generic engineer-entered tagged mapper for Stage 7 flat fields.
  const ENG_REF = 'Engineer-entered (Stage 7 Equipment Design workspace) — pending validation';
  const taggedFrom = (wsKey: string, engineKey: string, opts?: { scale?: number; pctToFraction?: boolean; ref?: string }) => {
    if (out[engineKey] !== undefined) return;
    let v = num(inputs[wsKey]);
    if (v === undefined || v <= 0) return;
    if (opts?.pctToFraction && v > 1) v = v / 100;
    if (opts?.scale) v = v * opts.scale;
    // Per-field workspace source reference (e.g. Thermopac preliminary screening
    // defaults write `<key>_source_reference`) wins over the generic reference,
    // so the true provenance is carried into the calculation snapshot.
    const fieldRef = String(inputs[`${wsKey}_source_reference`] ?? '').trim();
    out[engineKey] = { value: v, sourceType: 'Assumed', sourceReference: fieldRef !== '' ? fieldRef : (opts?.ref ?? ENG_REF) };
  };

  // ECR — genuine engineering inputs (Stage 7 ECR panel)
  taggedFrom('rotor_diameter', 'rotorDiameter');
  taggedFrom('rotor_ratio', 'rotorToColumnDiameterRatio');
  taggedFrom('rotor_speed', 'rotorSpeed');
  taggedFrom('power_number', 'powerNumber');
  // compartmentHeight — governed override; source type and reference must travel together.
  // Engine is required:true → if value/source/reference is missing the ECR engine blocks cleanly.
  // Source type is NEVER hardwired to 'Assumed' — user-entered Vendor/Measured/Literature/Assumed
  // passes through exactly as entered (same pattern as compartmentEfficiency below).
  if (out.compartmentHeight === undefined) {
    const chVal = num(inputs.compartment_height);
    const chSrc = String(inputs.compartment_height_source ?? '').trim();
    const chRef = String(inputs.compartment_height_source_reference ?? '').trim();
    if (chVal !== undefined && chVal > 0 && SOURCE_TYPES.includes(chSrc) && chRef !== '') {
      out.compartmentHeight = { value: chVal, sourceType: chSrc, sourceReference: chRef };
    }
  }
  // compartmentEfficiency — governed override only; no silent Assumed tagging (A-10).
  // Value + source type + source reference must travel together.
  // Engine is required:true → if any part is missing the ECR engine blocks cleanly.
  if (out.compartmentEfficiency === undefined) {
    const ceVal = num(inputs.compartment_efficiency);
    const ceSrc = String(inputs.compartment_efficiency_source ?? '').trim();
    const ceRef = String(inputs.compartment_efficiency_source_reference ?? '').trim();
    if (ceVal !== undefined && ceVal > 0 && SOURCE_TYPES.includes(ceSrc) && ceRef !== '') {
      const fraction = ceVal > 1 ? ceVal / 100 : ceVal;
      out.compartmentEfficiency = { value: fraction, sourceType: ceSrc, sourceReference: ceRef };
    }
  }
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
  // Agitator Power Density Basis — no hidden fallback (governance §5).
  // The default 'continuous_phase' is seeded by ecrDefaultFields() and stored
  // explicitly in the workspace as power_density_basis. If absent the engine
  // validator blocks with a clear error — no silent injection.
  if (out.powerDensityBasis === undefined) {
    const pdb = String(inputs.power_density_basis ?? '').trim();
    if (pdb === 'continuous_phase' || pdb === 'volume_averaged') out.powerDensityBasis = pdb;
    // Absent or invalid → leave undefined; engine validator blocks with diagnostic.
  }
  // Stator open-area fraction — visible default (0.40, Assumed — A3 governance 2026-08-16);
  // mapper converts the workspace string to a source-tagged engine input.
  taggedFrom('stator_open_area_fraction', 'statorOpenAreaFraction');
  // A1 — Preliminary ECR Hydraulic Capacity (governance approval 2026-08-16).
  // Constructs vendorHydraulicCapacity as a ConstantBasis only when no capacity is already mapped
  // and only for the ECR calculation type — must never inject into ECP / C3 / C2 calculations.
  if (out.vendorHydraulicCapacity === undefined && calculationType === 'ecr') {
    const capVal = num(inputs.ecr_preliminary_hydraulic_capacity);
    const capSrc = String(inputs.ecr_preliminary_hydraulic_capacity_source ?? '').trim();
    const capRef = String(inputs.ecr_preliminary_hydraulic_capacity_source_reference ?? '').trim();
    if (capVal !== undefined && capVal > 0 && SOURCE_TYPES.includes(capSrc as typeof SOURCE_TYPES[number]) && capRef !== '') {
      out.vendorHydraulicCapacity = {
        kind: 'constant',
        value: capVal,
        unit: 'm³/(m²·h)',
        applicabilityNote: 'Thermopac Preliminary ECR Hydraulic Capacity Assumption — not a vendor guarantee and not validated RRBO/NMP flooding data; replace with vendor-quoted flooding capacity when obtained',
        sourceType: capSrc as typeof SOURCE_TYPES[number],
        sourceReference: capRef,
      };
    }
  }
  // A2 — Preliminary ECR Interfacial Tension (governance approval 2026-08-16).
  // Seeds interfacialTension for Weber-number calculation when no Stage-5 or Fluid-Properties
  // IFT is available. ECR only — uses a dedicated ecr_interfacial_tension key to avoid
  // colliding with the generic hydraulic_design interfacial_tension field.
  if (out.interfacialTension === undefined && calculationType === 'ecr') {
    const iftVal = num(inputs.ecr_interfacial_tension);  // mN/m → N/m below
    const iftRefT = num(String(inputs.ecr_interfacial_tension_ref_temp ?? '').replace(/°?C/gi, ''));
    const iftRef = String(inputs.ecr_interfacial_tension_source_reference ?? '').trim();
    if (iftVal !== undefined && iftVal > 0 && iftRefT !== undefined) {
      out.interfacialTension = {
        value: iftVal / 1000,
        referenceTemperatureC: iftRefT,
        sourceType: 'Assumed',
        sourceReference: iftRef !== '' ? iftRef : 'Thermopac Preliminary RRBO/NMP Interfacial-Tension Assumption — Pending Validation',
      };
    }
  }
  // systemDeratingFactor — now a visible governed Stage 7 input; no hidden 1.0 engine fallback.
  // Three-field pattern: value + source type + source reference must all travel together.
  // Engine is required: true → if any part is missing the ECR engine blocks cleanly.
  if (out.systemDeratingFactor === undefined) {
    const dfVal = num(inputs.system_derating_factor);
    const dfSrc = String(inputs.system_derating_factor_source ?? '').trim();
    const dfRef = String(inputs.system_derating_factor_source_reference ?? '').trim();
    if (dfVal !== undefined && dfVal > 0 && SOURCE_TYPES.includes(dfSrc) && dfRef !== '') {
      out.systemDeratingFactor = { value: dfVal, sourceType: dfSrc, sourceReference: dfRef };
    }
    // Absent/incomplete → leave undefined; engine validator blocks with a clear diagnostic.
  }
  // Continuous-phase viscosity (required by ECR when NMP is continuous):
  // NMP dynamic viscosity, workspace mPa·s → Pa·s.
  // continuousPhaseViscosity — value and reference temperature must travel together (A-11).
  // No fallback on referenceTemperatureC (removed ?? ot ?? 70). If blank → block.
  if (out.continuousPhaseViscosity === undefined) {
    const isNmpCont = String(out.phaseConfiguration ?? '') === 'nmp_continuous_rrbo_dispersed';
    const muKey = isNmpCont ? 'nmp_viscosity_dynamic_value' : 'rrbo_viscosity_dynamic_value';
    const refTKey = isNmpCont ? 'nmp_viscosity_dynamic_ref_temp' : 'rrbo_viscosity_dynamic_ref_temp';
    const muC = num(inputs[muKey]);
    const refT = num(String(inputs[refTKey] ?? '').replace(/°?C/gi, ''));
    if (muC !== undefined && muC > 0 && refT !== undefined) {
      out.continuousPhaseViscosity = {
        value: muC / 1000,
        referenceTemperatureC: refT,
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
  // The workspace stores `hets` as a flat string; the engine requires a full
  // HETS record object. A non-object value here is the raw workspace field
  // leaked through the spread — always rebuild it as the record.
  // HETS — governed override only; no silent defaults on source or reference (A-series).
  // Engine receives no HETS when blank → height calculation blocks with missing-input error.
  if ((out.hets === undefined || typeof out.hets !== 'object') && hetsVal !== undefined && hetsVal > 0) {
    const src = String(inputs.hets_source ?? '').trim();
    const ref = String(inputs.hets_source_reference ?? '').trim();
    out.hets = {
      value: hetsVal,
      unit: 'm',
      operatingTemperatureC: ot ?? 0,
      solvent: 'NMP',
      feed: 'RRBO (Re-Refined Base Oil)',
      packing: (() => {
        const pid = String(inputs.packing_id ?? '').trim();
        if (pid !== '') {
          const rec = getPacking(pid);
          if (rec?.productName) return rec.productName;
        }
        return String(inputs.packing_id ?? inputs.packing_type ?? 'unspecified packing').trim();
      })(),
      sourceType: SOURCE_TYPES.includes(src) ? src : 'Assumed',
      sourceReference: ref || 'Governed HETS override (Stage 7 ECP workspace) — source required',
    };
    if (out.heightBasis === undefined) out.heightBasis = 'HETS';
  }

  return out;
}
