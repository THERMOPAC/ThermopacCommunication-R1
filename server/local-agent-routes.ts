/**
 * local-agent-routes.ts
 *
 * ERP-side REST API for the Local Windows Document Agent.
 *
 * Agent endpoints (auth: x-agent-code + x-api-key):
 *   POST /api/local-agent/heartbeat       — agent reports state
 *   POST /api/local-agent/jobs/claim      — agent polls for next pending job
 *   POST /api/local-agent/jobs/result     — agent submits job result
 *
 * UI / admin endpoints (session auth):
 *   GET  /api/local-agent/status          — dashboard status + job counts
 *   GET  /api/local-agent/jobs/recent     — last 50 jobs for activity log
 *   POST /api/local-agent/admin/register  — register a new agent node (Superuser)
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db } from './db';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import { documentAgentNodes, documentAgentJobs } from '@shared/schema';

const router = Router();

const ALLOWED_JOB_TYPES = [
  'CREATE_FOLDER',
  'SAVE_FILE',
  'SAVE_PDF',
  'VERIFY_FILE_EXISTS',
  'VERIFY_FOLDER_EXISTS',
  'HASH_VALIDATE',
] as const;

// ── Agent authentication middleware ──────────────────────────────────────────

async function requireAgentAuth(req: Request, res: Response, next: NextFunction) {
  const agentCode = req.headers['x-agent-code'] as string | undefined;
  const apiKey    = req.headers['x-api-key']    as string | undefined;

  if (!agentCode || !apiKey) {
    return res.status(401).json({ error: 'Missing x-agent-code or x-api-key header' });
  }

  const [node] = await db
    .select()
    .from(documentAgentNodes)
    .where(and(eq(documentAgentNodes.agentCode, agentCode), eq(documentAgentNodes.active, true)))
    .limit(1);

  if (!node) return res.status(401).json({ error: 'Unknown or inactive agent' });

  const valid = await bcrypt.compare(apiKey, node.apiKeyHash);
  if (!valid) return res.status(401).json({ error: 'Invalid API key' });

  (req as any).agentNode = node;
  next();
}

function requireSession(req: Request, res: Response, next: NextFunction) {
  if ((req as any).isAuthenticated?.()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

function requireSuperuser(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (user?.role === 'Superuser') return next();
  return res.status(403).json({ error: 'Superuser only' });
}

// ── POST /api/local-agent/heartbeat ──────────────────────────────────────────

router.post('/local-agent/heartbeat', requireAgentAuth, async (req: Request, res: Response) => {
  try {
    const node = (req as any).agentNode;
    const { agentState, agentVersion, machineName, lastError } = req.body;

    await db.update(documentAgentNodes).set({
      agentState:      agentState    || node.agentState,
      agentVersion:    agentVersion  || node.agentVersion,
      machineName:     machineName   || node.machineName,
      lastError:       lastError     || null,
      lastHeartbeatAt: new Date(),
      updatedAt:       new Date(),
    }).where(eq(documentAgentNodes.id, node.id));

    const [pendingCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(documentAgentJobs)
      .where(eq(documentAgentJobs.status, 'pending'));

    res.json({ ok: true, pendingJobs: Number(pendingCount.count) });
  } catch (err) {
    console.error('[local-agent] heartbeat error:', err);
    res.status(500).json({ error: 'Heartbeat failed' });
  }
});

// ── POST /api/local-agent/jobs/claim ─────────────────────────────────────────

router.post('/local-agent/jobs/claim', requireAgentAuth, async (req: Request, res: Response) => {
  try {
    const node = (req as any).agentNode;

    const jobs = await db
      .select()
      .from(documentAgentJobs)
      .where(eq(documentAgentJobs.status, 'pending'))
      .orderBy(documentAgentJobs.createdAt)
      .limit(1);

    if (jobs.length === 0) return res.json({ job: null });

    const job = jobs[0];
    const [claimed] = await db.update(documentAgentJobs).set({
      status:    'processing',
      agentCode: node.agentCode,
      claimedAt: new Date(),
      updatedAt: new Date(),
    }).where(
      and(eq(documentAgentJobs.id, job.id), eq(documentAgentJobs.status, 'pending'))
    ).returning();

    if (!claimed) return res.json({ job: null });

    res.json({ job: claimed });
  } catch (err) {
    console.error('[local-agent] jobs/claim error:', err);
    res.status(500).json({ error: 'Claim failed' });
  }
});

// ── POST /api/local-agent/jobs/result ────────────────────────────────────────

const ResultSchema = z.object({
  jobId:          z.number().int(),
  success:        z.boolean(),
  actualSha256:   z.string().length(64).optional(),
  resultLocalPath:z.string().optional(),
  resultPayload:  z.any().optional(),
  failedReason:   z.string().optional(),
});

router.post('/local-agent/jobs/result', requireAgentAuth, async (req: Request, res: Response) => {
  try {
    const parsed = ResultSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });

    const { jobId, success, actualSha256, resultLocalPath, resultPayload, failedReason } = parsed.data;
    const node = (req as any).agentNode;

    const [existing] = await db.select().from(documentAgentJobs).where(eq(documentAgentJobs.id, jobId)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Job not found' });
    if (existing.agentCode !== node.agentCode) return res.status(403).json({ error: 'Job not owned by this agent' });

    const [updated] = await db.update(documentAgentJobs).set({
      status:          success ? 'completed' : 'failed',
      actualSha256:    actualSha256    || null,
      resultLocalPath: resultLocalPath || null,
      resultPayload:   resultPayload   || null,
      failedReason:    failedReason    || null,
      completedAt:     new Date(),
      updatedAt:       new Date(),
    }).where(eq(documentAgentJobs.id, jobId)).returning();

    if (!success) {
      await db.update(documentAgentNodes).set({
        lastError: failedReason || 'Job failed',
        updatedAt: new Date(),
      }).where(eq(documentAgentNodes.agentCode, node.agentCode));
    }

    res.json({ ok: true, job: updated });
  } catch (err) {
    console.error('[local-agent] jobs/result error:', err);
    res.status(500).json({ error: 'Result submission failed' });
  }
});

// ── GET /api/local-agent/status ── (UI) ──────────────────────────────────────

router.get('/local-agent/status', requireSession, async (_req: Request, res: Response) => {
  try {
    const nodes = await db.select().from(documentAgentNodes).where(eq(documentAgentNodes.active, true));

    const [pending]    = await db.select({ count: sql<number>`COUNT(*)` }).from(documentAgentJobs).where(eq(documentAgentJobs.status, 'pending'));
    const [processing] = await db.select({ count: sql<number>`COUNT(*)` }).from(documentAgentJobs).where(eq(documentAgentJobs.status, 'processing'));
    const [completed]  = await db.select({ count: sql<number>`COUNT(*)` }).from(documentAgentJobs).where(eq(documentAgentJobs.status, 'completed'));
    const [failed]     = await db.select({ count: sql<number>`COUNT(*)` }).from(documentAgentJobs).where(eq(documentAgentJobs.status, 'failed'));

    res.json({
      nodes,
      counts: {
        pending:    Number(pending.count),
        processing: Number(processing.count),
        completed:  Number(completed.count),
        failed:     Number(failed.count),
      },
    });
  } catch (err) {
    console.error('[local-agent] status error:', err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// ── GET /api/local-agent/jobs/recent ── (UI) ─────────────────────────────────

router.get('/local-agent/jobs/recent', requireSession, async (_req: Request, res: Response) => {
  try {
    const jobs = await db
      .select()
      .from(documentAgentJobs)
      .orderBy(desc(documentAgentJobs.updatedAt))
      .limit(50);
    res.json(jobs);
  } catch (err) {
    console.error('[local-agent] jobs/recent error:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// ── POST /api/local-agent/admin/register ── (Superuser) ──────────────────────

const RegisterSchema = z.object({
  agentCode:       z.string().min(3).max(100),
  apiKey:          z.string().min(16),
  allowedRootPath: z.string().min(4),
  machineName:     z.string().optional(),
});

router.post('/local-agent/admin/register', requireSession, requireSuperuser, async (req: Request, res: Response) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });

    const { agentCode, apiKey, allowedRootPath, machineName } = parsed.data;
    const apiKeyHash = await bcrypt.hash(apiKey, 12);

    const existing = await db.select().from(documentAgentNodes).where(eq(documentAgentNodes.agentCode, agentCode)).limit(1);
    if (existing.length > 0) return res.status(409).json({ error: 'Agent code already registered' });

    const [node] = await db.insert(documentAgentNodes).values({
      agentCode,
      apiKeyHash,
      allowedRootPath,
      machineName:    machineName || null,
      agentState:     'OFFLINE',
    }).returning();

    res.json({ ok: true, node: { ...node, apiKeyHash: '[hidden]' } });
  } catch (err) {
    console.error('[local-agent] register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/local-agent/admin/enqueue ── (session auth, any role) ──────────

const EnqueueSchema = z.object({
  jobType:       z.enum(['CREATE_FOLDER','SAVE_FILE','SAVE_PDF','VERIFY_FILE_EXISTS','VERIFY_FOLDER_EXISTS','HASH_VALIDATE']),
  relativePath:  z.string().min(1),
  fileUrl:       z.string().optional(),
  fileName:      z.string().optional(),
  expectedSha256:z.string().length(64).optional(),
  sourceRef:     z.string().optional(),
});

router.post('/local-agent/admin/enqueue', requireSession, async (req: Request, res: Response) => {
  try {
    const parsed = EnqueueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });

    const user = (req as any).user;
    const [job] = await db.insert(documentAgentJobs).values({
      ...parsed.data,
      status:    'pending',
      createdBy: user?.id || null,
    }).returning();

    res.json({ ok: true, job });
  } catch (err) {
    console.error('[local-agent] enqueue error:', err);
    res.status(500).json({ error: 'Enqueue failed' });
  }
});

export default router;
