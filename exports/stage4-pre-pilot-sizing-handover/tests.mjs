import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { replayStage4 } from './index.mjs';
import { sizeSelectedGeometry } from './sizing-core.mjs';
const load = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const fixture = () => load('./input.json');
const geometry = () => fixture().selectedStage3.geometry;
const hash = s => createHash('sha256').update(s).digest('hex');

test('source slice checksums and runtime extraction parity', () => {
  const source = load('./source-extracts.json');
  assert.match(source.parentSha256, /^[a-f0-9]{64}$/);
  const runtime = readFileSync(new URL('./sizing-core.mjs', import.meta.url), 'utf8');
  for (const slice of source.slices) {
    assert.equal(hash(slice.text), slice.sha256);
    assert.ok(runtime.includes(slice.text.replaceAll('optimizerGeometry!', 'optimizerGeometry').replaceAll('export const ', 'const ')));
    assert.equal(slice.text.split('\n').length - 1, slice.end - slice.start + 1);
  }
});

test('reference replay: fixed seven, 35%, 20 compartments, 4.2 m, implied 0.6 m', () => {
  const result = replayStage4(fixture());
  assert.deepEqual(result.sizing, {
    diameterM: .7, compartmentHeightM: .21, requiredPhysicalCompartments: 20,
    installedActiveHeightM: 4.2, requiredActiveHeightM: 4.2,
    impliedInstalledHetsMPerTheoreticalStage: .6, designNt: 7, adoptedEfficiency: .35,
  });
  assert.equal(result.actualStage2NtReference, null);
  assert.match(result.authority, /NOT_AUTHENTICATED/);
});

test('equations, twelve-decimal rounding and source-block evaluation agree across sweep', () => {
  const slices = load('./source-extracts.json').slices;
  const evaluate = new Function('optimizerGeometry', `
    const finite = v => typeof v === 'number' && Number.isFinite(v);
    const positiveFinite = v => finite(v) && v > 0;
    const fail = code => { throw new Error(code); };
    ${slices.map(s => s.text.replaceAll('export const ', 'const ').replaceAll('optimizerGeometry!', 'optimizerGeometry')).join('\n')}
    return { requiredPhysicalCompartments, installedActiveHeightM, impliedInstalledHetsMPerTheoreticalStage };`);
  for (let i = 1; i <= 100; i++) {
    const d = .37 + i / 113;
    const g = { ...geometry(), columnDiameterM: d, hcToColumn: .25, compartmentHeightM: d * .25, rotorDiameterM: d * .33 };
    const output = sizeSelectedGeometry(g);
    const source = evaluate(g);
    assert.equal(output.requiredPhysicalCompartments, Math.ceil(7 / .35));
    assert.equal(output.installedActiveHeightM, Math.round(20 * g.compartmentHeightM * 1e12) / 1e12);
    assert.equal(output.impliedInstalledHetsMPerTheoreticalStage, output.installedActiveHeightM / 7);
    for (const key of Object.keys(source)) assert.equal(output[key], source[key]);
  }
});

for (const field of ['columnDiameterM', 'compartmentHeightM', 'hcToColumn', 'rotorDiameterM', 'rotorToColumn', 'freeArea', 'rpm']) {
  for (const [name, value] of [['zero', 0], ['negative', -1], ['NaN', NaN], ['infinite', Infinity], ['missing', undefined], ['string', '0.3']]) {
    test(`reject ${field} ${name}`, () => {
      assert.throws(() => sizeSelectedGeometry({ ...geometry(), [field]: value }), /SELECTED_HYDRAULICS_REQUIRED/);
    });
  }
}
for (const [field, min, max] of [['hcToColumn', .2, .3], ['rotorToColumn', .33, .5], ['freeArea', .2, .4], ['rpm', 30, 70]]) {
  for (const value of [min, max]) test(`accept source boundary ${field} ${value}`, () => {
    const g = { ...geometry(), [field]: value };
    g.compartmentHeightM = g.columnDiameterM * g.hcToColumn;
    g.rotorDiameterM = g.columnDiameterM * g.rotorToColumn;
    assert.equal(sizeSelectedGeometry(g).requiredPhysicalCompartments, 20);
  });
  for (const value of [min - 1e-6, max + 1e-6]) test(`reject outside source boundary ${field} ${value}`, () => {
    const g = { ...geometry(), [field]: value };
    g.compartmentHeightM = g.columnDiameterM * g.hcToColumn;
    g.rotorDiameterM = g.columnDiameterM * g.rotorToColumn;
    assert.throws(() => sizeSelectedGeometry(g));
  });
}
test('missing selection, unselected geometry and half-D cannot generate fallback', () => {
  for (const g of [null, undefined, {}, { ...geometry(), status: 'UNSELECTED' },
    { ...geometry(), hcToColumn: .5, compartmentHeightM: .35 }]) assert.throws(() => sizeSelectedGeometry(g));
});
for (const field of ['compartmentHeightM', 'rotorDiameterM']) test(`${field} geometric consistency 1e-9 tolerance`, () => {
  assert.doesNotThrow(() => sizeSelectedGeometry({ ...geometry(), [field]: geometry()[field] + .5e-9 }));
  assert.throws(() => sizeSelectedGeometry({ ...geometry(), [field]: geometry()[field] + 2e-9 }));
});
for (const field of ['stage1SnapshotHash', 'selectionImplementation', 'selectionResultHash']) {
  test(`reject stale ${field}`, () => {
    const input = fixture(); input.selectedStage3.lineage[field] = 'stale';
    assert.throws(() => replayStage4(input), /LINEAGE_REQUIRED/);
  });
  test(`reject absent current ${field}`, () => {
    const input = fixture(); delete input.currentLineage[field]; delete input.selectedStage3.lineage[field];
    assert.throws(() => replayStage4(input), /LINEAGE_REQUIRED/);
  });
}
test('client admission boolean cannot replace lineage', () => {
  const input = fixture(); delete input.currentLineage; input.integrityVerified = true;
  assert.throws(() => replayStage4(input), /LINEAGE_REQUIRED/);
});
test('Stage2 reference never changes sizing', () => {
  for (const value of [1, 7, 100]) {
    const input = fixture(); input.actualStage2NtReference = { value, evidenceId: 'local-reference', resultHash: 'local-reference-hash' };
    assert.deepEqual(replayStage4(input).sizing, replayStage4(fixture()).sizing);
  }
});
for (const value of [0, -1, NaN, Infinity, 1.5, '7']) test(`invalid Stage2 reference ${String(value)}`, () => {
  const input = fixture(); input.actualStage2NtReference = { value, evidenceId: 'x', resultHash: 'x' };
  assert.throws(() => replayStage4(input), /REFERENCE_INVALID/);
});
test('Stage2 reference requires evidence identity', () => {
  const input = fixture(); input.actualStage2NtReference = { value: 7 };
  assert.throws(() => replayStage4(input), /REFERENCE_INVALID/);
});
test('extreme positive height rounded to zero is rejected by adapter', () => {
  const input = fixture(); const g = input.selectedStage3.geometry;
  g.columnDiameterM = 1e-20; g.compartmentHeightM = 3e-21; g.rotorDiameterM = 3.3e-21;
  assert.throws(() => replayStage4(input), /NOT_POSITIVE/);
});
test('overflow rejected by source finite check', () => {
  const g = { ...geometry(), columnDiameterM: 1e308, compartmentHeightM: 3e307, rotorDiameterM: 3.3e307 };
  assert.throws(() => sizeSelectedGeometry(g));
});
test('replay provenance is mandatory', () => {
  const input = fixture(); delete input.provenance;
  assert.throws(() => replayStage4(input), /PROVENANCE_REQUIRED/);
});