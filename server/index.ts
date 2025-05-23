import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/images', express.static(path.join(process.cwd(), 'client/public/images')));
app.use('/test-static', express.static(path.join(process.cwd(), 'server/public')));

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
      UPDATE finance_write_offs 
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
        UPDATE finance_write_offs 
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
  });
})();
