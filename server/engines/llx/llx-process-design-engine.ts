// ═══════════════════════════════════════════════════════════════════════════════
// LLX — Process Design Engine (Stage C2) — v1.0.0
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
  getProperty, createPropertyContext,
  containsAssumedData, EngineeringInputError,
  SOURCE_TYPES,
} from '../../engine-framework/common-engineering-library';
import type { SourceType } from '../../engine-framework/epd/types';
import {
  computeGovernedTheoreticalStages, GovernedNtResult, InjectedEquilibrium,
  COTO_2022_CITATION, COTO_2022_DATASET_ID, COTO_2022_DATASET_VERSION,
  COTO_2022_TEMPERATURE_K, SURROGATE_MW, COTO_COMPONENTS, COTO_COMPONENT_ROLES,
} from '../../engine-framework/cel/coto2022-nmp-lle';
import { generateNrtlTieLineTable, NrtlModelError, NRTL_MODEL_ID } from '../../engine-framework/cel/nrtl-nmp-lle';

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
  getEngineVersion(): string { return '1.1.0'; }
  getModuleType(): string { return 'llx'; }
  getCalculationType(): string { return 'process_design'; }

  validate(inputs: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    const err = (field: string, message: string) => errors.push({ field, message, severity: 'error' });
    const warn = (field: string, message: string) => errors.push({ field, message, severity: 'warning' });

    const T = num(inputs.operatingTemperature);
    if (T === undefined) err('operatingTemperature', 'operatingTemperature (°C) is required and must be a finite number');
    else if (T < -273.15) err('operatingTemperature', 'operatingTemperature is below absolute zero');

    // Feed flow
    const feedFlow = inputs.feedFlow as Record<string, unknown> | undefined;
    const feedValue = num(feedFlow?.value);
    if (!feedFlow || feedValue === undefined || feedValue <= 0) {
      err('feedFlow', 'feedFlow { value > 0, basis } is required');
    } else if (feedFlow.basis !== 'mass' && feedFlow.basis !== 'volumetric') {
      err('feedFlow.basis', "feedFlow.basis must be 'mass' (kg/h) or 'volumetric' (m³/h)");
    }

    // RRBO density — required as a source-tagged project-fluid entry
    const fd = inputs.feedDensity as Record<string, unknown> | undefined;
    if (!fd) {
      err('feedDensity', 'feedDensity is required: source-tagged RRBO density { value (kg/m3), referenceTemperatureC, sourceType, sourceReference }. No default RRBO correlations exist.');
    } else {
      const dv = num(fd.value);
      if (dv === undefined || dv <= 0) err('feedDensity.value', 'feedDensity.value must be > 0 (kg/m3)');
      if (num(fd.referenceTemperatureC) === undefined) err('feedDensity.referenceTemperatureC', 'feedDensity.referenceTemperatureC (°C) is required');
      if (!SOURCE_TYPES.includes(fd.sourceType as SourceType)) err('feedDensity.sourceType', `feedDensity.sourceType must be one of ${SOURCE_TYPES.join(', ')}`);
      if (typeof fd.sourceReference !== 'string' || !fd.sourceReference.trim()) err('feedDensity.sourceReference', 'feedDensity.sourceReference is mandatory');
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
      if (mw) for (const c of classes) parseTagged(mw[c], `lleStageInputs.classMolecularWeights.${c}`, errors, { min: 1, max: 5000 });
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
    const feedFluidId = 'rrbo';

    try {
      const T = num(inputs.operatingTemperature)!;
      const fd = inputs.feedDensity as Record<string, unknown>;

      // Calculation-scoped property context: the run's RRBO density lives ONLY
      // in this context (validated by the same EPD rules), so concurrent runs
      // with different project-fluid data can never observe each other's
      // values. The shared registries are never mutated. Library fluids (NMP,
      // water) remain read-only shared data.
      const feedDensityEntry = {
        value: num(fd.value)!,
        unit: 'kg/m3',
        referenceTemperatureC: num(fd.referenceTemperatureC)!,
        sourceType: fd.sourceType as SourceType,
        sourceReference: fd.sourceReference as string,
        ...(fd.validRangeC ? { validRangeC: fd.validRangeC as { min: number; max: number } } : {}),
        ...(fd.temperatureCoefficient ? { temperatureCoefficient: fd.temperatureCoefficient as { slopePerC: number; sourceType: SourceType; sourceReference: string } } : {}),
      };
      const propertyContext = createPropertyContext([{
        id: feedFluidId,
        name: 'RRBO (Re-Refined Base Oil) — run feed',
        isProjectFluid: true,
        properties: { density: feedDensityEntry },
      }]);

      const rhoFeed = getProperty(feedFluidId, 'density', T, propertyContext);
      const rhoSolvent = getProperty('nmp', 'density', T);
      for (const w of [...rhoFeed.warnings, ...rhoSolvent.warnings]) {
        warnings.push({ code: w.code, message: w.message });
      }
      let propertyAssumed = containsAssumedData(rhoFeed.warnings) || containsAssumedData(rhoSolvent.warnings);

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
      const phaseConfig = inputs.phaseConfiguration as PhaseConfig;
      const continuousPhase = phaseConfig === 'rrbo_continuous_nmp_dispersed' ? 'RRBO' : 'NMP';
      const dispersedPhase = phaseConfig === 'rrbo_continuous_nmp_dispersed' ? 'NMP' : 'RRBO';
      const densityDifference = Math.abs(rhoSolvent.value - rhoFeed.value);
      const lighterPhase = rhoFeed.value < rhoSolvent.value ? 'RRBO' : rhoFeed.value > rhoSolvent.value ? 'NMP' : null;
      let phaseClassification: Classification = 'Calculated Screening Result';
      if (lighterPhase === null) {
        phaseClassification = 'Not Calculable';
        warnings.push({ code: 'ZERO_DENSITY_DIFFERENCE', message: `RRBO and NMP densities are equal at ${T} °C (Δρ = 0) — buoyancy direction is Not Calculable and gravity settling is infeasible.` });
      } else if (densityDifference < 30) {
        warnings.push({ code: 'LOW_DENSITY_DIFFERENCE', message: `Density difference ${densityDifference.toFixed(1)} kg/m³ < 30 kg/m³ — phase separation will be difficult; verify at design temperature.` });
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

      let lleResult: GovernedNtResult | null = null;
      let lleInputEcho: Record<string, unknown> | undefined;
      let nrtlBasisTrace: Record<string, unknown> | undefined;
      let nrtlGap: { limit: string; detail: string } | undefined;
      const lleMissing: string[] = [];
      if (!lleIn) {
        lleMissing.push('lleStageInputs (RRBO characterisation, class molecular weights, target raffinate aromatics)');
      } else {
        const classes = ['saturates', 'monoAromatics', 'diAromatics', 'polyAromatics'] as const;
        const ch = lleIn.rrboCharacterisationWtPct as Record<string, unknown> | undefined;
        const mw = lleIn.classMolecularWeights as Record<string, unknown> | undefined;
        const wt: number[] = []; const mws: number[] = [];
        for (const c of classes) {
          const w = num((ch?.[c] as Record<string, unknown> | undefined)?.value);
          const m = num((mw?.[c] as Record<string, unknown> | undefined)?.value);
          if (w === undefined) lleMissing.push(`rrboCharacterisationWtPct.${c}`);
          if (m === undefined) lleMissing.push(`classMolecularWeights.${c}`);
          if (w !== undefined) wt.push(w);
          if (m !== undefined) mws.push(m);
        }
        const tgt = num((lleIn.targetRaffinateAromaticsMolePct as Record<string, unknown> | undefined)?.value);
        if (tgt === undefined) lleMissing.push('targetRaffinateAromaticsMolePct');
        const sPur = num((lleIn.solventNmpMoleFraction as Record<string, unknown> | undefined)?.value);
        // Total Aromatics (editable engineer field, wt %) — REQUIRED whenever
        // the LLE calculation is attempted, and consistency-checked against
        // the class split: mono + di + poly must match the entered total
        // within ±0.5 wt %, else the characterisation is internally
        // inconsistent and the calculation fails closed. Not bypassable by
        // API callers omitting the field.
        const totAr = num((lleIn.totalAromaticsWtPct as Record<string, unknown> | undefined)?.value);
        if (totAr === undefined) lleMissing.push('totalAromaticsWtPct (Total Aromatics, wt % — editable engineer field; consistency gate for the class split)');
        if (totAr !== undefined && lleMissing.length === 0) {
          const classAromatics = wt[1] + wt[2] + wt[3];
          if (Math.abs(classAromatics - totAr) > 0.5) {
            lleMissing.push(`consistent aromatics characterisation (Total Aromatics entered = ${totAr} wt % but mono+di+poly = ${classAromatics.toFixed(2)} wt % — must agree within ±0.5 wt %)`);
          }
        }
        if (lleMissing.length === 0) {
          // wt% → mole fractions per governed class MWs (NMP in feed = 0)
          const molesPerClass = wt.map((w, i) => w / mws[i]);
          const totalMoles = molesPerClass.reduce((a, b) => a + b, 0);
          const feedMoleFractions = [...molesPerClass.map((m) => m / totalMoles), 0];
          const avgFeedMW = 100 / totalMoles; // basis 100 g feed
          const solventMolarRatio = solventToOilRatio.value * (avgFeedMW / SURROGATE_MW.nmp);
          lleInputEcho = {
            pseudoComponentMapping: COTO_COMPONENTS.map((c, i) => ({ component: c, representsRrboClass: COTO_COMPONENT_ROLES[i] })),
            feedMoleFractions: feedMoleFractions.map((v) => Number(v.toFixed(5))),
            averageFeedMolecularWeight_g_mol: Number(avgFeedMW.toFixed(2)),
            nmpMolecularWeight_g_mol: SURROGATE_MW.nmp,
            massSolventToOilRatio: solventToOilRatio.value,
            solventMolarRatio_molNMP_per_molFeed: Number(solventMolarRatio.toFixed(4)),
            targetRaffinateAromaticsMoleFraction: tgt / 100,
            temperatureK: T + 273.15,
            rrboCharacterisationWtPct: ch,
            ...(totAr !== undefined ? { totalAromaticsWtPct: totAr } : {}),
            classMolecularWeights: mw,
          };
          // ── Temperature-dependent model path (approved architecture):
          // when the design temperature is off the 298.15 K anchor, the
          // ADMITTED NRTL τ(T) model (validated against the governed gate)
          // generates the tie-line table AT the design temperature and the
          // identical variable-flow cascade runs on it. If the model is not
          // admitted or T is outside the calibrated envelope, this path
          // fails closed (DEVELOPMENT GAP recorded) and the existing
          // Coto-as-is Preliminary behaviour applies. Tie-lines are NEVER
          // temperature-scaled.
          const tK = T + 273.15;
          let nrtlBasis: InjectedEquilibrium | undefined;
          if (Math.abs(tK - COTO_2022_TEMPERATURE_K) > 0.5) {
            try {
              const { tieLines, artifact } = generateNrtlTieLineTable(tK);
              nrtlBasis = {
                tieLines,
                datasetId: NRTL_MODEL_ID,
                datasetVersion: artifact.version,
                citation: artifact.citationList.join(' | '),
                envelopeName: `NRTL τ(T) governed model at ${tK.toFixed(2)} K`,
                extraCaveats: [
                  `Equilibrium basis: NRTL τij = aij + bij/T model v${artifact.version} (artifact nrtl-params-v1.json), regressed on the governed calibration datasets and ADMITTED by the validation gate (Coto 298.15 K flash RMSD ${artifact.validation.cotoRmsd} ≤ ${artifact.validation.cotoTolerance}; leave-one-temperature-out passed). Tie-line table generated by isothermal flash at ${tK.toFixed(2)} K — never by scaling experimental tie-lines.`,
                  ...artifact.boundedAssumptions,
                ],
              };
              nrtlBasisTrace = {
                modelId: NRTL_MODEL_ID,
                modelVersion: artifact.version,
                parameterArtifact: 'server/engine-framework/cel/data/nrtl-params-v1.json',
                generatedAtUtc: artifact.generatedAtUtc,
                temperatureK: tK,
                temperatureEnvelopeK: artifact.temperatureEnvelopeK,
                tieLineCount: nrtlBasis.tieLines.length,
                validation: artifact.validation,
              };
            } catch (e) {
              if (e instanceof NrtlModelError) {
                nrtlGap = { limit: e.limit, detail: e.detail };
                warnings.push({ code: 'NT_TEMPERATURE_MODEL_GAP', message: `${e.limit}: ${e.detail} Falling back to the 298.15 K tie-lines used as-is (result Preliminary — Pending RRBO/NMP Validation).` });
              } else throw e;
            }
          }
          lleResult = computeGovernedTheoreticalStages({
            temperatureK: tK,
            feedMoleFractions,
            solventMolarRatio,
            targetRaffinateAromaticsMole: tgt / 100,
            ...(sPur !== undefined ? { solventNmpMoleFraction: sPur } : {}),
          }, nrtlBasis);
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
        const viaNrtl = nrtlBasisTrace !== undefined;
        stages = {
          mode: 'auto_calculated',
          theoreticalStages: nT,
          theoreticalStagesFractional: lleResult.theoreticalStages,
          ...stageEfficiencyInfo,
          label: viaNrtl
            ? `Theoretical Stages — Auto-Calculated (NRTL τ(T) Governed Model at ${(nrtlBasisTrace!.temperatureK as number).toFixed(2)} K)`
            : tPrelim
              ? 'Controlled-Literature RRBO Surrogate LLE Model — Preliminary / Outside Experimental Temperature Range / Pending RRBO-NMP Validation'
              : 'Theoretical Stages — Auto-Calculated (Coto 2022 Governed LLE)',
          basis: viaNrtl
            ? `${NRTL_MODEL_ID} v${nrtlBasisTrace!.modelVersion} tie-line table generated by isothermal NRTL flash at ${(nrtlBasisTrace!.temperatureK as number).toFixed(2)} K (calibrated envelope [${(nrtlBasisTrace!.temperatureEnvelopeK as { min: number; max: number }).min.toFixed(2)}, ${(nrtlBasisTrace!.temperatureEnvelopeK as { min: number; max: number }).max.toFixed(2)}] K; interpolation only — never tie-line scaling)`
            : `${COTO_2022_DATASET_ID} v${COTO_2022_DATASET_VERSION} at ${COTO_2022_TEMPERATURE_K} K (tie-lines used as-is; no temperature correction or extrapolation)`,
          ...(viaNrtl ? { modelTrace: nrtlBasisTrace } : {}),
          ...(lleResult.temperatureStatement ? { temperatureStatement: lleResult.temperatureStatement } : {}),
          note: 'Governing height calculation is H_active = N_T × HETS (evaluated in the ECP engine with the governed HETS). Stage efficiency does not enter the packed-column height.',
          ...(overrideN !== undefined ? { engineerOverrideEntered: overrideN, engineerOverrideApplied: false, engineerOverrideNote: 'An engineer-override N_T was entered but NOT applied: the governed auto-calculation succeeded and takes precedence.' } : {}),
          // NRTL off-anchor results carry the polyaromatic bounded assumption
          // (bij ≡ 0 for DI/POLY pairs) → Pending Validation, never presented
          // as a fully validated equilibrium result.
          classification: (viaNrtl || tPrelim ? 'Pending Validation' : 'Calculated Screening Result') as Classification,
        };
        if (viaNrtl) {
          warnings.push({ code: 'NT_NRTL_POLYAROMATIC_ASSUMPTION', message: `N_T auto-calculated from the admitted NRTL τ(T) model at ${(nrtlBasisTrace!.temperatureK as number).toFixed(2)} K. DI/POLY temperature slopes are a bounded assumption (bij ≡ 0 — no multi-temperature polyaromatic data); result is Pending Validation.` });
          assumptions.push({
            assumption: 'NRTL τ(T) DI/POLY binary temperature slopes bij ≡ 0 (τ held at 298.15 K-regressed values) — bounded assumption, no multi-temperature polyaromatic LLE data exist',
            sourceType: 'Assumed',
            sourceReference: 'nrtl-params-v1.json boundedAssumptions (governed regression artifact)',
            scope: 'run',
          });
        }
        if (tPrelim) {
          warnings.push({ code: 'NT_TEMPERATURE_PRELIMINARY', message: lleResult.temperatureStatement! });
        }
        if (overrideN !== undefined && overrideN !== nT) {
          warnings.push({ code: 'NT_OVERRIDE_IGNORED', message: `Engineer-override theoretical stages (${overrideN}) ignored — governed ${viaNrtl ? 'NRTL τ(T)' : 'Coto 2022'} auto-calculation succeeded with N_T = ${nT}.` });
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
        ...(nrtlBasisTrace ? { temperatureModelTrace: nrtlBasisTrace } : {}),
        ...(nrtlGap ? { temperatureModelGap: nrtlGap } : {}),
      };

      // Status derivation (correction 11)
      const anyPending = normalCase.pending || maximumCase.pending
        || (extractionFactor?.classification === 'Pending Validation')
        || propertyAssumed || anyAssumedInput
        || ntOverrideActive
        || nrtlBasisTrace !== undefined // NRTL-based N_T carries the polyaromatic bounded assumption → Pending Validation
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
          feedFluid: {
            id: 'rrbo',
            name: 'RRBO (Re-Refined Base Oil)',
            density: { value: rhoFeed.value, unit: rhoFeed.unit, source: rhoFeed.source },
            // Complete entered project-fluid record — persisted so historical
            // runs stay reproducible even if project-fluid values later change.
            enteredDensity: feedDensityEntry,
          },
          solventFluid: { id: 'nmp', name: 'NMP', density: { value: rhoSolvent.value, unit: rhoSolvent.unit, source: rhoSolvent.source } },
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
          lighterPhase, heavierPhase: lighterPhase === null ? null : lighterPhase === 'RRBO' ? 'NMP' : 'RRBO',
          densityDifference_kg_m3: densityDifference,
          note: 'Phase continuity is taken from the engineer input only; density determines buoyancy direction, not continuity.',
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
