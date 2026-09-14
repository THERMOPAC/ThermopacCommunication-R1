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

const COMPONENT_ORDER = ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"];
const vector = COMPONENT_ORDER.map((_, index) => index + 1);

function interfaceFailure(startClass: string) {
  const request = {
    componentOrder: COMPONENT_ORDER,
    T: 298.15,
    x_bulk_continuous: vector.map(value => value / 28),
    x_bulk_dispersed: vector.map(value => (8 - value) / 28),
    kc: vector.map(value => value * 1e-6),
    kd: vector.map(value => value * 2e-6),
    CtC: 1000,
    CtD: 2000,
    phase_config: "nmp-continuous-rrbo-dispersed",
  };
  const response = {
    operation: "SOLVE_INTERFACE",
    status: "BLOCKED_NO_ACCEPTED_PHYSICAL_INTERFACE_ROOT",
    componentOrder: COMPONENT_ORDER,
    bulkBoundary: {
      continuousMoleFractions: request.x_bulk_continuous,
      dispersedMoleFractions: request.x_bulk_dispersed,
      boundaryZerosPreserved: true,
    },
    acceptanceThresholds: {
      maximumIsoactivityLogResidual: 0.00001,
      maximumScaledFluxEqualityResidual: 0.00000001,
      absoluteFluxToleranceMolM2S: 0.000000000001,
      minimumInterfaceCompositionSeparation: 0.02,
      requiredNumericalJacobianRank: 13,
      independentStartReproductionRelativeTolerance: 0.0001,
      minimumLocalStabilityCurvature: 0.001,
      postInterfaceTpdThreshold: -0.00001,
    },
    startDiagnostics: [
      {
        startClass,
        optimizerSuccess: false,
        numericalJacobianRank: 12,
        requiredNumericalJacobianRank: 13,
        maximumIsoactivityLogResidual: 0.2,
        maximumFluxEqualityResidualMolM2S: 0.03,
        maximumScaledFluxEqualityResidual: 0.02,
        maximumInterfaceCompositionSeparation: 0.01,
      },
    ],
    endpointAssessments: [{
      startClass,
      numericalAccepted: false,
      phaseSeparationAccepted: false,
      phaseOrientationAccepted: false,
    }],
  };
  return {
    requestHash: "a".repeat(64),
    request,
    response,
    iteration: 1,
    cellIndex: 0,
  };
}

function resultFixture() {
  return {
    status: "NUMERICAL_FAILURE_UNRESOLVED_PHYSICAL_COUNTS_REMAIN",
    mainOutputs: {
      diameterM: 0.8,
      physicalCompartments: null,
      activeHeightM: null,
      overallEfficiency: null,
    },
    calculatedNt: { value: 3, provenance: "STAGE_2_CALCULATED_NT_SAME_LINEAGE" },
    overallEfficiency: {
      value: null,
      status: "NUMERICAL_FAILURE_UNRESOLVED_PHYSICAL_COUNTS_REMAIN",
      dependency: "INTERFACE_ROOT_BLOCKED",
    },
    physicalGeometry: { pitchM: 0.4, pitchAssumption: "test" },
    physicalSizing: {
      status: "NUMERICAL_FAILURE_UNRESOLVED_PHYSICAL_COUNTS_REMAIN",
      primary: {
        dispersion: { valueM2S: 0.0015 },
        selected: null,
        attemptedPhysicalCompartments: [3],
        nonconvergedPhysicalCounts: [3],
        searchTermination: "NUMERICAL_FAILURE",
        lastConservedPhysicalTrial: {
          physicalCompartments: 3,
          status: "NUMERICAL_FAILURE",
          coarse: {
            reason: "STAGE4_JOB_B_INTERFACE_UNAVAILABLE:BLOCKED",
            iterations: 1,
            localFlashCalls: 0,
            interfaceFailure: interfaceFailure("ORIENTED_PHASE_TEMPLATE"),
          },
          refined: {
            reason: "STAGE4_JOB_B_INTERFACE_UNAVAILABLE:BLOCKED",
            iterations: 1,
            localFlashCalls: 0,
            interfaceFailure: interfaceFailure("ORIENTED_PHASE_TEMPLATE"),
          },
        },
      },
      sensitivity: {
        dispersion: { valueM2S: 0.0013 },
        selected: null,
        attemptedPhysicalCompartments: [],
        nonconvergedPhysicalCounts: [],
        searchTermination: "NOT_ATTEMPTED",
      },
      materiality: { comparable: false, classification: "NOT_ASSESSED" },
      blockers: [],
    },
    assumptions: [],
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

it("shows blocked coarse/refined Job B evidence without inventing stability gates or posting", () => {
  state.values = [resultFixture(), null, false, false, false, null];
  state.index = 0;
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const markup = renderToStaticMarkup(React.createElement(Panel, { designId: 269 }));
  const text = visibleText(markup);

  expect(markup).toContain('data-testid="stage4-interface-failure-diagnostics"');
  expect(markup).toContain('data-testid="stage4-interface-failure-primary-coarse"');
  expect(markup).toContain('data-testid="stage4-interface-failure-primary-refined"');
  expect(text).toContain("c=0.0126");
  expect(text).toContain("coarse mesh — interface failure evidence");
  expect(text).toContain("refined mesh — interface failure evidence");
  expect(text).toContain("Request hash");
  expect(text).toContain("a".repeat(64));
  expect(text).toContain("Iteration 1");
  expect(text).toContain("Cell index 0");
  expect(text).toContain("Full exact Job B scientific request JSON");
  expect(text).toContain("Full immutable Job B response JSON");
  expect(text).toContain("maximumIsoactivityLogResidual");
  expect(text).toContain("0.00001");
  expect(text).toContain("requiredNumericalJacobianRank");
  expect(text).toContain("13");
  expect(text).toContain("NOT EVALUATED");
  expect(text).toContain("blocked at a finite-volume cell");
  expect(fetchMock).not.toHaveBeenCalled();

  const orderStart = markup.indexOf("Component order (preserved):");
  const order = ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"]
    .map(component => markup.indexOf(component, orderStart));
  expect(order.every((index, position) => position === 0 || index > order[position - 1])).toBe(true);

  const stabilityStart = text.indexOf("Endpoint local stability");
  expect(stabilityStart).toBeGreaterThan(-1);
  expect(text.slice(stabilityStart, stabilityStart + 80)).toContain("NOT EVALUATED");
});