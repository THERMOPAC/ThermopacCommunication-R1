import express from 'express';
import multer from 'multer';
import { db } from './db';
import { designBasicDrawings, projects } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { uploadFileWithDiagnostics } from './utils/gcs-enhanced-upload';
import { ensureAuthenticated } from './auth-middleware';

const router = express.Router();

// Multer configuration for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// GET /api/design/basic-drawings - Get all basic drawings for a project
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Project ID is required' 
      });
    }

    const drawings = await db
      .select({
        id: designBasicDrawings.id,
        discipline: designBasicDrawings.discipline,
        drawingType: designBasicDrawings.drawingType,
        fileName: designBasicDrawings.fileName,
        originalFileName: designBasicDrawings.originalFileName,
        revision: designBasicDrawings.revision,
        description: designBasicDrawings.description,
        filePath: designBasicDrawings.filePath,
        fileUrl: designBasicDrawings.fileUrl,
        fileSize: designBasicDrawings.fileSize,
        fileType: designBasicDrawings.fileType,
        status: designBasicDrawings.status,
        isRevision: designBasicDrawings.isRevision,
        revisionOf: designBasicDrawings.revisionOf,
        revisionReason: designBasicDrawings.revisionReason,
        supersededAt: designBasicDrawings.supersededAt,
        supersededBy: designBasicDrawings.supersededBy,
        uploadedBy: designBasicDrawings.uploadedBy,
        uploadedAt: designBasicDrawings.uploadedAt,
      })
      .from(designBasicDrawings)
      .where(eq(designBasicDrawings.projectId, parseInt(projectId as string)));

    res.json({ success: true, data: drawings });
  } catch (error) {
    console.error('Error fetching basic drawings:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch basic drawings' 
    });
  }
});

// POST /api/design/basic-drawings - Upload a basic drawing with automatic revision control
router.post('/', ensureAuthenticated, upload.single('file'), async (req, res) => {
  try {
    const { projectId, discipline, drawingType, description, revisionReason } = req.body;
    const file = req.file;
    const userId = (req as any).user.id;

    if (!file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    if (!projectId || !discipline || !drawingType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Project ID, discipline, and drawing type are required' 
      });
    }

    // Get project code for GCS path
    const project = await db
      .select({ code: projects.code })
      .from(projects)
      .where(eq(projects.id, parseInt(projectId)))
      .limit(1);

    if (!project || project.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found' 
      });
    }

    const projectCode = project[0].code;

    // **AUTOMATIC REVISION CONTROL LOGIC**
    // Check if drawing with same type and discipline already exists
    const existingDrawings = await db
      .select({ 
        id: designBasicDrawings.id,
        revision: designBasicDrawings.revision,
        fileName: designBasicDrawings.fileName 
      })
      .from(designBasicDrawings)
      .where(and(
        eq(designBasicDrawings.projectId, parseInt(projectId)),
        eq(designBasicDrawings.discipline, discipline),
        eq(designBasicDrawings.drawingType, drawingType)
      ))
      .orderBy(desc(designBasicDrawings.uploadedAt));

    let autoRevision = 'R1';
    let isRevision = false;
    
    if (existingDrawings.length > 0) {
      isRevision = true;
      // Extract revision numbers and find the next revision
      const revisions = existingDrawings
        .map(d => d.revision)
        .filter(r => r && r.match(/^R\d+$/))
        .map(r => {
          const match = r.match(/^R(\d+)$/);
          return match ? parseInt(match[1]) : null;
        })
        .filter(r => r !== null)
        .sort((a, b) => b - a);

      if (revisions.length > 0) {
        const latestRevision = revisions[0];
        // Auto-increment revision (R1 → R2 → R3)
        autoRevision = `R${latestRevision + 1}`;
      } else {
        autoRevision = 'R2'; // If no valid revisions found, start at R2
      }
    }

    const finalRevision = autoRevision;



    // **NEW GCS PATH STRUCTURE**
    // Structure: Design_Management/{ProjectCode}/Basic_Drawings/{Discipline}/{DrawingType}_R{Revision}.{extension}
    const fileExtension = file.originalname.split('.').pop();
    const versionedFileName = `${drawingType}_${finalRevision}.${fileExtension}`;
    
    const gcsPath = `Design_Management/${projectCode}/Basic_Drawings/${discipline.replace(/\s+/g, '_')}/${versionedFileName}`;

    // Upload file to GCS with versioned path
    const uploadResult = await uploadFileWithDiagnostics(file.buffer, gcsPath);
    
    if (!uploadResult.success) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to upload file to storage' 
      });
    }

    // Archive previous revisions (mark as superseded)
    if (isRevision && existingDrawings.length > 0) {
      await db
        .update(designBasicDrawings)
        .set({ 
          status: 'superseded',
          supersededAt: new Date(),
          supersededBy: userId
        })
        .where(and(
          eq(designBasicDrawings.projectId, parseInt(projectId)),
          eq(designBasicDrawings.discipline, discipline),
          eq(designBasicDrawings.drawingType, drawingType),
          eq(designBasicDrawings.status, 'current')
        ));
    }

    // Save new revision to database
    const [newDrawing] = await db
      .insert(designBasicDrawings)
      .values({
        projectId: parseInt(projectId),
        discipline,
        drawingType,
        fileName: versionedFileName,
        originalFileName: file.originalname,
        revision: finalRevision,
        description: description || null,
        filePath: gcsPath,
        fileUrl: uploadResult.fileUrl,
        fileSize: file.size,
        fileType: file.mimetype,
        uploadedBy: userId,
        status: 'current',
        isRevision: isRevision,
        revisionOf: isRevision && existingDrawings.length > 0 ? existingDrawings[0].id : null,
        revisionReason: isRevision ? (revisionReason || 'Updated revision') : null
      })
      .returning();

    res.json({ 
      success: true, 
      data: newDrawing,
      message: isRevision 
        ? `Revision ${finalRevision} uploaded successfully (previous revisions archived)` 
        : 'Basic drawing uploaded successfully',
      revisionInfo: {
        isRevision,
        revision: finalRevision,
        previousRevisions: existingDrawings.length,
        gcsPath
      }
    });
  } catch (error) {
    console.error('Error uploading basic drawing:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload basic drawing' 
    });
  }
});

// GET /api/design/basic-drawings/:id/download - Download a basic drawing
router.get('/:id/download', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    const drawing = await db
      .select()
      .from(designBasicDrawings)
      .where(eq(designBasicDrawings.id, parseInt(id)))
      .limit(1);

    if (!drawing || drawing.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Basic drawing not found' 
      });
    }

    const drawingData = drawing[0];

    // For now, return the file URL for direct download
    // In production, you might want to generate a signed URL or stream the file
    if (drawingData.fileUrl) {
      res.redirect(drawingData.fileUrl);
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'File URL not available' 
      });
    }
  } catch (error) {
    console.error('Error downloading basic drawing:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to download basic drawing' 
    });
  }
});

// DELETE /api/design/basic-drawings/:id - Delete a basic drawing
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const drawing = await db
      .select()
      .from(designBasicDrawings)
      .where(eq(designBasicDrawings.id, parseInt(id)))
      .limit(1);

    if (!drawing || drawing.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Basic drawing not found' 
      });
    }

    // TODO: Add file deletion from GCS here
    // For now, just delete from database

    await db
      .delete(designBasicDrawings)
      .where(eq(designBasicDrawings.id, parseInt(id)));

    res.json({ 
      success: true, 
      message: 'Basic drawing deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting basic drawing:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete basic drawing' 
    });
  }
});

export default router;