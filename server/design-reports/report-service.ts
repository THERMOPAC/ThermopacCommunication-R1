/**
 * Shared report service — persistence, numbering, status workflow, rendering.
 *
 * Status workflow per report: draft → for_review → approved → issued.
 *  - Regeneration is permitted ONLY in draft (updates the frozen payload).
 *  - Leaving draft is blocked while error-severity missing-data items exist.
 *  - Approver must differ from the generator (four-eyes rule).
 *  - approved/issued reports are immutable; a change requires a new report row
 *    (new design revision or an explicit re-issue with a change note).
 */
import { pool } from '../db';
import { renderReportPdf, type ReportPayload } from './report-framework';
import { buildDesignBasisPayload } from './design-basis-report';
import { buildProcessDesignPayload } from './process-design-report';

export const REPORT_BUILDERS: Record<string, (revisionId: number, generatedByName: string) => Promise<{ payload: ReportPayload; blocking: number }>> = {
  DBR: buildDesignBasisPayload,
  PDR: buildProcessDesignPayload,
};

const TRANSITIONS: Record<string, string> = { draft: 'for_review', for_review: 'approved', approved: 'issued' };

async function logEvent(reportId: number, event: string, actorId: number, detail?: string) {
  await pool.query(`INSERT INTO design_report_events (report_id, event, actor_id, detail) VALUES ($1,$2,$3,$4)`, [reportId, event, actorId, detail ?? null]);
}

export async function listReports(revisionId: number) {
  const q = await pool.query(
    `SELECT r.id, r.doc_type, r.doc_number, r.report_rev, r.status, r.change_note,
            r.generated_at, r.reviewed_at, r.approved_at, r.issued_at,
            gu.username AS generated_by_name, ru.username AS reviewed_by_name,
            au.username AS approved_by_name, iu.username AS issued_by_name,
            (r.payload->'missingData') AS missing_data,
            jsonb_array_length(COALESCE(r.payload->'assumptions','[]'::jsonb)) AS assumption_count
       FROM design_reports r
       LEFT JOIN users gu ON gu.id = r.generated_by
       LEFT JOIN users ru ON ru.id = r.reviewed_by
       LEFT JOIN users au ON au.id = r.approved_by
       LEFT JOIN users iu ON iu.id = r.issued_by
      WHERE r.revision_id = $1
      ORDER BY r.doc_type, r.created_at DESC`, [revisionId]);
  return q.rows;
}

export async function generateReport(revisionId: number, docType: string, userId: number) {
  const builder = REPORT_BUILDERS[docType];
  if (!builder) throw Object.assign(new Error(`Report type ${docType} is not implemented yet — reports are implemented one at a time in engineering sequence.`), { statusCode: 422 });

  const uq = await pool.query(`SELECT username FROM users WHERE id = $1`, [userId]);
  const username = uq.rows[0]?.username ?? `user ${userId}`;
  const { payload, blocking } = await builder(revisionId, username);

  // Revision history: prior generations of this doc for this revision + this one
  const prior = await pool.query(
    `SELECT report_rev, generated_at, gu.username AS by_name, COALESCE(change_note,'') AS note
       FROM design_reports r LEFT JOIN users gu ON gu.id = r.generated_by
      WHERE r.revision_id = $1 AND r.doc_type = $2 ORDER BY r.created_at`, [revisionId, docType]);
  payload.revisionHistory = [
    ...prior.rows.map((r: any) => ({ rev: r.report_rev, date: new Date(r.generated_at).toISOString().slice(0, 10), by: r.by_name ?? '', note: r.note || 'Superseded generation' })),
    { rev: payload.reportRev, date: new Date().toISOString().slice(0, 10), by: username, note: prior.rows.length ? 'Regenerated from current design revision data' : 'First issue for this design revision' },
  ];

  // One live report row per (revision, doc_type): regenerate updates the draft;
  // an approved/issued report is immutable and blocks regeneration.
  const existing = await pool.query(`SELECT id, status FROM design_reports WHERE revision_id = $1 AND doc_type = $2 ORDER BY created_at DESC LIMIT 1`, [revisionId, docType]);
  if (existing.rows.length && !['draft'].includes(existing.rows[0].status)) {
    throw Object.assign(new Error(`The ${docType} for this revision is ${existing.rows[0].status} and is immutable. Content changes require a new design revision.`), { statusCode: 409 });
  }
  let reportId: number;
  if (existing.rows.length) {
    reportId = existing.rows[0].id;
    // Conditional update — refuses to overwrite a report concurrently advanced out of draft
    const upd = await pool.query(`UPDATE design_reports SET payload = $1, generated_by = $2, generated_at = NOW() WHERE id = $3 AND status = 'draft'`, [JSON.stringify(payload), userId, reportId]);
    if (upd.rowCount === 0) throw Object.assign(new Error('The report left draft status while regeneration was in progress — refresh and retry.'), { statusCode: 409 });
    await logEvent(reportId, 'regenerated', userId, `blocking=${blocking}`);
  } else {
    // Unique index on (revision_id, doc_type) prevents concurrent duplicate first generations
    const ins = await pool.query(
      `INSERT INTO design_reports (revision_id, doc_type, doc_number, report_rev, status, payload, generated_by)
       VALUES ($1,$2,$3,$4,'draft',$5,$6) ON CONFLICT (revision_id, doc_type) DO NOTHING RETURNING id`,
      [revisionId, docType, payload.docNumber, payload.reportRev, JSON.stringify(payload), userId]);
    if (!ins.rows.length) throw Object.assign(new Error('A report of this type was generated concurrently — refresh and retry.'), { statusCode: 409 });
    reportId = ins.rows[0].id;
    await logEvent(reportId, 'generated', userId, `blocking=${blocking}`);
  }
  return { id: reportId, docNumber: payload.docNumber, reportRev: payload.reportRev, blocking, assumptions: payload.assumptions.length, missing: payload.missingData.length };
}

export async function renderReportById(reportId: number): Promise<{ pdf: Buffer; fileName: string }> {
  const q = await pool.query(`SELECT payload, doc_number, report_rev FROM design_reports WHERE id = $1`, [reportId]);
  if (!q.rows.length) throw Object.assign(new Error('Report not found'), { statusCode: 404 });
  const payload = q.rows[0].payload as ReportPayload;
  const pdf = await renderReportPdf(payload);
  return { pdf, fileName: `${q.rows[0].doc_number}_${String(q.rows[0].report_rev).replace(/\s+/g, '')}.pdf` };
}

export async function advanceReportStatus(reportId: number, userId: number) {
  const q = await pool.query(`SELECT * FROM design_reports WHERE id = $1`, [reportId]);
  if (!q.rows.length) throw Object.assign(new Error('Report not found'), { statusCode: 404 });
  const rep = q.rows[0];
  const next = TRANSITIONS[rep.status];
  if (!next) throw Object.assign(new Error(`Report is already ${rep.status} — no further transition.`), { statusCode: 409 });
  const blocking = ((rep.payload?.missingData ?? []) as Array<{ severity: string }>).filter(m => m.severity === 'error').length;
  if (rep.status === 'draft' && blocking > 0) {
    throw Object.assign(new Error(`Cannot submit for review — ${blocking} mandatory basis value(s) missing. Complete the design inputs and regenerate.`), { statusCode: 422 });
  }
  if (next === 'approved' && rep.generated_by === userId) {
    throw Object.assign(new Error('Four-eyes rule: the approver must be different from the user who generated the report.'), { statusCode: 403 });
  }
  const col = next === 'for_review' ? 'reviewed' : next === 'approved' ? 'approved' : 'issued';
  // Expected-status predicate — two concurrent advances cannot both transition
  const upd = await pool.query(`UPDATE design_reports SET status = $1, ${col}_by = $2, ${col}_at = NOW() WHERE id = $3 AND status = $4`, [next, userId, reportId, rep.status]);
  if (upd.rowCount === 0) throw Object.assign(new Error('Report status changed concurrently — refresh and retry.'), { statusCode: 409 });
  await logEvent(reportId, `status_${next}`, userId);
  return { id: reportId, status: next };
}
