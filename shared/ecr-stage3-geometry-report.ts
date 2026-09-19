/**
 * Read-only presentation evidence. Never import this into an optimizer,
 * acceptance gate, calculation hash, or Stage-4/Stage-5 geometry resolver.
 */
export type Stage3GeometryReportInput = {
  selectedGeometry?: {
    hcToColumn?: number | null;
    rotorToColumn?: number | null;
    freeArea?: number | null;
  } | null;
  controls?: {
    hcToColumn?: readonly number[];
    rotorToColumn?: readonly number[];
    freeArea?: readonly number[];
  } | null;
};

const PARAMETERS = [
  {
    key: "hcToColumn", label: "Compartment height / column diameter (hc/D)",
    design: [0.20, 0.30], experimental: [0.45, 0.69],
    reference: "0.625 (50/80 mm)",
    coverage: "Current search envelope is wholly below K&H's reported geometry range.",
  },
  {
    key: "rotorToColumn", label: "Rotor / column diameter (DR/D)",
    design: [0.33, 0.50], experimental: [0.43, 0.69],
    reference: "0.5625 (45/80 mm)",
    coverage: "Only 0.43–0.50 overlaps K&H's marginal range; default choices 0.33 and 0.40 are below it.",
  },
  {
    key: "freeArea", label: "Empirical stator free-area fraction (φs)",
    design: [0.20, 0.40], experimental: [0.16, 1.00],
    reference: "0.40 nominal",
    coverage: "Numerical overlap with K&H is conditional on matching area definitions; 1.00 includes no stator.",
  },
] as const;

export function buildStage3GeometryReport(input: Stage3GeometryReportInput = {}) {
  return {
    reportingOnly: true as const,
    rows: PARAMETERS.map(parameter => {
      const selected = input.selectedGeometry?.[parameter.key];
      const value = typeof selected === "number" && Number.isFinite(selected) ? selected : null;
      const controls = input.controls?.[parameter.key];
      const min = parameter.experimental[0];
      const max = parameter.experimental[1];
      const applicability = value === null
        ? "Not assessed — no finite selected value"
        : value < min
          ? "Below K&H marginal range — geometry extrapolation"
          : value > max
            ? "Above K&H marginal range — geometry extrapolation"
            : parameter.key === "freeArea"
              ? "Within K&H numerical range — area mapping unresolved"
              : "Within K&H marginal range — joint applicability not established";
      return {
        key: parameter.key,
        label: parameter.label,
        designEnvelope: `${parameter.design[0].toFixed(2)}–${parameter.design[1].toFixed(2)}`,
        experimentalEnvelope: `${min.toFixed(2)}–${max.toFixed(2)}`,
        selected: value,
        savedSearchChoices: controls?.length
          ? controls.map(value => Number.isFinite(value) ? String(value) : "unavailable").join(", ")
          : "Unavailable — no saved search choices",
        applicability,
        constructionReference: parameter.reference,
        coverage: parameter.coverage,
      };
    }),
  };
}