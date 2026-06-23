import { Express, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { db } from './db';
import { pool } from './db';
import { sql, eq, and, desc } from 'drizzle-orm';
import { epcDocTypes, epcDocuments } from '@shared/schema';
import { resolveProjectGeoCodes, incrementRevisionCode } from './epc-coding';
import { uploadFileWithDiagnostics } from './utils/gcs-enhanced-upload';
import { gcsStorage } from './utils/gcs-storage';
import { resolveGcsPath, GcsGovernanceError } from './utils/gcs-path-resolver';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Authentication required' });
}

function computeChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}


function validateExtension(fileName: string, allowedExtensions: string[]): { valid: boolean; ext: string; message?: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (!ext) return { valid: false, ext, message: 'File has no extension' };
  if (!allowedExtensions.includes(ext)) {
    return { valid: false, ext, message: `Extension .${ext} not allowed. Permitted: ${allowedExtensions.map(e => '.' + e).join(', ')}` };
  }
  return { valid: true, ext };
}

function validateFileSize(fileSize: number, maxSizeMb: number): { valid: boolean; message?: string } {
  const maxBytes = maxSizeMb * 1024 * 1024;
  if (fileSize > maxBytes) {
    return { valid: false, message: `File size ${(fileSize / 1024 / 1024).toFixed(1)}MB exceeds maximum ${maxSizeMb}MB for this document type` };
  }
  return { valid: true };
}

const MIME_BY_EXT: Record<string, string[]> = {
  pdf: ['application/pdf'],
  dwg: ['application/acad', 'application/x-acad', 'application/x-autocad', 'application/octet-stream', 'image/vnd.dwg'],
  dxf: ['application/dxf', 'application/x-dxf', 'image/vnd.dxf', 'image/x-dxf', 'application/octet-stream'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xls: ['application/vnd.ms-excel'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  doc: ['application/msword'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  tif: ['image/tiff'],
  tiff: ['image/tiff'],
  bmp: ['image/bmp'],
  stp: ['application/step', 'application/octet-stream'],
  step: ['application/step', 'application/octet-stream'],
  igs: ['application/iges', 'application/octet-stream'],
  iges: ['application/iges', 'application/octet-stream'],
  sat: ['application/octet-stream'],
  prt: ['application/octet-stream'],
  asm: ['application/octet-stream'],
  sldprt: ['application/octet-stream'],
  sldasm: ['application/octet-stream'],
  catpart: ['application/octet-stream'],
  catproduct: ['application/octet-stream'],
  ipt: ['application/octet-stream'],
  iam: ['application/octet-stream'],
  zip: ['application/zip', 'application/x-zip-compressed'],
  '7z': ['application/x-7z-compressed'],
  rar: ['application/x-rar-compressed', 'application/vnd.rar'],
  csv: ['text/csv', 'application/csv'],
  txt: ['text/plain'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ppt: ['application/vnd.ms-powerpoint'],
  mp4: ['video/mp4'],
};

function validateMimeType(ext: string, mimetype: string): { valid: boolean; message?: string } {
  const allowed = MIME_BY_EXT[ext];
  if (!allowed) return { valid: true };
  if (!allowed.includes(mimetype) && mimetype !== 'application/octet-stream') {
    return { valid: false, message: `MIME type ${mimetype} does not match expected type for .${ext} files` };
  }
  return { valid: true };
}


async function cleanupGcsObjects(paths: string[]): Promise<void> {
  for (const path of paths) {
    try {
      await gcsStorage.deleteFile(path);
      console.log(`[DOC_CTRL] Cleaned up orphaned GCS object: ${path}`);
    } catch (err) {
      console.error(`[DOC_CTRL] Failed to clean up GCS object ${path}:`, err);
    }
  }
}

export function setupDocumentControlRoutes(app: Express) {

  app.get('/api/document-control/doc-types', ensureAuthenticated, async (_req: Request, res: Response) => {
    try {
      const types = await db.select().from(epcDocTypes).orderBy(epcDocTypes.sortOrder);
      res.json(types);
    } catch (error) {
      console.error('[DOC_CTRL] Error fetching doc types:', error);
      res.status(500).json({ error: 'Failed to fetch document types' });
    }
  });

  app.get('/api/document-control/doc-types/slots', ensureAuthenticated, async (_req: Request, res: Response) => {
    try {
      const slots = await db.select().from(epcDocTypes)
        .where(eq(epcDocTypes.isSlot, true))
        .orderBy(epcDocTypes.sortOrder);
      res.json(slots);
    } catch (error) {
      console.error('[DOC_CTRL] Error fetching slot doc types:', error);
      res.status(500).json({ error: 'Failed to fetch slot document types' });
    }
  });

  app.get('/api/document-control/projects/:projectId/folders', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

      const slots = await db.select().from(epcDocTypes)
        .where(eq(epcDocTypes.isSlot, true))
        .orderBy(epcDocTypes.sortOrder);

      const docs = await db.select().from(epcDocuments)
        .where(and(
          eq(epcDocuments.projectId, projectId),
          eq(epcDocuments.status, 'active')
        ));

      const activeDocsByFolder: Record<string, typeof docs[0]> = {};
      for (const doc of docs) {
        if (doc.folderCode) {
          if (!activeDocsByFolder[doc.folderCode] || doc.seqNumber === 1) {
            activeDocsByFolder[doc.folderCode] = doc;
          }
        }
      }

      const folders = slots.map(slot => {
        const activeDoc = slot.folderCode ? activeDocsByFolder[slot.folderCode] : null;
        return {
          docType: slot.code,
          folderCode: slot.folderCode,
          name: slot.name,
          description: slot.description,
          uploadMode: slot.uploadMode,
          maxFileSizeMb: slot.maxFileSizeMb,
          allowedExtensions: slot.allowedExtensions,
          hasDocument: !!activeDoc,
          currentRevision: activeDoc?.revision || null,
          lastUpdated: activeDoc?.uploadedAt || null,
        };
      });

      res.json(folders);
    } catch (error) {
      console.error('[DOC_CTRL] Error fetching folders:', error);
      res.status(500).json({ error: 'Failed to fetch folder status' });
    }
  });

  app.get('/api/document-control/projects/:projectId/documents/:folderCode', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const folderCode = req.params.folderCode;
      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

      const docType = await db.select().from(epcDocTypes)
        .where(eq(epcDocTypes.folderCode, folderCode))
        .limit(1);

      if (docType.length === 0) return res.status(404).json({ error: 'Unknown folder code' });

      const docs = await db.select().from(epcDocuments)
        .where(and(
          eq(epcDocuments.projectId, projectId),
          eq(epcDocuments.folderCode, folderCode)
        ))
        .orderBy(desc(epcDocuments.revision), epcDocuments.seqNumber);

      const docsWithUsers = await Promise.all(docs.map(async (doc) => {
        let uploaderName = null;
        if (doc.uploadedBy) {
          const userResult = await db.execute(
            sql`SELECT username FROM users WHERE id = ${doc.uploadedBy} LIMIT 1`
          );
          uploaderName = (userResult.rows[0] as any)?.username || null;
        }
        return { ...doc, uploaderName };
      }));

      res.json({
        docType: docType[0],
        documents: docsWithUsers,
      });
    } catch (error) {
      console.error('[DOC_CTRL] Error fetching documents:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  app.post(
    '/api/document-control/projects/:projectId/upload/:folderCode',
    ensureAuthenticated,
    upload.array('files', 50),
    async (req: Request, res: Response) => {
      const projectId = parseInt(req.params.projectId);
      const folderCode = req.params.folderCode;
      const userId = (req as any).user?.id;

      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) return res.status(400).json({ error: 'No files provided' });

      try {
        const docTypeRows = await db.select().from(epcDocTypes)
          .where(eq(epcDocTypes.folderCode, folderCode))
          .limit(1);

        if (docTypeRows.length === 0) return res.status(404).json({ error: 'Unknown folder code' });
        const docType = docTypeRows[0];

        if (!docType.isSlot) return res.status(400).json({ error: 'This endpoint is for slot documents only' });

        if (docType.uploadMode === 'single' && files.length > 1) {
          return res.status(400).json({ error: `${docType.name} accepts only one file per revision` });
        }

        for (const file of files) {
          const extCheck = validateExtension(file.originalname, docType.allowedExtensions);
          if (!extCheck.valid) return res.status(400).json({ error: extCheck.message });

          const mimeCheck = validateMimeType(extCheck.ext, file.mimetype);
          if (!mimeCheck.valid) return res.status(400).json({ error: mimeCheck.message });

          const sizeCheck = validateFileSize(file.size, docType.maxFileSizeMb);
          if (!sizeCheck.valid) return res.status(400).json({ error: sizeCheck.message });
        }

        const checksums = files.map(f => computeChecksum(f.buffer));

        const activeDocsInSlot = await db.select().from(epcDocuments)
          .where(and(
            eq(epcDocuments.projectId, projectId),
            eq(epcDocuments.folderCode, folderCode),
            eq(epcDocuments.status, 'active')
          ));

        if (activeDocsInSlot.length > 0) {
          for (const checksum of checksums) {
            const match = activeDocsInSlot.find(d => d.checksumSha256 === checksum);
            if (match) {
              return res.status(409).json({
                error: `File is identical to the current active revision (rev-${match.revision}). New revision must differ from current.`,
                existingRevision: match.revision,
              });
            }
          }
        }

        for (const checksum of checksums) {
          const crossFolderMatch = await db.execute(
            sql`SELECT doc_type, folder_code, revision FROM epc_documents 
                WHERE project_id = ${projectId} AND checksum_sha256 = ${checksum} 
                AND folder_code != ${folderCode} AND status = 'active' LIMIT 1`
          );
          if (crossFolderMatch.rows.length > 0) {
            const match = crossFolderMatch.rows[0] as any;
            console.warn(`[DOC_CTRL] Duplicate warning: checksum ${checksum.substring(0, 16)}... also exists in ${match.doc_type}/${match.folder_code} rev-${match.revision}`);
          }
        }

        const geo = await resolveProjectGeoCodes(projectId);

        // Revision: A, B, C … Z, AA, AB … — derive from prior history
        let nextRevision = 'A';
        if (activeDocsInSlot.length > 0) {
          nextRevision = incrementRevisionCode(activeDocsInSlot[0].revision);
        } else {
          const allDocs = await db.select().from(epcDocuments)
            .where(and(
              eq(epcDocuments.projectId, projectId),
              eq(epcDocuments.folderCode, folderCode)
            ));
          if (allDocs.length > 0) {
            const sorted = allDocs.map(d => d.revision).sort((a, b) => {
              if (a.length !== b.length) return a.length - b.length;
              return a < b ? -1 : a > b ? 1 : 0;
            });
            nextRevision = incrementRevisionCode(sorted[sorted.length - 1]);
          }
        }

        // 3D folder: each file requires a DrawingNumber validated against EPC Drawing Controls
        const is3D = docType.code === '3D';
        let drawingNumbers: string[] = [];
        if (is3D) {
          const raw = req.body.drawingNumbers;
          drawingNumbers = Array.isArray(raw) ? raw : (raw ? [raw] : []);
          if (drawingNumbers.length !== files.length) {
            return res.status(400).json({
              error: `3D uploads require one drawingNumber per file. Got ${drawingNumbers.length} drawing number(s) for ${files.length} file(s).`,
            });
          }
          const GCS_SAFE = /^[A-Za-z0-9_-]+$/;
          for (const dn of drawingNumbers) {
            if (!dn || !GCS_SAFE.test(dn)) {
              return res.status(400).json({
                error: `Drawing number "${dn}" is invalid. Use alphanumeric characters, underscores, or hyphens only.`,
              });
            }
          }
          if (new Set(drawingNumbers).size !== drawingNumbers.length) {
            return res.status(400).json({ error: 'Duplicate drawing numbers in this upload batch.' });
          }
          for (const dn of drawingNumbers) {
            const exists = await db.execute(
              sql`SELECT id FROM epc_drawing_controls
                  WHERE project_id = ${projectId} AND drawing_number = ${dn}
                  LIMIT 1`
            );
            if (exists.rows.length === 0) {
              return res.status(400).json({
                error: `Drawing number "${dn}" does not exist in EPC Drawing Controls for this project.`,
              });
            }
          }
        }

        const gcsFolderName = docType.gcsFolderName || docType.code;
        const title = req.body.title || docType.name;
        const now = new Date();

        const uploadedPaths: string[] = [];
        const fileMetadata: { gcsPath: string; file: Express.Multer.File; seqNumber: number; checksum: string }[] = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const seqNumber = i + 1;

          const ext = file.originalname.split('.').pop()?.toLowerCase() || 'bin';
          const baseFilename = is3D ? drawingNumbers[i] : docType.code;

          let gcsPath: string;
          try {
            gcsPath = await resolveGcsPath('DC_SLOT', {
              CC:       geo.continentCode,
              CO:       geo.countryCode,
              Cust:     geo.customerCustToken,
              FY:       geo.fyCode,
              NNN:      geo.projectSeq,
              DocType:  gcsFolderName,
              filename: baseFilename,
              Revision: nextRevision,
              ext,
            });
          } catch (govErr) {
            if (govErr instanceof GcsGovernanceError) {
              await cleanupGcsObjects(uploadedPaths);
              return res.status(503).json({
                error: 'GCS_GOVERNANCE_ERROR',
                message: (govErr as Error).message,
              });
            }
            throw govErr;
          }

          const { assertGcsPath } = await import('./epc-guardrails');
          assertGcsPath(gcsPath, 'document-control-routes.upload');

          const uploadResult = await uploadFileWithDiagnostics(gcsPath, file.buffer, file.mimetype);
          if (!uploadResult.successful) {
            await cleanupGcsObjects(uploadedPaths);
            return res.status(500).json({
              error: 'Failed to upload file to storage',
              details: uploadResult.error?.message,
              path: gcsPath,
            });
          }

          uploadedPaths.push(gcsPath);
          fileMetadata.push({ gcsPath, file, seqNumber, checksum: checksums[i] });
        }

        let createdDocs: any[] = [];
        try {
          await db.transaction(async (tx) => {
            for (const meta of fileMetadata) {
              const [doc] = await tx.insert(epcDocuments).values({
                projectId,
                docType: docType.code,
                folderCode,
                revision: nextRevision,
                status: 'active',
                title,
                fileName: meta.file.originalname,
                fileSize: meta.file.size,
                contentType: meta.file.mimetype,
                gcsObjectPath: meta.gcsPath,
                checksumSha256: meta.checksum,
                seqNumber: meta.seqNumber,
                uploadedBy: userId,
              }).returning();
              createdDocs.push(doc);
            }

            if (activeDocsInSlot.length > 0) {
              for (const oldDoc of activeDocsInSlot) {
                await tx.update(epcDocuments)
                  .set({
                    status: 'superseded',
                    supersededAt: now,
                    supersededById: createdDocs[0].id,
                  })
                  .where(eq(epcDocuments.id, oldDoc.id));
              }
            }
          });
        } catch (txError: any) {
          console.error('[DOC_CTRL] Transaction failed, GCS objects orphaned:', uploadedPaths);
          await cleanupGcsObjects(uploadedPaths);
          throw txError;
        }

        // ── G2/G3: Dual-Storage Policy — enqueue SAVE_FILE mirror job per file ──
        for (const doc of createdDocs) {
          try {
            const jobResult = await pool.query(
              `INSERT INTO document_agent_jobs
                 (job_type, status, relative_path, file_url, file_name, expected_sha256,
                  source_module, source_record_id, created_by)
               VALUES ('SAVE_FILE', 'pending', $1, NULL, $2, $3, 'epc_documents', $4, $5)
               RETURNING id`,
              [doc.gcsObjectPath, doc.fileName, doc.checksumSha256, doc.id, userId]
            );
            const jobId = jobResult.rows[0].id as number;
            await pool.query(
              `UPDATE epc_documents SET mirror_status = 'pending', mirror_job_id = $1 WHERE id = $2`,
              [jobId, doc.id]
            );
            doc.mirrorStatus = 'pending';
            doc.mirrorJobId = jobId;
          } catch (mirrorErr: any) {
            console.error(`[DOC_CTRL] Mirror job creation failed for doc ${doc.id}:`, mirrorErr.message);
            // Mirror failure does not invalidate the upload — GCS is authoritative
          }
        }
        // ── end Dual-Storage ─────────────────────────────────────────────────

        console.log(`[DOC_CTRL] Upload success: project=${projectId} folder=${folderCode} docType=${docType.code} rev=${nextRevision} files=${files.length}`);

        res.status(201).json({
          revision: nextRevision,
          documents: createdDocs,
          supersededCount: activeDocsInSlot.length,
        });
      } catch (error: any) {
        console.error('[DOC_CTRL] Upload error:', error);
        res.status(500).json({ error: error.message || 'Upload failed' });
      }
    }
  );

  app.get('/api/document-control/projects/:projectId/download/:documentId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const documentId = parseInt(req.params.documentId);
      if (isNaN(projectId) || isNaN(documentId)) {
        return res.status(400).json({ error: 'Invalid parameters' });
      }

      const docs = await db.select().from(epcDocuments)
        .where(and(
          eq(epcDocuments.id, documentId),
          eq(epcDocuments.projectId, projectId)
        ))
        .limit(1);

      if (docs.length === 0) return res.status(404).json({ error: 'Document not found' });

      const doc = docs[0];
      const signedUrl = await gcsStorage.generateDownloadSignedUrl({
        filePath: doc.gcsObjectPath,
        expirationMinutes: 15,
      });

      if (!signedUrl) return res.status(500).json({ error: 'Failed to generate download URL' });

      res.json({ url: signedUrl, fileName: doc.fileName });
    } catch (error) {
      console.error('[DOC_CTRL] Download error:', error);
      res.status(500).json({ error: 'Failed to generate download link' });
    }
  });

  app.get('/api/document-control/projects/:projectId/summary', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

      const result = await db.execute(sql`
        SELECT d.folder_code, d.doc_type, d.revision, d.status, d.uploaded_at, d.file_name,
               u.username as uploader_name
        FROM epc_documents d
        LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE d.project_id = ${projectId} AND d.status = 'active' AND d.folder_code IS NOT NULL
        ORDER BY d.folder_code, d.seq_number
      `);

      const summary: Record<string, any> = {};
      for (const row of result.rows as any[]) {
        if (!summary[row.folder_code]) {
          summary[row.folder_code] = {
            folderCode: row.folder_code,
            docType: row.doc_type,
            revision: row.revision,
            uploadedAt: row.uploaded_at,
            uploaderName: row.uploader_name,
            fileCount: 0,
          };
        }
        summary[row.folder_code].fileCount++;
      }

      res.json(summary);
    } catch (error) {
      console.error('[DOC_CTRL] Summary error:', error);
      res.status(500).json({ error: 'Failed to fetch summary' });
    }
  });
}
