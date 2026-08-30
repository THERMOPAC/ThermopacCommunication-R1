import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pool } from '../server/db';
import { validateStage1Snapshot } from '../server/ecr-pre-pilot/stage1';

async function main(): Promise<void> {
  const projectNumber = Number(process.argv[2]);
  if (!Number.isInteger(projectNumber) || projectNumber <= 0) {
    throw new Error('Usage: tsx scripts/export-ecr-pre-pilot-stage1.ts <project-number> [output-path]');
  }

  const result = await pool.query<{ input_data: unknown }>(
    `SELECT input_data
       FROM ecr_pre_pilot_designs
      WHERE project_number = $1
      LIMIT 1`,
    [projectNumber],
  );
  if (!result.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');

  const snapshot = validateStage1Snapshot(result.rows[0].input_data);
  if (snapshot.stage1.projectReference !== String(projectNumber)) {
    throw new Error('STAGE1_PROJECT_REFERENCE_MISMATCH');
  }

  const outputPath = resolve(
    process.argv[3] ?? `.local/runtime/ecr-pre-pilot-project-${projectNumber}-stage1.json`,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    projectNumber,
    outputPath,
    savedAt: snapshot.savedAt,
    immutableHash: snapshot.immutableHash,
  }));
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });