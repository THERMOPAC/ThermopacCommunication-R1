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
import * as path from 'path';
import * as fs from 'fs';
import archiver from 'archiver';
import { db } from './db';
import { eq, desc, sql, and } from 'drizzle-orm';
import { documentAgentNodes, documentAgentJobs } from '@shared/schema';

const AGENT_VERSION = '1.0.1';
const AGENT_DIR = path.join(process.cwd(), 'local-document-agent');

const router = Router();

const ALLOWED_JOB_TYPES = [
  'CREATE_FOLDER',
  'SAVE_FILE',
  'SAVE_PDF',
  'VERIFY_FILE_EXISTS',
  'VERIFY_FOLDER_EXISTS',
  'HASH_VALIDATE',
  'LIST_DIRECTORY',
  'SAVE_TEST_FILE',
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

    // Dual-Storage Policy: for SAVE_FILE jobs, generate a fresh signed URL at claim time.
    // The URL is returned in the response only — never stored in DB.
    let responseJob: any = { ...claimed };
    if (claimed.jobType === 'SAVE_FILE') {
      const { generateFreshSignedUrl } = await import('./utils/mirror-job-service');
      const freshUrl = await generateFreshSignedUrl(claimed.relativePath);
      responseJob = { ...claimed, fileUrl: freshUrl };
    }
    res.json({ job: responseJob });
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

    // Dual-Storage Policy: propagate mirror result to source record
    if (existing.sourceModule && existing.sourceRecordId) {
      const mirrorStatus = success ? 'mirrored' : 'failed';
      if (existing.sourceModule === 'company_documents') {
        await db.execute(
          sql`UPDATE company_documents SET mirror_status = ${mirrorStatus} WHERE id = ${existing.sourceRecordId}`
        );
      }
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

// ── POST /api/local-agent/admin/agents/:agentCode/rotate-key ── (Superuser) ──
// Generates a new random API key, stores its bcrypt hash, and returns a
// ready-to-use config.json as a file download. The plaintext key is shown
// only once and never stored. Drop this file into the agent install dir.

router.post('/local-agent/admin/agents/:agentCode/rotate-key', requireSession, requireSuperuser, async (req: Request, res: Response) => {
  try {
    const { agentCode } = req.params;
    const [node] = await db.select().from(documentAgentNodes)
      .where(eq(documentAgentNodes.agentCode, agentCode)).limit(1);
    if (!node) return res.status(404).json({ error: 'Agent not found' });

    // Generate a cryptographically random 32-char key
    const crypto = await import('crypto');
    const newApiKey = crypto.randomBytes(24).toString('base64url').slice(0, 32);
    const newHash   = await bcrypt.hash(newApiKey, 12);

    await db.update(documentAgentNodes)
      .set({ apiKeyHash: newHash, updatedAt: new Date() })
      .where(eq(documentAgentNodes.agentCode, agentCode));

    // Build the config object with all real values
    const config = {
      agentCode:           node.agentCode,
      erpBaseUrl:          'https://thermopac-communication-thermopacllp.replit.app',
      apiKey:              newApiKey,
      allowedRootPath:     node.allowedRootPath,
      pollIntervalSeconds: 20,
      maxConcurrentJobs:   1,
      logDir:              'C:\\ThermopacDocAgent\\logs',
      tempDir:             'C:\\ThermopacDocAgent\\temp',
    };

    const json = JSON.stringify(config, null, 2);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="config.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(json);
  } catch (err) {
    console.error('[local-agent] rotate-key error:', err);
    res.status(500).json({ error: 'Key rotation failed' });
  }
});

// ── GET /api/local-agent/package-info ── (session auth) ──────────────────────

router.get('/local-agent/package-info', requireSession, (_req: Request, res: Response) => {
  const distFile  = path.join(AGENT_DIR, 'dist', 'index.js');
  const distSizeKb = fs.existsSync(distFile)
    ? Math.round(fs.statSync(distFile).size / 1024)
    : 0;

  res.json({
    version:      AGENT_VERSION,
    packageName:  `thermopac-doc-agent-v${AGENT_VERSION}.zip`,
    builtAt:      fs.existsSync(distFile) ? fs.statSync(distFile).mtime.toISOString() : null,
    distSizeKb,
    files: [
      { name: 'dist/*.js',                              desc: 'Compiled agent modules (9 files, no build step needed)', sizeKb: distSizeKb },
      { name: 'package.json',                          desc: 'For npm install (installs node-windows service wrapper)' },
      { name: 'config.json.example',                   desc: 'Configuration template — copy to config.json and fill in' },
      { name: 'README.md',                             desc: 'Quick reference' },
      { name: 'SETUP.md',                              desc: 'Full step-by-step setup guide' },
      { name: 'install-service.bat',                   desc: 'Installs as Windows auto-start service (run as Admin)' },
      { name: 'uninstall-service.bat',                 desc: 'Removes the Windows service' },
      { name: 'start-service.bat',                     desc: 'Starts the service' },
      { name: 'stop-service.bat',                      desc: 'Stops the service' },
      { name: '.github/workflows/ci.yml',              desc: 'GitHub Actions CI — install, type-check, build, validate' },
    ],
    releaseNotes: [
      'v1.0.1 — Added LIST_DIRECTORY and SAVE_TEST_FILE job types',
      'SAVE_TEST_FILE: writes a timestamped PDF to the target folder; download from ERP to verify write access',
      'LIST_DIRECTORY: returns up to 100 entries (name, type, size, modified) from any allowed folder',
      'v1.0.0 — Initial release',
      'Supports: CREATE_FOLDER, SAVE_FILE, SAVE_PDF, VERIFY_FILE_EXISTS, VERIFY_FOLDER_EXISTS, HASH_VALIDATE',
      'SHA-256 verification on every file save (.tmp → rename after hash check)',
      'Automatic Windows Service registration via node-windows',
      'Allowed extensions: .pdf .docx .xlsx .csv .txt .png .jpg .jpeg .zip .dwg .dxf',
      'Poll interval: configurable (default 20 s), outbound HTTPS only',
    ],
    heartbeatPath: '/api/local-agent/heartbeat',
    claimPath:     '/api/local-agent/jobs/claim',
    resultPath:    '/api/local-agent/jobs/result',
  });
});

// ── GET /api/local-agent/download-dist-update ── (Superuser) ──────────────────
// Lightweight update package — only dist/*.js files, prefixed with dist/.
// User extracts this ZIP directly into their existing agent folder to update
// the compiled modules without touching config.json or any other files.

router.get('/local-agent/download-dist-update', requireSession, requireSuperuser, async (_req: Request, res: Response) => {
  try {
    const distDir = path.join(AGENT_DIR, 'dist');
    if (!fs.existsSync(distDir)) {
      return res.status(503).json({ error: 'Agent dist not built yet.' });
    }

    const zipName = `thermopac-doc-agent-v${AGENT_VERSION}-update.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    res.setHeader('Cache-Control', 'no-store');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[local-agent] dist-update zip error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Update package generation failed' });
    });
    archive.pipe(res);

    const distFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));
    for (const f of distFiles) {
      archive.file(path.join(distDir, f), { name: 'dist/' + f });
    }
    archive.append(AGENT_VERSION, { name: 'VERSION.txt' });

    await archive.finalize();
  } catch (err) {
    console.error('[local-agent] download-dist-update error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  }
});

// ── GET /api/local-agent/download-package ── (Superuser) ─────────────────────

router.get('/local-agent/download-package', requireSession, requireSuperuser, async (_req: Request, res: Response) => {
  try {
    const distFile = path.join(AGENT_DIR, 'dist', 'index.js');
    if (!fs.existsSync(distFile)) {
      return res.status(503).json({ error: 'Agent bundle not built yet. Contact system administrator.' });
    }

    const zipName = `thermopac-doc-agent-v${AGENT_VERSION}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[local-agent] package zip error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Package generation failed' });
    });

    archive.pipe(res);

    const root = `thermopac-doc-agent-v${AGENT_VERSION}/`;

    // All compiled dist files
    const distDir = path.join(AGENT_DIR, 'dist');
    if (fs.existsSync(distDir)) {
      const distFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));
      for (const f of distFiles) {
        archive.file(path.join(distDir, f), { name: root + 'dist/' + f });
      }
    }

    // TypeScript source files — required by GitHub CI (npm run build / tsc)
    const srcDir = path.join(AGENT_DIR, 'src');
    if (fs.existsSync(srcDir)) {
      archive.directory(srcDir, root + 'src');
    }

    // tsconfig.json — required by tsc at CI build time
    const tsconfigFile = path.join(AGENT_DIR, 'tsconfig.json');
    if (fs.existsSync(tsconfigFile)) {
      archive.file(tsconfigFile, { name: root + 'tsconfig.json' });
    }

    // Config and docs
    const staticFiles = [
      'package.json',
      'config.json.example',
      'README.md',
      'SETUP.md',
    ];
    for (const f of staticFiles) {
      const fp = path.join(AGENT_DIR, f);
      if (fs.existsSync(fp)) archive.file(fp, { name: root + f });
    }

    // Batch scripts
    const batchFiles = [
      'install-service.bat',
      'uninstall-service.bat',
      'start-service.bat',
      'stop-service.bat',
    ];
    for (const f of batchFiles) {
      const fp = path.join(AGENT_DIR, f);
      if (fs.existsSync(fp)) archive.file(fp, { name: root + f });
    }

    // Inno Setup script — required by GitHub CI to build setup.exe
    const issFile = path.join(AGENT_DIR, 'thermopac-doc-agent.iss');
    if (fs.existsSync(issFile)) {
      archive.file(issFile, { name: root + 'thermopac-doc-agent.iss' });
    }

    // GitHub Actions CI workflow
    const ciYml = path.join(AGENT_DIR, '.github', 'workflows', 'ci.yml');
    if (fs.existsSync(ciYml)) archive.file(ciYml, { name: root + '.github/workflows/ci.yml' });

    // VERSION.txt — plain-text version stamp for easy identification
    archive.append(AGENT_VERSION, { name: root + 'VERSION.txt' });

    await archive.finalize();
  } catch (err) {
    console.error('[local-agent] download-package error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  }
});

// ── GET /api/local-agent/download-source-package ── (Superuser) ──────────────
// Downloads everything Thermopac_Files_Folder needs for a proper source build:
//   src/*.ts, tsconfig.json, package.json, .bat scripts, .iss, ci.yml, docs
// User extracts this ZIP and pushes contents to Thermopac_Files_Folder on GitHub.

router.get('/local-agent/download-source-package', requireSession, requireSuperuser, async (_req: Request, res: Response) => {
  try {
    const zipName = `thermopac-doc-agent-v${AGENT_VERSION}-source.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    res.setHeader('Cache-Control', 'no-store');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[local-agent] source-package zip error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Source package generation failed' });
    });
    archive.pipe(res);

    // src/ — all TypeScript source files
    const srcDir = path.join(AGENT_DIR, 'src');
    if (fs.existsSync(srcDir)) {
      archive.directory(srcDir, 'src');
    }

    // tsconfig.json — required by tsc at CI build time
    const tsconfigFile = path.join(AGENT_DIR, 'tsconfig.json');
    if (fs.existsSync(tsconfigFile)) {
      archive.file(tsconfigFile, { name: 'tsconfig.json' });
    }

    // package.json
    const pkgFile = path.join(AGENT_DIR, 'package.json');
    if (fs.existsSync(pkgFile)) {
      archive.file(pkgFile, { name: 'package.json' });
    }

    // Docs and config
    for (const f of ['config.json.example', 'README.md', 'SETUP.md']) {
      const fp = path.join(AGENT_DIR, f);
      if (fs.existsSync(fp)) archive.file(fp, { name: f });
    }

    // Windows service batch scripts
    for (const f of ['install-service.bat', 'uninstall-service.bat', 'start-service.bat', 'stop-service.bat']) {
      const fp = path.join(AGENT_DIR, f);
      if (fs.existsSync(fp)) archive.file(fp, { name: f });
    }

    // Inno Setup script
    const issFile = path.join(AGENT_DIR, 'thermopac-doc-agent.iss');
    if (fs.existsSync(issFile)) {
      archive.file(issFile, { name: 'thermopac-doc-agent.iss' });
    }

    // GitHub Actions CI workflow
    const ciYml = path.join(AGENT_DIR, '.github', 'workflows', 'ci.yml');
    if (fs.existsSync(ciYml)) {
      archive.file(ciYml, { name: '.github/workflows/ci.yml' });
    }

    // VERSION.txt
    archive.append(AGENT_VERSION, { name: 'VERSION.txt' });

    await archive.finalize();
  } catch (err) {
    console.error('[local-agent] download-source-package error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  }
});

// ── POST /api/local-agent/admin/enqueue ── (session auth, any role) ──────────

const EnqueueSchema = z.object({
  jobType:       z.enum(['CREATE_FOLDER','SAVE_FILE','SAVE_PDF','VERIFY_FILE_EXISTS','VERIFY_FOLDER_EXISTS','HASH_VALIDATE','LIST_DIRECTORY','SAVE_TEST_FILE']),
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

// ── GET /api/local-agent/jobs/:id/test-file ── download PDF from SAVE_TEST_FILE result ──
router.get('/local-agent/jobs/:id/test-file', requireSession, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid job ID' });

    const [job] = await db.select().from(documentAgentJobs).where(eq(documentAgentJobs.id, id));
    if (!job)                            return res.status(404).json({ error: 'Job not found' });
    if (job.jobType !== 'SAVE_TEST_FILE') return res.status(400).json({ error: 'Not a SAVE_TEST_FILE job' });
    if (job.status  !== 'completed')      return res.status(400).json({ error: 'Job not completed yet' });

    const payload = job.resultPayload as any;
    if (!payload?.pdfBase64) return res.status(404).json({ error: 'No file data in result payload' });

    const buf      = Buffer.from(payload.pdfBase64, 'base64');
    const fileName = (payload.fileName as string) || `THERMOPAC_TEST_${id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (err) {
    console.error('[local-agent] test-file download error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  }
});

export default router;
