import { Router } from 'express';
import multer from 'multer';
import { db } from './db';
import { designProjectBackups, projects, users } from '../shared/schema';
import { desc, eq, and, or } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { uploadFileWithDiagnostics } from './utils/gcs-enhanced-upload';
import path from 'path';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB per file

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
        backupName: designProjectBackups.originalFileName, // Map originalFileName to backupName for frontend compatibility
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
        uploader: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        }
      })
      .from(designProjectBackups)
      .leftJoin(users, eq(designProjectBackups.uploadedBy, users.id));

    const conditions = [];

    if (projectId && projectId !== 'all') {
      console.log('Adding projectId condition:', projectId);
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

    console.log(`Found ${backups.length} project backups for projectId: ${projectId}`);
    console.log('Sample backup data:', backups.length > 0 ? backups[0] : 'No backups found');

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

// POST upload project backup with version control (multiple files with shared revision)
router.post('/', upload.array('file'), async (req, res) => {
  try {
    console.log('=== PROJECT BACKUP UPLOAD ROUTE HIT ===');
    console.log('Request body:', req.body);
    console.log('Files:', req.files ? (req.files as Express.Multer.File[]).map(f => ({ name: f.originalname, size: f.size })) : 'No files');

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    // Validate file types and sizes
    const allowedExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz', '.step', '.stp', '.iges', '.igs', '.dwg', '.dxf'];
    const maxFileSize = 500 * 1024 * 1024; // 500MB
    
    for (const file of files) {
      const fileExtension = path.extname(file.originalname).toLowerCase();
      
      if (!allowedExtensions.includes(fileExtension)) {
        return res.status(400).json({
          success: false,
          message: `File "${file.originalname}" has unsupported format. Allowed formats: ${allowedExtensions.join(', ')}`
        });
      }
      
      if (file.size > maxFileSize) {
        return res.status(400).json({
          success: false,
          message: `File "${file.originalname}" exceeds 500MB size limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`
        });
      }
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

    // Calculate next revision (shared for all files in this upload session)
    let nextRevisionNumber = 1;
    if (existingBackups.length > 0) {
      const latestRevision = existingBackups[0].revision;
      const revisionMatch = latestRevision.match(/R(\d+)/);
      if (revisionMatch) {
        nextRevisionNumber = parseInt(revisionMatch[1]) + 1;
      }
    }

    const revision = `R${nextRevisionNumber}`;
    console.log(`Using shared revision ${revision} for ${files.length} files`);

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

    // Process each file with shared revision
    const uploadedBackups = [];
    const uploadErrors = [];

    for (const file of files) {
      try {
        // Generate GCS file path: Design_Management/{ProjectCode}/Backups/{BackupType}_R{Revision}/{OriginalFileName}.{ext}
        const gcsPath = `Design_Management/${projectCode}/Backups/${backupType}_${revision}/${file.originalname}`;
        
        console.log(`Uploading file ${file.originalname} to GCS path: ${gcsPath}`);

        // Upload to Google Cloud Storage
        const uploadResult = await uploadFileWithDiagnostics(
          gcsPath,
          file.buffer,
          file.mimetype || 'application/octet-stream'
        );

        if (!uploadResult.successful) {
          console.error(`GCS upload failed for ${file.originalname}:`, uploadResult.error);
          uploadErrors.push({ fileName: file.originalname, error: uploadResult.error });
          continue;
        }

        console.log(`GCS upload successful for ${file.originalname}:`, uploadResult.url);

        // Insert backup record for this file
        const [newBackup] = await db.insert(designProjectBackups).values({
          projectId: parseInt(projectId),
          backupType,
          fileName: file.originalname, // Use original filename as fileName
          originalFileName: file.originalname,
          revision,
          description: description || `${backupType} backup - ${revision}`,
          filePath: gcsPath,
          fileUrl: uploadResult.url,
          fileSize: file.size,
          fileType: file.mimetype || 'application/octet-stream',
          status: 'current',
          isRevision: nextRevisionNumber > 1,
          revisionOf: nextRevisionNumber > 1 ? existingBackups[0]?.id || null : null,
          uploadedBy: userId
        }).returning();

        uploadedBackups.push(newBackup);
        console.log(`Backup record created for ${file.originalname}:`, newBackup.id);

      } catch (fileError) {
        console.error(`Error processing file ${file.originalname}:`, fileError);
        uploadErrors.push({ 
          fileName: file.originalname, 
          error: fileError instanceof Error ? fileError.message : 'Unknown error' 
        });
      }
    }

    // Return results
    const totalFiles = files.length;
    const successCount = uploadedBackups.length;
    const errorCount = uploadErrors.length;

    if (successCount === 0) {
      return res.status(500).json({
        success: false,
        message: 'All files failed to upload',
        errors: uploadErrors
      });
    }

    const responseMessage = successCount === totalFiles 
      ? `All ${totalFiles} files uploaded successfully to ${backupType} ${revision}`
      : `${successCount} of ${totalFiles} files uploaded successfully. ${errorCount} failed.`;

    res.json({
      success: true,
      message: responseMessage,
      data: {
        revision,
        uploadedFiles: uploadedBackups,
        totalFiles,
        successCount,
        errorCount,
        errors: uploadErrors
      }
    });

  } catch (error) {
    console.error('Error uploading project backups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload project backups',
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

// GET download project backup by ID
router.get('/:id/download', async (req, res) => {
  try {
    const backupId = parseInt(req.params.id);
    if (isNaN(backupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup ID'
      });
    }

    // Get backup details from database
    const backup = await db.select().from(designProjectBackups)
      .where(eq(designProjectBackups.id, backupId))
      .limit(1);

    if (backup.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Backup not found'
      });
    }

    const backupRecord = backup[0];

    // Generate signed URL for download
    const { generateSignedUrl } = await import('../utils/gcs-enhanced-upload.js');
    
    try {
      const signedUrl = await generateSignedUrl(backupRecord.filePath);
      console.log('Generated signed URL for backup download:', signedUrl);
      
      // Redirect to the signed URL
      res.redirect(signedUrl);
    } catch (error) {
      console.error('Error generating signed URL:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate download link',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Error downloading project backup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download backup',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;