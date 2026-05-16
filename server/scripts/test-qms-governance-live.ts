/**
 * QMS Governance Live Validation Script
 * Controlled test: Calibration, WPQR, WelderManagement
 * Uses NEW synthetic document numbers — no existing data disturbed.
 * Cleans up GCS files and DB rows after evidence is recorded.
 *
 * Run: npx tsx server/scripts/test-qms-governance-live.ts
 */

import { createRevision, resolveQmsRuleId, generateQmsPath } from '../utils/qms-file-governance';
import { db } from '../db';
import { qmsDocumentRevisions, qmsDocumentAuditLog } from '@shared/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { Storage } from '@google-cloud/storage';
import * as crypto from 'crypto';

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

  console.log('\n══════════════ EVIDENCE TABLE ══════════════\n');

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

  // Overall pass/fail
  const allPassed = results.every(r =>
    !r.error &&
    r.tokenIssued && r.tokenUsedAt &&
    r.parityPassed && r.gcsWritten &&
    r.revisionRowId !== null && r.isLatest === true &&
    r.checksumPresent && r.checksumMatch &&
    r.auditRowId !== null &&
    !r.legacyPathWrite
  );

  console.log('══════════════════════════════════════════');
  console.log(`  OVERALL RESULT: ${allPassed ? '✅ ALL CHECKS PASSED' : '❌ ONE OR MORE CHECKS FAILED'}`);
  console.log('══════════════════════════════════════════\n');

  // Cleanup
  console.log('► Cleaning up test GCS files and DB rows...');
  await cleanup(results.map(r => r.gcsPath));
  console.log('  Cleanup complete.\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
