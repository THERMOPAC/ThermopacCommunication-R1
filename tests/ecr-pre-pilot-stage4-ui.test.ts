import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type StateValue = unknown;

let stateValues: StateValue[] = [];
let stateIndex = 0;

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: vi.fn((initial: unknown) => {
      const value = stateIndex < stateValues.length ? stateValues[stateIndex] : initial;
      stateIndex += 1;
      return [value, vi.fn()];
    }),
  };
});

vi.mock("wouter", () => ({
  useLocation: () => ["/design-software/ecr-pre-pilot-design/stage-4", vi.fn()],
}));

vi.mock("@/components/layout", () => ({
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "layout" }, children),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    variant: _variant,
    className: _className,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) =>
    React.createElement("button", props, children),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("section", null, children),
  CardContent: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("lucide-react", () => {
  const Icon = () => React.createElement("span", { "aria-hidden": "true" });
  return {
    AlertTriangle: Icon,
    ArrowLeft: Icon,
    CheckCircle2: Icon,
    FlaskConical: Icon,
    Loader2: Icon,
    Play: Icon,
    RefreshCw: Icon,
    ShieldAlert: Icon,
    Square: Icon,
  };
});

import EcrPrePilotDesignStage4Page from "@/pages/design-software/ecr-pre-pilot-design-stage-4-page";

const design = { id: 47, projectNumber: "ECR-UI-47" };
const componentIds = [
  "water",
  "NMP",
  "saturates",
  "mono-aromatics",
  "di-aromatics",
  "poly-aromatics",
  "sulfur",
];

function jobBResponse() {
  return {
    result: {
      status: "PRE_PILOT_SIMULTANEOUS_TWO_FILM_FLUX_CALCULATED",
      frozenLocalHydraulics: {
        operatingHoldup: 0.16,
        d32M: 0.0012,
        interfacialAreaM2M3: 800,
        hydrodynamicsRecomputed: false,
      },
      dependencies: {
        stage1SnapshotHash: "stage-1-hash",
        stage2ResultHash: "stage-2-hash",
        stage3ImmutableHash: "stage-3-hash",
      },
      inputAudit: {
        x_bulk_continuous: [0.1, 0.2, 0.1, 0.1, 0.1, 0.3, 0.1],
        x_bulk_dispersed: [0.3, 0.1, 0.1, 0.1, 0.1, 0.2, 0.1],
        bulkContinuousProvenance: "STAGE_2_INLET_CONTINUOUS",
        bulkDispersedProvenance: "STAGE_2_INLET_DISPERSED",
        stage2Provenance: { stage: 2, trial: "trial-1", accepted: false },
        sourceStageCount: 1,
        requestedNT: 7,
        phi_d_operating: 0.16,
        d32_m: 0.0012,
        kc: componentIds.map(() => 0.0001),
        kd: componentIds.map(() => 0.0002),
        exactInterfaceEquilibriumRequest: true,
        holdupDefinesThermodynamicComposition: false,
      },
      rows: componentIds.map((componentId, index) => ({
        componentId,
        kcMS: 0.0001,
        kdMS: 0.0002,
        interfaceContinuousMoleFraction: 0.1 + index / 100,
        interfaceDispersedMoleFraction: 0.2 + index / 100,
        fluxMolM2S: index / 1000,
        volumetricTransferMolM3S: index / 100,
        continuousFilmResidualMolM2S: 0,
        dispersedFilmResidualMolM2S: 0,
      })),
      resultSha256: "job-b-result-hash",
      implementationSha256: "job-b-implementation-hash",
    },
  };
}

function jobCResponse() {
  return {
    status: "CALCULATED_PRELIMINARY_JOB_C",
    componentOrder: componentIds,
    preliminarySensitivityBasis: {
      axialDispersionContinuousM2S: { nominal: 0.01, minimum: 0.003, maximum: 0.03 },
      axialDispersionDispersedM2S: { nominal: 0.001, minimum: 0.0003, maximum: 0.003 },
      activeHeightSearchM: { minimum: 2, maximum: 20, use: "NUMERICAL_SEARCH_ONLY" },
    },
    theoreticalCompartmentAuthority: {
      compartments: 7,
      source: "VALIDATED_STAGE_2_NT",
      fallbackValue: 7,
      fallbackUsed: false,
    },
    workerResult: {
      status: "CALCULATED_PRELIMINARY_JOB_C",
      sensitivityCases: [{
        name: "NOMINAL",
        status: "CALCULATED_PRELIMINARY_SENSITIVITY",
        daxContinuousM2S: 0.01,
        daxDispersedM2S: 0.001,
        selected: {
          heightM: 2.4,
          cells: [{
            compartment: 1,
            continuousInMolS: componentIds.map((_, index) => 1 + index / 10),
            continuousOutMolS: componentIds.map((_, index) => 0.9 + index / 10),
            dispersedInMolS: componentIds.map((_, index) => 0.5 + index / 10),
            dispersedOutMolS: componentIds.map((_, index) => 0.6 + index / 10),
            transferContinuousToDispersedMolS: componentIds.map(() => 0.1),
            continuousResidualMolS: componentIds.map(() => 1e-12),
            dispersedResidualMolS: componentIds.map(() => 2e-12),
            localInterface: { maximumFilmFluxAbsoluteDisagreementMolM2S: 3e-12 },
          }],
          globalComponentBalanceResidualMolS: componentIds.map(() => 4e-12),
          residualDiagnostics: {
            maxContinuousCellResidualMolS: 1e-12,
            maxDispersedCellResidualMolS: 2e-12,
            maxGlobalComponentBalanceResidualMolS: 4e-12,
            minimumLocalComponentFlowMolS: 0.5,
            maximumInterfaceFluxDisagreementMolM2S: 3e-12,
            solverFunctionEvaluations: 18,
          },
        },
      }],
    },
  };
}

function renderWithStates(values: StateValue[]): string {
  stateValues = values;
  stateIndex = 0;
  return renderToStaticMarkup(React.createElement(EcrPrePilotDesignStage4Page));
}

function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

describe("ECR pre-pilot Stage 4 server-rendered UI regressions", () => {
  beforeEach(() => {
    stateValues = [];
    stateIndex = 0;
    vi.clearAllMocks();
  });

  it("renders a Job-B result when no Job-A evaluation exists", () => {
    const markup = renderWithStates([
      design,
      null,
      jobBResponse(),
      false,
      null,
      null,
      null,
    ]);
    const text = visibleText(markup);

    expect(text).toContain("No Job-A record loaded in this review");
    expect(text).toContain("Job B · bounded local coupling only");
    expect(text).toContain("Seven-component interfacial flux closure test");
    expect(text).toContain("PRE_PILOT_SIMULTANEOUS_TWO_FILM_FLUX_CALCULATED");
    expect(text).not.toContain("Coefficient matrix");
  });

  it("keeps the Job-A and Job-B running labels tied to their own active job", () => {
    const jobAMarkup = renderWithStates([
      design,
      null,
      null,
      false,
      "A",
      null,
      null,
    ]);
    const jobAText = visibleText(jobAMarkup);
    expect(jobAText).toContain("Evaluating Job-A…");
    expect(jobAText).toContain("Test Job-B flux");
    expect(jobAText).not.toContain("Evaluating Job-B…");

    const jobBMarkup = renderWithStates([
      design,
      null,
      null,
      false,
      "B",
      null,
      null,
    ]);
    const jobBText = visibleText(jobBMarkup);
    expect(jobBText).toContain("Evaluate Job-A");
    expect(jobBText).toContain("Evaluating Job-B…");
    expect(jobBText).not.toContain("Evaluating Job-A…");
  });

  it("renders a structured blocked-equilibrium diagnostic without a flux table", () => {
    const diagnostic = {
      adapterStatus: "INTERFACE_STATE_NOT_ACCEPTED",
      inputAudit: {
        x_bulk_continuous: [0.1, 0.2],
        x_bulk_dispersed: [0.3, 0.4],
        bulkContinuousProvenance: "STAGE_2_INLET_CONTINUOUS",
        bulkDispersedProvenance: "STAGE_2_INLET_DISPERSED",
        stage2Provenance: { stage: 2, trial: "rejected-trial", accepted: false },
        sourceStageCount: 1,
        requestedNT: 7,
        phi_d_operating: 0.16,
        d32_m: 0.0012,
        kc: [0.0001, 0.0001],
        kd: [0.0002, 0.0002],
        exactInterfaceEquilibriumRequest: true,
        holdupDefinesThermodynamicComposition: false,
      },
      interfaceDiagnostics: {
        accepted: false,
        reasonCode: "CHEMICAL_POTENTIAL_RESIDUAL_OUT_OF_BOUNDS",
      },
    };
    const markup = renderWithStates([
      design,
      null,
      null,
      false,
      null,
      "Pinned equilibrium failed its acceptance gate.",
      diagnostic,
    ]);
    const text = visibleText(markup);

    expect(text).toContain("Job-B interface state not accepted");
    expect(text).toContain("INTERFACE_STATE_NOT_ACCEPTED");
    expect(text).toContain("Interface and adapter diagnostics");
    expect(markup).toContain("CHEMICAL_POTENTIAL_RESIDUAL_OUT_OF_BOUNDS");
    expect(text).toContain("No interfacial fluxes are shown");
    expect(text).toContain("Exact Job-B state audit");
    expect(text).toContain("rejected Stage-2 outlets are not used");
    expect(text).not.toMatch(/single.?phase/i);
    expect(text).not.toContain("Seven-component interfacial flux closure test");
    expect(markup).not.toContain("<table");
  });

  it("uses a generic blocked diagnostic for a module failure", () => {
    const markup = renderWithStates([
      design,
      null,
      null,
      false,
      null,
      "Interface adapter module unavailable.",
      {
        adapterStatus: "MODULE_UNAVAILABLE",
        inputAudit: {
          sourceStageCount: 1,
          requestedNT: 7,
          holdupDefinesThermodynamicComposition: false,
        },
        interfaceDiagnostics: { accepted: false },
      },
    ]);
    const text = visibleText(markup);

    expect(text).toContain("Job-B calculation blocked");
    expect(text).toContain("A required Job-B module or dependency blocked the calculation.");
    expect(text).not.toContain("Job-B interface state not accepted");
    expect(text).not.toMatch(/single.?phase/i);
  });

  it("shows all seven Job-B component rows, dimensional units, and local-only scope", () => {
    const markup = renderWithStates([
      design,
      null,
      jobBResponse(),
      false,
      null,
      null,
      null,
    ]);
    const text = visibleText(markup);

    for (const componentId of componentIds) {
      expect(text).toContain(componentId);
    }
    expect((markup.match(/<tbody[^>]*>[\s\S]*?<\/tbody>/g) ?? [])).toHaveLength(1);
    expect((markup.match(/<tr/g) ?? [])).toHaveLength(8);

    expect(text).toContain("d32 [m]");
    expect(text).toContain("a [m²/m³]");
    expect(text).toContain("kc [m/s]");
    expect(text).toContain("kd [m/s]");
    expect(text).toContain("x interface, continuous [mol/mol]");
    expect(text).toContain("x interface, dispersed [mol/mol]");
    expect(text).toContain("N [mol/m²/s]");
    expect(text).toContain("aN [mol/m³/s]");
    expect(text).toContain("Continuous-film residual [mol/m²/s]");
    expect(text).toContain("Dispersed-film residual [mol/m²/s]");
    expect(text).toContain("No sizing is performed.");
    expect(text).toContain("not release-qualified");
    expect(text).toContain("Simultaneous separate-bulk-boundary chemical-potential/film solve");
    expect(text).toContain("source stage count identifies the source record; it does not override the requested");
    expect(text).toContain("holdupDefinesThermodynamicComposition = false");
    for (const auditField of [
      "x_bulk_continuous",
      "x_bulk_dispersed",
      "bulkContinuousProvenance",
      "bulkDispersedProvenance",
      "stage2Provenance",
      "sourceStageCount",
      "requestedNT",
      "phi_d_operating",
      "d32_m",
      "exactInterfaceEquilibriumRequest",
    ]) {
      expect(text).toContain(auditField);
    }
    expect(text).toContain("Retained dependency hashes");
    expect(text).not.toContain("m = Cd*/Cc*");
    expect(text).not.toContain("Kc [m/s]");
  });

  it("gates Job C on Job B and renders only the server-returned preliminary result", () => {
    const gatedMarkup = renderWithStates([design, null, null, false, null, null, null, null, null]);
    expect(gatedMarkup).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*(?:<span[^>]*><\/span>)?Start Job C/);

    const markup = renderWithStates([
      design,
      null,
      jobBResponse(),
      false,
      null,
      null,
      null,
      jobCResponse(),
      null,
    ]);
    const text = visibleText(markup);

    expect(text).toContain("Re-run Job C");
    expect(text).toContain("CALCULATED_PRELIMINARY_JOB_C");
    expect(text).toContain("Project-controlled Dax");
    expect(text).toContain("Continuous phase Dax: 0.010 m²/s Range: 0.003 to 0.030 m²/s");
    expect(text).toContain("Dispersed phase Dax: 0.001 m²/s Range: 0.0003 to 0.003 m²/s");
    expect(text).not.toContain("Dax: —");
    expect(text).not.toContain("Range: —");
    expect(text).toContain("Active-height search bounds");
    expect(text).toContain("VALIDATED_STAGE_2_NT");
    expect(text).toContain("Calculated active height");
    expect(text).toContain("2.4 m");
    expect(text).toContain("Per-compartment seven-component phase profile");
    for (const componentId of componentIds) expect(text).toContain(componentId);
    expect(text).toContain("Continuous residual [mol/s]");
    expect(text).toContain("Dispersed residual [mol/s]");
    expect(text).toContain("Selected-case component balance and conservation");
    expect(text).toContain("Global max component balance residual [mol/s]");
    expect(text).toContain("Maximum interface flux disagreement [mol/m²/s]");
    expect(text).toContain("Component balance/conservation diagnostics");
    expect(text).toContain("No efficiency calculation.");
    expect(text).toContain("No global m.");
    expect(text).toContain("No sulfur prediction or sulfur-removal claim.");
    expect(text).toContain("No release decision.");
    expect(text).toContain("No final RPM selection.");
    expect(text).toContain("No Job D.");
  });

  it("preserves a structured 409 Job C result without displaying height", () => {
    const markup = renderWithStates([
      design,
      null,
      jobBResponse(),
      false,
      null,
      "JOB_C_DEPENDENCY_BLOCKED:SIMULTANEOUS_JOB_B_REQUIRED",
      null,
      null,
      {
        error: "JOB_C_DEPENDENCY_BLOCKED:SIMULTANEOUS_JOB_B_REQUIRED",
        details: {
          workerStatus: "BLOCKED_PRELIMINARY_JOB_C",
          inputAudit: { jobBResultSha256: "rejected-job-b-hash" },
        },
      },
    ]);
    const text = visibleText(markup);

    expect(text).toContain("Job C · blocked result");
    expect(text).toContain("Job-C calculation blocked");
    expect(text).toContain("JOB_C_DEPENDENCY_BLOCKED:SIMULTANEOUS_JOB_B_REQUIRED");
    expect(text).toContain("No active height is shown");
    expect(text).toContain("Job-C error details and input audit");
    expect(markup).toContain("BLOCKED_PRELIMINARY_JOB_C");
    expect(markup).toContain("rejected-job-b-hash");
    expect(text).not.toContain("Calculated active height");
    expect(text).not.toContain("2.4 m");
  });

  it("renders retained background progress and an available Stop action", () => {
    const markup = renderWithStates([
      design,
      null,
      jobBResponse(),
      false,
      null,
      null,
      null,
      null,
      null,
      {
        jobId: "job-c-47",
        status: "running",
        progress: {
          phase: "HEIGHT_SEARCH",
          message: "Evaluating height candidate 4 of 10",
          completed: 4,
          total: 10,
        },
        result: null,
        error: null,
      },
      "Temporary network failure",
      false,
      false,
    ]);
    const text = visibleText(markup);

    expect(text).toContain("Re-run Job C");
    expect(text).toContain("Stop");
    expect(text).toContain("Job C: running");
    expect(text).toContain("Job ID: job-c-47");
    expect(text).toContain("HEIGHT_SEARCH · Evaluating height candidate 4 of 10");
    expect(text).toContain("4 / 10");
    expect(text).toContain("Candidate qualification → Height qualification → Exact qualification");
    expect(text).toContain("do not indicate Stage 4 or downstream acceptance");
    expect(text).toContain("last running state is retained and polling will continue");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*Re-run Job C<\/button>/);
  });

  it("uses only the dedicated Job C background-job client contract", () => {
    const source = readFileSync(
      "client/src/pages/design-software/ecr-pre-pilot-design-stage-4-page.tsx",
      "utf8",
    );

    expect(source).toContain("/job-c/jobs`");
    expect(source).toContain("/job-c/jobs/latest");
    expect(source).toContain("/job-c/jobs/${jobCJob.jobId}");
    expect(source).toContain("/job-c/jobs/${jobCJob.jobId}/cancel");
    expect(source).toContain("window.setInterval(() => void poll(), 1_500)");
    expect(source).toContain('read(payload, "result_snapshot", "result")');
    expect(source).not.toContain("/job-c/evaluate");
    expect(source).not.toMatch(/job-c\/jobs`,\s*\{[^}]*body:/s);
  });
});