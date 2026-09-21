import { mkdir, writeFile } from 'node:fs/promises';
import { pool } from '../server/db';
import { getStage5Basis, previewStage5, stage5Hash, STAGE5_VIEWS } from '../server/ecr-pre-pilot/stage5-geometry-service';
import { createStage5Pdf } from '../server/ecr-pre-pilot/stage5-geometry-report';
import { renderStage5Svg } from '../shared/ecr-stage5-drawings';
import { PRELIMINARY_COMPONENT_RULES_MANIFEST, PRELIMINARY_COMPONENT_RULESET,
  APPROVED_COMPONENT_RULES_MANIFEST } from '../shared/ecr-stage5-approved-components';

async function main() {
  const user = Number(process.argv[2]), design = Number(process.argv[3]);
  if (!Number.isSafeInteger(user) || user <= 0 || !Number.isSafeInteger(design) || design <= 0)
    throw new Error('Usage: tsx scripts/export-stage5-current-preview.ts <owner-id> <design-id>');
  // Both service calls load saved authority with ensureCurrentOptimizer:false.
  // No business revision is created, and no upstream calculation is invoked.
  const source = await getStage5Basis(user, design);
  const geometry = await previewStage5(user, design);
  if (!geometry.complete || stage5Hash(geometry.basis) !== stage5Hash(source.basis))
    throw new Error('Preview incomplete or source changed; no artifact emitted.');
  const geometryHash = stage5Hash(geometry);
  const rulesManifest = geometry.ruleset === PRELIMINARY_COMPONENT_RULESET
    ? PRELIMINARY_COMPONENT_RULES_MANIFEST : APPROVED_COMPONENT_RULES_MANIFEST;
  const record = {
    ...source, id: 'UNSAVED-CURRENT-PREVIEW', revision: 0, createdAt: new Date().toISOString(),
    currentness: 'CURRENT PRELIMINARY PREVIEW — UNSAVED, NOT AN ISSUED REVISION',
    status: geometry.completionStatement!, notes: 'Read-only current-authority export. Revision 0 denotes an unsaved preview; no business revision was created.',
    geometry, geometryHash, ruleset: geometry.ruleset,
    rulesManifest,
    rulesManifestHash: stage5Hash(rulesManifest),
    drawings: Object.fromEntries(STAGE5_VIEWS.map(view => [view, renderStage5Svg(geometry, view, {
      designId: String(design), revision: 'PREVIEW — UNSAVED', date: new Date().toISOString().slice(0, 10),
      sourceHash: source.sourceHash, presentationVersion: 'dimensioned-v2',
    })])),
  };
  if (stage5Hash(geometry) !== geometryHash) throw new Error('Geometry changed during drawing rendering.');
  const dir = `deliverables/stage5-current-${design}`;
  await mkdir(dir, { recursive: true });
  // Raw upstream research grids can exceed 100 MB. Keep the full frozen proof
  // private and publish an explicitly identified presentation projection only.
  const proofDir = `/tmp/stage5-current-${design}`;
  await mkdir(proofDir, { recursive: true });
  await writeFile(`${proofDir}/full-source-preview.json`, JSON.stringify(record));
  const { sourceStage3, sourceStage4, ...presentation } = record;
  await writeFile(`${dir}/current-preview.json`, JSON.stringify({
    ...presentation, recordType: 'UNSAVED_PREVIEW_PRESENTATION',
    sourceProofOmitted: true,
  }, null, 2));
  for (const [view, svg] of Object.entries(record.drawings)) await writeFile(`${dir}/${view}.svg`, svg);
  await writeFile(`${dir}/preliminary-current-basis.pdf`, await createStage5Pdf(record));
  console.log(JSON.stringify({ dir, sourceHash: source.sourceHash, geometryHash, ruleset: geometry.ruleset,
    complete: geometry.complete, compartments: geometry.compartments.length,
    basis: source.basis, checks: geometry.checks.filter(c => c.status !== 'pass') }, null, 2));
}
main().finally(() => pool.end()).catch(error => { console.error(error); process.exitCode = 1; });