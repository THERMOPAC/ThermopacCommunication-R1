import { Router } from 'express';
import multer from 'multer';
import { eq, and, like, desc, sql } from 'drizzle-orm';
import { db } from './db';
import { 
  designStandards,
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
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf', 
      'image/png', 
      'image/jpeg', 
      'application/octet-stream',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    const allowedExtensions = ['.dwg', '.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: DWG, PDF, PNG, JPG, DOC, DOCX, XLS, XLSX'));
    }
  }
});

// Get all standards with filters
router.get('/standards', authenticateUser, async (req, res) => {
  try {
    const { search, category, status, type } = req.query;
    
    let query = db
      .select({
        id: designStandards.id,
        standardType: designStandards.standardType,
        standardName: designStandards.standardName,
        description: designStandards.description,
        version: designStandards.version,
        category: designStandards.category,
        disciplineCode: designStandards.disciplineCode,
        status: designStandards.status,
        approvalStatus: designStandards.approvalStatus,
        fileName: designStandards.fileName,
        fileUrl: designStandards.fileUrl,
        fileSize: designStandards.fileSize,
        tags: designStandards.tags,
        createdBy: designStandards.createdBy,
        approvedBy: designStandards.approvedBy,
        createdAt: designStandards.createdAt,
        approvedAt: designStandards.approvedAt,
        updatedAt: designStandards.updatedAt,
        // Creator info
        creatorUsername: users.username,
        creatorFirstName: users.firstName,
        creatorLastName: users.lastName
      })
      .from(designStandards)
      .leftJoin(users, eq(designStandards.createdBy, users.id));

    // Apply filters
    const conditions = [];
    
    if (search) {
      conditions.push(
        sql`(${designStandards.standardName} ILIKE ${`%${search}%`} OR ${designStandards.description} ILIKE ${`%${search}%`})`
      );
    }
    
    if (category) {
      conditions.push(eq(designStandards.category, category as string));
    }
    
    if (status) {
      conditions.push(eq(designStandards.status, status as string));
    }
    
    if (type) {
      conditions.push(eq(designStandards.standardType, type as string));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(designStandards.updatedAt));

    const result = await query;

    // Transform the result to match the expected frontend interface
    const standards = result.map(row => ({
      id: row.id,
      standardType: row.standardType,
      standardName: row.standardName,
      description: row.description,
      version: row.version,
      category: row.category,
      disciplineCode: row.disciplineCode,
      status: row.status,
      approvalStatus: row.approvalStatus,
      fileName: row.fileName,
      fileUrl: row.fileUrl,
      fileSize: row.fileSize,
      tags: row.tags,
      createdBy: row.createdBy,
      approvedBy: row.approvedBy,
      createdAt: row.createdAt,
      approvedAt: row.approvedAt,
      updatedAt: row.updatedAt,
      creator: {
        username: row.creatorUsername,
        firstName: row.creatorFirstName,
        lastName: row.creatorLastName
      }
    }));

    res.json(standards);
  } catch (error) {
    console.error('Error fetching standards:', error);
    res.status(500).json({ error: 'Failed to fetch standards' });
  }
});

// Upload new standard
router.post('/standards/upload', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    const {
      standardType,
      standardName,
      description,
      category,
      disciplineCode,
      version,
      tags
    } = req.body;

    const file = req.file;
    const userId = req.user!.id;

    // Parse tags
    const tagsArray = tags ? tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : [];

    let fileName = null;
    let fileUrl = null;
    let fileSize = null;

    if (file) {
      // Create GCS path: Design_Management/Standards/{category}/{standardName}/
      const gcsPath = `Design_Management/Standards/${category}/${standardName.replace(/[^a-zA-Z0-9]/g, '_')}/${file.originalname}`;

      // Upload to GCS
      const uploadResult = await uploadFileWithDiagnostics(gcsPath, file.buffer, file.mimetype);
      if (uploadResult.successful) {
        fileName = file.originalname;
        fileUrl = uploadResult.url;
        fileSize = file.size;
      } else {
        throw new Error(`GCS upload failed: ${uploadResult.error?.message || 'Unknown error'}`);
      }
    }

    // Create standard record
    const [newStandard] = await db
      .insert(designStandards)
      .values({
        standardType,
        standardName,
        description,
        version,
        category,
        disciplineCode,
        status: 'Active',
        approvalStatus: 'Pending',
        fileName,
        fileUrl,
        fileSize,
        tags: tagsArray,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    res.json({
      success: true,
      standard: newStandard
    });
  } catch (error) {
    console.error('Error uploading standard:', error);
    res.status(500).json({ error: 'Failed to upload standard' });
  }
});

// Update standard approval status
router.patch('/standards/:id/approval', authenticateUser, async (req, res) => {
  try {
    const standardId = parseInt(req.params.id);
    const { approvalStatus, approvalNotes } = req.body;
    const userId = req.user!.id;

    const [updatedStandard] = await db
      .update(designStandards)
      .set({
        approvalStatus,
        approvedBy: approvalStatus === 'Approved' ? userId : null,
        approvedAt: approvalStatus === 'Approved' ? new Date() : null,
        updatedAt: new Date()
      })
      .where(eq(designStandards.id, standardId))
      .returning();

    if (!updatedStandard) {
      return res.status(404).json({ error: 'Standard not found' });
    }

    res.json({
      success: true,
      standard: updatedStandard
    });
  } catch (error) {
    console.error('Error updating standard approval:', error);
    res.status(500).json({ error: 'Failed to update standard approval' });
  }
});

// Get standard categories statistics
router.get('/standards/stats', authenticateUser, async (req, res) => {
  try {
    const stats = await db
      .select({
        category: designStandards.category,
        count: sql<number>`count(*)::int`,
        active: sql<number>`count(case when status = 'Active' then 1 end)::int`,
        pending: sql<number>`count(case when approval_status = 'Pending' then 1 end)::int`
      })
      .from(designStandards)
      .groupBy(designStandards.category);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching standards stats:', error);
    res.status(500).json({ error: 'Failed to fetch standards stats' });
  }
});

export default router;