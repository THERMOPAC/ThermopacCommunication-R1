import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';

const dir = path.dirname(new URL(import.meta.url).pathname);
const read = name => fs.readFileSync(path.join(dir, name), 'utf8');
const audit = read('stage3-audit.md'), geom = read('geometry-proposal.md'), source = read('source-review.md');
const escape = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const inline = s => escape(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
function md(text) {
  const lines=text.trim().split('\n'); let out='', table=false, list=false;
  const close=()=>{if(table){out+='</tbody></table>';table=false;}if(list){out+='</ul>';list=false;}};
  for(let i=0;i<lines.length;i++){
    const l=lines[i].trim();
    if(l.startsWith('|')){
      if(/^\|[\s:|-]+\|$/.test(l))continue;
      const cells=l.slice(1,-1).split('|').map(x=>inline(x.trim()));
      if(!table){close();out+='<table><thead><tr>'+cells.map(c=>`<th>${c}</th>`).join('')+'</tr></thead><tbody>';table=true;}
      else out+='<tr>'+cells.map(c=>`<td>${c}</td>`).join('')+'</tr>';
    }else if(/^[-*] /.test(l)||/^\d+\. /.test(l)){
      if(table){out+='</tbody></table>';table=false;}if(!list){out+='<ul>';list=true;}out+='<li>'+inline(l.replace(/^([-*]|\d+\.) /,''))+'</li>';
    }else{close();if(/^#+ /.test(l)){const level=Math.min(4,l.match(/^#+/)[0].length);out+=`<h${level}>${inline(l.replace(/^#+ /,''))}</h${level}>`;}else if(l)out+='<p>'+inline(l)+'</p>';}
  }close();return out;
}
const part=(text,start,end)=>{const a=text.indexOf(start);if(a<0)throw Error(start);const b=end?text.indexOf(end,a+start.length):text.length;if(b<0)throw Error(end);return text.slice(a,b).replace(/^#+[^\n]+\n/,'').trim();};
const section=(title,body)=>`<section><h1>${title}</h1>${body}</section>`;
const color='#1e4256';
const svgStart=(h)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 ${h}" role="img"><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7" fill="#087b94"/></marker></defs><style>text{font:12px 'DejaVu Sans',sans-serif;fill:#183748}.sm{font-size:10px}.title{font-size:16px;font-weight:bold}.solid{fill:#dce6ec;stroke:#243f52;stroke-width:1.2}.shroud{fill:#7196ac;stroke:#243f52}.dim{stroke:#496577;stroke-width:1;fill:none}.flow{stroke:#087b94;stroke-width:2;fill:none;marker-end:url(#arrow)}.axis{stroke:#91a4af;stroke-dasharray:5 4;fill:none}.label{paint-order:stroke;stroke:white;stroke-width:4px;stroke-linejoin:round}</style>`;
const txt=(x,y,t,cl='',anchor='start')=>`<text x="${x}" y="${y}" class="${cl}" text-anchor="${anchor}">${escape(t)}</text>`;
const line=(x1,y1,x2,y2,c='dim')=>`<path d="M${x1},${y1} L${x2},${y2}" class="${c}"/>`;
const dimH=(x1,x2,y,t)=>line(x1,y,x2,y)+line(x1,y-5,x1,y+5)+line(x2,y-5,x2,y+5)+txt((x1+x2)/2,y-7,t,'label','middle');
const dimV=(x,y1,y2,t)=>line(x,y1,x,y2)+line(x-5,y1,x+5,y1)+line(x-5,y2,x+5,y2)+txt(x+7,(y1+y2)/2+4,t,'label');
function turbine(){
  let s=svgStart(690)+txt(25,25,'T-01 • Proposed turbine — plan and blade-plane section','title');
  const cx=210,cy=215,k=1.35;
  s+=`<circle cx="${cx}" cy="${cy}" r="${99*k}" class="shroud"/><circle cx="${cx}" cy="${cy}" r="${65*k}" fill="white" stroke="${color}"/>`;
  for(let i=0;i<6;i++)s+=`<g transform="rotate(${-i*60} ${cx} ${cy})"><path d="M${cx+35*k},${cy} H${cx+65*k}" stroke="#294856" stroke-width="${3*k}"/><path d="M${cx+65*k},${cy} H${cx+98.99*k}" stroke="#294856" stroke-width="1.5" stroke-dasharray="4 3"/></g>`;
  s+=`<circle cx="${cx}" cy="${cy}" r="${35*k}" class="solid"/><circle cx="${cx}" cy="${cy}" r="${22*k}" fill="#8196a5" stroke="${color}"/>`;
  s+=line(cx-158,cy,cx+158,cy,'axis')+line(cx,cy-158,cx,cy+158,'axis');
  s+=dimH(cx-99*k,cx+99*k,cy+161,'Ø198 swept OD');
  s+=line(cx+60,cy-63,410,115)+txt(420,115,'Ø130 eye (both sides)')+txt(420,138,'Ø70 hub / Ø44 shaft');
  s+=txt(420,190,'Upper shroud shown opaque')+txt(420,211,'6 blades at 60° intervals')+txt(420,232,'Covered blade portions hidden')+txt(420,253,'No continuous outer rim');
  s+=`<path class="flow" d="M315,155 L366,126"/>`+txt(380,78,'Radial discharge')+txt(380,95,'between blades');
  s+=txt(25,420,'BLADE-PLANE SECTION • equal horizontal/vertical scale','title');
  const x=330,y=515,sc=2.25;
  const rect=(a,b,c,d,cl='solid')=>`<rect x="${x+a*sc}" y="${y-d*sc}" width="${(b-a)*sc}" height="${(d-c)*sc}" class="${cl}"/>`;
  s+=rect(-22,22,-40,40)+rect(-35,-22,-12,12)+rect(22,35,-12,12);
  for(const sign of [-1,1]){
    const rr=(a,b,c,d,cl)=>sign===1?rect(a,b,c,d,cl):rect(-b,-a,c,d,cl);
    s+=rr(35,65,-8,8)+rr(65,99,-14,14)+rr(65,99,14,16,'shroud')+rr(65,99,-16,-14,'shroud');
  }
  s+=line(x-245,y,x+245,y,'axis')+dimH(x-99*sc,x+99*sc,623,'Ø198')+dimH(x-65*sc,x+65*sc,650,'Ø130 eye')+dimV(580,y-16*sc,y+16*sc,'32 overall');
  s+=txt(33,454,'t = 2 each shroud')+txt(33,472,'Paddle H = 28')+txt(33,570,'Inner web H = 16')+txt(33,589,'Hub H = 24; blade t = 3');
  s+=line(x+48*sc,440,x+48*sc,484,'flow')+line(x+48*sc,606,x+48*sc,551,'flow');
  s+=txt(460,456,'Upper entry','sm')+txt(460,596,'Lower entry','sm');
  s+=txt(350,682,'Solid blade section: radial flow occurs out of this section between blades.','sm','middle')+'</svg>';
  return s;
}
function stator(){
  let s=svgStart(720)+txt(25,25,'S-01 • Proposed perforated stator — complete 84-hole pattern','title');
  const cx=300,cy=338,k=.8;
  s+=`<circle cx="${cx}" cy="${cy}" r="${300*k}" class="solid"/>`;
  for(let i=0;i<6;i++)s+=`<path d="M${cx+56*k} ${cy} H${cx+300*k}" stroke="#b6cbd2" stroke-width="${8*k}" transform="rotate(${-i*60} ${cx} ${cy})"/>`;
  for(const [r,n] of [[100,12],[155,18],[210,24],[265,30]]){
    s+=`<circle cx="${cx}" cy="${cy}" r="${r*k}" class="axis"/>`;
    for(let j=0;j<n;j++){const a=(j+.5)*2*Math.PI/n;s+=`<circle cx="${cx+r*k*Math.cos(a)}" cy="${cy-r*k*Math.sin(a)}" r="${39.5594790278*k/2}" fill="white" stroke="#243f52" stroke-width=".8"/>`;}
  }
  s+=`<circle cx="${cx}" cy="${cy}" r="${56*k}" fill="white" stroke="#243f52"/>`;
  s+=line(cx-255,cy,cx+255,cy,'axis')+line(cx,cy-255,cx,cy+255,'axis');
  s+=dimH(cx-240,cx+240,605,'Ø600 plate envelope');
  s+=txt(555,265,'Ø112 centre','sm')+line(cx+45,cy,545,268);
  s+=txt(555,315,'Plate t = 4','sm')+txt(555,342,'84 holes','sm')+txt(555,365,'Ø39.559479','sm')+txt(555,389,'profile-cut','sm');
  s+=txt(25,65,'+X at right; positive azimuth counterclockwise viewed from +Z')+txt(25,86,'Six 8-mm radial no-hole lanes: 0°, 60°, 120°, 180°, 240°, 300°');
  s+=txt(25,650,'PCD: 200 / 310 / 420 / 530; counts: 12 / 18 / 24 / 30')+txt(25,675,'First angle: 15° / 10° / 7.5° / 6°; radial centre pitch = 55')+txt(25,700,'Shaded lanes are retained plate, not separate support bars; no extra area deduction.');
  return s+'</svg>';
}
function compartment(){
  let s=svgStart(610)+txt(25,25,'C-01 • Typical compartment — section between blade planes','title');
  const x=350,y=290,k=.86, ky=1.9;
  const rect=(a,b,c,d,cl='solid')=>`<rect x="${x+a*k}" y="${y-d*ky}" width="${(b-a)*k}" height="${(d-c)*ky}" class="${cl}"/>`;
  s+=line(x-300*k,y-100*ky,x-300*k,y+100*ky)+line(x+300*k,y-100*ky,x+300*k,y+100*ky);
  s+=rect(-22,22,-102,102);
  for(const z of [-90,90])for(const [a,b] of [[56,135.2202604861],[174.7797395139,245.2202604861],[284.7797395139,300]]){s+=rect(a,b,z-2,z+2)+rect(-b,-a,z-2,z+2);}
  s+=rect(-35,-22,-12,12)+rect(22,35,-12,12);
  for(const sign of [-1,1])for(const z of [-15,15])s+=rect(sign===1?65:-99,sign===1?99:-65,z-1,z+1,'shroud');
  s+=line(75,y,625,y,'axis');
  s+=dimV(647,y-90*ky,y+90*ky,'180')+dimV(593,y-88*ky,y-16*ky,'72')+dimV(593,y+16*ky,y+88*ky,'72');
  s+=dimH(x-300*k,x+300*k,525,'Ø600 ID');
  s+=txt(30,95,'Z = +90 plate centre')+txt(30,485,'Z = −90 plate centre')+txt(30,276,'Z = 0 rotor centre');
  s+=txt(27,560,'Rotor outer faces Z = ±16; stator inner faces Z = ±88; plate t = 4')+txt(27,583,'30° section cuts row-2 and row-4 holes; row-1/row-3 holes are out of section.');
  // In the between-blade section, arrows pass through fluid rather than solid blades.
  s+=`<path class="flow" d="M${x+46*k},${y-75*ky} L${x+46*k},${y-25*ky} Q${x+46*k},${y-4*ky} ${x+130*k},${y-4*ky} L${x+180*k},${y-4*ky}"/>`;
  s+=`<path class="flow" d="M${x+46*k},${y+75*ky} L${x+46*k},${y+25*ky} Q${x+46*k},${y+4*ky} ${x+130*k},${y+4*ky} L${x+180*k},${y+4*ky}"/>`;
  s+=`<path class="flow" d="M${x+205*k},${y-10*ky} C${x+260*k},${y-70*ky} ${x+90*k},${y-70*ky} ${x+48*k},${y-36*ky}"/>`;
  s+=txt(450,220,'Local return','sm')+txt(450,243,'circulation','sm')+txt(430,340,'Radial discharge','sm');
  s+=txt(118,153,'Ø112 stator opening','sm')+txt(118,175,'Ø130 eye; CE = 9','sm')+txt(118,196,'Projection overlap only','sm');
  s+=line(x-45*k,70,x-45*k,130,'flow')+line(x-45*k,510,x-45*k,451,'flow');
  s+=txt(430,65,'Axial communication (schematic)','sm')+txt(33,44,'Horizontal and vertical scales differ. Dimensions govern; do not scale.');
  return s+'</svg>';
}
const figure1=turbine(),figure2=stator(),figure3=compartment();
for(const [name,data] of [['proposed-turbine.svg',figure1],['proposed-stator.svg',figure2],['proposed-compartment.svg',figure3]])fs.writeFileSync(path.join(dir,name),data);
let body=`<section class="cover"><p class="eyebrow">THERMOPAC • ENGINEERING REVIEW • DESIGN 269</p><h1>Kühni turbine–stator<br>successor geometry</h1><p class="subtitle">Read-only Stage-3 audit and proposed double-entry shrouded turbine / perforated-stator development</p><div class="warning">UNAPPROVED SUCCESSOR GEOMETRY<br>PRELIMINARY — NOT FOR FABRICATION</div><p>Stage-3 run <strong>64</strong> · Stage-4 calculation <strong>13</strong><br>Report issue: engineering review candidate only; no new rule-set version assigned.</p><div class="finding"><strong>Audit PASS is a software-selection verdict.</strong><br>The saved operating point is <strong>SCALE_UP_EXTRAPOLATION</strong>. Neither the audit nor geometric area closure validates the successor hydrodynamics.</div><p>Confirmed saved basis: Ø600 mm column, Ø198 mm turbine, 180 mm pitch, empirical φ = 0.40, <strong>45 RPM</strong>, NMP continuous / RRBO dispersed.</p><p>This report preserves the existing R1 implementation and immutable revisions. Candidate dimensions are explicit engineering choices for review—not released CAD or fabrication instructions.</p><p class="small">All dimensions: mm; areas: mm², unless stated otherwise. Effective areas are geometric, not discharge-coefficient-adjusted hydraulic areas.</p></section>`;
body+=section('Report sequence and decision boundary',`<ol><li>Stage-3 selection audit and applicability limits</li><li>Confirmed inherited diameter and saved basis</li><li>Complete turbine topology and construction evidence</li><li>Turbine eye candidate and sensitivity</li><li>Upper/lower entry sections and obstruction accounting</li><li>Stator centre-opening proposal</li><li>Stator gross/net area and perforation development</li><li>Clearance, ligament and assembly checks</li><li>Proposed dimensioned review drawings</li><li>Engineering decisions, primary references and integrity appendix</li></ol><div class="warning">STOP GATE: review before implementation.</div><p>No Stage-2/3/4 calculation, R1 production rule, saved revision or issued drawing is modified. Numerical completeness of an ideal-solid candidate is not engineering approval.</p><p><strong>Five provenance classes:</strong> INHERITED; SYSTEM CALCULATED; SOURCE-BACKED REFERENCE; PRE-PILOT R1 ENGINEERING RULE; UNRESOLVED. In this successor report, a proposed engineering rule is <em>unapproved</em> unless explicitly described as an already adopted construction decision.</p>`);
body+=section('1 · Stage-3 audit — selection and candidate coverage',md(part(audit,'## 1.','## 2.'))+md(part(audit,'## 3.','## 4.')));
body+=section('1.1 · Why the 0.33 rotor ratio won',md(part(audit,'## 4.','## 5.'))+md(part(audit,'## 5.','## 6.')));
body+=section('1.2 · Replay, order independence and applicability',md(part(audit,'## 6.','## 7.'))+md(part(audit,'## 8.','## 9.')));
body+=section('2 · Inherited turbine OD and saved authority',md(part(audit,'## 2.','## 3.'))+'<p><strong>Disposition:</strong> use D<sub>R</sub> = 198 mm and 45 RPM for this engineering development. Do not reinterpret the audit as approval of the proposed physical construction.</p>');
body+=section('3 · Complete turbine — construction and provenance','<p>The adopted project topology is a double-entry, radial-flow, shrouded six-blade turbine. Primary source A (Asadollahzadeh et al., 2017, pp. 150–151, Fig. 1 and Table 1) directly supports the shrouded six-blade family. Double entry is the project construction decision. No inspected source supplies a numerical eye diameter.</p><p>Garthe Fig. 4.9 depicts exposed stepped blades and ring stators; its proportions are not a source for the proposed shrouds. Oliveira’s 170 distributor holes are not stator holes. Full primary citations and caveats are in §11.</p>'+md(part(geom,'## 1.','## 2.')));
body+=section('3.1 · Ideal-solid topology and coordinate convention',md(part(geom,'### 2.1','### 2.2')));
body+=section('4 · Eye candidate — engineering choice, not a correlation',md(part(geom,'### 2.2','## 3.')));
body+=section('5 · Upper and lower entry sections',md(part(geom,'### 3.1','### 3.2'))+md(part(geom,'### 3.2','For exact strip area,')));
body+=section('5.1 · Obstruction union and unresolved limiting streamtube',md(part(geom,'For exact strip area,','### 3.3'))+md(part(geom,'### 3.3','## 4.')));
body+=section('6 · Stator centre opening follows the eye',md(part(geom,'## 4.','## 5.')));
body+=section('7 · Gross-area target and perforation development',md(part(geom,'## 5.','### 5.1'))+md(part(geom,'### 5.1','### 5.2')));
body+=section('7.1 · Gross/net closure and support obstruction',md(part(geom,'### 5.2','## 6.'))+'<div class="finding">Retired for this successor: Ø379.473 mm as a centre opening. It alone consumes the full 40% gross area. The historical single-opening R1 dataset remains unchanged.</div>');
body+=section('8 · Clearance and ligament validation',md(part(geom,'## 6.','## 7.')));
body+=section('8.1 · Conditional quantities and assembly interfaces',md(part(geom,'## 7.','## 8.')));
body+=section('9 · Proposed turbine drawing',figure1+'<p class="small">All new construction dimensions are proposed engineering choices; swept OD is inherited. Blue shrouds attach to the outer paddles at Z = ±14. Blade t = 3 is trimmed at cylindrical radii 35, 65 and 99. The section shows solids through two opposing blades; radial passage flow is between blades, as indicated in the plan.</p>');
body+=section('9.1 · Proposed stator drawing',figure2+'<p class="small">Hole count and row layout: proposed engineering rules. Hole diameter: SYSTEM CALCULATED from exact gross closure. Nominal hole diameter shown rounded; use 39.5594790278 in review calculations. Ligament acceptance and plate strength remain unqualified. The no-hole lanes are not additional pieces.</p>');
body+=section('9.2 · Proposed typical-compartment section',figure3+'<p class="small">Section at 30° between blade planes intersects row-2 and row-4 perforations through their centres; other blades/perforations away from this cut are intentionally omitted. Flow arrows show the adopted architecture, not solved streamlines or imposed equal upper/lower flow. Stator opening and eye are not a sealed duct. Wall attachment and bypass sealing remain unresolved.</p>');
body+=section('10 · Engineering decisions and release stop gate',md(part(geom,'## 9.'))+'<div class="warning">Review outcome required: approve, amend or reject the dimensional candidate and its explicit geometric assumptions. A successor rule-set version may be assigned only after review. No automatic production implementation is authorized by this report.</div>');
body+=section('11 · Primary construction references',md('### G — Dirk Garthe, Fluiddynamics and Mass Transfer of Single Particles and Swarms of Particles in Extraction Columns, TU München dissertation\n'+part(source,'### G —','### O —')));
body+=section('11.1 · Oliveira and shrouded-family evidence',md('### O — N. S. Oliveira, D. Moraes Silva, M. P. C. Gondim, M. Borges Mansur (2008), A Study of the Drop Size Distributions and Hold-Up in Short Kühni Columns\n'+part(source,'### O —','## 2.')));
body+=section('11.2 · Source limits and classification',md(part(source,'## 2.','## 3.'))+'<p>Sources were visually inspected at the cited figures/tables. Their numerical dimensions refer to their own apparatus. The new 130-mm eye, 112-mm centre opening and 84-hole layout are not claimed as published Kühni or proprietary Sulzer dimensions.</p>');
body+=section('12 · Scientific integrity and reproducibility',md(part(audit,'## 7.','## 8.'))+md(part(audit,'## 9.','Source citations:')));
body+=section('12.1 · Audit code citations and calculation artifacts',md(part(audit,'Source citations:'))+'<p>Companion reports: stage3-audit.md; source-review.md; geometry-proposal.md. Standalone geometry reproduction: <code>node deliverables/kuhni-successor-review/geometry-proposal.mjs</code>. Complete 84-hole coordinates and derived quantities: geometry-proposal.json. Renderer: build-report.mjs. These are report-only artifacts, separate from production models.</p>');
const font=fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').toString('base64');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Kühni successor geometry — engineering review</title><style>@font-face{font-family:Review;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}body{font-family:Review,'DejaVu Sans',sans-serif;color:#213747;font-size:9pt;line-height:1.45;margin:0}section{break-before:page;padding-top:6mm}section:first-child{break-before:auto}h1{font-size:19pt;line-height:1.2;color:#173e55;margin:0 0 6mm}h2{font-size:13pt}h3{font-size:11pt}h1,h2,h3,h4{break-after:avoid}p{margin:0 0 3.3mm}li{margin-bottom:2mm}table{width:100%;border-collapse:collapse;font-size:8pt;table-layout:auto;margin:4mm 0}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #bacbd4;padding:2.1mm;vertical-align:top;overflow-wrap:anywhere}th{background:#e5eef3;text-align:left;color:#16384c}code{font-family:Review;font-size:8pt;overflow-wrap:anywhere}svg{width:100%;height:auto;max-height:225mm;display:block;break-inside:avoid}.warning{border-left:4px solid #ab6125;background:#fff3e6;padding:5mm;margin:6mm 0;font-weight:bold;color:#663917;break-inside:avoid}.finding{border-left:4px solid #34718b;background:#eff6fa;padding:4mm;margin:5mm 0;break-inside:avoid}.cover{padding-top:18mm}.cover h1{font-size:32pt;line-height:1.15;margin:12mm 0}.eyebrow{letter-spacing:1.3px;color:#426476;font-size:9pt}.subtitle{font-size:14pt;line-height:1.5}.small{font-size:8pt;color:#466170}.cover .warning{font-size:14pt;margin:15mm 0}.cover p{margin-bottom:8mm}@page{size:A4;margin:17mm 16mm 19mm}@media screen{body{max-width:210mm;margin:20px auto;background:#edf2f5}section{background:white;padding:20mm;margin-bottom:20px;box-shadow:0 2px 12px #c5d1d8}}</style></head><body>${body}</body></html>`;
const printableHtml=html.replace('overflow-wrap:anywhere}th{','overflow-wrap:normal}th{').replace('p{margin:0 0 3.3mm}','p{margin:0 0 3.3mm;orphans:3;widows:3}');
fs.writeFileSync(path.join(dir,'engineering-review-report.html'),printableHtml);
const browser=await puppeteer.launch({executablePath:execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  const page=await browser.newPage();
  await page.setContent(printableHtml,{waitUntil:'load'});
  await page.evaluate(()=>document.fonts.ready);
  await page.pdf({path:path.join(dir,'engineering-review-report.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<div style="font-size:7px;color:#466170;width:100%;margin:0 16mm">DESIGN 269 · STAGE 3 / 64 · ENGINEERING REVIEW ONLY</div>',footerTemplate:'<div style="font-size:7px;color:#665243;width:100%;margin:0 16mm;display:flex;justify-content:space-between"><span>UNAPPROVED SUCCESSOR · NOT FOR FABRICATION</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'});
}finally{await browser.close();}
console.log('Wrote engineering-review-report.html and .pdf, plus three proposed SVG figures.');