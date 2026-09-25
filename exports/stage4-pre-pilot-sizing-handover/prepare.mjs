// Packaging utility only; not needed to run the portable module.
// Run from workspace root to regenerate the exact-source slices.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = new URL('./', import.meta.url);
const parentPath = 'server/ecr-pre-pilot/stage4-pre-pilot-sizing-service.ts';
const parent = readFileSync(parentPath, 'utf8');
const lines = parent.split('\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const ranges = [
  { name: 'fixed design constants', start: 29, end: 30 },
  { name: 'deriveStage4PrePilotSizing selected geometry admission and sizing', start: 281, end: 320 },
];
const slices = ranges.map(range => {
  const text = lines.slice(range.start - 1, range.end).join('\n') + '\n';
  return { ...range, text, sha256: hash(text) };
});
if (!slices[1].text.startsWith("  const optimizedHydraulics =") ||
    !slices[1].text.includes("STAGE4_COMPARTMENT_EFFICIENCY_CALCULATION_INVALID")) {
  throw new Error('Source line mapping changed; review extraction before packaging');
}
writeFileSync(new URL('source-extracts.json', dir), JSON.stringify({
  parentPath, parentSha256: hash(parent), slices,
}, null, 2) + '\n');
const transformed = slices.map(s => s.text.replaceAll('optimizerGeometry!', 'optimizerGeometry')).join('\n');
writeFileSync(new URL('sizing-core.mjs', dir),
  '// Generated exact-source functional extraction; see source-extracts.json.\n' +
  '// Only TypeScript non-null assertions are removed. No source imports copied.\n' +
  'const finite = value => typeof value === "number" && Number.isFinite(value);\n' +
  'const positiveFinite = value => finite(value) && value > 0;\n' +
  'const fail = code => { throw new Error(code); };\n' +
  'export function sizeSelectedGeometry(optimizerGeometry) {\n' +
  transformed.replaceAll('export const ', 'const ') +
  '\nreturn { diameterM, compartmentHeightM, requiredPhysicalCompartments, installedActiveHeightM, requiredActiveHeightM, impliedInstalledHetsMPerTheoreticalStage, designNt: STAGE4_HETS_DESIGN_NT, adoptedEfficiency: STAGE4_DESIGN_COMPARTMENT_EFFICIENCY };\n}\n');
const replayPath = 'exports/stage3-hydrodynamic-handover/replay-summary.json';
const replayText = readFileSync(replayPath, 'utf8');
const replay = JSON.parse(replayText);
writeFileSync(new URL('input.json', dir), JSON.stringify({
  provenance: 'PORTABLE_REPLAY_NOT_SAVED_PROJECT236_STAGE4_RUN',
  currentLineage: { stage1SnapshotHash: 'local-replay-stage1', selectionImplementation: 'local-replay-selection', selectionResultHash: hash(replayText) },
  selectedStage3: {
    lineage: { stage1SnapshotHash: 'local-replay-stage1', selectionImplementation: 'local-replay-selection', selectionResultHash: hash(replayText) },
    geometry: { status: 'SELECTED_IMMUTABLE_OPTIMIZER_GEOMETRY', ...replay.selectedGeometry, rpm: replay.rpm },
  },
}, null, 2) + '\n');
writeFileSync(new URL('provenance.json', dir), JSON.stringify({
  parentPath, parentSha256: hash(parent),
  extraction: 'Exact constants and selected-geometry bounds/equation block; TypeScript non-null assertions removed; portable output adapter is not the original service projection.',
  replaySourcePath: replayPath, replaySourceSha256: hash(replayText),
  replaySourceStatus: replay.provenance,
  numericDisplay: 'Rotor diameter 0.23099999999999998 m retained exactly from replay (0.231 m displayed).',
  sourceAdmissionReview: {
    function: 'loadStage4PrePilotSizingAuthority',
    automaticSelectionLines: [489, 527],
    optimizerIntegrityLines: [573, 607],
    note: 'Reviewed but not bundled or implemented: authenticated ownership, current Stage1, selected Stage3 evidence, engine identity and immutable/calculation integrity. Portable labels do not establish any of these facts.',
  },
}, null, 2) + '\n');