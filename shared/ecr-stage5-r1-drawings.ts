import type { Stage5Geometry } from "./ecr-stage5-geometry";
import type { Stage5DrawingView } from "./ecr-stage5-drawings";
import { TechnicalSheet, drawingMm as mm, escapeDrawingText as esc, type Stage5DrawingContext } from "./ecr-stage5-technical-drawing";
export type { Stage5DrawingContext } from "./ecr-stage5-technical-drawing";

/** Engineering presentation only: SI values and component profiles are read, never rewritten. */
export function renderStage5R1Svg(g: Stage5Geometry, view: Stage5DrawingView, context?: Stage5DrawingContext): string {
  const d = g.dimensions as Record<string, number>, m = g.r1Model;
  if (!m) throw new Error("R1_FROZEN_DRAWING_MODEL_MISSING");
  const model = m;
  const approved = model.approvedComponent;
  const titles = { ga: "GENERAL ARRANGEMENT", section: "LONGITUDINAL SECTION A–A", compartment: "DETAIL B — TYPICAL COMPARTMENT", rotor: "ROTOR — PLAN & ELEVATION", stator: "STATOR — PLAN & SECTION" };
  const sheet = new TechnicalSheet(titles[view]);
  const diameter = (key: string) => `Ø${mm(d[key])}`;
  const stepped = (cx: number, cy: number, s: number) => {
    sheet.rect(cx - m.rotor.hub.diameterM*s/2, cy - m.rotor.hub.heightM*s/2, m.rotor.hub.diameterM*s, m.rotor.hub.heightM*s, "hub", "url(#section-hatch)");
    for (const profile of [model.rotor.profileM, model.rotor.oppositeProfileM])
      sheet.path(profile.map(([x,z],i)=>`${i?"L":"M"}${cx+x*s},${cy-z*s}`).join(" ")+" Z", "r1-stepped-blade", "url(#section-hatch)");
    if (approved) for (const shroud of approved.rotor.shrouds) {
      const z=(shroud.bottomM+shroud.topM)/2, t=shroud.topM-shroud.bottomM;
      sheet.rect(cx-shroud.outerRadiusM*s,cy-(z+t/2)*s,
        (shroud.outerRadiusM-shroud.innerRadiusM)*s,t*s,`${shroud.name}-shroud`,"url(#section-hatch)");
      sheet.rect(cx+shroud.innerRadiusM*s,cy-(z+t/2)*s,
        (shroud.outerRadiusM-shroud.innerRadiusM)*s,t*s,`${shroud.name}-shroud`,"url(#section-hatch)");
    }
  };
  const ring = (cx: number, cy: number, s: number) => {
    sheet.rect(cx-d.columnDiameterM*s/2, cy-d.statorThicknessM*s/2, d.statorRadialWidthM*s, d.statorThicknessM*s, "stator-section-left", "url(#section-hatch)");
    sheet.rect(cx+d.statorOpeningDiameterM*s/2, cy-d.statorThicknessM*s/2, d.statorRadialWidthM*s, d.statorThicknessM*s, "stator-section-right", "url(#section-hatch)");
  };

  if (view === "ga" || view === "section") {
    const section = view === "section", count = g.compartments.length;
    // Compress only the omitted repeated section; end-zone geometry remains uniformly scaled.
    const cut = section && count > 6;
    const cutLo = d.activeStartM + 2*d.compartmentHeightM, cutHi = d.activeEndM - 2*d.compartmentHeightM;
    const removed = cut ? cutHi-cutLo : 0, breakGap = cut ? 55 : 0;
    const s = (660-breakGap)/(d.overallHeightM-removed), cx = 440;
    const y = (z: number) => 787-(z+d.supportHeightM-(cut && z>=cutHi?removed:0))*s-(cut && z>=cutHi?breakGap:0);
    const left=cx-d.columnDiameterM*s/2, right=cx+d.columnDiameterM*s/2;
    const breakY = cut ? y(cutLo) : 0;
    const shellLine = (x: number) => {
      if (cut) { sheet.line(x,y(d.bottomHeadDepthM),x,breakY); sheet.line(x,breakY-breakGap,x,y(d.topTangentM)); }
      else sheet.line(x,y(d.bottomHeadDepthM),x,y(d.topTangentM));
    };
    shellLine(left); shellLine(right); sheet.centerline(cx,100,cx,808);
    for (const head of m.heads)
      sheet.path(`M${cx-head.radialSemiaxisM*s},${y(head.tangentM)} A${head.radialSemiaxisM*s},${head.axialSemiaxisM*s} 0 0 ${head.end==="top"?1:0} ${cx+head.radialSemiaxisM*s},${y(head.tangentM)}`, `${head.end}-head`);
    for (const env of m.envelopes.filter(e=>e.id!=="shaft")) sheet.rect(cx-env.diameterM*s/2,y(env.topM),env.diameterM*s,(env.topM-env.bottomM)*s,env.id);
    const a=m.skirtAccess;
    sheet.rect(cx-a.widthM*s/2,y(a.elevationM+a.heightM/2),a.widthM*s,a.heightM*s,"skirt-access");
    if (section) {
      const shaft=m.envelopes.find(e=>e.id==="shaft")!;
      if(cut) {
        sheet.rect(cx-shaft.diameterM*s/2,breakY,shaft.diameterM*s,y(shaft.bottomM)-breakY,"shaft-lower");
        sheet.rect(cx-shaft.diameterM*s/2,y(shaft.topM),shaft.diameterM*s,breakY-breakGap-y(shaft.topM),"shaft-upper");
      } else sheet.rect(cx-shaft.diameterM*s/2,y(shaft.topM),shaft.diameterM*s,y(shaft.bottomM)-y(shaft.topM),"shaft");
      for(const support of m.supports) {
        for(const arm of support.arms) {
          const xs=arm.footprintM.map(p=>p[0]);
          sheet.rect(cx+Math.min(...xs)*s,y(arm.topM),(Math.max(...xs)-Math.min(...xs))*s,(arm.topM-arm.bottomM)*s,"support-arm", "url(#section-hatch)");
        }
        sheet.rect(cx-support.housingDiameterM*s/2,y(support.elevationM+support.housingHeightM/2),support.housingDiameterM*s,support.housingHeightM*s,"support-housing");
      }
      for (const c of g.compartments) if(!cut || c.rotorM! <cutLo || c.rotorM! >cutHi) stepped(cx,y(c.rotorM!),s);
      for (const z of g.internals.find(i=>i.id==="S")!.elevationsM as number[]) if(!cut || z<=cutLo || z>=cutHi) ring(cx,y(z),s);
      if(cut) {
        sheet.breakLine(left-14,right+14,breakY); sheet.breakLine(left-14,right+14,breakY-breakGap);
        sheet.text(cx,(2*breakY-breakGap)/2+5,`${count-4} identical compartments omitted`,14,"middle",'class="dimension-label"');
      }
      const c=g.compartments[0];
      sheet.dimensionV(y(c.bottomM!),y(c.topM!),left,Math.max(100,left-70),`hc ${mm(d.compartmentHeightM)}`);
      sheet.callout(right+35,y(c.rotorM!),"B");
      sheet.leader(right,y(c.rotorM!),730,670,"DETAIL B • typical compartment");
      sheet.text(745,695,`${count} × ${mm(d.compartmentHeightM)} = ${mm(d.installedActiveHeightM)} mm`,18);
      sheet.text(745,721,"Repeated middle shown broken; true elevations retained.",13);
    }
    // Nozzle positions are their saved projected positions. Tags are separated by leaders.
    const connections=[...model.connections].sort((a,b)=>b.centreM[2]-a.centreM[2]);
    const targets=connections.map(n=>({n,ty:y(n.centreM[2])}));
    for(let i=1;i<targets.length;i++) targets[i].ty=Math.max(targets[i].ty,targets[i-1].ty+21);
    for(let i=targets.length-1;i>=0;i--) targets[i].ty=Math.min(targets[i].ty,810-(targets.length-1-i)*21);
    for(const {n,ty} of targets) {
      const x=cx+n.centreM[0]*s, xe=cx+n.endM[0]*s, z=n.centreM[2], od=n.outsideDiameterM*s;
      sheet.parts.push(`<g data-nozzle="${esc(n.id)}" data-axis="${n.axis}" data-elevation="${z}">`);
      if(n.axis==="radial") sheet.rect(Math.min(x,xe),y(z)-od/2,Math.max(Math.abs(xe-x),.5),od,n.id);
      else {
        sheet.rect(x-od/2,Math.min(y(z),y(n.endM[2])),od,Math.abs(y(z)-y(n.endM[2])),n.id);
        sheet.path(n.surfaceBoundaryM.map(([xx,,zz],i)=>`${i?"L":"M"}${cx+xx*s},${y(zz)}`).join(" ")+" Z",`${n.id}-head-intersection`);
      }
      sheet.leader(xe,y(n.endM[2]),right+70,ty+8,n.id); sheet.parts.push("</g>");
    }
    sheet.dimensionH(left,right,y(d.topTangentM),95,`COLUMN ID ${diameter("columnDiameterM")}`);
    const chainX=section?Math.max(60,left-145):250;
    for(const [lo,hi,label] of [
      [-d.supportHeightM,0,`SUPPORT ${mm(d.supportHeightM)}`],
      [0,d.bottomHeadDepthM,`HEAD ${mm(d.bottomHeadDepthM)}`],
      [d.bottomHeadDepthM,d.activeStartM,`LOWER ${mm(d.bottomDisengagementM)}`],
      [d.activeStartM,d.activeEndM,`ACTIVE HEIGHT ${mm(d.installedActiveHeightM)}`],
      [d.activeEndM,d.topTangentM,`UPPER ${mm(d.topDisengagementM)}`],
      [d.topTangentM,d.vesselHeightM,`HEAD ${mm(d.topHeadDepthM)}`],
      [d.vesselHeightM,d.vesselHeightM+d.driveHeightM,`DRIVE ${mm(d.driveHeightM)}`],
    ] as [number,number,string][]) sheet.dimensionV(y(lo),y(hi),left,chainX,label);
    if(!section) {
      sheet.dimensionV(y(0),y(d.vesselHeightM),left,175,`VESSEL HEIGHT ${mm(d.vesselHeightM)}`);
      sheet.dimensionV(y(-d.supportHeightM),y(d.vesselHeightM+d.driveHeightM),left,95,`OVERALL ${mm(d.overallHeightM)}`);
    }
    // Dedicated left-facing elevation lane; connection tags occupy the right lane.
    const elevationX=155;
    for(const [z,label] of [[0,"DATUM EL 0"],[d.activeStartM,`EL +${mm(d.activeStartM)}`],[d.activeEndM,`EL +${mm(d.activeEndM)}`]] as [number,string][]) {
      sheet.line(elevationX,y(z),left,y(z),"extension");
      sheet.elevation(elevationX,y(z),label,"left");
    }
    if(!section) {
      sheet.text(cx-12,(y(d.activeStartM)+y(d.activeEndM))/2,"ACTIVE EXTRACTION ZONE",16,"middle",`transform="rotate(-90 ${cx-12} ${(y(d.activeStartM)+y(d.activeEndM))/2})"`);
      // Separate drawing schedule: useful connection names, not a raw property dump.
      sheet.text(780,105,"CONNECTION SCHEDULE",18);
      const cols=[780,840,1000,1080,1150];
      ["TAG","SERVICE","BORE","EL","AZ°"].forEach((t,i)=>sheet.text(cols[i],136,t,12));
      g.nozzles.forEach((n,i)=>{
        const yy=163+i*29;
        sheet.line(775,yy+8,1170,yy+8,"extension");
        sheet.text(cols[0],yy,n.id,13);
        const names:Record<string,string>={P01:"RRBO feed",P02:"Extract outlet",P03:"NMP feed",P04:"Raffinate outlet",A01:"Shell flush",A02:"Equalization",S01:"Lower sample",S02:"Upper sample",I01:"Lower instrument",I02:"Upper instrument",D01:"Head drain",V01:"Crown vent"};
        sheet.text(cols[1],yy,names[n.id]||n.service,12);
        sheet.text(cols[2],yy,mm(n.boreM!),12); sheet.text(cols[3],yy,mm(n.elevationM!),12);
        sheet.text(cols[4],yy,n.axis==="down"?"—":n.azimuthDeg??"—",12);
      });
      const pcx=955,pcy=680;
      sheet.circle(pcx,pcy,90); sheet.centerline(pcx-120,pcy,pcx+120,pcy); sheet.centerline(pcx,pcy-120,pcx,pcy+120);
      sheet.text(pcx,525,"CONNECTION AZIMUTH PLAN",15,"middle");
      for(const angle of [...new Set(g.nozzles.map(n=>n.azimuthDeg).filter((v):v is number=>typeof v==="number"))]) {
        const id=g.nozzles.find(n=>n.azimuthDeg===angle)!.id;
        const point=model.connections.find(n=>n.id===id)!.centreM;
        const radius=Math.hypot(point[0],point[1]);
        if(radius===0) continue;
        const ux=point[0]/radius,uy=point[1]/radius;
        sheet.line(pcx+90*ux,pcy-90*uy,pcx+108*ux,pcy-108*uy);
        sheet.text(pcx+128*ux,pcy-128*uy+4,`${angle}°`,12,"middle");
      }
      sheet.text(785,825,"Azimuth projection; hidden/coincident ports retained.",12);
    } else {
      sheet.text(745,115,"A–A  •  AXIAL SECTION",18);
      sheet.text(745,142,"Section envelopes; wall thickness not specified.",13);
      sheet.text(745,166,"Hatching identifies cut internal components.",13);
      sheet.text(745,190,"Projected supports retain saved arm clocking.",13);
    }
  } else if(view==="compartment") {
    const cx=510, s=Math.min(590/d.columnDiameterM,340/d.compartmentHeightM), base=590, y=(z:number)=>base-z*s;
    const left=cx-d.columnDiameterM*s/2,right=cx+d.columnDiameterM*s/2;
    sheet.line(left,y(0)-35,left,y(d.compartmentHeightM)+35); sheet.line(right,y(0)-35,right,y(d.compartmentHeightM)+35);
    sheet.centerline(cx,y(d.compartmentHeightM)-80,cx,base+100);
    sheet.rect(cx-d.shaftDiameterM*s/2,y(d.compartmentHeightM),d.shaftDiameterM*s,d.compartmentHeightM*s,"shaft","url(#section-hatch)");
    stepped(cx,y(d.rotorOffsetM),s); ring(cx,y(0),s); ring(cx,y(d.compartmentHeightM),s);
    sheet.dimensionH(left,right,y(d.compartmentHeightM),y(d.compartmentHeightM)-90,`D ${diameter("columnDiameterM")}`);
    sheet.dimensionH(cx-d.statorOpeningDiameterM*s/2,cx+d.statorOpeningDiameterM*s/2,y(d.compartmentHeightM),y(d.compartmentHeightM)-40,`do ${diameter("statorOpeningDiameterM")}`);
    sheet.dimensionH(cx-d.rotorDiameterM*s/2,cx+d.rotorDiameterM*s/2,y(d.rotorOffsetM),base+65,`DR ${diameter("rotorDiameterM")}`);
    sheet.dimensionH(cx-d.shaftDiameterM*s/2,cx+d.shaftDiameterM*s/2,base,base+110,`ds ${diameter("shaftDiameterM")}`);
    sheet.dimensionV(y(0),y(d.compartmentHeightM),left,left-80,`hc ${mm(d.compartmentHeightM)}`);
    sheet.dimensionV(y(d.rotorOffsetM-d.rotorAxialEnvelopeM/2),y(d.rotorOffsetM+d.rotorAxialEnvelopeM/2),cx+d.rotorDiameterM*s/2,right+60,`ROTOR H ${mm(d.rotorAxialEnvelopeM)}`);
    sheet.dimensionV(y(d.statorThicknessM/2),y(d.rotorOffsetM-d.rotorAxialEnvelopeM/2),right,right+175,`CLEAR ${mm(d.rotorLowerClearanceM)}`);
    sheet.dimensionV(y(d.rotorOffsetM+d.rotorAxialEnvelopeM/2),y(d.compartmentHeightM-d.statorThicknessM/2),right,right+175,`CLEAR ${mm(d.rotorUpperClearanceM)}`);
    sheet.leader(left+d.statorRadialWidthM*s/2,base,65,755,`RING WIDTH ${mm(d.statorRadialWidthM)}`);
    sheet.leader(right,base,900,745,`STATOR t ${mm(d.statorThicknessM)}`);
    sheet.leader((right+cx+d.rotorDiameterM*s/2)/2,y(d.rotorOffsetM),900,210,`WALL CLEARANCE ${mm(d.rotorWallClearanceM)}`);
    sheet.text(65,825,"B  •  ONE TYPICAL COMPARTMENT — all dimensions from saved R1 geometry",15);
  } else {
    const rotor=view==="rotor",dia=rotor?d.rotorDiameterM:d.columnDiameterM,s=350/dia,cx=300,cy=325,r=175;
    sheet.text(cx,100,"PLAN",18,"middle"); sheet.circle(cx,cy,r,rotor?"centerline":"object");
    sheet.circle(cx,cy,d.shaftDiameterM*s/2); sheet.centerline(cx-r-35,cy,cx+r+35,cy); sheet.centerline(cx,cy-r-35,cx,cy+r+35);
    if(rotor) {
      sheet.circle(cx,cy,d.hubDiameterM*s/2);
      if(approved) {
        sheet.circle(cx,cy,approved.rotor.eyeDiameterM*s/2);
        sheet.circle(cx,cy,approved.rotor.shrouds[0].outerRadiusM*s);
      }
      for(const [i,b] of m.rotor.blades.entries()) sheet.parts.push(`<polygon class="object" data-blade="${i+1}" data-azimuth="${b.azimuthDeg}" points="${b.footprintM.map(([x,y])=>`${cx+x*s},${cy-y*s}`).join(" ")}" fill="url(#section-hatch)"/>`);
      sheet.dimensionH(cx-r,cx+r,cy,560,`SWEPT DR ${diameter("rotorDiameterM")}`);
      sheet.dimensionH(cx-d.hubDiameterM*s/2,cx+d.hubDiameterM*s/2,cy,610,`HUB ${diameter("hubDiameterM")}`);
      sheet.leader(cx,cy,80,710,`SHAFT ${diameter("shaftDiameterM")}`);
      sheet.leader(cx+r*.7,cy,405,750,`${m.rotor.blades.length} BLADES • ${m.bladeAzimuthsDeg.join("°, ")}°`);
      const ex=835,ey=365,es=420/d.rotorDiameterM;
      sheet.text(ex,130,approved?"ELEVATION / SHROUDED PROFILE":"ELEVATION / STEPPED PROFILE",18,"middle"); stepped(ex,ey,es); sheet.centerline(ex,210,ex,525);
      sheet.dimensionV(ey-d.hubHeightM*es/2,ey+d.hubHeightM*es/2,ex,ex-70,`HUB H ${mm(d.hubHeightM)}`);
      sheet.dimensionV(ey-d.bladeHeightM*es/2,ey+d.bladeHeightM*es/2,ex+d.rotorDiameterM*es/2,1080,`H ${mm(d.bladeHeightM)}`);
      sheet.dimensionH(ex+d.hubDiameterM*es/2,ex+d.hubDiameterM*es/2+d.bladeRadialLengthM*es,ey,530,`BLADE RADIAL ${mm(d.bladeRadialLengthM)}`);
      sheet.leader(ex+d.rotorDiameterM*es*.37,ey-d.bladeHeightM*es/2,725,620,`BLADE t ${mm(d.bladeThicknessM)}`);
      sheet.leader(ex+d.hubDiameterM*es*.7,ey-d.bladeInnerSegmentHeightM*es/2,725,675,`INNER STEP H ${mm(d.bladeInnerSegmentHeightM)}`);
      if(approved) {
        sheet.text(55,785,`UPPER + LOWER SHROUDS • each t ${mm(d.shroudThicknessM)} • eye Ø${mm(d.shroudInnerDiameterM)}`,15);
        sheet.text(55,820,"Approved double-entry turbine component geometry. Attachment and fabrication design excluded.",15);
      } else sheet.text(55,820,"Class-C reference-inspired stepped profile. Attachment and fabrication design excluded.",15);
    } else {
      sheet.circle(cx,cy,d.statorOpeningDiameterM*s/2);
      if(approved) for(const h of approved.stator.holes)
        sheet.parts.push(`<circle class="object" data-stator-hole="${h.row}-${h.index}" data-x-m="${h.xM}" data-y-m="${h.yM}" cx="${cx+h.xM*s}" cy="${cy-h.yM*s}" r="${approved.stator.holeDiameterM*s/2}" fill="white"/>`);
      sheet.dimensionH(cx-r,cx+r,cy,560,`COLUMN ID ${diameter("columnDiameterM")}`);
      sheet.dimensionH(cx-d.statorOpeningDiameterM*s/2,cx+d.statorOpeningDiameterM*s/2,cy,610,`OPENING do ${diameter("statorOpeningDiameterM")}`);
      sheet.leader(cx,cy,75,710,`SHAFT ${diameter("shaftDiameterM")}`);
      const ex=865,ey=330,es=410/d.columnDiameterM;
      sheet.text(ex,150,"SECTION A–A",18,"middle"); ring(ex,ey,es); sheet.centerline(ex,230,ex,430);
      sheet.dimensionH(ex-d.columnDiameterM*es/2,ex-d.statorOpeningDiameterM*es/2,ey,440,`RING WIDTH ${mm(d.statorRadialWidthM)}`);
      sheet.leader(ex+d.columnDiameterM*es*.42,ey,815,520,`PLATE t ${mm(d.statorThicknessM)}`);
      sheet.text(680,615,`Empirical φs: ${d.statorFreeAreaRatio.toFixed(6)}`,17);
      sheet.text(680,645,`Gross opening fraction: ${d.grossFreeAreaRatio.toFixed(6)}`,17);
      sheet.text(680,675,`Shaft-blocked net fraction: ${d.shaftBlockedFreeAreaRatio.toFixed(6)}`,17);
      sheet.text(680,720,approved?"gross = (112² + 84 dh²) / 600²":"do = D √φs  •  gross = (do/D)²",15);
      sheet.text(680,746,approved?"PCD 200/310/420/530 • 12/18/24/30 holes":"net = (do² − ds²)/D²",15);
      sheet.text(55,795,approved?`84 × Ø${mm(d.statorHoleDiameterM)} • centre Ø${mm(d.statorOpeningDiameterM)} • six ${mm(d.statorLaneWidthM)} no-hole lanes`:"Gross and shaft-blocked physical areas are reported separately; no feedback to Stage 3.",15);
      sheet.text(55,820,approved?`Exact centres from approved manifest SHA-256 ${approved.manifestCanonicalSha256}`:"",12);
      sheet.callout(cx-r-25,cy,"A"); sheet.callout(cx+r+25,cy,"A");
    }
  }
  if(approved && view!=="rotor" && view!=="stator") {
    sheet.text(745,790,`APPROVED INTERNALS: DR Ø${mm(d.rotorDiameterM)} • eye Ø${mm(d.shroudInnerDiameterM)} • 6 blades t${mm(d.bladeThicknessM)}`,12);
    sheet.text(745,810,`2 shrouds t${mm(d.shroudThicknessM)} • stator Ø112 + 84×Ø${mm(d.statorHoleDiameterM)}`,12);
    sheet.text(745,830,"PCD/count: 200/12 • 310/18 • 420/24 • 530/30",12);
  }
  if(approved && (view==="rotor" || view==="stator"))
    sheet.text(55,850,`COMPANION STATOR: Ø112 centre + 84 × Ø${mm(d.statorHoleDiameterM)} exact manifest holes`,12);
  return sheet.finish({ ruleset:g.ruleset??"R1",stage3:g.basis.stage3ResultId,stage4:g.basis.stage4ResultId,
    status:g.completionStatement??"",watermark:g.watermark,context,scale:view==="section"&&g.compartments.length>6?"BROKEN VIEW • repeated central section omitted":"FITTED SHEET • dimensions govern" }).replace("<svg ", `<svg data-view="${view}" `);
}