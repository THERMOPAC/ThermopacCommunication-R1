import { Router } from 'express';
import multer from 'multer';
import { db } from './db';
import { designProjectBackups, projects } from '../shared/schema';
import { desc, eq, and, or } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { uploadFileWithDiagnostics } from './utils/gcs-enhanced-upload';
import path from 'path';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Apply auth middleware to all routes
router.use(ensureAuthenticated);

// GET all project backups with optional filtering
router.get('/', async (req, res) => {
  try {
    console.log('=== PROJECT BACKUPS GET ROUTE HIT ===');
    const { projectId, backupType, showAllRevisions } = req.query;

    let query = db
      .select({
        id: designProjectBackups.id,
        projectId: designProjectBackups.projectId,
        backupType: designProjectBackups.backupType,
        fileName: designProjectBackups.fileName,
        originalFileName: designProjectBackups.originalFileName,
        revision: designProjectBackups.revision,
        description: designProjectBackups.description,
        filePath: designProjectBackups.filePath,
        fileUrl: designProjectBackups.fileUrl,
        fileSize: designProjectBackups.fileSize,
        fileType: designProjectBackups.fileType,
        status: designProjectBackups.status,
        isRevision: designProjectBackups.isRevision,
        revisionOf: designProjectBackups.revisionOf,
        uploadedBy: designProjectBackups.uploadedBy,
        uploadedAt: designProjectBackups.uploadedAt,
      })
      .from(designProjectBackups);

    const conditions = [];

    if (projectId && projectId !== 'all') {
      conditions.push(eq(designProjectBackups.projectId, parseInt(projectId as string)));
    }

    if (backupType && backupType !== 'all') {
      conditions.push(eq(designProjectBackups.backupType, backupType as string));
    }

    if (showAllRevisions !== 'true') {
      // Only show current versions when not showing all revisions
      conditions.push(eq(designProjectBackups.status, 'current'));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const backups = await query.orderBy(
      desc(designProjectBackups.uploadedAt),
      desc(designProjectBackups.revision)
    );

    console.log(`Found ${backups.length} project backups`);

    res.json({
      success: true,
      data: backups
    });
  } catch (error) {
    console.error('Error fetching project backups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project backups',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST upload project backup with version control
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('=== PROJECT BACKUP UPLOAD ROUTE HIT ===');
    console.log('Request body:', req.body);
    console.log('File:', req.file ? { name: req.file.originalname, size: req.file.size } : 'No file');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { projectId, backupType, description } = req.body;
    const userId = (req as any).user.id;

    if (!projectId || !backupType) {
      return res.status(400).json({
        success: false,
        message: 'Project ID and backup type are required'
      });
    }

    // Get project details
    const project = await db.select().from(projects).where(eq(projects.id, parseInt(projectId))).limit(1);
    if (project.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const projectCode = project[0].projectCode;

    // Check for existing backups of same type to determine revision number
    const existingBackups = await db
      .select({ revision: designProjectBackups.revision })
      .from(designProjectBackups)
      .where(
        and(
          eq(designProjectBackups.projectId, parseInt(projectId)),
          eq(designProjectBackups.backupType, backupType)
        )
      )
      .orderBy(desc(designProjectBackups.revision));

    // Calculate next revision
    let nextRevisionNumber = 1;
    if (existingBackups.length > 0) {
      const latestRevision = existingBackups[0].revision;
      const revisionMatch = latestRevision.match(/R(\d+)/);
      if (revisionMatch) {
        nextRevisionNumber = parseInt(revisionMatch[1]) + 1;
      }
    }

    const revision = `R${nextRevisionNumber}`;

    // Generate GCS file path: Design_Management/{ProjectCode}/Backups/{BackupType}_R{Revision}/{OriginalFileName}.{ext}
    const fileExtension = path.extname(req.file.originalname);
    const baseFileName = path.basename(req.file.originalname, fileExtension);
    const fileName = `${baseFileName}_${revision}${fileExtension}`;
    const gcsPath = `Design_Management/${projectCode}/Backups/${backupType}_${revision}/${req.file.originalname}`;

    console.log(`Uploading to GCS path: ${gcsPath}`);

    // Upload to Google Cloud Storage
    const uploadResult = await uploadFileWithDiagnostics(
      gcsPath,
      req.file.buffer,
      req.file.mimetype || 'application/octet-stream'
    );

    if (!uploadResult.successful) {
      console.error('GCS upload failed:', uploadResult.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload file to storage',
        error: uploadResult.error
      });
    }

    console.log('GCS upload successful:', uploadResult.url);

    // Mark previous backups as superseded if this is a revision
    if (nextRevisionNumber > 1) {
      await db.update(designProjectBackups)
        .set({
          status: 'superseded',
          supersededAt: new Date(),
          supersededBy: userId
        })
        .where(
          and(
            eq(designProjectBackups.projectId, parseInt(projectId)),
            eq(designProjectBackups.backupType, backupType),
            eq(designProjectBackups.status, 'current')
          )
        );
    }

    // Insert backup record
    const [newBackup] = await db.insert(designProjectBackups).values({
      projectId: parseInt(projectId),
      backupType,
      fileName,
      originalFileName: req.file.originalname,
      revision,
      description: description || `${backupType} backup - ${revision}`,
      filePath: gcsPath,
      fileUrl: uploadResult.url,
      fileSize: req.file.size,
      fileType: req.file.mimetype || 'application/octet-stream',
      status: 'current',
      isRevision: nextRevisionNumber > 1,
      revisionOf: nextRevisionNumber > 1 ? existingBackups[0]?.id || null : null,
      uploadedBy: userId
    }).returning();

    console.log('Backup record created:', newBackup);

    res.json({
      success: true,
      message: 'Project backup uploaded successfully',
      data: newBackup
    });

  } catch (error) {
    console.error('Error uploading project backup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload project backup',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET download project backup
router.get('/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get backup details
    const backup = await db.select().from(designProjectBackups).where(eq(designProjectBackups.id, parseInt(id))).limit(1);
    
    if (backup.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project backup not found'
      });
    }

    // Redirect to the file URL for download
    if (backup[0].fileUrl) {
      res.redirect(backup[0].fileUrl);
    } else {
      res.status(404).json({
        success: false,
        message: 'File URL not available'
      });
    }
  } catch (error) {
    console.error('Error downloading project backup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download project backup',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;