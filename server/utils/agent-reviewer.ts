/**
 * DVS Step 4 — Agent Reviewer
 *
 * Advisory-only layer. Reads rule_results, extraction_gate, and overall_verdict
 * from a rule_evaluations row and produces a structured plain-language report
 * via OpenAI. Has no control authority — produces guidance for the human reviewer.
 *
 * Strict contracts:
 *  - AI input: rule_results, extraction_gate, overall_verdict only
 *  - AI response: exact JSON schema; any deviation → throw (caller writes nothing)
 *  - raw_response capped at 2000 characters
 *  - overall_assessment derived server-side; AI does not set it
 */

import OpenAI from 'openai';
import type { RuleEvaluation } from '@shared/schema';

// ─── Version ──────────────────────────────────────────────────────────────────

export const AGENT_VERSION = '1.0.0';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OverallAssessment = 'PASS_SUMMARY' | 'WARN_SUMMARY' | 'FAIL_SUMMARY';

export interface AgentReportParsed {
  summary: string;
  criticalFailures: Array<{ rule_id: string; explanation: string }>;
  warnings: Array<{ rule_id: string; explanation: string }>;
  recommendations: string;
  overallAssessment: OverallAssessment;
  rawResponse: string;
}

// ─── overall_assessment — derived server-side; AI does not set this ────────────

export function deriveOverallAssessment(overallVerdict: string): OverallAssessment {
  if (overallVerdict === 'PASS') return 'PASS_SUMMARY';
  if (overallVerdict === 'WARN') return 'WARN_SUMMARY';
  return 'FAIL_SUMMARY';
}

// ─── Response validation ──────────────────────────────────────────────────────

type ValidationResult =
  | { valid: true; data: { summary: string; critical_failures: any[]; warnings: any[]; recommendations: string } }
  | { valid: false; reason: string };

function validateAgentResponse(parsed: any, knownRuleIds: Set<string>): ValidationResult {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { valid: false, reason: 'Response is not a JSON object' };
  }

  const allowed = new Set(['summary', 'critical_failures', 'warnings', 'recommendations']);
  for (const k of Object.keys(parsed)) {
    if (!allowed.has(k)) {
      return { valid: false, reason: `Unexpected top-level key: "${k}"` };
    }
  }

  // summary
  if (typeof parsed.summary !== 'string' || parsed.summary.trim().length < 10) {
    return { valid: false, reason: 'summary must be a non-empty string (min 10 chars)' };
  }
  if (parsed.summary.length > 300) {
    return { valid: false, reason: `summary exceeds 300 characters (got ${parsed.summary.length})` };
  }

  // critical_failures
  if (!Array.isArray(parsed.critical_failures)) {
    return { valid: false, reason: 'critical_failures must be an array' };
  }
  for (const item of parsed.critical_failures) {
    if (typeof item !== 'object' || item === null) {
      return { valid: false, reason: 'critical_failures entries must be objects' };
    }
    if (typeof item.rule_id !== 'string') {
      return { valid: false, reason: 'critical_failures entry missing string rule_id' };
    }
    if (!knownRuleIds.has(item.rule_id)) {
      return { valid: false, reason: `Unknown rule_id in critical_failures: "${item.rule_id}"` };
    }
    if (typeof item.explanation !== 'string') {
      return { valid: false, reason: `critical_failures entry for "${item.rule_id}" missing string explanation` };
    }
    if (item.explanation.length > 200) {
      return { valid: false, reason: `explanation for "${item.rule_id}" exceeds 200 characters` };
    }
  }

  // warnings
  if (!Array.isArray(parsed.warnings)) {
    return { valid: false, reason: 'warnings must be an array' };
  }
  for (const item of parsed.warnings) {
    if (typeof item !== 'object' || item === null) {
      return { valid: false, reason: 'warnings entries must be objects' };
    }
    if (typeof item.rule_id !== 'string') {
      return { valid: false, reason: 'warnings entry missing string rule_id' };
    }
    if (!knownRuleIds.has(item.rule_id)) {
      return { valid: false, reason: `Unknown rule_id in warnings: "${item.rule_id}"` };
    }
    if (typeof item.explanation !== 'string') {
      return { valid: false, reason: `warnings entry for "${item.rule_id}" missing string explanation` };
    }
    if (item.explanation.length > 200) {
      return { valid: false, reason: `explanation for "${item.rule_id}" exceeds 200 characters` };
    }
  }

  // recommendations
  if (typeof parsed.recommendations !== 'string' || parsed.recommendations.trim().length < 10) {
    return { valid: false, reason: 'recommendations must be a non-empty string (min 10 chars)' };
  }
  if (parsed.recommendations.length > 500) {
    return { valid: false, reason: `recommendations exceeds 500 characters (got ${parsed.recommendations.length})` };
  }

  return { valid: true, data: parsed };
}

// ─── OpenAI client — timeout enforced at SDK level ────────────────────────────

const openai = new OpenAI({ timeout: 30_000 });

const SYSTEM_PROMPT = `You are a drawing verification assistant. You will receive the output of an automated rule engine evaluation. Your input is: overall_verdict (PASS/WARN/FAIL), extraction_gate (ALLOW/WARN/BLOCK), and an array of rule_results. Each rule result has: ruleId, category, severity, verdict, evaluatedValue, expectedValue, and detail. Your output must be a JSON object with exactly four keys: summary (string, max 300 chars), critical_failures (array of {rule_id, explanation} for FAIL verdicts, max 200 chars each), warnings (array of {rule_id, explanation} for WARN verdicts, max 200 chars each), recommendations (string, max 500 chars). Base your output only on the data provided. Do not introduce assumptions, infer drawing quality, or reference engineering standards not mentioned in the rule results.`;

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Call the AI agent with the rule evaluation record.
 * Throws on any failure — caller must catch and return HTTP 500 without writing to DB.
 */
export async function runAgentReview(evaluation: RuleEvaluation): Promise<AgentReportParsed> {
  const ruleResults = (evaluation.ruleResults ?? []) as any[];
  const knownRuleIds = new Set<string>(ruleResults.map((r: any) => r.ruleId as string));

  // Build prompt — strictly rule_results, extraction_gate, overall_verdict only
  const userContent = JSON.stringify({
    overall_verdict:    evaluation.overallVerdict,
    extraction_gate:    evaluation.extractionGate,
    rule_results:       ruleResults,
  }, null, 2);

  let rawText: string;
  try {
    const completion = await openai.chat.completions.create({
      model:           'gpt-4o-mini',
      temperature:     0,
      max_tokens:      600,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userContent },
      ],
    });
    rawText = completion.choices[0]?.message?.content ?? '';
  } catch (err: any) {
    throw new Error(`OpenAI call failed: ${err.message ?? String(err)}`);
  }

  if (!rawText || rawText.trim() === '') {
    throw new Error('OpenAI returned an empty response');
  }

  // Cap raw_response at 2000 characters for audit storage
  const RAW_CAP = 2000;
  const rawResponse = rawText.length > RAW_CAP
    ? rawText.slice(0, RAW_CAP - 13) + '[TRUNCATED]'
    : rawText;

  // Parse JSON
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`OpenAI response is not valid JSON: ${rawText.slice(0, 200)}`);
  }

  // Strict schema validation
  const validation = validateAgentResponse(parsed, knownRuleIds);
  if (!validation.valid) {
    throw new Error(`OpenAI response failed schema validation: ${validation.reason}`);
  }

  const data = (validation as { valid: true; data: any }).data;

  return {
    summary:             data.summary,
    criticalFailures:    data.critical_failures,
    warnings:            data.warnings,
    recommendations:     data.recommendations,
    overallAssessment:   deriveOverallAssessment(evaluation.overallVerdict),
    rawResponse,
  };
}
