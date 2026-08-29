import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout";
import { AlertCircle, CheckCircle2, FlaskConical, Info, Loader2, Play, Save } from "lucide-react";
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
  nmpTemperatureC: string;
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
  maximumStages: number;
};
type ThermodynamicChecks = {
  independentFinalPhaseChecksPass?: boolean;
  [key: string]: unknown;
};
type PredictiveStage = {
  stageNumber: number;
  raffinateFlowMolarBasis: number;
  raffinateComposition: Record<string, number>;
  extractFlowMolarBasis: number;
  extractComposition: Record<string, number>;
  localComponentBalanceResiduals: Record<string, number>;
  localComponentBalanceMaximum: number;
  localComponentBalanceAccepted: boolean;
  thermodynamicChecks: ThermodynamicChecks;
};
type PredictiveTrial = {
  stageCount: number;
  sweeps: number;
  maximumConvergenceDelta: number;
  raffinateFlowMolarBasis: number;
  extractFlowMolarBasis: number;
  raffinateComposition: Record<string, number>;
  extractComposition: Record<string, number>;
  overallComponentBalanceResiduals: Record<string, number>;
  accepted: boolean;
  monotonicFromPrevious: boolean;
  balanceAccepted: boolean;
  overallComponentBalanceMaximum: number;
  raffinateMonoHydrocarbonMoleFraction: number;
  raffinateSaturatesHydrocarbonMoleFraction: number;
  nmpFreeHydrocarbonRecovery: number;
  targetChecks: Record<string, boolean>;
  stages: PredictiveStage[];
};
type PredictiveNtResult = {
  status: string;
  predictiveNt: number | null;
  establishedTheoreticalStages: null;
  calibrationRequired: boolean;
  pilotValidated: boolean;
  releaseEligible: boolean;
  monotonicSequence: boolean;
  model?: { modelHash?: string; runtimeVerification?: string };
  engine?: { engineId?: string; engineVersion?: string; engineHash?: string };
  stage1TargetGovernance?: {
    stage1SnapshotHash?: string;
    predictiveNtAuthority?: string;
    sulfurPrediction?: { status?: string; calibrationStatus?: string };
    minimumMassRecovery?: { targetPercent?: number; status?: string };
    overallEcrProductAcceptance?: boolean;
    overallEcrProductAcceptanceStatus?: string;
  };
  trials?: PredictiveTrial[];
};
type PredictiveNtJob = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: { completedStageTrials: number; maximumStages: number };
  modelHash: string;
  engineHash: string;
  result: PredictiveNtResult | null;
  error: string | null;
};

const DEFAULT_PHASE_CONFIGURATION = "nmp-continuous-rrbo-dispersed";
const DEFAULT_RRBO_GRADE = "SN300";
const DEFAULT_OPERATING_TEMPERATURE_C = "50";
const DEFAULT_OPERATING_PRESSURE = "2.0";
const MAXIMUM_STAGE_OPTIONS = Array.from({ length: 9 }, (_, index) => {
  const value = String(index + 2);
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
  nmpTemperatureC: "",
  nmpDensityKgM3: "",
  nmpDynamicViscosityCp: "",
  solventOilRatio: "0.90",
  targetRaffinateSulfurPpm: "1000",
  minimumRaffinateSaturatesWt: "90",
  targetRaffinateTotalAromaticsWt: "5.0",
  targetRaffinatePolarAromaticsWt: "0.50",
  minimumRecoveryPct: "95",
  maximumNmpRaffinateWt: "0.50",
  feedSulfurPpm: "3500",
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
  for (const key of Object.keys(EMPTY_FORM) as Array<keyof FormState>) {
    if (source[key] !== undefined && source[key] !== null) {
      next[key] = String(source[key]);
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
const TARGET_RAFFINATE_SULFUR_OPTIONS = ["750", "1000", "1500", "2000", "2500"];
const MINIMUM_RAFFINATE_SATURATES_OPTIONS = ["90", "92.5", "95", "97.5"];
const TARGET_TOTAL_AROMATICS_OPTIONS = ["2.0", "3.0", "4.0", "5.0", "7.5", "10.0"];
const TARGET_POLAR_AROMATICS_OPTIONS = ["0.10", "0.25", "0.50", "1.00", "2.00"];
const MINIMUM_RECOVERY_OPTIONS = ["90", "92.5", "95", "97.5", "99"];
const MAXIMUM_NMP_RAFFINATE_OPTIONS = ["0.10", "0.25", "0.50", "1.00"];

const NMP_STANDARD_PURPOSE = {
  purityWt: "99.5",
  waterWt: "0.05",
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

type ValidationErrors = Partial<Record<keyof FormState, string>> & {
  compositionTotal?: string;
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
  requiredOption("maximumStages", "maximum stage search", MAXIMUM_STAGE_OPTIONS);

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
  numeric("nmpPurityWt", "NMP purity", { min: 0, max: 100 });
  numeric("nmpWaterWt", "Water in NMP", { min: 0, max: 100 });
  numeric("nmpTemperatureC", "NMP temperature", { min: 25, max: 100 });
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
      temperatureC: "",
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
    waterWt: NMP_STANDARD_PURPOSE.waterWt,
    temperatureC: operatingTemperature,
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
}: {
  number: string;
  title: string;
  description: string;
  tone: keyof typeof SECTION_TONES;
}) {
  const styles = SECTION_TONES[tone];

  return (
    <CardHeader className={`border-b px-4 py-2.5 ${styles.header}`}>
      <div className="flex items-start gap-2.5">
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${styles.number}`}>
          {number}
        </div>
        <div>
          <CardTitle className="text-[15px] font-semibold text-slate-900">{title}</CardTitle>
          <CardDescription className="mt-0.5 text-[11px] leading-4 text-slate-500">{description}</CardDescription>
        </div>
      </div>
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

export default function EcrPrePilotDesignPage() {
  const { toast } = useToast();
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
      nmpTemperatureC: nmpProperties.temperatureC,
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
  const [predictivePollingPaused, setPredictivePollingPaused] = useState(false);
  const [predictivePollingError, setPredictivePollingError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const storageKey = "ecr-pre-pilot-allocation-key";
      const existingKey = window.sessionStorage.getItem(storageKey);
      const allocationKey = existingKey ?? window.crypto.randomUUID();
      if (!existingKey) {
        window.sessionStorage.setItem(storageKey, allocationKey);
      }
      fetch("/api/ecr-pre-pilot/designs", {
        method: "POST",
        headers: { "Idempotency-Key": allocationKey },
        credentials: "include",
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.message ?? "Project number could not be generated.");
          }
          if (cancelled) return;
          const hasSavedStage1 = Boolean(payload.inputData?.stage1);
          setForm((current) => hydrateSavedStage1(
            { ...current, projectReference: String(payload.projectNumber) },
            payload.inputData,
          ));
          setSaveState(hasSavedStage1 ? "saved" : "unsaved");
          setDesignId(Number(payload.id));
          setProjectNumberLoadError(null);
          setProjectNumberLoading(false);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setProjectNumberLoading(false);
          setProjectNumberLoadError(error instanceof Error ? error.message : "Project number could not be generated.");
        });
    } catch (error: unknown) {
      if (cancelled) return;
      setProjectNumberLoading(false);
      setProjectNumberLoadError(error instanceof Error ? error.message : "Project number could not be generated.");
    }

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!designId || !predictiveJob || predictivePollingPaused || !["pending", "running"].includes(predictiveJob.status)) return;
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
  }, [designId, predictiveJob?.id, predictiveJob?.status, predictivePollingPaused, toast]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    const nextForm = { ...form, [key]: value };
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
      nmpPurityWt: nmpProperties.purityWt,
      nmpWaterWt: nmpProperties.waterWt,
      nmpTemperatureC: nmpProperties.temperatureC,
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
    const unsupportedFeed = [
      ["Di-aromatics", Number(form.diAromaticsWt)],
      ["Poly-aromatics", Number(form.polyAromaticsWt)],
      ["Polar aromatics", Number(form.polarAromaticsWt)],
      ["NMP in feed", Number(form.nmpInFeedWt)],
    ].filter(([, value]) => value > 1e-12);
    if (unsupportedFeed.length > 0) {
      toast({
        title: "Predictive scope is SAT/MONO only",
        description: `Set ${unsupportedFeed.map(([label]) => label).join(", ")} to 0 wt% before running. These components cannot be discarded or folded into SAT/MONO.`,
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
        progress: { completedStageTrials: 0, maximumStages: Number(form.maximumStages) },
        modelHash: predictiveBasis.model.modelHash,
        engineHash: "",
        result: null,
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
                  Input data only
                </span>
              </div>
              <p className="mt-0.5 max-w-2xl text-xs leading-5 text-slate-500">
                Greenfield process and feed characterization for an ECR pre-pilot design basis.
                Enter only values supported by your project data.
              </p>
            </div>
          </div>
          {saveState !== "unsaved" && (
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
          <Card className={`overflow-hidden shadow-sm ${SECTION_TONES.blue.card}`}>
            <SectionHeading
              number="1"
              title="Project / Design Basis"
              description="Define the project reference and the operating basis for this input case."
              tone="blue"
            />
            <CardContent className="grid gap-3.5 px-4 py-3.5 md:grid-cols-2">
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
                <p className="text-[12px] font-semibold text-blue-900">Predictive SAT / MONO molecular basis</p>
                <p className="mb-3 mt-0.5 text-[11px] leading-4 text-blue-800">
                  Select one admitted registry identity for each representative hydrocarbon family. Only the frozen model registry is available.
                </p>
                {predictiveBasisError ? (
                  <p className="text-[11px] font-medium text-red-600">{predictiveBasisError}</p>
                ) : predictiveBasis ? (
                  <div className="grid gap-3.5 md:grid-cols-2">
                    <SelectField
                      id="sat-identity"
                      label="SAT representative"
                      value={form.satIdentity}
                      onChange={(value) => setField("satIdentity", value)}
                      placeholder="Select admitted SAT identity"
                      options={predictiveBasis.molecularRegistry.saturates.map((item) => ({
                        value: item.identity,
                        label: `${item.label} (${item.molecularWeightGmol.toFixed(2)} g/mol)`,
                      }))}
                      required
                      error={validationErrors.satIdentity}
                    />
                    <SelectField
                      id="mono-identity"
                      label="MONO representative"
                      value={form.monoIdentity}
                      onChange={(value) => setField("monoIdentity", value)}
                      placeholder="Select admitted MONO identity"
                      options={predictiveBasis.molecularRegistry.monoAromatics.map((item) => ({
                        value: item.identity,
                        label: `${item.label} (${item.molecularWeightGmol.toFixed(2)} g/mol)`,
                      }))}
                      required
                      error={validationErrors.monoIdentity}
                    />
                    <SelectField
                      id="maximum-stages"
                      label="Maximum stage count to search"
                      value={form.maximumStages}
                      onChange={(value) => setField("maximumStages", value)}
                      placeholder="Select N_max"
                      options={MAXIMUM_STAGE_OPTIONS}
                      required
                      error={validationErrors.maximumStages}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-blue-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading admitted molecular identities…
                  </div>
                )}
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="design-basis-notes" className="text-[13px] font-medium text-slate-700">
                  Design basis notes <span className="font-normal text-slate-400">(optional)</span>
                </Label>
                <Textarea
                  id="design-basis-notes"
                  value={form.designBasisNotes}
                  onChange={(event) => setField("designBasisNotes", event.target.value)}
                  placeholder="Add a project-specific note or source reference"
                  rows={1}
                  maxLength={2001}
                  aria-invalid={Boolean(validationErrors.designBasisNotes)}
                  aria-describedby={validationErrors.designBasisNotes ? "design-basis-notes-error" : undefined}
                  className={`min-h-8 resize-none bg-white text-sm ${validationErrors.designBasisNotes ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                />
                <p className="text-[10px] text-slate-400">{form.designBasisNotes.length}/2,000 characters</p>
                {validationErrors.designBasisNotes && (
                  <p id="design-basis-notes-error" className="text-[11px] font-medium text-red-600">
                    {validationErrors.designBasisNotes}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={`overflow-hidden shadow-sm ${SECTION_TONES.emerald.card}`}>
            <SectionHeading
              number="2"
              title="RRBO Feed Composition"
              description="Preliminary screening defaults — user editable. Replace them with project-specific feed data when available."
              tone="emerald"
            />
            <CardContent className="px-4 py-3.5">
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
              description="Select an RRBO grade and operating temperature above to populate these starting values; measured project data may override them."
              tone="indigo"
            />
            <CardContent className="grid gap-3.5 px-4 py-3.5 md:grid-cols-3">
              <NumericField
                id="rrbo-density"
                label="Density"
                value={form.rrboDensityKgM3}
                onChange={(value) => setField("rrboDensityKgM3", value)}
                unit="kg/m³"
                error={validationErrors.rrboDensityKgM3}
              />
              <NumericField
                id="rrbo-dynamic-viscosity"
                label="Dynamic viscosity"
                value={form.rrboDynamicViscosityCp}
                onChange={(value) => setField("rrboDynamicViscosityCp", value)}
                unit="mPa·s (cP)"
                error={validationErrors.rrboDynamicViscosityCp}
              />
              <NumericField
                id="rrbo-interfacial-tension"
                label="Interfacial tension with NMP"
                value={form.rrboInterfacialTensionMnM}
                onChange={(value) => setField("rrboInterfacialTensionMnM", value)}
                unit="mN/m"
                error={validationErrors.rrboInterfacialTensionMnM}
              />
              <p className="text-[11px] leading-4 text-slate-400 md:col-span-3">
                Auto-populated screening basis: grade-specific density and viscosity plus preliminary RRBO/NMP interfacial tension at the selected operating temperature (25–100 °C).
                The 80–100 °C extension is preliminary; all values are editable and should be replaced with measured project data when available.
              </p>
            </CardContent>
          </Card>

          <Card className={`overflow-hidden shadow-sm ${SECTION_TONES.cyan.card}`}>
            <SectionHeading
              number="4"
              title="NMP Solvent"
              description="Select the operating temperature above to populate the standard NMP solvent properties; all values remain editable."
              tone="cyan"
            />
            <CardContent className="grid gap-3.5 px-4 py-3.5 md:grid-cols-2 xl:grid-cols-3">
              <NumericField
                id="nmp-purity"
                label="NMP purity"
                value={form.nmpPurityWt}
                onChange={(value) => setField("nmpPurityWt", value)}
                unit="wt%"
                max="100"
                error={validationErrors.nmpPurityWt}
              />
              <NumericField
                id="nmp-water"
                label="Water in NMP"
                value={form.nmpWaterWt}
                onChange={(value) => setField("nmpWaterWt", value)}
                unit="wt%"
                max="100"
                error={validationErrors.nmpWaterWt}
              />
              <NumericField
                id="nmp-temperature"
                label="NMP temperature"
                value={form.nmpTemperatureC}
                onChange={(value) => setField("nmpTemperatureC", value)}
                unit="°C"
                min="25"
                max="100"
                error={validationErrors.nmpTemperatureC}
              />
              <NumericField
                id="nmp-density"
                label="NMP density"
                value={form.nmpDensityKgM3}
                onChange={(value) => setField("nmpDensityKgM3", value)}
                unit="kg/m³"
                error={validationErrors.nmpDensityKgM3}
              />
              <NumericField
                id="nmp-dynamic-viscosity"
                label="NMP dynamic viscosity"
                value={form.nmpDynamicViscosityCp}
                onChange={(value) => setField("nmpDynamicViscosityCp", value)}
                unit="mPa·s (cP)"
                error={validationErrors.nmpDynamicViscosityCp}
              />
              <p className="text-[11px] leading-4 text-slate-400 md:col-span-3">
                Auto-populated basis: NMP purity 99.5 wt% and water 0.05 wt% with temperature-dependent density and viscosity from 25–100 °C.
                The 80–100 °C extension is preliminary; all values remain editable for manual project data.
              </p>
            </CardContent>
          </Card>

          <Card className={`overflow-hidden shadow-sm ${SECTION_TONES.violet.card}`}>
            <SectionHeading
              number="5"
              title="Extraction Process Targets"
              description="Define the product-quality and recovery targets that will govern later design stages."
              tone="violet"
            />
            <CardContent className="grid gap-3.5 px-4 py-3.5 md:grid-cols-2 xl:grid-cols-3">
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
              description="Provide the feed sulfur basis used to evaluate the primary raffinate sulfur target."
              tone="amber"
            />
            <CardContent className="px-4 py-3.5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                  <p className="text-[13px] leading-5 text-amber-900">
                    Feed sulfur is a required process input. Raffinate sulfur is a primary extraction target and must be predicted from the sulfur-bearing Polar Aromatics transfer model.
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
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-300 shadow-sm">
            <CardHeader className="border-b bg-slate-50 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-[15px]">Predictive N_T screening</CardTitle>
                  <CardDescription className="mt-0.5 text-[11px]">
                    Runs the frozen SAT/MONO/DI/POLY/NMP solver. Positive PA feed remains fail-closed. Results cannot write to established theoretical stages.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  onClick={handleRunPredictiveNt}
                  disabled={predictiveSubmitting || !predictiveBasis || !designId || saveState !== "saved" || Number(form.polarAromaticsWt) > 0 || Number(form.nmpInFeedWt) > 0 || predictiveJob?.status === "pending" || predictiveJob?.status === "running"}
                  title={Number(form.polarAromaticsWt) > 0
                    ? "POLAR_AROMATICS_THERMODYNAMIC_CLOSURE_UNAVAILABLE"
                    : Number(form.nmpInFeedWt) > 0
                      ? "NMP in the RRBO feed is not supported."
                      : saveState === "saved"
                        ? undefined
                        : "Save the authoritative Stage 1 snapshot before running."}
                  className="h-8 gap-1.5 px-3 text-xs"
                >
                  {predictiveSubmitting || predictiveJob?.status === "pending" || predictiveJob?.status === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Run Predictive N_T
                </Button>
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
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[11px] leading-5 text-amber-950">
                  <p className="font-semibold">PA identity admitted; thermodynamic closure unavailable</p>
                  <p>
                    {predictiveBasis.molecularRegistry.polarAromatics.representative.commonName} (CAS{" "}
                    {predictiveBasis.molecularRegistry.polarAromatics.representative.cas},{" "}
                    {predictiveBasis.molecularRegistry.polarAromatics.representative.formula},{" "}
                    {predictiveBasis.molecularRegistry.polarAromatics.representative.molecularWeightGmol.toFixed(2)} g/mol)
                    is the bounded non-sulfur molecular anchor. The exact PA profile and interaction closure are unavailable, so
                    six-component N_T and full-basis RRBO recovery are NOT_CALCULABLE. PA is never used to infer sulfur removal.
                  </p>
                  <p className="mt-1 font-mono text-[10px]">{predictiveBasis.molecularRegistry.polarAromatics.blocker}</p>
                </div>
              )}
              {Number(form.nmpInFeedWt) > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[11px] leading-5 text-amber-950">
                  <p className="font-semibold">NMP in RRBO feed is outside the solver scope</p>
                  <p>The solvent inlet is modeled independently; feed NMP is not silently combined with it.</p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border bg-white p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Queue status</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{predictiveJob?.status ?? "Not submitted"}</p>
                </div>
                <div className="rounded-md border bg-white p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Stage trials</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                    {predictiveJob ? `${predictiveJob.progress.completedStageTrials} / ${predictiveJob.progress.maximumStages}` : "—"}
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
              {predictiveJob?.result && (
                <>
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
                    <p>DI/POLY remain unavailable. Sulfur prediction is NOT_CALCULABLE / CALIBRATION_REQUIRED. This screening result does not populate established theoretical stages.</p>
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
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-900">All stage trials and diagnostics</h3>
                    {(predictiveJob.result.trials ?? []).map((trial) => (
                      <details key={trial.stageCount} className="rounded-md border bg-white" open={trial.accepted}>
                        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-800">
                          Trial {trial.stageCount}: {trial.accepted ? "ACCEPTED" : "NOT ACCEPTED"} · balance {trial.balanceAccepted ? "PASS" : "FAIL"} · max residual {trial.overallComponentBalanceMaximum.toExponential(3)}
                        </summary>
                        <div className="space-y-3 border-t px-3 py-3 text-[11px]">
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <p>Raffinate MONO: <strong>{(trial.raffinateMonoHydrocarbonMoleFraction * 100).toFixed(4)} mol%</strong></p>
                            <p>Raffinate SAT: <strong>{(trial.raffinateSaturatesHydrocarbonMoleFraction * 100).toFixed(4)} mol%</strong></p>
                            <p>NMP-free recovery: <strong>{(trial.nmpFreeHydrocarbonRecovery * 100).toFixed(4)}%</strong></p>
                            <p>Monotonic: <strong>{trial.monotonicFromPrevious ? "PASS" : "FAIL"}</strong></p>
                          </div>
                          <p>
                            Solver convergence: <strong>{trial.sweeps} sweeps</strong> · maximum delta{" "}
                            <strong className="font-mono">{trial.maximumConvergenceDelta.toExponential(3)}</strong> ·
                            raffinate flow <strong>{trial.raffinateFlowMolarBasis.toFixed(6)}</strong> ·
                            extract flow <strong>{trial.extractFlowMolarBasis.toFixed(6)}</strong>
                          </p>
                          <div className="grid gap-2 md:grid-cols-2">
                            <div className="rounded border bg-slate-50 p-2">
                              <p className="font-semibold">Outlet phase compositions</p>
                              <p className="mt-1 font-mono text-[10px]">
                                Raffinate: {Object.entries(trial.raffinateComposition).map(([key, value]) => `${key}=${value.toExponential(5)}`).join(" · ")}
                              </p>
                              <p className="mt-1 font-mono text-[10px]">
                                Extract: {Object.entries(trial.extractComposition).map(([key, value]) => `${key}=${value.toExponential(5)}`).join(" · ")}
                              </p>
                            </div>
                            <div className="rounded border bg-slate-50 p-2">
                              <p className="font-semibold">Overall component-balance residuals</p>
                              <p className="mt-1 font-mono text-[10px]">
                                {Object.entries(trial.overallComponentBalanceResiduals).map(([key, value]) => `${key}=${value.toExponential(5)}`).join(" · ")}
                              </p>
                            </div>
                          </div>
                          <p>Target checks: {Object.entries(trial.targetChecks).map(([key, value]) => `${key}=${value ? "PASS" : "FAIL"}`).join(" · ")}</p>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[680px] border-collapse text-left">
                              <thead><tr className="border-b bg-slate-50">
                                <th className="p-2">Stage</th><th className="p-2">Local balance max</th><th className="p-2">Balance</th><th className="p-2">Thermodynamic checks</th>
                              </tr></thead>
                              <tbody>{trial.stages.map((stage) => (
                                <tr key={stage.stageNumber} className="border-b last:border-0">
                                  <td className="p-2">{stage.stageNumber}</td>
                                  <td className="p-2 font-mono">{stage.localComponentBalanceMaximum.toExponential(3)}</td>
                                  <td className="p-2">{stage.localComponentBalanceAccepted ? "PASS" : "FAIL"}</td>
                                  <td className="p-2">
                                    <p className="font-mono text-[10px]">{Object.entries(stage.thermodynamicChecks).map(([key, value]) => `${key}=${String(value)}`).join(" · ")}</p>
                                    <p className="mt-1 font-mono text-[10px]">
                                      R flow={stage.raffinateFlowMolarBasis.toFixed(6)} · E flow={stage.extractFlowMolarBasis.toFixed(6)}
                                    </p>
                                    <p className="mt-1 font-mono text-[10px]">
                                      R: {Object.entries(stage.raffinateComposition).map(([key, value]) => `${key}=${value.toExponential(4)}`).join(" · ")}
                                    </p>
                                    <p className="mt-1 font-mono text-[10px]">
                                      E: {Object.entries(stage.extractComposition).map(([key, value]) => `${key}=${value.toExponential(4)}`).join(" · ")}
                                    </p>
                                    <p className="mt-1 font-mono text-[10px]">
                                      Residuals: {Object.entries(stage.localComponentBalanceResiduals).map(([key, value]) => `${key}=${value.toExponential(4)}`).join(" · ")}
                                    </p>
                                  </td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 flex flex-col gap-2.5 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-4 text-slate-500">
            Input data can be used for predictive SAT/MONO/NMP N_T screening only. Hydrodynamics, diameter, height, sulfur prediction, and governed-release calculations remain disabled.
          </p>
          <div className="flex flex-col-reverse gap-1.5 sm:flex-row">
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
          </div>
        </div>
      </main>
    </Layout>
  );
}