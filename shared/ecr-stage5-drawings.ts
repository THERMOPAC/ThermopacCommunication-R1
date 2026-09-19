import type { Stage5Geometry } from "./ecr-stage5-geometry";
import { renderStage5R1Svg } from "./ecr-stage5-r1-drawings";

export type Stage5DrawingView = "ga" | "section" | "compartment" | "rotor" | "stator";
const escape = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const fmt = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(6)).toString() : "TBD";

/** Self-contained vector export; unknown dimensions never acquire physical defaults. */
export function renderStage5Svg(g: Stage5Geometry, view: Stage5DrawingView): string {
  if (!["ga", "section", "compartment", "rotor", "stator"].includes(view)) throw new Error("Unknown Stage-5 drawing view");
  if (g.ruleset === "ECR_KUHNI_PREPILOT_GEOMETRY_RULESET_R1") return renderStage5R1Svg(g, view);
  const d = g.dimensions;
  const parts: string[] = [];
  const text = (x: number, y: number, value: unknown, size = 12) => parts.push(`<text x="${x}" y="${y}" font-size="${size}">${escape(value)}</text>`);
  const line = (x: number, y: number, x2: number, y2: number, dashed = false) => parts.push(`<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}"${dashed ? ' stroke-dasharray="5 4"' : ""}/>`);
  const rect = (x: number, y: number, w: number, h: number) => parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none"/>`);
  const circle = (x: number, y: number, r: number) => parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="none"/>`);
  const arrow = (x: number, y1: number, y2: number, label: string) => {
    const direction = y2 > y1 ? 1 : -1;
    parts.push(`<g data-flow="${escape(label)}" data-direction="${direction > 0 ? "down" : "up"}">`);
    line(x, y1, x, y2); line(x, y2, x - 5, y2 - direction * 9); line(x, y2, x + 5, y2 - direction * 9);
    text(x - 18, Math.min(y1, y2) - 12, label); parts.push("</g>");
  };
  const good = (...v: (number | null | undefined)[]) => v.every(n => typeof n === "number" && Number.isFinite(n) && n > 0);
  text(30, 30, `STAGE 5 · ${view.toUpperCase()} · schematic preliminary definition`, 19);
  text(30, 52, `Source Stage 3: ${g.basis.stage3ResultId} / Stage 4: ${g.basis.stage4ResultId}`);
  text(30, 73, g.watermark, 12);
  text(30, 94, `All dimensions m unless shown otherwise. Datum: vessel bottom = 0. ${g.complete ? "Defined" : "INCOMPLETE / TBD — not an issued fabrication drawing"}`);
  const label = (key: string, title: string, y: number) => text(560, y, `${title}: ${fmt(d[key])} m`);
  if (view === "ga" || view === "section") {
    if (good(d.columnDiameterM, d.vesselHeightM)) {
      const s = Math.min(370 / d.vesselHeightM!, 230 / d.columnDiameterM!);
      const y = (z: number) => 505 - z * s;
      const left = 270 - d.columnDiameterM! * s / 2, width = d.columnDiameterM! * s;
      const topProfile = g.inputs.topHeadProfile, bottomProfile = g.inputs.bottomHeadProfile;
      if (typeof d.bottomHeadDepthM === "number" && typeof d.topTangentM === "number") {
        line(left, y(d.bottomHeadDepthM), left, y(d.topTangentM));
        line(left + width, y(d.bottomHeadDepthM), left + width, y(d.topTangentM));
        if (bottomProfile === "elliptical-envelope" && good(d.bottomHeadDepthM)) {
          parts.push(`<path d="M ${left} ${y(d.bottomHeadDepthM)} A ${width / 2} ${d.bottomHeadDepthM * s} 0 0 0 ${left + width} ${y(d.bottomHeadDepthM)}" fill="none" data-head="bottom-elliptical-envelope"/>`);
        } else if (bottomProfile === "flat-envelope" && d.bottomHeadDepthM === 0) line(left, y(0), left + width, y(0));
        else {
          line(left, y(0), left + width, y(0), true);
          text(35, 505, "Bottom head profile TBD / invalid");
        }
        if (topProfile === "elliptical-envelope" && good(d.topHeadDepthM)) {
          parts.push(`<path d="M ${left} ${y(d.topTangentM)} A ${width / 2} ${d.topHeadDepthM! * s} 0 0 1 ${left + width} ${y(d.topTangentM)}" fill="none" data-head="top-elliptical-envelope"/>`);
        } else if (topProfile === "flat-envelope" && d.topHeadDepthM === 0) line(left, y(d.topTangentM), left + width, y(d.topTangentM));
        else {
          line(left, y(d.vesselHeightM!), left + width, y(d.vesselHeightM!), true);
          text(35, 150, "Top head profile TBD / invalid");
        }
      }
      text(560, 112, "Head envelopes only; mechanical design excluded");
      for (const key of ["bottomHeadDepthM", "activeStartM", "activeEndM", "topTangentM"]) if (typeof d[key] === "number") {
        line(left - 12, y(d[key]!), left + width + 12, y(d[key]!), true);
        text(left + width + 18, y(d[key]!) + 4, `${key}: ${fmt(d[key])}`);
      }
      if (good(d.shaftDiameterM, d.lowerShaftSupportM, d.upperShaftSupportM) && d.upperShaftSupportM! > d.lowerShaftSupportM!) {
        rect(270 - d.shaftDiameterM! * s / 2, y(d.upperShaftSupportM!), d.shaftDiameterM! * s, (d.upperShaftSupportM! - d.lowerShaftSupportM!) * s);
        for (const [index, z] of [d.lowerShaftSupportM!, d.upperShaftSupportM!].entries()) {
          line(258, y(z), 282, y(z));
          text(560, 484 + index * 21, `${index === 0 ? "Lower" : "Upper"} shaft support EL ${fmt(z)} m`);
        }
      }
      if (good(d.driveHeightM)) {
        rect(250, y(d.vesselHeightM!) - 25, 40, 20);
        text(560, 132, `Drive envelope height ${fmt(d.driveHeightM)} m (symbol NTS)`);
      }
      text(35, 529, `Support height below datum: ${fmt(d.supportHeightM)} m (construction TBD)`);
      if (view === "section") {
        for (const c of g.compartments) if (c.rotorM !== null && good(d.rotorDiameterM, d.rotorAxialEnvelopeM)) {
          rect(270 - d.rotorDiameterM! * s / 2, y(c.rotorM + d.rotorAxialEnvelopeM! / 2), d.rotorDiameterM! * s, d.rotorAxialEnvelopeM! * s);
        }
        if (good(d.statorOpeningDiameterM, d.statorRadialWidthM, d.statorThicknessM)) for (const z of g.internals.find(i => i.id === "S")?.elevationsM ?? []) if (z !== null) {
          rect(left, y(z + d.statorThicknessM! / 2), d.statorRadialWidthM! * s, d.statorThicknessM! * s);
          rect(270 + d.statorOpeningDiameterM! * s / 2, y(z + d.statorThicknessM! / 2), d.statorRadialWidthM! * s, d.statorThicknessM! * s);
        }
      }
      // Group identical physical elevations, wrap tags and offset annotation leaders only.
      // Neither nozzle elevations nor their shell anchor points are moved.
      const grouped = new Map<number, string[]>();
      for (const n of g.nozzles) if (typeof n.elevationM === "number" && Number.isFinite(n.elevationM)) {
        grouped.set(n.elevationM, [...(grouped.get(n.elevationM) ?? []), n.id]);
      }
      const callouts = [...grouped.entries()].sort(([a], [b]) => b - a).map(([elevation, ids]) => {
        const rows: string[] = [];
        let current = "";
        for (const id of ids) {
          if (current && current.length + id.length + 2 > 22) { rows.push(current); current = ""; }
          // Very long engineer tags remain in full in the schedule, not across the vessel.
          const tag = id.length > 22 ? `${id.slice(0, 19)}…` : id;
          current += `${current ? ", " : ""}${tag}`;
        }
        if (current) rows.push(current);
        rows.push(`EL ${fmt(elevation)} m`);
        return { elevation, rows, height: rows.length * 14 + 10 };
      });
      let annotationBottom = 158;
      for (let i = 0; i < callouts.length; i++) {
        const c = callouts[i];
        const remainingHeight = callouts.slice(i).reduce((sum, item) => sum + item.height, 0);
        const top = Math.max(annotationBottom, Math.min(y(c.elevation) - 12, 487 - remainingHeight));
        parts.push(`<g data-nozzle-callout-elevation="${c.elevation}">`);
        c.rows.forEach((row, index) => text(35, top + index * 14, row, 11));
        line(175, top + 5, left - 20, top + 5);
        line(left - 20, top + 5, left - 12, y(c.elevation));
        line(left - 12, y(c.elevation), left, y(c.elevation));
        parts.push("</g>");
        annotationBottom = top + c.height;
      }
      line(left, 547, left + width, 547);
      text(170, 565, `Column ID ${fmt(d.columnDiameterM)} m`);
      if (g.inputs.flowArrangement === "nmp-down-rrbo-up") {
        arrow(465, 240, 365, "NMP"); arrow(515, 365, 240, "RRBO");
      } else if (g.inputs.flowArrangement === "nmp-up-rrbo-down") {
        arrow(465, 365, 240, "NMP"); arrow(515, 240, 365, "RRBO");
      }
    } else text(60, 260, "VESSEL ENVELOPE TBD — no scaled physical outline generated", 15);
    [["vesselHeightM", "Vessel height"], ["overallHeightM", "Overall envelope"], ["installedActiveHeightM", "Installed active"], ["requiredActiveHeightM", "Required active"], ["compartmentHeightM", "Pitch"], ["bottomDisengagementM", "Bottom zone"], ["topDisengagementM", "Top zone"], ["bottomHeadDepthM", "Bottom head depth"], ["topHeadDepthM", "Top head depth"]].forEach(([k, l], i) => label(k, l, 150 + i * 23));
    text(560, 390, `Compartments: ${fmt(d.compartmentCount)}; RPM ${fmt(d.selectedRpm)}`);
    text(560, 413, `Phase: ${g.basis.phaseConfiguration ?? "TBD"}`);
    text(560, 436, `Flow: ${g.inputs.flowArrangement ?? "TBD engineer confirmation"}`);
    text(560, 459, "Nozzle tags grouped/staggered; leaders retain actual EL.");
    text(560, 524, "Left projection only; actual azimuths and full tags in schedule.");
  } else {
    const diameter = view === "rotor" ? d.rotorDiameterM : d.columnDiameterM;
    if (good(diameter)) {
      const s = 260 / diameter!;
      if (view === "compartment" && good(d.compartmentHeightM)) {
        const scale = Math.min(s, 300 / d.compartmentHeightM!);
        const w = d.columnDiameterM! * scale, h = d.compartmentHeightM! * scale;
        const x = 270 - w / 2, y = 460 - h;
        rect(x, y, w, h);
        if (good(d.rotorOffsetM, d.rotorDiameterM, d.rotorAxialEnvelopeM)) rect(270 - d.rotorDiameterM! * scale / 2, 460 - (d.rotorOffsetM! + d.rotorAxialEnvelopeM! / 2) * scale, d.rotorDiameterM! * scale, d.rotorAxialEnvelopeM! * scale);
        if (good(d.shaftDiameterM)) rect(270 - d.shaftDiameterM! * scale / 2, y, d.shaftDiameterM! * scale, h);
        if (good(d.statorRadialWidthM, d.statorThicknessM)) for (const z of [y, 460]) {
          rect(x, z - d.statorThicknessM! * scale / 2, d.statorRadialWidthM! * scale, d.statorThicknessM! * scale);
          rect(x + w - d.statorRadialWidthM! * scale, z - d.statorThicknessM! * scale / 2, d.statorRadialWidthM! * scale, d.statorThicknessM! * scale);
        }
        line(x - 25, y, x - 25, 460); text(35, 320, `Pitch ${fmt(d.compartmentHeightM)}`);
        text(140, 490, `ID ${fmt(d.columnDiameterM)}; rotor OD ${fmt(d.rotorDiameterM)}`);
      } else if (view !== "compartment") {
        circle(270, 310, 130);
        if (view === "rotor" && g.inputs.rotorConstruction === "flat-blade-turbine" && good(d.hubDiameterM, d.bladeCount, d.bladeThicknessM, d.bladeRadialLengthM) && Number.isInteger(d.bladeCount) && d.bladeCount! <= 64) {
          circle(270, 310, d.hubDiameterM! * s / 2);
          for (let i = 0; i < d.bladeCount!; i++) {
            parts.push(`<g transform="rotate(${i * 360 / d.bladeCount!} 270 310)">`);
            rect(270 + d.hubDiameterM! * s / 2, 310 - d.bladeThicknessM! * s / 2, d.bladeRadialLengthM! * s, d.bladeThicknessM! * s);
            parts.push("</g>");
          }
        }
        if (view === "stator" && good(d.statorOpeningDiameterM)) circle(270, 310, d.statorOpeningDiameterM! * s / 2);
        if (good(d.shaftDiameterM)) circle(270, 310, d.shaftDiameterM! * s / 2);
        line(140, 470, 400, 470); text(170, 491, `OD ${fmt(diameter)} m`);
        text(60, 520, view === "rotor" ? g.rotorType : g.statorType);
        if (view === "rotor") text(60, 545, "Outer circle is swept envelope; blade/hub attachment TBD");
        if (view === "rotor" && g.inputs.rotorConstruction === "flat-blade-turbine") text(60, 570, `Blade count: ${fmt(d.bladeCount)}; equally spaced radial blades; axial height ${fmt(d.bladeHeightM)} m`);
      } else text(70, 300, "Compartment pitch TBD — no scaled detail");
    } else text(60, 260, "DIAMETER TBD — no scaled physical detail generated");
    const fields = view === "rotor" ? ["rotorDiameterM", "shaftDiameterM", "rotorAxialEnvelopeM", "rotorWallClearanceM", ...(g.inputs.rotorConstruction === "flat-blade-turbine" ? ["hubDiameterM", "hubHeightM", "bladeHeightM", "bladeRadialLengthM", "bladeThicknessM"] : ["rotorThicknessM"])] : view === "stator" ? ["columnDiameterM", "statorOpeningDiameterM", "shaftDiameterM", "statorThicknessM", "statorRadialWidthM", "shaftOpeningClearanceM"] : ["columnDiameterM", "rotorDiameterM", "statorOpeningDiameterM", "rotorOffsetM", "rotorAxialEnvelopeM", "statorThicknessM", "rotorLowerClearanceM", "rotorUpperClearanceM", "rotorWallClearanceM"];
    fields.forEach((k, i) => label(k, k, 160 + i * 25));
    if (view === "rotor" && good(d.rotorDiameterM, d.rotorAxialEnvelopeM)) {
      const sideScale = Math.min(240 / d.rotorDiameterM!, 65 / d.rotorAxialEnvelopeM!);
      const centre = 720, top = 475;
      text(560, 447, "Rotor side envelope — axial dimensions from shared model");
      if (g.inputs.rotorConstruction === "flat-blade-turbine" && good(d.bladeHeightM, d.hubHeightM, d.hubDiameterM)) {
        rect(centre - d.rotorDiameterM! * sideScale / 2, top + (d.rotorAxialEnvelopeM! - d.bladeHeightM!) * sideScale / 2, d.rotorDiameterM! * sideScale, d.bladeHeightM! * sideScale);
        rect(centre - d.hubDiameterM! * sideScale / 2, top + (d.rotorAxialEnvelopeM! - d.hubHeightM!) * sideScale / 2, d.hubDiameterM! * sideScale, d.hubHeightM! * sideScale);
        text(560, 562, `Hub height ${fmt(d.hubHeightM)} m; blade height ${fmt(d.bladeHeightM)} m`);
      } else if (g.inputs.rotorConstruction === "flat-disc") {
        rect(centre - d.rotorDiameterM! * sideScale / 2, top, d.rotorDiameterM! * sideScale, d.rotorAxialEnvelopeM! * sideScale);
        text(560, 562, `Disc thickness ${fmt(d.rotorThicknessM)} m`);
      }
    }
    if (view === "stator") {
      text(560, 345, `Net opening area: ${fmt(d.statorNetOpenAreaM2)} m²`);
      text(560, 368, `Free-area ratio: ${fmt(d.calculatedFreeAreaRatio)}`);
      text(560, 391, `Inherited target: ${fmt(d.statorFreeAreaRatio)}`);
      if (good(d.columnDiameterM, d.statorThicknessM, d.statorRadialWidthM, d.statorOpeningDiameterM)) {
        const s = Math.min(240 / d.columnDiameterM!, 65 / d.statorThicknessM!);
        rect(590, 455, d.statorRadialWidthM! * s, d.statorThicknessM! * s);
        rect(590 + (d.statorRadialWidthM! + d.statorOpeningDiameterM!) * s, 455, d.statorRadialWidthM! * s, d.statorThicknessM! * s);
        text(560, 540, `Stator diametral section; thickness ${fmt(d.statorThicknessM)} m`);
      }
    }
  }
  let row = 610;
  const wrap = (value: string) => {
    const words = value.split(/\s+/); let current = "";
    for (const word of words) {
      if ((current + word).length > 130) { text(30, row, current); row += 17; current = ""; }
      current += `${word} `;
    }
    if (current) { text(30, row, current); row += 17; }
  };
  wrap(g.freeAreaDefinition);
  wrap(g.engineeringBoundary);
  wrap("ENGINEERING EXCLUSIONS — outside preliminary geometry completeness");
  for (const item of g.engineeringExclusions ?? []) wrap(`EXCLUDED: ${item}`);
  wrap("DIMENSION REGISTER — shared geometry dataset (no alternate drawing calculations)");
  for (const p of g.parameters) wrap(`${p.label}: ${typeof p.value === "number" ? fmt(p.value) : p.value ?? "TBD"} ${p.unit} [${p.classification}]${p.note ? ` — ${p.note}` : ""}`);
  wrap("INTERNALS SCHEDULE");
  for (const i of g.internals) wrap(`${i.id}: ${i.type}; count ${fmt(i.count)}; OD ${fmt(i.diameterM)}; thickness ${fmt(i.thicknessM)}; elevations ${i.elevationsM.map(fmt).join(", ")} m`);
  wrap("NOZZLE SCHEDULE — shell bores only; neck/flange/reinforcement TBD");
  if (!g.nozzles.length) wrap("TBD — no connections defined");
  for (const n of g.nozzles) wrap(`${n.id} ${n.service}: ${n.region}; EL ${fmt(n.elevationM)} m; bore ${fmt(n.boreM)} m; azimuth ${fmt(n.azimuthDeg)} deg [${n.classification}] ${n.note}`);
  wrap("VALIDATION");
  for (const c of g.checks) wrap(`${c.status.toUpperCase()} ${c.id}: ${c.message}`);
  wrap("ASSUMPTIONS / UNRESOLVED");
  for (const a of g.assumptions) wrap(`ASSUMED: ${a}`);
  for (const t of g.tbd) wrap(`TBD: ${t}`);
  wrap(`Engineer notes: ${g.inputs.notes || "None entered"}`);
  wrap(g.watermark);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${row + 30}" viewBox="0 0 1100 ${row + 30}" role="img"><title>${escape(`Stage 5 ${view} — ${g.watermark}`)}</title><rect width="100%" height="100%" fill="white"/><g stroke="#334155" stroke-width="1" font-family="Arial,sans-serif" fill="#172033"><style>text{stroke:none}</style>${parts.join("")}</g></svg>`;
}