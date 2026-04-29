import dotenv from "dotenv";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";

// Load environment variables from .env file (does NOT override existing env vars)
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/images', express.static(path.join(process.cwd(), 'client/public/images')));
app.use('/test-static', express.static(path.join(process.cwd(), 'server/public')));
app.use('/dl', express.static(path.join(process.cwd(), 'server/public')));

// Agent file downloads
app.get('/api/agent-dl/main.py', (_req, res) => {
  res.download(path.join(process.cwd(), 'local-agent/agent/main.py'), 'main.py');
});
app.get('/api/agent-dl/build-windows-agent.yml', (_req, res) => {
  res.download(path.join(process.cwd(), '.github/workflows/build-windows-agent.yml'), 'build-windows-agent.yml');
});

// NOTE: All priority endpoints have been moved to registerRoutes() where they execute AFTER setupAuth.
// This eliminates the authentication bypass vulnerability (B-02).
console.log('🔒 SECURITY: Priority endpoints now registered after auth setup in registerRoutes()');

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
  try {
  // PRIORITY: Inspection Document DELETE route MUST be before registerRoutes
  app.delete('/api/quality/inspection-documents/:inspectionOrderNumber/:tabName/:recordId/documents/:documentId', async (req: any, res: any) => {
    console.log(`🚨🚨🚨 PRIORITY DELETE ENDPOINT HIT! 🚨🚨🚨`);
    console.log(`🚨 Method: ${req.method}, Path: ${req.path}`);
    console.log(`🚨 Full URL: ${req.url}`);
    console.log(`🚨 Original URL: ${req.originalUrl}`);
    
    try {
      // Enhanced session debugging
      console.log(`🚨 Session object:`, req.session);
      console.log(`🚨 Session passport:`, req.session?.passport);
      console.log(`🚨 req.isAuthenticated():`, req.isAuthenticated?.());
      console.log(`🚨 req.user:`, req.user);
      
      // Check session authentication with multiple methods
      const userId = req.session?.passport?.user || req.user?.id;
      if (!userId && !req.isAuthenticated?.()) {
        console.log(`🚨 No session user found - all authentication methods failed`);
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      console.log(`🚨 User authenticated: User ID ${userId}`);
      
      const { inspectionOrderNumber, tabName, recordId, documentId } = req.params;
      console.log(`🗑️ PRIORITY DELETE - Inspection: ${inspectionOrderNumber}, Tab: ${tabName}, Record: ${recordId}, Document: ${documentId}`);

      // Import and use the actual deletion logic
      const { initializeGCS } = await import('./utils/gcs-operations');
      const { db } = await import('./db');
      const { eq } = await import('drizzle-orm');
      const { inspectionOrders, inspectionDocuments } = await import('../shared/schema');
      
      // Get the inspection order and project code
      const inspection = await db.query.inspectionOrders.findFirst({
        where: eq(inspectionOrders.inspectionOrderNumber, inspectionOrderNumber)
      });
      
      if (!inspection) {
        return res.status(404).json({ error: "Inspection order not found" });
      }
      
      // Get the document record
      const document = await db.query.inspectionDocuments.findFirst({
        where: eq(inspectionDocuments.id, parseInt(documentId))
      });
      
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      console.log(`🗑️ Found document: ${document.fileName} at path: ${document.filePath}`);
      
      let gcsDeleted = false;
      let gcsError = null;
      
      // Try to delete from GCS
      try {
        const { bucket } = await initializeGCS();
        if (!bucket) {
          throw new Error('GCS bucket not available');
        }
        
        const file = bucket.file(document.filePath);
        
        const [exists] = await file.exists();
        if (exists) {
          await file.delete();
          console.log(`✅ Successfully deleted GCS file: ${document.filePath}`);
          gcsDeleted = true;
        } else {
          console.log(`⚠️ GCS file not found: ${document.filePath}`);
          gcsDeleted = true; // Consider it "deleted" if it doesn't exist
        }
      } catch (error: any) {
        console.error(`❌ GCS deletion failed for ${document.fileName}:`, error.message);
        gcsError = error.message;
        // Continue with database deletion even if GCS fails
      }
      
      // Always delete from database regardless of GCS success
      try {
        await db.delete(inspectionDocuments).where(eq(inspectionDocuments.id, parseInt(documentId)));
        console.log(`✅ Successfully deleted database record for document ${documentId}`);
        
        // Provide detailed feedback about what succeeded and what failed
        if (gcsDeleted) {
          res.json({ 
            success: true, 
            message: 'Document deleted successfully',
            details: 'Both database record and GCS file removed'
          });
        } else {
          res.json({ 
            success: true, 
            message: 'Partial Success: Database record deleted, but GCS file removal failed',
            warning: `GCS deletion failed: ${gcsError}`,
            details: 'Database record removed successfully. File may remain in storage.'
          });
        }
      } catch (dbError: any) {
        console.error(`❌ Database deletion failed for document ${documentId}:`, dbError.message);
        res.status(500).json({ 
          success: false,
          error: 'Failed to delete database record',
          message: dbError.message,
          gcsStatus: gcsDeleted ? 'GCS file deleted successfully' : `GCS deletion also failed: ${gcsError}`
        });
      }
      
    } catch (error: any) {
      console.error('🚨 Priority inspection document deletion error:', error);
      res.status(500).json({ 
        error: 'Failed to delete document',
        message: error.message 
      });
    }
  });



  const { registerProjectEventSubscribers } = await import('./project-event-subscriber');
  registerProjectEventSubscribers();

  const { registerEpcKickoffSubscriber } = await import('./epc-kickoff-subscriber');
  registerEpcKickoffSubscriber();

  const { registerProjectItemPlanningSubscriber } = await import('./project-item-planning-subscriber');
  registerProjectItemPlanningSubscriber();

  const server = await registerRoutes(app);

  // Add a special middleware to ensure all API routes return JSON even for errors
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    // Force content type to JSON for all API routes
    res.setHeader('Content-Type', 'application/json');
    next();
  });

  // Global error handler — uses structured AppError framework
  const { errorHandler } = await import('./utils/error-middleware');
  app.use(errorHandler as any);



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
  const isDev = app.get("env") === "development" && !process.argv.includes("dist/index.js");
  if (isDev) {
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
  }, () => {
    log(`serving on port ${port}`);
    
    // Start the attendance midnight processor (IST midnight cron + startup catch-up)
    import('./attendance-midnight-processor').then(({ attendanceMidnightProcessor }) => {
      attendanceMidnightProcessor.startSchedulerWithCatchup()
        .then(() => console.log('✅ Attendance midnight processor started (IST midnight cron, catch-up checked)'))
        .catch((err: unknown) => console.error('❌ Attendance midnight processor catch-up error:', err));
    }).catch((err: unknown) => {
      console.error('❌ Failed to load attendance midnight processor:', err);
    });
  });
  } catch (error) {
    console.error('🚨 FATAL: Server startup failed:', error);
    process.exit(1);
  }
})();
