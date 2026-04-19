/**
 * epc-slddrw-job-routes.ts
 *
 * Cloud-side REST API for the SolidWorks extraction agent.
 * Baseline: docs/slddrw-extraction-agent-baseline-v3.md §6
 *
 * Endpoints:
 *   GET  /api/epc-slddrw-jobs/pending          — agent polls
 *   POST /api/epc-slddrw-jobs/:id/claim        — agent claims (atomic)
 *   POST /api/epc-slddrw-jobs/:id/complete     — agent uploads result (Zod validated)
 *   POST /api/epc-slddrw-jobs/:id/fail         — agent reports failure
 *
 *   GET  /api/epc-drawing-controls/:id/slddrw-jobs       — UI: list jobs for card
 *   POST /api/epc-slddrw-jobs/:id/retry                  — UI: reset failed job
 *   POST /api/epc-drawing-controls/:id/approve            — UI: approve (Senior Manager+)
 *   POST /api/epc-drawing-controls/:id/release/manufacturing — UI: release (Senior Manager+)
 *
 * All agent endpoints require x-node-id + x-node-token headers.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import multer from 'multer';
import { createHash } from 'crypto';
import { db } from './db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { epcAgentNodes, epcSlddrwExtractionJobs, epcDrawingControls } from '@shared/schema';
import { runDdsComparison } from './utils/dds-comparison-engine';
import { RELEASE_GATE_CONFIG } from './utils/release-gate-config';
import gcsClient, { bucketName } from './utils/storage-config';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max for .slddrw
});

const router = Router();

// ── Stale job timeout (ms) — jobs stuck in 'processing' beyond this are reset ─
const STALE_JOB_MS = 30 * 60 * 1000; // 30 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Auth middleware — validates x-node-id + x-node-token
// ─────────────────────────────────────────────────────────────────────────────

async function requireNodeAuth(req: Request, res: Response, next: NextFunction) {
  const nodeId    = req.headers['x-node-id']    as string | undefined;
  const nodeToken = req.headers['x-node-token'] as string | undefined;

  const tokenPreview = nodeToken ? nodeToken.substring(0, 6) + '…' : '(none)';
  console.log(`[NodeAuth] node_id="${nodeId ?? '(none)'}" token_prefix="${tokenPreview}"`);

  if (!nodeId || !nodeToken) {
    console.log(`[NodeAuth] FAIL — missing headers`);
    return res.status(401).json({ error: 'Missing x-node-id or x-node-token header' });
  }

  const [node] = await db
    .select()
    .from(epcAgentNodes)
    .where(and(eq(epcAgentNodes.nodeId, nodeId), eq(epcAgentNodes.active, true)))
    .limit(1);

  if (!node) {
    console.log(`[NodeAuth] FAIL — node_id="${nodeId}" not found in DB (or inactive)`);
    return res.status(401).json({ error: 'Unknown or inactive node' });
  }

  console.log(`[NodeAuth] node_id="${nodeId}" found — comparing token…`);
  const valid = await bcrypt.compare(nodeToken, node.tokenHash);
  if (!valid) {
    console.log(`[NodeAuth] FAIL — token mismatch for node_id="${nodeId}" (sent prefix: ${tokenPreview})`);
    return res.status(401).json({ error: 'Invalid node token' });
  }
  console.log(`[NodeAuth] OK — node_id="${nodeId}" authenticated`);

  // Update last seen
  await db
    .update(epcAgentNodes)
    .set({
      lastSeenAt:      new Date(),
      lastSeenVersion: (req.headers['user-agent'] ?? '').match(/ThermopacAgent\/(\S+)/)?.[1] ?? null,
    })
    .where(eq(epcAgentNodes.nodeId, nodeId));

  (req as any).agentNodeId = nodeId;
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod schema for /complete body
// ─────────────────────────────────────────────────────────────────────────────

const designDataRowSchema = z.object({
  parameter: z.string().min(1),
  value:     z.string(),
  unit:      z.string(),
});

const extractionResultSchema = z.object({
  schema_version: z.string(),
  agent: z.object({
    node_id:              z.string().min(1),
    agent_version:        z.string().min(1),
    machine_name:         z.string().optional(),
    extraction_timestamp: z.string().datetime({ offset: true }),
  }),
  file: z.object({
    original_filename: z.string().min(1),
    sha256:            z.string().regex(/^[a-f0-9]{64}$/i, 'sha256 must be 64-char hex'),
    file_size_bytes:   z.number().positive(),
  }),
  properties:  z.object({}).passthrough(),
  extraction_errors: z.object({
    properties:        z.string().nullable(),
    sheets:            z.string().nullable(),
    views:             z.string().nullable(),
    dimensions:        z.string().nullable(),
    annotations:       z.string().nullable(),
    tables:            z.string().nullable(),
    references:        z.string().nullable(),
    health:            z.string().nullable(),
    nozzles:           z.string().nullable(),
    design_data_table: z.string().nullable(),
  }),
  design_data_table: z.object({
    found: z.literal(true, {
      errorMap: () => ({ message: 'design_data_table.found must be true — Design Data table is mandatory' }),
    }),
    rows: z.array(designDataRowSchema).min(1, 'design_data_table.rows must be non-empty'),
  }),
  // All other sections optional but type-checked if present
  sheets:     z.array(z.object({}).passthrough()).optional(),
  views:      z.array(z.object({}).passthrough()).optional(),
  dimensions: z.object({}).passthrough().optional(),
  annotations:z.object({}).passthrough().optional(),
  tables:     z.object({}).passthrough().optional(),
  references: z.object({}).passthrough().optional(),
  health:     z.object({}).passthrough().optional(),
  nozzles:    z.object({}).passthrough().optional(),
}).passthrough();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/epc-slddrw-jobs/pending  — agent polls
// ─────────────────────────────────────────────────────────────────────────────

router.get('/epc-slddrw-jobs/pending', requireNodeAuth, async (req: Request, res: Response) => {
  try {
    // Auto-reset stale processing jobs before returning pending list
    await _resetStaleJobs();

    const jobs = await db
      .select({
        id:               epcSlddrwExtractionJobs.id,
        drawingControlId: epcSlddrwExtractionJobs.drawingControlId,
        filename:         epcSlddrwExtractionJobs.slddrwFilename,
      })
      .from(epcSlddrwExtractionJobs)
      .where(eq(epcSlddrwExtractionJobs.status, 'pending'))
      .orderBy(epcSlddrwExtractionJobs.createdAt);

    return res.json({ ok: true, jobs });
  } catch (err: any) {
    console.error('[Jobs] /pending error:', err?.message ?? err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch pending jobs' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-slddrw-jobs/:id/claim  — atomic claim, returns download URL
// ─────────────────────────────────────────────────────────────────────────────

router.post('/epc-slddrw-jobs/:id/claim', requireNodeAuth, async (req: Request, res: Response) => {
  const jobId  = parseInt(req.params.id, 10);
  const nodeId = (req as any).agentNodeId as string;
  const { agent_version, machine_name } = req.body ?? {};

  // Atomic claim: UPDATE only if status = 'pending'
  const [claimed] = await db
    .update(epcSlddrwExtractionJobs)
    .set({
      status:       'processing',
      nodeId:       nodeId,
      agentVersion: agent_version ?? null,
      machineName:  machine_name ?? null,
      claimedAt:    new Date(),
    })
    .where(and(
      eq(epcSlddrwExtractionJobs.id, jobId),
      eq(epcSlddrwExtractionJobs.status, 'pending'),
    ))
    .returning();

  if (!claimed) {
    return res.status(409).json({ error: 'Job already claimed or not found' });
  }

  // Generate pre-signed GCS download URL (15 min validity)
  let downloadUrl: string;
  try {
    const gcsFile = gcsClient.bucket(bucketName).file(claimed.slddrwGcsPath);
    const [url] = await gcsFile.getSignedUrl({
      action:  'read',
      expires: Date.now() + 15 * 60 * 1000,
    });
    downloadUrl = url;
  } catch (e: any) {
    // Roll back claim
    await db
      .update(epcSlddrwExtractionJobs)
      .set({ status: 'pending', nodeId: null, claimedAt: null })
      .where(eq(epcSlddrwExtractionJobs.id, jobId));
    return res.status(500).json({ error: `Failed to generate download URL: ${e.message}` });
  }

  return res.json({
    ok:           true,
    download_url: downloadUrl,
    filename:     claimed.slddrwFilename,
    sha256:       claimed.slddrwSha256,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-slddrw-jobs/:id/complete — agent uploads result (Zod validated)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/epc-slddrw-jobs/:id/complete', requireNodeAuth, async (req: Request, res: Response) => {
  const jobId  = parseInt(req.params.id, 10);
  const nodeId = (req as any).agentNodeId as string;

  // Verify job belongs to this node and is in processing
  const [job] = await db
    .select()
    .from(epcSlddrwExtractionJobs)
    .where(and(
      eq(epcSlddrwExtractionJobs.id, jobId),
      eq(epcSlddrwExtractionJobs.nodeId, nodeId),
      eq(epcSlddrwExtractionJobs.status, 'processing'),
    ))
    .limit(1);

  if (!job) {
    return res.status(404).json({ error: 'Job not found or not owned by this node' });
  }

  // ── Zod validation ────────────────────────────────────────────────────────
  const parseResult = extractionResultSchema.safeParse(req.body?.extraction_result);
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    return res.status(422).json({
      error:  'Extraction result JSON validation failed',
      issues,
    });
  }

  const extraction = parseResult.data;

  // node_id inside JSON must match x-node-id header
  if (extraction.agent?.node_id !== nodeId) {
    return res.status(422).json({
      error: `node_id mismatch: header="${nodeId}" body="${extraction.agent?.node_id}"`,
    });
  }

  // ── Mark completed + store result ─────────────────────────────────────────
  await db
    .update(epcSlddrwExtractionJobs)
    .set({
      status:          'completed',
      completedAt:     new Date(),
      extractionResult: extraction as any,
    })
    .where(eq(epcSlddrwExtractionJobs.id, jobId));

  // ── Trigger DDS comparison (async, non-blocking) ──────────────────────────
  _runDdsComparison(jobId, job.drawingControlId, extraction).catch(e =>
    console.error(`[DDS] Comparison failed for job ${jobId}:`, e),
  );

  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-slddrw-jobs/:id/fail  — agent reports failure
// ─────────────────────────────────────────────────────────────────────────────

router.post('/epc-slddrw-jobs/:id/fail', requireNodeAuth, async (req: Request, res: Response) => {
  const jobId  = parseInt(req.params.id, 10);
  const nodeId = (req as any).agentNodeId as string;
  const reason = String(req.body?.reason ?? 'Unknown failure').slice(0, 1000);

  await db
    .update(epcSlddrwExtractionJobs)
    .set({
      status:       'failed',
      failedReason: reason,
      retryCount:   sql`${epcSlddrwExtractionJobs.retryCount} + 1`,
    })
    .where(and(
      eq(epcSlddrwExtractionJobs.id, jobId),
      eq(epcSlddrwExtractionJobs.nodeId, nodeId),
    ));

  console.log(`[Jobs] Job ${jobId} marked failed by node ${nodeId}: ${reason}`);
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/epc-drawing-controls/:id/slddrw-jobs  — UI: list jobs for card
// ─────────────────────────────────────────────────────────────────────────────

router.get('/epc-drawing-controls/:id/slddrw-jobs', async (req: Request, res: Response) => {
  const drawingControlId = parseInt(req.params.id, 10);
  if (isNaN(drawingControlId)) return res.status(400).json({ error: 'Invalid ID' });

  const jobs = await db
    .select({
      id:                   epcSlddrwExtractionJobs.id,
      status:               epcSlddrwExtractionJobs.status,
      slddrwFilename:       epcSlddrwExtractionJobs.slddrwFilename,
      nodeId:               epcSlddrwExtractionJobs.nodeId,
      machineName:          epcSlddrwExtractionJobs.machineName,
      agentVersion:         epcSlddrwExtractionJobs.agentVersion,
      claimedAt:            epcSlddrwExtractionJobs.claimedAt,
      completedAt:          epcSlddrwExtractionJobs.completedAt,
      failedReason:         epcSlddrwExtractionJobs.failedReason,
      retryCount:           epcSlddrwExtractionJobs.retryCount,
      ddsComparisonStatus:  epcSlddrwExtractionJobs.ddsComparisonStatus,
      ddsComparisonResult:  epcSlddrwExtractionJobs.ddsComparisonResult,
      extractionResult:     epcSlddrwExtractionJobs.extractionResult,
      createdAt:            epcSlddrwExtractionJobs.createdAt,
    })
    .from(epcSlddrwExtractionJobs)
    .where(eq(epcSlddrwExtractionJobs.drawingControlId, drawingControlId))
    .orderBy(desc(epcSlddrwExtractionJobs.createdAt));

  return res.json(jobs);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-slddrw-jobs/:id/retry  — UI: reset failed job to pending
// ─────────────────────────────────────────────────────────────────────────────

router.post('/epc-slddrw-jobs/:id/retry', async (req: Request, res: Response) => {
  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid ID' });

  const [job] = await db
    .select({ id: epcSlddrwExtractionJobs.id,
              status: epcSlddrwExtractionJobs.status,
              retryCount: epcSlddrwExtractionJobs.retryCount })
    .from(epcSlddrwExtractionJobs)
    .where(eq(epcSlddrwExtractionJobs.id, jobId))
    .limit(1);

  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'failed') {
    return res.status(422).json({ error: `Cannot retry job with status="${job.status}"` });
  }

  await db
    .update(epcSlddrwExtractionJobs)
    .set({
      status:       'pending',
      nodeId:       null,
      claimedAt:    null,
      failedReason: null,
    })
    .where(eq(epcSlddrwExtractionJobs.id, jobId));

  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-drawing-controls/:id/upload-slddrw
// UI upload: accepts multipart .slddrw file, stores to GCS, creates pending job
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  '/epc-drawing-controls/:id/upload-slddrw',
  (req: Request, res: Response, next: any) => {
    if (!(req as any).isAuthenticated?.()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  },
  upload.single('file'),
  async (req: Request, res: Response) => {
    const drawingControlId = parseInt(req.params.id, 10);
    if (isNaN(drawingControlId)) {
      return res.status(400).json({ error: 'Invalid drawing control ID' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (ext !== 'slddrw') {
      return res.status(400).json({ error: 'Only .slddrw files are accepted' });
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const timestamp = Date.now();
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const gcsPath = `epc-slddrw/${drawingControlId}/${timestamp}-${safeFilename}`;

    try {
      await gcsClient.bucket(bucketName).file(gcsPath).save(file.buffer, {
        contentType: 'application/octet-stream',
        metadata: { sha256, originalFilename: file.originalname },
      });
    } catch (e: any) {
      console.error('[UploadSlddrw] GCS upload failed:', e?.message);
      return res.status(500).json({ error: 'Failed to store file' });
    }

    const user = (req as any).user;
    const [job] = await db
      .insert(epcSlddrwExtractionJobs)
      .values({
        drawingControlId,
        slddrwGcsPath:  gcsPath,
        slddrwFilename: file.originalname,
        slddrwSha256:   sha256,
        status:         'pending',
        createdBy:      user?.username ?? user?.email ?? null,
      })
      .returning({ id: epcSlddrwExtractionJobs.id });

    console.log(`[UploadSlddrw] Job ${job.id} created for drawing_control ${drawingControlId} — file=${file.originalname}`);
    return res.status(201).json({ ok: true, jobId: job.id });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-slddrw-jobs  — internal: create job when .slddrw is uploaded
// Called by EPC document routes after a .slddrw attachment is saved to GCS
// ─────────────────────────────────────────────────────────────────────────────

router.post('/epc-slddrw-jobs', async (req: Request, res: Response) => {
  const { drawingControlId, attachmentId, slddrwGcsPath, slddrwFilename,
          slddrwSha256, createdBy } = req.body ?? {};

  if (!drawingControlId || !slddrwGcsPath) {
    return res.status(400).json({ error: 'drawingControlId and slddrwGcsPath required' });
  }

  const [job] = await db
    .insert(epcSlddrwExtractionJobs)
    .values({
      drawingControlId: Number(drawingControlId),
      attachmentId:     attachmentId ? Number(attachmentId) : null,
      slddrwGcsPath:    String(slddrwGcsPath),
      slddrwFilename:   slddrwFilename ? String(slddrwFilename) : null,
      slddrwSha256:     slddrwSha256 ? String(slddrwSha256) : null,
      status:           'pending',
      createdBy:        createdBy ? String(createdBy) : null,
    })
    .returning({ id: epcSlddrwExtractionJobs.id });

  console.log(`[Jobs] Created extraction job ${job.id} for drawing_control ${drawingControlId}`);
  return res.status(201).json({ ok: true, jobId: job.id });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-drawing-controls/:id/approve
//
// Approval gate — enforces DDS comparison result before allowing approval.
// Requires authenticated session with superuser or admin role.
// ─────────────────────────────────────────────────────────────────────────────

router.post('/epc-drawing-controls/:id/approve', async (req: Request, res: Response) => {
  if (!(req as any).isAuthenticated?.()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = (req as any).user;
  const role = String(user?.role ?? '');
  const approveAllowed = RELEASE_GATE_CONFIG.approveAllowedRoles
    .some(r => r.toLowerCase() === role.toLowerCase());
  if (!approveAllowed) {
    return res.status(403).json({ error: 'Forbidden — Senior Manager or above required' });
  }

  const drawingControlId = parseInt(req.params.id, 10);
  if (isNaN(drawingControlId)) return res.status(400).json({ error: 'Invalid ID' });

  // Find the latest completed extraction job for this drawing control
  const [latestJob] = await db
    .select({
      id:                  epcSlddrwExtractionJobs.id,
      ddsComparisonStatus: epcSlddrwExtractionJobs.ddsComparisonStatus,
    })
    .from(epcSlddrwExtractionJobs)
    .where(and(
      eq(epcSlddrwExtractionJobs.drawingControlId, drawingControlId),
      eq(epcSlddrwExtractionJobs.status, 'completed'),
    ))
    .orderBy(desc(epcSlddrwExtractionJobs.createdAt))
    .limit(1);

  if (!latestJob) {
    return res.status(422).json({ error: 'No completed extraction job found for this drawing control' });
  }

  const ddsStatus = latestJob.ddsComparisonStatus;

  if (!ddsStatus) {
    return res.status(422).json({ error: 'DDS comparison not yet complete — please wait and try again' });
  }

  if (ddsStatus === 'fail') {
    return res.status(422).json({
      error: 'DDS comparison failed — critical parameter mismatch blocks approval',
      dds_status: 'fail',
    });
  }

  if (ddsStatus === 'blocked') {
    return res.status(422).json({
      error: 'DDS comparison blocked — no DDS record found, resolve before approving',
      dds_status: 'blocked',
    });
  }

  if (ddsStatus === 'warn') {
    const ack = req.body?.acknowledge_warnings === true;
    if (!ack) {
      return res.status(422).json({
        error: 'DDS comparison has warnings — set acknowledge_warnings: true to confirm you have reviewed them',
        dds_status: 'warn',
      });
    }
  }

  // Gate passed — approve the drawing control
  await db
    .update(epcDrawingControls)
    .set({
      approvedBy: user?.id ? Number(user.id) : null,
      approvedAt: new Date(),
      status:     'approved',
    })
    .where(eq(epcDrawingControls.id, drawingControlId));

  console.log(`[Approve] drawing_control ${drawingControlId} approved by user ${user?.id ?? user?.username} (dds_status=${ddsStatus})`);
  return res.json({ ok: true, status: 'approved' });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-drawing-controls/:id/release/manufacturing
//
// Manufacturing release gate — enforces approval pre-condition.
// Allowed roles: Superuser, General Manager, Senior Manager.
// Gate order:
//   1. Authenticated + correct role
//   2. manufacturingReleaseRequired = true
//   3. status = 'approved'
//   4. If config requirePassForManufacturing: DDS must be 'pass'
//   5. Not already released (idempotency check)
// Writes: releasedForManufacturing, releasedForManufacturingAt/By,
//         releasedBy, releasedAt, releaseNote, status = 'released'
// ─────────────────────────────────────────────────────────────────────────────

router.post('/epc-drawing-controls/:id/release/manufacturing', async (req: Request, res: Response) => {
  if (!(req as any).isAuthenticated?.()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = (req as any).user;
  const role = String(user?.role ?? '');
  const releaseAllowed = RELEASE_GATE_CONFIG.manufacturingReleaseAllowedRoles
    .some(r => r.toLowerCase() === role.toLowerCase());
  if (!releaseAllowed) {
    return res.status(403).json({ error: 'Forbidden — Senior Manager or above required' });
  }

  const drawingControlId = parseInt(req.params.id, 10);
  if (isNaN(drawingControlId)) return res.status(400).json({ error: 'Invalid ID' });

  const [dc] = await db
    .select({
      id:                          epcDrawingControls.id,
      status:                      epcDrawingControls.status,
      manufacturingReleaseRequired: epcDrawingControls.manufacturingReleaseRequired,
      releasedForManufacturing:    epcDrawingControls.releasedForManufacturing,
    })
    .from(epcDrawingControls)
    .where(eq(epcDrawingControls.id, drawingControlId))
    .limit(1);

  if (!dc) {
    return res.status(404).json({ error: 'Drawing control not found' });
  }

  if (!dc.manufacturingReleaseRequired) {
    return res.status(422).json({ error: 'Manufacturing release is not required for this drawing' });
  }

  if (dc.status !== 'approved') {
    return res.status(422).json({
      error: `Drawing must be approved before release — current status: "${dc.status}"`,
      current_status: dc.status,
    });
  }

  if (dc.releasedForManufacturing) {
    return res.status(409).json({ error: 'Drawing has already been released for manufacturing' });
  }

  // Optional config gate: require clean 'pass', not just 'warn'
  if (RELEASE_GATE_CONFIG.requirePassForManufacturing) {
    const [latestJob] = await db
      .select({ ddsComparisonStatus: epcSlddrwExtractionJobs.ddsComparisonStatus })
      .from(epcSlddrwExtractionJobs)
      .where(and(
        eq(epcSlddrwExtractionJobs.drawingControlId, drawingControlId),
        eq(epcSlddrwExtractionJobs.status, 'completed'),
      ))
      .orderBy(desc(epcSlddrwExtractionJobs.createdAt))
      .limit(1);

    if (latestJob?.ddsComparisonStatus !== 'pass') {
      return res.status(422).json({
        error: 'Manufacturing release requires a clean DDS pass — current status has warnings',
        dds_status: latestJob?.ddsComparisonStatus ?? null,
      });
    }
  }

  const now = new Date();
  const releaseNote = req.body?.release_note ?? null;
  const userId = user?.id ? Number(user.id) : null;

  await db
    .update(epcDrawingControls)
    .set({
      releasedForManufacturing:   true,
      releasedForManufacturingAt: now,
      releasedForManufacturingBy: userId,
      releasedBy:                 userId,
      releasedAt:                 now,
      releaseNote:                releaseNote,
      status:                     'released',
    })
    .where(eq(epcDrawingControls.id, drawingControlId));

  console.log(
    `[Release] drawing_control ${drawingControlId} released for manufacturing`
    + ` by user ${user?.id ?? user?.username} (role=${role})`,
  );
  return res.json({ ok: true, status: 'released' });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/epc-agent-nodes/auto-register
//
// Testing mode only — guarded by AGENT_AUTO_REGISTER=true env var.
// Agent sends its locally-generated credentials; cloud upserts the node row.
// Production: this endpoint returns 403 (AGENT_AUTO_REGISTER unset/false).
// ─────────────────────────────────────────────────────────────────────────────

router.post('/epc-agent-nodes/auto-register', async (req: Request, res: Response) => {
  // ── Testing mode guard ────────────────────────────────────────────────────
  if (process.env.AGENT_AUTO_REGISTER !== 'true') {
    return res.status(403).json({
      error: 'Auto-registration is disabled. '
           + 'Set AGENT_AUTO_REGISTER=true on the server to enable testing mode.',
      hint: 'In production, nodes must be registered by an admin via the ERP.',
    });
  }

  // ── Validate body ─────────────────────────────────────────────────────────
  const autoRegSchema = z.object({
    node_id:       z.string().min(1).max(100),
    node_token:    z.string().min(16),
    machine_name:  z.string().optional(),
    agent_version: z.string().optional(),
  });

  const parsed = autoRegSchema.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    return res.status(400).json({ error: 'Invalid request body', issues });
  }

  const { node_id, node_token, machine_name, agent_version } = parsed.data;

  // ── Hash the agent-generated token ───────────────────────────────────────
  const tokenHash = await bcrypt.hash(node_token, 10);

  // ── Upsert: create node if new, update token if already exists ────────────
  const existing = await db
    .select({ id: epcAgentNodes.id })
    .from(epcAgentNodes)
    .where(eq(epcAgentNodes.nodeId, node_id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(epcAgentNodes)
      .set({
        tokenHash,
        machineName:     machine_name ?? null,
        lastSeenAt:      new Date(),
        lastSeenVersion: agent_version ?? null,
        active:          true,
      })
      .where(eq(epcAgentNodes.nodeId, node_id));
  } else {
    await db
      .insert(epcAgentNodes)
      .values({
        nodeId:          node_id,
        tokenHash,
        machineName:     machine_name ?? null,
        label:           machine_name ?? node_id,
        active:          true,
        lastSeenAt:      new Date(),
        lastSeenVersion: agent_version ?? null,
        createdBy:       'auto-register',
      });
  }

  const ts = new Date().toISOString();
  console.log(
    `[AutoReg] ${ts} | node_id="${node_id}" | machine_name="${machine_name ?? 'unknown'}" `
    + `| action="${existing.length ? 'updated' : 'registered'}" | version="${agent_version ?? 'unknown'}" `
    + `| [TESTING MODE AGENT_AUTO_REGISTER=true]`,
  );

  return res.json({ ok: true, node_id, mode: 'testing' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function _runDdsComparison(
  jobId: number,
  drawingControlId: number,
  extraction: any,
): Promise<void> {
  console.log(`[DDS] Running comparison for job ${jobId}, drawing_control ${drawingControlId}`);
  const output = await runDdsComparison(drawingControlId, extraction);
  await db
    .update(epcSlddrwExtractionJobs)
    .set({
      ddsComparisonStatus: output.status,
      ddsComparisonResult: output.result as any,
    })
    .where(eq(epcSlddrwExtractionJobs.id, jobId));
  console.log(`[DDS] Comparison complete for job ${jobId}: status=${output.status}`);
}

async function _resetStaleJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_JOB_MS);
  const stale = await db
    .update(epcSlddrwExtractionJobs)
    .set({
      status:       'failed',
      failedReason: 'Job timed out in processing state (stale)',
      retryCount:   sql`${epcSlddrwExtractionJobs.retryCount} + 1`,
    })
    .where(and(
      eq(epcSlddrwExtractionJobs.status, 'processing'),
      sql`${epcSlddrwExtractionJobs.claimedAt} < ${cutoff}`,
    ))
    .returning({ id: epcSlddrwExtractionJobs.id });

  if (stale.length > 0) {
    console.log(`[Jobs] Reset ${stale.length} stale job(s) to failed`);
  }
}

export default router;
