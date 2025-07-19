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
        version: designBasicDrawings.version,
        description: designBasicDrawings.description,
        filePath: designBasicDrawings.filePath,
        fileUrl: designBasicDrawings.fileUrl,
        fileSize: designBasicDrawings.fileSize,
        fileType: designBasicDrawings.fileType,
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
    const { projectId, discipline, drawingType, description, version } = req.body;
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
        version: designBasicDrawings.version,
        fileName: designBasicDrawings.fileName 
      })
      .from(designBasicDrawings)
      .where(and(
        eq(designBasicDrawings.projectId, parseInt(projectId)),
        eq(designBasicDrawings.discipline, discipline),
        eq(designBasicDrawings.drawingType, drawingType)
      ))
      .orderBy(desc(designBasicDrawings.uploadedAt));

    let autoVersion = 'v1.0';
    let isRevision = false;
    
    if (existingDrawings.length > 0) {
      isRevision = true;
      // Extract version numbers and find the next version
      const versions = existingDrawings
        .map(d => d.version)
        .filter(v => v && v.match(/^v\d+\.\d+$/))
        .map(v => {
          const match = v.match(/^v(\d+)\.(\d+)$/);
          return match ? { major: parseInt(match[1]), minor: parseInt(match[2]) } : null;
        })
        .filter(v => v !== null)
        .sort((a, b) => (b.major * 100 + b.minor) - (a.major * 100 + a.minor));

      if (versions.length > 0) {
        const latestVersion = versions[0];
        // Auto-increment minor version (e.g., v1.0 → v1.1 → v1.2)
        autoVersion = `v${latestVersion.major}.${latestVersion.minor + 1}`;
      } else {
        autoVersion = 'v1.1'; // If no valid versions found, start at v1.1
      }
    }

    const finalVersion = version || autoVersion;

    // **INTELLIGENT GCS PATH STRUCTURE**
    // Structure: Design_Management/Basic_Drawings/{ProjectCode}/{Discipline}/{DrawingType}/{Version}_{OriginalFileName}
    const fileExtension = file.originalname.split('.').pop();
    const baseFileName = file.originalname.replace(`.${fileExtension}`, '');
    const versionedFileName = `${finalVersion}_${baseFileName}.${fileExtension}`;
    
    const gcsPath = `Design_Management/Basic_Drawings/${projectCode}/${discipline.replace(/\s+/g, '_')}/${drawingType.replace(/\s+/g, '_')}/${versionedFileName}`;

    // Upload file to GCS with versioned path
    const uploadResult = await uploadFileWithDiagnostics(file.buffer, gcsPath);
    
    if (!uploadResult.success) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to upload file to storage' 
      });
    }

    // Archive previous versions (mark as superseded)
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

    // Save new version to database
    const [newDrawing] = await db
      .insert(designBasicDrawings)
      .values({
        projectId: parseInt(projectId),
        discipline,
        drawingType,
        fileName: versionedFileName,
        originalFileName: file.originalname,
        version: finalVersion,
        description: description || null,
        filePath: gcsPath,
        fileUrl: uploadResult.fileUrl,
        fileSize: file.size,
        fileType: file.mimetype,
        uploadedBy: userId,
        status: 'current',
        isRevision: isRevision,
        revisionOf: isRevision && existingDrawings.length > 0 ? existingDrawings[0].id : null,
        revisionReason: isRevision ? (description || 'Updated version') : null
      })
      .returning();

    res.json({ 
      success: true, 
      data: newDrawing,
      message: isRevision 
        ? `Revision ${finalVersion} uploaded successfully (previous versions archived)` 
        : 'Basic drawing uploaded successfully',
      revisionInfo: {
        isRevision,
        version: finalVersion,
        previousVersions: existingDrawings.length,
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