import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { optimizeStage3Stage4, rankGeometryGroups } from '../../server/ecr-pre-pilot/stage3-stage4-optimizer';
import { kuhniRunHash } from '../../server/ecr-pre-pilot/kuhni-hydrodynamics';
const saved=JSON.parse(readFileSync('deliverables/kuhni-successor-review/saved-evidence.json','utf8'));
const r=saved.s3.result_snapshot;
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=(v:any)=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const replay=optimizeStage3Stage4(saved.s3.process_basis,saved.s3.stage1_snapshot_hash,r.controls);
const summarize=(g:any)=>({geometry:g.geometry,window:g.operatingWindow,score:g.score,passingRpms:g.trials.filter((t:any)=>t.status==='FEASIBLE').map((t:any)=>t.rpm)});
const orientations=r.orientationComparison.map((o:any)=>{
 const grid=o.geometryGrid;
 const configured=r.candidateGrid.find((g:any)=>g.orientation===o.orientation);
 const actualKeys=grid.flatMap((g:any)=>g.trials.map((t:any)=>[g.geometry.columnDiameterM,g.geometry.hcToColumn,g.geometry.rotorToColumn,g.geometry.freeArea,t.rpm].join('|')));
 const expectedKeys=configured.diameterM.flatMap((d:number)=>configured.hcToColumn.flatMap((h:number)=>configured.rotorToColumn.flatMap((q:number)=>configured.freeArea.flatMap((f:number)=>configured.rpm.map((rpm:number)=>[d,h,q,f,rpm].join('|'))))));
 const completeCartesianGrid=actualKeys.length===expectedKeys.length&&new Set(actualKeys).size===actualKeys.length&&expectedKeys.every((k:string)=>actualKeys.includes(k));
 const counts=r.controls.rotorToColumn.map((ratio:number)=>({ratio,groups:grid.filter((g:any)=>g.geometry.rotorToColumn===ratio).length,trials:grid.filter((g:any)=>g.geometry.rotorToColumn===ratio).reduce((n:number,g:any)=>n+g.trials.length,0),feasibleTrials:grid.filter((g:any)=>g.geometry.rotorToColumn===ratio).flatMap((g:any)=>g.trials).filter((t:any)=>t.status==='FEASIBLE').length}));
 const selected=rankGeometryGroups(grid,20).selected;
 const reversed=rankGeometryGroups([...grid].reverse(),20).selected;
 const permutations=Array.from({length:20},(_,i)=>[...grid.slice(i*13),...grid.slice(0,i*13)]).map(a=>hash(rankGeometryGroups(a,20).selected)===hash(selected));
 const at600=grid.filter((g:any)=>g.geometry.columnDiameterM===0.6);
 const bestByRatio=r.controls.rotorToColumn.map((ratio:number)=>{
 const pool=at600.filter((g:any)=>g.geometry.rotorToColumn===ratio&&g.operatingWindow);
 // Comparator exactly matches bestFeasibleGroupAtDiameter and rankingStableTie.
 pool.sort((a:any,b:any)=>b.operatingWindow.widthRpm-a.operatingWindow.widthRpm||b.score.edgeMarginRpm-a.score.edgeMarginRpm||b.score.validTrialCount-a.score.validTrialCount||a.score.centerDistanceRpm-b.score.centerDistanceRpm||a.score.tieBreakPowerVolumeWM3-b.score.tieBreakPowerVolumeWM3||a.geometry.columnDiameterM-b.geometry.columnDiameterM||a.geometry.hcToColumn-b.geometry.hcToColumn||a.geometry.rotorToColumn-b.geometry.rotorToColumn||a.geometry.freeArea-b.geometry.freeArea);
 return {ratio,best:pool[0]?summarize(pool[0]):null};
 });
 return {orientation:o.orientation,completeCartesianGrid,counts,groupCount:grid.length,trialCount:grid.reduce((n:number,g:any)=>n+g.trials.length,0),reverseInvariant:hash(selected)===hash(reversed),permutationsInvariant:permutations.every(Boolean),selected:selected?summarize(selected):null,bestByRatio,at600:at600.map(summarize)};
});
const s=saved.s3;
const calculatedImmutableHash=kuhniRunHash({basis:s.process_basis,theoreticalStages:s.theoretical_stage_authority,parentHydrodynamicRun:s.parent_hydrodynamic_run_id?{id:s.parent_hydrodynamic_run_id,immutable_hash:s.parent_hydrodynamic_run_hash}:null,result:r});
const evidence={savedResultCanonicalHash:hash(r),replayResultCanonicalHash:hash(replay),exactReplay:hash(r)===hash(replay),savedCalculationHash:r.calculationHash,replayCalculationHash:replay.calculationHash,calculatedImmutableHash,immutableHashVerified:calculatedImmutableHash===s.immutable_hash,orientations};
writeFileSync('deliverables/kuhni-successor-review/ranking-evidence.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify({...evidence,orientations:orientations.map(o=>({...o,at600:undefined}))},null,2));