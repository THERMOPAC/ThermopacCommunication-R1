import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  inferHistoricalHydraulicPrerequisite,
  KuhniResolverPanel,
} from "../client/src/components/ecr-pre-pilot/kuhni-hydrodynamics-card";

function visibleText(markup: string) {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function processBasis(overrides: Record<string, unknown> = {}) {
  return {
    phaseConfiguration: "rrbo-continuous-nmp-dispersed",
    rrboFeed: {
      identity: "RRBO_FEED",
      densityKgM3: 869,
      dynamicViscosityPaS: 0.056,
    },
    wetSolventPhase: {
      identity: "WET_NMP_SOLVENT_PHASE",
      densityKgM3: 1015,
      dynamicViscosityPaS: 0.001666,
    },
    ...overrides,
  };
}

function runFixture(overrides: Record<string, unknown> = {}) {
  return {
    status: "NOT_CALCULABLE",
    engine: {
      id: "kuhni_geometry_resolver",
      version: "KUHNI_GEOMETRY_RESOLVER_V1.0.1",
      implementationHash: "engine-hash",
    },
    theoreticalStagesUsed: {
      value: 5,
      provenance: "STAGE_2_CALCULATED_NT",
      label: "Stage 2 accepted N_T",
      stage2JobId: "stage-2-accepted",
      stage2ResultHash: "stage-2-result-hash",
    },
    processBasis: processBasis(),
    hydraulicRpmEnvelope: [],
    rejectedRpmTrials: [],
    hydraulicResolvedColumnDiameterM: null,
    hydraulicDiagnosticPoint: null,
    excludedExtrapolatedTrialCount: 0,
    coupledSelection: { status: "DEPENDENCY_BLOCKED", blocker: "Mass transfer pending." },
    ...overrides,
  };
}

function renderPanel(run: Record<string, unknown>) {
  return renderToStaticMarkup(
    React.createElement(KuhniResolverPanel, { run, runCount: 1 }),
  );
}

describe("Kuhni Stage 3 rejected-envelope panel", () => {
  it("keeps accepted in-range trials separate from saved rejected RPM reasons", () => {
    const markup = renderPanel(runFixture({
      hydraulicRpmEnvelope: [{
        rpm: 20,
        status: "CALCULATED_IN_RANGE",
        columnDiameterM: 0.8,
        rotorDiameterM: 0.4,
        d32M: 0.001,
        floodHoldup: 0.3,
        actualLoading: 0.5,
        tipSpeedMS: 0.4,
        powerVolumeWM3: 100,
        terminal: { re: 2 },
        characteristicRe: 3,
        swarmRe: 4,
      }],
      rejectedRpmTrials: [{
        rpm: 5,
        reason: "NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS",
      }],
    }));
    const text = visibleText(markup);

    expect(text).toContain("Accepted calculated-in-range hydraulic envelope");
    expect(text).toContain("0.800 m");
    expect(text).toContain("Rejected hydraulic RPM trials");
    expect(text).toContain("5.0");
    expect(text).toContain("NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS");
    expect(text).not.toContain("No calculated-in-range hydraulic trial was accepted");
    expect(text).not.toContain("extrapolated hydraulic trial");
  });

  it("renders a valid empty/rejected envelope with the actual prerequisite explanation", () => {
    const rejectedRpmTrials = [
      { rpm: 5, reason: "NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS" },
      { rpm: 10, reason: "NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS" },
    ];
    const markup = renderPanel(runFixture({ rejectedRpmTrials }));
    const text = visibleText(markup);

    expect(markup).toContain('data-testid="kuhni-stage-disposition"');
    expect(markup).toContain('data-testid="kuhni-hydraulic-prerequisite"');
    expect(text).toContain("Stage 2 authority Accepted N_T 5");
    expect(text).toContain("Stage 3 hydraulic disposition Unsupported");
    expect(text).toContain("CONTINUOUS_PHASE_MUST_BE_HEAVIER");
    expect(text).toContain("RRBO_FEED");
    expect(text).toContain("869.000 kg/m³");
    expect(text).toContain("WET_NMP_SOLVENT_PHASE");
    expect(text).toContain("1015.000 kg/m³");
    expect(text).toContain("positive Δρ");
    expect(text).toContain("NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS");
    expect(text).toContain("No calculated-in-range hydraulic trial was accepted");
  });

  it("uses the additive backend prerequisite verbatim when available", () => {
    const markup = renderPanel(runFixture({
      hydraulicPrerequisite: {
        code: "HYDRAULIC_PHASE_ORIENTATION_UNSUPPORTED",
        message: "The selected orientation is not supported by the versioned closure.",
      },
      processBasis: processBasis({
        wetSolventPhase: { identity: "WET_NMP_SOLVENT_PHASE", densityKgM3: 1015 },
      }),
    }));
    const text = visibleText(markup);

    expect(text).toContain("HYDRAULIC_PHASE_ORIENTATION_UNSUPPORTED");
    expect(text).toContain("The selected orientation is not supported by the versioned closure.");
    expect(text).not.toContain("CONTINUOUS_PHASE_MUST_BE_HEAVIER");
  });

  it("does not label the supported backend prerequisite as a failure", () => {
    const markup = renderPanel(runFixture({
      hydraulicPrerequisite: {
        code: "SUPPORTED_DENSITY_ORIENTATION",
        message: "The evidenced heavy-continuous/downward orientation is applicable.",
      },
      hydraulicRpmEnvelope: [{
        rpm: 20,
        status: "CALCULATED_IN_RANGE",
        columnDiameterM: 0.8,
      }],
    }));
    const text = visibleText(markup);

    expect(text).toContain("Accepted calculated-in-range hydraulic envelope");
    expect(text).not.toContain("Hydraulic prerequisite not satisfied");
    expect(text).not.toContain("SUPPORTED_DENSITY_ORIENTATION");
  });

  it("renders V1.2 rootFailureReason for supported orientations with no admitted root", () => {
    const rootFailureReason = {
      code: "NO_CALCULATED_IN_RANGE_TRIAL",
      message: "Diameter roots exist only as excluded extrapolated trials; no CALCULATED_IN_RANGE Stage-3 trial is available for display or lineage.",
    };
    const allExtrapolatedMarkup = renderPanel(runFixture({
      hydraulicPrerequisite: {
        code: "SUPPORTED_DENSITY_ORIENTATION",
        message: "The evidenced heavy-continuous/downward orientation is applicable.",
      },
      hydraulicRpmEnvelope: [{
        rpm: 20,
        status: "CALCULATED_EXTRAPOLATED",
        columnDiameterM: 0.8,
      }],
      rootFailureReason,
    }));
    const allExtrapolatedText = visibleText(allExtrapolatedMarkup);

    expect(allExtrapolatedMarkup).toContain('data-testid="kuhni-root-failure-reason"');
    expect(allExtrapolatedText).toContain("Stage 3 hydraulic disposition Supported orientation — no admitted hydraulic root");
    expect(allExtrapolatedText).toContain("NO_CALCULATED_IN_RANGE_TRIAL");
    expect(allExtrapolatedText).toContain(rootFailureReason.message);
    expect(allExtrapolatedText).toContain("1 extrapolated hydraulic trial excluded");
    expect(allExtrapolatedText).not.toContain("Unsupported orientation");

    const emptyMarkup = renderPanel(runFixture({
      hydraulicPrerequisite: {
        code: "SUPPORTED_DENSITY_ORIENTATION",
        message: "The evidenced heavy-continuous/downward orientation is applicable.",
      },
      rootFailureReason: {
        code: "NO_STAGE3_DIAMETER_ROOT",
        message: "No Stage-3 diameter root was retained within the physical search bounds.",
      },
    }));
    const emptyText = visibleText(emptyMarkup);

    expect(emptyText).toContain("Stage 3 hydraulic disposition Supported orientation — no admitted hydraulic root");
    expect(emptyText).toContain("NO_STAGE3_DIAMETER_ROOT");
    expect(emptyText).toContain("No Stage-3 diameter root was retained within the physical search bounds.");
    expect(emptyText).not.toContain("Unsupported orientation");
  });

  it("keeps mixed rejected and extrapolated trials distinct while showing the root failure", () => {
    const markup = renderPanel(runFixture({
      hydraulicPrerequisite: {
        code: "SUPPORTED_DENSITY_ORIENTATION",
        message: "The evidenced heavy-continuous/downward orientation is applicable.",
      },
      hydraulicRpmEnvelope: [{
        rpm: 20,
        status: "CALCULATED_EXTRAPOLATED",
        columnDiameterM: 0.8,
      }],
      rejectedRpmTrials: [{
        rpm: 5,
        reason: "NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS",
        message: "No in-range diameter root was retained at 5 RPM.",
      }],
      rootFailureReason: {
        code: "NO_CALCULATED_IN_RANGE_TRIAL",
        message: "No CALCULATED_IN_RANGE Stage-3 trial is available for display or lineage.",
      },
    }));
    const text = visibleText(markup);

    expect(text).toContain("1 extrapolated hydraulic trial excluded");
    expect(text).toContain("Rejected hydraulic RPM trials");
    expect(text).toContain("5.0");
    expect(text).toContain("NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS");
    expect(text).toContain("NO_CALCULATED_IN_RANGE_TRIAL");
    expect(text).toContain("Supported orientation — no admitted hydraulic root");
    expect(text).not.toContain("Accepted calculated-in-range hydraulic envelope");
  });

  it("does not carry an old persisted diameter into an empty or rejected envelope", () => {
    const markup = renderPanel(runFixture({
      hydraulicResolvedColumnDiameterM: 9.876,
      resolvedColumnDiameterM: 9.876,
      hydraulicDiagnosticPoint: { status: "CALCULATED_IN_RANGE", columnDiameterM: 9.876 },
      rejectedRpmTrials: [{ rpm: 5, reason: "NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS" }],
    }));
    const text = visibleText(markup);

    expect(text).toContain("No in-range result");
    expect(text).toContain("No calculated-in-range hydraulic trial was accepted");
    expect(text).not.toContain("9.876");
    expect(text).not.toContain("9.876 m");
  });

  it("infers only from known frozen phase metadata and does not mutate it", () => {
    const basis = processBasis();
    const rejected = [{ rpm: 5, reason: "NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS" }];
    const basisBefore = JSON.stringify(basis);
    const rejectedBefore = JSON.stringify(rejected);
    const inferred = inferHistoricalHydraulicPrerequisite(basis, rejected);

    expect(inferred?.code).toBe("CONTINUOUS_PHASE_MUST_BE_HEAVIER");
    expect(JSON.stringify(basis)).toBe(basisBefore);
    expect(JSON.stringify(rejected)).toBe(rejectedBefore);
    expect(inferHistoricalHydraulicPrerequisite({
      ...basis,
      phaseConfiguration: "unknown-phase-orientation",
    }, rejected)).toBeNull();
    expect(inferHistoricalHydraulicPrerequisite({
      ...basis,
      phaseConfiguration: "nmp-continuous-rrbo-dispersed",
      wetSolventPhase: { identity: "WET_NMP_SOLVENT_PHASE", densityKgM3: 1100 },
    }, rejected)).toBeNull();
    expect(inferHistoricalHydraulicPrerequisite({
      ...basis,
      phaseConfiguration: "rrbo-continuous-nmp-dispersed",
    }, rejected)?.code).toBe("CONTINUOUS_PHASE_MUST_BE_HEAVIER");
    expect(inferHistoricalHydraulicPrerequisite({
      ...basis,
      phaseConfiguration: "rrbo-continuous-nmp-dispersed",
      rrboFeed: { identity: "RRBO_FEED", densityKgM3: 1100 },
    }, rejected)).toBeNull();
    expect(inferHistoricalHydraulicPrerequisite({
      ...basis,
      wetSolventPhase: { identity: "WET_NMP_SOLVENT_PHASE", densityKgM3: 869 },
    }, rejected)?.code).toBe("CONTINUOUS_PHASE_MUST_BE_HEAVIER");
    expect(inferHistoricalHydraulicPrerequisite({
      ...basis,
      wetSolventPhase: { identity: "WET_NMP_SOLVENT_PHASE", densityKgM3: -1 },
    }, rejected)).toBeNull();
  });
});