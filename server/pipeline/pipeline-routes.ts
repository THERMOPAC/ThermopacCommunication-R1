import { Router, Request, Response } from 'express';
import { db } from '../db';
import { pool } from '../db';
import { sql } from 'drizzle-orm';
import { generateExecutionDrafts } from './generate-execution-drafts';
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
    const summary = await generateExecutionDrafts(projectId, user.id);
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

export default router;
