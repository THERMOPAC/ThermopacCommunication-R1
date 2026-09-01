import fs from 'fs';
import PDFDocument from 'pdfkit';

const root = new URL('../../../', import.meta.url);
const out = new URL('../../../.agents/outputs/project-223-task206-predictive-nt-replay/', import.meta.url);
const r = JSON.parse(fs.readFileSync(new URL('results.json', out)));
const d = new PDFDocument({
  margin: 42, size: 'LETTER', bufferPages: true,
  info: { Title: 'RESEARCH ONLY — Project 223 Task206 Replay', Author: 'Project 223 replay renderer',
    Subject: 'NOT ACCEPTED FOR DESIGN', Keywords: 'RESEARCH ONLY, NOT ACCEPTED, Task206, TPD' }
});
const chunks = []; d.on('data', x => chunks.push(x));
d.on('end', () => fs.writeFileSync(new URL('report.pdf', out), Buffer.concat(chunks)));

const C = { navy:'#17365D', teal:'#087E8B', red:'#B3261E', ink:'#20252B', gray:'#607080', pale:'#EEF3F7', line:'#BAC7D2' };
const left = 42, right = 570, bottom = 54;
const fmt = (v, n=4) => v === null || v === undefined ? '—' : Number(v).toExponential(n);
const fix = (v, n=3) => v === null || v === undefined ? '—' : Number(v).toFixed(n);
const pct = v => v === null || v === undefined ? '—' : `${Number(v).toFixed(2)}%`;
function header() {
  d.save().fillColor(C.navy).rect(0, 0, 612, 27).fill();
  d.fillColor('white').font('Helvetica-Bold').fontSize(8).text('PROJECT 223  |  TASK206 PREDICTIVE N_T REPLAY', left, 9, { width: 360 });
  d.font('Helvetica').fontSize(7.5).text('RESEARCH ONLY  •  NOT ACCEPTED FOR DESIGN', 360, 9, { width: 210, align:'right' });
  d.restore(); d.y = 40;
}
function footer(page, total) {
  d.save().strokeColor(C.line).lineWidth(.5).moveTo(left, 732).lineTo(right, 732).stroke();
  d.fillColor(C.gray).font('Helvetica').fontSize(7.3)
    .text(`Project 223 • source job ${r.referenceJob.id} • design ${r.referenceJob.designId}`, left, 737, {width:400, height:9, lineBreak:false})
    .text(`Page ${page} of ${total}`, 470, 737, {width:100, height:9, align:'right', lineBreak:false}); d.restore();
}
function need(h=16) { if (d.y + h > 724) { d.addPage(); header(); } }
function section(s) {
  need(26);
  d.moveDown(.45).fillColor(C.navy).font('Helvetica-Bold').fontSize(11)
    .text(s, left, d.y, {width:right-left, align:'left'});
  d.strokeColor(C.teal).lineWidth(1).moveTo(left,d.y+3).lineTo(right,d.y+3).stroke();
  d.moveDown(.65);
}
function para(s, opt={}) { need(15); d.fillColor(C.ink).font('Helvetica').fontSize(opt.size || 8.4).text(s, left, d.y, {width:right-left, lineGap:opt.gap ?? 2}); d.moveDown(.45); }
function table(headers, rows, widths, opt={}) {
  const size = opt.size || 7.5, pad = 3, line = opt.line || 9.2, total = widths.reduce((a,b)=>a+b,0);
  const drawHead = () => {
    need(18); const y=d.y; d.fillColor(C.navy).rect(left,y,total,16).fill();
    let x=left; headers.forEach((h,i)=>{d.fillColor('white').font('Helvetica-Bold').fontSize(size).text(h,x+pad,y+4,{width:widths[i]-2*pad,align:opt.align?.[i]||'left',lineBreak:false});x+=widths[i];}); d.y=y+18;
  };
  drawHead();
  rows.forEach((row, ri) => {
    d.font('Helvetica').fontSize(size);
    const heights=row.map((v,i)=>d.heightOfString(String(v),{width:widths[i]-2*pad,lineGap:1}));
    const h=Math.max(line, ...heights)+2*pad;
    if (d.y+h>724) { d.addPage(); header(); drawHead(); }
    const y=d.y; if(ri%2===0) d.fillColor(C.pale).rect(left,y,total,h).fill();
    let x=left; row.forEach((v,i)=>{d.fillColor(C.ink).font('Helvetica').fontSize(size).text(String(v),x+pad,y+pad,{width:widths[i]-2*pad,lineGap:1,align:opt.align?.[i]||'left'});x+=widths[i];});
    d.strokeColor(C.line).lineWidth(.25).moveTo(left,y+h).lineTo(left+total,y+h).stroke(); d.y=y+h;
  }); d.moveDown(.45);
}
function worst(t) {
  let w=null;
  for (const s of t.stages) for (const phase of ['raffinate','extract']) {
    const q=s.postSplitTpdSearch?.[phase]; if (!w || q.minimum < w.value) w={stage:s.stageFromFeedEnd, phase:phase==='raffinate'?'R':'E', value:q.minimum, verdict:q.verdict};
  } return w;
}
function targetCounts(c) { const x=Object.values(c); return `${x.filter(v=>v.status==='PASS').length} pass / ${x.filter(v=>v.status==='FAIL').length} fail / ${x.filter(v=>v.status==='NOT_CALCULABLE').length} NC`; }

header();
d.fillColor(C.red).rect(left,d.y,528,34).fill();
d.fillColor('white').font('Helvetica-Bold').fontSize(16).text('RESEARCH ONLY — NOT ACCEPTED FOR DESIGN', left+10,d.y+9,{width:508,align:'center'}); d.moveDown(2.7);
d.fillColor(C.navy).font('Helvetica-Bold').fontSize(17).text('Predictive N_T Replay Report');
d.fillColor(C.gray).font('Helvetica').fontSize(9).text(`Project 223  |  Design 256  |  Source job ID: ${r.referenceJob.id}`);
d.moveDown(.8);
section('Executive conclusion');
para('All 10 N_T systems numerically closed and reproduced their recorded branch. Replay trials N_T=1 and N_T=2 have no replay-stage post-split TPD blocker; they are not accepted design results. N_T=3 through N_T=10 fail post-split TPD stability and are rejected fail-closed.');
para('Accepted Predictive N_T: NOT ASSIGNED. Formal COSMO-SAC sulfur: NOT CALCULABLE. No release or design decision may be inferred from this replay.', {size:9});
section('Configuration and stage convention');
para(`Stage numbering is ${r.stageNumbering}. Therefore Stage 1 is the bottom RRBO-feed endpoint; for each N_T, Stage N_T is the top fresh-NMP endpoint.`);
section('Fresh Stage 1 flash (Task206 vector)');
const f=r.stage1FreshFlash;
table(['Metric','Value'],[
  ['Two-phase flash acceptance', f.accepted ? 'ACCEPTED numerical flash' : 'NOT ACCEPTED'],
  ['Optimizer / equilibrium polish', `${f.optimizerSuccess ? 'success' : 'failure'} / ${f.equilibriumPolishSuccess ? 'success' : 'failure'}`],
  ['Polish residual / extract fraction', `${fmt(f.equilibriumPolishResidual)} / ${fix(f.betaExtract,6)}`],
  ['Pre-split minimum TPD / verdict', `${fix(f.minimumTpd,6)} / ${f.tpd?.verdict}`],
  ['Post-split TPD minima (R / E)', `${fmt(f.postSplitTpd?.raffinate)} / ${fmt(f.postSplitTpd?.extract)}`],
  ['Max composition separation / material balance residual', `${fix(f.maximumCompositionSeparation,6)} / ${fmt(f.materialBalanceMaxResidual)}`],
], [235,293], {size:8});
section('N_T=1–10 replay comparison');
const comparison=r.trials.map(t=>{const p=t.productMetrics,w=worst(t);return [
  t.stageCount, fmt(t.maximumScaledEquationResidual,2), `S${w.stage}/${w.phase} ${fmt(w.value,2)}`,
  t.acceptanceBlockers?.length ? 'FAIL: post-split TPD' : 'No replay-stage TPD blocker',
  pct(p.nmpFreeHydrocarbonRecoveryPct), pct(p.raffinateSaturatesWtNmpFree), pct(p.raffinateTotalAromaticsWtNmpFree),
  pct(p.raffinatePolarAromaticsWtNmpFree), pct(p.nmpInTotalRaffinateWt), targetCounts(t.targetCompliance)
]});
table(['N_T','Max scaled\nresid.','Worst stage/\nphase TPD','Stability verdict','NMP-free\nrecovery','Saturates','Total\naromatics','Polar\naromatics','NMP in\nraffinate','Targets'],comparison,[25,53,70,94,50,43,47,48,48,50],{size:7.1,align:['right','right','left','left','right','right','right','right','right','left']});
section('Task206 nine-parameter vector');
table(['Parameter','Value'],Object.entries(r.task206Parameters).map(([k,v])=>[k,fix(v,12)]),[270,258],{size:8});
section('Target-compliance detail by N_T');
const targetRows=[];
for(const t of r.trials) for(const [name,v] of Object.entries(t.targetCompliance)) targetRows.push([t.stageCount,name.replace(/([A-Z])/g,' $1').trim(),v.calculated===null?'NOT CALCULABLE':fix(v.calculated,4),fix(v.target,4),v.status]);
table(['N_T','Target','Calculated','Limit','Status'],targetRows,[32,250,85,85,76],{size:7.35,align:['right','left','right','right','left']});
section('Appendix A — stage-level post-split stability');
para('Every row reports the recorded post-split TPD-search minimum and local chemical-potential-Jacobian minimum eigenvalue for one phase. Negative TPD is an explicit fail-closed blocker.');
const stabilityRows=[];
for(const t of r.trials) for(const s of t.stages) for(const phase of ['raffinate','extract']) {
  const q=s.postSplitTpdSearch?.[phase], l=s.localPostSplitStability?.[phase];
  stabilityRows.push([t.stageCount,s.stageFromFeedEnd,phase==='raffinate'?'Raffinate':'Extract',fmt(q?.minimum,5),q?.verdict||'—',fmt(l?.minimumEigenvalue,5),l?.verdict||'—']);
}
table(['N_T','Stage\n(bottom→top)','Phase','TPD minimum','TPD verdict','Local min.\neigenvalue','Local verdict'],stabilityRows,[31,53,62,82,112,85,103],{size:7.25,align:['right','right','left','right','left','right','left']});
section('Appendix B — product metrics and target summary');
table(['N_T','NMP-free\nrecovery %','Saturates %','Total aromatics %','Polar aromatics %','NMP raffinate %','Target outcome'],r.trials.map(t=>{const p=t.productMetrics;return[t.stageCount,fix(p.nmpFreeHydrocarbonRecoveryPct),fix(p.raffinateSaturatesWtNmpFree),fix(p.raffinateTotalAromaticsWtNmpFree),fix(p.raffinatePolarAromaticsWtNmpFree),fix(p.nmpInTotalRaffinateWt),targetCounts(t.targetCompliance)];}),[35,82,72,90,90,85,74],{size:7.35,align:['right','right','right','right','right','right','left']});
section('Provenance and limitations');
para(`Source identity: Project ${r.referenceJob.projectNumber}, design ${r.referenceJob.designId}, job ${r.referenceJob.id}, completed ${r.referenceJob.completedAt}. Task206 parameter-vector SHA-256: ${r.task206ParameterVectorSha256}.`);
for(const x of r.limitations) para(`• ${x}`);
para('The replay uses the existing recorded results only. Worker-carried active-model global qualification was segregated and is not attributed to Task206. Numerical closure, branch reproduction, and absence of a replay-stage TPD blocker do not confer acceptance.');

const range=d.bufferedPageRange();
for(let i=0;i<range.count;i++){d.switchToPage(i); footer(i+1,range.count);}
d.end();