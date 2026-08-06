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

/** Record one evidence pillar for one equation. Requires a named engineer and a reference. */
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
        SET evidence = evidence || jsonb_build_object($2::text, jsonb_build_object('done', true, 'by', $3::text, 'reference', $4::text, 'recordedAt', to_char(now(), 'YYYY-MM-DD HH24:MI') || ' UTC')),
            updated_at = now()
      WHERE id = $1 RETURNING *`,
    [equationId, pillar, by.trim(), reference.trim()]);
  if (!q.rows.length) throw Object.assign(new Error('Equation register entry not found'), { statusCode: 404 });
  return q.rows[0];
}

/** Computed Software Verification status for every registered engine. */
export async function verificationStatus(): Promise<any[]> {
  const engines = engineRegistry.listAll();
  const out: any[] = [];
  for (const e of engines) {
    const reg = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (
                WHERE evidence ? 'handCalc' AND evidence ? 'unitCheck'
                  AND evidence ? 'boundaryCheck' AND evidence ? 'independentReview'
              )::int AS fully_evidenced
         FROM vv_equation_register WHERE engine_id = $1`, [e.engineId]);
    const { total, fully_evidenced } = reg.rows[0];

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
    else reasons.push(`Equation register: ${total} entries, ${fully_evidenced} fully evidenced (4/4 pillars)`);
    if (caseCount === 0) reasons.push('No regression cases');
    else reasons.push(regressionPassing
      ? `Regression: all ${caseCount} active case(s) passing for v${e.engineVersion}`
      : `Regression: not all of ${caseCount} active case(s) have a passing latest run for v${e.engineVersion}`);

    if (total > 0 && regressionPassing) {
      status = fully_evidenced === total ? 'Verified' : 'Partially Verified';
      if (status === 'Partially Verified') reasons.push('Evidence pillars incomplete — hand calculations, unit checks, boundary checks and independent review must be recorded per equation');
    }

    out.push({
      engineId: e.engineId, engineVersion: e.engineVersion,
      moduleType: e.moduleType, calculationType: e.calculationType,
      verificationStatus: status,
      equationRegister: { total, fullyEvidenced: fully_evidenced },
      regression: { activeCases: caseCount, allPassingForCurrentVersion: regressionPassing },
      rationale: reasons,
    });
  }
  return out;
}
