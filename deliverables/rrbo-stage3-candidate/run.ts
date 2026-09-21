/** Offline candidate only. No DB/service imports or authority persistence. */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { canonicalizeStage3Stage4OptimizerControls, evaluateP1ReviewTrial, optimizeStage3Stage4P1ForReview } from '../../server/ecr-pre-pilot/stage3-stage4-optimizer';
const dir='deliverables/rrbo-stage3-candidate/';
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const sourceText=readFileSync(dir+'source.json','utf8');
const source=JSON.parse(sourceText);
const basis=structuredClone(source.basis);
basis.phaseConfiguration='rrbo-continuous-nmp-dispersed';
const controls=canonicalizeStage3Stage4OptimizerControls();
const progress=(event:unknown)=>appendFileSync(dir+'progress.jsonl',JSON.stringify({at:new Date().toISOString(),event})+'\n');
if (process.argv.includes('--preflight')) {
  const t=performance.now();
  const trial=evaluateP1ReviewTrial(basis,.8,.25,.4,.3,50);
  const elapsedMs=performance.now()-t;
  const trialCount=(Math.round((controls.diameterMaxM-controls.diameterMinM)/controls.diameterStepM)+1)*(Math.round((controls.rpmMax-controls.rpmMin)/controls.rpmStep)+1)*controls.hcToColumn.length*controls.rotorToColumn.length*controls.freeArea.length;
  writeFileSync(dir+'preflight.json',JSON.stringify({controls,trialCountPerOrientation:trialCount,singleTrialMs:elapsedMs,estimatedReverseSeconds:trialCount*elapsedMs/1000,comparisonNote:'Default routine retained unchanged; alternate orientation is comparison only and cannot replace requested orientation.',trial},null,2));
  console.log({controls,trialCount,elapsedMs,estimatedReverseSeconds:trialCount*elapsedMs/1000});
} else {
  if (existsSync(dir+'result.json')) throw new Error('Refusing candidate result overwrite');
  const provenance={sourceFileSha256:sha(sourceText),sourceSnapshotHash:source.snapshot.immutableHash,isolatedBasisSha256:sha(JSON.stringify(basis)),phaseOverrideOnly:true,authoritiesUnmodified:source.authorities,controls,sourceCodeSha256:Object.fromEntries(['server/ecr-pre-pilot/stage3-stage4-optimizer.ts','server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts'].map(p=>[p,sha(readFileSync(p,'utf8'))])),candidateNotAuthority:true};
  writeFileSync(dir+'input.json',JSON.stringify({provenance,basis},null,2));
  progress('START: unchanged default P1 review routine, isolated orientation override');
  const t=performance.now();
  try {
    const result=optimizeStage3Stage4P1ForReview(basis,source.snapshot.immutableHash);
    writeFileSync(dir+'result.json',JSON.stringify(result));
    progress({status:'COMPLETE',elapsedSeconds:(performance.now()-t)/1000,resultSha256:sha(readFileSync(dir+'result.json','utf8')),selection:result.selectedGeometry,rpm:result.selectedRpm});
  } catch(e) { progress({status:'FAILED',error:String(e)}); throw e; }
}