// ─────────────────────────────────────────────────────────────────────────────
// EPC Drawing Verification Routes
// POST /api/epc-drawing-controls/:id/verify-pdf        — run gate + extraction
// GET  /api/epc-drawing-controls/:id/verifications     — list for this DWG control
// GET  /api/epc-drawing-verifications/:id/report       — HTML report
// GET  /api/epc-drawing-verifications/:id/report.pdf   — PDF export
// POST /api/epc-drawing-verifications/:id/accept       — mark accepted + attach
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { execSync } from 'child_process';
import puppeteer from 'puppeteer-core';
import { db } from './db';
import { eq, desc } from 'drizzle-orm';
import { epcDrawingVerifications } from '@shared/schema';
import { verifyDrawing, markVerificationAccepted } from './utils/drawing-verifier';
import { generateVerificationReport } from './utils/drawing-report-template';
import type { DrawingExtraction } from './utils/drawing-ai-extractor';
import type { RuleResult } from './utils/drawing-rule-engine';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted for drawing verification.'));
    }
  },
});

// ── POST /api/epc-drawing-controls/:id/verify-pdf ─────────────────────────────

router.post('/epc-drawing-controls/:id/verify-pdf', upload.single('pdf'), async (req: Request, res: Response) => {
  const drawingControlId = parseInt(req.params.id, 10);
  if (isNaN(drawingControlId)) {
    return res.status(400).json({ error: 'Invalid drawing control ID.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const attemptedBy = (req as any).user?.name ?? (req as any).user?.email ?? 'system';

  const result = await verifyDrawing(
    drawingControlId,
    req.file.buffer,
    req.file.originalname,
    attemptedBy,
  );

  if (!result.ok) {
    return res.status(422).json({
      ok: false,
      gateError: result.gateError,
      verificationId: result.verificationId,
    });
  }

  const { verificationId, overallStatus, ruleOutput, extraction, equipmentConfig, extractionEngine } = result.result;

  return res.json({
    ok: true,
    verificationId,
    overallStatus,
    equipmentConfig,
    extractionEngine,
    criticalFailures: ruleOutput.criticalFailures,
    highFailures:     ruleOutput.highFailures,
    totalWarnings:    ruleOutput.totalWarnings,
    totalSkipped:     ruleOutput.totalSkipped,
    totalChecks:      ruleOutput.layer1.length + ruleOutput.layer2.length,
    applicableSections: ruleOutput.applicableSections,
    extractedTitle:    extraction.title?.value,
    extractedDrawingNo: extraction.drawingNumber?.value,
    extractedTagNo:    extraction.tagNumber?.value,
    extractedRevision: extraction.revision?.value,
    layer1Summary: ruleOutput.layer1.map(r => ({
      item: r.checklistItem,
      task: r.task,
      status: r.status,
      severity: r.severity,
      expected: r.expected,
      actual: r.actual,
    })),
  });
});

// ── GET /api/epc-drawing-controls/:id/verifications ───────────────────────────

router.get('/epc-drawing-controls/:id/verifications', async (req: Request, res: Response) => {
  const drawingControlId = parseInt(req.params.id, 10);
  if (isNaN(drawingControlId)) {
    return res.status(400).json({ error: 'Invalid drawing control ID.' });
  }

  const rows = await db
    .select({
      id: epcDrawingVerifications.id,
      drawingControlId: epcDrawingVerifications.drawingControlId,
      equipmentConfig: epcDrawingVerifications.equipmentConfig,
      pdfFilename: epcDrawingVerifications.pdfFilename,
      pdfSizeBytes: epcDrawingVerifications.pdfSizeBytes,
      extractionEngine: epcDrawingVerifications.extractionEngine,
      overallStatus: epcDrawingVerifications.overallStatus,
      criticalFailures: epcDrawingVerifications.criticalFailures,
      highFailures: epcDrawingVerifications.highFailures,
      totalWarnings: epcDrawingVerifications.totalWarnings,
      totalSkipped: epcDrawingVerifications.totalSkipped,
      ddsGateResult: epcDrawingVerifications.ddsGateResult,
      ddsGateMessage: epcDrawingVerifications.ddsGateMessage,
      attemptedBy: epcDrawingVerifications.attemptedBy,
      attemptedAt: epcDrawingVerifications.attemptedAt,
      accepted: epcDrawingVerifications.accepted,
      acceptedAt: epcDrawingVerifications.acceptedAt,
      attachmentId: epcDrawingVerifications.attachmentId,
    })
    .from(epcDrawingVerifications)
    .where(eq(epcDrawingVerifications.drawingControlId, drawingControlId))
    .orderBy(desc(epcDrawingVerifications.attemptedAt));

  return res.json(rows);
});

// ── GET /api/epc-drawing-verifications/:id/report ─────────────────────────────

router.get('/epc-drawing-verifications/:id/report', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });

  const [row] = await db
    .select()
    .from(epcDrawingVerifications)
    .where(eq(epcDrawingVerifications.id, id))
    .limit(1);

  if (!row) return res.status(404).json({ error: 'Verification not found.' });

  const extraction = (row.extractionResult ?? {}) as DrawingExtraction;
  const layer1 = (row.layer1Results ?? []) as RuleResult[];
  const layer2 = (row.layer2Results ?? []) as RuleResult[];

  const html = generateVerificationReport(row, extraction, layer1, layer2);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(html);
});

// ── GET /api/epc-drawing-verifications/:id/report.pdf ─────────────────────────

function getChromiumPath(): string {
  try { return execSync('which chromium', { encoding: 'utf8' }).trim(); } catch {}
  return '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
}

router.get('/epc-drawing-verifications/:id/report.pdf', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });

  const [row] = await db
    .select()
    .from(epcDrawingVerifications)
    .where(eq(epcDrawingVerifications.id, id))
    .limit(1);

  if (!row) return res.status(404).json({ error: 'Verification not found.' });

  const extraction = (row.extractionResult ?? {}) as DrawingExtraction;
  const layer1 = (row.layer1Results ?? []) as RuleResult[];
  const layer2 = (row.layer2Results ?? []) as RuleResult[];

  const html = generateVerificationReport(row, extraction, layer1, layer2);

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    executablePath: getChromiumPath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const rawPdf = await page.pdf({
      format: 'A3',
      landscape: true,
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    const pdfBuffer = Buffer.from(rawPdf);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="drawing-verification-report-${id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.end(pdfBuffer);
  } finally {
    await browser.close();
  }
});

// ── POST /api/epc-drawing-verifications/:id/accept ────────────────────────────

router.post('/epc-drawing-verifications/:id/accept', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });

  const { attachmentId } = req.body ?? {};

  const [row] = await db
    .select({ id: epcDrawingVerifications.id, overallStatus: epcDrawingVerifications.overallStatus })
    .from(epcDrawingVerifications)
    .where(eq(epcDrawingVerifications.id, id))
    .limit(1);

  if (!row) return res.status(404).json({ error: 'Verification not found.' });
  if (row.overallStatus === 'fail') {
    return res.status(422).json({ error: 'Cannot accept a failed verification. Upload is blocked.' });
  }

  await markVerificationAccepted(id, attachmentId ?? null);
  return res.json({ ok: true });
});

export default router;
