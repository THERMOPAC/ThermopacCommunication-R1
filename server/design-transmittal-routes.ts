import { Router } from 'express';
import multer from 'multer';
import { eq, and, like, desc, sql } from 'drizzle-orm';
import { db } from './db';
import { 
  drawingTransmittals,
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Get all transmittals with filters
router.get('/transmittals', authenticateUser, async (req, res) => {
  try {
    const { search, status } = req.query;
    
    let query = db
      .select({
        id: drawingTransmittals.id,
        transmittalNumber: drawingTransmittals.transmittalNumber,
        designProjectId: drawingTransmittals.designProjectId,
        clientName: drawingTransmittals.clientName,
        clientContactPerson: drawingTransmittals.clientContactPerson,
        clientEmail: drawingTransmittals.clientEmail,
        subject: drawingTransmittals.subject,
        transmissionType: drawingTransmittals.transmissionType,
        status: drawingTransmittals.status,
        totalDrawings: drawingTransmittals.totalDrawings,
        submittedDate: drawingTransmittals.submittedDate,
        acknowledgmentReceived: drawingTransmittals.acknowledgmentReceived,
        acknowledgmentDate: drawingTransmittals.acknowledgmentDate,
        remarks: drawingTransmittals.remarks,
        createdBy: drawingTransmittals.createdBy,
        createdAt: drawingTransmittals.createdAt,
        updatedAt: drawingTransmittals.updatedAt,
        // Project info
        designProjectName: designProjects.designProjectName,
        projectName: projects.name,
        projectCode: projects.projectCode,
        // Creator info
        creatorUsername: users.username,
        creatorFirstName: users.firstName,
        creatorLastName: users.lastName
      })
      .from(drawingTransmittals)
      .leftJoin(designProjects, eq(drawingTransmittals.designProjectId, designProjects.id))
      .leftJoin(projects, eq(designProjects.projectId, projects.id))
      .leftJoin(users, eq(drawingTransmittals.createdBy, users.id));

    // Apply filters
    const conditions = [];
    
    if (search) {
      conditions.push(
        sql`(${drawingTransmittals.transmittalNumber} ILIKE ${`%${search}%`} OR ${drawingTransmittals.subject} ILIKE ${`%${search}%`})`
      );
    }
    
    if (status) {
      conditions.push(eq(drawingTransmittals.status, status as string));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(drawingTransmittals.updatedAt));

    const result = await query;

    // Transform the result to match the expected frontend interface
    const transmittals = result.map(row => ({
      id: row.id,
      transmittalNumber: row.transmittalNumber,
      designProjectId: row.designProjectId,
      clientName: row.clientName,
      clientContactPerson: row.clientContactPerson,
      clientEmail: row.clientEmail,
      subject: row.subject,
      transmissionType: row.transmissionType,
      status: row.status,
      totalDrawings: row.totalDrawings,
      submittedDate: row.submittedDate,
      acknowledgmentReceived: row.acknowledgmentReceived,
      acknowledgmentDate: row.acknowledgmentDate,
      remarks: row.remarks,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      project: {
        designProjectName: row.designProjectName,
        projectName: row.projectName,
        projectCode: row.projectCode
      },
      creator: {
        username: row.creatorUsername,
        firstName: row.creatorFirstName,
        lastName: row.creatorLastName
      }
    }));

    res.json(transmittals);
  } catch (error) {
    console.error('Error fetching transmittals:', error);
    res.status(500).json({ error: 'Failed to fetch transmittals' });
  }
});

// Create new transmittal
router.post('/transmittals', authenticateUser, upload.array('attachments', 10), async (req, res) => {
  try {
    const {
      transmittalNumber,
      designProjectId,
      clientName,
      clientContactPerson,
      clientEmail,
      subject,
      transmissionType,
      totalDrawings,
      remarks
    } = req.body;

    const userId = req.user!.id;
    const files = req.files as Express.Multer.File[] || [];

    // Create transmittal record
    const [newTransmittal] = await db
      .insert(drawingTransmittals)
      .values({
        transmittalNumber,
        designProjectId: parseInt(designProjectId),
        clientName,
        clientContactPerson,
        clientEmail,
        subject,
        transmissionType,
        status: 'Draft',
        totalDrawings: parseInt(totalDrawings),
        submittedDate: null,
        acknowledgmentReceived: false,
        acknowledgmentDate: null,
        remarks,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    // Handle file uploads if any
    const uploadedFiles = [];
    if (files.length > 0) {
      for (const file of files) {
        try {
          // Create GCS path: Design_Management/Transmittals/{transmittalNumber}/
          const gcsPath = `Design_Management/Transmittals/${transmittalNumber}/${file.originalname}`;
          
          const uploadResult = await uploadFileWithDiagnostics(gcsPath, file.buffer, file.mimetype);
          if (uploadResult.successful) {
            uploadedFiles.push({
              fileName: file.originalname,
              fileUrl: uploadResult.url,
              fileSize: file.size
            });
          }
        } catch (uploadError) {
          console.error('File upload error:', uploadError);
          // Continue with other files even if one fails
        }
      }
    }

    res.json({
      success: true,
      transmittal: newTransmittal,
      uploadedFiles
    });
  } catch (error) {
    console.error('Error creating transmittal:', error);
    res.status(500).json({ error: 'Failed to create transmittal' });
  }
});

// Update transmittal status
router.patch('/transmittals/:id/status', authenticateUser, async (req, res) => {
  try {
    const transmittalId = parseInt(req.params.id);
    const { status, submittedDate, acknowledgmentReceived, acknowledgmentDate } = req.body;
    const userId = req.user!.id;

    const updateData: any = {
      status,
      updatedAt: new Date()
    };

    if (submittedDate) updateData.submittedDate = new Date(submittedDate);
    if (acknowledgmentReceived !== undefined) updateData.acknowledgmentReceived = acknowledgmentReceived;
    if (acknowledgmentDate) updateData.acknowledgmentDate = new Date(acknowledgmentDate);

    const [updatedTransmittal] = await db
      .update(drawingTransmittals)
      .set(updateData)
      .where(eq(drawingTransmittals.id, transmittalId))
      .returning();

    if (!updatedTransmittal) {
      return res.status(404).json({ error: 'Transmittal not found' });
    }

    res.json({
      success: true,
      transmittal: updatedTransmittal
    });
  } catch (error) {
    console.error('Error updating transmittal:', error);
    res.status(500).json({ error: 'Failed to update transmittal' });
  }
});

// Get transmittal statistics
router.get('/transmittals/stats', authenticateUser, async (req, res) => {
  try {
    const stats = await db
      .select({
        status: drawingTransmittals.status,
        count: sql<number>`count(*)::int`,
        totalDrawings: sql<number>`sum(total_drawings)::int`
      })
      .from(drawingTransmittals)
      .groupBy(drawingTransmittals.status);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching transmittal stats:', error);
    res.status(500).json({ error: 'Failed to fetch transmittal stats' });
  }
});

export default router;