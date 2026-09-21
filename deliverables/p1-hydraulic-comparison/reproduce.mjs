// Offline saved-data arithmetic only. Run: node --max-old-space-size=4096 deliverables/p1-hydraulic-comparison/reproduce.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import readline from 'node:readline';
const src = 'deliverables/p1-full-30-200-rpm-sweep/';
const out = 'deliverables/p1-hydraulic-comparison/';
const read = n => JSON.parse(fs.readFileSync(src+n,'utf8'));
const assert = (v,m) => { if(!v) throw Error(m); };
const digest = async p => { const h=crypto.createHash('sha256'); for await(const chunk of fs.createReadStream(p)) h.update(chunk); return h.digest('hex'); };
const manifest=read('manifest.json'), terminal=read('terminal.json'), verified={};
assert(terminal.status==='COMPLETE' && terminal.validationErrors===0,'Source terminal not complete/valid');
for(const [name,expected] of Object.entries(manifest)) {
  const actual=await digest(src+name); assert(actual===expected,'SHA256 mismatch: '+name); verified[name]=actual;
}
assert(verified['result.json']===terminal.resultSha256,'Terminal result hash mismatch');
const result=read('result.json');
const trials=result.orientation.geometryGrid.flatMap(g=>g.trials);
const key=t=>[t.diameterM,t.hcToColumn,t.rotorToColumn,t.freeArea,t.rpm].join('|');
const sid=s=>`${s.coefficient}/${s.interfaceScenario==='BARRY_PARLANGE_MOBILE'?'BP':'SN'}`;
const finite=(x,n)=>assert(typeof x==='number' && Number.isFinite(x),'Nonfinite '+n);
assert(trials.length===13230 && new Set(trials.map(key)).size===13230,'Source trial coverage');
const feasible=trials.filter(t=>t.status==='FEASIBLE');
assert(feasible.length===158,'Expected 158 feasible trials');
const fkeys=new Set(feasible.map(key));
// Source exporter quotes every field and doubles quotes; backslashes are JSON content,
// NOT CSV escape characters. Parse each physical line (source cells contain no literal newlines).
function parseCSV(line) {
  let fields=[],value='',quoted=false;
  for(let i=0;i<line.length;i++) {
    const c=line[i];
    if(c==='"') { if(quoted && line[i+1]==='"'){value+='"';i++;}else quoted=!quoted; }
    else if(c===','&&!quoted){fields.push(value);value='';}else value+=c;
  }
  assert(!quoted,'Unclosed CSV cell'); fields.push(value);return fields;
}
async function csvRead(name,fn) {
  const lines=readline.createInterface({input:fs.createReadStream(src+name),crlfDelay:Infinity});
  let head;
  for await(const line of lines){if(!line)continue;const v=parseCSV(line);if(!head){head=v;continue;}
    assert(v.length===head.length,'CSV column mismatch '+name);fn(Object.fromEntries(head.map((k,i)=>[k,v[i]])));
  }
}
const gridMap=new Map(), scenarioMap=new Map();let gridCount=0, scenarioCount=0;
await csvRead('geometry-rpm-grid.csv',r=>{gridCount++; if(fkeys.has(key(r))) {assert(!gridMap.has(key(r)),'Duplicate grid CSV');gridMap.set(key(r),r);} });
await csvRead('scenarios.csv',r=>{scenarioCount++;if(fkeys.has(key(r))){const k=key(r)+'|'+r.coefficient+'|'+r.interfaceScenario;assert(!scenarioMap.has(k),'Duplicate scenario CSV');scenarioMap.set(k,r);} });
assert(gridCount===13230 && scenarioCount===79380 && gridMap.size===158 && scenarioMap.size===948,'CSV coverage');
const evidence=[], comparisons=[];
const expected=[.36,.42,.43].flatMap(c=>['BARRY_PARLANGE_MOBILE','SCHILLER_NAUMANN_IMMOBILE'].map(i=>c+'|'+i)).sort();
for(const t of feasible) {
  const m=t.hydraulicMethod, sc=m.scenarios, k=key(t), grid=gridMap.get(k);
  assert(grid.status===t.status && +grid.actualLoading===t.actualLoading,'Grid identity/loading mismatch '+k);
  assert(sc.length===6 && JSON.stringify(sc.map(s=>s.coefficient+'|'+s.interfaceScenario).sort())===JSON.stringify(expected),'Scenario identities');
  const controlling=sc.filter(s=>s.capacityMS===Math.min(...sc.map(s=>s.capacityMS)));
  const gov=controlling.find(s=>s.interfaceScenario===m.governing.interfaceScenario && s.coefficient===m.governing.coefficient);
  assert(gov,'Saved governing scenario differs from minimum capacity');
  for(const s of sc) {
    const c=scenarioMap.get(k+'|'+s.coefficient+'|'+s.interfaceScenario);
    assert(c,'Missing source CSV scenario');
    for(const field of ['capacityMS','loading','operatingHoldup','floodHoldup','d32M','interfacialAreaM2M3','operatingBalanceResidualMS','forceBalanceResidualN','terminalRe','characteristicRe']) {
      finite(s[field],field);assert(+c[field]===s[field],'CSV/JSON mismatch '+field);
    }
    for(const field of ['operatingRoots','continuation','diagnostics','operatingSpeeds','signedOperatingVelocities']) assert(JSON.stringify(JSON.parse(c[field]))===JSON.stringify(s[field]),'CSV/JSON mismatch '+field);
    assert(c.branchStatus===s.branchStatus && JSON.stringify(JSON.parse(c.qualification))===JSON.stringify(m.qualification),'CSV flag mismatch');
    assert(s.loading<=.70 && s.operatingHoldup>0 && s.operatingHoldup<s.floodHoldup && t.tipSpeedMS<=4.5,'Feasible gate');
    s.operatingRoots.forEach(v=>finite(v,'operating root'));
    assert(s.branchStatus==='LOWER_QUASI_STEADY_ADMISSIBLE','Unexpected branch status');
    assert(s.operatingRoots.length===2 && s.operatingRoots[0]===s.operatingHoldup && s.operatingRoots[1]>s.floodHoldup,'Distinct lower/upper roots');
    assert(s.continuation.length===16 && s.continuation.every((v,i)=>Number.isFinite(v.holdup) && v.flowFraction===(i+1)/16 && v.holdup>0 && (!i||v.holdup>s.continuation[i-1].holdup)) && s.continuation[15].holdup===s.operatingHoldup,'Continuation validation');
    const v=s.signedOperatingVelocities;
    assert(v.continuousMS>0 && v.dispersedMS<0 && v.dispersedRelativeToContinuousMS<0,'Velocity signs');
    const closure=Math.abs(m.jd/s.operatingHoldup + m.jc/(1-s.operatingHoldup)-s.operatingSpeeds.slipMS);
    assert(closure<=1e-12 && Math.abs(s.operatingBalanceResidualMS)<=1e-12,'Operating closure');
    assert(Math.abs((m.jc+m.jd)/s.capacityMS-s.loading)<1e-12 && Math.abs(6*s.operatingHoldup/s.d32M-s.interfacialAreaM2M3)<1e-10,'Stored metric closure');
    Object.values(s.diagnostics).forEach(v=>finite(v,'dimensionless diagnostic'));
    evidence.push({
      trialKey:k,diameterM:t.diameterM,hcToColumn:t.hcToColumn,rotorToColumn:t.rotorToColumn,freeArea:t.freeArea,rpm:t.rpm,
      scenario:sid(s),isControlling:s===gov,coefficient:s.coefficient,interfaceScenario:s.interfaceScenario,
      capacityMS:s.capacityMS,loading:s.loading,marginAbsolute:.70-s.loading,marginPercentagePoints:100*(.70-s.loading),
      phiOperating:s.operatingHoldup,phiTurning:s.floodHoldup,separationPercentagePoints:100*(s.floodHoldup-s.operatingHoldup),
      normalizedTurningSeparation:(s.floodHoldup-s.operatingHoldup)/s.floodHoldup,
      d32MM:1000*s.d32M,areaM2M3:s.interfacialAreaM2M3,rootCount:s.operatingRoots.length,
      lowerRoot:s.operatingRoots[0],upperRoot:s.operatingRoots[1],rootDistance:s.operatingRoots[1]-s.operatingRoots[0],
      operatingBalanceResidualMS:s.operatingBalanceResidualMS,independentVelocityClosureMS:closure,forceBalanceResidualN:s.forceBalanceResidualN,
      branchStatus:s.branchStatus,continuationSteps:s.continuation.length,continuationMonotone:true,continuationEndpointExact:true,
      velocitySignsValidated:true,continuation:s.continuation,operatingRoots:s.operatingRoots,signedOperatingVelocities:v,
      terminalRe:s.terminalRe,characteristicRe:s.characteristicRe,swarmReOperating:+c.swarmReOperating,slipReOperating:+c.slipReOperating,
      ...s.diagnostics,rotorRe:t.rotorReynolds,powerVolumeWM3:t.powerVolumeWM3,
      qualification:m.qualification,sourceExtrapolation:m.sourceExtrapolation
    });
  }
  const rows=evidence.slice(-6), min=(n)=>Math.min(...rows.map(s=>s[n])),max=(n)=>Math.max(...rows.map(s=>s[n]));
  const worst=rows.filter(s=>s.separationPercentagePoints===min('separationPercentagePoints'));
  comparisons.push({
    trialKey:k,diameterM:t.diameterM,hcToColumn:t.hcToColumn,rotorToColumn:t.rotorToColumn,freeArea:t.freeArea,rpm:t.rpm,
    maxLoading:max('loading'),marginAbsolute:.70-max('loading'),marginPercentagePoints:100*(.70-max('loading')),
    controllingScenario:sid(gov),controllingCapacityMS:gov.capacityMS,controllingPhiOperating:gov.operatingHoldup,
    controllingPhiTurning:gov.floodHoldup,controllingSeparationPP:100*(gov.floodHoldup-gov.operatingHoldup),
    controllingD32MM:gov.d32M*1000,controllingAreaM2M3:gov.interfacialAreaM2M3,
    minSeparationPP:min('separationPercentagePoints'),worstSeparationScenarios:worst.map(s=>s.scenario).join(';'),
    worstSeparationDiffersFromControlling:!worst.some(s=>s.isControlling),
    d32MinMM:min('d32MM'),d32MaxMM:max('d32MM'),phiMin:min('phiOperating'),phiMax:max('phiOperating'),
    minAreaM2M3:min('areaM2M3'),maxAreaM2M3:max('areaM2M3'),
    minRootDistance:min('rootDistance'),maxOperatingResidualMS:Math.max(...rows.map(s=>Math.abs(s.operatingBalanceResidualMS))),
    maxVelocityClosureMS:max('independentVelocityClosureMS'),maxForceResidualN:Math.max(...rows.map(s=>Math.abs(s.forceBalanceResidualN))),
    allSixTwoDistinctRoots:true,allSixContinuation16Monotone:true,allSixSignedDirectionsValid:true,
    branchStatuses:[...new Set(rows.map(s=>s.branchStatus))].join(';'),rotorRe:t.rotorReynolds,powerVolumeWM3:t.powerVolumeWM3
  });
}
const order=(a,b)=>a.rpm-b.rpm||a.hcToColumn-b.hcToColumn||a.rotorToColumn-b.rotorToColumn||a.freeArea-b.freeArea;
const ds=[...new Set(comparisons.map(t=>t.diameterM))].sort((a,b)=>a-b);
assert(ds.length===13 && !feasible.some(t=>t.diameterM===.2),'Diameter coverage');
const dominates=(a,b,third=false)=>a.marginAbsolute>=b.marginAbsolute && a.minAreaM2M3>=b.minAreaM2M3 && (!third||a.minSeparationPP>=b.minSeparationPP) && (a.marginAbsolute>b.marginAbsolute || a.minAreaM2M3>b.minAreaM2M3 || (third&&a.minSeparationPP>b.minSeparationPP));
for(const t of comparisons) {
  const local=comparisons.filter(x=>x.diameterM===t.diameterM);
  t.paretoWithinDiameter2D=!local.some(x=>dominates(x,t));
  t.paretoGlobal2D=!comparisons.some(x=>dominates(x,t));
  t.paretoGlobal3D=!comparisons.some(x=>dominates(x,t,true));
}
const selected=ds.map(d=>{
  const local=comparisons.filter(t=>t.diameterM===d), minLoad=Math.min(...local.map(t=>t.maxLoading));
  const ties=local.filter(t=>t.maxLoading===minLoad).sort(order), s=ties[0];
  const maxArea=Math.max(...local.map(t=>t.minAreaM2M3)), areaTies=local.filter(t=>t.minAreaM2M3===maxArea).sort(order), a=areaTies[0];
  return {...s,feasiblePointCount:local.length,exactObjectiveTieCount:ties.length,tiedTrialKeys:ties.map(t=>t.trialKey).join(';'),
    areaBestTrialKey:a.trialKey,areaBestRPM:a.rpm,areaBestMinAreaM2M3:a.minAreaM2M3,areaBestMarginPP:a.marginPercentagePoints,
    areaBestMinSeparationPP:a.minSeparationPP,areaBestTieCount:areaTies.length};
});
assert(selected.every(t=>t.rpm===30&&t.hcToColumn===.30&&t.rotorToColumn===.33&&t.freeArea===.40),'Unexpected best-margin geometry');
const selectedKeys=new Set(selected.map(t=>t.trialKey));
for(const t of comparisons) t.selectedBestMargin=selectedKeys.has(t.trialKey);
for(const s of evidence) s.selectedBestMargin=selectedKeys.has(s.trialKey);
const selectedEvidence=evidence.filter(s=>s.selectedBestMargin);
const stats=rows=>({scenarios:rows.length,twoDistinctRoots:rows.filter(s=>s.rootCount===2).length,continuation16Monotone:rows.filter(s=>s.continuationSteps===16&&s.continuationMonotone).length,
  branchStatuses:[...new Set(rows.map(s=>s.branchStatus))],maxAbsOperatingResidualMS:Math.max(...rows.map(s=>Math.abs(s.operatingBalanceResidualMS))),
  maxIndependentVelocityClosureMS:Math.max(...rows.map(s=>s.independentVelocityClosureMS)),maxAbsForceResidualN:Math.max(...rows.map(s=>Math.abs(s.forceBalanceResidualN)))});
const methodology=[
  'Saved-data postprocessing only: no engine/solver import, no model execution, no database read/write, no application, input, equation or authority changes.',
  'Use saved FEASIBLE classification and verify all six loading <=0.70, tip speed <=4.5 m/s, finite metrics and lower-root evidence. Ignore the 20 rpm rule AND all RPM-window preferences. No comparison ranking from the old window selection is used.',
  'Within each diameter minimize max(six scenario loading). Absolute headroom = 0.70 - maxLoading; percentage-point headroom = 100 times that difference (NOT percent relative). This is the sole hydraulic objective, not area or a weighted score.',
  'Exact objective ties are retained and counted; deterministic presentation tie-break: ascending RPM, hc/D, rotor/D, free area. Numerical near-ties are not claims of significant engineering differences.',
  'Controlling scenario is saved governing minimum-capacity scenario, checked against all six. Its capacity, holdups, drop size, area, roots and diagnostics stay together. Worst separation is min over six of phi_turn - phi_op; ranges describe scenario envelopes, not synthetic scenarios.',
  'Area objective for alternatives is maximize MINIMUM six-scenario interfacial area (m2/m3): conservative across mandatory unestablished interface/coefficient cases, not an average. It is not a transfer coefficient, residence time, removal prediction or guaranteed contact efficiency.',
  'Pareto 2D uses maximize headroom and minimum-six area, globally and within each D. Optional global 3D adds maximize minimum-six turning separation. Exact nonweighted dominance (all no worse and at least one strictly better); all equal-coordinate trials remain. No cost/compactness/spacing preference is invented.',
  'Roots and 16-point continuation are stored evidence, not rerun. Recheck closure, endpoint, monotonic holdup and signed velocities algebraically. Lower branch is quasi-steady admissibility, not dynamic stability. Root distance and normalized turning separation are geometry of saved solutions, not probabilities or confidence.',
  'Verify SHA256 of every file in source manifest and terminal COMPLETE/result hash. Cross-check all feasible CSV scenario numerical core metrics, roots, continuation, diagnostics, velocities and qualification against saved JSON. CSV doubled-quote handling preserves backslashes in embedded JSON.',
  'Reporting uses rounded tables; CSV/JSON retain native JS numeric precision. No new physical acceptance cutoffs are imposed on Eo, We, Re or Oh. Drag-correlation bounds and spherical/turbulent validity remain UNKNOWN as stored.'
];
const best=[...selected].sort((a,b)=>a.maxLoading-b.maxLoading);
const summary={status:'COMPLETE',scope:'OFFLINE_SAVED_DATA_HYDRAULIC_COMPARISON_ONLY',sourceTerminal:terminal,verifiedSourceSha256:verified,
  coverage:{savedTrials:trials.length,savedScenarios:scenarioCount,feasiblePoints:158,feasibleScenarios:948,feasibleDiameters:13,selectedPoints:13,selectedScenarios:78,diameter02FeasiblePoints:0},
  allFeasibleNumerics:stats(evidence),selectedNumerics:stats(selectedEvidence),methodology,selected,
  maximumHeadroom:best[0],secondHeadroom:best[1],paretoGlobal2D:comparisons.filter(t=>t.paretoGlobal2D),paretoGlobal3D:comparisons.filter(t=>t.paretoGlobal3D),
  qualifications:feasible[0].hydraulicMethod.qualification,assumptions:feasible[0].hydraulicMethod.assumptions,
  engineeringQualified:false,adopted:false,massTransferPerformanceEstablished:false};
fs.mkdirSync(out,{recursive:true});
const save=(name,value)=>fs.writeFileSync(out+name,JSON.stringify(value,null,2)+'\n');
const writeCSV=(name,rows)=>{
  const cols=[...new Set(rows.flatMap(Object.keys))],cell=v=>'"'+(v==null?'':typeof v==='object'?JSON.stringify(v):String(v)).replaceAll('"','""')+'"';
  fs.writeFileSync(out+name,[cols.map(cell).join(','),...rows.map(r=>cols.map(c=>cell(r[c])).join(','))].join('\n')+'\n');
};
writeCSV('per-diameter.csv',selected);writeCSV('all-feasible-comparison.csv',comparisons);writeCSV('scenario-evidence.csv',evidence);
save('summary.json',summary);
const fmt=(n,d=6)=>typeof n==='number'?(Math.abs(n)>0&&Math.abs(n)<1e-5?n.toExponential(3):Number(n.toFixed(d)).toString()):String(n);
const range=(a,b)=>`${fmt(a)}–${fmt(b)}`;
const table=(headers,rows)=>[ '| '+headers.join(' | ')+' |','| '+headers.map(()=>'---').join(' | ')+' |',...rows.map(r=>'| '+r.map(x=>String(x).replaceAll('|',' / ')).join(' | ')+' |')].join('\n');
const d1=selected.find(t=>t.diameterM===1),d15=best[0],d09=selected.find(t=>t.diameterM===.9),d14=best[1];
const sections=[];
const add=(title,body)=>sections.push({title,body});
add('Decision in one paragraph',`**D = ${d15.diameterM} m at 30 rpm is the maximum modeled hydraulic-headroom candidate**: max-six loading ${fmt(d15.maxLoading)}, absolute headroom ${fmt(d15.marginAbsolute)}, or ${fmt(d15.marginPercentagePoints)} percentage points below 0.70. Geometry: hc/D = 0.30, rotor/D = 0.33, free area = 0.40. D = ${d14.diameterM} m is second by this same objective (${fmt(d14.marginPercentagePoints)} pp), only ${fmt(d15.marginPercentagePoints-d14.marginPercentagePoints)} pp behind. These are modeled turning-capacity margins, not observed flooding or a definitive engineering best. All selected points use the same geometry ratios and 30 rpm; no RPM-window criterion was applied.`);
add('Scope and reproducibility',`Terminal COMPLETE and all ${Object.keys(verified).length} source manifest SHA256 entries verified. Result SHA256: ${verified['result.json']}.\n\nSaved full sweep: 13,230 points / 79,380 scenarios. This comparison: **158 feasible points / 948 scenarios**, 13 diameters from 0.3 to 1.5 m. Selected-best subset: **13 points / 78 scenarios**. D = 0.2 m has **no feasible point**; it is not assigned a winner. Reproduction command: node --max-old-space-size=4096 deliverables/p1-hydraulic-comparison/reproduce.mjs. Only frozen saved JSON/CSV/manifest/terminal are read; no DB or scientific engine access.`);
add('Methodology',methodology.map((s,i)=>`${i+1}. ${s}`).join('\n\n'));
add('Best hydraulic point at every feasible diameter',`All rows: 30 rpm, hc/D 0.30, rotor/D 0.33, free area 0.40. Loading is dimensionless; margin is absolute fraction and percentage points, never relative percent. Capacity and all controlling columns belong to the same scenario.\n\n`+table(['D m','Feasible points','Exact ties','Max loading','Margin absolute','Margin pp','Control','Capacity m/s','phi op','phi turn','Separation pp','d32 mm','Area m²/m³'],selected.map(t=>[t.diameterM,t.feasiblePointCount,t.exactObjectiveTieCount,...[t.maxLoading,t.marginAbsolute,t.marginPercentagePoints].map(x=>fmt(x)),t.controllingScenario,...[t.controllingCapacityMS,t.controllingPhiOperating,t.controllingPhiTurning,t.controllingSeparationPP,t.controllingD32MM,t.controllingAreaM2M3].map(x=>fmt(x))])));
add('Worst separation and six-scenario envelopes',`Each range retains its own six-scenario endpoints; combining minima/maxima across columns does NOT define a real operating case. BP = BARRY_PARLANGE_MOBILE; SN = SCHILLER_NAUMANN_IMMOBILE; prefix is C32.\n\n`+table(['D m','Min separation pp','Scenario(s)','Different from capacity control?','d32 mm range','phi op range','Area m²/m³ range','Rotor Re','P/V W/m³'],selected.map(t=>[t.diameterM,fmt(t.minSeparationPP),t.worstSeparationScenarios,t.worstSeparationDiffersFromControlling,range(t.d32MinMM,t.d32MaxMM),range(t.phiMin,t.phiMax),range(t.minAreaM2M3,t.maxAreaM2M3),fmt(t.rotorRe),fmt(t.powerVolumeWM3)])));
add('Strongest candidates and physical trade-offs',`**Maximum modeled headroom: 1.5 m; second: 1.4 m.** The difference is numerical, not proof of physical superiority under unqualified correlations. **Smaller-diameter near-plateau alternatives: 0.9 and 1.0 m at 30 rpm**, not automatically preferred without a footprint/cost/contact requirement. D = 0.9 gives ${fmt(d09.marginPercentagePoints)} pp headroom; D = 1.0 gives ${fmt(d1.marginPercentagePoints)} pp; D = 1.5 gives ${fmt(d15.marginPercentagePoints)} pp. Moving 1.0 → 1.5 gains ${fmt(d15.marginPercentagePoints-d1.marginPercentagePoints)} pp while diameter rises 50% (cross-section ×2.25); modeled max loading changes ${fmt(d1.maxLoading)} → ${fmt(d15.maxLoading)}. Their conservative minimum areas actually INCREASE ${fmt(d1.minAreaM2M3)} → ${fmt(d15.minAreaM2M3)} m²/m³. Consequently the saved data do not support a blanket claim that area decreases with increasing diameter. The 1.5 m / 30 rpm point improves both headroom and conservative area over 1.0 m / 30 rpm, but has slightly less worst-six turning separation (${fmt(d15.minSeparationPP)} versus ${fmt(d1.minSeparationPP)} pp). D=1.4 is dominated by D=1.5 on the two objectives, but survives the three-objective frontier because its turning separation is ${fmt(d14.minSeparationPP)} pp.\n\nAt fixed phase holdup area is 6 phi/d32, so smaller drops would increase area; across these selected cases phase holdup is NOT fixed. Larger D reduces superficial flux and computed holdup, competing with decreasing d32. From D=0.3 to 0.5, conservative area falls ${fmt(selected[0].minAreaM2M3)} → ${fmt(selected[2].minAreaM2M3)} and controlling area falls ${fmt(selected[0].controllingAreaM2M3)} → ${fmt(selected[2].controllingAreaM2M3)} m²/m³. Above that range the saved selected areas rise. D=0.3 selected governing drop is ${fmt(selected[0].controllingD32MM)} mm versus ${fmt(d15.controllingD32MM)} mm at D=1.5. The large-drop cases carry stronger deformation-related diagnostic concern; no Eo/We acceptance threshold is newly asserted here. All diameters remain extrapolated and unqualified.\n\n**Area-led candidate: D=1.5 m, 40 rpm, hc/D=0.30, rotor/D=0.33, free area=0.40** maximizes conservative area over all 158 feasible points (${fmt(d15.areaBestMinAreaM2M3)} m²/m³), but leaves just ${fmt(d15.areaBestMarginPP)} pp headroom. **Turning-separation-led candidate among the best-margin selections: D=0.7 m at 30 rpm**, with ${fmt(selected[4].minSeparationPP)} pp worst-six turning gap, versus ${fmt(d15.minSeparationPP)} at D=1.5. These are distinct modeled objectives, not equivalent quality claims.\n\n30 rpm can maximize this model's capacity margin while low modeled power density/turbulence may not establish adequate dispersion. Neither area nor these hydraulics establish sulfur removal, mass-transfer rate, residence-time adequacy, coalescence, phase inversion, entrainment or disengagement. There is **no defensible unique engineering compromise** without specifying and qualifying those criteria; the explicit headroom and contact-area candidates below are the appropriate shortlist.`);
add('Higher-area alternatives within each diameter',`The area-best point maximizes minimum-six area, not mean or governing-only area. It can have less hydraulic headroom. Full ratios are encoded as D|hc/D|rotor/D|free area|rpm in each key. Exact area ties are counted; tie-break is presentation only.\n\n`+table(['D m','30 rpm min area','30 rpm margin pp','Area-best key','Area ties','Area-best min area','Area-best margin pp','Area-best min separation pp'],selected.map(t=>[t.diameterM,fmt(t.minAreaM2M3),fmt(t.marginPercentagePoints),t.areaBestTrialKey,t.areaBestTieCount,fmt(t.areaBestMinAreaM2M3),fmt(t.areaBestMarginPP),fmt(t.areaBestMinSeparationPP)])));
const edge=comparisons.filter(t=>t.diameterM===.9&&t.rpm===40).sort((a,b)=>b.minAreaM2M3-a.minAreaM2M3)[0];
if(edge)add('The 0.9 m / 40 rpm edge case',`At ${edge.trialKey}, minimum-six area is ${fmt(edge.minAreaM2M3)} m²/m³, but max loading is ${fmt(edge.maxLoading)} and headroom only ${fmt(edge.marginPercentagePoints)} pp. The 0.9 m best-margin 30 rpm point instead has ${fmt(d09.marginPercentagePoints)} pp headroom and ${fmt(d09.minAreaM2M3)} m²/m³ minimum area. Higher area cannot make the 40 rpm case the hydraulic-objective winner; proximity to the acceptance limit is not operating robustness.`);
const pareto=summary.paretoGlobal2D;
assert(pareto.every(t=>t.diameterM===1.5),'Unexpected frontier diameter');
add('Why the hydraulic leader is still conditional',`Every point on the global headroom–conservative-area frontier is D=1.5 m in this saved grid. Smaller diameters are therefore NOT non-dominated alternatives on those two modeled objectives alone. They can remain relevant through the explicitly reported third objective (turning separation), footprint or future qualification evidence—not an invented compactness score.\n\n`+table(['Selected D m','Governing Eo','Governing We','Governing Re terminal','Governing Oh continuous','D / source maximum','Interpretation'],[.3,.9,1,1.5].map(d=>{const s=selectedEvidence.find(s=>s.diameterM===d&&s.isControlling);return[d,...[s.eotvos,s.weberTerminal,s.terminalRe,s.ohnesorgeContinuous,s.sourceExtrapolation.diameterToGartheMaximum].map(x=>fmt(x)), 'UNKNOWN spherical/drag/turbulence validity'];}))+`\n\nLarger-D selections lower the drop-deformation diagnostics here, but increase the scale extrapolation beyond the source geometry. Those competing qualification concerns are not converted into a synthetic risk/confidence score. The maximum-headroom candidate remains a modeled shortlist leader, not hydraulically validated equipment.`);
add('Nonweighted Pareto alternatives',`Global two-objective frontier: ${pareto.length} of 158 points. Three-objective frontier (adding worst-six turning separation): ${summary.paretoGlobal3D.length} points. The all-feasible CSV marks both global frontiers and the within-diameter two-objective frontier. Equal objective coordinates are retained, not arbitrarily discarded. No composite score.\n\n`+table(['Trial key','Margin pp','Min area m²/m³','Min separation pp','Global 3D?'],pareto.map(t=>[t.trialKey,fmt(t.marginPercentagePoints),fmt(t.minAreaM2M3),fmt(t.minSeparationPP),t.paretoGlobal3D])));
add('Numerical evidence: exact scope',table(['Subset','Points','Scenarios','Two distinct roots','16 monotone continuation steps','Max |op residual| m/s','Max independent closure m/s','Max |force residual| N'],[[ 'Selected',13,...Object.values({n:stats(selectedEvidence).scenarios,r:stats(selectedEvidence).twoDistinctRoots,c:stats(selectedEvidence).continuation16Monotone}),fmt(stats(selectedEvidence).maxAbsOperatingResidualMS),fmt(stats(selectedEvidence).maxIndependentVelocityClosureMS),fmt(stats(selectedEvidence).maxAbsForceResidualN)],['All feasible',158,948,stats(evidence).twoDistinctRoots,stats(evidence).continuation16Monotone,fmt(stats(evidence).maxAbsOperatingResidualMS),fmt(stats(evidence).maxIndependentVelocityClosureMS),fmt(stats(evidence).maxAbsForceResidualN)]])+`\n\nAll ${evidence.length} scenarios: stored branch status **LOWER_QUASI_STEADY_ADMISSIBLE**; positive continuous and negative dispersed/relative velocities; lower root exactly equals phi_op; upper root is distinct and above phi_turn; continuation reaches full flow in 16 monotone steps. No roots or continuation were solved anew. Residuals establish numerical closure only, not model validity.`);
add('Selected-point roots: all six scenarios per diameter',`Each row is one actual scenario. Δroots = upper − lower; turn gap is 100(phi_turn − phi_op). Normalized gap = (phi_turn − phi_op)/phi_turn, not confidence. All rows have 2 roots and 16 validated continuation steps; residual columns retain scientific notation.\n\n`+table(['D','Scenario','Lower root','Upper root','Δroots','phi turn','Turn gap pp','Normalized gap','Op residual m/s','Force residual N','Steps / status'],selectedEvidence.map(s=>[s.diameterM,s.scenario,...[s.lowerRoot,s.upperRoot,s.rootDistance,s.phiTurning,s.separationPercentagePoints,s.normalizedTurningSeparation,s.operatingBalanceResidualMS,s.forceBalanceResidualN].map(x=>fmt(x)),`${s.continuationSteps} / LOWER_QUASI_STEADY_ADMISSIBLE`])));
const riskKeys=new Set([...selectedKeys,...pareto.map(t=>t.trialKey),...summary.paretoGlobal3D.map(t=>t.trialKey)]);
const risk=evidence.filter(s=>riskKeys.has(s.trialKey));
add('Regime qualifications and interpretation',`Exact stored qualification flags, applying to every feasible point: ${Object.entries(summary.qualifications).map(([k,v])=>`${k} = ${v}`).join('; ')}. Source status **EXTRAPOLATED**, method **PREPILOT_EXTRAPOLATED_METHOD**, property qualification **PROVISIONAL_SAVED_40C**. Capacity meaning **MODELED_TURNING_CAPACITY_NOT_OBSERVED_FLOOD**.\n\n${summary.assumptions.map(s=>'- '+s).join('\n')}\n\nThe following are raw dimensionless numerical risk indicators, not new pass/fail gates. Eo and We expose deformation/inertial relevance; Re describes the specified velocity scale, not proof of rotor turbulence; Oh records viscous/capillary balance. Terminal Re, characteristic Re, swarm-at-turn Re, operating swarm/slip Re and rotor Re must not be conflated. Spherical-drop validity, actual interface mobility and drag-correlation applicability remain UNKNOWN; no newly invented drag bounds. Source extrapolation ratios and every full-precision diagnostic are in scenario-evidence.csv.\n\n`+table(['D selected','D / source max','Rotor / source max','hc / source max','Viscosity / source max'],selected.map(t=>{const e=evidence.find(s=>s.trialKey===t.trialKey).sourceExtrapolation;return [t.diameterM,...[e.diameterToGartheMaximum,e.rotorToGartheMaximum,e.compartmentToGartheMaximum,e.viscosityToKhMaximum].map(x=>fmt(x))];})));
add('Regime numbers: selected and both global Pareto sets',`${riskKeys.size} unique points / ${risk.length} scenarios in this table (union, not an extra sweep). Every selected 30 rpm point and every global 2D/3D Pareto candidate is covered. Flags for every row are exactly the UNKNOWN/EXTRAPOLATED flags above. P/V and rotor Re per point are in the all-feasible table and CSV.\n\n`+table(['Trial key','Scenario','d32 mm','Eo','We terminal','Re terminal','Re characteristic','Re swarm turn','Re swarm op','Re slip op','Oh continuous','Oh dispersed'],risk.map(s=>[s.trialKey,s.scenario,...[s.d32MM,s.eotvos,s.weberTerminal,s.terminalRe,s.characteristicRe,s.swarmReAtFlood,s.swarmReOperating,s.slipReOperating,s.ohnesorgeContinuous,s.ohnesorgeDispersed].map(x=>fmt(x))])));
add('All 158 feasible alternatives',`Each row preserves the same trial identity. The separate scenario CSV gives all six actual cases, not synthetic worst-case combinations. P2 local/global and P3 global refer to the stated nonweighted objectives.\n\n`+table(['Trial key','Max load','Margin pp','Min area','Min gap pp','Control','Rotor Re','P/V W/m³','Best margin?','P2 local','P2 global','P3 global'],comparisons.map(t=>[t.trialKey,...[t.maxLoading,t.marginPercentagePoints,t.minAreaM2M3,t.minSeparationPP].map(x=>fmt(x)),t.controllingScenario,fmt(t.rotorRe),fmt(t.powerVolumeWM3),t.selectedBestMargin,t.paretoWithinDiameter2D,t.paretoGlobal2D,t.paretoGlobal3D])));
add('Files and limitations',`report.html and report.md are self-contained reports; per-diameter.csv has 13 selected rows and within-D area alternatives; all-feasible-comparison.csv has 158 rows; scenario-evidence.csv has 948 rows with full roots, continuation, diagnostics, qualification and source extrapolation; summary.json contains validation, provenance and frontier sets; methodology.json states the exact rules; reproduce.mjs regenerates outputs solely from frozen files. No source artifact is changed.\n\nThese results support an offline modeled hydraulic comparison and a candidate shortlist only. They do not promote P1 authority, select an engineering-qualified column, validate dispersion or mass transfer, or adopt any candidate.`);
save('methodology.json',{methodology,objective:'minimize maximum six-scenario loading within each diameter',tieBreak:['rpm','hcToColumn','rotorToColumn','freeArea'],areaObjective:'maximize minimum six-scenario interfacial area',thirdObjective:'maximize minimum six-scenario turning-holdup separation'});
const title='P1 hydraulic comparison — saved feasible sweep';
fs.writeFileSync(out+'report.md',`# ${title}\n\n**COMPLETE • CANDIDATE ONLY • NOT ENGINEERING-QUALIFIED**\n\n`+sections.map(s=>`## ${s.title}\n\n${s.body}`).join('\n\n')+'\n');
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const inline=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
function htmlBody(md) {
  return md.split('\n\n').map(block=>{
    if(block.startsWith('| ')){
      const rows=block.split('\n').filter((_,i)=>i!==1).map(line=>line.slice(2,-2).split(' | '));
      return '<div class="scroll"><table><thead><tr>'+rows[0].map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(1).map(r=>'<tr>'+r.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
    }return '<p>'+inline(block).replaceAll('\n','<br>')+'</p>';
  }).join('\n');
}
fs.writeFileSync(out+'report.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f1f4f7;color:#1a2938;font:15px/1.65 system-ui,sans-serif}header{background:#132e44;color:white;padding:44px max(24px,5vw)}h1{font-size:32px;line-height:1.2;max-width:1050px;margin:14px 0}.badge{font-size:12px;letter-spacing:1.5px;color:#a9dacb}main{max-width:1600px;margin:auto;padding:20px 3vw 60px}nav{display:flex;flex-wrap:wrap;gap:8px;padding:16px 0}nav a{font-size:12px;background:white;border:1px solid #ccd9e3;padding:6px 10px;border-radius:4px;color:#224d65;text-decoration:none}section{background:white;border:1px solid #dce4ea;border-radius:8px;margin:20px 0;padding:24px;scroll-margin-top:14px}h2{font-size:21px;color:#163e54;margin:0 0 16px}p{max-width:1200px;overflow-wrap:anywhere}.scroll{overflow-x:auto;max-height:680px;border:1px solid #dce4ea}table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}th{position:sticky;top:0;background:#163e54;color:white;text-align:left;z-index:1}td,th{padding:9px 12px;border-bottom:1px solid #e0e7ec;white-space:nowrap}tr:nth-child(even){background:#f2f6f8}strong{color:#0c6354}header strong{color:white}@media print{body{background:white}section{break-inside:auto;border:0;padding:8px}.scroll{max-height:none;overflow:visible}table{font-size:8px}td,th{padding:3px}nav{display:none}th{position:static}header{padding:16px}}
</style></head><body><header><div class="badge">OFFLINE EVIDENCE REVIEW / PROJECT 236 · DESIGN 269</div><h1>${title}</h1><div>158 feasible points · 948 scenarios · 13 diameter-specific selections</div><p><strong>COMPLETE — candidate only. Not engineering-qualified or adopted.</strong></p></header><main><nav>${sections.map((s,i)=>`<a href="#s${i}">${esc(s.title)}</a>`).join('')}</nav>${sections.map((s,i)=>`<section id="s${i}"><h2>${esc(s.title)}</h2>${htmlBody(s.body)}</section>`).join('')}</main></body></html>`);
save('output-manifest.json',Object.fromEntries(await Promise.all(['reproduce.mjs','report.md','report.html','summary.json','methodology.json','per-diameter.csv','all-feasible-comparison.csv','scenario-evidence.csv'].map(async n=>[n,await digest(out+n)]))));
console.log(JSON.stringify({coverage:summary.coverage,best:summary.maximumHeadroom,second:summary.secondHeadroom,pareto2D:pareto.length,pareto3D:summary.paretoGlobal3D.length,numerics:summary.allFeasibleNumerics},null,2));