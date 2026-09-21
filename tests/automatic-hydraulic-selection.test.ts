import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { resolveAutomaticHydraulicSelection } from '../server/ecr-pre-pilot/automatic-hydraulic-selection';
import { kuhniRunHash } from '../server/ecr-pre-pilot/kuhni-hydrodynamics';

// Existing read-only saved production evidence, never imported by application code.
const saved = JSON.parse(readFileSync('deliverables/p1-research-regression/integrated-saved-artifact.json', 'utf8'));
const run = { ...saved.metadata, basis: saved.stage1Basis, result: saved.result, immutableHash: saved.ledgerImmutableHash };
const hash = saved.currentStage1Hash;
const actual = resolveAutomaticHydraulicSelection(run, hash);
function withPoints(loadings: number[]) {
  const r = structuredClone(run);
  const prototype = actual.references[0];
  const groups = loadings.map((loading, i) => {
    const g = structuredClone(prototype.geometry);
    g.columnDiameterM = Math.sqrt(i + 1) * .6;
    g.compartmentHeightM = g.columnDiameterM * g.hcToColumn;
    g.rotorDiameterM = g.columnDiameterM * g.rotorToColumn;
    const t = structuredClone(prototype.trial);
    Object.assign(t, { diameterM: g.columnDiameterM, compartmentHeightM: g.compartmentHeightM, rotorDiameterM: g.rotorDiameterM });
    t.hydraulicMethod.scenarios.forEach((s: any) => { s.loading = loading; });
    return { geometry: g, trials: [t], operatingWindow: null };
  });
  r.result.orientationComparison = [{ orientation: r.phaseConfiguration, geometryGrid: groups }];
  return rehash(r);
}
function rehash(r: any) {
  const { calculationHash, ...payload } = r.result;
  r.result.calculationHash = kuhniRunHash(payload);
  return r;
}
describe('automatic P1 area/loading policy', () => {
  it('uses all real saved eligible trials without optimizer execution', () => {
    expect(actual.feasibleConfigurationCount).toBe(158);
    expect(saved.result.candidateGrid[0].diameterM).toHaveLength(14);
    expect(actual.references).toHaveLength(13); // 0.2 m has no eligible trial.
    expect(actual.selected).not.toBeNull();
    expect(actual.status).toBe('AUTOMATIC_DISCRETE_KNEE_SELECTED');
    console.info('Saved P1 automatic result', actual.selected.geometry, actual.selected.trial.rpm, actual.selected.loading);
  });
  it('ignores windows, old ranking and historical no-second-diameter status', () => {
    const r = structuredClone(run);
    r.result.controls.minimumUsefulWindowRpm = 100000;
    r.result.selectionRationale = { fake: 'old ranking' };
    r.result.orientationComparison.forEach((o: any) => o.geometryGrid.forEach((g: any) => { g.operatingWindow = null; g.score = null; }));
    const changed = resolveAutomaticHydraulicSelection(rehash(r), hash);
    expect(changed.selected).toEqual(actual.selected);
  });
  it('selects maximum global chord departure, removes dominated points', () => {
    const result = resolveAutomaticHydraulicSelection(withPoints([.7, .4, .4, .3]), hash);
    expect(result.selected.geometry.columnDiameterM).toBeCloseTo(Math.sqrt(2) * .6);
    expect(result.references[2].dominated).toBe(true);
  });
  it('resolves machine-precision knee ties toward smaller D', () => {
    const r = resolveAutomaticHydraulicSelection(withPoints([.7, .46, .32666666666666666, .3]), hash);
    expect(r.selected.geometry.columnDiameterM).toBeCloseTo(Math.sqrt(2) * .6);
  });
  it('uses minimum worst loading before deterministic RPM geometry ties', () => {
    const r = withPoints([.5, .4, .3]);
    const group = r.result.orientationComparison[0].geometryGrid[0];
    const worse = structuredClone(group.trials[0]);
    worse.rpm = 1;
    worse.hydraulicMethod.scenarios.forEach((s: any) => { s.loading = .6; });
    const tied = structuredClone(group.trials[0]);
    tied.rpm = 29;
    group.trials.push(worse, tied);
    const selected = resolveAutomaticHydraulicSelection(rehash(r), hash).references[0];
    expect(selected.loading).toBe(.5);
    expect(selected.trial.rpm).toBe(29); // RPM is only an exact-headroom tie key, not a window gate.
    expect(selected.feasibleConfigurationCount).toBe(3);
    group.trials.reverse();
    expect(resolveAutomaticHydraulicSelection(rehash(r), hash).references[0]).toEqual(selected);
  });
  it.each([[.7], [.7, .3], [.7, .5, .3], [.4, .4, .4]])('automatically chooses smallest when no knee is resolved (%j)', (...loads: any[]) => {
    // it.each spreads each row into arguments.
    const r = resolveAutomaticHydraulicSelection(withPoints(loads), hash);
    expect(r.status).toBe('SMALLEST_FEASIBLE_NO_RESOLVED_KNEE');
    expect(r.selected.geometry.columnDiameterM).toBe(.6);
  });
  it.each(['missing', 'duplicate', 'nonfinite', 'above70', 'root', 'tip', 'mismatch', 'status'])('fails closed for %s evidence', fault => {
    const r = withPoints([.7]);
    const t = r.result.orientationComparison[0].geometryGrid[0].trials[0];
    const s = t.hydraulicMethod.scenarios;
    if (fault === 'missing') s.pop();
    if (fault === 'duplicate') s[1] = s[0];
    if (fault === 'nonfinite') s[0].loading = NaN;
    if (fault === 'above70') s[0].loading = .70000000000001;
    if (fault === 'root') s[0].operatingHoldup = s[0].floodHoldup;
    if (fault === 'tip') t.tipSpeedMS = 4.500000000001;
    if (fault === 'mismatch') t.diameterM += .01;
    if (fault === 'status') t.status = 'INFEASIBLE';
    expect(resolveAutomaticHydraulicSelection(rehash(r), hash).selected).toBeNull();
  });
  it('rejects stale and tampered sources', () => {
    expect(() => resolveAutomaticHydraulicSelection(run, 'stale')).toThrow();
    const r = structuredClone(run); r.result.status = 'tampered';
    expect(() => resolveAutomaticHydraulicSelection(r, hash)).toThrow('INTEGRITY');
  });
});