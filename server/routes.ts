import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { ensureAuthenticated } from "./auth-middleware";
import { storage } from "./storage";
import { insertTaskSchema, insertUserSchema, insertRecurringPatternSchema, insertRecurringTaskSchema } from "@shared/schema";
import { canManage, roleHierarchy } from "@shared/roles";
import { scrypt, timingSafeEqual, randomBytes } from "crypto";
import { promisify } from "util";
import { eq, sql } from "drizzle-orm";
import { getUserModulePermissions } from "./utils/permission-utils";
import { setupGmailRoutes } from "./gmail-routes";
import { setupGoogleAuth } from "./google-auth";
import { setupInternalMessagesRoutes } from "./internal-messages-routes";
import { setupProjectRoutes } from "./project-routes";
import { setupCustomerImportRoutes } from "./customer-import";
import { setupProjectItemsImportRoutes } from "./project-items-import";
import { setupMasterItemsImportRoutes } from "./master-items-import";
import { setupFileStorageRoutes } from "./file-storage-routes";
import { setupItemComponentsImportRoutes } from "./item-components-import";
import { setupProductionRoutes } from "./production-routes";
import { setupProcurementRoutes } from "./procurement-routes";
import { setupQualityRoutes } from "./quality-routes";
import { setupDispatchRoutes } from "./dispatch-routes";
import { setupEngineeringChangeRoutes } from "./engineering-change-routes";
import { default as afterSalesRoutes } from "./after-sales-routes";
import { default as modulePermissionRoutes } from "./module-permission-routes";
import { default as standaloneRoutes } from "./standalone-routes";
import { default as advanceTaxRoutes } from "./advance-tax-routes";
import { hashPassword as updatePasswordHash } from "./update-password";
import { setupTestWelderRoute } from "./quality/test-welder-route";
import { setupApiTestRoutes } from "./api-test-route";
import { setupDedicatedTestRoutes } from "./dedicated-test-route";
import { setupSalesMarketingRoutes } from "./sales-marketing-routes";
import { saveRoiStep, loadRoiProject, getRoiProjectProgress, deleteRoiProject } from "./roi-routes";
// Temporarily disable main finance routes due to syntax errors
// import { default as financeRoutes } from "./finance-routes";
import { default as financeRoutes } from "./finance-routes-fixed";
import paymentReferenceRoutes from "./test-route/payment-reference";
import { default as simpleFinanceRoutes } from "./simple-finance-routes";
import { default as directInvoiceRoutes } from "./direct-invoice-routes";
import { financeReportRouter } from "./finance-report-routes";
import { paymentAllocationApi } from "./payment-allocation-api";
import { simplePaymentAllocationApi } from "./simple-payment-allocation-api";
import { newAllocationApi } from "./new-allocation-api";
import { simplifiedAllocationApi } from "./simplified-allocation-api";
import { ultraSimpleAllocationApi } from "./ultra-simple-allocation";
import { default as simplePaymentRoutes } from "./simple-payment-routes";
import { default as financeWriteOffsRouter } from "./finance-write-offs";
import { setupDebugWorkOrderRoutes } from "./debug-work-orders";
import { default as adminRoutes } from "./admin-routes";
import { default as cleanPaymentRoutes } from "./clean-payment-routes";
import { default as basicAllocationApi } from "./basic-allocation-api";
import { default as workLocationRoutes } from "./work-location-routes";
import { default as attendanceRoutes } from "./attendance-routes";
import { default as dwarRoutes } from "./dwar-routes";
import { default as payrollRoutes } from "./payroll-routes-simple";
import { default as salaryCalculationRoutes } from "./salary-calculation-routes";
import { setupDedicatedPaymentCreation } from "./dedicated-payment-creation";
import { setupCleanPaymentCreation } from "./clean-payment-creation";
import { setupDebugWorkOrderRoutes } from "./debug-work-orders";
import { default as simpleAllocationEndpoint } from "./simple-allocation-endpoint";
import { cleanPaymentUpdateRouter } from "./clean-payment-update";
import { registerFileUploadTestRoutes } from "./test/file-upload-test";
import calibrationTestRoutes from "./testapi/calibration-test-routes";
import { registerTemplateManagementRoutes } from "./template-management/register-routes";
import { registerCalibrationTestRoutes } from "./calibration-test-routes";
import { db } from "./db";
import { masterItems as masterItemsTable, projectItems as projectItemsTable } from "@shared/schema";
import { checkGcsPermissions } from "./utils/gcs-permissions-check";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Register finance report routes
  app.use('/api/finance-reports', financeReportRouter);
  setupAuth(app);
  
  // Set up Gmail integration routes
  setupGmailRoutes(app);
  
  // Set up Google OAuth authentication
  setupGoogleAuth(app);
  
  // Set up internal messages routes
  setupInternalMessagesRoutes(app);
  
  // Set up project management routes
  setupProjectRoutes(app);
  
  // Set up customer import routes
  setupCustomerImportRoutes(app);
  
  // Set up project items import routes
  setupProjectItemsImportRoutes(app);
  
  // Set up master items import routes
  setupMasterItemsImportRoutes(app);
  
  // Set up file storage routes
  setupFileStorageRoutes(app);
  
  // Set up item components import routes
  setupItemComponentsImportRoutes(app);
  
  // Set up production management routes
  setupProductionRoutes(app);
  
  // Set up sales and marketing routes
  setupSalesMarketingRoutes(app);

  // Register ROI Calculator routes  
  app.post('/api/roi/save-step', async (req: any, res: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    return saveRoiStep(req, res);
  });
  app.get('/api/roi/load-project/:roiProjectId', async (req: any, res: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    return loadRoiProject(req, res);
  });
  app.get('/api/roi/project-progress/:id', async (req: any, res: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    return getRoiProjectProgress(req, res);
  });
  app.get('/api/roi/list-projects', async (req: any, res: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    try {
      const userId = req.user.id;
      console.log('Getting ROI projects for user:', userId);
      
      // Use raw SQL for now to avoid import issues
      const projects = await db.execute(sql`
        SELECT roi_project_id, step_number, step_data, updated_at
        FROM roi_project_steps 
        WHERE updated_by = ${userId}
        ORDER BY updated_at DESC
      `);

      console.log('Found', projects.rows.length, 'project steps');

      // Group by project ID and get project details
      const projectMap = new Map();
      
      projects.rows.forEach((project: any) => {
        const projectId = project.roi_project_id;
        
        if (!projectMap.has(projectId)) {
          projectMap.set(projectId, {
            roiProjectId: projectId,
            steps: {},
            lastUpdated: project.updated_at,
            completedSteps: 0,
            customerName: '',
            projectName: '',
            capacity: ''
          });
        }
        
        const projectData = projectMap.get(projectId);
        projectData.steps[project.step_number] = project.step_data;
        projectData.completedSteps = Math.max(projectData.completedSteps, project.step_number);
        
        // Extract project details from step 1 data
        if (project.step_number === 1 && project.step_data) {
          const stepData = project.step_data as any;
          projectData.customerName = stepData.customerName || '';
          projectData.projectName = stepData.projectName || '';
          projectData.capacity = stepData.capacity || '';
        }
      });

      // Convert to array and sort by last updated
      const projectList = Array.from(projectMap.values())
        .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());

      console.log('Returning', projectList.length, 'unique projects');
      res.json({
        success: true,
        projects: projectList
      });
    } catch (error) {
      console.error('Error fetching ROI projects:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch ROI projects'
      });
    }
  });
  // ROI delete route
  app.delete('/api/roi/delete-project/:roiProjectId', async (req: any, res: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    return deleteRoiProject(req, res);
  });
  
  console.log('ROI Calculator routes registered');

  // Register plant costs routes directly here
  const { db } = await import('./db');
  const { plantCosts } = await import('@shared/schema');
  const { eq } = await import('drizzle-orm');
  const { ensureAuthenticated } = await import('./auth-middleware');

  // GET all plant costs
  app.get('/api/plant-costs', ensureAuthenticated, async (req: any, res: any) => {
    try {
      console.log('Direct plant costs GET route hit');
      const costs = await db
        .select()
        .from(plantCosts)
        .where(eq(plantCosts.isActive, true))
        .orderBy(plantCosts.capacity);
      
      console.log('Found plant costs:', costs.length);
      res.json(costs);
    } catch (error) {
      console.error('Error in direct plant costs GET route:', error);
      res.status(500).json({ error: 'Failed to fetch plant costs' });
    }
  });

  // PUT update plant cost
  app.put('/api/plant-costs/:id', ensureAuthenticated, async (req: any, res: any) => {
    try {
      console.log('Direct plant costs PUT route hit for ID:', req.params.id);
      const { capacity, priceUSD } = req.body;
      const userId = req.user?.id || 3;
      
      const [updatedCost] = await db
        .update(plantCosts)
        .set({ 
          capacity: parseInt(capacity), 
          priceUSD: parseFloat(priceUSD).toString(),
          updatedBy: userId,
          updatedAt: new Date()
        })
        .where(eq(plantCosts.id, parseInt(req.params.id)))
        .returning();
      
      console.log('Updated plant cost:', updatedCost);
      res.json(updatedCost);
    } catch (error) {
      console.error('Error in direct plant costs PUT route:', error);
      res.status(500).json({ error: 'Failed to update plant cost' });
    }
  });

  // POST create plant cost
  app.post('/api/plant-costs', ensureAuthenticated, async (req: any, res: any) => {
    try {
      console.log('Direct plant costs POST route hit');
      const { capacity, priceUSD } = req.body;
      const userId = req.user?.id || 3;
      
      const [newCost] = await db
        .insert(plantCosts)
        .values({
          capacity: parseInt(capacity),
          priceUSD: parseFloat(priceUSD).toString(),
          isActive: true,
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      console.log('Created plant cost:', newCost);
      res.json(newCost);
    } catch (error) {
      console.error('Error in direct plant costs POST route:', error);
      res.status(500).json({ error: 'Failed to create plant cost' });
    }
  });

  // DELETE plant cost
  app.delete('/api/plant-costs/:id', ensureAuthenticated, async (req: any, res: any) => {
    try {
      console.log('Direct plant costs DELETE route hit for ID:', req.params.id);
      
      const [deletedCost] = await db
        .update(plantCosts)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(plantCosts.id, parseInt(req.params.id)))
        .returning();
      
      console.log('Deleted plant cost:', deletedCost);
      res.json({ success: true, message: 'Plant cost deleted successfully' });
    } catch (error) {
      console.error('Error in direct plant costs DELETE route:', error);
      res.status(500).json({ error: 'Failed to delete plant cost' });
    }
  });
  console.log('Plant costs routes registered directly');
  
  // Set up procurement management routes
  setupProcurementRoutes(app);
  
  // Set up quality management routes
  setupQualityRoutes(app);
  
  // Set up test welder route (for debugging)
  setupTestWelderRoute(app);
  
  // Set up API test routes for troubleshooting
  setupApiTestRoutes(app);
  
  // Set up dedicated test routes that bypass React app
  // These should be registered BEFORE app.use("*", ...) in setupVite
  setupDedicatedTestRoutes(app);
  
  // Set up file upload test routes for GCS diagnostics
  registerFileUploadTestRoutes(app);
  
  // Set up calibration test routes
  registerCalibrationTestRoutes(app);
  
  // Set up dispatch and shipping routes
  setupDispatchRoutes(app);
  
  // Set up engineering change routes
  setupEngineeringChangeRoutes(app);
  
  // Set up after-sales module routes
  app.use('/api/after-sales', afterSalesRoutes);
  
  // Set up advance tax calculation routes
  app.use(advanceTaxRoutes);
  
  // Set up work location management routes
  app.use('/api', workLocationRoutes);
  console.log('Work location routes registered at /api/work-locations');
  
  // Set up attendance management routes
  app.use('/api/attendance', attendanceRoutes);
  console.log('Attendance routes registered at /api/attendance');
  
  // Set up DWAR (Daily Work Activity Report) routes
  app.use('/api/dwar', dwarRoutes);
  console.log('DWAR routes registered at /api/dwar');
  
  // Set up Payroll Management routes
  app.use('/api/payroll', payrollRoutes);
  console.log('Payroll routes registered at /api/payroll');
  
  // Set up Salary Calculation Engine routes
  app.use('/api/salary-calculation', salaryCalculationRoutes);
  console.log('Salary calculation routes registered at /api/salary-calculation');

  // DIRECT WRITE-OFF APPROVAL ENDPOINT - COMPLETELY SEPARATE FROM FINANCE ROUTES
  app.post('/api/approve-writeoff/:id', async (req: any, res: any) => {
    try {
      console.log(`🚀 DIRECT WRITEOFF APPROVAL ENDPOINT HIT! ID: ${req.params.id}`);
      
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
      
      console.log(`📝 Executing direct approval query for write-off ${req.params.id} by user ${userId}`);
      const result = await pool.query(updateQuery, [userId, req.params.id]);
      
      if (result.rows.length === 0) {
        console.log(`❌ Write-off ${req.params.id} not found or already processed`);
        return res.status(404).json({ 
          success: false, 
          message: 'Write-off not found or already processed' 
        });
      }
      
      console.log(`✅ Write-off ${req.params.id} approved successfully!`);
      res.json({ 
        success: true, 
        message: 'Write-off approved successfully',
        writeOff: result.rows[0] 
      });
    } catch (error: any) {
      console.error('❌ Direct writeoff approval error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to approve write-off',
        message: error.message 
      });
    }
  });
  
  // Debug middleware to log all incoming requests
  app.use('/api/finance/write-offs', (req: any, res: any, next: any) => {
    console.log(`🔍 Request intercepted: ${req.method} ${req.originalUrl}`);
    console.log(`🔍 Route path: ${req.route?.path || 'no route'}`);
    console.log(`🔍 Headers: ${JSON.stringify(req.headers, null, 2)}`);
    next();
  });

  // Set up direct approval endpoints to bypass routing conflicts
  app.post('/api/finance/write-offs/:id/approve', ensureAuthenticated, async (req: any, res: any) => {
    try {
      console.log(`🚀 DIRECT APPROVAL ENDPOINT HIT!`);
      const { id } = req.params;
      const approverId = req.user?.id;
      
      console.log(`Direct approval: write-off ${id} by user ${approverId}`);
      
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
      
      const result = await pool.query(updateQuery, [approverId, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Write-off not found or already processed' 
        });
      }
      
      console.log(`Direct approval: write-off ${id} approved successfully`);
      res.json({ 
        success: true, 
        message: 'Write-off approved successfully',
        writeOff: result.rows[0] 
      });
    } catch (error: any) {
      console.error('Direct approval error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to approve write-off',
        message: error.message 
      });
    }
  });


  
  // Add dedicated marketing dashboard finance endpoint with date filtering
  app.get('/api/finance/dashboard', ensureAuthenticated, async (req: any, res: any) => {
    try {
      const { from, to } = req.query;
      console.log('🎯 MARKETING DASHBOARD Finance API with dates:', { from, to });
      
      const { pool } = await import('./db');
      
      // Apply date filtering if both dates are provided
      let dateFilter = '';
      let queryParams: any[] = [];
      
      if (from && to) {
        dateFilter = 'WHERE issue_date >= $1 AND issue_date <= $2';
        queryParams = [from, to];
        console.log('✅ APPLYING DATE FILTER:', dateFilter, 'params:', queryParams);
      } else {
        console.log('❌ NO DATE FILTERING - fetching all invoices');
      }
      
      // Get invoices with date filtering and direct INR amounts from invoice items
      const invoicesQuery = `
        SELECT 
          COUNT(*) as "totalCount",
          COALESCE(SUM(total_amount), 0) as "totalAmount",
          COUNT(CASE WHEN status = 'Paid' THEN 1 END) as "paidCount",
          COALESCE(SUM(CASE WHEN status = 'Paid' THEN total_amount ELSE 0 END), 0) as "paidAmount",
          COUNT(CASE WHEN status != 'Paid' THEN 1 END) as "unpaidCount",
          COALESCE(SUM(CASE WHEN status != 'Paid' THEN total_amount ELSE 0 END), 0) as "unpaidAmount",
          COALESCE(SUM(CASE WHEN status != 'Paid' THEN outstanding_amount ELSE 0 END), 0) as "outstandingAmount",
          COUNT(CASE WHEN due_date < CURRENT_DATE AND status != 'Paid' THEN 1 END) as "overdueCount",
          COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND status != 'Paid' THEN outstanding_amount ELSE 0 END), 0) as "overdueAmount",
          COALESCE(SUM(
            (SELECT SUM(amount_lc) FROM invoice_items WHERE invoice_items.invoice_id = invoices.id)
          ), 0) as "totalAmountINR",
          COALESCE(SUM(
            CASE WHEN status = 'Paid' THEN 
              (SELECT SUM(amount_lc) FROM invoice_items WHERE invoice_items.invoice_id = invoices.id)
            ELSE 0 END
          ), 0) as "paidAmountINR"
        FROM invoices 
        ${dateFilter}
      `;
      
      console.log('🔍 EXECUTING QUERY:', invoicesQuery.replace(/\s+/g, ' ').trim());
      const invoicesResult = await pool.query(invoicesQuery, queryParams);
      const stats = invoicesResult.rows[0];
      
      console.log('📊 QUERY RESULT:', stats);
      
      // Get recent invoices with same filter
      const recentQuery = `
        SELECT id, invoice_number as "invoiceNumber", 
               (SELECT bp_name FROM customers WHERE id = invoices.customer_id) as "clientName",
               issue_date as "issueDate", due_date as "dueDate", 
               total_amount as amount, status
        FROM invoices 
        ${dateFilter}
        ORDER BY issue_date DESC 
        LIMIT 5
      `;
      
      const recentResult = await pool.query(recentQuery, queryParams);
      
      // Get payments data
      const paymentsQuery = `
        SELECT 
          COUNT(*) as "totalCount",
          COALESCE(SUM(amount), 0) as "totalAmount"
        FROM payments
      `;
      
      const paymentsResult = await pool.query(paymentsQuery);
      const paymentStats = paymentsResult.rows[0];
      
      const latestPaymentsQuery = `
        SELECT id, sap_payment_no as "referenceNumber", customer_id as "customerId",
               payment_date as "paymentDate", amount, payment_method as "paymentMethod",
               currency, 'Partially Allocated' as "allocationStatus"
        FROM payments 
        ORDER BY payment_date DESC 
        LIMIT 5
      `;
      
      const latestPaymentsResult = await pool.query(latestPaymentsQuery);
      
      const response = {
        totalInvoices: {
          count: Number(stats.totalCount) || 0,
          amount: stats.totalAmount || '0.00',
          amountINR: stats.totalAmountINR || '0.00'
        },
        paidInvoices: {
          count: Number(stats.paidCount) || 0,
          amount: stats.paidAmount || '0',
          amountINR: stats.paidAmountINR || '0.00'
        },
        unpaidInvoices: {
          count: Number(stats.unpaidCount) || 0,
          amount: stats.unpaidAmount || '0.00'
        },
        overdueInvoices: {
          count: Number(stats.overdueCount) || 0,
          amount: stats.overdueAmount || '0'
        },
        totalOutstanding: {
          count: Number(stats.unpaidCount) || 0,
          amount: stats.outstandingAmount || '0'
        },
        totalOverdue: {
          count: Number(stats.overdueCount) || 0,
          amount: stats.overdueAmount || '0'
        },
        totalPayments: {
          count: Number(paymentStats.totalCount) || 0,
          amount: paymentStats.totalAmount || '0'
        },
        recentInvoices: recentResult.rows || [],
        latestPayments: latestPaymentsResult.rows || []
      };
      
      console.log('📤 SENDING RESPONSE:', JSON.stringify(response, null, 2));
      res.json(response);
      
    } catch (error: any) {
      console.error('❌ ERROR in marketing dashboard finance endpoint:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });
  
  // ==================== EXCHANGE RATE MANAGEMENT API ====================
  
  // Get current exchange rate
  app.get('/api/exchange-rate', ensureAuthenticated, async (req: any, res: any) => {
    try {
      const { db } = await import('./db');
      const { exchangeRateSettings } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      const [setting] = await db
        .select()
        .from(exchangeRateSettings)
        .where(eq(exchangeRateSettings.isActive, true))
        .orderBy(exchangeRateSettings.updatedAt)
        .limit(1);

      if (!setting) {
        // Return default fallback rate
        return res.json({
          exchangeRate: 83.5,
          source: 'fallback',
          lastUpdated: null
        });
      }

      res.json({
        exchangeRate: parseFloat(setting.exchangeRate),
        source: setting.source,
        lastUpdated: setting.apiLastUpdated || setting.updatedAt,
        fromCurrency: setting.fromCurrency,
        toCurrency: setting.toCurrency
      });
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      res.status(500).json({ error: 'Failed to fetch exchange rate' });
    }
  });

  // Update exchange rate manually
  app.post('/api/exchange-rate', ensureAuthenticated, async (req: any, res: any) => {
    try {
      const { exchangeRate } = req.body;
      const userId = req.user?.id;

      if (!exchangeRate || exchangeRate <= 0) {
        return res.status(400).json({ error: 'Valid exchange rate is required' });
      }

      const { db } = await import('./db');
      const { exchangeRateSettings } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      // Update or insert the exchange rate
      const [updated] = await db
        .update(exchangeRateSettings)
        .set({
          exchangeRate: exchangeRate.toString(),
          source: 'manual',
          updatedBy: userId,
          updatedAt: new Date()
        })
        .where(eq(exchangeRateSettings.isActive, true))
        .returning();

      if (!updated) {
        // Insert new record if none exists
        const [inserted] = await db
          .insert(exchangeRateSettings)
          .values({
            fromCurrency: 'USD',
            toCurrency: 'INR',
            exchangeRate: exchangeRate.toString(),
            source: 'manual',
            updatedBy: userId,
            isActive: true
          })
          .returning();

        return res.json({
          success: true,
          exchangeRate: parseFloat(inserted.exchangeRate),
          source: inserted.source,
          message: 'Exchange rate updated successfully'
        });
      }

      res.json({
        success: true,
        exchangeRate: parseFloat(updated.exchangeRate),
        source: updated.source,
        message: 'Exchange rate updated successfully'
      });
    } catch (error) {
      console.error('Error updating exchange rate:', error);
      res.status(500).json({ error: 'Failed to update exchange rate' });
    }
  });

  // Refresh exchange rate from API
  app.post('/api/exchange-rate/refresh', ensureAuthenticated, async (req: any, res: any) => {
    try {
      const userId = req.user?.id;

      // Fetch from API
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await response.json();
      
      if (!data.rates || !data.rates.INR) {
        throw new Error('Failed to fetch exchange rate from API');
      }

      const apiRate = data.rates.INR;

      const { db } = await import('./db');
      const { exchangeRateSettings } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      // Update with API rate
      const [updated] = await db
        .update(exchangeRateSettings)
        .set({
          exchangeRate: apiRate.toString(),
          source: 'api',
          apiLastUpdated: new Date(),
          updatedBy: userId,
          updatedAt: new Date()
        })
        .where(eq(exchangeRateSettings.isActive, true))
        .returning();

      if (!updated) {
        // Insert new record if none exists
        const [inserted] = await db
          .insert(exchangeRateSettings)
          .values({
            fromCurrency: 'USD',
            toCurrency: 'INR',
            exchangeRate: apiRate.toString(),
            source: 'api',
            apiLastUpdated: new Date(),
            updatedBy: userId,
            isActive: true
          })
          .returning();

        return res.json({
          success: true,
          exchangeRate: parseFloat(inserted.exchangeRate),
          source: inserted.source,
          apiLastUpdated: inserted.apiLastUpdated,
          message: 'Exchange rate refreshed from API'
        });
      }

      res.json({
        success: true,
        exchangeRate: parseFloat(updated.exchangeRate),
        source: updated.source,
        apiLastUpdated: updated.apiLastUpdated,
        message: 'Exchange rate refreshed from API'
      });
    } catch (error) {
      console.error('Error refreshing exchange rate:', error);
      res.status(500).json({ error: 'Failed to refresh exchange rate from API' });
    }
  });

  // Set up finance report routes FIRST to ensure they take precedence over general finance routes
  app.use('/api/finance/reports', financeReportRouter);
  console.log('Finance report routes registered at /api/finance/reports');
  
  // Set up finance module routes (main handler)
  app.use('/api/finance', financeRoutes);
  
  // Set up simple finance routes for write-off approvals (but not dashboard)
  app.use('/api/finance', simpleFinanceRoutes);
  
  // Set up the correct allocation endpoint that the redesigned page expects
  app.use('/api/finance', simpleAllocationEndpoint);
  
  // Set up clean payment routes for the new Basic Payment Allocation page
  app.use('/api/finance', cleanPaymentRoutes);
  
  // Set up clean payment routes with dedicated path to avoid conflicts
  app.use('/api/clean-payments', cleanPaymentRoutes);
  
  // Set up dedicated payment creation route to bypass routing conflicts
  setupDedicatedPaymentCreation(app);
  
  // Set up clean payment creation route (final fix)
  setupCleanPaymentCreation(app);
  
  // Set up simple payment routes for payment creation
  app.use('/api/finance', simplePaymentRoutes);
  
  // Set up basic allocation API for the new Basic Payment Allocation page
  app.use('/api/finance', basicAllocationApi);
  
  // Set up simplified finance routes (no database connection required)
  app.use('/api/simple-finance', simpleFinanceRoutes);
  
  // Mount simple finance routes at /api/finance as well for write-off approvals
  app.use('/api/finance', simpleFinanceRoutes);
  
  // Set up payment allocation API (secondary)
  app.use('/api/finance/allocations', paymentAllocationApi);
  
  // Set up simple payment allocation routes (with error handling)
  app.use('/api/finance/simple-payments', simplePaymentRoutes);
  
  // Set up direct invoice creation route for improved reliability
  app.use('/api/finance', directInvoiceRoutes);
  

  
  // Set up new payment reference number generation route
  app.use('/api/payment-reference', paymentReferenceRoutes);
  console.log('Payment reference generation route registered at /api/payment-reference');
  
  // Set up template management routes
  registerTemplateManagementRoutes(app);
  
  // Set up module permissions routes
  app.use(modulePermissionRoutes);
  
  // Payment reference endpoint replaced with Payment ID approach
  app.get("/api/finance/generate-payment-reference", async (req, res) => {
    try {
      // For backward compatibility, return a non-empty reference number to prevent error messages
      // This is only for handling old backup files that might still try to fetch reference numbers
      const latestResult = await db.query(`
        SELECT reference_number FROM payments 
        WHERE reference_number LIKE 'PAY-%' 
        ORDER BY reference_number DESC LIMIT 1
      `);
      
      // If we have existing records, just return the latest reference
      if (latestResult.rows.length > 0) {
        const latestRef = latestResult.rows[0].reference_number;
        console.log(`Found latest payment reference: ${latestRef}`);
        return res.json({ referenceNumber: latestRef });
      }
      
      // If no existing records, just return a default value to prevent errors
      return res.json({ 
        referenceNumber: "PAY-2526-001",
        message: "Default reference provided for backward compatibility"
      });
    } catch (error) {
      console.error("Error in payment reference endpoint:", error);
      // Return a non-empty reference to prevent client-side errors
      return res.json({
        referenceNumber: "PAY-2526-001", 
        message: "Default reference number"
      });
    }
  });
  
  // OLD REFERENCE GENERATION CODE - KEPT FOR DOCUMENTATION BUT NO LONGER USED
  /* 
  app.get("/api/finance/generate-reference-old", async (req, res) => {
    try {
      let year, month, day;
      
      if (req.query.year && req.query.month && req.query.day) {
        // If individual date components are provided, use them
        year = parseInt(req.query.year as string);
        month = parseInt(req.query.month as string); 
        day = parseInt(req.query.day as string);
        
        // Month is 0-based in JavaScript Date (0 = January, 11 = December)
        month = month - 1;
      } else if (req.query.date) {
        // Parse date string if provided
        const dateObj = new Date(req.query.date as string);
        year = dateObj.getFullYear();
        month = dateObj.getMonth();
        day = dateObj.getDate();
      } else {
        // Use current date
        const today = new Date();
        year = today.getFullYear();
        month = today.getMonth(); 
        day = today.getDate();
      }
      
      // Create date object
      const date = new Date(year, month, day);
      console.log(`Using payment date for reference: ${date.toDateString()} (y:${year} m:${month} d:${day})`);
      
      // Calculate financial year based on Indian calendar (April to March)
      // If month is January(0), February(1), or March(2), use previous year as start year
      const startYear = month < 3 ? year - 1 : year;
      const endYear = startYear + 1;
      
      // Format as YYZZ (e.g., "2425" for 2024-2025)
      const startYearStr = startYear.toString().slice(-2);
      const endYearStr = endYear.toString().slice(-2);
      const financialYear = `${startYearStr}${endYearStr}`;
      
      console.log(`Calculated financial year ${financialYear} for date ${date.toDateString()}`);
      
      // Query database for highest existing payment reference number with this prefix
      const query = `
        SELECT reference_number 
        FROM payments 
        WHERE reference_number LIKE $1 
        ORDER BY reference_number DESC
        LIMIT 1
      `;
      
      console.log(`Looking for payment references with pattern: PAY-${financialYear}-%`);
      const result = await db.query(query, [`PAY-${financialYear}-%`]);
      
      let nextSequenceNumber = 1; // Start from 1 if no existing payments
      
      if (result.rows.length > 0) {
        const latestRef = result.rows[0].reference_number;
        console.log(`Found latest payment reference: ${latestRef}`);
        
        // Extract sequence number from reference number (PAY-YYZZ-XXX)
        const match = latestRef.match(/PAY-\d{4}-(\d{3})/);
        if (match && match[1]) {
          const currentSequence = parseInt(match[1], 10);
          nextSequenceNumber = currentSequence + 1;
          console.log(`Current sequence: ${currentSequence}, next: ${nextSequenceNumber}`);
        }
      } else {
        console.log(`No existing payments found for financial year ${financialYear}, starting with 001`);
      }
      
      // Format with leading zeros (3 digits)
      const sequenceStr = nextSequenceNumber.toString().padStart(3, '0');
      const referenceNumber = `PAY-${financialYear}-${sequenceStr}`;
      
      console.log(`Generated payment reference number: ${referenceNumber}`);
      return res.json({ referenceNumber });
    } catch (error) {
      console.error('Error generating payment reference number:', error);
      res.status(500).json({ 
        error: 'Failed to generate reference number. Please try again or enter manually.'
      });
    }
  });
  */
  
  // GCS Storage Diagnostics Route - only accessible by Superusers
  app.get("/api/gcs-permissions-check", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      // Only allow Superusers to run diagnostics
      if (req.user!.role !== "Superuser") {
        return res.status(403).json({ error: 'Only Superusers can access storage diagnostics' });
      }
      
      const diagnosticResults = await checkGcsPermissions();
      res.json(diagnosticResults);
    } catch (error) {
      console.error("Error checking GCS permissions:", error);
      res.status(500).json({ 
        error: 'Failed to check GCS permissions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Database Maintenance Routes
  app.post("/api/db-maintenance/reset-master-items", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      // Only allow Superuser to perform this operation
      if (req.user!.role !== "Superuser") {
        return res.status(403).json({ error: 'Only Superuser can perform this operation' });
      }
      
      // Count project items that reference master items
      const projectItems = await db
        .select()
        .from(projectItemsTable)
        .where(sql`${projectItemsTable.itemId} IS NOT NULL`);
      const projectItemCount = projectItems.length;
      
      console.log(`Found ${projectItemCount} project items referencing master items`);
      
      // Determine if we need to keep a placeholder item
      if (projectItemCount > 0) {
        let placeholderId;
        let usingExistingPlaceholder = false;
        
        // Check if a placeholder item already exists
        const existingPlaceholders = await db.select()
          .from(masterItemsTable)
          .where(eq(masterItemsTable.itemCode, "PLACEHOLDER-RESET-REFERENCE"));
        
        if (existingPlaceholders.length > 0) {
          // Use existing placeholder
          placeholderId = existingPlaceholders[0].id;
          usingExistingPlaceholder = true;
          console.log(`Using existing placeholder with ID: ${placeholderId}`);
          
          // First update all project items to reference the placeholder
          console.log(`Updating ${projectItemCount} project items to reference placeholder ${placeholderId}`);
          
          // Loop through each project item and update them one by one to prevent constraint violations
          for (const projectItem of projectItems) {
            await db.update(projectItemsTable)
              .set({ itemId: placeholderId })
              .where(eq(projectItemsTable.id, projectItem.id));
            console.log(`Updated project item ${projectItem.id} to reference placeholder ${placeholderId}`);
          }
          
          console.log(`Updated all ${projectItemCount} project items to reference placeholder`);
          
          // Then delete all other master items
          console.log("Deleting all other master items");
          await db.delete(masterItemsTable)
            .where(sql`${masterItemsTable.id} != ${placeholderId}`);
          console.log("Successfully deleted all other master items");
        } else {
          // First create a new placeholder
          console.log("Creating a new placeholder");
          const placeholderItem = await db.insert(masterItemsTable)
            .values({
              itemCode: "PLACEHOLDER-RESET-REFERENCE",
              description: "Placeholder reference for reset master items",
              uom: "EA",
              makeOrBuy: "N/A",
              createdAt: new Date(),
              updatedAt: new Date(),
              drawingNo: "N/A",
              notes: "This is a placeholder item created during database reset. This item replaces references to deleted master items."
            })
            .returning();
          
          placeholderId = placeholderItem[0].id;
          console.log(`Created new placeholder with ID: ${placeholderId}`);
          
          // Then update all project items to reference this placeholder
          console.log(`Updating ${projectItemCount} project items to reference placeholder ${placeholderId}`);
          
          // Loop through each project item and update them one by one to prevent constraint violations
          for (const projectItem of projectItems) {
            await db.update(projectItemsTable)
              .set({ itemId: placeholderId })
              .where(eq(projectItemsTable.id, projectItem.id));
            console.log(`Updated project item ${projectItem.id} to reference placeholder ${placeholderId}`);
          }
          
          console.log(`Updated all ${projectItemCount} project items to reference new placeholder`);
          
          // Now it's safe to delete all other master items
          console.log("Deleting all other master items");
          await db.delete(masterItemsTable)
            .where(sql`${masterItemsTable.id} != ${placeholderId}`);
          console.log("Successfully deleted all other master items");
        }
        
        // Reset auto-increment counter
        const maxIdResult = await db.select({ maxId: sql`MAX(id)` }).from(masterItemsTable);
        const maxId = typeof maxIdResult[0].maxId === 'number' ? maxIdResult[0].maxId : 0;
        const nextId = maxId + 1;
        
        await db.execute(sql`ALTER SEQUENCE master_items_id_seq RESTART WITH ${nextId}`);
        console.log(`Reset auto-increment counter to ${nextId}`);
        
        // Return success response
        res.status(200).json({ 
          message: 'Master items table reset successfully', 
          details: `${usingExistingPlaceholder ? 'Used existing' : 'Created new'} placeholder master item and updated ${projectItemCount} project item references.` 
        });
      } else {
        // No project items referencing master items, can safely delete all
        await db.delete(masterItemsTable);
        console.log("Deleted all master items");
        
        // Reset auto-increment counter
        await db.execute(sql`ALTER SEQUENCE master_items_id_seq RESTART WITH 1`);
        console.log("Reset auto-increment counter to 1");
        
        // Return success response
        res.status(200).json({ 
          message: 'Master items table reset successfully', 
          details: 'All master items deleted. No project item references needed to be updated.' 
        });
      }
    } catch (error) {
      console.error("Error resetting master items table:", error);
      res.status(500).json({ 
        error: 'Failed to reset master items table',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Master Items Management Routes
  app.get("/api/master-items", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const items = await storage.getAllMasterItems();
      res.json(items);
    } catch (error) {
      console.error("Error fetching master items:", error);
      res.status(500).json({ 
        error: 'Failed to fetch master items',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get("/api/master-items/by-code/:itemCode", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const itemCode = req.params.itemCode;
      console.log(`Looking up master item by code: ${itemCode}`);
      
      // Get item from database by code
      const [item] = await db.select().from(masterItemsTable).where(eq(masterItemsTable.itemCode, itemCode));
      
      if (!item) {
        return res.status(404).json({ error: 'Master item not found' });
      }
      
      res.json(item);
    } catch (error) {
      console.error("Error fetching master item by code:", error);
      res.status(500).json({ 
        error: 'Failed to fetch master item by code',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get("/api/master-items/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const itemId = parseInt(req.params.id);
      const item = await storage.getMasterItem(itemId);
      
      if (!item) {
        return res.status(404).json({ error: 'Master item not found' });
      }
      
      res.json(item);
    } catch (error) {
      console.error(`Error fetching master item ${req.params.id}:`, error);
      res.status(500).json({ 
        error: 'Failed to fetch master item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/master-items", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      // Check if the user has permission to create master items
      if (!canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to create master items' });
      }
      
      // Check if item code already exists
      const existingItem = await storage.getMasterItemByCode(req.body.itemCode);
      if (existingItem) {
        return res.status(400).json({ error: 'Item code already exists' });
      }
      
      const newItem = await storage.createMasterItem({
        ...req.body,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      res.status(201).json(newItem);
    } catch (error) {
      console.error("Error creating master item:", error);
      res.status(500).json({ 
        error: 'Failed to create master item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.put("/api/master-items/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      // Check if the user has permission to update master items
      if (!canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to update master items' });
      }
      
      const itemId = parseInt(req.params.id);
      
      // Check if the item exists
      const existingItem = await storage.getMasterItem(itemId);
      if (!existingItem) {
        return res.status(404).json({ error: 'Master item not found' });
      }
      
      // If item code is being changed, check if the new code already exists
      if (req.body.itemCode && req.body.itemCode !== existingItem.itemCode) {
        const itemWithSameCode = await storage.getMasterItemByCode(req.body.itemCode);
        if (itemWithSameCode && itemWithSameCode.id !== itemId) {
          return res.status(400).json({ error: 'Item code already exists' });
        }
      }
      
      const updatedItem = await storage.updateMasterItem(itemId, {
        ...req.body,
        updatedAt: new Date()
      });
      
      res.json(updatedItem);
    } catch (error) {
      console.error(`Error updating master item ${req.params.id}:`, error);
      res.status(500).json({ 
        error: 'Failed to update master item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete("/api/master-items/:id", async (req, res) => {
    try {
      const itemId = parseInt(req.params.id);
      
      // Check if the user has permission to delete master items
      if (!canManage(req.user!.role, 'Senior Manager')) {
        return res.status(403).json({ error: 'Not authorized to delete master items' });
      }
      
      // Check if the item exists
      const existingItem = await storage.getMasterItem(itemId);
      if (!existingItem) {
        return res.status(404).json({ error: 'Master item not found' });
      }
      
      // Check if the item is used in any project
      const projectItems = await storage.getProjectItemsByMasterId(itemId);
      if (projectItems && projectItems.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete master item with associated project items',
          details: `Item is used in ${projectItems.length} project(s)`
        });
      }
      
      await storage.deleteMasterItem(itemId);
      res.status(204).send();
    } catch (error) {
      console.error(`Error deleting master item ${req.params.id}:`, error);
      res.status(500).json({ 
        error: 'Failed to delete master item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Logout endpoint with proper error handling
  app.post("/api/logout", (req, res) => {
    try {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).json({ message: "Logout failed" });
          }
          res.clearCookie("connect.sid");
          res.status(200).json({ message: "Logged out successfully" });
        });
      } else {
        res.status(200).json({ message: "Already logged out" });
      }
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Add password change endpoint
  app.post("/api/change-password", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      // Get current user
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isValid = await comparePasswords(currentPassword, user.password);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash and update new password
      const hashedPassword = await updatePasswordHash(newPassword);
      await storage.updateUser(user.id, { password: hashedPassword });

      console.log(`Password updated successfully for user ${user.username}`);
      res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to change password" 
      });
    }
  });

  // Add password change endpoint
  app.post("/api/admin/change-password", async (req, res) => {
    try {
      // Check authentication and authorization
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "You must be logged in to perform this action" });
      }
      
      if (req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Only Superusers can change other users' passwords" });
      }

      const { userId, newPassword } = req.body;
      
      // Validate input
      if (!userId || !newPassword) {
        return res.status(400).json({ message: "Missing required fields: userId and newPassword" });
      }
      
      // Password complexity validation
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }
      
      // Additional server-side password validation
      const hasUppercase = /[A-Z]/.test(newPassword);
      const hasLowercase = /[a-z]/.test(newPassword);
      const hasNumber = /[0-9]/.test(newPassword);
      const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
      
      if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
        return res.status(400).json({ 
          message: "Password must include at least one uppercase letter, one lowercase letter, one number, and one special character" 
        });
      }

      // Get user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Hash and update new password
      const hashedPassword = await updatePasswordHash(newPassword);
      await storage.updateUser(user.id, { password: hashedPassword });

      // Log password change for audit purposes (without sensitive data)
      console.log(`Password updated for user ${userId} by Superuser ${req.user!.id} on ${new Date().toISOString()}`);

      res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "An error occurred while changing the password" });
    }
  });

  // User Management Routes
  app.delete("/api/users/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user!.role !== "Superuser") return res.sendStatus(403);

    const userId = parseInt(req.params.id);
    await storage.deleteUser(userId);
    res.sendStatus(200);
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      if (req.user!.role !== "Superuser") return res.status(403).json({ message: "Not authorized" });

      const userId = parseInt(req.params.id);
      let userData = insertUserSchema.partial().parse(req.body);

      console.log(`Attempting to update user ${userId}`, {
        ...userData,
        password: userData.password ? '[REDACTED]' : undefined
      });

      // If password is being updated, hash it
      if (userData.password) {
        userData = {
          ...userData,
          password: await updatePasswordHash(userData.password)
        };
      }

      const updatedUser = await storage.updateUser(userId, userData);
      console.log(`Successfully updated user ${userId}`);

      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update user" 
      });
    }
  });

  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user!.role !== "Superuser") return res.sendStatus(403);

    const users = await storage.getAllUsers();
    res.json(users);
  });

  // Task Management Routes
  app.post("/api/tasks", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);

      const taskData = insertTaskSchema.parse({
        ...req.body,
        createdBy: req.user!.id,
        createdAt: new Date().toISOString(),
      });

      console.log('Creating new task:', taskData);
      const task = await storage.createTask(taskData);
      console.log('Created task:', task);
      res.status(201).json(task);
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create task" 
      });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);

      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Task completion and task editing are separate operations with different permissions
      const isTaskCompletion = req.body.status === 'completed';
      const isTaskEditing = !isTaskCompletion;

      if (isTaskCompletion) {
        // Only allow completing a task if user is the assignee or a superuser
        if (task.assignedTo !== req.user!.id && req.user!.role !== "Superuser") {
          return res.status(403).json({ message: "Only the assigned user or a Superuser can complete this task" });
        }

        const updateData = {
          status: 'completed',
          completedAt: new Date().toISOString()
        };

        const updatedTask = await storage.updateTask(taskId, updateData);
        
        console.log(`Task ${taskId} completed by user ${req.user!.id}`);
        
        // Update productivity metrics
        let productivityMetric = await storage.getProductivityMetric(req.user!.id);
        
        if (!productivityMetric) {
          // Create new metric if it doesn't exist
          productivityMetric = await storage.createProductivityMetric({
            userId: req.user!.id,
            tasksCompleted: 1,
            tasksCreated: 0,
            recommendationsAccepted: 0,
            averageCompletionTime: 0,
            onTimeCompletion: 0,
            weeklyScore: 10, // Initial score for completing a task
            monthlyScore: 10, // Initial score for completing a task
            totalPoints: 10, // Initial points for completing a task
            lastUpdated: new Date().toISOString()
          });
        } else {
          // Update existing metric
          productivityMetric = await storage.updateProductivityMetric(req.user!.id, {
            tasksCompleted: productivityMetric.tasksCompleted + 1,
            weeklyScore: productivityMetric.weeklyScore + 10,
            monthlyScore: productivityMetric.monthlyScore + 10,
            totalPoints: productivityMetric.totalPoints + 10,
            lastUpdated: new Date().toISOString()
          });
        }
        
        // Check and award achievements
        await storage.checkAndAwardAchievements(req.user!.id);
        
        // Add task history entry
        await storage.createTaskHistory({
          taskId: taskId,
          userId: req.user!.id,
          action: 'status_changed',
          timestamp: new Date().toISOString(),
          oldValue: task.status || 'pending',
          newValue: 'completed'
        });

        // Auto-create DWAR activity for completed task
        try {
          const today = new Date().toISOString().split('T')[0];
          
          // Get or create today's DWAR
          let [todayReport] = await db
            .select()
            .from(dailyWorkReports)
            .where(and(
              eq(dailyWorkReports.userId, req.user!.id),
              eq(dailyWorkReports.reportDate, today)
            ));

          if (!todayReport) {
            [todayReport] = await db
              .insert(dailyWorkReports)
              .values({
                userId: req.user!.id,
                reportDate: today,
                activities: [],
                priorityTasks: [],
                status: 'draft'
              })
              .returning();
          }

          // Create activity from completed task
          const newActivity = {
            type: 'Task Work',
            description: task.title,
            timeSpent: 1, // Default 1 hour
            plannedHours: 1,
            priority: task.priority?.toLowerCase() || 'medium',
            status: 'completed',
            taskId: task.id,
            blockedReason: ''
          };

          const updatedActivities = [...(todayReport.activities || []), newActivity];
          const totalHours = updatedActivities.reduce((sum, a) => sum + (a.timeSpent || 0), 0);
          const completedTasks = updatedActivities.filter(a => a.status === 'completed').length;
          const inProgressTasks = updatedActivities.filter(a => a.status === 'in_progress').length;

          // Calculate productivity score
          let productivityScore = 0;
          if (updatedActivities.length > 0) {
            const completedActivities = updatedActivities.filter(a => a.status === 'completed');
            const totalActivities = updatedActivities.length;
            const avgTimeSpent = updatedActivities.reduce((sum, a) => sum + (a.timeSpent || 0), 0) / totalActivities;
            
            productivityScore = (completedActivities.length / totalActivities) * 50 + 
                               Math.min(avgTimeSpent / 8, 1) * 30 + 
                               completedTasks * 5;
            productivityScore = Math.min(productivityScore, 100);
          }

          // Update DWAR with new activity
          await db
            .update(dailyWorkReports)
            .set({
              activities: updatedActivities,
              hoursWorked: totalHours,
              tasksCompleted: completedTasks,
              tasksInProgress: inProgressTasks,
              productivityScore: Number(productivityScore.toFixed(2)),
              updatedAt: new Date()
            })
            .where(eq(dailyWorkReports.id, todayReport.id));

          console.log(`Auto-created DWAR activity for completed task ${taskId}`);
        } catch (dwarError) {
          console.error('Error auto-creating DWAR activity:', dwarError);
          // Don't fail the task completion if DWAR update fails
        }
        
        res.json(updatedTask);
        return;
      }
      
      if (isTaskEditing) {
        // Only allow editing a task if user is the creator or a superuser
        if (task.createdBy !== req.user!.id && req.user!.role !== "Superuser") {
          return res.status(403).json({ 
            message: "Only the task creator or a Superuser can edit this task"
          });
        }
        
        // Prepare task update data (only allowed fields)
        const allowedFields = ['title', 'description', 'priority', 'finishDate', 'assignedTo'];
        const updateData: Record<string, any> = {};
        
        for (const field of allowedFields) {
          if (field in req.body) {
            updateData[field] = req.body[field];
          }
        }
        
        // If assignee is being changed, log it in task history
        if ('assignedTo' in updateData && updateData.assignedTo !== task.assignedTo) {
          await storage.createTaskHistory({
            taskId: taskId,
            userId: req.user!.id,
            action: 'assignee_changed',
            timestamp: new Date().toISOString(),
            oldValue: JSON.stringify({ assignedTo: task.assignedTo }),
            newValue: JSON.stringify({ assignedTo: updateData.assignedTo })
          });
        }
        
        const updatedTask = await storage.updateTask(taskId, updateData);
        console.log(`Task ${taskId} edited by user ${req.user!.id}`);
        
        res.json(updatedTask);
        return;
      }
      
      res.status(400).json({ message: "Invalid task update request" });
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update task" 
      });
    }
  });

  app.get("/api/tasks", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      console.log(`Getting tasks for authenticated user: ${req.user!.username} (${req.user!.role})`);

      const tasks = await storage.getTasksForUser(req.user!.id);
      console.log(`Returning ${tasks.length} tasks for user ${req.user!.username}`);
      res.json(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch tasks" 
      });
    }
  });

  app.post("/api/tasks/:id/forward", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

      const taskId = parseInt(req.params.id);
      const { newAssignee } = req.body;

      if (!newAssignee) {
        return res.status(400).json({ message: "New assignee ID is required" });
      }

      // Get current task
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Check permissions - only Superuser, General Manager, Senior Manager, and Manager can forward tasks
      const allowedRoles = ["Superuser", "General Manager", "Senior Manager", "Manager"];
      if (!allowedRoles.includes(req.user!.role)) {
        return res.status(403).json({ message: "Not authorized to forward tasks" });
      }

      // Update task assignee
      const updatedTask = await storage.updateTask(taskId, {
        assignedTo: newAssignee
      });

      console.log(`Task ${taskId} forwarded to user ${newAssignee} by ${req.user!.username}`);
      res.json(updatedTask);
    } catch (error) {
      console.error('Error forwarding task:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to forward task" 
      });
    }
  });

  app.get("/api/subordinates", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const subordinates = await storage.getSubordinates(req.user!.id);
    res.json(subordinates);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      console.log('Registration attempt:', {
        username: req.body.username,
        role: req.body.role,
        email: req.body.email,
        countryCode: req.body.countryCode,
        mobileNumber: req.body.mobileNumber
      });

      // If not authenticated, can only register as Employee
      if (!req.isAuthenticated()) {
        if (req.body.role !== 'Employee') {
          return res.status(403).json({ message: "New registrations must be Employee role" });
        }
      } else {
        // Check if authenticated user has permission to create the requested role
        const currentUserRole = req.user!.role;
        const requestedRole = req.body.role;

        // Use roleHierarchy imported from shared/roles
        // This is already imported at the top of the file

        // Employee cannot create any users
        if (currentUserRole === 'Employee') {
          return res.status(403).json({ message: "Employees cannot create new users" });
        }

        // Others can only create roles of lower rank
        if (requestedRole in roleHierarchy && currentUserRole in roleHierarchy) {
          if (roleHierarchy[requestedRole] <= roleHierarchy[currentUserRole]) {
            return res.status(403).json({
              message: "You can only create users with roles below your rank"
            });
          }
        } else {
          return res.status(400).json({
            message: "Invalid role specified"
          });
        }
      }

      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log(`Registration failed: Username ${req.body.username} already exists`);
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await updatePasswordHash(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      console.log(`User created successfully: ${user.username} (${user.role})`);

      if (user.role === "Superuser") {
        await storage.updateUser(user.id, { reportingManagerId: user.id });
        console.log(`Set superuser ${user.username} as their own reporting manager`);
      }

      req.login(user, (err) => {
        if (err) {
          console.error('Login after registration failed:', err);
          return next(err);
        }
        console.log(`Auto-login successful for new user: ${user.username}`);
        res.status(201).json(user);
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({message: "Registration failed"});
      next(error);
    }
  });

  // Workflow Recommendations API Routes
  app.get("/api/recommendations", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      console.log(`Getting workflow recommendations for user ${req.user!.username} (${req.user!.id})`);
      const recommendations = await storage.getRecommendationsForUser(req.user!.id);
      
      console.log(`Found ${recommendations.length} recommendations for user ${req.user!.id}`);
      res.json(recommendations);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch recommendations" 
      });
    }
  });

  app.get("/api/recommendations/active", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      console.log(`Getting active workflow recommendations for user ${req.user!.username} (${req.user!.id})`);
      const recommendations = await storage.getActiveRecommendations(req.user!.id);
      
      console.log(`Found ${recommendations.length} active recommendations for user ${req.user!.id}`);
      res.json(recommendations);
    } catch (error) {
      console.error('Error fetching active recommendations:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch active recommendations" 
      });
    }
  });

  app.patch("/api/recommendations/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const recommendationId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!status || !['accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "Valid status (accepted/rejected) is required" });
      }
      
      console.log(`Updating recommendation ${recommendationId} to status: ${status}`);
      
      // Update recommendation with new status
      const updatedRecommendation = await storage.updateRecommendation(recommendationId, {
        status,
        isRead: true
      });
      
      console.log(`Recommendation ${recommendationId} updated successfully`);
      res.json(updatedRecommendation);
    } catch (error) {
      console.error('Error updating recommendation:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update recommendation" 
      });
    }
  });

  app.post("/api/recommendations/generate", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      console.log(`Generating new workflow recommendations for user ${req.user!.username} (${req.user!.id})`);
      
      // Generate recommendations from different categories
      const taskAssignmentRecommendations = await storage.generateTaskAssignmentRecommendations(req.user!.id);
      const priorityAdjustmentRecommendations = await storage.generatePriorityAdjustmentRecommendations(req.user!.id);
      const followUpRecommendations = await storage.generateFollowUpRecommendations(req.user!.id);
      
      const allRecommendations = [
        ...taskAssignmentRecommendations,
        ...priorityAdjustmentRecommendations,
        ...followUpRecommendations
      ];
      
      console.log(`Generated ${allRecommendations.length} new recommendations for user ${req.user!.id}`);
      
      res.json({
        count: allRecommendations.length,
        recommendations: allRecommendations
      });
    } catch (error) {
      console.error('Error generating recommendations:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to generate recommendations" 
      });
    }
  });

  // Add task history recording
  app.post("/api/tasks/:id/history", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const taskId = parseInt(req.params.id);
      const { action, oldValue, newValue } = req.body;
      
      if (!action) {
        return res.status(400).json({ message: "Action is required" });
      }
      
      // Create history record
      const historyRecord = await storage.createTaskHistory({
        taskId,
        userId: req.user!.id,
        action,
        timestamp: new Date().toISOString(),
        oldValue,
        newValue
      });
      
      console.log(`Task history record created for task ${taskId}, action: ${action}`);
      res.status(201).json(historyRecord);
    } catch (error) {
      console.error('Error creating task history:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create task history" 
      });
    }
  });

  // Get task history
  app.get("/api/tasks/:id/history", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      // Check if user has permission to view this task
      const userRole = req.user!.role;
      if (userRole !== "Superuser" && task.createdBy !== req.user!.id && task.assignedTo !== req.user!.id) {
        return res.status(403).json({ message: "Not authorized to view this task's history" });
      }
      
      const history = await storage.getTaskHistory(taskId);
      console.log(`Fetched ${history.length} history records for task ${taskId}`);
      
      res.json(history);
    } catch (error) {
      console.error('Error fetching task history:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch task history" 
      });
    }
  });

  // Achievement and Gamification API Routes
  
  // Get all achievements
  app.get("/api/achievements", async (req, res) => {
    try {
      const achievements = await storage.getAllAchievements();
      res.json(achievements);
    } catch (error) {
      console.error('Error fetching achievements:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch achievements" 
      });
    }
  });

  // Get achievements for the current user
  app.get("/api/my-achievements", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const userId = req.user!.id;
      const achievements = await storage.getUserAchievements(userId);
      res.json(achievements);
    } catch (error) {
      console.error('Error fetching user achievements:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch user achievements" 
      });
    }
  });

  // Get achievements for a specific user (managers can view their team's achievements)
  app.get("/api/users/:userId/achievements", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const targetUserId = parseInt(req.params.userId);
      const requestingUserId = req.user!.id;
      
      // Check if requesting user has permission to view target user's achievements
      if (targetUserId !== requestingUserId) {
        // Only superusers can see anyone's achievements
        // Otherwise, user must be the reporting manager of the target user
        if (req.user!.role !== "Superuser") {
          const subordinates = await storage.getSubordinates(requestingUserId);
          const isManager = subordinates.some(s => s.id === targetUserId);
          
          if (!isManager) {
            return res.status(403).json({ 
              message: "Not authorized to view this user's achievements" 
            });
          }
        }
      }
      
      const achievements = await storage.getUserAchievements(targetUserId);
      res.json(achievements);
    } catch (error) {
      console.error('Error fetching user achievements:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch user achievements" 
      });
    }
  });

  // Leaderboard APIs
  
  // Get team leaderboard
  app.get("/api/leaderboard/team", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const user = req.user!;
      // If reportingManagerId is null, use user's own ID (for Superusers)
      const teamId = user.reportingManagerId !== null ? user.reportingManagerId : user.id;
      
      const leaderboard = await storage.getTeamLeaderboard(teamId);
      res.json(leaderboard);
    } catch (error) {
      console.error('Error fetching team leaderboard:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch team leaderboard" 
      });
    }
  });

  // Get company-wide leaderboard (top performers)
  app.get("/api/leaderboard/company", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      // Optional limit parameter
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      
      const topPerformers = await storage.getTopPerformers(limit);
      res.json(topPerformers);
    } catch (error) {
      console.error('Error fetching company leaderboard:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch company leaderboard" 
      });
    }
  });

  // Get current user's rank
  app.get("/api/leaderboard/my-rank", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const userId = req.user!.id;
      const rankInfo = await storage.getUserRank(userId);
      res.json(rankInfo);
    } catch (error) {
      console.error('Error fetching user rank:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch user rank" 
      });
    }
  });

  // Get productivity metrics for current user
  app.get("/api/productivity", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const userId = req.user!.id;
      let metrics = await storage.getProductivityMetric(userId);
      
      // If metrics don't exist yet, update them
      if (!metrics) {
        metrics = await storage.updateUserProductivityStats(userId);
      }
      
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching productivity metrics:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch productivity metrics" 
      });
    }
  });

  // Force refresh productivity metrics for current user
  app.post("/api/productivity/refresh", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const userId = req.user!.id;
      const updatedMetrics = await storage.updateUserProductivityStats(userId);
      
      res.json(updatedMetrics);
    } catch (error) {
      console.error('Error refreshing productivity metrics:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to refresh productivity metrics" 
      });
    }
  });

  // Create achievement (admin only)
  app.post("/api/achievements", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      // Only superusers can create achievements
      if (req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Only superusers can create achievements" });
      }
      
      const achievementData = {
        ...req.body,
        createdAt: new Date().toISOString()
      };
      
      const achievement = await storage.createAchievement(achievementData);
      res.status(201).json(achievement);
    } catch (error) {
      console.error('Error creating achievement:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create achievement" 
      });
    }
  });

  // Recurring Pattern Endpoints
  app.post("/api/recurring-patterns", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        console.error("❌ Authentication failed for recurring pattern creation");
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      console.log("✅ RECEIVED RECURRING PATTERN CREATION REQUEST:");
      console.log(JSON.stringify(req.body, null, 2));
      
      // Always ensure the userId is set to the authenticated user's ID
      console.log(`📝 Setting userId to authenticated user's ID: ${req.user!.id}`);
      req.body.userId = req.user!.id;
      
      // Parse and validate the pattern data
      try {
        console.log("📝 Preparing data for schema validation");
        const dataForValidation = {
          ...req.body,
          userId: req.user!.id, // Make absolutely sure userId is set
          createdBy: req.user!.id,
          createdAt: new Date().toISOString(),
          isActive: req.body.isActive ?? true,
          generatedCount: 0
        };
        
        console.log("📝 Data for validation:", JSON.stringify(dataForValidation, null, 2));
        console.log("📝 Schema requirements:", Object.keys(insertRecurringPatternSchema.shape));
        
        console.log("📝 CHECKING REQUIRED FIELDS:");
        // Check if all required fields are present
        const requiredFields = ['pattern', 'interval', 'startDate', 'templateTitle', 'templateDescription', 'templatePriority', 'userId', 'createdBy', 'createdAt'];
        const missingFields = requiredFields.filter(field => !(field in dataForValidation));
        
        if (missingFields.length > 0) {
          console.error(`❌ MISSING REQUIRED FIELDS: ${missingFields.join(', ')}`);
          return res.status(400).json({ 
            message: `Missing required fields: ${missingFields.join(', ')}`,
            details: { missingFields }
          });
        }
        
        // Extra debug for specific fields
        console.log(`📝 pattern field: ${dataForValidation.pattern}, type: ${typeof dataForValidation.pattern}`);
        console.log(`📝 interval field: ${dataForValidation.interval}, type: ${typeof dataForValidation.interval}`);
        console.log(`📝 userId field: ${dataForValidation.userId}, type: ${typeof dataForValidation.userId}`);
        console.log(`📝 createdBy field: ${dataForValidation.createdBy}, type: ${typeof dataForValidation.createdBy}`);
        
        // Try to parse the data
        try {
          const patternData = insertRecurringPatternSchema.parse(dataForValidation);
          console.log(`✅ VALIDATION PASSED. Creating recurring pattern for user ${req.user!.username}:`);
          console.log(JSON.stringify(patternData, null, 2));
          
          // Create the pattern
          const pattern = await storage.createRecurringPattern(patternData);
          
          // If no nextGenerationDate is provided, set it to startDate
          if (!pattern.nextGenerationDate) {
            console.log(`📝 Setting nextGenerationDate to startDate: ${pattern.startDate}`);
            await storage.updateRecurringPattern(pattern.id, {
              nextGenerationDate: pattern.startDate
            });
          }
          
          console.log("✅ SUCCESSFULLY CREATED RECURRING PATTERN:", JSON.stringify(pattern, null, 2));
          res.status(201).json(pattern);
        } catch (schemaError) {
          console.error('❌ SCHEMA VALIDATION ERROR:');
          console.error(schemaError);
          return res.status(400).json({ 
            message: schemaError instanceof Error ? schemaError.message : "Schema validation failed",
            details: schemaError
          });
        }
      } catch (parseError) {
        console.error('❌ VALIDATION ERROR FOR RECURRING PATTERN:');
        if (parseError instanceof Error) {
          console.error(parseError.message);
        } else {
          console.error(parseError);
        }
        
        return res.status(400).json({ 
          message: parseError instanceof Error ? parseError.message : "Invalid recurring pattern data",
          details: parseError
        });
      }
    } catch (error) {
      console.error('❌ ERROR CREATING RECURRING PATTERN:');
      if (error instanceof Error) {
        console.error(error.message);
        console.error(error.stack);
      } else {
        console.error(error);
      }
      
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create recurring pattern" 
      });
    }
  });
  
  app.get("/api/recurring-patterns", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      console.log(`Getting recurring patterns for user ${req.user!.username}`);
      const patterns = await storage.getUserRecurringPatterns(req.user!.id);
      
      res.json(patterns);
    } catch (error) {
      console.error('Error fetching recurring patterns:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch recurring patterns" 
      });
    }
  });
  
  app.get("/api/recurring-patterns/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const patternId = parseInt(req.params.id);
      console.log(`Getting recurring pattern ${patternId} for user ${req.user!.username}`);
      
      const pattern = await storage.getRecurringPattern(patternId);
      
      if (!pattern) {
        return res.status(404).json({ message: "Recurring pattern not found" });
      }
      
      // Only allow access to user's own patterns or superuser
      if (pattern.createdBy !== req.user!.id && req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Not authorized to view this pattern" });
      }
      
      res.json(pattern);
    } catch (error) {
      console.error('Error fetching recurring pattern:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch recurring pattern" 
      });
    }
  });
  
  app.patch("/api/recurring-patterns/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const patternId = parseInt(req.params.id);
      console.log(`Updating recurring pattern ${patternId} for user ${req.user!.username}`);
      
      const pattern = await storage.getRecurringPattern(patternId);
      
      if (!pattern) {
        return res.status(404).json({ message: "Recurring pattern not found" });
      }
      
      // Only allow updates to user's own patterns or superuser
      if (pattern.createdBy !== req.user!.id && req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Not authorized to update this pattern" });
      }
      
      // Parse and validate the update data
      const updateData = insertRecurringPatternSchema.partial().parse(req.body);
      
      // Update the pattern
      const updatedPattern = await storage.updateRecurringPattern(patternId, updateData);
      
      res.json(updatedPattern);
    } catch (error) {
      console.error('Error updating recurring pattern:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update recurring pattern" 
      });
    }
  });
  
  app.delete("/api/recurring-patterns/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const patternId = parseInt(req.params.id);
      console.log(`Deleting recurring pattern ${patternId} for user ${req.user!.username}`);
      
      const pattern = await storage.getRecurringPattern(patternId);
      
      if (!pattern) {
        return res.status(404).json({ message: "Recurring pattern not found" });
      }
      
      // Only allow deletion of user's own patterns or superuser
      if (pattern.createdBy !== req.user!.id && req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Not authorized to delete this pattern" });
      }
      
      // Delete the pattern
      await storage.deleteRecurringPattern(patternId);
      
      res.sendStatus(204);
    } catch (error) {
      console.error('Error deleting recurring pattern:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to delete recurring pattern" 
      });
    }
  });
  
  app.post("/api/recurring-patterns/process", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      // Only allow Superuser to manually trigger processing
      if (req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Not authorized to process recurring patterns" });
      }
      
      console.log(`Processing recurring patterns triggered by user ${req.user!.username}`);
      
      // Process the patterns
      await storage.processRecurringPatterns();
      
      res.status(200).json({ 
        message: "Recurring patterns processed successfully" 
      });
    } catch (error) {
      console.error('Error processing recurring patterns:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to process recurring patterns" 
      });
    }
  });
  
  // Additional endpoint with consistent naming for the Button in the UI
  app.post("/api/process-recurring-patterns", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      // Check if user has Task Management edit permissions or is Superuser
      const userPermissions = await getUserModulePermissions(req.user!.id);
      const hasTaskManagementEdit = userPermissions?.["Task Management"]?.canEdit || false;
      
      if (!hasTaskManagementEdit && req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Not authorized to process recurring patterns" });
      }
      
      console.log(`Processing recurring patterns triggered by user ${req.user!.username}`);
      
      // Process the patterns and get the count of newly generated tasks
      const tasksGenerated = await storage.processRecurringPatterns();
      
      res.status(200).json({ 
        message: "Recurring patterns processed successfully",
        tasksGenerated
      });
    } catch (error) {
      console.error('Error processing recurring patterns:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to process recurring patterns" 
      });
    }
  });

  // Recurring Tasks API Routes
  app.get("/api/recurring-tasks", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      console.log(`Getting recurring tasks for user ${req.user!.username}`);
      const tasks = await storage.getRecurringTasksForUser(req.user!.id);
      
      res.json(tasks);
    } catch (error) {
      console.error('Error fetching recurring tasks:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch recurring tasks" 
      });
    }
  });

  app.get("/api/recurring-tasks/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const taskId = parseInt(req.params.id);
      console.log(`Getting recurring task ${taskId} for user ${req.user!.username}`);
      
      const task = await storage.getRecurringTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: "Recurring task not found" });
      }
      
      // Check if user has access to this task (creator, assignee, or superuser)
      if (task.assignedTo !== req.user!.id && req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Not authorized to view this recurring task" });
      }
      
      res.json(task);
    } catch (error) {
      console.error('Error fetching recurring task:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch recurring task" 
      });
    }
  });

  app.patch("/api/recurring-tasks/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const taskId = parseInt(req.params.id);
      console.log(`Updating recurring task ${taskId} for user ${req.user!.username}`);
      
      const task = await storage.getRecurringTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: "Recurring task not found" });
      }
      
      // Task completion and task editing are separate operations with different permissions
      const isTaskCompletion = req.body.status === 'completed';
      const isTaskEditing = !isTaskCompletion;
      
      if (isTaskCompletion) {
        // Only allow completing a task if user is the assignee or a superuser
        if (task.assignedTo !== req.user!.id && req.user!.role !== "Superuser") {
          return res.status(403).json({ message: "Only the assigned user or a Superuser can complete this recurring task" });
        }
        
        const updateData = {
          status: 'completed',
          completedAt: new Date().toISOString()
        };
        
        const updatedTask = await storage.updateRecurringTask(taskId, updateData);
        
        console.log(`Recurring task ${taskId} completed by user ${req.user!.id}`);
        
        // Update productivity metrics
        let productivityMetric = await storage.getProductivityMetric(req.user!.id);
        
        if (!productivityMetric) {
          // Create new metric if it doesn't exist
          productivityMetric = await storage.createProductivityMetric({
            userId: req.user!.id,
            tasksCompleted: 1,
            tasksCreated: 0,
            recommendationsAccepted: 0,
            averageCompletionTime: 0,
            onTimeCompletion: 0,
            weeklyScore: 10, // Initial score for completing a task
            monthlyScore: 10, // Initial score for completing a task
            totalPoints: 10, // Initial points for completing a task
            lastUpdated: new Date().toISOString()
          });
        } else {
          // Update existing metric
          productivityMetric = await storage.updateProductivityMetric(req.user!.id, {
            tasksCompleted: productivityMetric.tasksCompleted + 1,
            weeklyScore: productivityMetric.weeklyScore + 10,
            monthlyScore: productivityMetric.monthlyScore + 10,
            totalPoints: productivityMetric.totalPoints + 10,
            lastUpdated: new Date().toISOString()
          });
        }
        
        // Check and award achievements
        await storage.checkAndAwardAchievements(req.user!.id);

        // Auto-create DWAR activity for completed recurring task
        try {
          const today = new Date().toISOString().split('T')[0];
          
          // Get or create today's DWAR
          let [todayReport] = await db
            .select()
            .from(dailyWorkReports)
            .where(and(
              eq(dailyWorkReports.userId, req.user!.id),
              eq(dailyWorkReports.reportDate, today)
            ));

          if (!todayReport) {
            [todayReport] = await db
              .insert(dailyWorkReports)
              .values({
                userId: req.user!.id,
                reportDate: today,
                activities: [],
                priorityTasks: [],
                status: 'draft'
              })
              .returning();
          }

          // Create activity from completed recurring task
          const newActivity = {
            type: 'Recurring Task',
            description: task.title,
            timeSpent: 1, // Default 1 hour
            plannedHours: 1,
            priority: task.priority?.toLowerCase() || 'medium',
            status: 'completed',
            taskId: task.id,
            blockedReason: ''
          };

          const updatedActivities = [...(todayReport.activities || []), newActivity];
          const totalHours = updatedActivities.reduce((sum, a) => sum + (a.timeSpent || 0), 0);
          const completedTasks = updatedActivities.filter(a => a.status === 'completed').length;
          const inProgressTasks = updatedActivities.filter(a => a.status === 'in_progress').length;

          // Calculate productivity score
          let productivityScore = 0;
          if (updatedActivities.length > 0) {
            const completedActivities = updatedActivities.filter(a => a.status === 'completed');
            const totalActivities = updatedActivities.length;
            const avgTimeSpent = updatedActivities.reduce((sum, a) => sum + (a.timeSpent || 0), 0) / totalActivities;
            
            productivityScore = (completedActivities.length / totalActivities) * 50 + 
                               Math.min(avgTimeSpent / 8, 1) * 30 + 
                               completedTasks * 5;
            productivityScore = Math.min(productivityScore, 100);
          }

          // Update DWAR with new activity
          await db
            .update(dailyWorkReports)
            .set({
              activities: updatedActivities,
              hoursWorked: totalHours,
              tasksCompleted: completedTasks,
              tasksInProgress: inProgressTasks,
              productivityScore: Number(productivityScore.toFixed(2)),
              updatedAt: new Date()
            })
            .where(eq(dailyWorkReports.id, todayReport.id));

          console.log(`Auto-created DWAR activity for completed recurring task ${taskId}`);
        } catch (dwarError) {
          console.error('Error auto-creating DWAR activity for recurring task:', dwarError);
          // Don't fail the task completion if DWAR update fails
        }
        
        return res.json(updatedTask);
      }
      
      if (isTaskEditing) {
        // Only allow editing a task if user has admin privileges
        if (req.user!.role !== "Superuser") {
          return res.status(403).json({ 
            message: "Only a Superuser can edit recurring tasks"
          });
        }
        
        // Prepare task update data (only allowed fields)
        const allowedFields = ['title', 'description', 'priority', 'finishDate', 'dueDate', 'assignedTo'];
        const updateData: Record<string, any> = {};
        
        for (const field of allowedFields) {
          if (field in req.body) {
            updateData[field] = req.body[field];
          }
        }
        
        const updatedTask = await storage.updateRecurringTask(taskId, updateData);
        console.log(`Recurring task ${taskId} edited by user ${req.user!.id}`);
        
        return res.json(updatedTask);
      }
      
      res.status(400).json({ message: "Invalid recurring task update request" });
    } catch (error) {
      console.error('Error updating recurring task:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update recurring task" 
      });
    }
  });

  app.post("/api/recurring-tasks/:id/forward", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

      const taskId = parseInt(req.params.id);
      const { newAssignee } = req.body;

      if (!newAssignee) {
        return res.status(400).json({ message: "New assignee ID is required" });
      }

      // Get current task
      const task = await storage.getRecurringTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Recurring task not found" });
      }

      // Check permissions - only Superuser, General Manager, Senior Manager, and Manager can forward tasks
      const allowedRoles = ["Superuser", "General Manager", "Senior Manager", "Manager"];
      if (!allowedRoles.includes(req.user!.role)) {
        return res.status(403).json({ message: "Not authorized to forward recurring tasks" });
      }

      // Update task assignee
      const updatedTask = await storage.updateRecurringTask(taskId, {
        assignedTo: newAssignee
      });

      console.log(`Recurring task ${taskId} forwarded to user ${newAssignee} by ${req.user!.username}`);
      res.json(updatedTask);
    } catch (error) {
      console.error('Error forwarding recurring task:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to forward recurring task" 
      });
    }
  });

  // Setup automatic processing of recurring patterns (every day at midnight)
  setInterval(async () => {
    try {
      console.log('Automatic processing of recurring patterns (daily check)');
      const tasksGenerated = await storage.processRecurringPatterns();
      console.log(`Automatic processing complete. Generated ${tasksGenerated} new tasks.`);
    } catch (error) {
      console.error('Error in automatic processing of recurring patterns:', error);
    }
  }, 24 * 60 * 60 * 1000); // Run once per day

  // Use finance write-offs router (fixed)
  // Register simple payment allocation API
  app.use('/api/finance/simple-allocations', simplePaymentAllocationApi);
  console.log('Simple payment allocation API registered at /api/finance/simple-allocations');
  
  // Register new payment allocation API
  app.use('/api/finance/allocations-new', newAllocationApi);
  console.log('New payment allocation API registered at /api/finance/allocations-new');
  
  // Register simplified allocation API (most reliable version)
  app.use('/api/finance/simplified-allocations', simplifiedAllocationApi);
  console.log('Simplified allocation API registered at /api/finance/simplified-allocations');
  
  // Register ultra-simple allocation API (absolute minimum implementation)
  app.use('/api/finance/ultra-simple', ultraSimpleAllocationApi);
  console.log('Ultra-simple allocation API registered at /api/finance/ultra-simple');
  
  app.use('/api/finance/write-offs', financeWriteOffsRouter);
  console.log('Write-off routes registered at /api/finance/write-offs');

  // Setup debug work order routes
  setupDebugWorkOrderRoutes(app);
  console.log('Debug work order routes registered');

  // Use standalone routes that bypass middleware (for special cases only)
  app.use('/api/standalone', standaloneRoutes);
  console.log('Registered standalone routes that bypass middleware at /api/standalone');

  // Administration Module routes
  app.use('/api/admin', adminRoutes);
  console.log('Administration routes registered at /api/admin');

  const httpServer = createServer(app);
  return httpServer;
}