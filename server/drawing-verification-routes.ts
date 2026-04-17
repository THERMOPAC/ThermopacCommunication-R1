import express, { Request, Response } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import { db } from './db';
import { drawingRevisions, drawingExtractions, ruleEvaluations, agentReports, drawingApprovals, projects } from '@shared/schema';
import { roleHierarchy } from '@shared/roles';
import { eq, and, desc } from 'drizzle-orm';
import gcsClient, { bucketName } from './utils/storage-config';
import {
  extractDrawingProperties,
  EXTRACTION_ENGINE,
  EXTRACTION_ENGINE_VERSION,
  EXTRACTION_TIMEOUT_MS,
} from './utils/ole-extractor';
import {
  RULE_ENGINE,
  RULE_ENGINE_VERSION,
  computeExtractionGate,
  evaluateRules,
  computeOverallVerdict,
} from './utils/rule-engine';
import {
  AGENT_VERSION,
  runAgentReview,
  deriveOverallAssessment,
} from './utils/agent-reviewer';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function ensureAuthenticated(req: Request, res: Response, next: express.NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

const KNOWN_INCOMPATIBLE_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/webp',
  'image/svg+xml',
  'text/plain',
  'text/html',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'video/mp4',
  'audio/mpeg',
]);

function validateSlddrwFile(
  originalname: string,
  mimetype: string | undefined,
  size: number,
): string | null {
  const ext = originalname.split('.').pop()?.toLowerCase();
  if (ext !== 'slddrw') {
    return `Invalid file type. Only .slddrw files are accepted. Got: .${ext || 'unknown'}`;
  }
  if (mimetype && KNOWN_INCOMPATIBLE_MIMES.has(mimetype.toLowerCase())) {
    return `File MIME type "${mimetype}" is incompatible with .slddrw format. Upload rejected.`;
  }
  if (size > 50 * 1024 * 1024) {
    return 'File size exceeds 50 MB limit.';
  }
  return null;
}

// ─── Step 1: Upload ───────────────────────────────────────────────────────────

router.post('/upload', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided.' });
    }

    const validationError = validateSlddrwFile(file.originalname, file.mimetype, file.size);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { projectId, drawingNumber, revision, title, itemCode, discipline, uploaderNotes } = req.body;

    if (!projectId || !drawingNumber || !revision) {
      return res.status(400).json({ error: 'projectId, drawingNumber, and revision are required.' });
    }

    const parsedProjectId = parseInt(projectId, 10);
    if (isNaN(parsedProjectId)) {
      return res.status(400).json({ error: 'Invalid projectId.' });
    }

    const projectRows = await db.select({ id: projects.id, code: projects.code })
      .from(projects)
      .where(eq(projects.id, parsedProjectId))
      .limit(1);

    if (projectRows.length === 0) {
      return res.status(400).json({ error: `Project with id ${parsedProjectId} not found.` });
    }
    const project = projectRows[0];
    const projectCode = project.code;

    const existing = await db.select({ id: drawingRevisions.id })
      .from(drawingRevisions)
      .where(
        and(
          eq(drawingRevisions.projectId, parsedProjectId),
          eq(drawingRevisions.drawingNumber, drawingNumber.trim()),
          eq(drawingRevisions.revision, revision.trim()),
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({
        error: `Drawing ${drawingNumber.trim()} Rev ${revision.trim()} already exists for this project. Duplicate uploads are not permitted.`,
      });
    }

    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_');
    const gcsPath = `TPEL/STAGING/DRAWINGS/${projectCode}/${drawingNumber.trim()}/rev-${revision.trim()}/original/${safeFilename}`;

    const gcsFile = gcsClient.bucket(bucketName).file(gcsPath);
    await gcsFile.save(file.buffer, {
      metadata: {
        contentType: file.mimetype || 'application/octet-stream',
        metadata: {
          uploadedBy: user.username || user.email || String(user.id),
          drawingNumber: drawingNumber.trim(),
          revision: revision.trim(),
          checksum,
        },
      },
    });

    let dbRecord;
    try {
      const [inserted] = await db.insert(drawingRevisions).values({
        projectId: parsedProjectId,
        projectCode,
        drawingNumber: drawingNumber.trim(),
        revision: revision.trim(),
        title: title?.trim() || null,
        itemCode: itemCode?.trim() || null,
        discipline: discipline?.trim() || null,
        fileType: 'slddrw',
        checksum,
        storageZone: 'STAGING',
        uploadedBy: user.username || user.email || String(user.id),
        uploadedAt: new Date(),
        originalFilename: file.originalname,
        gcsStagingPath: gcsPath,
        fileSizeBytes: file.size,
        status: 'uploaded',
        uploaderNotes: uploaderNotes?.trim() || null,
      }).returning();
      dbRecord = inserted;
    } catch (dbErr) {
      await gcsFile.delete().catch(() => {});
      console.error('[drawing-verification] DB insert failed, rolled back GCS object:', dbErr);
      return res.status(500).json({ error: 'Failed to record upload. GCS file has been removed.' });
    }

    return res.status(201).json(dbRecord);
  } catch (err: any) {
    console.error('[drawing-verification] Upload error:', err);
    return res.status(500).json({ error: err.message || 'Upload failed.' });
  }
});

router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId, status, discipline } = req.query;

    const conditions: any[] = [];
    if (projectId) {
      const pid = parseInt(projectId as string, 10);
      if (!isNaN(pid)) conditions.push(eq(drawingRevisions.projectId, pid));
    }
    if (status) conditions.push(eq(drawingRevisions.status, status as string));
    if (discipline) conditions.push(eq(drawingRevisions.discipline, discipline as string));

    const rows = conditions.length > 0
      ? await db.select().from(drawingRevisions).where(and(...conditions)).orderBy(desc(drawingRevisions.uploadedAt))
      : await db.select().from(drawingRevisions).orderBy(desc(drawingRevisions.uploadedAt));

    return res.json(rows);
  } catch (err: any) {
    console.error('[drawing-verification] List error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch drawing revisions.' });
  }
});

router.get('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });

    const rows = await db.select().from(drawingRevisions).where(eq(drawingRevisions.id, id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Drawing revision not found.' });

    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id/file', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });

    const rows = await db.select().from(drawingRevisions).where(eq(drawingRevisions.id, id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Drawing revision not found.' });

    const record = rows[0];
    const [signedUrl] = await gcsClient.bucket(bucketName).file(record.gcsStagingPath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
    });

    return res.json({ url: signedUrl, filename: record.originalFilename });
  } catch (err: any) {
    console.error('[drawing-verification] File URL error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate download URL.' });
  }
});

// ─── Step 2: Extraction Layer ─────────────────────────────────────────────────
//
// STEP 2 AMENDMENT (Step 3 scope — backward-compatible):
//   After persisting the extraction result, status is advanced:
//     extraction_status IN ('success','partial') → drawing_revisions.status = 'extracted'
//     extraction_status = 'failed'               → drawing_revisions.status unchanged
//   Trigger guard expanded to allow re-extraction from any STAGING status.

router.post('/:id/extract', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });

    const force = req.query.force === 'true';

    // Fetch the drawing revision
    const revRows = await db.select().from(drawingRevisions).where(eq(drawingRevisions.id, id)).limit(1);
    if (revRows.length === 0) return res.status(404).json({ error: 'Drawing revision not found.' });
    const revision = revRows[0];

    // Trigger guard: must be STAGING zone
    if (revision.storageZone !== 'STAGING') {
      return res.status(409).json({
        error: `Extraction is only permitted for revisions in STAGING storage zone. Current zone: '${revision.storageZone}'.`,
      });
    }

    // Trigger guard: must be at a valid pipeline stage for (re-)extraction
    const extractableStatuses = ['uploaded', 'extracted', 'evaluated'];
    if (!extractableStatuses.includes(revision.status)) {
      return res.status(409).json({
        error: `Extraction is not permitted for revisions with status '${revision.status}'. Must be one of: ${extractableStatuses.join(', ')}.`,
      });
    }

    // Check for existing extraction
    const existingRows = await db
      .select()
      .from(drawingExtractions)
      .where(eq(drawingExtractions.drawingRevisionId, id))
      .limit(1);

    const existing = existingRows[0] ?? null;

    if (!force && existing) {
      const versionMatches = existing.extractionEngineVersion === EXTRACTION_ENGINE_VERSION;

      if (existing.extractionStatus === 'failed') {
        // Failed: return existing; explicit force required to retry
        return res.status(200).json({ ...existing, _note: 'Previous extraction failed. Use ?force=true to retry.' });
      }

      if ((existing.extractionStatus === 'success' || existing.extractionStatus === 'partial') && versionMatches) {
        // Up-to-date result exists — return it without re-extracting
        return res.status(200).json({ ...existing, _note: 'cached' });
      }

      // Version mismatch on a prior success/partial → fall through to re-extract
    }

    // Write pending status before starting (UPSERT)
    const now = new Date();
    const pendingFileInfo = {
      originalFilename: revision.originalFilename ?? '',
      sizeBytes: revision.fileSizeBytes ?? 0,
      checksum: revision.checksum,
      gcsStagingPath: revision.gcsStagingPath,
    };

    if (existing) {
      await db.update(drawingExtractions)
        .set({
          extractionStatus: 'pending',
          extractedAt: now,
          extractionEngine: EXTRACTION_ENGINE,
          extractionEngineVersion: EXTRACTION_ENGINE_VERSION,
          documentProperties: null,
          customProperties: null,
          sheetInfo: null,
          fileInfo: pendingFileInfo,
          validationResults: { drawingNumberMatch: null, revisionMatch: null, checkedAt: now.toISOString() },
          warnings: [],
          rawError: null,
        })
        .where(eq(drawingExtractions.drawingRevisionId, id));
    } else {
      await db.insert(drawingExtractions).values({
        drawingRevisionId: id,
        extractionStatus: 'pending',
        extractedAt: now,
        extractionEngine: EXTRACTION_ENGINE,
        extractionEngineVersion: EXTRACTION_ENGINE_VERSION,
        documentProperties: null,
        customProperties: null,
        sheetInfo: null,
        fileInfo: pendingFileInfo,
        validationResults: { drawingNumberMatch: null, revisionMatch: null, checkedAt: now.toISOString() },
        warnings: [],
        rawError: null,
      });
    }

    // Download file from GCS with timeout guard
    let fileBuffer: Buffer;
    try {
      const fileContents = await Promise.race([
        gcsClient.bucket(bucketName).file(revision.gcsStagingPath).download(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('extraction timeout exceeded (30s)')), EXTRACTION_TIMEOUT_MS)
        ),
      ]) as [Buffer];
      fileBuffer = fileContents[0];
    } catch (dlErr: any) {
      const errMsg = dlErr?.message ?? 'GCS download failed';
      await db.update(drawingExtractions)
        .set({
          extractionStatus: 'failed',
          extractedAt: new Date(),
          extractionEngineVersion: EXTRACTION_ENGINE_VERSION,
          rawError: errMsg,
          validationResults: { drawingNumberMatch: null, revisionMatch: null, checkedAt: new Date().toISOString() },
          warnings: [{ type: 'parse_error', detail: errMsg }],
        })
        .where(eq(drawingExtractions.drawingRevisionId, id));
      // status remains unchanged on failure

      const failedRows = await db.select().from(drawingExtractions)
        .where(eq(drawingExtractions.drawingRevisionId, id)).limit(1);
      return res.status(200).json(failedRows[0]);
    }

    // Run OLE extraction (pure, deterministic)
    const fileInfo = {
      originalFilename: revision.originalFilename ?? '',
      sizeBytes: revision.fileSizeBytes ?? 0,
      checksum: revision.checksum,
      gcsStagingPath: revision.gcsStagingPath,
    };

    const result = extractDrawingProperties(
      fileBuffer,
      revision.drawingNumber,
      revision.revision,
      fileInfo,
    );

    // Persist final extraction result
    const finalNow = new Date();
    await db.update(drawingExtractions)
      .set({
        extractionStatus: result.extractionStatus,
        extractedAt: finalNow,
        extractionEngine: result.extractionEngine,
        extractionEngineVersion: result.extractionEngineVersion,
        documentProperties: result.documentProperties ?? null,
        customProperties: result.customProperties ?? null,
        sheetInfo: result.sheetInfo ?? null,
        fileInfo: result.fileInfo,
        validationResults: result.validationResults,
        warnings: result.warnings.length > 0 ? result.warnings : null,
        rawError: result.rawError ?? null,
      })
      .where(eq(drawingExtractions.drawingRevisionId, id));

    // ── Step 2 amendment (Step 3 scope): advance status on success/partial ──
    if (result.extractionStatus === 'success' || result.extractionStatus === 'partial') {
      await db.update(drawingRevisions)
        .set({ status: 'extracted' })
        .where(eq(drawingRevisions.id, id));
    }
    // extraction_status = 'failed' → status unchanged (remains as-is)

    const finalRows = await db.select().from(drawingExtractions)
      .where(eq(drawingExtractions.drawingRevisionId, id)).limit(1);

    console.log(`[dvs-extract] revision=${id} status=${result.extractionStatus} engine_version=${EXTRACTION_ENGINE_VERSION} force=${force}`);
    return res.status(200).json(finalRows[0]);
  } catch (err: any) {
    console.error('[dvs-extract] Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Extraction failed.' });
  }
});

router.get('/:id/extraction', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });

    const revRows = await db.select({ id: drawingRevisions.id })
      .from(drawingRevisions).where(eq(drawingRevisions.id, id)).limit(1);
    if (revRows.length === 0) return res.status(404).json({ error: 'Drawing revision not found.' });

    const rows = await db.select().from(drawingExtractions)
      .where(eq(drawingExtractions.drawingRevisionId, id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'No extraction record found for this revision. Trigger extraction first.' });

    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Step 3: Rule Engine ──────────────────────────────────────────────────────

router.post('/:id/evaluate', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });

    const force = req.query.force === 'true';
    const user = (req as any).user;

    // Load drawing revision
    const revRows = await db.select().from(drawingRevisions).where(eq(drawingRevisions.id, id)).limit(1);
    if (revRows.length === 0) return res.status(404).json({ error: 'Drawing revision not found.' });
    const revision = revRows[0];

    // Trigger guard: must be STAGING
    if (revision.storageZone !== 'STAGING') {
      return res.status(422).json({
        error: 'TRIGGER_GUARD_FAILED',
        reason: 'invalid_storage_zone',
        detail: `Evaluation is only permitted for drawings in STAGING. Current zone: '${revision.storageZone}'.`,
      });
    }

    // Trigger guard: status must be 'extracted' or 'evaluated'
    if (revision.status !== 'extracted' && revision.status !== 'evaluated') {
      return res.status(422).json({
        error: 'TRIGGER_GUARD_FAILED',
        reason: 'status_not_eligible',
        detail: `Evaluation requires status 'extracted' or 'evaluated'. Current status: '${revision.status}'. Run extraction first.`,
      });
    }

    // Load extraction record
    const extractionRows = await db.select().from(drawingExtractions)
      .where(eq(drawingExtractions.drawingRevisionId, id)).limit(1);
    const extraction = extractionRows[0] ?? null;

    // Compute extraction gate
    const gateResult = computeExtractionGate(extraction);

    // Gate = BLOCK → return 422, no DB write, no status change
    if (gateResult.gate === 'BLOCK') {
      return res.status(422).json({
        error: 'BLOCKED',
        extraction_gate: 'BLOCK',
        extraction_gate_reason: gateResult.reason,
        detail: gateResult.detail,
        drawing_revision_id: id,
      });
    }

    // Load existing evaluation record
    const existingEvalRows = await db.select().from(ruleEvaluations)
      .where(eq(ruleEvaluations.drawingRevisionId, id)).limit(1);
    const existingEval = existingEvalRows[0] ?? null;

    // Idempotency: same rule engine version AND same extraction ID → return cached
    if (!force && existingEval) {
      const sameVersion    = existingEval.ruleEngineVersion    === RULE_ENGINE_VERSION;
      const sameExtraction = existingEval.drawingExtractionId  === extraction!.id;

      if (sameVersion && sameExtraction) {
        return res.status(200).json({ ...existingEval, _note: 'cached' });
      }
      // Version or extraction changed → re-evaluate automatically (system trigger)
    }

    // Determine evaluated_by
    const triggeredByUser = force || !existingEval;
    const evaluatedBy = triggeredByUser
      ? (user.username || user.email || String(user.id))
      : 'system:auto-reeval';

    // Run all 13 rules — reads only from drawing_extractions
    const isPartialGate = gateResult.gate === 'WARN';
    const ruleResults   = evaluateRules(extraction!, isPartialGate, revision.drawingNumber, revision.revision);
    const overallVerdict = computeOverallVerdict(ruleResults);

    const evaluatedAt = new Date();

    // Upsert into rule_evaluations
    if (existingEval) {
      await db.update(ruleEvaluations)
        .set({
          drawingExtractionId: extraction!.id,
          ruleEngineVersion:   RULE_ENGINE_VERSION,
          evaluatedAt,
          evaluatedBy,
          extractionGate:       gateResult.gate,
          extractionGateReason: gateResult.reason,
          overallVerdict,
          ruleResults: ruleResults as any,
        })
        .where(eq(ruleEvaluations.drawingRevisionId, id));
    } else {
      await db.insert(ruleEvaluations).values({
        drawingRevisionId:    id,
        drawingExtractionId:  extraction!.id,
        ruleEngineVersion:    RULE_ENGINE_VERSION,
        evaluatedAt,
        evaluatedBy,
        extractionGate:       gateResult.gate,
        extractionGateReason: gateResult.reason,
        overallVerdict,
        ruleResults: ruleResults as any,
      });
    }

    // Advance status to 'evaluated'
    await db.update(drawingRevisions)
      .set({ status: 'evaluated' })
      .where(eq(drawingRevisions.id, id));

    const finalRows = await db.select().from(ruleEvaluations)
      .where(eq(ruleEvaluations.drawingRevisionId, id)).limit(1);

    console.log(`[dvs-evaluate] revision=${id} verdict=${overallVerdict} gate=${gateResult.gate} engine_version=${RULE_ENGINE_VERSION} force=${force}`);
    return res.status(200).json(finalRows[0]);
  } catch (err: any) {
    console.error('[dvs-evaluate] Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Evaluation failed.' });
  }
});

router.get('/:id/evaluation', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });

    const revRows = await db.select({ id: drawingRevisions.id })
      .from(drawingRevisions).where(eq(drawingRevisions.id, id)).limit(1);
    if (revRows.length === 0) return res.status(404).json({ error: 'Drawing revision not found.' });

    const rows = await db.select().from(ruleEvaluations)
      .where(eq(ruleEvaluations.drawingRevisionId, id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'No evaluation record found for this revision. Trigger evaluation first.' });

    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Step 4: Agent Layer ──────────────────────────────────────────────────────

router.post('/:id/agent-review', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });

    const force = req.query.force === 'true';
    const user  = (req as any).user;
    const caller = user.username || user.email || String(user.id);

    // Load drawing revision
    const revRows = await db.select().from(drawingRevisions).where(eq(drawingRevisions.id, id)).limit(1);
    if (revRows.length === 0) return res.status(404).json({ error: 'Drawing revision not found.' });
    const revision = revRows[0];

    // Trigger guard: must be STAGING
    if (revision.storageZone !== 'STAGING') {
      return res.status(422).json({
        error: 'TRIGGER_GUARD_FAILED',
        reason: 'invalid_storage_zone',
        detail: `Agent review is only permitted for drawings in STAGING. Current zone: '${revision.storageZone}'.`,
      });
    }

    // Trigger guard: status must be 'evaluated' or 'agent_reviewed'
    if (revision.status !== 'evaluated' && revision.status !== 'agent_reviewed') {
      return res.status(422).json({
        error: 'TRIGGER_GUARD_FAILED',
        reason: 'status_not_eligible',
        detail: `Agent review requires status 'evaluated' or 'agent_reviewed'. Current status: '${revision.status}'. Run rule evaluation first.`,
      });
    }

    // Load rule_evaluations row — must exist
    const evalRows = await db.select().from(ruleEvaluations)
      .where(eq(ruleEvaluations.drawingRevisionId, id)).limit(1);
    if (evalRows.length === 0) {
      return res.status(422).json({
        error: 'NO_EVALUATION',
        reason: 'evaluation_required',
        detail: 'No rule evaluation record found for this revision. Run evaluation first.',
      });
    }
    const evaluation = evalRows[0];

    // Safety guard: BLOCKED verdict must never have been written — but guard anyway
    if (!['PASS', 'WARN', 'FAIL'].includes(evaluation.overallVerdict)) {
      return res.status(422).json({
        error: 'EVALUATION_BLOCKED',
        reason: 'verdict_is_blocked',
        detail: `Cannot run agent review on a BLOCKED evaluation (verdict: '${evaluation.overallVerdict}').`,
      });
    }

    // Load existing agent report
    const existingRows = await db.select().from(agentReports)
      .where(eq(agentReports.drawingRevisionId, id)).limit(1);
    const existing = existingRows[0] ?? null;

    // Freshness check: cached when rule_evaluation_id AND agent_version both match
    if (!force && existing) {
      const evalIdFresh     = existing.ruleEvaluationId === evaluation.id;
      const versionFresh    = existing.agentVersion     === AGENT_VERSION;
      if (evalIdFresh && versionFresh) {
        return res.status(200).json({ ...existing, _note: 'cached' });
      }
      // Stale on either dimension → fall through to regenerate (caller as generated_by)
    }

    // Call agent — throws on any failure; caller writes nothing on throw
    let reportData;
    try {
      reportData = await runAgentReview(evaluation);
    } catch (agentErr: any) {
      console.error(`[dvs-agent] AI call failed for revision=${id}:`, agentErr.message);
      return res.status(500).json({ error: agentErr.message || 'Agent review failed.' });
    }

    const generatedAt = new Date();

    // Upsert agent_reports
    if (existing) {
      await db.update(agentReports)
        .set({
          ruleEvaluationId:  evaluation.id,
          agentVersion:      AGENT_VERSION,
          generatedAt,
          generatedBy:       caller,
          overallAssessment: reportData.overallAssessment,
          summary:           reportData.summary,
          criticalFailures:  reportData.criticalFailures as any,
          warnings:          reportData.warnings as any,
          recommendations:   reportData.recommendations,
          rawResponse:       reportData.rawResponse,
        })
        .where(eq(agentReports.drawingRevisionId, id));
    } else {
      await db.insert(agentReports).values({
        drawingRevisionId:  id,
        ruleEvaluationId:   evaluation.id,
        agentVersion:       AGENT_VERSION,
        generatedAt,
        generatedBy:        caller,
        overallAssessment:  reportData.overallAssessment,
        summary:            reportData.summary,
        criticalFailures:   reportData.criticalFailures as any,
        warnings:           reportData.warnings as any,
        recommendations:    reportData.recommendations,
        rawResponse:        reportData.rawResponse,
      });
    }

    // Advance status to 'agent_reviewed'
    await db.update(drawingRevisions)
      .set({ status: 'agent_reviewed' })
      .where(eq(drawingRevisions.id, id));

    const finalRows = await db.select().from(agentReports)
      .where(eq(agentReports.drawingRevisionId, id)).limit(1);

    console.log(`[dvs-agent] revision=${id} assessment=${reportData.overallAssessment} agent_version=${AGENT_VERSION} force=${force} stale=${!!existing && (existing.ruleEvaluationId !== evaluation.id || existing.agentVersion !== AGENT_VERSION)}`);
    return res.status(200).json(finalRows[0]);
  } catch (err: any) {
    console.error('[dvs-agent] Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Agent review failed.' });
  }
});

router.get('/:id/agent-report', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });

    const revRows = await db.select({ id: drawingRevisions.id })
      .from(drawingRevisions).where(eq(drawingRevisions.id, id)).limit(1);
    if (revRows.length === 0) return res.status(404).json({ error: 'Drawing revision not found.' });

    const rows = await db.select().from(agentReports)
      .where(eq(agentReports.drawingRevisionId, id)).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({
        error: 'No agent report found for this revision. Trigger agent review first.',
      });
    }

    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Step 5: Approval Layer ───────────────────────────────────────────────────

const APPROVAL_MIN_ROLE_LEVEL = roleHierarchy['Manager']; // 3 — Manager and above

router.post('/:id/approve', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });

    const user   = (req as any).user;
    const caller = user.username || user.email || String(user.id);

    // Guard 2: Role check — Manager or above
    const userRoleLevel = roleHierarchy[user.role as string] ?? 999;
    if (userRoleLevel > APPROVAL_MIN_ROLE_LEVEL) {
      return res.status(403).json({
        error:  'FORBIDDEN',
        reason: 'insufficient_role',
        detail: 'Approval decisions require Manager-level role or above.',
      });
    }

    // Guard 3: Validate body
    const { decision, comments } = req.body ?? {};
    if (!decision || !['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({
        error:  'INVALID_REQUEST',
        reason: 'invalid_decision',
        detail: 'decision must be "APPROVED" or "REJECTED".',
      });
    }

    // Guard 4: Rejection requires comments
    if (decision === 'REJECTED' && !comments?.trim()) {
      return res.status(400).json({
        error:  'COMMENTS_REQUIRED',
        reason: 'rejection_requires_comments',
        detail: 'A non-empty comments field is mandatory when rejecting a drawing.',
      });
    }

    // Guard 5: Load drawing revision
    const revRows = await db.select().from(drawingRevisions).where(eq(drawingRevisions.id, id)).limit(1);
    if (revRows.length === 0) return res.status(404).json({ error: 'Drawing revision not found.' });
    const revision = revRows[0];

    // Guard 6: Immutability pre-check — runs before status/zone checks so ALREADY_DECIDED
    //          is always the most specific response for any re-submission attempt.
    const existingRows = await db.select().from(drawingApprovals)
      .where(eq(drawingApprovals.drawingRevisionId, id)).limit(1);
    if (existingRows.length > 0) {
      const ex = existingRows[0];
      return res.status(409).json({
        error:  'ALREADY_DECIDED',
        reason: 'approval_immutable',
        detail: `A decision of ${ex.decision} was already recorded by ${ex.decidedBy} on ${ex.decidedAt.toISOString()}. Approval records are write-once.`,
      });
    }

    // Guard 7: Must be STAGING
    if (revision.storageZone !== 'STAGING') {
      return res.status(422).json({
        error:  'TRIGGER_GUARD_FAILED',
        reason: 'invalid_storage_zone',
        detail: `Approval is only permitted for drawings in STAGING. Current zone: '${revision.storageZone}'.`,
      });
    }

    // Guard 8: Status must be 'evaluated' or 'agent_reviewed'
    if (revision.status !== 'evaluated' && revision.status !== 'agent_reviewed') {
      return res.status(422).json({
        error:  'TRIGGER_GUARD_FAILED',
        reason: 'status_not_eligible',
        detail: `Approval requires status 'evaluated' or 'agent_reviewed'. Current status: '${revision.status}'.`,
      });
    }

    // Guard 9: Load rule_evaluations — must exist (current evaluation by definition)
    const evalRows = await db.select().from(ruleEvaluations)
      .where(eq(ruleEvaluations.drawingRevisionId, id)).limit(1);
    if (evalRows.length === 0) {
      return res.status(422).json({
        error:  'NO_EVALUATION',
        reason: 'evaluation_required',
        detail: 'No rule evaluation record found for this revision. Run evaluation first.',
      });
    }
    const evaluation    = evalRows[0];
    const currentEvalId = evaluation.id;

    // Guard 10: FAIL verdict blocks APPROVED decision
    if (decision === 'APPROVED' && evaluation.overallVerdict === 'FAIL') {
      return res.status(422).json({
        error:  'TRIGGER_GUARD_FAILED',
        reason: 'fail_verdict_blocks_approval',
        detail: 'Rule engine verdict is FAIL. Drawing cannot be approved. Resolve all FAIL rules and re-evaluate before resubmitting.',
      });
    }

    // Agent report freshness — non-blocking
    const agentRows = await db.select().from(agentReports)
      .where(eq(agentReports.drawingRevisionId, id)).limit(1);
    const agentReport = agentRows[0] ?? null;
    let agentReportId:             number | null = null;
    let agentAssessmentAtDecision: string | null = null;
    if (agentReport && agentReport.ruleEvaluationId === currentEvalId) {
      agentReportId             = agentReport.id;
      agentAssessmentAtDecision = agentReport.overallAssessment;
    }

    const decidedAt = new Date();

    // Atomic INSERT — UNIQUE constraint is the true concurrency guard
    try {
      await db.insert(drawingApprovals).values({
        drawingRevisionId:         id,
        ruleEvaluationId:          currentEvalId,
        agentReportId:             agentReportId as any,
        decision,
        decidedBy:                 caller,
        decidedAt,
        comments:                  comments?.trim() || null,
        verdictAtDecision:         evaluation.overallVerdict,
        agentAssessmentAtDecision: agentAssessmentAtDecision as any,
      });
    } catch (dbErr: any) {
      // Concurrent write — other request won the race; 23505 = unique_violation
      if (dbErr.code === '23505') {
        const raceRows = await db.select().from(drawingApprovals)
          .where(eq(drawingApprovals.drawingRevisionId, id)).limit(1);
        const raceRow = raceRows[0];
        return res.status(409).json({
          error:  'ALREADY_DECIDED',
          reason: 'approval_immutable',
          detail: `A decision of ${raceRow.decision} was already recorded by ${raceRow.decidedBy} on ${raceRow.decidedAt.toISOString()}. Approval records are write-once.`,
        });
      }
      throw dbErr;
    }

    // Advance status atomically after INSERT succeeds
    const newStatus = decision === 'APPROVED' ? 'approved' : 'rejected';
    await db.update(drawingRevisions)
      .set({ status: newStatus })
      .where(eq(drawingRevisions.id, id));

    const finalRows = await db.select().from(drawingApprovals)
      .where(eq(drawingApprovals.drawingRevisionId, id)).limit(1);

    console.log(`[dvs-approval] revision=${id} decision=${decision} verdict=${evaluation.overallVerdict} decidedBy=${caller} agentFresh=${agentReportId !== null}`);
    return res.status(200).json(finalRows[0]);
  } catch (err: any) {
    console.error('[dvs-approval] Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Approval failed.' });
  }
});

router.get('/:id/approval', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id.' });

    const revRows = await db.select({ id: drawingRevisions.id })
      .from(drawingRevisions).where(eq(drawingRevisions.id, id)).limit(1);
    if (revRows.length === 0) return res.status(404).json({ error: 'Drawing revision not found.' });

    const rows = await db.select().from(drawingApprovals)
      .where(eq(drawingApprovals.drawingRevisionId, id)).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({
        error: 'No approval record found for this revision. Submit an approval decision first.',
      });
    }

    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
