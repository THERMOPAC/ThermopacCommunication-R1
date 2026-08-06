/**
 * V&V Phase B — Equation Register & Verification Dossiers.
 *
 * The Equation Register catalogues every documented equation of every engine
 * (seeded from the formula references and source strings the engines already
 * emit in their result snapshots — never invented). Each entry accumulates
 * four evidence pillars, all requiring a named engineer:
 *   handCalc, unitCheck, boundaryCheck, independentReview
 *
 * Software Verification Status per engine is COMPUTED from evidence, never
 * asserted:
 *   Verified           — register non-empty, ALL entries carry all four
 *                        evidence pillars, and the latest regression run of
 *                        every active case for the CURRENT engine version passed.
 *   Partially Verified — register non-empty AND regression passing for the
 *                        current version (evidence pillars incomplete).
 *   Unverified         — anything less.
 *
 * This status is release-scoped (engine_id + engine_version) and entirely
 * separate from Engineering Confidence (revision-scoped) per the approved
 * V&V architecture.
 */
import { pool } from '../db';
import { engineRegistry } from '../engine-framework/registry';
import '../engines/llx';
import '../engines/common';

export const EVIDENCE_PILLARS = ['handCalc', 'unitCheck', 'boundaryCheck', 'independentReview'] as const;
export type EvidencePillar = (typeof EVIDENCE_PILLARS)[number];

export async function listRegister(engineId?: string): Promise<any[]> {
  const q = engineId
    ? await pool.query(`SELECT * FROM vv_equation_register WHERE engine_id = $1 ORDER BY equation_ref`, [engineId])
    : await pool.query(`SELECT * FROM vv_equation_register ORDER BY engine_id, equation_ref`);
  return q.rows;
}

export async function upsertEquation(entry: {
  engineId: string; equationRef: string; statement: string;
  sourceCitation?: string; unitsNote?: string; validRangeNote?: string;
}): Promise<any> {
  const q = await pool.query(
    `INSERT INTO vv_equation_register (engine_id, equation_ref, statement, source_citation, units_note, valid_range_note)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (engine_id, equation_ref) DO UPDATE
       SET statement = EXCLUDED.statement,
           source_citation = COALESCE(EXCLUDED.source_citation, vv_equation_register.source_citation),
           units_note = COALESCE(EXCLUDED.units_note, vv_equation_register.units_note),
           valid_range_note = COALESCE(EXCLUDED.valid_range_note, vv_equation_register.valid_range_note),
           updated_at = now()
     RETURNING *`,
    [entry.engineId, entry.equationRef, entry.statement, entry.sourceCitation ?? null, entry.unitsNote ?? null, entry.validRangeNote ?? null]);
  return q.rows[0];
}

/**
 * Record one evidence pillar for one equation. Requires a named engineer and a
 * document reference. Evidence is recorded in status 'draft' — it counts
 * toward Verified only after independent approval (approveEvidence). Never
 * marked complete automatically.
 */
export async function recordEvidence(
  equationId: number,
  pillar: EvidencePillar,
  by: string,
  reference: string,
): Promise<any> {
  if (!EVIDENCE_PILLARS.includes(pillar)) throw Object.assign(new Error(`Unknown evidence pillar '${pillar}'`), { statusCode: 400 });
  if (!by?.trim() || !reference?.trim()) throw Object.assign(new Error('Evidence requires a named engineer (by) and a document reference'), { statusCode: 400 });
  const q = await pool.query(
    `UPDATE vv_equation_register
        SET evidence = evidence || jsonb_build_object($2::text, jsonb_build_object('done', true, 'status', 'draft', 'by', $3::text, 'reference', $4::text, 'recordedAt', to_char(now(), 'YYYY-MM-DD HH24:MI') || ' UTC')),
            updated_at = now()
      WHERE id = $1 RETURNING *`,
    [equationId, pillar, by.trim(), reference.trim()]);
  if (!q.rows.length) throw Object.assign(new Error('Equation register entry not found'), { statusCode: 404 });
  return q.rows[0];
}

/**
 * Approve a recorded (draft) evidence pillar. The approver must be a named
 * engineer DIFFERENT from the recorder — draft evidence never counts toward
 * Verified.
 */
export async function approveEvidence(
  equationId: number,
  pillar: EvidencePillar,
  approvedBy: string,
): Promise<any> {
  if (!EVIDENCE_PILLARS.includes(pillar)) throw Object.assign(new Error(`Unknown evidence pillar '${pillar}'`), { statusCode: 400 });
  if (!approvedBy?.trim()) throw Object.assign(new Error('approvedBy (named engineer) is required'), { statusCode: 400 });
  const cur = await pool.query(`SELECT evidence FROM vv_equation_register WHERE id = $1`, [equationId]);
  if (!cur.rows.length) throw Object.assign(new Error('Equation register entry not found'), { statusCode: 404 });
  const entry = cur.rows[0].evidence?.[pillar];
  if (!entry?.done || !entry?.by || !entry?.reference) {
    throw Object.assign(new Error(`No recorded '${pillar}' evidence to approve — record it first`), { statusCode: 422 });
  }
  if (entry.by.trim().toLowerCase() === approvedBy.trim().toLowerCase()) {
    throw Object.assign(new Error(`Evidence approval must be independent: '${pillar}' was recorded by ${entry.by} and cannot be approved by the same engineer`), { statusCode: 422 });
  }
  const q = await pool.query(
    `UPDATE vv_equation_register
        SET evidence = jsonb_set(evidence, ARRAY[$2::text],
              (evidence->$2::text) || jsonb_build_object('status', 'approved', 'approvedBy', $3::text, 'approvedAt', to_char(now(), 'YYYY-MM-DD HH24:MI') || ' UTC')),
            updated_at = now()
      WHERE id = $1 RETURNING *`,
    [equationId, pillar, approvedBy.trim()]);
  return q.rows[0];
}

// ── Verification findings ─────────────────────────────────────────────────────

export async function listFindings(engineId?: string): Promise<any[]> {
  const q = engineId
    ? await pool.query(`SELECT * FROM vv_verification_findings WHERE engine_id = $1 ORDER BY status DESC, severity, id`, [engineId])
    : await pool.query(`SELECT * FROM vv_verification_findings ORDER BY status DESC, severity, engine_id, id`);
  return q.rows;
}

export async function raiseFinding(f: {
  engineId: string; equationRef?: string; severity: 'critical' | 'major' | 'minor';
  description: string; raisedBy: string;
}): Promise<any> {
  if (!['critical', 'major', 'minor'].includes(f.severity)) throw Object.assign(new Error('severity must be critical | major | minor'), { statusCode: 400 });
  if (!f.description?.trim() || !f.raisedBy?.trim()) throw Object.assign(new Error('description and raisedBy are required'), { statusCode: 400 });
  const q = await pool.query(
    `INSERT INTO vv_verification_findings (engine_id, equation_ref, severity, description, raised_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [f.engineId, f.equationRef ?? null, f.severity, f.description.trim(), f.raisedBy.trim()]);
  return q.rows[0];
}

export async function closeFinding(id: number, closedBy: string, closureReference: string): Promise<any> {
  if (!closedBy?.trim() || !closureReference?.trim()) throw Object.assign(new Error('closedBy and closureReference are required — findings are never closed without a named engineer and a reference'), { statusCode: 400 });
  const q = await pool.query(
    `UPDATE vv_verification_findings
        SET status = 'closed', closed_by = $2, closure_reference = $3, closed_at = now()
      WHERE id = $1 AND status = 'open' RETURNING *`,
    [id, closedBy.trim(), closureReference.trim()]);
  if (!q.rows.length) throw Object.assign(new Error('Open finding not found'), { statusCode: 404 });
  return q.rows[0];
}

// ── Engine-version approval ───────────────────────────────────────────────────

export async function approveEngineVersion(engineId: string, engineVersion: string, approvedBy: string, reference: string): Promise<any> {
  if (!approvedBy?.trim() || !reference?.trim()) throw Object.assign(new Error('approvedBy and reference are required'), { statusCode: 400 });
  const q = await pool.query(
    `INSERT INTO vv_engine_version_approvals (engine_id, engine_version, approved_by, reference)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (engine_id, engine_version) DO NOTHING
     RETURNING *`,
    [engineId, engineVersion, approvedBy.trim(), reference.trim()]);
  if (!q.rows.length) throw Object.assign(new Error(`Engine version approval already recorded for ${engineId} v${engineVersion} — approvals are immutable`), { statusCode: 409 });
  return q.rows[0];
}

/** Computed Software Verification status for every registered engine. */
export async function verificationStatus(): Promise<any[]> {
  const engines = engineRegistry.listAll();
  const out: any[] = [];
  for (const e of engines) {
    // A pillar counts toward Verified only when done, named, referenced AND
    // independently APPROVED (draft evidence never counts).
    const pillarSql = EVIDENCE_PILLARS.map((p) =>
      `(evidence->'${p}'->>'done')::boolean IS TRUE
        AND coalesce(evidence->'${p}'->>'by','') <> '' AND coalesce(evidence->'${p}'->>'reference','') <> ''
        AND evidence->'${p}'->>'status' = 'approved'
        AND coalesce(evidence->'${p}'->>'approvedBy','') <> ''`).join(' AND ');
    const reg = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE ${pillarSql})::int AS fully_evidenced
         FROM vv_equation_register WHERE engine_id = $1`, [e.engineId]);
    const { total, fully_evidenced } = reg.rows[0];

    const findings = await pool.query(
      `SELECT count(*) FILTER (WHERE severity = 'critical')::int AS open_critical, count(*)::int AS open_total
         FROM vv_verification_findings WHERE engine_id = $1 AND status = 'open'`, [e.engineId]);
    const { open_critical, open_total } = findings.rows[0];

    const approval = await pool.query(
      `SELECT approved_by, reference, approved_at FROM vv_engine_version_approvals
        WHERE engine_id = $1 AND engine_version = $2`, [e.engineId, e.engineVersion]);
    const versionApproved = approval.rows.length > 0;

    const cases = await pool.query(
      `SELECT c.id,
              (SELECT r.passed FROM vv_regression_runs r
                WHERE r.case_id = c.id AND r.engine_version = $2
                ORDER BY r.ran_at DESC LIMIT 1) AS latest_passed
         FROM vv_regression_cases c
        WHERE c.engine_id = $1 AND c.active`, [e.engineId, e.engineVersion]);
    const caseCount = cases.rows.length;
    const regressionPassing = caseCount > 0 && cases.rows.every((r) => r.latest_passed === true);

    let status: 'Verified' | 'Partially Verified' | 'Unverified' = 'Unverified';
    const reasons: string[] = [];
    if (total === 0) reasons.push('Equation register is empty');
    else reasons.push(`Equation register: ${total} entries, ${fully_evidenced} fully evidenced (4/4 pillars, all APPROVED — draft evidence does not count)`);
    if (caseCount === 0) reasons.push('No regression cases');
    else reasons.push(regressionPassing
      ? `Regression: all ${caseCount} active case(s) passing for v${e.engineVersion}`
      : `Regression: not all of ${caseCount} active case(s) have a passing latest run for v${e.engineVersion}`);
    if (open_critical > 0) reasons.push(`${open_critical} open CRITICAL verification finding(s) — Verified is blocked until closed`);
    else if (open_total > 0) reasons.push(`${open_total} open non-critical verification finding(s)`);
    reasons.push(versionApproved
      ? `Independent engine-version approval recorded for v${e.engineVersion} (${approval.rows[0].approved_by})`
      : `No independent engine-version approval recorded for v${e.engineVersion}`);

    if (total > 0 && regressionPassing) {
      const allEvidenced = fully_evidenced === total;
      status = allEvidenced && open_critical === 0 && versionApproved ? 'Verified' : 'Partially Verified';
      if (status === 'Partially Verified' && !allEvidenced) reasons.push('Evidence pillars incomplete — hand calculations, unit checks, boundary checks and independent review must be recorded AND approved per equation');
    }

    out.push({
      engineId: e.engineId, engineVersion: e.engineVersion,
      moduleType: e.moduleType, calculationType: e.calculationType,
      verificationStatus: status,
      equationRegister: { total, fullyEvidenced: fully_evidenced },
      regression: { activeCases: caseCount, allPassingForCurrentVersion: regressionPassing },
      findings: { openCritical: open_critical, openTotal: open_total },
      engineVersionApproval: versionApproved ? approval.rows[0] : null,
      rationale: reasons,
    });
  }
  return out;
}
