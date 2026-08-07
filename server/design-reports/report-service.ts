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
import { buildHydraulicDesignPayload } from './hydraulic-design-report';
import { buildEcpCalculationPayload, buildEcrCalculationPayload } from './ecp-ecr-calculation-reports';
import { buildEquipmentDatasheetPayload } from './equipment-datasheet-report';

export const REPORT_BUILDERS: Record<string, (revisionId: number, generatedByName: string) => Promise<{ payload: ReportPayload; blocking: number }>> = {
  DBR: buildDesignBasisPayload,
  PDR: buildProcessDesignPayload,
  HDR: buildHydraulicDesignPayload,
  ECPR: buildEcpCalculationPayload,
  ECRR: buildEcrCalculationPayload,
  EDS: buildEquipmentDatasheetPayload,
};

const TRANSITIONS: Record<string, string> = { draft: 'for_review', for_review: 'approved', approved: 'issued' };

async function logEvent(reportId: number, event: string, actorId: number, detail?: string) {
  await pool.query(`INSERT INTO design_report_events (report_id, event, actor_id, detail) VALUES ($1,$2,$3,$4)`, [reportId, event, actorId, detail ?? null]);
}

export async function listReports(revisionId: number) {
  const q = await pool.query(
    `SELECT r.id, r.doc_type, r.doc_number, r.report_rev, r.status, r.change_note,
            r.is_stale, r.stale_reason,
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

  // One LIVE (non-stale) report row per (revision, doc_type): regenerate updates
  // the draft; an approved/issued report is immutable and blocks regeneration.
  // Stale rows (superseded by a governed diameter change) are retained for the
  // audit trail but never updated.
  const existing = await pool.query(`SELECT id, status FROM design_reports WHERE revision_id = $1 AND doc_type = $2 AND NOT is_stale ORDER BY created_at DESC LIMIT 1`, [revisionId, docType]);
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
       VALUES ($1,$2,$3,$4,'draft',$5,$6) ON CONFLICT (revision_id, doc_type) WHERE NOT is_stale DO NOTHING RETURNING id`,
      [revisionId, docType, payload.docNumber, payload.reportRev, JSON.stringify(payload), userId]);
    if (!ins.rows.length) throw Object.assign(new Error('A report of this type was generated concurrently — refresh and retry.'), { statusCode: 409 });
    reportId = ins.rows[0].id;
    await logEvent(reportId, 'generated', userId, `blocking=${blocking}`);
  }
  return { id: reportId, docNumber: payload.docNumber, reportRev: payload.reportRev, blocking, assumptions: payload.assumptions.length, missing: payload.missingData.length };
}

/**
 * Reconcile existing reports after a governed design change (e.g. DS-SEL-006
 * user diameter selection) so no report continues to show the old design:
 *  - draft reports are regenerated in place from the new frozen runs;
 *  - for_review/approved/issued reports are NEVER overwritten: the existing row
 *    is marked stale (retained for the audit trail) and a NEW draft row is
 *    generated from the new frozen runs;
 *  - report types never generated for this revision are left alone.
 * Approval/issue of any report of the revision stays blocked while a stale row
 * exists (see advanceReportStatus).
 */
export async function reconcileReportsAfterDesignChange(revisionId: number, userId: number, changeReason: string) {
  const rows = await pool.query(
    `SELECT id, doc_type, status FROM design_reports
      WHERE revision_id = $1 AND NOT is_stale AND doc_type = ANY($2)
      ORDER BY doc_type`, [revisionId, Object.keys(REPORT_BUILDERS)]);
  const outcome: Array<{ docType: string; action: string; error?: string }> = [];
  for (const rep of rows.rows) {
    try {
      if (rep.status !== 'draft') {
        // Expected-status predicate — refuses to mark stale if the report
        // transitioned concurrently since it was read; that generation must
        // then be reconciled by a re-run of this routine.
        const upd = await pool.query(
          `UPDATE design_reports SET is_stale = TRUE, stale_reason = $2 WHERE id = $1 AND NOT is_stale AND status = $3`,
          [rep.id, changeReason, rep.status]);
        if (upd.rowCount === 0) {
          outcome.push({ docType: rep.doc_type, action: 'FAILED', error: 'Report status changed concurrently during reconciliation — re-apply the reconciliation for this report type.' });
          continue;
        }
        await logEvent(rep.id, 'marked_stale', userId, changeReason);
        await generateReport(revisionId, rep.doc_type, userId); // new draft row from the new frozen runs
        outcome.push({ docType: rep.doc_type, action: `previous ${rep.status} report marked stale; new draft generated from the new frozen runs` });
      } else {
        await generateReport(revisionId, rep.doc_type, userId); // regenerate draft in place
        outcome.push({ docType: rep.doc_type, action: 'draft regenerated from the new frozen runs' });
      }
    } catch (e: any) {
      outcome.push({ docType: rep.doc_type, action: 'FAILED', error: e?.message ?? String(e) });
    }
  }
  return outcome;
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
  if (rep.is_stale) {
    throw Object.assign(new Error(`This ${rep.doc_type} is STALE — it was superseded by a governed design change (${rep.stale_reason ?? 'design change'}). It is retained for the audit trail only; work with the regenerated report.`), { statusCode: 409 });
  }
  const next = TRANSITIONS[rep.status];
  if (!next) throw Object.assign(new Error(`Report is already ${rep.status} — no further transition.`), { statusCode: 409 });
  // Approval/release gate: while ANY report of this revision remains stale, the
  // report set is inconsistent — approval and issue are blocked until every
  // affected report has been regenerated from the new frozen runs.
  if (next === 'approved' || next === 'issued') {
    const staleQ = await pool.query(
      `SELECT doc_type FROM design_reports WHERE revision_id = $1 AND is_stale ORDER BY doc_type`, [rep.revision_id]);
    if (staleQ.rows.length) {
      throw Object.assign(new Error(`Approval/issue blocked — stale report(s) exist for this revision (${Array.from(new Set<string>(staleQ.rows.map((r: any) => r.doc_type))).join(', ')}). Regenerate all affected reports from the new frozen runs first.`), { statusCode: 409 });
    }
  }
  const blocking = ((rep.payload?.missingData ?? []) as Array<{ severity: string }>).filter(m => m.severity === 'error').length;
  if (rep.status === 'draft' && blocking > 0) {
    throw Object.assign(new Error(`Cannot submit for review — ${blocking} mandatory basis value(s) missing. Complete the design inputs and regenerate.`), { statusCode: 422 });
  }
  if (next === 'approved' && rep.generated_by === userId) {
    throw Object.assign(new Error('Four-eyes rule: the approver must be different from the user who generated the report.'), { statusCode: 403 });
  }
  const col = next === 'for_review' ? 'reviewed' : next === 'approved' ? 'approved' : 'issued';
  // Expected-status predicate — two concurrent advances cannot both transition
  const upd = await pool.query(`UPDATE design_reports SET status = $1, ${col}_by = $2, ${col}_at = NOW() WHERE id = $3 AND status = $4 AND NOT is_stale`, [next, userId, reportId, rep.status]);
  if (upd.rowCount === 0) throw Object.assign(new Error('Report status changed concurrently — refresh and retry.'), { statusCode: 409 });
  await logEvent(reportId, `status_${next}`, userId);
  return { id: reportId, status: next };
}
