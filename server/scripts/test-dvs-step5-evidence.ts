/**
 * DVS Step 5 — Build Verification + Evidence Script
 *
 * Run: npx tsx server/scripts/test-dvs-step5-evidence.ts
 */

import CFB from 'cfb';
import { createHash } from 'crypto';
import { Client } from 'pg';
import gcsClient, { bucketName } from '../utils/storage-config';

const BASE = 'http://localhost:5000';
const W    = 72;
const HR   = '═'.repeat(W);
const hr   = '─'.repeat(W);

// ─── OLE builder ─────────────────────────────────────────────────────────────
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
function buildHeader1(fmtidHex: string, sectionOffset: number): Buffer {
  const h = Buffer.alloc(48, 0);
  h.writeUInt16LE(0xFFFE, 0); h.writeUInt32LE(0x00020006, 4); h.writeUInt32LE(1, 24);
  Buffer.from(fmtidHex, 'hex').copy(h, 28); h.writeUInt32LE(sectionOffset, 44);
  return h;
}
function buildHeader2(f0: string, o0: number, f1: string, o1: number): Buffer {
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
  const siStream = Buffer.concat([buildHeader1(SI, 48), siSec]);
  const dsi0 = buildPropSection([{ id: 15, value: propLpstr('THERMOPAC') }]);
  const dict = buildDictionary({ 2: 'DrawingNumber', 3: 'Revision', 4: 'DrawnBy', 5: 'Scale', 6: 'SheetSize', 7: 'Description' });
  const dsi1 = buildPropSection([{id:0,value:dict},{id:2,value:propLpstr(drawingNumber)},{id:3,value:propLpstr(revision)},{id:4,value:propLpstr(author)},{id:5,value:propLpstr(scale)},{id:6,value:propLpstr(sheetSize)},{id:7,value:propLpstr(description)}]);
  const dsiStream = Buffer.concat([buildHeader2(D0, 68, D1, 68 + dsi0.length), dsi0, dsi1]);
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

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(HR);
  console.log('  DVS STEP 5 — APPROVAL LAYER — BUILD VERIFICATION');
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log(HR + '\n');

  const pg     = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const cookie = await loginAs('dvs_test_user', 'TestPass@DVS1');
  console.log('  Authenticated as dvs_test_user (Manager) ✅\n');

  const PID = 30, CODE = '2627-013';

  // ── Provision test revisions ──────────────────────────────────────────────
  const fPass1    = buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-050', revision: 'A', title: 'Shell Plate',   author: 'A. Patel', scale: '1:10', sheetSize: 'A2', description: 'Shell plate detail' });
  const fPass2    = buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-051', revision: 'A', title: 'End Cap',       author: 'A. Patel', scale: '1:5',  sheetSize: 'A2', description: 'End cap detail' });
  const fFail     = buildSlddrw({ drawingNumber: 'TPEL-WRONG-999',       revision: 'Z', title: 'Bad Drawing',   author: 'A. Patel', scale: '1:5',  sheetSize: 'A2', description: 'Mismatch' });
  const fNoAgent  = buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-052', revision: 'A', title: 'Flange Ring',   author: 'A. Patel', scale: '1:2',  sheetSize: 'A3', description: 'Flange ring detail' });
  const fStale    = buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-053', revision: 'A', title: 'Saddle Plate',  author: 'A. Patel', scale: '1:1',  sheetSize: 'A4', description: 'Saddle plate detail' });

  const revPass1   = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-050', revision: 'A', title: 'Shell Plate',  fileBuffer: fPass1 });
  const revPass2   = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-051', revision: 'A', title: 'End Cap',      fileBuffer: fPass2 });
  const revFail    = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-054', revision: 'A', title: 'Bad Drawing',  fileBuffer: fFail  });
  const revNoAgent = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-052', revision: 'A', title: 'Flange Ring',  fileBuffer: fNoAgent });
  const revStale   = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-053', revision: 'A', title: 'Saddle Plate', fileBuffer: fStale });
  createdIds.push(revPass1, revPass2, revFail, revNoAgent, revStale);
  console.log(`  Revisions: revPass1=${revPass1} revPass2=${revPass2} revFail=${revFail} revNoAgent=${revNoAgent} revStale=${revStale}\n`);

  // Extract + evaluate all except revPass1/revPass2 (needed for guard test A — keeps status 'uploaded')
  await api(cookie, 'POST', `/api/drawing-revisions/${revFail}/extract`);
  await api(cookie, 'POST', `/api/drawing-revisions/${revFail}/evaluate`);
  await api(cookie, 'POST', `/api/drawing-revisions/${revNoAgent}/extract`);
  await api(cookie, 'POST', `/api/drawing-revisions/${revNoAgent}/evaluate`);
  await api(cookie, 'POST', `/api/drawing-revisions/${revStale}/extract`);
  await api(cookie, 'POST', `/api/drawing-revisions/${revStale}/evaluate`);
  // Run agent on revStale so we can make it stale
  await api(cookie, 'POST', `/api/drawing-revisions/${revStale}/agent-review`);
  // Extract + evaluate revPass1 and revPass2 (needed for main approval tests)
  await api(cookie, 'POST', `/api/drawing-revisions/${revPass1}/extract`);
  await api(cookie, 'POST', `/api/drawing-revisions/${revPass1}/evaluate`);
  await api(cookie, 'POST', `/api/drawing-revisions/${revPass2}/extract`);
  await api(cookie, 'POST', `/api/drawing-revisions/${revPass2}/evaluate`);
  // Run agent on revPass1 (fresh agent report present)
  await api(cookie, 'POST', `/api/drawing-revisions/${revPass1}/agent-review`);

  const statuses = await pg.query('SELECT id, status FROM drawing_revisions WHERE id=ANY($1)', [createdIds]);
  for (const r of statuses.rows) console.log(`  revision ${r.id}: status=${r.status}`);
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST A — Guard: status 'uploaded' → 422 status_not_eligible
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST A — Guard: status "uploaded" → 422 status_not_eligible');
  const fUploaded = buildSlddrw({ drawingNumber: 'TPEL-2627-013-ME-055', revision: 'A', title: 'Bracket', author: 'A. Patel' });
  const revUploaded = await uploadRevision(pg, { projectId: PID, projectCode: CODE, drawingNumber: 'TPEL-2627-013-ME-055', revision: 'A', title: 'Bracket', fileBuffer: fUploaded });
  createdIds.push(revUploaded);
  const rA = await api(cookie, 'POST', `/api/drawing-revisions/${revUploaded}/approve`, { decision: 'APPROVED' });
  field('HTTP status', rA.status);
  field('error',       rA.body.error);
  field('reason',      rA.body.reason);
  assert('HTTP 422',                         rA.status === 422);
  assert('error = TRIGGER_GUARD_FAILED',     rA.body.error === 'TRIGGER_GUARD_FAILED');
  assert('reason = status_not_eligible',     rA.body.reason === 'status_not_eligible');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST B — Guard: evaluated status with no evaluation row → 422
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST B — Guard: "evaluated" with no rule_evaluations row → 422');
  await pg.query(`UPDATE drawing_revisions SET status='evaluated' WHERE id=$1`, [revUploaded]);
  const rB = await api(cookie, 'POST', `/api/drawing-revisions/${revUploaded}/approve`, { decision: 'APPROVED' });
  field('HTTP status', rB.status);
  field('error',       rB.body.error);
  field('reason',      rB.body.reason);
  assert('HTTP 422',                   rB.status === 422);
  assert('error = NO_EVALUATION',      rB.body.error === 'NO_EVALUATION');
  assert('reason = evaluation_required', rB.body.reason === 'evaluation_required');
  await pg.query(`UPDATE drawing_revisions SET status='uploaded' WHERE id=$1`, [revUploaded]);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST C — Guard: FAIL verdict + APPROVED decision → 422
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST C — Guard: FAIL verdict + APPROVED decision → 422 fail_verdict_blocks_approval');
  const evalFail = (await pg.query('SELECT overall_verdict FROM rule_evaluations WHERE drawing_revision_id=$1', [revFail])).rows[0];
  note(`revFail verdict: "${evalFail.overall_verdict}" (must be FAIL)`);
  const rC = await api(cookie, 'POST', `/api/drawing-revisions/${revFail}/approve`, { decision: 'APPROVED' });
  field('HTTP status', rC.status);
  field('error',       rC.body.error);
  field('reason',      rC.body.reason);
  field('detail',      rC.body.detail);
  assert('HTTP 422',                                rC.status === 422);
  assert('error = TRIGGER_GUARD_FAILED',            rC.body.error === 'TRIGGER_GUARD_FAILED');
  assert('reason = fail_verdict_blocks_approval',   rC.body.reason === 'fail_verdict_blocks_approval');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST D — Guard: REJECTED with no comments → 400 COMMENTS_REQUIRED
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST D — Guard: decision=REJECTED with empty comments → 400 COMMENTS_REQUIRED');
  const rD1 = await api(cookie, 'POST', `/api/drawing-revisions/${revPass2}/approve`, { decision: 'REJECTED' });
  const rD2 = await api(cookie, 'POST', `/api/drawing-revisions/${revPass2}/approve`, { decision: 'REJECTED', comments: '   ' });
  field('No comments — HTTP status', rD1.status);
  field('No comments — error',       rD1.body.error);
  field('Whitespace — HTTP status',  rD2.status);
  field('Whitespace — error',        rD2.body.error);
  assert('No comments → 400',             rD1.status === 400);
  assert('No comments → COMMENTS_REQUIRED', rD1.body.error === 'COMMENTS_REQUIRED');
  assert('Whitespace only → 400',         rD2.status === 400);
  assert('Whitespace only → COMMENTS_REQUIRED', rD2.body.error === 'COMMENTS_REQUIRED');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST E — Guard: unauthorized role (Employee) → 403
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST E — Guard: unauthorized role (Employee) → 403 FORBIDDEN');
  const originalRole = (await pg.query('SELECT role FROM users WHERE username=$1', ['dvs_test_user'])).rows[0].role;
  await pg.query(`UPDATE users SET role='Employee' WHERE username='dvs_test_user'`);
  const empCookie = await loginAs('dvs_test_user', 'TestPass@DVS1');
  const rE = await api(empCookie, 'POST', `/api/drawing-revisions/${revPass1}/approve`, { decision: 'APPROVED' });
  await pg.query(`UPDATE users SET role=$1 WHERE username='dvs_test_user'`, [originalRole]);
  field('HTTP status', rE.status);
  field('error',       rE.body.error);
  field('reason',      rE.body.reason);
  field('detail',      rE.body.detail);
  assert('HTTP 403',                    rE.status === 403);
  assert('error = FORBIDDEN',           rE.body.error === 'FORBIDDEN');
  assert('reason = insufficient_role',  rE.body.reason === 'insufficient_role');
  note('Role restored to Manager ✅');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST F — Full APPROVED: PASS verdict, agent report fresh, all fields
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST F — Full APPROVED: PASS verdict, agent report present and fresh');
  const statusBeforeF = (await pg.query('SELECT status FROM drawing_revisions WHERE id=$1', [revPass1])).rows[0].status;
  note(`status BEFORE: "${statusBeforeF}"`);
  const evalPass1    = (await pg.query('SELECT id, overall_verdict FROM rule_evaluations WHERE drawing_revision_id=$1', [revPass1])).rows[0];
  const agentPass1   = (await pg.query('SELECT id, rule_evaluation_id, overall_assessment FROM agent_reports WHERE drawing_revision_id=$1', [revPass1])).rows[0];
  note(`rule_evaluation.id=${evalPass1.id}  verdict="${evalPass1.overall_verdict}"`);
  note(`agent_report.id=${agentPass1.id}  rule_evaluation_id=${agentPass1.rule_evaluation_id}  assessment="${agentPass1.overall_assessment}"`);
  note(`Agent is fresh: ${agentPass1.rule_evaluation_id === evalPass1.id}`);

  const rF = await api(cookie, 'POST', `/api/drawing-revisions/${revPass1}/approve`, { decision: 'APPROVED' });
  console.log('');
  field('HTTP status',                 rF.status);
  field('id',                          rF.body.id);
  field('drawing_revision_id',         rF.body.drawingRevisionId);
  field('rule_evaluation_id',          rF.body.ruleEvaluationId);
  field('agent_report_id',             rF.body.agentReportId);
  field('decision',                    rF.body.decision);
  field('decided_by',                  rF.body.decidedBy);
  field('decided_at',                  rF.body.decidedAt);
  field('comments',                    rF.body.comments);
  field('verdict_at_decision',         rF.body.verdictAtDecision);
  field('agent_assessment_at_decision',rF.body.agentAssessmentAtDecision);

  const statusAfterF = (await pg.query('SELECT status FROM drawing_revisions WHERE id=$1', [revPass1])).rows[0].status;
  note(`status AFTER: "${statusAfterF}"`);
  assert('\nHTTP 200',                                  rF.status === 200);
  assert('decision = APPROVED',                         rF.body.decision === 'APPROVED');
  assert('decided_by = dvs_test_user',                  rF.body.decidedBy === 'dvs_test_user');
  assert('decided_at is server-set (present)',          typeof rF.body.decidedAt === 'string');
  assert('verdict_at_decision = PASS',                  rF.body.verdictAtDecision === 'PASS');
  assert('rule_evaluation_id = current eval id',        rF.body.ruleEvaluationId === evalPass1.id, rF.body.ruleEvaluationId);
  assert('agent_report_id = agent report id',           rF.body.agentReportId === agentPass1.id, rF.body.agentReportId);
  assert('agent_assessment_at_decision = PASS_SUMMARY', rF.body.agentAssessmentAtDecision === 'PASS_SUMMARY');
  assert('comments = null (APPROVED, no comments)',     rF.body.comments === null);
  assert('status advanced to "approved"',               statusAfterF === 'approved');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST G — Full REJECTED: PASS verdict, comments mandatory + provided
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST G — Full REJECTED: PASS verdict, comments provided, status → rejected');
  const statusBeforeG = (await pg.query('SELECT status FROM drawing_revisions WHERE id=$1', [revPass2])).rows[0].status;
  note(`status BEFORE: "${statusBeforeG}"`);
  const rG = await api(cookie, 'POST', `/api/drawing-revisions/${revPass2}/approve`, {
    decision: 'REJECTED',
    comments: 'Drawing title does not conform to project naming convention. Rework required.',
  });
  console.log('');
  field('HTTP status',                 rG.status);
  field('decision',                    rG.body.decision);
  field('decided_by',                  rG.body.decidedBy);
  field('decided_at',                  rG.body.decidedAt);
  field('comments',                    rG.body.comments);
  field('verdict_at_decision',         rG.body.verdictAtDecision);
  field('agent_report_id',             rG.body.agentReportId);
  field('agent_assessment_at_decision',rG.body.agentAssessmentAtDecision);

  const statusAfterG = (await pg.query('SELECT status FROM drawing_revisions WHERE id=$1', [revPass2])).rows[0].status;
  note(`status AFTER: "${statusAfterG}"`);
  assert('\nHTTP 200',                  rG.status === 200);
  assert('decision = REJECTED',         rG.body.decision === 'REJECTED');
  assert('comments stored correctly',   rG.body.comments === 'Drawing title does not conform to project naming convention. Rework required.');
  assert('decided_by = dvs_test_user',  rG.body.decidedBy === 'dvs_test_user');
  assert('agent_report_id = null',      rG.body.agentReportId === null);
  assert('status advanced to "rejected"', statusAfterG === 'rejected');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST H — Agent report present but stale → agentReportId=null, assessment=null
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST H — Stale agent report → agentReportId=null, agentAssessmentAtDecision=null');
  // Poison the agent_report's rule_evaluation_id to simulate staleness
  const evalStale  = (await pg.query('SELECT id FROM rule_evaluations WHERE drawing_revision_id=$1', [revStale])).rows[0];
  const evalFail2  = (await pg.query('SELECT id FROM rule_evaluations WHERE drawing_revision_id=$1', [revFail])).rows[0];
  await pg.query(`UPDATE agent_reports SET rule_evaluation_id=$1 WHERE drawing_revision_id=$2`, [evalFail2.id, revStale]);
  const agentStale = (await pg.query('SELECT id, rule_evaluation_id FROM agent_reports WHERE drawing_revision_id=$1', [revStale])).rows[0];
  note(`Current eval id for revStale   : ${evalStale.id}`);
  note(`agent_report.rule_evaluation_id: ${agentStale.rule_evaluation_id}  (poisoned — stale)`);
  note(`Stale: ${agentStale.rule_evaluation_id !== evalStale.id}`);

  const rH = await api(cookie, 'POST', `/api/drawing-revisions/${revStale}/approve`, { decision: 'APPROVED' });
  console.log('');
  field('HTTP status',                  rH.status);
  field('decision',                     rH.body.decision);
  field('agent_report_id',              rH.body.agentReportId);
  field('agent_assessment_at_decision', rH.body.agentAssessmentAtDecision);
  field('verdict_at_decision',          rH.body.verdictAtDecision);
  assert('\nHTTP 200',                              rH.status === 200);
  assert('agent_report_id = null (stale ignored)',  rH.body.agentReportId === null);
  assert('agent_assessment_at_decision = null',     rH.body.agentAssessmentAtDecision === null);
  assert('decision = APPROVED despite stale agent', rH.body.decision === 'APPROVED');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST I — Agent report absent → both null
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST I — No agent report → agentReportId=null, agentAssessmentAtDecision=null');
  const agentRowCount = (await pg.query('SELECT COUNT(*) FROM agent_reports WHERE drawing_revision_id=$1', [revNoAgent])).rows[0].count;
  note(`agent_reports rows for revNoAgent: ${agentRowCount}  (must be 0)`);

  const rI = await api(cookie, 'POST', `/api/drawing-revisions/${revNoAgent}/approve`, { decision: 'APPROVED' });
  console.log('');
  field('HTTP status',                  rI.status);
  field('agent_report_id',              rI.body.agentReportId);
  field('agent_assessment_at_decision', rI.body.agentAssessmentAtDecision);
  field('verdict_at_decision',          rI.body.verdictAtDecision);
  assert('\nHTTP 200',                             rI.status === 200);
  assert('agent_report_id = null (no report)',     rI.body.agentReportId === null);
  assert('agent_assessment_at_decision = null',    rI.body.agentAssessmentAtDecision === null);
  assert('approval recorded without agent report', rI.body.decision === 'APPROVED');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST J — Immutability: second POST → 409 ALREADY_DECIDED
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST J — Immutability: second POST on approved revision → 409 ALREADY_DECIDED');
  const rJ = await api(cookie, 'POST', `/api/drawing-revisions/${revPass1}/approve`, { decision: 'REJECTED', comments: 'Attempt to override.' });
  field('HTTP status', rJ.status);
  field('error',       rJ.body.error);
  field('reason',      rJ.body.reason);
  field('detail',      rJ.body.detail);
  assert('HTTP 409',                      rJ.status === 409);
  assert('error = ALREADY_DECIDED',       rJ.body.error === 'ALREADY_DECIDED');
  assert('reason = approval_immutable',   rJ.body.reason === 'approval_immutable');
  assert('detail contains prior decision', rJ.body.detail?.includes('APPROVED'));
  assert('detail contains decidedBy',     rJ.body.detail?.includes('dvs_test_user'));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST K — Concurrency: UNIQUE constraint is the atomic guard
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST K — Concurrency protection: 23505 path and UNIQUE constraint');
  note('Concurrency guard mechanism (verbatim from route):');
  const { readFileSync } = await import('fs');
  const src = readFileSync('server/drawing-verification-routes.ts', 'utf-8');
  const concStart = src.indexOf('// Atomic INSERT — UNIQUE constraint');
  const concEnd   = src.indexOf('// Advance status atomically', concStart);
  const concBlock = src.slice(concStart, concEnd).trim();
  console.log('');
  for (const l of concBlock.split('\n')) console.log(`  ${l}`);
  assert('\n23505 catch block present', concBlock.includes("dbErr.code === '23505'"));
  assert('returns 409 on 23505',       concBlock.includes("status(409)"));
  assert('UNIQUE constraint defined on drawing_revision_id',
    (await pg.query(`SELECT indexname FROM pg_indexes WHERE tablename='drawing_approvals' AND indexname='uq_drawing_approval_revision'`)).rows.length === 1);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST L — decided_by and decided_at are server-set (not client-supplied)
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST L — decided_by and decided_at are always server-set');
  const routeInsert = src.slice(src.indexOf('// Atomic INSERT'), src.indexOf('} catch (dbErr', src.indexOf('// Atomic INSERT')));
  const hasDecidedByHardcoded = routeInsert.includes('decidedBy:') && routeInsert.includes('caller');
  const hasDecidedAtHardcoded = routeInsert.includes('decidedAt,') || routeInsert.includes('decidedAt:');
  const hasClientSupplied     = routeInsert.includes('req.body.decidedBy') || routeInsert.includes('req.body.decidedAt');
  console.log('');
  console.log('  Route INSERT values (relevant lines):');
  for (const l of routeInsert.split('\n').filter(l => l.includes('decidedBy') || l.includes('decidedAt') || l.includes('caller') || l.includes('new Date'))) {
    console.log(`    ${l.trim()}`);
  }
  assert('\ndecidedBy set from server-extracted caller', hasDecidedByHardcoded);
  assert('decidedAt set from server new Date()',        hasDecidedAtHardcoded);
  assert('no client-supplied decidedBy/decidedAt',     !hasClientSupplied);

  // Live field check
  const dbRow = (await pg.query('SELECT decided_by, decided_at FROM drawing_approvals WHERE drawing_revision_id=$1', [revPass1])).rows[0];
  assert('decided_by in DB = dvs_test_user', dbRow.decided_by === 'dvs_test_user');
  assert('decided_at in DB is a timestamp',  dbRow.decided_at instanceof Date);
  field('\nLive decided_by',  dbRow.decided_by);
  field('Live decided_at',    dbRow.decided_at.toISOString());

  // ══════════════════════════════════════════════════════════════════════════
  // TEST M — verdict_at_decision matches rule_evaluations.overallVerdict
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST M — verdictAtDecision matches rule_evaluations.overallVerdict at write time');
  const dbApproval  = (await pg.query('SELECT verdict_at_decision, rule_evaluation_id FROM drawing_approvals WHERE drawing_revision_id=$1', [revPass1])).rows[0];
  const dbEval      = (await pg.query('SELECT overall_verdict FROM rule_evaluations WHERE id=$1', [dbApproval.rule_evaluation_id])).rows[0];
  field('DB approval.verdict_at_decision',  dbApproval.verdict_at_decision);
  field('DB rule_evaluation.overallVerdict', dbEval.overall_verdict);
  assert('verdict_at_decision matches rule_evaluations.overall_verdict', dbApproval.verdict_at_decision === dbEval.overall_verdict);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST N — GET /:id/approval: 200 success
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST N — GET /:id/approval → 200 with full record');
  const rN = await api(cookie, 'GET', `/api/drawing-revisions/${revPass1}/approval`);
  console.log('');
  field('HTTP status',                  rN.status);
  field('id',                           rN.body.id);
  field('drawing_revision_id',          rN.body.drawingRevisionId);
  field('rule_evaluation_id',           rN.body.ruleEvaluationId);
  field('agent_report_id',              rN.body.agentReportId);
  field('decision',                     rN.body.decision);
  field('decided_by',                   rN.body.decidedBy);
  field('decided_at',                   rN.body.decidedAt);
  field('comments',                     rN.body.comments);
  field('verdict_at_decision',          rN.body.verdictAtDecision);
  field('agent_assessment_at_decision', rN.body.agentAssessmentAtDecision);
  assert('\nHTTP 200',                  rN.status === 200);
  assert('decision present',            rN.body.decision === 'APPROVED');
  assert('decided_by present',          rN.body.decidedBy === 'dvs_test_user');
  assert('verdict_at_decision present', rN.body.verdictAtDecision === 'PASS');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST O — GET /:id/approval: 404 when no record
  // ══════════════════════════════════════════════════════════════════════════
  section('TEST O — GET /:id/approval → 404 when no decision exists');
  const rO = await api(cookie, 'GET', `/api/drawing-revisions/${revUploaded}/approval`);
  field('HTTP status', rO.status);
  field('error',       rO.body.error);
  assert('HTTP 404',                     rO.status === 404);
  assert('descriptive error message',    typeof rO.body.error === 'string' && rO.body.error.length > 10);

  // ══════════════════════════════════════════════════════════════════════════
  // Cleanup — delete in FK-safe order across all test revisions at once
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n' + HR);
  console.log('  CLEANUP');
  console.log(HR);
  // Step 1: approvals and agent_reports first (they reference rule_evaluations)
  await pg.query('DELETE FROM drawing_approvals WHERE drawing_revision_id=ANY($1)', [createdIds]);
  await pg.query('DELETE FROM agent_reports WHERE drawing_revision_id=ANY($1)', [createdIds]);
  // Step 2: now safe to remove rule_evaluations and extractions
  await pg.query('DELETE FROM rule_evaluations WHERE drawing_revision_id=ANY($1)', [createdIds]);
  await pg.query('DELETE FROM drawing_extractions WHERE drawing_revision_id=ANY($1)', [createdIds]);
  // Step 3: GCS files and revision rows
  for (const rid of createdIds) {
    const row = await pg.query('SELECT gcs_staging_path FROM drawing_revisions WHERE id=$1', [rid]);
    if (row.rows[0]) await gcsClient.bucket(bucketName).file(row.rows[0].gcs_staging_path).delete().catch(() => {});
    await pg.query('DELETE FROM drawing_revisions WHERE id=$1', [rid]);
    console.log(`  Removed revision id=${rid}`);
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
