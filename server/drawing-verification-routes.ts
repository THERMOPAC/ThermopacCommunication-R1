import express, { Request, Response } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import { db } from './db';
import { drawingRevisions, drawingExtractions, ruleEvaluations, projects } from '@shared/schema';
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

export default router;
