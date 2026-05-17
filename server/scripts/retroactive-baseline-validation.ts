/**
 * Retroactive Baseline Validation
 * ─────────────────────────────────────────────────────────────────────────────
 * Populates validation_evidence on all seeded active v1 versions that currently
 * have NULL evidence. Runs Zero-Trust Checks 1–7 via runZeroTrustValidation(),
 * then merges { source: 'baseline_seed', validationMode: 'retroactive' } before
 * writing.
 *
 * Usage:
 *   npx tsx server/scripts/retroactive-baseline-validation.ts
 *   npx tsx server/scripts/retroactive-baseline-validation.ts --force
 *
 * --force  Re-processes versions that already have validation_evidence.
 *
 * Guarantees:
 *   - Only writes to validation_evidence column
 *   - status, activated_at, version_number, path_template never touched
 *   - Idempotent: default mode skips already-validated versions
 *   - No lifecycle transitions, no audit log entries, no routing changes
 *   - No dry-run required
 *   - Exit 0 if all processed passed; Exit 1 if any FAIL
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { db } from '../db';
import { gcsGovernanceRuleVersions, gcsGovernanceRules } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { runZeroTrustValidation } from '../services/gcs-governance-zero-trust';

const FORCE = process.argv.includes('--force');

interface EvidenceResult {
  ruleId: number;
  versionId: number;
  moduleKey: string;
  documentType: string;
  overall: 'PASS' | 'FAIL';
  failedChecks: string[];
  skipped: boolean;
  error?: string;
}

async function run() {
  const startedAt = new Date().toISOString();
  console.log('');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('  Retroactive Baseline Validation');
  console.log(`  Started : ${startedAt}`);
  console.log(`  Mode    : ${FORCE ? '--force (re-process all)' : 'default (skip already-validated)'}`);
  console.log('══════════════════════════════════════════════════════════════════');

  // 1. Fetch all active v1 versions joined with rule metadata
  const activeV1 = await db
    .select({
      versionId: gcsGovernanceRuleVersions.id,
      ruleId: gcsGovernanceRuleVersions.ruleId,
      versionNumber: gcsGovernanceRuleVersions.versionNumber,
      pathTemplate: gcsGovernanceRuleVersions.pathTemplate,
      validationEvidence: gcsGovernanceRuleVersions.validationEvidence,
      moduleKey: gcsGovernanceRules.moduleKey,
      documentType: gcsGovernanceRules.documentType,
    })
    .from(gcsGovernanceRuleVersions)
    .innerJoin(gcsGovernanceRules, eq(gcsGovernanceRules.id, gcsGovernanceRuleVersions.ruleId))
    .where(
      and(
        eq(gcsGovernanceRuleVersions.status, 'active'),
        eq(gcsGovernanceRuleVersions.versionNumber, 1),
      )
    )
    .orderBy(gcsGovernanceRules.moduleKey, gcsGovernanceRules.documentType);

  console.log(`\n  Found ${activeV1.length} active v1 version(s) to process.\n`);

  const results: EvidenceResult[] = [];
  let processed = 0;
  let skipped = 0;
  let passed = 0;
  let failed = 0;
  let errored = 0;

  for (const ver of activeV1) {
    const tag = `${ver.moduleKey}/${ver.documentType}`;

    // Idempotency check
    if (!FORCE && ver.validationEvidence !== null) {
      console.log(`  [SKIP]  ${tag} — already has validation_evidence`);
      results.push({
        ruleId: ver.ruleId,
        versionId: ver.versionId,
        moduleKey: ver.moduleKey,
        documentType: ver.documentType,
        overall: ((ver.validationEvidence as any)?.overall as 'PASS' | 'FAIL') ?? 'PASS',
        failedChecks: [],
        skipped: true,
      });
      skipped++;
      continue;
    }

    try {
      // Run Zero-Trust Checks 1–7 (no dry-run, no lifecycle transition)
      const ztResult = await runZeroTrustValidation(ver.versionId, null);

      // Merge retroactive metadata markers
      const payload = {
        ...ztResult,
        source: 'baseline_seed',
        validationMode: 'retroactive',
      };

      // Write ONLY to validation_evidence — no other columns
      await db.update(gcsGovernanceRuleVersions)
        .set({ validationEvidence: payload as any })
        .where(eq(gcsGovernanceRuleVersions.id, ver.versionId));

      const failedChecks = ztResult.checks.filter(c => !c.passed).map(c => c.checkName);
      const icon = ztResult.overall === 'PASS' ? '✓' : '✗';
      const label = ztResult.overall === 'PASS' ? '[PASS]' : '[FAIL]';

      console.log(`  ${icon} ${label}  ${tag.padEnd(40)} checks=${ztResult.checks.length} failed=${failedChecks.length}${failedChecks.length > 0 ? ' (' + failedChecks.join(', ') + ')' : ''}`);

      results.push({
        ruleId: ver.ruleId,
        versionId: ver.versionId,
        moduleKey: ver.moduleKey,
        documentType: ver.documentType,
        overall: ztResult.overall,
        failedChecks,
        skipped: false,
      });

      processed++;
      if (ztResult.overall === 'PASS') passed++;
      else failed++;

    } catch (err: any) {
      console.error(`  [ERROR] ${tag} — ${err.message}`);
      results.push({
        ruleId: ver.ruleId,
        versionId: ver.versionId,
        moduleKey: ver.moduleKey,
        documentType: ver.documentType,
        overall: 'FAIL',
        failedChecks: ['script_error'],
        skipped: false,
        error: err.message,
      });
      errored++;
      failed++;
    }
  }

  const finishedAt = new Date().toISOString();

  // Summary
  console.log('');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('──────────────────────────────────────────────────────────────────');
  console.log(`  Total versions   : ${activeV1.length}`);
  console.log(`  Processed        : ${processed}`);
  console.log(`  Skipped          : ${skipped}`);
  console.log(`  PASS             : ${passed}`);
  console.log(`  FAIL             : ${failed}`);
  console.log(`  Errors           : ${errored}`);
  console.log(`  Finished         : ${finishedAt}`);
  console.log('══════════════════════════════════════════════════════════════════');

  // Write evidence JSON
  const evidencePayload = {
    ranAt: startedAt,
    finishedAt,
    force: FORCE,
    totalVersions: activeV1.length,
    processed,
    skipped,
    passed,
    failed,
    errored,
    results,
  };

  const docsDir = path.resolve(process.cwd(), 'docs');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  const evidencePath = path.join(docsDir, 'retroactive-baseline-validation-evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidencePayload, null, 2));
  console.log(`\n  Evidence JSON written to: ${evidencePath}`);
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
