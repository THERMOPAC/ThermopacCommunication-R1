import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dragCoefficient } from '../server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1';

// Offline only. Reuses frozen audit data and the exact production drag kernel.
const source = 'deliverables/kuhni-end-section-preliminary-calculation';
const inputText = readFileSync(`${source}.input.json`, 'utf8');
const input = JSON.parse(inputText);
const saved = JSON.parse(readFileSync(`${source}.results.json`, 'utf8'));
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
if (sha(inputText) !== saved.inputSha256) throw Error('Frozen input/results mismatch');
if (sha(readFileSync('server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts', 'utf8')) !== input.provenance.dragSourceSha256) throw Error('Drag kernel changed');
type Phase = {rhoC:number; rhoD:number; muC:number; muD:number; sigma:number};
const g = 9.80665, fraction = 0.5;
function root(f:(x:number)=>number, lo:number, hi:number) {
  if (!(f(lo) < 0 && f(hi) > 0)) throw Error('Unbracketed root');
  for (let i=0;i<110;i++) { const m=(lo+hi)/2; if(f(m)>0) hi=m; else lo=m; }
  return (lo+hi)/2;
}
function terminal(d:number,p:Phase,model:'SN'|'MyintClean'='SN') {
  const lambda=p.muD/p.muC, dr=Math.abs(p.rhoC-p.rhoD);
  // Myint et al. (2006), Eq. (9), C=0: published, NOT an invented HR/SN blend.
  const factor=model==='SN'?1:(2+3*lambda)/(3*(1+lambda));
  const cd=(re:number)=>factor*dragCoefficient(re,lambda,p.rhoD/p.rhoC,'SCHILLER_NAUMANN_IMMOBILE');
  const ar=p.rhoC*dr*g*d**3/p.muC**2;
  const re=root(r=>cd(r)*r*r-4*ar/3,1e-20,1e5);
  const vt=re*p.muC/(p.rhoC*d), eo=dr*g*d*d/p.sigma;
  const morton=g*p.muC**4*dr/(p.rhoC**2*p.sigma**3);
  const stokes=dr*g*d*d/(18*p.muC), hr=stokes*3*(1+lambda)/(2+3*lambda);
  const residualN=Math.PI/6*d**3*dr*g-cd(re)*p.rhoC*vt**2*Math.PI*d*d/8;
  if(Math.abs(residualN)>1e-12) throw Error('Force balance residual');
  return {d,vt,re,cd:cd(re),eo,we:p.rhoC*vt*vt*d/p.sigma,lambda,morton,log10Morton:Math.log10(morton),stokes,hr,
    stokesRe:stokes*p.rhoC*d/p.muC,hrRe:hr*p.rhoC*d/p.muC,
    hrIncreaseOverStokesPct:100*(hr/stokes-1),stokesOverpredictionVsSNPct:100*(stokes/vt-1),
    residualN,model,myintExperimentalEnvelope:re>.17&&re<200&&eo>.017&&eo<12.1&&lambda>.1&&lambda<100&&Math.log10(morton)>-11.6&&Math.log10(morton)<-.9};
}
function cut(q:number,D:number,p:Phase) {
  const U=q/(Math.PI*D*D/4), requiredTerminal=U/fraction;
  const d=root(d=>terminal(d,p).vt-requiredTerminal,1e-8,.05);
  return {D,q,U,requiredTerminal,...terminal(d,p)};
}
const bottom:Phase=saved.bottom, top:Phase=saved.top;
const cuts=[.5,.7,.8,.9,1,1.2].map(D=>({D,scenarios:saved.scenarios.map((s:any)=>({N:s.N,...cut(s.qBottom,D,bottom)}))}));
const drops=[100,150,200,250,300,500].map(um=>({um,SN:terminal(um*1e-6,bottom),MyintClean:terminal(um*1e-6,bottom,'MyintClean')}));
const qWorst=Math.max(...saved.scenarios.map((s:any)=>s.qBottom));
const requiredDiameters=[150,200,250,500].map(um=>({um,qWorst,vt:terminal(um*1e-6,bottom).vt,D:Math.sqrt(4*qWorst/(Math.PI*fraction*terminal(um*1e-6,bottom).vt))}));
const topCritical=saved.scenarios.map((s:any)=>({N:s.N,...cut(s.qTop,.7,top)}));
const topMean={SN:terminal(saved.topDrop.d,top),MyintCleanExtrapolation:terminal(saved.topDrop.d,top,'MyintClean')};
const results={source,inputSha256:sha(inputText),g,fraction,assumption:'U <= 0.5 vt; screening only, not approved acceptance criterion',bottom,top,
  flowScenarios:saved.scenarios.map((s:any)=>({N:s.N,extractKgH:s.mass.finalExtract,qBottomM3h:s.qBottom*3600,qTopM3h:s.qTop*3600})),
  cuts,drops,requiredDiameters,topCritical,topMean};
writeFileSync('deliverables/disengager-drag-results.json',JSON.stringify(results,null,2)+'\n');
const fmt=(x:number,n=6)=>x.toFixed(n);
const rows=cuts.map(c=>{
  const a=c.scenarios[0],b=c.scenarios[1];
  return `| ${c.D*1000} | ${fmt(a.U*1000)}–${fmt(b.U*1000)} | ${fmt(a.requiredTerminal*1000)}–${fmt(b.requiredTerminal*1000)} | ${fmt(a.d*1e6,3)}–${fmt(b.d*1e6,3)} | ${fmt(a.re,4)}–${fmt(b.re,4)} | ${fmt(a.eo,5)}–${fmt(b.eo,5)} |`;
}).join('\n');
const dropRows=drops.map(d=>`| ${d.um} | ${fmt(d.SN.vt*1000)} | ${fmt(d.SN.stokes*1000)} | ${fmt(d.SN.hr*1000)} | ${fmt(d.MyintClean.vt*1000)} | ${fmt(d.SN.re,4)} | ${fmt(d.SN.eo,5)} |`).join('\n');
const topRows=topCritical.map(t=>`| ${t.N} | ${fmt(t.U*1000)} | ${fmt(t.d*1000)} | ${fmt(t.re)} | ${fmt(t.eo)} |`).join('\n');
writeFileSync('deliverables/disengager-drag-calculations.md',`# Independent disengager drag calculation

Reproduce: \`npx tsx deliverables/disengager-drag-comparison.ts\`. JSON retains full JavaScript numerical precision. No app/database changes. Frozen input and drag-source SHA-256 are checked. This is an isolated-drop screening calculation, not final geometry or release evidence.

40 °C nominal proxies: bottom rho_c=1015, rho_d=869 kg/m³; mu_c=0.001416, mu_d=0.0598 Pa s; sigma=0.011 N/m. Bottom lambda=${fmt(bottom.muD/bottom.muC,9)}, Morton=${terminal(.00025,bottom).morton}, log10(M)=${terminal(.00025,bottom).log10Morton}. Top reverses phases; lambda=${topMean.SN.lambda}, Morton=${topMean.SN.morton}.

N=4 and N=7 are UNBOUND outlet scenarios, not competing approved design authorities. Extract proxies are ${results.flowScenarios.map((s:any)=>`N=${s.N}: ${s.extractKgH} kg/h / 1015 = ${s.qBottomM3h} m³/h`).join('; ')}.

## Bottom inverse capture cutoff
Assumed fraction=0.5; U=Q/A; solve vt(dcrit)=U/0.5 with force balance. dcrit is equality to an assumed operating screen, not the zero-net-rise size (which would use vt=U), nor a carryover specification.

| Shell ID mm | U mm/s, N4–N7 | Required vt mm/s | dcrit µm | Re at cutoff | Eo at cutoff |
|---|---|---|---|---|---|
${rows}

## Bottom same-diameter drag comparison
Stokes/HR are diagnostic only when creeping flow does not hold. Re in this table is from SN; JSON also records Stokes and HR Reynolds numbers. Re≤0.1 is a conservative diagnostic screen, not a sharp universal physical transition.

| Drop µm | SN vt mm/s | Stokes vt mm/s | HR vt mm/s | Myint clean vt mm/s | SN Re | Eo |
|---|---|---|---|---|---|---|
${dropRows}

At 250 µm: HR/Stokes increase=${fmt(drops[3].SN.hrIncreaseOverStokesPct,4)}%; Stokes overpredicts SN speed by ${fmt(drops[3].SN.stokesOverpredictionVsSNPct,4)}%; published Myint-clean vs SN speed increase=${fmt(100*(drops[3].MyintClean.vt/drops[3].SN.vt-1),4)}%. Eo and We are ${drops[3].SN.eo} and ${drops[3].SN.we}. High viscosity ratio strongly suppresses mobility sensitivity; finite-Re drag matters more. The 250-µm point is below Myint's Eo validation minimum 0.017, so its clean result is a near-spherical extrapolation diagnostic, not validated RRBO evidence.

## Required ID for assumed capture targets
Worst bottom flow (N7), no swarm/coalescence credit:
${requiredDiameters.map(d=>`- ${d.um} µm: ${fmt(d.D*1000,3)} mm required ID at vt=${fmt(d.vt*1000)} mm/s.`).join('\n')}

Thus 900 mm is a preliminary physics-conditional bottom candidate for 200-µm capture; 1200 mm is a candidate for 150 µm. This does not select geometry, establish actual entrainment size, qualify nozzles/residence time, or close top disengagement.

## Top: separate unresolved issue
At 700 mm ID:
| N | U mm/s | Conditional SN dcrit mm | Re | Eo |
|---|---|---|---|---|
${topRows}

The saved top mean drop ${saved.topDrop.d*1000} mm gives SN vt=${topMean.SN.vt} m/s, Re=${topMean.SN.re}, Eo=${topMean.SN.eo}, We=${topMean.SN.we}. Eo is not small: bottom shape reasoning cannot validate top mean-drop SN. Myint's drop correlation is relevant literature but top lambda=${topMean.SN.lambda} is below its tested minimum 0.1; its clean extrapolation (${topMean.MyintCleanExtrapolation.vt} m/s) is NOT a validated correction or robust bound. Top cutoff also has Eo around 0.56 and Re above 0.1. Do not declare top capture proven from the saved mean diameter. Require applicable liquid-liquid deformation/mobility evidence, actual outlet properties and a capture-size/carryover basis.

See disengager-drag-evidence.md for verified source equations and applicability.
`);
console.log(JSON.stringify({cuts,requiredDiameters,topCritical},null,2));