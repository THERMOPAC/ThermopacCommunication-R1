// Report-only proposed geometry. Does not import or modify application code.
import fs from 'node:fs';
const p = Math.PI;
const c = { D:600, DR:198, hc:180, phi:.4, ds:44, hubD:70, hubH:24,
  blades:6, bladeT:3, innerWebH:16, outerBladeH:28, shroudT:2,
  shroudRadialWidth:34, HR:32, statorT:4, entryAreaReserve:.05,
  webLaneWidth:8, rows:[{r:100,n:12},{r:155,n:18},{r:210,n:24},{r:265,n:30}] };
c.DTI=c.DR-2*c.shroudRadialWidth;
const circle=d=>p*d*d/4;
// Exact area of intersection of a radius-R disk with the strip |y| <= t/2.
const stripDisk=(R,t)=>t*Math.sqrt(R*R-t*t/4)+2*R*R*Math.asin(t/(2*R));
const grossEye=circle(c.DTI);
const shaftEye=grossEye-circle(c.ds);
const hubEye=grossEye-circle(c.hubD);
// A radial blade occupies the positive-x half only; the opposite half belongs
// to its separately counted opposite blade.
const bladeEye=c.blades*(stripDisk(c.DTI/2,c.bladeT)-stripDisk(c.hubD/2,c.bladeT))/2;
const effectiveEye=hubEye-bladeEye;
const maxDSO=Math.sqrt(c.ds*c.ds+4*(1-c.entryAreaReserve)*effectiveEye/p);
c.DSO=2*Math.floor(maxDSO/2);
c.holes=c.rows.reduce((s,r)=>s+r.n,0);
c.holeD=Math.sqrt((c.phi*c.D*c.D-c.DSO*c.DSO)/c.holes);
const centres=c.rows.flatMap((row,ri)=>Array.from({length:row.n},(_,i)=>{
  const a=(i+.5)*2*p/row.n;
  return {row:ri+1,hole:i+1,angleDeg:a*180/p,x:row.r*Math.cos(a),y:row.r*Math.sin(a)};
}));
let minPair={distance:Infinity},minCross={distance:Infinity};
for(let i=0;i<centres.length;i++)for(let j=i+1;j<centres.length;j++){
  const a=centres[i],b=centres[j],distance=Math.hypot(a.x-b.x,a.y-b.y);
  if(distance<minPair.distance)minPair={distance,a:[a.row,a.hole],b:[b.row,b.hole]};
  if(a.row!==b.row && distance<minCross.distance)minCross={distance,a:[a.row,a.hole],b:[b.row,b.hole]};
}
const result={status:'UNAPPROVED REPORT-ONLY CANDIDATE; NOT FOR FABRICATION; basis confirmed by companion audit design269/run64',
  units:'mm, mm², degrees',dimensions:c,areas:{
    column:circle(c.D),target:c.phi*circle(c.D),eyeGross:grossEye,eyeShaftCorrected:shaftEye,
    eyeHubCorrected:hubEye,eyeBladeStripUnion:bladeEye,
    upperActualEyeFaceEffective:shaftEye,lowerActualEyeFaceEffective:shaftEye,
    upperInternalHubPlaneOpen:hubEye,lowerInternalHubPlaneOpen:hubEye,
    upperTurningRegionMinimumEyeDiskDiagnostic:effectiveEye,
    lowerTurningRegionMinimumEyeDiskDiagnostic:effectiveEye,
    maxDSOForProposedFivePercentReserve:maxDSO,centreGross:circle(c.DSO),
    centreShaftCorrected:circle(c.DSO)-circle(c.ds),holes:c.holes*circle(c.holeD),
    statorGross:circle(c.DSO)+c.holes*circle(c.holeD),
    statorShaftCorrected:circle(c.DSO)+c.holes*circle(c.holeD)-circle(c.ds),
    radialTurnAtEyeOuterEdge:2*p*c.DTI/2*c.outerBladeH-
      c.blades*2*c.DTI/2*Math.asin(c.bladeT/c.DTI)*c.outerBladeH,
    radialOuterDischarge:2*p*c.DR/2*c.outerBladeH-
      c.blades*2*c.DR/2*Math.asin(c.bladeT/c.DR)*c.outerBladeH,
    shaftBlockage:circle(c.ds)},
  checks:{CE:(c.DTI-c.DSO)/2,rotorWallRadial:(c.D-c.DR)/2,
    rotorStatorFaceAxialEach:(c.hc-c.statorT-c.HR)/2,
    shaftCentreRadial:(c.DSO-c.ds)/2,hubEyeRadial:(c.DTI-c.hubD)/2,
    upperHubCapToUpperShroudInnerFace:c.outerBladeH/2-c.hubH/2,
    innerWebToShroudInnerFace:c.outerBladeH/2-c.innerWebH/2,
    holePairMin:{...minPair,ligament:minPair.distance-c.holeD},
    crossRowMin:{...minCross,ligament:minCross.distance-c.holeD},
    centreHoleLigament:c.rows[0].r-c.holeD/2-c.DSO/2,
    shellHoleLigament:c.D/2-c.rows.at(-1).r-c.holeD/2,
    holeToWebLaneEdge:Math.min(...c.rows.map(r=>r.r*Math.sin(p/r.n)-c.holeD/2-c.webLaneWidth/2)),
    eyeReserveFraction:1-(circle(c.DSO)-circle(c.ds))/effectiveEye},
  rowSchedule:c.rows.map(r=>({radius:r.r,PCD:2*r.r,count:r.n,firstAngleDeg:180/r.n,
    incrementDeg:360/r.n,chordPitch:2*r.r*Math.sin(p/r.n),
    arcPitch:2*p*r.r/r.n,circumferentialLigament:2*r.r*Math.sin(p/r.n)-c.holeD})),
  holeCentres:centres};
if(Math.abs(result.areas.statorGross/result.areas.column-c.phi)>1e-12)throw Error('area closure');
for(const v of [result.checks.holePairMin.ligament,result.checks.centreHoleLigament,
 result.checks.shellHoleLigament,result.checks.holeToWebLaneEdge])if(v<=0)throw Error('collision');
fs.writeFileSync(new URL('geometry-proposal.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,holeCentres:`${centres.length} coordinates saved in JSON`},null,2));