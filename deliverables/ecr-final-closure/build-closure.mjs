// Report-only ECR geometry closure. No application imports, database or audit execution.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
const out = path.dirname(new URL(import.meta.url).pathname);
const prior = path.resolve(out, '../kuhni-successor-review');
const read = n => fs.readFileSync(path.join(prior,n),'utf8');
const pi=Math.PI, area=d=>pi*d*d/4;
const dim={D:600,DR:198,hc:180,phi:0.4,rpm:45,ds:44,DTI:130,w:34,CE:9,
  hubD:70,hubH:24,bladeCount:6,bladeT:3,webH:16,paddleH:28,shroudT:2,HR:32,statorT:4,laneWidth:8};
const rows=[{r:100,n:12},{r:155,n:18},{r:210,n:24},{r:265,n:30}];
const centres=rows.flatMap((row,i)=>Array.from({length:row.n},(_,j)=>{
  const theta=(j+.5)*2*pi/row.n;
  return {row:i+1,index:j+1,x:row.r*Math.cos(theta),y:row.r*Math.sin(theta),angleDeg:theta*180/pi};
}));
function calc(CE){
  const DSO=dim.DTI-2*CE,dh=Math.sqrt((dim.phi*dim.D**2-DSO**2)/centres.length);
  let same=Infinity,cross=Infinity,pairs=0,lane=Infinity;
  for(let i=0;i<centres.length;i++){
    const p=centres[i];
    for(let j=i+1;j<centres.length;j++){
      const q=centres[j],gap=Math.hypot(p.x-q.x,p.y-q.y)-dh;pairs++;
      if(p.row===q.row)same=Math.min(same,gap);else cross=Math.min(cross,gap);
    }
    for(let k=0;k<6;k++){
      const t=k*pi/3,projection=p.x*Math.cos(t)+p.y*Math.sin(t);
      // Six finite radial lanes, from the centre-opening boundary to plate edge.
      const nearest=Math.max(DSO/2,Math.min(dim.D/2,projection));
      lane=Math.min(lane,Math.hypot(p.x-nearest*Math.cos(t),p.y-nearest*Math.sin(t))-dh/2-dim.laneWidth/2);
    }
  }
  const centre=100-dh/2-DSO/2,outer=300-265-dh/2;
  const gross=area(DSO)+84*area(dh),fraction=gross/area(dim.D);
  const failures=[];
  if(!(dim.ds<DSO&&DSO<dim.DTI&&dim.DTI<dim.DR))failures.push('Nested diameters');
  if(Math.min(same,cross,centre,outer,lane)<=0)failures.push('Physical overlap');
  assert.equal(pairs,3486);assert.ok(Math.abs(fraction-.4)<1e-12);
  const goals={sameAtLeast12:same>=12,centreAtLeast20:centre>=20,outerAtLeast15:outer>=15,laneAtLeast2:lane>=2};
  return {CE,DSO,holeD:dh,centreGross:area(DSO),centreShaftCorrected:area(DSO)-area(dim.ds),
    holeArea:84*area(dh),gross,fraction,shaftAdjusted:gross-area(dim.ds),shaftFraction:(gross-area(dim.ds))/area(dim.D),
    sameRingLigament:same,crossRingLigament:cross,centreLigament:centre,outerLigament:outer,laneClearance:lane,
    pairsChecked:pairs,failures,proposedNominalGoals:goals};
}
const sensitivity=[6,9,12].map(calc),nominal=sensitivity[1];
const F=(r,t)=>t*Math.sqrt(r*r-t*t/4)+2*r*r*Math.asin(t/(2*r));
const eye={gross:area(130),shaftBlockage:area(44),shaftCorrected:area(130)-area(44),
  upperFace:area(130)-area(44),lowerFace:area(130)-area(44),hubCut:area(130)-area(70),
  bladeUnion:3*(F(65,3)-F(35,3))};
eye.webDiagnostic=eye.hubCut-eye.bladeUnion;
eye.radialTurn=(2*pi*65-6*2*65*Math.asin(3/130))*28;
eye.radialDischarge=(2*pi*99-6*2*99*Math.asin(3/198))*28;
const ratios={DTI_DR:130/198,DSO_DTI:112/130,DSO_DR:112/198,CE_DTI:9/130,CE_DR:9/198};
assert.equal(nominal.DSO,112);assert.equal((dim.hc-dim.statorT-dim.HR)/2,72);
assert.ok(nominal.failures.length===0&&Object.values(nominal.proposedNominalGoals).every(Boolean));
const result={status:'FINAL ENGINEERING CLOSURE CANDIDATE — NOT FOR FABRICATION; not frozen or implemented',
  scope:'ECR only; frozen accepted audit evidence; no audit rerun',units:'mm, mm², degrees',
  basis:{design:269,stage3:64,stage4:13,orientation:'NMP continuous / RRBO dispersed',rpmWindow:[30,60],qualification:'SCALE_UP_EXTRAPOLATION'},
  dimensions:dim,ratios,eye,nominal,sensitivity,rows:rows.map(r=>({...r,PCD:2*r.r,firstAngle:180/r.n,
    step:360/r.n,chordPitch:2*r.r*Math.sin(pi/r.n),arcPitch:2*pi*r.r/r.n})),centres};
fs.writeFileSync(path.join(out,'closure-calculations.json'),JSON.stringify(result,null,2));
const n=(v,d=3)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const table=(h,rs)=>`<table><thead><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rs.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const sec=(title,text)=>`<section><h1>${title}</h1>${text}</section>`;
const p=s=>`<p>${s}</p>`;
const note=s=>`<div class="note">${s}</div>`;
// Reuse only pure vector presentation helpers from the prior report; never run its renderer or calculations.
const old=read('build-report.mjs');
const helpers=old.slice(old.indexOf('const escape ='),old.indexOf('const figure1='));
const {turbine,stator,compartment,md}=new Function(helpers+'\nreturn {turbine,stator,compartment,md};')();
let turbineSvg=turbine().replace('Upper shroud shown opaque','Upper shroud shown opaque');
let statorSvg=stator();
let compartmentSvg=compartment().replace('viewBox="0 0 700 610"','viewBox="0 0 700 690"')
 .replace('</svg>',`<text x="25" y="625" class="sm">FLOW ARROWS ARE SCHEMATIC — NOT CFD STREAMLINES</text><text x="25" y="650" class="sm">STATOR OPENING AND TURBINE EYE ARE NOT A SEALED DUCT</text></svg>`);
const flowSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 540">
<defs><marker id="f" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8Z" fill="#087b94"/></marker></defs>
<style>text{font:15px 'DejaVu Sans';fill:#183748}.box{fill:#eff6fa;stroke:#718e9d}.arr{stroke:#087b94;stroke-width:3;fill:none;marker-end:url(#f)}</style>
<text x="25" y="30">T-02 • Flow-path schematic (not a solid section)</text>
<rect x="40" y="70" width="265" height="55" class="box"/><text x="60" y="103">Upper compartment fluid</text>
<rect x="40" y="390" width="265" height="55" class="box"/><text x="60" y="423">Lower compartment fluid</text>
<rect x="75" y="180" width="200" height="45" class="box"/><text x="91" y="209">Upper Ø130 eye</text>
<rect x="75" y="295" width="200" height="45" class="box"/><text x="91" y="324">Lower Ø130 eye</text>
<path d="M175,125 L175,177" class="arr"/><path d="M175,390 L175,344" class="arr"/>
<rect x="355" y="225" width="310" height="70" class="box"/><text x="373" y="253">Shared radial-turning chamber</text><text x="373" y="276">→ outward between six blades</text>
<path d="M275,202 Q320,202 335,233 L350,243" class="arr"/><path d="M275,317 Q320,317 335,284 L350,276" class="arr"/>
<text x="25" y="490">No full-diameter middle disc; no curved vanes.</text>
<text x="25" y="520">Flow arrows are schematic — not CFD streamlines or flow-rate predictions.</text></svg>`;
for(const [name,svg] of Object.entries({'turbine-review.svg':turbineSvg,'flow-path-review.svg':flowSvg,'stator-review.svg':statorSvg,'compartment-review.svg':compartmentSvg}))
 fs.writeFileSync(path.join(out,name),svg);
const part=(text,start,end)=>{const a=text.indexOf(start),b=end?text.indexOf(end,a+start.length):text.length;assert.ok(a>=0&&b>a);return text.slice(a,b).replace(/^#+[^\n]+\n/,'').trim();};
const audit=read('stage3-audit.md'),source=read('source-review.md'),geom=read('geometry-proposal.md');
let body=sec('ECR STAGE-5 SUCCESSOR GEOMETRY<br>FINAL ENGINEERING CLOSURE CANDIDATE',
 p('THERMOPAC · Design 269 · Stage-3 Run 64 · Stage-4 Calculation 13')+
 note('PRELIMINARY PRE-PILOT GEOMETRY — NOT FOR FABRICATION<br>No production successor version assigned. Engineering review only.')+
 p('The accepted audit and turbine architecture are frozen inputs to this report. No audit, optimizer, database write or application operation was executed for this amendment. The prior review remains historical and unchanged.')+
 p('<b>Principal amendment:</b> retain CE = 9 mm as an explicit proposed radial-overlap rule; calculate DSO = DTI − 2CE = 112 mm. The former 95% area sizing screen is removed, not renamed.')+
 p('Nominal geometry is retained after explicit area, pairwise, boundary and axial-stack checks. The recommendation concerns ideal-solid pre-pilot construction geometry, not demonstrated process performance or fabrication readiness.')+
 note('SCALE_UP_EXTRAPOLATION remains applicable. Equal physical open area does not prove hydraulic equivalence to the former annular stator.')+
 p('Units throughout: mm, mm² and degrees unless stated. “Effective” means geometrically unobstructed, not discharge-coefficient-adjusted.'));
body+=sec('1 · Frozen inherited Stage-3/4 basis',
 md(part(audit,'## 2.','## 3.'))+
 p('The accepted audit previously established that DR/D = 0.33 produced the widest feasible window at D = 600 mm, not a default, iteration artifact or tie. This conclusion is accepted here without replay, reselection or new database access. The existing source-range qualification is retained.'));
body+=sec('2 · Accepted ECR turbine architecture',
 p('Double-entry, radial-flow, shrouded turbine; six straight radial blades at 60°; common shaft; axial approach from both sides; outward discharge between blades. There is no full-diameter central dividing disc and no curved impeller vane.')+
 p('Asadollahzadeh et al. (2017), pp. 150–151, Figure 1 and Table 1, supports the shrouded six-blade construction family. Detailed target dimensions are engineering selections. The accepted double-entry topology is not reopened.')+
 md(part(geom,'### 2.1','### 2.2')));
body+=sec('3 · Nominal Ø130 eye and dimensional authority',
 p('DR = 198 is inherited. The chosen outer-paddle/shroud radial width w = 34 is a PROPOSED PRE-PILOT R1 ENGINEERING RULE. DTI = DR − 2w = 198 − 68 = 130. The nominal Ø130 eye remains a proposed engineering construction choice, not a published dimension or unique hydraulic solution.')+
 table(['w','DTI = 198 − 2w','Use'],[[30,138,'Sensitivity only'],[34,130,'Nominal retained'],[38,122,'Sensitivity only']])+
 p(`DTI/DR = ${n(ratios.DTI_DR,9)}. No ranking or optimizer is applied to these three cases. The middle value is the retained review candidate.`)+
 p('The nominal turbine comprises a Ø70 × 24 hub, six 3-thick blades with 16-high inner webs and 28-high outer paddles, two 2-thick shrouds, and 32 overall axial height. Outer swept radius is exactly 99 including blade thickness; solids are cylindrically trimmed.'));
body+=sec('4 · Upper/lower eye and obstruction accounting',
 p('ATI,gross = πDTI²/4; Ashaft = πds²/4; ATI,shaft-corrected = π(DTI² − ds²)/4. At the actual eye faces Z = ±16 to ±14, neither hub nor web intersects the eye disk; the shroud is outside r = 65. Thus shaft-corrected and actual geometric face areas coincide for this specific topology.')+
 table(['Quantity','Upper','Lower'],[
 ['Gross eye-face area',n(eye.gross),n(eye.gross)],['Shaft blockage',n(eye.shaftBlockage),n(eye.shaftBlockage)],
 ['Shaft-corrected face area',n(eye.shaftCorrected),n(eye.shaftCorrected)],
 ['Actual effective geometric eye-face area',n(eye.upperFace),n(eye.lowerFace)],
 ['Internal hub-plane diagnostic, 8 &lt; |Z| &lt; 12',n(eye.hubCut),n(eye.hubCut)],
 ['Internal hub/web eye-disk diagnostic, |Z| &lt; 8',n(eye.webDiagnostic),n(eye.webDiagnostic)]])+
 p('Shaft plus coaxial hub is a single Ø70 disk where both intersect; do not subtract the shaft again. The six web strips are subtracted only outside the hub. Shrouds and outer paddles at r ≥ 65 do not additionally obstruct the r &lt; 65 eye disk.')+
 p(`Exact strip union: F(R,t) = t√(R²−t²/4) + 2R²asin[t/(2R)]; Aweb = 3[F(65,3)−F(35,3)] = ${n(eye.bladeUnion)}. Internal eye-disk area = π(65²−35²) − Aweb = ${n(eye.webDiagnostic)}.`)+
 p(`At +12 &lt; Z &lt; +14 and its lower mirror the shaft alone gives ${n(eye.shaftCorrected)}. Hub occupies |Z| ≤ 12; inner web |Z| ≤ 8; outer paddles |Z| ≤ 14; shrouds 14 ≤ |Z| ≤ 16.`)+
 table(['Separate cylindrical passage diagnostic','Area'],[
 ['Radial turning at r = 65+, height 28; both entries share this surface',n(eye.radialTurn)],
 ['Outer radial discharge at r = 99, height 28',n(eye.radialDischarge)]])+
 p('For radius r, A = [2πr − 6×2r asin(3/(2r))]×28. The two radial areas are shared combined passages, not a separate full area for each inlet. The flow turns radially; horizontal cuts are not an unbranched series nozzle.')+
 note('No geometric minimum is called a proven hydraulic throat. Actual controlling streamtubes, loss coefficients, pumping capacity and upper/lower flow split remain unvalidated. No NQ, circulation multiplier or equality between turbine circulation and process throughput is introduced.'));
body+=sec('5 · Retired area screen; CE-based opening',
 p('The prior proposed ASO,shaft-corrected ≤ 0.95 × Aeye-disk,turning-min screen is removed as a sizing basis. It has no required role in the successor geometry. No calculation field or sensitivity rule in this amended package uses it.')+
 p('<b>PROPOSED PRE-PILOT R1 ENGINEERING RULE: CE = 9.</b><br>SYSTEM CALCULATED: DSO = DTI − 2CE = 130 − 2×9 = <b>112</b>.')+
 table(['Ratio / clearance','Calculated'],[
 ['DSO/DTI',n(ratios.DSO_DTI,9)],['DSO/DR',n(ratios.DSO_DR,9)],['CE/DTI',n(ratios.CE_DTI,9)],['CE/DR',n(ratios.CE_DR,9)],
 ['Shaft-to-opening radial clearance (112−44)/2','34 mm']])+
 p('112 &lt; 130 &lt; 198. The positive overlap places the stator central opening inside the eye envelope in axial projection. CE = 9 is not a universal published requirement and DSO/DTI is not a literature correlation. Axial separation and three-dimensional flow mean that projection overlap does not prove hydraulic capture.'));
body+=sec('6 · CE sensitivity — diagnostic only',
 p('DTI = 130, D = 600, ds = 44 and the same 84 hole centres are held fixed. Every alternative receives a fresh exact area closure and all 3,486 hole-pair, centre/outer-boundary and six-lane checks. This is not a ranking.')+
 table(['CE','DSO','Centre gross','Centre shaft-corrected','Remaining holes'],sensitivity.map(c=>[c.CE,c.DSO,n(c.centreGross),n(c.centreShaftCorrected),n(c.holeArea)]))+
 table(['CE','Hole Ø','Centre ligament','Same-ring min','Cross-ring min'],sensitivity.map(c=>[c.CE,n(c.holeD,6),n(c.centreLigament),n(c.sameRingLigament),n(c.crossRingLigament)]))+
 table(['CE','Outer ligament','Lane gap','Physical intersection failure','Proposed nominal screening goals'],sensitivity.map(c=>[c.CE,n(c.outerLigament),n(c.laneClearance),c.failures.join(', ')||'None',Object.values(c.proposedNominalGoals).every(Boolean)?'All met':'Some not met; see below']))+
 p('Physical non-overlap is distinct from proposed nominal layout goals (same-ring ligament ≥12, centre ligament ≥20, outer ligament ≥15 and lane edge gap ≥2). These goals are geometric choices, not structural allowables. All three cases meet them. CE = 12 enlarges the holes and leaves only 12.008 mm same-ring ligament and 2.004 mm lane gap: the nominal arithmetic margin above those proposed goals is very small and is not a tolerance allowance. No material nominal geometry failure is found; CE = 9 / DSO = 112 remains recommended without ranking.'));
body+=sec('7 · Physical gross free area and separate blockage',
 p(`AC = π600²/4 = ${n(area(600),4)}. Atarget = 0.40 AC = ${n(.4*area(600),4)}.`)+
 table(['Nominal component','Area / fraction'],[
 ['Centre gross π112²/4',n(nominal.centreGross)],['Centre shaft-corrected π(112²−44²)/4',n(nominal.centreShaftCorrected)],
 ['Holes required = target − centre gross',n(nominal.holeArea)],['Total gross physical area',n(nominal.gross)],
 ['Gross physical fraction',n(nominal.fraction,9)],['Shaft-only adjusted physical area',n(nominal.shaftAdjusted)],
 ['Shaft-only adjusted physical fraction',n(nominal.shaftFraction,9)]])+
 p('Stage-3 empirical φs = 0.40 is retained separately from this adopted physical mapping. Neither shaft-adjusted value nor a new physical correction is returned upstream. Equal gross area does not establish ring/perforated stator hydraulic equivalence. Ø379.473 is not a centre opening of this candidate.')+
 p('No support crosses an aperture at the proposed stator plane. No extra support blockage is invented. Six no-hole lanes are already solid plate outside counted openings, so subtracting them again is wrong. Future added supports must be checked by their actual intersection with open area at their real axial station.'));
body+=sec('8 · Reverified 84-hole perforated stator',
 p(`dh = √[(φsD²−DSO²)/84] = √[(144000−112²)/84] = ${n(nominal.holeD,9)}. Exact closure: 112² + 84dh² = 144000. A rounded drawing value is not the exact computational diameter.`)+
 table(['Ring','PCD','Count','First angle','Step','Chord pitch','Arc pitch'],result.rows.map((r,i)=>[i+1,r.PCD,r.n,n(r.firstAngle,2)+'°',n(r.step,2)+'°',n(r.chordPitch),n(r.arcPitch)]))+
 p('Hole j on each ring: θj = (j+½)360°/N; Xj = r cosθj; Yj = r sinθj, j = 0…N−1. These equations and the JSON list define all 84 centres, not a representative subset. Radial row pitch is 55. Every count is divisible by six; the stagger preserves sixfold symmetry and lanes on 0°, 60°, 120°, 180°, 240°, 300°.')+
 p('Ø39.559479… is a nominal profile-cut opening, not a standard drill assertion. If manufacturing requires a standard drill, this fixed pattern must be explicitly rebalanced and reviewed rather than silently rounding. Cutting tolerance, deburring, weld intrusion and allowable area deviation are fabrication qualifications.'));
body+=sec('9 · Complete ligament and axial-stack checks',
 table(['Check','Nominal result','Disposition'],[
 ['All unique hole pairs','3,486','Enumerated afresh'],
 ['Minimum same-ring / global ligament',n(nominal.sameRingLigament),'Positive; exceeds proposed 12'],
 ['Minimum cross-ring ligament',n(nominal.crossRingLigament),'Positive'],
 ['Centre opening to nearest hole',n(nominal.centreLigament),'Positive; exceeds proposed 20'],
 ['Outer hole to column edge',n(nominal.outerLigament),'Positive; exceeds proposed 15'],
 ['Reserved radial no-hole lane width','8','Solid plate, not added support'],
 ['Minimum hole-edge to lane-edge gap',n(nominal.laneClearance),'Exceeds proposed 2'],
 ['Turbine–column radial gap (600−198)/2','201','Positive'],
 ['Hub–eye radial annulus (130−70)/2','30','Positive'],
 ['Stator centre planes','Z = ±90','180 centre-plane pitch'],
 ['Stator inner faces','Z = ±88','4-thick plate'],
 ['Rotor outer faces','Z = ±16','32 overall height'],
 ['Rotor–stator face clearance','88 − 16 = 72 each side','Not 74; finite plate included'],
 ['Web to shroud inner-face plane offset','14 − 8 = 6','Different radial extents'],
 ['Hub cap to shroud inner-face plane offset','14 − 12 = 2','Not an overlapping-solid gap'],
 ['Gross fraction','0.400000000','Exact nominal arithmetic']])+
 p('Finite-thickness blade solids are trimmed at radii 35, 65 and 99. This avoids swept corners outside Ø198. Hub–shaft, web–hub and paddle–shroud boundaries are intentional connected interfaces. Shaft fit, key/weld geometry and resulting local intrusion remain mechanical detailing tasks.'));
body+=sec('10 · Improved turbine review drawing',turbineSvg+
 p('Plan shows six radial blades and upper annular shroud, with covered paddle portions hidden. Section cuts two opposing blades; radial discharge is out of this solid blade plane through the interblade passages. Axial arrows stop before solid webs. The separate flow-path diagram makes the shared double-entry chamber explicit.'));
body+=sec('11 · Double-entry flow-path schematic',flowSvg+
 p('Both entry branches enter one shared rotating passage system. Boxes represent flow regions, not solid walls. Direction arrows describe the adopted architecture only, not phase-specific solved streamlines, a guaranteed flow split or pumping capacity.'));
body+=sec('12 · Improved stator review drawing',statorSvg+
 p('All 84 circles correspond to the calculated hole schedule. Minimum ligaments and the no-hole lane checks are given in §9. Plate thickness is a proposed 4-mm envelope; it is not pressure/structural sizing.'));
body+=sec('13 · Improved typical compartment drawing',compartmentSvg+
 p('The section is at 30° between blade planes, cutting row-2 and row-4 holes through their centres. Others are out of section. CE = 9 is an axial-projection allowance, not a sealed duct. Horizontal/vertical scales differ; labelled dimensions govern.'));
const rule='PROPOSED PRE-PILOT R1 ENGINEERING RULE',calcClass='SYSTEM CALCULATED';
body+=sec('14 · Provenance register — every dimensional choice',
 table(['Dimension / feature','Nominal','Authority'],[
 ['Column ID; rotor OD; compartment pitch','600; 198; 180','INHERITED Stage 3'],
 ['Rotor ratio; pitch ratio; φs; RPM/window','0.33; 0.30; 0.40; 45 / 30–60','INHERITED Stage 3'],
 ['Active height; compartments','7020; 39','INHERITED Stage 4'],
 ['Six-blade shrouded family','6 blades','SOURCE-BACKED REFERENCE; accepted project architecture'],
 ['Blade angular spacing','60°',calcClass+' from six equally spaced blades'],
 ['Shaft OD','44',rule+' retained reference-inspired proportion; not strength sizing'],
 ['Hub OD / height','70 / 24',rule],
 ['Blade thickness; web/paddle heights','3; 16 / 28',rule],
 ['Shroud thickness each; radial working width','2; 34',rule],
 ['Nominal eye','130',rule+' adopted choice, arithmetic DTI = DR−2w is '+calcClass],
 ['Rotor overall height','32',calcClass+' =28+2×2'],
 ['Overlap CE','9',rule],
 ['Centre opening DSO','112',calcClass+' =DTI−2CE; no area screen'],
 ['Stator plate envelope / thickness','600 / 4','INHERITED ID mapped by '+rule+'; thickness '+rule],
 ['Ring PCDs; counts; total count','200/310/420/530; 12/18/24/30; 84',rule+' layout; total '+calcClass],
 ['First angles / increments','15/10/7.5/6°; 30/20/15/12°',calcClass+' under proposed half-step staggering convention'],
 ['Hole diameter','39.5594790278',calcClass+' exact gross closure'],
 ['Radial row pitch','55',calcClass+' from selected PCDs'],
 ['No-hole lane width / axes','8; six axes 60° apart',rule+' width/alignment; axis spacing '+calcClass],
 ['Nominal layout goals','12/20/15/2 ligaments/gaps',rule+' geometry screen, not allowable stress'],
 ['All area values, ratios, pitches, ligaments and ±Z faces','Sections 4–9',calcClass],
 ['Sensitivity CE; width alternatives','6/9/12; 30/34/38',rule+' diagnostic cases, no optimization'],
 ['Fits, welds, material gauges as strength design, tolerances','Not specified','UNRESOLVED; mechanical/fabrication qualifications']]));
body+=sec('15 · Assembly scope and unresolved qualifications',
 p('This report closes the turbine, perforated stator and repeated typical compartment ideal-solid geometry. It is not a newly verified complete vessel assembly. Existing R1 issued geometry and saved revisions remain unchanged.')+
 p('If the existing one-rotor-per-compartment and N+1 terminal-stator convention is retained: 39 turbines/hubs, 78 shrouds, 234 blades and 40 stators containing 3,360 holes. This is a conditional topology count, not a universal published plate-count rule.')+
 p('Prior source-rule compatibility checks suggested terminal stator/support separation, but no complete saved Stage-5 assembly was reloaded or validated here. Support, nozzle, end-zone and wall-attachment interfaces require explicit reconciliation before claiming whole-column successor geometric completeness. No numerical interface result is silently promoted to saved-snapshot evidence.')+
 table(['Open item','Classification / freeze consequence'],[
 ['Material, wall/plate stresses, welds, fatigue, corrosion/erosion, rotor balance','Mechanical qualification; not solved by this report'],
 ['Shaft strength/deflection/critical speed, bearings, seals, motor/gearbox adequacy','Mechanical qualification; preliminary shaft is not certified'],
 ['Fits, keys, fasteners, fillets, weld beads, cutting tolerances, deburring and finish','Fabrication detail; any future intrusion must trigger geometry/area recheck'],
 ['Actual hydraulic throat, pumping capacity, phase distribution, power and backmixing equivalence','Hydraulic validation unresolved; geometric consistency is not performance evidence'],
 ['Whole-column support/nozzle/end-zone/attachment integration','Assembly geometry verification gate before whole-column freeze, not merely a strength exclusion'],
 ['Version allocation and production implementation','Explicit user approval required; none assigned here']]));
body+=sec('16 · Primary evidence and retained source limits',
 md(part(source,'## 1.','## 2.'))+
 p('These are retained, previously inspected references; no new source research or Stage-3 reassessment was needed for this closure. Apparatus-specific dimensions do not become universal target proportions.'));
body+=sec('17 · Frozen traceability and reproducibility',
 md(part(audit,'## 7.','## 8.'))+
 p('The hashes above are retained accepted audit evidence, not a claim of a new database read. The earlier before/after verification pertains to that earlier audit. Current work only reads local evidence and writes this new report directory.')+
 p('Reproduce this closure with: node deliverables/ecr-final-closure/build-closure.mjs. It calculates geometric checks and renders the report; it does not import scientific production modules or execute audit scripts. Exact hole coordinates, sensitivity checks and area results are in closure-calculations.json. All prior reports and production drawings are preserved.')+
 p('The five provenance classes are INHERITED / SOURCE-BACKED REFERENCE / SYSTEM CALCULATED / PROPOSED PRE-PILOT R1 ENGINEERING RULE / UNRESOLVED. No successor production version has been assigned.'));
body+=sec('18 · Final engineering recommendation — A / B / C',
 note('A. YES — within the explicitly defined ideal-solid turbine, stator and typical-compartment scope, the nominal geometry is internally consistent and is a dependable PRE-PILOT ECR construction candidate for engineering review. Retain Ø130 eye, CE = 9, calculated Ø112 centre and 84-hole pattern.')+
 p('All nominal non-intersection, area closure, symmetry, proposed ligament/lane goals and 72-mm face-clearance checks pass. “Dependable” here means reproducible geometric consistency, not proven operating performance.')+
 note('B. No material geometric contradiction was found in that nominal component/typical-compartment candidate. It is suitable to recommend for approval as the component basis of a successor rule set. A whole-column geometry freeze still requires explicit support/nozzle/end-zone/attachment reconciliation and user approval; this report does not falsely close that separate assembly gate.')+
 note('C. Strength, shaft dynamics, bearings/seals/drive, materials, joining, balance, corrosion allowances, fits and manufacturing tolerances are mechanical/fabrication qualifications—not contradictions in this preliminary ideal-solid layout. Complete assembly interface reconciliation is a geometric gate, not merely mechanical qualification. Hydraulic performance remains separately unvalidated under SCALE_UP_EXTRAPOLATION.')+
 p('<b>STOP:</b> present this recommendation for explicit approval. No implementation, production rule-set version or freeze is performed. PRELIMINARY PRE-PILOT GEOMETRY — NOT FOR FABRICATION.'));
const font=fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').toString('base64');
const html=`<!doctype html><html><head><meta charset="utf-8"><title>ECR STAGE-5 SUCCESSOR GEOMETRY — FINAL ENGINEERING CLOSURE CANDIDATE</title><style>
@font-face{font-family:Review;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}body{font-family:Review,sans-serif;color:#213747;font-size:9pt;line-height:1.42;margin:0}section{break-before:page;padding-top:5mm}section:first-child{break-before:auto}h1{font-size:18pt;line-height:1.25;color:#173e55;margin:0 0 5mm}h2{font-size:13pt}h3{font-size:11pt}h1,h2,h3{break-after:avoid}p{margin:0 0 3mm;orphans:3;widows:3}table{width:100%;border-collapse:collapse;font-size:8pt;margin:4mm 0}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #bacbd4;padding:2mm;vertical-align:top}th{background:#e5eef3;text-align:left}code{font-family:Review;font-size:7.5pt;overflow-wrap:anywhere}svg{width:100%;height:auto;max-height:225mm;display:block;break-inside:avoid}.note{border-left:4px solid #966426;background:#fff5e7;padding:4mm;margin:5mm 0;break-inside:avoid}li{margin-bottom:2mm}@page{size:A4;margin:17mm 16mm 19mm}@media screen{body{max-width:210mm;margin:20px auto;background:#edf2f5}section{background:white;padding:18mm;margin-bottom:20px}}</style></head><body>${body}</body></html>`;
// Scan authored visible text and SVGs, excluding encoded font binary.
assert.ok(!/\bEMS\b/i.test(body));
assert.ok(!/entryAreaReserve|maxDSOForProposedFivePercentReserve/.test(JSON.stringify(result)));
fs.writeFileSync(path.join(out,'final-engineering-closure.html'),html);
const browser=await puppeteer.launch({executablePath:execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();await page.setContent(html,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
 await page.pdf({path:path.join(out,'final-engineering-closure.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,
 headerTemplate:'<div style="font-size:7px;color:#466170;margin:0 16mm">ECR · DESIGN 269 · FINAL ENGINEERING CLOSURE CANDIDATE</div>',
 footerTemplate:'<div style="font-size:7px;color:#665243;width:100%;margin:0 16mm;display:flex;justify-content:space-between"><span>PRE-PILOT · NOT FOR FABRICATION · NOT IMPLEMENTED</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'});
}finally{await browser.close();}
console.log(JSON.stringify({nominal,sensitivity,eye},null,2));