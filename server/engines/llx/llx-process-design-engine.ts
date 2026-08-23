// ═══════════════════════════════════════════════════════════════════════════════
// LLX — Process Design Engine (Stage C2) — v1.3.0
//
// Implements PD-001…PD-008, PD-010 per the approved corrected Stage C2 basis:
//   - Three-pseudo-component screening balance: Oil carrier / Extractable
//     solute / NMP solvent.
//   - No zero defaults for split fractions: missing loss data ⇒ outlet phase
//     split is Pending Validation; only the gross inlet balance is calculated.
//   - Zero-loss values are accepted ONLY as explicit source-tagged entries and
//     are stored in the assumptions register.
//   - Normal and maximum continuous solvent cases are fully independent
//     balances. Reusing normal-case splits for the maximum case requires the
//     explicit option applyNormalSplitsToMaximumCase and emits
//     CASE_SPLIT_ASSUMPTIONS_REUSED (maximum case stays Pending Validation).
//   - Kremser is NOT implemented (PD-009 retired for Stage C2).
//   - extractionFactor (A = m·S/F) is a definition only — never used to
//     predict recovery.
//   - No equilibrium/LLE data is invented anywhere.
//
// Result-item classifications: 'Calculated Screening Result' |
// 'Pending Validation' | 'Not Calculable'.
// Overall status: screening_complete | pending_validation | calculation_blocked.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  IDesignEngine, ValidationResult, ValidationError, CalculationContext,
  CalculationResult, DesignSummary, EngineWarning,
} from '../../engine-framework/types';
import {
  CEL_VERSION, EPD_VERSION,
  getProperty,
  containsAssumedData, EngineeringInputError,
  SOURCE_TYPES,
} from '../../engine-framework/common-engineering-library';
import type { SourceType } from '../../engine-framework/epd/types';
import {
  computeGovernedTheoreticalStages, GovernedNtResult,
  COTO_2022_CITATION, COTO_2022_DATASET_ID, COTO_2022_DATASET_VERSION,
  COTO_2022_TEMPERATURE_K, SURROGATE_MW, COTO_COMPONENTS, COTO_COMPONENT_ROLES,
} from '../../engine-framework/cel/coto2022-nmp-lle';
import {
  temperatureModelStatus, generateModelTieLinesAtTemperature, TlleModelError,
  experimentalFamilyForTemperature, resolveThermodynamicValidityAtTemperature,
  TLLE_MODEL_ID, TLLE_MODEL_VERSION, TLLE_MODEL_NAME, TLLE_MODEL_CITATION,
  TLLE_REPRODUCTION_RECORD, TLLE_EXTRAPOLATION_CLASSIFICATION,
} from '../../engine-framework/cel/llx-temperature-lle-model';
import {
  computeNrtlDirectCascadeNt,
} from '../../engine-framework/cel/llx-nrtl-direct-cascade';
import {
  calculateHydrocarbonProductQuality,
  type ProductQualityQuantities,
} from '../../engine-framework/cel/product-quality-basis';

// ── Input structures ──────────────────────────────────────────────────────────

interface TaggedValue {
  value: number;
  sourceType: SourceType;
  sourceReference: string;
}

interface SplitSet {
  soluteRecoveryToExtract?: TaggedValue;      // r  ∈ [0,1]
  solventCarryoverFraction?: TaggedValue;     // s_L ∈ [0,1] (NMP to raffinate)
  oilLossToExtractFraction?: TaggedValue;     // o_L ∈ [0,1]
}

const PHASE_CONFIGS = ['rrbo_continuous_nmp_dispersed', 'nmp_continuous_rrbo_dispersed'] as const;
type PhaseConfig = (typeof PHASE_CONFIGS)[number];

const RATIO_TOLERANCE = 0.001; // 0.1 % — PD-003 acceptance tolerance
const SMALL = 1e-12;

type Classification = 'Calculated Screening Result' | 'Pending Validation' | 'Not Calculable';

interface AssumptionEntry {
  assumption: string;
  sourceType?: SourceType;
  sourceReference?: string;
  scope: string; // 'run' | 'normal case' | 'maximum case'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/**
 * Build reporting-only product quality from the C2 raffinate-end state.
 *
 * The mole fraction remains on the existing Coto/NRTL pseudo-component
 * coordinate. The mass fraction uses the entered RRBO class wt% and the same
 * component split used by the cascade trace. NMP is deliberately absent from
 * the mass denominator; this helper does not feed any process calculation.
 */
function deriveC2RaffinateProductQuality(
  lleResult: GovernedNtResult,
  lleInputEcho: Record<string, unknown> | undefined,
  feedMassFlow_kg_h: number,
): ProductQualityQuantities | null {
  const directTrace = (lleResult as GovernedNtResult & {
    directCascadeTrace?: {
      feedMoleFractions_normalized?: readonly number[];
      feedBasis_mol?: number;
      stages?: readonly [{ raffinateFlow_mol?: number; raffinate_x?: readonly number[] }, ...unknown[]];
    };
  }).directCascadeTrace;
  const directStage = directTrace?.stages?.[0];
  const governedStage = lleResult.stageTrace[0];
  const raffinateX = directStage?.raffinate_x ?? governedStage?.raffinateLeaving?.x ?? lleResult.spec?.raffinate;
  const raffinateFlow = directStage?.raffinateFlow_mol
    ?? governedStage?.raffinateLeaving?.flow_mol
    ?? lleResult.balances?.basisRaffinateFlow_mol;
  const feedX = directTrace?.feedMoleFractions_normalized
    ?? (lleInputEcho?.feedMoleFractions as readonly number[] | undefined);
  const feedFlow = directTrace?.feedBasis_mol ?? lleResult.balances?.impliedFeedFlow_mol;
  if (
    !raffinateX || raffinateX.length !== 5 ||
    !feedX || feedX.length !== 5 ||
    !Number.isFinite(raffinateFlow) || !Number.isFinite(feedFlow) ||
    !(raffinateFlow! > 0) || !(feedFlow! > 0) ||
    !(feedMassFlow_kg_h > 0)
  ) return null;

  const wtRecord = lleInputEcho?.rrboCharacterisationWtPct as Record<string, unknown> | undefined;
  const wt = ['saturates', 'monoAromatics', 'diAromatics', 'polyAromatics'].map((key) => {
    const value = (wtRecord?.[key] as Record<string, unknown> | undefined)?.value;
    return num(value);
  });
  if (wt.some((value) => value === undefined)) return null;

  const raffinateMassFlows = wt.map((value, index) => {
    const feedMoles = feedX[index] ?? 0;
    const split = feedMoles > 0 ? ((raffinateFlow! * (raffinateX![index] ?? 0)) / (feedFlow! * feedMoles)) : 0;
    return feedMassFlow_kg_h * (value! / 100) * Math.max(0, Math.min(1, split));
  });
  try {
    return calculateHydrocarbonProductQuality({
      componentMoleFractions: raffinateX,
      componentMassFlows_kg_h: [...raffinateMassFlows, 0],
    });
  } catch {
    return null;
  }
}

function parseTagged(raw: unknown, field: string, errors: ValidationError[], opts: { min: number; max: number; minExclusive?: boolean; maxExclusive?: boolean }): TaggedValue | undefined {
  if (raw === undefined || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const value = num(o.value);
  if (value === undefined) {
    errors.push({ field, message: `${field}.value must be a finite number`, severity: 'error' });
    return undefined;
  }
  const belowMin = opts.minExclusive ? value <= opts.min : value < opts.min;
  const aboveMax = opts.maxExclusive ? value >= opts.max : value > opts.max;
  if (belowMin || aboveMax) {
    errors.push({
      field,
      message: `${field}.value must be in ${opts.minExclusive ? '(' : '['}${opts.min}, ${opts.max}${opts.maxExclusive ? ')' : ']'} (got ${value})`,
      severity: 'error',
    });
    return undefined;
  }
  if (!SOURCE_TYPES.includes(o.sourceType as SourceType)) {
    errors.push({ field, message: `${field}.sourceType must be one of ${SOURCE_TYPES.join(', ')}`, severity: 'error' });
    return undefined;
  }
  if (typeof o.sourceReference !== 'string' || !o.sourceReference.trim()) {
    errors.push({ field, message: `${field}.sourceReference is mandatory`, severity: 'error' });
    return undefined;
  }
  return { value, sourceType: o.sourceType as SourceType, sourceReference: o.sourceReference };
}

function parseSplitSet(raw: unknown, prefix: string, errors: ValidationError[]): SplitSet {
  if (raw === undefined || raw === null) return {};
  const o = raw as Record<string, unknown>;
  return {
    soluteRecoveryToExtract: parseTagged(o.soluteRecoveryToExtract, `${prefix}.soluteRecoveryToExtract`, errors, { min: 0, max: 1 }),
    solventCarryoverFraction: parseTagged(o.solventCarryoverFraction, `${prefix}.solventCarryoverFraction`, errors, { min: 0, max: 1 }),
    oilLossToExtractFraction: parseTagged(o.oilLossToExtractFraction, `${prefix}.oilLossToExtractFraction`, errors, { min: 0, max: 1 }),
  };
}

// ── Per-case balance (PD-004 / PD-006 / PD-007) ──────────────────────────────

interface CaseBalanceArgs {
  caseName: 'normal' | 'maximum';
  feedMassFlow: number;          // F, kg/h
  solventMassFlow: number;       // S for THIS case, kg/h
  soluteMassFractionInFeed?: TaggedValue; // x_F
  splits: SplitSet;
  splitsReused: boolean;         // maximum case reusing normal splits
}

function computeCaseBalance(args: CaseBalanceArgs): {
  result: Record<string, unknown>;
  classification: Classification;
  warnings: EngineWarning[];
  assumptions: AssumptionEntry[];
  pending: boolean;
} {
  const { caseName, feedMassFlow: F, solventMassFlow: S, soluteMassFractionInFeed: xF, splits } = args;
  const warnings: EngineWarning[] = [];
  const assumptions: AssumptionEntry[] = [];
  const scope = `${caseName} case`;

  // Gross inlet balance is always calculable
  const grossInlet = {
    feedMassFlow: F,
    solventMassFlow: S,
    totalInletMassFlow: F + S,
    unit: 'kg/h',
    classification: 'Calculated Screening Result' as Classification,
  };

  const missing: string[] = [];
  if (!xF) missing.push('soluteMassFractionInFeed');
  if (!splits.soluteRecoveryToExtract) missing.push('soluteRecoveryToExtract');
  if (!splits.solventCarryoverFraction) missing.push('solventCarryoverFraction');
  if (!splits.oilLossToExtractFraction) missing.push('oilLossToExtractFraction');

  if (missing.length > 0) {
    // PD-006 correction 2: never assume zero. Outlet split cannot be completed.
    warnings.push({
      code: 'OUTLET_SPLIT_INCOMPLETE',
      message: `${scope}: outlet phase split cannot be completed — missing source-tagged inputs: ${missing.join(', ')}. Only the gross inlet balance F + S is calculated. No zero-loss values were assumed.`,
    });
    return {
      result: {
        grossInletBalance: grossInlet,
        componentBalance: {
          classification: 'Pending Validation' as Classification,
          statement: 'Outlet phase split cannot be completed',
          missingInputs: missing,
        },
        yields: { classification: 'Pending Validation' as Classification, missingInputs: missing },
      },
      classification: 'Pending Validation',
      warnings,
      assumptions,
      pending: true,
    };
  }

  const r = splits.soluteRecoveryToExtract!;
  const sL = splits.solventCarryoverFraction!;
  const oL = splits.oilLossToExtractFraction!;

  // Explicit zero-loss entries are legitimate but must be registered as assumptions.
  if (sL.value === 0) {
    assumptions.push({ assumption: 'Zero NMP loss to raffinate (solventCarryoverFraction = 0)', sourceType: sL.sourceType, sourceReference: sL.sourceReference, scope });
  }
  if (oL.value === 0) {
    assumptions.push({ assumption: 'Zero oil loss to extract (oilLossToExtractFraction = 0)', sourceType: oL.sourceType, sourceReference: oL.sourceReference, scope });
  }
  if (args.splitsReused) {
    warnings.push({
      code: 'CASE_SPLIT_ASSUMPTIONS_REUSED',
      message: 'Maximum continuous case reuses the normal-case split fractions (r, s_L, o_L) as an explicit screening assumption. Split fractions are not proven independent of solvent flow — the maximum case remains Pending Validation.',
    });
    assumptions.push({ assumption: 'Normal-case split fractions (r, s_L, o_L) applied unchanged to the maximum continuous solvent case (screening assumption)', scope });
  }

  // PD-006 — three-pseudo-component balance
  const oilCarrierInFeed = F * (1 - xF!.value);
  const soluteInFeed = F * xF!.value;
  const soluteToExtract = r.value * soluteInFeed;
  const soluteToRaffinate = (1 - r.value) * soluteInFeed;
  const nmpToRaffinate = sL.value * S;
  const nmpToExtract = (1 - sL.value) * S;
  const oilToExtract = oL.value * oilCarrierInFeed;
  const oilToRaffinate = (1 - oL.value) * oilCarrierInFeed;

  const raffinateTotal = oilToRaffinate + soluteToRaffinate + nmpToRaffinate;
  const extractTotal = soluteToExtract + nmpToExtract + oilToExtract;
  const totalIn = F + S;
  const totalOut = raffinateTotal + extractTotal;
  const closureAbsolute = Math.abs(totalIn - totalOut);
  const closureRelative = closureAbsolute / Math.max(totalIn, SMALL);
  if (closureRelative > 1e-9) {
    warnings.push({
      code: 'BALANCE_CLOSURE_ERROR',
      message: `${scope}: overall balance closure error ${closureAbsolute.toExponential(3)} kg/h (${(closureRelative * 100).toExponential(3)} %) exceeds numerical tolerance.`,
    });
  }

  // Anything derived from Assumed split inputs is Pending Validation.
  const anyAssumedSplit = [xF!, r, sL, oL].some((t) => t.sourceType === 'Assumed');
  const pending = anyAssumedSplit || args.splitsReused;
  const classification: Classification = pending ? 'Pending Validation' : 'Calculated Screening Result';
  if (anyAssumedSplit) {
    warnings.push({
      code: 'ASSUMED_SPLIT_INPUT',
      message: `${scope}: one or more split inputs (x_F, r, s_L, o_L) are source-tagged 'Assumed' — the component balance is Pending Validation.`,
    });
  }

  // PD-007 — corrected yield terminology (correction 1):
  // never present a solvent-containing stream ratio as a product yield.
  const yields = {
    grossRaffinateToFeedRatio: raffinateTotal / F,   // total raffinate stream / RRBO feed
    grossExtractToFeedRatio: extractTotal / F,       // total extract stream / RRBO feed
    solventFreeRaffinateYield: (oilToRaffinate + soluteToRaffinate) / F,
    recoveredOilCarrierYield: oilCarrierInFeed > 0 ? oilToRaffinate / oilCarrierInFeed : null,
    extractedSoluteRecovery: soluteInFeed > 0 ? soluteToExtract / soluteInFeed : null,
    solventRecoveryToExtract: nmpToExtract / S,
    nmpCarryoverToRaffinate: nmpToRaffinate / S,
    classification,
  };

  return {
    result: {
      grossInletBalance: grossInlet,
      componentBalance: {
        classification,
        unit: 'kg/h',
        feed: { oilCarrier: oilCarrierInFeed, solute: soluteInFeed, nmp: 0, total: F },
        solvent: { oilCarrier: 0, solute: 0, nmp: S, total: S },
        raffinate: { oilCarrier: oilToRaffinate, solute: soluteToRaffinate, nmp: nmpToRaffinate, total: raffinateTotal },
        extract: { oilCarrier: oilToExtract, solute: soluteToExtract, nmp: nmpToExtract, total: extractTotal },
        closure: { absolute_kg_h: closureAbsolute, relative: closureRelative },
        splitFractionsUsed: {
          soluteMassFractionInFeed: xF,
          soluteRecoveryToExtract: r,
          solventCarryoverFraction: sL,
          oilLossToExtractFraction: oL,
          reusedFromNormalCase: args.splitsReused,
        },
      },
      yields,
    },
    classification,
    warnings,
    assumptions,
    pending,
  };
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class LLXProcessDesignEngine implements IDesignEngine {
  getEngineId(): string { return 'llx-process-design'; }
  getEngineVersion(): string { return '1.3.0'; }
  getModuleType(): string { return 'llx'; }
  getCalculationType(): string { return 'process_design'; }

  validate(inputs: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    const err = (field: string, message: string) => errors.push({ field, message, severity: 'error' });
    const warn = (field: string, message: string) => errors.push({ field, message, severity: 'warning' });

    const T = num(inputs.operatingTemperature);
    if (T === undefined) err('operatingTemperature', 'operatingTemperature (°C) is required and must be a finite number');
    else if (T < -273.15) err('operatingTemperature', 'operatingTemperature is below absolute zero');

    // Extraction Temperature — the governing LLE calculation input (optional;
    // defaults to operatingTemperature when absent).
    const extT = num(inputs.extractionTemperature);
    if (inputs.extractionTemperature !== undefined && inputs.extractionTemperature !== null && String(inputs.extractionTemperature).trim() !== '') {
      if (extT === undefined) err('extractionTemperature', 'extractionTemperature (°C) must be a finite number when provided');
      else if (extT < -273.15) err('extractionTemperature', 'extractionTemperature is below absolute zero');
    }

    // Feed flow
    const feedFlow = inputs.feedFlow as Record<string, unknown> | undefined;
    const feedValue = num(feedFlow?.value);
    if (!feedFlow || feedValue === undefined || feedValue <= 0) {
      err('feedFlow', 'feedFlow { value > 0, basis } is required');
    } else if (feedFlow.basis !== 'mass' && feedFlow.basis !== 'volumetric') {
      err('feedFlow.basis', "feedFlow.basis must be 'mass' (kg/h) or 'volumetric' (m³/h)");
    }

    // Solvent basis — solventFlow and/or solventToOilRatio (PD-003 consistency in calculate)
    const sFlow = num(inputs.solventFlow);
    const sRatio = num(inputs.solventToOilRatio);
    if (sFlow === undefined && sRatio === undefined) {
      err('solventFlow', 'Provide solventFlow (kg/h), solventToOilRatio (kg NMP / kg RRBO feed), or both');
    }
    if (inputs.solventFlow !== undefined && (sFlow === undefined || sFlow <= 0)) err('solventFlow', 'solventFlow must be > 0 kg/h');
    if (inputs.solventToOilRatio !== undefined && (sRatio === undefined || sRatio <= 0)) err('solventToOilRatio', 'solventToOilRatio must be > 0');

    // Max circulation factor — required design-case multiplier, no silent default
    const fMax = num(inputs.maxCirculationFactor);
    if (fMax === undefined) err('maxCirculationFactor', 'maxCirculationFactor is required (design-case multiplier for the maximum continuous solvent-flow case)');
    else if (fMax < 1.0) err('maxCirculationFactor', 'maxCirculationFactor must be ≥ 1.0');
    else if (fMax < 1.1 || fMax > 1.5) warn('maxCirculationFactor', `maxCirculationFactor ${fMax} is outside the typical screening band 1.1–1.5`);

    // Phase configuration — controlled values; continuity is NEVER inferred from density
    if (!PHASE_CONFIGS.includes(inputs.phaseConfiguration as PhaseConfig)) {
      err('phaseConfiguration', `phaseConfiguration must be one of: ${PHASE_CONFIGS.join(', ')}`);
    }

    // Stage inputs — theoreticalStages is now the ENGINEER OVERRIDE value,
    // used ONLY when the governed Coto 2022 N_T cannot be auto-calculated.
    // It remains optional-but-validated: when the governed calculation fails
    // closed AND no override is present, the stage block is Not Calculable.
    const N = num(inputs.theoreticalStages);
    if (inputs.theoreticalStages !== undefined && inputs.theoreticalStages !== null && String(inputs.theoreticalStages).trim() !== '') {
      if (N === undefined || N < 1 || !Number.isInteger(N)) err('theoreticalStages', 'theoreticalStages (Engineer Override N_T) must be an integer ≥ 1');
      else if (N > 20) warn('theoreticalStages', `theoreticalStages = ${N} is unusually high for screening — verify`);
    }
    // Governed LLE stage inputs — structural validation only (optional block)
    const lle = inputs.lleStageInputs as Record<string, unknown> | undefined;
    if (lle !== undefined && lle !== null) {
      const ch = lle.rrboCharacterisationWtPct as Record<string, unknown> | undefined;
      const mw = lle.classMolecularWeights as Record<string, unknown> | undefined;
      const classes = ['saturates', 'monoAromatics', 'diAromatics', 'polyAromatics'] as const;
      if (ch) {
        let sumPct = 0; let all = true;
        for (const c of classes) {
          const t = parseTagged(ch[c], `lleStageInputs.rrboCharacterisationWtPct.${c}`, errors, { min: 0, max: 100 });
          if (t) sumPct += t.value; else all = false;
        }
        if (all && Math.abs(sumPct - 100) > 0.5) err('lleStageInputs.rrboCharacterisationWtPct', `RRBO characterisation classes must sum to 100 wt % ± 0.5 (got ${sumPct.toFixed(2)})`);
      }
      // classMolecularWeights removed: wt%→mol now uses governed Coto 2022 surrogate MWs (engine constants).
      if (lle.targetRaffinateAromaticsMolePct !== undefined) parseTagged(lle.targetRaffinateAromaticsMolePct, 'lleStageInputs.targetRaffinateAromaticsMolePct', errors, { min: 0, max: 100, minExclusive: true, maxExclusive: true });
      if (lle.solventNmpMoleFraction !== undefined) parseTagged(lle.solventNmpMoleFraction, 'lleStageInputs.solventNmpMoleFraction', errors, { min: 0, max: 1, minExclusive: true });
    }
    // Stage/compartment efficiency is OPTIONAL and informational-only for
    // packed columns: the governing height calculation is H_active = N_T ×
    // HETS (ECP engine). It applies only where a separately governed
    // stage-efficiency model exists (e.g. ECR mixer-settler compartments).
    // It is never defaulted.
    const eff = num(inputs.compartmentOrStageEfficiency);
    if (eff !== undefined) {
      if (eff <= 0 || eff > 1) err('compartmentOrStageEfficiency', 'compartmentOrStageEfficiency must be in (0, 1] when provided');
      else if (eff < 0.2) warn('compartmentOrStageEfficiency', `compartmentOrStageEfficiency = ${eff} is unusually low — verify`);
    }

    // Optional tagged inputs — structural validation
    parseTagged(inputs.soluteMassFractionInFeed, 'soluteMassFractionInFeed', errors, { min: 0, max: 1, minExclusive: true, maxExclusive: true });
    const caseSplits = inputs.caseSplits as Record<string, unknown> | undefined;
    parseSplitSet(caseSplits?.normal, 'caseSplits.normal', errors);
    parseSplitSet(caseSplits?.maximum, 'caseSplits.maximum', errors);

    // Distribution ratio metadata (PD-008, correction 4)
    const dr = inputs.distributionRatio as Record<string, unknown> | undefined;
    if (dr !== undefined && dr !== null) {
      const mv = num(dr.value);
      if (mv === undefined || mv <= 0) err('distributionRatio.value', 'distributionRatio.value must be > 0');
      if (!SOURCE_TYPES.includes(dr.sourceType as SourceType)) err('distributionRatio.sourceType', `distributionRatio.sourceType must be one of ${SOURCE_TYPES.join(', ')}`);
      if (typeof dr.sourceReference !== 'string' || !dr.sourceReference.trim()) err('distributionRatio.sourceReference', 'distributionRatio.sourceReference is mandatory');
    }

    return { valid: errors.filter((e) => e.severity === 'error').length === 0, errors };
  }

  async calculate(inputs: Record<string, unknown>, context: CalculationContext): Promise<CalculationResult> {
    const base = {
      calculationClass: context.calculationClass ?? 'Preliminary Screening',
      engineId: this.getEngineId(),
      engineVersion: this.getEngineVersion(),
      computedAt: new Date(),
    };
    const warnings: EngineWarning[] = [];
    const assumptions: AssumptionEntry[] = [
      { assumption: 'Steady state — no accumulation', scope: 'run' },
      { assumption: 'Isothermal operation at the stated operating temperature; no heat effects', scope: 'run' },
      { assumption: 'Negligible evaporation of NMP and RRBO at operating conditions', scope: 'run' },
      { assumption: 'Complete phase disengagement at battery limits', scope: 'run' },
    ];
    // Gate: calculate() must never run arithmetic on inputs that fail
    // validation — regardless of whether the caller validated first.
    const gate = this.validate(inputs);
    const gateErrors = gate.errors.filter((e) => e.severity === 'error');
    if (gateErrors.length > 0) {
      return {
        ...base,
        status: 'error',
        data: { calculationRunStatus: 'calculation_blocked' },
        warnings,
        validationIssues: gate.errors,
      };
    }

    const errs: ValidationError[] = [];

    try {
      const T = num(inputs.operatingTemperature)!;

      // Extraction temperature — resolved once here; used for both the
      // phase-separation density evaluation (PD-005) and the LLE block further
      // below.  Must NOT be inferred from operatingTemperature at PD-005: the
      // density difference must be calculated at the governing extraction T,
      // not merely at whatever temperature happens to equal it through the
      // mapper.  Falls back to operatingTemperature only when the engineer has
      // not entered a separate extraction temperature.
      const extractionTemperatureC = num(inputs.extractionTemperature) ?? T;
      const extractionTemperatureSource = num(inputs.extractionTemperature) !== undefined
        ? String((inputs.extractionTemperatureProvenance as string | undefined) ?? 'Extraction Temperature field (Process Design workspace)')
        : 'Operating Temperature (Design Basis) — no separate extraction temperature entered';

      // RRBO grade fluid ID — set by the mapper from Design Basis feed_service;
      // falls back to SN300 only if the mapper did not resolve it (pre-existing runs).
      const rrboFluidId = String(inputs.rrboFluidId ?? 'rrbo-sn300');

      // PD-001-density — density at operatingTemperature for flow-basis conversion
      // (volumetric flows, S/O ratio).  These must reflect the actual phase
      // conditions at the operating point, not the equilibrium extraction point.
      // Both densities are from the governed EPD library — no user entry.
      const rhoFeed = getProperty(rrboFluidId, 'density', T);
      const rhoSolvent = getProperty('nmp', 'density', T);
      for (const w of [...rhoFeed.warnings, ...rhoSolvent.warnings]) {
        warnings.push({ code: w.code, message: w.message });
      }
      let propertyAssumed = containsAssumedData(rhoFeed.warnings) || containsAssumedData(rhoSolvent.warnings);

      // PD-005-density — density at EXTRACTION temperature for phase-separation
      // screening (Δρ, buoyancy direction).  Independent of the flow-basis
      // densities above; extraction T may differ from operating T.
      const rhoFeed_atExtT = getProperty(rrboFluidId, 'density', extractionTemperatureC);
      const rhoSolvent_atExtT = getProperty('nmp', 'density', extractionTemperatureC);
      for (const w of [...rhoFeed_atExtT.warnings, ...rhoSolvent_atExtT.warnings]) {
        // De-duplicate: only push if not already present from the operating-T call
        const key = `${w.code}:${w.message}`;
        const alreadyPresent = warnings.some((x) => `${x.code}:${x.message}` === key);
        if (!alreadyPresent) warnings.push({ code: w.code, message: w.message });
      }
      if (containsAssumedData(rhoFeed_atExtT.warnings) || containsAssumedData(rhoSolvent_atExtT.warnings)) {
        propertyAssumed = true;
      }

      // PD-001 — flow basis conversion
      const feedFlow = inputs.feedFlow as { value: number; basis: 'mass' | 'volumetric' };
      const feedMassFlow = feedFlow.basis === 'mass' ? num(feedFlow.value)! : num(feedFlow.value)! * rhoFeed.value;
      const feedVolumetricFlow = feedMassFlow / rhoFeed.value;

      // PD-002 / PD-003 — solvent basis and consistency
      const enteredSolventFlow = num(inputs.solventFlow);
      const enteredRatio = num(inputs.solventToOilRatio);
      let normalSolventMassFlow: number;
      let solventFlowConsistency: Record<string, unknown> | undefined;
      if (enteredSolventFlow !== undefined && enteredRatio !== undefined) {
        const impliedRatio = enteredSolventFlow / feedMassFlow;
        const absoluteDifference = Math.abs(impliedRatio - enteredRatio);
        const relativeDifference = absoluteDifference / Math.max(Math.abs(enteredRatio), SMALL);
        solventFlowConsistency = {
          enteredSolventFlow_kg_h: enteredSolventFlow,
          enteredSolventToOilRatio: enteredRatio,
          impliedRatio,
          absoluteDifference,
          relativeDifference,
          acceptanceTolerance: RATIO_TOLERANCE,
        };
        if (relativeDifference > RATIO_TOLERANCE) {
          errs.push({
            field: 'solventToOilRatio',
            message: `Inconsistent solvent basis: implied ratio ${impliedRatio.toFixed(6)} vs entered ${enteredRatio} — relative difference ${(relativeDifference * 100).toFixed(3)} % exceeds 0.1 % tolerance.`,
            severity: 'error',
          });
          return { ...base, status: 'error', data: { solventFlowConsistency, calculationRunStatus: 'calculation_blocked' }, warnings, validationIssues: errs };
        }
        normalSolventMassFlow = enteredSolventFlow;
      } else if (enteredSolventFlow !== undefined) {
        normalSolventMassFlow = enteredSolventFlow;
      } else {
        normalSolventMassFlow = enteredRatio! * feedMassFlow;
      }

      const solventToOilRatio = {
        value: normalSolventMassFlow / feedMassFlow,
        basis: 'normal NMP mass flow / total RRBO feed mass flow',
        ratioBasis: 'total_feed_mass' as const, // reserved future basis: 'de_solvated_oil_carrier_mass'
      };

      // PD-004 — design cases
      const maxCirculationFactor = num(inputs.maxCirculationFactor)!;
      const maximumSolventMassFlow = maxCirculationFactor * normalSolventMassFlow;
      const normalSolventVolumetricFlow = normalSolventMassFlow / rhoSolvent.value;
      const maximumSolventVolumetricFlow = maximumSolventMassFlow / rhoSolvent.value;

      // PD-005 — phase configuration (continuity from engineer input ONLY)
      // Δρ is computed at the governed extraction temperature, not operatingT.
      // No hardcoded screening threshold is applied: Δρ is always reported and
      // the engineer interprets it against system-specific phase-separation
      // knowledge.  A threshold would require a controlled-literature basis
      // that does not currently exist in the system.
      const phaseConfig = inputs.phaseConfiguration as PhaseConfig;
      const continuousPhase = phaseConfig === 'rrbo_continuous_nmp_dispersed' ? 'RRBO' : 'NMP';
      const dispersedPhase = phaseConfig === 'rrbo_continuous_nmp_dispersed' ? 'NMP' : 'RRBO';
      const densityDifference_atExtT = Math.abs(rhoSolvent_atExtT.value - rhoFeed_atExtT.value);
      const lighterPhase = rhoFeed_atExtT.value < rhoSolvent_atExtT.value ? 'RRBO'
                         : rhoFeed_atExtT.value > rhoSolvent_atExtT.value ? 'NMP' : null;
      let phaseClassification: Classification = 'Calculated Screening Result';
      if (lighterPhase === null) {
        phaseClassification = 'Not Calculable';
        warnings.push({ code: 'ZERO_DENSITY_DIFFERENCE', message: `RRBO and NMP densities are equal at the extraction temperature ${extractionTemperatureC} °C (Δρ = 0) — buoyancy direction is Not Calculable and gravity settling is infeasible.` });
      }

      // Split inputs per case (correction 2 — independent cases)
      const xF = parseTagged(inputs.soluteMassFractionInFeed, 'soluteMassFractionInFeed', [], { min: 0, max: 1, minExclusive: true, maxExclusive: true });
      const caseSplitsRaw = inputs.caseSplits as Record<string, unknown> | undefined;
      const normalSplits = parseSplitSet(caseSplitsRaw?.normal, 'caseSplits.normal', []);
      let maximumSplits = parseSplitSet(caseSplitsRaw?.maximum, 'caseSplits.maximum', []);
      let maxSplitsReused = false;
      const hasAnyMaxSplit = !!(maximumSplits.soluteRecoveryToExtract || maximumSplits.solventCarryoverFraction || maximumSplits.oilLossToExtractFraction);
      if (!hasAnyMaxSplit && inputs.applyNormalSplitsToMaximumCase === true) {
        maximumSplits = normalSplits;
        maxSplitsReused = true;
      }

      // Tagged-input assumption tracking
      const taggedInputs = [xF, normalSplits.soluteRecoveryToExtract, normalSplits.solventCarryoverFraction, normalSplits.oilLossToExtractFraction,
        maximumSplits.soluteRecoveryToExtract, maximumSplits.solventCarryoverFraction, maximumSplits.oilLossToExtractFraction].filter(Boolean) as TaggedValue[];
      const anyAssumedInput = taggedInputs.some((t) => t.sourceType === 'Assumed');

      const normalCase = computeCaseBalance({
        caseName: 'normal', feedMassFlow, solventMassFlow: normalSolventMassFlow,
        soluteMassFractionInFeed: xF, splits: normalSplits, splitsReused: false,
      });
      const maximumCase = computeCaseBalance({
        caseName: 'maximum', feedMassFlow, solventMassFlow: maximumSolventMassFlow,
        soluteMassFractionInFeed: xF, splits: maximumSplits, splitsReused: maxSplitsReused,
      });
      warnings.push(...normalCase.warnings, ...maximumCase.warnings);
      assumptions.push(...normalCase.assumptions, ...maximumCase.assumptions);

      // PD-008 — extraction factor (definition only; symbol A, never E/ε)
      let extractionFactor: Record<string, unknown> | undefined;
      const dr = inputs.distributionRatio as Record<string, unknown> | undefined;
      if (dr) {
        const metaMissing: string[] = [];
        if (typeof dr.numeratorPhase !== 'string' || !dr.numeratorPhase) metaMissing.push('numeratorPhase');
        if (typeof dr.denominatorPhase !== 'string' || !dr.denominatorPhase) metaMissing.push('denominatorPhase');
        if (typeof dr.concentrationBasis !== 'string' || !dr.concentrationBasis) metaMissing.push('concentrationBasis');
        if (num(dr.temperatureC) === undefined) metaMissing.push('temperatureC');
        if (!SOURCE_TYPES.includes(dr.sourceType as SourceType)) metaMissing.push('sourceType');
        if (typeof dr.sourceReference !== 'string' || !dr.sourceReference.trim()) metaMissing.push('sourceReference');
        const complete = metaMissing.length === 0;
        extractionFactor = {
          symbol: 'A',
          definition: 'A = m · S/F — m is the equilibrium solute distribution ratio (engineer-supplied). NOT used to predict recovery in Stage C2.',
          value: (num(dr.value)! * normalSolventMassFlow) / feedMassFlow,
          m: dr.value,
          mMetadata: {
            numeratorPhase: dr.numeratorPhase ?? null,
            denominatorPhase: dr.denominatorPhase ?? null,
            concentrationBasis: dr.concentrationBasis ?? null,
            temperatureC: dr.temperatureC ?? null,
            sourceType: dr.sourceType,
            sourceReference: dr.sourceReference,
          },
          solventBasis: 'normal case',
          classification: (complete && dr.sourceType !== 'Assumed' ? 'Calculated Screening Result' : 'Pending Validation') as Classification,
          ...(complete ? {} : { missingMetadata: metaMissing }),
        };
        if (!complete) {
          warnings.push({ code: 'DISTRIBUTION_RATIO_BASIS_INCOMPLETE', message: `distributionRatio equilibrium basis incomplete — missing: ${metaMissing.join(', ')}. Extraction factor is Pending Validation.` });
        }
      }

      // PD-010 / PD-011 — Theoretical stages.
      // N_T is auto-calculated from the governed Coto 2022 LLE dataset when
      // the design point lies inside the governed envelope; otherwise the
      // calculation fails closed (stating the exact limit exceeded) and the
      // engineer-override value (if provided) is used, always labelled
      // 'Engineer Override — Assumed / Pending Validation'. N_T = 6 (or any
      // override) is NEVER presented as an auto-calculated result.
      const overrideN = num(inputs.theoreticalStages);
      // Stage efficiency: informational-only. NOT part of the governing packed-
      // column height calculation (H_active = N_T × HETS in the ECP engine).
      // Reported, when provided, solely as context for a separately governed
      // stage-efficiency model (e.g. ECR mixer-settler compartment count).
      const stageEfficiency = num(inputs.compartmentOrStageEfficiency);
      const stageEfficiencyInfo = stageEfficiency !== undefined
        ? {
            stageEfficiencyInformational: stageEfficiency,
            stageEfficiencyNote: 'Informational only — does NOT govern packed-column height (H_active = N_T × HETS, ECP engine). Applies only to a separately governed stage-efficiency model (e.g. ECR mixer-settler compartments).',
          }
        : {};
      const lleIn = inputs.lleStageInputs as Record<string, unknown> | undefined;

      // ── Extraction Temperature — governing LLE calculation input ───────────
      // extractionTemperatureC is resolved once at the top of calculate() and
      // reused here for the LLE block.  The governed temperature-dependent LLE
      // model NEVER fails closed solely on temperature:
      //   inside calibrated range  → interpolation of governed experimental tie-lines
      //   outside calibrated range → NRTL τ(T) extrapolation, always classified
      //     'Temperature Extrapolation — Preliminary / Pending Validation'
      const extractionTemperatureK = extractionTemperatureC + 273.15;
      const tModel = temperatureModelStatus(extractionTemperatureK);
      const thermodynamicValidity = resolveThermodynamicValidityAtTemperature(extractionTemperatureK);
      const temperatureModelBlock: Record<string, unknown> = {
        userSelectedTemperatureC: extractionTemperatureC,
        userSelectedTemperatureK: Number(extractionTemperatureK.toFixed(2)),
        temperatureSource: extractionTemperatureSource,
        calibratedTemperatureRangeK: tModel.calibratedRangeK,
        mode: tModel.mode,
        distanceOutsideRangeK: tModel.distanceOutsideRangeK,
        classification: tModel.classification,
        statement: tModel.statement,
        model: { id: TLLE_MODEL_ID, version: TLLE_MODEL_VERSION, name: TLLE_MODEL_NAME, citation: TLLE_MODEL_CITATION },
        calibrationDatasets: tModel.calibrationDatasets,
        thermodynamicValidity,
        validationStatus: tModel.mode === 'interpolation'
          ? 'Governed experimental tie-lines used directly (exact within data uncertainty u(x) = 0.003)'
          : `${TLLE_EXTRAPOLATION_CLASSIFICATION}. Model 298.15 K reproduction record: max |Δx| = ${TLLE_REPRODUCTION_RECORD.maxAbsDev} vs gate ${TLLE_REPRODUCTION_RECORD.gate} (${TLLE_REPRODUCTION_RECORD.tieLinesWithinGate}/${TLLE_REPRODUCTION_RECORD.tieLinesTotal} tie-lines within gate) — see V&V register.`,
      };
      let extrapolationBasis: NonNullable<Parameters<typeof computeGovernedTheoreticalStages>[0]['equilibriumBasis']> | undefined;
      let extrapolationBasisError: { limit: string; detail: string } | undefined;
      if (tModel.mode === 'interpolation') {
        // In-range: the registry supplies the experimental family that governs
        // this temperature. The Coto 2022 298.15 K family IS the engine's
        // default governed path (used as-is, exact); any OTHER admitted family
        // is passed explicitly as the equilibrium basis.
        const expFam = experimentalFamilyForTemperature(extractionTemperatureK);
        temperatureModelBlock.experimentalBasis = expFam
          ? { datasetId: expFam.dataset.datasetId, datasetVersion: expFam.dataset.datasetVersion, temperatureK: expFam.temperatureK, tieLines: expFam.tieLines.length }
          : null;
        if (expFam && expFam.dataset.datasetId !== COTO_2022_DATASET_ID) {
          extrapolationBasis = {
            tieLines: expFam.tieLines,
            datasetId: expFam.dataset.datasetId,
            datasetVersion: expFam.dataset.datasetVersion,
            citation: expFam.dataset.citation,
            basisLabel: `Governed experimental tie-lines at ${expFam.temperatureK.toFixed(2)} K (${expFam.dataset.datasetId} v${expFam.dataset.datasetVersion})`,
          };
        }
      }
      if (tModel.mode === 'extrapolation') {
        try {
          const fam = generateModelTieLinesAtTemperature(extractionTemperatureK);
          extrapolationBasis = {
            tieLines: fam.tieLines,
            datasetId: fam.datasetId,
            datasetVersion: fam.datasetVersion,
            citation: fam.citation,
            basisLabel: fam.basisLabel,
          };
          temperatureModelBlock.modelTieLineFamily = {
            temperatureK: fam.temperatureK,
            x1REnvelope: [fam.x1RMin, fam.x1RMax],
            tieLinesUsed: fam.sourceTieLinesUsed,
            droppedTieLines: fam.droppedTieLines,
          };
        } catch (e) {
          if (e instanceof TlleModelError) extrapolationBasisError = { limit: e.limit, detail: e.detail };
          else throw e;
        }
      }

      let lleResult: GovernedNtResult | null = null;
      let lleInputEcho: Record<string, unknown> | undefined;
      const lleMissing: string[] = [];
      if (!lleIn) {
        lleMissing.push('lleStageInputs (RRBO characterisation, class molecular weights, target raffinate aromatics)');
      } else {
        const classes = ['saturates', 'monoAromatics', 'diAromatics', 'polyAromatics'] as const;
        const ch = lleIn.rrboCharacterisationWtPct as Record<string, unknown> | undefined;
        // Governed engineering basis (2026-08-11): wt%→mol conversion uses Coto 2022
        // surrogate compound MWs — fixed physical constants, not user-entered values.
        // Total Aromatics is derived as mono + di + poly — not a separate required input.
        const SURROGATE_MWS = [SURROGATE_MW.c12, SURROGATE_MW.xylene, SURROGATE_MW.methylnaphtalene, SURROGATE_MW.pyrene];
        const wt: number[] = [];
        for (const c of classes) {
          const w = num((ch?.[c] as Record<string, unknown> | undefined)?.value);
          if (w === undefined) lleMissing.push(`rrboCharacterisationWtPct.${c}`);
          if (w !== undefined) wt.push(w);
        }
        const tgt = num((lleIn.targetRaffinateAromaticsMolePct as Record<string, unknown> | undefined)?.value);
        if (tgt === undefined) lleMissing.push('targetRaffinateAromaticsMolePct');
        const sPur = num((lleIn.solventNmpMoleFraction as Record<string, unknown> | undefined)?.value);
        if (lleMissing.length === 0) {
          // Derived: Total Aromatics = mono + di + poly (no user entry required)
          const totAr = wt[1] + wt[2] + wt[3];
          // wt% → mole fractions using governed Coto 2022 surrogate MWs (NMP in feed = 0)
          const molesPerClass = wt.map((w, i) => w / SURROGATE_MWS[i]);
          const totalMoles = molesPerClass.reduce((a, b) => a + b, 0);
          const feedMoleFractions = [...molesPerClass.map((m) => m / totalMoles), 0];
          const avgFeedMW = 100 / totalMoles; // basis 100 g feed, surrogate-MW basis
          const solventMolarRatio = solventToOilRatio.value * (avgFeedMW / SURROGATE_MW.nmp);
          lleInputEcho = {
            pseudoComponentMapping: COTO_COMPONENTS.map((c, i) => ({ component: c, representsRrboClass: COTO_COMPONENT_ROLES[i] })),
            surrogateConversionBasis: {
              saturates:     { surrogate: 'n-dodecane',          mw_g_mol: SURROGATE_MW.c12 },
              monoAromatics: { surrogate: '1,4-xylene',          mw_g_mol: SURROGATE_MW.xylene },
              diAromatics:   { surrogate: '1-methylnaphthalene', mw_g_mol: SURROGATE_MW.methylnaphtalene },
              polyAromatics: { surrogate: 'pyrene',              mw_g_mol: SURROGATE_MW.pyrene },
              note: 'Governed engineering basis: surrogate compound MWs used for wt%→mol conversion; RRBO class MWs are not required',
            },
            feedMoleFractions: feedMoleFractions.map((v) => Number(v.toFixed(5))),
            averageSurrogateFeedMW_g_mol: Number(avgFeedMW.toFixed(2)),
            nmpMolecularWeight_g_mol: SURROGATE_MW.nmp,
            massSolventToOilRatio: solventToOilRatio.value,
            solventMolarRatio_molNMP_per_molFeed: Number(solventMolarRatio.toFixed(4)),
            targetRaffinateAromaticsMoleFraction: tgt / 100,
            temperatureK: Number(extractionTemperatureK.toFixed(2)),
            rrboCharacterisationWtPct: ch,
            derivedTotalAromaticsWtPct: Number(totAr.toFixed(3)),
          };
          if (tModel.mode === 'extrapolation' && extrapolationBasisError) {
            // The temperature-dependent model could not produce a usable
            // two-phase family at the user temperature — treat this as a
            // signal that the NRTL model itself is degenerate at this T
            // (e.g. the system is essentially single-phase), and fail closed.
            lleResult = {
              datasetId: TLLE_MODEL_ID,
              datasetVersion: TLLE_MODEL_VERSION,
              citation: TLLE_MODEL_CITATION,
              status: 'not_calculable',
              temperatureStatus: 'model_at_design_temperature',
              limitExceeded: extrapolationBasisError,
              governingMeasure: 'total raffinate aromatics (mole fraction)',
              stageTrace: [],
              method: 'not run — NRTL model could not produce a usable two-phase envelope at the extraction temperature (fewer than 4 anchor tie-lines converged to a distinct two-phase split); direct cascade not attempted',
              exclusions: [],
              caveats: [],
            };
          } else if (tModel.mode === 'extrapolation') {
            // Extrapolation: use the direct NRTL counter-current cascade.
            // This calls nrtlFlash() per stage for any composition, eliminating
            // the x1R-envelope restriction of the Hunter-Nash locus solver.
            lleResult = computeNrtlDirectCascadeNt({
              temperatureK: extractionTemperatureK,
              feedMoleFractions,
              solventMolarRatio,
              targetRaffinateAromaticsMole: tgt / 100,
            });
          } else {
            // Interpolation (calibrated temperature): use the Hunter-Nash locus
            // solver with the governed experimental tie-lines (exact within
            // data uncertainty u(x) = 0.003). No NRTL model involved.
            lleResult = computeGovernedTheoreticalStages({
              temperatureK: extractionTemperatureK,
              feedMoleFractions,
              solventMolarRatio,
              targetRaffinateAromaticsMole: tgt / 100,
              ...(sPur !== undefined ? { solventNmpMoleFraction: sPur } : {}),
              ...(extrapolationBasis ? { equilibriumBasis: extrapolationBasis } : {}),
            });
          }
        }
      }
      if (lleResult === null) {
        // Governed inputs incomplete → fail closed on the missing inputs.
        // Temperature mismatch alone never suppresses the calculation (it
        // only downgrades a successful result to Preliminary), so it is
        // noted, not raised as the limit. Nothing is assumed.
        const tOut = Math.abs((T + 273.15) - COTO_2022_TEMPERATURE_K) > 0.5;
        lleResult = {
          datasetId: COTO_2022_DATASET_ID,
          datasetVersion: COTO_2022_DATASET_VERSION,
          citation: COTO_2022_CITATION,
          status: 'not_calculable',
          ...(tOut ? { temperatureStatus: 'outside_range_preliminary' as const } : { temperatureStatus: 'in_range' as const }),
          limitExceeded: {
            limit: 'Governed inputs not provided',
            detail: `N_T auto-calculation requires governed inputs that are missing: ${lleMissing.join(', ')}. No values are assumed.${tOut ? ` Note: design temperature ${(T + 273.15).toFixed(2)} K is outside the 298.15 K experimental range — once the missing inputs are provided, N_T will be calculated from the 298.15 K tie-lines as-is and classified Preliminary — Pending RRBO/NMP Validation (no temperature correction or extrapolation).` : ''}`,
          },
          governingMeasure: 'total raffinate aromatics (mole fraction)',
          stageTrace: [],
          method: 'not run — governed inputs incomplete',
          exclusions: [],
          caveats: [],
        };
      }

      const autoCalculated = lleResult.status === 'calculated' && lleResult.theoreticalStagesRounded !== undefined;
      let ntOverrideActive = false;
      let stages: Record<string, unknown>;
      if (autoCalculated) {
        const nT = lleResult.theoreticalStagesRounded!;
        const tPrelim = lleResult.temperatureStatus === 'outside_range_preliminary';
        const tExtrap = tModel.mode === 'extrapolation' && lleResult.temperatureStatus === 'model_at_design_temperature';
        stages = {
          mode: 'auto_calculated',
          theoreticalStages: nT,
          theoreticalStagesFractional: lleResult.theoreticalStages,
          ...stageEfficiencyInfo,
          label: tExtrap
            ? `Theoretical Stages — Auto-Calculated at ${extractionTemperatureK.toFixed(2)} K — ${TLLE_EXTRAPOLATION_CLASSIFICATION}`
            : tPrelim
              ? 'Controlled-Literature RRBO Surrogate LLE Model — Preliminary / Outside Experimental Temperature Range / Pending RRBO-NMP Validation'
              : 'Theoretical Stages — Auto-Calculated (Coto 2022 Governed LLE)',
          basis: tExtrap
            ? `${TLLE_MODEL_ID} v${TLLE_MODEL_VERSION} — Direct NRTL τ(T) counter-current cascade (successive substitution) at ${extractionTemperatureK.toFixed(2)} K; NRTL parameters calibrated at [${tModel.calibratedRangeK.minK}, ${tModel.calibratedRangeK.maxK}] K`
            : `${COTO_2022_DATASET_ID} v${COTO_2022_DATASET_VERSION} at ${COTO_2022_TEMPERATURE_K} K (tie-lines used as-is; no temperature correction or extrapolation)`,
          ...(lleResult.temperatureStatement ? { temperatureStatement: lleResult.temperatureStatement } : {}),
          ...(tExtrap ? { temperatureStatement: tModel.statement } : {}),
          note: 'Governing height calculation is H_active = N_T × HETS (evaluated in the ECP engine with the governed HETS). Stage efficiency does not enter the packed-column height.',
          ...(overrideN !== undefined ? { engineerOverrideEntered: overrideN, engineerOverrideApplied: false, engineerOverrideNote: 'An engineer-override N_T was entered but NOT applied: the governed auto-calculation succeeded and takes precedence.' } : {}),
          classification: ((tPrelim || tExtrap) ? 'Pending Validation' : 'Calculated Screening Result') as Classification,
        };
        if (tPrelim) {
          warnings.push({ code: 'NT_TEMPERATURE_PRELIMINARY', message: lleResult.temperatureStatement! });
        }
        if (tExtrap) {
          warnings.push({ code: 'NT_TEMPERATURE_EXTRAPOLATION', message: tModel.statement });
        }
        if (overrideN !== undefined && overrideN !== nT) {
          warnings.push({ code: 'NT_OVERRIDE_IGNORED', message: `Engineer-override theoretical stages (${overrideN}) ignored — governed Coto 2022 auto-calculation succeeded with N_T = ${nT}.` });
        }
      } else if (overrideN !== undefined) {
        ntOverrideActive = true;
        stages = {
          mode: 'engineer_override',
          theoreticalStages: overrideN,
          ...stageEfficiencyInfo,
          label: 'Engineer Override — Assumed / Pending Validation',
          overrideReason: lleResult.limitExceeded,
          ...(lleResult.temperatureStatus === 'outside_range_preliminary'
            ? { temperatureStatement: `Design temperature is outside the 298.15 K experimental range of the governed Coto 2022 dataset. Any future auto-calculated NT will use the 298.15 K controlled-literature equilibrium data as-is and be classified Preliminary — Pending RRBO/NMP Validation (no temperature correction or extrapolation).` }
            : {}),
          note: 'The governed Coto 2022 N_T auto-calculation is Not Calculable at this design point (exact limit recorded above). The engineer-override stage count is an Assumed value and is NEVER presented as an auto-calculated result. NOT a final ECP packing-stage or ECR compartment count.',
          classification: 'Pending Validation' as Classification,
        };
        warnings.push({
          code: 'NT_ENGINEER_OVERRIDE',
          message: `Theoretical stages N_T = ${overrideN} is an Engineer Override (Assumed — Pending Validation). Governed auto-calculation failed closed: ${lleResult.limitExceeded?.limit ?? 'Not Calculable'}.`,
        });
        assumptions.push({
          assumption: `Theoretical stage count N_T = ${overrideN} — Engineer Override (governed Coto 2022 auto-calculation Not Calculable: ${lleResult.limitExceeded?.limit ?? 'unknown limit'})`,
          sourceType: 'Assumed',
          sourceReference: 'Engineer Override — Process Design workspace theoretical-stages entry',
          scope: 'run',
        });
      } else {
        ntOverrideActive = true; // pending: no stage basis at all
        stages = {
          mode: 'not_calculable',
          theoreticalStages: null,
          ...stageEfficiencyInfo,
          label: 'Theoretical Stages — Not Calculable',
          overrideReason: lleResult.limitExceeded,
          ...(lleResult.temperatureStatus === 'outside_range_preliminary'
            ? { temperatureStatement: `Design temperature is outside the 298.15 K experimental range of the governed Coto 2022 dataset. Any future auto-calculated NT will use the 298.15 K controlled-literature equilibrium data as-is and be classified Preliminary — Pending RRBO/NMP Validation (no temperature correction or extrapolation).` }
            : {}),
          note: 'Governed auto-calculation failed closed and no Engineer Override N_T was entered. Enter an override (recorded as Assumed — Pending Validation) or bring the design point inside the governed envelope.',
          classification: 'Not Calculable' as Classification,
        };
        warnings.push({ code: 'NT_NOT_CALCULABLE', message: `Theoretical stages Not Calculable: ${lleResult.limitExceeded?.limit ?? 'governed calculation failed closed'} — and no Engineer Override N_T was entered.` });
      }

      const lleStageCalculation: Record<string, unknown> = {
        ...lleResult,
        ...(lleInputEcho ? { inputTrace: lleInputEcho } : {}),
        temperatureModel: temperatureModelBlock,
        ...(lleResult.raffinateAromaticsLLE
          ? {
              raffinateAromaticsLLE: lleResult.raffinateAromaticsLLE,
              raffinateProductQuality: deriveC2RaffinateProductQuality(lleResult, lleInputEcho, feedMassFlow),
            }
          : {}),
      };

      // Status derivation (correction 11)
      const anyPending = normalCase.pending || maximumCase.pending
        || (extractionFactor?.classification === 'Pending Validation')
        || propertyAssumed || anyAssumedInput
        || ntOverrideActive
        || lleResult.temperatureStatus === 'outside_range_preliminary'
        || phaseClassification === 'Not Calculable';
      const calculationRunStatus = anyPending ? 'pending_validation' : 'screening_complete';
      if (propertyAssumed) {
        warnings.push({ code: 'ASSUMED_PROPERTY_DATA', message: 'One or more fluid properties rest on Assumed data — the run cannot be classified screening_complete until replaced or validated.' });
      }

      const data: Record<string, unknown> = {
        celVersion: CEL_VERSION,
        epdVersion: EPD_VERSION,
        engineVersion: this.getEngineVersion(),
        calculationRunStatus,
        designBasis: {
          operatingTemperatureC: T,
          extractionTemperatureC,
          extractionTemperatureSource,
          feedFluid: {
            id: rrboFluidId,
            name: rhoFeed.fluidId,
            grade: rrboFluidId.replace('rrbo-', '').toUpperCase(),
            // Density trace: Grade → T → ρRRBO → ρNMP → Δρ (extraction-temperature basis)
            densityTrace: {
              grade: rrboFluidId.replace('rrbo-', '').toUpperCase(),
              operatingTemperatureC: T,
              extractionTemperatureC,
              rhoRRBO_atOperatingT_kg_m3: rhoFeed.value,
              rhoNMP_atOperatingT_kg_m3: rhoSolvent.value,
              rhoRRBO_atExtractionT_kg_m3: rhoFeed_atExtT.value,
              rhoNMP_atExtractionT_kg_m3: rhoSolvent_atExtT.value,
              deltaDensity_atExtractionT_kg_m3: Math.abs(rhoSolvent_atExtT.value - rhoFeed_atExtT.value),
              basis: 'EPD governed tabular dataset — linear interpolation between 6 points (25–70 °C)',
              source: rhoFeed_atExtT.source,
            },
            // Density at operatingT — from EPD library; used for flow-basis conversions (PD-001, PD-004)
            densityAtOperatingT: { value: rhoFeed.value, unit: rhoFeed.unit, source: rhoFeed.source },
            // Density at extractionT — from EPD library; used for phase-separation screening (PD-005)
            densityAtExtractionT: { value: rhoFeed_atExtT.value, unit: rhoFeed_atExtT.unit, source: rhoFeed_atExtT.source },
          },
          solventFluid: {
            id: 'nmp', name: 'NMP',
            // Density at operatingT — used for flow-basis conversions
            densityAtOperatingT: { value: rhoSolvent.value, unit: rhoSolvent.unit, source: rhoSolvent.source },
            // Density at extractionT — used for phase-separation screening
            densityAtExtractionT: { value: rhoSolvent_atExtT.value, unit: rhoSolvent_atExtT.unit, source: rhoSolvent_atExtT.source },
          },
        },
        flows: {
          unitMass: 'kg/h', unitVolumetric: 'm3/h',
          feedMassFlow, feedVolumetricFlow,
          normalSolventMassFlow, normalSolventVolumetricFlow,
          maximumSolventMassFlow, maximumSolventVolumetricFlow,
          maxCirculationFactor,
        },
        solventToOilRatio,
        ...(solventFlowConsistency ? { solventFlowConsistency } : {}),
        phaseConfiguration: {
          input: phaseConfig,
          continuousPhase, dispersedPhase,
          // Δρ basis — ALWAYS extraction temperature; NEVER operatingTemperature
          densityDifferenceTemperatureBasis: {
            temperatureC: extractionTemperatureC,
            temperatureSource: extractionTemperatureSource,
            rhoNMP_kg_m3: { value: rhoSolvent_atExtT.value, unit: rhoSolvent_atExtT.unit, source: rhoSolvent_atExtT.source },
            rhoRRBO_kg_m3: { value: rhoFeed_atExtT.value, unit: rhoFeed_atExtT.unit, source: rhoFeed_atExtT.source, grade: rrboFluidId.replace('rrbo-', '').toUpperCase() },
          },
          lighterPhase, heavierPhase: lighterPhase === null ? null : lighterPhase === 'RRBO' ? 'NMP' : 'RRBO',
          densityDifference_kg_m3: densityDifference_atExtT,
          note: 'Phase continuity is taken from the engineer input only; density determines buoyancy direction, not continuity. No screening threshold is applied — Δρ is reported and interpreted by the engineer.',
          classification: phaseClassification,
        },
        normalCase: normalCase.result,
        maximumCase: maximumCase.result,
        ...(extractionFactor ? { extractionFactor } : {}),
        stages,
        lleStageCalculation,
        assumptions,
      };

      return {
        ...base,
        status: warnings.length > 0 ? 'warning' : 'success',
        data,
        warnings,
        validationIssues: errs,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ...base,
        status: 'error',
        data: { calculationRunStatus: 'calculation_blocked', error: message },
        warnings,
        validationIssues: [...errs, { field: e instanceof EngineeringInputError ? 'inputs' : 'calculation', message, severity: 'error' }],
      };
    }
  }

  generateSummary(results: Record<string, unknown>): DesignSummary {
    const flows = results.flows as Record<string, number> | undefined;
    const ratio = results.solventToOilRatio as { value: number } | undefined;
    const stages = results.stages as Record<string, unknown> | undefined;
    const normal = (results.normalCase as Record<string, unknown> | undefined)?.componentBalance as Record<string, unknown> | undefined;
    const status = results.calculationRunStatus as string | undefined;
    const keyResults = [
      flows ? { label: 'Feed mass flow', value: flows.feedMassFlow, unit: 'kg/h', highlight: true } : null,
      flows ? { label: 'Normal solvent mass flow', value: flows.normalSolventMassFlow, unit: 'kg/h', highlight: true } : null,
      flows ? { label: 'Maximum solvent mass flow', value: flows.maximumSolventMassFlow, unit: 'kg/h' } : null,
      ratio ? { label: 'Solvent-to-oil ratio (NMP / total RRBO feed, mass)', value: ratio.value } : null,
      status ? { label: 'Run status', value: status, highlight: true } : null,
    ].filter(Boolean) as DesignSummary['keyResults'];
    const warningsOut: string[] = [];
    if (status === 'pending_validation') {
      warningsOut.push('Result depends on assumed or missing data — Pending Validation. It is not a validated design result.');
    }
    if (normal?.classification === 'Pending Validation') {
      warningsOut.push('Outlet phase split incomplete — component balance is Pending Validation.');
    }
    return {
      keyResults,
      recommendations: [
        'Replace Assumed property/split data with measured or vendor values before design release.',
        'ECP/ECR stage counts and active heights are calculated by their own engines — the stage-equivalent estimate here is preliminary only.',
      ],
      warnings: warningsOut,
      calculationClass: 'Preliminary Screening',
    };
  }
}
