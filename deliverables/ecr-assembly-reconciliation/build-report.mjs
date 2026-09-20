import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {execFileSync} from 'node:child_process';
const dir=path.dirname(new URL(import.meta.url).pathname);
const read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
const r=read('assembly-reconciliation.json'),a=read('approved-component-manifest.json'),e=read('saved-evidence.json'),g=e.revisions[0].snapshot.geometry;
const f=(n,d=3)=>Number(n.toFixed(d)).toLocaleString('en-US',{maximumFractionDigits:d});
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const p=s=>`<p>${s}</p>`,note=s=>`<div class="note">${s}</div>`;
const table=(heads,rows)=>`<table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const sec=(title,body)=>`<section><h1>${title}</h1>${body}</section>`;
const svgHead=(w,h)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><style>text{font-family:DejaVu Sans,sans-serif;fill:#193e50;font-size:12px}.shell{fill:none;stroke:#355564;stroke-width:1.7}.old{fill:#e4edf1;stroke:#506c79;stroke-width:1}.new{fill:#188291;stroke:#155a65;stroke-width:1}.line{stroke:#67828b;stroke-width:1;fill:none}.axis{stroke:#a3b2b8;stroke-dasharray:5 3}.warn{fill:#a45226}</style>`;
function fullColumn(){
 const y=z=>700-(z+300)*.067;
 let s=svgHead(680,800)+`<text x="20" y="24" style="font-size:17px">A-01 · Saved vessel with approved replacement internals</text><text x="20" y="45">Elevation datum: bottom internal head pole Z = 0; all dimensions mm</text>`;
 s+=`<path class="shell" d="M180 ${y(150)} L180 ${y(8370)} Q180 ${y(8520)} 240 ${y(8520)} Q300 ${y(8520)} 300 ${y(8370)} L300 ${y(150)} Q300 ${y(0)} 240 ${y(0)} Q180 ${y(0)} 180 ${y(150)}"/>`;
 s+=`<path class="shell" d="M180 ${y(0)} V${y(-300)} H300 V${y(0)}"/><rect class="old" x="210" y="${y(9120)}" width="60" height="${y(8520)-y(9120)}"/><line class="axis" x1="240" y1="55" x2="240" y2="730"/>`;
 s+=`<rect class="old" x="235.6" y="${y(8670)}" width="8.8" height="${y(450)-y(8670)}"/>`;
 for(const st of r.stators)s+=`<path class="new" d="M180 ${y(st.centre)} H228.8 M251.2 ${y(st.centre)} H300"/>`;
 for(const v of r.rotors)s+=`<rect class="new" x="220.2" y="${y(v.top)}" width="39.6" height="${Math.max(1.5,y(v.bottom)-y(v.top))}"/>`;
 for(const v of r.supports)s+=`<rect class="old" x="180" y="${y(v.top)}" width="120" height="${y(v.bottom)-y(v.top)}"/>`;
 const labels=[[9120,'Drive top 9120'],[8670,'Shaft / pedestal top 8670'],[8520,'Top pole / seal datum 8520'],[8370,'Top tangent 8370'],[8070,'Upper support 8070'],[7770,'ST39 centre 7770'],[7680,'R39 centre 7680'],[840,'R01 centre 840'],[750,'ST00 centre 750'],[450,'Lower support 450'],[150,'Bottom tangent 150'],[0,'Bottom pole / drain 0'],[-300,'Skirt bottom −300']];
 let last=0;for(const [z,t]of labels){const yy=y(z);let ty=Math.max(yy,last+19);last=ty;s+=`<path class="line" d="M302 ${yy} H330 L350 ${ty} H365"/><text x="370" y="${ty+4}">${t}</text>`;}
 s+=`<path class="line" d="M130 ${y(7770)} H160 M140 ${y(7770)} V${y(750)} M130 ${y(750)} H160"/><text transform="translate(120 ${y(4200)}) rotate(-90)">39 × 180 = 7020 active centre-plane span</text>`;
 s+=`<text x="20" y="750">Teal: approved successor components; grey: retained saved assembly envelopes.</text><text x="20" y="772">Axial scale compressed. Plate/rotor visibility enhanced; schedules govern.</text></svg>`;
 return s;
}
function endZones(){
 let s=svgHead(680,760)+`<text x="20" y="24" style="font-size:17px">A-02 · End zones and support axial placement</text><text x="20" y="46">Projected connection OD bands; azimuth and exact centres follow in schedule.</text>`;
 for(const [side,start,end,ox,title]of [['bottom',0,1000,40,'BOTTOM END'],['top',7500,8500,365,'TOP END']]){
  const yy=z=>650-(z-start)*.53;
  s+=`<text x="${ox}" y="83">${title}</text><path class="shell" d="M${ox+35} ${yy(end)} V${yy(start)} M${ox+155} ${yy(end)} V${yy(start)}"/>`;
  const st=r.stators[side==='bottom'?0:39],rt=r.rotors[side==='bottom'?0:38],sup=r.supports[side==='bottom'?0:1];
  for(const v of [st,rt,sup]){const width=v.id.startsWith('R')?39.6:120,x=ox+95-width/2;s+=`<rect class="${v.id.startsWith('SUP')?'old':'new'}" x="${x}" y="${yy(v.top)}" width="${width}" height="${Math.max(2,yy(v.bottom)-yy(v.top))}"/><text x="${ox+164}" y="${yy(v.centre)+4}">${v.id} ${f(v.centre,0)}</text>`;}
  const ns=r.nozzles.filter(n=>n.axis==='radial'&&(side==='bottom'?n.centre[2]<750:n.centre[2]>7770));
  for(const n of ns)s+=`<rect class="old" x="${ox+12}" y="${yy(n.top)}" width="23" height="${yy(n.bottom)-yy(n.top)}"/><text x="${ox-3}" y="${yy(n.centre[2])+4}" text-anchor="end">${n.id}</text>`;
  const zt=side==='bottom'?150:8370;s+=`<line class="axis" x1="${ox+10}" x2="${ox+270}" y1="${yy(zt)}" y2="${yy(zt)}"/><text x="${ox+165}" y="${yy(zt)-5}">Tangent ${zt}</text>`;
 }
 s+=`<text x="20" y="697">Support bands: 438–462 and 8058–8082. Nearest terminal plate gap: 286.</text><text x="20" y="719">Support-to-process-neck OD axial margin: 12; nozzle-to-terminal plate: ≥109.</text><text x="20" y="742">Connections are projected for spacing only; this is not a common cutting plane.</text></svg>`;
 return s;
}
function supportDetail(){
 let s=svgHead(680,780)+`<text x="20" y="25" style="font-size:17px">A-03 · Support / shaft / wall interfaces</text><text x="20" y="49">Saved three-arm supports at Z450 and Z8070; azimuths 30°, 150°, 270°</text>`;
 const cx=250,cy=270,k=.58;
 s+=`<circle class="shell" cx="${cx}" cy="${cy}" r="${300*k}"/>`;
 for(const arm of r.supports[0].arms){s+=`<polygon class="old" points="${arm.footprint.map(([x,y])=>`${cx+x*k},${cy-y*k}`).join(' ')}"/>`;}
 s+=`<circle class="old" cx="${cx}" cy="${cy}" r="${33*k}"/><circle fill="white" stroke="#355564" cx="${cx}" cy="${cy}" r="${22*k}"/><circle class="axis" fill="none" cx="${cx}" cy="${cy}" r="${56*k}"/>`;
 s+=`<text x="440" y="180">Ø600 shell ID</text><text x="440" y="210">Ø66 housing envelope</text><text x="440" y="238">Ø44 shaft</text><text x="440" y="270">12-wide × 24-deep arms</text><text x="440" y="305">Dashed Ø112 is</text><text x="440" y="324">projection only.</text><text x="440" y="343">Stator is 300 mm</text><text x="440" y="362">away centre-to-centre.</text>`;
 s+=`<text x="20" y="493" style="font-size:15px">Wall termination — existing boundary requires detailing</text>`;
 s+=`<path class="shell" d="M310 530 Q335 580 310 630"/><rect class="old" x="120" y="550" width="205" height="60"/><text x="350" y="553">Rectangular tip corners:</text><text x="350" y="576">r = √(300² + 6²)</text><text x="350" y="599">= 300.059994 mm</text><text x="350" y="622" class="warn">0.059994 beyond inner envelope</text>`;
 s+=`<text x="20" y="666">Detail is exaggerated; not to scale. Specify shell-conformal termination / weld.</text><text x="20" y="690">This is an inherited assembly-interface issue, not turbine/stator interference.</text><text x="20" y="714">Housing bore, support joints and lower journal engagement remain undefined.</text><text x="20" y="750">No approved component dimension changed; no historical support solid overwritten.</text></svg>`;
 return s;
}
function topDetail(){
 let s=svgHead(680,650)+`<text x="20" y="25" style="font-size:17px">A-04 · Top-head, seal and drive reserved interfaces</text><text x="20" y="48">Schematic axial/radial projection; actual vent is at azimuth 315°.</text>`;
 const cx=290,k=.63,yy=z=>540-(z-8370)*.52;
 s+=`<path class="shell" d="M${cx-300*k} ${yy(8370)} Q${cx-300*k} ${yy(8520)} ${cx} ${yy(8520)} Q${cx+300*k} ${yy(8520)} ${cx+300*k} ${yy(8370)}"/>`;
 for(const id of ['drive-body','drive-pedestal','seal','shaft']){const v=r.envelopes.find(x=>x.id===id),lo=Math.max(v.bottom,8370);s+=`<rect class="old" style="fill-opacity:.35" x="${cx-v.diameter*k/2}" y="${yy(v.top)}" width="${v.diameter*k}" height="${yy(lo)-yy(v.top)}"/>`;}
 const vent=r.nozzles.find(x=>x.id==='V01');s+=`<rect class="old" x="${cx+(180-14.4)*k}" y="${yy(vent.top)}" width="${28.8*k}" height="${yy(vent.bottom)-yy(vent.top)}"/>`;
 for(const [z,t]of [[9120,'Drive top9120'],[8670,'Shaft end / pedestal top8670'],[8580,'Seal top8580'],[8520,'Top pole8520'],[8370,'Top tangent8370']])s+=`<path class="line" d="M${cx+95} ${yy(z)} H500"/><text x="506" y="${yy(z)+4}" style="font-size:10px">${t}</text>`;
 s+=`<text x="20" y="575">Vent inner radial edge165.6; pedestal radius150 → 15.6 geometric clearance.</text><text x="20" y="598">Shaft requires top-head penetration. Seal/pedestal overlap is reserved nesting.</text><text x="20" y="622" class="warn">Pressure-boundary cut, mount, cavity and coupling engagement NOT detailed.</text></svg>`;
 return s;
}
const svgs={'column-review.svg':fullColumn(),'end-zones-review.svg':endZones(),'support-interface-review.svg':supportDetail(),'top-interface-review.svg':topDetail()};
for(const [name,data]of Object.entries(svgs))fs.writeFileSync(path.join(dir,name),data);
let body=sec('ECR STAGE-5<br>APPROVED COMPONENT BASIS<br>WHOLE-COLUMN ASSEMBLY RECONCILIATION',
 p('Design269 · Stage-3 run64 · Stage-4 calculation13 · actual saved Stage-5 record1 / revision1')+
 note('<b>Component geometry approved and frozen by the user. All approved turbine/stator dimensions are retained.</b> This engineering manifest is not a new production rule-set version. The existing application and historical R1 snapshot remain unchanged.')+
 p('PRELIMINARY PRE-PILOT GEOMETRY — NOT FOR FABRICATION. Retained hydraulic qualification: SCALE_UP_EXTRAPOLATION. The accepted Stage-3 audit was not rerun, reoptimized or reopened.')+
 table(['Disposition','Result'],[
 ['Component freeze','Approved 198-mm shrouded turbine and 112-mm-centre / 84-hole stator frozen as a canonical hashed engineering manifest.'],
 ['Positioned internals','39 rotors and40 stators reconcile at the actual saved elevations over7020mm centre-plane active span.'],
 ['Approved-component interferences','None found against positioned vessel, supports and saved connection-neck envelopes using full rotating envelopes. No approved dimension changes.'],
 ['Assembly gate','Retained interface holds: support-wall conformity, shaft/head penetration, bearings/coupling, plate retention and installation details. These are not silently passed.'],
 ['Production status','Not implemented; no database or saved drawing changes. Whole-column detail release is not approved by this report.']
 ])+p('Component canonical SHA-256: <code>'+r.manifestCanonicalSha256+'</code>'));
body+=sec('1 · Approval boundary and frozen component manifest',
 p('The approval freezes the detailed component geometry from the final engineering closure report. It does not retrospectively modify old R1 rotor/stator dimensions, approve fabrication or qualify the complete assembly. The manifest reproduces the exact approved hole diameter and every hole centre; no display rounding changes its geometry.')+
 table(['Feature','Frozen value [mm unless noted]','Authority'],[
 ['Column ID / rotor OD / pitch / speed','600 / 198 / 180 /45RPM','Inherited Stage3'],
 ['Turbine architecture','Double-entry radial-flow shrouded;6 straight radial blades at60°','User-approved construction basis'],
 ['Eye / radial working width','130 /34','Approved preliminary engineering choice; not source correlation'],
 ['Shaft / hub OD × height','44 /70×24','Approved preliminary component envelope'],
 ['Blade thickness / inner height / paddle height','3 /16 /28','Approved component choices'],
 ['Upper and lower shrouds','OD198 / ID130 / thickness2 each','Approved geometry'],
 ['Overall height','32 =28+2×2','System calculated'],
 ['Stator OD / plate thickness','600 /4','Approved geometry'],
 ['Overlap CE / stator centre','9 /112=130−2×9','Approved CE; calculated DSO'],
 ['Perforations','84 ×Ø'+f(a.stator.holeDiameter,10),'Exact nominal area closure'],
 ['Rows PCD / quantities','200/12;310/18;420/24;530/30','Approved layout'],
 ['First angles / increments','15°/30°;10°/20°;7.5°/15°;6°/12°','Approved sixfold stagger'],
 ['No-hole lanes','Six ×8 wide, axes0/60/120/180/240/300°','Retained plate; no extra blockage'],
 ['Gross physical free area','0.400000; shaft-only diagnostic0.3946222222','Not returned to upstream correlations'],
 ])+p('The95% turning-area sizing screen remains removed. Positive overlap is geometric projection, not a sealed duct or proof of hydraulic capture. Actual upper/lower eye-face areas remain11752.698mm² each; hub/web cuts and radial-turn areas are diagnostics, not proven hydraulic throats.'));
body+=sec('2 · Actual saved assembly and chain verification',
 table(['Record / verification','Evidence'],[
 ['Saved design / record / revision','269 /1 /1, saved '+esc(e.revisions[0].created_at)],
 ['Source Stage3 / Stage4','64 /13; IDs and Stage3 immutable hashes agree'],
 ['Saved Stage5 snapshot integrity','Canonical snapshot matches database immutable_hash'],
 ['Saved source integrity','Canonical sourceStage3+sourceStage4 hash matches source_hash'],
 ['Saved geometry and rules manifest','Both canonical hashes match the immutable snapshot declarations'],
 ['Stage4 chain','Saved Stage5 sourceStage4 result equals SELECT-read calculation13 result; stored Stage3 hash matches run64'],
 ['Method','Direct SELECT inside BEGIN READ ONLY, rolled back. No API, optimizer, audit replay or source writer invoked.'],
 ['Snapshot provenance','Actual database record—not the earlier browser verification fixtures.']
 ])+p('The recorded chain is the specifically requested saved basis. Snapshot currentness flags alone are not used to infer hydraulic validity. The preserved accepted upstream audit establishes the choice; this task only verifies record consistency.')+
 table(['Frozen inherited fact','Value'],[['D / DR / hc','600 /198 /180mm'],['Operating speed / retained window','45RPM /30–60RPM'],['Phase configuration','NMP continuous / RRBO dispersed'],['Required / installed active height','7000 /7020mm'],['Compartment count / separators','39 /40 under existing two-terminal-boundary convention'],['Qualification','SCALE_UP_EXTRAPOLATION']]));
body+=sec('3 · Coordinate convention and complete stack closure',
 p(r.datum+'. The same datum and saved elevations are retained. Turbine-local Z=0 translates to each saved rotor centre; approved shrouds extend±16 and stator plates±2.')+
 table(['Assembly datum / interval','Elevation or span [mm]'],[
 ['Skirt bottom / vessel bottom pole','−300 /0'],['Bottom head / bottom tangent','0–150 /150'],['Bottom end-zone centre allowance','150–750 =600'],['First stator material interval','748–752'],['First / last rotor centre','840 /7680'],['Active separator-centre span','750–7770 =7020 =39×180'],['Last stator material interval','7768–7772'],['Complete separator-material stack','748–7772 =7024; not7020'],['Top end-zone centre allowance','7770–8370 =600'],['Actual terminal-plate-face to head-tangent distance','598 each end'],['Straight shell tangent span','150–8370 =8220'],['Top head / top pole','8370–8520 /8520'],['Pedestal / drive body','8520–8670 /8670–9120'],['Overall skirt-to-drive height','−300–9120 =9420'],['Shaft extent / length','450–8670 /8220']
 ])+p('Plate thickness does not add40×4 to active height: the40 separator centres already bound39 pitches. The terminal plates protrude2mm beyond each active centre-plane boundary. The39 compartment face clear heights are176mm; each32mm rotor leaves72mm on both sides. Adjacent rotating envelopes have148mm axial separation.')+
 p('Old saved rotor height30.8 becomes approved32 (+0.6mm per side); old stator thickness3.75 becomes4 (+0.125mm per side). Both substitutions are evaluated at unchanged centres. Old single opening379.473319 is replaced only in this successor study by112 plus84holes; historical data is untouched.'));
body+=sec('4 · Whole-column review elevation',svgs['column-review.svg']);
body+=sec('5 · All39 turbine elevations and clearances',
 p('All lengths mm. R-bottom/top include both shrouds. Adjacent plate face clearances are calculated individually from saved elevations, not inferred from a representative compartment.')+
 table(['Rotor','Centre','Bottom','Top','Lower gap','Upper gap'],r.rotors.map((v,i)=>[v.id,f(v.centre),f(v.bottom),f(v.top),f(v.bottom-r.stators[i].top),f(r.stators[i+1].bottom-v.top)])));
body+=sec('6 · All40 stator elevations and quantities',
 table(['Stator','Centre [mm]','Bottom face','Top face'],r.stators.map(v=>[v.id,f(v.centre),f(v.bottom),f(v.top)]))+
 table(['Part','Whole-column quantity'],Object.entries(r.quantities).map(([k,v])=>[esc(k),v]))+
 p('Every plate uses the same approved full84hole pattern. Six no-hole lanes are retained parent plate, not additional bars.40plates comprise38 internal shared separators plus2terminal plates; this is the existing assembly convention, not a universal literature requirement.'));
body+=sec('7 · End zones, shaft supports and rotating clearance',
 '<div style="max-width:94%;margin:auto">'+svgs['end-zones-review.svg'].replace('<svg ','<svg style="max-height:177mm" ')+'</div>'+
 table(['Interface','Minimum geometric clearance [mm]'],[['Support to terminal plate','286'],['Support to nearest rotating envelope','362'],['Support to process-connection OD band','12'],['Nozzle OD band to terminal plate','109'],['Nozzle OD band to rotor envelope','185'],['Support to head envelope','288']]));
body+=sec('8 · Support plan, wall conformity and shaft engagement',
 svgs['support-interface-review.svg']+
 p('The approved Ø112 stator opening does not need to pass the Ø66 support housing or radial arms at the same station: their centres are300mm outside the terminal separator centres, with286mm face separation. Shrinking the stator central opening therefore causes no support/stator collision.')+
 p('At each wall end the saved rectangular arm uses u=300, |v|≤6, so its corners lie0.059994mm outside the specified internal shell radius. This is a real inherited boundary nonconformance, not a new rotor/stator clash. It is not evidence of penetration depth into an actual wall because no wall thickness is specified.')+
 p('Recommended assembly-only resolution, not silently applied: use a shell-conformal end u=√(300²−v²), plus a separately engineered wall attachment. At |v|=6 the axial-in-plan trim is0.060006mm. The hub-side arm root is also a tangent interface rather than a saddle; at |v|=6 a conformal Ø66 housing surface is u=√(33²−6²)=32.44996, compared with saved u=33. The joint/weld fills or profiles that transition. No approved turbine or stator dimension changes.')+
 p('Lower shaft starts at450 inside the438–462 lower housing band: nominal envelope engagement only12mm, not24. Upper housing8058–8082 lies wholly along the shaft. Neither housing specifies bearing bore, retention or bearing type. These are intended shaft-support interfaces requiring definition, not solid disks certified clear of the shaft.'));
body+=sec('9 · Full12-connection schedule',
 p('All original bores, OD, centres, azimuths and60mm projections are retained. The ten shell connections project radially outward from r300; no inward dip tube, distributor or quill is part of the saved model. OD bands, not centre lines alone, govern separation.')+
 table(['Tag / service','Axis / azimuth','Centre Z','Bore / OD','Envelope Z range'],r.nozzles.map(n=>[n.id+'<br>'+esc(n.service),n.axis+' /'+(n.azimuth??'axial')+'°',f(n.centre[2]),f(n.bore)+' /'+f(n.OD),f(n.bottom)+'–'+f(n.top)]))+
 p('D01 is a downward axial drain on the bottom pole. V01 is an upward neck at radial offset180 and315°, not an absolute-high-point vent. Both preserve the complete64-point saved head/neck intersection boundary. Saved bore/OD does not specify pressure-wall thickness, flange, valve or reinforcement geometry.'));
body+=sec('10 · Connection coordinates and boundary treatment',
 table(['Tag','Centre XYZ [mm]','Endpoint XYZ [mm]'],r.nozzles.map(n=>[n.id,n.centre.map(x=>f(x)).join(', '),n.end.map(x=>f(x)).join(', ')]))+
 p('The report calculation JSON retains every stored head-intersection point. All128 points were checked against the analytical ellipsoids with residual below10⁻⁸mm. For D01 the saved outer-neck penetration boundary spans Z0–0.172900; the downward endpoint is−60. For V01 it spans8484.246050–8495.076617, with neck endpoint8550. The exact stored head ellipsoid, not a flat plane at neck centre, supplies these boundary limits.')+
 p('Analytical head convention: bottom Z=150[1−√(1−(r/300)²)]; top Z=8370+150√(1−(r/300)²). Head thickness, material surfaces and cut/weld details are not present. The intended nozzle/head or nozzle/shell penetration itself is not treated as an unintended collision; pressure-boundary construction remains open.')+
 p('All66 neck pairs have positive clearance between enclosing capsules; minimum lower bound219.319994mm. Capsules conservatively enclose the OD neck cylinders and saved axial head-boundary extensions. A positive bound proves separation of these modelled necks only; flanges, valves and field piping have no defined envelopes.')+
 p('The drain is inside the skirt perimeter, not colliding with a solid Ø600 skirt cylinder. Radial drain-to-skirt nominal gap285.6. Drain endpoint−60 is15mm above the access cutout top−75; access window180wide×150high is centred at Z−150, azimuth0. No tool-removal or maintenance-access claim is made.'));
body+=sec('11 · Top head, seal and drive integration',
 svgs['top-interface-review.svg']+
 p('The shaft crosses the top-head ideal surface at Z8519.596123 at r22, rising to pole8520 at r0. This is an intended shaft penetration that must be represented as a real cut and sealed boundary in the next assembly detail. The saved snapshot contains no complete solid-resolved shaft neck or pressure-boundary opening.')+
 p('Seal envelope Ø88 spans8520–8580; pedestal Ø300 spans8520–8670. Their overlap is intentional nested reserved space, not two asserted solid bodies. The shaft ends at8670, exactly where the drive-body envelope begins; coupling insertion/engagement is not defined. The assembly cannot be released as a fully connected solid model on envelope evidence alone.')+
 p('Vent r180 with OD28.8 has inner radial edge165.6, leaving15.6mm to the Ø300 pedestal/drive cylinder where their Z extents overlap. Its clearance to the Ø88 seal cylinder is121.6. Head mount, shell reinforcement and drive/seal service space remain unqualified.'));
body+=sec('12 · Exhaustive check matrix and proof boundaries',
 p('The standalone calculation writes every row to assembly-reconciliation.json. '+r.checks.length+' checks are enumerated, including intended interfaces. “PASS” means geometric separation for the stated ideal solids/bounds, not mechanical adequacy. Zero intended interfaces are never counted as positive clearance.')+
 table(['Pair family','Count','Minimum [mm]','Status'],r.matrix.map(v=>[esc(v.family),v.count,f(v.minClearanceMm,6),esc(v.statuses.join(', '))]))+
 p('All1560rotor/stator pairs,741rotor pairs and780stator pairs are enumerated. Rotors are checked as full360° radius99×height32 swept cylinders, enclosing shrouds, finite-thickness blades and hubs. Frozen blade clocking alone is not used as a clash test.')+
 p('Axial separation of complete bounding intervals is a sufficient proof even when radial projections overlap. The reported axial gaps are separating-plane distances, not necessarily shortest three-dimensional surface distances. No sample meshes or sparse angle sampling are used to claim clearance.')+
 p('Counterparts represented only by reserved envelopes remain explicitly marked as interfaces. The matrix is not a blanket pass for missing flange, bearing, weld, fastener, fillet, wall or attachment solids.'));
body+=sec('13 · Assembly attachment and installation reconciliation',
 table(['Load path / interface','Reconciled location','Remaining assembly definition'],[
 ['Turbine torque path','Six webs connect hub to outer paddles; shrouds meet paddle faces at±14','Shaft/hub key or clamp; blade/shroud/hub joint solids and tolerances. No arbitrary hardware inserted.'],
 ['Stator load path','Plate to continuous peripheral unperforated rim; nominal OD600 at shell ID600','Ledge/retainer or welded seat, bypass seal, fit allowance and access sequence.'],
 ['Peripheral stator rim','Outer hole edge maximum r284.779740; unperforated rim to r300 is15.220260','An available geometric region, not approved shelf width or strength calculation. Any added feature must avoid holes.'],
 ['Radial no-hole lanes','Six8wide lanes retained in plate','Not separate bars or supports crossing the central opening. No extra blockage deduction.'],
 ['Support load path','Ø66 housing → three12×24 arms → shell at Z450/8070','Shell-conformal arm ends, housing bore, journal engagement and wall attachment.'],
 ['Shaft/seal/drive path','Shaft450–8670; seal at8520; pedestal to8670','Top-head cut/seal mounting, coupling engagement and retained bearing access.'],
 ['Installation/removal','39rotors,40full-width plates, one continuous shaft','No demonstrated insertion route through an unspecified open flange/head. Assembly sequencing or split/welded construction requires an explicit decision.'],
 ])+
 note('Whole-column physical layout reconciliation is complete for the defined ideal envelopes; detailed interface closure is not. The approved components can be retained unchanged. Do not invent a bore, flange, split plate or shaft extension and call it already approved.')+
 p('Potential additions must be checked against the preserved manifest. Prefer changing assembly interfaces rather than approved turbine/stator geometry. A future request to alter an approved dimension must identify a measured/modelled interference and its location.'));
body+=sec('14 · Findings, holds and recommended disposition',
 table(['Finding','Disposition'],[
 ['Approved turbine/stator component basis','FROZEN engineering manifest; no dimensions changed.'],
 ['39×180 active stack /7020 centre span','Reconciled against actual Stage4 and saved Stage5 elevations.'],
 ['Rotating and stationary component separation','No unintended interference in the represented positioned volumes.'],
 ['Inherited support-wall corner overrun','0.059994mm beyond internal shell; assembly-only conformal termination/joint detail required.'],
 ['Shaft/head and support-housing passages','Intended interfaces, not fully modelled cuts/bearing solids; remain explicit assembly holds.'],
 ['Stator edge and attachment','Zero nominal fit; fit/retention/bypass seal and installation method unresolved.'],
 ['Fabrication qualifications','Pressure design, shaft dynamics/critical speed, stresses, fatigue, weld design, balance, corrosion, material selection, tolerances and component selection remain outside this geometric proof.'],
 ['Hydraulic performance','SCALE_UP_EXTRAPOLATION retained; unchanged areas do not demonstrate successor hydraulic equivalence or pumping capacity.'],
 ])+
 note('<b>Recommendation:</b> retain the approved turbine/stator manifest without dimensional changes. Accept the reconciled positioning/envelope layout as the assembly-development basis, subject to closing the named inherited interfaces. Do not declare the entire column fabrication-ready or implement a production successor version from this report alone.')+
 p('This report distinguishes assembly geometry holds from mechanical/fabrication qualification. The wall-tip boundary, required head penetration and unspecified installation/retention interfaces are actual geometry/detail matters, not issues that may be dismissed merely by a NOT FOR FABRICATION warning.'));
body+=sec('15 · Traceability, preservation and reproducibility',
 table(['Identity','SHA-256'],Object.entries(r.saved).filter(([k])=>/Hash/.test(k)).map(([k,v])=>[esc(k),'<code>'+v+'</code>']))+
 p('Approved component manifest canonical SHA-256: <code>'+r.manifestCanonicalSha256+'</code>. Canonicalization recursively sorts object keys, retains array order and hashes UTF-8 JSON.stringify output. The .sha256 file deliberately labels this canonical method; it is not the pretty-printed-file byte hash.')+
 p('Artifacts: approved-component-manifest.json and .sha256; saved-evidence.json / saved-evidence-after.json; assembly-reconciliation.json with allchecks/schedules/connection boundaries; read-evidence.ts (SELECT-only); reconcile.mjs (offline); build-report.mjs (presentation only); preservation-verification.json and inspection.json.')+
 p('Reproduce offline: node deliverables/ecr-assembly-reconciliation/reconcile.mjs, then node deliverables/ecr-assembly-reconciliation/build-report.mjs. The database reader is separate and never called by these scripts. No prior report/drawing is overwritten.')+
 p('The before/after evidence comparison and68 scientific/presentation source-file hashes are recorded separately. The accepted Stage3 audit and its replay were not rerun. No production successor version, application change or database mutation was performed.')+
 p('<b>PRELIMINARY PRE-PILOT GEOMETRY — NOT FOR FABRICATION.</b> Component approval is distinct from whole-column detailed-assembly and fabrication approval.'));
const font=fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').toString('base64');
const html=`<!doctype html><html><head><meta charset="utf-8"><title>ECR approved component basis — whole-column assembly reconciliation</title><style>
@font-face{font-family:Review;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}body{font-family:Review,sans-serif;color:#213747;font-size:9pt;line-height:1.42;margin:0}section{break-before:page;padding-top:4mm}section:first-child{break-before:auto}h1{font-size:17pt;line-height:1.28;color:#173e55;margin:0 0 5mm;break-after:avoid}p{margin:0 0 3mm;orphans:3;widows:3}table{width:100%;border-collapse:collapse;font-size:8pt;margin:4mm 0}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #bacbd4;padding:2mm;vertical-align:top}th{background:#e5eef3;text-align:left}code{font-family:Review;font-size:7pt;overflow-wrap:anywhere}svg{width:100%;height:auto;max-height:224mm;display:block;break-inside:avoid}.note{border-left:4px solid #966426;background:#fff5e7;padding:4mm;margin:5mm 0;break-inside:avoid}@page{size:A4;margin:17mm 16mm 19mm}@media screen{body{max-width:210mm;margin:20px auto;background:#edf2f5}section{background:white;padding:18mm;margin-bottom:20px}}</style></head><body>${body}</body></html>`;
fs.writeFileSync(path.join(dir,'whole-column-reconciliation.html'),html);
const browser=await puppeteer.launch({executablePath:execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{const page=await browser.newPage();await page.setContent(html,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
await page.pdf({path:path.join(dir,'whole-column-reconciliation.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,
 headerTemplate:'<div style="font-size:7px;color:#466170;margin:0 16mm">ECR · DESIGN 269 · APPROVED COMPONENT BASIS / ASSEMBLY RECONCILIATION</div>',
 footerTemplate:'<div style="font-size:7px;color:#665243;width:100%;margin:0 16mm;display:flex;justify-content:space-between"><span>PRE-PILOT · NOT FOR FABRICATION · NOT IMPLEMENTED</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'});}finally{await browser.close();}
console.log('Rendered whole-column reconciliation PDF and HTML.');