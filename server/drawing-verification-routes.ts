import express, { Request, Response } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import { db } from './db';
import { drawingRevisions, projects } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import gcsClient, { bucketName } from './utils/storage-config';

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

    let query = db.select().from(drawingRevisions).orderBy(desc(drawingRevisions.uploadedAt));
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

export default router;
