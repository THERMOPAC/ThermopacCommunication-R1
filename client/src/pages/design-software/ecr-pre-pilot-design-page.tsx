import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout";
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, Download, FlaskConical, Info, Loader2, Play, Save, Square } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FormState = {
  projectReference: string;
  rrboGrade: string;
  designFeedRateLph: string;
  operatingTemperatureC: string;
  operatingPressure: string;
  phaseConfiguration: string;
  saturatesWt: string;
  monoAromaticsWt: string;
  diAromaticsWt: string;
  polyAromaticsWt: string;
  polarAromaticsWt: string;
  nmpInFeedWt: string;
  rrboDensityKgM3: string;
  rrboDynamicViscosityCp: string;
  rrboInterfacialTensionMnM: string;
  nmpPurityWt: string;
  nmpWaterWt: string;
  nmpDensityKgM3: string;
  nmpDynamicViscosityCp: string;
  solventOilRatio: string;
  targetRaffinateSulfurPpm: string;
  minimumRaffinateSaturatesWt: string;
  targetRaffinateTotalAromaticsWt: string;
  targetRaffinatePolarAromaticsWt: string;
  minimumRecoveryPct: string;
  maximumNmpRaffinateWt: string;
  feedSulfurPpm: string;
  sulfurAllocationSatPct: string;
  sulfurAllocationMonoPct: string;
  sulfurAllocationDiPct: string;
  sulfurAllocationPolyPct: string;
  sulfurAllocationPaPct: string;
  designBasisNotes: string;
  satIdentity: string;
  monoIdentity: string;
  maximumStages: string;
};

type MolecularIdentity = { identity: string; label: string; molecularWeightGmol: number };
type PredictiveNtBasis = {
  model: {
    modelHash: string;
    calibrationStatus: string;
    releaseEligibility: string;
    pilotValidated: boolean;
  };
  molecularRegistry: {
    saturates: MolecularIdentity[];
    monoAromatics: MolecularIdentity[];
    diAromatics: MolecularIdentity & { admission: string };
    polyAromatics: MolecularIdentity & { admission: string };
    nmp: MolecularIdentity;
    water?: MolecularIdentity;
    polarAromatics: {
      admission: string;
      representative: {
        commonName: string;
        cas: string;
        formula: string;
        molecularWeightGmol: number;
        inchiKey: string;
      };
      blocker: string;
      sulfurRelationship: string;
    };
  };
  predictiveEngineComponentContract: {
    engineContractVersion?: string;
    componentCount: 6 | 7;
    families: string[];
    thermodynamicModel: string;
    sixComponentCosmoSacGate?: string;
    supportedWaterWeightPercentRange?: { minimum: number; maximum: number };
    computationalQualificationWaterWeightPercent?: number[];
  };
  sixComponentCosmoSacBasisManifestSha256: string;
  maximumStages: number;
};
type PredictiveStream = {
  flowMol: number;
  mass: number;
  componentMoles: number[];
  componentMass: number[];
  moleFractions: number[];
  massFractions: number[];
};
type PredictiveStage = {
  stageFromFeedEnd: number;
  raffinateIncoming: PredictiveStream;
  extractIncoming: PredictiveStream;
  raffinateLeaving: PredictiveStream;
  extractLeaving: PredictiveStream;
  maximumComponentBalanceResidualMol: number;
  isoactivityLogResidual: number;
  phaseCompositionSeparation: number;
  localPostSplitStability: {
    raffinate?: { minimumEigenvalue?: number };
    extract?: { minimumEigenvalue?: number };
  };
  postSplitTpdSearch: {
    raffinate?: { minimum?: number; allRefinementsAccepted?: boolean };
    extract?: { minimum?: number; allRefinementsAccepted?: boolean };
  };
  stageGibbsReduction: number;
  accepted: boolean;
};
type PredictiveTrial = {
  stageCount: number;
  solverSuccess: boolean;
  solverMessage: string;
  solverTerminationStatus?: string;
  residualClosureStatus?: "CLOSED" | "UNCLOSED";
  maximumScaledEquationResidual: number;
  multistartProductRelativeDifference: number | null;
  multistartDiagnosticProductRelativeDifference?: number;
  branchComparisonStatus?: "EVALUATED" | "NOT_EVALUABLE_ENDPOINT_UNCLOSED";
  multistartEvidence: {
    startCount?: number;
    bothStartsClosed?: boolean;
    branchComparisonStatus?: "EVALUATED" | "NOT_EVALUABLE_ENDPOINT_UNCLOSED";
    branchReproduced?: boolean;
    primary?: {
      solverSuccess?: boolean;
      terminationStatus?: string;
      terminationMessage?: string;
      functionEvaluations?: number;
      maximumScaledEquationResidual?: number;
      closureLimit?: number;
      residualClosureStatus?: "CLOSED" | "UNCLOSED";
    };
    secondary?: {
      solverSuccess?: boolean;
      terminationStatus?: string;
      terminationMessage?: string;
      functionEvaluations?: number;
      maximumScaledEquationResidual?: number;
      closureLimit?: number;
      residualClosureStatus?: "CLOSED" | "UNCLOSED";
    };
  };
  acceptanceBlockers?: Array<{ code?: string; [key: string]: unknown }>;
  boundaryStreams: {
    oilFeed: PredictiveStream;
    freshNmp?: PredictiveStream;
    freshWetSolvent?: PredictiveStream;
    finalRaffinate: PredictiveStream;
    finalExtract: PredictiveStream;
  };
  overallComponentBalanceResidualMol: number[];
  overallComponentBalanceResidualMass: number[];
  maximumOverallComponentBalanceResidualMol: number;
  productMetrics: Record<string, number | Record<string, number>>;
  targetCompliance: Record<string, { status?: string; calculated?: number | null; target?: number }>;
  numericalAcceptancePassed: boolean;
  allCalculableTargetsPass: boolean;
  sulfurPrediction?: {
    status: "CALCULABLE" | "NOT_CALCULABLE";
    reason?: string;
    predictedRaffinateSulfurPpm: number | null;
    sulfurRemovalPct: number | null;
    targetRaffinateSulfurPpm: number;
    targetStatus: "PASS" | "FAIL" | "NOT_CALCULABLE";
    retainedFractions: Record<string, number | null>;
    remainingContributionsPpm: Record<string, number | null>;
  };
  researchStatus: string;
  accepted: boolean;
  stages: PredictiveStage[];
};
type PredictiveNtResult = {
  engineContractVersion?: string;
  implementationStatus?: string;
  status: string;
  predictiveNt: number | null;
  establishedTheoreticalStages: number | null;
  calibrationRequired: boolean;
  pilotValidated: boolean;
  releaseEligible: boolean;
  sulfurPrediction?: PredictiveTrial["sulfurPrediction"];
  trialsAttempted?: number;
  governedTrialsAccepted?: number;
  diagnosticTrialsCalculated?: number;
  monotonicSequence: boolean;
  componentOrder?: string[];
  wetSolventConstruction?: {
    totalWetSolventMass?: number;
    dryNmpMass?: number;
    waterMass?: number;
    waterWeightPercentOfWetSolvent?: number;
    massClosureResidual?: number;
  };
  modelIdentity?: string;
  diagnosticSelectionBasis?: string;
  model?: { modelHash?: string; runtimeVerification?: string };
  engine?: { engineId?: string; engineVersion?: string; engineHash?: string };
  globalStabilityQualification?: {
    evidenceId?: string;
    status?: string;
    qualified?: boolean;
    postSplitTpdThreshold?: number;
    worstMinimum?: number;
    coverage?: {
      expectedPhaseEndpoints?: number;
      returnedPhaseEndpoints?: number;
      failingPhaseCount?: number;
      negativeOrUnresolvedPhaseCount?: number;
      optimizerRefinementFailureCount?: number;
    };
    comparisonCandidate?: { disposition?: string };
    blockers?: string[];
    evidenceArtifacts?: {
      protocolSha256?: string;
      resultsSha256?: string;
      provenanceSha256?: string;
    };
  };
  task218CandidateGeneratedStability?: {
    status?: string;
    qualified?: boolean;
    endpointOrder?: string;
    coverage?: { expected?: number; returned?: number };
    blockers?: string[];
    candidateModelSha256?: string;
    candidateParameterSha256?: string;
    candidateFlashHash?: string;
    cascadeExecutionHash?: string;
    endpointMatrixHash?: string;
    auditHash?: string;
    qualificationHash?: string;
  };
  researchOnlyReplacementModel?: {
    artifactVersion: string;
    status: string;
    usedByActiveCascade: boolean;
    componentOrder: string[];
    model: {
      identity: string;
      totalScalarGibbs: string;
      nativeRetainedInAllCalculations: boolean;
      parameterCount: number;
      declaredPairCount: number;
      polynomialOrders: number[];
    };
    provenance: {
      resultsSha256: string;
      modelSha256: string;
      protocolSha256: string;
      evidenceSha256: string;
    };
    parent: {
      temperatureK: number;
      waterWeightPercentOfWetSolvent: number;
      composition: number[];
      unstableTowardDistinctNmpOilBranch: boolean;
      raffinateDevelopmentBranchTpd: number;
      extractDevelopmentBranchTpd: number;
    };
    split: {
      betaRaffinate: number;
      betaExtract: number;
      raffinateMoleFractions: number[];
      extractMoleFractions: number[];
      gibbsReduction: number;
      materialClosureMaxResidual: number;
      chemicalPotentialMaxResidual: number;
      maximumIndependentPhaseCompositionDifference: number;
      independentBetaAbsoluteDifference: number;
      positivePhaseAmounts: boolean;
      positiveComponentAmounts: boolean;
      oilRichRaffinate: boolean;
      nmpRichExtract: boolean;
    };
    stability: {
      raffinateTpdMinimum: number;
      extractTpdMinimum: number;
      postSplitVerdict: string;
      formerMonoRichConstrainedMinimum: number;
      formerMonoRichNegativeBasinFound: boolean;
      globalExclusionClaimed: boolean;
    };
    evidenceFit: {
      ceiling: number;
      trainingRows: number;
      trainingChemicalPotentialEqualityRms: number;
      trainingStatus: string;
      heldOutRows: number;
      heldOutChemicalPotentialEqualityRms: number;
      heldOutStatus: string;
    };
    releaseGate: {
      predictiveEligible: boolean;
      releaseEligible: boolean;
      blockers: string[];
    };
  };
  stage1TargetGovernance?: {
    stage1SnapshotHash?: string;
    predictiveNtAuthority?: string;
    sulfurPrediction?: { status?: string; calibrationStatus?: string };
    minimumMassRecovery?: { targetPercent?: number; status?: string };
    overallEcrProductAcceptance?: boolean;
    overallEcrProductAcceptanceStatus?: string;
  };
  trials?: PredictiveTrial[];
  executionStatus?: "BLOCKED_NO_LIQUID_SPLIT" | "BLOCKED_PHASE_TOPOLOGY_UNRESOLVED"
    | "COMPLETED_PRE_PILOT_MULTISTAGE_MATRIX";
  blockingCode?: string;
  blockingMessage?: string;
  blockedCascadeTrialCount?: number;
  blockedStageFromFeedEnd?: number;
  thermodynamicCondition?: {
    temperatureC?: number;
    temperatureK?: number;
    authority?: string;
  };
};
type PredictiveNtJob = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: { completedStageTrials: number; maximumStages: number };
  modelHash: string;
  engineHash: string;
  input?: { ntTest?: number };
  result: PredictiveNtResult | null;
  report: {
    available: boolean;
    filename: string | null;
    sha256: string | null;
    generatedAt: string | null;
    downloadUrl: string | null;
  };
  error: string | null;
};

const DEFAULT_PHASE_CONFIGURATION = "nmp-continuous-rrbo-dispersed";
const DEFAULT_RRBO_GRADE = "SN300";
const DEFAULT_OPERATING_TEMPERATURE_C = "50";
const DEFAULT_OPERATING_PRESSURE = "2.0";
const MAXIMUM_STAGE_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const value = String(index + 1);
  return { value, label: `${value} stages` };
});

const EMPTY_FORM: FormState = {
  projectReference: "",
  rrboGrade: DEFAULT_RRBO_GRADE,
  designFeedRateLph: "",
  operatingTemperatureC: DEFAULT_OPERATING_TEMPERATURE_C,
  operatingPressure: DEFAULT_OPERATING_PRESSURE,
  phaseConfiguration: DEFAULT_PHASE_CONFIGURATION,
  saturatesWt: "85.0",
  monoAromaticsWt: "7.0",
  diAromaticsWt: "4.0",
  polyAromaticsWt: "2.0",
  polarAromaticsWt: "2.0",
  nmpInFeedWt: "0.0",
  rrboDensityKgM3: "",
  rrboDynamicViscosityCp: "",
  rrboInterfacialTensionMnM: "",
  nmpPurityWt: "",
  nmpWaterWt: "",
  nmpDensityKgM3: "",
  nmpDynamicViscosityCp: "",
  solventOilRatio: "0.90",
  targetRaffinateSulfurPpm: "1000",
  minimumRaffinateSaturatesWt: "90",
  targetRaffinateTotalAromaticsWt: "5.0",
  targetRaffinatePolarAromaticsWt: "0.50",
  minimumRecoveryPct: "95",
  maximumNmpRaffinateWt: "6.50",
  feedSulfurPpm: "3500",
  sulfurAllocationSatPct: "0",
  sulfurAllocationMonoPct: "5",
  sulfurAllocationDiPct: "25",
  sulfurAllocationPolyPct: "35",
  sulfurAllocationPaPct: "35",
  designBasisNotes: "",
  satIdentity: "",
  monoIdentity: "",
  maximumStages: "10",
};

function hydrateSavedStage1(current: FormState, inputData: unknown): FormState {
  if (!inputData || typeof inputData !== "object") return current;
  const stage1 = (inputData as { stage1?: unknown }).stage1;
  if (!stage1 || typeof stage1 !== "object") return current;
  const source = stage1 as Record<string, unknown>;
  const next = { ...current };
  const numericSelectPrecision: Partial<Record<keyof FormState, number>> = {
    nmpPurityWt: 1,
    nmpWaterWt: 1,
    solventOilRatio: 2,
    targetRaffinateTotalAromaticsWt: 1,
    targetRaffinatePolarAromaticsWt: 2,
    maximumNmpRaffinateWt: 2,
  };
  for (const key of Object.keys(EMPTY_FORM) as Array<keyof FormState>) {
    if (source[key] !== undefined && source[key] !== null) {
      const precision = numericSelectPrecision[key];
      const numericValue = Number(source[key]);
      next[key] = precision !== undefined && Number.isFinite(numericValue)
        ? numericValue.toFixed(precision)
        : String(source[key]);
    }
  }
  return next;
}

const FEED_RATE_OPTIONS = Array.from({ length: 15 }, (_, index) => String((index + 1) * 1000));
const TEMPERATURE_OPTIONS = ["25", "30", ...Array.from({ length: 7 }, (_, index) => String((index + 4) * 10))];
const PRESSURE_OPTIONS = [
  { value: "atmospheric", label: "Atmospheric" },
  { value: "1.0", label: "1.0 bar(a)" },
  { value: "1.5", label: "1.5 bar(a)" },
  { value: "2.0", label: "2.0 bar(a)" },
  { value: "3.0", label: "3.0 bar(a)" },
  { value: "other", label: "Other / not listed" },
];
const PHASE_OPTIONS = [
  { value: "nmp-continuous-rrbo-dispersed", label: "NMP continuous / RRBO dispersed" },
  { value: "rrbo-continuous-nmp-dispersed", label: "RRBO continuous / NMP dispersed" },
];
const SOLVENT_OIL_RATIO_OPTIONS = ["0.50", "0.75", "0.90", "1.00", "1.25", "1.50", "2.00"];
const NMP_WATER_OPTIONS = [
  "0.5",
  "1.0",
  "1.5",
  "2.0",
  "2.5",
  "3.0",
  "3.5",
  "4.0",
  "4.5",
  "5.0",
];
const NMP_PURITY_OPTIONS = NMP_WATER_OPTIONS.map((water) => (100 - Number(water)).toFixed(1)).reverse();
const TARGET_RAFFINATE_SULFUR_OPTIONS = ["750", "1000", "1500", "2000", "2500"];
const MINIMUM_RAFFINATE_SATURATES_OPTIONS = ["90", "92.5", "95", "97.5"];
const TARGET_TOTAL_AROMATICS_OPTIONS = Array.from(
  { length: 17 },
  (_, index) => (2 + index * 0.5).toFixed(1),
);
const TARGET_POLAR_AROMATICS_OPTIONS = ["0.10", "0.25", "0.50", "1.00", "2.00"];
const MINIMUM_RECOVERY_OPTIONS = Array.from({ length: 11 }, (_, index) => String(80 + index));
const MAXIMUM_NMP_RAFFINATE_OPTIONS = Array.from(
  { length: 19 },
  (_, index) => (1 + index * 0.5).toFixed(2),
);

const NMP_STANDARD_PURPOSE = {
  purityWt: "98.0",
  waterWt: "2.0",
};

const NMP_DENSITY_POINTS = [
  { temperatureC: 25, valueKgM3: 1028 },
  { temperatureC: 30, valueKgM3: 1023 },
  { temperatureC: 40, valueKgM3: 1015 },
  { temperatureC: 50, valueKgM3: 1006 },
  { temperatureC: 60, valueKgM3: 997 },
  { temperatureC: 70, valueKgM3: 988 },
  { temperatureC: 80, valueKgM3: 979 },
  { temperatureC: 90, valueKgM3: 970 },
  { temperatureC: 100, valueKgM3: 961 },
];

const NMP_DYNAMIC_VISCOSITY_POINTS = [
  { temperatureC: 25, valueCp: 1.666 },
  { temperatureC: 80, valueCp: 0.75 },
  { temperatureC: 90, valueCp: 0.585 },
  { temperatureC: 100, valueCp: 0.420 },
];

const RRBO_GRADE_PROPERTIES: Record<string, {
  densityPoints: Array<{ temperatureC: number; value: number }>;
  dynamicViscosityPoints: Array<{ temperatureC: number; value: number }>;
}> = {
  SN150: {
    densityPoints: [
      { temperatureC: 25, value: 864 },
      { temperatureC: 30, value: 861 },
      { temperatureC: 40, value: 854 },
      { temperatureC: 50, value: 848 },
      { temperatureC: 60, value: 841 },
      { temperatureC: 70, value: 835 },
      { temperatureC: 80, value: 829 },
      { temperatureC: 90, value: 823 },
      { temperatureC: 100, value: 817 },
    ],
    dynamicViscosityPoints: [
      { temperatureC: 25, value: 49.0 },
      { temperatureC: 30, value: 38.0 },
      { temperatureC: 40, value: 27.5 },
      { temperatureC: 50, value: 20.0 },
      { temperatureC: 60, value: 14.5 },
      { temperatureC: 70, value: 10.8 },
      { temperatureC: 80, value: 8.1 },
      { temperatureC: 90, value: 6.2 },
      { temperatureC: 100, value: 4.9 },
    ],
  },
  SN300: {
    densityPoints: [
      { temperatureC: 25, value: 878 },
      { temperatureC: 30, value: 875 },
      { temperatureC: 40, value: 869 },
      { temperatureC: 50, value: 862 },
      { temperatureC: 60, value: 856 },
      { temperatureC: 70, value: 849 },
      { temperatureC: 80, value: 842 },
      { temperatureC: 90, value: 835 },
      { temperatureC: 100, value: 828 },
    ],
    dynamicViscosityPoints: [
      { temperatureC: 25, value: 106.0 },
      { temperatureC: 30, value: 81.0 },
      { temperatureC: 40, value: 59.8 },
      { temperatureC: 50, value: 42.0 },
      { temperatureC: 60, value: 30.0 },
      { temperatureC: 70, value: 22.0 },
      { temperatureC: 80, value: 17.0 },
      { temperatureC: 90, value: 13.8 },
      { temperatureC: 100, value: 11.4 },
    ],
  },
  SN500: {
    densityPoints: [
      { temperatureC: 25, value: 885 },
      { temperatureC: 30, value: 882 },
      { temperatureC: 40, value: 875 },
      { temperatureC: 50, value: 869 },
      { temperatureC: 60, value: 862 },
      { temperatureC: 70, value: 856 },
      { temperatureC: 80, value: 850 },
      { temperatureC: 90, value: 844 },
      { temperatureC: 100, value: 838 },
    ],
    dynamicViscosityPoints: [
      { temperatureC: 25, value: 158.0 },
      { temperatureC: 30, value: 121.0 },
      { temperatureC: 40, value: 84.6 },
      { temperatureC: 50, value: 59.0 },
      { temperatureC: 60, value: 42.0 },
      { temperatureC: 70, value: 30.0 },
      { temperatureC: 80, value: 23.5 },
      { temperatureC: 90, value: 19.0 },
      { temperatureC: 100, value: 15.8 },
    ],
  },
};

const RRBO_INTERFACIAL_TENSION_POINTS = [
  { temperatureC: 25, value: 12.0 },
  { temperatureC: 30, value: 11.6 },
  { temperatureC: 40, value: 11.0 },
  { temperatureC: 50, value: 10.6 },
  { temperatureC: 60, value: 10.3 },
  { temperatureC: 70, value: 10.0 },
  { temperatureC: 80, value: 9.7 },
  { temperatureC: 90, value: 9.4 },
  { temperatureC: 100, value: 9.1 },
];

const COMPOSITION_FIELDS = [
  { key: "saturatesWt", label: "Saturates" },
  { key: "monoAromaticsWt", label: "Mono-aromatics" },
  { key: "diAromaticsWt", label: "Di-aromatics" },
  { key: "polyAromaticsWt", label: "Poly-aromatics" },
  { key: "polarAromaticsWt", label: "Polar aromatics" },
  { key: "nmpInFeedWt", label: "NMP in feed" },
] as const;

const SULFUR_ALLOCATION_FIELDS = [
  { key: "sulfurAllocationSatPct", compositionKey: "saturatesWt", label: "SAT" },
  { key: "sulfurAllocationMonoPct", compositionKey: "monoAromaticsWt", label: "MONO" },
  { key: "sulfurAllocationDiPct", compositionKey: "diAromaticsWt", label: "DI" },
  { key: "sulfurAllocationPolyPct", compositionKey: "polyAromaticsWt", label: "POLY" },
  { key: "sulfurAllocationPaPct", compositionKey: "polarAromaticsWt", label: "PA" },
] as const;

type ValidationErrors = Partial<Record<keyof FormState, string>> & {
  compositionTotal?: string;
  sulfurAllocationTotal?: string;
};

const SECTION_TONES = {
  blue: {
    card: "border-blue-200",
    header: "bg-blue-50/70",
    number: "bg-blue-100 text-blue-700",
  },
  emerald: {
    card: "border-emerald-200",
    header: "bg-emerald-50/70",
    number: "bg-emerald-100 text-emerald-700",
  },
  indigo: {
    card: "border-indigo-200",
    header: "bg-indigo-50/70",
    number: "bg-indigo-100 text-indigo-700",
  },
  cyan: {
    card: "border-cyan-200",
    header: "bg-cyan-50/70",
    number: "bg-cyan-100 text-cyan-700",
  },
  violet: {
    card: "border-violet-200",
    header: "bg-violet-50/70",
    number: "bg-violet-100 text-violet-700",
  },
  amber: {
    card: "border-amber-200",
    header: "bg-amber-50/70",
    number: "bg-amber-100 text-amber-700",
  },
} as const;

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nmpComplement(value: string): string | null {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d*))?$/.exec(trimmed);
  if (!match) return null;

  const fractionalDigits = match[2]?.length ?? 0;
  const scale = 10n ** BigInt(fractionalDigits);
  const entered = BigInt(match[1]) * scale + BigInt(match[2] || "0");
  const total = 100n * scale;
  if (entered < 0n || entered > total) return null;

  const complement = total - entered;
  if (fractionalDigits === 0) return complement.toString();
  const whole = complement / scale;
  const fractional = (complement % scale).toString().padStart(fractionalDigits, "0");
  return `${whole}.${fractional}`;
}

function isAllowedOption(value: string, options: Array<string | { value: string }>) {
  return options.some((option) => (typeof option === "string" ? option : option.value) === value);
}

function validateForm(form: FormState): ValidationErrors {
  const errors: ValidationErrors = {};
  const requiredText = (key: keyof FormState, label: string) => {
    if (form[key].trim() === "") {
      errors[key] = `${label} is required.`;
    }
  };
  const requiredOption = (key: keyof FormState, label: string, options: Array<string | { value: string }>) => {
    if (form[key].trim() === "") {
      errors[key] = `${label} is required.`;
    } else if (!isAllowedOption(form[key], options)) {
      errors[key] = `Select a valid ${label.toLowerCase()}.`;
    }
  };
  const numeric = (
    key: keyof FormState,
    label: string,
    { min, max, required = true }: { min?: number; max?: number; required?: boolean } = {},
  ) => {
    const value = form[key].trim();
    if (value === "") {
      if (required) errors[key] = `${label} is required.`;
      return null;
    }

    const parsed = parseNumber(value);
    if (parsed === null) {
      errors[key] = `${label} must be a valid number.`;
      return null;
    }
    if (min !== undefined && parsed < min) {
      errors[key] = `${label} must be at least ${min}.`;
      return null;
    }
    if (max !== undefined && parsed > max) {
      errors[key] = `${label} must be no more than ${max}.`;
      return null;
    }
    return parsed;
  };

  requiredText("projectReference", "Project number");
  requiredOption("rrboGrade", "RRBO grade", ["SN150", "SN300", "SN500"]);
  requiredOption("designFeedRateLph", "Design feed rate", FEED_RATE_OPTIONS);
  requiredOption("operatingTemperatureC", "Operating temperature", TEMPERATURE_OPTIONS);
  requiredOption("operatingPressure", "Operating pressure", PRESSURE_OPTIONS);
  requiredOption("phaseConfiguration", "Phase configuration", PHASE_OPTIONS);
  requiredText("satIdentity", "SAT molecular identity");
  requiredText("monoIdentity", "MONO molecular identity");
  requiredOption("maximumStages", "theoretical stage count to test", MAXIMUM_STAGE_OPTIONS);

  const compositionValues = COMPOSITION_FIELDS.map(({ key, label }) => ({
    key,
    value: numeric(key, label, { min: 0, max: 100 }),
  }));
  if (compositionValues.every(({ value }) => value !== null)) {
    const total = compositionValues.reduce((sum, { value }) => sum + (value ?? 0), 0);
    if (Math.abs(total - 100) >= 0.005) {
      errors.compositionTotal = "The six feed components must total exactly 100 wt%.";
    }
  }

  numeric("rrboDensityKgM3", "RRBO density", { min: 0.001 });
  numeric("rrboDynamicViscosityCp", "RRBO dynamic viscosity", { min: 0.001 });
  numeric("rrboInterfacialTensionMnM", "RRBO interfacial tension", { min: 0.001 });
  const nmpPurity = numeric("nmpPurityWt", "NMP purity", { min: 0, max: 100 });
  const nmpWater = numeric("nmpWaterWt", "Water in NMP", { min: 0.5, max: 5 });
  if (nmpPurity !== null && nmpWater !== null && Math.abs(nmpPurity + nmpWater - 100) > 1e-9) {
    errors.nmpWaterWt = "NMP purity and water must total exactly 100 wt%.";
  }
  numeric("nmpDensityKgM3", "NMP density", { min: 0.001 });
  numeric("nmpDynamicViscosityCp", "NMP dynamic viscosity", { min: 0.001 });

  requiredOption("solventOilRatio", "Solvent / Oil ratio", SOLVENT_OIL_RATIO_OPTIONS);
  requiredOption("targetRaffinateSulfurPpm", "Target raffinate sulfur", TARGET_RAFFINATE_SULFUR_OPTIONS);
  requiredOption("minimumRaffinateSaturatesWt", "Minimum raffinate saturates", MINIMUM_RAFFINATE_SATURATES_OPTIONS);
  requiredOption("targetRaffinateTotalAromaticsWt", "Total aromatics target", TARGET_TOTAL_AROMATICS_OPTIONS);
  requiredOption("targetRaffinatePolarAromaticsWt", "Polar aromatics target", TARGET_POLAR_AROMATICS_OPTIONS);
  requiredOption("minimumRecoveryPct", "Minimum recovery", MINIMUM_RECOVERY_OPTIONS);
  requiredOption("maximumNmpRaffinateWt", "Maximum NMP in raffinate", MAXIMUM_NMP_RAFFINATE_OPTIONS);

  numeric("feedSulfurPpm", "Feed sulfur", { min: 0 });
  const sulfurAllocationValues = SULFUR_ALLOCATION_FIELDS.map(({ key, label }) => ({
    key,
    value: numeric(key, `${label} sulfur allocation`, { min: 0, max: 100 }),
  }));
  if (sulfurAllocationValues.every(({ value }) => value !== null)) {
    const total = sulfurAllocationValues.reduce((sum, { value }) => sum + (value ?? 0), 0);
    if (Math.abs(total - 100) > 1e-9) {
      errors.sulfurAllocationTotal = "Sulfur allocation must total exactly 100%.";
    }
  }
  if (form.designBasisNotes.length > 2000) {
    errors.designBasisNotes = "Design basis notes must be 2,000 characters or fewer.";
  }

  return errors;
}

function interpolateProperty(
  temperatureC: number,
  points: Array<{ temperatureC: number; value: number }>,
): number | null {
  if (temperatureC < points[0].temperatureC || temperatureC > points[points.length - 1].temperatureC) {
    return null;
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (temperatureC <= current.temperatureC) {
      const fraction = (temperatureC - previous.temperatureC) / (current.temperatureC - previous.temperatureC);
      return previous.value + fraction * (current.value - previous.value);
    }
  }

  return points[points.length - 1].value;
}

function getStandardNmpProperties(operatingTemperature: string) {
  const temperatureC = parseNumber(operatingTemperature);
  if (temperatureC === null) {
    return {
      purityWt: "",
      waterWt: "",
      densityKgM3: "",
      dynamicViscosityCp: "",
    };
  }

  const densityKgM3 = interpolateProperty(
    temperatureC,
    NMP_DENSITY_POINTS.map(({ temperatureC: pointTemperature, valueKgM3 }) => ({
      temperatureC: pointTemperature,
      value: valueKgM3,
    })),
  );
  const dynamicViscosityCp = interpolateProperty(
    temperatureC,
    NMP_DYNAMIC_VISCOSITY_POINTS.map(({ temperatureC: pointTemperature, valueCp }) => ({
      temperatureC: pointTemperature,
      value: valueCp,
    })),
  );

  return {
    purityWt: NMP_STANDARD_PURPOSE.purityWt,
    waterWt: nmpComplement(NMP_STANDARD_PURPOSE.purityWt) as string,
    densityKgM3: densityKgM3 === null ? "" : densityKgM3.toFixed(1),
    dynamicViscosityCp: dynamicViscosityCp === null ? "" : dynamicViscosityCp.toFixed(3),
  };
}

function getStandardRrboProperties(rrboGrade: string, operatingTemperature: string) {
  const gradeProperties = RRBO_GRADE_PROPERTIES[rrboGrade];
  const temperatureC = parseNumber(operatingTemperature);
  if (!gradeProperties || temperatureC === null) {
    return {
      densityKgM3: "",
      dynamicViscosityCp: "",
      interfacialTensionMnM: "",
    };
  }

  const densityKgM3 = interpolateProperty(temperatureC, gradeProperties.densityPoints);
  const dynamicViscosityCp = interpolateProperty(temperatureC, gradeProperties.dynamicViscosityPoints);
  const interfacialTensionMnM = interpolateProperty(temperatureC, RRBO_INTERFACIAL_TENSION_POINTS);

  return {
    densityKgM3: densityKgM3 === null ? "" : densityKgM3.toFixed(1),
    dynamicViscosityCp: dynamicViscosityCp === null ? "" : dynamicViscosityCp.toFixed(2),
    interfacialTensionMnM: interfacialTensionMnM === null ? "" : interfacialTensionMnM.toFixed(2),
  };
}

function SectionHeading({
  number,
  title,
  description,
  tone,
  expanded,
  summary,
  onToggle,
}: {
  number: string;
  title: string;
  description: string;
  tone: keyof typeof SECTION_TONES;
  expanded: boolean;
  summary: string;
  onToggle: () => void;
}) {
  const styles = SECTION_TONES[tone];

  return (
    <CardHeader className={`border-b px-4 py-2.5 ${styles.header}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`stage1-section-${number}`}
        className="flex w-full items-start gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${styles.number}`}>
          {number}
        </span>
        <span className="min-w-0 flex-1">
          <CardTitle className="text-[15px] font-semibold text-slate-900">{title}</CardTitle>
          <CardDescription className="mt-0.5 text-[11px] leading-4 text-slate-500">
            {expanded ? description : summary}
          </CardDescription>
        </span>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
    </CardHeader>
  );
}

function NumericField({
  id,
  label,
  value,
  onChange,
  unit,
  min = "0",
  max,
  step = "any",
  placeholder,
  hint,
  required = false,
  error,
  readOnly = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
  min?: string;
  max?: string;
  step?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  error?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[13px] font-medium text-slate-700">
        {label}{required && <span className="text-red-600"> *</span>}
      </Label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          required={required}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          readOnly={readOnly}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`h-8 text-sm ${required ? "bg-violet-50/40" : "bg-white"} ${error ? "border-red-400 focus-visible:ring-red-400" : ""}`}
        />
        <span className="shrink-0 text-[11px] font-medium text-slate-500">{unit}</span>
      </div>
      {hint && <p className="text-[11px] leading-4 text-slate-400">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-[11px] font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  placeholder,
  options,
  unit,
  required = false,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: Array<string | { value: string; label: string }>;
  unit?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[13px] font-medium text-slate-700">
        {label}{required && <span className="text-red-600"> *</span>}
      </Label>
      <div className="flex items-center gap-1.5">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger
            id={id}
            aria-required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            className={`h-8 bg-white text-sm ${error ? "border-red-400 focus:ring-red-400" : ""}`}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => {
              const optionValue = typeof option === "string" ? option : option.value;
              const optionLabel = typeof option === "string" ? option : option.label;
              return (
                <SelectItem key={optionValue} value={optionValue}>
                  {optionLabel}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {unit && <span className="shrink-0 text-[11px] font-medium text-slate-500">{unit}</span>}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-[11px] font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function EcrPrePilotDesignWorkflowPage({ stage = 1 }: { stage?: 1 | 2 }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const isThermodynamicsStage = stage === 2;
  const [form, setForm] = useState<FormState>(() => {
    const rrboProperties = getStandardRrboProperties(EMPTY_FORM.rrboGrade, EMPTY_FORM.operatingTemperatureC);
    const nmpProperties = getStandardNmpProperties(EMPTY_FORM.operatingTemperatureC);

    return {
      ...EMPTY_FORM,
      rrboDensityKgM3: rrboProperties.densityKgM3,
      rrboDynamicViscosityCp: rrboProperties.dynamicViscosityCp,
      rrboInterfacialTensionMnM: rrboProperties.interfacialTensionMnM,
      nmpPurityWt: nmpProperties.purityWt,
      nmpWaterWt: nmpProperties.waterWt,
      nmpDensityKgM3: nmpProperties.densityKgM3,
      nmpDynamicViscosityCp: nmpProperties.dynamicViscosityCp,
    };
  });
  const [saveState, setSaveState] = useState<"unsaved" | "saved" | "draft">("unsaved");
  const [stage1Saving, setStage1Saving] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [projectNumberLoading, setProjectNumberLoading] = useState(true);
  const [projectNumberLoadError, setProjectNumberLoadError] = useState<string | null>(null);
  const [designId, setDesignId] = useState<number | null>(null);
  const [predictiveBasis, setPredictiveBasis] = useState<PredictiveNtBasis | null>(null);
  const [predictiveBasisError, setPredictiveBasisError] = useState<string | null>(null);
  const [predictiveJob, setPredictiveJob] = useState<PredictiveNtJob | null>(null);
  const [predictiveSubmitting, setPredictiveSubmitting] = useState(false);
  const [predictiveStopping, setPredictiveStopping] = useState(false);
  const [predictivePollingPaused, setPredictivePollingPaused] = useState(false);
  const [predictivePollingError, setPredictivePollingError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<1 | 2 | 3 | 4 | 5 | 6 | null>(1);
  const [molecularDetailsOpen, setMolecularDetailsOpen] = useState(false);
  const [sulfurDetailsOpen, setSulfurDetailsOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const initializeDesign = async () => {
      try {
        let response = await fetch("/api/ecr-pre-pilot/designs/latest-saved", {
          credentials: "include",
        });
        let payload = await response.json().catch(() => ({}));
        if (response.status === 404 && !isThermodynamicsStage) {
          const storageKey = "ecr-pre-pilot-allocation-key";
          const existingKey = window.sessionStorage.getItem(storageKey);
          const allocationKey = existingKey ?? window.crypto.randomUUID();
          if (!existingKey) {
            window.sessionStorage.setItem(storageKey, allocationKey);
          }
          response = await fetch("/api/ecr-pre-pilot/designs", {
            method: "POST",
            headers: { "Idempotency-Key": allocationKey },
            credentials: "include",
          });
          payload = await response.json().catch(() => ({}));
        }
        if (response.status === 404 && isThermodynamicsStage) {
          throw new Error("Save Stage 1 Inputs before opening Stage 2 Thermodynamics.");
        }
        if (!response.ok) {
          throw new Error(payload.message ?? "Project number could not be loaded.");
        }
        if (cancelled) return;
        const savedStage1 = payload.inputData?.stage1 as Record<string, unknown> | undefined;
        setForm((current) => hydrateSavedStage1(
          { ...current, projectReference: String(payload.projectNumber) },
          payload.inputData,
        ));
        setSaveState(savedStage1 ? "saved" : "unsaved");
        setDesignId(Number(payload.id));
        setProjectNumberLoadError(null);
        setProjectNumberLoading(false);
      } catch (error: unknown) {
        if (cancelled) return;
        setProjectNumberLoading(false);
        setProjectNumberLoadError(error instanceof Error ? error.message : "Project number could not be loaded.");
      }
    };
    void initializeDesign();

    return () => {
      cancelled = true;
    };
  }, [isThermodynamicsStage]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ecr-pre-pilot/predictive-nt/basis", { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Predictive molecular basis could not be loaded.");
        if (cancelled) return;
        const basis = payload as PredictiveNtBasis;
        setPredictiveBasis(basis);
        setForm((current) => ({
          ...current,
          satIdentity: current.satIdentity || basis.molecularRegistry.saturates[0]?.identity || "",
          monoIdentity: current.monoIdentity || basis.molecularRegistry.monoAromatics[0]?.identity || "",
        }));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPredictiveBasisError(error instanceof Error ? error.message : "Predictive molecular basis could not be loaded.");
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isThermodynamicsStage || !designId) return;
    let cancelled = false;
    const restoreLatestJob = async () => {
      try {
        const response = await fetch(
          `/api/ecr-pre-pilot/designs/${designId}/predictive-nt/jobs/latest`,
          { credentials: "include" },
        );
        if (response.status === 404) return;
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? "Latest Predictive N_T job could not be loaded.");
        }
        if (!cancelled) {
          setPredictiveJob(payload as PredictiveNtJob);
          setPredictivePollingPaused(false);
          setPredictivePollingError(null);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setPredictivePollingError(
            error instanceof Error ? error.message : "Latest Predictive N_T job could not be loaded.",
          );
        }
      }
    };
    void restoreLatestJob();
    return () => { cancelled = true; };
  }, [designId, isThermodynamicsStage]);

  useEffect(() => {
    if (!isThermodynamicsStage || !designId || !predictiveJob || predictivePollingPaused || !["pending", "running"].includes(predictiveJob.status)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/ecr-pre-pilot/designs/${designId}/predictive-nt/jobs/${predictiveJob.id}`,
          { credentials: "include" },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Predictive N_T job status could not be loaded.");
        if (!cancelled) {
          setPredictiveJob(payload as PredictiveNtJob);
          setPredictivePollingError(null);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Job status could not be loaded.";
          setPredictivePollingError(message);
          setPredictivePollingPaused(true);
          toast({
            title: "Predictive N_T monitoring interrupted",
            description: "Automatic polling paused. Resume monitoring when the connection is available.",
            variant: "destructive",
          });
        }
      }
    };
    const timer = window.setInterval(() => void poll(), 1_500);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [designId, isThermodynamicsStage, predictiveJob?.id, predictiveJob?.status, predictivePollingPaused, toast]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    const nextForm = { ...form, [key]: value };
    setForm(nextForm);
    setSaveState("unsaved");
    if (validationAttempted) {
      setValidationErrors(validateForm(nextForm));
    }
  };

  const setNmpWater = (value: string) => {
    const complement = nmpComplement(value);
    const nextForm = {
      ...form,
      nmpWaterWt: value,
      ...(complement === null ? {} : { nmpPurityWt: complement }),
    };
    setForm(nextForm);
    setSaveState("unsaved");
    if (validationAttempted) {
      setValidationErrors(validateForm(nextForm));
    }
  };

  const setNmpPurity = (value: string) => {
    const complement = nmpComplement(value);
    const nextForm = {
      ...form,
      nmpPurityWt: value,
      ...(complement === null ? {} : { nmpWaterWt: complement }),
    };
    setForm(nextForm);
    setSaveState("unsaved");
    if (validationAttempted) {
      setValidationErrors(validateForm(nextForm));
    }
  };

  const handleRrboGradeChange = (grade: string) => {
    const properties = getStandardRrboProperties(grade, form.operatingTemperatureC);
    const nextForm = {
      ...form,
      rrboGrade: grade,
      rrboDensityKgM3: properties.densityKgM3,
      rrboDynamicViscosityCp: properties.dynamicViscosityCp,
      rrboInterfacialTensionMnM: properties.interfacialTensionMnM,
    };
    setForm(nextForm);
    setSaveState("unsaved");
    if (validationAttempted) {
      setValidationErrors(validateForm(nextForm));
    }
  };

  const handleOperatingTemperatureChange = (operatingTemperature: string) => {
    const nmpProperties = getStandardNmpProperties(operatingTemperature);
    const rrboProperties = getStandardRrboProperties(form.rrboGrade, operatingTemperature);
    const nextForm = {
      ...form,
      operatingTemperatureC: operatingTemperature,
      rrboDensityKgM3: rrboProperties.densityKgM3,
      rrboDynamicViscosityCp: rrboProperties.dynamicViscosityCp,
      rrboInterfacialTensionMnM: rrboProperties.interfacialTensionMnM,
      nmpDensityKgM3: nmpProperties.densityKgM3,
      nmpDynamicViscosityCp: nmpProperties.dynamicViscosityCp,
    };
    setForm(nextForm);
    setSaveState("unsaved");
    if (validationAttempted) {
      setValidationErrors(validateForm(nextForm));
    }
  };

  const compositionStatus = useMemo(() => {
    const values = COMPOSITION_FIELDS.map(({ key }) => parseNumber(form[key]));
    const populatedCount = values.filter((value): value is number => value !== null).length;
    const total = values.reduce((sum, value) => sum + (value ?? 0), 0);
    const complete = populatedCount === COMPOSITION_FIELDS.length;
    const valuesInRange = values.every((value) => value !== null && value >= 0 && value <= 100);
    const valid = complete && valuesInRange && Math.abs(total - 100) < 0.005;

    return { populatedCount, total, complete, valid };
  }, [form]);

  const sulfurDistribution = useMemo(() => {
    const feedSulfurPpm = parseNumber(form.feedSulfurPpm);
    const rows = SULFUR_ALLOCATION_FIELDS.map(({ key, compositionKey, label }) => {
      const allocationPct = parseNumber(form[key]);
      const feedComponentKg = parseNumber(form[compositionKey]);
      const sulfurMassKg = feedSulfurPpm !== null && allocationPct !== null
        ? (feedSulfurPpm / 10_000) * (allocationPct / 100)
        : null;
      const componentSulfurWt = sulfurMassKg !== null && feedComponentKg !== null && feedComponentKg > 0
        ? (sulfurMassKg / feedComponentKg) * 100
        : allocationPct === 0 && feedComponentKg === 0
          ? 0
          : null;
      return { key, label, allocationPct, feedComponentKg, sulfurMassKg, componentSulfurWt };
    });
    const populatedCount = rows.filter(({ allocationPct }) => allocationPct !== null).length;
    const totalAllocationPct = rows.reduce((sum, { allocationPct }) => sum + (allocationPct ?? 0), 0);
    const valid = populatedCount === rows.length
      && rows.every(({ allocationPct }) => allocationPct !== null && allocationPct >= 0 && allocationPct <= 100)
      && Math.abs(totalAllocationPct - 100) <= 1e-9;
    return {
      rows,
      populatedCount,
      totalAllocationPct,
      valid,
      totalSulfurMassKg: feedSulfurPpm === null ? null : feedSulfurPpm / 10_000,
    };
  }, [form]);

  const liveValidationErrors = useMemo(() => validateForm(form), [form]);
  const sectionHasIssues = (...keys: Array<keyof ValidationErrors>) => keys.some((key) => Boolean(liveValidationErrors[key]));

  const designFeedRateIsValid = isAllowedOption(form.designFeedRateLph, FEED_RATE_OPTIONS);

  const validateBeforeAction = () => {
    if (projectNumberLoading || projectNumberLoadError) {
      toast({
        title: "Project number unavailable",
        description: projectNumberLoadError ?? "Wait for the server to generate the project number before continuing.",
        variant: "destructive",
      });
      return false;
    }

    const errors = validateForm(form);
    setValidationAttempted(true);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors).find((error): error is string => Boolean(error));
      toast({
        title: "Input validation needed",
        description: firstError ?? "Review the highlighted fields before continuing.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateBeforeAction() || !designId) return;
    setStage1Saving(true);
    try {
      const response = await fetch(`/api/ecr-pre-pilot/designs/${designId}/stage-1`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Stage 1 input data could not be saved.");
      setForm((current) => hydrateSavedStage1(current, payload));
      setSaveState("saved");
      toast({
        title: "Stage 1 saved",
        description: "The complete owner-controlled input snapshot is now the authority for Predictive N_T.",
      });
    } catch (error: unknown) {
      setSaveState("unsaved");
      toast({
        title: "Stage 1 could not be saved",
        description: error instanceof Error ? error.message : "The Stage 1 snapshot was not persisted.",
        variant: "destructive",
      });
    } finally {
      setStage1Saving(false);
    }
  };

  const handleRunPredictiveNt = async () => {
    if (!validateBeforeAction() || !designId || !predictiveBasis) return;
    if (saveState !== "saved") {
      toast({
        title: "Save Stage 1 before running",
        description: "Predictive N_T can run only from the persisted Stage 1 snapshot.",
        variant: "destructive",
      });
      return;
    }
    const sat = predictiveBasis.molecularRegistry.saturates.find(({ identity }) => identity === form.satIdentity);
    const mono = predictiveBasis.molecularRegistry.monoAromatics.find(({ identity }) => identity === form.monoIdentity);
    if (!sat || !mono) {
      toast({ title: "Molecular basis unavailable", description: "Select admitted SAT and MONO identities.", variant: "destructive" });
      return;
    }
    setPredictiveSubmitting(true);
    setPredictiveJob(null);
    setPredictivePollingPaused(false);
    setPredictivePollingError(null);
    try {
      const response = await fetch(`/api/ecr-pre-pilot/designs/${designId}/predictive-nt/jobs`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Predictive N_T job could not be submitted.");
      setPredictiveJob({
        id: String(payload.jobId),
        status: payload.status,
        input: { ntTest: Number(form.maximumStages) },
        progress: { completedStageTrials: 0, maximumStages: 1 },
        modelHash: predictiveBasis.model.modelHash,
        engineHash: "",
        result: null,
        report: {
          available: false,
          filename: null,
          sha256: null,
          generatedAt: null,
          downloadUrl: null,
        },
        error: null,
      });
      toast({ title: "Predictive N_T queued", description: "Stage trials will update here while the isolated solver runs." });
    } catch (error: unknown) {
      toast({
        title: "Predictive N_T could not start",
        description: error instanceof Error ? error.message : "The job could not be submitted.",
        variant: "destructive",
      });
    } finally {
      setPredictiveSubmitting(false);
    }
  };

  const handleStopPredictiveNt = async () => {
    if (!designId || !predictiveJob || !["pending", "running"].includes(predictiveJob.status)) return;
    setPredictiveStopping(true);
    try {
      const response = await fetch(
        `/api/ecr-pre-pilot/designs/${designId}/predictive-nt/jobs/${predictiveJob.id}/stop`,
        { method: "POST", credentials: "include" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Predictive N_T solver could not be stopped.");
      setPredictiveJob(payload as PredictiveNtJob);
      setPredictivePollingPaused(false);
      setPredictivePollingError(null);
      toast({
        title: "Predictive N_T stop requested",
        description: "The job is terminal and cannot restart. Its owning worker will terminate the solver process immediately.",
      });
    } catch (error: unknown) {
      toast({
        title: "Predictive N_T solver could not be stopped",
        description: error instanceof Error ? error.message : "The stop request failed.",
        variant: "destructive",
      });
    } finally {
      setPredictiveStopping(false);
    }
  };

  return (
    <Layout>
      <main className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-50 p-2.5">
              <FlaskConical className="h-6 w-6 text-blue-600" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">ECR Pre-Pilot Design</h1>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                  {isThermodynamicsStage ? "Stage 2 · Thermodynamics" : "Stage 1 · Inputs"}
                </span>
              </div>
              <p className="mt-0.5 max-w-2xl text-xs leading-5 text-slate-500">
                {isThermodynamicsStage
                  ? `Predictive N_T thermodynamic evaluation from the latest server-saved Stage 1 snapshot${form.projectReference ? ` · ${form.projectReference}` : ""}.`
                  : "Greenfield process and feed characterization for an ECR pre-pilot design basis. Enter only values supported by your project data."}
              </p>
            </div>
          </div>
          {!isThermodynamicsStage && saveState !== "unsaved" && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              {saveState === "saved" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              )}
              {saveState === "saved" ? "Input data captured" : "Draft captured — composition incomplete"}
            </div>
          )}
        </header>

        <div className="space-y-3">
          {isThermodynamicsStage && projectNumberLoading && (
            <div className="flex items-center justify-center rounded-md border border-slate-200 py-16 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading saved Stage 1 snapshot…
            </div>
          )}
          {isThermodynamicsStage && projectNumberLoadError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {projectNumberLoadError}
            </div>
          )}
          {!isThermodynamicsStage && (
          <>
          <Card className={`overflow-hidden shadow-sm ${SECTION_TONES.blue.card}`}>
            <SectionHeading
              number="1"
              title="Project / Design Basis"
              description="Define the project reference and the operating basis for this input case."
              tone="blue"
              expanded={expandedSection === 1}
              summary={`${form.projectReference || "Project pending"} · ${form.rrboGrade || "RRBO grade pending"} · ${form.operatingTemperatureC || "—"} °C · ${sectionHasIssues("projectReference", "rrboGrade", "designFeedRateLph", "operatingTemperatureC", "operatingPressure", "phaseConfiguration", "satIdentity", "monoIdentity", "maximumStages") ? "Needs review" : "Valid"}`}
              onToggle={() => setExpandedSection((current) => current === 1 ? null : 1)}
            />
            <CardContent id="stage1-section-1" hidden={expandedSection !== 1} className="grid gap-3.5 px-4 py-3.5 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="project-reference" className={`text-[13px] font-medium ${validationErrors.projectReference ? "text-red-700" : "text-slate-700"}`}>
                  Project Number <span className="text-red-600">*</span>{" "}
                  <span className="font-normal text-slate-400">(generated automatically)</span>
                </Label>
                <Input
                  id="project-reference"
                  required
                  readOnly
                  value={form.projectReference}
                  placeholder={projectNumberLoading ? "Generating project number…" : "Project number unavailable"}
                  aria-invalid={Boolean(validationErrors.projectReference || projectNumberLoadError)}
                  aria-required="true"
                  aria-describedby={validationErrors.projectReference || projectNumberLoadError ? "project-reference-error" : undefined}
                  className={`h-8 bg-slate-50 text-sm ${validationErrors.projectReference || projectNumberLoadError ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                />
                {projectNumberLoadError ? (
                  <p id="project-reference-error" className="text-[11px] font-medium text-red-600">
                    {projectNumberLoadError}
                  </p>
                ) : validationErrors.projectReference ? (
                  <p id="project-reference-error" className="text-[11px] font-medium text-red-600">
                    {validationErrors.projectReference}
                  </p>
                ) : (
                  <p className="text-[11px] leading-4 text-slate-400">
                    {projectNumberLoading ? "Allocating a permanent project number…" : "Server-generated and read-only."}
                  </p>
                )}
              </div>
              <SelectField
                id="rrbo-grade"
                label="RRBO grade"
                value={form.rrboGrade}
                onChange={handleRrboGradeChange}
                placeholder="Select RRBO grade"
                options={[
                  { value: "SN150", label: "SN150" },
                  { value: "SN300", label: "SN300" },
                  { value: "SN500", label: "SN500" },
                ]}
                error={validationErrors.rrboGrade}
              />
              <SelectField
                id="design-feed-rate"
                label="Design feed rate"
                value={form.designFeedRateLph}
                onChange={(value) => setField("designFeedRateLph", value)}
                placeholder="Select design feed rate"
                options={FEED_RATE_OPTIONS}
                unit="LPH"
                required
                error={validationErrors.designFeedRateLph}
              />
              <SelectField
                id="operating-temperature"
                label="Operating temperature"
                value={form.operatingTemperatureC}
                onChange={handleOperatingTemperatureChange}
                placeholder="Select operating temperature"
                options={TEMPERATURE_OPTIONS}
                unit="°C"
                error={validationErrors.operatingTemperatureC}
              />
              <SelectField
                id="operating-pressure"
                label="Operating pressure"
                value={form.operatingPressure}
                onChange={(value) => setField("operatingPressure", value)}
                placeholder="Select operating pressure"
                options={PRESSURE_OPTIONS}
                error={validationErrors.operatingPressure}
              />
              <SelectField
                id="phase-configuration"
                label="Phase configuration"
                value={form.phaseConfiguration}
                onChange={(value) => setField("phaseConfiguration", value)}
                placeholder="Select phase configuration"
                options={PHASE_OPTIONS}
                error={validationErrors.phaseConfiguration}
              />
              <div className="md:col-span-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                <p className="text-[12px] font-semibold text-blue-900">Predictive molecular component basis</p>
                <p className="mb-3 mt-0.5 text-[11px] leading-4 text-blue-800">
                  Select the admitted SAT and MONO representatives. DI, POLY, PA, NMP, and H₂O identities are fixed by the active seven-component predictive model contract.
                </p>
                {predictiveBasisError ? (
                  <p className="text-[11px] font-medium text-red-600">{predictiveBasisError}</p>
                ) : predictiveBasis ? (
                    <div className="space-y-3.5">
                      <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-blue-900">Seven-component molecular basis</p>
                        <button
                          type="button"
                          onClick={() => setMolecularDetailsOpen((open) => !open)}
                          aria-expanded={molecularDetailsOpen}
                          aria-controls="molecular-basis-details"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 underline underline-offset-2"
                        >
                          View details <ChevronDown className={`h-3.5 w-3.5 transition-transform ${molecularDetailsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                        </button>
                        <div id="molecular-basis-details" hidden={!molecularDetailsOpen} className="overflow-x-auto rounded-md border border-blue-200 bg-white">
                        <table className="w-full min-w-[680px] text-left text-[11px]">
                          <thead className="bg-blue-100/70 text-blue-950">
                            <tr>
                              <th className="px-3 py-2 font-semibold">Component</th>
                              <th className="px-3 py-2 font-semibold">Molecular representative</th>
                              <th className="px-3 py-2 font-semibold">Molecular weight</th>
                              <th className="px-3 py-2 font-semibold">Authority</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-blue-100 text-slate-700">
                            {[
                              ["SAT", form.satIdentity, predictiveBasis.molecularRegistry.saturates, validationErrors.satIdentity],
                              ["MONO", form.monoIdentity, predictiveBasis.molecularRegistry.monoAromatics, validationErrors.monoIdentity],
                            ].map(([family, selectedIdentity, options, error]) => {
                              const identities = options as MolecularIdentity[];
                              const selected = identities.find(({ identity }) => identity === selectedIdentity);
                              return (
                                <tr key={String(family)}>
                                  <td className="px-3 py-2 font-semibold text-slate-900">{family}</td>
                                  <td className="px-3 py-2">
                                    <select
                                      aria-label={`${family} representative`}
                                      value={String(selectedIdentity)}
                                      onChange={(event) => setField(family === "SAT" ? "satIdentity" : "monoIdentity", event.target.value)}
                                      className={`h-8 w-full rounded-md border bg-white px-2 text-xs shadow-sm outline-none focus:ring-2 focus:ring-blue-400 ${error ? "border-red-400" : "border-slate-200"}`}
                                    >
                                      <option value="">Select admitted identity</option>
                                      {identities.map((item) => (
                                        <option key={item.identity} value={item.identity}>{item.label}</option>
                                      ))}
                                    </select>
                                    {error && <p className="mt-1 font-medium text-red-600">{String(error)}</p>}
                                  </td>
                                  <td className="px-3 py-2 tabular-nums">
                                    {selected ? `${selected.molecularWeightGmol.toFixed(3)} g/mol` : "—"}
                                  </td>
                                  <td className="px-3 py-2">Stage 1 selection</td>
                                </tr>
                              );
                            })}
                            {[
                              ["DI", predictiveBasis.molecularRegistry.diAromatics.label, predictiveBasis.molecularRegistry.diAromatics.molecularWeightGmol, "Frozen model surrogate"],
                              ["POLY", predictiveBasis.molecularRegistry.polyAromatics.label, predictiveBasis.molecularRegistry.polyAromatics.molecularWeightGmol, "Frozen model surrogate"],
                              ["PA", predictiveBasis.molecularRegistry.polarAromatics.representative.commonName, predictiveBasis.molecularRegistry.polarAromatics.representative.molecularWeightGmol, "Frozen model representative"],
                              ["NMP", predictiveBasis.molecularRegistry.nmp.label, predictiveBasis.molecularRegistry.nmp.molecularWeightGmol, "Fixed solvent"],
                              ["H₂O", predictiveBasis.molecularRegistry.water?.label ?? "Water", predictiveBasis.molecularRegistry.water?.molecularWeightGmol ?? 18.01528, "Fixed co-solvent"],
                            ].map(([family, representative, molecularWeight, authority]) => (
                              <tr key={String(family)}>
                                <td className="px-3 py-2 font-semibold text-slate-900">{family}</td>
                                <td className="px-3 py-2">{representative}</td>
                                <td className="px-3 py-2 tabular-nums">
                                  {typeof molecularWeight === "number" ? `${molecularWeight.toFixed(3)} g/mol` : "—"}
                                </td>
                                <td className="px-3 py-2">{authority}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-blue-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading admitted molecular identities…
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <SelectField
                  id="maximum-stages"
                  label="Theoretical stage count to test"
                  value={form.maximumStages}
                  onChange={(value) => setField("maximumStages", value)}
                  placeholder="Select exact N_T"
                  options={MAXIMUM_STAGE_OPTIONS}
                  required
                  error={validationErrors.maximumStages}
                />
                <p className="text-[11px] leading-4 text-slate-500">
                  Authoritative Stage 1 value. The predictive engine solves exactly this theoretical-stage count; it does not search from 1 through N_T.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={`overflow-hidden shadow-sm ${SECTION_TONES.emerald.card}`}>
            <SectionHeading
              number="2"
              title="RRBO Feed Composition"
              description="Preliminary screening defaults — user editable. Replace them with project-specific feed data when available."
              tone="emerald"
              expanded={expandedSection === 2}
              summary={`Total ${compositionStatus.populatedCount ? `${compositionStatus.total.toFixed(2)} wt%` : "not entered"} · ${compositionStatus.valid ? "Valid" : "Needs review"}`}
              onToggle={() => setExpandedSection((current) => current === 2 ? null : 2)}
            />
            <CardContent id="stage1-section-2" hidden={expandedSection !== 2} className="px-4 py-3.5">
              <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {COMPOSITION_FIELDS.map(({ key, label }) => (
                  <NumericField
                    key={key}
                    id={key}
                    label={label}
                    value={form[key]}
                    onChange={(value) => setField(key, value)}
                    unit="wt%"
                    max="100"
                    error={validationErrors[key]}
                  />
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-4 text-slate-400">
                Fresh RRBO screening basis: NMP in feed is 0.0 wt%. This gives 13.0 wt% conventional aromatics and 15.0 wt% aromatics including polar aromatics.
                Adjust the NMP value if the feed is recycled or contains residual NMP.
              </p>
              <div
                className={`mt-4 flex flex-col gap-2.5 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
                  compositionStatus.valid
                    ? "border-emerald-200 bg-emerald-50"
                    : compositionStatus.populatedCount === 0
                      ? "border-slate-200 bg-slate-50"
                      : compositionStatus.complete
                        ? "border-red-200 bg-red-50"
                        : "border-amber-200 bg-amber-50"
                }`}
                aria-live="polite"
              >
                <div className="flex items-start gap-2">
                  {compositionStatus.valid ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  ) : compositionStatus.populatedCount === 0 ? (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  )}
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800">Composition validation</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                      {validationErrors.compositionTotal
                        ? validationErrors.compositionTotal
                        : compositionStatus.valid
                        ? "Valid — all six components total exactly 100 wt%."
                        : compositionStatus.populatedCount === 0
                          ? "Enter the six component values to validate the total."
                          : !compositionStatus.complete
                            ? `${compositionStatus.populatedCount} of 6 components entered. Complete all fields to validate 100 wt%.`
                            : "Adjust the entered values so the total is exactly 100 wt%."}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Total</p>
                  <p className="text-lg font-semibold tabular-nums text-slate-900">
                    {compositionStatus.populatedCount === 0 ? "—" : `${compositionStatus.total.toFixed(2)} wt%`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`overflow-hidden shadow-sm ${SECTION_TONES.indigo.card}`}>
            <SectionHeading
              number="3"
              title="RRBO Feed Physical Properties"
              description="The selected RRBO grade and authoritative operating temperature determine these Stage-1 values."
              tone="indigo"
              expanded={expandedSection === 3}
              summary={`${form.rrboDensityKgM3 || "—"} kg/m³ · ${form.rrboDynamicViscosityCp || "—"} cP · ${sectionHasIssues("rrboDensityKgM3", "rrboDynamicViscosityCp", "rrboInterfacialTensionMnM") ? "Needs review" : "Valid"}`}
              onToggle={() => setExpandedSection((current) => current === 3 ? null : 3)}
            />
            <CardContent id="stage1-section-3" hidden={expandedSection !== 3} className="grid gap-3.5 px-4 py-3.5 md:grid-cols-3">
              <NumericField
                id="rrbo-density"
                label="Density"
                value={form.rrboDensityKgM3}
                onChange={(value) => setField("rrboDensityKgM3", value)}
                unit="kg/m³"
                error={validationErrors.rrboDensityKgM3}
                readOnly
              />
              <NumericField
                id="rrbo-dynamic-viscosity"
                label="Dynamic viscosity"
                value={form.rrboDynamicViscosityCp}
                onChange={(value) => setField("rrboDynamicViscosityCp", value)}
                unit="mPa·s (cP)"
                error={validationErrors.rrboDynamicViscosityCp}
                readOnly
              />
              <NumericField
                id="rrbo-interfacial-tension"
                label="Interfacial tension with NMP"
                value={form.rrboInterfacialTensionMnM}
                onChange={(value) => setField("rrboInterfacialTensionMnM", value)}
                unit="mN/m"
                error={validationErrors.rrboInterfacialTensionMnM}
                readOnly
              />
              <p className="text-[11px] leading-4 text-slate-400 md:col-span-3">
                Auto-populated screening basis: grade-specific density and viscosity plus preliminary RRBO/NMP interfacial tension at the selected operating temperature (25–100 °C).
                The 80–100 °C extension is preliminary. These values are recalculated whenever the operating temperature changes.
              </p>
            </CardContent>
          </Card>

          <Card className={`overflow-hidden shadow-sm ${SECTION_TONES.cyan.card}`}>
            <SectionHeading
              number="4"
              title="NMP Solvent"
              description="NMP temperature follows the authoritative operating temperature; solvent properties update automatically."
              tone="cyan"
              expanded={expandedSection === 4}
              summary={`${form.nmpPurityWt || "—"} wt% purity · ${form.nmpWaterWt || "—"} wt% water · ${sectionHasIssues("nmpPurityWt", "nmpWaterWt", "nmpDensityKgM3", "nmpDynamicViscosityCp") ? "Needs review" : "Valid"}`}
              onToggle={() => setExpandedSection((current) => current === 4 ? null : 4)}
            />
            <CardContent id="stage1-section-4" hidden={expandedSection !== 4} className="grid gap-3.5 px-4 py-3.5 md:grid-cols-2 xl:grid-cols-3">
              <SelectField
                id="nmp-purity"
                label="NMP purity"
                value={form.nmpPurityWt}
                onChange={setNmpPurity}
                placeholder="Select NMP purity"
                options={NMP_PURITY_OPTIONS}
                unit="wt%"
                error={validationErrors.nmpPurityWt}
              />
              <SelectField
                id="nmp-water"
                label="Water in NMP"
                value={form.nmpWaterWt}
                onChange={setNmpWater}
                placeholder="Select water content"
                options={NMP_WATER_OPTIONS}
                unit="wt%"
                error={validationErrors.nmpWaterWt}
              />
              <NumericField
                id="nmp-temperature"
                label="NMP temperature (operating condition)"
                value={form.operatingTemperatureC}
                onChange={() => undefined}
                unit="°C"
                min="25"
                max="100"
                hint={`${(Number(form.operatingTemperatureC) + 273.15).toFixed(2)} K · controlled by Operating Temperature`}
                readOnly
              />
              <NumericField
                id="nmp-density"
                label="NMP density"
                value={form.nmpDensityKgM3}
                onChange={(value) => setField("nmpDensityKgM3", value)}
                unit="kg/m³"
                error={validationErrors.nmpDensityKgM3}
                readOnly
              />
              <NumericField
                id="nmp-dynamic-viscosity"
                label="NMP dynamic viscosity"
                value={form.nmpDynamicViscosityCp}
                onChange={(value) => setField("nmpDynamicViscosityCp", value)}
                unit="mPa·s (cP)"
                error={validationErrors.nmpDynamicViscosityCp}
                readOnly
              />
              <p className="text-[11px] leading-4 text-slate-400 md:col-span-3">
                Auto-populated basis: NMP purity 99.5 wt% and water 0.05 wt% with temperature-dependent density and viscosity from 25–100 °C.
                The 80–100 °C extension is preliminary. Density and viscosity are recalculated from the operating temperature.
              </p>
            </CardContent>
          </Card>

          <Card className={`overflow-hidden shadow-sm ${SECTION_TONES.violet.card}`}>
            <SectionHeading
              number="5"
              title="Extraction Process Targets"
              description="Define the product-quality and recovery targets that will govern later design stages."
              tone="violet"
              expanded={expandedSection === 5}
              summary={`S/O ${form.solventOilRatio || "—"} · S ${form.targetRaffinateSulfurPpm || "—"} ppm · Recovery ${form.minimumRecoveryPct || "—"}% · ${sectionHasIssues("solventOilRatio", "targetRaffinateSulfurPpm", "minimumRaffinateSaturatesWt", "targetRaffinateTotalAromaticsWt", "targetRaffinatePolarAromaticsWt", "minimumRecoveryPct", "maximumNmpRaffinateWt") ? "Needs review" : "Valid"}`}
              onToggle={() => setExpandedSection((current) => current === 5 ? null : 5)}
            />
            <CardContent id="stage1-section-5" hidden={expandedSection !== 5} className="grid gap-3.5 px-4 py-3.5 md:grid-cols-2 xl:grid-cols-3">
              <SelectField
                id="solvent-oil-ratio"
                label="Solvent / Oil ratio"
                value={form.solventOilRatio}
                onChange={(value) => setField("solventOilRatio", value)}
                placeholder="Select solvent / oil ratio"
                options={SOLVENT_OIL_RATIO_OPTIONS}
                unit="kg/kg"
                error={validationErrors.solventOilRatio}
              />
              <SelectField
                id="target-raffinate-sulfur"
                label="Target raffinate sulfur"
                value={form.targetRaffinateSulfurPpm}
                onChange={(value) => setField("targetRaffinateSulfurPpm", value)}
                placeholder="Select sulfur target"
                options={TARGET_RAFFINATE_SULFUR_OPTIONS}
                unit="ppm"
                required
                error={validationErrors.targetRaffinateSulfurPpm}
              />
              <SelectField
                id="minimum-raffinate-saturates"
                label="Minimum raffinate saturates"
                value={form.minimumRaffinateSaturatesWt}
                onChange={(value) => setField("minimumRaffinateSaturatesWt", value)}
                placeholder="Select minimum saturates"
                options={MINIMUM_RAFFINATE_SATURATES_OPTIONS}
                unit="wt% (HC basis)"
                required
                error={validationErrors.minimumRaffinateSaturatesWt}
              />
              <SelectField
                id="target-total-aromatics"
                label="Target raffinate total aromatics"
                value={form.targetRaffinateTotalAromaticsWt}
                onChange={(value) => setField("targetRaffinateTotalAromaticsWt", value)}
                placeholder="Select total aromatics target"
                options={TARGET_TOTAL_AROMATICS_OPTIONS}
                unit="wt% (HC basis)"
                error={validationErrors.targetRaffinateTotalAromaticsWt}
              />
              <SelectField
                id="target-polar-aromatics"
                label="Target raffinate polar aromatics"
                value={form.targetRaffinatePolarAromaticsWt}
                onChange={(value) => setField("targetRaffinatePolarAromaticsWt", value)}
                placeholder="Select polar aromatics target"
                options={TARGET_POLAR_AROMATICS_OPTIONS}
                unit="wt% (HC basis)"
                error={validationErrors.targetRaffinatePolarAromaticsWt}
              />
              <SelectField
                id="minimum-recovery"
                label="Minimum NMP-free RRBO recovery"
                value={form.minimumRecoveryPct}
                onChange={(value) => setField("minimumRecoveryPct", value)}
                placeholder="Select minimum recovery"
                options={MINIMUM_RECOVERY_OPTIONS}
                unit="%"
                error={validationErrors.minimumRecoveryPct}
              />
              <SelectField
                id="maximum-nmp-raffinate"
                label="Maximum allowable NMP in raffinate"
                value={form.maximumNmpRaffinateWt}
                onChange={(value) => setField("maximumNmpRaffinateWt", value)}
                placeholder="Select maximum NMP"
                options={MAXIMUM_NMP_RAFFINATE_OPTIONS}
                unit="wt%"
                error={validationErrors.maximumNmpRaffinateWt}
              />
            </CardContent>
          </Card>

          <Card className={`overflow-hidden shadow-sm ${SECTION_TONES.amber.card}`}>
            <SectionHeading
              number="6"
              title="Feed Sulfur"
              description="Allocate total feed sulfur across the user-entered Stage-1 RRBO composition on a 100 kg feed basis."
              tone="amber"
              expanded={expandedSection === 6}
              summary={`${form.feedSulfurPpm || "—"} ppm · Allocation ${sulfurDistribution.populatedCount ? `${sulfurDistribution.totalAllocationPct.toFixed(2)}%` : "not entered"} · ${sulfurDistribution.valid && !sectionHasIssues("feedSulfurPpm", "sulfurAllocationSatPct", "sulfurAllocationMonoPct", "sulfurAllocationDiPct", "sulfurAllocationPolyPct", "sulfurAllocationPaPct", "sulfurAllocationTotal") ? "Valid" : "Needs review"}`}
              onToggle={() => setExpandedSection((current) => current === 6 ? null : 6)}
            />
            <CardContent id="stage1-section-6" hidden={expandedSection !== 6} className="px-4 py-3.5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                  <p className="text-[13px] leading-5 text-amber-900">
                    <span className="font-semibold">Literature-informed pre-pilot assumption:</span>{" "}
                    SAT / MONO / DI / POLY / PA = 0 / 5 / 25 / 35 / 35% of total feed sulfur. These starting values are user-editable and are saved with Stage 1.
                  </p>
                </div>
              </div>
              <div className="mt-3.5 max-w-md">
                <NumericField
                  id="feed-sulfur"
                  label="Feed sulfur"
                  value={form.feedSulfurPpm}
                  onChange={(value) => setField("feedSulfurPpm", value)}
                  unit="ppm"
                  min="0"
                  placeholder="Enter feed sulfur"
                  required
                  error={validationErrors.feedSulfurPpm}
                />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-5">
                {SULFUR_ALLOCATION_FIELDS.map(({ key, label }) => (
                  <NumericField
                    key={key}
                    id={key}
                    label={`${label} sulfur allocation`}
                    value={form[key]}
                    onChange={(value) => setField(key, value)}
                    unit="%"
                    min="0"
                    max="100"
                    required
                    error={validationErrors[key]}
                  />
                ))}
              </div>
              <div
                className={`mt-4 flex items-center justify-between rounded-lg border p-3 ${
                  sulfurDistribution.valid ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
                }`}
                aria-live="polite"
              >
                <div className="flex items-start gap-2">
                  {sulfurDistribution.valid
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" aria-hidden="true" />
                    : <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" aria-hidden="true" />}
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800">Sulfur allocation validation</p>
                    <p className="text-[11px] text-slate-600">
                      {sulfurDistribution.valid
                        ? "Valid — the five sulfur shares total exactly 100%."
                        : validationErrors.sulfurAllocationTotal
                          ?? "Calculation is blocked until all five sulfur shares total exactly 100%."}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Total</p>
                  <p className="text-lg font-semibold tabular-nums text-slate-900">
                    {sulfurDistribution.populatedCount === 0 ? "—" : `${sulfurDistribution.totalAllocationPct.toFixed(4)}%`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSulfurDetailsOpen((open) => !open)}
                aria-expanded={sulfurDetailsOpen}
                aria-controls="sulfur-details"
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 underline underline-offset-2"
              >
                View details <ChevronDown className={`h-3.5 w-3.5 transition-transform ${sulfurDetailsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              <div id="sulfur-details" hidden={!sulfurDetailsOpen} className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Component</th>
                      <th className="px-3 py-2 text-right font-semibold">Feed mass, kg/100 kg</th>
                      <th className="px-3 py-2 text-right font-semibold">Share of total sulfur, %</th>
                      <th className="px-3 py-2 text-right font-semibold">Sulfur mass, kg/100 kg RRBO</th>
                      <th className="px-3 py-2 text-right font-semibold">Sulfur in component, wt%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {sulfurDistribution.rows.map((row) => (
                      <tr key={row.key}>
                        <td className="px-3 py-2 font-semibold text-slate-700">{row.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {row.feedComponentKg === null ? "—" : row.feedComponentKg.toFixed(4)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {row.allocationPct === null ? "—" : row.allocationPct.toFixed(4)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {sulfurDistribution.valid && row.sulfurMassKg !== null ? row.sulfurMassKg.toFixed(6) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {sulfurDistribution.valid && row.componentSulfurWt !== null ? row.componentSulfurWt.toFixed(6) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-slate-50 font-semibold text-slate-700">
                    <tr>
                      <td className="px-3 py-2" colSpan={2}>Total feed sulfur</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {sulfurDistribution.valid ? `${sulfurDistribution.totalAllocationPct.toFixed(4)}%` : "Blocked"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {sulfurDistribution.valid && sulfurDistribution.totalSulfurMassKg !== null
                          ? sulfurDistribution.totalSulfurMassKg.toFixed(6)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-3 text-[11px] leading-4 text-slate-500">
                Component feed mass is taken directly from the Stage-1 SAT / MONO / DI / POLY / PA feed wt%. No RRBO composition or component sulfur concentration is fixed in the calculation.
              </p>
            </CardContent>
          </Card>
          </>
          )}

          {isThermodynamicsStage && !projectNumberLoading && !projectNumberLoadError && (
          <Card className="overflow-hidden border-slate-300 shadow-sm">
            <CardHeader className="border-b bg-slate-50 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-[15px]">Stage 2 · Predictive N_T thermodynamics</CardTitle>
                  <CardDescription className="mt-0.5 text-[11px]">
                    Runs the governed SAT/MONO/DI/POLY/PA/NMP/H₂O thermodynamic cascade from the saved Stage 1 authority.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={handleRunPredictiveNt}
                    disabled={predictiveSubmitting || !predictiveBasis || !designId || saveState !== "saved" || predictiveJob?.status === "pending" || predictiveJob?.status === "running"}
                    title={saveState === "saved" ? undefined : "Save the authoritative Stage 1 snapshot before running."}
                    className="h-8 gap-1.5 px-3 text-xs"
                  >
                    {predictiveSubmitting || predictiveJob?.status === "pending" || predictiveJob?.status === "running" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Run Predictive N_T
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleStopPredictiveNt}
                    disabled={predictiveStopping || !predictiveJob || !["pending", "running"].includes(predictiveJob.status)}
                    className="h-8 gap-1.5 px-3 text-xs"
                  >
                    {predictiveStopping ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Square className="h-3.5 w-3.5" />
                    )}
                    Stop Solver
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-4 py-4">
              <div className={`rounded-md border p-3 text-[11px] leading-5 ${
                saveState === "saved"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : "border-amber-300 bg-amber-50 text-amber-950"
              }`}>
                <p className="font-semibold">
                  Stage 1 authority: {saveState === "saved" ? "SAVED" : "UNSAVED / STALE"}
                </p>
                <p>
                  The server derives the complete molecular solver request from the saved owner-controlled Stage 1 snapshot.
                  Browser-calculated fractions are not accepted by the job endpoint.
                </p>
                <p className="mt-1 font-semibold">
                  Sulfur prediction: NOT_CALCULABLE · CALIBRATION_REQUIRED
                </p>
                <p>
                  The sulfur basis is retained in Stage 1 for audit only and is never passed into the frozen Python thermodynamic solver.
                </p>
              </div>
              {Number(form.polarAromaticsWt) > 0 && predictiveBasis && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-[11px] leading-5 text-blue-950">
                  <p className="font-semibold">PA included as the sixth thermodynamic family</p>
                  <p>
                    {predictiveBasis.molecularRegistry.polarAromatics.representative.commonName} (CAS{" "}
                    {predictiveBasis.molecularRegistry.polarAromatics.representative.cas},{" "}
                    {predictiveBasis.molecularRegistry.polarAromatics.representative.formula},{" "}
                    {predictiveBasis.molecularRegistry.polarAromatics.representative.molecularWeightGmol.toFixed(2)} g/mol)
                    is the bounded non-sulfur molecular anchor in the six-component COSMO-SAC profile basis.
                    Numerical results remain pre-pilot diagnostics and cannot establish release-ready N_T.
                  </p>
                  <p className="mt-1 font-semibold">PA transfer must never be interpreted as sulfur removal.</p>
                </div>
              )}
              {Number(form.nmpInFeedWt) > 0 && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-[11px] leading-5 text-blue-950">
                  <p className="font-semibold">Feed NMP retained independently</p>
                  <p>The saved RRBO-feed NMP fraction remains in the six-component feed vector; the fresh counter-current NMP inlet is modeled separately.</p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-md border bg-white p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Queue status</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{predictiveJob?.status ?? "Not submitted"}</p>
                </div>
                <div className="rounded-md border bg-white p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Trials attempted</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                    {predictiveJob ? `${predictiveJob.result?.trialsAttempted ?? predictiveJob.progress.completedStageTrials} / ${predictiveJob.progress.maximumStages}` : "—"}
                  </p>
                </div>
                <div className="rounded-md border bg-white p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Governed trials accepted</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                    {predictiveJob?.result ? `${predictiveJob.result.governedTrialsAccepted ?? 0} / ${predictiveJob.progress.maximumStages}` : "—"}
                  </p>
                </div>
                <div className="rounded-md border bg-white p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Established theoretical stages</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">—</p>
                </div>
              </div>
              {predictiveJob && ["pending", "running"].includes(predictiveJob.status) && (
                <div aria-live="polite">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${Math.min(100, (predictiveJob.progress.completedStageTrials / predictiveJob.progress.maximumStages) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {predictiveJob.status === "pending" ? "Waiting for an available solver worker…" : "Evaluating every configured stage trial…"}
                  </p>
                </div>
              )}
              {predictivePollingPaused && predictiveJob && (
                <div className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] text-red-800">
                    Monitoring paused: {predictivePollingError ?? "The latest job status could not be loaded."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setPredictivePollingError(null);
                      setPredictivePollingPaused(false);
                    }}
                  >
                    Resume monitoring
                  </Button>
                </div>
              )}
              {predictiveJob?.error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">
                  <strong>Job failed:</strong> {predictiveJob.error}
                </div>
              )}
              {predictiveJob?.status === "completed" && predictiveJob.report?.available && predictiveJob.report.downloadUrl && (
                <div className="flex flex-col gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[11px] leading-5 text-emerald-950">
                    <p className="font-semibold">Complete run report ready</p>
                    <p>The frozen-snapshot engineering report was generated automatically with this execution.</p>
                    <p className="break-all font-mono text-[10px] text-emerald-800">SHA-256: {predictiveJob.report.sha256}</p>
                  </div>
                  <Button asChild type="button" className="h-8 shrink-0 gap-1.5 px-3 text-xs">
                    <a href={predictiveJob.report.downloadUrl} download={predictiveJob.report.filename ?? undefined}>
                      <Download className="h-3.5 w-3.5" />
                      Download complete PDF
                    </a>
                  </Button>
                </div>
              )}
              {predictiveJob?.result && (
                <>
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">
                    N_T Tested: {predictiveJob.input?.ntTest ?? predictiveJob.result.trials?.[0]?.stageCount ?? "—"}
                  </div>
                  {predictiveJob.result.executionStatus === "BLOCKED_NO_LIQUID_SPLIT" && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[12px] leading-5 text-amber-950">
                      <p className="font-semibold">Predictive N_T blocked — no liquid split predicted</p>
                      <p>{predictiveJob.result.blockingMessage}</p>
                      <p>
                        Cascade trial: <strong>{predictiveJob.result.blockedCascadeTrialCount}</strong>
                        {" · "}Physical stage from feed end: <strong>{predictiveJob.result.blockedStageFromFeedEnd}</strong>
                        {Number.isFinite(predictiveJob.result.thermodynamicCondition?.temperatureC)
                          ? <>{" · "}Temperature: <strong>{predictiveJob.result.thermodynamicCondition?.temperatureC} °C</strong></>
                          : null}
                      </p>
                      <p>This is a thermodynamic no-split result, not a software failure. No raffinate/extract phases were fabricated.</p>
                    </div>
                  )}
                  {predictiveJob.result.executionStatus === "BLOCKED_PHASE_TOPOLOGY_UNRESOLVED" && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[12px] leading-5 text-amber-950">
                      <p className="font-semibold">Predictive N_T blocked — phase topology unresolved</p>
                      <p>{predictiveJob.result.blockingMessage}</p>
                      <p>
                        Cascade trial: <strong>{predictiveJob.result.blockedCascadeTrialCount}</strong>
                        {" · "}Physical stage from feed end: <strong>{predictiveJob.result.blockedStageFromFeedEnd}</strong>
                        {Number.isFinite(predictiveJob.result.thermodynamicCondition?.temperatureC)
                          ? <>{" · "}Temperature: <strong>{predictiveJob.result.thermodynamicCondition?.temperatureC} °C</strong></>
                          : null}
                      </p>
                      <p>This is a completed scientific hold, not a software failure. No raffinate/extract phases were fabricated.</p>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-blue-700">Predictive N_T</p>
                      <p className="mt-1 text-2xl font-semibold text-blue-950">{predictiveJob.result.predictiveNt ?? "Not reached"}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Result status</p>
                      <p className="mt-1 break-words text-xs font-semibold text-slate-900">{predictiveJob.result.status}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Sequence check</p>
                      <p className="mt-1 text-xs font-semibold text-slate-900">{predictiveJob.result.monotonicSequence ? "PASS" : "FAIL"}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Runtime verification</p>
                      <p className="mt-1 text-xs font-semibold text-slate-900">{predictiveJob.result.model?.runtimeVerification ?? "—"}</p>
                    </div>
                  </div>
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[11px] leading-5 text-amber-950">
                    <p className="font-semibold">Predictive-only limitations</p>
                    <p>Calibration required: {predictiveJob.result.calibrationRequired ? "Yes" : "No"} · Pilot validated: {predictiveJob.result.pilotValidated ? "Yes" : "No"} · Release eligible: {predictiveJob.result.releaseEligible ? "Yes" : "No"}</p>
                    <p>
                      {["7C-1.4.0", "7C-1.5.0"].includes(predictiveJob.result.engineContractVersion ?? "")
                        ? "The seven-component native-plus-RK model is the PRE-PILOT MULTISTAGE PREDICTIVE MODEL. N_T is assigned only from a fully accepted simultaneous counter-current trial and is never release-eligible."
                        : String(predictiveJob.result.engineContractVersion).startsWith("7C-")
                          ? "The historical seven-component cCOSMO production implementation includes H2O under its immutable qualification-pending contract."
                        : "This historical six-component COSMO-SAC result remains readable under its original diagnostic contract."}
                      {" "}Sulfur prediction remains NOT_CALCULABLE, and PA transfer must never be interpreted as sulfur removal.
                    </p>
                    {predictiveJob.result.wetSolventConstruction && (
                      <p>
                        Wet solvent: <strong>{predictiveJob.result.wetSolventConstruction.dryNmpMass ?? "—"} NMP + {predictiveJob.result.wetSolventConstruction.waterMass ?? "—"} H2O</strong>
                        {" · "}H2O {predictiveJob.result.wetSolventConstruction.waterWeightPercentOfWetSolvent ?? "—"} wt%
                        {" · "}closure {Number(predictiveJob.result.wetSolventConstruction.massClosureResidual ?? NaN).toExponential(3)}
                      </p>
                    )}
                    {predictiveJob.result.stage1TargetGovernance && (
                      <>
                        <p>
                          N_T numerical authority: <strong>{predictiveJob.result.stage1TargetGovernance.predictiveNtAuthority}</strong>
                        </p>
                        <p>
                          Minimum mass recovery target: <strong>{predictiveJob.result.stage1TargetGovernance.minimumMassRecovery?.targetPercent ?? "—"}%</strong>
                          {" · "}
                          <strong>{predictiveJob.result.stage1TargetGovernance.minimumMassRecovery?.status ?? "NOT_CALCULABLE"}</strong>
                        </p>
                        <p>
                          Overall ECR product acceptance: <strong>{predictiveJob.result.stage1TargetGovernance.overallEcrProductAcceptanceStatus}</strong>
                        </p>
                      </>
                    )}
                  </div>
                  {predictiveJob.result.globalStabilityQualification && (
                    <div className="rounded-md border border-red-300 bg-red-50 p-3 text-[11px] leading-5 text-red-950">
                      <p className="font-semibold">Frozen global TPD qualification</p>
                      <p>
                        Status: <strong>{predictiveJob.result.globalStabilityQualification.status ?? "NOT RECORDED"}</strong>
                        {" · "}
                        Evidence qualified: <strong>{predictiveJob.result.globalStabilityQualification.qualified ? "Yes" : "No"}</strong>
                      </p>
                      <p>
                        Exact phase coverage:{" "}
                        <strong>
                          {predictiveJob.result.globalStabilityQualification.coverage?.returnedPhaseEndpoints ?? "—"}
                          {" / "}
                          {predictiveJob.result.globalStabilityQualification.coverage?.expectedPhaseEndpoints ?? "—"}
                        </strong>
                        {" · "}
                        fully reproduced negative phases:{" "}
                        <strong>{predictiveJob.result.globalStabilityQualification.coverage?.failingPhaseCount ?? "—"}</strong>
                        {" · "}
                        negative or unresolved phases:{" "}
                        <strong>{predictiveJob.result.globalStabilityQualification.coverage?.negativeOrUnresolvedPhaseCount ?? "—"}</strong>
                        {" · "}
                        refinement failures:{" "}
                        <strong>{predictiveJob.result.globalStabilityQualification.coverage?.optimizerRefinementFailureCount ?? "—"}</strong>
                        {" · "}
                        worst TPD:{" "}
                        <strong className="font-mono">
                          {Number(predictiveJob.result.globalStabilityQualification.worstMinimum).toExponential(4)}
                        </strong>
                      </p>
                      <p>
                        Task 206 candidate:{" "}
                        <strong>
                          {predictiveJob.result.globalStabilityQualification.comparisonCandidate?.disposition ?? "NOT RECORDED"}
                        </strong>
                      </p>
                      <p>
                        Exact blockers:{" "}
                        <strong>
                          {predictiveJob.result.globalStabilityQualification.blockers?.join(" · ") || "None recorded"}
                        </strong>
                      </p>
                      <p className="break-all font-mono text-[10px]">
                        Evidence results SHA-256:{" "}
                        {predictiveJob.result.globalStabilityQualification.evidenceArtifacts?.resultsSha256 ?? "—"}
                      </p>
                    </div>
                  )}
                  {predictiveJob.result.task218CandidateGeneratedStability && (
                    <div className="rounded-md border border-red-300 bg-red-50 p-3 text-[11px] leading-5 text-red-950">
                      <p className="font-semibold">Task218 candidate-generated controlled-negative evidence</p>
                      <p>
                        Status: <strong>{predictiveJob.result.task218CandidateGeneratedStability.status ?? "NOT RECORDED"}</strong>
                        {" · "}qualification: <strong>{predictiveJob.result.task218CandidateGeneratedStability.qualified ? "Qualified" : "BLOCKED — controlled negative"}</strong>
                      </p>
                      <p>
                        Exact endpoint coverage: <strong>{predictiveJob.result.task218CandidateGeneratedStability.coverage?.returned ?? "—"} / {predictiveJob.result.task218CandidateGeneratedStability.coverage?.expected ?? "—"}</strong>
                        {" · "}{predictiveJob.result.task218CandidateGeneratedStability.endpointOrder ?? "endpoint order not recorded"}
                      </p>
                      <p>Blockers: <strong>{predictiveJob.result.task218CandidateGeneratedStability.blockers?.join(" · ") || "None recorded"}</strong></p>
                      <p className="break-all font-mono text-[10px]">
                        Candidate model / parameter: {predictiveJob.result.task218CandidateGeneratedStability.candidateModelSha256 ?? "—"} / {predictiveJob.result.task218CandidateGeneratedStability.candidateParameterSha256 ?? "—"}
                      </p>
                      <p className="break-all font-mono text-[10px]">
                        Flash / cascade / audit / qualification: {predictiveJob.result.task218CandidateGeneratedStability.candidateFlashHash ?? "—"} / {predictiveJob.result.task218CandidateGeneratedStability.cascadeExecutionHash ?? "—"} / {predictiveJob.result.task218CandidateGeneratedStability.auditHash ?? "—"} / {predictiveJob.result.task218CandidateGeneratedStability.qualificationHash ?? "—"}
                      </p>
                    </div>
                  )}
                  <div className="grid gap-2 text-[11px] md:grid-cols-2">
                    <div className="rounded-md border bg-slate-50 p-3">
                      <p className="font-semibold text-slate-700">Model hash</p>
                      <p className="mt-1 break-all font-mono text-[10px] text-slate-600">{predictiveJob.result.model?.modelHash ?? predictiveJob.modelHash}</p>
                    </div>
                    <div className="rounded-md border bg-slate-50 p-3">
                      <p className="font-semibold text-slate-700">Engine hash</p>
                      <p className="mt-1 break-all font-mono text-[10px] text-slate-600">{predictiveJob.result.engine?.engineHash ?? predictiveJob.engineHash}</p>
                      <p className="mt-1 text-slate-500">{predictiveJob.result.engine?.engineId} {predictiveJob.result.engine?.engineVersion}</p>
                    </div>
                  </div>
                  {predictiveJob.result.researchOnlyReplacementModel && (() => {
                    const candidate = predictiveJob.result.researchOnlyReplacementModel;
                    const candidateOrder = candidate.componentOrder;
                    const formatCandidate = (values: number[]) => candidateOrder
                      .map((family, index) => `${family}=${Number(values[index]).toExponential(4)}`)
                      .join(" · ");
                    return (
                      <div className="space-y-3 rounded-md border-2 border-red-400 bg-red-50 p-3 text-[11px] text-red-950">
                        <div>
                          <h3 className="text-sm font-semibold">Offline development calibration — not live-engine evidence</h3>
                          <p className="mt-1">
                            <strong>{candidate.status}</strong> · {candidate.artifactVersion} · used by active cascade:{" "}
                            <strong>{candidate.usedByActiveCascade ? "YES" : "NO"}</strong>
                          </p>
                          <p className="mt-2 rounded border border-red-400 bg-white p-2 font-semibold">
                            This panel does not prove that the live Predictive N_T engine restored the NMP/oil split.
                            The active trial remains authoritative: identical R/E compositions are a thermodynamic collapse,
                            and UNCLOSED residual status is a separate numerical closure failure.
                          </p>
                          <p className="mt-1">
                            The values below reproduce one offline development/calibration state only. They do not replace the
                            live job&apos;s persisted streams, targets, stage count, solver status, or acceptance state.
                          </p>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="rounded border border-red-200 bg-white p-2">
                            <p className="font-semibold">Model and exact parent state</p>
                            <p>{candidate.model.identity}</p>
                            <p>{candidate.model.totalScalarGibbs} · {candidate.model.parameterCount} parameters · {candidate.model.declaredPairCount} pairs</p>
                            <p>{candidate.parent.temperatureK.toFixed(2)} K · H2O={candidate.parent.waterWeightPercentOfWetSolvent.toFixed(2)} wt% of wet solvent</p>
                            <p className="mt-1 font-mono text-[10px]">Parent mole: {formatCandidate(candidate.parent.composition)}</p>
                            <p className="mt-1 font-mono text-[10px]">
                              Parent TPD toward R/E branches: {candidate.parent.raffinateDevelopmentBranchTpd.toExponential(4)}
                              {" / "}{candidate.parent.extractDevelopmentBranchTpd.toExponential(4)}
                            </p>
                          </div>
                          <div className="rounded border border-red-200 bg-white p-2">
                            <p className="font-semibold">Offline fitted two-phase calibration state</p>
                            <p>Raffinate fraction: <strong>{candidate.split.betaRaffinate.toFixed(6)}</strong> · Extract fraction: <strong>{candidate.split.betaExtract.toFixed(6)}</strong></p>
                            <p className="mt-1 font-mono text-[10px]">Oil-rich R mole: {formatCandidate(candidate.split.raffinateMoleFractions)}</p>
                            <p className="mt-1 font-mono text-[10px]">NMP-rich E mole: {formatCandidate(candidate.split.extractMoleFractions)}</p>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <p>Gibbs reduction: <strong className="font-mono">{candidate.split.gibbsReduction.toExponential(4)}</strong></p>
                          <p>Material closure: <strong className="font-mono">{candidate.split.materialClosureMaxResidual.toExponential(4)}</strong></p>
                          <p>Chemical-potential residual: <strong className="font-mono">{candidate.split.chemicalPotentialMaxResidual.toExponential(4)}</strong></p>
                          <p>Independent phase agreement: <strong className="font-mono">{candidate.split.maximumIndependentPhaseCompositionDifference.toExponential(4)}</strong></p>
                          <p>Post-split R TPD: <strong className="font-mono">{candidate.stability.raffinateTpdMinimum.toExponential(4)}</strong></p>
                          <p>Post-split E TPD: <strong className="font-mono">{candidate.stability.extractTpdMinimum.toExponential(4)}</strong></p>
                          <p>Former MONO-rich constrained minimum: <strong className="font-mono">{candidate.stability.formerMonoRichConstrainedMinimum.toExponential(4)}</strong></p>
                          <p>Global exclusion claimed: <strong>{candidate.stability.globalExclusionClaimed ? "YES" : "NO"}</strong></p>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <p>
                            Dry training fit: <strong>{candidate.evidenceFit.trainingStatus}</strong> · RMS{" "}
                            {candidate.evidenceFit.trainingChemicalPotentialEqualityRms.toFixed(6)} / {candidate.evidenceFit.ceiling.toFixed(2)}
                            {" "}· {candidate.evidenceFit.trainingRows} rows
                          </p>
                          <p>
                            Dry held-out fit: <strong>{candidate.evidenceFit.heldOutStatus}</strong> · RMS{" "}
                            {candidate.evidenceFit.heldOutChemicalPotentialEqualityRms.toFixed(6)} / {candidate.evidenceFit.ceiling.toFixed(2)}
                            {" "}· {candidate.evidenceFit.heldOutRows} rows
                          </p>
                        </div>
                        <p className="rounded border border-red-300 bg-red-50 p-2 text-red-900">
                          Evidence blockers: <strong>{candidate.releaseGate.blockers.join(" · ")}</strong>
                        </p>
                        <div className="space-y-1 break-all font-mono text-[10px]">
                          <p>Results SHA-256: {candidate.provenance.resultsSha256}</p>
                          <p>Model SHA-256: {candidate.provenance.modelSha256}</p>
                          <p>Protocol SHA-256: {candidate.provenance.protocolSha256}</p>
                          <p>Evidence SHA-256: {candidate.provenance.evidenceSha256}</p>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-900">All stage trials and diagnostics</h3>
                    {(predictiveJob.result.trials ?? []).map((trial) => {
                      const order = predictiveJob.result?.componentOrder ?? ["SAT", "MONO", "DI", "POLY", "PA", "NMP"];
                       const isSevenComponent = String(
                         predictiveJob.result?.engineContractVersion ?? "",
                       ).startsWith("7C-");
                      const formatVector = (values: number[] | undefined) =>
                        order.map((family, index) => `${family}=${Number(values?.[index] ?? 0).toExponential(4)}`).join(" · ");
                       const acceptanceBlockers = trial.acceptanceBlockers ?? [];
                       const freshSolvent = trial.boundaryStreams?.freshWetSolvent
                         ?? trial.boundaryStreams?.freshNmp;
                       const calculableTargets = Object.values(trial.targetCompliance ?? {})
                         .filter(({ status }) => status !== "NOT_CALCULABLE");
                      return (
                        <details key={trial.stageCount} className="rounded-md border bg-white" open={trial.numericalAcceptancePassed}>
                          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-800">
                            Trial {trial.stageCount}: {["7C-1.4.0", "7C-1.5.0"].includes(predictiveJob.result?.engineContractVersion ?? "") ? "PRE-PILOT MULTISTAGE PREDICTIVE MODEL" : String(predictiveJob.result?.engineContractVersion ?? "").startsWith("7C-") ? "IMPLEMENTED — PREDICTIVE QUALIFICATION PENDING" : "PRE-PILOT DIAGNOSTIC"} — NOT ACCEPTED · numerical gates {trial.numericalAcceptancePassed ? "PASS" : "FAIL"} · max balance residual {trial.maximumOverallComponentBalanceResidualMol.toExponential(3)}
                          </summary>
                          <div className="space-y-3 border-t px-3 py-3 text-[11px]">
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                              <p>Total aromatics: <strong>{Number(trial.productMetrics.raffinateTotalAromaticsWtNmpFree).toFixed(4)} wt%</strong></p>
                              <p>Polar aromatics: <strong>{Number(trial.productMetrics.raffinatePolarAromaticsWtNmpFree).toFixed(4)} wt%</strong></p>
                              <p>NMP-free recovery: <strong>{Number(trial.productMetrics.nmpFreeHydrocarbonRecoveryPct).toFixed(4)}%</strong></p>
                              <p>
                                All calculable targets:{" "}
                                <strong>
                                  {calculableTargets.length === 0
                                    ? "NOT CALCULABLE"
                                    : trial.allCalculableTargetsPass ? "PASS" : "FAIL"}
                                </strong>
                              </p>
                            </div>
                            {["7C-1.4.0", "7C-1.5.0"].includes(predictiveJob.result?.engineContractVersion ?? "") && (
                              <div className="rounded border border-violet-200 bg-violet-50 p-2 text-violet-950">
                                <p className="font-semibold">Governed sulfur post-processing</p>
                                {trial.sulfurPrediction?.status === "CALCULABLE" ? (
                                  <>
                                    <p className="mt-1">
                                      Predicted raffinate sulfur:{" "}
                                      <strong>{Number(trial.sulfurPrediction.predictedRaffinateSulfurPpm).toFixed(2)} ppm</strong>
                                      {" "}· sulfur removal:{" "}
                                      <strong>{Number(trial.sulfurPrediction.sulfurRemovalPct).toFixed(4)}%</strong>
                                      {" "}· target: <strong>{trial.sulfurPrediction.targetStatus}</strong>
                                    </p>
                                    <p className="mt-1 font-mono text-[10px]">
                                      Remaining contribution: {["SAT", "MONO", "DI", "POLY", "PA"].map((component) =>
                                        `${component}=${Number(trial.sulfurPrediction?.remainingContributionsPpm?.[component]).toFixed(2)} ppm`,
                                      ).join(" · ")}
                                    </p>
                                  </>
                                ) : (
                                  <p className="mt-1">
                                    NOT CALCULABLE — {trial.sulfurPrediction?.reason ?? "trial is not physically/numerically valid"}
                                  </p>
                                )}
                              </div>
                            )}
                            {isSevenComponent ? (
                              <p className="rounded border bg-slate-50 p-2">
                                <strong>Seven-component cascade solver</strong>: termination{" "}
                                <strong>{trial.solverTerminationStatus ?? "NOT RECORDED"}</strong>
                                {" "}· residual closure{" "}
                                <strong>{trial.residualClosureStatus ?? "NOT RECORDED"}</strong>
                                {" "}· residual{" "}
                                <strong className="font-mono">{trial.maximumScaledEquationResidual.toExponential(3)}</strong>
                              </p>
                            ) : (
                              <>
                                <div className="grid gap-2 md:grid-cols-2">
                                  {(["primary", "secondary"] as const).map((branch) => {
                                    const evidence = trial.multistartEvidence?.[branch];
                                    return (
                                      <p key={branch} className="rounded border bg-slate-50 p-2">
                                        <strong className="capitalize">{branch}</strong>: termination{" "}
                                        <strong>{evidence?.terminationStatus ?? (evidence?.solverSuccess ? "SUCCESS" : "NOT RECORDED")}</strong>
                                        {" "}· residual closure{" "}
                                        <strong>{evidence?.residualClosureStatus ?? "NOT RECORDED"}</strong>
                                        {" "}· residual{" "}
                                        <strong className="font-mono">
                                          {Number(evidence?.maximumScaledEquationResidual ?? trial.maximumScaledEquationResidual).toExponential(3)}
                                        </strong>
                                      </p>
                                    );
                                  })}
                                </div>
                                <p>
                                  Branch comparison:{" "}
                                  {trial.branchComparisonStatus === "NOT_EVALUABLE_ENDPOINT_UNCLOSED"
                                    || trial.multistartEvidence?.branchComparisonStatus === "NOT_EVALUABLE_ENDPOINT_UNCLOSED" ? (
                                      <strong>NOT EVALUABLE — ENDPOINT UNCLOSED</strong>
                                    ) : (
                                      <>
                                        <strong>EVALUATED</strong> · boundary-product difference{" "}
                                        <strong className="font-mono">
                                          {trial.multistartProductRelativeDifference == null
                                            ? "NOT RECORDED"
                                            : trial.multistartProductRelativeDifference.toExponential(3)}
                                        </strong>
                                      </>
                                    )}
                                </p>
                              </>
                            )}
                            {acceptanceBlockers.length > 0 && (
                              <p className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-950">
                                Blockers: {acceptanceBlockers.map(({ code }) => code ?? "UNSPECIFIED_GATE_FAILURE").join(" · ")}
                              </p>
                            )}
                            <div className="grid gap-2 md:grid-cols-2">
                              <div className="rounded border bg-slate-50 p-2">
                                <p className="font-semibold">
                                  Complete {String(predictiveJob.result.engineContractVersion).startsWith("7C-") ? "seven" : "six"}-component boundary streams
                                </p>
                                <p className="mt-1 font-mono text-[10px]">Oil feed: {formatVector(trial.boundaryStreams?.oilFeed?.componentMoles)}</p>
                                <p className="mt-1 font-mono text-[10px]">Fresh solvent: {formatVector(freshSolvent?.componentMoles)}</p>
                                <p className="mt-1 font-mono text-[10px]">Final raffinate: {formatVector(trial.boundaryStreams?.finalRaffinate?.componentMoles)}</p>
                                <p className="mt-1 font-mono text-[10px]">Final extract: {formatVector(trial.boundaryStreams?.finalExtract?.componentMoles)}</p>
                              </div>
                              <div className="rounded border bg-slate-50 p-2">
                                <p className="font-semibold">Overall component-balance residuals</p>
                                <p className="mt-1 font-mono text-[10px]">{formatVector(trial.overallComponentBalanceResidualMol)}</p>
                              </div>
                            </div>
                            <p>
                              Target checks: {Object.entries(trial.targetCompliance)
                                .map(([key, value]) => `${key}=${value.status ?? "UNKNOWN"}`).join(" · ")}
                            </p>
                            <p>
                              Component extraction diagnostics: {Object.entries(
                                (trial.productMetrics.componentExtractionPct as Record<string, number> | undefined) ?? {},
                              ).map(([family, value]) => `${family}=${value.toFixed(4)}%`).join(" · ") || "Not calculable"}
                            </p>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[760px] border-collapse text-left">
                                <thead><tr className="border-b bg-slate-50">
                                  <th className="p-2">Stage</th><th className="p-2">Local balance</th><th className="p-2">Isoactivity</th><th className="p-2">Stability / TPD</th><th className="p-2">Outlet compositions</th>
                                </tr></thead>
                                <tbody>{(trial.stages ?? []).map((stage) => (
                                  <tr key={stage.stageFromFeedEnd} className="border-b align-top last:border-0">
                                    <td className="p-2">{stage.stageFromFeedEnd}</td>
                                    <td className="p-2 font-mono">
                                      {stage.maximumComponentBalanceResidualMol.toExponential(3)} ·{" "}
                                      {stage.maximumComponentBalanceResidualMol <= 1e-8 ? "PASS" : "FAIL"}
                                    </td>
                                    <td className="p-2 font-mono">{stage.isoactivityLogResidual.toExponential(3)}</td>
                                    <td className="p-2 font-mono text-[10px]">
                                      R eig={Number(stage.localPostSplitStability.raffinate?.minimumEigenvalue).toExponential(3)} ·
                                      E eig={Number(stage.localPostSplitStability.extract?.minimumEigenvalue).toExponential(3)}<br />
                                      R TPD={Number(stage.postSplitTpdSearch.raffinate?.minimum).toExponential(3)} ·
                                      E TPD={Number(stage.postSplitTpdSearch.extract?.minimum).toExponential(3)}
                                    </td>
                                    <td className="p-2 font-mono text-[10px]">
                                      R mole: {formatVector(stage.raffinateLeaving.moleFractions)}<br />
                                      E mole: {formatVector(stage.extractLeaving.moleFractions)}
                                    </td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2.5 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-4 text-slate-500">
            {isThermodynamicsStage
              ? "Thermodynamic jobs use only the latest server-owned saved Stage 1 snapshot."
              : "Save the authoritative Stage 1 process basis before continuing to Stage 2 thermodynamics."}
          </p>
          <div className="flex flex-col-reverse gap-1.5 sm:flex-row">
            {isThermodynamicsStage ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/design-software/ecr-pre-pilot-design")}
                  className="h-8 gap-1.5 px-3 text-xs"
                >
                  Back to Stage 1
                </Button>
                <Button
                  type="button"
                  onClick={() => navigate("/design-software/ecr-pre-pilot-design/stage-3")}
                  disabled={!designId || projectNumberLoading || Boolean(projectNumberLoadError)}
                  title={projectNumberLoadError ? "A saved Stage 1 snapshot is required before continuing." : undefined}
                  className="h-8 gap-1.5 px-3 text-xs"
                >
                  Next: Stage 3 Hydrodynamics
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </>
            ) : (
            <>
            <Button
              type="button"
              variant="outline"
              onClick={handleSave}
              disabled={!designFeedRateIsValid || stage1Saving || !designId}
              title={designFeedRateIsValid ? undefined : "Select a design feed rate before saving."}
              className="h-8 gap-1.5 px-3 text-xs"
            >
              {stage1Saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {stage1Saving ? "Saving Stage 1…" : "Save Input Data"}
            </Button>
            <Button
              type="button"
              onClick={() => navigate("/design-software/ecr-pre-pilot-design/stage-2")}
              disabled={saveState !== "saved" || stage1Saving || !designId}
              title={saveState === "saved" ? undefined : "Save Stage 1 before continuing."}
              className="h-8 gap-1.5 px-3 text-xs"
            >
              Next: Stage 2 Thermodynamics
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            </>
            )}
          </div>
        </div>
      </main>
    </Layout>
  );
}

export default function EcrPrePilotDesignPage() {
  return <EcrPrePilotDesignWorkflowPage stage={1} />;
}