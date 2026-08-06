// ═══════════════════════════════════════════════════════════════════════════════
// LLX — Sulzer SMV/SMVP Preliminary Packing Screening (Stage 7)
//
// Literature-based PRELIMINARY screening only — NOT vendor-certified rating data.
// Source: J. Rauber, "Design Practice for Packed Liquid Liquid Extraction
// Columns", Sulzer Chemtech, AIChE 2006 (controlled copy: attached P73337).
//
// Governance:
//  • This module does NOT touch or duplicate any C2–C6 engine equation. The only
//    arithmetic here is specific throughput B = Q / (π·D²/4) [m³/(m²·h)] and
//    comparisons against published TYPICAL screening characteristics.
//  • Published throughput ranges are typical design characteristics for
//    preliminary screening — NOT absolute operating limits. Loading outside the
//    typical range is classified (Below/Within/Above Typical Published Loading)
//    with an engineering confidence assessment; it is NEVER a rejection.
//  • No HETS, pressure-drop curve, flooding curve, void fraction, packing
//    geometry or distributor design is invented — those remain pending approved
//    vendor or pilot-test data.
//  • Output wording is restricted to preliminary-preference language; nothing
//    here finalizes a packing selection.
// ═══════════════════════════════════════════════════════════════════════════════

export interface SulzerScreeningRecord {
  family: 'SMV' | 'SMVP';
  packingCategory: string;
  typicalSpecificThroughput: { min: number; max: number; unit: string };
  preliminaryStageRange: { maxNTS: number };
  typicalNumberOfBeds: string;
  specificSurfaceAreaRange: { min: number; max: number; unit: string };
  material: string;
  mainPurpose: string;
  phaseRatioRule: string;
  capacityClassification: string;
  sourceType: 'Literature';
  sourceReference: string;
}

/** Controlled literature-based screening records (Rauber, AIChE 2006). */
export const SULZER_SCREENING_RECORDS: SulzerScreeningRecord[] = [
  {
    family: 'SMV',
    packingCategory: 'Structured Liquid-Liquid Extraction Packing',
    typicalSpecificThroughput: { min: 50, max: 90, unit: 'm³/(m²·h)' },
    preliminaryStageRange: { maxNTS: 6 },
    typicalNumberOfBeds: '1',
    specificSurfaceAreaRange: { min: 200, max: 500, unit: 'm²/m³' },
    material: 'Metal or Plastic',
    mainPurpose: 'Maximum hydraulic capacity and smaller column diameter',
    phaseRatioRule: 'Volumetric phase ratio ≤ 3',
    capacityClassification: 'Capacity Preferred',
    sourceType: 'Literature',
    sourceReference: 'Rauber, Design Practice for Packed Liquid-Liquid Extraction Columns, AIChE 2006',
  },
  {
    family: 'SMVP',
    packingCategory: 'Structured Liquid-Liquid Extraction Packing with dual-flow plates',
    typicalSpecificThroughput: { min: 35, max: 60, unit: 'm³/(m²·h)' },
    preliminaryStageRange: { maxNTS: 10 },
    typicalNumberOfBeds: 'up to 3',
    specificSurfaceAreaRange: { min: 200, max: 500, unit: 'm²/m³' },
    material: 'Metal or Plastic',
    mainPurpose: 'Improved coalescence, re-dispersion and reduced axial back-mixing',
    phaseRatioRule: 'Volumetric phase ratio > 3',
    capacityClassification: 'Efficiency / Back-Mixing Preferred',
    sourceType: 'Literature',
    sourceReference: 'Rauber, Design Practice for Packed Liquid-Liquid Extraction Columns, AIChE 2006',
  },
];

export type BackMixingRisk = 'low' | 'moderate' | 'high';

export type LoadingClassification =
  | 'Below Typical Published Loading'
  | 'Within Typical Published Loading'
  | 'Above Typical Published Loading';

export type ScreeningConfidence = 'High Confidence' | 'Medium Confidence' | 'Low Confidence';

export interface SulzerScreeningInput {
  normalTotalFlow_m3_h: number;
  maximumTotalFlow_m3_h: number;
  trialDiameters_m: number[];           // Stage 5 trial diameters (screening band + selected)
  selectedTrialDiameter_m: number | null;
  theoreticalStages: number;
  phaseRatioVolumetric: number;         // solvent/feed (S/O, vol)
  backMixingRisk: BackMixingRisk;
  // Context-only fields (displayed, not used in threshold rules):
  densityDifference_kg_m3: number | null;
  continuousViscosity_mPas: number | null;
  dispersedViscosity_mPas: number | null;
  interfacialTension_mN_m: number | null;
}

export interface DiameterLoading {
  diameter_m: number;
  crossSectionalArea_m2: number;
  normalSpecificThroughput_m3_m2h: number;
  maximumSpecificThroughput_m3_m2h: number;
  isSelectedTrial: boolean;
}

export interface CriterionAssessment {
  label: string;
  status: 'Good Agreement' | 'Feasible — Review Recommended' | 'Significant Extrapolation';
  note: string;
}

export interface FamilyScreeningResult {
  record: SulzerScreeningRecord;
  perDiameter: Array<DiameterLoading & {
    normalLoadingClassification: LoadingClassification;
    maximumLoadingClassification: LoadingClassification;
  }>;
  /** Assessed at the selected trial diameter (or first sweep diameter if none selected). */
  hydraulicLoading: CriterionAssessment & { classification: LoadingClassification };
  stageCompatibility: CriterionAssessment;
  phaseRatioCompatibility: CriterionAssessment;
  backMixingSuitability: CriterionAssessment;
  confidence: ScreeningConfidence;
  confidenceComment: string;
  recommendationBasis: string;
}

export interface SulzerScreeningOutput {
  input: SulzerScreeningInput;
  loadings: DiameterLoading[];
  smv: FamilyScreeningResult;
  smvp: FamilyScreeningResult;
  overallVerdict: 'Preliminary SMV Preference' | 'Preliminary SMVP Preference' | 'Both Technically Viable' | 'Vendor/Pilot Validation Required';
  verdictNote: string;
  governanceNote: string;
}

/**
 * Significant-extrapolation factor: loading below 50 % of the typical minimum
 * or above 150 % of the typical maximum is treated as significant extrapolation
 * beyond published experience (Low Confidence). Between that and the typical
 * band it remains technically feasible (Medium Confidence).
 */
const EXTRAPOLATION_FACTOR = 0.5;

function classifyLoading(b: number, rec: SulzerScreeningRecord): LoadingClassification {
  const { min, max } = rec.typicalSpecificThroughput;
  if (b < min) return 'Below Typical Published Loading';
  if (b > max) return 'Above Typical Published Loading';
  return 'Within Typical Published Loading';
}

function screenFamily(rec: SulzerScreeningRecord, inp: SulzerScreeningInput, loadings: DiameterLoading[]): FamilyScreeningResult {
  const { min, max } = rec.typicalSpecificThroughput;

  const perDiameter = loadings.map(l => ({
    ...l,
    normalLoadingClassification: classifyLoading(l.normalSpecificThroughput_m3_m2h, rec),
    maximumLoadingClassification: classifyLoading(l.maximumSpecificThroughput_m3_m2h, rec),
  }));

  // Assess at the design point: selected trial diameter, else the first sweep row.
  const sel = perDiameter.find(d => d.isSelectedTrial) ?? perDiameter[0];
  const bNormal = sel.normalSpecificThroughput_m3_m2h;
  const bMax = sel.maximumSpecificThroughput_m3_m2h;
  // Anywhere in the normal↔maximum operating window inside the typical band counts as within.
  const anyCaseWithin = classifyLoading(bNormal, rec) === 'Within Typical Published Loading'
    || classifyLoading(bMax, rec) === 'Within Typical Published Loading'
    || (bNormal <= max && bMax >= min);
  const classification: LoadingClassification = anyCaseWithin
    ? 'Within Typical Published Loading'
    : classifyLoading(bMax, rec); // below/above judged on the higher (maximum-case) loading

  const significantExtrapolation = bMax < min * EXTRAPOLATION_FACTOR || bNormal > max * (1 + EXTRAPOLATION_FACTOR);

  const hydraulicLoading: FamilyScreeningResult['hydraulicLoading'] = {
    label: 'Hydraulic Loading Compatibility',
    classification,
    status: classification === 'Within Typical Published Loading'
      ? 'Good Agreement'
      : significantExtrapolation ? 'Significant Extrapolation' : 'Feasible — Review Recommended',
    note: classification === 'Within Typical Published Loading'
      ? `B ${bNormal.toFixed(1)}–${bMax.toFixed(1)} m³/(m²·h) within the typical published screening range ${min}–${max}. Good preliminary match with published screening characteristics.`
      : classification === 'Below Typical Published Loading'
        ? `B ${bNormal.toFixed(1)}–${bMax.toFixed(1)} m³/(m²·h) below the typical published screening range ${min}–${max}. Hydraulically feasible — the published range is a typical design characteristic, not an operating limit. Lower loading may influence liquid distribution, wetting efficiency and distributor performance. ${significantExtrapolation ? 'Significant extrapolation beyond published experience — vendor or pilot validation strongly recommended.' : 'Vendor or pilot confirmation recommended.'}`
        : `B ${bNormal.toFixed(1)}–${bMax.toFixed(1)} m³/(m²·h) above the typical published screening range ${min}–${max}. Higher loading raises flooding-approach and entrainment risk relative to published experience. ${significantExtrapolation ? 'Significant extrapolation beyond published experience — vendor or pilot validation strongly recommended.' : 'Additional hydraulic review and vendor or pilot confirmation recommended.'}`,
  };

  const stageOk = inp.theoreticalStages <= rec.preliminaryStageRange.maxNTS;
  const stageCompatibility: CriterionAssessment = {
    label: 'Theoretical Stage Compatibility',
    status: stageOk ? 'Good Agreement' : 'Significant Extrapolation',
    note: stageOk
      ? `NTS ${inp.theoreticalStages} within the published ${rec.family} preliminary screening experience (≤ ${rec.preliminaryStageRange.maxNTS}).`
      : `NTS ${inp.theoreticalStages} exceeds the published ${rec.family} preliminary screening experience (≤ ${rec.preliminaryStageRange.maxNTS}) — significant extrapolation; vendor or pilot validation strongly recommended.`,
  };

  const ratioOk = rec.family === 'SMV' ? inp.phaseRatioVolumetric <= 3 : true;
  const phaseRatioCompatibility: CriterionAssessment = rec.family === 'SMV'
    ? {
        label: 'Solvent/Oil Phase Ratio Compatibility',
        status: ratioOk ? 'Good Agreement' : 'Feasible — Review Recommended',
        note: ratioOk
          ? `S/O (vol) ${inp.phaseRatioVolumetric} within the published SMV screening rule (≤ 3).`
          : `S/O (vol) ${inp.phaseRatioVolumetric} above the published SMV screening rule (≤ 3) — high hold-up of one phase increases back-mixing sensitivity; SMVP dual-flow plates are typically preferred, but SMV is not excluded. Vendor confirmation recommended.`,
      }
    : {
        label: 'Solvent/Oil Phase Ratio Compatibility',
        status: 'Good Agreement',
        note: `S/O (vol) ${inp.phaseRatioVolumetric}; SMVP is preferred when > 3 (dual-flow plates counter back-mixing at high hold-up) and remains applicable at lower ratios.`,
      };

  const backMixOk = rec.family === 'SMV' ? inp.backMixingRisk !== 'high' : true;
  const backMixingSuitability: CriterionAssessment = rec.family === 'SMV'
    ? {
        label: 'Back-Mixing Suitability',
        status: backMixOk ? 'Good Agreement' : 'Feasible — Review Recommended',
        note: backMixOk
          ? `Back-mixing risk "${inp.backMixingRisk}" — within published SMV screening experience (low/moderate risk).`
          : `Back-mixing risk "${inp.backMixingRisk}" — SMV has no dual-flow plates to interrupt axial back-mixing; SMVP is typically preferred at high risk, but SMV is not excluded. Additional review recommended.`,
      }
    : {
        label: 'Back-Mixing Suitability',
        status: 'Good Agreement',
        note: `Back-mixing risk "${inp.backMixingRisk}" — SMVP dual-flow plates provide coalescence/re-dispersion and reduced axial back-mixing.`,
      };

  const criteria = [hydraulicLoading, stageCompatibility, phaseRatioCompatibility, backMixingSuitability];
  const anyLow = criteria.some(c => c.status === 'Significant Extrapolation');
  const anyMedium = criteria.some(c => c.status === 'Feasible — Review Recommended');
  const confidence: ScreeningConfidence = anyLow ? 'Low Confidence' : anyMedium ? 'Medium Confidence' : 'High Confidence';

  const confidenceComment =
    confidence === 'High Confidence'
      ? 'Good preliminary match with published screening characteristics.'
      : confidence === 'Medium Confidence'
        ? 'Outside the typical published screening characteristics in one or more respects but technically feasible. Additional hydraulic review, distributor evaluation, or pilot/vendor validation recommended.'
        : 'Significant extrapolation beyond published screening experience. Vendor or pilot validation strongly recommended before proceeding with this packing.';

  const recommendationBasis = rec.family === 'SMV'
    ? 'Highest specific throughput capacity → smallest preliminary column diameter; published screening experience at NTS ≤ 6, S/O ≤ 3, low/moderate back-mixing risk'
    : 'Dual-flow plates force drop coalescence and re-dispersion, limiting axial back-mixing; published screening experience up to NTS 10 and at high phase ratio or high back-mixing risk';

  return {
    record: rec, perDiameter,
    hydraulicLoading, stageCompatibility, phaseRatioCompatibility, backMixingSuitability,
    confidence, confidenceComment, recommendationBasis,
  };
}

const CONFIDENCE_RANK: Record<ScreeningConfidence, number> = {
  'High Confidence': 3,
  'Medium Confidence': 2,
  'Low Confidence': 1,
};

export function runSulzerPackingScreening(inp: SulzerScreeningInput): SulzerScreeningOutput {
  const loadings: DiameterLoading[] = inp.trialDiameters_m.map(d => {
    const area = Math.PI * d * d / 4;
    return {
      diameter_m: d,
      crossSectionalArea_m2: area,
      normalSpecificThroughput_m3_m2h: inp.normalTotalFlow_m3_h / area,
      maximumSpecificThroughput_m3_m2h: inp.maximumTotalFlow_m3_h / area,
      isSelectedTrial: inp.selectedTrialDiameter_m !== null && Math.abs(d - inp.selectedTrialDiameter_m) < 1e-9,
    };
  });

  const smv = screenFamily(SULZER_SCREENING_RECORDS[0], inp, loadings);
  const smvp = screenFamily(SULZER_SCREENING_RECORDS[1], inp, loadings);

  const rSmv = CONFIDENCE_RANK[smv.confidence];
  const rSmvp = CONFIDENCE_RANK[smvp.confidence];

  let overallVerdict: SulzerScreeningOutput['overallVerdict'];
  let verdictNote: string;
  if (rSmv <= 1 && rSmvp <= 1) {
    overallVerdict = 'Vendor/Pilot Validation Required';
    verdictNote = 'Both packings show significant extrapolation beyond published screening experience (Low Confidence). Neither technology is rejected — vendor or pilot validation is required to proceed.';
  } else if (rSmv === rSmvp) {
    overallVerdict = 'Both Technically Viable';
    verdictNote = rSmv === 3
      ? 'Both packings show High Confidence — good agreement with published screening characteristics. Ranked: SMV — Capacity Preferred; SMVP — Efficiency / Back-Mixing Preferred. No packing is finalized at this stage.'
      : 'Both packings are technically feasible at Medium Confidence — outside the typical published characteristics in one or more respects. Additional hydraulic review and vendor or pilot confirmation recommended for either choice. No packing is finalized at this stage.';
  } else if (rSmv > rSmvp) {
    overallVerdict = 'Preliminary SMV Preference';
    verdictNote = `SMV screens at ${smv.confidence} vs SMVP at ${smvp.confidence} for this design. Preference is preliminary only — the alternative remains technically feasible and is not rejected.`;
  } else {
    overallVerdict = 'Preliminary SMVP Preference';
    verdictNote = `SMVP screens at ${smvp.confidence} vs SMV at ${smv.confidence} for this design. Preference is preliminary only — the alternative remains technically feasible and is not rejected.`;
  }

  return {
    input: inp, loadings, smv, smvp, overallVerdict, verdictNote,
    governanceNote: 'Literature-based preliminary screening (Rauber, AIChE 2006) — typical design characteristics, not absolute operating limits and not vendor-certified rating data. Exact HETS, pressure-drop/flooding curves, void fraction, packing geometry and distributor design remain pending approved vendor or pilot-test data.',
  };
}
