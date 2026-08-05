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
  // Engine-ready payload already present → pass through untouched.
  if (inputs.feedFlow !== undefined || inputs.operatingTemperature !== undefined) return inputs;

  const out: Record<string, unknown> = { ...inputs };

  const ot = num(inputs.operating_temperature);
  if (ot !== undefined) out.operatingTemperature = ot;

  // Feed flow — Design Basis capacity (LPH → m³/h, volumetric basis)
  const feedLph = num(inputs.design_capacity_lph) ?? num(inputs.design_capacity);
  if (feedLph !== undefined && feedLph > 0) {
    out.feedFlow = { value: feedLph / 1000, basis: 'volumetric' };
  }

  // Feed (RRBO) density — prefer the source-tagged Fluid Properties entry,
  // fall back to the Design Basis feed density (Thermopac Feed Master).
  const fpRho = num(inputs.rrbo_density_value);
  const dbRho = num(inputs.feed_density);
  const rho = fpRho ?? dbRho;
  if (rho !== undefined && rho > 0) {
    const refT = num(String(inputs.rrbo_density_ref_temp ?? inputs.feed_density_ref_temp ?? '15').replace(/°?C/gi, '')) ?? 15;
    const srcRaw = String(inputs.rrbo_density_source ?? '').trim();
    const sourceType = SOURCE_TYPES.includes(srcRaw) ? srcRaw : 'Vendor';
    const sourceReference = SOURCE_TYPES.includes(srcRaw)
      ? String(inputs.feed_density_source ?? 'Fluid Properties workspace entry')
      : 'Thermopac Feed Master — Design Basis default density for selected feed grade';
    out.feedDensity = { value: rho, referenceTemperatureC: refT, sourceType, sourceReference };
  }

  // S/O ratio — workspace basis is VOLUME (NMP vol flow / RRBO vol flow).
  // Engine expects mass basis: multiply by ρNMP(OT)/ρRRBO.
  const soVol = num(inputs.so_ratio);
  if (soVol !== undefined && soVol > 0 && ot !== undefined && rho !== undefined && rho > 0) {
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
  if (stages !== undefined) out.theoreticalStages = stages;

  const eff = num(inputs.stage_efficiency);
  if (eff !== undefined && eff > 0 && eff <= 100) out.compartmentOrStageEfficiency = eff / 100;

  const margin = num(inputs.design_margin);
  if (margin !== undefined && margin >= 0) out.maxCirculationFactor = 1 + margin / 100;

  const phase = String(inputs.phase_configuration ?? '').trim();
  if (phase !== '') out.phaseConfiguration = phase;

  return out;
}
