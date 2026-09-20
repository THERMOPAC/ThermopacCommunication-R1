// Offline engineering reconciliation only. No production imports, API or database calls.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir=path.dirname(new URL(import.meta.url).pathname);
const read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const save=(f,v)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(v,null,2));
const approved=read('../ecr-final-closure/closure-calculations.json'),e=read('saved-evidence.json');
const row=e.revisions[0],s=row.snapshot,g=s.geometry,m=g.r1Model,d=g.dimensions;
assert.equal(row.design_id,269);
assert.ok(e.checks.every(c=>c.snapshot&&c.source&&c.geometry&&c.manifest));
assert.equal(hash(s),row.immutable_hash);assert.equal(hash(g),s.geometryHash);
assert.equal(String(s.sourceStage3.id),'64');assert.equal(String(s.sourceStage4.id),'13');
assert.equal(s.sourceStage3.immutableHash,e.stage3.immutable_hash);
assert.equal(hash(s.sourceStage4.result),hash(e.stage4.result_snapshot));
assert.equal(e.stage4.stage3_immutable_hash,e.stage3.immutable_hash);
assert.equal(g.basis.compartmentCount,39);assert.equal(g.basis.installedActiveHeightM,7.02);
const manifest={
 recordType:'USER_APPROVED_PRE_PILOT_COMPONENT_BASIS',
 approvalScope:'Turbine and perforated stator geometry only. Not whole-column approval, production implementation, pressure/strength qualification or fabrication release.',
 approvalInstruction:'Freeze this turbine/stator geometry as the approved component basis, then perform the whole-column assembly reconciliation using the existing Stage-4 39-compartment/7020-mm active-height geometry. Do not change any of the now-approved turbine or stator dimensions unless an actual assembly interference is demonstrated.',
 source:{designId:269,stage3RunId:64,stage4CalculationId:13,review:'deliverables/ecr-final-closure/final-engineering-closure.pdf',reviewPdfSha256:createHash('sha256').update(fs.readFileSync(path.join(dir,'../ecr-final-closure/final-engineering-closure.pdf'))).digest('hex'),closureCalculationsCanonicalSha256:hash(approved)},
 units:'mm, mm², degrees',
 coordinateConvention:'Component-local X/Y transverse, common shaft axis X=Y=0, +Z upward. Turbine Z=0 at rotor midplane; stator Z=0 at plate midplane. Positive azimuth counterclockwise from +X viewed from +Z. Translate each component to its saved assembly elevation; no angular reorientation.',
 dimensions:approved.dimensions,stator:{centreOpening:112,holeCount:84,holeDiameter:approved.nominal.holeD,rows:approved.rows,holeCentres:approved.centres,grossPhysicalFraction:.4,terminalCountConvention:'N+1 retained from existing saved assembly, not a universal literature requirement'},
 turbine:{architecture:'Double-entry radial-flow shrouded turbine, six radial blades, shared chamber, no full middle disc',bladeAzimuths:[0,60,120,180,240,300],hub:{radialRange:[22,35],axialRange:[-12,12]},upperShroud:{radialRange:[65,99],axialRange:[14,16]},lowerShroud:{radialRange:[65,99],axialRange:[-16,-14]},bladeSolidDefinition:'At each azimuth: local outward u>0, transverse |v|<=1.5; cylindrical radial trimming 35<=sqrt(u²+v²)<=99. Half-height 8 for r<65 and 14 for r>=65.',rotatingEnvelope:{radius:99,halfHeight:16}},
 statorSolidDefinition:'Radius300 plate, thickness4 centred on saved separator plane; central radius56 removed and all84 exact holes removed. Six retained 8-wide radial no-hole lanes are existing plate material, not extra blockage.',
 ruleAuthority:{inherited:['D600','DR198','hc180','phi_s0.40','45RPM'],approvedEngineeringChoices:['DTI130 through shroud width34','CE9','shaft44','hub70x24','6 blades t3 web16 paddle28','2 shrouds t2','stator t4','four ring layout and lane width8'],calculated:['DSO=130-2*9=112','HR=28+2*2=32','dh=sqrt((0.4*600²-112²)/84)'],removed:'95% turning-area screen is not a sizing rule'},
 limitations:['SCALE_UP_EXTRAPOLATION retained','No pumping-capacity assertion','NOT FOR FABRICATION','No successor production rule-set version assigned'],
};
save('approved-component-manifest.json',manifest);
const manifestHash=hash(manifest);fs.writeFileSync(path.join(dir,'approved-component-manifest.sha256'),manifestHash+'  approved-component-manifest.json (canonical JSON SHA-256)\n');
const mm=x=>x*1000,near=(a,b)=>Math.abs(a-b)<1e-7;
const rotors=g.internals.find(i=>i.id==='R').elevationsM.map((z,i)=>({id:`R${String(i+1).padStart(2,'0')}`,centre:mm(z),bottom:mm(z)-16,top:mm(z)+16,hubBottom:mm(z)-12,hubTop:mm(z)+12}));
const stators=g.internals.find(i=>i.id==='S').elevationsM.map((z,i)=>({id:`ST${String(i).padStart(2,'0')}`,centre:mm(z),bottom:mm(z)-2,top:mm(z)+2}));
const supports=m.supports.map((v,i)=>({id:i?'SUP-U':'SUP-L',centre:mm(v.elevationM),bottom:mm(v.elevationM-v.housingHeightM/2),top:mm(v.elevationM+v.housingHeightM/2),housingOD:mm(v.housingDiameterM),arms:v.arms.map(a=>({azimuth:a.azimuthDeg,bottom:mm(a.bottomM),top:mm(a.topM),footprint:a.footprintM.map(p=>p.map(mm))}))}));
const nozzles=g.nozzles.map(n=>{
 const conn=m.connections.find(c=>c.id===n.id),r=mm(n.outsideDiameterM)/2,c=conn.centreM.map(mm),end=conn.endM.map(mm);
 const lo=n.axis==='radial'?c[2]-r:Math.min(end[2],mm(n.surfaceEdgeElevationMinM));
 const hi=n.axis==='radial'?c[2]+r:Math.max(end[2],mm(n.surfaceEdgeElevationMaxM));
 return {id:n.id,service:n.service,axis:n.axis,azimuth:n.azimuthDeg,bore:mm(n.boreM),OD:2*r,projection:mm(n.projectionM),centre:c,end,bottom:lo,top:hi,surfaceBoundary:conn.surfaceBoundaryM.map(p=>p.map(mm))};
});
assert.equal(rotors.length,39);assert.equal(stators.length,40);
assert.ok(near(stators.at(-1).centre-stators[0].centre,7020));
rotors.forEach((r,i)=>{assert.ok(near(r.centre,(stators[i].centre+stators[i+1].centre)/2));assert.ok(near(r.bottom-stators[i].top,72));assert.ok(near(stators[i+1].bottom-r.top,72));});
const checks=[];
const gap=(a,b)=>Math.max(a.bottom-b.top,b.bottom-a.top);
const add=(family,a,b,clearance,method,status='PASS')=>checks.push({family,a,b,clearanceMm:clearance,method,status});
const pairZ=(family,aa,bb,same=false)=>aa.forEach((a,i)=>bb.forEach((b,j)=>{if(same&&j<=i)return;const c=gap(a,b);add(family,a.id,b.id,c,'Disjoint axial bounding intervals; sufficient conservative proof',c>0?'PASS':'REVIEW');}));
nozzles.forEach(n=>add('nozzle bore–OD',n.id,'nominal neck',(n.OD-n.bore)/2,'Saved bore contained by saved OD; nominal geometric radial section, not pressure-wall qualification'));
const headBoundaryResiduals=nozzles.filter(n=>n.axis!=='radial').map(n=>({
 id:n.id,points:n.surfaceBoundary.length,maxResidualMm:Math.max(...n.surfaceBoundary.map(([x,y,z])=>{
  const root=Math.sqrt(1-(Math.hypot(x,y)/300)**2);
  return Math.abs(z-(n.axis==='up'?8370+150*root:150*(1-root)));
 }))
}));
assert.ok(headBoundaryResiduals.every(x=>x.points===64&&x.maxResidualMm<1e-8));
pairZ('rotor–stator',rotors,stators);
pairZ('rotor–rotor',rotors,rotors,true);
pairZ('stator–stator',stators,stators,true);
pairZ('rotor–support',rotors,supports);
pairZ('stator–support',stators,supports);
pairZ('rotor–nozzle',rotors,nozzles);
pairZ('stator–nozzle',stators,nozzles);
pairZ('support–nozzle',supports,nozzles);
rotors.forEach(r=>add('rotor–shell',r.id,'shell',201,'Full 360° swept cylinder radius99 inside radius300; all z inside straight shell'));
stators.forEach(st=>add('stator–shaft',st.id,'shaft',34,'Coaxial circular radial gap (112−44)/2'));
stators.forEach(st=>add('stator–shell',st.id,'shell',0,'Exact OD600 to ID600 intended nominal edge interface; fit/attachment unresolved','INTENDED INTERFACE'));
rotors.forEach(r=>add('rotor–shaft',r.id,'shaft',0,'Hub bore matches shaft Ø44; intended torque interface, attachment not defined','INTENDED INTERFACE'));
function segDist(p1,q1,p2,q2){
 const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),addv=(a,b,t)=>a.map((x,i)=>x+t*b[i]);
 const d1=sub(q1,p1),d2=sub(q2,p2),r=sub(p1,p2),a=dot(d1,d1),e=dot(d2,d2),f=dot(d2,r);
 let s=0,t=0;if(a<1e-12&&e<1e-12)return Math.hypot(...r);
 if(a<1e-12)t=Math.max(0,Math.min(1,f/e));else{const c=dot(d1,r);if(e<1e-12)s=Math.max(0,Math.min(1,-c/a));else{const b=dot(d1,d2),den=a*e-b*b;s=den?Math.max(0,Math.min(1,(b*f-c*e)/den)):0;t=(b*s+f)/e;if(t<0){t=0;s=Math.max(0,Math.min(1,-c/a));}else if(t>1){t=1;s=Math.max(0,Math.min(1,(b-c)/a));}}}
 return Math.hypot(...sub(addv(p1,d1,s),addv(p2,d2,t)));
}
// Capsule axis extends to the deepest/outermost saved ellipsoid/neck limits for axial connectors.
const axisEnds=n=>n.axis==='radial'?[n.centre,n.end]:[[n.centre[0],n.centre[1],n.bottom],[n.centre[0],n.centre[1],n.top]];
nozzles.forEach((n,i)=>nozzles.slice(i+1).forEach(v=>{const c=segDist(...axisEnds(n),...axisEnds(v))-(n.OD+v.OD)/2;add('nozzle–nozzle',n.id,v.id,c,'Distance between full-axis enclosing capsules; positive is conservative no-contact proof',c>0?'PASS':'REVIEW');}));
const envs=m.envelopes.map(v=>({id:v.id,diameter:mm(v.diameterM),bottom:mm(v.bottomM),top:mm(v.topM)}));
const shaft=envs.find(v=>v.id==='shaft');
const vent=nozzles.find(n=>n.id==='V01');
for(const v of envs.filter(v=>['drive-pedestal','drive-body','seal','shaft'].includes(v.id))){
 const radial=Math.hypot(...vent.centre.slice(0,2))-vent.OD/2-v.diameter/2;
 add('vent–envelope','V01',v.id,Math.max(radial,gap(vent,v)),'Separating radial cylinder bound or axial intervals');
}
nozzles.filter(n=>n.axis==='radial').forEach(n=>{
 add('nozzle–shaft',n.id,'shaft',300-22,'Radial neck begins on tangent plane at r300, extends outward only; saved bore does not define inward quill');
 add('shell-neck–head',n.id,n.centre[2]<750?'bottom-head':'top-head',Math.min(n.bottom-150,8370-n.top),'Axial OD band wholly inside straight-shell tangent planes');
});
add('drain–shaft','D01','shaft',shaft.bottom-nozzles.find(n=>n.id==='D01').top,'Axial separation from highest saved drain surface edge');
add('drain–skirt','D01','skirt',300-14.4,'Skirt is peripheral support envelope, not solid Ø600 cylinder; drain is coaxial inside');
add('drain–access','D01','skirt-access',15,'Drain endpoint −60 vs access upper elevation −75; nominal cutout not access/tool envelope');
supports.forEach(v=>{
 add('support–head',v.id,v.centre<750?'bottom-head':'top-head',v.centre<750?v.bottom-150:8370-v.top,'Conservative axial separation from complete head envelope');
});
const armCornerOverrun=Math.hypot(300,6)-300;
const shaftHeadIntersectionZ=8370+150*Math.sqrt(1-(22/300)**2);
const families=checks.reduce((out,c)=>{(out[c.family]??=[]).push(c);return out;},{});
const matrix=Object.entries(families).map(([family,list])=>({family,count:list.length,minClearanceMm:Math.min(...list.map(x=>x.clearanceMm)),statuses:[...new Set(list.map(x=>x.status))],method:list[0].method}));
const result={status:'APPROVED COMPONENT BASIS FROZEN; ASSEMBLY RECONCILIATION WITH EXPLICIT INTERFACE HOLDS',manifestCanonicalSha256:manifestHash,
 saved:{designId:269,stage3RunId:64,stage4CalculationId:13,stage5RecordId:row.id,stage5Revision:row.revision,sourceHash:row.source_hash,immutableHash:row.immutable_hash,geometryHash:s.geometryHash,stage3ImmutableHash:e.stage3.immutable_hash,stage4LineageHash:e.stage4.lineage_hash,evidenceCanonicalHash:hash(e)},
 datum:'Z=0 bottom internal head pole; axis X=Y=0; +Z upward; azimuth counterclockwise from +X viewed from +Z; all report lengths mm',
 quantities:{rotors:39,hubs:39,blades:234,shrouds:78,stators:40,statorHoles:3360,shaft:1,shaftSupports:2,supportArms:6,connections:12},
 stack:{activeStart:750,activeEnd:7770,activeCentreSpan:7020,statorMaterialStart:748,statorMaterialEnd:7772,statorMaterialSpan:7024,headBottomPole:0,bottomTangent:150,topTangent:8370,topPole:8520,straightShellLength:8220,endZoneCentreAllowance:600,endZoneFaceAllowance:598,skirtBottom:-300,driveTop:9120,overallHeight:9420,rotorAxialClearance:72,shaftBottom:450,shaftTop:8670,shaftLength:8220},
 rotors,stators,supports,nozzles,envelopes:envs,matrix,checks,headBoundaryResiduals,
 interfaces:{supportOuterCornerOverrun:armCornerOverrun,shaftTopHeadSurfaceAtRadius22:shaftHeadIntersectionZ,shaftHeadCutRequired:true,statorShellNominalFit:0,
 holds:[
 'Saved rectangular support arm outer corners reach radius300.059994: 0.059994mm outside the Ø600 internal shell envelope. This is an inherited non-conforming wall-attachment boundary, not caused by successor components. Resolve by assembly-only shell-conformal arm termination/weld detail; no approved component dimension change.',
 'Shaft crosses the top-head envelope over r<=22 and z8519.596–8520. A physical shaft penetration, pressure boundary and seal/pedestal interfaces are not defined in the saved R1 ideal envelope. Treat as intended but unresolved cut/interface, not a collision-free closed head.',
 'Support housing OD66 is a reserved envelope; shaft passage/bearing bore/end retention not defined. Lower shaft terminates at support centre450, rather than extending below its lower face438. Lower journal/end-stop engagement must be specified before releasing a detailed assembly.',
 'Forty Ø600 stators meet Ø600 shell at zero nominal edge clearance. Wall seating/retention/bypass sealing and installation access are not dimensioned. No positive manufacturing fit or removable assembly path has been established.',
 'Rotor hub bore and shroud/blade joints are intended interfaces. Keys, clamps, split joints, fillets and fasteners have no saved dimensions; their interference cannot be certified. Define assembly order for39rotors/40full plates on the common shaft.',
 'Saved radial connections provide bore/OD and outward projection but no shell wall thickness, weld, reinforcement, inward-quill, flange or valve geometry. Head-neck boundary points are retained; actual bore cuts and wall fit need detailing.',
 'Seal occupies the pedestal reserved cylinder; shaft passes both by intent. Pedestal cavity, gearbox coupling engagement and structural head mounting are not solid-resolved. No double-volume collision claim or adequacy claim is made.',
 ]},
 verdict:'No unintended interference between approved rotor/stator swept envelopes and the saved positioned supports, nozzle necks, vessel inner envelope or reserved drive layout. All approved component dimensions retained. Whole-column fabrication/CAD release not closed: inherited non-conformal support-wall boundary and intended but undetailed shaft/head, bearing, plate attachment and installation interfaces require assembly-only definition.',
};
assert.ok(checks.filter(c=>c.status==='PASS').every(c=>c.clearanceMm>0));
assert.ok(!checks.some(c=>c.status==='REVIEW'));
assert.equal(hash(s),row.immutable_hash);
save('assembly-reconciliation.json',result);
console.log(JSON.stringify({manifestHash,checks:checks.length,matrix,interfaces:result.interfaces.supportOuterCornerOverrun,verdict:result.verdict},null,2));