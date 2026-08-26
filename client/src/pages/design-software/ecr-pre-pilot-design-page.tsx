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

const COMPOSITION_FIELDS = [
  { key: "saturatesWt", label: "Saturates" },
  { key: "monoAromaticsWt", label: "Mono-aromatics" },
  { key: "diAromaticsWt", label: "Di-aromatics" },
  { key: "polyAromaticsWt", label: "Poly-aromatics" },
  { key: "polarAromaticsWt", label: "Polar aromatics" },
  { key: "nmpInFeedWt", label: "NMP in feed" },
] as const;

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function SectionHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <CardHeader className="border-b bg-slate-50/80 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
          {number}
        </div>
        <div>
          <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
          <CardDescription className="mt-1 text-xs leading-5 text-slate-500">{description}</CardDescription>
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
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 bg-white"
        />
        <span className="shrink-0 text-xs font-medium text-slate-500">{unit}</span>
      </div>
      {hint && <p className="text-xs leading-4 text-slate-400">{hint}</p>}
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
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className="h-9 bg-white">
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
        {unit && <span className="shrink-0 text-xs font-medium text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

export default function EcrPrePilotDesignPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saveState, setSaveState] = useState<"unsaved" | "saved" | "draft">("unsaved");

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
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
    const isCompleteComposition = compositionStatus.valid;
    setSaveState(isCompleteComposition ? "saved" : "draft");
    toast({
      title: isCompleteComposition ? "Input data saved" : "Draft input data saved",
      description: isCompleteComposition
        ? "The entered process and feed characterization is ready for review. No calculations were run."
        : "Complete the six-component composition so it totals exactly 100 wt% before continuing.",
    });
  };

  const handleContinue = () => {
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
      <main className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-3">
              <FlaskConical className="h-7 w-7 text-blue-600" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">ECR Pre-Pilot Design</h1>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                  Input data only
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
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

        <div className="space-y-5">
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <SectionHeading
              number="1"
              title="Project / Design Basis"
              description="Define the project reference and the operating basis for this input case."
            />
            <CardContent className="grid gap-5 px-5 py-5 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="project-reference" className="text-sm font-medium text-slate-700">
                  Project name / reference
                </Label>
                <Input
                  id="project-reference"
                  value={form.projectReference}
                  onChange={(event) => setField("projectReference", event.target.value)}
                  placeholder="Enter project name or reference"
                  className="h-9 bg-white"
                />
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
                onChange={(value) => setField("operatingTemperatureC", value)}
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
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="design-basis-notes" className="text-sm font-medium text-slate-700">
                  Design basis notes <span className="font-normal text-slate-400">(optional)</span>
                </Label>
                <Textarea
                  id="design-basis-notes"
                  value={form.designBasisNotes}
                  onChange={(event) => setField("designBasisNotes", event.target.value)}
                  placeholder="Add a project-specific note or source reference"
                  rows={2}
                  className="resize-none bg-white"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <SectionHeading
              number="2"
              title="RRBO Feed Composition"
              description="Enter the six-component feed model. Leave unsupported values blank; do not substitute zero."
            />
            <CardContent className="px-5 py-5">
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
                className={`mt-6 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${
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
                <div className="flex items-start gap-2.5">
                  {compositionStatus.valid ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  ) : compositionStatus.populatedCount === 0 ? (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Composition validation</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-600">
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
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total</p>
                  <p className="text-xl font-semibold tabular-nums text-slate-900">
                    {compositionStatus.populatedCount === 0 ? "—" : `${compositionStatus.total.toFixed(2)} wt%`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <SectionHeading
              number="3"
              title="RRBO Feed Physical Properties"
              description="Enter measured or explicitly selected RRBO feed properties for the design basis."
            />
            <CardContent className="grid gap-5 px-5 py-5 md:grid-cols-3">
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
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <SectionHeading
              number="4"
              title="NMP Solvent"
              description="Capture the NMP solvent specification and the solvent temperature for this case."
            />
            <CardContent className="grid gap-5 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
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
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <SectionHeading
              number="5"
              title="Extraction Process Targets"
              description="Define the product-quality and recovery targets that will govern later design stages."
            />
            <CardContent className="grid gap-5 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
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

          <Card className="overflow-hidden border-amber-200 shadow-sm">
            <SectionHeading
              number="6"
              title="Optional Sulfur Input"
              description="Sulfur is captured separately and is not derived from the aromatic composition or any target."
            />
            <CardContent className="px-5 py-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-2.5">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                  <p className="text-sm leading-6 text-amber-900">
                    Sulfur is an <strong>independent future model input</strong>. It must not be calculated from aromatic removal.
                  </p>
                </div>
              </div>
              <div className="mt-5 max-w-md">
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

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-500">
            This page records input data only. Thermodynamics, NT, hydrodynamics, diameter, height, and optimizer calculations are not enabled.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={handleSave} className="gap-2">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Input Data
            </Button>
            <Button type="button" onClick={handleContinue} className="gap-2">
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </main>
    </Layout>
  );
}