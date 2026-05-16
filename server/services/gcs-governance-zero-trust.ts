/**
 * GCS Governance Zero-Trust Validation Service
 * Phase 0 — Template-intrinsic validation (no builder dependency).
 * Runs all 7 checks against a candidate rule version before approval.
 */

import { db } from '../db';
import {
  gcsGovernanceRuleVersions,
  gcsGovernanceRules,
  gcsGovernanceTokenRegistry,
  gcsUploadTokens,
} from '@shared/schema';
import { eq, and, ne } from 'drizzle-orm';
import { extractTemplateTokens, resolvePathTemplate } from './gcs-governance-service';

// ─── Types ────────────────────────────────────────────────────────────────

export interface ZeroTrustCheckResult {
  checkName: string;
  passed: boolean;
  detail: string;
  highImpact?: boolean;
}

export interface ZeroTrustValidationResult {
  overall: 'PASS' | 'FAIL';
  checks: ZeroTrustCheckResult[];
  ranAt: string;
  ranBy: number | null;
  syntheticExamples?: string[];
}

// Approved root prefixes — any other root requires a documented override
const APPROVED_ROOTS = [
  'TPEL/',
  'QMS/',
  'TPEL/STAGING/',
  'TPEL/SAP/',
  'TPEL/LEGAL/',
  'TPEL/HR/',
  'TPEL/ADMIN/HR/',
  'TPEL/FINANCE/',
  'TPEL/DESIGN/',
  'TPEL/SALES/',
  'Accounts/',            // transitional — flagged in notes
  'THERMOPAC_PROJECTS/',  // legacy read-only
  'epc-slddrw/',          // internal ephemeral
];

// ─── Main validation function ─────────────────────────────────────────────

export async function runZeroTrustValidation(
  versionId: number,
  actorId: number | null,
): Promise<ZeroTrustValidationResult> {
  const checks: ZeroTrustCheckResult[] = [];
  const ranAt = new Date().toISOString();

  const [version] = await db
    .select()
    .from(gcsGovernanceRuleVersions)
    .where(eq(gcsGovernanceRuleVersions.id, versionId))
    .limit(1);

  if (!version) {
    return {
      overall: 'FAIL',
      checks: [{ checkName: 'version_load', passed: false, detail: `Version ${versionId} not found` }],
      ranAt,
      ranBy: actorId,
    };
  }

  const [rule] = await db
    .select()
    .from(gcsGovernanceRules)
    .where(eq(gcsGovernanceRules.id, version.ruleId))
    .limit(1);

  if (!rule) {
    return {
      overall: 'FAIL',
      checks: [{ checkName: 'rule_load', passed: false, detail: `Rule ${version.ruleId} not found` }],
      ranAt,
      ranBy: actorId,
    };
  }

  // ── Check 1: Token completeness ──────────────────────────────────────────
  const templateTokens = extractTemplateTokens(version.pathTemplate);
  const registryTokens = await db.select().from(gcsGovernanceTokenRegistry);
  const activeTokenNames = new Set(registryTokens.filter(t => t.active).map(t => t.tokenName));
  const unknownTokens = templateTokens.filter(t => !activeTokenNames.has(t));
  checks.push({
    checkName: 'token_completeness',
    passed: unknownTokens.length === 0,
    detail: unknownTokens.length === 0
      ? `All ${templateTokens.length} token(s) found in registry and active`
      : `Unknown or inactive token(s): ${unknownTokens.map(t => `{${t}}`).join(', ')}`,
  });

  // ── Check 2: Root prefix conformance ─────────────────────────────────────
  const rootOk = APPROVED_ROOTS.some(r => version.pathTemplate.startsWith(r));
  checks.push({
    checkName: 'root_prefix',
    passed: rootOk,
    detail: rootOk
      ? `Root prefix "${version.rootPrefix}" is on the approved list`
      : `Root prefix "${version.rootPrefix}" is not on the approved list (${APPROVED_ROOTS.join(', ')}). Add a documented override to notes.`,
  });

  // ── Check 3: Synthetic path generation (3 scenarios) ────────────────────
  const syntheticExamples: string[] = [];
  let syntheticPassed = true;
  let syntheticDetail = '';
  try {
    // Build token values for each scenario using registry example values
    const tokenMap = Object.fromEntries(registryTokens.map(t => [t.tokenName, t.exampleValue]));
    const minTokenMap = Object.fromEntries(registryTokens.map(t => [t.tokenName, t.exampleValue.slice(0, 3) || 'x']));
    const upperTokenMap = Object.fromEntries(registryTokens.map(t => [t.tokenName, t.exampleValue.toUpperCase()]));

    const scenarios = [tokenMap, minTokenMap, upperTokenMap];
    const pathIssues: string[] = [];
    const generatedPaths: string[] = [];

    for (const scenario of scenarios) {
      const path = resolvePathTemplate(version.pathTemplate, scenario);
      generatedPaths.push(path);
      if (path.includes('{')) pathIssues.push(`Unresolved tokens in: ${path}`);
      if (path.includes('//')) pathIssues.push(`Double slash in: ${path}`);
      if (path.startsWith('/')) pathIssues.push(`Path starts with slash: ${path}`);
    }
    syntheticExamples.push(...generatedPaths);

    // Check DB token ledger for path conflicts (approximation — not a full GCS scan)
    if (generatedPaths.length > 0) {
      const existingTokens = await db.select({ resolvedPath: gcsUploadTokens.resolvedPath })
        .from(gcsUploadTokens)
        .limit(1000);
      const existingPaths = new Set(existingTokens.map(t => t.resolvedPath));
      for (const p of generatedPaths) {
        if (existingPaths.has(p)) {
          pathIssues.push(`Synthetic path already exists in token ledger: ${p}`);
        }
      }
    }

    if (pathIssues.length > 0) {
      syntheticPassed = false;
      syntheticDetail = pathIssues.join('; ');
    } else {
      syntheticDetail = `3 synthetic examples generated and validated: ${generatedPaths[0]} (+ 2 more)`;
    }
  } catch (err: any) {
    syntheticPassed = false;
    syntheticDetail = `Synthetic generation error: ${err.message}`;
  }
  checks.push({ checkName: 'synthetic_paths', passed: syntheticPassed, detail: syntheticDetail });

  // ── Check 4: Path uniqueness across active rules ─────────────────────────
  let uniquenessPassed = true;
  let uniquenessDetail = '';
  try {
    const otherActiveVersions = await db
      .select()
      .from(gcsGovernanceRuleVersions)
      .where(and(
        eq(gcsGovernanceRuleVersions.status, 'active'),
        ne(gcsGovernanceRuleVersions.id, versionId),
        ne(gcsGovernanceRuleVersions.ruleId, version.ruleId),
      ));

    const tokenMap = Object.fromEntries(registryTokens.map(t => [t.tokenName, t.exampleValue]));
    const myPath = resolvePathTemplate(version.pathTemplate, tokenMap);
    const conflicts: string[] = [];

    for (const other of otherActiveVersions) {
      const otherPath = resolvePathTemplate(other.pathTemplate, tokenMap);
      if (myPath === otherPath && !myPath.includes('{')) {
        conflicts.push(`Conflicts with rule ${other.ruleId} version ${other.versionNumber}`);
      }
    }

    if (conflicts.length > 0) {
      uniquenessPassed = false;
      uniquenessDetail = conflicts.join('; ');
    } else {
      uniquenessDetail = `No path conflicts found across ${otherActiveVersions.length} other active rule version(s)`;
    }
  } catch (err: any) {
    uniquenessPassed = false;
    uniquenessDetail = `Uniqueness check error: ${err.message}`;
  }
  checks.push({ checkName: 'path_uniqueness', passed: uniquenessPassed, detail: uniquenessDetail });

  // ── Check 5: Extension safety ─────────────────────────────────────────────
  let extPassed = true;
  let extDetail = '';
  if (version.pathTemplate.includes('{ext}')) {
    const extToken = registryTokens.find(t => t.tokenName === 'ext');
    if (!extToken || !extToken.active) {
      extPassed = false;
      extDetail = '{ext} token not found in registry or is inactive';
    } else if (!extToken.sourceDescription.toLowerCase().includes('mime') && !extToken.sourceDescription.toLowerCase().includes('content')) {
      extDetail = `{ext} token found but source description may not indicate mime-type derivation: "${extToken.sourceDescription}"`;
    } else {
      extDetail = `{ext} token is active and sourced from content-type at upload time`;
    }
  } else {
    const literalExtMatch = version.pathTemplate.match(/\.\w{2,5}$/);
    if (literalExtMatch) {
      extDetail = `Literal extension "${literalExtMatch[0]}" detected. Confirm this is intentional (PDF generation flows only) — document in notes.`;
    } else {
      extDetail = 'No {ext} token and no literal extension — path has no file extension (acceptable for directories or extensionless objects)';
    }
  }
  checks.push({ checkName: 'extension_safety', passed: extPassed, detail: extDetail });

  // ── Check 6: Revision mode consistency ───────────────────────────────────
  const hasRevToken = version.pathTemplate.includes('{rev}');
  const revModeIsNone = version.revisionMode === 'none';
  const revConsistent = hasRevToken ? !revModeIsNone : revModeIsNone;
  checks.push({
    checkName: 'revision_mode',
    passed: revConsistent,
    detail: revConsistent
      ? `Consistent: {rev} in template=${hasRevToken}, revisionMode="${version.revisionMode}"`
      : `Inconsistent: {rev} in template=${hasRevToken} but revisionMode="${version.revisionMode}". ` +
        (hasRevToken ? 'revisionMode must not be "none" when {rev} is present.' : 'revisionMode must be "none" when {rev} is absent.'),
  });

  // ── Check 7: High-impact diff detection ──────────────────────────────────
  let diffPassed = true;
  let diffDetail = '';
  let isHighImpact = false;

  const prevActive = await db
    .select()
    .from(gcsGovernanceRuleVersions)
    .where(and(
      eq(gcsGovernanceRuleVersions.ruleId, version.ruleId),
      eq(gcsGovernanceRuleVersions.status, 'active'),
    ))
    .limit(1);

  const securityTokens = ['CC', 'CO', 'FY', 'NNN', 'DocNumber', 'rev'];

  if (prevActive.length === 0) {
    diffDetail = 'No previous active version — this is the first version being activated (v1 bootstrap)';
  } else {
    const prev = prevActive[0];
    const oldTemplate = prev.pathTemplate;
    const newTemplate = version.pathTemplate;

    if (oldTemplate === newTemplate && prev.rootPrefix === version.rootPrefix) {
      diffDetail = 'pathTemplate and rootPrefix are identical to current active version';
    } else {
      const removedTokens = securityTokens.filter(
        t => oldTemplate.includes(`{${t}}`) && !newTemplate.includes(`{${t}}`)
      );
      const rootChanged = prev.rootPrefix !== version.rootPrefix;

      if (rootChanged || removedTokens.length > 0) {
        isHighImpact = true;
        diffPassed = true; // still PASS but flagged as HIGH_IMPACT
        diffDetail = `HIGH_IMPACT: ${[
          rootChanged ? `root prefix changed from "${prev.rootPrefix}" to "${version.rootPrefix}"` : '',
          removedTokens.length > 0 ? `security tokens removed: ${removedTokens.map(t => `{${t}}`).join(', ')}` : '',
        ].filter(Boolean).join('; ')}. Second Superuser approver required.`;
      } else {
        diffDetail = `Template changed (non-security diff). Old: "${oldTemplate}" → New: "${newTemplate}"`;
      }
    }
  }
  checks.push({ checkName: 'high_impact_diff', passed: diffPassed, detail: diffDetail, highImpact: isHighImpact });

  const overall = checks.every(c => c.passed) ? 'PASS' : 'FAIL';

  return { overall, checks, ranAt, ranBy: actorId, syntheticExamples };
}
