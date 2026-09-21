// Offline saved-output regression. Does NOT import any scientific application code.
import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import path from 'node:path';
const out = path.dirname(new URL(import.meta.url).pathname);
const researchDir = 'deliverables/rrbo-stage3-candidate';
const paths = {
  geometryUpload: 'attached_assets/geometry-rpm-grid_1789965613765.csv',
  scenariosUpload: 'attached_assets/scenarios_1789965613765.csv',
  integrated: `${out}/integrated-saved-artifact.json`,
  researchResult: `${researchDir}/result.json`,
  researchInput: `${researchDir}/input.json`,
  researchSource: `${researchDir}/source.json`,
  researchManifest: `${researchDir}/manifest.json`,
};
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
async function hash(p) { const h=crypto.createHash('sha256'); for await (const b of fs.createReadStream(p)) h.update(b); return h.digest('hex'); }
const hashes = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([k,p])=>[k,await hash(p)])));
for (const [k,p] of [['geometryUpload','geometry-rpm-grid.csv'],['scenariosUpload','scenarios.csv']]) {
  if (hashes[k] !== await hash(`${researchDir}/${p}`)) throw Error(`Upload not identical to supplementary research export: ${k}`);
}
const saved=read(paths.integrated), research=read(paths.researchResult), input=read(paths.researchInput), source=read(paths.researchSource);
const canon = x => Array.isArray(x) ? `[${x.map(canon).join(',')}]` : x && typeof x==='object' ? `{${Object.keys(x).sort((a,b)=>a.localeCompare(b)).map(k=>`${JSON.stringify(k)}:${canon(x[k])}`).join(',')}}` : JSON.stringify(x);
const digest=x=>crypto.createHash('sha256').update(canon(x)).digest('hex');
const {calculationHash,...calculation}=saved.result;
if(digest(calculation)!==calculationHash) throw Error('Exported result integrity failed');
// Research manifest additionally binds its JSON result to the byte-identical CSV exports.
const manifest=read(`${researchDir}/manifest.json`);
for(const [key,file] of [['researchResult','result.json'],['researchInput','input.json'],['researchSource','source.json'],['geometryUpload','geometry-rpm-grid.csv'],['scenariosUpload','scenarios.csv']])
  if(hashes[key]!==manifest[file])throw Error(`Research manifest integrity failure: ${file}`);
const {calculationHash:researchCalculationHash,...researchCalculation}=research;
if(digest(researchCalculation)!==researchCalculationHash)throw Error('Research calculation integrity failure');
const rrbo='rrbo-continuous-nmp-dispersed';
const orient = r => { const a=r.orientationComparison.filter(x=>x.orientation===rrbo); if(a.length!==1)throw Error('RRBO orientation missing/duplicate'); return a[0]; };
const ig=orient(saved.result).geometryGrid, rg=orient(research).geometryGrid;
const metrics=new Map(), diffs=[], structural=[];
const atol=1e-12, rtol=1e-12;
function compare(metric,a,b,key) {
  const m=metrics.get(metric)??{metric,count:0,exact:0,withinTolerance:0,outsideTolerance:0,nullPairs:0,maxAbs:0,maxRelative:0};
  metrics.set(metric,m); m.count++;
  if(a===null&&b===null) {m.nullPairs++;m.exact++;m.withinTolerance++;return;}
  if(typeof a==='number'&&typeof b==='number'&&Number.isFinite(a)&&Number.isFinite(b)) {
    const abs=Math.abs(a-b),den=Math.max(Math.abs(a),Math.abs(b)),rel=den===0?0:abs/den;
    m.maxAbs=Math.max(m.maxAbs,abs);m.maxRelative=Math.max(m.maxRelative,rel);
    if(a===b)m.exact++;
    if(abs<=atol+rtol*den)m.withinTolerance++;else m.outsideTolerance++;
    if(a!==b)diffs.push([key,metric,a,b,abs,rel,abs<=atol+rtol*den?'WITHIN_COMPARATOR_TOLERANCE':'OUTSIDE_COMPARATOR_TOLERANCE']);
  } else {
    if(canon(a)===canon(b)){m.exact++;m.withinTolerance++;}
    else {m.outsideTolerance++;diffs.push([key,metric,a,b,'','','TYPE_NULL_OR_VALUE_MISMATCH']);}
  }
}
function deep(prefix,a,b,key) {
  if(a && b && typeof a==='object' && typeof b==='object' && Array.isArray(a)===Array.isArray(b)) {
    if(Array.isArray(a))compare(`${prefix}.length`,a.length,b.length,key);
    const ak=Object.keys(a),bk=Object.keys(b);
    if(canon(ak.sort())!==canon(bk.sort()))compare(`${prefix}.keys`,ak,bk,key);
    for(const k of new Set([...ak,...bk]))deep(`${prefix}.${Array.isArray(a)?'[]':k}`,a[k],b[k],`${key}/${k}`);
  } else compare(prefix,a,b,key);
}
// Only grid coordinates are normalized, never compared hydraulic values.
// D: stored grid 0.1 m; hc/D, Dr/D, free area and C32: hundredths; RPM integer.
let normalizedRepresentations=0;
function grid(x,digits) { if(!Number.isFinite(Number(x)))throw Error('Nonfinite key'); const n=Number(x),s=n.toFixed(digits); if(Math.abs(n-Number(s))>1e-12)throw Error(`Off-grid key ${x}`); if(n!==Number(s))normalizedRepresentations++; return s; }
const gkey=(D,h,r,f)=>[grid(D,1),grid(h,2),grid(r,2),grid(f,2)].join('|');
const groupKey=g=>gkey(g.columnDiameterM,g.hcToColumn,g.rotorToColumn,g.freeArea);
const trialKey=t=>`${gkey(t.diameterM,t.hcToColumn,t.rotorToColumn,t.freeArea)}|${grid(t.rpm,0)}`;
const scenarioKey=(t,s)=>`${trialKey(t)}|${grid(s.coefficient,2)}|${s.interfaceScenario}`;
function index(values,key,label){const m=new Map();for(const v of values){const k=key(v);if(m.has(k))structural.push(`${label}: duplicate ${k}`);else m.set(k,v);}return m;}
function universe(a,b,label){for(const k of a.keys())if(!b.has(k))structural.push(`${label}: missing integrated ${k}`);for(const k of b.keys())if(!a.has(k))structural.push(`${label}: extra integrated ${k}`);}
const it=ig.flatMap(g=>g.trials), rt=rg.flatMap(g=>g.trials);
const im=index(it,trialKey,'integrated trials'),rm=index(rt,trialKey,'research trials');
universe(rm,im,'trials');
const ism=index(it.flatMap(t=>t.hydraulicMethod.scenarios.map(s=>({t,s}))),x=>scenarioKey(x.t,x.s),'integrated scenarios');
const rsm=index(rt.flatMap(t=>t.hydraulicMethod.scenarios.map(s=>({t,s}))),x=>scenarioKey(x.t,x.s),'research scenarios');
universe(rsm,ism,'JSON scenarios');
// Independent Cartesian coverage check: never infer completeness from equal counts.
const expectedTrials=new Map(),expectedScenarios=new Map(),controls=saved.result.controls;
for(let n=0;n<=Math.round((controls.diameterMaxM-controls.diameterMinM)/controls.diameterStepM);n++)
  for(const h of controls.hcToColumn)for(const r of controls.rotorToColumn)for(const f of controls.freeArea)
    for(let rpm=controls.rpmMin;rpm<=controls.rpmMax;rpm+=controls.rpmStep){
      const k=`${gkey(controls.diameterMinM+n*controls.diameterStepM,h,r,f)}|${grid(rpm,0)}`;
      expectedTrials.set(k,true);
      for(const c of [.36,.42,.43])for(const s of ['BARRY_PARLANGE_MOBILE','SCHILLER_NAUMANN_IMMOBILE'])expectedScenarios.set(`${k}|${grid(c,2)}|${s}`,true);
    }
universe(expectedTrials,im,'expected Cartesian trials');
universe(expectedScenarios,ism,'expected Cartesian scenarios');
// This specific uploaded "CSV" dialect is JSON-string cells comma-delimited,
// emitted by JSON.stringify (backslash escaping, not RFC4180 doubled quotes).
// A streamed physical line is one record; literal newlines inside cells are escaped.
async function* csv(p) {
  let headers;
  for await(const line of readline.createInterface({input:fs.createReadStream(p),crlfDelay:Infinity})) {
    if(!line)throw Error('Unexpected empty CSV record');
    const cells=JSON.parse(`[${line}]`);
    if(!headers){headers=cells;if(new Set(headers).size!==headers.length)throw Error('Duplicate CSV header');continue;}
    if(cells.length!==headers.length)throw Error('CSV width mismatch');
    yield Object.fromEntries(headers.map((k,i)=>[k,cells[i]]));
  }
}
function cell(x) {
  if(x==='')return null;
  if(['NaN','Infinity','-Infinity'].includes(x))throw Error(`Nonfinite CSV value ${x}; not null`);
  if(x.startsWith('[')||x.startsWith('{'))return JSON.parse(x);
  if(/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(x)){const n=Number(x);if(!Number.isFinite(n))throw Error('Nonfinite number');return n;}
  if(x==='true'||x==='false')return x==='true';
  return x;
}
const seen=new Map();let csvScenarioCount=0,hasGoverningColumn=false;
for await(const row of csv(paths.scenariosUpload)) {
  const a=Object.fromEntries(Object.entries(row).map(([k,v])=>[k,cell(v)]));
  const k=`${gkey(a.D,a.hcToD,a.rotorToD,a.freeArea)}|${grid(a.rpm,0)}|${grid(a.coefficient,2)}|${a.interfaceScenario}`;
  if(seen.has(k))structural.push(`CSV scenario duplicate ${k}`);seen.set(k,a);csvScenarioCount++;
  hasGoverningColumn ||= 'governing' in a || 'governingBool' in a;
  const found=ism.get(k);if(!found){structural.push(`CSV scenario missing integrated ${k}`);continue;}
  const {t,s}=found;
  const b={D:t.diameterM,hcToD:t.hcToColumn,rotorToD:t.rotorToColumn,freeArea:t.freeArea,rpm:t.rpm,
    trialStatus:t.status,rotorRe:t.rotorReynolds,...s,...s.diagnostics,
    swarmReOperating:s.operatingSpeeds?saved.result.processBasis.rrboFeed.densityKgM3*s.operatingSpeeds.superficialSwarmMS*s.d32M/saved.result.processBasis.rrboFeed.dynamicViscosityPaS:null,
    slipReOperating:s.operatingSpeeds?saved.result.processBasis.rrboFeed.densityKgM3*s.operatingSpeeds.slipMS*s.d32M/saved.result.processBasis.rrboFeed.dynamicViscosityPaS:null};
  for(const field of Object.keys(a))deep(`scenario.${field}`,a[field],b[field],k);
}
universe(seen,ism,'CSV scenarios');
const skipHash=({stage1SnapshotHash,...b})=>b;
deep('scientificBasis',skipHash(input.basis),skipHash(saved.result.processBasis),'basis');
deep('currentStage1Basis',saved.stage1Basis,saved.result.processBasis,'currentStage1');
deep('controls',input.provenance.controls,saved.result.controls,'controls');
let ties=0,governingCount=0;const controllingLabels={};
for(const [k,t] of im) {
  const r=rm.get(k);if(!r)continue;
  // Full saved trial / validity / qualification / reason / governing evidence,
  // beyond what is present in the CSV. Scenarios compared separately by keys.
  const {hydraulicMethod:ih,...iTrial}=t,{hydraulicMethod:rh,...rTrial}=r;
  deep('trial',rTrial,iTrial,k);
  const {scenarios:is,...iMethod}=ih,{scenarios:rs,...rMethod}=rh;
  deep('method',rMethod,iMethod,k);
  for(const s of is){const prior=rsm.get(scenarioKey(t,s));if(prior)deep('savedScenario',prior.s,s,scenarioKey(t,s));}
  const min=Math.min(...is.map(s=>s.capacityMS)), tied=is.filter(s=>s.capacityMS===min);
  if(tied.length>1)ties++;
  const first=is.reduce((a,b)=>a.capacityMS<=b.capacityMS?a:b);
  compare('governing.minimumCapacity',min,ih.governing.capacityMS,k);
  compare('governing.firstMinimumLabel',`${first.coefficient}|${first.interfaceScenario}`,`${ih.governing.coefficient}|${ih.governing.interfaceScenario}`,k);
  deep('governing.fullScenario',first,ih.governing,k);
  governingCount++;
  const label=`${ih.governing.coefficient} ${ih.governing.interfaceScenario}`;
  controllingLabels[label]=(controllingLabels[label]??0)+1;
  for(const [f,sf] of [['d32M','d32M'],['holdup','operatingHoldup'],['floodHoldup','floodHoldup'],['actualLoading','loading'],['interfacialAreaM2M3','interfacialAreaM2M3']])
    compare(`governing.trial.${f}`,ih.governing[sf],t[f],k);
}
const igm=index(ig,g=>groupKey(g.geometry),'integrated geometries'),rgm=index(rg,g=>groupKey(g.geometry),'research geometries');
universe(rgm,igm,'JSON geometry');
const set=a=>[...new Set(a)].sort((a,b)=>a-b);
const feasibleRows=[],cg=new Map();
for await(const row of csv(paths.geometryUpload)){
  const a=Object.fromEntries(Object.entries(row).map(([k,v])=>[k,cell(v)])),k=groupKey(a);
  if(cg.has(k))structural.push(`CSV geometry duplicate ${k}`);cg.set(k,a);
  const g=igm.get(k);if(!g){structural.push(`CSV geometry missing integrated ${k}`);continue;}
  deep('geometry',Object.fromEntries(Object.keys(g.geometry).map(f=>[f,a[f]])),g.geometry,k);
  const r=set(a.feasibleRpms),i=set(g.trials.filter(t=>t.status==='FEASIBLE').map(t=>t.rpm));
  if(r.length!==a.feasibleRpms.length)structural.push(`Duplicate feasible RPM ${k}`);
  compare('geometry.feasibleRpms',r,i,k);
  deep('geometry.longestGridRun',a.longestGridRun,g.operatingWindow,k);
  const runs=[];for(const rpm of i){if(!runs.length||rpm-runs.at(-1).at(-1)!==saved.result.controls.rpmStep)runs.push([]);runs.at(-1).push(rpm);}
  compare('geometry.discreteRuns',a.discreteRuns,runs,k);
  const reasons={};for(const t of g.trials)for(const reason of t.reasons)reasons[reason]=(reasons[reason]??0)+1;
  deep('geometry.rejectionCounts',a.rejectionCounts,reasons,k);
  feasibleRows.push(['fixed_geometry',k,g.geometry.columnDiameterM,g.geometry.hcToColumn,g.geometry.rotorToColumn,g.geometry.freeArea,r,i,r.length,i.length,canon(r)===canon(i),g.trials.filter(t=>t.status==='FEASIBLE').length]);
}
universe(cg,igm,'CSV geometries');
const diameterSummary=[];
for(const d of set(ig.map(g=>Number(grid(g.geometry.columnDiameterM,1))))) {
  const groups=ig.filter(g=>Number(grid(g.geometry.columnDiameterM,1))===d);
  const csvGroups=[...cg.values()].filter(g=>Number(grid(g.columnDiameterM,1))===d);
  const r=set(csvGroups.flatMap(g=>g.feasibleRpms)),i=set(groups.flatMap(g=>g.trials.filter(t=>t.status==='FEASIBLE').map(t=>t.rpm)));
  compare('diameter.unionFeasibleRpms',r,i,String(d));
  const accepted=groups.flatMap(g=>g.trials).filter(t=>t.status==='FEASIBLE').length, geometryCount=groups.filter(g=>g.trials.some(t=>t.status==='FEASIBLE')).length;
  diameterSummary.push({diameterM:d,unionRpms:i,unionRpmCount:i.length,acceptedTrials:accepted,feasibleFixedGeometries:geometryCount,totalGeometries:groups.length});
  feasibleRows.push(['diameter_union',String(d),d,'','','',r,i,r.length,i.length,canon(r)===canon(i),accepted]);
}
const counts=a=>a.reduce((m,v)=>(m[v]=(m[v]??0)+1,m),{});
const metricRows=[...metrics.values()];
const summary={
  title:'Saved integrated P1 vs uploaded research regression',hashes,
  provenance:{project:236,design:269,candidateId:saved.metadata.id,ledgerId:saved.ledgerId,extractedAt:saved.extractedAt,
    currentStage1Hash:saved.currentStage1Hash,researchStage1Hash:input.provenance.sourceSnapshotHash,
    originalResearchPhase:source.basis.phaseConfiguration,researchOverridePhase:input.basis.phaseConfiguration,
    currentSavedPhase:saved.result.processBasis.phaseConfiguration,ledgerIntegrityVerified:saved.ledgerIntegrityVerified,
    resultIntegrityVerified:true,researchManifestIntegrityVerified:true,researchCalculationHash,calculationHash,ledgerImmutableHash:saved.ledgerImmutableHash,implementationHash:saved.implementationHash,
    latestCurrentHashLedger:saved.latestCurrentHashLedger},
  comparisonPolicy:{absoluteTolerance:atol,relativeTolerance:rtol,rule:'abs(a-b) <= atol + rtol * max(abs(a),abs(b))',
    relativeError:'abs(a-b)/max(abs(a),abs(b)); both zero => 0; no denominator floor',
    nulls:'CSV blank => null; 0 != null; NaN/Infinity => explicit error; missing object keys are compared',
    keys:'D to 1 decimal; hc/D, Dr/D, free area and C32 to 2 decimals; RPM integer; require <=1e-12 deviation; all other values unrounded',
    scope:'Comparator tolerances only; never model acceptance gates. No model/optimizer/authority changes or new solves.'},
  counts:{integratedGeometries:ig.length,researchGeometries:rg.length,csvGeometries:cg.size,integratedTrials:it.length,researchTrials:rt.length,
    integratedScenarios:ism.size,researchScenarios:rsm.size,csvScenarios:csvScenarioCount,duplicateMissingExtra:structural.length,
    acceptedTrials:it.filter(t=>t.status==='FEASIBLE').length,rejectedTrials:it.filter(t=>t.status!=='FEASIBLE').length,
    numericalOrCategoricalDifferences:diffs.length,exactComparisons:metricRows.reduce((n,m)=>n+m.exact,0),
    totalComparisons:metricRows.reduce((n,m)=>n+m.count,0),outsideTolerance:metricRows.reduce((n,m)=>n+m.outsideTolerance,0),
    normalizedKeyRepresentations:normalizedRepresentations,governingChecked:governingCount,exactCapacityTies:ties},
  hasGoverningColumn,controllingLabels,trialStatus:counts(it.map(t=>t.status)),validity:counts(it.map(t=>t.validity)),
  branchStatus:counts([...ism.values()].map(x=>x.s.branchStatus)),nullOperatingHoldup:[...ism.values()].filter(x=>x.s.operatingHoldup===null).length,
  diameterSummary,structural,metrics:metricRows,scientificBasis:skipHash(saved.result.processBasis),controls:saved.result.controls,
  selection:{status:saved.result.status,selectedGeometry:saved.result.selectedGeometry,selectedRpm:saved.result.selectedRpm},
};
function csvWrite(name,headers,rows){const esc=v=>`"${String(v===undefined?'MISSING':v===null?'null':typeof v==='object'?JSON.stringify(v):v).replaceAll('"','""')}"`;fs.writeFileSync(`${out}/${name}`,[headers,...rows].map(r=>r.map(esc).join(',')).join('\n')+'\n');}
csvWrite('metric-summary.csv',Object.keys(metricRows[0]),metricRows.map(m=>Object.values(m)));
csvWrite('numerical-differences.csv',['key','metric','research','integrated','absolute_difference','relative_difference','comparison'],diffs);
csvWrite('feasible-rpm-comparison.csv',['scope','key','D_m','hc_D','Dr_D','free_area','research_rpms','integrated_rpms','research_rpm_count','integrated_rpm_count','equal','integrated_accepted_trial_count'],feasibleRows);
fs.writeFileSync(`${out}/summary.json`,JSON.stringify(summary,null,2));
const table=(headers,rows)=>`| ${headers.join(' | ')} |\n| ${headers.map(()=> '---').join(' | ')} |\n${rows.map(r=>`| ${r.join(' | ')} |`).join('\n')}`;
const keyMetrics=['d32M','operatingHoldup','floodHoldup','capacityMS','loading','interfacialAreaM2M3','branchStatus','trialStatus','operatingRoots.length','operatingRoots.[]'];
const selectedMetrics=keyMetrics.map(k=>metrics.get(`scenario.${k}`)).filter(Boolean);
const md=`# P1 saved-output research regression

## Result

${diffs.length===0&&structural.length===0?'EXACT MATCH of compared saved numerical outputs':summary.counts.outsideTolerance===0&&structural.length===0?'PASS at documented comparator tolerance':'DIFFERENCES FOUND'}; ${diffs.length} non-exact raw comparisons; ${summary.counts.outsideTolerance} outside comparator tolerance. ${summary.counts.exactComparisons} / ${summary.counts.totalComparisons} primitive/array-length comparisons exact.

Project 236 / design 269. Latest current-Stage1-hash completed candidate **${saved.metadata.id}**, ledger **${saved.ledgerId}**. Database verified at ${saved.extractedAt} using explicit repeatable-read READ ONLY SELECT transaction, rolled back. No run, adoption, optimizer solve, input change or authority write. Ledger canonical integrity and complete saved-result calculation hash verified.

Full RRBO-only universe: **${ig.length} geometries, ${it.length} geometry/RPM trials, ${ism.size} scenarios**. Accepted ${summary.counts.acceptedTrials}; rejected ${summary.counts.rejectedTrials}. Duplicate/missing/extra keys: ${structural.length}. Cartesian coverage checked independently against saved controls × C32 {0.36, 0.42, 0.43} × both interface scenarios, not just equal row counts. Alternate phase excluded. Every accepted and rejected scenario, null root and branch status retained.

## Numerical comparison (unrounded parsed doubles)

${table(['Metric','Count','Exact','Within tolerance incl exact','Null pairs','Max absolute','Max relative'],selectedMetrics.map(m=>[m.metric,m.count,m.exact,m.withinTolerance,m.nullPairs,m.maxAbs,m.maxRelative]))}

All exported columns, nested roots, continuation, signed velocities, diagnostics and saved trial validity/qualification are checked; metric-summary.csv contains every metric. numerical-differences.csv contains every non-exact value, even within tolerance (header-only means no non-exact values).

Comparator: absolute 1e-12 plus relative 1e-12 × max(|research|,|integrated|); relative error = absolute error / max(|research|,|integrated|), both zero gives 0. No denominator floor. This is a reporting comparator, **not** a changed 70% loading gate or 20-rpm adequacy policy. Blank CSV cells mean null, never zero; NaN/Infinity cause an explicit error. Array positions retain root/continuation sequence semantics; scenario and geometry joins never use row order.

Keys: D on 0.1-m stored grid; hc/D, Dr/D, free area and C32 at hundredths; RPM integer. Each numeric key must be within 1e-12 of that grid. Binary decimal representations such as 0.30000000000000004 are normalized only for joins; raw numerical comparisons remain unrounded. ${normalizedRepresentations} key-coordinate normalization events (including repeated lookups).

## Controlling scenario and validity

Checked all ${governingCount} trials against minimum **raw** scenario capacity, not rounded loading. ${ties} exact ties; implementation tie semantics retain the first scenario in stored scenario sequence (capacity <=). Governing full object and trial d32, operating/flood holdup, loading and area are checked. Controlling labels: ${JSON.stringify(controllingLabels)}.

Uploaded scenarios CSV has ${hasGoverningColumn?'a':'no'} governing-boolean column. No governing flag was fabricated: labels and validity are compared using the supplementary research result.json, whose sibling CSV files are byte-identical to both uploads. The raw-capacity minimum is independently checked as a selection reduction only, not a hydraulic solve.

Trial validity: ${JSON.stringify(summary.validity)}. Branch statuses: ${JSON.stringify(summary.branchStatus)}. Null operating holdup: ${summary.nullOperatingHoldup}. Validity and qualifications remain preliminary/unqualified where saved; a regression match is not scientific qualification.

## Feasible RPM sets

${table(['D m','Union RPMs across geometries','Union RPM count','Accepted geometry/RPM trials','Feasible fixed geometries / 27'],diameterSummary.map(d=>[d.diameterM,d.unionRpms.join(', ')||'none',d.unionRpmCount,d.acceptedTrials,d.feasibleFixedGeometries+' / '+d.totalGeometries]))}

feasible-rpm-comparison.csv has all ${ig.length} **fixed-geometry** rows plus ${diameterSummary.length} explicitly labeled **diameter unions**. A union is not a fixed-geometry operating window. Discrete runs, longest grid run and rejection counts are separately compared. Saved selection: ${JSON.stringify(summary.selection)}.

## Scientific inputs and provenance

Research Stage1 hash: ${input.provenance.sourceSnapshotHash}. Original frozen research phase: ${source.basis.phaseConfiguration}; research used an isolated RRBO override. Current saved Stage1 hash: ${saved.currentStage1Hash}, with RRBO actually saved. Hash metadata differs; it is not evidence of different scientific properties.

Every process-basis field (not merely selected rho/mu fields) is compared after excluding only stage1SnapshotHash: densities, viscosities, both flows, compositions, sigma, phase, temperatures, pressure, S/O, units/conversions/schema. Controls are recursively compared in full, including D/ratio/free-area/RPM grids and 20-rpm adequacy. Current saved Stage1 basis is also checked against result basis without removing its hash.

Scientific basis:

\`\`\`json
${JSON.stringify(summary.scientificBasis,null,2)}
\`\`\`

Controls:

\`\`\`json
${JSON.stringify(summary.controls,null,2)}
\`\`\`

## Integrity and reproducibility

Ledger immutable hash: ${saved.ledgerImmutableHash}

Result calculation hash: ${calculationHash}

${table(['Artifact','SHA-256'],Object.entries(hashes))}

The integrated artifact omits session/actor identities and credentials. Its full saved numerical result is retained; canonical result hash is rechecked by comparison. The extraction verifies the original ledger envelope before omitting session metadata.

Reproduce from repository root: \`npx tsx deliverables/p1-research-regression/extract.ts\` (read-only DB export), then \`node deliverables/p1-research-regression/compare.mjs\` (offline, streamed uploaded CSV parsing). The exports use JSON-escaped quoted cells, explicitly parsed as that dialect. No optimizer or scientific solver is imported by the comparison. Original research input/source/result companions are required and hashed above.

This compares saved outputs; **it is not independent validation of the original model, correlations, phase assumptions, or physical operating safety**. No mismatch is repaired.
`;
fs.writeFileSync(`${out}/report.md`,md);
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const inline=s=>escape(s).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
function renderMarkdown(text) {
  const lines=text.split('\n'),parts=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(line.startsWith('```')){const code=[];while(++i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i]);parts.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);}
    else if(line.startsWith('| ')){
      const rows=[];do {rows.push(lines[i].slice(2,-2).split(' | '));i++;}while(i<lines.length&&lines[i].startsWith('| '));i--;
      parts.push(`<div class="table-wrap"><table><thead><tr>${rows[0].map(c=>`<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(2).map(r=>`<tr>${r.map(c=>`<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if(/^#{1,3} /.test(line)){const n=line.indexOf(' ');parts.push(`<h${n}>${inline(line.slice(n+1))}</h${n}>`);}
    else if(line.trim())parts.push(`<p>${inline(line)}</p>`);
  }
  return parts.join('\n');
}
fs.writeFileSync(`${out}/report.html`,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P1 saved-output regression</title><style>
:root{color-scheme:light}body{max-width:1180px;margin:36px auto;padding:0 26px;background:#f5f8fa;color:#183347;font:15px/1.65 system-ui}main{background:white;padding:36px;border:1px solid #dbe4eb;border-radius:12px}h1{font-size:32px;line-height:1.2;margin:0 0 28px}h2{font-size:22px;border-top:1px solid #dbe4eb;margin-top:34px;padding-top:25px;color:#116274}p,td{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f7f9;border:1px solid #dbe4eb;border-radius:8px;padding:20px;font:13px/1.6 ui-monospace,monospace}code{font-size:13px}strong{color:#08664b}.eyebrow{text-transform:uppercase;letter-spacing:1.3px;font-size:12px;color:#537584}.table-wrap{overflow:auto;margin:18px 0}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:10px 12px;border:1px solid #d8e2e8;text-align:left;vertical-align:top}th{background:#eaf3f5}tbody tr:nth-child(even){background:#f7fafb}footer{font-size:12px;color:#5c7180;margin-top:22px}@media(max-width:650px){body{padding:0 10px;margin:12px auto}main{padding:20px}h1{font-size:26px}}@media print{body{background:white;margin:0;padding:0}main{border:0;padding:0}h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body><p class="eyebrow">Engineering regression evidence · saved outputs only</p><main>${renderMarkdown(md)}</main><footer>Standalone report. No remote scripts, fonts or data connections. This report does not authorize physical operation.</footer></body></html>`);
console.log(JSON.stringify({counts:summary.counts,diameterSummary,controllingLabels,mainMetrics:selectedMetrics,structural},null,2));