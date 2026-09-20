import { mkdir, writeFile } from 'node:fs/promises';
import { pool } from '../server/db';
import { getStage5Basis, getStage5Revisions, previewStage5, saveStage5Revision, stage5Hash } from '../server/ecr-pre-pilot/stage5-geometry-service';
import { stage5DrawingPresentation } from '../server/ecr-pre-pilot/stage5-drawing-presentation';
import { createStage5Pdf } from '../server/ecr-pre-pilot/stage5-geometry-report';
import { createStage5DesignDataPdf } from '../server/ecr-pre-pilot/stage5-design-data-report';

async function main() {
  const designId = Number(process.argv[2]);
  if (designId !== 269) throw new Error('This reviewed successor operation is limited to Design269');
  const owner = (await pool.query('SELECT created_by FROM ecr_pre_pilot_designs WHERE id=$1', [designId])).rows[0];
  if (!owner) throw new Error('Missing design');
  const upstream = async () => {
    const data = [];
    for (const table of ['ecr_pre_pilot_predictive_nt_jobs', 'ecr_pre_pilot_kuhni_geometry_resolver_runs',
      'ecr_pre_pilot_stage4_physical_sizing_calculations']) {
      data.push((await pool.query(`SELECT * FROM ${table} WHERE design_id=$1 ORDER BY id`, [designId])).rows);
    }
    return stage5Hash(data);
  };
  const before = await upstream();
  const old = (await pool.query('SELECT * FROM ecr_pre_pilot_stage5_geometry_revisions WHERE design_id=$1 ORDER BY id', [designId])).rows;
  const source = await getStage5Basis(owner.created_by, designId);
  const preview = await previewStage5(owner.created_by, designId);
  if (!String(preview.ruleset).includes('APPROVED')) throw new Error('Approved generator is not ready; nothing saved');
  const existing = await getStage5Revisions(owner.created_by, designId);
  let saved = existing.find((r: any) => r.sourceHash === source.sourceHash
    && String(r.ruleset).includes('APPROVED'));
  if (!saved) saved = await saveStage5Revision(owner.created_by, designId, undefined, source.sourceHash,
    'Approved frozen shrouded turbine and 84-hole perforated stator integrated; inherited 18-compartment / 3240-mm active stack. Historical revisions preserved. Preliminary, not for fabrication.');
  if (!String(saved.ruleset).includes('APPROVED')) throw new Error('Approved component generator was not selected');
  const afterOld = (await pool.query(
    'SELECT * FROM ecr_pre_pilot_stage5_geometry_revisions WHERE design_id=$1 AND id=ANY($2::bigint[]) ORDER BY id',
    [designId, old.map((r: any) => r.id)])).rows;
  if (stage5Hash(old) !== stage5Hash(afterOld) || before !== await upstream()) {
    throw new Error('Preservation check failed');
  }
  const directory = 'deliverables/approved-stage5-internals';
  await mkdir(directory, { recursive: true });
  const presented = stage5DrawingPresentation(saved, designId, 'dimensioned-v2');
  await writeFile(`${directory}/stage5-r${saved.revision}-drawings.pdf`, await createStage5Pdf(presented));
  await writeFile(`${directory}/stage5-r${saved.revision}-design-data.pdf`, await createStage5DesignDataPdf(saved, designId));
  for (const [view, svg] of Object.entries(presented.drawings)) {
    await writeFile(`${directory}/${view}.svg`, String(svg));
  }
  const verification = { designId, revision: saved.revision, ruleset: saved.ruleset,
    historicalStage5Unchanged: true, stages2Through4Unchanged: true, upstreamHash: before };
  await writeFile(`${directory}/preservation.json`, JSON.stringify(verification, null, 2));
  console.log(JSON.stringify(verification, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());