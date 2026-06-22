import { Router, Request, Response } from 'express';
import { db } from '../db';
import { pool } from '../db';
import { sql } from 'drizzle-orm';
import { generateExecutionDrafts, syncAndGenerateExecutionDrafts } from './generate-execution-drafts';
import { approveDraft, rejectDraft, holdDraft, resumeDraft } from './draft-approval';
import { activateDraft, linkEntityToDraft } from './draft-activation';
import { redraftFromRejected } from './draft-redraft';
import { executeFullAutoPipeline } from './full-auto-orchestrator';

const router = Router();

function requireAuth(req: Request, res: Response): any | null {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return user;
}

router.get('/api/projects/:projectId/execution-drafts', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  try {
    const result = await db.execute(
      sql`SELECT ed.*,
                pi.item_code as item_code,
                pi.description as item_description,
                pi.make_or_buy,
                mi.item_code as master_item_code,
                mi.description as master_item_description,
                gen_user.username as generated_by_username,
                appr_user.username as approved_by_username,
                rej_user.username as rejected_by_username,
                act_user.username as activated_by_username
          FROM execution_drafts ed
          LEFT JOIN project_items pi ON pi.id = ed.project_item_id
          LEFT JOIN master_items mi ON mi.id = pi.item_id
          LEFT JOIN users gen_user ON gen_user.id = ed.generated_by_user_id
          LEFT JOIN users appr_user ON appr_user.id = ed.approved_by
          LEFT JOIN users rej_user ON rej_user.id = ed.rejected_by
          LEFT JOIN users act_user ON act_user.id = ed.activated_by
          WHERE ed.project_id = ${projectId}
          ORDER BY ed.project_item_id, ed.doc_type, ed.created_at DESC`
    );

    res.json(result.rows);
  } catch (error: any) {
    console.error('[pipeline-routes] Error fetching drafts:', error);
    res.status(500).json({ error: 'Failed to fetch execution drafts' });
  }
});

router.get('/api/projects/:projectId/execution-drafts/summary', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  try {
    const result = await db.execute(
      sql`SELECT
            doc_type,
            approval_status,
            activation_status,
            applicable,
            COUNT(*)::int as count
          FROM execution_drafts
          WHERE project_id = ${projectId}
          GROUP BY doc_type, approval_status, activation_status, applicable
          ORDER BY doc_type`
    );

    const total = await db.execute(
      sql`SELECT COUNT(*)::int as total FROM execution_drafts WHERE project_id = ${projectId}`
    );

    res.json({
      projectId,
      total: (total.rows[0] as any)?.total || 0,
      breakdown: result.rows,
    });
  } catch (error: any) {
    console.error('[pipeline-routes] Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

router.post('/api/projects/:projectId/execution-drafts/generate', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  try {
    const summary = await syncAndGenerateExecutionDrafts(projectId, user.id);
    res.json(summary);
  } catch (error: any) {
    console.error('[pipeline-routes] Error generating drafts:', error);
    res.status(500).json({ error: error.message || 'Failed to generate execution drafts' });
  }
});

router.post('/api/execution-drafts/:draftId/approve', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const draftId = parseInt(req.params.draftId);
  if (isNaN(draftId)) return res.status(400).json({ error: 'Invalid draft ID' });

  const result = await approveDraft(draftId, user.id, user.role || '');
  if (!result.success) {
    const code = result.error?.includes('Insufficient') ? 403 : 400;
    return res.status(code).json({ error: result.error });
  }
  res.json({ success: true, message: `Draft #${draftId} approved` });
});

router.post('/api/execution-drafts/:draftId/reject', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const draftId = parseInt(req.params.draftId);
  if (isNaN(draftId)) return res.status(400).json({ error: 'Invalid draft ID' });

  const { remarks } = req.body || {};
  const result = await rejectDraft(draftId, user.id, user.role || '', remarks);
  if (!result.success) {
    const code = result.error?.includes('Insufficient') ? 403 : 400;
    return res.status(code).json({ error: result.error });
  }
  res.json({ success: true, message: `Draft #${draftId} rejected` });
});

router.post('/api/execution-drafts/:draftId/hold', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const draftId = parseInt(req.params.draftId);
  if (isNaN(draftId)) return res.status(400).json({ error: 'Invalid draft ID' });

  const { remarks } = req.body || {};
  const result = await holdDraft(draftId, user.id, user.role || '', remarks);
  if (!result.success) {
    const code = result.error?.includes('Insufficient') ? 403 : 400;
    return res.status(code).json({ error: result.error });
  }
  res.json({ success: true, message: `Draft #${draftId} put on hold` });
});

router.post('/api/execution-drafts/:draftId/resume', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const draftId = parseInt(req.params.draftId);
  if (isNaN(draftId)) return res.status(400).json({ error: 'Invalid draft ID' });

  const result = await resumeDraft(draftId, user.id, user.role || '');
  if (!result.success) {
    const code = result.error?.includes('Insufficient') ? 403 : 400;
    return res.status(code).json({ error: result.error });
  }
  res.json({ success: true, message: `Draft #${draftId} resumed` });
});

router.post('/api/execution-drafts/:draftId/activate', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const draftId = parseInt(req.params.draftId);
  if (isNaN(draftId)) return res.status(400).json({ error: 'Invalid draft ID' });

  const result = await activateDraft(draftId, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({
    success: true,
    message: result.message || `Draft #${draftId} activated`,
    entityId: result.entityId,
    entityType: result.entityType,
  });
});

router.post('/api/execution-drafts/:draftId/link-entity', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const draftId = parseInt(req.params.draftId);
  if (isNaN(draftId)) return res.status(400).json({ error: 'Invalid draft ID' });

  const { entityId, entityType } = req.body || {};
  if (!entityId || !entityType) {
    return res.status(400).json({ error: 'entityId and entityType are required' });
  }

  const result = await linkEntityToDraft(draftId, entityId, entityType, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true, message: `Entity linked to draft #${draftId}` });
});

router.post('/api/execution-drafts/:draftId/redraft', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const draftId = parseInt(req.params.draftId);
  if (isNaN(draftId)) return res.status(400).json({ error: 'Invalid draft ID' });

  const { sourceDataOverrides } = req.body || {};
  const result = await redraftFromRejected(draftId, user.id, sourceDataOverrides);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true, newDraftId: result.newDraftId, message: `Re-drafted from #${draftId}` });
});

router.patch('/api/execution-drafts/:draftId/applicability', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const draftId = parseInt(req.params.draftId);
  if (isNaN(draftId)) return res.status(400).json({ error: 'Invalid draft ID' });

  const { applicable } = req.body;
  if (typeof applicable !== 'boolean') {
    return res.status(400).json({ error: 'applicable must be a boolean' });
  }

  try {
    const draft = await db.execute(sql`SELECT * FROM execution_drafts WHERE id = ${draftId}`);
    if (draft.rows.length === 0) return res.status(404).json({ error: 'Draft not found' });

    const d = draft.rows[0] as any;
    if (d.activation_status === 'activated') {
      return res.status(400).json({ error: 'Cannot change applicability of an activated draft.' });
    }

    const newStatus = applicable ? 'draft' : 'not_applicable';
    await db.execute(
      sql`UPDATE execution_drafts
          SET applicable = ${applicable},
              approval_status = ${newStatus},
              updated_at = NOW()
          WHERE id = ${draftId}`
    );

    res.json({ success: true, message: `Draft #${draftId} applicability set to ${applicable}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/projects/:projectId/full-auto-pipeline', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  if (!['Superuser', 'General Manager', 'Senior Manager'].includes(user.role)) {
    return res.status(403).json({ error: 'Insufficient role. Senior Manager or above required.' });
  }

  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  try {
    const projectCheck = await pool.query(
      `SELECT id, automation_mode, status FROM projects WHERE id = $1`,
      [projectId]
    );
    if (projectCheck.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const project = projectCheck.rows[0];
    if (project.automation_mode !== 'full_auto') {
      await pool.query(
        `UPDATE projects SET automation_mode = 'full_auto', updated_at = NOW() WHERE id = $1`,
        [projectId]
      );
    }

    const result = await executeFullAutoPipeline(projectId, user.id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/projects/:projectId/automation-status', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  try {
    const runs = await pool.query(
      `SELECT run_id, status, current_phase, current_step, trigger_user_id,
              started_at, heartbeat_at, completed_at, failed_at,
              failure_step, failure_message, step_results
       FROM automation_pipeline_runs
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [projectId]
    );

    const projectInfo = await pool.query(
      `SELECT automation_mode, automation_run_id, automation_completed_at
       FROM projects WHERE id = $1`,
      [projectId]
    );

    res.json({
      project: projectInfo.rows[0] || {},
      runs: runs.rows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Document Health helper ─────────────────────────────────────────────────
function jobToMirror(job: any) {
  if (!job) return { mirrorJobId: null, mirrorStatus: null, windowsRelPath: null, windowsLocalPath: null, failedReason: null, retryCount: 0, mirroredAt: null };
  return {
    mirrorJobId:      job.id,
    mirrorStatus:     job.status,
    windowsRelPath:   job.relative_path,
    windowsLocalPath: job.result_local_path,
    failedReason:     job.failed_reason,
    retryCount:       job.retry_count || 0,
    mirroredAt:       job.completed_at,
  };
}

// ── GET /api/projects/:projectId/document-health ────────────────────────────
router.get('/api/projects/:projectId/document-health', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  try {
    // Fetch all four source records in parallel
    const [snapRes, edaRes, codRes] = await Promise.all([
      pool.query(
        `SELECT ocs.id, ocs.offer_id,
                ocs.final_offer_gcs_path, ocs.final_offer_mirror_status, ocs.final_offer_mirror_job_id,
                qpa.id            AS qpa_id,
                qpa.gcs_object_path AS qpa_gcs_path,
                qpa.gcs_bucket    AS qpa_bucket,
                qpa.mirror_status AS qpa_mirror_status,
                qpa.mirror_job_id AS qpa_mirror_job_id
         FROM   offer_conversion_snapshots ocs
         LEFT JOIN quotation_pdf_artifacts qpa ON qpa.offer_id = ocs.offer_id
         WHERE  ocs.project_id = $1
         ORDER  BY ocs.converted_at DESC, qpa.id DESC
         LIMIT  1`,
        [projectId]
      ),
      pool.query(
        `SELECT id, gcs_object_path, gcs_bucket, mirror_status, mirror_job_id
         FROM   epc_document_attachments
         WHERE  project_id = $1 AND doc_type = 'QTN'
         ORDER  BY id DESC LIMIT 1`,
        [projectId]
      ),
      pool.query(
        `SELECT id, gcs_object_path, gcs_bucket, mirror_status, mirror_job_id
         FROM   customer_order_documents
         WHERE  project_id = $1 AND is_current = true
         ORDER  BY id DESC LIMIT 1`,
        [projectId]
      ),
    ]);

    const snap = snapRes.rows[0] || null;
    const eda  = edaRes.rows[0]  || null;
    const cod  = codRes.rows[0]  || null;

    // Collect all mirror job IDs that exist on the source rows
    const jobIds: number[] = [];
    if (snap?.qpa_mirror_job_id)              jobIds.push(snap.qpa_mirror_job_id);
    if (snap?.final_offer_mirror_job_id)      jobIds.push(snap.final_offer_mirror_job_id);
    if (eda?.mirror_job_id)                   jobIds.push(eda.mirror_job_id);
    if (cod?.mirror_job_id)                   jobIds.push(cod.mirror_job_id);

    // Also look up jobs by (source_module, source_record_id) for any without inline job IDs
    const fallbackFilters: string[] = [];
    const fallbackParams: any[]     = [];
    let   pi = jobIds.length ? 2 : 1;          // param index offset (first param = $1 = jobIds array or unused)

    if (snap?.qpa_id && !snap.qpa_mirror_job_id) {
      fallbackFilters.push(`(source_module = $${pi} AND source_record_id = $${pi+1})`);
      fallbackParams.push('quotation_pdf_artifacts', snap.qpa_id);
      pi += 2;
    }
    if (snap?.id && !snap.final_offer_mirror_job_id) {
      fallbackFilters.push(`(source_module = $${pi} AND source_record_id = $${pi+1})`);
      fallbackParams.push('offer_conversion', snap.id);
      pi += 2;
    }
    if (eda?.id && !eda.mirror_job_id) {
      fallbackFilters.push(`(source_module = $${pi} AND source_record_id = $${pi+1})`);
      fallbackParams.push('epc_document_attachments', eda.id);
      pi += 2;
    }
    if (cod?.id && !cod.mirror_job_id) {
      fallbackFilters.push(`(source_module = $${pi} AND source_record_id = $${pi+1})`);
      fallbackParams.push('customer_order_documents', cod.id);
    }

    let jobs: any[] = [];
    if (jobIds.length > 0 || fallbackFilters.length > 0) {
      const whereClauses: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (jobIds.length > 0) {
        whereClauses.push(`id = ANY($${idx}::int[])`);
        params.push(jobIds);
        idx++;
      }
      if (fallbackFilters.length > 0) {
        // Rebuild with correct param indices starting from idx
        const rebuilt: string[] = [];
        let ri = idx;
        for (let fi = 0; fi < fallbackFilters.length; fi++) {
          // Each fallback filter has 2 params (module, record_id)
          rebuilt.push(`(source_module = $${ri} AND source_record_id = $${ri+1})`);
          ri += 2;
        }
        whereClauses.push(`(${rebuilt.join(' OR ')})`);
        params.push(...fallbackParams);
      }

      const jobRes = await pool.query(
        `SELECT DISTINCT ON (source_module, source_record_id)
                id, status, source_module, source_record_id,
                relative_path, result_local_path, failed_reason, retry_count, completed_at
         FROM   document_agent_jobs
         WHERE  ${whereClauses.join(' OR ')}
         ORDER  BY source_module, source_record_id, created_at DESC`,
        params
      );
      jobs = jobRes.rows;
    }

    const findJobById   = (id: number | null) => id ? (jobs.find(j => j.id === id) || null) : null;
    const findJobByModule = (mod: string, recId: number | null) =>
      recId ? (jobs.find(j => j.source_module === mod && Number(j.source_record_id) === recId) || null) : null;

    const qpaJob  = snap?.qpa_mirror_job_id
      ? findJobById(snap.qpa_mirror_job_id)
      : findJobByModule('quotation_pdf_artifacts', snap?.qpa_id ?? null);

    const snapJob = snap?.final_offer_mirror_job_id
      ? findJobById(snap.final_offer_mirror_job_id)
      : findJobByModule('offer_conversion', snap?.id ?? null);

    const edaJob  = eda?.mirror_job_id
      ? findJobById(eda.mirror_job_id)
      : findJobByModule('epc_document_attachments', eda?.id ?? null);

    const codJob  = cod?.mirror_job_id
      ? findJobById(cod.mirror_job_id)
      : findJobByModule('customer_order_documents', cod?.id ?? null);

    const docs = [
      {
        docType:   'Quotation PDF',
        present:   !!(snap?.qpa_id),
        gcsPath:   snap?.qpa_gcs_path   ?? null,
        gcsBucket: snap?.qpa_bucket     ?? null,
        ...jobToMirror(qpaJob),
      },
      {
        docType:   'EPC Quotation',
        present:   !!eda,
        gcsPath:   eda?.gcs_object_path ?? null,
        gcsBucket: eda?.gcs_bucket      ?? null,
        ...jobToMirror(edaJob),
      },
      {
        docType:   'Final Offer Snapshot',
        present:   !!(snap?.final_offer_gcs_path),
        gcsPath:   snap?.final_offer_gcs_path ?? null,
        gcsBucket: null,
        ...jobToMirror(snapJob),
      },
      {
        docType:   'Customer Order',
        present:   !!cod,
        gcsPath:   cod?.gcs_object_path ?? null,
        gcsBucket: cod?.gcs_bucket      ?? null,
        ...jobToMirror(codJob),
      },
    ];

    res.json({ docs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
