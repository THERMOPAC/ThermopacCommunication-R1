import approvedManifest from "../deliverables/ecr-assembly-reconciliation/approved-component-manifest.json";
import {
  buildStage5R1Geometry, R1GeometryError, R1_RULES_MANIFEST, R1_WATERMARK,
} from "./ecr-stage5-r1";
import type { Stage5Basis, Stage5Geometry, Stage5Parameter } from "./ecr-stage5-geometry";

/** Retained solely so immutable R3 snapshots remain presentable. */
export const HISTORICAL_APPROVED_COMPONENT_RULESET =
  "ECR_KUHNI_PREPILOT_GEOMETRY_RULESET_R3_APPROVED_TURBINE_PERFORATED_STATOR";
export const APPROVED_COMPONENT_RULESET =
  "ECR_KUHNI_PREPILOT_GEOMETRY_RULESET_R4_APPROVED_TURBINE_PERFORATED_STATOR_ETA0.35";
export const APPROVED_COMPONENT_MANIFEST_CANONICAL_SHA256 =
  "954fd39266e55dbaa2c0c10dcc6578b5a94d9247b1ff95194f0a762b58a32042";
export const APPROVED_COMPONENT_COMPLETE =
  "SYSTEM-GENERATED APPROVED TURBINE/PERFORATED-STATOR PRE-PILOT GEOMETRY — GEOMETRICALLY COMPLETE";

export const APPROVED_COMPONENT_RULES_MANIFEST = {
  ...R1_RULES_MANIFEST,
  id: APPROVED_COMPONENT_RULESET,
  revision: 4,
  authority: "User-approved component manifest plus frozen Stage-3/4 authority; exact D600 template, no scaling",
  approvedComponentManifest: {
    recordType: approvedManifest.recordType,
    canonicalSha256: APPROVED_COMPONENT_MANIFEST_CANONICAL_SHA256,
    sourceDesignId: approvedManifest.source.designId,
    sourceStage3RunId: approvedManifest.source.stage3RunId,
    sourceStage4CalculationId: approvedManifest.source.stage4CalculationId,
  },
  rules: {
    ...R1_RULES_MANIFEST.rules,
    rotor: "D198 double-entry shrouded turbine; eye130; shaft44; hub70x24; six t3 blades; web16; paddle28; upper/lower t2 shrouds; overall32",
    stator: "D600 t4 plate; centre opening112 from CE9; 84 exact D39.559479027818114 holes at approved manifest coordinates",
    stack: "N=ceil(Nt/eta); HA=N hc; N+1 stators; count and height inherited from Stage 4; inherited pitch 0.18 m",
  },
} as const;

const near = (a: number | null | undefined, b: number) =>
  typeof a === "number" && Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));

export const PRELIMINARY_COMPONENT_RULESET =
  "ECR_KUHNI_PREPILOT_GEOMETRY_RULESET_R5_CURRENT_BASIS_SHROUDED_PERFORATED";
export const PRELIMINARY_COMPONENT_RULES_MANIFEST = {
  ...APPROVED_COMPONENT_RULES_MANIFEST,
  id: PRELIMINARY_COMPONENT_RULESET,
  revision: 5,
  authority: "Preliminary current-basis interface adaptation; not the approved exact D600 package",
  rules: {
    ...APPROVED_COMPONENT_RULES_MANIFEST.rules,
    rotor: "Retain eye130, shaft44, hub70x24, six t3 blades, web16, paddle28 and t2 shrouds. Only outer radial extent follows inherited rotor OD.",
    stator: "Retain centre112, t4, 84 holes, row counts/angles and 8mm no-hole lanes. Hole diameter=sqrt((phi D²-0.112²)/84). Only when lane interference occurs, move that row outward to the minimum radius (holeRadius+4mm)/sin(firstAngle); reject all other interference.",
    stack: "Inherit N and pitch from current Stage 4; retain N+1 boundary stators. No upstream writes.",
  },
} as const;

export function matchesApprovedComponentContract(source: Stage5Basis): boolean {
  return source.sizingMethod === "ADOPTED_COMPARTMENT_EFFICIENCY"
    && ([["columnDiameterM", .6], ["rotorDiameterM", .198], ["rotorDiameterRatio", .33],
      ["compartmentHeightM", .18], ["statorFreeAreaRatio", .4], ["selectedRpm", 45],
      ["designNt", 7], ["designCompartmentEfficiency", .35]] as [keyof Stage5Basis, number][])
      .every(([key, expected]) => near(source[key] as number | null | undefined, expected));
}

/** Exact, deliberately non-scalable production template approved for design 269. */
export function buildStage5ApprovedComponentGeometry(source: Stage5Basis): Stage5Geometry {
  const required: [keyof Stage5Basis, number][] = [
    ["columnDiameterM", .6], ["rotorDiameterM", .198], ["rotorDiameterRatio", .33],
    ["compartmentHeightM", .18], ["statorFreeAreaRatio", .4], ["selectedRpm", 45],
    ["designNt", 7], ["designCompartmentEfficiency", .35],
  ];
  for (const [key, expected] of required)
    if (!near(source[key] as number | null | undefined, expected))
      throw new R1GeometryError("approved-template-" + key,
        `${String(key)} must equal ${expected}; approved D600 component geometry cannot be resized.`);
  if (source.sizingMethod !== "ADOPTED_COMPARTMENT_EFFICIENCY")
    throw new R1GeometryError("approved-template-sizing-method",
      "Approved component production requires the adopted compartment-efficiency basis.");
  return buildComponentGeometry(source, false);
}

/** No uniform template scaling: only upstream-constrained radial extents/area
 * and minimum row movement to resolve actual lane interference are adapted. */
export function buildStage5PreliminaryComponentGeometry(source: Stage5Basis): Stage5Geometry {
  return buildComponentGeometry(source, true);
}

function buildComponentGeometry(source: Stage5Basis, preliminary: boolean): Stage5Geometry {
  const D = source.columnDiameterM!, Dr = source.rotorDiameterM!, hc = source.compartmentHeightM!;
  const phi = source.statorFreeAreaRatio!, radius = Dr / 2;
  const holeDiameter = preliminary ? Math.sqrt((phi * D ** 2 - .112 ** 2) / 84) : .039559479027818114;
  if (!Number.isFinite(holeDiameter) || holeDiameter <= 0 || radius <= .065)
    throw new R1GeometryError("preliminary-component-interfaces", "Inherited geometry cannot contain the retained 130mm eye and positive perforation area.");
  const ruleset = preliminary ? PRELIMINARY_COMPONENT_RULESET : APPROVED_COMPONENT_RULESET;
  const rows = approvedManifest.stator.rows.map(row => ({
    ...row,
    adaptedRadius: preliminary
      ? Math.max(row.r / 1000, (holeDiameter / 2 + .004) / Math.sin(row.firstAngle * Math.PI / 180))
      : row.r / 1000,
  }));
  // Retain the already-qualified vessel, support, connection and elevation
  // construction, replacing only the explicitly superseded component geometry.
  const g = buildStage5R1Geometry(source);
  const d = g.dimensions;
  const grossOpenAreaM2 = Math.PI * (.112 ** 2 + 84 * holeDiameter ** 2) / 4;
  const columnAreaM2 = Math.PI * D ** 2 / 4;
  const netOpenAreaM2 = grossOpenAreaM2 - Math.PI * .044 ** 2 / 4;
  const grossFreeAreaRatio = grossOpenAreaM2 / columnAreaM2;
  Object.assign(d, {
    shaftDiameterM: .044, statorThicknessM: .004, bladeCount: 6,
    bladeHeightM: .028, bladeInnerSegmentHeightM: .016,
    bladeOuterSegmentHeightM: .028, bladeThicknessM: .003,
    hubDiameterM: .07, hubHeightM: .024, rotorAxialEnvelopeM: .032,
    bladeRadialLengthM: radius - .035,
    bladeInnerSegmentLengthM: .03, bladeOuterSegmentLengthM: radius - .065,
    shroudThicknessM: .002, shroudInnerDiameterM: .13, shroudOuterDiameterM: Dr,
    statorOpeningDiameterM: .112, statorHoleCount: 84,
    statorHoleDiameterM: holeDiameter, statorLaneWidthM: .008,
    statorGrossOpenAreaM2: grossOpenAreaM2,
    grossFreeAreaRatio, calculatedFreeAreaRatio: grossFreeAreaRatio,
    statorNetOpenAreaM2: netOpenAreaM2,
    shaftBlockedFreeAreaRatio: netOpenAreaM2 / columnAreaM2,
    shaftOpeningClearanceM: (.112 - .044) / 2,
    statorRadialWidthM: (D - .112) / 2,
    rotorWallClearanceM: (D - Dr) / 2,
    rotorLowerClearanceM: (hc - .004 - .032) / 2,
    rotorUpperClearanceM: (hc - .004 - .032) / 2,
  });
  const put = (key: string, value: number | string, unit: string, note: string): Stage5Parameter => ({
    key, label: key, value, unit, classification: "System-generated", evidenceClass: "C",
    note: `${ruleset}; Class C. ${note}`,
  });
  const replacementNotes: Record<string, string> = {
    shaftDiameterM: "Approved shaft diameter.", statorThicknessM: "Approved plate thickness.",
    bladeCount: "Approved six-blade architecture.", bladeHeightM: "Approved outer paddle height.",
    bladeInnerSegmentHeightM: "Approved inner web height.", bladeOuterSegmentHeightM: "Approved outer paddle height.",
    bladeThicknessM: "Approved blade thickness.", hubDiameterM: "Approved hub diameter.",
    hubHeightM: "Approved hub height.", rotorAxialEnvelopeM: "Approved total shrouded rotor height.",
    bladeRadialLengthM: "Approved nominal radial reach from hub OD to rotor OD.",
    bladeInnerSegmentLengthM: "Approved web radial interval, 35 to 65 mm radius.",
    bladeOuterSegmentLengthM: "Approved paddle/shroud radial interval, 65 to 99 mm radius.",
    shroudThicknessM: "Each approved upper/lower shroud.", shroudInnerDiameterM: "Approved eye diameter.",
    shroudOuterDiameterM: "Approved rotor/shroud OD.", statorOpeningDiameterM: "Approved central opening (130 - 2×9).",
    statorHoleCount: "Approved exact perforation count.", statorHoleDiameterM: "Approved calculated profile-hole diameter.",
    statorLaneWidthM: "Six retained radial no-hole lanes.",
    rotorConstruction: "Approved component architecture identifier.",
    statorConstruction: "Approved perforated plate architecture identifier.",
  };
  const recomputed = new Set([
    "statorGrossOpenAreaM2", "grossFreeAreaRatio", "calculatedFreeAreaRatio",
    "statorNetOpenAreaM2", "shaftBlockedFreeAreaRatio", "shaftOpeningClearanceM",
    "statorRadialWidthM", "rotorWallClearanceM", "rotorLowerClearanceM",
    "rotorUpperClearanceM",
  ]);
  if (preliminary) {
    Object.assign(replacementNotes, {
      bladeRadialLengthM: "Inherited rotor radius minus retained 35mm hub radius; preliminary adaptation.",
      bladeOuterSegmentLengthM: "Inherited rotor radius minus retained 65mm eye radius; preliminary adaptation.",
      shroudOuterDiameterM: "Inherited rotor OD; preliminary adaptation, not approved D600.",
      statorHoleDiameterM: "sqrt((inherited phi × inherited D² - 0.112²)/84); retained row angles and count; minimum outward row movement only to resolve 8mm-lane interference.",
    });
    for (const key of Object.keys(replacementNotes))
      replacementNotes[key] = replacementNotes[key].replace(/Approved|approved/g, "Retained component-basis");
  }
  g.parameters = g.parameters.filter(p => !(p.key in replacementNotes)
    && p.key !== "rotorThicknessM").map(p => recomputed.has(p.key)
      ? { ...p, value: d[p.key], note: `${ruleset}; recomputed from component solids; no upstream feedback.` } : p);
  for (const [key, note] of Object.entries(replacementNotes))
    if (!g.parameters.some(p => p.key === key))
      g.parameters.push(put(key,
        key === "rotorConstruction" ? "approved-double-entry-shrouded-turbine"
          : key === "statorConstruction" ? "approved-perforated-stator" : d[key]!,
        key.endsWith("M2") ? "m²" : key.endsWith("M") ? "m" : "", note));
  for (const [key, input] of Object.entries(g.inputs.values))
    if (typeof d[key] === "number") Object.assign(input, {
      value: d[key], classification: "System-generated",
      note: `${ruleset}; ${preliminary ? "preliminary retained/adapted component value, not mechanically verified" : "approved component value"}.`,
    });

  const bladeAzimuths = [0, 60, 120, 180, 240, 300];
  const rotate = (x: number, y: number, deg: number): [number, number] => {
    const a = deg * Math.PI / 180; return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  };
  const halfT = .0015, inner = Math.sqrt(.035 ** 2 - halfT ** 2), outer = Math.sqrt(radius ** 2 - halfT ** 2);
  const footprint = (deg: number) => [[inner,-halfT],[outer,-halfT],[outer,halfT],[inner,halfT]]
    .map(([x,y]) => rotate(x,y,deg));
  const profile: [number, number][] = [[.035,-.008],[.065,-.008],[.065,-.014],[radius,-.014],
    [radius,.014],[.065,.014],[.065,.008],[.035,.008]];
  g.r1Model!.rotor = {
    profileM: profile, oppositeProfileM: profile.map(([x,z]) => [-x,z]),
    blades: bladeAzimuths.map(azimuthDeg => ({
      azimuthDeg, footprintM: footprint(azimuthDeg),
      verticesM: [-halfT, halfT].flatMap(v => profile.map(([radius,z]) => {
        // The manifest trims the blade by cylindrical radius, not by a
        // rectangular u limit. Thus each thickness-face boundary uses the
        // exact u=sqrt(r²-v²) coordinate.
        const u = Math.sqrt(radius ** 2 - v ** 2);
        const [x,y] = rotate(u,v,azimuthDeg); return [x,y,z] as [number,number,number];
      })),
    })),
    hub: { diameterM: .07, heightM: .024 }, sweptDiameterM: Dr, shaftDiameterM: .044,
  };
  g.r1Model!.bladeAzimuthsDeg = bladeAzimuths;
  g.r1Model!.approvedComponent = {
    manifestCanonicalSha256: APPROVED_COMPONENT_MANIFEST_CANONICAL_SHA256,
    coordinateConvention: approvedManifest.coordinateConvention,
    rotor: {
      eyeDiameterM: .13, webHeightM: .016, paddleHeightM: .028,
      shrouds: [
        { name: "lower", innerRadiusM: .065, outerRadiusM: radius, bottomM: -.016, topM: -.014 },
        { name: "upper", innerRadiusM: .065, outerRadiusM: radius, bottomM: .014, topM: .016 },
      ],
    },
    stator: {
      radiusM: D / 2, thicknessM: .004, centreOpeningDiameterM: .112,
      holeDiameterM: holeDiameter, laneWidthM: .008,
      rows: rows.map(r => ({
        radiusM: r.adaptedRadius, pcdM: 2 * r.adaptedRadius, count: r.n,
        firstAngleDeg: r.firstAngle, stepDeg: r.step,
      })),
      holes: approvedManifest.stator.holeCentres.map(h => {
        const originalRadius = Math.hypot(h.x, h.y) / 1000;
        const row = rows.find(r => near(r.r / 1000, originalRadius))!;
        const factor = preliminary ? row.adaptedRadius / originalRadius : 1;
        return { row: h.row, index: h.index, xM: h.x / 1000 * factor, yM: h.y / 1000 * factor, angleDeg: h.angleDeg };
      }),
    },
  };
  g.ruleset = ruleset;
  g.completionStatement = preliminary ? "SYSTEM-GENERATED PRELIMINARY CURRENT-BASIS COMPONENT GEOMETRY — NOT APPROVED D600" : APPROVED_COMPONENT_COMPLETE;
  g.watermark = R1_WATERMARK;
  g.rotorType = "Approved double-entry radial-flow shrouded six-blade turbine";
  g.statorType = "Approved perforated stator: central opening plus 84 exact profile holes";
  g.inputs.rotorConstruction = "approved-double-entry-shrouded-turbine";
  g.inputs.statorConstruction = "approved-perforated-stator";
  g.internals = g.internals.map(i => i.id === "R"
    ? { ...i, type: g.rotorType, diameterM: Dr, thicknessM: .032 }
    : i.id === "S" ? { ...i, type: g.statorType, diameterM: D, thicknessM: .004 } : i);
  g.freeAreaDefinition =
    "Approved gross physical fraction = (112² + 84×39.559479027818114²) / 600² = 0.40; shaft-corrected diagnostic is reported separately.";
  g.assumptions = g.assumptions.filter(x => !/R1 proportions|stepped approximation|single|annular/i.test(x));
  g.assumptions.push(
    `Approved component source: approved-component-manifest.json canonical SHA-256 ${APPROVED_COMPONENT_MANIFEST_CANONICAL_SHA256}.`,
    "PRELIMINARY INTERFACE HOLD: retain the existing vessel shell, shaft-support elevations/wall interfaces, drive/seal envelopes and nozzle arrangement pending mechanical interface review.",
    "Component geometry approval does not qualify support-wall attachments, stator mounting, shaft/hub attachment, strength, vibration or fabrication.",
  );
  if (preliminary) {
    g.rotorType = "Preliminary double-entry shrouded six-blade turbine; retained 130mm eye";
    g.statorType = "Preliminary perforated stator; retained 112mm centre and 84-hole architecture";
    g.internals = g.internals.map(i => i.id === "R" ? { ...i, type: g.rotorType } : i.id === "S" ? { ...i, type: g.statorType } : i);
    g.freeAreaDefinition = `Gross physical area: (0.112² + 84 × ${holeDiameter}²) / ${D}² = ${phi}. Shaft-corrected diagnostic separate; no hydraulic equivalence asserted.`;
    g.assumptions.push(
      "R5 PRELIMINARY ADAPTATION, NOT APPROVED D600: manifest identifies retained component ancestry, not approval of this generated assembly.",
      "Rotor/shroud outer radius and stator hole diameter follow inherited rotor OD and gross free area. Row radii change only by the minimum outward displacement necessary to clear the retained 8mm no-hole lanes; count, angles, 130mm eye, 112mm centre and 9mm overlap remain fixed. No 95% turning-area rule.",
      `Preliminary stator row radii (m): ${rows.map(r => `${r.r / 1000} → ${r.adaptedRadius}`).join("; ")}. Changed radii resolve actual lane interference only; no hydraulic equivalence asserted.`,
      "Retained component thicknesses are preliminary geometric assumptions, not strength-qualified thicknesses. Materials, shell thickness, support/drive adequacy and fabrication qualification remain unverified.",
      source.rpmMin === source.rpmMax ? `Inherited RPM ${source.selectedRpm} is a zero-width selected point, not a demonstrated operating window.` : "Inherited RPM bounds are upstream authority, not mechanical speed qualification.",
    );
  }
  // These checks passed against the superseded R1 central-opening/stepped
  // component values before replacement and must not survive as evidence.
  const supersededChecks = new Set([
    "shaft-opening", "hub-fit", "blade-spacing", "swept-diameter",
    "axial-clearance", "gross-area", "supports",
  ]);
  g.checks = g.checks.filter(c => !supersededChecks.has(c.id)
    && !c.id.endsWith("-internals-envelope"));
  const plateElevations = g.internals.find(i => i.id === "S")!.elevationsM as number[];
  const radialNozzles = g.nozzles.filter(n => n.axis === "radial");
  const nozzleInternalClear = radialNozzles.every(n => plateElevations.every(z =>
    Math.abs(n.elevationM! - z) > n.outsideDiameterM! / 2 + .004 / 2));
  g.checks.push(
    { id: "approved-hole-count", status: g.r1Model.approvedComponent.stator.holes.length === 84 ? "pass" : "fail", message: "Exactly 84 manifest hole centres retained." },
    { id: "approved-gross-area", status: Math.abs(grossOpenAreaM2 / columnAreaM2 - phi) < 1e-14 ? "pass" : "fail", message: `Computed centre plus 84-hole physical area reproduces inherited gross free-area fraction ${phi}.` },
    { id: "approved-shaft-centre-clearance", status: .044 < .112 ? "pass" : "fail", message: "Approved shaft clears the approved central opening." },
    { id: "approved-hub-fit", status: .044 < .07 && .07 < .13 && .13 < Dr && Dr < D ? "pass" : "fail", message: "Shaft, hub, eye, inherited rotor OD and inherited column ID are nested." },
    { id: "approved-blade-topology", status: halfT < .035 * Math.sin(Math.PI / 6) ? "pass" : "fail", message: "Six exact cylindrical-trim blade solids do not overlap at the hub." },
    { id: "approved-axial-clearance", status: hc - .004 - .032 > 0 ? "pass" : "fail", message: `32 mm rotor envelope clears the 4 mm boundary plates within inherited ${hc * 1000} mm pitch.` },
    { id: "approved-nozzle-stator-envelope", status: nozzleInternalClear ? "pass" : "fail", message: "Saved radial nozzle OD envelopes are axially disjoint from all approved 4 mm stator plates; external interfaces remain on hold." },
    { id: "approved-support-bracketing", status:
      d.lowerShaftSupportM + .02 * D < d.activeStartM - .004 / 2
      && d.upperShaftSupportM - .02 * D > d.activeEndM + .004 / 2 ? "pass" : "fail",
      message: "Saved support envelopes geometrically bracket the approved stack; support-wall and shaft interfaces remain preliminary holds." },
  );
  const holes = g.r1Model.approvedComponent.stator.holes;
  const hr = g.r1Model.approvedComponent.stator.holeDiameterM / 2;
  const noOverlap = holes.every((a, i) => holes.every((b, j) => i >= j
    || Math.hypot(a.xM - b.xM, a.yM - b.yM) > 2 * hr))
    && holes.every(h => Math.hypot(h.xM, h.yM) - hr > .056
      && Math.hypot(h.xM, h.yM) + hr < D / 2);
  g.checks.push({ id: "approved-hole-topology", status: noOverlap ? "pass" : "fail",
    message: "All exact holes are mutually disjoint and clear the centre opening and plate perimeter." });
  if (preliminary) {
    const lanesClear = holes.every(h => [0, 60, 120, 180, 240, 300].every(angle => {
      const a = angle * Math.PI / 180;
      return Math.abs(h.xM * Math.sin(a) - h.yM * Math.cos(a)) >= hr + .004 - 1e-12;
    }));
    g.checks.push({ id: "preliminary-retained-lanes", status: lanesClear ? "pass" : "fail",
      message: "Calculated holes preserve all retained 8mm no-hole lanes." });
    g.checks = g.checks.map(c => ({ ...c, message: c.message.replace(/Approved|approved/g, "Retained preliminary") }));
    g.checks = g.checks.map(c => c.id === "approved-hole-count" ? { ...c, message: "84 holes retained; row angles unchanged; any row displacement is the minimum needed for 8mm-lane clearance." } : c);
    if (g.checks.some(c => c.status === "fail"))
      throw new R1GeometryError("preliminary-component-interference",
        `Retained interfaces cannot satisfy current basis: ${g.checks.filter(c => c.status === "fail").map(c => c.id).join(", ")}. Engineering-approved component revision required; no relocation beyond the versioned minimum lane-clearance rule or uniform scaling permitted.`);
  }
  g.complete = g.checks.every(c => c.status === "pass");
  return g;
}