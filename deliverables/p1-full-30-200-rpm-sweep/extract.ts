/** Explicit SELECT-only transaction; never calls a service or scientific sweep. */
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { existsSync } from 'node:fs';
import { kuhniRunHash } from '../../server/ecr-pre-pilot/kuhni-hydrodynamics';
import { validateStage1Snapshot, makeStage1HydrodynamicProcessBasis } from '../../server/ecr-pre-pilot/stage1';
import { canonicalizeStage3Stage4OptimizerControls, ECR_STAGE3_STAGE4_OPTIMIZER_HASH, ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH, evaluateP1ReviewTrial } from '../../server/ecr-pre-pilot/stage3-stage4-optimizer';
import { dir, read, sha, save, files, orient, key, rrbo } from './common';
if (existsSync(dir + 'input.json')) throw Error('Refusing frozen input overwrite');
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const d = (await c.query('SELECT id,project_number,input_data,updated_at FROM ecr_pre_pilot_designs WHERE id=$1', [269])).rows[0];
  if (Number(d?.project_number) !== 236) throw Error('Project mismatch');
  const snapshot = validateStage1Snapshot(d.input_data);
  const basis = makeStage1HydrodynamicProcessBasis(snapshot);
  const rows = (await c.query(`SELECT id,stage1_snapshot_hash,process_basis,result_snapshot,implementation_hash,immutable_hash,created_at
    FROM ecr_pre_pilot_kuhni_geometry_resolver_runs WHERE design_id=$1
    AND result_snapshot->>'candidateKind'='RRBO_P1_CANDIDATE_ONLY' ORDER BY created_at DESC,id DESC`, [269])).rows;
  const row = rows.find((r: any) => r.stage1_snapshot_hash === snapshot.immutableHash && r.result_snapshot.metadata.status === 'completed');
  if (!row || Number(row.id) !== 69 || row.result_snapshot.metadata.id !== 'b4b44349-5471-4b9c-acf8-d06e2cea8d42') throw Error('Latest saved comparator changed');
  if (snapshot.immutableHash !== '06bb9227b30f1f4c67b3ed557db34f61fe749037addf66163194dd46e2e98c5f' || basis.phaseConfiguration !== rrbo) throw Error('Saved basis changed');
  if (kuhniRunHash({ basis: row.process_basis, payload: row.result_snapshot }) !== row.immutable_hash) throw Error('Ledger integrity');
  const result = row.result_snapshot.result;
  const { calculationHash, ...calculation } = result;
  if (kuhniRunHash(calculation) !== calculationHash || kuhniRunHash(basis) !== kuhniRunHash(row.process_basis)) throw Error('Saved calculation/basis integrity');
  if (row.implementation_hash !== ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH || result.engine.implementationHash !== row.implementation_hash) throw Error('P1 identity changed');
  const previous = read('deliverables/p1-research-regression/integrated-saved-artifact.json');
  if (previous.calculationHash !== calculationHash || previous.currentStage1Hash !== snapshot.immutableHash) throw Error('Prior regression comparator changed');
  const research = read('deliverables/rrbo-stage3-candidate/result.json');
  const researchInput = read('deliverables/rrbo-stage3-candidate/input.json');
  const researchBasis = { ...researchInput.basis, stage1SnapshotHash: basis.stage1SnapshotHash };
  if (kuhniRunHash(researchBasis) !== kuhniRunHash(basis)) throw Error('Original research scientific basis differs');
  const researchManifest = read('deliverables/rrbo-stage3-candidate/manifest.json');
  for (const name of ['result.json', 'input.json', 'scenarios.csv', 'geometry-rpm-grid.csv']) {
    if (sha('deliverables/rrbo-stage3-candidate/' + name) !== researchManifest[name]) throw Error('Original research manifest mismatch: ' + name);
  }
  const groups = orient(result).geometryGrid;
  if (groups.length !== 378 || groups.some((g: any) => g.trials.length !== 9)) throw Error('Comparator grid incomplete');
  const accepted = groups.flatMap((g: any) => g.trials).filter((t: any) => t.status === 'FEASIBLE').length;
  if (accepted !== 158) throw Error('Expected original 158 accepted trials');
  let rejectsExpanded = false;
  try { canonicalizeStage3Stage4OptimizerControls({ rpmMax: 200 }); } catch { rejectsExpanded = true; }
  if (!rejectsExpanded || canonicalizeStage3Stage4OptimizerControls().rpmMax !== 70) throw Error('Production guard changed');
  // Three exact actual-engine probes; not another sweep.
  const target = groups.flatMap((g: any) => g.trials);
  const probes = [target[0], target.find((t: any) => t.status === 'FEASIBLE'), target.at(-1)];
  const probeChecks = probes.map((t: any) => {
    const actual = evaluateP1ReviewTrial(basis, t.diameterM, t.hcToColumn, t.rotorToColumn, t.freeArea, t.rpm);
    if (kuhniRunHash(actual) !== kuhniRunHash(t)) throw Error('Exact overlap probe failed: ' + key(t));
    return { key: key(t), exact: true, scenarios: actual.hydraulicMethod?.scenarios.length };
  });
  const { session, ...metadata } = row.result_snapshot.metadata;
  save('saved-comparator.json', { result, metadata, ledgerId: row.id, ledgerImmutableHash: row.immutable_hash });
  const input = {
    extractedAt: new Date().toISOString(), queryMode: 'REPEATABLE READ READ ONLY; SELECT; ROLLBACK',
    projectNumber: 236, designId: 269, stage1UpdatedAt: d.updated_at, basis,
    currentStage1Hash: snapshot.immutableHash, basisHash: kuhniRunHash(basis), metadata,
    controls: { ...canonicalizeStage3Stage4OptimizerControls(), rpmMax: 200, compareOrientations: false },
    experimentalEnvelope: 'P1_ISOLATED_30_TO_200_STEP_5_V1', candidateOnly: true,
    noAdoption: true, noStage4: true, earlyStop: false, expectedGeometries: 378,
    expectedTrials: 13230, expectedScenarios: 79380, originalAcceptedTrials: accepted,
    provenance: {
      productionImplementationHash: ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
      underlyingP1ImplementationHash: ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH,
      originalOptimizerFileSha256: '7163652f6dec662d15922ac5c2d97906563d394947a1232cdec948760efcf1a5',
      note: 'Only a separate named research export was added. Legacy identities and default controls unchanged. Experimental envelope is NOT the canonical production envelope.',
      codeHashes: Object.fromEntries(files.map(p => [p, sha(p)])),
      comparatorHashes: Object.fromEntries([dir + 'saved-comparator.json', 'deliverables/rrbo-stage3-candidate/result.json', 'deliverables/p1-research-regression/integrated-saved-artifact.json'].map(p => [p, sha(p)])),
    },
    preflight: { productionRejects200: rejectsExpanded, probeChecks, allSixEvenIfTipFails: true, alternateOrientation: 'NOT_REQUESTED_NOT_RUN' },
  };
  save('input.json', input);
  save('input-manifest.json', { inputSha256: sha(dir + 'input.json'), ...input.provenance });
  await c.query('ROLLBACK');
  console.log(JSON.stringify({ status: 'PREPARED_NOT_RUN', geometries: 378, trials: 13230, scenarios: 79380, accepted, probeChecks }));
} finally { c.release(); await pool.end(); }