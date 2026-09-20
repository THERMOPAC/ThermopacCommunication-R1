import {
  emptyStage5Inputs, STAGE5_INPUT_FIELDS,
  type Stage5Basis, type Stage5Geometry, type Stage5Parameter, type Stage5NozzleInput,
} from "./ecr-stage5-geometry";

export const R1_RULESET = "ECR_KUHNI_PREPILOT_GEOMETRY_RULESET_R1";
export const R2_RULESET = "ECR_KUHNI_PREPILOT_GEOMETRY_RULESET_R2_ADOPTED_COMPARTMENT_EFFICIENCY";
export const R1_COMPLETE = "SYSTEM-GENERATED PRE-PILOT GEOMETRY — GEOMETRICALLY COMPLETE";
export const R1_WATERMARK = "PRELIMINARY PRE-PILOT GEOMETRY — NOT FOR FABRICATION";
/** Frozen approved revision manifest, persisted and hashed alongside each result.
 * These are engineering rules, not a claim of empirical/mechanical qualification. */
export const R1_RULES_MANIFEST = {
  id: R1_RULESET, revision: 1, units: "m, m², rpm, degrees; vessel bottom datum",
  authority: "Frozen Stage3/4 values unchanged; no recalculation or feedback",
  evidence: { A: "Frozen Stage3/4 authority", B: "Documented reference construction family", C: "Approved R1 engineering geometry" },
  rules: {
    opening: "do=D*sqrt(phi_s); gross=(do/D)^2; net=(do^2-ds^2)/D^2; no feedback",
    shaft: "ds=(10/45)DR; lower=hB+LB/2; upper=HV+D/4",
    stator: "ts=min(D/160,hc/20); N+1 shared boundaries including terminal rings",
    rotor: "six blades; HR=min((7/45)DR,0.60(hc-ts)); dh=1.60ds; Hh=.80HR; tb=min(DR/90,HR/10,dh/12); Lb=(sqrt(DR²-tb²)-dh)/2",
    step: "inner Lb/2 height HR/2; outer Lb/2 height HR; symmetric axial profile; azimuths 0,60,120,180,240,300",
    stack: "rotor centres z0+(i+.5)hc; stators z0+i hc; z0=1.25D; HA=N hc",
    endzones: "LB=LT=D; no residence-time claim",
    heads: "2:1 ellipse; radial semiaxis D/2; axial semiaxis D/4; straight flange zero",
    supports: "skirt D diameter D/2 height; access .30D by .25D at z=-.25D, azimuth0; supports at hB+LB/2,z1+LT/2; arms azimuth30,150,270 width.02D depth.04D span .75ds to D/2; housingOD1.5ds height.04D",
    drive: "sealOD2ds height.10D at HV; pedestalOD D/2 heightD/4; bodyOD D/2 height3D/4; totalheightD",
    routing: "NMP down/RRBO up; frozen phase continuity unchanged",
    connections: "process bore D/10; drain/vent/flush/equalization D/25; sample/instrument D/40; OD1.20bore; projectionD/10",
    schedule: "P01 lower .60 0; P02 lower .40 180; P03 upper .40 180; P04 upper .60 0; A01 lower .20 270; A02 upper .80 270; S01 lower .80 90; S02 upper .20 90; I01 lower .30 45; I02 upper .30 45; D01 bottom pole down; V01 top head r=.30D azimuth315 up",
    intersections: "Exact ellipsoid/cylinder boundary; full OD neck and projected envelope clearances; intended shaft/hub/support/drive interfaces excluded from clashes",
  },
  exclusions: "Fabrication, structural and shaft-dynamic qualification, hydraulic nozzle sizing and disengagement performance; no user-entered dimensions",
} as const;
export const R2_RULES_MANIFEST = {
  ...R1_RULES_MANIFEST,
  id: R2_RULESET,
  revision: 2,
  authority: "Frozen Stage3 geometry and Stage4 adopted 40% compartment-efficiency sizing unchanged; no recalculation or feedback",
  rules: {
    ...R1_RULES_MANIFEST.rules,
    stack: "N=ceil(7/0.40); HA=N hc; rotor centres z0+(i+.5)hc; stators z0+i hc; z0=1.25D",
  },
} as const;
export const R3_RULESET = "ECR_KUHNI_PREPILOT_GEOMETRY_RULESET_R3_ADOPTED_COMPARTMENT_EFFICIENCY_ETA0.35";
export const R3_RULES_MANIFEST = {
  ...R1_RULES_MANIFEST,
  id: R3_RULESET,
  revision: 3,
  authority: "Frozen Stage3 geometry and Stage4 adopted 35% compartment-efficiency sizing unchanged; no recalculation or feedback",
  rules: {
    ...R1_RULES_MANIFEST.rules,
    stack: "N=ceil(7/0.35); HA=N hc; rotor centres z0+(i+.5)hc; stators z0+i hc; z0=1.25D",
  },
} as const;
export class R1GeometryError extends Error {
  readonly status = 409;
  constructor(public checkId: string, detail: string) {
    super(`R1_GEOMETRY_INCOMPATIBLE: ${checkId}: ${detail}`);
  }
}
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** Pure, deterministic approved layout rules. No optimizer imports, feedback or user inputs.
 * C-class quantities are engineering envelopes, never fabrication/strength qualifications. */
export function buildStage5R1Geometry(source: Stage5Basis): Stage5Geometry {
  const b = { ...source };
  const efficiencySizing = b.sizingMethod === "ADOPTED_COMPARTMENT_EFFICIENCY";
  const ruleset = efficiencySizing ? R3_RULESET : R1_RULESET;
  const checks: Stage5Geometry["checks"] = [];
  const check = (id: string, ok: boolean, message: string) => {
    if (!ok) throw new R1GeometryError(id, message);
    checks.push({ id, status: "pass", message });
  };
  check("authority", b.sourcesCurrent === true && b.sourcesCompatible === true &&
    !!b.stage3ResultId && !!b.stage4ResultId, "Frozen sources must be identified, current and compatible.");
  const keys = ["columnDiameterM", "rotorDiameterM", "rotorDiameterRatio", "compartmentHeightM",
    "compartmentCount", "installedActiveHeightM", "requiredActiveHeightM", "designNt",
    "selectedRpm", "rpmMin", "rpmMax", "statorFreeAreaRatio"] as const;
  for (const key of keys) check(key, typeof b[key] === "number" && Number.isFinite(b[key]) && b[key]! > 0, `${key} must be finite and positive.`);
  const D = b.columnDiameterM!, Dr = b.rotorDiameterM!, hc = b.compartmentHeightM!;
  const N = b.compartmentCount!, HA = b.installedActiveHeightM!, phi = b.statorFreeAreaRatio!;
  check("count", Number.isSafeInteger(N) && N <= 1000, "Positive integer count; drawing capacity 1000 compartments.");
  check("stack", near(N * hc, HA), "Frozen count × pitch must equal frozen installed height; no repair.");
  if (efficiencySizing) {
    check("sizing-method", b.designNt === 7 && b.designCompartmentEfficiency === .35,
      "Frozen adopted sizing basis must be Nt=7 and compartment efficiency=0.35.");
    check("count-efficiency", N === Math.ceil(b.designNt! / b.designCompartmentEfficiency!),
      "Frozen count must equal ceil(Nt / adopted compartment efficiency).");
    check("height", near(b.requiredActiveHeightM!, HA),
      "Frozen required and installed heights must both equal count × pitch.");
    check("implied-hets-diagnostic",
      typeof b.impliedInstalledHetsMPerTheoreticalStage === "number"
      && Number.isFinite(b.impliedInstalledHetsMPerTheoreticalStage)
      && near(b.impliedInstalledHetsMPerTheoreticalStage, HA / b.designNt!),
      "Implied installed HETS must equal installed height / Nt and remains diagnostic only.");
  } else {
    check("hetsM", typeof b.hetsM === "number" && Number.isFinite(b.hetsM) && b.hetsM > 0,
      "Legacy HETS must be finite and positive.");
    check("height", near(b.requiredActiveHeightM!, b.designNt! * b.hetsM!) && HA >= b.requiredActiveHeightM!,
      "Frozen required height must agree with Nt × HETS and fit installed height.");
  }
  check("rotor-ratio", Dr < D && near(Dr / D, b.rotorDiameterRatio!), "Frozen rotor diameter/ratio must agree and fit column.");
  check("rpm", b.rpmMin! <= b.selectedRpm! && b.selectedRpm! <= b.rpmMax!, "Frozen selected RPM must lie inside frozen window.");
  check("phase", typeof b.phaseConfiguration === "string" && !!b.phaseConfiguration.trim(), "Frozen phase continuity is required.");
  check("phi-domain", phi > 0 && phi < 1, "Empirical free-area input must be between zero and one.");

  const opening = D * Math.sqrt(phi), shaft = 10 / 45 * Dr;
  const ts = Math.min(D / 160, hc / 20), H = Math.min(7 / 45 * Dr, .60 * (hc - ts));
  const hub = 1.6 * shaft, hubH = .8 * H, tb = Math.min(Dr / 90, H / 10, hub / 12);
  const bladeL = (Math.sqrt(Dr * Dr - tb * tb) - hub) / 2;
  const z0 = 1.25 * D, z1 = z0 + HA, zT = z1 + D, vessel = zT + D / 4;
  const lower = .75 * D, upper = z1 + D / 2, shaftTop = vessel + D / 4;
  const bladeAzimuthsDeg = [0, 60, 120, 180, 240, 300];
  const supportAzimuthsDeg = [30, 150, 270];
  const d: Record<string, number> = {};
  const p: Stage5Parameter[] = [];
  const put = (key: string, value: number | string, unit: string, evidenceClass: "A" | "B" | "C", note: string) => {
    if (typeof value === "number") {
      check(`finite-${key}`, Number.isFinite(value), `${key} must be finite.`);
      d[key] = value;
    }
    p.push({ key, label: key, value, unit, evidenceClass,
      classification: evidenceClass === "A" ? "Inherited" : "System-generated",
       note: `${ruleset}; Class ${evidenceClass}. ${note}` });
  };
  for (const [key, value] of Object.entries(b)) if (typeof value === "number" || typeof value === "string")
    put(key, value, key.endsWith("M") ? "m" : key.toLowerCase().includes("rpm") ? "rpm" : "", "A", "Exact frozen Stage-3/4 authority; scientific status unchanged.");
  const rules: [string, number, string][] = [
    ["shaftDiameterM", shaft, "(10/45) DR; reference-inspired scaling, not strength qualification."],
    ["statorThicknessM", ts, "min(D/160,hc/20); geometric plate envelope."],
    ["bladeCount", 6, "Garthe reference construction family, Table A.1."],
    ["bladeHeightM", H, "min((7/45) DR,0.60(hc-ts)); reference-inspired clearance-capped envelope."],
    ["hubDiameterM", hub, "1.60 ds; attachment envelope."],
    ["hubHeightM", hubH, "0.80 HR; within rotor envelope."],
    ["bladeThicknessM", tb, "min(DR/90,HR/10,dh/12); envelope only."],
    ["bladeRadialLengthM", bladeL, "(sqrt(DR²-tb²)-dh)/2; exact outer-corner swept diameter."],
    ["bladeInnerSegmentLengthM", bladeL / 2, "Lb/2; approved R1 stepped approximation, not exact reference reproduction."],
    ["bladeOuterSegmentLengthM", bladeL / 2, "Lb/2; approved R1 stepped approximation."],
    ["bladeInnerSegmentHeightM", H / 2, "HR/2, centred about rotor midplane."],
    ["bladeOuterSegmentHeightM", H, "HR, centred about rotor midplane."],
    ["rotorOffsetM", hc / 2, "hc/2; centred rotor."],
    ["bottomDisengagementM", D, "D; packaging allocation, not separation-time qualification."],
    ["topDisengagementM", D, "D; packaging allocation, not separation-time qualification."],
    ["bottomHeadDepthM", D / 4, "D/4; 2:1 ellipsoidal internal envelope."],
    ["topHeadDepthM", D / 4, "D/4; 2:1 ellipsoidal internal envelope."],
    ["headStraightFlangeM", 0, "Zero in R1 internal envelope model."],
    ["supportHeightM", D / 2, "D/2; skirt below vessel datum."],
    ["skirtDiameterM", D, "D; centred cylindrical envelope."],
    ["skirtAccessWidthM", .30 * D, "0.30D; access opening at azimuth zero."],
    ["skirtAccessHeightM", .25 * D, "0.25D; access opening."],
    ["skirtAccessElevationM", -.25 * D, "-0.25D; centre elevation."],
    ["lowerShaftSupportM", lower, "hB+LB/2."],
    ["upperShaftSupportM", upper, "z1+LT/2."],
    ["supportArmWidthM", .02 * D, "0.02D; tangential width, three arms at 30/150/270 degrees."],
    ["supportArmDepthM", .04 * D, "0.04D; axial depth."],
    ["supportHousingDiameterM", 1.5 * shaft, "1.5ds; central envelope."],
    ["supportHousingHeightM", .04 * D, "0.04D; central envelope."],
    ["supportArmRadialStartM", .75 * shaft, "0.75ds; housing surface."],
    ["supportArmRadialEndM", D / 2, "D/2; shell interface."],
    ["shaftLowerTerminationM", lower, "Lower support centre."],
    ["shaftUpperTerminationM", shaftTop, "HV+D/4; drive engagement."],
    ["shaftLengthM", shaftTop - lower, "Upper minus lower termination."],
    ["sealElevationM", vessel, "Top pole; coaxial with shaft."],
    ["sealDiameterM", 2 * shaft, "2ds; reserved housing, not product selection."],
    ["sealHeightM", .10 * D, "0.10D above top pole."],
    ["drivePedestalDiameterM", D / 2, "D/2; coaxial reserved envelope."],
    ["drivePedestalHeightM", D / 4, "D/4 above top pole."],
    ["driveBodyDiameterM", D / 2, "D/2; reserved envelope."],
    ["driveBodyHeightM", .75 * D, "3D/4 above pedestal."],
    ["driveHeightM", D, "D including pedestal; not gearbox adequacy."],
    ["statorOpeningDiameterM", opening, "D sqrt(phi_s); gross opening convention, no shaft compensation."],
    ["columnAreaM2", Math.PI * D * D / 4, "pi D²/4."],
    ["shaftAreaM2", Math.PI * shaft * shaft / 4, "pi ds²/4."],
    ["statorGrossOpenAreaM2", Math.PI * opening * opening / 4, "pi do²/4."],
    ["statorNetOpenAreaM2", Math.PI * (opening * opening - shaft * shaft) / 4, "pi(do²-ds²)/4; no upstream feedback."],
    ["grossFreeAreaRatio", (opening / D) ** 2, "(do/D)² = phi_s."],
    ["shaftBlockedFreeAreaRatio", (opening * opening - shaft * shaft) / (D * D), "(do²-ds²)/D²; separate physical report."],
    ["calculatedFreeAreaRatio", (opening / D) ** 2, "Gross ratio, not legacy net-area convention."],
    ["rotorWallClearanceM", (D - Dr) / 2, "(D-DR)/2."],
    ["shaftOpeningClearanceM", (opening - shaft) / 2, "(do-ds)/2."],
    ["statorRadialWidthM", (D - opening) / 2, "(D-do)/2."],
    ["rotorAxialEnvelopeM", H, "Full outer blade axial height."],
    ["rotorLowerClearanceM", (hc - ts - H) / 2, "(hc-ts-HR)/2."],
    ["rotorUpperClearanceM", (hc - ts - H) / 2, "(hc-ts-HR)/2."],
    ["activeStartM", z0, "hB+LB."], ["activeEndM", z1, "z0+HA."],
    ["topTangentM", zT, "z1+LT."], ["vesselHeightM", vessel, "HA+2.5D."],
    ["overallHeightM", HA + 4 * D, "Support+vessel+drive = HA+4D."],
  ];
  for (const [key, value, note] of rules) put(key, value,
    key.endsWith("M2") ? "m²" : key.endsWith("M") ? "m" : "", key === "bladeCount" ? "B" : "C", note);
  put("rotorThicknessM", "Not applicable — stepped rotor, not flat disc", "", "C", "Explicit N/A, no missing construction dimension.");
  put("rotorConstruction", "R1 six-blade stepped rotor", "", "C", "Reference-inspired family; explicitly approved engineering approximation.");
  put("statorConstruction", "Annular single central opening", "", "B", "Garthe / Weber–Jupke reference family.");
  put("flowArrangement", "nmp-down-rrbo-up", "", "C", "Explicit application layout; continuity and upstream hydraulics unchanged.");
  put("headProfiles", "2:1 ellipsoidal", "", "C", "Internal envelope only.");
  put("bladeAzimuthsDeg", bladeAzimuthsDeg.join(", "), "deg", "C", "Six equally spaced blades; same clocking in every compartment.");
  put("supportAzimuthsDeg", supportAzimuthsDeg.join(", "), "deg", "C", "Approved three-arm support clocking.");
  put("skirtAccessAzimuthDeg", 0, "deg", "C", "Approved skirt access orientation.");
  put("designEnvelope", "hc/D 0.20–0.30; DR/D 0.33–0.50; phi_s 0.20–0.40", "", "B",
    "Perry 8e p15-83 → Pratt–Stevens; advisory, never clamp inherited geometry.");
  const inputs = emptyStage5Inputs();
  for (const f of STAGE5_INPUT_FIELDS) inputs.values[f.key] = {
    value: d[f.key] ?? null, classification: "System-generated",
     note: p.find(x => x.key === f.key)?.note ?? ruleset,
  };
  Object.assign(inputs, { rotorConstruction: "r1-stepped-rotor", statorConstruction: "annular-single-opening",
    flowArrangement: "nmp-down-rrbo-up", flowClassification: "System-generated",
    flowNote: "Class C approved NMP-down / RRBO-up layout; not inferred from continuity.",
    topHeadProfile: "elliptical-envelope", bottomHeadProfile: "elliptical-envelope",
     notes: `${ruleset}; system-generated; no normal-user construction inputs.` });
  const nozzles: Stage5NozzleInput[] = [];
  const shell: [string, string, "bottom" | "top", number, number, number][] = [
    ["P01", "RRBO feed", "bottom", .6, 0, 10], ["P02", "NMP-rich extract outlet", "bottom", .4, 180, 10],
    ["P03", "NMP feed", "top", .4, 180, 10], ["P04", "RRBO-rich raffinate outlet", "top", .6, 0, 10],
    ["A01", "Low-shell flush", "bottom", .2, 270, 25], ["A02", "High-shell equalization", "top", .8, 270, 25],
    ["S01", "Lower sample connection", "bottom", .8, 90, 40], ["S02", "Upper sample connection", "top", .2, 90, 40],
    ["I01", "Lower instrument connection", "bottom", .3, 45, 40], ["I02", "Upper instrument connection", "top", .3, 45, 40],
  ];
  for (const [id, service, region, f, azimuthDeg, divisor] of shell) nozzles.push({
    id, service, region, elevationM: (region === "bottom" ? D / 4 : z1) + f * D,
    boreM: D / divisor, azimuthDeg, axis: "radial", radialOffsetM: D / 2,
    classification: "System-generated", note: `${ruleset}; C: bore D/${divisor}; zone fraction ${f}; geometric allowance, not hydraulic/DN sizing.`,
  });
  nozzles.push(
    { id: "D01", service: "Bottom-head drain", region: "bottom-head", elevationM: 0, boreM: D / 25,
      azimuthDeg: null, axis: "down", radialOffsetM: 0, classification: "System-generated",
      note: `${ruleset}; C: bottom-pole axial drain; azimuth N/A.` },
    { id: "V01", service: "Top-head crown-region vent", region: "top-head", elevationM: zT + .20 * D,
      boreM: D / 25, azimuthDeg: 315, axis: "up", radialOffsetM: .30 * D, classification: "System-generated",
      note: `${ruleset}; C: r=0.30D, ellipsoidal surface z=zT+0.20D; not absolute-high-point or vent-duty qualification.` },
  );
  // Exact extremal heights of the cylinder/ellipsoid intersection, not straight-shell bounds.
  const topSurface = (r: number) => zT + D / 4 * Math.sqrt(1 - (2 * r / D) ** 2);
  for (const n of nozzles) {
    n.outsideDiameterM = 1.2 * n.boreM!;
    n.projectionM = D / 10;
    if (n.axis === "up") {
      const r = n.radialOffsetM!, radius = n.outsideDiameterM / 2;
      check(`head-${n.id}-radial-fit`, r + radius < D / 2, "Entire neck cylinder fits ellipsoidal head.");
      n.surfaceEdgeElevationMinM = topSurface(r + radius);
      n.surfaceEdgeElevationMaxM = topSurface(r - radius);
    } else if (n.axis === "down") {
      n.surfaceEdgeElevationMinM = 0;
      n.surfaceEdgeElevationMaxM = D / 4 * (1 - Math.sqrt(1 - (n.outsideDiameterM / D) ** 2));
    }
    for (const [key, value] of Object.entries(n)) if (typeof value === "number")
      put(`${n.id}-${key}`, value, key === "azimuthDeg" ? "deg" : "m", "C", n.note);
  }
  inputs.nozzles = nozzles;
  const compartments = Array.from({ length: N }, (_, i) => ({
    index: i + 1, bottomM: z0 + i * hc, topM: z0 + (i + 1) * hc,
    rotorM: z0 + (i + .5) * hc, statorM: z0 + (i + 1) * hc,
  }));
  const plates = [z0, ...compartments.map(c => c.topM)];
  for (const c of compartments) for (const key of ["bottomM", "topM", "rotorM"] as const)
    put(`compartment${c.index}-${key}`, c[key], "m", "C", "Frozen pitch/count plus R1 datum; no independent drawing recalculation.");
  check("shaft-opening", shaft < opening && opening < D, "Shaft must fit gross opening and opening must fit column.");
  check("hub-fit", shaft < hub && hub < Dr && bladeL > 0, "Shaft < hub < rotor and positive radial reach.");
  check("blade-spacing", tb < hub * Math.sin(Math.PI / 6), "Six blade roots do not overlap.");
  check("swept-diameter", near(Math.hypot(hub + 2 * bladeL, tb), Dr), "Actual outer-corner sweep equals frozen diameter.");
  check("axial-clearance", hc - ts - H > 0 && D > ts / 2, "Rotor/plates clear; terminal half-plates fit end zones.");
  check("gross-area", near(d.grossFreeAreaRatio, phi) && d.shaftBlockedFreeAreaRatio > 0, "Gross phi equals frozen empirical input; net reported separately.");
  check("supports", lower + .02 * D < z0 - ts / 2 && upper - .02 * D > z1 + ts / 2 &&
    lower - .02 * D > D / 4 && upper + .02 * D < zT, "Full support axial envelopes bracket stack inside straight shell.");
  check("drive-seal-fit", 2 * shaft < D / 2 && .1 * D < D / 4,
    "Seal reserved envelope fits drive pedestal; shaft deliberately engages seal, supports and drive.");
  check("skirt-drain", D / 10 < D / 2 && D / 25 * 1.2 < D,
    "Drain neck fits inside skirt and remains above ground.");
  // Connections are outside the shell; full neck OD (not just bore) is checked.
  // Shared shaft/hub/support/pedestal interfaces are intentional connections, not collisions.
  const shells = nozzles.filter(n => n.axis === "radial");
  for (const n of shells) {
    const radius = n.outsideDiameterM! / 2, z = n.elevationM!;
    const lo = n.region === "bottom" ? D / 4 : z1, hi = n.region === "bottom" ? z0 : zT;
    check(`${n.id}-region-envelope`, z - radius > lo && z + radius < hi, "Full neck OD lies in assigned straight-shell zone.");
    check(`${n.id}-internals-envelope`, plates.every(pz => Math.abs(z - pz) > radius + ts / 2) &&
      [lower, upper].every(sz => Math.abs(z - sz) > radius + .02 * D),
      "Full neck envelope is axially disjoint from every stator and all support arms/housing.");
  }
  for (let i = 0; i < shells.length; i++) for (let j = i + 1; j < shells.length; j++) {
    const a = shells[i], c = shells[j];
    // Radially outward segments cannot approach more closely than their root
    // distance for equal root radius. This bounds the complete stub envelopes.
    const distance = Math.hypot(a.elevationM! - c.elevationM!,
      D * Math.sin((a.azimuthDeg! - c.azimuthDeg!) * Math.PI / 360));
    check(`${a.id}-${c.id}-stub-envelope`, distance > (a.outsideDiameterM! + c.outsideDiameterM!) / 2,
      "Complete outward neck envelopes are disjoint (not merely bore openings).");
  }
  const vent = nozzles.find(n => n.id === "V01")!, vr = vent.outsideDiameterM! / 2;
  check("vent-drive-seal-envelope", vent.radialOffsetM! - vr > Math.max(D / 4, shaft),
    "Vertical vent cylinder clears full drive/pedestal/seal radial envelopes.");
  check("head-connections-internals", vent.surfaceEdgeElevationMinM! > upper + .02 * D &&
    nozzles.find(n => n.id === "D01")!.surfaceEdgeElevationMaxM! < lower - .02 * D,
    "Actual ellipsoid/neck intersection envelopes clear internal supports and shaft lower termination.");
  check("head-shell-connections", shells.every(n => n.region === "bottom"
    ? n.elevationM! - n.outsideDiameterM! / 2 > D / 4
    : n.elevationM! + n.outsideDiameterM! / 2 < zT),
    "Head connections and straight-shell stubs are axially disjoint.");
  const rotorType = "R1 six-blade stepped rotor — Class C reference-inspired approximation";
  const statorType = "Annular ring stator — single gross central opening";
  const a = hub / 2, m = a + bladeL / 2, r = a + bladeL;
  const profileM: [number, number][] = [[a,-H/4],[m,-H/4],[m,-H/2],[r,-H/2],[r,H/2],[m,H/2],[m,H/4],[a,H/4]];
  const rotate = (x: number, y: number, angle: number): [number, number] => {
    const t = angle * Math.PI / 180;
    return [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
  };
  const rectangle = (inner: number, outer: number, width: number, angle: number) =>
    [[inner,-width/2],[outer,-width/2],[outer,width/2],[inner,width/2]].map(([x,y]) => rotate(x,y,angle));
  const r1Model: NonNullable<Stage5Geometry["r1Model"]> = {
    bladeAzimuthsDeg, supportAzimuthsDeg,
    rotor: {
      profileM, oppositeProfileM: profileM.map(([x,z]) => [-x,z]),
      blades: bladeAzimuthsDeg.map(azimuthDeg => ({
        azimuthDeg, footprintM: rectangle(a,r,tb,azimuthDeg),
        verticesM: [-tb/2,tb/2].flatMap(y => profileM.map(([x,z]) => {
          const [xx,yy] = rotate(x,y,azimuthDeg); return [xx,yy,z] as [number,number,number];
        })),
      })),
      hub: { diameterM: hub, heightM: hubH }, sweptDiameterM: Dr, shaftDiameterM: shaft,
    },
    heads: [
      { end: "bottom", tangentM: D/4, radialSemiaxisM: D/2, axialSemiaxisM: D/4, poleM: 0 },
      { end: "top", tangentM: zT, radialSemiaxisM: D/2, axialSemiaxisM: D/4, poleM: vessel },
    ],
    supports: [lower,upper].map(elevationM => ({
      elevationM, housingDiameterM: 1.5*shaft, housingHeightM: .04*D,
      arms: supportAzimuthsDeg.map(azimuthDeg => ({
        azimuthDeg, footprintM: rectangle(.75*shaft,D/2,.02*D,azimuthDeg),
        bottomM: elevationM-.02*D, topM: elevationM+.02*D,
      })),
    })),
    envelopes: [
      { id: "skirt", diameterM: D, bottomM: -D/2, topM: 0 },
      { id: "drive-pedestal", diameterM: D/2, bottomM: vessel, topM: vessel+D/4 },
      { id: "drive-body", diameterM: D/2, bottomM: vessel+D/4, topM: vessel+D },
      { id: "seal", diameterM: 2*shaft, bottomM: vessel, topM: vessel+.1*D },
      { id: "shaft", diameterM: shaft, bottomM: lower, topM: shaftTop },
    ],
    skirtAccess: { widthM: .30*D, heightM: .25*D, elevationM: -.25*D, azimuthDeg: 0 },
    connections: nozzles.map(n => {
      const [x,y] = rotate(n.radialOffsetM!,0,n.azimuthDeg ?? 0), z = n.elevationM!;
      const centreM: [number,number,number] = [x,y,z];
      const endM: [number,number,number] = n.axis === "radial"
        ? [...rotate(n.radialOffsetM!+n.projectionM!,0,n.azimuthDeg!),z]
        : [x,y,z+(n.axis==="up"?1:-1)*n.projectionM!];
      const surfaceBoundaryM: [number,number,number][] = [];
      if (n.axis !== "radial") for(let i=0;i<64;i++) {
        const t=i*Math.PI/32, xx=x+n.outsideDiameterM!/2*Math.cos(t), yy=y+n.outsideDiameterM!/2*Math.sin(t);
        const rr=Math.hypot(xx,yy);
        surfaceBoundaryM.push([xx,yy,n.axis==="up"?topSurface(rr):D/4*(1-Math.sqrt(1-(2*rr/D)**2))]);
      }
      return { id:n.id,axis:n.axis!,centreM,endM,outsideDiameterM:n.outsideDiameterM!,surfaceBoundaryM };
    }),
  };
  return {
    ruleset, completionStatement: R1_COMPLETE, r1Model, basis: b, inputs,
    parameters: p, dimensions: d, checks, complete: true, tbd: [], rotorType, statorType,
    freeAreaDefinition: "Gross opening/gross column: do=D*sqrt(phi_s); phi_gross=(do/D)^2=phi_s. Shaft-blocked=(do²-ds²)/D² is separate; never fed back to Stage 3.",
    compartments, nozzles,
    internals: [
      { id: "R", type: rotorType, count: N, diameterM: Dr, thicknessM: H, elevationsM: compartments.map(c => c.rotorM) },
      { id: "S", type: statorType, count: N + 1, diameterM: D, thicknessM: ts, elevationsM: plates },
      { id: "SH", type: "Continuous shaft envelope; mechanical qualification excluded", count: 1, diameterM: shaft, thicknessM: shaft, elevationsM: [lower, shaftTop] },
      { id: "SUP", type: "Three-arm shaft supports, azimuths 30/150/270 deg", count: 2, diameterM: D, thicknessM: .04 * D, elevationsM: [lower, upper] },
    ],
    assumptions: [
      "Class A: approved frozen Stage-3/4; no hydraulic/sizing recalculation.",
      "Class B: Perry 8e p15-83 / Pratt–Stevens design envelope; Garthe Table A.1 and Weber–Jupke 2020 DOI 10.1002/aic.16286 construction family.",
      "Class C: approved R1 proportions and stepped approximation, not exact reference reproduction or experimental validation.",
      "End zones are packaging allocations, not separation-performance sizing. Connection bores are geometric allowances, not hydraulic or DN sizing.",
      "NMP-down/RRBO-up is an explicit layout selection, not inferred from continuity. Vent is crown-region, not absolute-high-point qualified.",
      "N+1 plates follows selected shared-boundary and terminal-ring topology, not a universal source count.",
    ],
    watermark: R1_WATERMARK,
    engineeringBoundary: "Geometrically complete pre-pilot layout only; not fabrication or mechanical qualification.",
    engineeringExclusions: ["Pressure-vessel shell/head thickness and code design", "Shaft strength, deflection, critical speed",
      "Bearing/seal ratings, drive power/torque and support structural qualification", "Welds, keys, fasteners, flanges, reinforcement and external pipe routing",
      "Separation residence-time, connection hydraulic capacity and operational venting qualification"],
  };
}