/**
 * DVS Step 6 — Release Layer — Build Verification + Evidence Script
 *
 * Run: npx tsx server/scripts/test-dvs-step6-evidence.ts
 * Tests: A–U (21 total)
 */

import CFB from 'cfb';
import { createHash } from 'crypto';
import { Client } from 'pg';
import gcsClient, { bucketName } from '../utils/storage-config';

const BASE = 'http://localhost:5000';
const W    = 72;
const HR   = '═'.repeat(W);

// ─── OLE / .slddrw builder (shared with Step 5) ──────────────────────────────
function padTo4(n: number) { return Math.ceil(n / 4) * 4; }
function propLpstr(s: string): Buffer {
  const raw = Buffer.from(s + '\0', 'latin1');
  const buf = Buffer.alloc(4 + 4 + padTo4(raw.length), 0);
  buf.writeUInt32LE(0x001E, 0); buf.writeUInt32LE(raw.length, 4); raw.copy(buf, 8);
  return buf;
}
function buildPropSection(entries: Array<{ id: number; value: Buffer }>): Buffer {
  const hSize = 8 + entries.length * 8;
  let offset = hSize;
  const offsets = entries.map(e => { const o = offset; offset += e.value.length; return o; });
  const buf = Buffer.alloc(offset, 0);
  buf.writeUInt32LE(offset, 0); buf.writeUInt32LE(entries.length, 4);
  entries.forEach((e, i) => { buf.writeUInt32LE(e.id, 8+i*8); buf.writeUInt32LE(offsets[i], 8+i*8+4); });
  let pos = hSize;
  for (const e of entries) { e.value.copy(buf, pos); pos += e.value.length; }
  return buf;
}
function buildPropSectionH1(fmtidHex: string, sectionOffset: number): Buffer {
  const h = Buffer.alloc(48, 0);
  h.writeUInt16LE(0xFFFE, 0); h.writeUInt32LE(0x00020006, 4); h.writeUInt32LE(1, 24);
  Buffer.from(fmtidHex, 'hex').copy(h, 28); h.writeUInt32LE(sectionOffset, 44);
  return h;
}
function buildPropSectionH2(f0: string, o0: number, f1: string, o1: number): Buffer {
  const h = Buffer.alloc(68, 0);
  h.writeUInt16LE(0xFFFE, 0); h.writeUInt32LE(0x00020006, 4); h.writeUInt32LE(2, 24);
  Buffer.from(f0, 'hex').copy(h, 28); h.writeUInt32LE(o0, 44);
  Buffer.from(f1, 'hex').copy(h, 48); h.writeUInt32LE(o1, 64);
  return h;
}
function buildDictionary(nameMap: Record<number, string>): Buffer {
  const entries = Object.entries(nameMap).map(([pid, name]) => ({ pid: +pid, name }));
  let size = 4;
  for (const e of entries) size += 4 + 4 + padTo4(Buffer.byteLength(e.name + '\0', 'latin1'));
  const buf = Buffer.alloc(size, 0);
  buf.writeUInt32LE(entries.length, 0);
  let pos = 4;
  for (const e of entries) {
    const nb = Buffer.from(e.name + '\0', 'latin1');
    buf.writeUInt32LE(e.pid, pos); buf.writeUInt32LE(nb.length, pos + 4); nb.copy(buf, pos + 8);
    pos += 4 + 4 + padTo4(nb.length);
  }
  return buf;
}
const SI = 'e0859ff2f94f6810ab9108002b27b3d9';
const D0 = '02d5cdd59c2e1b10939708002b2cf9ae';
const D1 = '05d5cdd59c2e1b10939708002b2cf9ae';
function buildSlddrw(o: { drawingNumber: string; revision: string; title: string; author: string; scale?: string; sheetSize?: string; description?: string }): Buffer {
  const { drawingNumber, revision, title, author, scale = '1:10', sheetSize = 'A3', description = '' } = o;
  const siSec = buildPropSection([{id:2,value:propLpstr(title)},{id:4,value:propLpstr(author)},{id:8,value:propLpstr(author)},{id:9,value:propLpstr(revision)},{id:18,value:propLpstr('SOLIDWORKS')}]);
  const siStream = Buffer.concat([buildPropSectionH1(SI, 48), siSec]);
  const dsi0 = buildPropSection([{ id: 15, value: propLpstr('THERMOPAC') }]);
  const dict = buildDictionary({ 2: 'DrawingNumber', 3: 'Revision', 4: 'DrawnBy', 5: 'Scale', 6: 'SheetSize', 7: 'Description' });
  const dsi1 = buildPropSection([{id:0,value:dict},{id:2,value:propLpstr(drawingNumber)},{id:3,value:propLpstr(revision)},{id:4,value:propLpstr(author)},{id:5,value:propLpstr(scale)},{id:6,value:propLpstr(sheetSize)},{id:7,value:propLpstr(description)}]);
  const dsiStream = Buffer.concat([buildPropSectionH2(D0, 68, D1, 68 + dsi0.length), dsi0, dsi1]);
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, '/\x05SummaryInformation', siStream);
  CFB.utils.cfb_add(cfb, '/\x05DocumentSummaryInformation', dsiStream);
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }) as Uint8Array);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function loginAs(username: string, password: string): Promise<string> {
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }), redirect: 'manual',
  });
  const cookie = (r.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error(`Login failed for ${username}: HTTP ${r.status}`);
  return cookie;
}
async function uploadRevision(pg: Client, opts: { projectId: number; projectCode: string; drawingNumber: string; revision: string; title: string; fileBuffer: Buffer }): Promise<number> {
  const { projectId, projectCode, drawingNumber, revision, title, fileBuffer } = opts;
  const checksum = createHash('sha256').update(fileBuffer).digest('hex');
  const filename = `${drawingNumber}-rev${revision}.slddrw`;
  const gcsPath  = `TPEL/STAGING/DRAWINGS/${projectCode}/${drawingNumber}/rev-${revision}/original/${filename}`;
  await gcsClient.bucket(bucketName).file(gcsPath).save(fileBuffer, { metadata: { contentType: 'application/octet-stream' } });
  const res = await pg.query(
    `INSERT INTO drawing_revisions(project_id,project_code,drawing_number,revision,title,item_code,discipline,file_type,checksum,storage_zone,uploaded_by,uploaded_at,original_filename,gcs_staging_path,file_size_bytes,status)VALUES($1,$2,$3,$4,$5,NULL,NULL,'slddrw',$6,'STAGING','evidence-script',NOW(),$7,$8,$9,'uploaded')RETURNING id`,
    [projectId, projectCode, drawingNumber, revision, title, checksum, filename, gcsPath, fileBuffer.length]);
  return res.rows[0].id;
}
async function api(cookie: string, method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  const opts: RequestInit = { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const b = await r.json().catch(() => ({}));
  return { status: r.status, body: b };
}
async function pipeline(cookie: string, id: number) {
  await api(cookie, 'POST', `/api/drawing-revisions/${id}/extract`);
  await api(cookie, 'POST', `/api/drawing-revisions/${id}/evaluate`);
}
async function pipelineAndApprove(cookie: string, id: number, comments?: string) {
  await pipeline(cookie, id);
  await api(cookie, 'POST', `/api/drawing-revisions/${id}/approve`,
    { decision: 'APPROVED', ...(comments ? { comments } : {}) });
}

let pass = 0, fail = 0;
function assert(label: string, ok: boolean, detail?: any) {
  if (ok) { console.log(`  ✅  ${label}`); pass++; }
  else    { console.log(`  ❌  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); fail++; }
}
function field(label: string, value: any) {
  const s = typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
  console.log(`  ${label.padEnd(36)} ${s}`);
}
function section(title: string) { console.log('\n' + HR); console.log(`  ${title}`); console.log(HR); }
function note(msg: string) { console.log(`\n  ${msg}`); }

const createdIds: number[] = [];
const controlledPaths: string[] = [];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(HR);
  console.log('  DVS STEP 6 — RELEASE LAYER — BUILD VERIFICATION');
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log(HR + '\n');

  const pg     = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const cookie = await loginAs('dvs_test_user', 'TestPass@DVS1');
  console.log('  Authenticated as dvs_test_user (Manager) ✅\n');

  const PID = 30, CODE = '2627-013';

  // ── Provision test revisions ──────────────────────────────────────────────
  const files = {
    main:          buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-060', revision: 'A', title: 'Inlet Nozzle',     author: 'A. Patel', scale: '1:10', sheetSize: 'A2', description: 'Inlet nozzle detail' }),
    uploaded:      buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-061', revision: 'A', title: 'Outlet Nozzle',    author: 'A. Patel', scale: '1:5',  sheetSize: 'A3', description: 'Outlet nozzle detail' }),
    evaluated:     buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-062', revision: 'A', title: 'Support Plate',    author: 'A. Patel', scale: '1:2',  sheetSize: 'A2', description: 'Support plate detail' }),
    noApproval:    buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-063', revision: 'A', title: 'Cover Plate',      author: 'A. Patel', scale: '1:1',  sheetSize: 'A4', description: 'Cover plate detail' }),
    staleApproval: buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-064', revision: 'A', title: 'Manhole Cover',    author: 'A. Patel', scale: '1:10', sheetSize: 'A2', description: 'Manhole cover detail' }),
    missingFile:   buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-065', revision: 'A', title: 'Drain Nozzle',     author: 'A. Patel', scale: '1:5',  sheetSize: 'A3', description: 'Drain nozzle detail' }),
    badChecksum:   buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-066', revision: 'A', title: 'Vent Nozzle',      author: 'A. Patel', scale: '1:2',  sheetSize: 'A2', description: 'Vent nozzle detail' }),
    recovery:      buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-067', revision: 'A', title: 'Sight Glass',      author: 'A. Patel', scale: '1:1',  sheetSize: 'A4', description: 'Sight glass detail' }),
  };

  const revMain          = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-060', revision: 'A', title: 'Inlet Nozzle',  fileBuffer: files.main });
  const revUploaded      = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-061', revision: 'A', title: 'Outlet Nozzle', fileBuffer: files.uploaded });
  const revEvaluated     = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-062', revision: 'A', title: 'Support Plate', fileBuffer: files.evaluated });
  const revNoApproval    = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-063', revision: 'A', title: 'Cover Plate',   fileBuffer: files.noApproval });
  const revStaleApproval = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-064', revision: 'A', title: 'Manhole Cover', fileBuffer: files.staleApproval });
  const revMissingFile   = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-065', revision: 'A', title: 'Drain Nozzle',  fileBuffer: files.missingFile });
  const revBadChecksum   = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-066', revision: 'A', title: 'Vent Nozzle',   fileBuffer: files.badChecksum });
  const revRecovery      = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-067', revision: 'A', title: 'Sight Glass',   fileBuffer: files.recovery });
  createdIds.push(revMain, revUploaded, revEvaluated, revNoApproval, revStaleApproval, revMissingFile, revBadChecksum, revRecovery);
  console.log(`  revMain=${revMain} revUploaded=${revUploaded} revEvaluated=${revEvaluated}`);
  console.log(`  revNoApproval=${revNoApproval} revStaleApproval=${revStaleApproval}`);
  console.log(`  revMissingFile=${revMissingFile} revBadChecksum=${revBadChecksum} revRecovery=${revRecovery}\n`);

  // Pipeline each revision to the correct state for each guard test
  await pipeline(cookie, revEvaluated);                             // B: evaluated, not approved
  await pipeline(cookie, revNoApproval);                            // C: will manually set status=approved
  await pipelineAndApprove(cookie, revStaleApproval);               // D: approved → poison rule_evaluation_id
  await pipelineAndApprove(cookie, revMissingFile);                 // E: approved → delete GCS file
  await pipelineAndApprove(cookie, revBadChecksum);                 // F: approved → poison checksum
  await pipelineAndApprove(cookie, revMain);                        // H–R: main success test
  await pipelineAndApprove(cookie, revRecovery);                    // N: recovery test

  // Test C setup: force status='approved' with no approval record
  await pg.query(`UPDATE drawing_revisions SET status='approved' WHERE id=$1`, [revNoApproval]);

  // Test D setup: poison approval's rule_evaluation_id to a foreign eval
  const evalMain   = (await pg.query('SELECT id FROM rule_evaluations WHERE drawing_revision_id=$1', [revMain])).rows[0];
  const evalStale  = (await pg.query('SELECT id FROM rule_evaluations WHERE drawing_revision_id=$1', [revStaleApproval])).rows[0];
  await pg.query(`UPDATE drawing_approvals SET rule_evaluation_id=$1 WHERE drawing_revision_id=$2`, [evalMain.id, revStaleApproval]);
  note(`Test D: approval for revStaleApproval poisoned → points to eval ${evalMain.id} (from revMain) but current is ${evalStale.id}`);

  // Test E setup: delete GCS STAGING file for revMissingFile
  const missingFileRow = (await pg.query('SELECT gcs_staging_path FROM drawing_revisions WHERE id=$1', [revMissingFile])).rows[0];
  await gcsClient.bucket(bucketName).file(missingFileRow.gcs_staging_path).delete();
  note(`Test E: deleted GCS STAGING file: ${missingFileRow.gcs_staging_path}`);

  // Test F setup: poison checksum in drawing_revisions
  await pg.query(`UPDATE drawing_revisions SET checksum='0000000000000000000000000000000000000000000000000000000000000000' WHERE id=$1`, [revBadChecksum]);
  note(`Test F: poisoned checksum for revBadChecksum=${revBadChecksum}`);

  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST A — Guard: status 'uploaded' → 422 status_not_eligible
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST A — Guard: status "uploaded" → 422 status_not_eligible');
  const rA = await api(cookie, 'POST', `/api/drawing-revisions/${revUploaded}/release`, {});
  field('HTTP status', rA.status);
  field('error',       rA.body.error);
  field('reason',      rA.body.reason);
  assert('HTTP 422',                     rA.status === 422);
  assert('error = TRIGGER_GUARD_FAILED', rA.body.error === 'TRIGGER_GUARD_FAILED');
  assert('reason = status_not_eligible', rA.body.reason === 'status_not_eligible');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST B — Guard: status 'evaluated' → 422 status_not_eligible
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST B — Guard: status "evaluated" (not approved) → 422 status_not_eligible');
  const statusB = (await pg.query('SELECT status FROM drawing_revisions WHERE id=$1', [revEvaluated])).rows[0].status;
  note(`revEvaluated status: "${statusB}" (must be evaluated)`);
  const rB = await api(cookie, 'POST', `/api/drawing-revisions/${revEvaluated}/release`, {});
  field('HTTP status', rB.status);
  field('error',       rB.body.error);
  field('reason',      rB.body.reason);
  assert('HTTP 422',                     rB.status === 422);
  assert('error = TRIGGER_GUARD_FAILED', rB.body.error === 'TRIGGER_GUARD_FAILED');
  assert('reason = status_not_eligible', rB.body.reason === 'status_not_eligible');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST C — Guard: status 'approved', no approval record → 422 no_approval_record
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST C — Guard: status "approved", no approval record → 422 no_approval_record');
  const statusC = (await pg.query('SELECT status FROM drawing_revisions WHERE id=$1', [revNoApproval])).rows[0].status;
  const approvalCountC = (await pg.query('SELECT COUNT(*) FROM drawing_approvals WHERE drawing_revision_id=$1', [revNoApproval])).rows[0].count;
  note(`revNoApproval status="${statusC}"  approval_count=${approvalCountC}`);
  const rC = await api(cookie, 'POST', `/api/drawing-revisions/${revNoApproval}/release`, {});
  field('HTTP status', rC.status);
  field('error',       rC.body.error);
  field('reason',      rC.body.reason);
  assert('HTTP 422',                    rC.status === 422);
  assert('error = NO_APPROVAL_RECORD',  rC.body.error === 'NO_APPROVAL_RECORD');
  assert('reason = approval_required',  rC.body.reason === 'approval_required');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST D — Guard: approval references superseded evaluation → 422 APPROVAL_STALE
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST D — Guard: approval stale (evaluation superseded) → 422 APPROVAL_STALE');
  const approvalD = (await pg.query('SELECT rule_evaluation_id FROM drawing_approvals WHERE drawing_revision_id=$1', [revStaleApproval])).rows[0];
  note(`Approval references eval id ${approvalD.rule_evaluation_id} but current eval is ${evalStale.id}`);
  const rD = await api(cookie, 'POST', `/api/drawing-revisions/${revStaleApproval}/release`, {});
  field('HTTP status', rD.status);
  field('error',       rD.body.error);
  field('reason',      rD.body.reason);
  field('detail',      rD.body.detail);
  assert('HTTP 422',                       rD.status === 422);
  assert('error = APPROVAL_STALE',         rD.body.error === 'APPROVAL_STALE');
  assert('reason = evaluation_superseded', rD.body.reason === 'evaluation_superseded');
  assert('detail names stale eval id',     String(rD.body.detail ?? '').includes(String(approvalD.rule_evaluation_id)));
  assert('detail names current eval id',   String(rD.body.detail ?? '').includes(String(evalStale.id)));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST E — Guard: STAGING file absent → 422 SOURCE_FILE_MISSING
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST E — Guard: STAGING file absent → 422 SOURCE_FILE_MISSING');
  const rE = await api(cookie, 'POST', `/api/drawing-revisions/${revMissingFile}/release`, {});
  field('HTTP status', rE.status);
  field('error',       rE.body.error);
  field('reason',      rE.body.reason);
  assert('HTTP 422',                      rE.status === 422);
  assert('error = SOURCE_FILE_MISSING',   rE.body.error === 'SOURCE_FILE_MISSING');
  assert('reason = staging_file_not_found', rE.body.reason === 'staging_file_not_found');
  assert('detail contains staging path',  String(rE.body.detail ?? '').includes('TPEL/STAGING'));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST F — Guard: checksum mismatch → 422 FILE_INTEGRITY_FAILED
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST F — Guard: checksum mismatch → 422 FILE_INTEGRITY_FAILED');
  const expectedChecksum = '0000000000000000000000000000000000000000000000000000000000000000';
  const rF = await api(cookie, 'POST', `/api/drawing-revisions/${revBadChecksum}/release`, {});
  field('HTTP status', rF.status);
  field('error',       rF.body.error);
  field('reason',      rF.body.reason);
  field('detail',      rF.body.detail);
  assert('HTTP 422',                       rF.status === 422);
  assert('error = FILE_INTEGRITY_FAILED',  rF.body.error === 'FILE_INTEGRITY_FAILED');
  assert('reason = checksum_mismatch',     rF.body.reason === 'checksum_mismatch');
  assert('detail contains expected hash',  String(rF.body.detail ?? '').includes(expectedChecksum));
  assert('detail contains computed hash',  String(rF.body.detail ?? '').includes('computed:'));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST G — Guard: Employee role → 403 FORBIDDEN
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST G — Guard: unauthorized role (Employee) → 403 FORBIDDEN');
  const originalRole = (await pg.query('SELECT role FROM users WHERE username=$1', ['dvs_test_user'])).rows[0].role;
  await pg.query(`UPDATE users SET role='Employee' WHERE username='dvs_test_user'`);
  const empCookie = await loginAs('dvs_test_user', 'TestPass@DVS1');
  const rG = await api(empCookie, 'POST', `/api/drawing-revisions/${revMain}/release`, {});
  await pg.query(`UPDATE users SET role=$1 WHERE username='dvs_test_user'`, [originalRole]);
  field('HTTP status', rG.status);
  field('error',       rG.body.error);
  field('reason',      rG.body.reason);
  field('detail',      rG.body.detail);
  assert('HTTP 403',                   rG.status === 403);
  assert('error = FORBIDDEN',          rG.body.error === 'FORBIDDEN');
  assert('reason = insufficient_role', rG.body.reason === 'insufficient_role');
  note('Role restored to Manager ✅');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST H — Full release success — HTTP 200, all fields confirmed
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST H — Full release success — HTTP 200, all response fields confirmed');
  const statusBeforeH = (await pg.query('SELECT status, storage_zone FROM drawing_revisions WHERE id=$1', [revMain])).rows[0];
  note(`status BEFORE: "${statusBeforeH.status}"  zone: "${statusBeforeH.storage_zone}"`);

  const rH = await api(cookie, 'POST', `/api/drawing-revisions/${revMain}/release`, { releaseNotes: null });
  console.log('');
  field('HTTP status',            rH.status);
  field('id',                     rH.body.id);
  field('drawing_revision_id',    rH.body.drawingRevisionId);
  field('drawing_approval_id',    rH.body.drawingApprovalId);
  field('rule_evaluation_id',     rH.body.ruleEvaluationId);
  field('released_by',            rH.body.releasedBy);
  field('released_at',            rH.body.releasedAt);
  field('verdict_at_release',     rH.body.verdictAtRelease);
  field('approved_by_snapshot',   rH.body.approvedBySnapshot);
  field('decided_at_snapshot',    rH.body.decidedAtSnapshot);
  field('checksum_at_release',    rH.body.checksumAtRelease);
  field('gcs_controlled_path',    rH.body.gcsControlledPath);
  field('gcs_release_pdf_path',   rH.body.gcsReleasePdfPath);
  field('release_notes',          rH.body.releaseNotes);

  const releaseId = rH.body.id;
  controlledPaths.push(rH.body.gcsControlledPath, rH.body.gcsReleasePdfPath);

  assert('\nHTTP 200',                               rH.status === 200);
  assert('id is a number',                           typeof releaseId === 'number');
  assert('drawing_revision_id = revMain',            rH.body.drawingRevisionId === revMain);
  assert('released_by = dvs_test_user',              rH.body.releasedBy === 'dvs_test_user');
  assert('released_at is present (server-set)',      typeof rH.body.releasedAt === 'string');
  assert('verdict_at_release = PASS',                rH.body.verdictAtRelease === 'PASS');
  assert('approved_by_snapshot = dvs_test_user',     rH.body.approvedBySnapshot === 'dvs_test_user');
  assert('checksum_at_release present (64 chars)',   typeof rH.body.checksumAtRelease === 'string' && rH.body.checksumAtRelease.length === 64);
  assert('gcs_controlled_path contains CONTROLLED',  String(rH.body.gcsControlledPath ?? '').includes('CONTROLLED'));
  assert('gcs_release_pdf_path contains CONTROLLED', String(rH.body.gcsReleasePdfPath ?? '').includes('CONTROLLED'));
  assert('gcs_release_pdf_path ends .pdf',           String(rH.body.gcsReleasePdfPath ?? '').endsWith('.pdf'));
  assert('release_notes = null',                     rH.body.releaseNotes === null);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST I — status → 'released', storage_zone → 'CONTROLLED' in DB
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST I — status → "released", storage_zone → "CONTROLLED" confirmed in DB');
  const afterI = (await pg.query('SELECT status, storage_zone FROM drawing_revisions WHERE id=$1', [revMain])).rows[0];
  field('DB status',       afterI.status);
  field('DB storage_zone', afterI.storage_zone);
  assert('status = released',         afterI.status === 'released');
  assert('storage_zone = CONTROLLED', afterI.storage_zone === 'CONTROLLED');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST J — PDF artifact exists in GCS CONTROLLED path
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST J — PDF artifact exists in GCS at expected CONTROLLED path');
  const [pdfExists] = await gcsClient.bucket(bucketName).file(rH.body.gcsReleasePdfPath).exists();
  field('GCS PDF path', rH.body.gcsReleasePdfPath);
  field('exists',       pdfExists);
  assert('PDF file exists in GCS CONTROLLED zone', pdfExists);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST K — Original file exists in GCS CONTROLLED path
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST K — Original file exists in GCS CONTROLLED path');
  const [origExists] = await gcsClient.bucket(bucketName).file(rH.body.gcsControlledPath).exists();
  field('GCS original path', rH.body.gcsControlledPath);
  field('exists',            origExists);
  assert('Original file exists in GCS CONTROLLED zone', origExists);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST L — Original file deleted from GCS STAGING
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST L — Original file deleted from GCS STAGING path after release');
  await new Promise(r => setTimeout(r, 1500)); // allow async delete to settle
  const stagingRowL = (await pg.query('SELECT gcs_staging_path FROM drawing_revisions WHERE id=$1', [revMain])).rows[0];
  const [stagingExists] = await gcsClient.bucket(bucketName).file(stagingRowL.gcs_staging_path).exists();
  field('GCS STAGING path',  stagingRowL.gcs_staging_path);
  field('still exists',      stagingExists);
  assert('STAGING file deleted after release', !stagingExists);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST M — Immutability: second POST → 409 ALREADY_RELEASED, no GCS ops
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST M — Immutability: second POST → 409 ALREADY_RELEASED; no GCS operations');
  const rM = await api(cookie, 'POST', `/api/drawing-revisions/${revMain}/release`, {});
  field('HTTP status', rM.status);
  field('error',       rM.body.error);
  field('reason',      rM.body.reason);
  field('detail',      rM.body.detail);
  assert('HTTP 409',                       rM.status === 409);
  assert('error = ALREADY_RELEASED',       rM.body.error === 'ALREADY_RELEASED');
  assert('reason = release_immutable',     rM.body.reason === 'release_immutable');
  assert('detail contains releasedBy',     String(rM.body.detail ?? '').includes('dvs_test_user'));
  assert('detail contains releasedAt ISO', String(rM.body.detail ?? '').includes('2026-'));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST N — Recovery rule: release row present, status/zone inconsistent
  //          → Guard 4 repairs status+zone atomically, returns 409
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST N — Recovery rule: release row present, status inconsistent → Guard 4 repairs + 409');
  // First, do the successful release on revRecovery
  const rNrelease = await api(cookie, 'POST', `/api/drawing-revisions/${revRecovery}/release`, {});
  controlledPaths.push(rNrelease.body.gcsControlledPath, rNrelease.body.gcsReleasePdfPath);
  note(`Recovery revision release result: HTTP ${rNrelease.status}  id=${rNrelease.body.id}`);
  assert('revRecovery released successfully', rNrelease.status === 200);

  // Simulate Step 5 failure: revert status and zone
  await pg.query(`UPDATE drawing_revisions SET status='approved', storage_zone='STAGING' WHERE id=$1`, [revRecovery]);
  const beforeRepair = (await pg.query('SELECT status, storage_zone FROM drawing_revisions WHERE id=$1', [revRecovery])).rows[0];
  note(`After simulated Step-5 failure: status="${beforeRepair.status}"  zone="${beforeRepair.storage_zone}"`);

  // Now retry → Guard 4 should detect release row, repair, return 409
  const rN = await api(cookie, 'POST', `/api/drawing-revisions/${revRecovery}/release`, {});
  const afterRepair = (await pg.query('SELECT status, storage_zone FROM drawing_revisions WHERE id=$1', [revRecovery])).rows[0];
  note(`After Guard-4 recovery: status="${afterRepair.status}"  zone="${afterRepair.storage_zone}"`);

  field('HTTP status',            rN.status);
  field('error',                  rN.body.error);
  assert('\nHTTP 409',                          rN.status === 409);
  assert('error = ALREADY_RELEASED',            rN.body.error === 'ALREADY_RELEASED');
  assert('status repaired to "released"',       afterRepair.status === 'released');
  assert('storage_zone repaired to CONTROLLED', afterRepair.storage_zone === 'CONTROLLED');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST O — Concurrency: 23505 catch block + UNIQUE index confirmed
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST O — Concurrency: 23505 catch block present; UNIQUE index confirmed');
  const { readFileSync } = await import('fs');
  const src = readFileSync('server/drawing-verification-routes.ts', 'utf-8');
  const catchStart = src.indexOf('// 23505 = unique_violation (concurrent release race)');
  const catchEnd   = src.indexOf('throw dbErr;', catchStart) + 'throw dbErr;'.length + 2;
  const catchBlock = src.slice(catchStart, catchEnd).trim();
  console.log('');
  for (const l of catchBlock.split('\n')) console.log(`  ${l}`);
  const idxRow = (await pg.query(`SELECT indexname FROM pg_indexes WHERE tablename='drawing_releases' AND indexname='uq_drawing_release_revision'`)).rows;
  assert('\n23505 catch block present',             catchBlock.includes("dbErr.code === '23505'"));
  assert('returns 409 on 23505',                    catchBlock.includes('status(409)'));
  assert('UNIQUE index uq_drawing_release_revision', idxRow.length === 1);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST P — released_by and released_at are server-set (not client-supplied)
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST P — released_by and released_at are server-set');
  const insertBlock = src.slice(src.indexOf('// ── COMMIT POINT'), src.indexOf('} catch (dbErr', src.indexOf('// ── COMMIT POINT')));
  const hasReleasedBy   = insertBlock.includes('releasedBy:') && insertBlock.includes('caller');
  const hasReleasedAt   = insertBlock.includes('releasedAt,') || insertBlock.includes('releasedAt:');
  const noClientSupplied = !insertBlock.includes('req.body.releasedBy') && !insertBlock.includes('req.body.releasedAt');
  console.log('');
  console.log('  Relevant INSERT values:');
  for (const l of insertBlock.split('\n').filter(l => l.includes('releasedBy') || l.includes('releasedAt') || l.includes('caller'))) {
    console.log(`    ${l.trim()}`);
  }
  assert('\nreleasedBy set from server caller',    hasReleasedBy);
  assert('releasedAt set from server new Date()', hasReleasedAt);
  assert('no client-supplied released_by/at',     noClientSupplied);

  const dbRelP = (await pg.query('SELECT released_by, released_at FROM drawing_releases WHERE drawing_revision_id=$1', [revMain])).rows[0];
  assert('DB released_by = dvs_test_user', dbRelP.released_by === 'dvs_test_user');
  assert('DB released_at is a timestamp',  dbRelP.released_at instanceof Date);
  field('\nLive released_by',  dbRelP.released_by);
  field('Live released_at',    dbRelP.released_at.toISOString());

  // ══════════════════════════════════════════════════════════════════════════
  // TEST Q — verdict_at_release matches rule_evaluations.overallVerdict
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST Q — verdict_at_release matches rule_evaluations.overallVerdict at write time');
  const dbRelQ = (await pg.query('SELECT verdict_at_release, rule_evaluation_id FROM drawing_releases WHERE drawing_revision_id=$1', [revMain])).rows[0];
  const dbEvalQ = (await pg.query('SELECT overall_verdict FROM rule_evaluations WHERE id=$1', [dbRelQ.rule_evaluation_id])).rows[0];
  field('DB release.verdict_at_release',        dbRelQ.verdict_at_release);
  field('DB rule_evaluation.overall_verdict',   dbEvalQ.overall_verdict);
  assert('verdict_at_release matches rule_evaluations.overall_verdict',
    dbRelQ.verdict_at_release === dbEvalQ.overall_verdict);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST R — checksum_at_release in DB matches drawing_revisions.checksum
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST R — checksum_at_release matches drawing_revisions.checksum');
  const dbRelR = (await pg.query('SELECT checksum_at_release FROM drawing_releases WHERE drawing_revision_id=$1', [revMain])).rows[0];
  const dbRevR = (await pg.query('SELECT checksum FROM drawing_revisions WHERE id=$1', [revMain])).rows[0];
  field('DB release.checksum_at_release',  dbRelR.checksum_at_release);
  field('DB revision.checksum',            dbRevR.checksum);
  assert('checksum_at_release = drawing_revisions.checksum',
    dbRelR.checksum_at_release === dbRevR.checksum);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST S — PDF traceability block: release id, rule_evaluation_id, SHA-256
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST S — PDF traceability block: release id, rule evaluation id, SHA-256');
  const pdfPathS = rH.body.gcsReleasePdfPath;
  const [pdfDownload] = await gcsClient.bucket(bucketName).file(pdfPathS).download();
  const pdfBuf = pdfDownload as Buffer;
  const pdfStr = pdfBuf.toString('latin1');
  note(`PDF size: ${pdfBuf.length} bytes  path: ${pdfPathS}`);
  field('PDF magic bytes', pdfBuf.slice(0, 4).toString('ascii'));
  const releaseIdStr   = String(releaseId);
  const evalIdStr      = String(rH.body.ruleEvaluationId);
  const checksumStr    = rH.body.checksumAtRelease;

  // pdf-lib stores Info-dictionary strings as ASCII hex text inside < >, e.g.:
  //   /Keywords <FEFF00720065006C...003A00340032>
  // The hex digits use UPPERCASE (A–F).  Content streams are deflate-compressed
  // so text there is NOT searchable in the raw file.
  // Strategy: pdfStr is the latin1 view of the raw file bytes (the hex chars are
  // printable ASCII, so they appear verbatim).  We convert each search token to
  // its UTF-16BE ASCII-hex representation (uppercase) and search pdfStr directly.
  function utf16BeHex(s: string): string {
    return Array.from(s).map(c => c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()).join('');
  }

  assert('PDF starts with %PDF header',                     pdfStr.startsWith('%PDF'));
  assert('Release ID in PDF info-dictionary (UTF-16BE)',    pdfStr.includes(utf16BeHex(`releaseId:${releaseIdStr}`)));
  assert('Rule Evaluation ID in PDF info-dictionary',       pdfStr.includes(utf16BeHex(`evalId:${evalIdStr}`)));
  assert('SHA-256 checksum in PDF info-dictionary',         pdfStr.includes(utf16BeHex(`sha256:${checksumStr.slice(0, 16)}`)));
  assert('Drawing number in PDF info-dictionary',           pdfStr.includes(utf16BeHex('TPEL-2627-013-ME-060')));
  assert('"CONTROLLED RELEASE CERTIFICATE" in PDF metadata', pdfStr.includes(utf16BeHex('CONTROLLED RELEASE CERTIFICATE')));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST T — GET /:id/release → 200 with full record
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST T — GET /:id/release → 200 with full record');
  const rT = await api(cookie, 'GET', `/api/drawing-revisions/${revMain}/release`);
  console.log('');
  field('HTTP status',           rT.status);
  field('id',                    rT.body.id);
  field('drawing_revision_id',   rT.body.drawingRevisionId);
  field('released_by',           rT.body.releasedBy);
  field('released_at',           rT.body.releasedAt);
  field('verdict_at_release',    rT.body.verdictAtRelease);
  field('checksum_at_release',   rT.body.checksumAtRelease);
  field('gcs_controlled_path',   rT.body.gcsControlledPath);
  field('gcs_release_pdf_path',  rT.body.gcsReleasePdfPath);
  assert('\nHTTP 200',                      rT.status === 200);
  assert('id present',                      typeof rT.body.id === 'number');
  assert('released_by = dvs_test_user',     rT.body.releasedBy === 'dvs_test_user');
  assert('verdict_at_release = PASS',       rT.body.verdictAtRelease === 'PASS');
  assert('gcs_controlled_path present',     typeof rT.body.gcsControlledPath === 'string');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST U — GET /:id/release → 404 when no record
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST U — GET /:id/release → 404 when no record');
  const rU = await api(cookie, 'GET', `/api/drawing-revisions/${revUploaded}/release`);
  field('HTTP status', rU.status);
  field('error',       rU.body.error);
  assert('HTTP 404',                    rU.status === 404);
  assert('descriptive error message',   typeof rU.body.error === 'string' && rU.body.error.length > 10);

  // ══════════════════════════════════════════════════════════════════════════
  // Cleanup — FK-safe order
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n' + HR);
  console.log('  CLEANUP');
  console.log(HR);
  await pg.query('DELETE FROM drawing_releases  WHERE drawing_revision_id=ANY($1)', [createdIds]);
  await pg.query('DELETE FROM drawing_approvals WHERE drawing_revision_id=ANY($1)', [createdIds]);
  await pg.query('DELETE FROM agent_reports     WHERE drawing_revision_id=ANY($1)', [createdIds]);
  await pg.query('DELETE FROM rule_evaluations  WHERE drawing_revision_id=ANY($1)', [createdIds]);
  await pg.query('DELETE FROM drawing_extractions WHERE drawing_revision_id=ANY($1)', [createdIds]);
  for (const rid of createdIds) {
    const row = (await pg.query('SELECT gcs_staging_path FROM drawing_revisions WHERE id=$1', [rid])).rows[0];
    if (row) {
      await gcsClient.bucket(bucketName).file(row.gcs_staging_path).delete().catch(() => {});
    }
    await pg.query('DELETE FROM drawing_revisions WHERE id=$1', [rid]);
    console.log(`  Removed revision id=${rid}`);
  }
  // Clean CONTROLLED files
  for (const cp of controlledPaths.filter(Boolean)) {
    await gcsClient.bucket(bucketName).file(cp).delete().catch(() => {});
    console.log(`  Removed CONTROLLED: ${cp}`);
  }
  await pg.end();

  // ══════════════════════════════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n' + HR);
  console.log(`  FINAL RESULT: ${pass} passed, ${fail} failed`);
  console.log(HR);
  if (fail > 0) process.exit(1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
