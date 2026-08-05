// ═══════════════════════════════════════════════════════════════════════════════
// Common Packed-Column Engine — ECP-Type Packed Extraction Column (Stage C4)
//
// PRELIMINARY ECP-TYPE PACKED COLUMN SCREENING — NOT VENDOR RATING AND NOT FOR
// FABRICATION.
//
// Implements ECP-001…ECP-008 per the approved Stage C4 basis with the 10
// refinements:
//   1. The engine CONSUMES packing data from the Packing Database module
//      (engine-framework/packing/database.ts). It never owns packing data.
//   2. Vendor performance data are curves (tabulated / polynomial) or constants
//      with stated applicability. Interpolation only — extrapolation refused.
//   3. HETS is SYSTEM data: every HETS record carries value, unit, operating
//      temperature, solvent, feed, packing, source type, source reference.
//   4. Rate-based placeholders (HTU, NTU, Ka, interfacial area) are reserved in
//      the output schema — architecture only, never calculated in C4.
//   5. Dry and wet pressure drop are separated; ONLY wet applies here.
//   6. Distributor checks are modular (IDistributorCheckModule) — future types
//      (orifice pan, trough, ladder, pipe, spray, chimney tray) plug in.
//   7. Height breakdown: top head, top disengagement, top distributor,
//      packing bed 1, redistributor 1, packing bed 2, …, packing support,
//      bottom distributor, bottom disengagement, bottom head, total T/T,
//      overall vessel height.
//   8. Every calculated item is a rich result: result, units, source, status,
//      validation, warnings, formula reference, engine version.
//   9. Vendor neutral: only "Vendor Packing Capacity", "Vendor Pressure Drop",
//      "Vendor Packing Performance" — never a named vendor inside the engine.
//  10. This is the COMMON packed-column hydraulic engine; future modules
//      (distillation, absorption, stripping, scrubbing, washing) reuse the
//      hydraulics and change only the mass-transfer model.
//
// The C3 generic-throughput percentage is NEITHER an input NOR reused —
// ECP hydraulic utilization comes exclusively from Vendor Packing Capacity.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  IDesignEngine, ValidationResult, ValidationError, CalculationContext,
  CalculationResult, DesignSummary, EngineWarning,
} from '../../engine-framework/types';
import {
  CEL_VERSION, EPD_VERSION,
  getProperty, createPropertyContext, containsAssumedData, EngineeringInputError,
  SOURCE_TYPES, columnCrossSectionArea,
} from '../../engine-framework/common-engineering-library';
import type { SourceType } from '../../engine-framework/epd/types';
import {
  PackingRecord, HETSRecord, PerformanceBasis,
  validatePackingRecord, validateHETSRecord, getPacking,
  evaluatePerformanceBasis, performanceBasisAssumed,
} from '../../engine-framework/packing/database';
import {
  DistributorSpec, resolveDistributorModule,
} from '../../engine-framework/packing/distributors';

// ── Constants ─────────────────────────────────────────────────────────────────

const ENGINE_VERSION = '1.0.0';
const C2_PROCESS_DESIGN_VERSION = '1.0.0';
const C3_HYDRAULICS_COMMON_VERSION = '1.0.0';

const APPLICABILITY_STATEMENT = 'PRELIMINARY ECP-TYPE PACKED COLUMN SCREENING — NOT VENDOR RATING AND NOT FOR FABRICATION';
const LIMITATIONS = [
  'No proprietary packing model',
  'No vendor hydraulic guarantee',
  'HETS requires vendor/test confirmation',
  'No droplet breakup/coalescence model',
  'No axial-dispersion model',
  'No rate-based mass-transfer model',
  'No mechanical code design',
];

const PHASE_CONFIGS = ['rrbo_continuous_nmp_dispersed', 'nmp_continuous_rrbo_dispersed'] as const;
type PhaseConfig = (typeof PHASE_CONFIGS)[number];
type Classification = 'Calculated Screening Result' | 'Pending Validation' | 'Not Calculable';

const DEFAULT_UTILIZATION_BAND = { min: 40, max: 80 }; // % — configurable criterion, not a universal rule
const SMALL = 1e-12;

// ── Rich result item (refinement 8) ───────────────────────────────────────────

interface ResultItem {
  result: number | string | null;
  units: string;
  source: string;
  status: Classification;
  validation: string;
  warnings: string[];
  formulaReference: string;   // ECP-001…ECP-008
  engineVersion: string;
}

function item(formulaReference: string, result: number | string | null, units: string, source: string, status: Classification, validation: string, itemWarnings: string[] = []): ResultItem {
  return { result, units, source, status, validation, warnings: itemWarnings, formulaReference, engineVersion: ENGINE_VERSION };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TaggedValue { value: number; unit?: string; sourceType: SourceType; sourceReference: string }
interface AssumptionEntry { assumption: string; sourceType?: SourceType; sourceReference?: string; consequence: string }

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function parseTagged(raw: unknown, field: string, errors: ValidationError[], opts: { min: number; max: number; unit: string; required?: boolean }): TaggedValue | undefined {
  if (raw === undefined || raw === null) {
    if (opts.required) errors.push({ field, message: `${field} is required: { value (${opts.unit}), unit, sourceType, sourceReference } — source-tagged or explicitly Assumed; never defaulted`, severity: 'error' });
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const value = num(o.value);
  if (value === undefined) { errors.push({ field, message: `${field}.value must be a finite number (${opts.unit})`, severity: 'error' }); return undefined; }
  if (value < opts.min || value > opts.max) { errors.push({ field, message: `${field}.value must be in [${opts.min}, ${opts.max}] ${opts.unit} (got ${value})`, severity: 'error' }); return undefined; }
  if (o.unit !== undefined && o.unit !== opts.unit) { errors.push({ field, message: `${field}.unit must be '${opts.unit}' (got '${String(o.unit)}')`, severity: 'error' }); return undefined; }
  if (!SOURCE_TYPES.includes(o.sourceType as SourceType)) { errors.push({ field, message: `${field}.sourceType must be one of ${SOURCE_TYPES.join(', ')}`, severity: 'error' }); return undefined; }
  if (typeof o.sourceReference !== 'string' || !o.sourceReference.trim()) { errors.push({ field, message: `${field}.sourceReference is mandatory`, severity: 'error' }); return undefined; }
  return { value, unit: opts.unit, sourceType: o.sourceType as SourceType, sourceReference: o.sourceReference };
}

function sourceOf(t: TaggedValue): string { return `${t.sourceType}: ${t.sourceReference}`; }

const ALLOWANCE_FIELDS = [
  { key: 'topHeadHeight', unit: 'm', min: 0.1, max: 5, label: 'Top Head' },
  { key: 'topDisengagementHeight', unit: 'm', min: 0.1, max: 5, label: 'Top Disengagement' },
  { key: 'topDistributorAllowance', unit: 'm', min: 0.05, max: 2, label: 'Top Distributor' },
  { key: 'packingSupportAllowance', unit: 'm', min: 0.02, max: 1, label: 'Packing Support' },
  { key: 'holdDownAllowance', unit: 'm', min: 0.02, max: 1, label: 'Hold-Down' },
  { key: 'bottomDistributorAllowance', unit: 'm', min: 0.05, max: 2, label: 'Bottom Distributor' },
  { key: 'bottomDisengagementHeight', unit: 'm', min: 0.1, max: 5, label: 'Bottom Disengagement' },
  { key: 'bottomHeadHeight', unit: 'm', min: 0.1, max: 5, label: 'Bottom Head' },
] as const;

// ── Engine ────────────────────────────────────────────────────────────────────

export class LLXECPEngine implements IDesignEngine {
  getEngineId(): string { return 'llx-ecp'; }
  getEngineVersion(): string { return ENGINE_VERSION; }
  getModuleType(): string { return 'llx'; }
  getCalculationType(): string { return 'ecp'; }

  validate(inputs: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    const err = (field: string, message: string) => errors.push({ field, message, severity: 'error' });
    const warn = (field: string, message: string) => errors.push({ field, message, severity: 'warning' });

    const T = num(inputs.operatingTemperature);
    if (T === undefined || T <= 0 || T >= 300) err('operatingTemperature', 'operatingTemperature (°C) is required, 0 < T < 300');

    // Case flows — normal and maximum, each independent and mandatory
    for (const c of ['normalCase', 'maximumCase'] as const) {
      const cf = inputs[c] as Record<string, unknown> | undefined;
      const rr = num(cf?.rrboMassFlow_kg_h); const nm = num(cf?.nmpMassFlow_kg_h);
      if (!cf || rr === undefined || rr <= 0 || nm === undefined || nm <= 0) {
        err(c, `${c} { rrboMassFlow_kg_h > 0, nmpMassFlow_kg_h > 0 } is required — normal and maximum cases are independent inputs from the Stage C3 basis`);
      }
    }

    if (!PHASE_CONFIGS.includes(inputs.phaseConfiguration as PhaseConfig)) err('phaseConfiguration', `phaseConfiguration must be one of: ${PHASE_CONFIGS.join(', ')}`);

    // RRBO properties — engineer-entered, source-tagged, never defaulted
    for (const [f, unit] of [['feedDensity', 'kg/m3'], ['feedViscosity', 'Pa.s']] as const) {
      const o = inputs[f] as Record<string, unknown> | undefined;
      if (!o) { err(f, `${f} is required: source-tagged RRBO entry { value (${unit}), referenceTemperatureC, sourceType, sourceReference }. No default RRBO correlations exist.`); continue; }
      const v = num(o.value);
      if (v === undefined || v <= 0) err(`${f}.value`, `${f}.value must be > 0 (${unit})`);
      if (num(o.referenceTemperatureC) === undefined) err(`${f}.referenceTemperatureC`, `${f}.referenceTemperatureC (°C) is required`);
      if (!SOURCE_TYPES.includes(o.sourceType as SourceType)) err(`${f}.sourceType`, `${f}.sourceType must be one of ${SOURCE_TYPES.join(', ')}`);
      if (typeof o.sourceReference !== 'string' || !(o.sourceReference as string).trim()) err(`${f}.sourceReference`, `${f}.sourceReference is mandatory`);
    }

    // Packing — from the Packing Database (by id) OR a full inline record. Never both.
    const packingId = inputs.packingId;
    const packingInline = inputs.packing;
    if (packingId !== undefined && packingInline !== undefined) err('packing', 'Provide EITHER packingId (Packing Database) OR an inline packing record — not both');
    else if (packingId !== undefined) {
      if (typeof packingId !== 'string' || !getPacking(packingId)) err('packingId', `packingId '${String(packingId)}' is not registered in the Packing Database`);
    } else if (packingInline !== undefined) {
      for (const issue of validatePackingRecord(packingInline)) err(issue.field, issue.message);
    } else {
      err('packing', 'A packing definition is required: packingId (Packing Database) or a full inline packing record. The engine consumes packing data — it never owns packing data.');
    }
    // Curve-variable semantics: the engine evaluates capacity vs dispersed/continuous
    // flow ratio and wet Δp vs total liquid load — curves must state that basis.
    const rec = (typeof packingId === 'string' ? getPacking(packingId) : packingInline as PackingRecord | undefined);
    if (rec && typeof rec === 'object') {
      const cap = rec.hydraulicCapacityData;
      if (cap && cap.kind !== 'constant' && cap.independentVariable !== 'flowRatioDispersedToContinuous') {
        err('packing.hydraulicCapacityData.independentVariable', `Vendor Packing Capacity curves must be expressed vs 'flowRatioDispersedToContinuous' (got '${String(cap.independentVariable)}') — the engine will not evaluate a curve against a different variable`);
      }
      const wet = rec.pressureDropData?.wet;
      if (wet && wet.kind !== 'constant' && wet.independentVariable !== 'totalLiquidLoad') {
        err('packing.pressureDropData.wet.independentVariable', `Vendor Pressure Drop (wet) curves must be expressed vs 'totalLiquidLoad' (got '${String(wet.independentVariable)}') — the engine will not evaluate a curve against a different variable`);
      }
    }

    // Height basis — HETS path only in Stage C4 (HTU/NTU reserved)
    if (inputs.heightBasis !== 'HETS') {
      err('heightBasis', inputs.heightBasis === 'HTU_NTU'
        ? "heightBasis 'HTU_NTU' is a reserved future rate-based path — Stage C4 implements ONLY heightBasis 'HETS'"
        : "heightBasis must be 'HETS' (the only Stage C4 height path; 'HTU_NTU' is reserved architecture)");
    }
    const stages = num(inputs.theoreticalStages);
    if (stages === undefined || stages <= 0) err('theoreticalStages', 'theoreticalStages must be > 0 (engineer-entered, typically from the Stage C2 result)');
    for (const issue of validateHETSRecord(inputs.hets)) err(issue.field, issue.message);

    // Diameter basis — same discipline as Stage C3 (strict sweep or explicit list)
    const sweep = inputs.diameterSweep as Record<string, unknown> | undefined;
    const values = inputs.diameterValues as unknown;
    if (sweep && values !== undefined) err('diameterValues', 'Provide EITHER diameterSweep OR diameterValues — not both');
    else if (values !== undefined) {
      if (!Array.isArray(values) || values.length === 0 || values.length > 200 || values.some((v) => num(v) === undefined || num(v)! <= 0)) {
        err('diameterValues', 'diameterValues must be a non-empty array of up to 200 diameters, each > 0 (m)');
      }
    } else {
      const dMin = num(sweep?.min); const dMax = num(sweep?.max); const dStep = num(sweep?.step);
      if (!sweep || dMin === undefined || dMax === undefined || dStep === undefined || dMin <= 0 || dMax <= dMin || dStep <= 0) {
        err('diameterSweep', 'diameterSweep { 0 < min < max, step > 0 } (m) is required (for a single diameter use diameterValues: [D])');
      } else {
        const points = Math.floor((dMax - dMin) / dStep) + 1;
        if (dMin + dStep === dMin) err('diameterSweep.step', 'diameterSweep.step is too small to advance the sweep at floating-point precision');
        else if (points > 200) err('diameterSweep', `diameterSweep would produce ${points} points — limit is 200; use a coarser step`);
        else if (points > 100) warn('diameterSweep', `diameterSweep has ${points} points — consider a coarser step for screening`);
      }
    }
    const trial = num(inputs.selectedTrialDiameter);
    if (inputs.selectedTrialDiameter !== undefined && (trial === undefined || trial <= 0)) err('selectedTrialDiameter', 'selectedTrialDiameter must be > 0 (m)');

    // Utilization band — configurable criterion
    if (inputs.utilizationBandPercent !== undefined && inputs.utilizationBandPercent !== null) {
      const b = inputs.utilizationBandPercent as Record<string, unknown>;
      const bMin = num(b.min); const bMax = num(b.max);
      if (bMin === undefined || bMax === undefined || !(bMin >= 0 && bMax <= 100 && bMin < bMax)) err('utilizationBandPercent', 'utilizationBandPercent must satisfy 0 ≤ min < max ≤ 100');
    }

    // System derating factor — vendor-advised only, never invented
    parseTagged(inputs.systemDeratingFactor, 'systemDeratingFactor', errors, { min: 0.1, max: 1.0, unit: '-' });

    // Distributor spec — optional; checks run only where data exist
    const dist = inputs.distributor as Record<string, unknown> | undefined;
    if (dist !== undefined && dist !== null) {
      if (typeof dist.distributorType !== 'string' || !dist.distributorType.trim()) err('distributor.distributorType', 'distributor.distributorType is required when a distributor spec is supplied');
      parseTagged(dist.freeAreaFraction, 'distributor.freeAreaFraction', errors, { min: 0.001, max: 0.5, unit: '-' });
      const lim = dist.holeVelocityLimits as Record<string, unknown> | undefined;
      if (lim) {
        const lo = parseTagged(lim.min, 'distributor.holeVelocityLimits.min', errors, { min: 0, max: 10, unit: 'm/s' });
        const hi = parseTagged(lim.max, 'distributor.holeVelocityLimits.max', errors, { min: 0, max: 10, unit: 'm/s' });
        if (lo && hi && lo.value >= hi.value) err('distributor.holeVelocityLimits', 'holeVelocityLimits must satisfy min < max');
      }
      parseTagged(dist.maxCapacity, 'distributor.maxCapacity', errors, { min: 0, max: 100000, unit: 'm3/h' });
    }

    // Redistributor allowance — mandatory only when bed splitting will occur; checked in calculate
    parseTagged(inputs.redistributorAllowance, 'redistributorAllowance', errors, { min: 0.3, max: 2, unit: 'm' });

    // Height allowances — every one mandatory and source-tagged or explicitly Assumed
    for (const f of ALLOWANCE_FIELDS) parseTagged(inputs[f.key], f.key, errors, { min: f.min, max: f.max, unit: f.unit, required: true });

    return { valid: errors.filter((e) => e.severity === 'error').length === 0, errors };
  }

  async calculate(inputs: Record<string, unknown>, context: CalculationContext): Promise<CalculationResult> {
    const base = {
      calculationClass: context.calculationClass ?? 'Preliminary Screening',
      engineId: this.getEngineId(),
      engineVersion: ENGINE_VERSION,
      computedAt: new Date(),
    };
    const warnings: EngineWarning[] = [];
    const pushWarning = (code: string, message: string) => { if (!warnings.some((w) => w.code === code && w.message === message)) warnings.push({ code, message }); };
    const assumptions: AssumptionEntry[] = [];
    let anyPending = false;
    const notePending = () => { anyPending = true; };

    const gate = this.validate(inputs);
    const gateErrors = gate.errors.filter((e) => e.severity === 'error');
    if (gateErrors.length > 0) {
      return { ...base, status: 'error', data: { calculationRunStatus: 'calculation_blocked' }, warnings, validationIssues: gate.errors };
    }
    for (const w of gate.errors.filter((e) => e.severity === 'warning')) pushWarning('INPUT_WARNING', `${w.field}: ${w.message}`);

    const errs: ValidationError[] = [];
    try {
      const T = num(inputs.operatingTemperature)!;

      // ── Packing — consumed from the Packing Database or inline record ───────
      const packing: PackingRecord = (typeof inputs.packingId === 'string' ? getPacking(inputs.packingId)! : inputs.packing as PackingRecord);
      const packingAssumed = [packing.size, packing.specificSurfaceArea, packing.voidFraction, packing.packingFactor, packing.minimumWettingRate, packing.maximumBedHeight]
        .some((t) => t?.sourceType === 'Assumed')
        || (packing.hydraulicCapacityData ? performanceBasisAssumed(packing.hydraulicCapacityData) : false)
        || (packing.pressureDropData?.wet ? performanceBasisAssumed(packing.pressureDropData.wet) : false);
      if (packingAssumed) {
        notePending();
        assumptions.push({ assumption: `Packing record '${packing.id}' contains Assumed data`, consequence: 'All packing-derived items are Pending Validation until vendor/measured data replace the Assumed entries' });
      }

      // ── Properties via calculation-scoped context (never mutate registries) ─
      const fd = inputs.feedDensity as Record<string, unknown>;
      const fv = inputs.feedViscosity as Record<string, unknown>;
      const feedDensityEntry = { value: num(fd.value)!, unit: 'kg/m3', referenceTemperatureC: num(fd.referenceTemperatureC)!, sourceType: fd.sourceType as SourceType, sourceReference: fd.sourceReference as string };
      const feedViscosityEntry = { value: num(fv.value)!, unit: 'Pa.s', referenceTemperatureC: num(fv.referenceTemperatureC)!, sourceType: fv.sourceType as SourceType, sourceReference: fv.sourceReference as string };
      const propertyContext = createPropertyContext([{
        id: 'rrbo', name: 'RRBO (Re-Refined Base Oil) — run feed', isProjectFluid: true,
        properties: { density: feedDensityEntry, dynamicViscosity: feedViscosityEntry },
      }]);
      const rhoRRBO = getProperty('rrbo', 'density', T, propertyContext);
      const rhoNMP = getProperty('nmp', 'density', T);
      for (const w of [...rhoRRBO.warnings, ...rhoNMP.warnings]) pushWarning(w.code, w.message);
      // Centralized property-assumption flag: any Assumed fluid property (entered
      // RRBO tags or EPD-sourced NMP data) makes every load-derived item pending.
      const propertyAssumed = containsAssumedData([...rhoRRBO.warnings, ...rhoNMP.warnings])
        || feedDensityEntry.sourceType === 'Assumed' || feedViscosityEntry.sourceType === 'Assumed';
      if (propertyAssumed) { notePending(); assumptions.push({ assumption: 'Fluid property data contain Assumed entries (RRBO entered tags and/or EPD data)', consequence: 'All load-derived items (ECP-001 loads, ECP-002 utilization) are Pending Validation' }); }

      const phaseConfig = inputs.phaseConfiguration as PhaseConfig;
      const rrboContinuous = phaseConfig === 'rrbo_continuous_nmp_dispersed';
      const continuousPhase = rrboContinuous ? 'RRBO' : 'NMP';
      const dispersedPhase = rrboContinuous ? 'NMP' : 'RRBO';

      // ── HETS (system data) & packing height — ECP-005 ───────────────────────
      const hets = inputs.hets as HETSRecord;
      if (hets.sourceType === 'Assumed') { notePending(); assumptions.push({ assumption: `HETS = ${hets.value} m is ASSUMED (${hets.sourceReference})`, sourceType: hets.sourceType, sourceReference: hets.sourceReference, consequence: 'Packing height and total heights are Pending Validation' }); }
      if (Math.abs(hets.operatingTemperatureC - T) > 10) pushWarning('HETS_TEMPERATURE_MISMATCH', `HETS record temperature ${hets.operatingTemperatureC} °C differs from operating temperature ${T} °C by more than 10 °C — HETS is system data and must match the operating system.`);
      if (packing.productName && hets.packing && !hets.packing.toLowerCase().includes(packing.productName.toLowerCase()) && !packing.productName.toLowerCase().includes(hets.packing.toLowerCase())) {
        pushWarning('HETS_PACKING_MISMATCH', `HETS record is for packing '${hets.packing}' but the selected packing is '${packing.productName}' — HETS belongs to a system (solvent + feed + packing); confirm applicability.`);
      }
      const stages = num(inputs.theoreticalStages)!;
      const packingHeight_m = stages * hets.value;
      const heightClassification: Classification = hets.sourceType === 'Assumed' ? 'Pending Validation' : 'Calculated Screening Result';
      const packingHeightItem = item('ECP-005', packingHeight_m, 'm',
        `theoreticalStages (engineer) × HETS (${hets.sourceType}: ${hets.sourceReference}; system: ${hets.feed}/${hets.solvent} on ${hets.packing} at ${hets.operatingTemperatureC} °C)`,
        heightClassification,
        heightClassification === 'Pending Validation' ? 'HETS is Assumed — vendor/test confirmation required' : 'HETS is vendor/test data — confirmation before rating still required');

      // ── Bed split & redistributors — ECP-006 ────────────────────────────────
      let beds: number[] = [packingHeight_m];
      if (packing.maximumBedHeight) {
        const maxBed = packing.maximumBedHeight.value;
        if (packingHeight_m > maxBed) {
          let nBeds = Math.ceil(packingHeight_m / maxBed - 1e-9);
          while (packingHeight_m / nBeds > maxBed * (1 + 1e-12)) nBeds++; // postcondition: every bed ≤ vendor maximum
          const per = packingHeight_m / nBeds;
          beds = Array.from({ length: nBeds }, () => per);
        }
      } else {
        pushWarning('NO_BED_HEIGHT_LIMIT_DATA', 'No vendor maximum bed height in the packing record — a single bed is assumed for screening; confirm bed splitting with the packing vendor.');
      }
      const nRedistributors = beds.length - 1;
      const redistTagged = parseTagged(inputs.redistributorAllowance, 'redistributorAllowance', errs, { min: 0.3, max: 2, unit: 'm' });
      if (nRedistributors > 0 && !redistTagged) {
        errs.push({ field: 'redistributorAllowance', message: `Bed splitting requires ${nRedistributors} redistributor(s) (vendor max bed height ${packing.maximumBedHeight!.value} m) — redistributorAllowance { value (m), sourceType, sourceReference } is mandatory`, severity: 'error' });
        return { ...base, status: 'error', data: { calculationRunStatus: 'calculation_blocked' }, warnings, validationIssues: errs };
      }
      if (redistTagged?.sourceType === 'Assumed') { notePending(); assumptions.push({ assumption: `Redistributor allowance ${redistTagged.value} m is ASSUMED`, sourceType: redistTagged.sourceType, sourceReference: redistTagged.sourceReference, consequence: 'Height breakdown is Pending Validation' }); }

      // ── Height breakdown — ECP-008 / refinement 7 ───────────────────────────
      const allowances: Record<string, TaggedValue> = {};
      let allowancesAssumed = false;
      for (const f of ALLOWANCE_FIELDS) {
        const t = parseTagged(inputs[f.key], f.key, errs, { min: f.min, max: f.max, unit: 'm', required: true })!;
        allowances[f.key] = t;
        if (t.sourceType === 'Assumed') {
          allowancesAssumed = true;
          assumptions.push({ assumption: `${f.label} allowance ${t.value} m is ASSUMED`, sourceType: t.sourceType, sourceReference: t.sourceReference, consequence: 'Height breakdown is Pending Validation' });
        }
      }
      if (allowancesAssumed) notePending();
      const heightItemStatus: Classification = allowancesAssumed || hets.sourceType === 'Assumed' || redistTagged?.sourceType === 'Assumed' ? 'Pending Validation' : 'Calculated Screening Result';
      const lines: { label: string; item: ResultItem }[] = [];
      const push = (label: string, value: number, source: string, status: Classification = heightItemStatus) =>
        lines.push({ label, item: item('ECP-008', value, 'm', source, status, status === 'Pending Validation' ? 'Contains Assumed data' : 'Source-tagged') });
      push('Top Head', allowances.topHeadHeight.value, sourceOf(allowances.topHeadHeight));
      push('Top Disengagement', allowances.topDisengagementHeight.value, sourceOf(allowances.topDisengagementHeight));
      push('Top Distributor', allowances.topDistributorAllowance.value, sourceOf(allowances.topDistributorAllowance));
      beds.forEach((h, i) => {
        push(`Packing Bed ${i + 1}`, h, `ECP-005/ECP-006 (${beds.length} bed(s)${packing.maximumBedHeight ? `, vendor max bed height ${packing.maximumBedHeight.value} m` : ''})`, heightClassification === 'Pending Validation' ? 'Pending Validation' : heightItemStatus);
        if (i < nRedistributors) push(`Redistributor ${i + 1}`, redistTagged!.value, sourceOf(redistTagged!));
      });
      push('Hold-Down', allowances.holdDownAllowance.value, sourceOf(allowances.holdDownAllowance));
      push('Packing Support', allowances.packingSupportAllowance.value, sourceOf(allowances.packingSupportAllowance));
      push('Bottom Distributor', allowances.bottomDistributorAllowance.value, sourceOf(allowances.bottomDistributorAllowance));
      push('Bottom Disengagement', allowances.bottomDisengagementHeight.value, sourceOf(allowances.bottomDisengagementHeight));
      push('Bottom Head', allowances.bottomHeadHeight.value, sourceOf(allowances.bottomHeadHeight));
      const tangentLines = lines.filter((l) => l.label !== 'Top Head' && l.label !== 'Bottom Head');
      const totalTT = tangentLines.reduce((s, l) => s + (l.item.result as number), 0);
      const overallVessel = totalTT + allowances.topHeadHeight.value + allowances.bottomHeadHeight.value;
      const heightBreakdown = {
        lines: lines.map((l) => ({ label: l.label, ...l.item })),
        totalTangentToTangent: item('ECP-008', totalTT, 'm', 'Sum of tangent-to-tangent items (heads excluded)', heightItemStatus, heightItemStatus === 'Pending Validation' ? 'Contains Assumed data' : 'Source-tagged'),
        overallVesselHeight: item('ECP-008', overallVessel, 'm', 'Total T/T + top head + bottom head', heightItemStatus, heightItemStatus === 'Pending Validation' ? 'Contains Assumed data' : 'Source-tagged'),
      };

      // ── Flows per case ───────────────────────────────────────────────────────
      const caseFlows = (c: 'normalCase' | 'maximumCase') => {
        const cf = inputs[c] as { rrboMassFlow_kg_h: number; nmpMassFlow_kg_h: number };
        const qRRBO = num(cf.rrboMassFlow_kg_h)! / rhoRRBO.value;   // m3/h
        const qNMP = num(cf.nmpMassFlow_kg_h)! / rhoNMP.value;      // m3/h
        return {
          rrboMassFlow_kg_h: num(cf.rrboMassFlow_kg_h)!, nmpMassFlow_kg_h: num(cf.nmpMassFlow_kg_h)!,
          qRRBO_m3_h: qRRBO, qNMP_m3_h: qNMP,
          qContinuous_m3_h: rrboContinuous ? qRRBO : qNMP,
          qDispersed_m3_h: rrboContinuous ? qNMP : qRRBO,
        };
      };
      const normalFlows = caseFlows('normalCase');
      const maximumFlows = caseFlows('maximumCase');
      if (maximumFlows.nmpMassFlow_kg_h < normalFlows.nmpMassFlow_kg_h - SMALL) pushWarning('MAXIMUM_CASE_BELOW_NORMAL', 'maximumCase NMP flow is below normalCase — confirm the case definitions.');

      // ── Vendor capacity basis — ECP-002 ─────────────────────────────────────
      const capacityBasis: PerformanceBasis | undefined = packing.hydraulicCapacityData;
      const derate = parseTagged(inputs.systemDeratingFactor, 'systemDeratingFactor', errs, { min: 0.1, max: 1.0, unit: '-' });
      let derateValue = 1.0;
      let derateSource = 'No vendor system-derating factor supplied — 1.0 used with explicit warning (never invented)';
      if (derate) {
        derateValue = derate.value;
        derateSource = `Vendor system-derating factor (${sourceOf(derate)})`;
        if (derate.sourceType === 'Assumed') { notePending(); assumptions.push({ assumption: `System derating factor ${derate.value} is ASSUMED`, sourceType: derate.sourceType, sourceReference: derate.sourceReference, consequence: 'Utilization items are Pending Validation' }); }
      } else if (capacityBasis) {
        pushWarning('NO_SYSTEM_DERATING_DATA', `No vendor system-derating factor supplied — Vendor Packing Capacity applied without correction. Vendor reference basis: ${capacityBasis.kind === 'constant' ? capacityBasis.applicabilityNote : `${capacityBasis.sourceType}: ${capacityBasis.sourceReference}`}. Confirm applicability to the ${dispersedPhase}-in-${continuousPhase} system.`);
      }
      if (!capacityBasis) {
        notePending();
        pushWarning('NO_VENDOR_CAPACITY_DATA', `Packing record '${packing.id}' has no Vendor Packing Capacity data — ECP hydraulic utilization is Pending Validation (loads are still reported). The C3 generic screening percentage is NOT a substitute.`);
      }

      const utilBandIn = inputs.utilizationBandPercent as Record<string, unknown> | undefined;
      const utilizationBand = utilBandIn ? { min: num(utilBandIn.min)!, max: num(utilBandIn.max)! } : { ...DEFAULT_UTILIZATION_BAND };

      // ── Diameter list ────────────────────────────────────────────────────────
      let diameters: number[];
      if (inputs.diameterValues !== undefined) diameters = (inputs.diameterValues as unknown[]).map((v) => num(v)!);
      else {
        const sweep = inputs.diameterSweep as { min: number; max: number; step: number };
        const sweepMin = num(sweep.min)!; const sweepMax = num(sweep.max)!; const sweepStep = num(sweep.step)!;
        const nPoints = Math.floor((sweepMax - sweepMin) / sweepStep + 1e-9) + 1;
        diameters = Array.from({ length: nPoints }, (_, i) => Number((sweepMin + i * sweepStep).toFixed(10)));
      }
      const trialD = num(inputs.selectedTrialDiameter);
      if (trialD !== undefined && !diameters.some((d) => Math.abs(d - trialD) < 1e-9)) diameters = [...diameters, trialD].sort((a, b) => a - b);

      // ── Distributor module (refinement 6) ────────────────────────────────────
      const distIn = inputs.distributor as Record<string, unknown> | undefined;
      let distributorSpec: DistributorSpec | undefined;
      if (distIn) {
        distributorSpec = {
          distributorType: distIn.distributorType as string,
          freeAreaFraction: parseTagged(distIn.freeAreaFraction, 'distributor.freeAreaFraction', errs, { min: 0.001, max: 0.5, unit: '-' }) as DistributorSpec['freeAreaFraction'],
          holeVelocityLimits: (() => {
            const lim = distIn.holeVelocityLimits as Record<string, unknown> | undefined;
            if (!lim) return undefined;
            const lo = parseTagged(lim.min, 'distributor.holeVelocityLimits.min', errs, { min: 0, max: 10, unit: 'm/s' });
            const hi = parseTagged(lim.max, 'distributor.holeVelocityLimits.max', errs, { min: 0, max: 10, unit: 'm/s' });
            return lo && hi ? { min: lo as never, max: hi as never } : undefined;
          })(),
          maxCapacity: parseTagged(distIn.maxCapacity, 'distributor.maxCapacity', errs, { min: 0, max: 100000, unit: 'm3/h' }) as DistributorSpec['maxCapacity'],
        };
      }
      const distributorModule = distributorSpec ? resolveDistributorModule(distributorSpec.distributorType) : undefined;

      // ── Per-case diameter rating — ECP-001…ECP-004, ECP-007, ECP-008 ───────
      const utilizationPendingBase = packingAssumed || (derate?.sourceType === 'Assumed') || propertyAssumed;
      const runCase = (caseName: 'normal' | 'maximum', flows: ReturnType<typeof caseFlows>) => {
        const rows: Record<string, unknown>[] = [];
        for (const D of diameters) {
          const A = columnCrossSectionArea(D);
          const loadC = flows.qContinuous_m3_h / A;
          const loadD = flows.qDispersed_m3_h / A;
          const loadTot = loadC + loadD;
          const flowRatio = flows.qDispersed_m3_h / Math.max(flows.qContinuous_m3_h, SMALL);
          const loadsStatus: Classification = propertyAssumed ? 'Pending Validation' : 'Calculated Screening Result';
          const row: Record<string, unknown> = {
            diameter_m: D,
            area: item('ECP-001', A, 'm2', 'A = π·D²/4', 'Calculated Screening Result', 'Geometric'),
            loads: {
              continuous: item('ECP-001', loadC, 'm3/(m2.h)', `Q_${continuousPhase}/A`, loadsStatus, 'From entered flows and densities'),
              dispersed: item('ECP-001', loadD, 'm3/(m2.h)', `Q_${dispersedPhase}/A`, loadsStatus, 'From entered flows and densities'),
              total: item('ECP-001', loadTot, 'm3/(m2.h)', 'Total both-phase liquid load', loadsStatus, 'From entered flows and densities'),
              phaseNames: { continuousPhase, dispersedPhase },
              flowRatioDispersedToContinuous: flowRatio,
            },
          };

          // ECP-002 — utilization from Vendor Packing Capacity ONLY
          let feasibility: string;
          if (capacityBasis) {
            const evalX = capacityBasis.kind === 'constant' ? 0 : flowRatio; // curves are supplied vs dispersed/continuous flow ratio
            const cap = evaluatePerformanceBasis(capacityBasis, evalX);
            if (!cap.ok) {
              row.ecpHydraulicUtilization = item('ECP-002', null, '%', 'Vendor Packing Capacity', 'Not Calculable', cap.reason!, [cap.reason!]);
              pushWarning('VENDOR_CAPACITY_OUT_OF_DATA_RANGE', `${caseName} case, D = ${D} m: ${cap.reason}`);
              feasibility = 'not_calculable';
              notePending();
            } else {
              const effectiveCapacity = cap.value! * derateValue;
              const pct = (loadTot / effectiveCapacity) * 100;
              const utilStatus: Classification = utilizationPendingBase ? 'Pending Validation' : 'Calculated Screening Result';
              row.ecpHydraulicUtilization = item('ECP-002', pct, '%',
                `total load / (Vendor Packing Capacity ${cap.value!.toFixed(2)} ${cap.unit} [${cap.source}] × derating ${derateValue} [${derateSource}])`,
                utilStatus, utilStatus === 'Pending Validation' ? 'Vendor data contain Assumed entries' : 'Vendor performance data — not a vendor rating',
                []);
              feasibility = pct >= 100 ? 'hydraulically_infeasible'
                : pct > utilizationBand.max ? 'above_screening_band'
                  : pct < utilizationBand.min ? 'below_minimum_loading_band'
                    : 'within_screening_band';
            }
          } else {
            row.ecpHydraulicUtilization = item('ECP-002', null, '%', 'Vendor Packing Capacity', 'Pending Validation', 'No Vendor Packing Capacity data in the packing record — utilization cannot be screened; the C3 generic percentage is not a substitute');
            feasibility = 'pending_validation';
          }

          // ECP-003 — minimum wetting / recommended loading range
          if (packing.minimumWettingRate) {
            const ok = loadC >= packing.minimumWettingRate.value;
            row.minimumWettingStatus = item('ECP-003', ok ? 'ok' : 'below_minimum_wetting', '-', `continuous-phase load ${loadC.toFixed(2)} vs vendor minimum ${packing.minimumWettingRate.value} m3/(m2.h) (${packing.minimumWettingRate.sourceType}: ${packing.minimumWettingRate.sourceReference})`, packing.minimumWettingRate.sourceType === 'Assumed' ? 'Pending Validation' : 'Calculated Screening Result', ok ? 'Above vendor minimum wetting rate' : 'BELOW vendor minimum wetting rate — packing may de-wet');
            if (!ok) pushWarning('BELOW_MINIMUM_WETTING', `${caseName} case, D = ${D} m: continuous-phase load ${loadC.toFixed(2)} m3/(m2.h) is below the vendor minimum wetting rate ${packing.minimumWettingRate.value} m3/(m2.h).`);
          } else {
            row.minimumWettingStatus = item('ECP-003', null, '-', 'Vendor minimum wetting rate', 'Not Calculable', 'No vendor minimum wetting rate in the packing record — never assumed');
          }
          if (packing.recommendedLoadingRange) {
            const { min, max } = packing.recommendedLoadingRange;
            const state = loadTot < min.value ? 'below_recommended_range' : loadTot > max.value ? 'above_recommended_range' : 'within_recommended_range';
            row.recommendedLoadingStatus = item('ECP-003', state, '-', `total load ${loadTot.toFixed(2)} vs vendor recommended [${min.value}, ${max.value}] m3/(m2.h) (${min.sourceType}: ${min.sourceReference})`, min.sourceType === 'Assumed' || max.sourceType === 'Assumed' ? 'Pending Validation' : 'Calculated Screening Result', 'Vendor recommended loading range check');
            if (state === 'above_recommended_range') pushWarning('ABOVE_MAXIMUM_LIQUID_LOAD', `${caseName} case, D = ${D} m: total load ${loadTot.toFixed(2)} m3/(m2.h) exceeds the vendor recommended maximum ${max.value} m3/(m2.h).`);
          } else {
            row.recommendedLoadingStatus = item('ECP-003', null, '-', 'Vendor recommended loading range', 'Not Calculable', 'No vendor recommended loading range in the packing record');
          }

          // ECP-004 — modular distributor checks
          if (distributorSpec && distributorModule) {
            const check = distributorModule.evaluate(distributorSpec, { columnArea_m2: A, dispersedVolumetricFlow_m3_h: flows.qDispersed_m3_h, continuousVolumetricFlow_m3_h: flows.qContinuous_m3_h });
            if (check.assumedDataPresent) notePending();
            // Wrap each modular sub-check as a rich result item (refinement 8)
            const subStatus = (s: string): Classification => s === 'not_calculable' ? 'Not Calculable' : (check.assumedDataPresent ? 'Pending Validation' : 'Calculated Screening Result');
            const rich = (sub: { value?: number | null; unit?: string; status: string; reason?: string } | undefined, label: string) =>
              sub ? item('ECP-004', sub.value ?? null, sub.unit ?? '-', `${check.moduleId} (${check.distributorType})`, subStatus(sub.status), sub.reason ?? `${label}: ${sub.status}`, sub.status === 'outside_vendor_limits' ? [`${label} is outside vendor limits`] : [])
                : item('ECP-004', null, '-', `${check.moduleId} (${check.distributorType})`, 'Not Calculable', `${label}: no vendor datum supplied`);
            row.distributor = {
              formulaReference: 'ECP-004', moduleId: check.moduleId, distributorType: check.distributorType,
              dispersedPhaseLoad: rich(check.dispersedPhaseLoad, 'Dispersed-phase load'),
              totalLiquidLoad: rich(check.totalLiquidLoad, 'Total liquid load'),
              openAreaVelocity: rich(check.openAreaVelocity, 'Open-area velocity'),
              vendorCapacity: rich(check.vendorCapacity, 'Vendor distributor capacity'),
              overallStatus: check.overallStatus,
              status: (check.assumedDataPresent ? 'Pending Validation' : 'Calculated Screening Result') as Classification,
            };
            if (check.overallStatus === 'outside_vendor_limits') pushWarning('DISTRIBUTOR_OUTSIDE_VENDOR_LIMITS', `${caseName} case, D = ${D} m: distributor check '${check.distributorType}' is outside vendor limits.`);
          } else {
            row.distributor = { formulaReference: 'ECP-004', status: 'Not Calculable' as Classification, reason: 'No distributor specification supplied — checks run only when vendor distributor data exist' };
          }

          // ECP-007 — WET pressure drop only (dry is reserved architecture)
          const wet: PerformanceBasis | undefined = packing.pressureDropData?.wet;
          if (wet) {
            const dp = evaluatePerformanceBasis(wet, loadTot);
            if (!dp.ok) {
              row.pressureDrop = item('ECP-007', null, 'Pa', 'Vendor Pressure Drop (wet)', 'Not Calculable', dp.reason!, [dp.reason!]);
              pushWarning('PRESSURE_DROP_OUT_OF_DATA_RANGE', `${caseName} case, D = ${D} m: ${dp.reason}`);
            } else {
              const totalDp = dp.value! * packingHeight_m;
              const dpStatus: Classification = performanceBasisAssumed(wet) || hets.sourceType === 'Assumed' ? 'Pending Validation' : 'Calculated Screening Result';
              row.pressureDrop = {
                perMeter: item('ECP-007', dp.value!, 'Pa/m', `Vendor Pressure Drop (wet) at total load ${loadTot.toFixed(2)} m3/(m2.h) [${dp.source}]`, dpStatus, 'Interpolated inside vendor data range only'),
                total: item('ECP-007', totalDp, 'Pa', 'Δp/m × active packing height (ECP-005)', dpStatus, 'Wet pressure drop only — dry basis is reserved architecture'),
              };
            }
          } else {
            row.pressureDrop = item('ECP-007', null, 'Pa', 'Vendor Pressure Drop (wet)', 'Not Calculable', 'No wet pressure-drop basis in the packing record — no universal Pa/m value is invented; all other outputs are unaffected');
          }

          row.feasibility = feasibility;
          rows.push(row);
        }
        const within = rows.filter((r) => r.feasibility === 'within_screening_band');
        const feasible = rows.filter((r) => r.feasibility !== 'hydraulically_infeasible' && r.feasibility !== 'not_calculable' && r.feasibility !== 'pending_validation');
        return {
          caseName,
          flows: {
            rrboMassFlow_kg_h: flows.rrboMassFlow_kg_h, nmpMassFlow_kg_h: flows.nmpMassFlow_kg_h,
            rrboVolumetricFlow_m3_h: flows.qRRBO_m3_h, nmpVolumetricFlow_m3_h: flows.qNMP_m3_h,
            continuousPhase, dispersedPhase,
          },
          utilizationBandPercent: { ...utilizationBand, note: 'Configurable screening criterion — not a universal engineering rule' },
          diameters: rows,
          summary: {
            hydraulicallyInfeasibleDiameters_m: rows.filter((r) => r.feasibility === 'hydraulically_infeasible').map((r) => r.diameter_m),
            aboveScreeningBandDiameters_m: rows.filter((r) => r.feasibility === 'above_screening_band').map((r) => r.diameter_m),
            withinScreeningBandDiameters_m: within.map((r) => r.diameter_m),
            belowMinimumLoadingBandDiameters_m: rows.filter((r) => r.feasibility === 'below_minimum_loading_band').map((r) => r.diameter_m),
            minimumFeasibleDiameter_m: feasible.length ? (feasible[0].diameter_m as number) : null,
            screeningBandDiameterRange_m: within.length ? { min: within[0].diameter_m, max: within[within.length - 1].diameter_m } : null,
            selectedTrialDiameter_m: trialD ?? null,
            selectedTrialDiameterNote: trialD !== undefined ? 'Engineer-selected trial diameter (echoed and rated, not engine-recommended)' : 'No trial diameter selected — the engine does not recommend one',
          },
        };
      };

      const normalCase = runCase('normal', normalFlows);
      const maximumCase = runCase('maximum', maximumFlows);

      const calculationRunStatus = anyPending ? 'pending_validation' : 'screening_complete';

      const data: Record<string, unknown> = {
        applicabilityStatement: APPLICABILITY_STATEMENT,
        limitations: LIMITATIONS,
        calculationRunStatus,
        engineVersions: {
          cel: CEL_VERSION, epd: EPD_VERSION,
          processDesign: C2_PROCESS_DESIGN_VERSION, hydraulicsCommon: C3_HYDRAULICS_COMMON_VERSION,
          ecpPackedColumn: ENGINE_VERSION,
        },
        designBasis: {
          operatingTemperatureC: T,
          phaseConfiguration: { input: phaseConfig, continuousPhase, dispersedPhase, note: 'Phase continuity is taken from the engineer input only.' },
          feedFluid: { id: 'rrbo', enteredDensity: feedDensityEntry, enteredViscosity: feedViscosityEntry, densityUsed: { value: rhoRRBO.value, unit: rhoRRBO.unit, source: rhoRRBO.source } },
          solventFluid: { id: 'nmp', densityUsed: { value: rhoNMP.value, unit: rhoNMP.unit, source: rhoNMP.source } },
          packing: {
            consumedFrom: typeof inputs.packingId === 'string' ? `Packing Database record '${packing.id}'` : `Inline packing record '${packing.id}' (validated by the Packing Database module)`,
            record: structuredClone(packing), // snapshot — output mutations cannot affect registry or later runs
            note: 'The engine consumes packing data — it never owns packing data. Vendor identity is data, not code.',
          },
          hets: { ...hets, note: 'HETS is SYSTEM data (solvent + feed + packing + temperature), never packing data alone' },
          theoreticalStages: stages,
          heightBasis: 'HETS',
          systemDeratingFactor: derate ?? { value: 1.0, note: 'Not supplied — 1.0 applied with NO_SYSTEM_DERATING_DATA warning; never invented' },
          utilizationBandPercent: { ...utilizationBand, note: 'Configurable screening criterion — not a universal engineering rule' },
        },
        packingHeight: packingHeightItem,
        bedArrangement: {
          formulaReference: 'ECP-006',
          beds: beds.map((h, i) => ({ bed: i + 1, height_m: h })),
          redistributors: nRedistributors,
          basis: packing.maximumBedHeight ? `Vendor maximum bed height ${packing.maximumBedHeight.value} m (${packing.maximumBedHeight.sourceType}: ${packing.maximumBedHeight.sourceReference})` : 'No vendor bed-height limit supplied — single bed for screening (NO_BED_HEIGHT_LIMIT_DATA)',
        },
        heightBreakdown,
        normalCase, maximumCase,
        rateBasedPlaceholders: {
          note: 'Reserved architecture for a future rate-based path (heightBasis HTU_NTU). NOT calculated in Stage C4.',
          htu: null, ntu: null, ka: null, interfacialArea: null,
        },
        pressureDropArchitecture: { wetApplied: true, dryReserved: true, note: 'Dry and wet pressure drop are separated; only WET applies to the operating extraction column. Dry basis is reserved architecture.' },
        assumptions,
      };

      const status = warnings.length > 0 || anyPending ? 'warning' : 'success';
      return { ...base, status, data, warnings, validationIssues: errs };
    } catch (e) {
      if (e instanceof EngineeringInputError) {
        errs.push({ field: 'inputs', message: e.message, severity: 'error' });
        return { ...base, status: 'error', data: { calculationRunStatus: 'calculation_blocked' }, warnings, validationIssues: errs };
      }
      throw e;
    }
  }

  generateSummary(results: Record<string, unknown>): DesignSummary {
    const status = results.calculationRunStatus as string | undefined;
    const height = results.heightBreakdown as { totalTangentToTangent?: { result?: number } } | undefined;
    const keyResults = [
      height?.totalTangentToTangent?.result != null ? { label: 'Total tangent-to-tangent height', value: height.totalTangentToTangent.result, unit: 'm', highlight: true } : null,
      status ? { label: 'Run status', value: status, highlight: true } : null,
    ].filter(Boolean) as DesignSummary['keyResults'];
    return {
      keyResults,
      recommendations: [
        'PRELIMINARY ECP-TYPE PACKED COLUMN SCREENING — NOT VENDOR RATING AND NOT FOR FABRICATION.',
        'Confirm HETS, packing capacity, wetting limits and distributor limits with the packing vendor before rating.',
      ],
      warnings: [],
      calculationClass: 'Preliminary Screening',
    };
  }
}
