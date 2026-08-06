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
//    threshold comparisons against published screening ranges.
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

type RangeStatus = 'within' | 'marginal' | 'outside';

export interface FamilyScreeningResult {
  record: SulzerScreeningRecord;
  perDiameter: Array<DiameterLoading & { normalRangeStatus: RangeStatus; maximumRangeStatus: RangeStatus }>;
  stageCompatible: boolean;
  stageCompatibilityNote: string;
  phaseRatioCompatible: boolean;
  phaseRatioNote: string;
  backMixingSuitable: boolean;
  backMixingNote: string;
  anyDiameterWithinRange: boolean;
  screeningStatus: string;
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

/** "Reasonably within" tolerance: ±10 % beyond the published band counts as marginal. */
const MARGINAL_TOL = 0.10;

function rangeStatus(b: number, rec: SulzerScreeningRecord): RangeStatus {
  const { min, max } = rec.typicalSpecificThroughput;
  if (b >= min && b <= max) return 'within';
  if (b >= min * (1 - MARGINAL_TOL) && b <= max * (1 + MARGINAL_TOL)) return 'marginal';
  return 'outside';
}

function screenFamily(rec: SulzerScreeningRecord, inp: SulzerScreeningInput, loadings: DiameterLoading[]): FamilyScreeningResult {
  const perDiameter = loadings.map(l => ({
    ...l,
    normalRangeStatus: rangeStatus(l.normalSpecificThroughput_m3_m2h, rec),
    maximumRangeStatus: rangeStatus(l.maximumSpecificThroughput_m3_m2h, rec),
  }));

  const stageCompatible = rec.family === 'SMV'
    ? inp.theoreticalStages <= 6
    : inp.theoreticalStages <= 10; // SMVP covers up to 10 incl. NTS ≤ 6 systems
  const stageCompatibilityNote = rec.family === 'SMV'
    ? `NTS ${inp.theoreticalStages} vs published SMV screening limit ≤ 6`
    : `NTS ${inp.theoreticalStages} vs published SMVP screening limit ≤ 10`;

  const phaseRatioCompatible = rec.family === 'SMV'
    ? inp.phaseRatioVolumetric <= 3
    : true; // SMVP preferred >3 but not excluded at ≤3 — preference handled in verdict
  const phaseRatioNote = rec.family === 'SMV'
    ? `S/O (vol) ${inp.phaseRatioVolumetric} vs SMV screening rule ≤ 3`
    : `S/O (vol) ${inp.phaseRatioVolumetric}; SMVP preferred when > 3 (dual-flow plates counter back-mixing at high hold-up)`;

  const backMixingSuitable = rec.family === 'SMV'
    ? inp.backMixingRisk !== 'high'
    : true;
  const backMixingNote = rec.family === 'SMV'
    ? `Back-mixing risk "${inp.backMixingRisk}" — SMV screening applies at Low/Moderate risk`
    : `Back-mixing risk "${inp.backMixingRisk}" — SMVP dual-flow plates provide coalescence/re-dispersion and reduced axial back-mixing`;

  const anyDiameterWithinRange = perDiameter.some(
    d => d.normalRangeStatus !== 'outside' && d.maximumRangeStatus !== 'outside',
  );

  const compatible = stageCompatible && phaseRatioCompatible && backMixingSuitable;
  let screeningStatus: string;
  if (!compatible) {
    screeningStatus = 'Not preferred under preliminary screening rules';
  } else if (anyDiameterWithinRange) {
    screeningStatus = 'Within published preliminary screening range';
  } else {
    screeningStatus = 'Outside published preliminary screening range — vendor or pilot validation required.';
  }

  const recommendationBasis = rec.family === 'SMV'
    ? 'Highest specific throughput capacity → smallest preliminary column diameter; applicable at NTS ≤ 6, S/O ≤ 3, low/moderate back-mixing risk'
    : 'Dual-flow plates force drop coalescence and re-dispersion, limiting axial back-mixing; applicable up to NTS 10 and at high phase ratio or high back-mixing risk';

  return {
    record: rec, perDiameter,
    stageCompatible, stageCompatibilityNote,
    phaseRatioCompatible, phaseRatioNote,
    backMixingSuitable, backMixingNote,
    anyDiameterWithinRange, screeningStatus, recommendationBasis,
  };
}

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

  const smvViable = smv.stageCompatible && smv.phaseRatioCompatible && smv.backMixingSuitable && smv.anyDiameterWithinRange;
  const smvpViable = smvp.stageCompatible && smvp.anyDiameterWithinRange;

  let overallVerdict: SulzerScreeningOutput['overallVerdict'];
  let verdictNote: string;
  if (smvViable && smvpViable) {
    overallVerdict = 'Both Technically Viable';
    verdictNote = 'Both packings satisfy the published preliminary screening ranges. Ranked: SMV — Capacity Preferred; SMVP — Efficiency / Back-Mixing Preferred. No packing is finalized at this stage.';
  } else if (smvViable) {
    overallVerdict = 'Preliminary SMV Preference';
    verdictNote = 'SMV satisfies the preliminary screening rules; SMVP does not fully satisfy them for this design. Preference is preliminary only.';
  } else if (smvpViable) {
    overallVerdict = 'Preliminary SMVP Preference';
    verdictNote = 'SMVP satisfies the preliminary screening rules; SMV does not fully satisfy them for this design. Preference is preliminary only.';
  } else {
    overallVerdict = 'Vendor/Pilot Validation Required';
    verdictNote = 'Outside published preliminary screening range — vendor or pilot validation required. The technology is NOT rejected automatically.';
  }

  return {
    input: inp, loadings, smv, smvp, overallVerdict, verdictNote,
    governanceNote: 'Literature-based preliminary screening (Rauber, AIChE 2006) — not vendor-certified rating data. Exact HETS, pressure-drop/flooding curves, void fraction, packing geometry and distributor design remain pending approved vendor or pilot-test data.',
  };
}
