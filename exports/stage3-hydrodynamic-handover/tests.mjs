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
test('selector exactly reproducible across JSON serialization',()=>assert.deepEqual(JSON.parse(JSON.stringify(resolveAutomaticHydraulicSelection(output.run,basis.stage1SnapshotHash))),output.selection));
test('selector rejects stale Stage1 identity',()=>assert.throws(()=>resolveAutomaticHydraulicSelection(output.run,'stale'),/CURRENT_P1_SOURCE_REQUIRED/));
test('selector rejects tampering',()=>{
  const r=structuredClone(output.run); r.result.candidateGrid=[];
  assert.throws(()=>resolveAutomaticHydraulicSelection(r,basis.stage1SnapshotHash),/INTEGRITY_FAILURE/);
});
test('full current-input grid and independent representative replay parity',()=>{
  const current=output.run.result.orientationComparison[0].geometryGrid;
  assert.equal(current.reduce((n,g)=>n+g.trials.length,0),3402);
  assert.equal(current.length,378);
  for(const i of [0,100,200,377]) {
    const g=current[i].geometry;
    const fresh=replay({...input,grid:{diameterM:[g.columnDiameterM],hcToColumn:[g.hcToColumn],
      rotorToColumn:[g.rotorToColumn],freeArea:[g.freeArea],rpm:input.grid.rpm}});
    assert.deepEqual(fresh.run.result.orientationComparison[0].geometryGrid[0],current[i]);
  }
  assert.equal(output.run.basis.stage1SnapshotHash,input.snapshot.immutableHash);
});
test('input contract rejects malformed grid',()=>assert.throws(()=>replay({...input,grid:{...input.grid,rpm:[]}}),/INVALID_GRID_rpm/));
test('all packaged original sources and current authority match provenance hashes',()=>{
  for(const f of read('provenance.json').files)
    assert.equal(createHash('sha256').update(readFileSync(f.packagedPath)).digest('hex'),f.sha256,f.packagedPath);
});
test('local result content hash checks',()=>{
  const {calculationHash,...payload}=output.run.result;
  assert.equal(kuhniRunHash(payload),calculationHash);
  assert.equal(output.provenance,'NEW_LOCAL_REPLAY_NOT_DATABASE_AUTHORITY');
});