import dotenv from "dotenv";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/images', express.static(path.join(process.cwd(), 'client/public/images')));
app.use('/test-static', express.static(path.join(process.cwd(), 'server/public')));

// GLOBAL USER ACTIVITY TRACKING INFRASTRUCTURE 
// Define the map at the top level but middleware will be added after auth setup
let globalLiveUsers = new Map<number, {
  userId: number;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  lastSeen: Date;
}>();

// Cleanup function for stale global users
function cleanupGlobalStaleUsers() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  for (const [userId, userData] of globalLiveUsers.entries()) {
    if (userData.lastSeen < fiveMinutesAgo) {
      globalLiveUsers.delete(userId);
    }
  }
}

// Clean up stale users every minute
setInterval(cleanupGlobalStaleUsers, 60000);

// Export the global live users map for use in business intelligence routes
export { globalLiveUsers };

// Function to get global live users count for business intelligence
export const getGlobalLiveUsersCount = () => {
  // Clean up stale users first (5-minute threshold)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  for (const [userId, userData] of globalLiveUsers.entries()) {
    if (userData.lastSeen < fiveMinutesAgo) {
      globalLiveUsers.delete(userId);
    }
  }
  
  return {
    count: globalLiveUsers.size,
    users: Array.from(globalLiveUsers.values()),
    userIds: Array.from(globalLiveUsers.keys())
  };
};

// PRIORITY ENDPOINT: Must be registered before ANY other middleware to avoid Vite catch-all
app.post('/api/approve-writeoff/:id', async (req: any, res: any) => {
  try {
    console.log(`🚀 PRIORITY APPROVAL ENDPOINT HIT! ID: ${req.params.id}`);
    
    // Set JSON content type immediately
    res.setHeader('Content-Type', 'application/json');
    
    // Get user from session - simple approach
    const userId = req.session?.passport?.user || 3; // fallback to user 3 for testing
    
    const { pool } = await import('./db');
    const updateQuery = `
      UPDATE write_offs 
      SET status = 'Approved', 
          approved_by = $1, 
          approval_date = NOW(), 
          updated_at = NOW()
      WHERE id = $2 AND status = 'Pending'
      RETURNING *
    `;
    
    console.log(`📝 Executing priority approval query for write-off ${req.params.id} by user ${userId}`);
    const result = await pool.query(updateQuery, [userId, req.params.id]);
    
    if (result.rows.length === 0) {
      console.log(`❌ Write-off ${req.params.id} not found or already processed`);
      return res.status(404).json({ 
        success: false, 
        message: 'Write-off not found or already processed' 
      });
    }
    
    console.log(`✅ PRIORITY SUCCESS! Write-off ${req.params.id} approved successfully!`);
    return res.status(200).json({ 
      success: true, 
      message: 'Write-off approved successfully',
      writeOff: result.rows[0] 
    });
  } catch (error: any) {
    console.error('❌ Priority writeoff approval error:', error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to approve write-off',
      message: error.message 
    });
  }
});

// Add fixed allocation endpoint that properly updates payment amounts (PRIORITY ENDPOINT)
const fixedAllocationRouter = await import('./fix-allocation-endpoint');
app.use('/api/finance', fixedAllocationRouter.default);
console.log('🔥 PRIORITY: Fixed allocation endpoint registered at /api/finance/allocate-payment');

// PRIORITY ENDPOINT: Final Dossier routes - Must be registered before Vite catch-all
app.get('/api/quality/final-dossier/test', (req: any, res: any) => {
  console.log('🎯 PRIORITY: Final Dossier test endpoint hit!');
  res.setHeader('Content-Type', 'application/json');
  res.json({ 
    message: 'Final Dossier API routes are working correctly',
    timestamp: new Date().toISOString() 
  });
});

app.get('/api/quality/final-dossier/check/:inspectionOrderNumber', async (req: any, res: any) => {
  try {
    console.log(`🎯 PRIORITY: Checking final dossier for ${req.params.inspectionOrderNumber}`);
    res.setHeader('Content-Type', 'application/json');
    
    const { checkExistingFinalDossier } = await import('./utils/final-dossier-generator');
    const result = await checkExistingFinalDossier(req.params.inspectionOrderNumber);
    
    res.json(result);
  } catch (error: any) {
    console.error('🚨 Priority final dossier check error:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      error: 'Failed to check final dossier',
      message: error.message 
    });
  }
});

app.post('/api/quality/final-dossier/generate/:inspectionOrderId', async (req: any, res: any) => {
  try {
    const inspectionOrderId = parseInt(req.params.inspectionOrderId);
    console.log(`🎯 PRIORITY: Generating final dossier for inspection order ID: ${inspectionOrderId}`);
    res.setHeader('Content-Type', 'application/json');
    
    const { generateFinalDossier } = await import('./utils/final-dossier-generator');
    const result = await generateFinalDossier(inspectionOrderId);
    
    res.json({
      success: true,
      message: 'Final dossier generated successfully',
      url: result.url,
      path: result.path
    });
  } catch (error: any) {
    console.error('🚨 Priority final dossier generation error:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      error: 'Failed to generate final dossier',
      message: error.message 
    });
  }
});

// MIGRATION ENDPOINTS: Final Dossier path migration utilities
app.get('/api/quality/final-dossier/migration/status', async (req: any, res: any) => {
  try {
    console.log('🎯 PRIORITY: Checking Final Dossier migration status');
    res.setHeader('Content-Type', 'application/json');
    
    const { checkMigrationStatus } = await import('./utils/final-dossier-migration');
    const result = await checkMigrationStatus();
    
    res.json(result);
  } catch (error: any) {
    console.error('🚨 Migration status check error:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      error: 'Failed to check migration status',
      message: error.message 
    });
  }
});

app.post('/api/quality/final-dossier/migration/execute', async (req: any, res: any) => {
  try {
    console.log('🎯 PRIORITY: Executing Final Dossier migration');
    res.setHeader('Content-Type', 'application/json');
    
    const { migrateFinalDossierFiles } = await import('./utils/final-dossier-migration');
    const result = await migrateFinalDossierFiles();
    
    res.json({
      success: true,
      message: 'Migration completed',
      summary: result
    });
  } catch (error: any) {
    console.error('🚨 Migration execution error:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      error: 'Failed to execute migration',
      message: error.message 
    });
  }
});

console.log('🔥 PRIORITY: Final Dossier endpoints registered before Vite catch-all');

// Add missing write-offs by invoice endpoint that frontend needs
app.get('/api/finance/write-offs/invoice/:invoiceId', async (req: any, res: any) => {
  try {
    const { invoiceId } = req.params;
    const { pool } = await import('./db');
    
    const query = `
      SELECT 
        wo.id,
        wo.invoice_id as "invoiceId",
        i.invoice_number as "invoiceNumber",
        c.bp_name as "customerName",
        wo.amount,
        i.total_amount as "originalInvoiceAmount",
        wo.reason,
        wo.notes,
        wo.date_created as "dateCreated",
        wo.created_by,
        u.username as "createdByName",
        wo.status,
        wo.approved_by,
        wo.approval_date as "approvalDate",
        i.currency
      FROM write_offs wo
      LEFT JOIN invoices i ON wo.invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN users u ON wo.created_by = u.id
      WHERE wo.invoice_id = $1
      ORDER BY wo.date_created DESC
    `;
    
    const result = await pool.query(query, [parseInt(invoiceId)]);
    
    const formattedResults = result.rows.map((row: any) => ({
      id: row.id,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber || 'Unknown',
      customerName: row.customerName || 'Unknown Customer',
      amount: row.amount,
      originalInvoiceAmount: row.originalInvoiceAmount || '0',
      reason: row.reason,
      notes: row.notes,
      dateCreated: row.dateCreated,
      createdBy: {
        id: row.created_by,
        name: row.createdByName || 'Unknown'
      },
      status: row.status,
      approvedBy: row.approved_by ? {
        id: row.approved_by,
        name: 'Approver'
      } : null,
      approvalDate: row.approvalDate,
      currency: row.currency || 'USD'
    }));
    
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(formattedResults);
  } catch (error) {
    console.error('Error fetching write-offs for invoice:', error);
    res.status(500).json({ error: 'Failed to fetch write-offs for invoice' });
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // CRITICAL: Add write-off approval endpoint BEFORE any other middleware
  app.post('/api/approve-writeoff/:id', async (req: any, res: any) => {
    try {
      console.log(`🚀 CRITICAL APPROVAL ENDPOINT HIT! ID: ${req.params.id}`);
      
      // Get user from session - simple approach
      const userId = req.session?.passport?.user || 3; // fallback to user 3 for testing
      
      const { pool } = await import('./db');
      const updateQuery = `
        UPDATE write_offs 
        SET status = 'Approved', 
            approved_by = $1, 
            approval_date = NOW(), 
            updated_at = NOW()
        WHERE id = $2 AND status = 'Pending'
        RETURNING *
      `;
      
      console.log(`📝 Executing critical approval query for write-off ${req.params.id} by user ${userId}`);
      const result = await pool.query(updateQuery, [userId, req.params.id]);
      
      if (result.rows.length === 0) {
        console.log(`❌ Write-off ${req.params.id} not found or already processed`);
        return res.status(404).json({ 
          success: false, 
          message: 'Write-off not found or already processed' 
        });
      }
      
      console.log(`✅ CRITICAL SUCCESS! Write-off ${req.params.id} approved successfully!`);
      res.json({ 
        success: true, 
        message: 'Write-off approved successfully',
        writeOff: result.rows[0] 
      });
    } catch (error: any) {
      console.error('❌ Critical writeoff approval error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to approve write-off',
        message: error.message 
      });
    }
  });

  const server = await registerRoutes(app);

  // Add a special middleware to ensure all API routes return JSON even for errors
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    // Force content type to JSON for all API routes
    res.setHeader('Content-Type', 'application/json');
    next();
  });

  // Global error handler
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    // For API routes, always return JSON
    if (req.path.startsWith('/api')) {
      // Force content type to be JSON even for errors
      res.setHeader('Content-Type', 'application/json');
      res.status(status).json({ 
        error: message,
        code: err.code || 'SERVER_ERROR'
      });
    } else {
      // For non-API routes, use the default handler
      res.status(status).json({ message });
    }
    
    // Log the error but don't throw it
    console.error("Express error:", err);
  });

  // PRIORITY: Final Dossier download route MUST be before Vite middleware
  app.get('/api/quality/final-dossier/download/*', async (req: any, res: any) => {
    try {
      // Extract the file path from the remaining URL path after /download/
      const fullPath = req.path;
      const encodedFilePath = fullPath.replace('/api/quality/final-dossier/download/', '');
      // Decode URL encoding to handle spaces and special characters
      const filePath = decodeURIComponent(encodedFilePath);
      
      console.log(`🎯 PRIORITY DOWNLOAD: Final Dossier download endpoint hit!`);
      console.log(`🎯 PRIORITY DOWNLOAD: Full path: ${fullPath}`);
      console.log(`🎯 PRIORITY DOWNLOAD: Encoded file path: ${encodedFilePath}`);
      console.log(`🎯 PRIORITY DOWNLOAD: Decoded file path: ${filePath}`);
      
      const { Storage } = await import('@google-cloud/storage');
      
      // Initialize GCS with the same pattern used in the application
      let storage: Storage;
      
      if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
        console.log('🔧 Using explicit credentials from GOOGLE_CLOUD_CREDENTIALS');
        const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
        
        storage = new Storage({
          projectId: credentials.project_id,
          credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key
          }
        });
        
        console.log(`🔧 Using explicit GCS credentials with project: ${credentials.project_id}`);
      } else {
        console.log('🔧 Using default GCS authentication');
        storage = new Storage();
      }
      
      const bucketName = process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage';
      const bucket = storage.bucket(bucketName);
      
      // Ensure we use the exact file path from GCS without double encoding
      // Since GCS paths should use forward slashes and spaces should be preserved
      const file = bucket.file(filePath);
      
      console.log(`🔍 GCS File path being used: ${filePath}`);
      
      // Check if file exists first
      const [exists] = await file.exists();
      if (!exists) {
        console.error(`❌ File does not exist: ${filePath}`);
        return res.status(404).json({ 
          error: 'File not found',
          path: filePath 
        });
      }
      
      // Generate signed URL for download with v4 signing
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      });
      
      console.log(`✅ Generated signed URL for final dossier download: ${filePath}`);
      res.redirect(signedUrl);
    } catch (error: any) {
      console.error('🚨 Priority final dossier download error:', error);
      res.status(500).json({ 
        error: 'Failed to download final dossier',
        message: error.message 
      });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Start the attendance midnight processor
    try {
      import('./attendance-midnight-processor').then(({ attendanceMidnightProcessor }) => {
        attendanceMidnightProcessor.startScheduler();
        console.log('✅ Attendance midnight processor started successfully');
      });
    } catch (error) {
      console.error('❌ Failed to start attendance midnight processor:', error);
    }
  });
})();
