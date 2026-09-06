import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
});