/** Report-only postprocessing; no calculations rerun, no authority imports. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {rankSmallestGeometryGroups} from '../../server/ecr-pre-pilot/stage3-stage4-optimizer';
const dir='deliverables/rrbo-stage3-candidate/';
const result=JSON.parse(readFileSync(dir+'result.json','utf8'));
const input=JSON.parse(readFileSync(dir+'input.json','utf8'));
const source=JSON.parse(readFileSync(dir+'source.json','utf8'));
const orientation=result.orientationComparison.find((o:any)=>o.orientation==='rrbo-continuous-nmp-dispersed');
if(!orientation) throw new Error('Requested orientation missing');
const groups=orientation.geometryGrid;
const trials=groups.flatMap((g:any)=>g.trials);
const feasible=trials.filter((t:any)=>t.status==='FEASIBLE');
const selected=result.selectedTrial;
const f=(v:any)=>typeof v==='number'?Number(v.toPrecision(7)).toString():v===null||v===undefined?'—':String(v);
const csv=(name:string,rows:any[])=>{
  const keys=[...new Set(rows.flatMap(Object.keys))];
  const cell=(v:any)=>JSON.stringify(v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v));
  writeFileSync(dir+name,[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\n')+'\n');
};
const geometry=(g:any)=>`${f(g.columnDiameterM)} / ${f(g.compartmentHeightM)} / ${f(g.rotorDiameterM)} / ${f(g.freeArea)}`;
const runs=(ts:any[])=>{
  const out:number[][]=[];
  for(const t of ts) if(t.status==='FEASIBLE') {
    if(!out.length||t.rpm-out[out.length-1].at(-1)!==result.controls.rpmStep)out.push([]);
    out.at(-1)!.push(t.rpm);
  }
  return out;
};
const representative=(g:any)=>{
  if(!g?.operatingWindow)return null;
  const w=g.operatingWindow, mid=(w.rpmMin+w.rpmMax)/2;
  return [...g.trials].filter(t=>t.status==='FEASIBLE'&&t.rpm>=w.rpmMin&&t.rpm<=w.rpmMax).sort((a,b)=>Math.abs(a.rpm-mid)-Math.abs(b.rpm-mid)||b.rpm-a.rpm||a.powerVolumeWM3-b.powerVolumeWM3)[0];
};
const reasonCounts=(ts:any[])=>{
  const counts:Record<string,number>={};
  for(const t of ts)for(const reason of t.reasons)counts[reason]=(counts[reason]??0)+1;
  return counts;
};
const diameters=[...new Set(groups.map((g:any)=>g.geometry.columnDiameterM))] as number[];
const summaries=diameters.map(d=>{
  const gs=groups.filter((g:any)=>g.geometry.columnDiameterM===d);
  const ts=gs.flatMap((g:any)=>g.trials),pass=ts.filter((t:any)=>t.status==='FEASIBLE');
  const best=rankSmallestGeometryGroups(gs,result.controls.minimumUsefulWindowRpm).selected;
  return {diameterM:d,feasibleTrialCount:pass.length,feasibleGeometryCount:gs.filter((g:any)=>g.operatingWindow).length,adequateGeometryCount:gs.filter((g:any)=>g.operatingWindow?.widthRpm>=20).length,
    feasibleRpmUnion:[...new Set(pass.map((t:any)=>t.rpm))].sort((a:any,b:any)=>a-b),rejections:reasonCounts(ts),
    geometry:best?.geometry??null,discreteRuns:best?runs(best.trials):[],representative:representative(best),
    disposition:pass.length===0?'HYDRAULICALLY REJECTED':gs.some((g:any)=>g.operatingWindow?.widthRpm>=20)?'ADEQUATE (ranking preference met)':'FEASIBLE but 20-rpm ranking preference unmet'};
});
const verification={
  feasibleTrialCount:feasible.length,
  everyFeasibleHasSixScenarios:feasible.every((t:any)=>t.hydraulicMethod?.scenarios.length===6),
  allFeasibleScenarioLoadingAtMost070:feasible.every((t:any)=>t.hydraulicMethod.scenarios.every((s:any)=>s.loading<=.70)),
  allFeasibleScenarioRootsLowerThanFlood:feasible.every((t:any)=>t.hydraulicMethod.scenarios.every((s:any)=>s.operatingHoldup>0&&s.operatingHoldup<s.floodHoldup&&s.continuation.length===16)),
  allFeasibleTipSpeedWithin45:feasible.every((t:any)=>t.tipSpeedMS<=4.5),
  everyGoverningIsMinCapacity:feasible.every((t:any)=>t.hydraulicMethod.governing.capacityMS===Math.min(...t.hydraulicMethod.scenarios.map((s:any)=>s.capacityMS))),
  independentlyCheckedAllScenarioClosureAndLoading:feasible.every((t:any)=>t.hydraulicMethod.scenarios.every((s:any)=>{
    const m=t.hydraulicMethod,p=s.operatingHoldup,v=s.operatingSpeeds;
    return p!==null&&v!==null
      &&Math.abs(m.jd/p+m.jc/(1-p)-v.slipMS)<1e-12
      &&Math.abs(v.superficialSwarmMS/(1-p)-v.slipMS)<1e-12
      &&Math.abs((m.jc+m.jd)/s.capacityMS-s.loading)<1e-12
      &&Math.abs(6*p/s.d32M-s.interfacialAreaM2M3)<1e-10;
  })),
  maxAbsOperatingClosureMS:Math.max(0,...feasible.flatMap((t:any)=>t.hydraulicMethod.scenarios.map((s:any)=>Math.abs(s.operatingBalanceResidualMS)))),
  maxAbsTerminalForceResidualN:Math.max(0,...feasible.flatMap((t:any)=>t.hydraulicMethod.scenarios.map((s:any)=>Math.abs(s.forceBalanceResidualN)))),
  selectedHasSixPassingScenarios:selected?selected.hydraulicMethod.scenarios.length===6&&selected.hydraulicMethod.scenarios.every((s:any)=>s.operatingHoldup!==null&&s.loading<=.70):null
};
if(Object.values(verification).some(v=>v===false))throw new Error('Verification failed');
writeFileSync(dir+'summary.json',JSON.stringify({status:result.status,selectedGeometry:result.selectedGeometry,selectedRpm:result.selectedRpm,selectionRationale:result.selectionRationale,diameters:summaries,verification},null,2));
csv('diameters.csv',summaries.map(({representative,...s})=>({...s,representativeRpm:representative?.rpm,controllingInterface:representative?.hydraulicMethod.governing.interfaceScenario,controllingC:representative?.hydraulicMethod.governing.coefficient})));
csv('geometry-rpm-grid.csv',groups.map((g:any)=>({...g.geometry,feasibleRpms:g.trials.filter((t:any)=>t.status==='FEASIBLE').map((t:any)=>t.rpm),discreteRuns:runs(g.trials),longestGridRun:g.operatingWindow,rejectionCounts:reasonCounts(g.trials)})));
csv('trials.csv',trials.map(({hydraulicMethod,...t}:any)=>({...t,controllingInterface:hydraulicMethod?.governing.interfaceScenario,controllingC:hydraulicMethod?.governing.coefficient,capacityMS:hydraulicMethod?.governing.capacityMS,d32MinM:hydraulicMethod?Math.min(...hydraulicMethod.scenarios.map((s:any)=>s.d32M)):null,d32MaxM:hydraulicMethod?Math.max(...hydraulicMethod.scenarios.map((s:any)=>s.d32M)):null})));
csv('scenarios.csv',trials.flatMap((t:any)=>(t.hydraulicMethod?.scenarios??[]).map((s:any)=>({
  D:t.diameterM,hcToD:t.hcToColumn,rotorToD:t.rotorToColumn,freeArea:t.freeArea,rpm:t.rpm,trialStatus:t.status,rotorRe:t.rotorReynolds,...s,
  ...s.diagnostics,swarmReOperating:s.operatingSpeeds?input.basis.rrboFeed.densityKgM3*s.operatingSpeeds.superficialSwarmMS*s.d32M/input.basis.rrboFeed.dynamicViscosityPaS:null,
  slipReOperating:s.operatingSpeeds?input.basis.rrboFeed.densityKgM3*s.operatingSpeeds.slipMS*s.d32M/input.basis.rrboFeed.dynamicViscosityPaS:null
}))));
const table=(headers:string[],rows:any[][])=>`| ${headers.join(' | ')} |\n| ${headers.map(()=>'---').join(' | ')} |\n${rows.map(r=>'| '+r.map(f).join(' | ')+' |').join('\n')}\n`;
const scenarioTable=(t:any)=>table(['Interface','C32','d32 mm','phi op','phi flood','capacity m/s','loading','area m²/m³','Re terminal','Re characteristic','Re swarm flood','We terminal','Eo','Oh c','Oh d','closure m/s'],
  t.hydraulicMethod.scenarios.map((s:any)=>[s.interfaceScenario,s.coefficient,s.d32M*1000,s.operatingHoldup,s.floodHoldup,s.capacityMS,s.loading,s.interfacialAreaM2M3,s.terminalRe,s.characteristicRe,s.diagnostics.swarmReAtFlood,s.diagnostics.weberTerminal,s.diagnostics.eotvos,s.diagnostics.ohnesorgeContinuous,s.diagnostics.ohnesorgeDispersed,s.operatingBalanceResidualMS]));
let md=`# RRBO-continuous / wet-NMP-dispersed — new Stage-3 candidate only

## Decision and scope

Status: **${result.status}**. Conditional pre-pilot extrapolated screening, not validated final equipment. No authority replaced; no database writes, application edits, engine version bumps, Stage-1 changes or downstream changes. Isolated candidate only.

${selected?`Selected diameter **${f(selected.diameterM)} m at ${selected.rpm} rpm**; hc=${f(selected.compartmentHeightM)} m, rotor=${f(selected.rotorDiameterM)} m, free-area fraction=${f(selected.freeArea)}. Governing scenario: ${selected.hydraulicMethod.governing.interfaceScenario}, C32=${selected.hydraulicMethod.governing.coefficient}. Actual loading=${f(selected.actualLoading)} against 0.70.`:`**No diameter/RPM is selected by the agreed ranking.** There are ${feasible.length} hydraulically feasible trials across ${summaries.filter(s=>s.feasibleTrialCount).length} diameters, but zero geometries meet the required 20-rpm ranking preference. The longest fixed-geometry tested-grid span is ${Math.max(...groups.map((g:any)=>g.operatingWindow?.widthRpm??0))} rpm. Thus this is a ranking-adequacy failure, NOT an assertion that all hydraulic trials fail. The grid was not expanded and no fallback candidate was promoted.`}

Existing agreed ranking retained: second-smallest distinct accepted adequate diameter, after fixed-geometry 20-rpm useful-grid-span preference; no fallback if fewer than two adequate diameters. Within-diameter ties and representative RPM use existing optimizer rules. Adequacy is a ranking preference, not a hydraulic limit. A smaller feasible diameter is not misreported as hydraulically rejected.

## Provenance and reproduction

Project 236 / design 269, identified from existing saved-evidence and audit artifacts, then read from development database in an explicit READ ONLY transaction. Current saved 40 °C Stage-1 snapshot hash: ${source.snapshot.immutableHash}. Source file SHA-256: ${input.provenance.sourceFileSha256}. Isolated input basis SHA-256: ${input.provenance.isolatedBasisSha256}.

Review engine identity: ${JSON.stringify(result.engine)}. Result calculation hash: ${result.calculationHash}. Existing active authority identity was not bumped; this is the previously implemented separate P1 review entry point.

Saved Stage-1 orientation is ${source.basis.phaseConfiguration}; only the in-memory candidate basis phaseConfiguration was changed to rrbo-continuous-nmp-dispersed. The source snapshot hash is provenance, NOT a claim that this modified basis is a persisted Stage-1 authority. input.json records both hashes separately.

Prior latest Stage-3 run ${source.authorities[0].id}, immutable hash ${source.authorities[0].immutable_hash}, implementation hash ${source.authorities[0].implementation_hash}. These were not changed. Full prior identifiers and frozen snapshot are in source.json. Source code file hashes are in input.json.

Reproduce offline with npx tsx deliverables/rrbo-stage3-candidate/run.ts after placing the frozen source.json in a fresh output directory/worktree (the runner refuses result overwrite). Preflight: same command with --preflight. Postprocess with npx tsx deliverables/rrbo-stage3-candidate/report.ts. extract.ts is the separately isolated read-only extraction script; it is not required for replay.

The unchanged optimizeStage3Stage4P1ForReview default routine performs an alternate-orientation comparison internally (compareOrientations=true). It was retained, not separately requested or used for selection. Its raw comparison is retained in result.json; this report and CSVs concern only the requested RRBO-continuous candidate. No additional orientation runs were performed.

## Basis, equations and numerical domain

${table(['Quantity','Value'],[
['T °C',40],['RRBO density kg/m³',input.basis.rrboFeed.densityKgM3],['RRBO viscosity Pa s',input.basis.rrboFeed.dynamicViscosityPaS],
['Wet-NMP density kg/m³',input.basis.wetSolventPhase.densityKgM3],['Wet-NMP viscosity Pa s',input.basis.wetSolventPhase.dynamicViscosityPaS],
['RRBO m³/h',input.basis.rrboFeed.flowM3S*3600],['Wet-NMP m³/h',input.basis.wetSolventPhase.flowM3S*3600],['Interfacial tension N/m',input.basis.interfacialTensionNM],['Np',1.2]])}

Retained grid: D=0.2–1.5 m every 0.1 m; hc/D=0.20,0.25,0.30; rotor/D=0.33,0.40,0.50; free-area fraction=0.20,0.30,0.40; RPM=30,35,40,45,50,55,60,65,70. 378 geometries and 3402 trials per orientation; six mandatory scenario combinations per reverse trial. No design-space modification.

C32=0.36,0.42,0.43 each paired independently with Barry–Parlange mobile and Schiller–Naumann immobile. d32=C32(sigma/rho_c)^0.6 epsilon^-0.4; Np=1.2. Both interface scenarios solve their own terminal/characteristic/swarm states, operating lower branch and modeled flood maximum. Capacity envelope is min across all six; all six must admit a dilute-connected operating root and actual loading≤0.70. Tip speed≤4.5 m/s.

Garthe convention: superficial swarm vs = relative slip × (1−phi). Operating balance is jd/phi+jc/(1−phi)=vs/(1−phi). Capacity maximizes (1+r) vslip/[r/phi+1/(1−phi)], r=jd/jc. Operating holdup is never replaced by flood holdup. a=6 phi_op/d32. Flood is a modeled turning capacity, not an observed flood or inversion point. Source convention and approvals: ../rrbo-hydraulic-method/report.md, ../rrbo-hydraulic-implementation/report.md, and .agents/memory/garthe-swarm-velocity-convention.md.

512-interval holdup mesh, 16-step flow continuation, 70 bisection iterations and 60 capacity-refinement iterations are retained implementation assumptions, not scientific qualification thresholds. Preflight and elapsed calculation evidence are in preflight.json and progress.jsonl. No performance/science modifications. Initial detached-launch attempts did not survive the command session; a managed background process with a live supervising shell and 15-second persisted heartbeat completed the full routine in 214.50 seconds (exit code 0). Only the completed result is reported; the initial START without COMPLETE is retained transparently in the progress log.

**Every RPM “window” below is a discrete tested grid run, NOT proof of continuous feasibility between points.** Diameter unions mix geometries and are explicitly labeled; full per-geometry sets follow.

## All diameters — feasibility, geometry and rejection evidence

Geometry notation is D / hc / rotor diameter (m) / free-area fraction. Best representative geometry at each diameter uses the existing within-diameter ranking; it is descriptive, not a second global selection.

${table(['D m','Pass trials /243','Pass geometries /27','Adequate geometries','RPM union across geometries (NOT one window)','Best geometry','Best geometry discrete runs','Disposition / rejection counts'],
summaries.map(s=>[s.diameterM,s.feasibleTrialCount,s.feasibleGeometryCount,s.adequateGeometryCount,s.feasibleRpmUnion.join(', '),s.geometry?geometry(s.geometry):'none',s.discreteRuns.map(r=>r.join(',')).join(' ; '),s.disposition+'; '+JSON.stringify(s.rejections)]))}

## Selection evidence

${JSON.stringify(orientation.rankingEvidence?.diameterSelection??result.selectionRationale.diameterSelection)}

${selected?`Selected fixed-geometry feasible RPM grid: ${groups.find((g:any)=>JSON.stringify(g.geometry)===JSON.stringify(result.selectedGeometry))?.trials.filter((t:any)=>t.status==='FEASIBLE').map((t:any)=>t.rpm).join(', ')}.

Selected rotor Re=${f(selected.rotorReynolds)}, tip speed=${f(selected.tipSpeedMS)} m/s, power=${f(selected.powerW)} W, P/V=${f(selected.powerVolumeWM3)} W/m³, epsilon=${f(selected.psiWKg)} W/kg; jc=${f(selected.hydraulicMethod.jc)} m/s, jd=${f(selected.hydraulicMethod.jd)} m/s.

${scenarioTable(selected)}

Selected source-extrapolation diagnostics: ${JSON.stringify(selected.hydraulicMethod.sourceExtrapolation)}.

Selected qualification: ${JSON.stringify(selected.hydraulicMethod.qualification)}.`:''}

## Every feasible diameter — representative geometry, controlling scenario and full six-scenario diagnostics
`;
for(const s of summaries.filter(s=>s.representative)) {
  const t=s.representative,m=t.hydraulicMethod;
  md+=`\n### D=${f(s.diameterM)} m\n\nGeometry ${geometry(s.geometry)}; hc/D=${f(t.hcToColumn)}, rotor/D=${f(t.rotorToColumn)}. Representative ${t.rpm} rpm; discrete fixed-geometry runs ${s.discreteRuns.map(r=>r.join(',')).join(' ; ')}. Controlling ${m.governing.interfaceScenario}, C=${m.governing.coefficient}. d32 range=${f(Math.min(...m.scenarios.map((r:any)=>r.d32M))*1000)}–${f(Math.max(...m.scenarios.map((r:any)=>r.d32M))*1000)} mm. Rotor Re=${f(t.rotorReynolds)}, tip=${f(t.tipSpeedMS)} m/s, power=${f(t.powerW)} W.\n\n${scenarioTable(t)}\n`;
}
md+='\n## Complete feasible fixed-geometry RPM sets\n\nEach row fixes all geometry; semicolons separate disconnected runs. No union is presented as a single-geometry window.\n\n';
md+=table(['D m','hc/D','hc m','rotor/D','rotor m','free area','Feasible discrete RPM runs'],groups.filter((g:any)=>g.operatingWindow).map((g:any)=>[g.geometry.columnDiameterM,g.geometry.hcToColumn,g.geometry.compartmentHeightM,g.geometry.rotorToColumn,g.geometry.rotorDiameterM,g.geometry.freeArea,runs(g.trials).map(r=>r.join(', ')).join(' ; ')]));
md+=`\n## Verification and limits\n\n${table(['Check','Result'],Object.entries(verification))}

Closure residuals are checked for all feasible trials, not just the selected one. scenarios.csv retains every scenario, including operating roots, continuation, signed velocities, characteristic and terminal Reynolds, swarm Reynolds at flood, operating swarm/slip Reynolds, Eo, terminal We, continuous/dispersed Oh, capacity, actual loading, operating area and force/operating residuals. result.json retains every original solver output and comparison. All rejected trial constraints are in trials.csv; the diameter summary counts each rejection reason independently, so counts may overlap.

Inversion, entrainment, disengagement, turbulence, spherical-drop applicability, Schiller–Naumann range and actual interface mobility remain UNKNOWN; numerical diagnostics do not qualify them. The pre-pilot d32 interval is epistemic sensitivity, not a confidence interval. Larger-than-source apparatus and high RRBO viscosity remain extrapolations. Lower-branch continuation is quasi-steady admissibility, not proof of dynamic stability. This candidate does not authorize a downstream geometry, transfer, Stage-4/5, drawing or authority update.

## Files

report.html (standalone), report.md (this report), summary.json, diameters.csv, geometry-rpm-grid.csv, trials.csv, scenarios.csv, result.json (complete reproducible raw result), source.json (read-only frozen source), input.json (isolated candidate and provenance), preflight.json, progress.jsonl, extract.ts, run.ts, report.ts. No secrets or actor identities are exported.
`;
writeFileSync(dir+'report.md',md);
const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
let html='',inTable=false;
for(const line of md.split('\n')){
  if(line.startsWith('|')){
    if(/^\|[\s|-]+\|$/.test(line))continue;
    if(!inTable){html+='<div class="scroll"><table>';inTable=true;}
    html+='<tr>'+line.slice(1,-1).split('|').map(s=>'<td>'+esc(s.trim())+'</td>').join('')+'</tr>';continue;
  }
  if(inTable){html+='</table></div>';inTable=false;}
  const h=line.match(/^(#{1,3}) (.*)$/);
  html+=h?`<h${h[1].length}>${esc(h[2])}</h${h[1].length}>`:line?'<p>'+esc(line).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')+'</p>':'';
}
if(inTable)html+='</table></div>';
writeFileSync(dir+'report.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RRBO Stage-3 candidate</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#182738;background:#f6f8fb;margin:0}main{max-width:1500px;margin:auto;padding:35px}h1,h2,h3{color:#123e53}h2{border-top:2px solid #b5ced8;padding-top:25px;margin-top:40px}p{overflow-wrap:anywhere}.scroll{overflow:auto;background:white;margin:18px 0}table{border-collapse:collapse;font-size:13px;width:100%}td{border:1px solid #d6e0e8;padding:9px;vertical-align:top}tr:first-child{background:#dcebf0;font-weight:700}tr:nth-child(even){background:#f1f5f8}@media print{main{padding:0}.scroll{overflow:visible}table{font-size:8px}h2{break-before:auto}}</style><main>${html}</main></html>`);
const hashes=Object.fromEntries(['source.json','input.json','result.json','summary.json','report.md','report.html','diameters.csv','geometry-rpm-grid.csv','trials.csv','scenarios.csv'].map(p=>[p,createHash('sha256').update(readFileSync(dir+p)).digest('hex')]));
writeFileSync(dir+'manifest.json',JSON.stringify(hashes,null,2));
console.log(JSON.stringify({status:result.status,geometry:result.selectedGeometry,rpm:result.selectedRpm,verification,diameters:summaries.map(({representative,...s})=>s)},null,2));