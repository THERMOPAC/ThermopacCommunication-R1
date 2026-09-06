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
      status: "COMPLETED_LOCAL_TEST",
      frozenLocalHydraulics: {
        operatingHoldup: 0.16,
        d32M: 0.0012,
        interfacialAreaM2M3: 800,
        hydrodynamicsRecomputed: false,
      },
      theoreticalStageAuthority: {
        theoreticalStages: 7,
        provenance: "governed Stage-4 fallback",
      },
      rows: componentIds.map((componentId, index) => ({
        componentId,
        partitionM: index === 0 ? null : 0.5 + index / 10,
        kcMS: 0.0001,
        kdMS: 0.0002,
        overallKcMS: 0.00008,
        fluxMolM2S: index / 1000,
        volumetricTransferMolM3S: index / 100,
        continuousFilmResidualMolM2S: 0,
        dispersedFilmResidualMolM2S: 0,
        inactiveZeroInventory: index === 0,
      })),
      resultSha256: "job-b-result-hash",
      implementationSha256: "job-b-implementation-hash",
      equilibriumAuthority: { resultHash: "equilibrium-result-hash" },
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
    expect(text).toContain("COMPLETED_LOCAL_TEST");
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
      adapterStatus: "BLOCKED_EQUILIBRIUM_NOT_ACCEPTED",
      equilibriumGate: {
        accepted: false,
        reasonCode: "TIE_LINE_RESIDUAL_OUT_OF_BOUNDS",
      },
      evidenceIds: ["lle-gate-47"],
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

    expect(text).toContain("Job-B local equilibrium not accepted");
    expect(text).toContain("BLOCKED_EQUILIBRIUM_NOT_ACCEPTED");
    expect(text).toContain("Thermodynamic gate details");
    expect(markup).toContain("TIE_LINE_RESIDUAL_OUT_OF_BOUNDS");
    expect(markup).toContain("lle-gate-47");
    expect(text).toContain("No interfacial fluxes are shown for this state");
    expect(text).not.toContain("Seven-component interfacial flux closure test");
    expect(markup).not.toContain("<table");
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
    expect(text).toContain("Kc [m/s]");
    expect(text).toContain("N [mol/m²/s]");
    expect(text).toContain("aN [mol/m³/s]");
    expect(text).toContain("Local test only: no compartment count, height, efficiency, or final RPM.");
    expect(text).toContain("not release-qualified");
  });
});