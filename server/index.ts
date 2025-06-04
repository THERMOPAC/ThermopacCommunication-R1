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
