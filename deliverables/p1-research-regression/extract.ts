// Read-only numerical evidence export. No service, optimizer, worker or solver calls.
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { writeFileSync } from 'node:fs';
import { kuhniRunHash } from '../../server/ecr-pre-pilot/kuhni-hydrodynamics';
import { validateStage1Snapshot, makeStage1HydrodynamicProcessBasis } from '../../server/ecr-pre-pilot/stage1';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
try {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const d = (await c.query('SELECT id,project_number,input_data,updated_at FROM ecr_pre_pilot_designs WHERE id=$1', [269])).rows[0];
  if (Number(d?.project_number) !== 236) throw new Error('Project mismatch');
  const snapshot = validateStage1Snapshot(d.input_data);
  const basis = makeStage1HydrodynamicProcessBasis(snapshot);
  const rows = (await c.query(`SELECT id,stage1_snapshot_hash,process_basis,result_snapshot,implementation_hash,immutable_hash,created_at
    FROM ecr_pre_pilot_kuhni_geometry_resolver_runs
    WHERE design_id=$1 AND result_snapshot->>'candidateKind'='RRBO_P1_CANDIDATE_ONLY'
    ORDER BY created_at DESC,id DESC`, [269])).rows;
  const latest = rows.filter((r: any) => r.stage1_snapshot_hash === snapshot.immutableHash);
  const row = latest.find((r: any) => r.result_snapshot.metadata.status === 'completed');
  if (!row) throw new Error('No current-hash completed P1 candidate');
  const payload = row.result_snapshot;
  if (kuhniRunHash({ basis: row.process_basis, payload }) !== row.immutable_hash) throw new Error('Ledger integrity failure');
  const { calculationHash, ...calculation } = payload.result;
  if (kuhniRunHash(calculation) !== calculationHash) throw new Error('Result integrity failure');
  if (kuhniRunHash(basis) !== kuhniRunHash(row.process_basis)) throw new Error('Saved Stage1 scientific basis mismatch');
  if (payload.metadata.sourceSnapshotHash !== snapshot.immutableHash ||
      payload.metadata.implementationHash !== row.implementation_hash ||
      payload.result.engine.implementationHash !== row.implementation_hash) throw new Error('Metadata integrity failure');
  // Whitelist metadata: exclude actor/session information.
  const { session, ...metadata } = payload.metadata;
  const out = {
    extractedAt: new Date().toISOString(), queryMode: 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT; ROLLBACK',
    designId: 269, projectNumber: 236, stage1UpdatedAt: d.updated_at,
    currentStage1Hash: snapshot.immutableHash, stage1Basis: basis,
    ledgerId: row.id, ledgerCreatedAt: row.created_at, ledgerImmutableHash: row.immutable_hash,
    ledgerIntegrityVerified: true, resultIntegrityVerified: true, calculationHash,
    implementationHash: row.implementation_hash, metadata,
    latestCurrentHashLedger: latest.slice(0, 5).map((r: any) => ({id:r.id, candidateId:r.result_snapshot.metadata.id,status:r.result_snapshot.metadata.status})),
    result: payload.result,
  };
  writeFileSync('deliverables/p1-research-regression/integrated-saved-artifact.json', JSON.stringify(out));
  await c.query('ROLLBACK');
  console.log(JSON.stringify({ledgerId:out.ledgerId,candidateId:metadata.id,currentStage1Hash:out.currentStage1Hash,latest:out.latestCurrentHashLedger,integrity:true}));
} finally { c.release(); await pool.end(); }