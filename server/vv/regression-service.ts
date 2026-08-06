/**
 * V&V Phase A — Regression Harness.
 *
 * Runs frozen regression cases against the live calculation engines through
 * the engine registry, and compares the full result snapshot against the
 * stored expected snapshot with numeric tolerances. Engines are NEVER
 * modified — they are invoked exactly as the design service invokes them,
 * with the case's frozen input snapshot.
 *
 * Expected values carry explicit provenance (expected_source). Regression
 * demonstrates REPRODUCIBILITY against the accepted baseline — it is
 * verification evidence, not engineering validation.
 */
import { pool } from '../db';
import { engineRegistry } from '../engine-framework/registry';
// Engine self-registration side effects:
import '../engines/llx';
import '../engines/common';

export interface Deviation {
  path: string;
  expected: unknown;
  actual: unknown;
  kind: 'value' | 'type' | 'missing' | 'extra';
}

const DEFAULT_REL_TOL = 1e-9;
const DEFAULT_ABS_TOL = 1e-12;
const MAX_DEVIATIONS = 100;

/** Deep-compare actual vs expected; numeric leaves use tolerances. */
export function deepCompare(
  expected: unknown,
  actual: unknown,
  path: string,
  out: Deviation[],
  relTol: number,
  absTol: number,
  ignorePaths: string[],
): void {
  if (out.length >= MAX_DEVIATIONS) return;
  if (ignorePaths.some((p) => path === p || path.startsWith(p + '.'))) return;

  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Number.isNaN(expected) && Number.isNaN(actual)) return;
    const diff = Math.abs(actual - expected);
    if (diff > Math.max(absTol, relTol * Math.abs(expected))) {
      out.push({ path, expected, actual, kind: 'value' });
    }
    return;
  }
  if (expected === null || actual === null || typeof expected !== 'object' || typeof actual !== 'object') {
    if (typeof expected !== typeof actual) {
      out.push({ path, expected, actual, kind: 'type' });
    } else if (expected !== actual) {
      out.push({ path, expected, actual, kind: 'value' });
    }
    return;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    const e = expected as unknown[]; const a = actual as unknown[];
    if (!Array.isArray(e) || !Array.isArray(a)) { out.push({ path, expected, actual, kind: 'type' }); return; }
    if (e.length !== a.length) { out.push({ path: `${path}.length`, expected: e.length, actual: a.length, kind: 'value' }); }
    const n = Math.min(e.length, a.length);
    for (let i = 0; i < n; i++) deepCompare(e[i], a[i], `${path}[${i}]`, out, relTol, absTol, ignorePaths);
    return;
  }
  const eObj = expected as Record<string, unknown>; const aObj = actual as Record<string, unknown>;
  for (const k of Object.keys(eObj)) {
    const sub = path ? `${path}.${k}` : k;
    if (!(k in aObj)) { if (!ignorePaths.some((p) => sub === p || sub.startsWith(p + '.'))) out.push({ path: sub, expected: eObj[k], actual: undefined, kind: 'missing' }); continue; }
    deepCompare(eObj[k], aObj[k], sub, out, relTol, absTol, ignorePaths);
  }
  for (const k of Object.keys(aObj)) {
    if (!(k in eObj)) {
      const sub = path ? `${path}.${k}` : k;
      if (!ignorePaths.some((p) => sub === p || sub.startsWith(p + '.'))) out.push({ path: sub, expected: undefined, actual: aObj[k], kind: 'extra' });
    }
  }
}

/** Count comparable leaves in the expected snapshot (for checks_total reporting). */
function countLeaves(v: unknown): number {
  if (v === null || typeof v !== 'object') return 1;
  if (Array.isArray(v)) return v.reduce((s: number, x) => s + countLeaves(x), 0);
  return Object.values(v as Record<string, unknown>).reduce((s: number, x) => s + countLeaves(x), 0);
}

export async function listCases(): Promise<any[]> {
  const q = await pool.query(
    `SELECT c.id, c.engine_id, c.module_type, c.calculation_type, c.case_name, c.description,
            c.expected_source, c.established_engine_version, c.active, c.created_by, c.created_at,
            (SELECT jsonb_build_object('id', r.id, 'passed', r.passed, 'engine_version', r.engine_version,
                    'checks_total', r.checks_total, 'checks_failed', r.checks_failed, 'ran_at', r.ran_at, 'ran_by', r.ran_by)
               FROM vv_regression_runs r WHERE r.case_id = c.id ORDER BY r.ran_at DESC LIMIT 1) AS latest_run
       FROM vv_regression_cases c ORDER BY c.engine_id, c.case_name`);
  return q.rows;
}

export async function runCase(caseId: number, ranBy: string): Promise<any> {
  const cq = await pool.query(`SELECT * FROM vv_regression_cases WHERE id = $1`, [caseId]);
  if (!cq.rows.length) throw Object.assign(new Error('Regression case not found'), { statusCode: 404 });
  const c = cq.rows[0];
  if (!c.active) throw Object.assign(new Error('Regression case is inactive'), { statusCode: 409 });

  const engine = engineRegistry.getOrThrow(c.module_type, c.calculation_type);
  const result = await engine.calculate(c.input_snapshot, {
    revisionId: 0, designId: 0, moduleType: c.module_type, userId: 0,
    calculationClass: 'Preliminary Screening',
  });

  const exp = c.expected ?? {};
  // Guard against a malformed/empty expected snapshot silently passing:
  // an empty expected vs an empty (error) result would compare clean.
  if (!exp.data || typeof exp.data !== 'object' || Object.keys(exp.data).length === 0) {
    throw Object.assign(new Error(`Regression case ${caseId} has an empty/malformed expected snapshot — refusing to run (a vacuous comparison could falsely PASS)`), { statusCode: 422 });
  }
  const relTol = typeof exp.relTol === 'number' ? exp.relTol : DEFAULT_REL_TOL;
  const absTol = typeof exp.absTol === 'number' ? exp.absTol : DEFAULT_ABS_TOL;
  const ignorePaths: string[] = Array.isArray(exp.ignorePaths) ? exp.ignorePaths : [];

  const deviations: Deviation[] = [];
  deepCompare(exp.data, result.data, '', deviations, relTol, absTol, ignorePaths);
  const statusMatches = String(exp.status ?? '') === '' || exp.status === result.status;
  if (!statusMatches) deviations.unshift({ path: '(calculation status)', expected: exp.status, actual: result.status, kind: 'value' });

  const passed = deviations.length === 0;
  const checksTotal = countLeaves(exp.data) + 1;
  const rq = await pool.query(
    `INSERT INTO vv_regression_runs (case_id, engine_id, engine_version, passed, run_status, deviations, checks_total, checks_failed, ran_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, ran_at`,
    [caseId, c.engine_id, engine.getEngineVersion(), passed, result.status,
     JSON.stringify(deviations), checksTotal, deviations.length, ranBy]);

  return {
    runId: rq.rows[0].id, caseId, caseName: c.case_name, engineId: c.engine_id,
    engineVersion: engine.getEngineVersion(), passed, runStatus: result.status,
    checksTotal, checksFailed: deviations.length,
    deviations: deviations.slice(0, 20),
    deviationsTruncated: deviations.length > 20,
    ranAt: rq.rows[0].ran_at,
  };
}

export async function runAll(ranBy: string): Promise<{ summary: { total: number; passed: number; failed: number }; results: any[] }> {
  const cq = await pool.query(`SELECT id FROM vv_regression_cases WHERE active ORDER BY engine_id, case_name`);
  const results = [];
  for (const row of cq.rows) results.push(await runCase(row.id, ranBy));
  const passed = results.filter((r) => r.passed).length;
  return { summary: { total: results.length, passed, failed: results.length - passed }, results };
}
