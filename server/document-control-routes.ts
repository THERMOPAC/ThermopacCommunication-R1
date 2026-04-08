import { Express, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { db } from './db';
import { sql, eq, and, desc } from 'drizzle-orm';
import { epcDocTypes, epcDocuments } from '@shared/schema';
import { resolveProjectGeoCodes } from './epc-coding';
import { uploadFileWithDiagnostics } from './utils/gcs-enhanced-upload';
import { gcsStorage } from './utils/gcs-storage';

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

function buildSlotGcsPath(
  continentCode: string,
  countryCode: string,
  customerShortCode: string,
  fyCode: string,
  projectSeq: string,
  docTypeCode: string,
  revision: string,
  seqNumber: number,
  label: string,
  originalFileName: string
): string {
  const rev = `rev-${revision}`;
  const seq = String(seqNumber).padStart(3, '0');
  const safeLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'file';
  const ext = originalFileName.split('.').pop()?.toLowerCase() || 'bin';
  return `TPEL/${continentCode}/${countryCode}/${customerShortCode}/${fyCode}/${projectSeq}/${docTypeCode}/${rev}/${seq}-${safeLabel}.${ext}`;
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

const TPEL_PATH_REGEX = /^TPEL\/[A-Z]{2}\/[A-Z]{2}\/[A-Z0-9]{2,5}\/\d{4}\/TP-[A-Z]{2}-[A-Z]{2}-[A-Z0-9]+-\d{4}-\d{3}\/[A-Z0-9]+\/rev-\d{2}\//;

function validateTpelPath(path: string): boolean {
  return TPEL_PATH_REGEX.test(path);
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

        let nextRevision = '00';
        if (activeDocsInSlot.length > 0) {
          const maxRev = Math.max(...activeDocsInSlot.map(d => parseInt(d.revision, 10)));
          nextRevision = String(maxRev + 1).padStart(2, '0');
        } else {
          const allDocs = await db.select().from(epcDocuments)
            .where(and(
              eq(epcDocuments.projectId, projectId),
              eq(epcDocuments.folderCode, folderCode)
            ));
          if (allDocs.length > 0) {
            const maxRev = Math.max(...allDocs.map(d => parseInt(d.revision, 10)));
            nextRevision = String(maxRev + 1).padStart(2, '0');
          }
        }

        const title = req.body.title || docType.name;
        const now = new Date();

        const uploadedPaths: string[] = [];
        const fileMetadata: { gcsPath: string; file: Express.Multer.File; seqNumber: number; checksum: string; label: string }[] = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const seqNumber = i + 1;
          const label = file.originalname.split('.').slice(0, -1).join('.') || docType.name;

          const gcsPath = buildSlotGcsPath(
            geo.continentCode,
            geo.countryCode,
            geo.customerShortCode,
            geo.fyCode,
            geo.projectSeq,
            docType.code,
            nextRevision,
            seqNumber,
            label,
            file.originalname
          );

          if (!validateTpelPath(gcsPath)) {
            await cleanupGcsObjects(uploadedPaths);
            return res.status(500).json({
              error: 'Generated path does not conform to TPEL structure',
              path: gcsPath,
            });
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
          fileMetadata.push({ gcsPath, file, seqNumber, checksum: checksums[i], label });
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
