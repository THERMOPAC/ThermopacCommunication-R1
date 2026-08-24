import PDFDocument from 'pdfkit';
import fs from 'node:fs';

const outPath = 'reports/ecr2-simulation-run-845-report.pdf';
fs.mkdirSync('reports', { recursive: true });

const run = {
  id: 845,
  date: '24 Aug 2026, 4:21:28 PM',
  revision: 8,
  status: 'warning',
  engine: 'llx-ecr-simulator v2.1.0',
};
const input = {
  temperatureC: 50,
  rrboFeedKgH: 3448,
  nmpFeedKgH: 4024,
  soMassRatio: 1.1670533643,
  phase: 'NMP continuous / RRBO dispersed',
  satWt: 85,
  monoWt: 5,
  diWt: 5,
  polyWt: 5,
  targetMolPct: 10,
  theoreticalStages: 1,
  psi: 0.1,
  d32Mm: 0.9761258603,
  d32C: 0.39,
};
const componentNames = ['Saturates', 'Mono-aromatics', 'Di-aromatics', 'Poly-aromatics', 'NMP'];
const feed = [2930.8, 172.4, 172.4, 172.4, 4003.88];
const trials = [
  { d: 0.30, status: 'dependency_blocked', h: null, product: null, cells: null, iter: 0, evals: 0, residual: null, balance: null, raff: null, ext: null, diag: 'Initial 0.0100 m BVP blocked: K&H 1995 holdup is physically invalid (phi_raw = 10.4189).'},
  { d: 0.45, status: 'dependency_blocked', h: null, product: null, cells: null, iter: 0, evals: 0, residual: null, balance: null, raff: null, ext: null, diag: 'Initial 0.0100 m BVP blocked: K&H 1995 holdup is physically invalid (phi_raw = 10.4189).'},
  { d: 0.60, status: 'feasible_preliminary', h: 0.2793750000, product: 0.09998887106248994, cells: 2, iter: 11, evals: 232, residual: 1.3765714889e-12, balance: 2.5073880749e-9, raff: [2694.199157027733,134.9739439242047,138.9837380109626,146.55543513020365,31.108971285627543], ext: [236.60084297566578,37.42605607579389,33.41626198903682,25.84456486979612,3972.7710287084687], diag: 'Target bracket refined to [0.2788, 0.2794] m; conservative upper bound selected.'},
  { d: 0.80, status: 'feasible_preliminary', h: 0.3856250000, product: 0.09998399833750107, cells: 2, iter: 11, evals: 232, residual: 1.0330827536e-12, balance: 2.4025972323e-9, raff: [2675.5348196086047,133.7988270163466,138.09705111459948,145.76480417097073,32.40800894591864], ext: [255.26518038858094,38.601172983654585,34.30294888540095,26.63519582902941,3971.4719910544914], diag: 'Target bracket refined to [0.3850, 0.3856] m; conservative upper bound selected.'},
  { d: 1.00, status: 'feasible_preliminary', h: 0.4125000000, product: 0.09999863702473795, cells: 2, iter: 11, evals: 232, residual: 4.1177959416e-12, balance: 1.3630288009e-8, raff: [2671.2828851500913,133.54561183350737,137.92122531638043,145.62049562140973,32.848654991364604], ext: [259.5171148390964,38.85438816649725,34.478774683621175,26.77950437859074,3971.0313450058106], diag: 'Target bracket refined to [0.4119, 0.4125] m; conservative upper bound selected.'},
];

const doc = new PDFDocument({ size: 'A4', margin: 42, info: { Title: 'ECR-2 Simulation Run 845 Report', Author: 'THERMOPAC LLP', Subject: 'Frozen ECR-2 preliminary simulation calculations' } });
doc.pipe(fs.createWriteStream(outPath));
let pageNo = 1;
const W = 595.28, H = 841.89;
const left = 42, right = W - 42, contentW = right - left;
const navy = '#17365D', blue = '#1F5A94', amber = '#9A6700', red = '#A33A2B', green = '#176B42', gray = '#5B6573', light = '#F2F5F8';
const fmt = (n, d=3) => n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : Number(n).toFixed(d);
const pct = n => n === null || n === undefined ? '—' : (Number(n) * 100).toFixed(4) + '%';
const sci = n => n === null || n === undefined ? '—' : Number(n).toExponential(4);
const rrboRecovery = t => t.raff ? (t.raff.slice(0,4).reduce((a,b)=>a+b,0) / input.rrboFeedKgH) * 100 : null;
function footer() { doc.font('Helvetica').fontSize(7).fillColor(gray).text('THERMOPAC LLP | ECR-2 Simulator | Run #845', left, H - 55, { width: contentW - 60 }); doc.text('Page ' + pageNo, right - 42, H - 55, { width: 42, align: 'right' }); }
function newPage(title) { footer(); doc.addPage(); pageNo++; doc.font('Helvetica-Bold').fontSize(9).fillColor(navy).text('ECR-2 SIMULATION REPORT | RUN #845', left, 28); if (title) doc.font('Helvetica-Bold').fontSize(17).fillColor(navy).text(title, left, 58); }
function title(text, sub) { doc.font('Helvetica-Bold').fontSize(20).fillColor(navy).text(text, left, 54, { width: contentW }); if (sub) doc.font('Helvetica').fontSize(10).fillColor(gray).text(sub, left, 84, { width: contentW }); }
function h2(text, y) { doc.font('Helvetica-Bold').fontSize(13).fillColor(navy).text(text, left, y); return y + 21; }
function para(text, y, opts={}) { doc.font('Helvetica').fontSize(opts.size || 9).fillColor(opts.color || '#20252B').text(text, left, y, { width: contentW, lineGap: 2, align: opts.align || 'left' }); return doc.y + (opts.after ?? 8); }
function labelValue(label, value, y, color='#20252B') { doc.font('Helvetica-Bold').fontSize(9).fillColor(gray).text(label, left, y, { width: 165 }); doc.font('Helvetica').fontSize(9).fillColor(color).text(String(value), left + 172, y, { width: contentW - 172 }); return y + 16; }
function box(x,y,w,h,fill,stroke=fill){doc.roundedRect(x,y,w,h,5).fillAndStroke(fill,stroke);}
function table(headers, rows, widths, x, y, opts={}) { const rh=opts.rowHeight||20; const fs=opts.fontSize||8; const total=widths.reduce((a,b)=>a+b,0); let cy=y; box(x,cy,total,rh,navy,navy); let cx=x; headers.forEach((v,i)=>{doc.font('Helvetica-Bold').fontSize(fs).fillColor('white').text(v,cx+4,cy+6,{width:widths[i]-8,align:opts.align?.[i]||'left'});cx+=widths[i];}); cy+=rh; rows.forEach((row,ri)=>{if(cy+rh>H-55){newPage('Continued');cy=86;box(x,cy,total,rh,navy,navy);cx=x;headers.forEach((v,i)=>{doc.font('Helvetica-Bold').fontSize(fs).fillColor('white').text(v,cx+4,cy+6,{width:widths[i]-8,align:opts.align?.[i]||'left'});cx+=widths[i];});cy+=rh;} box(x,cy,total,rh,ri%2? '#FFFFFF':light, '#D8DEE6'); cx=x; row.forEach((v,i)=>{doc.font('Helvetica').fontSize(fs).fillColor(opts.colors?.[ri]?.[i] || '#20252B').text(String(v),cx+4,cy+6,{width:widths[i]-8,align:opts.align?.[i]||'left'});cx+=widths[i];}); cy+=rh;}); return cy; }

// Cover / executive summary
box(left, 42, contentW, 9, blue, blue);
title('ECR-2 Counter-Current Simulation Report', 'Frozen calculation snapshot for preliminary engineering review');
let y=126;
box(left,y,contentW,76,'#EEF5FB','#C9DCEC');
doc.font('Helvetica-Bold').fontSize(23).fillColor(navy).text('RUN #845', left+18, y+17);
doc.font('Helvetica-Bold').fontSize(12).fillColor(amber).text('WARNING / PRELIMINARY ENGINEERING', left+18, y+48);
doc.font('Helvetica').fontSize(9).fillColor(gray).text('Calculated ' + run.date + ' | Revision ' + run.revision + ' | ' + run.engine, left+245, y+24, {width: contentW-260});
doc.text('Three accepted preliminary D/H trials; two smaller trials dependency-blocked.', left+245, y+43, {width: contentW-260});
y=226;
y=h2('Executive result',y);
y=para('Run #845 used the current Stage 4 Process Design basis: 50 deg C extraction temperature, RRBO composition 85/5/5/5 wt%, RRBO feed 3,448 kg/h, NMP feed 4,024 kg/h, and a 10 mol% hydrocarbon-only raffinate aromatic target.',y);
box(left,y,contentW,62,'#FFF7E6','#E5C36A');
y+=13; doc.font('Helvetica-Bold').fontSize(10).fillColor(amber).text('Interpretation',left+12,y); y+=16; doc.font('Helvetica').fontSize(9).fillColor('#4A3A14').text('The run is warning-status because D = 0.30 m and D = 0.45 m fail the K&H 1995 holdup physical-validity check. D = 0.60 m, 0.80 m, and 1.00 m each converged and passed mass balance.',left+12,y,{width:contentW-24});
y+=60;
y=h2('Best preliminary trial (not a final selection)',y);
const best=trials[2];
y=labelValue('Diameter',fmt(best.d,2)+' m',y,green); y=labelValue('Required active height',fmt(best.h,6)+' m',y,green); y=labelValue('RRBO recovery',fmt(rrboRecovery(best),4)+'%',y,green); y=labelValue('Raffinate aromatics',pct(best.product)+' hydrocarbon-only mol fraction',y,green); y=labelValue('BVP / mass balance','converged / passed',y,green);
y+=10; y=para('ECR-2 generates the complete feasible preliminary (D,H) set. It does not select a final diameter.',y,{size:8,color:gray});

// Inputs
newPage('1. Frozen inputs and calculation basis');
y=92;
y=h2('Frozen Run #845 input snapshot',y);
y=labelValue('Operating temperature',input.temperatureC+' deg C (Stage 4 Extraction Temperature)',y); y=labelValue('RRBO feed',fmt(input.rrboFeedKgH,3)+' kg/h',y); y=labelValue('NMP feed',fmt(input.nmpFeedKgH,3)+' kg/h',y); y=labelValue('S/O ratio',fmt(input.soMassRatio,6)+' mass basis',y); y=labelValue('Phase configuration',input.phase,y); y=labelValue('Theoretical stages, N_T',input.theoreticalStages+' (calculated)',y); y=labelValue('Raffinate target',input.targetMolPct+' mol% aromatics, hydrocarbon-only physical outlet basis',y);
y+=8; y=h2('RRBO feed composition',y);
y=table(['Component','Mass fraction','Feed flow'],[
 ['Saturates',input.satWt+' wt%',fmt(feed[0],3)+' kg/h'],['Mono-aromatics',input.monoWt+' wt%',fmt(feed[1],3)+' kg/h'],['Di-aromatics',input.diWt+' wt%',fmt(feed[2],3)+' kg/h'],['Poly-aromatics',input.polyWt+' wt%',fmt(feed[3],3)+' kg/h'],['Total aromatics','15 wt%',fmt(feed[1]+feed[2]+feed[3],3)+' kg/h'],['RRBO total','100 wt%',fmt(input.rrboFeedKgH,3)+' kg/h']], [160,120,190],left,y,{align:['left','right','right']});
y+=146;
y=h2('ECR-2 generated sizing basis',y);
y=labelValue('Specific agitation psi',fmt(input.psi,4)+' W/kg',y,amber); y=labelValue('d32 route','DIRECT_TURBULENCE_D32_PRELIMINARY',y,amber); y=labelValue('d32 result',fmt(input.d32Mm,6)+' mm (C = '+fmt(input.d32C,2)+')',y,amber); y=labelValue('C sensitivity', '0.901 to 1.076 mm d32',y,amber); y=labelValue('Diameter trials','0.30, 0.45, 0.60, 0.80, 1.00 m',y); y=labelValue('Height method','Progressive full-BVP trials with conservative upper bracket endpoint',y); y=labelValue('Numerical mesh','Maximum delta-z = 0.25 m; physical height is independent of mesh size',y);
y+=8; y=para('Equation basis: d32 = C * (gamma / rho_c)^0.6 * epsilon^(-0.4), with epsilon = psi = 0.1 W/kg. The direct-turbulence d32 is preliminary, not pilot validated, and separate from K&H 1996.',y,{size:8,color:gray});

// Trial summary
newPage('2. Diameter and height search');
y=92;
y=h2('Generated diameter trials',y);
y=para('Each diameter is evaluated independently. Every physical-height trial reruns the full counter-current BVP; no local NRTL, holdup, d32, or transfer value is reused between height trials.',y,{size:8});
const summaryRows=trials.map(t=>[fmt(t.d,2)+' m',t.status==='feasible_preliminary'?'FEASIBLE PRELIMINARY':'DEPENDENCY BLOCKED',t.h===null?'NOT CALCULATED':fmt(t.h,6)+' m',t.product===null?'—':pct(t.product),t.cells===null?'—':String(t.cells),String(t.iter),String(t.evals),t.balance===null?'—':sci(t.balance)+' kg/h']);
y=table(['Diameter','Trial status','Required H','Product aromatics','Cells','Iter.','F evals','Total balance'],summaryRows,[65,118,75,90,42,40,48,75],left,y,{fontSize:7,align:['right','left','right','right','right','right','right','right'],colors:[[red,red,red,red,'#20252B','#20252B','#20252B',red],[red,red,red,red,'#20252B','#20252B','#20252B',red],[green,green,green,green,'#20252B',green,green,green],[green,green,green,green,'#20252B',green,green,green],[green,green,green,green,'#20252B',green,green,green]]});
y+=30; y=h2('Height-sizing method',y);
y=para('For accepted trials, the target bracket is refined until the product-quality condition is met. The conservative upper bracket endpoint is selected as the required active extraction height. The selected heights below are physical equipment heights, not numerical cell counts or delta-z values.',y,{size:8});
y=table(['D (m)','Selected H (m)','Bracket / selection note'],trials.filter(t=>t.h!==null).map(t=>[fmt(t.d,2),fmt(t.h,6),t.diag]),[70,100,360],left,y,{fontSize:8,align:['right','right','left']});

// accepted detail
newPage('3. Accepted BVP calculations');
y=92;
y=h2('Accepted preliminary trial diagnostics',y);
y=para('The following BVP results satisfy convergence and total mass-balance acceptance for the individual diameter trial. They remain preliminary and are not release-eligible.',y,{size:8});
for (const t of trials.filter(t=>t.h!==null)) {
  if (y>690) { newPage('3. Accepted BVP calculations - continued'); y=92; }
  box(left,y,contentW,22,'#EEF5FB','#C9DCEC'); doc.font('Helvetica-Bold').fontSize(10).fillColor(navy).text('D = '+fmt(t.d,2)+' m | H = '+fmt(t.h,6)+' m',left+9,y+6); y+=31;
  y=labelValue('Product aromatics',pct(t.product)+' (target '+input.targetMolPct+' mol%)',y,green);
  y=labelValue('BVP status','converged; mass balance passed',y,green);
  y=labelValue('Solver diagnostics',t.iter+' iterations; '+t.evals+' function evaluations; final residual norm '+sci(t.residual),y);
  y=labelValue('Total mass balance',sci(t.balance)+' kg/h',y);
  y=labelValue('RRBO recovery',fmt(rrboRecovery(t),4)+'%',y,green);
  y+=8;
}
y+=4; y=h2('RRBO recovery calculation',y);
y=para('RRBO recovery = (Saturates + Mono-aromatics + Di-aromatics + Poly-aromatics in raffinate) / RRBO feed x 100. NMP is excluded from RRBO recovery.',y,{size:8});
y=table(['Diameter','RRBO raffinate','RRBO transferred to extract','RRBO recovery'],trials.filter(t=>t.raff).map(t=>{const r=t.raff.slice(0,4).reduce((a,b)=>a+b,0);const e=t.ext.slice(0,4).reduce((a,b)=>a+b,0);return[fmt(t.d,2)+' m',fmt(r,3)+' kg/h',fmt(e,3)+' kg/h',fmt(rrboRecovery(t),4)+'%'];}),[95,150,170,100],left,y,{fontSize:8,align:['right','right','right','right']});

// outlet composition
newPage('4. Outlet composition and component calculations');
y=92;
y=h2('Accepted raffinate outlet component flows',y);
y=para('Component order is Saturates / Mono-aromatics / Di-aromatics / Poly-aromatics / NMP. Product-quality aromatics are calculated on the hydrocarbon-only physical raffinate basis; NMP is excluded from both numerator and denominator.',y,{size:8});
for (const t of trials.filter(t=>t.raff)) {
  if (y>660) { newPage('4. Outlet composition - continued'); y=92; }
  y=table(['Component','Feed kg/h','Raffinate kg/h','Extract kg/h'],componentNames.map((name,i)=>[name,fmt(feed[i],3),fmt(t.raff[i],3),fmt(t.ext[i],3)]),[150,120,130,120],left,y,{fontSize:8,align:['left','right','right','right']});
  y+=10; y=labelValue('D = '+fmt(t.d,2)+' m product quality',pct(t.product)+' aromatics (hydrocarbon-only)',y,green); y+=12;
}

// governance
newPage('5. Warnings, acceptance and release status');
y=92;
y=h2('Run-level status',y);
box(left,y,contentW,62,'#FFF7E6','#E5C36A'); y+=12; y=labelValue('Overall run status','WARNING',y,amber); y=labelValue('Governed transfer values','UNAVAILABLE',y,red); y=labelValue('Release status','NOT_RELEASE_ELIGIBLE',y,red); y+=18;
y=h2('Primary dependency blocker',y);
box(left,y,contentW,67,'#FDEEEE','#E4B7B0'); y+=12; y=para('The D = 0.30 m and D = 0.45 m initial BVPs are blocked because K&H 1995 returns phi_raw = 10.4189, which is physically inadmissible because holdup must be below 1. The simulator fails closed and does not clamp or substitute the value.',y,{size:8,color:red}); y+=8;
y=h2('Why governed transfer output is unavailable',y);
y=para('The accepted local transfer arrays are preliminary solver results only. The direct-turbulence d32 route and local K&H transfer physics are not pilot validated or release eligible. In addition, the primary/global BVP is dependency-blocked by the smaller diameter trial. Therefore the report retains diagnostic data for accepted trials but does not present governed transfer performance as a final design result.',y,{size:8});
y=h2('Additional warnings',y);
const warnings=[
 'NRTL at 50 deg C is outside its calibrated range; equilibrium targets are extrapolated pending validation.',
 'Interfacial tension uses an unchanged 70 deg C source anchor at the selected 50 deg C condition under a preliminary constant-over-range basis.',
 'Physical RRBO molecular weights and SN300 EPD tabular values are assumed/provisional.',
 'NMP purity is retained as a physical plant-boundary input; canonical fresh NMP is used for the C2 thermodynamic coordinate.',
 'd32 = 0.976 mm is DIRECT_TURBULENCE_D32_PRELIMINARY and must not be attributed to K&H 1996.',
 'Sulfur/DBT prediction is not implemented and must not be inferred from aromatic-transfer results.',
];
for(const w of warnings){doc.font('Helvetica').fontSize(8).fillColor('#20252B').text('• '+w,left+4,y,{width:contentW-8,lineGap:2});y=doc.y+5;}

// conclusion
newPage('6. Engineering interpretation');
y=92;
y=h2('Summary of calculated results',y);
y=para('Run #845 is a preliminary forward-model evaluation on the current Stage 4 feed basis. The feasible preliminary design set returned by the generated diameter search is:',y);
y=table(['Diameter','Required physical height','RRBO recovery','Raffinate aromatics'],trials.filter(t=>t.h).map(t=>[fmt(t.d,2)+' m',fmt(t.h,6)+' m',fmt(rrboRecovery(t),4)+'%',pct(t.product)+' mol fraction']),[100,155,120,150],left,y,{fontSize:9,align:['right','right','right','right']});
y+=22;
y=h2('Use limitation',y);
y=para('These results are suitable for preliminary engineering review and comparison of generated diameter/height trials only. The simulator does not select a final diameter, does not establish a release-grade transfer design, and does not provide sulfur or DBT prediction.',y,{size:9});
y=para('The complete frozen source for this report is ECR-2 calculation Run #845, Revision 8. Any change to Stage 4 temperature, feed, composition, solvent ratio, or governed evidence requires a new simulation run and a new report.',y,{size:9});

footer();
doc.end();
console.log(outPath);
