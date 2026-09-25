import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateRrboHydraulicTrial, dragCoefficient, swarmSpeeds, makeStage1HydrodynamicProcessBasis,
  kuhniRunHash, resolveAutomaticHydraulicSelection } from './runtime/engine.mjs';
import { replay } from './replay.mjs';
const read = p => JSON.parse(readFileSync(p,'utf8'));
const input = read('input.json');
const output = read('replay-output/result.json');
const historical = read('evidence/historical-candidate/result.json');
const basis = makeStage1HydrodynamicProcessBasis(input.snapshot);
const trial = evaluateRrboHydraulicTrial(.9,30,basis,{rotorToColumn:.33,compartmentToColumn:.3,statorFreeArea:.4});
test('saved DEV identity and exact requested Stage1',()=> {
  assert.equal(input.snapshot.immutableHash,'4dfea564340a448b809860657eccebd5ea96c1a33c0f9af63e5875eebec2e3ce');
  assert.equal(input.snapshot.stage1.feedSulfurPpm,4000);
  assert.equal(input.snapshot.stage1.minimumRecoveryPct,85);
  assert.deepEqual(input.snapshot,read('authority/project236-dev-snapshot.json').inputData);
});
test('saved basis projection uses correct denser dispersed NMP direction and units',()=>{
  assert.equal(basis.rrboFeed.dynamicViscosityPaS,.0598);
  assert.equal(basis.interfacialTensionNM,.011);
  assert.equal(basis.rrboFeed.flowM3S,4000*.001/3600);
  assert.equal(basis.wetSolventPhase.flowM3S,basis.rrboFeed.flowM3S*869*.6/1015);
  assert.ok(trial.signedDensityDifferenceKgM3<0);
});
test('six mandatory scenarios and conservative acceptance',()=>{
  assert.equal(trial.scenarios.length,6);
  assert.equal(new Set(trial.scenarios.map(s=>`${s.coefficient}:${s.interfaceScenario}`)).size,6);
  assert.ok(trial.screeningPass);
});
test('roots, continuation, signed velocities and numerical residuals',()=>{
  for(const s of trial.scenarios) {
    assert.equal(s.operatingHoldup,Math.min(...s.operatingRoots));
    assert.equal(s.continuation.length,16);
    assert.equal(s.continuation[15].holdup,s.operatingHoldup);
    assert.ok(s.operatingHoldup<s.floodHoldup);
    assert.ok(Math.abs(s.forceBalanceResidualN)<1e-10);
    assert.ok(Math.abs(s.operatingBalanceResidualMS)<1e-10);
    assert.ok(s.signedOperatingVelocities.continuousMS>0);
    assert.ok(s.signedOperatingVelocities.dispersedMS<0);
  }
});
test('Stokes immobile limit',()=>assert.ok(Math.abs(dragCoefficient(1e-16,.02,1.16,'SCHILLER_NAUMANN_IMMOBILE')*1e-16-24)<1e-8));
test('swarm speed and slip remain distinct',()=>{
  const s=swarmSpeeds(.2,.01,1,re=>24/re);
  assert.ok(Math.abs(s.superficialSwarmMS/.01-.8**4.65)<1e-12);
  assert.ok(Math.abs(s.slipMS/.01-.8**3.65)<1e-12);
});
test('wrong phase rejected',()=>assert.throws(()=>evaluateRrboHydraulicTrial(.9,30,{...basis,phaseConfiguration:'nmp-continuous-rrbo-dispersed'},{rotorToColumn:.33,compartmentToColumn:.3,statorFreeArea:.4}),/RRBO_CONTINUOUS_REQUIRED/));
test('wrong temperature rejected',()=>assert.throws(()=>evaluateRrboHydraulicTrial(.9,30,{...basis,operatingTemperatureC:50},{rotorToColumn:.33,compartmentToColumn:.3,statorFreeArea:.4}),/40C/));
test('density reversal rejected',()=>assert.throws(()=>evaluateRrboHydraulicTrial(.9,30,{...basis,wetSolventPhase:{...basis.wetSolventPhase,densityKgM3:800}},{rotorToColumn:.33,compartmentToColumn:.3,statorFreeArea:.4}),/DENSITY/));
test('selector exactly reproducible from current local envelope',()=>assert.deepEqual(resolveAutomaticHydraulicSelection(output.run,basis.stage1SnapshotHash),output.selection));
test('selector rejects stale Stage1 identity',()=>assert.throws(()=>resolveAutomaticHydraulicSelection(output.run,'stale'),/CURRENT_P1_SOURCE_REQUIRED/));
test('selector rejects tampering',()=>{
  const r=structuredClone(output.run); r.result.candidateGrid=[];
  assert.throws(()=>resolveAutomaticHydraulicSelection(r,basis.stage1SnapshotHash),/INTEGRITY_FAILURE/);
});
test('full specified grid replay and historical hydraulic-only parity',()=>{
  const current=output.run.result.orientationComparison[0].geometryGrid;
  const old=historical.orientationComparison.find(o=>o.orientation===basis.phaseConfiguration).geometryGrid;
  assert.equal(current.reduce((n,g)=>n+g.trials.length,0),3402);
  assert.equal(current.length,old.length);
  for(let i=0;i<current.length;i++) for(let j=0;j<current[i].trials.length;j++)
    assert.deepEqual(current[i].trials[j].hydraulicMethod,old[i].trials[j].hydraulicMethod);
  assert.notEqual(historical.processBasis.stage1SnapshotHash,basis.stage1SnapshotHash);
});
test('input contract rejects malformed grid',()=>assert.throws(()=>replay({...input,grid:{...input.grid,rpm:[]}}),/INVALID_GRID_rpm/));
test('all packaged original sources and historical evidence match provenance hashes',()=>{
  for(const f of read('provenance.json').files)
    assert.equal(createHash('sha256').update(readFileSync(f.packagedPath)).digest('hex'),f.sha256,f.packagedPath);
});
test('local result content hash checks',()=>{
  const {calculationHash,...payload}=output.run.result;
  assert.equal(kuhniRunHash(payload),calculationHash);
  assert.equal(output.provenance,'NEW_LOCAL_REPLAY_NOT_DATABASE_AUTHORITY');
});