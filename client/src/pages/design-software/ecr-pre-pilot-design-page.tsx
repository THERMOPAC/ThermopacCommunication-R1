import { useMemo, useState } from "react";
import Layout from "@/components/layout";
import { AlertCircle, ArrowRight, CheckCircle2, FlaskConical, Info, Save } from "lucide-react";
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
  targetRaffinateTotalAromaticsWt: string;
  targetRaffinatePolarAromaticsWt: string;
  minimumRecoveryPct: string;
  maximumNmpRaffinateWt: string;
  feedSulfurPpm: string;
  designBasisNotes: string;
};

const EMPTY_FORM: FormState = {
  projectReference: "",
  rrboGrade: "",
  designFeedRateLph: "",
  operatingTemperatureC: "",
  operatingPressure: "",
  phaseConfiguration: "",
  saturatesWt: "",
  monoAromaticsWt: "",
  diAromaticsWt: "",
  polyAromaticsWt: "",
  polarAromaticsWt: "",
  nmpInFeedWt: "",
  rrboDensityKgM3: "",
  rrboDynamicViscosityCp: "",
  rrboInterfacialTensionMnM: "",
  nmpPurityWt: "",
  nmpWaterWt: "",
  nmpTemperatureC: "",
  nmpDensityKgM3: "",
  nmpDynamicViscosityCp: "",
  solventOilRatio: "",
  targetRaffinateTotalAromaticsWt: "",
  targetRaffinatePolarAromaticsWt: "",
  minimumRecoveryPct: "",
  maximumNmpRaffinateWt: "",
  feedSulfurPpm: "",
  designBasisNotes: "",
};

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
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
  min?: string;
  max?: string;
  step?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[13px] font-medium text-slate-700">
        {label}
      </Label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 bg-white text-sm"
        />
        <span className="shrink-0 text-[11px] font-medium text-slate-500">{unit}</span>
      </div>
      {hint && <p className="text-[11px] leading-4 text-slate-400">{hint}</p>}
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: Array<string | { value: string; label: string }>;
  unit?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[13px] font-medium text-slate-700">
        {label}
      </Label>
      <div className="flex items-center gap-1.5">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className="h-8 bg-white text-sm">
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
    </div>
  );
}

export default function EcrPrePilotDesignPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saveState, setSaveState] = useState<"unsaved" | "saved" | "draft">("unsaved");
  const [projectNumberError, setProjectNumberError] = useState(false);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveState("unsaved");
    if (key === "projectReference" && typeof value === "string" && value.trim() !== "") {
      setProjectNumberError(false);
    }
  };

  const handleRrboGradeChange = (grade: string) => {
    const properties = getStandardRrboProperties(grade, form.operatingTemperatureC);
    setForm((current) => ({
      ...current,
      rrboGrade: grade,
      rrboDensityKgM3: properties.densityKgM3,
      rrboDynamicViscosityCp: properties.dynamicViscosityCp,
      rrboInterfacialTensionMnM: properties.interfacialTensionMnM,
    }));
    setSaveState("unsaved");
  };

  const handleOperatingTemperatureChange = (operatingTemperature: string) => {
    const nmpProperties = getStandardNmpProperties(operatingTemperature);
    const rrboProperties = getStandardRrboProperties(form.rrboGrade, operatingTemperature);
    setForm((current) => ({
      ...current,
      operatingTemperatureC: operatingTemperature,
      rrboDensityKgM3: rrboProperties.densityKgM3,
      rrboDynamicViscosityCp: rrboProperties.dynamicViscosityCp,
      rrboInterfacialTensionMnM: rrboProperties.interfacialTensionMnM,
      nmpPurityWt: nmpProperties.purityWt,
      nmpWaterWt: nmpProperties.waterWt,
      nmpTemperatureC: nmpProperties.temperatureC,
      nmpDensityKgM3: nmpProperties.densityKgM3,
      nmpDynamicViscosityCp: nmpProperties.dynamicViscosityCp,
    }));
    setSaveState("unsaved");
  };

  const compositionStatus = useMemo(() => {
    const values = COMPOSITION_FIELDS.map(({ key }) => parseNumber(form[key]));
    const populatedCount = values.filter((value): value is number => value !== null).length;
    const total = values.reduce((sum, value) => sum + (value ?? 0), 0);
    const complete = populatedCount === COMPOSITION_FIELDS.length;
    const valid = complete && Math.abs(total - 100) < 0.005;

    return { populatedCount, total, complete, valid };
  }, [form]);

  const handleSave = () => {
    if (form.projectReference.trim() === "") {
      setProjectNumberError(true);
      toast({
        title: "Project number required",
        description: "Enter a project number before saving the input data.",
        variant: "destructive",
      });
      return;
    }

    const isCompleteComposition = compositionStatus.valid;
    setSaveState(isCompleteComposition ? "saved" : "draft");
    toast({
      title: isCompleteComposition ? "Input data saved" : "Draft input data saved",
      description: isCompleteComposition
        ? "The entered process and feed characterization was captured. No calculations were run."
        : "Complete the six-component composition so it totals exactly 100 wt% before continuing.",
    });
  };

  const handleContinue = () => {
    if (form.projectReference.trim() === "") {
      setProjectNumberError(true);
      toast({
        title: "Project number required",
        description: "Enter a project number before continuing.",
        variant: "destructive",
      });
      return;
    }

    if (!compositionStatus.valid) {
      toast({
        title: "Composition needs attention",
        description: "Enter all six feed components and make the total exactly 100 wt% before continuing.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Ready for the next step",
      description: "The next calculation stage is not enabled yet. No calculations were run.",
    });
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
                <Label htmlFor="project-reference" className={`text-[13px] font-medium ${projectNumberError ? "text-red-700" : "text-slate-700"}`}>
                  Project Number <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="project-reference"
                  required
                  value={form.projectReference}
                  onChange={(event) => setField("projectReference", event.target.value)}
                  onBlur={() => setProjectNumberError(form.projectReference.trim() === "")}
                  placeholder="Enter project number"
                  aria-invalid={projectNumberError}
                  aria-required="true"
                  className={`h-8 bg-white text-sm ${projectNumberError ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                />
                {projectNumberError && <p className="text-[11px] font-medium text-red-600">Project number is required.</p>}
              </div>
              <SelectField
                id="rrbo-grade"
                label="RRBO grade"
                value={form.rrboGrade}
                onChange={(value) => setField("rrboGrade", value)}
                placeholder="Select RRBO grade"
                options={[
                  { value: "SN150", label: "SN150" },
                  { value: "SN300", label: "SN300" },
                  { value: "SN500", label: "SN500" },
                ]}
              />
              <SelectField
                id="design-feed-rate"
                label="Design feed rate"
                value={form.designFeedRateLph}
                onChange={(value) => setField("designFeedRateLph", value)}
                placeholder="Select design feed rate"
                options={FEED_RATE_OPTIONS}
                unit="LPH"
              />
              <SelectField
                id="operating-temperature"
                label="Operating temperature"
                value={form.operatingTemperatureC}
                onChange={handleOperatingTemperatureChange}
                placeholder="Select operating temperature"
                options={TEMPERATURE_OPTIONS}
                unit="°C"
              />
              <SelectField
                id="operating-pressure"
                label="Operating pressure"
                value={form.operatingPressure}
                onChange={(value) => setField("operatingPressure", value)}
                placeholder="Select operating pressure"
                options={PRESSURE_OPTIONS}
              />
              <SelectField
                id="phase-configuration"
                label="Phase configuration"
                value={form.phaseConfiguration}
                onChange={(value) => setField("phaseConfiguration", value)}
                placeholder="Select phase configuration"
                options={PHASE_OPTIONS}
              />
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
                  className="min-h-8 resize-none bg-white text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Card className={`overflow-hidden shadow-sm ${SECTION_TONES.emerald.card}`}>
            <SectionHeading
              number="2"
              title="RRBO Feed Composition"
              description="Enter the six-component feed model. Leave unsupported values blank; do not substitute zero."
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
                  />
                ))}
              </div>
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
                      {compositionStatus.valid
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
              />
              <NumericField
                id="rrbo-dynamic-viscosity"
                label="Dynamic viscosity"
                value={form.rrboDynamicViscosityCp}
                onChange={(value) => setField("rrboDynamicViscosityCp", value)}
                unit="mPa·s (cP)"
              />
              <NumericField
                id="rrbo-interfacial-tension"
                label="Interfacial tension with NMP"
                value={form.rrboInterfacialTensionMnM}
                onChange={(value) => setField("rrboInterfacialTensionMnM", value)}
                unit="mN/m"
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
              />
              <NumericField
                id="nmp-water"
                label="Water in NMP"
                value={form.nmpWaterWt}
                onChange={(value) => setField("nmpWaterWt", value)}
                unit="wt%"
                max="100"
              />
              <NumericField
                id="nmp-temperature"
                label="NMP temperature"
                value={form.nmpTemperatureC}
                onChange={(value) => setField("nmpTemperatureC", value)}
                unit="°C"
              />
              <NumericField
                id="nmp-density"
                label="NMP density"
                value={form.nmpDensityKgM3}
                onChange={(value) => setField("nmpDensityKgM3", value)}
                unit="kg/m³"
              />
              <NumericField
                id="nmp-dynamic-viscosity"
                label="NMP dynamic viscosity"
                value={form.nmpDynamicViscosityCp}
                onChange={(value) => setField("nmpDynamicViscosityCp", value)}
                unit="mPa·s (cP)"
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
              <NumericField
                id="solvent-oil-ratio"
                label="Solvent / Oil ratio"
                value={form.solventOilRatio}
                onChange={(value) => setField("solventOilRatio", value)}
                unit="kg/kg"
              />
              <NumericField
                id="target-total-aromatics"
                label="Target raffinate total aromatics"
                value={form.targetRaffinateTotalAromaticsWt}
                onChange={(value) => setField("targetRaffinateTotalAromaticsWt", value)}
                unit="wt% (HC basis)"
                max="100"
              />
              <NumericField
                id="target-polar-aromatics"
                label="Target raffinate polar aromatics"
                value={form.targetRaffinatePolarAromaticsWt}
                onChange={(value) => setField("targetRaffinatePolarAromaticsWt", value)}
                unit="wt% (HC basis)"
                max="100"
              />
              <NumericField
                id="minimum-recovery"
                label="Minimum NMP-free RRBO recovery"
                value={form.minimumRecoveryPct}
                onChange={(value) => setField("minimumRecoveryPct", value)}
                unit="%"
                max="100"
              />
              <NumericField
                id="maximum-nmp-raffinate"
                label="Maximum allowable NMP in raffinate"
                value={form.maximumNmpRaffinateWt}
                onChange={(value) => setField("maximumNmpRaffinateWt", value)}
                unit="wt%"
                max="100"
              />
            </CardContent>
          </Card>

          <Card className={`overflow-hidden shadow-sm ${SECTION_TONES.amber.card}`}>
            <SectionHeading
              number="6"
              title="Optional Sulfur Input"
              description="Sulfur is captured separately and is not derived from the aromatic composition or any target."
              tone="amber"
            />
            <CardContent className="px-4 py-3.5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                  <p className="text-[13px] leading-5 text-amber-900">
                    Sulfur is an <strong>independent future model input</strong>. It must not be calculated from aromatic removal.
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
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 flex flex-col gap-2.5 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-4 text-slate-500">
            This page records input data only. Thermodynamics, NT, hydrodynamics, diameter, height, and optimizer calculations are not enabled.
          </p>
          <div className="flex flex-col-reverse gap-1.5 sm:flex-row">
            <Button type="button" variant="outline" onClick={handleSave} className="h-8 gap-1.5 px-3 text-xs">
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              Save Input Data
            </Button>
            <Button type="button" onClick={handleContinue} className="h-8 gap-1.5 px-3 text-xs">
              Continue
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </main>
    </Layout>
  );
}