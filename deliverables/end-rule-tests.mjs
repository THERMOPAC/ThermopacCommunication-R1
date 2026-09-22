import assert from 'node:assert/strict';
import { calculate, balance, geometry, h10, area, nozzle } from './end-rule-calculation.mjs';
const r = calculate();
const near = (a,b,t=1e-8) => assert(Math.abs(a-b)<t, `${a} != ${b}`);
near(r.feeds.totalKgH,8690);
near(r.feeds.wetSolventM3H*1015,5214);
near(r.feeds.componentFeedKgH.reduce((a,b)=>a+b,0),8690);
for (const fractions of [Array(7).fill(0),Array(7).fill(1),[0,.1,.2,.3,.4,.5,1]]) {
  const b=balance(r.feeds.componentFeedKgH,fractions);
  near(b.totalResidualKgH,0);
  b.componentResidualKgH.forEach(x=>near(x,0));
  near(b.raffinateKgH+b.extractKgH,8690);
}
for (const s of r.unqualifiedSensitivities) {
  near(s.totalResidualKgH,0);
  s.componentResidualKgH.forEach(x=>near(x,0));
  for (const g of s.residenceComparison) {
    near(.9*area(g.diameterM)*g.topH10M/(s.topVolumeProxyM3H/3600),600);
    near(.9*area(g.diameterM)*g.bottomH10M/(s.bottomVolumeProxyM3H/3600),600);
  }
}
for (const d of [.7,.9,1,1.2]) {
  const g=geometry(d);
  assert(g.transitionMinimumM>=.2 && g.transitionMinimumM>=.4*d);
  near(2*g.sharpConeReferenceLengthM*Math.tan(Math.PI/6),d-.7);
  assert.equal(g.physicalTransitionLengthM,null); // Never substitute a fabricated knuckle envelope.
  assert.equal(g.actualH10TopM,null);
  near(h10(2,d),2*h10(1,d));
  near(h10(1,2*d),h10(1,d)/4);
}
assert.equal(geometry(.7).sharpConeReferenceLengthM,0);
assert.equal(r.feedNozzles.P03.provisionalMinimumDn,80);
for (const q of [4,r.feeds.wetSolventM3H]) {
  for (const p of nozzle(q).candidates) {
    near(p.idMm,p.odMm-2*p.wallMm);
    near(p.normalVelocityMS*area(p.idMm/1000)*3600,q);
    near(p.hydraulic120VelocityMS,1.2*p.normalVelocityMS);
  }
}
assert.equal(r.parameterizedActualBalance.raffinateKgH,null);
assert.equal(r.actualProductNozzles.P02,null);
assert.equal(r.mechanicalHolds.totalVesselHeightM,null);
assert.equal(r.selectedEndDiameters,null);
assert.equal(r.feeds.savedStage1MassRatioUnchanged,.6);
assert.throws(()=>balance([1],[1.1]));
assert.throws(()=>balance([1],[null]));
assert.throws(()=>h10(NaN,1));
assert.throws(()=>geometry(.6));
function finite(v) {
  if (typeof v==='number') assert(Number.isFinite(v));
  else if (Array.isArray(v)) v.forEach(finite);
  else if (v && typeof v==='object') Object.values(v).forEach(finite);
}
finite(r);
assert.deepEqual(JSON.parse(JSON.stringify(r)),r);
console.log('PASS: component/total conservation, units, 600-s residence, dimensions, cone reference/minimum, nozzle IDs, finite values and explicit unknowns.');