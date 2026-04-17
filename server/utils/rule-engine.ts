/**
 * DVS Step 3 — Rule Engine
 *
 * Deterministic rule evaluation layer.
 * Reads only from drawing_extractions — no raw file access.
 * Rule results feed the Agent layer (Step 4).
 */

import { EXTRACTION_ENGINE_VERSION } from './ole-extractor';
import type { DrawingExtraction } from '@shared/schema';

// ─── Version ──────────────────────────────────────────────────────────────────

export const RULE_ENGINE = 'dvs-rule-engine';
export const RULE_ENGINE_VERSION = '1.0.0';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuleCategory = 'identity' | 'metadata' | 'completeness';
export type RuleSeverity = 'CRITICAL' | 'STANDARD';
export type RuleVerdict = 'PASS' | 'WARN' | 'FAIL';
export type ExtractionGate = 'ALLOW' | 'WARN' | 'BLOCK';
export type OverallVerdict = 'PASS' | 'WARN' | 'FAIL';

export interface RuleResult {
  ruleId: string;
  category: RuleCategory;
  severity: RuleSeverity;
  description: string;
  verdict: RuleVerdict;
  evaluatedValue: any;
  expectedValue: any;
  detail: string | null;
}

export interface ExtractionGateResult {
  gate: ExtractionGate;
  reason: string;
  detail: string;
}

export interface RuleEngineOutput {
  extractionGate: ExtractionGate;
  extractionGateReason: string;
  overallVerdict: OverallVerdict;
  ruleResults: RuleResult[];
}

// ─── Extraction gate ──────────────────────────────────────────────────────────

export function computeExtractionGate(extraction: DrawingExtraction | null): ExtractionGateResult {
  if (!extraction) {
    return {
      gate: 'BLOCK',
      reason: 'no_extraction_record',
      detail: 'No extraction record exists for this drawing revision. Run extraction first.',
    };
  }
  if (extraction.extractionStatus === 'pending') {
    return {
      gate: 'BLOCK',
      reason: 'extraction_pending',
      detail: 'Extraction is still in progress. Wait for completion before evaluating.',
    };
  }
  if (extraction.extractionStatus === 'failed') {
    return {
      gate: 'WARN',
      reason: 'extraction_failed',
      detail: 'Extraction failed — no metadata could be read from the file. All metadata-dependent rules will produce FAIL verdicts.',
    };
  }
  if (extraction.extractionEngineVersion !== EXTRACTION_ENGINE_VERSION) {
    return {
      gate: 'BLOCK',
      reason: 'extraction_version_stale',
      detail: `Extraction engine version ${extraction.extractionEngineVersion} is stale. Current version is ${EXTRACTION_ENGINE_VERSION}. Re-run extraction before evaluating.`,
    };
  }
  if (extraction.extractionStatus === 'partial') {
    return {
      gate: 'WARN',
      reason: 'extraction_partial',
      detail: 'Extraction completed with partial results. Some rules may produce WARN instead of FAIL due to absent fields.',
    };
  }
  return {
    gate: 'ALLOW',
    reason: 'extraction_success',
    detail: 'Extraction completed successfully. Full evaluation will proceed.',
  };
}

// ─── Rule helpers ─────────────────────────────────────────────────────────────

function notEmpty(v: any): boolean {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

interface MakeRuleOpts {
  ruleId: string;
  category: RuleCategory;
  severity: RuleSeverity;
  description: string;
  evaluatedValue: any;
  expectedValue: any;
  pass: boolean;
  absentDueToPartial?: boolean;
  failDetail: string;
  passDetail?: string | null;
  partialDetail?: string;
}

function makeRule(opts: MakeRuleOpts): RuleResult {
  const {
    pass, absentDueToPartial, failDetail, passDetail, partialDetail,
    ruleId, category, severity, description, evaluatedValue, expectedValue,
  } = opts;

  const base = { ruleId, category, severity, description, evaluatedValue, expectedValue };

  if (pass) {
    return { ...base, verdict: 'PASS', detail: passDetail ?? null };
  }
  if (absentDueToPartial) {
    return {
      ...base,
      verdict: 'WARN',
      detail: partialDetail ?? 'Metadata could not be extracted from source file; automated verification is incomplete.',
    };
  }
  // CRITICAL fails become FAIL; STANDARD fails become WARN
  const verdict: RuleVerdict = severity === 'CRITICAL' ? 'FAIL' : 'WARN';
  return { ...base, verdict, detail: failDetail };
}

// ─── Rule set v1.0.0 ─────────────────────────────────────────────────────────

/**
 * Evaluate all 13 rules against the extraction record.
 *
 * @param extraction          The drawing_extractions row (never null here — gate check precedes this)
 * @param isPartialGate       True when extraction gate is WARN (partial); fields absent due to
 *                            partial extraction produce WARN instead of FAIL
 * @param registeredDrawingNumber  The drawing_number registered on drawing_revisions
 * @param registeredRevision       The revision registered on drawing_revisions
 */
export function evaluateRules(
  extraction: DrawingExtraction,
  isPartialGate: boolean,
  registeredDrawingNumber: string,
  registeredRevision: string,
): RuleResult[] {
  const cp  = (extraction.customProperties  ?? {}) as Record<string, string | null>;
  const dp  = (extraction.documentProperties ?? {}) as Record<string, string | null>;
  const vr  = (extraction.validationResults  ?? {}) as Record<string, any>;
  const si  = (extraction.sheetInfo          ?? []) as any[];
  const wrn = (extraction.warnings           ?? []) as any[];

  return [

    // ── Category: identity ───────────────────────────────────────────────────
    // Verifies the drawing is what it claims to be

    makeRule({
      ruleId: 'DRAWING_NUMBER_PRESENT',
      category: 'identity',
      severity: 'CRITICAL',
      description: 'Drawing number is present in custom properties',
      evaluatedValue: cp.DrawingNumber ?? null,
      expectedValue: 'non-empty string',
      pass: notEmpty(cp.DrawingNumber),
      absentDueToPartial: isPartialGate && !notEmpty(cp.DrawingNumber),
      failDetail: 'DrawingNumber is absent or empty in custom properties.',
      partialDetail: 'DrawingNumber absent; attributed to partial extraction.',
    }),

    makeRule({
      ruleId: 'DRAWING_NUMBER_MATCH',
      category: 'identity',
      severity: 'CRITICAL',
      description: 'Extracted DrawingNumber matches registered drawing number',
      evaluatedValue: cp.DrawingNumber ?? null,
      expectedValue: registeredDrawingNumber,
      pass: vr.drawingNumberMatch === true,
      absentDueToPartial: isPartialGate && vr.drawingNumberMatch === null,
      failDetail: `Extracted DrawingNumber "${cp.DrawingNumber ?? '(absent)'}" does not match registered value "${registeredDrawingNumber}".`,
      partialDetail: 'DrawingNumber match could not be evaluated; attributed to partial extraction.',
    }),

    makeRule({
      ruleId: 'REVISION_PRESENT',
      category: 'identity',
      severity: 'CRITICAL',
      description: 'Revision is present in custom properties',
      evaluatedValue: cp.Revision ?? null,
      expectedValue: 'non-empty string',
      pass: notEmpty(cp.Revision),
      absentDueToPartial: isPartialGate && !notEmpty(cp.Revision),
      failDetail: 'Revision is absent or empty in custom properties.',
      partialDetail: 'Revision absent; attributed to partial extraction.',
    }),

    makeRule({
      ruleId: 'REVISION_MATCH',
      category: 'identity',
      severity: 'CRITICAL',
      description: 'Extracted Revision matches registered revision',
      evaluatedValue: cp.Revision ?? null,
      expectedValue: registeredRevision,
      pass: vr.revisionMatch === true,
      absentDueToPartial: isPartialGate && vr.revisionMatch === null,
      failDetail: `Extracted Revision "${cp.Revision ?? '(absent)'}" does not match registered value "${registeredRevision}".`,
      partialDetail: 'Revision match could not be evaluated; attributed to partial extraction.',
    }),

    makeRule({
      ruleId: 'APPLICATION_NAME',
      category: 'identity',
      severity: 'CRITICAL',
      description: 'Document was authored in SOLIDWORKS',
      evaluatedValue: dp.applicationName ?? null,
      expectedValue: 'SOLIDWORKS',
      pass: notEmpty(dp.applicationName) && dp.applicationName!.toUpperCase().includes('SOLIDWORKS'),
      absentDueToPartial: isPartialGate && !notEmpty(dp.applicationName),
      failDetail: `Application name "${dp.applicationName ?? '(absent)'}" does not match expected SOLIDWORKS.`,
      partialDetail: 'Application name absent; attributed to partial extraction.',
    }),

    // ── Category: metadata ───────────────────────────────────────────────────
    // Verifies authorship and traceability

    makeRule({
      ruleId: 'TITLE_PRESENT',
      category: 'metadata',
      severity: 'STANDARD',
      description: 'Document title is present',
      evaluatedValue: dp.title ?? null,
      expectedValue: 'non-empty string',
      pass: notEmpty(dp.title),
      absentDueToPartial: isPartialGate && !notEmpty(dp.title),
      failDetail: 'Document title is absent or empty.',
      partialDetail: 'Title absent; attributed to partial extraction.',
    }),

    makeRule({
      ruleId: 'AUTHOR_PRESENT',
      category: 'metadata',
      severity: 'STANDARD',
      description: 'Document author is present',
      evaluatedValue: dp.author ?? null,
      expectedValue: 'non-empty string',
      pass: notEmpty(dp.author),
      absentDueToPartial: isPartialGate && !notEmpty(dp.author),
      failDetail: 'Document author is absent or empty.',
      partialDetail: 'Author absent; attributed to partial extraction.',
    }),

    makeRule({
      ruleId: 'DRAWN_BY_PRESENT',
      category: 'metadata',
      severity: 'STANDARD',
      description: 'DrawnBy field is present in custom properties',
      evaluatedValue: cp.DrawnBy ?? null,
      expectedValue: 'non-empty string',
      pass: notEmpty(cp.DrawnBy),
      absentDueToPartial: isPartialGate && !notEmpty(cp.DrawnBy),
      failDetail: 'DrawnBy is absent or empty in custom properties.',
      partialDetail: 'DrawnBy absent; attributed to partial extraction.',
    }),

    makeRule({
      ruleId: 'DESCRIPTION_PRESENT',
      category: 'metadata',
      severity: 'STANDARD',
      description: 'Description is present in custom properties',
      evaluatedValue: cp.Description ?? null,
      expectedValue: 'non-empty string',
      pass: notEmpty(cp.Description),
      absentDueToPartial: isPartialGate && !notEmpty(cp.Description),
      failDetail: 'Description is absent or empty in custom properties.',
      partialDetail: 'Description absent; attributed to partial extraction.',
    }),

    // ── Category: completeness ───────────────────────────────────────────────
    // Verifies required technical content is present

    makeRule({
      ruleId: 'SHEET_INFO_PRESENT',
      category: 'completeness',
      severity: 'STANDARD',
      description: 'Sheet information is present with at least one sheet',
      evaluatedValue: Array.isArray(si) ? si.length : null,
      expectedValue: '>= 1 sheet',
      pass: Array.isArray(si) && si.length > 0,
      absentDueToPartial: isPartialGate && (!Array.isArray(si) || si.length === 0),
      failDetail: 'Sheet information is absent or empty.',
      partialDetail: 'Sheet info absent; attributed to partial extraction.',
    }),

    makeRule({
      ruleId: 'SCALE_PRESENT',
      category: 'completeness',
      severity: 'STANDARD',
      description: 'Scale is present in custom properties',
      evaluatedValue: cp.Scale ?? null,
      expectedValue: 'non-empty string',
      pass: notEmpty(cp.Scale),
      absentDueToPartial: isPartialGate && !notEmpty(cp.Scale),
      failDetail: 'Scale is absent or empty in custom properties.',
      partialDetail: 'Scale absent; attributed to partial extraction.',
    }),

    makeRule({
      ruleId: 'SHEET_SIZE_PRESENT',
      category: 'completeness',
      severity: 'STANDARD',
      description: 'Sheet size is present in custom properties',
      evaluatedValue: cp.SheetSize ?? null,
      expectedValue: 'non-empty string',
      pass: notEmpty(cp.SheetSize),
      absentDueToPartial: isPartialGate && !notEmpty(cp.SheetSize),
      failDetail: 'SheetSize is absent or empty in custom properties.',
      partialDetail: 'SheetSize absent; attributed to partial extraction.',
    }),

    makeRule({
      ruleId: 'EXTRACTION_WARNINGS_ABSENT',
      category: 'completeness',
      severity: 'STANDARD',
      description: 'No extraction warnings present',
      evaluatedValue: wrn.length,
      expectedValue: 0,
      pass: wrn.length === 0,
      failDetail: `Extraction produced ${wrn.length} warning(s): ${wrn.map((w: any) => w.type ?? 'unknown').join(', ')}.`,
    }),
  ];
}

// ─── Overall verdict ──────────────────────────────────────────────────────────

export function computeOverallVerdict(ruleResults: RuleResult[]): OverallVerdict {
  if (ruleResults.some(r => r.verdict === 'FAIL')) return 'FAIL';
  if (ruleResults.some(r => r.verdict === 'WARN')) return 'WARN';
  return 'PASS';
}
