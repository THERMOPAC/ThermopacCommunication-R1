/**
 * epc-structure-job-routes.ts
 *
 * REST API for the SolidWorks WRITE (Structuring) Agent.
 *
 * Agent endpoints (x-node-id + x-node-token required):
 *   GET  /api/epc-structure-jobs/pending          — agent polls
 *   POST /api/epc-structure-jobs/:id/claim        — agent claims (atomic)
 *   POST /api/epc-structure-jobs/:id/complete     — agent reports success
 *   POST /api/epc-structure-jobs/:id/fail         — agent reports failure
 *
 * UI endpoints (session auth):
 *   POST /api/epc-drawing-controls/:id/structure-jobs  — create job from DDS
 *   GET  /api/epc-drawing-controls/:id/structure-jobs  — list jobs for a drawing
 *   POST /api/epc-structure-jobs/:id/retry             — reset failed job
 *
 * Settings endpoints (Superuser / Senior Manager+):
 *   GET  /api/epc-structuring-settings   — read singleton settings row
 *   PUT  /api/epc-structuring-settings   — upsert singleton settings row
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { db } from './db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  epcAgentNodes,
  epcStructureJobs,
  epcStructuringSettings,
  epcDrawingControls,
} from '@shared/schema';

const router = Router();

const STALE_CLAIM_MS  =  5 * 60 * 1000;  //  5 min — claimed but never started
const STALE_JOB_MS    = 15 * 60 * 1000;  // 15 min — processing but agent died

// ─────────────────────────────────────────────────────────────────────────────
// Auth middleware — validates x-node-id + x-node-token
// ─────────────────────────────────────────────────────────────────────────────

async function requireNodeAuth(req: Request, res: Response, next: NextFunction) {
  const nodeId    = req.headers['x-node-id']    as string | undefined;
  const nodeToken = req.headers['x-node-token'] as string | undefined;

  if (!nodeId || !nodeToken) {
    return res.status(401).json({ error: 'Missing x-node-id or x-node-token header' });
  }

  const [node] = await db
    .select()
    .from(epcAgentNodes)
    .where(and(eq(epcAgentNodes.nodeId, nodeId), eq(epcAgentNodes.active, true)))
    .limit(1);

  if (!node) return res.status(401).json({ error: 'Unknown or inactive node' });

  const valid = await bcrypt.compare(nodeToken, node.tokenHash);
  if (!valid) return res.status(401).json({ error: 'Invalid node token' });

  await db
    .update(epcAgentNodes)
    .set({
      lastSeenAt: new Date(),
      lastSeenVersion: (req.headers['user-agent'] ?? '').match(/ThermopacStructurer\/(\S+)/)?.[1] ?? null,
    })
    .where(eq(epcAgentNodes.nodeId, nodeId));

  (req as any).agentNodeId = nodeId;
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function _resetStaleJobs() {
  const now = Date.now();

  // Claimed but never started → back to pending
  await db.execute(sql`
    UPDATE epc_structure_jobs
    SET status = 'pending', node_id = NULL, claimed_at = NULL
    WHERE status = 'processing'
      AND claimed_at IS NOT NULL
      AND completed_at IS NULL
      AND failed_reason IS NULL
      AND EXTRACT(EPOCH FROM (NOW() - claimed_at)) * 1000 < ${STALE_CLAIM_MS}
      AND EXTRACT(EPOCH FROM (NOW() - claimed_at)) * 1000 >= ${STALE_CLAIM_MS}
  `);

  // Long-running processing → failed
  await db.execute(sql`
    UPDATE epc_structure_jobs
    SET status = 'failed', failed_reason = 'Agent timeout — job stale'
    WHERE status = 'processing'
      AND claimed_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (NOW() - claimed_at)) * 1000 > ${STALE_JOB_MS}
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/epc-structure-jobs/pending  — agent polls
// ─────────────────────────────────────────────────────────────────────────────

router.get('/epc-structure-jobs/pending', requireNodeAuth, async (req: Request, res: Response) => {
  try {
    await _resetStaleJobs();

    const jobs = await db
      .select({
        id:               epcStructureJobs.id,
        drawingControlId: epcStructureJobs.drawingControlId,
        drawingNumber:    epcStructureJobs.drawingNumber,
        revision:         epcStructureJobs.revision,
        mode:             epcStructureJobs.mode,
        ddsPayload:       epcStructureJobs.ddsPayload,
        projectContext:   epcStructureJobs.projectContext,
        templatePath:     epcStructureJobs.templatePath,
        stagingRoot:      epcStructureJobs.stagingRoot,
      })
      .from(epcStructureJobs)
      .where(eq(epcStructureJobs.status, 'pending'))
      .orderBy(epcStructureJobs.createdAt);

    return res.json({ ok: true, jobs });
  } catch (err: any) {
    console.error('[StructureJobs] /pending error:', err?.message ?? err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch pending jobs' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-structure-jobs/:id/claim  — atomic claim
// ─────────────────────────────────────────────────────────────────────────────

router.post('/epc-structure-jobs/:id/claim', requireNodeAuth, async (req: Request, res: Response) => {
  const jobId  = parseInt(req.params.id, 10);
  const nodeId = (req as any).agentNodeId as string;
  const { agent_version, machine_name } = req.body ?? {};

  const [claimed] = await db
    .update(epcStructureJobs)
    .set({
      status:       'processing',
      nodeId:       nodeId,
      agentVersion: agent_version ?? null,
      machineName:  machine_name ?? null,
      claimedAt:    new Date(),
    })
    .where(and(
      eq(epcStructureJobs.id, jobId),
      eq(epcStructureJobs.status, 'pending'),
    ))
    .returning();

  if (!claimed) {
    return res.status(409).json({ error: 'Job already claimed or not found' });
  }

  return res.json({
    ok:                 true,
    job_id:             claimed.id,
    job_type:           'drawing_structure',
    drawing_control_id: claimed.drawingControlId,
    drawing_number:     claimed.drawingNumber,
    revision:           claimed.revision,
    mode:               claimed.mode,
    dds:                claimed.ddsPayload,
    project_context:    claimed.projectContext,
    template_path:      claimed.templatePath,
    staging_root:       claimed.stagingRoot,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-structure-jobs/:id/complete
// ─────────────────────────────────────────────────────────────────────────────

const completeBodySchema = z.object({
  result: z.object({
    status:             z.enum(['success', 'partial']),
    file_path:          z.string().min(1),
    file_sha256:        z.string().optional(),   // SHA-256 hex of .slddrw after Save2
    properties_written: z.array(z.string()).optional(),
    duration_sec:       z.number().optional(),
    agent: z.object({
      node_id:       z.string().min(1),
      agent_version: z.string(),
      machine_name:  z.string().optional(),
    }),
  }).passthrough(),
});

router.post('/epc-structure-jobs/:id/complete', requireNodeAuth, async (req: Request, res: Response) => {
  const jobId  = parseInt(req.params.id, 10);
  const nodeId = (req as any).agentNodeId as string;

  const [job] = await db
    .select()
    .from(epcStructureJobs)
    .where(and(
      eq(epcStructureJobs.id, jobId),
      eq(epcStructureJobs.nodeId, nodeId),
      eq(epcStructureJobs.status, 'processing'),
    ))
    .limit(1);

  if (!job) return res.status(404).json({ error: 'Job not found or not owned by this node' });

  const parseResult = completeBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(422).json({ error: 'Invalid result body', issues: parseResult.error.issues });
  }

  const { result } = parseResult.data;

  if (result.agent.node_id !== nodeId) {
    return res.status(422).json({ error: `node_id mismatch: header="${nodeId}" body="${result.agent.node_id}"` });
  }

  await db
    .update(epcStructureJobs)
    .set({
      status:      'completed',
      completedAt: new Date(),
      result:      result as any,
    })
    .where(eq(epcStructureJobs.id, jobId));

  // Record when the working file was last structured (structuredAt timestamp only).
  // revisionCode is NOT touched — it advances only on formal Release Drawing.
  const _filePath    = ((result as any).file_path ?? '').trim();
  const _fileSha256  = ((result as any).file_sha256 ?? '').trim();
  const _fileCreated = _filePath.length > 0 &&
                       (result.status === 'success' || result.status === 'partial');

  if (_fileCreated && job.drawingControlId) {
    await db
      .update(epcDrawingControls)
      .set({ structuredAt: new Date() })
      .where(eq(epcDrawingControls.id, job.drawingControlId));
    console.log(
      `[StructureJobs] Job ${jobId} — structuredAt updated ` +
      `(drawing_control=${job.drawingControlId} mode=${job.mode} ` +
      `file=${_filePath} sha256=${_fileSha256 || 'n/a'})`
    );
  } else {
    console.log(
      `[StructureJobs] Job ${jobId} — structuredAt NOT updated: ` +
      `file_created=${_fileCreated} file_path="${_filePath}"`
    );
  }

  console.log(`[StructureJobs] Job ${jobId} completed by node ${nodeId} → ${result.file_path}`);
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-structure-jobs/:id/fail
// ─────────────────────────────────────────────────────────────────────────────

router.post('/epc-structure-jobs/:id/fail', requireNodeAuth, async (req: Request, res: Response) => {
  const jobId  = parseInt(req.params.id, 10);
  const nodeId = (req as any).agentNodeId as string;
  const reason = String(req.body?.reason ?? 'Unknown failure').slice(0, 1000);

  await db
    .update(epcStructureJobs)
    .set({
      status:       'failed',
      failedReason: reason,
      retryCount:   sql`${epcStructureJobs.retryCount} + 1`,
    })
    .where(and(
      eq(epcStructureJobs.id, jobId),
      eq(epcStructureJobs.nodeId, nodeId),
    ));

  console.log(`[StructureJobs] Job ${jobId} failed: ${reason}`);
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Revision helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Increment a revision string using engineering sequence:
 *   A→B … Z→AA → AB … AZ → BA … ZZ → AAA
 */
function nextRevision(rev: string): string {
  const s = (rev || 'A').toUpperCase().split('');
  let i = s.length - 1;
  while (i >= 0) {
    if (s[i] < 'Z') {
      s[i] = String.fromCharCode(s[i].charCodeAt(0) + 1);
      return s.join('');
    }
    s[i] = 'A';
    i--;
  }
  return 'A' + s.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-drawing-controls/:id/structure-jobs  — UI: create job
// ─────────────────────────────────────────────────────────────────────────────

const createJobSchema = z.object({
  drawing_number:  z.string().min(1),
  mode:            z.enum(['create_new', 'update_existing']),
  dds:             z.record(z.unknown()),
  project_context: z.record(z.unknown()).optional(),
  // revision is intentionally NOT accepted — server owns revision computation
});

router.post('/epc-drawing-controls/:id/structure-jobs', async (req: Request, res: Response) => {
  if (!(req as any).isAuthenticated?.()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const drawingControlId = parseInt(req.params.id, 10);
  if (isNaN(drawingControlId)) return res.status(400).json({ error: 'Invalid ID' });

  const parse = createJobSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(422).json({ error: 'Invalid request body', issues: parse.error.issues });
  }

  const { drawing_number, mode, dds, project_context } = parse.data;

  // Verify drawing control exists and read its current revision_code.
  // dbRevision may be null for a freshly created drawing control — do NOT default here.
  const [dc] = await db
    .select({ id: epcDrawingControls.id, revisionCode: epcDrawingControls.revisionCode })
    .from(epcDrawingControls)
    .where(eq(epcDrawingControls.id, drawingControlId))
    .limit(1);

  if (!dc) return res.status(404).json({ error: 'Drawing control not found' });

  const dbRevision = dc.revisionCode;  // null | string — revision is server-controlled only

  // ── Check for any completed jobs (any mode) ───────────────────────────────
  const completedJobs = await db
    .select({ id: epcStructureJobs.id, revision: epcStructureJobs.revision, mode: epcStructureJobs.mode })
    .from(epcStructureJobs)
    .where(and(
      eq(epcStructureJobs.drawingControlId, drawingControlId),
      eq(epcStructureJobs.status, 'completed'),
    ));

  const hasAnyCompleted = completedJobs.length > 0;

  // ── Determine revision for this job ──────────────────────────────────────
  // Revision is server-controlled. Never trust UI input for revision.
  // The .slddrw is a single working file — 'revision' is the value written into
  // the Revision title-block property, NOT a filename suffix.
  // revisionCode on the drawing control is NOT advanced by structuring;
  // it advances only on formal Release Drawing.
  let revision: string;
  const baseRevision: string | null = null;  // unused; kept for DB column compat

  if (mode === 'create_new') {
    // create_new builds the working file from template — only allowed once.
    if (hasAnyCompleted) {
      return res.status(409).json({
        error: 'Working drawing already exists. Use "Update Drawing" to re-structure it.',
        currentRevision: dbRevision ?? 'A',
      });
    }
    // Initial revision is always 'A' — server decides, UI has no say.
    revision = 'A';

  } else {
    // update_existing opens the working file in-place and rewrites properties.
    // No new file is created; no next-revision computed.
    if (!hasAnyCompleted) {
      return res.status(422).json({
        error: 'No working drawing found. Use "Create Drawing" first.',
        currentRevision: dbRevision ?? null,
      });
    }
    // currentRevision must be known — fail if the DB has no revision code.
    if (!dbRevision) {
      return res.status(422).json({
        error: 'Cannot update drawing: revision code is missing on the drawing control. ' +
               'Run "Create Drawing" first or check the drawing control record.',
      });
    }
    // The title-block Revision property stays as the current released revision
    // until a formal Release Drawing package is generated.
    revision = dbRevision;
  }

  // ── Hazard level pre-flight warnings ─────────────────────────────────────
  const dispatchWarnings: string[] = [];
  const mechData = (dds as any)?.mechanical_data;
  if (mechData && typeof mechData === 'object') {
    const columns: Array<{ key: string; label: string }> = [
      { key: 'shell',  label: 'Shell'  },
      { key: 'tube',   label: 'Tube'   },
      { key: 'jacket', label: 'Jacket' },
    ];
    for (const { key, label } of columns) {
      const col = mechData[key];
      if (col && typeof col === 'object' && (col.hazardLevel === null || col.hazardLevel === undefined || col.hazardLevel === '')) {
        dispatchWarnings.push(
          `${label} column: hazardLevel is not set — ${label.toUpperCase()}_HZ will be blank in the drawing. ` +
          'Complete the Hazard Classification in the ERP and re-dispatch.'
        );
      }
    }
  }

  // Pull current settings (template + staging paths)
  const [settings] = await db
    .select()
    .from(epcStructuringSettings)
    .limit(1);

  const templatePath = settings?.templatePath ?? null;
  const stagingRoot  = settings?.stagingRoot  ?? null;

  const user = (req as any).user;
  const [job] = await db
    .insert(epcStructureJobs)
    .values({
      drawingControlId,
      drawingNumber:  drawing_number,
      revision,
      baseRevision,
      mode,
      ddsPayload:     dds as any,
      projectContext: (project_context ?? null) as any,
      templatePath,
      stagingRoot,
      status:         'pending',
      createdBy:      user?.username ?? user?.email ?? null,
    })
    .returning({ id: epcStructureJobs.id, status: epcStructureJobs.status });

  console.log(
    `[StructureJobs] Job ${job.id} created — drawing_control=${drawingControlId} rev=${revision} mode=${mode}` +
    (dispatchWarnings.length ? ` — ${dispatchWarnings.length} warning(s)` : '')
  );
  return res.status(201).json({ ok: true, jobId: job.id, revision, warnings: dispatchWarnings });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/epc-drawing-controls/:id/structure-jobs  — UI: list jobs
// ─────────────────────────────────────────────────────────────────────────────

router.get('/epc-drawing-controls/:id/structure-jobs', async (req: Request, res: Response) => {
  const drawingControlId = parseInt(req.params.id, 10);
  if (isNaN(drawingControlId)) return res.status(400).json({ error: 'Invalid ID' });

  const jobs = await db
    .select({
      id:            epcStructureJobs.id,
      drawingNumber: epcStructureJobs.drawingNumber,
      revision:      epcStructureJobs.revision,
      baseRevision:  epcStructureJobs.baseRevision,
      mode:          epcStructureJobs.mode,
      status:        epcStructureJobs.status,
      nodeId:        epcStructureJobs.nodeId,
      machineName:   epcStructureJobs.machineName,
      agentVersion:  epcStructureJobs.agentVersion,
      claimedAt:     epcStructureJobs.claimedAt,
      completedAt:   epcStructureJobs.completedAt,
      failedReason:  epcStructureJobs.failedReason,
      retryCount:    epcStructureJobs.retryCount,
      result:        epcStructureJobs.result,
      createdBy:     epcStructureJobs.createdBy,
      createdAt:     epcStructureJobs.createdAt,
    })
    .from(epcStructureJobs)
    .where(eq(epcStructureJobs.drawingControlId, drawingControlId))
    .orderBy(desc(epcStructureJobs.createdAt));

  return res.json(jobs);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-structure-jobs/:id/retry  — UI: reset failed job
// ─────────────────────────────────────────────────────────────────────────────

router.post('/epc-structure-jobs/:id/retry', async (req: Request, res: Response) => {
  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid ID' });

  const [job] = await db
    .select({ id: epcStructureJobs.id, status: epcStructureJobs.status })
    .from(epcStructureJobs)
    .where(eq(epcStructureJobs.id, jobId))
    .limit(1);

  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'failed') {
    return res.status(422).json({ error: `Cannot retry job with status="${job.status}"` });
  }

  await db
    .update(epcStructureJobs)
    .set({ status: 'pending', nodeId: null, claimedAt: null, failedReason: null })
    .where(eq(epcStructureJobs.id, jobId));

  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/epc-structuring-settings
// ─────────────────────────────────────────────────────────────────────────────

router.get('/epc-structuring-settings', async (req: Request, res: Response) => {
  if (!(req as any).isAuthenticated?.()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const [row] = await db.select().from(epcStructuringSettings).limit(1);
  return res.json(row ?? { templatePath: null, stagingRoot: null });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/epc-structuring-settings  — upsert singleton row
// ─────────────────────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  templatePath: z.string().max(1000).nullable().optional(),
  stagingRoot:  z.string().max(1000).nullable().optional(),
});

router.put('/epc-structuring-settings', async (req: Request, res: Response) => {
  if (!(req as any).isAuthenticated?.()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = (req as any).user;
  const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager'];
  if (!allowedRoles.includes(user?.role ?? '')) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const parse = settingsSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(422).json({ error: 'Invalid body', issues: parse.error.issues });
  }

  const { templatePath = null, stagingRoot = null } = parse.data;

  const [existing] = await db.select({ id: epcStructuringSettings.id }).from(epcStructuringSettings).limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(epcStructuringSettings)
      .set({ templatePath, stagingRoot, updatedBy: user?.username ?? null, updatedAt: new Date() })
      .where(eq(epcStructuringSettings.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(epcStructuringSettings)
      .values({ templatePath, stagingRoot, updatedBy: user?.username ?? null })
      .returning();
  }

  return res.json({ ok: true, settings: row });
});

export default router;
