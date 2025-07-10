import express, { Request, Response } from 'express';
import { db } from './db';
import { visaRecords, visaAlerts, visaQuotaSettings, users } from '@shared/schema';
import { eq, desc, and, gte, lte, like, sql, count } from 'drizzle-orm';
import { insertVisaRecordSchema } from '@shared/schema';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import { ensureAuthenticated } from './auth-middleware';

const router = express.Router();

// Configure Google Cloud Storage
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'thermopac-communication-system',
  credentials: process.env.GOOGLE_CLOUD_CREDENTIALS ? JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS) : undefined,
});

const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and image files are allowed.'));
    }
  },
});

/**
 * Get visa dashboard statistics
 */
export const getVisaDashboard = async (req: Request, res: Response) => {
  try {
    const { country, visaType, department, status } = req.query;
    
    // Build where conditions
    let whereConditions: any[] = [];
    
    if (country) {
      whereConditions.push(eq(visaRecords.country, country as string));
    }
    
    if (visaType) {
      whereConditions.push(eq(visaRecords.visaType, visaType as string));
    }
    
    if (status) {
      whereConditions.push(eq(visaRecords.status, status as string));
    }

    // Get total counts by status
    const statusCounts = await db
      .select({
        status: visaRecords.status,
        count: count()
      })
      .from(visaRecords)
      .leftJoin(users, eq(visaRecords.employeeId, users.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .groupBy(visaRecords.status);

    // Get expiring visas (within 60 days)
    const expiringVisas = await db
      .select({
        id: visaRecords.id,
        employeeName: users.username,
        country: visaRecords.country,
        visaType: visaRecords.visaType,
        expiryDate: visaRecords.expiryDate,
        status: visaRecords.status,
        daysToExpiry: sql<number>`(${visaRecords.expiryDate}::date - CURRENT_DATE)`
      })
      .from(visaRecords)
      .leftJoin(users, eq(visaRecords.employeeId, users.id))
      .where(
        and(
          lte(visaRecords.expiryDate, sql`CURRENT_DATE + INTERVAL '60 days'`),
          gte(visaRecords.expiryDate, sql`CURRENT_DATE`),
          eq(visaRecords.status, 'Active')
        )
      )
      .orderBy(visaRecords.expiryDate);

    // Get quota utilization
    const quotaStats = await db
      .select()
      .from(visaQuotaSettings)
      .where(country ? eq(visaQuotaSettings.country, country as string) : undefined);

    res.json({
      statusCounts,
      expiringVisas,
      quotaStats,
      totalActive: statusCounts.find(s => s.status === 'Active')?.count || 0,
      totalExpiringSoon: statusCounts.find(s => s.status === 'Expiring Soon')?.count || 0,
      totalExpired: statusCounts.find(s => s.status === 'Expired')?.count || 0
    });
  } catch (error) {
    console.error('Error fetching visa dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch visa dashboard data' });
  }
};

/**
 * Get all visa records with filtering
 */
export const getVisaRecords = async (req: Request, res: Response) => {
  try {
    const { country, visaType, department, status, employeeId } = req.query;
    
    let whereConditions: any[] = [];
    
    if (country) {
      whereConditions.push(eq(visaRecords.country, country as string));
    }
    
    if (visaType) {
      whereConditions.push(eq(visaRecords.visaType, visaType as string));
    }
    
    if (status) {
      whereConditions.push(eq(visaRecords.status, status as string));
    }
    
    if (employeeId) {
      whereConditions.push(eq(visaRecords.employeeId, parseInt(employeeId as string)));
    }

    const creator = users.as('creator');
    const records = await db
      .select({
        id: visaRecords.id,
        employeeId: visaRecords.employeeId,
        employeeName: users.username,
        employeeDepartment: users.department,
        visaType: visaRecords.visaType,
        country: visaRecords.country,
        visaNumber: visaRecords.visaNumber,
        issueDate: visaRecords.issueDate,
        expiryDate: visaRecords.expiryDate,
        status: visaRecords.status,
        quotaReference: visaRecords.quotaReference,
        fileUrl: visaRecords.fileUrl,
        notes: visaRecords.notes,
        createdAt: visaRecords.createdAt,
        createdByName: creator.username,
        daysToExpiry: sql<number>`(${visaRecords.expiryDate}::date - CURRENT_DATE)`
      })
      .from(visaRecords)
      .leftJoin(users, eq(visaRecords.employeeId, users.id))
      .leftJoin(creator, eq(visaRecords.createdBy, creator.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(visaRecords.createdAt));

    res.json(records);
  } catch (error) {
    console.error('Error fetching visa records:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ error: 'Failed to fetch visa records' });
  }
};

/**
 * Get single visa record by ID
 */
export const getVisaRecord = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const record = await db
      .select({
        id: visaRecords.id,
        employeeId: visaRecords.employeeId,
        employeeName: users.username,
        visaType: visaRecords.visaType,
        country: visaRecords.country,
        visaNumber: visaRecords.visaNumber,
        issueDate: visaRecords.issueDate,
        expiryDate: visaRecords.expiryDate,
        status: visaRecords.status,
        quotaReference: visaRecords.quotaReference,
        filePath: visaRecords.filePath,
        fileUrl: visaRecords.fileUrl,
        notes: visaRecords.notes,
        createdAt: visaRecords.createdAt,
        updatedAt: visaRecords.updatedAt
      })
      .from(visaRecords)
      .leftJoin(users, eq(visaRecords.employeeId, users.id))
      .where(eq(visaRecords.id, parseInt(id)))
      .limit(1);

    if (record.length === 0) {
      return res.status(404).json({ error: 'Visa record not found' });
    }

    res.json(record[0]);
  } catch (error) {
    console.error('Error fetching visa record:', error);
    res.status(500).json({ error: 'Failed to fetch visa record' });
  }
};

/**
 * Create new visa record
 */
export const createVisaRecord = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    console.log('Create visa record - User ID:', userId);
    console.log('Create visa record - Request body:', req.body);
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validatedData = insertVisaRecordSchema.parse(req.body);

    console.log('Create visa record - Validated data:', validatedData);

    const [newRecord] = await db
      .insert(visaRecords)
      .values({
        ...validatedData,
        createdBy: userId
      })
      .returning();

    console.log('Create visa record - New record created:', newRecord);

    // Update quota usage
    await updateQuotaUsage(validatedData.country, 1);

    res.status(201).json(newRecord);
  } catch (error) {
    console.error('Error creating visa record:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ error: 'Failed to create visa record' });
  }
};

/**
 * Upload visa document
 */
export const uploadVisaDocument = [
  upload.single('document'),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { visaRecordId } = req.body;
      if (!visaRecordId) {
        return res.status(400).json({ error: 'Visa record ID is required' });
      }

      // Generate unique filename
      const timestamp = Date.now();
      const ext = path.extname(req.file.originalname);
      const filename = `visa-documents/${visaRecordId}/${timestamp}${ext}`;

      // Upload to Google Cloud Storage
      const file = bucket.file(filename);
      const stream = file.createWriteStream({
        metadata: {
          contentType: req.file.mimetype,
        },
      });

      stream.on('error', (error) => {
        console.error('Error uploading to GCS:', error);
        res.status(500).json({ error: 'Failed to upload file' });
      });

      stream.on('finish', async () => {
        try {
          // Make file publicly accessible
          await file.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

          // Update visa record with file information
          await db
            .update(visaRecords)
            .set({
              filePath: filename,
              fileUrl: publicUrl,
              updatedAt: new Date()
            })
            .where(eq(visaRecords.id, parseInt(visaRecordId)));

          res.json({
            filePath: filename,
            fileUrl: publicUrl,
            message: 'File uploaded successfully'
          });
        } catch (error) {
          console.error('Error updating visa record with file info:', error);
          res.status(500).json({ error: 'Failed to update visa record' });
        }
      });

      stream.end(req.file.buffer);
    } catch (error) {
      console.error('Error in upload handler:', error);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  }
];

/**
 * Update visa record
 */
export const updateVisaRecord = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get current record for quota calculation
    const currentRecord = await db
      .select()
      .from(visaRecords)
      .where(eq(visaRecords.id, parseInt(id)))
      .limit(1);

    if (currentRecord.length === 0) {
      return res.status(404).json({ error: 'Visa record not found' });
    }

    const validatedData = insertVisaRecordSchema.parse(req.body);
    
    const [updatedRecord] = await db
      .update(visaRecords)
      .set({
        ...validatedData,
        updatedAt: new Date()
      })
      .where(eq(visaRecords.id, parseInt(id)))
      .returning();

    // Update quota if country changed
    if (currentRecord[0].country !== validatedData.country) {
      await updateQuotaUsage(currentRecord[0].country, -1); // Decrease old country
      await updateQuotaUsage(validatedData.country, 1); // Increase new country
    }

    res.json(updatedRecord);
  } catch (error) {
    console.error('Error updating visa record:', error);
    res.status(500).json({ error: 'Failed to update visa record' });
  }
};

/**
 * Delete visa record
 */
export const deleteVisaRecord = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get record before deletion for quota calculation
    const record = await db
      .select()
      .from(visaRecords)
      .where(eq(visaRecords.id, parseInt(id)))
      .limit(1);

    if (record.length === 0) {
      return res.status(404).json({ error: 'Visa record not found' });
    }

    await db
      .delete(visaRecords)
      .where(eq(visaRecords.id, parseInt(id)));

    // Update quota usage
    await updateQuotaUsage(record[0].country, -1);

    res.json({ message: 'Visa record deleted successfully' });
  } catch (error) {
    console.error('Error deleting visa record:', error);
    res.status(500).json({ error: 'Failed to delete visa record' });
  }
};

/**
 * Get employees for dropdown
 */
export const getEmployeesForVisas = async (req: Request, res: Response) => {
  try {
    const employees = await db
      .select({
        id: users.id,
        username: users.username,
        department: users.department,
        email: users.email,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        employeeCode: users.employeeCode
      })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(users.role, users.username);

    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
};

/**
 * Get countries and visa types
 */
export const getVisaOptions = async (req: Request, res: Response) => {
  try {
    const quotaData = await db
      .select({
        country: visaQuotaSettings.country,
        visaType: visaQuotaSettings.visaType,
        totalQuota: visaQuotaSettings.totalQuota,
        usedQuota: visaQuotaSettings.usedQuota
      })
      .from(visaQuotaSettings)
      .orderBy(visaQuotaSettings.country);

    const uniqueVisaTypes = [...new Set(quotaData.map(c => c.visaType))];

    // List of Schengen countries to exclude from individual selection
    const schengenCountries = [
      "Austria", "Belgium", "Croatia", "Czech Republic", "Denmark", "Estonia",
      "Finland", "France", "Germany", "Greece", "Hungary", "Iceland", "Italy",
      "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Netherlands",
      "Norway", "Poland", "Portugal", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland"
    ];

    // Comprehensive list of all countries (excluding individual Schengen countries)
    const allWorldCountries = [
      "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", 
      "Armenia", "Australia", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", 
      "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", 
      "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde", 
      "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", 
      "Costa Rica", "Côte d'Ivoire", "Cuba", "Cyprus", "Dominican Republic", "Ecuador", "Egypt", 
      "El Salvador", "Equatorial Guinea", "Eritrea", "Ethiopia", "Fiji", "Gabon", "Gambia", "Georgia", 
      "Ghana", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", 
      "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Jamaica", "Japan", "Jordan", 
      "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Lebanon", "Lesotho", 
      "Liberia", "Libya", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Marshall Islands", 
      "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", 
      "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "New Zealand", "Nicaragua", 
      "Niger", "Nigeria", "North Korea", "North Macedonia", "Oman", "Pakistan", "Palau", "Panama", 
      "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Qatar", "Romania", "Russia", "Rwanda", 
      "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", 
      "São Tomé and Príncipe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", 
      "Singapore", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Sri Lanka", 
      "Sudan", "Suriname", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", 
      "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", 
      "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", 
      "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
    ];

    // Filter out Schengen countries and add "Schengen Area (EU)" as grouped entry
    const filteredCountries = allWorldCountries.filter(country => 
      !schengenCountries.includes(country)
    );
    
    const allCountries = ["Schengen Area (EU)", ...filteredCountries].sort();

    res.json({
      countries: allCountries,
      visaTypes: uniqueVisaTypes,
      quotaSettings: quotaData
    });
  } catch (error) {
    console.error('Error fetching visa options:', error);
    res.status(500).json({ error: 'Failed to fetch visa options' });
  }
};

/**
 * Get pending alerts
 */
export const getPendingAlerts = async (req: Request, res: Response) => {
  try {
    const alerts = await db
      .select({
        id: visaAlerts.id,
        visaRecordId: visaAlerts.visaRecordId,
        alertType: visaAlerts.alertType,
        alertDate: visaAlerts.alertDate,
        employeeName: users.username,
        country: visaRecords.country,
        visaType: visaRecords.visaType,
        expiryDate: visaRecords.expiryDate,
        visaNumber: visaRecords.visaNumber
      })
      .from(visaAlerts)
      .leftJoin(visaRecords, eq(visaAlerts.visaRecordId, visaRecords.id))
      .leftJoin(users, eq(visaRecords.employeeId, users.id))
      .where(
        and(
          eq(visaAlerts.isSent, false),
          lte(visaAlerts.alertDate, sql`CURRENT_DATE`)
        )
      )
      .orderBy(visaAlerts.alertDate);

    res.json(alerts);
  } catch (error) {
    console.error('Error fetching pending alerts:', error);
    res.status(500).json({ error: 'Failed to fetch pending alerts' });
  }
};

/**
 * Helper function to update quota usage
 */
async function updateQuotaUsage(country: string, change: number) {
  try {
    await db
      .update(visaQuotaSettings)
      .set({
        usedQuota: sql`${visaQuotaSettings.usedQuota} + ${change}`,
        updatedAt: new Date()
      })
      .where(eq(visaQuotaSettings.country, country));
  } catch (error) {
    console.error('Error updating quota usage:', error);
  }
}

// Set up router routes with authentication
router.get('/dashboard', ensureAuthenticated, getVisaDashboard);
router.get('/records', ensureAuthenticated, getVisaRecords);
router.get('/records/:id', ensureAuthenticated, getVisaRecord);
router.post('/records', ensureAuthenticated, createVisaRecord);
router.post('/upload', ensureAuthenticated, uploadVisaDocument);
router.put('/records/:id', ensureAuthenticated, updateVisaRecord);
router.delete('/records/:id', ensureAuthenticated, deleteVisaRecord);
router.get('/employees', ensureAuthenticated, getEmployeesForVisas);
router.get('/options', ensureAuthenticated, getVisaOptions);
router.get('/alerts', ensureAuthenticated, getPendingAlerts);

export default router;