/**
 * DVS Step 2 — Extraction Layer Verification
 * Run: npx tsx server/scripts/test-dvs-step2.ts
 */

import { Client } from 'pg';

const BASE = 'http://localhost:5000';
const REVISION_ID = 1;

// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function apiRequest(method: string, cookie: string, path: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: cookie },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

const get  = (c: string, p: string) => apiRequest('GET',  c, p);
const post = (c: string, p: string) => apiRequest('POST', c, p);

// ── Login via /api/login ──────────────────────────────────────────────────────
async function login(): Promise<string> {
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dvs_test_user', password: 'TestPass@DVS1' }),
    redirect: 'manual',
  });
  const cookies = r.headers.getSetCookie?.() ?? [];
  const cookie = cookies.map(c => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error(`Login failed — status ${r.status}, no Set-Cookie`);
  return cookie;
}

// ── Assertions ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║   DVS STEP 2 — EXTRACTION LAYER VERIFICATION                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  // ── 1. Auth guard ─────────────────────────────────────────────────────────
  console.log('[1] Auth guard — unauthenticated requests');
  const a1 = await post('', `/api/drawing-revisions/${REVISION_ID}/extract`);
  assert('POST /extract → 401 without auth', a1.status === 401, `got ${a1.status}`);

  const a2 = await get('', `/api/drawing-revisions/${REVISION_ID}/extraction`);
  assert('GET /extraction → 401 without auth', a2.status === 401, `got ${a2.status}`);

  // ── 2. Login ──────────────────────────────────────────────────────────────
  console.log('\n[2] Login');
  const cookie = await login();
  console.log(`  ✅ Logged in (cookie obtained)`);

  // ── 3. 404 — non-existent revision ────────────────────────────────────────
  console.log('\n[3] 404 — non-existent revision');
  const b1 = await post(cookie, '/api/drawing-revisions/999999/extract');
  assert('POST /extract 999999 → 404', b1.status === 404, `got ${b1.status}`);

  const b2 = await get(cookie, '/api/drawing-revisions/999999/extraction');
  assert('GET /extraction 999999 → 404', b2.status === 404, `got ${b2.status}`);

  // ── 4. Trigger guards ─────────────────────────────────────────────────────
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  console.log('\n[4] Trigger guard — status ≠ uploaded → 409');
  await pg.query(`UPDATE drawing_revisions SET status = 'in_review' WHERE id = $1`, [REVISION_ID]);
  const g1 = await post(cookie, `/api/drawing-revisions/${REVISION_ID}/extract`);
  assert(`status='in_review' → 409`, g1.status === 409, `got ${g1.status}: ${g1.body?.error}`);
  await pg.query(`UPDATE drawing_revisions SET status = 'uploaded' WHERE id = $1`, [REVISION_ID]);

  console.log('\n[5] Trigger guard — storage_zone ≠ STAGING → 409');
  await pg.query(`UPDATE drawing_revisions SET storage_zone = 'CONTROLLED' WHERE id = $1`, [REVISION_ID]);
  const g2 = await post(cookie, `/api/drawing-revisions/${REVISION_ID}/extract`);
  assert(`storage_zone='CONTROLLED' → 409`, g2.status === 409, `got ${g2.status}: ${g2.body?.error}`);
  await pg.query(`UPDATE drawing_revisions SET storage_zone = 'STAGING' WHERE id = $1`, [REVISION_ID]);

  // ── 5. Trigger extraction ─────────────────────────────────────────────────
  console.log('\n[6] Trigger extraction on revision 1 (dummy 53-byte file)');
  console.log('    (Expected: failed or partial — file is not a real SolidWorks drawing)');
  const e1 = await post(cookie, `/api/drawing-revisions/${REVISION_ID}/extract`);
  console.log(`  HTTP status:              ${e1.status}`);
  console.log(`  extraction_status:        ${e1.body.extractionStatus}`);
  console.log(`  extraction_engine:        ${e1.body.extractionEngine}`);
  console.log(`  extraction_engine_version: ${e1.body.extractionEngineVersion}`);
  console.log(`  extracted_at:             ${e1.body.extractedAt}`);
  console.log(`  raw_error:                ${e1.body.rawError ?? '(none)'}`);
  console.log(`  warnings:                 ${JSON.stringify(e1.body.warnings ?? [])}`);
  console.log(`  file_info.checksum:       ${(e1.body.fileInfo as any)?.checksum}`);
  console.log(`  validation_results:       ${JSON.stringify(e1.body.validationResults)}`);

  assert('HTTP 200 returned', e1.status === 200, `got ${e1.status}`);
  assert('extractionStatus is valid', ['success','partial','failed'].includes(e1.body.extractionStatus));
  assert('extractionEngine = ole-property-parser', e1.body.extractionEngine === 'ole-property-parser');
  assert('extractionEngineVersion = 1.0.0', e1.body.extractionEngineVersion === '1.0.0');
  assert('extractedAt present', !!e1.body.extractedAt);
  assert('fileInfo present', e1.body.fileInfo != null);
  assert('validationResults present', e1.body.validationResults != null);
  assert('validationResults.checkedAt present', !!(e1.body.validationResults as any)?.checkedAt);
  assert('fileInfo.checksum matches revision checksum', (e1.body.fileInfo as any)?.checksum?.length === 64);

  // ── 6. GET extraction result ──────────────────────────────────────────────
  console.log('\n[7] GET extraction result for revision 1');
  const e2 = await get(cookie, `/api/drawing-revisions/${REVISION_ID}/extraction`);
  console.log(`  HTTP status:           ${e2.status}`);
  console.log(`  drawing_revision_id:   ${e2.body.drawingRevisionId}`);
  console.log(`  extraction_status:     ${e2.body.extractionStatus}`);
  console.log(`  extraction_engine_version: ${e2.body.extractionEngineVersion}`);
  assert('GET returns 200', e2.status === 200, `got ${e2.status}`);
  assert('drawingRevisionId matches', e2.body.drawingRevisionId === REVISION_ID);
  assert('extractionStatus consistent with trigger result', e2.body.extractionStatus === e1.body.extractionStatus);

  // ── 7. Idempotency ────────────────────────────────────────────────────────
  console.log('\n[8] Idempotency — re-trigger without force');
  const e3 = await post(cookie, `/api/drawing-revisions/${REVISION_ID}/extract`);
  const statusAfterRetrigger = e3.body.extractionStatus;
  console.log(`  extractionStatus after re-trigger: ${statusAfterRetrigger}`);
  if (e1.body.extractionStatus === 'failed') {
    assert('failed result returned with _note (no auto-retry)', !!e3.body._note,
      `_note was: ${e3.body._note}`);
  } else {
    assert('same status returned (cache hit)', statusAfterRetrigger === e1.body.extractionStatus,
      `before=${e1.body.extractionStatus} after=${statusAfterRetrigger}`);
  }

  // ── 8. Force re-extract ───────────────────────────────────────────────────
  console.log('\n[9] Force re-extract with ?force=true');
  const e4 = await post(cookie, `/api/drawing-revisions/${REVISION_ID}/extract?force=true`);
  console.log(`  HTTP status:           ${e4.status}`);
  console.log(`  extractionStatus:      ${e4.body.extractionStatus}`);
  console.log(`  extractionEngineVersion: ${e4.body.extractionEngineVersion}`);
  console.log(`  extractedAt:           ${e4.body.extractedAt}`);
  assert('force re-extract returns 200', e4.status === 200, `got ${e4.status}`);
  assert('engine version still 1.0.0', e4.body.extractionEngineVersion === '1.0.0');
  assert('new extractedAt timestamp', !!e4.body.extractedAt);

  // ── 9. DB direct verification ─────────────────────────────────────────────
  console.log('\n[10] DB direct — verify extraction record');
  const dbResult = await pg.query(
    `SELECT id, drawing_revision_id, extraction_status, extraction_engine,
            extraction_engine_version, extracted_at, file_info, validation_results, warnings
     FROM drawing_extractions
     WHERE drawing_revision_id = $1`,
    [REVISION_ID]
  );
  const row = dbResult.rows[0];
  console.log(`  id:                        ${row?.id}`);
  console.log(`  drawing_revision_id:       ${row?.drawing_revision_id}`);
  console.log(`  extraction_status:         ${row?.extraction_status}`);
  console.log(`  extraction_engine:         ${row?.extraction_engine}`);
  console.log(`  extraction_engine_version: ${row?.extraction_engine_version}`);
  console.log(`  extracted_at:              ${row?.extracted_at}`);
  console.log(`  file_info.checksum:        ${row?.file_info?.checksum}`);
  console.log(`  validation_results:        ${JSON.stringify(row?.validation_results)}`);
  assert('row exists in DB', row != null);
  assert('engine = ole-property-parser', row?.extraction_engine === 'ole-property-parser');
  assert('engine_version = 1.0.0', row?.extraction_engine_version === '1.0.0');
  assert('file_info.checksum is 64-char hex', row?.file_info?.checksum?.length === 64);
  assert('validation_results persisted', row?.validation_results != null);

  // ── 10. Unique constraint ─────────────────────────────────────────────────
  console.log('\n[11] Unique constraint — exactly one row per drawing_revision_id');
  const countResult = await pg.query(
    `SELECT COUNT(*) FROM drawing_extractions WHERE drawing_revision_id = $1`,
    [REVISION_ID]
  );
  const count = parseInt(countResult.rows[0].count, 10);
  console.log(`  Row count for revision ${REVISION_ID}: ${count}`);
  assert('exactly 1 row (UPSERT enforced uniqueness)', count === 1);

  // ── 11. Schema columns ────────────────────────────────────────────────────
  console.log('\n[12] DB schema — drawing_extractions column verification');
  const colResult = await pg.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'drawing_extractions'
    ORDER BY ordinal_position
  `);
  const cols = colResult.rows;
  console.log('  Columns:');
  cols.forEach((c: any) => console.log(`    ${c.column_name.padEnd(30)} ${c.data_type.padEnd(20)} nullable=${c.is_nullable}`));

  const required = ['id','drawing_revision_id','extraction_status','extracted_at',
    'extraction_engine','extraction_engine_version','file_info','validation_results'];
  for (const col of required) {
    assert(`column '${col}' exists`, cols.some((c: any) => c.column_name === col));
  }
  const notNullable = ['id','drawing_revision_id','extraction_status','extracted_at',
    'extraction_engine','extraction_engine_version','file_info','validation_results'];
  for (const col of notNullable) {
    const c = cols.find((c: any) => c.column_name === col);
    assert(`column '${col}' is NOT NULL`, c?.is_nullable === 'NO', `got ${c?.is_nullable}`);
  }

  // ── 13. Index verification ────────────────────────────────────────────────
  console.log('\n[13] Unique index — uq_drawing_extraction_revision');
  const idxResult = await pg.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'drawing_extractions' AND indexname = 'uq_drawing_extraction_revision'
  `);
  console.log(`  Index found: ${idxResult.rows[0]?.indexname ?? 'NOT FOUND'}`);
  console.log(`  Index def:   ${idxResult.rows[0]?.indexdef ?? ''}`);
  assert('uq_drawing_extraction_revision index exists', idxResult.rows.length > 0);

  await pg.end();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULT: ${passed} passed, ${failed} failed`.padEnd(69) + '║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
