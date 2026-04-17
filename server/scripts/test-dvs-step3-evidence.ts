/**
 * DVS Step 3 — Build Verification Evidence Script
 *
 * Proves all Step 3 contracts against the live server using valid OLE files
 * built inline with the same builder used in the Step 2 evidence script.
 *
 * Run: npx tsx server/scripts/test-dvs-step3-evidence.ts
 */

import CFB from 'cfb';
import { createHash } from 'crypto';
import { Client } from 'pg';
import gcsClient, { bucketName } from '../utils/storage-config';
import { EXTRACTION_ENGINE_VERSION } from '../utils/ole-extractor';
import { RULE_ENGINE_VERSION } from '../utils/rule-engine';

const BASE = 'http://localhost:5000';
const SEP  = '═'.repeat(72);

// ─── OLE builder (same as Step 2 evidence) ───────────────────────────────────

function padTo4(n: number) { return Math.ceil(n / 4) * 4; }
function propLpstr(s: string): Buffer {
  const raw = Buffer.from(s + '\0', 'latin1');
  const len = raw.length;
  const buf = Buffer.alloc(4 + 4 + padTo4(len), 0);
  buf.writeUInt32LE(0x001E, 0); buf.writeUInt32LE(len, 4); raw.copy(buf, 8);
  return buf;
}
function buildPropSection(entries: Array<{ id: number; value: Buffer }>): Buffer {
  const n = entries.length;
  const hSize = 8 + n * 8;
  let offset = hSize;
  const offsets = entries.map(e => { const o = offset; offset += e.value.length; return o; });
  const buf = Buffer.alloc(offset, 0);
  buf.writeUInt32LE(offset, 0); buf.writeUInt32LE(n, 4);
  entries.forEach((e, i) => { buf.writeUInt32LE(e.id, 8+i*8); buf.writeUInt32LE(offsets[i], 8+i*8+4); });
  let pos = hSize;
  for (const e of entries) { e.value.copy(buf, pos); pos += e.value.length; }
  return buf;
}
function buildHeader1(fmtidHex: string, sectionOffset: number): Buffer {
  const h = Buffer.alloc(48, 0);
  h.writeUInt16LE(0xFFFE,0); h.writeUInt16LE(0,2); h.writeUInt32LE(0x00020006,4);
  h.writeUInt32LE(1,24); Buffer.from(fmtidHex,'hex').copy(h,28); h.writeUInt32LE(sectionOffset,44);
  return h;
}
function buildHeader2(f0: string, o0: number, f1: string, o1: number): Buffer {
  const h = Buffer.alloc(68, 0);
  h.writeUInt16LE(0xFFFE,0); h.writeUInt16LE(0,2); h.writeUInt32LE(0x00020006,4);
  h.writeUInt32LE(2,24);
  Buffer.from(f0,'hex').copy(h,28); h.writeUInt32LE(o0,44);
  Buffer.from(f1,'hex').copy(h,48); h.writeUInt32LE(o1,64);
  return h;
}
function buildDictionary(nameMap: Record<number, string>): Buffer {
  const entries = Object.entries(nameMap).map(([pid, name]) => ({ pid: +pid, name }));
  let size = 4;
  for (const e of entries) size += 4 + 4 + padTo4(Buffer.byteLength(e.name+'\0','latin1'));
  const buf = Buffer.alloc(size, 0);
  buf.writeUInt32LE(entries.length, 0);
  let pos = 4;
  for (const e of entries) {
    const nb = Buffer.from(e.name+'\0','latin1');
    buf.writeUInt32LE(e.pid,pos); buf.writeUInt32LE(nb.length,pos+4); nb.copy(buf,pos+8);
    pos += 4+4+padTo4(nb.length);
  }
  return buf;
}

const FMTID_SI   = 'e0859ff2f94f6810ab9108002b27b3d9';
const FMTID_DSI0 = '02d5cdd59c2e1b10939708002b2cf9ae';
const FMTID_DSI1 = '05d5cdd59c2e1b10939708002b2cf9ae';

function buildSlddrw(opts: {
  drawingNumber: string; revision: string; title: string; author: string;
  company?: string; scale?: string; sheetSize?: string; description?: string;
}): Buffer {
  const { drawingNumber, revision, title, author, company='THERMOPAC', scale='1:10', sheetSize='A3', description='' } = opts;
  const siSection = buildPropSection([
    {id:2,value:propLpstr(title)}, {id:4,value:propLpstr(author)},
    {id:8,value:propLpstr(author)}, {id:9,value:propLpstr(revision)},
    {id:18,value:propLpstr('SOLIDWORKS')},
  ]);
  const siStream = Buffer.concat([buildHeader1(FMTID_SI, 48), siSection]);

  const dsi0 = buildPropSection([{id:15, value:propLpstr(company)}]);
  const dictBlob = buildDictionary({2:'DrawingNumber',3:'Revision',4:'DrawnBy',5:'Scale',6:'SheetSize',7:'Description'});
  const dsi1 = buildPropSection([
    {id:0,value:dictBlob}, {id:2,value:propLpstr(drawingNumber)}, {id:3,value:propLpstr(revision)},
    {id:4,value:propLpstr(author)}, {id:5,value:propLpstr(scale)},
    {id:6,value:propLpstr(sheetSize)}, {id:7,value:propLpstr(description)},
  ]);
  const dsiStream = Buffer.concat([buildHeader2(FMTID_DSI0,68,FMTID_DSI1,68+dsi0.length), dsi0, dsi1]);

  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, '/\x05SummaryInformation', siStream);
  CFB.utils.cfb_add(cfb, '/\x05DocumentSummaryInformation', dsiStream);
  return Buffer.from(CFB.write(cfb, {type:'buffer'}) as Uint8Array);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/api/login`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({username:'dvs_test_user',password:'TestPass@DVS1'}), redirect:'manual',
  });
  const cookie = (r.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error(`Login failed — HTTP ${r.status}`);
  return cookie;
}

async function uploadRevision(pg: Client, opts: {
  projectId: number; projectCode: string; drawingNumber: string; revision: string;
  title: string; fileBuffer: Buffer;
}): Promise<number> {
  const { projectId, projectCode, drawingNumber, revision, title, fileBuffer } = opts;
  const checksum = createHash('sha256').update(fileBuffer).digest('hex');
  const filename  = `${drawingNumber}-rev${revision}.slddrw`;
  const gcsPath   = `TPEL/STAGING/DRAWINGS/${projectCode}/${drawingNumber}/rev-${revision}/original/${filename}`;
  await gcsClient.bucket(bucketName).file(gcsPath).save(fileBuffer, {metadata:{contentType:'application/octet-stream'}});
  const res = await pg.query(`
    INSERT INTO drawing_revisions
      (project_id,project_code,drawing_number,revision,title,item_code,discipline,
       file_type,checksum,storage_zone,uploaded_by,uploaded_at,original_filename,
       gcs_staging_path,file_size_bytes,status)
    VALUES($1,$2,$3,$4,$5,NULL,NULL,'slddrw',$6,'STAGING','evidence-script',NOW(),$7,$8,$9,'uploaded')
    RETURNING id`,
    [projectId,projectCode,drawingNumber,revision,title,checksum,filename,gcsPath,fileBuffer.length]);
  return res.rows[0].id;
}

async function api(cookie: string, method: string, path: string): Promise<{status:number;body:any}> {
  const r = await fetch(`${BASE}${path}`, {method, headers:{Cookie:cookie}});
  const body = await r.json().catch(() => ({}));
  return {status:r.status, body};
}

let pass = 0; let fail = 0;
function assert(label: string, ok: boolean, detail?: any) {
  if (ok) { console.log(`  ✅  ${label}`); pass++; }
  else { console.log(`  ❌  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); fail++; }
}
function print(label: string, value: any) {
  console.log(`  ${label.padEnd(38)} ${JSON.stringify(value) ?? '(null)'}`);
}

const createdRevisionIds: number[] = [];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(SEP);
  console.log('DVS STEP 3 — RULE ENGINE BUILD VERIFICATION');
  console.log(`  Rule Engine version: ${RULE_ENGINE_VERSION}`);
  console.log(`  Extraction Engine version: ${EXTRACTION_ENGINE_VERSION}`);
  console.log(SEP + '\n');

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const cookie = await login();
  console.log('Authenticated as dvs_test_user ✅\n');

  const PROJECT_ID = 30;
  const PROJECT_CODE = '2627-013';

  // ───────────────────────────────────────────────────────────────────────────
  // TEST A: Step 2 amendment — extraction sets status = 'extracted'
  // ───────────────────────────────────────────────────────────────────────────
  console.log(SEP);
  console.log('TEST A: Step 2 amendment — extraction sets status = "extracted"');
  console.log(SEP);

  const fileA = buildSlddrw({
    drawingNumber:'TPEL-2627-013-ME-010', revision:'A',
    title:'Shell Assembly', author:'J. Sharma', description:'Pressure Vessel Shell',
  });
  const revA = await uploadRevision(pg, {projectId:PROJECT_ID, projectCode:PROJECT_CODE,
    drawingNumber:'TPEL-2627-013-ME-010', revision:'A', title:'Shell Assembly', fileBuffer:fileA});
  createdRevisionIds.push(revA);

  const beforeExtract = await pg.query('SELECT status FROM drawing_revisions WHERE id=$1', [revA]);
  console.log(`\n  status before extraction: ${beforeExtract.rows[0].status}`);
  assert('status = uploaded before extraction', beforeExtract.rows[0].status === 'uploaded');

  const extractA = await api(cookie, 'POST', `/api/drawing-revisions/${revA}/extract`);
  assert('extraction HTTP 200', extractA.status === 200);
  assert(`extraction_status = success or partial`, ['success','partial'].includes(extractA.body.extractionStatus),
    extractA.body.extractionStatus);

  const afterExtract = await pg.query('SELECT status FROM drawing_revisions WHERE id=$1', [revA]);
  console.log(`  status after extraction: ${afterExtract.rows[0].status}`);
  assert('status = extracted after successful extraction', afterExtract.rows[0].status === 'extracted');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST B: Trigger guard — status 'uploaded' rejected
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n' + SEP);
  console.log('TEST B: Trigger guard — evaluation rejected when status = "uploaded"');
  console.log(SEP);

  const fileB = buildSlddrw({
    drawingNumber:'TPEL-2627-013-ME-011', revision:'A',
    title:'Base Plate', author:'R. Patel', description:'Base Plate Assembly',
  });
  const revB = await uploadRevision(pg, {projectId:PROJECT_ID, projectCode:PROJECT_CODE,
    drawingNumber:'TPEL-2627-013-ME-011', revision:'A', title:'Base Plate', fileBuffer:fileB});
  createdRevisionIds.push(revB);

  const evalB = await api(cookie, 'POST', `/api/drawing-revisions/${revB}/evaluate`);
  console.log(`\n  Response: HTTP ${evalB.status}`);
  print('error',  evalB.body.error);
  print('reason', evalB.body.reason);
  assert('HTTP 422', evalB.status === 422);
  assert('error = TRIGGER_GUARD_FAILED', evalB.body.error === 'TRIGGER_GUARD_FAILED');
  assert('reason = status_not_eligible', evalB.body.reason === 'status_not_eligible');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST C: Extraction gate BLOCK — failed extraction
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n' + SEP);
  console.log('TEST C: Extraction gate BLOCK — failed extraction prevents evaluation');
  console.log(SEP);

  // Force status to 'extracted' but make the extraction record show 'failed'
  await pg.query(`UPDATE drawing_revisions SET status='extracted' WHERE id=$1`, [revB]);
  await pg.query(`
    INSERT INTO drawing_extractions
      (drawing_revision_id, extraction_status, extracted_at, extraction_engine,
       extraction_engine_version, file_info, validation_results, warnings, raw_error)
    VALUES($1,'failed',NOW(),'ole-property-parser',$2,'{}','{}','[]','Simulated failure for test')`,
    [revB, EXTRACTION_ENGINE_VERSION]);

  const evalC = await api(cookie, 'POST', `/api/drawing-revisions/${revB}/evaluate`);
  console.log(`\n  Response: HTTP ${evalC.status}`);
  print('error',                    evalC.body.error);
  print('extraction_gate',          evalC.body.extraction_gate);
  print('extraction_gate_reason',   evalC.body.extraction_gate_reason);
  print('detail',                   evalC.body.detail);
  assert('HTTP 422', evalC.status === 422);
  assert('error = BLOCKED', evalC.body.error === 'BLOCKED');
  assert('extraction_gate = BLOCK', evalC.body.extraction_gate === 'BLOCK');
  assert('extraction_gate_reason = extraction_failed', evalC.body.extraction_gate_reason === 'extraction_failed');
  assert('detail is present', typeof evalC.body.detail === 'string' && evalC.body.detail.length > 0);
  const statusAfterBlock = await pg.query('SELECT status FROM drawing_revisions WHERE id=$1', [revB]);
  assert('drawing status unchanged after BLOCK', statusAfterBlock.rows[0].status === 'extracted',
    statusAfterBlock.rows[0].status);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST D: Extraction gate BLOCK — stale version
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n' + SEP);
  console.log('TEST D: Extraction gate BLOCK — stale engine version');
  console.log(SEP);

  // Update the extraction to show a stale version
  await pg.query(
    `UPDATE drawing_extractions SET extraction_status='success', extraction_engine_version='0.8.0' WHERE drawing_revision_id=$1`,
    [revB]);

  const evalD = await api(cookie, 'POST', `/api/drawing-revisions/${revB}/evaluate`);
  console.log(`\n  Response: HTTP ${evalD.status}`);
  print('extraction_gate_reason', evalD.body.extraction_gate_reason);
  assert('HTTP 422', evalD.status === 422);
  assert('extraction_gate_reason = extraction_version_stale', evalD.body.extraction_gate_reason === 'extraction_version_stale');
  assert('detail mentions version numbers', evalD.body.detail?.includes('0.8.0') && evalD.body.detail?.includes(EXTRACTION_ENGINE_VERSION));

  // ───────────────────────────────────────────────────────────────────────────
  // TEST E: Full PASS evaluation — all 13 rules pass
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n' + SEP);
  console.log('TEST E: Full PASS evaluation — all 13 rules, ALLOW gate');
  console.log(SEP);

  const evalE = await api(cookie, 'POST', `/api/drawing-revisions/${revA}/evaluate`);
  console.log('\n── Evaluation output ──');
  print('id',                      evalE.body.id);
  print('drawingRevisionId',       evalE.body.drawingRevisionId);
  print('drawingExtractionId',     evalE.body.drawingExtractionId);
  print('ruleEngineVersion',       evalE.body.ruleEngineVersion);
  print('evaluatedAt',             evalE.body.evaluatedAt);
  print('evaluatedBy',             evalE.body.evaluatedBy);
  print('extractionGate',          evalE.body.extractionGate);
  print('extractionGateReason',    evalE.body.extractionGateReason);
  print('overallVerdict',          evalE.body.overallVerdict);

  const ruleResults: any[] = evalE.body.ruleResults ?? [];
  console.log(`\n  Rule results (${ruleResults.length} rules):`);
  for (const r of ruleResults) {
    const icon = r.verdict === 'PASS' ? '✅' : r.verdict === 'WARN' ? '⚠️' : '❌';
    console.log(`    ${icon} [${r.category}] ${r.ruleId}: ${r.verdict}`);
  }

  console.log('\n── Assertions ──');
  assert('HTTP 200', evalE.status === 200);
  assert('ruleEngineVersion = ' + RULE_ENGINE_VERSION, evalE.body.ruleEngineVersion === RULE_ENGINE_VERSION);
  assert('extractionGate = ALLOW', evalE.body.extractionGate === 'ALLOW');
  assert('extractionGateReason = extraction_success', evalE.body.extractionGateReason === 'extraction_success');
  assert('overallVerdict = PASS', evalE.body.overallVerdict === 'PASS');
  assert('13 rule results returned', ruleResults.length === 13, ruleResults.length);
  assert('all rules PASS', ruleResults.every(r => r.verdict === 'PASS'), ruleResults.filter(r=>r.verdict!=='PASS').map(r=>r.ruleId));
  assert('identity rules all present', ['DRAWING_NUMBER_PRESENT','DRAWING_NUMBER_MATCH','REVISION_PRESENT','REVISION_MATCH','APPLICATION_NAME'].every(id => ruleResults.some(r=>r.ruleId===id)));
  assert('metadata rules all present', ['TITLE_PRESENT','AUTHOR_PRESENT','DRAWN_BY_PRESENT','DESCRIPTION_PRESENT'].every(id => ruleResults.some(r=>r.ruleId===id)));
  assert('completeness rules all present', ['SHEET_INFO_PRESENT','SCALE_PRESENT','SHEET_SIZE_PRESENT','EXTRACTION_WARNINGS_ABSENT'].every(id => ruleResults.some(r=>r.ruleId===id)));
  assert('each result has category, severity, verdict, evaluatedValue, detail fields',
    ruleResults.every(r => r.category && r.severity && r.verdict && 'evaluatedValue' in r && 'detail' in r));
  assert('drawingExtractionId is set', typeof evalE.body.drawingExtractionId === 'number');

  const statusAfterEval = await pg.query('SELECT status FROM drawing_revisions WHERE id=$1', [revA]);
  assert('drawing status advanced to evaluated', statusAfterEval.rows[0].status === 'evaluated',
    statusAfterEval.rows[0].status);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST F: Evaluation from 'evaluated' status — idempotency (cached)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n' + SEP);
  console.log('TEST F: Idempotency — cached result returned from "evaluated" status');
  console.log(SEP);

  const evalF = await api(cookie, 'POST', `/api/drawing-revisions/${revA}/evaluate`);
  console.log(`\n  _note: ${evalF.body._note}`);
  assert('HTTP 200', evalF.status === 200);
  assert('_note = cached', evalF.body._note === 'cached');
  assert('overallVerdict unchanged', evalF.body.overallVerdict === 'PASS');
  assert('evaluation id same', evalF.body.id === evalE.body.id);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST G: FAIL evaluation — identity rule failures (mismatch)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n' + SEP);
  console.log('TEST G: FAIL evaluation — DrawingNumber and Revision mismatch');
  console.log(SEP);

  const fileG = buildSlddrw({
    drawingNumber:'TPEL-WRONG-999', revision:'Z',
    title:'Mismatch Drawing', author:'J. Sharma', description:'Wrong Drawing',
  });
  const revG = await uploadRevision(pg, {projectId:PROJECT_ID, projectCode:PROJECT_CODE,
    drawingNumber:'TPEL-2627-013-ME-012', revision:'A', title:'Mismatch Drawing', fileBuffer:fileG});
  createdRevisionIds.push(revG);

  await api(cookie, 'POST', `/api/drawing-revisions/${revG}/extract`);
  const evalG = await api(cookie, 'POST', `/api/drawing-revisions/${revG}/evaluate`);

  console.log('\n── Evaluation output ──');
  print('overallVerdict', evalG.body.overallVerdict);
  print('extractionGate', evalG.body.extractionGate);
  const rulesG: any[] = evalG.body.ruleResults ?? [];
  console.log('\n  Rule results:');
  for (const r of rulesG) {
    const icon = r.verdict === 'PASS' ? '✅' : r.verdict === 'WARN' ? '⚠️' : '❌';
    console.log(`    ${icon} [${r.category}] ${r.ruleId}: ${r.verdict} — ${r.detail ?? ''}`);
  }

  const dnMatch  = rulesG.find(r => r.ruleId === 'DRAWING_NUMBER_MATCH');
  const revMatch = rulesG.find(r => r.ruleId === 'REVISION_MATCH');

  assert('HTTP 200', evalG.status === 200);
  assert('overallVerdict = FAIL', evalG.body.overallVerdict === 'FAIL');
  assert('DRAWING_NUMBER_MATCH verdict = FAIL', dnMatch?.verdict === 'FAIL', dnMatch?.verdict);
  assert('DRAWING_NUMBER_MATCH evaluatedValue = TPEL-WRONG-999', dnMatch?.evaluatedValue === 'TPEL-WRONG-999', dnMatch?.evaluatedValue);
  assert('DRAWING_NUMBER_MATCH expectedValue = TPEL-2627-013-ME-012', dnMatch?.expectedValue === 'TPEL-2627-013-ME-012', dnMatch?.expectedValue);
  assert('REVISION_MATCH verdict = FAIL', revMatch?.verdict === 'FAIL', revMatch?.verdict);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST H: Re-evaluation on rule engine version change
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n' + SEP);
  console.log('TEST H: Auto re-evaluation on rule engine version change');
  console.log(SEP);

  // Backdate the engine version on revA's evaluation
  await pg.query(
    `UPDATE rule_evaluations SET rule_engine_version='0.5.0', evaluated_at=NOW()-INTERVAL '2 hours'
     WHERE drawing_revision_id=$1`, [revA]);

  const beforeH = await pg.query(
    'SELECT rule_engine_version, evaluated_at FROM rule_evaluations WHERE drawing_revision_id=$1', [revA]);
  console.log(`\n  Stored version: ${beforeH.rows[0].rule_engine_version} (backdated)`);
  console.log(`  Current version: ${RULE_ENGINE_VERSION}`);

  const evalH = await api(cookie, 'POST', `/api/drawing-revisions/${revA}/evaluate`);
  console.log(`  _note: ${evalH.body._note ?? '(none — auto re-evaluated)'}`);
  print('ruleEngineVersion', evalH.body.ruleEngineVersion);
  print('evaluatedBy',       evalH.body.evaluatedBy);

  assert('HTTP 200', evalH.status === 200);
  assert('no _note (not cached — auto re-evaluated)', !evalH.body._note);
  assert(`ruleEngineVersion updated to ${RULE_ENGINE_VERSION}`, evalH.body.ruleEngineVersion === RULE_ENGINE_VERSION, evalH.body.ruleEngineVersion);
  assert('evaluatedBy = system:auto-reeval', evalH.body.evaluatedBy === 'system:auto-reeval', evalH.body.evaluatedBy);
  assert('overallVerdict still PASS', evalH.body.overallVerdict === 'PASS');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST I: Force re-evaluation by user — bypasses cache, uses caller identity
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n' + SEP);
  console.log('TEST I: ?force=true re-evaluation — bypasses cache, caller as evaluatedBy');
  console.log(SEP);

  // Verify revA is currently cached (same version, same extraction)
  const preFH = await api(cookie, 'POST', `/api/drawing-revisions/${revA}/evaluate`);
  assert('pre-condition: currently cached', preFH.body._note === 'cached');

  const evalI = await api(cookie, 'POST', `/api/drawing-revisions/${revA}/evaluate?force=true`);
  console.log(`\n  _note: ${evalI.body._note ?? '(none — forced)'}`);
  print('evaluatedBy',     evalI.body.evaluatedBy);
  print('overallVerdict',  evalI.body.overallVerdict);

  assert('HTTP 200', evalI.status === 200);
  assert('no _note (forced re-evaluation, not cached)', !evalI.body._note);
  assert('evaluatedBy = dvs_test_user (caller)', evalI.body.evaluatedBy === 'dvs_test_user', evalI.body.evaluatedBy);
  assert('overallVerdict still PASS', evalI.body.overallVerdict === 'PASS');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST J: GET /evaluation — returns stored record
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n' + SEP);
  console.log('TEST J: GET /:id/evaluation — returns stored evaluation record');
  console.log(SEP);

  const getJ = await api(cookie, 'GET', `/api/drawing-revisions/${revA}/evaluation`);
  assert('HTTP 200', getJ.status === 200);
  assert('ruleEngineVersion present', getJ.body.ruleEngineVersion === RULE_ENGINE_VERSION);
  assert('overallVerdict present',    typeof getJ.body.overallVerdict === 'string');
  assert('extractionGate present',    typeof getJ.body.extractionGate === 'string');
  assert('extractionGateReason present', typeof getJ.body.extractionGateReason === 'string');
  assert('ruleResults is array of 13', Array.isArray(getJ.body.ruleResults) && getJ.body.ruleResults.length === 13);

  const get404 = await api(cookie, 'GET', `/api/drawing-revisions/${revB}/evaluation`);
  assert('GET evaluation returns 404 when no evaluation exists', get404.status === 404);

  // ───────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n' + SEP);
  console.log('Cleanup');
  console.log(SEP);

  for (const rid of createdRevisionIds) {
    await pg.query(`DELETE FROM rule_evaluations WHERE drawing_revision_id=$1`, [rid]);
    await pg.query(`DELETE FROM drawing_extractions WHERE drawing_revision_id=$1`, [rid]);
    const revRow = await pg.query('SELECT gcs_staging_path FROM drawing_revisions WHERE id=$1', [rid]);
    if (revRow.rows[0]) {
      await gcsClient.bucket(bucketName).file(revRow.rows[0].gcs_staging_path).delete().catch(() => {});
    }
    await pg.query('DELETE FROM drawing_revisions WHERE id=$1', [rid]);
    console.log(`  Removed revision id=${rid}`);
  }
  await pg.end();

  // ───────────────────────────────────────────────────────────────────────────
  // Summary
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n' + SEP);
  console.log(`FINAL RESULT: ${pass} passed, ${fail} failed`);
  console.log(SEP);
  if (fail > 0) process.exit(1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
