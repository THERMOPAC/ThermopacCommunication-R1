import { Router } from 'express';
import multer from 'multer';
import { eq, and, like, desc, sql } from 'drizzle-orm';
import { db } from './db';
import { 
  designDrawings, 
  drawingVersions, 
  designProjects, 
  projects, 
  users 
} from '../shared/schema';
import { ensureAuthenticated as authenticateUser } from './auth-middleware';
import { uploadFileWithDiagnostics } from './utils/gcs-enhanced-upload';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'application/octet-stream'];
    const allowedExtensions = ['.dwg', '.pdf', '.png', '.jpg', '.jpeg'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: DWG, PDF, PNG, JPG'));
    }
  }
});

// Get all drawings with filters and joins
router.get('/drawings', authenticateUser, async (req, res) => {
  try {
    const { search, category, status, projectId } = req.query;
    
    // Simple query to get just the core drawings data first
    let query = db.select().from(designDrawings);

    // Apply filters
    const conditions = [];
    
    if (search) {
      conditions.push(
        sql`(${designDrawings.drawingNumber} ILIKE ${`%${search}%`} OR ${designDrawings.drawingTitle} ILIKE ${`%${search}%`})`
      );
    }
    
    if (category && category !== 'all') {
      conditions.push(eq(designDrawings.category, category as string));
    }
    
    if (status && status !== 'all') {
      conditions.push(eq(designDrawings.status, status as string));
    }
    
    if (projectId) {
      conditions.push(eq(designDrawings.designProjectId, parseInt(projectId as string)));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(designDrawings.updatedAt));

    const result = await query;

    // Return simplified structure for now to avoid join issues
    const drawings = result.map(row => ({
      id: row.id,
      designProjectId: row.designProjectId,
      drawingNumber: row.drawingNumber,
      drawingTitle: row.drawingTitle,
      category: row.category,
      disciplineCode: row.disciplineCode,
      status: row.status,
      currentVersionId: row.currentVersionId,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      project: null, // Simplified for now
      currentVersion: null, // Simplified for now  
      creator: null // Simplified for now
    }));

    res.json(drawings);
  } catch (error) {
    console.error('Error fetching drawings:', error);
    res.status(500).json({ error: 'Failed to fetch drawings' });
  }
});

// Get versions for a specific drawing
router.get('/drawings/:id/versions', authenticateUser, async (req, res) => {
  try {
    const drawingId = parseInt(req.params.id);
    
    const versions = await db
      .select({
        id: drawingVersions.id,
        drawingId: drawingVersions.drawingId,
        version: drawingVersions.version,
        revision: drawingVersions.revision,
        fileName: drawingVersions.fileName,
        fileUrl: drawingVersions.fileUrl,
        filePath: drawingVersions.filePath,
        fileSize: drawingVersions.fileSize,
        fileType: drawingVersions.fileType,
        uploadedBy: drawingVersions.uploadedBy,
        uploadDate: drawingVersions.uploadDate,
        versionNotes: drawingVersions.versionNotes,
        uploaderUsername: users.username,
        uploaderFirstName: users.firstName,
        uploaderLastName: users.lastName
      })
      .from(drawingVersions)
      .leftJoin(users, eq(drawingVersions.uploadedBy, users.id))
      .where(eq(drawingVersions.drawingId, drawingId))
      .orderBy(desc(drawingVersions.uploadDate));

    const formattedVersions = versions.map(version => ({
      id: version.id,
      drawingId: version.drawingId,
      version: version.version,
      revision: version.revision,
      fileName: version.fileName,
      fileUrl: version.fileUrl,
      filePath: version.filePath,
      fileSize: version.fileSize,
      fileType: version.fileType,
      uploadedBy: version.uploadedBy,
      uploadDate: version.uploadDate,
      versionNotes: version.versionNotes,
      uploader: {
        username: version.uploaderUsername,
        firstName: version.uploaderFirstName,
        lastName: version.uploaderLastName
      }
    }));

    res.json(formattedVersions);
  } catch (error) {
    console.error('Error fetching drawing versions:', error);
    res.status(500).json({ error: 'Failed to fetch drawing versions' });
  }
});

// Upload new drawing with version
router.post('/drawings/upload', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    const {
      projectId,
      designProjectId,
      drawingNumber,
      drawingTitle,
      category,
      disciplineCode,
      versionNotes
    } = req.body;

    const file = req.file;
    const userId = req.user!.id;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let actualDesignProjectId;
    let projectCode;

    // If designProjectId is provided, use it directly
    if (designProjectId) {
      actualDesignProjectId = parseInt(designProjectId);
    } 
    // If projectId is provided, find or create the design project
    else if (projectId) {
      // First, try to find existing design project for this project
      const existingDesignProject = await db
        .select({ id: designProjects.id })
        .from(designProjects)
        .where(eq(designProjects.projectId, parseInt(projectId)))
        .limit(1);

      if (existingDesignProject.length > 0) {
        actualDesignProjectId = existingDesignProject[0].id;
      } else {
        // Create new design project for this project
        const project = await db
          .select({ name: projects.name, code: projects.code })
          .from(projects)
          .where(eq(projects.id, parseInt(projectId)))
          .limit(1);

        if (project.length === 0) {
          return res.status(400).json({ error: 'Project not found' });
        }



        const [newDesignProject] = await db
          .insert(designProjects)
          .values({
            projectId: parseInt(projectId),
            projectCode: project[0].code || '2025-' + projectId,
            designProjectName: `${project[0].name} - Design Phase`,
            designPhase: 'Detailed',
            status: 'In Progress',
            designManagerId: userId,
            startDate: new Date(),
            createdBy: userId,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();

        actualDesignProjectId = newDesignProject.id;
      }
    } else {
      return res.status(400).json({ error: 'Either projectId or designProjectId is required' });
    }

    // Get design project info for GCS path
    const designProject = await db
      .select({
        designProjectName: designProjects.designProjectName,
        projectCode: projects.code,
        projectName: projects.name
      })
      .from(designProjects)
      .leftJoin(projects, eq(designProjects.projectId, projects.id))
      .where(eq(designProjects.id, actualDesignProjectId))
      .limit(1);

    if (designProject.length === 0) {
      return res.status(400).json({ error: 'Design project not found' });
    }

    projectCode = designProject[0].projectCode || 'UNKNOWN';
    
    // **AUTOMATIC REVISION CONTROL LOGIC**
    // Check if drawing with same drawingNumber already exists for revision control
    const existingVersions = await db
      .select({ 
        id: drawingVersions.id,
        revision: drawingVersions.revision,
        fileName: drawingVersions.fileName 
      })
      .from(drawingVersions)
      .leftJoin(designDrawings, eq(drawingVersions.drawingId, designDrawings.id))
      .where(eq(designDrawings.drawingNumber, drawingNumber))
      .orderBy(desc(drawingVersions.createdAt));

    let autoRevision = 'R1';
    let isRevision = false;
    
    if (existingVersions.length > 0) {
      isRevision = true;
      // Extract revision numbers and find the next revision
      const revisions = existingVersions
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

    // **UPDATED GCS PATH STRUCTURE**
    // Structure: Design_Management/Drawings/{ProjectCode}/{DrawingNumber}/{DrawingNumber}_R{Revision}.{extension}
    const fileExtension = file.originalname.split('.').pop();
    const versionedFileName = `${drawingNumber}_${finalRevision}.${fileExtension}`;
    
    const gcsPath = `Design_Management/Drawings/${projectCode}/${drawingNumber}/${versionedFileName}`;

    // Upload to GCS
    const uploadResult = await uploadFileWithDiagnostics(gcsPath, file.buffer, file.mimetype);
    if (!uploadResult.successful) {
      return res.status(500).json({ error: `Upload failed: ${uploadResult.error?.message || 'Unknown error'}` });
    }

    // Create drawing record (only if this is the first version)
    let drawingId;
    if (!isRevision) {
      const [newDrawing] = await db
        .insert(designDrawings)
        .values({
          designProjectId: actualDesignProjectId,
          drawingNumber,
          drawingTitle,
          category: category || 'Assembly_Drawing',
          disciplineCode: disciplineCode || 'Project_Drawings',
          status: 'Draft',
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      drawingId = newDrawing.id;
    } else {
      // Get existing drawing ID
      const existingDrawing = await db
        .select({ id: designDrawings.id })
        .from(designDrawings)
        .where(eq(designDrawings.drawingNumber, drawingNumber))
        .limit(1);
      
      if (existingDrawing.length === 0) {
        return res.status(400).json({ error: 'Drawing not found for revision' });
      }
      
      drawingId = existingDrawing[0].id;
    }

    // Create new version
    const [newVersion] = await db
      .insert(drawingVersions)
      .values({
        drawingId: drawingId,
        version: '1',
        revision: finalRevision,
        fileName: versionedFileName,
        fileUrl: uploadResult.url,
        filePath: uploadResult.path || gcsPath,
        fileSize: file.size,
        fileType: file.mimetype,
        uploadedBy: userId,
        uploadDate: new Date(),
        versionNotes: versionNotes || 'Initial version'
      })
      .returning();

    // Update drawing with current version ID
    await db
      .update(designDrawings)
      .set({ 
        currentVersionId: newVersion.id,
        updatedAt: new Date()
      })
      .where(eq(designDrawings.id, drawingId));

    // Get updated drawing info for response
    const updatedDrawing = await db
      .select()
      .from(designDrawings)
      .where(eq(designDrawings.id, drawingId))
      .limit(1);

    res.json({
      success: true,
      drawing: updatedDrawing[0],
      version: newVersion,
      message: `Drawing uploaded successfully with revision ${finalRevision}`
    });
  } catch (error) {
    console.error('Error uploading drawing:', error);
    res.status(500).json({ error: 'Failed to upload drawing' });
  }
});

// Upload new version of existing drawing
router.post('/drawings/:id/versions', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    const drawingId = parseInt(req.params.id);
    const { versionNotes } = req.body;
    const file = req.file;
    const userId = req.user!.id;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get drawing info
    const drawing = await db
      .select({
        id: designDrawings.id,
        drawingNumber: designDrawings.drawingNumber,
        designProjectId: designDrawings.designProjectId,
        projectCode: projects.code
      })
      .from(designDrawings)
      .leftJoin(designProjects, eq(designDrawings.designProjectId, designProjects.id))
      .leftJoin(projects, eq(designProjects.projectId, projects.id))
      .where(eq(designDrawings.id, drawingId))
      .limit(1);

    if (drawing.length === 0) {
      return res.status(404).json({ error: 'Drawing not found' });
    }

    // Get latest version number
    const latestVersion = await db
      .select({
        version: drawingVersions.version,
        revision: drawingVersions.revision
      })
      .from(drawingVersions)
      .where(eq(drawingVersions.drawingId, drawingId))
      .orderBy(desc(drawingVersions.uploadDate))
      .limit(1);

    let newVersion = '1';
    let newRevision = '0';

    if (latestVersion.length > 0) {
      const currentVersion = parseInt(latestVersion[0].version);
      const currentRevision = parseInt(latestVersion[0].revision);
      newVersion = (currentVersion).toString();
      newRevision = (currentRevision + 1).toString();
    }

    const projectCode = drawing[0].projectCode || 'UNKNOWN';
    
    // Create GCS path
    const gcsPath = `Design_Management/Drawings/${projectCode}/${drawing[0].drawingNumber}/${file.originalname}`;

    // Upload to GCS
    const uploadResult = await uploadFileWithDiagnostics(gcsPath, file.buffer, file.mimetype);
    if (!uploadResult.successful) {
      return res.status(500).json({ error: `Upload failed: ${uploadResult.error?.message || 'Unknown error'}` });
    }

    // Create new version
    const [newVersionRecord] = await db
      .insert(drawingVersions)
      .values({
        drawingId,
        version: newVersion,
        revision: newRevision,
        fileName: file.originalname,
        fileUrl: uploadResult.url,
        filePath: uploadResult.path || gcsPath,
        fileSize: file.size,
        fileType: file.mimetype,
        uploadedBy: userId,
        uploadDate: new Date(),
        versionNotes: versionNotes || `Version ${newVersion}.${newRevision}`
      })
      .returning();

    // Update drawing's current version and status
    await db
      .update(designDrawings)
      .set({ 
        currentVersionId: newVersionRecord.id,
        status: 'Active',
        updatedAt: new Date()
      })
      .where(eq(designDrawings.id, drawingId));

    res.json({
      success: true,
      version: newVersionRecord
    });
  } catch (error) {
    console.error('Error uploading drawing version:', error);
    res.status(500).json({ error: 'Failed to upload drawing version' });
  }
});

export default router;