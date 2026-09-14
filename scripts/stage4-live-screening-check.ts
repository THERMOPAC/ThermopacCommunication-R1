import { pool } from '../server/db';
import {
  calculateStage4PrePilotSizing,
  getLiveStage4PrePilotSizing,
  retryStage4PrePilotSizing,
} from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';

const DESIGN_ID = 269;
const POLL_MS = 1_000;

async function main() {
  // The owner is deliberately resolved in-process. It is never printed and is
  // not accepted as a command-line or client scientific input.
  const owner = await pool.query<{ created_by: number }>(
    'SELECT created_by FROM ecr_pre_pilot_designs WHERE id=$1',
    [DESIGN_ID],
  );
  if (!owner.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const userId = Number(owner.rows[0].created_by);

  let result = process.argv.includes('--retry')
    ? await retryStage4PrePilotSizing(userId, DESIGN_ID)
    : await calculateStage4PrePilotSizing(userId, DESIGN_ID);
  let lastProgress = '';
  while (result.status === 'RUNNING') {
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
    result = await getLiveStage4PrePilotSizing(userId, DESIGN_ID);
    const progress = JSON.stringify((result as any).calculation?.progress ?? {});
    if (progress !== lastProgress) {
      console.log('STAGE4_PROGRESS', progress);
      lastProgress = progress;
    }
  }

  // Scientific delivery only: no owner id, database ids, tokens, or lineage
  // hash is emitted by this operational check.
  const physical = (result as any).physicalSizing ?? {};
  const primary = physical.primary?.selected ?? null;
  const sensitivity = physical.sensitivity?.selected ?? null;
  console.log(JSON.stringify({
    status: result.status,
    errorCode: (result as any).calculation?.errorCode ?? null,
    screeningNotice: result.screeningNotice,
    primary: primary && {
      physicalCompartments: primary.physicalCompartments,
      activeHeightM: primary.activeHeightM,
      overallEfficiency: primary.overallEfficiency,
      targetCompliance: primary.targetCompliance,
    },
    sensitivity: sensitivity && {
      physicalCompartments: sensitivity.physicalCompartments,
      activeHeightM: sensitivity.activeHeightM,
      overallEfficiency: sensitivity.overallEfficiency,
      targetCompliance: sensitivity.targetCompliance,
    },
    materiality: physical.materiality ?? null,
    searchTermination: {
      primary: physical.primary?.searchTermination ?? null,
      sensitivity: physical.sensitivity?.searchTermination ?? null,
    },
    physicalCountOutcomes: {
      primary: physical.primary?.physicalCountOutcomes ?? [],
      sensitivity: physical.sensitivity?.physicalCountOutcomes ?? [],
    },
  }, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}