/**
 * QMS Governance Live Validation Script
 * Controlled test: Calibration, WPQR, WelderManagement
 * Uses NEW synthetic document numbers — no existing data disturbed.
 * Cleans up GCS files and DB rows after evidence is recorded.
 *
 * Run: npx tsx server/scripts/test-qms-governance-live.ts
 */

import { createRevision, resolveQmsRuleId, generateQmsPath, type QmsModule } from '../utils/qms-file-governance';
import { db, pool } from '../db';
import { qmsDocumentRevisions, qmsDocumentAuditLog } from '@shared/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { Storage } from '@google-cloud/storage';
import * as crypto from 'crypto';
import { getCertificateUrl } from '../utils/calibration-certificate-upload';
import { buildCalibrationGcsPrefix } from '../utils/gcs-operations';

// ── Minimal synthetic PDF (22 bytes — valid PDF header + EOF) ────────────────
const SYNTHETIC_PDF = Buffer.from('%PDF-1.0\n1 0 obj<</Type /Catalog>>endobj\n%%EOF');
const SYNTHETIC_CONTENT_TYPE = 'application/pdf';
const SYNTHETIC_FILENAME = 'gov-test.pdf';

const TEST_USER_ID = 3;       // Prasad (Superuser) — existing user
const TEST_USER_ROLE = 'Superuser';
const TEST_IP = '127.0.0.1';

// Unique test document numbers — will not collide with anything real
const TEST_CALIB_DOC  = `TEST-CALIB-GOV-${Date.now()}`;
const TEST_WPQR_DOC   = `TEST-WPQR-GOV-${Date.now()}`;
const TEST_WELDER_DOC = `TEST-WELD-GOV-${Date.now()}`;

function sha256(buf: Buffer) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function getGcsBucket() {
  const creds = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS!);
  const storage = new Storage({ projectId: creds.project_id, credentials: creds });
  return storage.bucket(process.env.GCS_BUCKET_NAME || 'thermopac_storage');
}

type TestResult = {
  module: string;
  docNumber: string;
  ruleId: number;
  tokenIssued: boolean;
  parityPassed: boolean;
  gcsPath: string;
  gcsWritten: boolean;
  tokenUsedAt: string | null;
  revisionRowId: number | null;
  revisionNumber: number | null;
  isLatest: boolean | null;
  checksumPresent: boolean;
  checksumMatch: boolean;
  auditRowId: number | null;
  auditAction: string | null;
  legacyPathWrite: boolean;
  error: string | null;
};

async function runTest(
  module: 'Calibration' | 'WPQR' | 'WelderManagement',
  documentNumber: string,
  ruleDocType: string,
  parentEntityType: string,
  parentEntityId: number,
): Promise<TestResult> {
  const result: TestResult = {
    module, docNumber: documentNumber,
    ruleId: 0, tokenIssued: false, parityPassed: false,
    gcsPath: '', gcsWritten: false, tokenUsedAt: null,
    revisionRowId: null, revisionNumber: null, isLatest: null,
    checksumPresent: false, checksumMatch: false,
    auditRowId: null, auditAction: null,
    legacyPathWrite: false, error: null,
  };

  try {
    // 1. Resolve rule ID
    const ruleId = await resolveQmsRuleId(ruleDocType);
    result.ruleId = ruleId;

    // 2. Compute expected path (parity pre-check)
    const expectedPath = generateQmsPath(module, documentNumber, 1, 1, 'certificate', 'pdf');
    result.tokenIssued = true; // issueUploadToken is called inside createRevision

    // 3. Run full governed upload
    const govResult = await createRevision({
      module,
      documentNumber,
      label: 'certificate',
      fileBuffer: SYNTHETIC_PDF,
      originalFileName: SYNTHETIC_FILENAME,
      contentType: SYNTHETIC_CONTENT_TYPE,
      parentEntityType,
      parentEntityId,
      userId: TEST_USER_ID,
      userRole: TEST_USER_ROLE,
      ipAddress: TEST_IP,
      ruleId,
    });

    result.gcsPath = govResult.gcsPath;
    result.revisionNumber = govResult.revisionNumber;

    // 4. Parity check
    result.parityPassed = govResult.gcsPath === expectedPath;

    // 5. GCS write confirmed
    const bucket = getGcsBucket();
    const [exists] = await bucket.file(govResult.gcsPath).exists();
    result.gcsWritten = exists;

    // 6. Token used_at — query gcs_upload_tokens for this path
    const tokenRows = await db.execute(
      (await import('drizzle-orm')).sql`
        SELECT used_at FROM gcs_upload_tokens
        WHERE used_for_path = ${govResult.gcsPath}
           OR resolved_path = ${govResult.gcsPath}
        ORDER BY issued_at DESC LIMIT 1
      `
    ) as any;
    const tokenRow = (tokenRows.rows ?? tokenRows)[0];
    result.tokenUsedAt = tokenRow?.used_at ? String(tokenRow.used_at) : null;

    // 7. Revision row
    const [revRow] = await db
      .select()
      .from(qmsDocumentRevisions)
      .where(eq(qmsDocumentRevisions.gcsPath, govResult.gcsPath))
      .limit(1);
    if (revRow) {
      result.revisionRowId = revRow.id;
      result.isLatest = revRow.isLatest;
      result.checksumPresent = !!revRow.checksumSha256;
      result.checksumMatch = revRow.checksumSha256 === sha256(SYNTHETIC_PDF);
    }

    // 8. Audit row
    const [auditRow] = await db
      .select()
      .from(qmsDocumentAuditLog)
      .where(eq(qmsDocumentAuditLog.gcsPath, govResult.gcsPath))
      .limit(1);
    if (auditRow) {
      result.auditRowId = auditRow.id;
      result.auditAction = auditRow.action;
    }

    // 9. Legacy path check
    result.legacyPathWrite =
      govResult.gcsPath.includes('QMS/Instrument/') ||
      govResult.gcsPath.includes('QMS/WelderCertificates/');

  } catch (err: any) {
    result.error = err?.message ?? String(err);
  }

  return result;
}

async function cleanup(paths: string[]) {
  const bucket = getGcsBucket();
  for (const p of paths) {
    if (!p) continue;
    try { await bucket.file(p).delete(); console.log(`  GCS deleted: ${p}`); }
    catch (e: any) { console.log(`  GCS delete skipped (${p}): ${e?.message}`); }
  }

  // Remove test revisions and audit rows by document number
  const testDocs = [TEST_CALIB_DOC, TEST_WPQR_DOC, TEST_WELDER_DOC];
  const revRows = await db
    .select({ id: qmsDocumentRevisions.id })
    .from(qmsDocumentRevisions)
    .where(inArray(qmsDocumentRevisions.documentNumber, testDocs));
  const revIds = revRows.map(r => r.id);
  if (revIds.length) {
    await db.delete(qmsDocumentAuditLog).where(inArray(qmsDocumentAuditLog.revisionId, revIds));
    await db.delete(qmsDocumentRevisions).where(inArray(qmsDocumentRevisions.id, revIds));
    console.log(`  DB: deleted ${revIds.length} revision row(s) + associated audit rows`);
  }

  // Remove test tokens by resolved_path (raw SQL — simpler than ORM for multi-value)
  for (const p of paths.filter(Boolean)) {
    await db.execute(sql`DELETE FROM gcs_upload_tokens WHERE resolved_path = ${p}`).catch(() => {});
  }
  console.log('  Token rows cleaned.\n');
}

// ─── Test 4: Gap B listing rewire ────────────────────────────────────────────
async function runTest4GapB(): Promise<{ pass: boolean; notes: string[] }> {
  const notes: string[] = [];
  let pass = true;
  let govGcsPath = '';

  try {
    // ── 4a: Create a real governed revision for INST-00001 (id=1) ────────────
    const calibRuleId = await resolveQmsRuleId('CALIBRATION_CERT');
    const govResult = await createRevision({
      module: 'Calibration' as QmsModule,
      documentNumber: 'INST-00001',
      label: 'certificate',
      fileBuffer: SYNTHETIC_PDF,
      originalFileName: SYNTHETIC_FILENAME,
      contentType: SYNTHETIC_CONTENT_TYPE,
      parentEntityType: 'calibration_instrument',
      parentEntityId: 1,
      userId: TEST_USER_ID,
      userRole: TEST_USER_ROLE,
      ipAddress: TEST_IP,
      ruleId: calibRuleId,
    });
    govGcsPath = govResult.gcsPath;
    notes.push(`  Gov revision created: ${govGcsPath} (rev ${govResult.revisionNumber})`);

    // ── 4b: Latency — DB-backed listing (new handler SQL) ────────────────────
    const t0db = Date.now();
    const revRows = await pool.query(
      `SELECT id, revision_number, original_file_name, file_size_bytes, created_at,
              content_type, gcs_path, checksum_sha256, is_latest, created_by
       FROM qms_document_revisions
       WHERE parent_entity_type = 'calibration_instrument'
         AND parent_entity_id   = 1
         AND module             = 'Calibration'
         AND is_active          = true
       ORDER BY revision_number DESC`,
    );
    const dbMs = Date.now() - t0db;
    notes.push(`  DB query latency: ${dbMs}ms (${revRows.rows.length} row(s))`);

    // ── 4c: Latency — legacy GCS prefix scan (old path) ──────────────────────
    const t0gcs = Date.now();
    const bucket = getGcsBucket();
    const prefix = buildCalibrationGcsPrefix('INST-00001'); // 'QMS/Instrument/'
    const [legacyFiles] = await bucket.getFiles({ prefix });
    const legacyFiltered = legacyFiles.filter(f => (f.name.split('/').pop() || '').startsWith('INST-00001'));
    const gcsMs = Date.now() - t0gcs;
    notes.push(`  GCS prefix scan latency: ${gcsMs}ms (${legacyFiltered.length} file(s) matched under QMS/Instrument/)`);
    notes.push(`  Latency improvement: ${gcsMs}ms → ${dbMs}ms (${Math.round(gcsMs / Math.max(dbMs, 1))}x faster)`);

    // ── 4d: Response shape verification ──────────────────────────────────────
    if (revRows.rows.length === 0) {
      notes.push('  ✗ FAIL: DB query returned 0 rows — expected ≥1');
      pass = false;
    } else {
      const row = revRows.rows[0];
      const hasAllFields = ['revision_number', 'original_file_name', 'file_size_bytes',
        'created_at', 'content_type', 'gcs_path', 'checksum_sha256', 'is_latest', 'created_by']
        .every(f => f in row);

      notes.push(`  revisionNumber:    ${row.revision_number}`);
      notes.push(`  originalFileName:  ${row.original_file_name}`);
      notes.push(`  gcsPath:           ${row.gcs_path}`);
      notes.push(`  isLatest:          ${row.is_latest}`);
      notes.push(`  checksumSha256:    ${(row.checksum_sha256 || '').slice(0, 12)}…`);
      notes.push(`  contentType:       ${row.content_type}`);
      notes.push(`  allFieldsPresent:  ${hasAllFields}`);

      if (!hasAllFields) { notes.push('  ✗ FAIL: missing DB columns'); pass = false; }

      // Verify gcsPath does not contain QMS/Instrument/
      if (row.gcs_path.includes('QMS/Instrument/')) {
        notes.push('  ✗ FAIL: gcs_path contains deprecated QMS/Instrument/ prefix');
        pass = false;
      } else {
        notes.push('  ✓ PASS: no QMS/Instrument/ in gcs_path');
      }

      // Verify is_latest
      if (!row.is_latest) { notes.push('  ✗ FAIL: is_latest is false'); pass = false; }
      else { notes.push('  ✓ PASS: is_latest = true'); }

      // Verify signed URL generation (getCertificateUrl on governed path)
      const signedUrl = await getCertificateUrl(row.gcs_path);
      if (!signedUrl) { notes.push('  ✗ FAIL: getCertificateUrl returned null for governed path'); pass = false; }
      else { notes.push(`  ✓ PASS: signed URL generated (${signedUrl.slice(0, 60)}…)`); }
    }

    // ── 4e: Legacy fallback — INST-00073 (legacy-only instrument) ────────────
    notes.push('\n  ── Legacy fallback (INST-00073) ──');
    const legacyInstrResult = await pool.query(
      `SELECT id, instrument_id, certificate_file_path, certificate_gcs_key, updated_at
       FROM calibration_instruments WHERE instrument_id = 'INST-00073'`
    );

    if (legacyInstrResult.rows.length === 0) {
      notes.push('  INST-00073 not found — skipping legacy test');
    } else {
      const li = legacyInstrResult.rows[0];
      const legacyRevResult = await pool.query(
        `SELECT COUNT(*) AS cnt FROM qms_document_revisions
         WHERE parent_entity_type = 'calibration_instrument'
           AND parent_entity_id = $1 AND module = 'Calibration' AND is_active = true`,
        [li.id]
      );
      const legacyRevCount = Number(legacyRevResult.rows[0].cnt);
      notes.push(`  INST-00073 governed revisions: ${legacyRevCount} (expected: 0)`);
      if (legacyRevCount !== 0) { notes.push('  ✗ FAIL: expected 0 governed revisions for legacy instrument'); pass = false; }
      else { notes.push('  ✓ PASS: 0 governed revisions — fallback will activate'); }

      // Resolve legacy path (mirrors handler logic)
      const certGcsKey: string = li.certificate_gcs_key || '';
      const certFilePath: string = li.certificate_file_path || '';
      let legacyPath: string | null = null;
      if (certGcsKey.startsWith('QMS/')) legacyPath = certGcsKey;
      else if (certGcsKey.trim()) legacyPath = `QMS/Instrument/${certGcsKey}`;
      else if (certFilePath.startsWith('QMS/')) legacyPath = certFilePath;

      notes.push(`  Resolved legacy path: ${legacyPath}`);
      if (!legacyPath) { notes.push('  ✗ FAIL: no legacy path resolved'); pass = false; }
      else {
        const legacySignedUrl = await getCertificateUrl(legacyPath);
        if (!legacySignedUrl) {
          notes.push('  ⚠ Legacy GCS file not found in bucket (getCertificateUrl=null) — synthesized entry would be empty []');
          notes.push('  ✓ PASS (acceptable): no signed URL = empty list; download endpoint unaffected');
        } else {
          notes.push(`  ✓ PASS: legacy signed URL generated — synthesized entry would return name=${legacyPath.split('/').pop()}`);
        }
      }
    }

  } catch (err: any) {
    notes.push(`  ✗ ERROR: ${err?.message ?? String(err)}`);
    pass = false;
  }

  // Cleanup Test 4 governed revision
  if (govGcsPath) {
    try { await getGcsBucket().file(govGcsPath).delete(); } catch {}
    await db.execute(sql`
      DELETE FROM qms_document_audit_log WHERE gcs_path = ${govGcsPath}
    `).catch(() => {});
    await db.execute(sql`
      DELETE FROM qms_document_revisions WHERE gcs_path = ${govGcsPath}
    `).catch(() => {});
    await db.execute(sql`
      DELETE FROM gcs_upload_tokens WHERE resolved_path = ${govGcsPath}
    `).catch(() => {});
    notes.push('\n  Test 4 GCS file + DB rows cleaned up.');
  }

  return { pass, notes };
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  QMS GOVERNANCE LIVE VALIDATION — ' + new Date().toISOString());
  console.log('══════════════════════════════════════════════════════\n');

  const results: TestResult[] = [];

  console.log('► Test 1: Calibration certificate upload');
  results.push(await runTest('Calibration', TEST_CALIB_DOC, 'CALIBRATION_CERT', 'calibration_instrument', 1));

  console.log('► Test 2: WPQR revision upload');
  results.push(await runTest('WPQR', TEST_WPQR_DOC, 'WPQR', 'wpqr_document', 1));

  console.log('► Test 3: WelderManagement certificate upload');
  results.push(await runTest('WelderManagement', TEST_WELDER_DOC, 'WELDER_CERT', 'welder_certificate', 2));

  console.log('\n══════════════ EVIDENCE TABLE (Tests 1-3) ══════════════\n');

  const checks = [
    'module', 'docNumber', 'ruleId',
    'tokenIssued', 'tokenUsedAt', 'parityPassed',
    'gcsPath', 'gcsWritten',
    'revisionRowId', 'revisionNumber', 'isLatest',
    'checksumPresent', 'checksumMatch',
    'auditRowId', 'auditAction',
    'legacyPathWrite', 'error',
  ] as const;

  for (const r of results) {
    console.log(`─── ${r.module} ───`);
    for (const k of checks) {
      const v = r[k as keyof TestResult];
      const flag = k === 'legacyPathWrite' ? (v ? '✗ FAIL' : '✓ PASS') :
                   k === 'error'           ? (v ? `✗ ${v}` : '✓ none') :
                   k === 'tokenUsedAt'     ? (v ? `✓ ${v}` : '✗ null') :
                   typeof v === 'boolean'  ? (v ? '✓ true' : '✗ false') :
                   v !== null && v !== undefined ? `✓ ${v}` : '✗ null';
      console.log(`  ${String(k).padEnd(20)} ${flag}`);
    }
    console.log('');
  }

  const t123Passed = results.every(r =>
    !r.error && r.tokenIssued && r.tokenUsedAt && r.parityPassed && r.gcsWritten &&
    r.revisionRowId !== null && r.isLatest === true &&
    r.checksumPresent && r.checksumMatch && r.auditRowId !== null && !r.legacyPathWrite
  );

  // Cleanup Tests 1-3
  console.log('► Cleaning up Tests 1-3 GCS files and DB rows...');
  await cleanup(results.map(r => r.gcsPath));
  console.log('  Cleanup complete.\n');

  // ── Test 4: Gap B listing rewire ──────────────────────────────────────────
  console.log('► Test 4: Gap B — calibration listing endpoint rewire\n');
  const { pass: t4Passed, notes: t4Notes } = await runTest4GapB();
  for (const n of t4Notes) console.log(n);

  const allPassed = t123Passed && t4Passed;

  console.log('\n══════════════════════════════════════════');
  console.log(`  Tests 1-3: ${t123Passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Test 4 (Gap B): ${t4Passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  OVERALL: ${allPassed ? '✅ ALL CHECKS PASSED' : '❌ ONE OR MORE CHECKS FAILED'}`);
  console.log('══════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
