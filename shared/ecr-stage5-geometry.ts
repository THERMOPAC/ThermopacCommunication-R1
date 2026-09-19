/** Stage 5 API contract. All lengths are metres, areas m², elevations from vessel bottom. */
export type Stage5Classification = "Inherited" | "Calculated" | "Engineer-entered" | "Assumed" | "TBD";
export interface Stage5Basis {
  stage3ResultId: number | string;
  stage4ResultId: number | string;
  sourcesCurrent: boolean;
  sourcesCompatible: boolean;
  columnDiameterM: number | null;
  compartmentHeightM: number | null;
  rotorDiameterRatio: number | null;
  rotorDiameterM: number | null;
  statorFreeAreaRatio: number | null;
  selectedRpm: number | null;
  rpmMin: number | null;
  rpmMax: number | null;
  phaseConfiguration: string | null;
  compartmentCount: number | null;
  requiredActiveHeightM: number | null;
  installedActiveHeightM: number | null;
  designNt: number | null;
  hetsM: number | null;
}
export interface Stage5InputValue {
  value: number | null;
  classification: "Engineer-entered" | "Assumed";
  note: string;
}
export type Stage5InputKey = "shaftDiameterM" | "rotorThicknessM" | "statorThicknessM" |
  "rotorOffsetM" | "bottomDisengagementM" | "topDisengagementM" |
  "bottomHeadDepthM" | "topHeadDepthM" | "supportHeightM" |
  "driveHeightM" | "lowerShaftSupportM" | "upperShaftSupportM" |
  "bladeCount" | "bladeHeightM" | "bladeRadialLengthM" | "bladeThicknessM" | "hubDiameterM" | "hubHeightM";
export interface Stage5NozzleInput {
  id: string; service: string; region: "bottom" | "active" | "top";
  elevationM: number | null; boreM: number | null; azimuthDeg: number | null;
  classification: "Engineer-entered" | "Assumed"; note: string;
}
export interface Stage5Inputs {
  values: Record<Stage5InputKey, Stage5InputValue>;
  /** Explicit proposal, not a source-qualified hydraulic construction. Missing means TBD. */
  rotorConstruction?: "flat-blade-turbine" | "flat-disc" | null;
  statorConstruction?: "annular-single-opening" | null;
  flowArrangement?: "nmp-down-rrbo-up" | "nmp-up-rrbo-down" | null;
  flowClassification?: "Engineer-entered" | "Assumed";
  flowNote?: string;
  topHeadProfile?: "elliptical-envelope" | "flat-envelope" | null;
  bottomHeadProfile?: "elliptical-envelope" | "flat-envelope" | null;
  nozzles: Stage5NozzleInput[];
  notes: string;
}
export interface Stage5Parameter {
  key: string; label: string; value: number | string | null; unit: string;
  classification: Stage5Classification; note: string;
}
export interface Stage5Check { id: string; status: "pass" | "fail" | "tbd"; message: string }
export interface Stage5Geometry {
  basis: Stage5Basis; inputs: Stage5Inputs;
  parameters: Stage5Parameter[];
  dimensions: Record<string, number | null>;
  checks: Stage5Check[]; assumptions: string[]; tbd: string[];
  complete: boolean;
  rotorType: string; statorType: string; freeAreaDefinition: string;
  compartments: { index: number; bottomM: number | null; topM: number | null; rotorM: number | null; statorM: number | null }[];
  internals: { id: string; type: string; count: number | null; diameterM: number | null; thicknessM: number | null; elevationsM: (number | null)[] }[];
  nozzles: Stage5NozzleInput[];
  watermark: string; engineeringBoundary: string;
  engineeringExclusions: string[];
}
export const STAGE5_CHOICE_FIELDS = [
  { key: "rotorConstruction", label: "Rotor construction proposal", choices: ["flat-blade-turbine", "flat-disc"] },
  { key: "statorConstruction", label: "Stator construction proposal", choices: ["annular-single-opening"] },
  { key: "flowArrangement", label: "Confirmed phase flow arrangement", choices: ["nmp-down-rrbo-up", "nmp-up-rrbo-down"] },
  { key: "flowClassification", label: "Flow arrangement classification", choices: ["Engineer-entered", "Assumed"] },
  { key: "topHeadProfile", label: "Top head envelope profile", choices: ["elliptical-envelope", "flat-envelope"] },
  { key: "bottomHeadProfile", label: "Bottom head envelope profile", choices: ["elliptical-envelope", "flat-envelope"] },
] as const;
export const STAGE5_INPUT_FIELDS: { key: Stage5InputKey; label: string; unit: string }[] = [
  { key: "bladeCount", label: "Flat radial blade count", unit: "" },
  { key: "bladeHeightM", label: "Blade axial height", unit: "m" },
  { key: "bladeRadialLengthM", label: "Blade radial length from hub", unit: "m" },
  { key: "bladeThicknessM", label: "Blade tangential thickness", unit: "m" },
  { key: "hubDiameterM", label: "Turbine hub diameter", unit: "m" },
  { key: "hubHeightM", label: "Turbine hub axial height", unit: "m" },
  { key: "shaftDiameterM", label: "Shaft diameter", unit: "m" },
  { key: "rotorThicknessM", label: "Flat-disc rotor thickness", unit: "m" },
  { key: "statorThicknessM", label: "Annular stator plate thickness", unit: "m" },
  { key: "rotorOffsetM", label: "Rotor centre above compartment bottom", unit: "m" },
  { key: "bottomDisengagementM", label: "Bottom disengagement straight length", unit: "m" },
  { key: "topDisengagementM", label: "Top disengagement straight length", unit: "m" },
  { key: "bottomHeadDepthM", label: "Bottom head envelope depth", unit: "m" },
  { key: "topHeadDepthM", label: "Top head envelope depth", unit: "m" },
  { key: "supportHeightM", label: "Vessel support height below bottom", unit: "m" },
  { key: "driveHeightM", label: "Drive envelope above vessel", unit: "m" },
  { key: "lowerShaftSupportM", label: "Lower shaft support elevation", unit: "m" },
  { key: "upperShaftSupportM", label: "Upper shaft support elevation", unit: "m" },
];
export function emptyStage5Inputs(): Stage5Inputs {
  return { values: Object.fromEntries(STAGE5_INPUT_FIELDS.map(f => [f.key, { value: null, classification: "Engineer-entered", note: "" }])) as Stage5Inputs["values"], rotorConstruction: null, statorConstruction: null, flowArrangement: null, flowClassification: "Engineer-entered", flowNote: "", topHeadProfile: null, bottomHeadProfile: null, nozzles: [], notes: "" };
}

export const STAGE5_WATERMARK = "PRELIMINARY PRE-PILOT GEOMETRY & DRAWINGS — NOT FOR FABRICATION";
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));

/** Pure definition engine: no hydraulic or mass-transfer re-optimisation. */
export function buildStage5Geometry(basis: Stage5Basis, inputs: Stage5Inputs): Stage5Geometry {
  const parameters: Stage5Parameter[] = [];
  const dimensions: Record<string, number | null> = {};
  const checks: Stage5Check[] = [];
  const assumptions: string[] = [];
  const tbd: string[] = [];
  const check = (id: string, condition: boolean | null, message: string) =>
    checks.push({ id, status: condition === null ? "tbd" : condition ? "pass" : "fail", message });
  const put = (key: string, label: string, value: number | string | null, unit: string, classification: Stage5Classification, note = "") => {
    const v = typeof value === "number" && !finite(value) ? null : value;
    parameters.push({ key, label, value: v, unit, classification: v === null ? "TBD" : classification, note });
    if (typeof v !== "string") dimensions[key] = v;
    if (v === null) tbd.push(label);
  };
  for (const [key, value] of Object.entries(basis)) {
    if (key === "sourcesCurrent" || key === "sourcesCompatible") continue;
    put(key, key, value, key.endsWith("M") ? "m" : key.toLowerCase().includes("rpm") ? "rpm" : "", "Inherited", "Read-only Stage-3/4 authority");
  }
  for (const f of STAGE5_INPUT_FIELDS) {
    if (["bladeCount", "bladeHeightM", "bladeRadialLengthM", "bladeThicknessM", "hubDiameterM", "hubHeightM"].includes(f.key) && inputs.rotorConstruction !== "flat-blade-turbine") continue;
    if (f.key === "rotorThicknessM" && inputs.rotorConstruction !== "flat-disc") continue;
    const v = inputs.values?.[f.key];
    put(f.key, f.label, v?.value ?? null, f.unit, v?.classification ?? "TBD", v?.note ?? "");
    check(`classification-${f.key}`, v?.classification === "Assumed" || v?.classification === "Engineer-entered", `${f.label} must be explicitly classified Engineer-entered or Assumed.`);
    const flatHead = f.key === "topHeadDepthM" && inputs.topHeadProfile === "flat-envelope" || f.key === "bottomHeadDepthM" && inputs.bottomHeadProfile === "flat-envelope";
    check(`input-${f.key}`, v?.value == null ? null : finite(v.value) && (flatHead ? v.value === 0 : v.value > 0), `${f.label} must be ${flatHead ? "zero for a flat envelope" : "finite and positive"}.`);
    if (v?.classification === "Assumed" && v.value !== null) {
      assumptions.push(`${f.label}: ${v.value} ${f.unit}. ${v.note}`);
      check(`assumption-${f.key}`, !!v.note.trim(), `${f.label}: assumptions require an explicit rationale.`);
    }
  }
  const d = dimensions;
  for (const end of ["top", "bottom"] as const) {
    const profile = inputs[`${end}HeadProfile`] ?? null;
    put(`${end}HeadProfile`, `${end} head envelope profile`, profile, "", "Engineer-entered", "Envelope geometry only; no wall/head sizing claim.");
    check(`${end}-head-profile`, profile === null ? null : profile === "elliptical-envelope" || profile === "flat-envelope", `${end} head profile must be explicitly selected.`);
  }
  const flow = inputs.flowArrangement ?? null;
  const flowNote = inputs.flowNote?.trim() || inputs.notes.trim();
  put("flowArrangement", "Phase flow arrangement", flow, "", inputs.flowClassification ?? "Engineer-entered", flowNote);
  check("flow-arrangement", flow === null ? null : flow === "nmp-down-rrbo-up" || flow === "nmp-up-rrbo-down", "Explicit phase flow arrangement required.");
  check("flow-classification", flow === null ? null : inputs.flowClassification === "Engineer-entered" || inputs.flowClassification === "Assumed", "Flow arrangement must have explicit classification.");
  check("flow-note", flow === null ? null : !!flowNote, "Flow arrangement requires confirmation note or assumption rationale.");
  if (flow && inputs.flowClassification === "Assumed") assumptions.push(`Flow arrangement ${flow}: ${flowNote}`);
  const calc = (key: string, label: string, keys: string[], fn: (...v: number[]) => number, unit = "m", note = "") => {
    const values = keys.map(k => d[k]);
    put(key, label, values.every(finite) ? fn(...values as number[]) : null, unit, "Calculated", note);
  };
  const test = (id: string, keys: string[], fn: (...v: number[]) => boolean, message: string) =>
    check(id, keys.every(k => finite(d[k])) ? fn(...keys.map(k => d[k] as number)) : null, message);
  check("sources", basis.sourcesCurrent && basis.sourcesCompatible && !!basis.stage3ResultId && !!basis.stage4ResultId, "Stage-3/4 sources must be current, compatible and identified.");
  for (const key of ["columnDiameterM", "compartmentHeightM", "rotorDiameterM", "requiredActiveHeightM", "installedActiveHeightM", "selectedRpm", "rpmMin", "rpmMax"]) {
    test(`basis-${key}`, [key], v => v > 0, `${key} must be positive.`);
  }
  test("fixed-basis", ["designNt", "hetsM"], (n, h) => n === 7 && h === 1, "Fixed inherited design Nt = 7 and HETS = 1 m; no recalculation.");
  test("count", ["compartmentCount"], n => Number.isInteger(n) && n > 0 && n <= 1000, "Compartment count must be an integer 1–1000 (drawing engine bound).");
  test("stack", ["compartmentCount", "compartmentHeightM", "installedActiveHeightM"], (n, p, h) => near(n * p, h), "Count × pitch must agree with installed active height.");
  test("required", ["requiredActiveHeightM", "installedActiveHeightM", "designNt", "hetsM"], (r, i, n, h) => near(r, n * h) && i >= r, "Inherited required height must match Nt × HETS and fit installed height.");
  test("ratio", ["rotorDiameterM", "columnDiameterM", "rotorDiameterRatio"], (r, c, q) => q > 0 && q < 1 && near(r / c, q), "Inherited rotor diameter and ratio must agree.");
  test("rpm", ["selectedRpm", "rpmMin", "rpmMax"], (r, lo, hi) => lo <= r && r <= hi, "Selected RPM must lie in inherited operating window.");
  check("phase", basis.phaseConfiguration ? true : null, "Inherited phase orientation must be specified; flow routing is not inferred.");
  calc("columnAreaM2", "Column cross-sectional area", ["columnDiameterM"], c => Math.PI * c * c / 4, "m²");
  calc("shaftAreaM2", "Shaft projected area", ["shaftDiameterM"], s => Math.PI * s * s / 4, "m²");
  if (inputs.statorConstruction === "annular-single-opening") calc("statorOpeningDiameterM", "Central circular stator opening diameter", ["columnDiameterM", "shaftDiameterM", "statorFreeAreaRatio"], (c, s, f) => Math.sqrt(f * c * c + s * s));
  else put("statorOpeningDiameterM", "Central circular stator opening diameter", null, "m", "TBD");
  calc("statorNetOpenAreaM2", "Net opening area excluding shaft", ["statorOpeningDiameterM", "shaftDiameterM"], (o, s) => Math.PI * (o * o - s * s) / 4, "m²");
  calc("calculatedFreeAreaRatio", "Net stator free-area ratio", ["statorNetOpenAreaM2", "columnAreaM2"], (a, c) => a / c, "");
  calc("rotorWallClearanceM", "Rotor radial wall clearance", ["columnDiameterM", "rotorDiameterM"], (c, r) => (c - r) / 2);
  calc("shaftOpeningClearanceM", "Shaft to opening radial clearance", ["statorOpeningDiameterM", "shaftDiameterM"], (o, s) => (o - s) / 2);
  calc("statorRadialWidthM", "Stator annulus radial width", ["columnDiameterM", "statorOpeningDiameterM"], (c, o) => (c - o) / 2);
  if (inputs.rotorConstruction === "flat-blade-turbine") {
    calc("rotorAxialEnvelopeM", "Rotor axial envelope", ["bladeHeightM", "hubHeightM"], Math.max);
    test("blade-count", ["bladeCount"], n => Number.isInteger(n) && n >= 2 && n <= 64, "Blade count integer 2–64.");
    test("blade-reach", ["hubDiameterM", "bladeRadialLengthM", "rotorDiameterM", "bladeThicknessM"], (h, l, r, t) => near(Math.hypot(h + 2 * l, t), r), "Blade outer corner swept diameter sqrt((hub OD + 2 × blade radial length)² + blade thickness²) must equal inherited rotor OD.");
    test("hub-fit", ["shaftDiameterM", "hubDiameterM", "rotorDiameterM"], (s, h, r) => s < h && h < r, "Shaft < hub < rotor OD.");
    test("blade-spacing", ["bladeCount", "bladeThicknessM", "hubDiameterM"], (n, t, h) => t < h * Math.sin(Math.PI / n), "Adjacent blades must not overlap at hub.");
  } else if (inputs.rotorConstruction === "flat-disc") {
    calc("rotorAxialEnvelopeM", "Rotor axial envelope", ["rotorThicknessM"], r => r);
  } else put("rotorAxialEnvelopeM", "Rotor axial envelope", null, "m", "TBD");
  calc("rotorLowerClearanceM", "Rotor lower axial clearance", ["rotorOffsetM", "rotorAxialEnvelopeM", "statorThicknessM"], (o, r, s) => o - (r + s) / 2);
  calc("rotorUpperClearanceM", "Rotor upper axial clearance", ["compartmentHeightM", "rotorOffsetM", "rotorAxialEnvelopeM", "statorThicknessM"], (p, o, r, s) => p - o - (r + s) / 2);
  for (const key of ["rotorWallClearanceM", "shaftOpeningClearanceM", "statorRadialWidthM", "rotorLowerClearanceM", "rotorUpperClearanceM"]) {
    test(key, [key], v => v > 0, `${key} must be strictly positive.`);
  }
  test("rotor-fit", ["shaftDiameterM", "rotorDiameterM"], (s, r) => s < r, "Shaft must fit inside flat-disc rotor.");
  test("free-area", ["statorFreeAreaRatio", "calculatedFreeAreaRatio", "statorOpeningDiameterM", "columnDiameterM"], (f, a, o, c) => f > 0 && f < 1 && o < c && near(f, a), "Single central opening minus shaft projection / gross column area must reproduce inherited free area.");
  calc("activeStartM", "Active section start elevation", ["bottomHeadDepthM", "bottomDisengagementM"], (h, b) => h + b);
  calc("activeEndM", "Active section end elevation", ["activeStartM", "installedActiveHeightM"], (a, h) => a + h);
  calc("topTangentM", "Top tangent elevation", ["activeEndM", "topDisengagementM"], (a, t) => a + t);
  calc("vesselHeightM", "Vessel bottom to top envelope", ["topTangentM", "topHeadDepthM"], (a, h) => a + h);
  calc("overallHeightM", "Support to drive top envelope", ["supportHeightM", "vesselHeightM", "driveHeightM"], (s, v, h) => s + v + h);
  test("supports", ["lowerShaftSupportM", "upperShaftSupportM", "activeStartM", "activeEndM", "vesselHeightM", "statorThicknessM"], (lo, hi, a, b, v, t) => lo < a - t / 2 && hi > b + t / 2 && hi <= v && lo >= 0, "Preliminary shaft supports must bracket internals without intersecting terminal plates and remain in vessel envelope.");
  test("terminal-plates", ["bottomDisengagementM", "topDisengagementM", "statorThicknessM"], (b, t, s) => b > s / 2 && t > s / 2, "Terminal stator half-thickness must fit in disengagement regions.");
  const count = finite(d.compartmentCount) && Number.isInteger(d.compartmentCount) && d.compartmentCount > 0 && d.compartmentCount <= 1000 ? d.compartmentCount : 0;
  const compartments = Array.from({ length: count }, (_, i) => {
    const bottomM = finite(d.activeStartM) && finite(d.compartmentHeightM) ? d.activeStartM + i * d.compartmentHeightM : null;
    const topM = bottomM !== null && finite(d.compartmentHeightM) ? bottomM + d.compartmentHeightM : null;
    const rotorM = bottomM !== null && finite(d.rotorOffsetM) ? bottomM + d.rotorOffsetM : null;
    for (const [suffix, value] of [["bottom", bottomM], ["top", topM], ["rotor", rotorM]] as const) put(`compartment${i + 1}-${suffix}`, `Compartment ${i + 1} ${suffix} elevation`, value, "m", "Calculated");
    return { index: i + 1, bottomM, topM, rotorM, statorM: topM };
  });
  const statorElevations = count ? [compartments[0].bottomM, ...compartments.map(c => c.topM)] : [];
  const nozzles = inputs.nozzles.map(n => ({ ...n }));
  check("nozzle-schedule", nozzles.length ? true : null, "Process connections, drain, vent, sampling and instruments must be defined.");
  for (const service of ["feed", "outlet", "drain", "vent", "sample", "instrument"]) {
    check(`service-${service}`, nozzles.some(n => n.service.toLowerCase().includes(service)) ? true : null, `Confirm ${service} connection in preliminary schedule.`);
  }
  for (const n of nozzles) {
    const prefix = `nozzle-${n.id}`;
    check(`${prefix}-identity`, !!n.id.trim() && !!n.service.trim() && nozzles.filter(x => x.id === n.id).length === 1, "Nozzle IDs must be nonempty, unique and have a service.");
    for (const key of ["elevationM", "boreM", "azimuthDeg"] as const) put(`${prefix}-${key}`, `${n.id} ${n.service} ${key}`, n[key], key === "azimuthDeg" ? "deg" : "m", n.classification, n.note);
    if (n.classification === "Assumed") {
      assumptions.push(`${n.id}: ${n.note}`);
      check(`${prefix}-assumption`, !!n.note.trim(), "Assumed nozzle dimensions require a rationale.");
    }
    const bounds = n.region === "bottom" ? [d.bottomHeadDepthM, d.activeStartM] : n.region === "active" ? [d.activeStartM, d.activeEndM] : n.region === "top" ? [d.activeEndM, d.topTangentM] : [null, null];
    check(`${prefix}-fit`, [n.elevationM, n.boreM, n.azimuthDeg, d.columnDiameterM, ...bounds].every(finite)
      ? n.boreM! > 0 && n.boreM! < d.columnDiameterM! && n.azimuthDeg! >= 0 && n.azimuthDeg! < 360 && n.elevationM! - n.boreM! / 2 >= bounds[0]! && n.elevationM! + n.boreM! / 2 <= bounds[1]!
      : null, `${n.id}: full bore must lie in assigned straight-shell region; azimuth 0–<360°.`);
    check(`${prefix}-stator-clash`, [n.elevationM, n.boreM, d.statorThicknessM, ...statorElevations].every(finite) && count > 0
      ? statorElevations.every(z => Math.abs(n.elevationM! - z!) > (n.boreM! + d.statorThicknessM!) / 2) : null, `${n.id}: bore must not intersect a wall-mounted stator plate.`);
  }
  for (let i = 0; i < nozzles.length; i++) for (let j = i + 1; j < nozzles.length; j++) {
    const a = nozzles[i], b = nozzles[j];
    check(`nozzle-clash-${a.id}-${b.id}`, [a.elevationM, b.elevationM, a.boreM, b.boreM, a.azimuthDeg, b.azimuthDeg, d.columnDiameterM].every(finite)
      ? Math.hypot(a.elevationM! - b.elevationM!, d.columnDiameterM! * Math.sin((a.azimuthDeg! - b.azimuthDeg!) * Math.PI / 360)) > (a.boreM! + b.boreM!) / 2 : null, `${a.id}/${b.id}: preliminary shell-bore clash check (reinforcement and flange envelopes TBD).`);
  }
  const rotorType = inputs.rotorConstruction === "flat-blade-turbine" ? "Preliminary radial flat-blade turbine (unqualified proposal)" : inputs.rotorConstruction === "flat-disc" ? "Preliminary flat disc alternative (not source-qualified Kühni impeller)" : "TBD — rotor construction not selected";
  const statorType = inputs.statorConstruction === "annular-single-opening" ? "Preliminary wall-mounted annular plate, single concentric circular opening" : "TBD — stator construction not selected";
  check("rotor-construction", inputs.rotorConstruction === "flat-blade-turbine" || inputs.rotorConstruction === "flat-disc" ? true : null, "Engineer must explicitly select rotor proposal; hydraulic equivalence is not established.");
  check("stator-construction", inputs.statorConstruction === "annular-single-opening" ? true : null, "Engineer must explicitly select stator opening construction.");
  if (!inputs.rotorConstruction) tbd.push("Rotor construction selection");
  if (!inputs.statorConstruction) tbd.push("Stator construction selection; opening calculations are conditional annular proposal only");
  put("rotorType", "Rotor construction", inputs.rotorConstruction ? rotorType : null, "", "Engineer-entered", "Geometry proposal only; hydraulic equivalence and attachment detail require review.");
  put("statorType", "Stator construction", inputs.statorConstruction ? statorType : null, "", "Engineer-entered", "N+1 boundary plates define N compartments; no unquantified peripheral bypass.");
  assumptions.push("Selected construction proposals have not been verified as hydraulically equivalent to the source Kühni correlation.", "N+1 stator boundary plates; rotor centres use the entered offset; elevations from vessel bottom. Shaft occupies the entire central opening projection.");
  const engineeringBoundary = "No pressure-vessel wall/head sizing, shaft strength/deflection/critical-speed, bearings/seal selection, motor/gearbox adequacy or structural/support verification performed.";
  const engineeringExclusions = ["Wall/head thickness and pressure-vessel mechanical design", "Rotor/shaft attachment, stator mounting and fabrication details", "Shaft strength, deflection, critical speed, bearings/seals and drive mechanical adequacy", "Nozzle neck, flange, reinforcement, projection and external pipe routing; clash check covers shell bores only", "Support structural design"];
  return {
    basis: { ...basis }, inputs: { ...inputs, values: Object.fromEntries(STAGE5_INPUT_FIELDS.map(f => [f.key, { ...inputs.values[f.key] }])) as Stage5Inputs["values"], nozzles, notes: inputs.notes },
    parameters, dimensions, checks, assumptions, tbd, complete: checks.every(c => c.status === "pass") && tbd.length === 0,
    rotorType, statorType, freeAreaDefinition: "Net free area = (central circular opening area − shaft projected area) / gross column cross-sectional area; no peripheral bypass.",
    compartments, nozzles,
    internals: [
      { id: "R", type: rotorType, count: count || null, diameterM: d.rotorDiameterM, thicknessM: d.rotorAxialEnvelopeM, elevationsM: compartments.map(c => c.rotorM) },
      { id: "S", type: statorType, count: count ? count + 1 : null, diameterM: d.columnDiameterM, thicknessM: d.statorThicknessM, elevationsM: statorElevations },
      { id: "SH", type: "Shaft envelope; mechanical design TBD", count: 1, diameterM: d.shaftDiameterM, thicknessM: null, elevationsM: [d.lowerShaftSupportM, d.upperShaftSupportM] },
    ], watermark: STAGE5_WATERMARK, engineeringBoundary, engineeringExclusions,
  };
}