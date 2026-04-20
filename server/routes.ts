import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { ensureAuthenticated } from "./auth-middleware";
import { storage } from "./storage";
import { insertTaskSchema, insertUserSchema, insertRecurringPatternSchema, insertRecurringTaskSchema, tasks, taskHistory } from "@shared/schema";
import { canManage, roleHierarchy } from "@shared/roles";
import { scrypt, timingSafeEqual, randomBytes } from "crypto";
import { promisify } from "util";
import { eq, sql, and, isNull, isNotNull } from "drizzle-orm";
import { getUserModulePermissions } from "./utils/permission-utils";
import { sendError, sendValidationError, sendNotFound, sendPermissionError, sendBusinessError } from "./utils/error-response";
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
import { setupProjectItemDetailRoutes } from "./project-item-detail-routes";
import { setupEpcDocumentRoutes } from "./epc-document-routes";
import { setupDocumentControlRoutes } from "./document-control-routes";
import { registerEpcPermissionRoutes } from "./epc-permission-routes";
import { default as afterSalesRoutes } from "./after-sales-routes";
import { default as pipelineRoutes } from "./pipeline/pipeline-routes";
import { default as modulePermissionRoutes } from "./module-permission-routes";
import { default as standaloneRoutes } from "./standalone-routes";
import { default as advanceTaxRoutes } from "./advance-tax-routes";
import { hashPassword as updatePasswordHash } from "./update-password";
import { setupTestWelderRoute } from "./quality/test-welder-route";
import { setupApiTestRoutes } from "./api-test-route";
import { setupDedicatedTestRoutes } from "./dedicated-test-route";
import { setupSalesMarketingRoutes } from "./sales-marketing-routes";
import { setupCommercialChangeOrderRoutes } from "./commercial-change-order-routes";
import { saveRoiStep, loadRoiProject, getRoiProjectProgress, deleteRoiProject } from "./roi-routes";
// Temporarily disable main finance routes due to syntax errors
// import { default as financeRoutes } from "./finance-routes";
import { default as financeRoutes } from "./finance-routes-fixed";
import epcAssignmentRoutes from "./epc-assignment-routes";
import { seedEpcAssignmentRules } from "./seed-epc-assignment-rules";
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
import customerOrderDocumentRoutes from "./customer-order-document-routes";
import { registerRetentionRoutes } from "./utils/gcs-retention-cleanup";
import { default as cleanPaymentRoutes } from "./clean-payment-routes";
import { default as basicAllocationApi } from "./basic-allocation-api";
import { default as workLocationRoutes } from "./work-location-routes";
import { default as testCaspianEndpoint } from "./test-caspian-endpoint";
import { default as llmRoutes } from "./llm-routes";
import { default as attendanceRoutes } from "./attendance-routes";
import { default as notificationRoutes } from "./notification-routes";
import { default as dwarRoutes } from "./dwar-routes";
import { default as appraisalRoutes } from "./appraisal-routes";
import { default as leaveRoutes } from "./leave-routes";
import { default as payrollRoutes } from "./payroll-routes";
import { default as manualSalaryRoutes } from "./manual-salary-routes";
import { default as calendarAttendanceRoutes } from "./calendar-attendance-routes";
import { default as loanAdvanceRoutes } from "./loan-advance-routes";
import { default as statutoryComplianceRoutes } from "./statutory-compliance-routes";
import { default as companyTaxRoutes } from "./company-tax-routes";
import { default as salaryCalculationRoutes } from "./salary-calculation-routes";
import { setupDedicatedPaymentCreation } from "./dedicated-payment-creation";
import { setupCleanPaymentCreation } from "./clean-payment-creation";
import { setupDebugWorkOrderRoutes } from "./debug-work-orders";
import { default as simpleAllocationEndpoint } from "./simple-allocation-endpoint";
import { cleanPaymentUpdateRouter } from "./clean-payment-update";
import { registerTemplateManagementRoutes } from "./template-management/register-routes";
import agentRoutes from "./agents/agent-routes";
import l1WorkerRoutes from "./l1-worker-routes";
import { initializeAgentSystem } from "./agents/agent-setup";
import { db } from "./db";
import { masterItems as masterItemsTable, projectItems as projectItemsTable, attendanceRecords, users as usersTable } from "@shared/schema";
import { determineAttendanceStatus } from './attendance-status-engine';
import { checkGcsPermissions } from "./utils/gcs-permissions-check";
import { default as tripManagementRoutes } from "./trip-management-routes";
import { default as visaManagementRoutes } from "./visa-management-routes";
import { default as schengenRoutes } from "./schengen-routes";
import { default as leadGenerationRoutes } from "./lead-generation-routes";
import { default as radarRoutes } from "./radar-routes";
import { default as googleAdsRoutes } from "./google-ads-routes";
import { default as legalManagementRoutes } from "./legal-management-routes";
import { default as epcRisksRoutes } from "./epc-risks-routes";
import { default as llmRoutes } from "./llm-routes";
import { default as usageTrackerRoutes } from "./usage-tracker-routes";
import { default as googleCalendarRoutes } from "./google-calendar-routes";
import { default as designManagementRoutes } from "./design-management-routes";
import { businessIntelligenceRoutes } from "./business-intelligence/business-intelligence-routes";
import { default as designReviewRoutes } from "./design-review-routes";
import { default as twoFactorRoutes } from "./two-factor-routes";
import { default as designDrawingRoutes } from "./design-drawing-routes";
import { default as designBasicDrawingRoutes } from "./design-basic-drawings-routes";
import { default as designStandardsRoutes } from "./design-standards-routes";
import { default as designTransmittalRoutes } from "./design-transmittal-routes";
import { default as designBackupRoutes } from "./design-backup-routes";
import { vpnManager } from "./vpn/vpn-manager";
import { detectTimezoneFromIP, getTimezoneOffset } from "./timezone-detection-service";
import { 
  getMeetings, 
  getMeetingById, 
  createMeeting, 
  updateMeeting, 
  deleteMeeting,
  concludeMeeting,
  getCommitments,
  getUserPendingCommitments,
  getCommitmentTasks,
  getUserCommitmentTasks,
  completeCommitmentTask,
  createCommitment,
  updateCommitment,
  deleteCommitment,
  getDashboardStats,
  getUpcomingMeetings,
  syncMeetingToGoogleCalendar,
  sendCommitmentReminder,
  escalateCommitment,
  getMeetingTasks,
  getCommitmentTasks,
  enableMeetingRecording,
  processAIMeetingNotes,
  updateAIGeneratedContent,
  getAIMeetingNotes,
  generateGoogleMeetLink,
  generateAINotesFromContent,
  analyzeGoogleCalendarEvent,
  getMeetingAnalytics,
  processGeminiMeetingNotes,
  checkNewMeetingConflicts,
  checkUpdateMeetingConflicts
} from "./meetings-routes";

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
  
  // Register ONLY the OAuth callback route BEFORE authentication middleware
  // This prevents the OAuth callback from going through passport session middleware
  const { callbackRouter, handleOAuthCallback } = await import('./google-calendar-routes');
  app.use('/api', callbackRouter);
  console.log('Google Calendar OAuth callback registered (pre-auth)');
  
  // Add direct OAuth callback route to handle Google redirects at /auth/google/callback
  // This handles the OAuth without redirecting, allowing popups to close properly
  app.get('/auth/google/callback', handleOAuthCallback);
  
  // Agent file download (no auth required — Windows PC needs this)
  app.get('/downloads/solidworks_extractor.py', (req: any, res: any) => {
    const path = require('path');
    const fs = require('fs');
    const filePath = path.join(process.cwd(), 'client', 'public', 'solidworks_extractor.py');
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    res.setHeader('Content-Disposition', 'attachment; filename="solidworks_extractor.py"');
    res.setHeader('Content-Type', 'text/x-python');
    res.sendFile(filePath);
  });

  // Register sample Excel download route BEFORE authentication to avoid middleware issues
  app.get('/api/customers/sample-excel', async (req: any, res: any) => {
    try {
      console.log('Sample Excel download requested (pre-auth)');
      
      const { buildExcelBuffer } = await import('./excel-utils');

      const sampleData = [
        {
          'BP Code': 'C001',
          'BP Name': 'ACME Corporation',
          'Contact Person': 'John Smith',
          'E-Mail': 'john.smith@acme.com',
          'Bill_To_Address': '123 Business St, Suite 100, New York, NY 10001',
          'Ship_To_Address': '456 Warehouse Ave, Brooklyn, NY 11201',
          'Continent': 'North America',
          'Country Name': 'United States'
        },
        {
          'BP Code': 'C002',
          'BP Name': 'Global Industries Ltd',
          'Contact Person': 'Sarah Johnson',
          'E-Mail': 'sarah.j@globalind.com',
          'Bill_To_Address': '789 Corporate Blvd, London, UK SW1A 1AA',
          'Ship_To_Address': '321 Distribution Center, Manchester, UK M1 1AA',
          'Continent': 'Europe',
          'Country Name': 'United Kingdom'
        },
        {
          'BP Code': 'C003',
          'BP Name': 'Tech Solutions Pvt Ltd',
          'Contact Person': 'Raj Patel',
          'E-Mail': 'raj.patel@techsol.in',
          'Bill_To_Address': 'Plot 45, IT Park, Bangalore, Karnataka 560001',
          'Ship_To_Address': 'Warehouse 12, Electronic City, Bangalore 560100',
          'Continent': 'Asia',
          'Country Name': 'India'
        }
      ];

      const excelBuffer = await buildExcelBuffer('Customer Data', sampleData, [12, 30, 20, 25, 40, 40, 15, 15]);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=customer_import_sample.xlsx');
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error generating sample Excel file:', error);
      return res.status(500).json({
        message: "An error occurred while generating the sample file",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Register master items sample Excel download route BEFORE authentication
  app.get('/api/master-items/sample-excel', async (req: any, res: any) => {
    try {
      console.log('Master items sample Excel download requested (pre-auth)');

      const { buildExcelBuffer: buildBuf2 } = await import('./excel-utils');

      const sampleData = [
        { 'Item Code': 'PUMP-001', 'Description': 'Centrifugal Pump 100HP', 'UOM': 'Nos', 'Make/Buy': 'Buy', 'Drawing No': 'DWG-PUMP-001' },
        { 'Item Code': 'VALVE-002', 'Description': 'Gate Valve DN150 PN16', 'UOM': 'Nos', 'Make/Buy': 'Buy', 'Drawing No': 'DWG-VALVE-002' },
        { 'Item Code': 'PIPE-003', 'Description': 'Carbon Steel Pipe 6" Sch40', 'UOM': 'Meter', 'Make/Buy': 'Buy', 'Drawing No': 'DWG-PIPE-003' },
        { 'Item Code': 'TANK-004', 'Description': 'Storage Tank 1000L SS316', 'UOM': 'Nos', 'Make/Buy': 'Make', 'Drawing No': 'DWG-TANK-004' },
        { 'Item Code': 'MOTOR-005', 'Description': 'Electric Motor 50HP 415V', 'UOM': 'Nos', 'Make/Buy': 'Buy', 'Drawing No': 'DWG-MOTOR-005' }
      ];

      const excelBuffer = await buildBuf2('Master Items', sampleData, [15, 30, 10, 12, 20]);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=master_items_sample.xlsx');
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error generating master items sample Excel file:', error);
      return res.status(500).json({
        message: "An error occurred while generating the sample file",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Register project items sample Excel download route BEFORE authentication
  app.get('/api/projects/items/sample-excel', async (req: any, res: any) => {
    try {
      console.log('Project items sample Excel download requested (pre-auth)');

      const { buildExcelBuffer: buildBuf3 } = await import('./excel-utils');

      const sampleData = [
        { 'Item Code': 'PUMP-CPS-001', 'Description': 'Centrifugal Pump for CPS System 100HP', 'Quantity': 2, 'UOM': 'Nos', 'Make/Buy': 'Buy', 'Drawing No': 'DWG-CPS-PUMP-001' },
        { 'Item Code': 'VLV-GATE-002', 'Description': 'Gate Valve DN150 PN16 Carbon Steel', 'Quantity': 8, 'UOM': 'Nos', 'Make/Buy': 'Buy', 'Drawing No': 'DWG-CPS-VLV-002' },
        { 'Item Code': 'PIPE-CS-003', 'Description': 'Carbon Steel Pipe 6" Sch40 ASTM A106 Gr.B', 'Quantity': 120, 'UOM': 'Meter', 'Make/Buy': 'Buy', 'Drawing No': 'DWG-CPS-PIPE-003' },
        { 'Item Code': 'TANK-SS-004', 'Description': 'Storage Tank 2000L SS316L Vertical', 'Quantity': 1, 'UOM': 'Nos', 'Make/Buy': 'Make', 'Drawing No': 'DWG-CPS-TANK-004' },
        { 'Item Code': 'MTR-ELEC-005', 'Description': 'Electric Motor 75HP 415V 50Hz IE3', 'Quantity': 3, 'UOM': 'Nos', 'Make/Buy': 'Buy', 'Drawing No': 'DWG-CPS-MTR-005' }
      ];

      const excelBuffer = await buildBuf3('Project Items', sampleData, [18, 40, 10, 12, 15, 25]);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=project_items_sample.xlsx');
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error generating project items sample Excel file:', error);
      return res.status(500).json({
        message: "An error occurred while generating the sample file",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Register item components sample Excel download route BEFORE authentication
  app.get('/api/master-items/components/sample-excel', async (req: any, res: any) => {
    try {
      console.log('Item components sample Excel download requested (pre-auth)');

      const { buildExcelBuffer: buildBuf4 } = await import('./excel-utils');

      const sampleData = [
        { 'Item Code': 'BOLT-M12X40', 'Quantity': 8, 'Description': 'Hex Bolt M12x40 SS316', 'UOM': 'Nos', 'Make/Buy': 'Buy', 'Drawing No': 'STD-BOLT-M12' },
        { 'Item Code': 'GSKT-DN100-PTFE', 'Quantity': 2, 'Description': 'PTFE Gasket DN100 PN16', 'UOM': 'Nos', 'Make/Buy': 'Buy', 'Drawing No': 'STD-GSKT-100' },
        { 'Item Code': 'STUD-M16X60', 'Quantity': 12, 'Description': 'Threaded Stud M16x60 A2-70', 'UOM': 'Nos', 'Make/Buy': 'Buy', 'Drawing No': 'STD-STUD-M16' },
        { 'Item Code': 'NUT-M16-HEX', 'Quantity': 24, 'Description': 'Hex Nut M16 SS316', 'UOM': 'Nos', 'Make/Buy': 'Buy', 'Drawing No': 'STD-NUT-M16' },
        { 'Item Code': 'WSH-M16-SPRING', 'Quantity': 24, 'Description': 'Spring Washer M16 SS316', 'UOM': 'Nos', 'Make/Buy': 'Buy', 'Drawing No': 'STD-WSH-M16' }
      ];

      const excelBuffer = await buildBuf4('Component Items', sampleData, [20, 10, 35, 8, 12, 18]);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=item_components_sample.xlsx');
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error generating item components sample Excel file:', error);
      return res.status(500).json({
        message: "An error occurred while generating the sample file",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  setupAuth(app);

  // PRIORITY ENDPOINTS — previously in index.ts before auth (B-02 fix), now behind auth
  app.get('/api/quality/final-dossier/test', ensureAuthenticated, (req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.json({ message: 'Final Dossier API routes are working correctly', timestamp: new Date().toISOString() });
  });

  app.get('/api/quality/final-dossier/check/:inspectionOrderNumber', ensureAuthenticated, async (req: any, res: any) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const { checkExistingFinalDossier } = await import('./utils/final-dossier-generator');
      const result = await checkExistingFinalDossier(req.params.inspectionOrderNumber);
      res.json(result);
    } catch (error: any) {
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: 'Failed to check final dossier', message: error.message });
    }
  });

  app.post('/api/quality/final-dossier/generate/:inspectionOrderId', ensureAuthenticated, async (req: any, res: any) => {
    try {
      const inspectionOrderId = parseInt(req.params.inspectionOrderId);
      res.setHeader('Content-Type', 'application/json');
      const { generateFinalDossier } = await import('./utils/final-dossier-generator');
      const result = await generateFinalDossier(inspectionOrderId);
      res.json({ success: true, message: 'Final dossier generated successfully', url: result.url, path: result.path });
    } catch (error: any) {
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: 'Failed to generate final dossier', message: error.message });
    }
  });

  app.get('/api/quality/final-dossier/migration/status', ensureAuthenticated, async (req: any, res: any) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const { checkMigrationStatus } = await import('./utils/final-dossier-migration');
      const result = await checkMigrationStatus();
      res.json(result);
    } catch (error: any) {
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: 'Failed to check migration status', message: error.message });
    }
  });

  app.post('/api/quality/final-dossier/migration/execute', ensureAuthenticated, async (req: any, res: any) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      const { migrateFinalDossierFiles } = await import('./utils/final-dossier-migration');
      const result = await migrateFinalDossierFiles();
      res.json({ success: true, message: 'Migration completed', summary: result });
    } catch (error: any) {
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ error: 'Failed to execute migration', message: error.message });
    }
  });

  app.get('/api/finance/write-offs/invoice/:invoiceId', ensureAuthenticated, async (req: any, res: any) => {
    try {
      const { invoiceId } = req.params;
      const { pool } = await import('./db');
      const query = `
        SELECT wo.id, wo.invoice_id as "invoiceId", i.invoice_number as "invoiceNumber",
          c.bp_name as "customerName", wo.amount, i.total_amount as "originalInvoiceAmount",
          wo.reason, wo.notes, wo.date_created as "dateCreated", wo.created_by,
          u.username as "createdByName", wo.status, wo.approved_by,
          wo.approval_date as "approvalDate", i.currency
        FROM write_offs wo
        LEFT JOIN invoices i ON wo.invoice_id = i.id
        LEFT JOIN customers c ON i.customer_id = c.id
        LEFT JOIN users u ON wo.created_by = u.id
        WHERE wo.invoice_id = $1
        ORDER BY wo.date_created DESC
      `;
      const result = await pool.query(query, [parseInt(invoiceId)]);
      const formattedResults = result.rows.map((row: any) => ({
        id: row.id, invoiceId: row.invoiceId,
        invoiceNumber: row.invoiceNumber || 'Unknown',
        customerName: row.customerName || 'Unknown Customer',
        amount: row.amount, originalInvoiceAmount: row.originalInvoiceAmount || '0',
        reason: row.reason, notes: row.notes, dateCreated: row.dateCreated,
        createdBy: { id: row.created_by, name: row.createdByName || 'Unknown' },
        status: row.status,
        approvedBy: row.approved_by ? { id: row.approved_by, name: 'Approver' } : null,
        approvalDate: row.approvalDate, currency: row.currency || 'USD'
      }));
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json(formattedResults);
    } catch (error) {
      console.error('Error fetching write-offs for invoice:', error);
      res.status(500).json({ error: 'Failed to fetch write-offs for invoice' });
    }
  });

  console.log('🔒 SECURITY: Priority endpoints registered after setupAuth with ensureAuthenticated');

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
  setupCommercialChangeOrderRoutes(app);

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
      sendError(res, error);
    }
  });

  // PUT update plant cost
  app.put('/api/plant-costs/:id', ensureAuthenticated, async (req: any, res: any) => {
    try {
      console.log('Direct plant costs PUT route hit for ID:', req.params.id);
      const { capacity, priceUSD } = req.body;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      
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
      sendError(res, error);
    }
  });

  // POST create plant cost
  app.post('/api/plant-costs', ensureAuthenticated, async (req: any, res: any) => {
    try {
      console.log('Direct plant costs POST route hit');
      const { capacity, priceUSD } = req.body;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      
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
      sendError(res, error);
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
      sendError(res, error);
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
  
  // Set up dispatch and shipping routes
  setupDispatchRoutes(app);
  
  // Set up engineering change routes
  setupEngineeringChangeRoutes(app);
  
  // Set up drawing-level ECR/ECN routes
  const { setupDrawingEcrEcnRoutes } = await import('./drawing-ecr-ecn-routes');
  setupDrawingEcrEcnRoutes(app);

  // Design Data Sheets
  const designDataRouter = (await import('./design-data-routes')).default;
  app.use('/api/drawing-design-data', designDataRouter);

  // Drawing Verification System
  const drawingVerificationRouter = (await import('./drawing-verification-routes')).default;
  app.use('/api/drawing-revisions', drawingVerificationRouter);
  
  // Set up project item detail routes (drawings, ECR/ECN per project item)
  setupProjectItemDetailRoutes(app);

  setupEpcDocumentRoutes(app);
  setupDocumentControlRoutes(app);
  registerEpcPermissionRoutes(app);

  const { setupEpcMonitoringRoutes } = await import('./epc-monitoring-routes');
  setupEpcMonitoringRoutes(app);

  const { setupGcsDashboardRoutes } = await import('./gcs-dashboard-routes');
  setupGcsDashboardRoutes(app);

  const { startAutoSync } = await import('./gcs-dashboard-service');
  startAutoSync();

  const { setupEpcControlTowerRoutes } = await import('./epc-control-tower-routes');
  setupEpcControlTowerRoutes(app);
  
  app.use(pipelineRoutes);
  app.use(epcAssignmentRoutes);
  seedEpcAssignmentRules().catch(err => console.error('[EPC-Assignment] Seed failed:', err));

  // Set up after-sales module routes
  app.use('/api/after-sales', afterSalesRoutes);

  // Set up Multi-Agent Intelligence Layer routes
  app.use('/api/agents', ensureAuthenticated, agentRoutes);

  app.use('/api/epc-risks', ensureAuthenticated, epcRisksRoutes);

  // L1 Worker Agents routes
  app.use('/api/l1-workers', l1WorkerRoutes);
  app.use('/api/2fa', twoFactorRoutes);
  initializeAgentSystem().catch(err => console.error('[AgentSystem] Initialization error:', err));
  
  // Set up advance tax calculation routes
  app.use(advanceTaxRoutes);
  
  // Set up work location management routes
  app.use('/api', workLocationRoutes);
  console.log('Work location routes registered at /api/work-locations');
  
  // Set up attendance management routes
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/notifications', notificationRoutes);
  console.log('Attendance routes registered at /api/attendance');
  
  // Set up DWAR (Daily Work Activity Report) routes
  app.use('/api/dwar', dwarRoutes);
  console.log('DWAR routes registered at /api/dwar');
  app.use('/api/appraisals', appraisalRoutes);
  console.log('Employee Appraisal routes registered at /api/appraisals');
  
  // Set up Leave Management routes for users
  app.use('/api/leave', leaveRoutes);
  console.log('Leave routes registered at /api/leave');
  
  // Set up Payroll Management routes
  app.use('/api/payroll', payrollRoutes);
  app.use('/api/manual-salary', manualSalaryRoutes);
  app.use('/api/calendar-attendance', calendarAttendanceRoutes);
  app.use('/api/loan-advance', loanAdvanceRoutes);
  app.use('/api/statutory', statutoryComplianceRoutes);
  app.use('/api/company-tax', companyTaxRoutes);
  console.log('Payroll routes registered at /api/payroll');
  console.log('Statutory compliance routes registered at /api/statutory');
  console.log('Company tax routes registered at /api/company-tax');
  
  // Set up Salary Calculation Engine routes
  app.use('/api/salary-calculation', salaryCalculationRoutes);
  console.log('Salary calculation routes registered at /api/salary-calculation');

  // Set up Business Intelligence routes (Superuser only)
  app.use('/api/business-intelligence', businessIntelligenceRoutes);
  console.log('Business Intelligence routes registered at /api/business-intelligence');

  // LLM Prompt Engine routes registered at /api/llm
  app.use('/api/llm', llmRoutes);
  console.log('LLM Prompt Engine routes registered at /api/llm');

  // Agent Usage Tracker routes
  app.use('/api/usage-tracker', usageTrackerRoutes);
  console.log('Usage tracker routes registered at /api/usage-tracker');

  // Timezone Detection API
  app.get('/api/timezone/detect', ensureAuthenticated, async (req: any, res: any) => {
    try {
      console.log('🌍 Timezone detection endpoint hit');
      const timezoneInfo = detectTimezoneFromIP(req);
      const offset = getTimezoneOffset(timezoneInfo.timezone);
      
      console.log('🌍 Detected timezone info:', timezoneInfo);
      
      res.json({
        success: true,
        timezone: timezoneInfo,
        offset,
        serverTime: new Date().toISOString(),
        userLocalTime: new Date().toLocaleString('en-US', { timeZone: timezoneInfo.timezone })
      });
    } catch (error: any) {
      console.error('🌍 Error detecting timezone:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to detect timezone',
        message: error.message
      });
    }
  });
  console.log('Timezone detection endpoint registered at /api/timezone/detect');

  // Set up Business Trip Management routes
  app.get('/api/trips/user', ensureAuthenticated, tripManagementRoutes.getUserTrips);
  app.get('/api/trips/all', ensureAuthenticated, tripManagementRoutes.getAllTrips);
  app.get('/api/trips/dashboard', ensureAuthenticated, tripManagementRoutes.getTripDashboard);
  app.get('/api/trips/reports', ensureAuthenticated, tripManagementRoutes.getTripReports);
  app.get('/api/trips/:id', ensureAuthenticated, tripManagementRoutes.getTripById);
  app.post('/api/trips', ensureAuthenticated, tripManagementRoutes.createTrip);
  app.put('/api/trips/:id', ensureAuthenticated, tripManagementRoutes.updateTrip);
  app.delete('/api/trips/:id', ensureAuthenticated, tripManagementRoutes.deleteTrip);
  app.post('/api/trips/:id/submit', ensureAuthenticated, tripManagementRoutes.submitTrip);
  app.post('/api/trips/:id/approve', ensureAuthenticated, tripManagementRoutes.approveTrip);
  app.post('/api/trips/:id/conclude', ensureAuthenticated, tripManagementRoutes.concludeTrip);
  
  // Trip Document Management routes
  app.post('/api/trips/:tripId/documents', ensureAuthenticated, tripManagementRoutes.upload.single('file'), tripManagementRoutes.uploadTripDocument);
  app.get('/api/trips/:tripId/documents', ensureAuthenticated, tripManagementRoutes.getTripDocuments);
  app.delete('/api/trip-documents/:documentId', ensureAuthenticated, tripManagementRoutes.deleteTripDocument);
  app.get('/api/trip-documents/:documentId/download', ensureAuthenticated, tripManagementRoutes.downloadTripDocument);
  
  console.log('Business trip management routes registered at /api/trips');

  // Write-off approval now handled by /api/finance/write-offs/:id/approve below with proper auth

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
      sendError(res, error);
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
      sendError(res, error);
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
      sendError(res, error);
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
      sendError(res, error);
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
  
  // Set up CASPIAN payment filtering test endpoint
  app.use('/api', testCaspianEndpoint);
  console.log('CASPIAN payment test endpoint registered at /api/test/caspian-payments');
  
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
      
      const projectId = req.query.projectId as string;
      
      if (projectId && projectId !== 'all') {
        // Filter items by project
        console.log(`Filtering master items by project ID: ${projectId}`);
        
        // Get project items for the specified project
        const projectItems = await storage.getProjectItems(parseInt(projectId));
        console.log(`Found ${projectItems.length} project items for project ${projectId}`);
        
        if (projectItems.length === 0) {
          return res.json([]);
        }
        
        // Get the master items for these project items
        const itemIds = projectItems.map(item => item.itemId);
        const masterItems = await storage.getMasterItemsByIds(itemIds);
        console.log(`Returning ${masterItems.length} master items for project ${projectId}`);
        res.json(masterItems);
      } else {
        // Return all items
        const items = await storage.getAllMasterItems();
        res.json(items);
      }
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

  // Logout endpoint with auto-checkout
  app.post("/api/logout", async (req, res) => {
    try {
      const userId = (req.user as any)?.id;

      if (userId) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const now = new Date();
          const [openRecord] = await db
            .select()
            .from(attendanceRecords)
            .where(and(
              eq(attendanceRecords.userId, userId),
              eq(attendanceRecords.date, today),
              isNotNull(attendanceRecords.checkInTime),
              isNull(attendanceRecords.checkOutTime)
            ));

          if (openRecord) {
            const [userConfig] = await db.select({
              minimumDailyHours: usersTable.minimumDailyHours,
              halfDayMinimumHours: usersTable.halfDayMinimumHours,
              weeklyOffDays: usersTable.weeklyOffDays,
              dutyTimeIn: usersTable.dutyTimeIn,
              dutyTimeOut: usersTable.dutyTimeOut,
              allowedLateMinutes: usersTable.allowedLateMinutes,
              earlyExitMinutes: usersTable.earlyExitMinutes,
              workTimePolicy: usersTable.workTimePolicy,
            }).from(usersTable).where(eq(usersTable.id, userId));

            const statusResult = await determineAttendanceStatus({
              userId,
              date: today,
              checkInTime: new Date(openRecord.checkInTime!),
              checkOutTime: now,
              userConfig: {
                minimumDailyHours: userConfig?.minimumDailyHours,
                halfDayMinimumHours: userConfig?.halfDayMinimumHours,
                weeklyOffDays: userConfig?.weeklyOffDays as number[] | null,
                dutyTimeIn: userConfig?.dutyTimeIn,
                dutyTimeOut: userConfig?.dutyTimeOut,
                allowedLateMinutes: userConfig?.allowedLateMinutes,
                earlyExitMinutes: userConfig?.earlyExitMinutes,
                workTimePolicy: userConfig?.workTimePolicy,
              },
              workLocationId: openRecord.workLocationId,
            });

            await db.update(attendanceRecords).set({
              checkOutTime: now,
              workingHours: statusResult.workingHours.toFixed(2),
              netWorkingHours: statusResult.netWorkingHours.toFixed(2),
              overtimeHours: statusResult.overtimeHours.toFixed(2),
              status: statusResult.status,
              statusSource: statusResult.statusSource,
              isLateArrival: statusResult.isLateArrival,
              isEarlyDeparture: statusResult.isEarlyDeparture,
              employeeNotes: 'Auto-checkout on logout',
              updatedAt: now,
            }).where(eq(attendanceRecords.id, openRecord.id));
            console.log(`Auto-checkout on logout for user ${userId}: ${statusResult.workingHours.toFixed(2)}h, status: ${statusResult.status}`);
          }
        } catch (checkoutErr) {
          console.error('Auto-checkout on logout failed:', checkoutErr);
        }
      }

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

  app.get("/api/users/:id/statutory-applicability", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { resolveStatutoryApplicability } = await import('@shared/statutory-rules');
      const { employeeSalaries } = await import('@shared/schema');
      const { eq: eqOp } = await import('drizzle-orm');
      const { db: database } = await import('./db');

      const [salaryConfig] = await database.select().from(employeeSalaries).where(eqOp(employeeSalaries.userId, userId));
      const grossEarnings = salaryConfig ? parseFloat(salaryConfig.basicSalary || '0') + parseFloat(salaryConfig.hraAmount || '0') + parseFloat(salaryConfig.conveyanceAllowance || '0') + parseFloat(salaryConfig.specialAllowance || '0') + parseFloat(salaryConfig.ltaAmount || '0') : undefined;

      const result = resolveStatutoryApplicability({
        employeeType: (user as any).employeeType || null,
        grossEarnings,
        hasEpfNumber: !!(user as any).epfNo,
        hasPfConfigured: !!salaryConfig,
        role: user.role,
        tdsCategory: (user as any).employeeType === 'CONSULTANT' ? 'consultant' : (user as any).employeeType === 'INTERN' ? 'stipend' : 'salary',
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to resolve statutory applicability" });
    }
  });

  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const allowedRoles = ['Superuser', 'Admin', 'General Manager', 'Senior Manager', 'HR Manager', 'Finance Manager'];
    if (!allowedRoles.includes(req.user!.role)) {
      try {
        const { checkModulePermission } = await import('./utils/permission-utils');
        const hasFinance = await checkModulePermission(req.user!.id, 'Finance', 'view');
        const hasAdmin = await checkModulePermission(req.user!.id, 'Administration', 'view');
        if (!hasFinance && !hasAdmin) return res.sendStatus(403);
      } catch {
        return res.sendStatus(403);
      }
    }

    const users = await storage.getAllUsers();
    res.json(users.map(({ password: _pw, ...rest }) => rest));
  });

  // Optimized endpoint for user selection (dropdowns, etc.)
  app.get("/api/users/selection", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const users = await storage.getUsersForSelection();
      res.json(users);
    } catch (error) {
      console.error('Error fetching users for selection:', error);
      sendError(res, error);
    }
  });

  // Distinct roles from active users, ordered by hierarchy
  app.get("/api/users/roles", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const result = await db.execute(
        sql`SELECT DISTINCT role FROM users WHERE is_active = true AND role IS NOT NULL ORDER BY role`
      );
      const ROLE_HIERARCHY = ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Senior Executive', 'Employee'];
      const dbRoles = result.rows.map((r: any) => r.role as string);
      const ordered = [
        ...ROLE_HIERARCHY.filter(r => dbRoles.includes(r)),
        ...dbRoles.filter(r => !ROLE_HIERARCHY.includes(r)).sort(),
      ];
      res.json(ordered);
    } catch (error) {
      sendError(res, error);
    }
  });

  // Task Management Routes
  app.post("/api/tasks", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);

      const body = req.body;
      if (!body.dueDate && body.finishDate) {
        body.dueDate = body.finishDate;
      }
      const taskData = insertTaskSchema.parse({
        ...body,
        createdBy: req.user!.id,
        createdAt: new Date().toISOString(),
      });

      console.log('Creating new task:', taskData);
      const task = await storage.createTask(taskData);
      console.log('Created task:', task);

      if (task.assignedTo && task.assignedTo !== req.user!.id) {
        const { createNotification } = await import('./notification-routes');
        await createNotification({
          userId: task.assignedTo,
          type: 'task_assigned',
          title: `New Task Assigned: ${task.title}`,
          message: `A new task has been assigned to you by ${req.user!.fullName || req.user!.username}: "${task.title}"`,
          link: '/tasks',
          sourceType: 'task',
          sourceId: task.id,
          createdBy: req.user!.id,
        });
      }

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

        if (task.createdBy && task.createdBy !== req.user!.id) {
          const { createNotification } = await import('./notification-routes');
          await createNotification({
            userId: task.createdBy,
            type: 'task_completed',
            title: `Task Completed: ${task.title}`,
            message: `${req.user!.fullName || req.user!.username} has completed the task "${task.title}".`,
            link: '/tasks',
            sourceType: 'task',
            sourceId: task.id,
            createdBy: req.user!.id,
          });
        }
        
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

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);

      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (task.sourceType !== 'agent_task') {
        return res.status(403).json({ message: "Only agent-generated tasks can be deleted" });
      }

      const userRole = req.user!.role;
      if (userRole !== 'Superuser' && userRole !== 'General Manager') {
        return res.status(403).json({ message: "Only Superuser or General Manager can delete agent tasks" });
      }

      await db.execute(sql`DELETE FROM tasks WHERE id = ${taskId}`);
      console.log(`Agent task ${taskId} deleted by user ${req.user!.id}`);

      res.json({ success: true, message: "Task deleted" });
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to delete task"
      });
    }
  });

  app.post("/api/tasks/:id/submit-completion", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const taskId = parseInt(req.params.id);
      const userId = req.user!.id;
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });
      if (task.sourceType === 'agent_task') return res.status(403).json({ message: "Agent tasks cannot use this workflow" });
      if (task.assignedTo !== userId) return res.status(403).json({ message: "Only the assignee can mark this task as completed" });
      if (task.status === 'completed') return res.status(400).json({ message: "Task is already completed" });

      const now = new Date().toISOString();
      await db.update(tasks).set({
        status: 'completed',
        completedAt: now,
        completionRejectionReason: null,
      }).where(eq(tasks.id, taskId));

      await db.insert(taskHistory).values({
        taskId, userId, action: 'submit_completion', timestamp: now,
        oldValue: { status: task.status },
        newValue: { status: 'completed' },
      });

      if (task.createdBy && task.createdBy !== userId) {
        try {
          const { createNotification } = await import('./notification-routes');
          const assigneeName = req.user!.fullName || req.user!.firstName || req.user!.username;
          await createNotification({
            userId: task.createdBy,
            type: 'task_completed',
            title: `Task Completed: ${task.title}`,
            message: `${assigneeName} has marked task "${task.title}" as completed. Review and reject if not satisfied.`,
            link: '/tasks',
            sourceType: 'task',
            sourceId: taskId,
            createdBy: userId,
          });
        } catch (notifErr) {
          console.error('[Task] Completion notification failed:', notifErr);
        }
      }

      const updated = await storage.getTask(taskId);
      res.json(updated);
    } catch (error) {
      console.error('Error submitting task completion:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to submit completion" });
    }
  });

  app.post("/api/tasks/:id/reject-completion", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const taskId = parseInt(req.params.id);
      const userId = req.user!.id;
      const { reason } = req.body;
      if (!reason || !reason.trim()) return res.status(400).json({ message: "Rejection reason is mandatory" });

      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });
      if (task.sourceType === 'agent_task') return res.status(403).json({ message: "Agent tasks cannot use this workflow" });
      if (task.status !== 'completed') return res.status(400).json({ message: "Can only reject a completed task" });
      if (task.createdBy !== userId) return res.status(403).json({ message: "Only the task creator can reject completion" });
      if (task.createdBy === task.assignedTo) return res.status(400).json({ message: "Cannot reject your own self-assigned task" });

      const now = new Date().toISOString();
      await db.update(tasks).set({
        status: 'in_progress',
        completedAt: null,
        completionRejectionReason: reason.trim(),
      }).where(eq(tasks.id, taskId));

      await db.insert(taskHistory).values({
        taskId, userId, action: 'reject_completion', timestamp: now,
        oldValue: { status: 'completed' },
        newValue: { status: 'in_progress', rejectionReason: reason.trim() },
      });

      if (task.assignedTo) {
        try {
          const { createNotification } = await import('./notification-routes');
          const creatorName = req.user!.fullName || req.user!.firstName || req.user!.username;
          await createNotification({
            userId: task.assignedTo,
            type: 'task_rejection',
            title: `Completion Rejected: ${task.title}`,
            message: `${creatorName} rejected the completion of "${task.title}". Reason: ${reason.trim()}`,
            link: '/tasks',
            sourceType: 'task',
            sourceId: taskId,
            createdBy: userId,
          });
        } catch (notifErr) {
          console.error('[Task] Rejection notification failed:', notifErr);
        }
      }

      const updated = await storage.getTask(taskId);
      res.json(updated);
    } catch (error) {
      console.error('Error rejecting task completion:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to reject completion" });
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

  // Batch create tasks from LLM insights
  // Check for duplicate tasks before preview
  app.post("/api/tasks/check-duplicates", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);

      const { tasks } = req.body;
      if (!tasks || !Array.isArray(tasks)) {
        return res.status(400).json({ 
          success: false,
          message: "Tasks array is required" 
        });
      }

      const duplicateInfo = [];
      const nonDuplicates = [];

      for (let i = 0; i < tasks.length; i++) {
        try {
          // For tasks generated from LLM insights, set createdBy to Manager (ID = 1)
          const createdBy = tasks[i].sourceType === 'llm_insight' ? 1 : req.user!.id;
          
          // Check for duplicate task
          const duplicateTask = await storage.findDuplicateTask(
            tasks[i].title,
            createdBy,
            tasks[i].assignedTo || null,
            tasks[i].dueDate || null,
            tasks[i].sourceId || null
          );

          if (duplicateTask) {
            console.log(`Found duplicate for task "${tasks[i].title}" (existing task ID: ${duplicateTask.id})`);
            duplicateInfo.push({
              index: i,
              title: tasks[i].title,
              existingTaskId: duplicateTask.id,
              isDuplicate: true
            });
          } else {
            nonDuplicates.push({
              ...tasks[i],
              index: i,
              isDuplicate: false
            });
          }
        } catch (error) {
          console.error(`Error checking duplicate for task ${i + 1}:`, error);
          // If we can't check, assume it's not a duplicate to be safe
          nonDuplicates.push({
            ...tasks[i],
            index: i,
            isDuplicate: false
          });
        }
      }

      console.log(`Duplicate check complete: ${nonDuplicates.length} unique tasks, ${duplicateInfo.length} duplicates found`);

      res.json({
        success: true,
        totalTasks: tasks.length,
        uniqueTasks: nonDuplicates.length,
        duplicateCount: duplicateInfo.length,
        nonDuplicates,
        duplicates: duplicateInfo
      });
    } catch (error) {
      console.error('Error in duplicate check:', error);
      res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : "Failed to check duplicates" 
      });
    }
  });

  app.post("/api/tasks/batch-create", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);

      const { tasks } = req.body;
      if (!tasks || !Array.isArray(tasks)) {
        return res.status(400).json({ 
          success: false,
          message: "Tasks array is required" 
        });
      }

      if (tasks.length === 0) {
        return res.status(400).json({ 
          success: false,
          message: "At least one task is required" 
        });
      }

      if (tasks.length > 50) {
        return res.status(400).json({ 
          success: false,
          message: "Maximum 50 tasks can be created at once" 
        });
      }

      console.log(`Batch creating ${tasks.length} tasks from LLM insight by user ${req.user!.username} (will be assigned to Manager)`);

      const createdTasks = [];
      const errors = [];
      const skippedDuplicates = [];

      for (let i = 0; i < tasks.length; i++) {
        try {
          // For tasks generated from LLM insights, set createdBy to Manager (ID = 1)
          const createdBy = tasks[i].sourceType === 'llm_insight' ? 1 : req.user!.id;
          
          const taskInput = tasks[i];
          if (!taskInput.dueDate && taskInput.finishDate) {
            taskInput.dueDate = taskInput.finishDate;
          }
          const taskData = insertTaskSchema.parse({
            ...taskInput,
            createdBy: createdBy,
            createdAt: new Date().toISOString(),
            status: 'pending'
          });

          // Check for duplicate task before creating
          const duplicateTask = await storage.findDuplicateTask(
            taskData.title,
            taskData.createdBy,
            taskData.assignedTo || null,
            taskData.dueDate || null,
            taskData.sourceId || null
          );

          if (duplicateTask) {
            console.log(`Skipping duplicate task ${i + 1}/${tasks.length}: "${taskData.title}" (existing task ID: ${duplicateTask.id})`);
            skippedDuplicates.push({
              index: i,
              title: taskData.title,
              existingTaskId: duplicateTask.id,
              message: 'Task already exists with same title, creator, and assignee'
            });
            continue;
          }

          const task = await storage.createTask(taskData);
          createdTasks.push(task);

          if (task.assignedTo && task.assignedTo !== req.user!.id) {
            const { createNotification } = await import('./notification-routes');
            await createNotification({
              userId: task.assignedTo,
              type: 'task_assigned',
              title: `New Task Assigned: ${task.title}`,
              message: `A new task has been assigned to you by ${req.user!.fullName || req.user!.username}: "${task.title}"`,
              link: '/tasks',
              sourceType: 'task',
              sourceId: task.id,
              createdBy: req.user!.id,
            });
          }
          
          console.log(`Created task ${i + 1}/${tasks.length}: ${task.title}`);
        } catch (error) {
          console.error(`Error creating task ${i + 1}:`, error);
          errors.push({
            index: i,
            title: tasks[i]?.title || 'Unknown task',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      if (createdTasks.length === 0 && skippedDuplicates.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No tasks could be created",
          errors
        });
      }

      const totalProcessed = createdTasks.length + skippedDuplicates.length;
      let message = '';
      
      if (createdTasks.length > 0 && skippedDuplicates.length > 0) {
        message = `Created ${createdTasks.length} tasks, skipped ${skippedDuplicates.length} duplicates`;
      } else if (createdTasks.length > 0) {
        message = `Successfully created ${createdTasks.length} tasks`;
      } else if (skippedDuplicates.length > 0) {
        message = `All ${skippedDuplicates.length} tasks were duplicates and skipped`;
      }

      console.log(`Task creation complete: ${createdTasks.length} created, ${skippedDuplicates.length} duplicates skipped, ${errors.length} errors`);

      res.status(201).json({
        success: true,
        message,
        created: createdTasks.length,
        skipped: skippedDuplicates.length,
        total: tasks.length,
        tasks: createdTasks,
        duplicates: skippedDuplicates.length > 0 ? skippedDuplicates : undefined,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error('Error in batch task creation:', error);
      res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : "Failed to create tasks" 
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
    res.json(subordinates.map(({ password: _pw, ...rest }) => rest));
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      console.log('Registration attempt for role:', req.body.role);

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
          
          if (!pattern.nextGenerationDate) {
            const firstScheduled = storage.calculateFirstScheduledDate(
              pattern as any,
              new Date(pattern.startDate)
            );
            const firstScheduledStr = firstScheduled.toISOString().split('T')[0];
            console.log(`📝 Setting nextGenerationDate based on pattern schedule: ${firstScheduledStr} (start_date was ${pattern.startDate})`);
            await storage.updateRecurringPattern(pattern.id, {
              nextGenerationDate: firstScheduledStr
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

  // Recurring pattern processing is now handled by the Communications Agent
  // The manual endpoint at /api/process-recurring-patterns remains available for emergency use

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

  // Customer Order Document routes
  app.use('/api/customer-order-documents', customerOrderDocumentRoutes);
  console.log('Customer Order Document routes registered at /api/customer-order-documents');

  // GCS Retention Cleanup (admin-only, admin-triggered)
  const requireRole = (maxRole: number) => (req: any, res: any, next: any) => {
    if (!req.user || req.user.role > maxRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
  registerRetentionRoutes(app, ensureAuthenticated, requireRole);
  console.log('GCS Retention Cleanup endpoints registered at /api/admin/gcs-retention');

  // Simple visa test routes
  const simpleVisaRoutes = await import('./simple-visa-routes');
  app.use('/api/visa-test', simpleVisaRoutes.default);
  console.log('Simple visa test routes registered at /api/visa-test');

  // Visa Management routes
  app.use('/api/visa', visaManagementRoutes);
  console.log('Visa Management routes registered at /api/visa');

  // Schengen 180-Day Rule Tracker routes
  app.use('/api/schengen', schengenRoutes);
  console.log('Schengen 180-Day Rule Tracker routes registered at /api/schengen');

  // Legal Management routes
  app.use('/api/legal', legalManagementRoutes);
  console.log('Legal Management routes registered at /api/legal');

  // =============================================================================
  // MEETINGS & COMMITMENTS MODULE ROUTES
  // =============================================================================
  
  // Meeting Commitments endpoints (MUST come before parameterized routes)
  app.get('/api/meetings/commitments', ensureAuthenticated, getCommitments);
  app.get('/api/meetings/commitments/pending', ensureAuthenticated, getUserPendingCommitments);
  app.get('/api/meetings/commitments/tasks', ensureAuthenticated, getCommitmentTasks);
  app.get('/api/meetings/commitments/user-tasks', ensureAuthenticated, getUserCommitmentTasks);
  app.post('/api/meetings/commitments/tasks/:taskId/complete', ensureAuthenticated, completeCommitmentTask);
  app.post('/api/meetings/commitments', ensureAuthenticated, createCommitment);
  app.put('/api/meetings/commitments/:id', ensureAuthenticated, updateCommitment);
  app.delete('/api/meetings/commitments/:id', ensureAuthenticated, deleteCommitment);
  
  // Dashboard and Analytics endpoints (MUST come before parameterized routes)
  app.get('/api/meetings/dashboard/stats', ensureAuthenticated, getDashboardStats);
  app.get('/api/meetings/dashboard/upcoming', ensureAuthenticated, getUpcomingMeetings);
  
  // Business Meetings endpoints (parameterized routes come LAST)
  app.get('/api/meetings', ensureAuthenticated, getMeetings);
  app.get('/api/meetings/:id', ensureAuthenticated, getMeetingById);
  app.post('/api/meetings', ensureAuthenticated, createMeeting);
  app.put('/api/meetings/:id', ensureAuthenticated, updateMeeting);
  app.delete('/api/meetings/:id', ensureAuthenticated, deleteMeeting);
  app.post('/api/meetings/:id/conclude', ensureAuthenticated, concludeMeeting);
  
  // Reminder and Escalation endpoints
  app.post('/api/meetings/commitments/:commitmentId/remind', ensureAuthenticated, sendCommitmentReminder);
  app.post('/api/meetings/commitments/:commitmentId/escalate', ensureAuthenticated, escalateCommitment);
  
  // Task Integration endpoints
  app.get('/api/meetings/:meetingId/tasks', ensureAuthenticated, getMeetingTasks);
  app.get('/api/meetings/commitment-tasks', ensureAuthenticated, getCommitmentTasks);
  
  // Google Meet Integration endpoints
  app.post('/api/meetings/:id/generate-meet', ensureAuthenticated, generateGoogleMeetLink);
  app.post('/api/meetings/:id/sync-to-calendar', ensureAuthenticated, syncMeetingToGoogleCalendar);
  
  // AI Meeting Notes endpoints
  app.post('/api/meetings/:id/recording/enable', ensureAuthenticated, enableMeetingRecording);
  app.post('/api/meetings/:id/ai-notes/process', ensureAuthenticated, processAIMeetingNotes);
  app.put('/api/meetings/:id/ai-notes/update', ensureAuthenticated, updateAIGeneratedContent);
  app.get('/api/meetings/:id/ai-notes', ensureAuthenticated, getAIMeetingNotes);
  
  // Enhanced AI Meeting Notes endpoints
  app.post('/api/meetings/:id/ai-notes/generate', ensureAuthenticated, generateAINotesFromContent);
  app.post('/api/meetings/ai-notes/analyze-calendar-event', ensureAuthenticated, analyzeGoogleCalendarEvent);
  app.post('/api/meetings/ai-notes/process-gemini', ensureAuthenticated, processGeminiMeetingNotes);
  app.get('/api/meetings/analytics', ensureAuthenticated, getMeetingAnalytics);
  
  // Calendar Conflict Detection endpoints (MUST come before parameterized routes)
  app.post('/api/meetings/check-conflicts', ensureAuthenticated, checkNewMeetingConflicts);
  app.post('/api/meetings/:id/check-update-conflicts', ensureAuthenticated, checkUpdateMeetingConflicts);
  
  console.log('Meetings & Commitments routes registered at /api/meetings');
  
  // =============================================================================
  // MD MEETING PLAN AUTOMATION
  // =============================================================================
  
  const { 
    generateWeeklyMDMeetings, 
    generateMonthlyMDMeetings, 
    getMDMeetingPlanOverview,
    previewWeeklyMDMeetings,
    previewMonthlyMDMeetings
  } = await import('./md-meeting-templates');
  
  app.post('/api/meetings/md/preview-weekly', ensureAuthenticated, previewWeeklyMDMeetings);
  app.post('/api/meetings/md/preview-monthly', ensureAuthenticated, previewMonthlyMDMeetings);
  app.post('/api/meetings/md/generate-weekly', ensureAuthenticated, generateWeeklyMDMeetings);
  app.post('/api/meetings/md/generate-monthly', ensureAuthenticated, generateMonthlyMDMeetings);
  app.get('/api/meetings/md/plan-overview', ensureAuthenticated, getMDMeetingPlanOverview);
  
  console.log('MD Meeting Plan automation routes registered at /api/meetings/md');
  
  // =============================================================================
  // EMPLOYEE PLANNING AUTOMATION
  // =============================================================================
  
  const { 
    generateWeeklyEmployeeMeetings, 
    getEmployeePlanOverview,
    getEmployeeTimeAllocation,
    previewWeeklyEmployeeMeetings
  } = await import('./employee-planning-service');
  
  app.post('/api/meetings/employee/preview-weekly', ensureAuthenticated, previewWeeklyEmployeeMeetings);
  app.post('/api/meetings/employee/generate-weekly', ensureAuthenticated, generateWeeklyEmployeeMeetings);
  app.get('/api/meetings/employee/plan-overview', ensureAuthenticated, getEmployeePlanOverview);
  app.get('/api/meetings/employee/time-allocation', ensureAuthenticated, getEmployeeTimeAllocation);
  
  console.log('Employee Planning automation routes registered at /api/meetings/employee');
  
  // Register main Google Calendar routes (with authentication required)
  const googleCalendarRoutes = (await import('./google-calendar-routes')).default;
  app.use('/api', googleCalendarRoutes);
  console.log('Google Calendar integration routes registered at /api');

  // Set up Design Management routes
  app.use('/api/design', designManagementRoutes);
  console.log('Design Management routes registered at /api/design');
  
  // Set up design review routes
  app.use('/api/design/reviews', designReviewRoutes);
  console.log('Design Review routes registered at /api/design/reviews');
  
  // Set up design drawing routes
  app.use('/api/design', designDrawingRoutes);
  console.log('Design Drawing routes registered at /api/design');
  
  // Set up design basic drawings routes
  app.use('/api/design/basic-drawings', designBasicDrawingRoutes);
  console.log('Design Basic Drawing routes registered at /api/design/basic-drawings');
  
  // Set up design standards routes
  app.use('/api/design', designStandardsRoutes);
  console.log('Design Standards routes registered at /api/design');

  // Set up design transmittal routes
  app.use('/api/design', designTransmittalRoutes);
  console.log('Design Transmittal routes registered at /api/design');
  
  // Set up design project items routes
  const designProjectItemsRoutes = (await import('./design-project-items-routes')).default;
  app.use('/api/design/project-items', designProjectItemsRoutes);
  console.log('Design Project Items routes registered at /api/design/project-items');

  // Set up design backup routes
  app.use('/api/design/backups', designBackupRoutes);
  console.log('Design Backup routes registered at /api/design/backups');

  // =============================================================================
  // SAP B1 INTEGRATION ROUTES
  // =============================================================================
  
  const sapB1Routes = (await import('./sap-b1-integration/sap-routes')).default;
  app.use('/api/sap', sapB1Routes);
  console.log('SAP B1 integration routes registered at /api/sap');

  // SAP B1 authentication routes
  const sapAuthRoutes = (await import('./sap-b1-integration/sap-auth-routes')).default;
  app.use('/api/sap/b1', sapAuthRoutes);
  console.log('SAP B1 auth routes registered at /api/sap/b1');

  // SAP B1 purchase document routes
  const sapPurchaseDocumentRoutes = (await import('./sap-b1-integration/sap-purchase-routes')).default;
  app.use('/api/sap/b1/purchase', sapPurchaseDocumentRoutes);
  console.log('SAP B1 purchase routes registered at /api/sap/b1/purchase');

  // SAP B1 Middleware Connector Routes (for receiving synced data)
  const { middlewareRoutes } = await import('./sap-b1-integration/middleware-routes');
  app.use('/api/sap/middleware', middlewareRoutes);
  console.log('SAP B1 middleware integration routes registered at /api/sap/middleware');

  // Lead Generation routes  
  app.use('/api/lead-generation', ensureAuthenticated, leadGenerationRoutes);
  console.log('Lead Generation routes registered at /api/lead-generation');

  // Opportunity Radar routes
  app.use('/api/radar', ensureAuthenticated, radarRoutes);
  console.log('Opportunity Radar routes registered at /api/radar');

  // Google Ads routes
  app.use('/api/google-ads', googleAdsRoutes);
  console.log('Google Ads routes registered at /api/google-ads');

  // =============================================================================
  // VPN MANAGER INITIALIZATION (for SAP B1 Integration)
  // =============================================================================
  
  // Check VPN manager status
  const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
  if (vpnEnabled) {
    console.log('🔐 VPN enabled for SAP B1 integration - VPN manager is ready');
    const vpnStatus = vpnManager.getStatus();
    if (vpnStatus.connected) {
      console.log('✅ VPN manager connected successfully for SAP B1 integration');
    } else {
      console.log('⚠️ VPN manager is enabled but not yet connected - attempting connection...');
      try {
        const connected = await vpnManager.connect();
        if (connected) {
          console.log('✅ VPN connection established successfully');
        } else {
          console.warn('⚠️ VPN connection failed - SAP B1 connectivity may be limited');
        }
      } catch (error) {
        console.error('❌ VPN connection error:', error);
      }
    }
  } else {
    console.log('ℹ️ VPN disabled for SAP B1 integration - using direct connection mode');
  }

  // ── EPC SolidWorks Extraction Agent API ─────────────────────────────────────
  const { default: epcSlddrwJobRoutes } = await import('./epc-slddrw-job-routes');
  app.use('/api', epcSlddrwJobRoutes);
  console.log('EPC SolidWorks extraction agent routes registered');

  const httpServer = createServer(app);
  
  // Extend timeout for SAP B1 integration routes - default is 2 minutes, extend to 6 minutes
  httpServer.timeout = 360000; // 6 minutes in milliseconds
  httpServer.keepAliveTimeout = 370000; // 6+ minutes for keep-alive
  httpServer.headersTimeout = 380000; // Slightly longer than keep-alive
  
  console.log('⏱️ HTTP server timeouts extended for SAP B1 integration: 6 minutes');
  
  return httpServer;
}