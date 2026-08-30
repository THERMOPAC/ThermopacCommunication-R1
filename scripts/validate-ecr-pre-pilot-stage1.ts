import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateStage1Snapshot } from '../server/ecr-pre-pilot/stage1';

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: tsx scripts/validate-ecr-pre-pilot-stage1.ts <snapshot-path>');
  }
  const snapshot = validateStage1Snapshot(
    JSON.parse(await readFile(resolve(inputPath), 'utf8')),
  );
  console.log(JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    projectReference: snapshot.stage1.projectReference,
    savedAt: snapshot.savedAt,
    immutableHash: snapshot.immutableHash,
    componentOrder: snapshot.sixComponentCosmoSacBinding.componentOrder,
    bindingStatus: snapshot.sixComponentCosmoSacBinding.status,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});