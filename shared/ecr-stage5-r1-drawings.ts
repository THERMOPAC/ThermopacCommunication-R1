import type { Stage5Geometry } from "./ecr-stage5-geometry";
import type { Stage5DrawingView } from "./ecr-stage5-drawings";

/** Rendering only: all physical quantities come from the saved R1 dataset. */
export function renderStage5R1Svg(g: Stage5Geometry, view: Stage5DrawingView): string {
  const d = g.dimensions as Record<string, number>;
  const model = g.r1Model;
  if (!model) throw new Error("R1_FROZEN_DRAWING_MODEL_MISSING");
  const esc = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
  const fmt = (v: unknown) => typeof v === "number" ? Number(v.toPrecision(8)).toString() : String(v ?? "N/A");
  const out: string[] = [];
  const text = (x: number, y: number, t: unknown, size = 12) => out.push(`<text x="${x}" y="${y}" font-size="${size}">${esc(t)}</text>`);
  const rect = (x: number, y: number, w: number, h: number, tag = "") => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" data-component="${esc(tag)}"/>`);
  const line = (x: number, y: number, x2: number, y2: number) => out.push(`<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}"/>`);
  const circle = (x: number, y: number, r: number) => out.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="none"/>`);
  const stepped = (cx: number, cy: number, s: number) => {
    rect(cx - model.rotor.hub.diameterM * s / 2, cy - model.rotor.hub.heightM * s / 2,
      model.rotor.hub.diameterM * s, model.rotor.hub.heightM * s, "hub");
    for (const profile of [model.rotor.profileM,model.rotor.oppositeProfileM]) {
      const path = profile.map(([x,z],i)=>`${i?"L":"M"}${cx+x*s},${cy-z*s}`).join(" ");
      out.push(`<path data-component="r1-stepped-blade" d="${path} Z" fill="none"/>`);
    }
  };
  text(25, 28, `${g.ruleset} / ${view.toUpperCase()}`, 17);
  text(25, 50, g.watermark, 13);
  text(25, 72, g.completionStatement, 12);
  text(25, 94, `Source Stage 3 ${g.basis.stage3ResultId} / Stage 4 ${g.basis.stage4ResultId}; dimensions m; vessel bottom datum z=0.`);
  if (view === "ga" || view === "section") {
    const s = Math.min(420 / d.overallHeightM, 220 / d.columnDiameterM);
    const cx = 300, y = (z: number) => 555 - (z + d.supportHeightM) * s;
    const left = cx - d.columnDiameterM * s / 2, w = d.columnDiameterM * s;
    line(left, y(d.bottomHeadDepthM), left, y(d.topTangentM));
    line(left+w, y(d.bottomHeadDepthM), left+w, y(d.topTangentM));
    for(const head of model.heads) out.push(`<path data-component="${head.end}-head" d="M${cx-head.radialSemiaxisM*s},${y(head.tangentM)} A${head.radialSemiaxisM*s},${head.axialSemiaxisM*s} 0 0 ${head.end==="top"?1:0} ${cx+head.radialSemiaxisM*s},${y(head.tangentM)}" fill="none"/>`);
    for(const env of model.envelopes.filter(e=>e.id!=="shaft")) rect(cx-env.diameterM*s/2,y(env.topM),env.diameterM*s,(env.topM-env.bottomM)*s,env.id);
    const access=model.skirtAccess;
    rect(cx-access.widthM*s/2,y(access.elevationM+access.heightM/2),access.widthM*s,access.heightM*s,"skirt-access");
    if (view === "section") {
      const shaft=model.envelopes.find(e=>e.id==="shaft")!;
      rect(cx-shaft.diameterM*s/2,y(shaft.topM),shaft.diameterM*s,(shaft.topM-shaft.bottomM)*s,"shaft");
      for (const support of model.supports) {
        for(const arm of support.arms) {
          const xs=arm.footprintM.map(p=>p[0]),xmin=Math.min(...xs),xmax=Math.max(...xs);
          rect(cx+xmin*s,y(arm.topM),(xmax-xmin)*s,(arm.topM-arm.bottomM)*s,"support-arm-projected-envelope");
        }
        rect(cx-support.housingDiameterM*s/2,y(support.elevationM+support.housingHeightM/2),
          support.housingDiameterM*s,support.housingHeightM*s,"support-housing");
      }
      for (const c of g.compartments) stepped(cx,y(c.rotorM!),s);
      for (const z of g.internals.find(i=>i.id==="S")!.elevationsM as number[]) {
        rect(left,y(z+d.statorThicknessM/2),d.statorRadialWidthM*s,d.statorThicknessM*s,"ring");
        rect(cx+d.statorOpeningDiameterM*s/2,y(z+d.statorThicknessM/2),d.statorRadialWidthM*s,d.statorThicknessM*s,"ring");
      }
    }
    for (const n of model.connections) {
      const x=cx+n.centreM[0]*s, xe=cx+n.endM[0]*s;
      const z=n.centreM[2], od=n.outsideDiameterM*s;
      out.push(`<g data-nozzle="${esc(n.id)}" data-axis="${n.axis}" data-elevation="${z}">`);
      if (n.axis === "radial") {
        rect(Math.min(x,xe),y(z)-od/2,Math.max(Math.abs(xe-x),.2),od,n.id);
      } else {
        rect(x-od/2,Math.min(y(z),y(n.endM[2])),od,Math.abs(y(z)-y(n.endM[2])),n.id);
        const path=n.surfaceBoundaryM.map(([xx,,zz],i)=>`${i?"L":"M"}${cx+xx*s},${y(zz)}`).join(" ");
        out.push(`<path data-head-intersection="${n.id}" d="${path} Z" fill="none"/>`);
      }
      out.push("</g>");
    }
    text(25,570,"Elevation projection: overlapping azimuths are projected, not relocated. Exact connection coordinates in schedule.");
    text(25,587,`${g.inputs.flowArrangement}; support arms ${model.supportAzimuthsDeg.join("°, ")}°. Section projects saved envelopes.`);
    const fields = ["columnDiameterM","rotorDiameterM","compartmentHeightM","compartmentCount","selectedRpm",
      "activeStartM","activeEndM","installedActiveHeightM","vesselHeightM","overallHeightM",
      "lowerShaftSupportM","upperShaftSupportM","shaftLengthM","driveHeightM"];
    fields.forEach((k,i)=>text(580,140+i*23,`${k}: ${fmt(d[k])}`));
  } else if (view === "compartment") {
    const s=Math.min(320/d.columnDiameterM,300/d.compartmentHeightM), cx=280, y=(z:number)=>480-z*s;
    const left=cx-d.columnDiameterM*s/2, w=d.columnDiameterM*s;
    rect(left,y(d.compartmentHeightM),w,d.compartmentHeightM*s,"compartment");
    rect(cx-d.shaftDiameterM*s/2,y(d.compartmentHeightM),d.shaftDiameterM*s,d.compartmentHeightM*s,"shaft");
    stepped(cx,y(d.rotorOffsetM),s);
    for(const z of [0,d.compartmentHeightM]) {
      rect(left,y(z+d.statorThicknessM/2),d.statorRadialWidthM*s,d.statorThicknessM*s,"ring");
      rect(cx+d.statorOpeningDiameterM*s/2,y(z+d.statorThicknessM/2),d.statorRadialWidthM*s,d.statorThicknessM*s,"ring");
    }
    ["compartmentHeightM","rotorOffsetM","rotorAxialEnvelopeM","statorThicknessM",
      "rotorLowerClearanceM","rotorUpperClearanceM","rotorWallClearanceM"].forEach((k,i)=>text(580,160+i*30,`${k}: ${fmt(d[k])}`));
    text(25,560,"Stepped Class-C R1 profile; symmetric about compartment midplane.");
  } else {
    const rotor=view==="rotor", diameter=rotor?d.rotorDiameterM:d.columnDiameterM;
    const s=280/diameter,cx=280,cy=300;
    circle(cx,cy,140); circle(cx,cy,d.shaftDiameterM*s/2);
    if(rotor) {
      circle(cx,cy,d.hubDiameterM*s/2);
      for(const [i,blade] of model.rotor.blades.entries()) {
        const points=blade.footprintM.map(([x,y])=>`${cx+x*s},${cy+y*s}`).join(" ");
        out.push(`<polygon data-blade="${i+1}" data-azimuth="${blade.azimuthDeg}" points="${points}" fill="none"/>`);
      }
      stepped(770,475,Math.min(280/d.rotorDiameterM,85/d.rotorAxialEnvelopeM));
      ["rotorDiameterM","hubDiameterM","hubHeightM","bladeHeightM","bladeThicknessM",
        "bladeRadialLengthM","bladeInnerSegmentHeightM"].forEach((k,i)=>text(560,145+i*27,`${k}: ${fmt(d[k])}`));
      text(25,545,`Swept envelope; blade azimuths ${model.bladeAzimuthsDeg.join(", ")}°. Right: saved stepped profile.`);
      text(25,568,"Reference-inspired engineering approximation, not an exact Garthe rotor reproduction. Attachments excluded.");
    } else {
      circle(cx,cy,d.statorOpeningDiameterM*s/2);
      ["statorOpeningDiameterM","statorThicknessM","statorRadialWidthM","shaftDiameterM",
        "statorFreeAreaRatio","grossFreeAreaRatio","shaftBlockedFreeAreaRatio"].forEach((k,i)=>text(560,145+i*27,`${k}: ${fmt(d[k])}`));
      const q=280/d.columnDiameterM;
      rect(610,440,d.statorRadialWidthM*q,d.statorThicknessM*q,"stator-section-left");
      rect(610+(d.statorRadialWidthM+d.statorOpeningDiameterM)*q,440,d.statorRadialWidthM*q,d.statorThicknessM*q,"stator-section-right");
      text(25,545,"do = D sqrt(phi_s); gross fraction = phi_s. Shaft-blocked fraction is separate.");
    }
  }
  let row=655;
  const wrap=(t:string)=>{
    let current="";
    for(const word of t.split(/\s+/)) {
      if((current+word).length>140){text(25,row,current,11);row+=16;current="";}
      current+=`${word} `;
    }
    if(current){text(25,row,current,11);row+=16;}
  };
  wrap(g.freeAreaDefinition); wrap(g.engineeringBoundary);
  wrap("CONNECTION SCHEDULE — actual ellipsoidal head intersections; full OD/projection envelopes. Bores are geometric allowances, not standard DN.");
  for(const n of g.nozzles)wrap(`${n.id} ${n.service}; ${n.region}; axis ${n.axis}; z ${fmt(n.elevationM)}; r ${fmt(n.radialOffsetM)}; azimuth ${fmt(n.azimuthDeg)}; bore ${fmt(n.boreM)}; OD ${fmt(n.outsideDiameterM)}; projection ${fmt(n.projectionM)}; head intersection z ${fmt(n.surfaceEdgeElevationMinM)} to ${fmt(n.surfaceEdgeElevationMaxM)}.`);
  wrap("DIMENSION / EVIDENCE REGISTER — immutable shared R1 dataset");
  for(const p of g.parameters)wrap(`${p.label}: ${fmt(p.value)} ${p.unit}; Class ${p.evidenceClass}; ${p.note}`);
  wrap("INTERNALS SCHEDULE");
  for(const i of g.internals)wrap(`${i.id}: ${i.type}; quantity ${i.count}; diameter ${fmt(i.diameterM)}; axial dimension ${fmt(i.thicknessM)}; elevations ${i.elevationsM.map(fmt).join(", ")}.`);
  wrap("VALIDATION");
  for(const c of g.checks)wrap(`${c.status.toUpperCase()} ${c.id}: ${c.message}`);
  for(const a of g.assumptions)wrap(a);
  for(const e of g.engineeringExclusions)wrap(`EXCLUDED: ${e}`);
  wrap(g.watermark);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${row+25}" viewBox="0 0 1100 ${row+25}" role="img" data-ruleset="${g.ruleset}" data-view="${view}"><title>${esc(`${view} — ${g.watermark}`)}</title><rect width="100%" height="100%" fill="white"/><g stroke="#334155" stroke-width="1" fill="#172033" font-family="Arial,sans-serif"><style>text{stroke:none}</style>${out.join("")}</g></svg>`;
}