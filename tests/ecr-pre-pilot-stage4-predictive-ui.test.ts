import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import Panel from "../client/src/components/ecr-pre-pilot/stage4-pre-pilot-sizing-panel";

const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => [
      state.index < state.values.length ? state.values[state.index++] : initial,
      vi.fn(),
    ],
  };
});

const notice =
  "PRE-PILOT PREDICTIVE / SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN";

function screeningCase(c: number, values: {
  ec: number;
  pec: number;
  count: number | null;
  height: number | null;
  efficiency: number | null;
  outlet?: number[];
  termination: string;
}) {
  return {
    c,
    dispersion: {
      valueM2S: values.ec,
      normalizedEcOverVcHc: values.ec * 100,
      compartmentPitchM: 0.4,
      c,
      equation: "Ec/(Vc hc)=screening",
    },
    continuousPecletPerPhysicalCompartment: values.pec,
    dispersedPecletPerPhysicalCompartment: {
      value: null,
      status: "INFINITE_ZERO_DISPERSION_LIMIT_ED_ZERO",
    },
    selected: values.count == null ? null : {
      physicalCompartments: values.count,
      activeHeightM: values.height,
      overallEfficiency: values.efficiency,
      oilRaffinateOutletMolarFlowMolS: values.outlet ?? null,
      targetCompliance: {
        allEvaluatedTargetsPassed: true,
        metrics: [
          { name: "RECOVERY", actual: 97.5, target: 90, status: "PASS" },
        ],
      },
    },
    attemptedPhysicalCompartments: [1, 2, 3, 4],
    maximumPhysicalCompartmentsSearched: 80,
    nonconvergedPhysicalCounts: [],
    searchTermination: values.termination,
  };
}

function resultFixture() {
  return {
    status: "CALCULATED_PRE_PILOT_PREDICTIVE_SCREENING",
    classification: notice,
    screeningNotice: notice,
    mainOutputs: {
      diameterM: 0.8,
      overallEfficiency: 0.75,
      physicalCompartments: 4,
      activeHeightM: 1.6,
    },
    calculatedNt: {
      value: 3,
      provenance: "STAGE_2_CALCULATED_NT_SAME_LINEAGE",
      stage2JobId: "stage-2-accepted",
    },
    selectedStage3Hydraulics: {
      source: "PERSISTED_STAGE3_HYDRAULIC_DIAGNOSTIC_POINT_NO_STAGE4_RESELECTION",
      diameterM: 0.8,
      rotorDiameterM: 0.4,
      rpm: 42,
      d32M: 0.001,
      operatingHoldup: 0.2,
      floodHoldup: 0.35,
      holdupMargin: 0.15,
      continuousSuperficialVelocityMS: 0.002,
      dispersedSuperficialVelocityMS: 0.003,
    },
    overallEfficiency: {
      value: 0.75,
      status: "CALCULATED_FROM_CONSERVED_TRANSFER_AND_AXIAL_DISPERSION_SCREENING",
      dependency: null,
    },
    physicalGeometry: {
      pitchM: 0.4,
      pitchAssumption: "PRE_PILOT_GEOMETRY_ASSUMPTION: physical compartment pitch = 0.5 × persisted Stage-3 column diameter",
    },
    physicalSizing: {
      implementation: {
        version: "ECR_STAGE4_PREDICTIVE_PHYSICAL_SIZING_V1",
        implementationHash: "implementation-hash",
      },
      primary: screeningCase(0.0126, {
        ec: 0.0015,
        pec: 0.53,
        count: 4,
        height: 1.6,
        efficiency: 0.75,
        outlet: [1, 2, 3, 4, 5, 6, 7],
        termination: "FIRST_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT",
      }),
      sensitivity: screeningCase(0.0105, {
        ec: 0.0013,
        pec: 0.61,
        count: 5,
        height: 2,
        efficiency: 0.6,
        termination: "FIRST_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT",
      }),
      materiality: {
        threshold: "same integer physical compartments and <=5% relative active-height and overall-efficiency difference",
        comparable: true,
        heightRelativeDifference: 0.2,
        efficiencyRelativeDifference: 0.2,
        robustToKhCoefficientSensitivity: false,
        classification: "NOT_ROBUST_OR_NOT_COMPARABLE",
        note: "Ec proximity alone is not a robustness criterion.",
      },
      assumptions: [
        "Overall efficiency is calculated after the search as Stage-2 accepted Nt/Nphysical; it is never an input.",
        "Ec uses the authorized screening expression; Ed=0.",
      ],
    },
    mixingAudit: {
      interfacialArea: { value: 1200, source: "screening", basis: "operating" },
      inputs: {
        rotorDiameterM: 0.4,
        continuousSuperficialVelocityMS: 0.002,
        dispersedSuperficialVelocityMS: 0.003,
      },
      continuousMixing: {
        value: 0.0015,
        selectedCorrelation: "KUMAR_HARTLAND_EC_SCREENING",
        candidate: "Kumar–Hartland continuous-phase axial-dispersion expression",
        equation: "Ec/(Vc hc)=screening",
      },
      dispersedMixing: {
        value: 0,
        warning: "Ed=0 screening assumption",
        source: "screening",
      },
      peclet: {
        continuous: { value: null },
        dispersed: { value: null, status: "ZERO_DISPERSION_LIMIT_INFINITE_FOR_POSITIVE_HEIGHT_AND_FLOW" },
      },
      applicability: {
        extrapolationAssessment: "screening",
        referenceStudy: "Asadollahzadeh (2017) supporting context only",
        warnings: [],
      },
      transferSolution: {
        detail: "Backend conserved physical-compartment screening result.",
      },
      blockers: [],
    },
    assumptions: [
      "Stage 4 carries the persisted Stage-3 selected hydraulic point forward.",
      "The 7-component local equilibrium is a screening closure.",
    ],
  };
}

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

function dependencyBlockedFixture() {
  const fixture = resultFixture() as any;
  fixture.status = "DEPENDENCY_BLOCKED";
  fixture.mainOutputs = {
    diameterM: 0.8,
    overallEfficiency: null,
    physicalCompartments: null,
    activeHeightM: null,
  };
  fixture.overallEfficiency = {
    value: null,
    status: "NOT_EXECUTED_REQUIRED_CLOSURE_MISSING",
    dependency: "NOT_STARTED_REQUIRED_PHYSICAL_CLOSURE_MISSING",
  };
  fixture.physicalSizing = {
    implementation: null,
    status: "DEPENDENCY_BLOCKED",
    primary: {
      ...screeningCase(0.0126, {
        ec: 0.0015,
        pec: 0.53,
        count: null,
        height: null,
        efficiency: null,
        termination: "NOT_STARTED_REQUIRED_PHYSICAL_CLOSURE_MISSING",
      }),
      attemptedPhysicalCompartments: [],
      nonconvergedPhysicalCounts: [],
    },
    sensitivity: {
      ...screeningCase(0.0105, {
        ec: 0.0013,
        pec: 0.61,
        count: null,
        height: null,
        efficiency: null,
        termination: "NOT_STARTED_REQUIRED_PHYSICAL_CLOSURE_MISSING",
      }),
      attemptedPhysicalCompartments: [],
      nonconvergedPhysicalCounts: [],
    },
    blockers: [
      "STAGE4_DYNAMIC_LOCAL_7C_EQUILIBRIUM_CLOSURE_REQUIRED",
      "STAGE4_NON_EQUIMOLAR_MULTICOMPONENT_TWO_FILM_INTERFACE_CLOSURE_REQUIRED",
      "STAGE4_INDEPENDENT_AXIAL_MESH_REFINEMENT_EVIDENCE_REQUIRED",
    ],
    materiality: {
      threshold: "same integer physical compartments and <=5% relative active-height and overall-efficiency difference",
      comparable: false,
      heightRelativeDifference: null,
      efficiencyRelativeDifference: null,
      robustToKhCoefficientSensitivity: false,
      classification: "NOT_COMPARABLE_PHYSICAL_SOLVES_NOT_AVAILABLE",
      note: "Ec proximity alone is not a robustness criterion.",
    },
    assumptions: [
      "K&H Ec and Ed=0 are screening inputs only; they do not close the missing local multicomponent physical-column model.",
      "No physical-compartment count, active height, or overall efficiency is reported until the three explicit closure blockers are resolved.",
    ],
  };
  return fixture;
}

it("renders backend-owned Ec, Pec, physical sizing, outlets, and sensitivity", () => {
  state.values = [resultFixture(), null, false];
  state.index = 0;
  const markup = renderToStaticMarkup(React.createElement(Panel, { designId: 269 }));
  const text = visibleText(markup);

  expect(text).toContain(notice);
  expect(text).toContain("Ec → Pec → physical count / height / overall efficiency");
  expect(text).toContain("c=0.0126");
  expect(text).toContain("c=0.0105");
  expect(text).toContain("0.0015 m²/s");
  expect(text).toContain("0.0013 m²/s");
  expect(text).toContain("0.53");
  expect(text).toContain("0.61");
  expect(text).toContain("Physical count");
  expect(text).toContain("Active H [m]");
  expect(text).toContain("ηoverall");
  expect(text).toContain("Persisted diameter 0.8 m");
  expect(text).toContain("Rotor diameter DR 0.4 m");
  expect(text).toContain("RPM 42");
  expect(text).toContain("Continuous superficial Vc 0.002 m/s");
  expect(text).toContain("SAT [mol/s] 1");
  expect(text).toContain("H2O [mol/s] 7");
  expect(text).toContain("NOT_ROBUST_OR_NOT_COMPARABLE");
  expect(text).toContain("Robustness is displayed only from the backend materiality result");
  expect(text).toContain("Barred V and trailing undefined e are not used");
  expect(text).toContain("Asadollahzadeh (2017)");
  expect(text).toContain("Ed = 0");
  expect(text).toContain("0.5D");
  expect(text).not.toContain("Job A");
  expect(text).not.toContain("Job B");
  expect(text).not.toContain("Job C");
});

it("renders the live dependency-blocked contract without implying a solve or pilot/source prerequisite", () => {
  state.values = [dependencyBlockedFixture(), null, false];
  state.index = 0;
  const markup = renderToStaticMarkup(React.createElement(Panel, { designId: 269 }));
  const text = visibleText(markup);

  expect(markup).toContain('data-testid="stage4-physical-sizing-blockers"');
  expect(text).toContain("Physical-sizing implementation blockers");
  expect(text).toContain("STAGE4_DYNAMIC_LOCAL_7C_EQUILIBRIUM_CLOSURE_REQUIRED");
  expect(text).toContain("STAGE4_NON_EQUIMOLAR_MULTICOMPONENT_TWO_FILM_INTERFACE_CLOSURE_REQUIRED");
  expect(text).toContain("STAGE4_INDEPENDENT_AXIAL_MESH_REFINEMENT_EVIDENCE_REQUIRED");
  expect(text).toContain("not missing source records, pilot prerequisites");
  expect(text).toContain("Ec and Pe_c remain numeric screening inputs only");
  expect(text).toContain("0.0015 m²/s");
  expect(text).toContain("0.0013 m²/s");
  expect(text).toContain("NOT ASSESSED");
  expect(text).toContain("No predicted outlet is available because the physical sizing solve was not started");
  expect(text).not.toContain("FIRST_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT");
  expect(text).not.toContain("No target-compliant physical count");
});

it("does not invent a physical result when both backend searches are non-compliant", () => {
  const fixture = resultFixture();
  fixture.status = "NO_TARGET_COMPLIANT_PHYSICAL_SOLUTION";
  fixture.mainOutputs = {
    diameterM: 0.8,
    overallEfficiency: null,
    physicalCompartments: null,
    activeHeightM: null,
  };
  fixture.overallEfficiency = {
    value: null,
    status: "NO_TARGET_COMPLIANT_PHYSICAL_SOLUTION",
    dependency: "NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND",
  };
  fixture.physicalSizing.primary = screeningCase(0.0126, {
    ec: 0.0015,
    pec: 0.53,
    count: null,
    height: null,
    efficiency: null,
    termination: "NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND",
  });
  fixture.physicalSizing.sensitivity = screeningCase(0.0105, {
    ec: 0.0013,
    pec: 0.61,
    count: null,
    height: null,
    efficiency: null,
    termination: "NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND",
  });
  fixture.physicalSizing.materiality = {
    comparable: false,
    robustToKhCoefficientSensitivity: false,
    classification: "NOT_ROBUST_OR_NOT_COMPARABLE",
    note: "Ec proximity alone is not a robustness criterion.",
  };
  state.values = [fixture, null, false];
  state.index = 0;
  const text = visibleText(renderToStaticMarkup(React.createElement(Panel, { designId: 269 })));

  expect(text).toContain("NO_TARGET_COMPLIANT_PHYSICAL_SOLUTION");
  expect(text).toContain("No predicted outlet is available");
  expect(text).toContain("NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND");
  expect(text).toContain("Primary physical sizing did not return a target-compliant count");
  expect(text).toContain("No primary target metrics were returned");
  expect(text).not.toContain("Physical count 0");
  expect(text).not.toContain("Active H [m] 0");
});

it("reports a server failure as blocked without presenting stale sizing values", () => {
  state.values = [null, "STAGE4_PINNED_7C_LOCAL_EQUILIBRIUM_UNAVAILABLE:FAILED", false];
  state.index = 0;
  const markup = renderToStaticMarkup(React.createElement(Panel, { designId: 269 }));
  const text = visibleText(markup);

  expect(markup).toContain('role="alert"');
  expect(text).toContain("blocked or failed");
  expect(text).toContain("STAGE4_PINNED_7C_LOCAL_EQUILIBRIUM_UNAVAILABLE:FAILED");
  expect(text).not.toContain("Physical count 0");
  expect(text).not.toContain("Predicted primary raffinate outlet");
});