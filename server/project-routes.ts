import { sendError, sendValidationError, sendNotFound, sendPermissionError, sendBusinessError } from './utils/error-response';
import express, { Request, Response } from 'express';
import mssql from 'mssql';
import { sapSession } from './sap-b1-integration/sap-central-session';
import { storage } from './storage';
import { 
  insertProjectSchema, 
  insertProjectPhaseSchema,
  insertProjectMemberSchema,
  insertDeliverableSchema,
  insertProjectTaskSchema,
  insertPhaseApprovalSchema,
  insertProjectDocumentSchema,
  insertProjectItemSchema,
  insertCustomerSchema,
  workOrders,
  inspectionOrders,
  projectWorkflowEvents,
  itemPlanningRecords,
  procurementExecutionRecords,
  productionExecutionRecords,
  qualityPlanningRecords,
  poPreparationRecords,
  woPreparationRecords,
  inspectionExecutionRecords,
  epcPurchaseOrders,
  epcPurchaseOrderItems,
  epcWorkOrders,
  epcWorkOrderItems,
  epcDispatchReadiness,
  epcDispatchRecords,
  epcCommissioningReadiness,
  epcDrawingControls,
  epcBomHeaders,
  epcBomLines,
  epcBillingReadiness,
  epcInvoices,
  projects,
  customers,
  bomGatingBypassLog,
  projectItems as projectItemsSchema,
  projectCommercialSnapshots,
} from '@shared/schema';
import { canManage, roleHierarchy } from '@shared/roles';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from './db';
import { checkModulePermissionMiddleware } from './middlewares/auth';
import { createEpcTask, createEpcAlert, createEpcAlertMulti, markTasksObsolete, resolveAssignee, resolveProjectCode, resolveManagerId } from './epc-task-helpers';
import { resolveEpcAssignee } from './epc-assignment-engine';
import { checkModulePermission, requirePageAccess, requireProjectMembership, checkProjectMembership, buildOwnershipWhereClause, checkRecordOwnership, lookupCreatorDepartment, denyRecordAccess, enforceWriteOwnership, type OwnershipFilterConfig } from './utils/permission-utils';
import { agentEventBus } from './agents/framework/event-bus';
import * as epcCoding from './epc-coding';
import { markAttachmentsSuperseded } from './epc-document-routes';
import { isFeatureFlagEnabled } from './utils/epc-migration-helpers';
import { executeProjectCancellationCascade, executeProjectRestorationCascade, isProjectFrozen, isProjectTerminal, ON_HOLD_STATUS } from './utils/epc-project-cascade';
import { reconcileBomSupersession } from './utils/epc-bom-reconciliation';
import { isDwgGateRequired } from './utils/epc-dwg-linking';
import { triggerInspectionOnPoIssuance, triggerInspectionOnWoRelease } from './utils/epc-inspection-trigger';

function requireMinRole(req: Request, res: Response, minRole: string): boolean {
  const userRole = (req.user as any)?.role;
  if (!userRole || roleHierarchy[userRole] === undefined || roleHierarchy[minRole] === undefined) {
    sendPermissionError(res, `Insufficient permissions. Required role: ${minRole} or above.`);
    return false;
  }
  if (roleHierarchy[userRole] > roleHierarchy[minRole]) {
    sendPermissionError(res, `Insufficient permissions. Required role: ${minRole} or above. Your role: ${userRole}.`);
    return false;
  }
  return true;
}

/**
 * EPC Project Naming Governance v2 — canonical display name assembly.
 * Format: {project_code} — {customer_name} — {offer_subject}
 * The em dash (—) is the ONLY permitted separator. No hyphens.
 * project_display_name is READ-ONLY outside Project Master.
 */
function computeProjectDisplayName(code: string, customerName: string, offerSubject: string): string {
  const c = (code || '').trim();
  const n = (customerName || '').trim();
  const d = (offerSubject || '').trim();
  const parts = [c, n, d].filter(Boolean);
  return parts.join(' \u2014 ');
}

// Helper function to validate a user is authenticated
function ensureAuthenticated(req: Request, res: Response, next: express.NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'You must be logged in to access this resource' });
}

async function guardProjectNotFrozen(projectId: number, res: Response): Promise<boolean> {
  const result = await pool.query(`SELECT status FROM projects WHERE id = $1`, [projectId]);
  if (result.rows.length === 0) return true;
  const status = result.rows[0].status;
  if (isProjectFrozen(status)) {
    const label = status === 'canceled' ? 'canceled' : 'on hold';
    sendBusinessError(res, `Project is ${label} — no new records or status changes allowed.`);
    return false;
  }
  return true;
}

async function guardCostNotLocked(projectId: number, res: Response): Promise<boolean> {
  const result = await pool.query(`SELECT cost_lock_status FROM projects WHERE id = $1`, [projectId]);
  if (result.rows.length === 0) return true;
  const lockStatus = (result.rows[0] as any).cost_lock_status || 'unlocked';
  if (lockStatus === 'approved') {
    sendBusinessError(res, 'Cost is approved and locked — project items and BOMs cannot be modified. A Manager must unlock first.');
    return false;
  }
  return true;
}

async function guardRecordCostNotLocked(table: string, recordId: number, res: Response): Promise<boolean> {
  const projectId = await resolveProjectIdFromRecord(table, 'id', recordId);
  if (!projectId) return true;
  return guardCostNotLocked(projectId, res);
}

async function resolveProjectIdFromRecord(table: string, idColumn: string, recordId: number): Promise<number | null> {
  const projectIdLookups: Record<string, string> = {
    'item_planning_records': `SELECT pi.project_id FROM item_planning_records ipr JOIN project_items pi ON pi.id = ipr.project_item_id WHERE ipr.id = $1`,
    'quality_planning_records': `SELECT qpr.project_id FROM quality_planning_records qpr WHERE qpr.id = $1`,
    'inspection_execution_records': `SELECT ie.project_id FROM inspection_execution_records ie WHERE ie.id = $1`,
    'po_preparation_records': `SELECT ppr.project_id FROM po_preparation_records ppr WHERE ppr.id = $1`,
    'wo_preparation_records': `SELECT wpr.project_id FROM wo_preparation_records wpr WHERE wpr.id = $1`,
    'epc_purchase_orders': `SELECT pi.project_id FROM epc_purchase_orders epo JOIN project_items pi ON pi.id = epo.project_item_id WHERE epo.id = $1`,
    'epc_work_orders': `SELECT pi.project_id FROM epc_work_orders ewo JOIN project_items pi ON pi.id = ewo.project_item_id WHERE ewo.id = $1`,
    'epc_dispatch_readiness': `SELECT pi.project_id FROM epc_dispatch_readiness edr JOIN project_items pi ON pi.id = edr.project_item_id WHERE edr.id = $1`,
    'epc_dispatch_records': `SELECT pi.project_id FROM epc_dispatch_records edr JOIN project_items pi ON pi.id = edr.project_item_id WHERE edr.id = $1`,
    'epc_commissioning_readiness': `SELECT project_id FROM epc_commissioning_readiness WHERE id = $1`,
    'epc_billing_readiness': `SELECT project_id FROM epc_billing_readiness WHERE id = $1`,
    'epc_invoices': `SELECT project_id FROM epc_invoices WHERE id = $1`,
    'epc_drawing_controls': `SELECT project_id FROM epc_drawing_controls WHERE id = $1`,
    'epc_bom_headers': `SELECT pi.project_id FROM epc_bom_headers ebh JOIN project_items pi ON pi.id = ebh.project_item_id WHERE ebh.id = $1`,
    'epc_bom_lines': `SELECT pi.project_id FROM epc_bom_lines ebl JOIN epc_bom_headers ebh ON ebh.id = ebl.bom_header_id JOIN project_items pi ON pi.id = ebh.project_item_id WHERE ebl.id = $1`,
  };
  const query = projectIdLookups[table];
  if (!query) return null;
  const r = await pool.query(query, [recordId]);
  return r.rows[0]?.project_id || null;
}

async function guardRecordProjectNotFrozen(table: string, recordId: number, res: Response): Promise<boolean> {
  const projectId = await resolveProjectIdFromRecord(table, 'id', recordId);
  if (!projectId) return true;
  return guardProjectNotFrozen(projectId, res);
}

/** Fetch GlblLocNum directly from SAP SQL Server — reliable, bypasses Service Layer OData limits. */
async function querySapGstin(cardCode: string): Promise<string | null> {
  const cfg: mssql.config = {
    server:   process.env.SAP_SERVER || '192.168.1.100',
    database: process.env.SAP_COMPANY_DB || 'TPEL_LIVE',
    user:     process.env.SAP_B1_USERNAME || 'Manager',
    password: process.env.SAP_B1_PASSWORD || '',
    options:  { trustServerCertificate: true, enableArithAbort: true },
    connectionTimeout: 8000,
    requestTimeout:    8000,
  };
  const pool = new mssql.ConnectionPool(cfg);
  try {
    await pool.connect();
    const req = pool.request();
    req.input('CardCode', mssql.VarChar(20), cardCode);
    const res = await req.query<{ GlblLocNum: string | null }>(
      'SELECT GlblLocNum FROM OCRD WHERE CardCode = @CardCode',
    );
    const val = res.recordset[0]?.GlblLocNum;
    return (val && val.trim()) ? val.trim() : null;
  } finally {
    pool.close().catch(() => {});
  }
}

export function setupProjectRoutes(app: express.Express) {
  // Project Routes
  app.get('/api/projects', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const showTest = req.query.showTest === 'true';
      const projects = await storage.getUserProjects(userId, showTest);
      res.json(projects);
    } catch (error) {
      console.error('Error fetching projects:', error);
      sendError(res, error);
    }
  });

  app.patch('/api/projects/:id/test-flag', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (user?.role !== 'Superuser') {
        return res.status(403).json({ error: 'Only Superuser can change test flag' });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { isTest } = req.body;
      if (typeof isTest !== 'boolean') return res.status(400).json({ error: 'isTest must be boolean' });
      await storage.setProjectTestFlag(id, isTest);
      res.json({ success: true });
    } catch (error) {
      console.error('Error setting project test flag:', error);
      sendError(res, error);
    }
  });
  
  app.get('/api/projects/item-counts', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const rows = await db.execute(sql`
        SELECT project_id, COUNT(*)::int as item_count 
        FROM project_items 
        GROUP BY project_id
      `);
      const counts: Record<number, number> = {};
      for (const row of rows.rows) {
        counts[row.project_id as number] = row.item_count as number;
      }
      res.json(counts);
    } catch (error) {
      sendError(res, error);
    }
  });

  // Get next project number for a financial year
  app.get('/api/projects/next-code/:financialYear', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const financialYear = req.params.financialYear;
      
      const yearCode = financialYear;
      
      const userId = req.user!.id;
      const allProjects = await storage.getUserProjects(userId);
      
      const regex = new RegExp(`^${yearCode}-(\\d+)$`);
      const matchingProjects = allProjects.filter(project => regex.test(project.code));
      
      let highestNumber = 0;
      matchingProjects.forEach(project => {
        const matches = project.code.match(regex);
        if (matches && matches.length > 1) {
          const projectNumber = parseInt(matches[1]);
          if (projectNumber > highestNumber) {
            highestNumber = projectNumber;
          }
        }
      });
      
      const nextNumber = highestNumber + 1;
      const nextCode = `${yearCode}-${nextNumber}`;
      
      res.json({ nextCode });
    } catch (error) {
      console.error('Error generating next project code:', error);
      sendError(res, error);
    }
  });

  app.get('/api/projects/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log('Fetching project with ID:', req.params.id);
      
      // Use the raw project ID directly - don't parse it as a number
      const projectId = req.params.id;
      console.log('Project ID type:', typeof projectId);
      console.log('Project ID for lookup:', projectId);
      
      let project;
      
      // Check if it's a numeric ID or a project code
      if (/^\d+$/.test(projectId)) {
        // If it's a pure number, treat as a database ID
        project = await storage.getProject(parseInt(projectId));
        console.log("Looking up by numeric ID");
      } else {
        // Otherwise it might be a project code (like "2025-1")
        console.log("Looking up by project code");
        const allProjects = await storage.getAllProjects();
        project = allProjects.find(p => p.code === projectId);
      }
      
      if (!project) {
        console.log('Project not found for identifier:', projectId);
        return res.status(404).json({ error: 'Project not found' });
      }
      
      console.log('Project found:', project.id, project.code);
      res.json(project);
    } catch (error) {
      console.error(`Error fetching project ${req.params.id}:`, error);
      res.status(500).json({ 
        error: 'Failed to fetch project details',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/projects', 
    ensureAuthenticated, 
    checkModulePermissionMiddleware('Project Management', 'create'), 
    async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { continentCode, countryCode, fyCode } = req.body;

      if (!continentCode || !epcCoding.validateContinentCode(continentCode)) {
        return res.status(400).json({ error: `Invalid continent_code. Must be one of: ${Object.keys(epcCoding.CONTINENT_CODES).join(', ')}` });
      }
      if (!countryCode || !epcCoding.validateCountryCode(countryCode)) {
        return res.status(400).json({ error: `Invalid country_code. Must be a valid ISO 3166-1 alpha-2 code.` });
      }
      if (!fyCode || !epcCoding.validateFyCode(fyCode)) {
        return res.status(400).json({ error: `Invalid fy_code. Must be 4-digit YYZZ format (e.g., 2526).` });
      }
      if (!req.body.customerId) {
        return res.status(400).json({ error: 'customerId is required for project creation.' });
      }

      const project = await db.transaction(async (tx) => {
        const { projectCode, projectSeq } = await epcCoding.generateOperationalCode(
          continentCode, countryCode, req.body.customerId, fyCode, tx
        );

        // Governance: resolve customerName from customers table (SSOT)
        const custRows = await tx.select({ bpName: customers.bpName }).from(customers).where(eq(customers.id, req.body.customerId)).limit(1);
        const resolvedCustomerName = (custRows[0]?.bpName || req.body.clientName || '').trim();
        // offer_subject comes from the offer subject field (passed as offerSubject or name)
        const resolvedOfferSubject = (req.body.offerSubject || req.body.shortDescription || req.body.name || '').trim();
        const resolvedDisplayName = computeProjectDisplayName(projectCode, resolvedCustomerName, resolvedOfferSubject);

        const projectData = insertProjectSchema.parse({
          ...req.body,
          code: projectCode,
          continentCode,
          countryCode,
          fyCode,
          projectSeq,
          financialYear: fyCode,
          createdBy: userId,
          managerId: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          // Governance v2 fields
          offerSubject: resolvedOfferSubject,
          customerName: resolvedCustomerName,
          projectDisplayName: resolvedDisplayName,
          name: resolvedOfferSubject || req.body.name,
        });

        const [created] = await tx.insert(projects).values(projectData).returning();
        return created;
      });
      
      // Add creator as a project manager
      await storage.addProjectMember({
        projectId: project.id,
        userId,
        role: 'project_manager',
        assignedDate: new Date(),
        isActive: true,
        visibilityScope: 'project_all'
      });

      // Auto-add all active users from core project departments
      const AUTO_DEPARTMENTS = ['Design', 'Projects', 'Production', 'Quality Control'];
      const AUTO_ROLES = ['Employee', 'Senior Executive', 'Manager', 'Senior Manager'];
      const autoMemberRows = await db.execute(
        sql`SELECT id, role FROM users
            WHERE is_active = true
              AND department = ANY(${AUTO_DEPARTMENTS}::text[])
              AND role = ANY(${AUTO_ROLES}::text[])
              AND id != ${userId}`
      );
      for (const u of autoMemberRows.rows as any[]) {
        const memberRole = u.role === 'Senior Manager' ? 'senior_manager'
                         : u.role === 'Manager' ? 'manager'
                         : 'team_member';
        try {
          await storage.addProjectMember({
            projectId: project.id,
            userId: u.id,
            role: memberRole,
            assignedDate: new Date(),
            isActive: true,
            visibilityScope: 'project_all'
          });
        } catch (_) { /* skip duplicates */ }
      }
      console.log(`[PROJECT_INIT] Auto-added ${autoMemberRows.rows.length} team members from core departments to project ${project.id}`);

      // Create default EPC lifecycle phases (6 phases) with department-based leads
      const epcPhases = [
        { name: 'Design & Engineering', description: 'Engineering design, drawings, and technical documentation', department: 'Design' },
        { name: 'Procurement', description: 'Material procurement, vendor selection, and purchase orders', department: 'Purchase' },
        { name: 'Manufacturing', description: 'Fabrication, assembly, and shop-floor production', department: 'Production' },
        { name: 'Quality Control & Inspection', description: 'Quality checks, inspections, and testing', department: 'Quality Control' },
        { name: 'Dispatch & Logistics', description: 'Packing, dispatch, and shipping coordination', department: 'Administration' },
        { name: 'Installation & Commissioning', description: 'Site installation, commissioning, and handover', department: 'After Sales' },
      ];
      let startDate = new Date(project.startDate);
      
      const projectDuration = new Date(project.targetEndDate).getTime() - startDate.getTime();
      const phaseDuration = projectDuration / epcPhases.length;

      const deptLeadRows = await db.execute(
        sql`SELECT DISTINCT ON (department) id, department, role
            FROM users
            WHERE is_active = true AND department IS NOT NULL
              AND role IN ('Senior Manager', 'Manager', 'General Manager', 'Senior Executive')
            ORDER BY department,
              CASE role WHEN 'Senior Manager' THEN 1 WHEN 'Manager' THEN 2 WHEN 'General Manager' THEN 3 WHEN 'Senior Executive' THEN 4 END`
      );
      const deptLeadMap: Record<string, number> = {};
      for (const row of deptLeadRows.rows as any[]) {
        deptLeadMap[row.department] = row.id;
      }
      
      for (let i = 0; i < epcPhases.length; i++) {
        const phaseStartDate = new Date(startDate.getTime() + (i * phaseDuration));
        const phaseEndDate = new Date(phaseStartDate.getTime() + phaseDuration);
        const leadId = deptLeadMap[epcPhases[i].department] || userId;
        
        await storage.createProjectPhase({
          projectId: project.id,
          name: epcPhases[i].name,
          description: epcPhases[i].description,
          order: i + 1,
          startDate: phaseStartDate,
          targetEndDate: phaseEndDate,
          status: 'pending',
          phaseLeadId: leadId
        });
      }
      
      agentEventBus.emit('project.created', {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        customerId: project.customerId,
        managerId: project.managerId,
        startDate: project.startDate,
        targetEndDate: project.targetEndDate,
        status: project.status,
        phasesCreated: phaseNames,
        createdBy: userId,
      }, 'project-routes');
      console.log(`[EventBus] project.created emitted — projectId=${project.id}, code=${project.code}, createdBy=${userId}`);

      res.status(201).json(project);
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(400).json({ error: 'Failed to create project', details: error.message });
    }
  });

  app.put('/api/projects/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized to update the project
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to update this project' });
      }
      
      // Update project data
      // Create a clean copy of the request body without problematic fields
      const { updatedAt, createdAt, ...cleanRequestBody } = req.body;
      
      // Base update data
      // Filter out fields that don't exist in the database table
      const validColumns = [
        'name', 'description', 'code', 'status', 'priority', 
        'client_name', 'client_contact', 'client_email', 
        'start_date', 'target_end_date', 'actual_end_date',
        'estimated_budget', 'actual_cost', 'currency', 'progress',
        'manager_id', 'created_by', 'notes', 'tags', 'financial_year',
        'customer_id', 'discipline_code', 'mdmt',
        'inspection_by', 'voltage_frequency',
        // Governance v2 fields (project_display_name is read-only — never accepted raw from client)
        'offer_subject', 'customer_name', 'project_display_name',
      ];
      
      // Create a clean update object containing only valid fields
      const updateData: any = {};
      Object.keys(cleanRequestBody).forEach(key => {
        // Convert camelCase keys to snake_case for comparison
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (validColumns.includes(snakeKey)) {
          updateData[key] = cleanRequestBody[key];
        }
      });
      
      // Pass through dates as strings - they'll be handled by the storage.updateProject method
      if (updateData.startDate) {
        console.log("startDate type:", typeof updateData.startDate);
        console.log("startDate value:", updateData.startDate);
        // Don't try to convert to Date, pass as-is
      }
      
      if (updateData.targetEndDate) {
        console.log("targetEndDate type:", typeof updateData.targetEndDate);
        console.log("targetEndDate value:", updateData.targetEndDate);
        // Don't try to convert to Date, pass as-is
      }
      
      // Add updated timestamp as ISO string
      updateData.updatedAt = new Date();
      
      console.log("Final clean update data:", updateData);

      // Governance v2: recompute project_display_name whenever source fields change
      if (updateData.offerSubject !== undefined || updateData.shortDescription !== undefined || updateData.customerName !== undefined || updateData.name !== undefined) {
        const newOfferSubject = (updateData.offerSubject ?? updateData.shortDescription ?? project.offerSubject ?? project.name ?? '').trim();
        const newCustName = (updateData.customerName ?? project.customerName ?? project.clientName ?? '').trim();
        const newCode = project.code;
        if (newCode && (newCustName || newOfferSubject)) {
          updateData.projectDisplayName = computeProjectDisplayName(newCode, newCustName, newOfferSubject);
          updateData.offerSubject = newOfferSubject;
          delete updateData.shortDescription; // remove legacy alias to avoid confusing Drizzle
          updateData.customerName = newCustName;
          if (newOfferSubject) updateData.name = newOfferSubject;
        }
      }

      const oldStatus = project.status;
      const newStatus = updateData.status;

      if (newStatus && newStatus !== oldStatus) {
        const userRole = req.user?.role || '';
        const userLevel = roleHierarchy[userRole];

        if (isProjectTerminal(oldStatus)) {
          if (userLevel !== 0) {
            return res.status(403).json({ error: 'Only Superuser can reopen a canceled project.' });
          }
          if (!['on_hold', 'planning'].includes(newStatus)) {
            return res.status(400).json({ error: 'A canceled project can only be moved to On Hold or Planning.' });
          }
          if (!req.body.reopenReason || typeof req.body.reopenReason !== 'string' || req.body.reopenReason.trim().length < 10) {
            return res.status(400).json({ error: 'A reopen reason of at least 10 characters is required.' });
          }
        }
        if (newStatus === 'canceled') {
          if (userLevel === undefined || userLevel > 2) {
            return res.status(403).json({ error: 'Only Senior Manager, General Manager, or Superuser can cancel a project.' });
          }
          if (!req.body.cancelReason || typeof req.body.cancelReason !== 'string' || req.body.cancelReason.trim().length < 10) {
            return res.status(400).json({ error: 'A cancellation reason of at least 10 characters is required.' });
          }
          const validCancellationTypes = ['commercial', 'technical', 'customer_request', 'force_majeure', 'other'];
          if (!req.body.cancellationType || !validCancellationTypes.includes(req.body.cancellationType)) {
            return res.status(400).json({ error: 'A valid cancellation type is required (commercial, technical, customer_request, force_majeure, other).' });
          }
        }
      }

      const updatedProject = await storage.updateProject(projectId, updateData);

      if (newStatus && newStatus !== oldStatus) {
        agentEventBus.emit('project.status_changed', {
          projectId,
          projectCode: project.code,
          projectName: project.name,
          oldStatus,
          newStatus,
          changedBy: userId,
        }, 'project-routes');
        console.log(`[EventBus] project.status_changed emitted — projectId=${projectId}, ${oldStatus} → ${newStatus}, changedBy=${userId}`);

        if (oldStatus === 'canceled' && (newStatus === 'on_hold' || newStatus === 'planning')) {
          try {
            const reopenReason = req.body.reopenReason?.trim() || '';
            const reopenNote = `[REOPENED ${new Date().toISOString().slice(0,10)}] by ${req.user?.username || 'unknown'} → ${newStatus}: ${reopenReason}`;
            const existingNotes = project.notes || '';
            await storage.updateProject(projectId, { notes: existingNotes ? `${existingNotes}\n\n${reopenNote}` : reopenNote });

            await pool.query(`
              INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
              VALUES ($1, 'project.reopened', $2, $3, NOW(), true)
            `, [projectId, JSON.stringify({
              reopenReason, reopenedBy: userId, reopenedByName: req.user?.username,
              previousStatus: oldStatus, newStatus,
            }), String(userId)]);

            if (newStatus === 'planning') {
              const restoreResult = await executeProjectRestorationCascade(projectId, userId);
              console.log(`[EPC-Restore] Restoration cascade completed for project ${project.code}`);
              return res.json({ ...updatedProject, restoreResult });
            }
            return res.json(updatedProject);
          } catch (reopenErr) {
            console.error(`[EPC-Restore] Error during reopen for project ${projectId}:`, reopenErr);
            return res.json({ ...updatedProject, reopenWarning: 'Project status updated but restoration had errors. Check logs.' });
          }
        }

        if (oldStatus === 'on_hold' && newStatus === 'planning') {
          try {
            const restoreResult = await executeProjectRestorationCascade(projectId, userId);
            if (!restoreResult.alreadyRestored) {
              console.log(`[EPC-Restore] Restoration cascade completed for project ${project.code} (on_hold → planning)`);
            }
            return res.json({ ...updatedProject, restoreResult });
          } catch (restoreErr) {
            console.error(`[EPC-Restore] Error during on_hold→planning restore for project ${projectId}:`, restoreErr);
            return res.json({ ...updatedProject, reopenWarning: 'Status updated but restoration had errors. Check logs.' });
          }
        }

        if (newStatus === 'canceled') {
          try {
            const cancelReason = req.body.cancelReason?.trim() || '';
            if (cancelReason) {
              const cancelNote = `[CANCELED ${new Date().toISOString().slice(0,10)}] by ${req.user?.username || 'unknown'}: ${cancelReason}`;
              const existingNotes = project.notes || '';
              await storage.updateProject(projectId, { notes: existingNotes ? `${existingNotes}\n\n${cancelNote}` : cancelNote });
              await pool.query(`
                INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
                VALUES ($1, 'project.canceled', $2, $3, NOW(), true)
              `, [projectId, JSON.stringify({
                cancelReason, canceledBy: userId, canceledByName: req.user?.username,
                previousStatus: oldStatus
              }), String(userId)]);
            }
            const cancellationType = req.body.cancellationType?.trim() || 'other';
            const cascadeResult = await executeProjectCancellationCascade(projectId, userId, cancellationType, cancelReason);
            console.log(`[EPC-Cascade] Cancellation cascade completed for project ${project.code}`);
            return res.json({ ...updatedProject, cascadeResult });
          } catch (cascadeErr) {
            console.error(`[EPC-Cascade] Error during cancellation cascade for project ${projectId}:`, cascadeErr);
            return res.json({ ...updatedProject, cascadeWarning: 'Project status updated but cascade had errors. Check logs.' });
          }
        }
      }

      res.json(updatedProject);
    } catch (error) {
      console.error(`Error updating project ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update project', details: error.message });
    }
  });

  // ── Admin: backfill display names for all projects ────────────────────────
  app.post('/api/admin/projects/backfill-display-names', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if ((req.user as any)?.role !== 'Superuser') {
        return res.status(403).json({ error: 'Only Superuser can run the backfill.' });
      }
      const result = await pool.query(`
        WITH cust AS (
          SELECT
            p.id,
            COALESCE(NULLIF(p.customer_name, ''), c.bp_name, p.client_name, '') AS cname,
            COALESCE(NULLIF(p.offer_subject, ''), p.name, '')                   AS osubj
          FROM projects p
          LEFT JOIN customers c ON p.customer_id = c.id
        )
        UPDATE projects p
        SET
          customer_name        = cust.cname,
          offer_subject        = cust.osubj,
          project_display_name = p.code
            || ' \u2014 ' || cust.cname
            || ' \u2014 ' || cust.osubj
        FROM cust
        WHERE p.id = cust.id
      `);
      return res.json({ success: true, rowsUpdated: result.rowCount });
    } catch (err) {
      console.error('[Backfill] project display names failed:', err);
      return res.status(500).json({ error: 'Backfill failed', details: (err as Error).message });
    }
  });

  app.get('/api/projects/:id/cancellation-report', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

      const snapshots = await pool.query(`
        SELECT module, table_name, record_id, status_before, status_after, key_data,
               restoration_eligible, restored, cancellation_type, cancelled_at, restored_at
        FROM project_cancellation_snapshots
        WHERE project_id = $1
        ORDER BY cancelled_at DESC, id
      `, [projectId]);

      const cancelEvent = await pool.query(`
        SELECT event_payload, emitted_at, emitted_by FROM project_workflow_events
        WHERE project_id = $1 AND event_name = 'project_cancellation_cascade'
        ORDER BY emitted_at DESC LIMIT 1
      `, [projectId]);

      const grouped: Record<string, any[]> = {};
      for (const s of snapshots.rows) {
        if (!grouped[s.module]) grouped[s.module] = [];
        grouped[s.module].push(s);
      }

      const summary = {
        totalRecords: snapshots.rows.length,
        canceled: snapshots.rows.filter((s: any) => s.status_after === 'canceled').length,
        onHold: snapshots.rows.filter((s: any) => s.status_after === ON_HOLD_STATUS).length,
        restored: snapshots.rows.filter((s: any) => s.restored).length,
        pendingReview: snapshots.rows.filter((s: any) => !s.restoration_eligible && !s.restored).length,
      };

      res.json({
        projectId,
        cancellationType: cancelEvent.rows[0]?.event_payload?.cancellationType || null,
        cancellationReason: cancelEvent.rows[0]?.event_payload?.cancellationReason || null,
        cancelledAt: cancelEvent.rows[0]?.emitted_at || null,
        cancelledBy: cancelEvent.rows[0]?.emitted_by || null,
        summary,
        modules: grouped,
        snapshots: snapshots.rows,
      });
    } catch (error) {
      console.error('Error fetching cancellation report:', error);
      sendError(res, error);
    }
  });

  // Project Phases Routes
  app.get('/api/projects/:projectId/phases', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectIdParam = req.params.projectId;
      
      // Get the project first to ensure it exists
      const project = await storage.getProject(projectIdParam);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Use the numeric ID from the project record
      const projectId = project.id;
      
      const phases = await storage.getProjectPhases(projectId);
      res.json(phases);
    } catch (error) {
      console.error(`Error fetching phases for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  app.get('/api/phases/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.id);
      const phase = await storage.getProjectPhase(phaseId);
      
      if (!phase) {
        return res.status(404).json({ error: 'Project phase not found' });
      }

      const user = req.user as any;
      const { isMember } = await checkProjectMembership(user.id, user.role, phase.projectId);
      if (!isMember) return res.status(403).json({ error: "Access denied", code: "PROJECT_ACCESS_DENIED" });
      
      res.json(phase);
    } catch (error) {
      console.error(`Error fetching phase ${req.params.id}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/phases', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to add phases to this project' });
      }
      
      const phaseData = insertProjectPhaseSchema.parse({
        ...req.body,
        projectId
      });
      
      const phase = await storage.createProjectPhase(phaseData);
      res.status(201).json(phase);
    } catch (error) {
      console.error(`Error creating phase for project ${req.params.projectId}:`, error);
      res.status(400).json({ error: 'Failed to create project phase', details: error.message });
    }
  });

  app.put('/api/phases/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Check if phase exists
      const phase = await storage.getProjectPhase(phaseId);
      if (!phase) {
        return res.status(404).json({ error: 'Project phase not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(phase.projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to update this phase' });
      }
      
      // Update phase data
      const updateData = {
        ...req.body,
        updatedAt: new Date()
      };
      
      const updatedPhase = await storage.updateProjectPhase(phaseId, updateData);
      res.json(updatedPhase);
    } catch (error) {
      console.error(`Error updating phase ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update project phase', details: error.message });
    }
  });

  // Project Members Routes
  app.get('/api/projects/:projectId/members', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Check if projectId is a valid number
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      const members = await storage.getProjectMembers(projectId);
      res.json(members);
    } catch (error) {
      console.error(`Error fetching members for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/members', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized — Superuser/Senior Manager bypass membership requirement
      const canAdminister = canManage(req.user!.role, 'Senior Manager');
      if (!canAdminister) {
        const projectMembers = await storage.getProjectMembers(projectId);
        const userMember = projectMembers.find(member =>
          member.userId === userId && (member.role === 'senior_manager' || member.role === 'project_manager')
        );
        if (!userMember) {
          return res.status(403).json({ error: 'Not authorized to add members to this project' });
        }
      }
      
      const memberData = insertProjectMemberSchema.parse({
        ...req.body,
        projectId,
        assignedDate: new Date() // Use Date object instead of string
      });
      
      const member = await storage.addProjectMember(memberData);
      res.status(201).json(member);
    } catch (error) {
      console.error(`Error adding member to project ${req.params.projectId}:`, error);
      res.status(400).json({ error: 'Failed to add project member', details: error.message });
    }
  });

  app.delete('/api/projects/:projectId/members/:userId', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const memberUserId = parseInt(req.params.userId);
      const currentUserId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized — Superuser/Senior Manager bypass membership requirement
      const canAdministerDel = canManage(req.user!.role, 'Senior Manager');
      if (!canAdministerDel && currentUserId !== memberUserId) {
        const projectMembersForDel = await storage.getProjectMembers(projectId);
        const userMember = projectMembersForDel.find(member =>
          member.userId === currentUserId && (member.role === 'senior_manager' || member.role === 'project_manager')
        );
        if (!userMember) {
          return res.status(403).json({ error: 'Not authorized to remove members from this project' });
        }
      }
      
      await storage.removeProjectMember(projectId, memberUserId);
      res.status(204).send();
    } catch (error) {
      console.error(`Error removing member from project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  app.put('/api/projects/:projectId/members/:userId', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const memberUserId = parseInt(req.params.userId);
      const currentUserId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized — Superuser/Senior Manager bypass membership requirement
      const canAdministerPut = canManage(req.user!.role, 'Senior Manager');
      if (!canAdministerPut) {
        const projectMembersForPut = await storage.getProjectMembers(projectId);
        const userMember = projectMembersForPut.find(member =>
          member.userId === currentUserId && (member.role === 'senior_manager' || member.role === 'project_manager')
        );
        if (!userMember) {
          return res.status(403).json({ error: 'Not authorized to update member roles in this project' });
        }
      }
      
      // Update member data
      const updateData = {
        ...req.body
      };
      
      const updatedMember = await storage.updateProjectMember(projectId, memberUserId, updateData);
      res.json(updatedMember);
    } catch (error) {
      console.error(`Error updating member in project ${req.params.projectId}:`, error);
      res.status(400).json({ error: 'Failed to update project member', details: error.message });
    }
  });

  // Deliverables Routes
  app.get('/api/phases/:phaseId/deliverables', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const deliverables = await storage.getPhaseDeliverables(phaseId);
      res.json(deliverables);
    } catch (error) {
      console.error(`Error fetching deliverables for phase ${req.params.phaseId}:`, error);
      sendError(res, error);
    }
  });

  app.get('/api/deliverables/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const deliverableId = parseInt(req.params.id);
      const deliverable = await storage.getDeliverable(deliverableId);
      
      if (!deliverable) {
        return res.status(404).json({ error: 'Deliverable not found' });
      }
      
      res.json(deliverable);
    } catch (error) {
      console.error(`Error fetching deliverable ${req.params.id}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/phases/:phaseId/deliverables', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const userId = req.user!.id;
      
      // Check if phase exists
      const phase = await storage.getProjectPhase(phaseId);
      if (!phase) {
        return res.status(404).json({ error: 'Project phase not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(phase.projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to add deliverables to this phase' });
      }
      
      const bodyWithDefaults = { ...req.body };
      if (!bodyWithDefaults.assignedTo && phase.phaseLeadId) {
        bodyWithDefaults.assignedTo = phase.phaseLeadId;
      }

      const deliverableData = insertDeliverableSchema.parse({
        ...bodyWithDefaults,
        phaseId,
        projectId: phase.projectId
      });
      
      const deliverable = await storage.createDeliverable(deliverableData);
      res.status(201).json(deliverable);
    } catch (error) {
      console.error(`Error creating deliverable for phase ${req.params.phaseId}:`, error);
      res.status(400).json({ error: 'Failed to create deliverable', details: error.message });
    }
  });

  app.put('/api/deliverables/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const deliverableId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      const deliverable = await storage.getDeliverable(deliverableId);
      if (!deliverable) {
        return res.status(404).json({ error: 'Deliverable not found' });
      }
      
      const projectMembers = await storage.getProjectMembers(deliverable.projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager') && userId !== deliverable.assignedTo) {
        return res.status(403).json({ error: 'Not authorized to update this deliverable' });
      }
      
      const updateData = {
        ...req.body,
        updatedAt: new Date()
      };
      
      const updatedDeliverable = await storage.updateDeliverable(deliverableId, updateData);

      const assignedTo = req.body.assignedTo;
      if (assignedTo) {
        try {
          const project = await storage.getProject(deliverable.projectId);
          const phase = await storage.getProjectPhase(deliverable.phaseId);
          const phaseName = phase?.name || 'Unknown Phase';
          const projectName = project?.projectName || 'Unknown Project';
          
          const taskStatusMap: Record<string, string> = {
            'pending': 'pending',
            'in_progress': 'in_progress',
            'submitted': 'in_progress',
            'approved': 'completed',
            'rejected': 'in_progress',
          };
          const taskStatus = taskStatusMap[req.body.status || deliverable.status] || 'pending';
          const dueDate = req.body.dueDate || deliverable.dueDate;
          const today = new Date().toISOString().split('T')[0];

          const existingTask = await pool.query(
            `SELECT id FROM tasks WHERE source_type = 'deliverable' AND source_id = $1 LIMIT 1`,
            [deliverableId]
          );

          if (existingTask.rows.length > 0) {
            await pool.query(
              `UPDATE tasks SET assigned_to = $1, status = $2, due_date = $3, finish_date = $4, 
               title = $5, description = $6
               WHERE source_type = 'deliverable' AND source_id = $7`,
              [
                assignedTo, taskStatus, dueDate, dueDate || today,
                `[Deliverable] ${updatedDeliverable.name}`,
                `Phase: ${phaseName} | Project: ${projectName}\n${updatedDeliverable.description || ''}`,
                deliverableId
              ]
            );
          } else {
            await pool.query(
              `INSERT INTO tasks (title, description, status, assigned_to, created_by, created_at, priority, start_date, finish_date, due_date, category, source_type, source_id, is_archived)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, false)`,
              [
                `[Deliverable] ${updatedDeliverable.name}`,
                `Phase: ${phaseName} | Project: ${projectName}\n${updatedDeliverable.description || ''}`,
                taskStatus, assignedTo, userId, today, 'medium',
                today, dueDate || today, dueDate || today,
                'EPC Deliverable', 'deliverable', deliverableId
              ]
            );
          }
        } catch (taskError) {
          console.error('Error creating/updating linked task for deliverable:', taskError);
        }
      }

      res.json(updatedDeliverable);
    } catch (error) {
      console.error(`Error updating deliverable ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update deliverable', details: error.message });
    }
  });

  // Project Tasks Routes
  app.get('/api/projects/:projectId/tasks', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const tasks = await storage.getProjectTasks(projectId);
      res.json(tasks);
    } catch (error) {
      console.error(`Error fetching tasks for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  app.get('/api/phases/:phaseId/tasks', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const tasks = await storage.getPhaseProjectTasks(phaseId);
      res.json(tasks);
    } catch (error) {
      console.error(`Error fetching tasks for phase ${req.params.phaseId}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/tasks', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;

      if (!(await guardProjectNotFrozen(projectId, res))) return;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to add tasks to this project' });
      }
      
      const taskData = insertProjectTaskSchema.parse({
        ...req.body,
        projectId
      });
      
      const task = await storage.createProjectTask(taskData);
      res.status(201).json(task);
    } catch (error) {
      console.error(`Error creating task for project ${req.params.projectId}:`, error);
      res.status(400).json({ error: 'Failed to create project task', details: error.message });
    }
  });

  // Phase Approvals Routes
  app.get('/api/phases/:phaseId/approvals', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const approvals = await storage.getPhaseApprovals(phaseId);
      res.json(approvals);
    } catch (error) {
      console.error(`Error fetching approvals for phase ${req.params.phaseId}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/phases/:phaseId/approvals', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const userId = req.user!.id;
      
      // Check if phase exists
      const phase = await storage.getProjectPhase(phaseId);
      if (!phase) {
        return res.status(404).json({ error: 'Project phase not found' });
      }
      
      // Check if user is authorized - only project managers can request approvals
      const projectMembers = await storage.getProjectMembers(phase.projectId);
      const userMember = projectMembers.find(member => 
        member.userId === userId && (member.role === 'senior_manager' || member.role === 'project_manager' || member.role === 'phase_lead')
      );
      
      if (!userMember && !canManage(req.user!.role, 'Senior Manager')) {
        return res.status(403).json({ error: 'Not authorized to request approvals for this phase' });
      }
      
      const approvalData = insertPhaseApprovalSchema.parse({
        ...req.body,
        phaseId,
        requestedAt: new Date()
      });
      
      const approval = await storage.createPhaseApproval(approvalData);
      res.status(201).json(approval);
    } catch (error) {
      console.error(`Error creating approval for phase ${req.params.phaseId}:`, error);
      res.status(400).json({ error: 'Failed to create phase approval', details: error.message });
    }
  });

  app.put('/api/approvals/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const approvalId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Get the approval
      const approval = await storage.getPhaseApproval(approvalId);
      if (!approval) {
        return res.status(404).json({ error: 'Approval not found' });
      }
      
      // Only the assigned approver can update the approval
      if (approval.approverId !== userId && !canManage(req.user!.role, 'Senior Manager')) {
        return res.status(403).json({ error: 'Not authorized to update this approval' });
      }
      
      // Update approval data
      const updateData = {
        ...req.body,
        respondedAt: req.body.status !== 'pending' ? new Date() : undefined
      };
      
      const updatedApproval = await storage.updatePhaseApproval(approvalId, updateData);
      
      // If approved and all approvals for this phase are complete, update phase status
      if (updateData.status === 'approved') {
        const phase = await storage.getProjectPhase(approval.phaseId);
        const allApprovals = await storage.getPhaseApprovals(approval.phaseId);
        
        const allApproved = allApprovals.every(a => a.status === 'approved');
        if (allApproved && phase) {
          await storage.updateProjectPhase(phase.id, {
            status: 'completed',
            actualEndDate: new Date()
          });
        }
      }
      
      res.json(updatedApproval);
    } catch (error) {
      console.error(`Error updating approval ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update approval', details: error.message });
    }
  });

  // Project Key Stages Routes
  app.get('/api/projects/:projectId/key-stages', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const keyStages = await storage.getProjectKeyStages(projectId);
      res.json(keyStages);
    } catch (error) {
      console.error(`Error fetching key stages for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });
  
  app.post('/api/projects/:projectId/key-stages', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      await guardProjectNotFrozen(projectId, res);
      const userId = req.user!.id;
      const { stageNumber, stageName, phase, description, isCompleted } = req.body;
      
      // Validate request
      if (stageNumber === undefined || stageName === undefined || !phase) {
        return res.status(400).json({ error: 'Stage number, name, and phase are required' });
      }
      
      const keyStage = await storage.createProjectKeyStage({
        project_id: projectId,
        stage_number: stageNumber,
        stage_name: stageName,
        phase: phase,
        description: description || null,
        is_completed: !!isCompleted,
        completed_by: isCompleted ? userId : null,
        completed_date: isCompleted ? new Date() : null
      });
      
      res.status(201).json(keyStage);
    } catch (error) {
      console.error(`Error creating key stage for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });
  
  app.patch('/api/projects/:projectId/key-stages/:stageId', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      await guardProjectNotFrozen(projectId, res);
      const stageId = parseInt(req.params.stageId);
      const userId = req.user!.id;
      const { isCompleted, stageName, stageNumber, phase, description } = req.body;
      
      // Check if we're updating just completion status or other fields
      if (isCompleted !== undefined && 
          stageName === undefined && 
          stageNumber === undefined && 
          phase === undefined && 
          description === undefined) {
        // Use dedicated method for setting completion status
        const keyStage = await storage.setKeyStageCompleted(stageId, userId, isCompleted);
        return res.json(keyStage);
      }
      
      // Create updates object with all provided fields using snake_case
      const updates: any = {};
      if (isCompleted !== undefined) {
        updates.is_completed = isCompleted;
        updates.completed_by = isCompleted ? userId : null;
        updates.completed_date = isCompleted ? new Date() : null;
      }
      
      if (stageName !== undefined) updates.stage_name = stageName;
      if (stageNumber !== undefined) updates.stage_number = stageNumber;
      if (phase !== undefined) updates.phase = phase;
      if (description !== undefined) updates.description = description;
      
      // Regular update for other fields
      const keyStage = await storage.updateProjectKeyStage(stageId, updates);
      
      res.json(keyStage);
    } catch (error) {
      console.error(`Error updating key stage ${req.params.stageId}:`, error);
      sendError(res, error);
    }
  });
  
  // Dedicated endpoint for marking a key stage as completed
  app.post('/api/projects/:projectId/key-stages/:stageId/complete', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      await guardProjectNotFrozen(projectId, res);
      const stageId = parseInt(req.params.stageId);
      const userId = req.user!.id;
      
      const keyStage = await storage.setKeyStageCompleted(stageId, userId, true);
      
      res.json(keyStage);
    } catch (error) {
      console.error(`Error marking key stage ${req.params.stageId} as completed:`, error);
      sendError(res, error);
    }
  });
  
  // Dedicated endpoint for marking a key stage as incomplete
  app.post('/api/projects/:projectId/key-stages/:stageId/incomplete', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      await guardProjectNotFrozen(projectId, res);
      const stageId = parseInt(req.params.stageId);
      const userId = req.user!.id;
      
      const keyStage = await storage.setKeyStageCompleted(stageId, userId, false);
      
      res.json(keyStage);
    } catch (error) {
      console.error(`Error marking key stage ${req.params.stageId} as incomplete:`, error);
      sendError(res, error);
    }
  });
  
  // Project Documents Routes
  app.get('/api/projects/:projectId/documents', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const documents = await storage.getProjectDocuments(projectId);
      res.json(documents);
    } catch (error) {
      console.error(`Error fetching documents for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  app.get('/api/phases/:phaseId/documents', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const phaseId = parseInt(req.params.phaseId);
      const documents = await storage.getPhaseDocuments(phaseId);
      res.json(documents);
    } catch (error) {
      console.error(`Error fetching documents for phase ${req.params.phaseId}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/documents', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      await guardProjectNotFrozen(projectId, res);
      const userId = req.user!.id;
      
      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to add documents to this project' });
      }
      
      const documentData = insertProjectDocumentSchema.parse({
        ...req.body,
        projectId,
        uploadedBy: userId,
        uploadedAt: new Date()
      });
      
      const document = await storage.createProjectDocument(documentData);
      res.status(201).json(document);
    } catch (error) {
      console.error(`Error creating document for project ${req.params.projectId}:`, error);
      res.status(400).json({ error: 'Failed to create project document', details: error.message });
    }
  });

  app.put('/api/documents/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Check if document exists
      const document = await storage.getProjectDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(document.projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager') && userId !== document.uploadedBy) {
        return res.status(403).json({ error: 'Not authorized to update this document' });
      }
      
      // Update document data
      const updateData = {
        ...req.body
      };
      
      const updatedDocument = await storage.updateProjectDocument(documentId, updateData);
      res.json(updatedDocument);
    } catch (error) {
      console.error(`Error updating document ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update document', details: error.message });
    }
  });

  // Project Items Routes
  app.get('/api/projects/:projectId/items', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectIdParam = req.params.projectId;
      console.log('Fetching items for project ID:', projectIdParam);
      
      // Get the project first to ensure it exists
      const project = await storage.getProject(projectIdParam);
      
      if (!project) {
        console.log('Project not found for ID:', projectIdParam);
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Use the numeric ID from the project record
      const projectId = project.id;
      
      // Get items for the project
      const items = await storage.getProjectItems(projectId);
      console.log(`Found ${items.length} items for project ${projectId}`);
      res.json(items);
    } catch (error) {
      console.error(`Error fetching items for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  // Get virtual components for a project
  app.get('/api/projects/:projectId/virtual-components', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      const virtualComponents = await db.execute(sql`
        SELECT 
          ic.id,
          ic.parent_item_id,
          ic.component_item_id,
          mi_component.item_code as component_code,
          mi_component.description as component_description,
          ic.quantity,
          mi_component.uom as unit
        FROM item_components ic
        JOIN project_items pi ON ic.parent_item_id = pi.item_id
        JOIN master_items mi_component ON ic.component_item_id = mi_component.id
        WHERE pi.project_id = ${projectId}
        ORDER BY mi_component.item_code
      `);

      res.json(virtualComponents.rows || virtualComponents);
    } catch (error) {
      console.error(`Error fetching virtual components for project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  app.get('/api/projects/code/:projectCode/items', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectCode = req.params.projectCode;
      const items = await storage.getProjectItemsByCode(projectCode);
      res.json(items);
    } catch (error) {
      console.error(`Error fetching items for project code ${req.params.projectCode}:`, error);
      sendError(res, error);
    }
  });

  app.get('/api/project-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      const item = await storage.getProjectItem(itemId);
      
      if (!item) {
        return res.status(404).json({ error: 'Project item not found' });
      }

      const user = req.user as any;
      const { isMember } = await checkProjectMembership(user.id, user.role, item.projectId);
      if (!isMember) return res.status(403).json({ error: "Access denied", code: "PROJECT_ACCESS_DENIED" });
      
      res.json(item);
    } catch (error) {
      console.error(`Error fetching project item ${req.params.id}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/items', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (!(await guardCostNotLocked(projectId, res))) return;
      
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to add items to this project' });
      }

      const VALID_SOURCES = ['sales_offer', 'manual', 'bom_explosion'];
      const itemSource = req.body.source || 'manual';
      if (!VALID_SOURCES.includes(itemSource)) {
        return res.status(400).json({ error: `Invalid source value. Allowed: ${VALID_SOURCES.join(', ')}` });
      }
      
      let itemCode = req.body.itemCode || req.body.item_code || '';
      if (itemCode && (project as any).fy_code && (project as any).project_seq) {
        itemCode = epcCoding.buildProjectItemCode(itemCode, (project as any).fy_code, (project as any).project_seq);
      }

      let codeBars: string | undefined;
      if ((project as any).fy_code && (project as any).project_seq) {
        const client = await pool.connect();
        try {
          let bpCode = req.body.bpCode || '';
          if (!bpCode && (project as any).customer_id) {
            const custRes = await client.query('SELECT bp_code FROM customers WHERE id = $1', [(project as any).customer_id]);
            bpCode = custRes.rows[0]?.bp_code || '';
          }
          codeBars = await epcCoding.generateCodeBars(bpCode, (project as any).fy_code, (project as any).project_seq, client);
        } finally {
          client.release();
        }
      }

      const itemData = insertProjectItemSchema.parse({
        ...req.body,
        itemCode: itemCode || req.body.itemCode || req.body.item_code,
        codeBars,
        source: itemSource,
        projectId,
        projectCode: project.code,
        createdAt: new Date(),
        createdBy: userId,
      });
      
      const item = await storage.createProjectItem(itemData);

      const eventPayload = {
        projectId,
        projectItemId: item.id,
        masterItemId: item.itemId,
        changedBy: userId,
        timestamp: new Date().toISOString(),
      };
      agentEventBus.emit('project.item.added', eventPayload, 'project-routes');
      db.insert(projectWorkflowEvents).values({
        projectId,
        eventName: 'project.item.added',
        eventPayload,
        emittedBy: 'project-routes',
        emittedAt: new Date(),
        processed: false,
      }).then(() => console.log(`[ProjectItemEvent] project.item.added logged for project ${projectId}`))
        .catch(err => console.error(`[ProjectItemEvent] Failed to log project.item.added:`, err));

      res.status(201).json(item);
    } catch (error) {
      console.error(`Error creating item for project ${req.params.projectId}:`, error);
      res.status(400).json({ error: 'Failed to create project item', details: error.message });
    }
  });

  app.put('/api/project-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      console.log(`Updating project item ${itemId} by user ${userId} with data:`, req.body);
      
      // Check if item exists
      const item = await storage.getProjectItem(itemId);
      if (!item) {
        console.log(`Project item ${itemId} not found`);
        return res.status(404).json({ error: 'Project item not found' });
      }
      
      console.log(`Found project item:`, item);
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(item.projectId);
      const userMember = projectMembers.find(member => member.userId === userId);
      
      if (!userMember && !canManage(req.user!.role, 'Manager')) {
        console.log(`User ${userId} not authorized to update project item ${itemId}`);
        return res.status(403).json({ error: 'Not authorized to update this project item' });
      }

      if (!(await guardCostNotLocked(item.projectId, res))) return;

      // Extract fields from request body, including camelCase and snake_case variations
      const { 
        itemCode, 
        description, 
        quantity, 
        uom, 
        makeOrBuy, 
        make_or_buy, // Include snake_case version
        drawingNo, 
        drawing_no,  // Include snake_case version
        ...otherData 
      } = req.body;
      
      // Use the camelCase version if available, otherwise use snake_case version
      const effectiveMakeOrBuy = makeOrBuy || make_or_buy;
      const effectiveDrawingNo = drawingNo || drawing_no;
      
      console.log(`Extracted fields for update - itemCode: ${itemCode}, description: ${description}, quantity: ${quantity}, uom: ${uom}, makeOrBuy: ${effectiveMakeOrBuy}, drawingNo: ${effectiveDrawingNo}`);
      
      const oldMakeOrBuy = await storage.getMasterItem(item.itemId).then(mi => mi?.makeOrBuy || null);

      if (itemCode) {
        try {
          console.log(`Getting master item for item ID: ${item.itemId}`);
          const masterItem = await storage.getMasterItem(item.itemId);
          
          if (!masterItem) {
            console.log(`Master item with ID ${item.itemId} not found`);
            return res.status(404).json({ error: 'Associated master item not found' });
          }
          
          console.log(`Found master item:`, masterItem);
          
          // Check if the new itemCode already exists (but isn't this item)
          if (itemCode !== masterItem.itemCode) {
            console.log(`Checking if item code ${itemCode} already exists (current code: ${masterItem.itemCode})`);
            const existingItem = await storage.getMasterItemByCode(itemCode);
            
            if (existingItem) {
              console.log(`Found existing item with code ${itemCode}:`, existingItem);
              
              if (existingItem.id !== masterItem.id) {
                console.log(`Item code ${itemCode} already exists for another item (ID: ${existingItem.id})`);
                return res.status(400).json({ error: 'Item code already exists for another item' });
              }
            }
          }
          
          // Update the master item with new data
          // Be explicit about field names to ensure they match the database schema
          const masterItemUpdateData = {
            itemCode,
            description,
            uom,
            // Use the effective values which handle both camelCase and snake_case
            makeOrBuy: effectiveMakeOrBuy,
            drawingNo: effectiveDrawingNo,
            updatedAt: new Date()
          };
          
          console.log(`Explicitly setting make_or_buy: ${makeOrBuy} and drawing_no: ${drawingNo}`);
          
          console.log(`Updating master item ${masterItem.id} with data:`, masterItemUpdateData);
          const updatedMasterItem = await storage.updateMasterItem(masterItem.id, masterItemUpdateData);
          console.log(`Master item updated successfully:`, updatedMasterItem);
          
        } catch (error) {
          console.error(`Error updating master item for project item ${itemId}:`, error);
          return res.status(400).json({ error: 'Failed to update master item', details: error.message });
        }
      }
      
      // Now update the project item with remaining data
      const projectItemUpdateData = {
        quantity,
        ...otherData,
        updatedAt: new Date()
      };
      
      console.log(`Updating project item ${itemId} with data:`, projectItemUpdateData);
      const updatedItem = await storage.updateProjectItem(itemId, projectItemUpdateData);
      console.log(`Project item updated successfully:`, updatedItem);
      
      // AUTO-SYNC: Check if status is being updated and sync with related work orders
      if (otherData.status && otherData.status !== item.status) {
        console.log(`🔄 AUTO-SYNC: Project item status changed from "${item.status}" to "${otherData.status}"`);
        
        try {
          // Get the master item to find the item code
          const masterItem = await storage.getMasterItem(item.itemId);
          
          if (masterItem) {
            console.log(`🔍 AUTO-SYNC: Looking for work orders with item code: ${masterItem.itemCode}`);
            
            // Find related work orders by matching item code in title
            const relatedWorkOrders = await db.select()
              .from(workOrders)
              .where(sql`${workOrders.projectId} = ${item.projectId} AND ${workOrders.title} LIKE ${`%${masterItem.itemCode}%`}`);
            
            console.log(`🔍 AUTO-SYNC: Found ${relatedWorkOrders.length} related work orders`);
            
            if (relatedWorkOrders.length > 0) {
              // Map project item status to work order status
              let workOrderStatus = otherData.status;
              
              // Status mapping logic
              switch (otherData.status) {
                case 'active':
                case 'Active':
                  workOrderStatus = 'planned';
                  break;
                case 'canceled':
                case 'Cancelled':
                  workOrderStatus = 'canceled';
                  break;
                case 'completed':
                case 'Completed':
                  workOrderStatus = 'completed';
                  break;
                case 'in_progress':
                case 'In Progress':
                  workOrderStatus = 'in_progress';
                  break;
                default:
                  workOrderStatus = 'planned';
              }
              
              console.log(`🔄 AUTO-SYNC: Updating ${relatedWorkOrders.length} work orders to status: ${workOrderStatus}`);
              
              // Update all related work orders
              for (const workOrder of relatedWorkOrders) {
                try {
                  await db.update(workOrders)
                    .set({ 
                      status: workOrderStatus, 
                      updatedAt: new Date()
                    })
                    .where(eq(workOrders.id, workOrder.id));
                  
                  console.log(`✅ AUTO-SYNC: Updated work order ${workOrder.workOrderNumber} to status: ${workOrderStatus}`);
                } catch (woError) {
                  console.error(`❌ AUTO-SYNC: Failed to update work order ${workOrder.workOrderNumber}:`, woError);
                }
              }
              
              console.log(`🎯 AUTO-SYNC: Successfully synchronized ${relatedWorkOrders.length} work orders with project item status`);
            } else {
              console.log(`ℹ️ AUTO-SYNC: No related work orders found for item code: ${masterItem.itemCode}`);
            }

            // AUTO-SYNC: Also find and update related inspection orders
            console.log(`🔍 AUTO-SYNC: Looking for inspection orders related to project item ${itemId}`);
            
            const relatedInspectionOrders = await db.select()
              .from(inspectionOrders)
              .where(eq(inspectionOrders.itemId, itemId));
            
            console.log(`🔍 AUTO-SYNC: Found ${relatedInspectionOrders.length} related inspection orders`);
            
            if (relatedInspectionOrders.length > 0) {
              // Map project item status to inspection order status
              let inspectionOrderStatus = otherData.status;
              
              // Status mapping logic for inspection orders
              switch (otherData.status) {
                case 'active':
                case 'Active':
                  inspectionOrderStatus = 'pending';
                  break;
                case 'canceled':
                case 'Cancelled':
                  inspectionOrderStatus = 'canceled';
                  break;
                case 'completed':
                case 'Completed':
                  inspectionOrderStatus = 'completed';
                  break;
                case 'in_progress':
                case 'In Progress':
                  inspectionOrderStatus = 'in_progress';
                  break;
                default:
                  inspectionOrderStatus = 'pending';
              }
              
              console.log(`🔄 AUTO-SYNC: Updating ${relatedInspectionOrders.length} inspection orders to status: ${inspectionOrderStatus}`);
              
              // Update all related inspection orders
              for (const inspectionOrder of relatedInspectionOrders) {
                try {
                  await db.update(inspectionOrders)
                    .set({ 
                      status: inspectionOrderStatus, 
                      updatedAt: new Date()
                    })
                    .where(eq(inspectionOrders.id, inspectionOrder.id));
                  
                  console.log(`✅ AUTO-SYNC: Updated inspection order ${inspectionOrder.inspectionOrderNumber} to status: ${inspectionOrderStatus}`);
                } catch (ioError) {
                  console.error(`❌ AUTO-SYNC: Failed to update inspection order ${inspectionOrder.inspectionOrderNumber}:`, ioError);
                }
              }
              
              console.log(`🎯 AUTO-SYNC: Successfully synchronized ${relatedInspectionOrders.length} inspection orders with project item status`);
            } else {
              console.log(`ℹ️ AUTO-SYNC: No related inspection orders found for project item ${itemId}`);
            }
          } else {
            console.log(`⚠️ AUTO-SYNC: Could not find master item for project item ${itemId}`);
          }
        } catch (syncError) {
          console.error(`❌ AUTO-SYNC ERROR: Failed to synchronize work orders and inspection orders:`, syncError);
          // Don't fail the entire request - just log the sync error
        }
      }
      
      const fullUpdatedItem = await storage.getProjectItem(itemId);
      console.log(`Returning full updated item:`, fullUpdatedItem);

      const updateEventPayload = {
        projectId: item.projectId,
        projectItemId: itemId,
        masterItemId: item.itemId,
        changedBy: userId,
        timestamp: new Date().toISOString(),
      };
      agentEventBus.emit('project.item.updated', updateEventPayload, 'project-routes');
      db.insert(projectWorkflowEvents).values({
        projectId: item.projectId,
        eventName: 'project.item.updated',
        eventPayload: updateEventPayload,
        emittedBy: 'project-routes',
        emittedAt: new Date(),
        processed: false,
      }).then(() => console.log(`[ProjectItemEvent] project.item.updated logged for item ${itemId}`))
        .catch(err => console.error(`[ProjectItemEvent] Failed to log project.item.updated:`, err));

      if (effectiveMakeOrBuy && oldMakeOrBuy && effectiveMakeOrBuy !== oldMakeOrBuy) {
        const classEventPayload = {
          projectId: item.projectId,
          projectItemId: itemId,
          masterItemId: item.itemId,
          oldClassification: oldMakeOrBuy,
          newClassification: effectiveMakeOrBuy,
          changedBy: userId,
          timestamp: new Date().toISOString(),
        };
        agentEventBus.emit('project.item.classification_changed', classEventPayload, 'project-routes');
        db.insert(projectWorkflowEvents).values({
          projectId: item.projectId,
          eventName: 'project.item.classification_changed',
          eventPayload: classEventPayload,
          emittedBy: 'project-routes',
          emittedAt: new Date(),
          processed: false,
        }).then(() => console.log(`[ProjectItemEvent] project.item.classification_changed logged: ${oldMakeOrBuy} → ${effectiveMakeOrBuy} for item ${itemId}`))
          .catch(err => console.error(`[ProjectItemEvent] Failed to log classification change:`, err));
      }

      res.json(fullUpdatedItem);
    } catch (error) {
      console.error(`Error updating project item ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update project item', details: error.message });
    }
  });

  app.patch('/api/project-items/:id/parent', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      const { parentProjectItemId } = req.body as { parentProjectItemId: number | null };

      const item = await storage.getProjectItem(itemId);
      if (!item) return res.status(404).json({ error: 'Project item not found' });

      if (!(await guardCostNotLocked(item.projectId, res))) return;

      if (parentProjectItemId !== null && parentProjectItemId !== undefined) {
        if (parentProjectItemId === itemId) {
          return res.status(400).json({ error: 'An item cannot be its own parent.' });
        }
        const parentItem = await storage.getProjectItem(parentProjectItemId);
        if (!parentItem) return res.status(400).json({ error: 'Parent item not found.' });
        if (parentItem.projectId !== item.projectId) {
          return res.status(400).json({ error: 'Parent item must belong to the same project.' });
        }

        // Cycle detection: walk up the ancestry from the proposed parent
        let current: number | null = parentProjectItemId;
        const visited = new Set<number>();
        while (current !== null) {
          if (visited.has(current)) break; // safety against existing corrupt data
          visited.add(current);
          if (current === itemId) {
            return res.status(400).json({ error: 'Setting this parent would create a circular hierarchy.' });
          }
          const rows = await db.select({ parent: projectItemsSchema.parentProjectItemId })
            .from(projectItemsSchema)
            .where(eq(projectItemsSchema.id, current));
          current = rows[0]?.parent ?? null;
        }
      }

      const updated = await storage.updateProjectItem(itemId, {
        parentProjectItemId: parentProjectItemId ?? null,
      } as any);

      return res.json(updated);
    } catch (error) {
      console.error('Error updating project item parent:', error);
      return res.status(500).json({ error: 'Failed to update parent', details: (error as Error).message });
    }
  });

  app.delete('/api/project-items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      const item = await storage.getProjectItem(itemId);
      if (!item) {
        return res.status(404).json({ error: 'Project item not found' });
      }
      
      const projectMembers = await storage.getProjectMembers(item.projectId);
      const userMember = projectMembers.find(member => 
        member.userId === userId && (member.role === 'senior_manager' || member.role === 'project_manager' || canManage(req.user!.role, 'Manager'))
      );
      
      if (!userMember) {
        return res.status(403).json({ error: 'Not authorized to delete this project item' });
      }

      if (!(await guardCostNotLocked(item.projectId, res))) return;

      const poItems = await db.execute(
        sql`SELECT id FROM purchase_order_items WHERE project_item_id = ${itemId} LIMIT 5`
      );
      const woItems = await db.execute(
        sql`SELECT id FROM work_order_items WHERE project_item_id = ${itemId} LIMIT 5`
      );
      const ioItems = await db.execute(
        sql`SELECT id FROM inspection_orders WHERE project_item_id = ${itemId} LIMIT 5`
      );

      const dependencies: Record<string, number> = {};
      if (poItems.rows.length > 0) dependencies.purchase_order_items = poItems.rows.length;
      if (woItems.rows.length > 0) dependencies.work_order_items = woItems.rows.length;
      if (ioItems.rows.length > 0) dependencies.inspection_orders = ioItems.rows.length;

      const hasDependencies = Object.keys(dependencies).length > 0;

      if (hasDependencies) {
        const eventPayload = {
          projectId: item.projectId,
          projectItemId: itemId,
          masterItemId: item.itemId,
          changedBy: userId,
          deletionBlocked: true,
          downstreamDependencies: dependencies,
          timestamp: new Date().toISOString(),
        };
        agentEventBus.emit('project.item.removed', eventPayload, 'project-routes');
        db.insert(projectWorkflowEvents).values({
          projectId: item.projectId,
          eventName: 'project.item.removed',
          eventPayload,
          emittedBy: 'project-routes',
          emittedAt: new Date(),
          processed: false,
        }).catch(err => console.error(`[ProjectItemEvent] Failed to log project.item.removed:`, err));

        return res.status(409).json({
          error: 'Cannot delete project item with downstream dependencies',
          dependencies,
          message: 'An impact review task has been created for the project manager to evaluate this deletion request.',
        });
      }

      await storage.deleteProjectItem(itemId);

      const eventPayload = {
        projectId: item.projectId,
        projectItemId: itemId,
        masterItemId: item.itemId,
        changedBy: userId,
        deletionBlocked: false,
        downstreamDependencies: {},
        timestamp: new Date().toISOString(),
      };
      agentEventBus.emit('project.item.removed', eventPayload, 'project-routes');
      db.insert(projectWorkflowEvents).values({
        projectId: item.projectId,
        eventName: 'project.item.removed',
        eventPayload,
        emittedBy: 'project-routes',
        emittedAt: new Date(),
        processed: false,
      }).catch(err => console.error(`[ProjectItemEvent] Failed to log project.item.removed:`, err));

      res.status(204).send();
    } catch (error) {
      console.error(`Error deleting project item ${req.params.id}:`, error);
      sendError(res, error);
    }
  });

  app.delete('/api/projects/:projectId/items', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectIdParam = req.params.projectId;
      const userId = req.user!.id;
      
      // Get the project first to ensure it exists
      const project = await storage.getProject(projectIdParam);
      
      if (!project) {
        console.log('Project not found for ID:', projectIdParam);
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Use the numeric ID from the project record
      const projectId = project.id;

      if (!(await guardCostNotLocked(projectId, res))) return;
      
      // Check if user is authorized
      const projectMembers = await storage.getProjectMembers(projectId);
      const userMember = projectMembers.find(member => 
        member.userId === userId && (member.role === 'senior_manager' || member.role === 'project_manager' || canManage(req.user!.role, 'Senior Manager'))
      );
      
      if (!userMember) {
        return res.status(403).json({ error: 'Not authorized to delete all items from this project' });
      }
      
      const count = await storage.deleteProjectItems(projectId);
      console.log(`Deleted ${count} items from project ${projectId}`);
      res.json({ deletedCount: count });
    } catch (error) {
      console.error(`Error deleting all items from project ${req.params.projectId}:`, error);
      sendError(res, error);
    }
  });

  // ==================== BOM COST ROLL-UP ====================

  /*
   * Roll-up algorithm:
   *  1. For each project item, the "own cost" is:
   *       - BOM totalEstimatedCost × item.quantity   (if an approved BOM exists)
   *       - otherwise item.estimatedCost
   *  2. A parent item whose approved BOM already lists its children as BOM lines
   *     (source_bom_header_id is set on child items pointing at that BOM) should
   *     NOT add the children's costs on top — the BOM already includes them.
   *  3. For all other parents, rolledUpCost = ownCost + SUM(children rolledUpCost).
   *  4. Hierarchy is unlimited depth; we process leaves first (post-order).
   */
  async function computeRollup(projectId: number): Promise<{
    items: Array<{
      id: number;
      itemCode: string | null;
      description: string | null;
      ownCost: number;
      rolledUpCost: number;
      costBasis: 'bom_approved' | 'estimated' | 'zero';
      parentProjectItemId: number | null;
    }>;
    projectTotal: number;
  }> {
    // Load all project items with approved BOM totals + freshness timestamps
    const result = await pool.query(`
      SELECT
        pi.id,
        pi.item_code,
        pi.description,
        pi.quantity,
        pi.estimated_cost,
        pi.parent_project_item_id,
        pi.source_bom_header_id,
        pi.updated_at            AS item_updated_at,
        pi.rolled_up_at          AS item_rolled_up_at,
        bh.id                    AS bom_header_id,
        bh.status                AS bom_status,
        bh.total_estimated_cost  AS bom_total_cost,
        COALESCE(
          (SELECT MAX(bh2.updated_at)
           FROM epc_bom_headers bh2
           WHERE bh2.project_item_id = pi.id AND bh2.is_current = TRUE),
          pi.updated_at
        ) AS last_bom_updated_at
      FROM project_items pi
      LEFT JOIN epc_bom_headers bh
        ON bh.project_item_id = pi.id
        AND bh.is_current = TRUE
        AND bh.status = 'approved'
      WHERE pi.project_id = $1
      ORDER BY pi.id
    `, [projectId]);

    const rows = result.rows as Array<{
      id: number;
      item_code: string | null;
      description: string | null;
      quantity: string | null;
      estimated_cost: string | null;
      parent_project_item_id: number | null;
      source_bom_header_id: number | null;
      item_updated_at: Date | null;
      item_rolled_up_at: Date | null;
      bom_header_id: number | null;
      bom_status: string | null;
      bom_total_cost: string | null;
      last_bom_updated_at: Date | null;
    }>;

    // Build children map
    const childrenOf: Record<number, number[]> = {};
    for (const r of rows) {
      if (r.parent_project_item_id) {
        if (!childrenOf[r.parent_project_item_id]) childrenOf[r.parent_project_item_id] = [];
        childrenOf[r.parent_project_item_id].push(r.id);
      }
    }

    const byId: Record<number, typeof rows[0]> = {};
    for (const r of rows) byId[r.id] = r;

    // Compute own cost for each item
    const ownCostOf: Record<number, { cost: number; basis: 'bom_approved' | 'estimated' | 'zero' }> = {};
    for (const r of rows) {
      const qty = parseFloat(r.quantity || '0') || 0;
      if (r.bom_header_id && r.bom_status === 'approved' && r.bom_total_cost) {
        ownCostOf[r.id] = { cost: parseFloat(r.bom_total_cost) * qty, basis: 'bom_approved' };
      } else if (r.estimated_cost) {
        ownCostOf[r.id] = { cost: parseFloat(r.estimated_cost), basis: 'estimated' };
      } else {
        ownCostOf[r.id] = { cost: 0, basis: 'zero' };
      }
    }

    // Post-order DFS to compute rolled-up costs
    const rolledUpOf: Record<number, number> = {};
    const visited = new Set<number>();

    function rollup(id: number): number {
      if (visited.has(id)) return rolledUpOf[id] ?? 0;
      visited.add(id);

      const children = childrenOf[id] || [];
      const row = byId[id];
      const own = ownCostOf[id].cost;

      if (children.length === 0) {
        rolledUpOf[id] = own;
        return own;
      }

      // If parent has an approved BOM AND children are BOM-sourced from that BOM,
      // the BOM cost already includes the components — don't double-count.
      if (row.bom_header_id && row.bom_status === 'approved') {
        const childrenAreBomSourced = children.every(cid => {
          const child = byId[cid];
          return child && child.source_bom_header_id === row.bom_header_id;
        });
        if (childrenAreBomSourced) {
          rolledUpOf[id] = own; // BOM total already includes all components
          return own;
        }
      }

      // Additive: own + sum of children
      let childSum = 0;
      for (const cid of children) {
        childSum += rollup(cid);
      }
      rolledUpOf[id] = own + childSum;
      return rolledUpOf[id];
    }

    for (const r of rows) rollup(r.id);

    const output = rows.map(r => {
      // Freshness: last relevant change is MAX(item.updated_at, latest BOM update)
      const lastModifiedAt = r.last_bom_updated_at
        ? (r.item_updated_at && r.item_updated_at > r.last_bom_updated_at
            ? r.item_updated_at
            : r.last_bom_updated_at)
        : r.item_updated_at;
      const rolledUpAt = r.item_rolled_up_at;
      const isStale = !rolledUpAt || (lastModifiedAt != null && lastModifiedAt > rolledUpAt);

      return {
        id: r.id,
        itemCode: r.item_code,
        description: r.description,
        ownCost: ownCostOf[r.id].cost,
        rolledUpCost: rolledUpOf[r.id] ?? 0,
        costBasis: ownCostOf[r.id].basis,
        parentProjectItemId: r.parent_project_item_id,
        lastModifiedAt: lastModifiedAt?.toISOString() ?? null,
        rolledUpAt: rolledUpAt?.toISOString() ?? null,
        isStale,
      };
    });

    const projectTotal = output
      .filter(i => !i.parentProjectItemId)
      .reduce((sum, i) => sum + i.rolledUpCost, 0);

    // Project-level freshness
    const allNeverFrozen = output.every(i => !i.rolledUpAt);
    const anyStale = output.some(i => i.isStale);
    const freshnessStatus: 'never_frozen' | 'stale' | 'fresh' =
      allNeverFrozen ? 'never_frozen' : anyStale ? 'stale' : 'fresh';
    const projectFrozenAt = allNeverFrozen
      ? null
      : output.reduce((min: string | null, i) => {
          if (!i.rolledUpAt) return min;
          if (!min || i.rolledUpAt < min) return i.rolledUpAt;
          return min;
        }, null);

    return { items: output, projectTotal, freshnessStatus, projectFrozenAt };
  }

  // GET /api/projects/:projectId/cost-rollup — compute on demand, no DB write
  app.get('/api/projects/:projectId/cost-rollup', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');
      const project = await pool.query(`SELECT id FROM projects WHERE id = $1`, [projectId]);
      if (project.rows.length === 0) return sendNotFound(res, 'Project not found');
      const rollup = await computeRollup(projectId);
      res.json({ success: true, projectId, ...rollup });
    } catch (error) {
      sendError(res, error);
    }
  });

  // POST /api/projects/:projectId/cost-rollup/freeze — compute + write back rolledUpCost
  app.post('/api/projects/:projectId/cost-rollup/freeze', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');
      const project = await pool.query(`SELECT id, status, cost_lock_status FROM projects WHERE id = $1`, [projectId]);
      if (project.rows.length === 0) return sendNotFound(res, 'Project not found');

      // Block freeze if cost is approved-locked
      const lockStatus = (project.rows[0] as any).cost_lock_status || 'unlocked';
      if (lockStatus === 'approved') {
        return sendBusinessError(res, 'Cost is approved and locked. Unlock it first before recalculating.');
      }

      const frozen = await guardProjectNotFrozen(projectId, res);
      if (!frozen) return;

      const rollup = await computeRollup(projectId);
      const now = new Date();

      // Write back in a single transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const item of rollup.items) {
          await client.query(
            `UPDATE project_items SET rolled_up_cost = $1, rolled_up_at = $2, updated_at = NOW() WHERE id = $3`,
            [item.rolledUpCost.toFixed(2), now, item.id]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      res.json({
        success: true,
        projectId,
        frozenAt: now.toISOString(),
        projectTotal: rollup.projectTotal,
        itemCount: rollup.items.length,
        items: rollup.items,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== COST LOCK / APPROVAL WORKFLOW ====================

  // GET /api/projects/:projectId/cost-lock/status
  app.get('/api/projects/:projectId/cost-lock/status', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');
      const result = await pool.query(`
        SELECT p.cost_lock_status, p.cost_lock_submitted_at, p.cost_lock_reviewed_at, p.cost_lock_note,
               us.username AS submitted_by_name, ur.username AS reviewed_by_name
        FROM projects p
        LEFT JOIN users us ON us.id = p.cost_lock_submitted_by
        LEFT JOIN users ur ON ur.id = p.cost_lock_reviewed_by
        WHERE p.id = $1
      `, [projectId]);
      if (result.rows.length === 0) return sendNotFound(res, 'Project not found');
      const r = result.rows[0] as any;
      res.json({
        status: r.cost_lock_status || 'unlocked',
        submittedAt: r.cost_lock_submitted_at,
        submittedByName: r.submitted_by_name,
        reviewedAt: r.cost_lock_reviewed_at,
        reviewedByName: r.reviewed_by_name,
        note: r.cost_lock_note,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // POST /api/projects/:projectId/cost-lock/submit — submit frozen cost for approval
  app.post('/api/projects/:projectId/cost-lock/submit', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = (req.user as any)?.id;
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');
      const project = await pool.query(`SELECT id, status, cost_lock_status FROM projects WHERE id = $1`, [projectId]);
      if (project.rows.length === 0) return sendNotFound(res, 'Project not found');
      const lockStatus = (project.rows[0] as any).cost_lock_status || 'unlocked';
      if (lockStatus !== 'unlocked' && lockStatus !== 'rejected') {
        return sendBusinessError(res, `Cannot submit: cost lock is currently '${lockStatus}'.`);
      }
      // Require at least one frozen item
      const frozenCheck = await pool.query(
        `SELECT COUNT(*) AS cnt FROM project_items WHERE project_id = $1 AND rolled_up_cost IS NOT NULL`, [projectId]
      );
      if (parseInt((frozenCheck.rows[0] as any).cnt) === 0) {
        return sendBusinessError(res, 'No frozen costs found. Run "Recalculate & Freeze" first before submitting for approval.');
      }
      await pool.query(
        `UPDATE projects SET cost_lock_status = 'pending_approval', cost_lock_submitted_by = $1, cost_lock_submitted_at = NOW(),
         cost_lock_reviewed_by = NULL, cost_lock_reviewed_at = NULL, cost_lock_note = NULL, updated_at = NOW()
         WHERE id = $2`,
        [userId, projectId]
      );
      res.json({ success: true, status: 'pending_approval' });
    } catch (error) {
      sendError(res, error);
    }
  });

  // POST /api/projects/:projectId/cost-lock/approve — approve (Manager+)
  app.post('/api/projects/:projectId/cost-lock/approve', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      if (!requireMinRole(req, res, 'Manager')) return;
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');
      const project = await pool.query(`SELECT id, cost_lock_status FROM projects WHERE id = $1`, [projectId]);
      if (project.rows.length === 0) return sendNotFound(res, 'Project not found');
      if ((project.rows[0] as any).cost_lock_status !== 'pending_approval') {
        return sendBusinessError(res, 'Cost is not pending approval.');
      }
      const { note } = req.body;
      await pool.query(
        `UPDATE projects SET cost_lock_status = 'approved', cost_lock_reviewed_by = $1, cost_lock_reviewed_at = NOW(),
         cost_lock_note = $2, updated_at = NOW() WHERE id = $3`,
        [userId, note || null, projectId]
      );
      res.json({ success: true, status: 'approved' });
    } catch (error) {
      sendError(res, error);
    }
  });

  // POST /api/projects/:projectId/cost-lock/reject — reject with note (Manager+)
  app.post('/api/projects/:projectId/cost-lock/reject', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = (req.user as any)?.id;
      if (!requireMinRole(req, res, 'Manager')) return;
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');
      const project = await pool.query(`SELECT id, cost_lock_status FROM projects WHERE id = $1`, [projectId]);
      if (project.rows.length === 0) return sendNotFound(res, 'Project not found');
      if ((project.rows[0] as any).cost_lock_status !== 'pending_approval') {
        return sendBusinessError(res, 'Cost is not pending approval.');
      }
      const { note } = req.body;
      if (!note?.trim()) return sendValidationError(res, 'Rejection note is required.');
      await pool.query(
        `UPDATE projects SET cost_lock_status = 'rejected', cost_lock_reviewed_by = $1, cost_lock_reviewed_at = NOW(),
         cost_lock_note = $2, updated_at = NOW() WHERE id = $3`,
        [userId, note, projectId]
      );
      res.json({ success: true, status: 'rejected' });
    } catch (error) {
      sendError(res, error);
    }
  });

  // POST /api/projects/:projectId/cost-lock/unlock — unlock approved cost (Manager+)
  app.post('/api/projects/:projectId/cost-lock/unlock', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = (req.user as any)?.id;
      if (!requireMinRole(req, res, 'Manager')) return;
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');
      const { note } = req.body;
      if (!note?.trim()) return sendValidationError(res, 'Unlock reason is required.');
      await pool.query(
        `UPDATE projects SET cost_lock_status = 'unlocked', cost_lock_note = $1, updated_at = NOW() WHERE id = $2`,
        [note, projectId]
      );
      res.json({ success: true, status: 'unlocked' });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== COMMERCIAL PRICING LAYER ====================

  // GET /api/projects/:projectId/pricing — get current pricing state (items + project terms)
  app.get('/api/projects/:projectId/pricing', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const [projResult, itemsResult] = await Promise.all([
        pool.query(`
          SELECT id, selling_currency, exchange_rate, exchange_rate_frozen_at,
                 total_selling_price_inr, total_selling_price,
                 incoterms, payment_terms, delivery_terms,
                 offer_validity_days, default_margin_percent, currency,
                 cost_lock_status
          FROM projects WHERE id = $1
        `, [projectId]),
        pool.query(`
          SELECT id, item_code, description, quantity,
                 rolled_up_cost, margin_percent, selling_price_inr, selling_price, pricing_locked_at,
                 parent_project_item_id
          FROM project_items WHERE project_id = $1 ORDER BY id
        `, [projectId]),
      ]);

      if (projResult.rows.length === 0) return sendNotFound(res, 'Project not found');
      const proj = projResult.rows[0] as any;
      const items = itemsResult.rows as any[];

      // Compute totals on the fly
      const totalSellingInr = items
        .filter(i => !i.parent_project_item_id)
        .reduce((sum, i) => sum + parseFloat(i.selling_price_inr || '0'), 0);
      const exchangeRate = parseFloat(proj.exchange_rate || '0');
      const totalSellingForeign = exchangeRate > 0 ? totalSellingInr / exchangeRate : null;

      res.json({
        projectId,
        sellingCurrency: proj.selling_currency || 'USD',
        exchangeRate: proj.exchange_rate,
        exchangeRateFrozenAt: proj.exchange_rate_frozen_at,
        incoterms: proj.incoterms,
        paymentTerms: proj.payment_terms,
        deliveryTerms: proj.delivery_terms,
        offerValidityDays: proj.offer_validity_days ?? 30,
        defaultMarginPercent: proj.default_margin_percent,
        costLockStatus: proj.cost_lock_status || 'unlocked',
        baseCurrency: proj.currency || 'INR',
        computedTotals: { totalSellingInr, totalSellingForeign },
        items: items.map(i => ({
          id: i.id,
          itemCode: i.item_code,
          description: i.description,
          quantity: i.quantity,
          rolledUpCost: i.rolled_up_cost,
          marginPercent: i.margin_percent,
          sellingPriceInr: i.selling_price_inr,
          sellingPrice: i.selling_price,
          pricingLockedAt: i.pricing_locked_at,
          parentProjectItemId: i.parent_project_item_id,
        })),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // PATCH /api/projects/:projectId/pricing/terms — update project-level terms + exchange rate
  app.patch('/api/projects/:projectId/pricing/terms', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');
      if (!(await guardCostNotLocked(projectId, res))) return;

      const { sellingCurrency, exchangeRate, incoterms, paymentTerms, deliveryTerms, offerValidityDays, defaultMarginPercent } = req.body;

      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (sellingCurrency !== undefined) { updates.push(`selling_currency = $${idx++}`); params.push(sellingCurrency); }
      if (exchangeRate !== undefined) {
        if (isNaN(parseFloat(exchangeRate)) || parseFloat(exchangeRate) <= 0)
          return sendValidationError(res, 'exchangeRate must be a positive number');
        updates.push(`exchange_rate = $${idx++}`); params.push(parseFloat(exchangeRate));
        updates.push(`exchange_rate_frozen_at = NULL`);
      }
      if (incoterms !== undefined) { updates.push(`incoterms = $${idx++}`); params.push(incoterms || null); }
      if (paymentTerms !== undefined) { updates.push(`payment_terms = $${idx++}`); params.push(paymentTerms || null); }
      if (deliveryTerms !== undefined) { updates.push(`delivery_terms = $${idx++}`); params.push(deliveryTerms || null); }
      if (offerValidityDays !== undefined) { updates.push(`offer_validity_days = $${idx++}`); params.push(parseInt(offerValidityDays)); }
      if (defaultMarginPercent !== undefined) { updates.push(`default_margin_percent = $${idx++}`); params.push(parseFloat(defaultMarginPercent) || null); }

      if (updates.length === 0) return sendValidationError(res, 'No fields to update');
      updates.push(`updated_at = NOW()`);
      params.push(projectId);
      await pool.query(`UPDATE projects SET ${updates.join(', ')} WHERE id = $${idx}`, params);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // POST /api/projects/:projectId/pricing/exchange-rate/freeze — freeze exchange rate
  app.post('/api/projects/:projectId/pricing/exchange-rate/freeze', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');
      if (!(await guardCostNotLocked(projectId, res))) return;

      const check = await pool.query(`SELECT exchange_rate FROM projects WHERE id = $1`, [projectId]);
      if (check.rows.length === 0) return sendNotFound(res, 'Project not found');
      if (!check.rows[0].exchange_rate) return sendValidationError(res, 'Set an exchange rate before freezing.');

      await pool.query(`UPDATE projects SET exchange_rate_frozen_at = NOW(), updated_at = NOW() WHERE id = $1`, [projectId]);
      res.json({ success: true, frozenAt: new Date().toISOString() });
    } catch (error) {
      sendError(res, error);
    }
  });

  // PATCH /api/projects/:projectId/pricing/items — bulk-update item margins + selling prices
  app.patch('/api/projects/:projectId/pricing/items', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');
      if (!(await guardCostNotLocked(projectId, res))) return;

      const { items } = req.body as { items: Array<{ id: number; marginPercent?: number | null }> };
      if (!Array.isArray(items) || items.length === 0) return sendValidationError(res, 'items array required');

      // Fetch exchange rate
      const projResult = await pool.query(`SELECT exchange_rate FROM projects WHERE id = $1`, [projectId]);
      if (projResult.rows.length === 0) return sendNotFound(res, 'Project not found');
      const exchangeRate = parseFloat(projResult.rows[0].exchange_rate || '0');

      // Fetch rolled-up costs for these items
      const itemIds = items.map(i => i.id);
      const costResult = await pool.query(
        `SELECT id, rolled_up_cost FROM project_items WHERE project_id = $1 AND id = ANY($2::int[])`,
        [projectId, itemIds]
      );
      const costMap: Record<number, number> = {};
      for (const r of costResult.rows as any[]) costMap[r.id] = parseFloat(r.rolled_up_cost || '0');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const item of items) {
          const costInr = costMap[item.id] ?? 0;
          const margin = item.marginPercent !== null && item.marginPercent !== undefined ? parseFloat(String(item.marginPercent)) : null;
          let sellingInr: number | null = null;
          let sellingForeign: number | null = null;
          if (margin !== null) {
            sellingInr = costInr * (1 + margin / 100);
            sellingForeign = exchangeRate > 0 ? sellingInr / exchangeRate : null;
          }
          await client.query(
            `UPDATE project_items
             SET margin_percent = $1, selling_price_inr = $2, selling_price = $3, updated_at = NOW()
             WHERE id = $4 AND project_id = $5`,
            [margin, sellingInr !== null ? sellingInr.toFixed(2) : null,
             sellingForeign !== null ? sellingForeign.toFixed(2) : null, item.id, projectId]
          );
        }

        // Recompute project totals (top-level items only)
        const totalsResult = await client.query(
          `SELECT COALESCE(SUM(selling_price_inr),0) AS total_inr FROM project_items WHERE project_id = $1 AND parent_project_item_id IS NULL`,
          [projectId]
        );
        const totalInr = parseFloat((totalsResult.rows[0] as any).total_inr);
        const totalForeign = exchangeRate > 0 ? totalInr / exchangeRate : null;
        await client.query(
          `UPDATE projects SET total_selling_price_inr = $1, total_selling_price = $2, updated_at = NOW() WHERE id = $3`,
          [totalInr.toFixed(2), totalForeign !== null ? totalForeign.toFixed(2) : null, projectId]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      res.json({ success: true, projectId });
    } catch (error) {
      sendError(res, error);
    }
  });

  // POST /api/projects/:projectId/pricing/apply-default-margin — apply defaultMarginPercent to all items
  app.post('/api/projects/:projectId/pricing/apply-default-margin', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');
      if (!(await guardCostNotLocked(projectId, res))) return;

      const projResult = await pool.query(
        `SELECT default_margin_percent, exchange_rate FROM projects WHERE id = $1`, [projectId]
      );
      if (projResult.rows.length === 0) return sendNotFound(res, 'Project not found');
      const margin = parseFloat(projResult.rows[0].default_margin_percent || '0');
      const exchangeRate = parseFloat(projResult.rows[0].exchange_rate || '0');
      if (!margin) return sendValidationError(res, 'Set a default margin % on the project first.');

      const itemsResult = await pool.query(
        `SELECT id, rolled_up_cost FROM project_items WHERE project_id = $1`, [projectId]
      );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const r of itemsResult.rows as any[]) {
          const cost = parseFloat(r.rolled_up_cost || '0');
          const sellingInr = cost * (1 + margin / 100);
          const sellingForeign = exchangeRate > 0 ? sellingInr / exchangeRate : null;
          await client.query(
            `UPDATE project_items SET margin_percent = $1, selling_price_inr = $2, selling_price = $3, updated_at = NOW() WHERE id = $4`,
            [margin, sellingInr.toFixed(2), sellingForeign !== null ? sellingForeign.toFixed(2) : null, r.id]
          );
        }
        // Recompute totals
        const totalsResult = await client.query(
          `SELECT COALESCE(SUM(selling_price_inr),0) AS total_inr FROM project_items WHERE project_id = $1 AND parent_project_item_id IS NULL`,
          [projectId]
        );
        const totalInr = parseFloat((totalsResult.rows[0] as any).total_inr);
        const totalForeign = exchangeRate > 0 ? totalInr / exchangeRate : null;
        await client.query(
          `UPDATE projects SET total_selling_price_inr = $1, total_selling_price = $2, updated_at = NOW() WHERE id = $3`,
          [totalInr.toFixed(2), totalForeign !== null ? totalForeign.toFixed(2) : null, projectId]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      res.json({ success: true, appliedMargin: margin, itemCount: itemsResult.rows.length });
    } catch (error) {
      sendError(res, error);
    }
  });

  // GET /api/projects/:projectId/pricing/snapshots — list all commercial snapshots
  app.get('/api/projects/:projectId/pricing/snapshots', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');
      const result = await pool.query(`
        SELECT s.*, u.username AS created_by_name, ua.username AS approved_by_name
        FROM project_commercial_snapshots s
        LEFT JOIN users u ON u.id = s.created_by
        LEFT JOIN users ua ON ua.id = s.approved_by
        WHERE s.project_id = $1
        ORDER BY s.created_at DESC
      `, [projectId]);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  // POST /api/projects/:projectId/pricing/snapshots — create versioned commercial snapshot
  app.post('/api/projects/:projectId/pricing/snapshots', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = (req.user as any)?.id;
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      // Require cost to be approved/locked before taking a commercial snapshot
      const lockCheck = await pool.query(`SELECT cost_lock_status, exchange_rate, selling_currency, incoterms, payment_terms, delivery_terms, offer_validity_days FROM projects WHERE id = $1`, [projectId]);
      if (lockCheck.rows.length === 0) return sendNotFound(res, 'Project not found');
      const proj = lockCheck.rows[0] as any;
      if (proj.cost_lock_status !== 'approved') {
        return sendBusinessError(res, 'Cost must be approved and locked before creating a commercial snapshot.');
      }
      if (!proj.exchange_rate) return sendValidationError(res, 'Set and freeze an exchange rate before creating a snapshot.');

      const exchangeRate = parseFloat(proj.exchange_rate);
      const sellingCurrency = proj.selling_currency || 'USD';

      // Build items snapshot
      const itemsResult = await pool.query(`
        SELECT id, item_code, description, quantity, rolled_up_cost,
               margin_percent, selling_price_inr, selling_price, parent_project_item_id
        FROM project_items WHERE project_id = $1 ORDER BY id
      `, [projectId]);
      const itemsSnapshot = itemsResult.rows;

      const totalCostInr = itemsSnapshot
        .filter((i: any) => !i.parent_project_item_id)
        .reduce((s: number, i: any) => s + parseFloat(i.rolled_up_cost || '0'), 0);
      const totalSellingInr = itemsSnapshot
        .filter((i: any) => !i.parent_project_item_id)
        .reduce((s: number, i: any) => s + parseFloat(i.selling_price_inr || '0'), 0);
      const totalSellingForeign = exchangeRate > 0 ? totalSellingInr / exchangeRate : null;

      // Generate snapshot number
      const countResult = await pool.query(`SELECT COUNT(*)+1 AS rev FROM project_commercial_snapshots WHERE project_id = $1`, [projectId]);
      const revisionNum = parseInt((countResult.rows[0] as any).rev);
      const snapshotNumber = `CS-${String(projectId).padStart(4,'0')}-R${String(revisionNum).padStart(2,'0')}`;

      const inserted = await pool.query(`
        INSERT INTO project_commercial_snapshots
          (project_id, snapshot_number, revision, status, selling_currency, exchange_rate,
           total_cost_inr, total_selling_inr, total_selling_foreign,
           incoterms, payment_terms, delivery_terms, offer_validity_days,
           notes, items_snapshot, created_by)
        VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING *
      `, [
        projectId, snapshotNumber, revisionNum, sellingCurrency, exchangeRate,
        totalCostInr.toFixed(2), totalSellingInr.toFixed(2),
        totalSellingForeign !== null ? totalSellingForeign.toFixed(2) : null,
        proj.incoterms || null, proj.payment_terms || null, proj.delivery_terms || null,
        proj.offer_validity_days || 30, req.body.notes || null,
        JSON.stringify(itemsSnapshot), userId,
      ]);

      res.json(inserted.rows[0]);
    } catch (error) {
      sendError(res, error);
    }
  });

  // GET /api/projects/:projectId/pricing/snapshots/:snapshotId/price-sheet — price sheet export data
  app.get('/api/projects/:projectId/pricing/snapshots/:snapshotId/price-sheet', ensureAuthenticated, requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const snapshotId = parseInt(req.params.snapshotId);
      if (isNaN(projectId) || isNaN(snapshotId)) return sendValidationError(res, 'Invalid IDs');

      const result = await pool.query(`
        SELECT s.*, p.name AS project_name, p.code AS project_code,
               c.company_name AS customer_name,
               u.username AS created_by_name, ua.username AS approved_by_name
        FROM project_commercial_snapshots s
        JOIN projects p ON p.id = s.project_id
        LEFT JOIN customers c ON c.id = p.customer_id
        LEFT JOIN users u ON u.id = s.created_by
        LEFT JOIN users ua ON ua.id = s.approved_by
        WHERE s.id = $1 AND s.project_id = $2
      `, [snapshotId, projectId]);

      if (result.rows.length === 0) return sendNotFound(res, 'Snapshot not found');
      const snap = result.rows[0] as any;

      // Build structured price sheet
      const priceSheet = {
        snapshotNumber: snap.snapshot_number,
        revision: snap.revision,
        status: snap.status,
        projectName: snap.project_name,
        projectCode: snap.project_code,
        customerName: snap.customer_name,
        createdByName: snap.created_by_name,
        approvedByName: snap.approved_by_name,
        approvedAt: snap.approved_at,
        createdAt: snap.created_at,
        sellingCurrency: snap.selling_currency,
        exchangeRate: snap.exchange_rate,
        totalCostInr: snap.total_cost_inr,
        totalSellingInr: snap.total_selling_inr,
        totalSellingForeign: snap.total_selling_foreign,
        incoterms: snap.incoterms,
        paymentTerms: snap.payment_terms,
        deliveryTerms: snap.delivery_terms,
        offerValidityDays: snap.offer_validity_days,
        notes: snap.notes,
        items: snap.items_snapshot,
      };

      res.json(priceSheet);
    } catch (error) {
      sendError(res, error);
    }
  });

  // Customer Management Routes
  // ── Helper: derive next BP Code from SAP highest-code OData query ─────────
  // Strategy: single SAP call — $filter=startswith(CardCode,'<prefix>'),
  //           $orderby=CardCode desc, $top=1.
  // No full pagination. No local DB. No hardcoded floor.
  // Returns 503 on any failure — caller must not fall back to any other method.
  async function sapNextBpCode(
    prefix: 'C' | 'V',
    res: Response
  ): Promise<string | null> {
    // No upfront health check — sapSession.request() handles auto-login.
    // The health check was blocking valid requests when the session had expired
    // or not yet been established at startup. Only return 503 if the actual
    // SAP HTTP call fails.
    const qs = new URLSearchParams({
      '$filter':   `startswith(CardCode,'${prefix}')`,
      '$select':   'CardCode',
      '$orderby':  'CardCode desc',
      '$top':      '1',
    }).toString();
    const path = `/b1s/v1/BusinessPartners?${qs}`;

    let resp: Awaited<ReturnType<typeof sapSession.request>>;
    try {
      resp = await sapSession.request({ method: 'GET', path, timeout: 15000 });
    } catch (e: any) {
      console.error(`[next-${prefix.toLowerCase()}bp-code] SAP request threw:`, e.message);
      res.status(503).json({ error: `SAP B1 request failed: ${e.message}` });
      return null;
    }

    if (!resp.ok) {
      const detail = resp.body?.substring(0, 300) ?? `HTTP ${resp.statusCode}`;
      console.error(`[next-${prefix.toLowerCase()}bp-code] SAP returned ${resp.statusCode}:`, detail);
      res.status(503).json({ error: `SAP B1 returned an error (HTTP ${resp.statusCode}): ${detail}` });
      return null;
    }

    const body = JSON.parse(resp.body) as { value?: Array<{ CardCode: string }> };
    const row  = body?.value?.[0];

    if (!row?.CardCode) {
      console.error(`[next-${prefix.toLowerCase()}bp-code] SAP returned empty value array — no ${prefix}-prefix codes exist`);
      res.status(503).json({ error: `SAP B1 returned no ${prefix}-prefix BP Codes. Cannot derive next code.` });
      return null;
    }

    const code = row.CardCode;
    const m    = code.match(/^([CV])(\d+)$/);
    if (!m || m[1] !== prefix) {
      console.error(`[next-${prefix.toLowerCase()}bp-code] SAP returned unrecognised code: "${code}"`);
      res.status(503).json({ error: `SAP B1 returned an unrecognisable BP Code format: "${code}". Expected ${prefix} followed by digits only.` });
      return null;
    }

    // Preserve original digit width from SAP result
    const numericPart = m[2];                              // e.g. "10365"
    const width       = numericPart.length;                // e.g. 5
    const nextNum     = parseInt(numericPart, 10) + 1;    // e.g. 10366
    const nextCode    = prefix + String(nextNum).padStart(width, '0');  // e.g. "C10366"

    console.log(`[next-${prefix.toLowerCase()}bp-code] SAP highest = ${code} → next = ${nextCode} (width=${width})`);
    return nextCode;
  }

  // GET /api/customers/next-bp-code — Customer BP Code (C-prefix)
  app.get('/api/customers/next-bp-code', ensureAuthenticated, async (req: Request, res: Response) => {
    const nextCode = await sapNextBpCode('C', res);
    if (nextCode !== null) res.json({ nextBpCode: nextCode });
  });

  // GET /api/customers/next-vendor-bp-code — Vendor BP Code (V-prefix)
  app.get('/api/customers/next-vendor-bp-code', ensureAuthenticated, async (req: Request, res: Response) => {
    const nextCode = await sapNextBpCode('V', res);
    if (nextCode !== null) res.json({ nextBpCode: nextCode });
  });

  app.get('/api/customers', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const customers = await storage.getAllCustomers();
      res.json(customers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      sendError(res, error);
    }
  });

  app.get('/api/customers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const customerId = parseInt(req.params.id);
      const customer = await storage.getCustomer(customerId);
      
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      res.json(customer);
    } catch (error) {
      console.error(`Error fetching customer ${req.params.id}:`, error);
      sendError(res, error);
    }
  });

  app.post('/api/customers/verify-email', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ valid: false, reason: 'Email is required' });
      }
      const { verifyEmailDomain } = await import('./email-verify');
      const result = await verifyEmailDomain(email);
      res.json(result);
    } catch (error: any) {
      res.json({ valid: true });
    }
  });

  app.post('/api/customers', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if the user has permission to create customers
      const managementRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!managementRoles.includes(req.user!.role)) {
        return res.status(403).json({ error: 'Not authorized to create customers' });
      }

      // ── BP Code prefix enforcement (server-side mandatory guard) ──────────
      const incomingBpCode: string = (req.body.bpCode ?? '').toString().trim();
      const incomingCardType: string = (req.body.cardType ?? '').toString().trim();
      if (!incomingBpCode) {
        return res.status(400).json({ error: 'BP Code is required. It must be fetched from SAP B1 before creating a record.' });
      }
      if (incomingCardType === 'S') {
        return res.status(400).json({ error: 'Legacy S-prefix supplier creation is not allowed. Use card type V (Vendor) with a Vxxxxx BP Code.' });
      }
      if (incomingCardType === 'C' && !/^C\d+$/.test(incomingBpCode)) {
        return res.status(400).json({ error: 'Customer BP Code must start with C followed by digits only (e.g. C10412).' });
      }
      if (incomingCardType === 'V' && !/^V\d+$/.test(incomingBpCode)) {
        return res.status(400).json({ error: 'Vendor BP Code must start with V followed by digits only (e.g. V10051).' });
      }
      // ─────────────────────────────────────────────────────────────────────

      if (req.body.email) {
        const { verifyEmailDomain } = await import('./email-verify');
        const emailCheck = await verifyEmailDomain(req.body.email);
        if (!emailCheck.valid) {
          return res.status(400).json({ error: `Email verification failed: ${emailCheck.reason}` });
        }
      }
      
      const customerData = insertCustomerSchema.parse({
        ...req.body,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Check if BP code already exists
      if (customerData.bpCode) {
        const existingCustomer = await storage.getCustomerByBPCode(customerData.bpCode);
        if (existingCustomer) {
          return res.status(400).json({ error: 'A customer with this BP code already exists' });
        }
      }
      
      const customer = await storage.createCustomer(customerData);
      
      try {
        const { sapBPSyncService } = await import('./sap-b1-integration/sap-bp-sync');
        const sapResult = await sapBPSyncService.createBusinessPartner(customer);
        if (sapResult.success) {
          console.log(`✅ Customer ${customer.bpCode} synced to SAP B1`);
          await pool.query(
            `UPDATE customers SET sap_sync_status='synced', sap_sync_error=NULL, sap_synced_at=NOW(), updated_at=NOW() WHERE id=$1`,
            [customer.id]
          );
        } else {
          console.error(`❌ Customer ${customer.bpCode} created locally but SAP sync failed: ${sapResult.error}`);
          await pool.query(
            `UPDATE customers SET sap_sync_status='failed', sap_sync_error=$1, updated_at=NOW() WHERE id=$2`,
            [sapResult.error ?? 'Unknown SAP error', customer.id]
          );
          await pool.query(
            `INSERT INTO sap_customer_sync_logs (triggered_by, started_at, completed_at, status, total_fetched, imported, skipped, failed, error_summary)
             VALUES ($1, NOW(), NOW(), 'failed', 1, 0, 0, 1, $2)`,
            [req.user!.username ?? 'system', sapResult.error ?? 'Unknown SAP error']
          ).catch(() => {});
        }
        res.status(201).json({ ...customer, sapSyncStatus: sapResult.success ? 'synced' : 'failed', sapSyncError: sapResult.error });
      } catch (sapError: any) {
        console.error(`❌ SAP sync failed for new customer ${customer.bpCode}: ${sapError.message}`);
        await pool.query(
          `UPDATE customers SET sap_sync_status='failed', sap_sync_error=$1, updated_at=NOW() WHERE id=$2`,
          [sapError.message, customer.id]
        ).catch(() => {});
        res.status(201).json({ ...customer, sapSyncStatus: 'failed', sapSyncError: sapError.message });
      }
    } catch (error) {
      console.error('Error creating customer:', error);
      res.status(400).json({ error: 'Failed to create customer', details: error.message });
    }
  });

  app.put('/api/customers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const customerId = parseInt(req.params.id);
      
      // Check if the user has permission to update customers
      const managementRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!managementRoles.includes(req.user!.role)) {
        return res.status(403).json({ error: 'Not authorized to update customers' });
      }
      
      // Check if customer exists
      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (req.body.shortCode !== undefined && customer.shortCode && req.body.shortCode !== customer.shortCode) {
        return res.status(400).json({ error: 'Customer short_code is immutable once set. It cannot be changed because existing project codes depend on it.' });
      }

      if (req.body.email && req.body.email !== customer.email) {
        const { verifyEmailDomain } = await import('./email-verify');
        const emailCheck = await verifyEmailDomain(req.body.email);
        if (!emailCheck.valid) {
          return res.status(400).json({ error: `Email verification failed: ${emailCheck.reason}` });
        }
      }
      
      // Check if BP code is being changed and if it already exists
      if (req.body.bpCode && req.body.bpCode !== customer.bpCode) {
        const existingCustomer = await storage.getCustomerByBPCode(req.body.bpCode);
        if (existingCustomer && existingCustomer.id !== customerId) {
          return res.status(400).json({ error: 'A customer with this BP code already exists' });
        }
      }
      
      // Update customer data
      const updateData = {
        ...req.body,
        updatedAt: new Date()
      };

      // Guard: never let the UI form overwrite a real GSTIN with 'NA' or empty.
      // The GSTIN is populated by SAP sync only; the edit form should not clear it.
      if (!updateData.glblLocNum || updateData.glblLocNum === 'NA') {
        delete updateData.glblLocNum;
      }
      
      const updatedCustomer = await storage.updateCustomer(customerId, updateData);
      
      try {
        const { sapBPSyncService } = await import('./sap-b1-integration/sap-bp-sync');
        const sapResult = await sapBPSyncService.updateBusinessPartner(updatedCustomer);
        if (sapResult.success) {
          console.log(`✅ Customer ${updatedCustomer.bpCode} updated in SAP B1`);
          await pool.query(
            `UPDATE customers SET sap_sync_status='synced', sap_sync_error=NULL, sap_synced_at=NOW(), updated_at=NOW() WHERE id=$1`,
            [customerId]
          );
        } else {
          console.error(`❌ Customer ${updatedCustomer.bpCode} updated locally but SAP sync failed: ${sapResult.error}`);
          await pool.query(
            `UPDATE customers SET sap_sync_status='failed', sap_sync_error=$1, updated_at=NOW() WHERE id=$2`,
            [sapResult.error ?? 'Unknown SAP error', customerId]
          );
          await pool.query(
            `INSERT INTO sap_customer_sync_logs (triggered_by, started_at, completed_at, status, total_fetched, imported, skipped, failed, error_summary)
             VALUES ($1, NOW(), NOW(), 'failed', 1, 0, 0, 1, $2)`,
            [req.user!.username ?? 'system', sapResult.error ?? 'Unknown SAP error']
          ).catch(() => {});
        }
        res.json({ ...updatedCustomer, sapSyncStatus: sapResult.success ? 'synced' : 'failed', sapSyncError: sapResult.error });
      } catch (sapError: any) {
        console.error(`❌ SAP sync failed for ${updatedCustomer.bpCode}: ${sapError.message}`);
        await pool.query(
          `UPDATE customers SET sap_sync_status='failed', sap_sync_error=$1, updated_at=NOW() WHERE id=$2`,
          [sapError.message, customerId]
        ).catch(() => {});
        res.json({ ...updatedCustomer, sapSyncStatus: 'failed', sapSyncError: sapError.message });
      }
    } catch (error) {
      console.error(`Error updating customer ${req.params.id}:`, error);
      res.status(400).json({ error: 'Failed to update customer', details: error.message });
    }
  });

  // ── POST /api/customers/:id/retry-sap-sync ───────────────────────────────
  // Re-pushes a 'failed' record to SAP B1. Only available when sap_sync_status = 'failed'.
  app.post('/api/customers/:id/retry-sap-sync', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const managementRoles = ['Superuser', 'General Manager', 'Senior Manager'];
      if (!managementRoles.includes(req.user!.role)) {
        return res.status(403).json({ error: 'Not authorized to retry SAP sync.' });
      }
      const customerId = parseInt(req.params.id);
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      if (customer.sapSyncStatus !== 'failed') {
        return res.status(400).json({ error: "Retry is only available for records with SAP sync status 'failed'." });
      }
      const { sapBPSyncService } = await import('./sap-b1-integration/sap-bp-sync');
      const sapResult = await sapBPSyncService.updateBusinessPartner(customer);
      if (sapResult.success) {
        await pool.query(
          `UPDATE customers SET sap_sync_status='synced', sap_sync_error=NULL, sap_synced_at=NOW(), updated_at=NOW() WHERE id=$1`,
          [customerId]
        );
        await pool.query(
          `INSERT INTO sap_customer_sync_logs (triggered_by, started_at, completed_at, status, total_fetched, imported, skipped, failed, error_summary)
           VALUES ($1, NOW(), NOW(), 'synced', 1, 1, 0, 0, NULL)`,
          [req.user!.username ?? 'system']
        ).catch(() => {});
        console.log(`✅ [retry-sap-sync] Customer ${customer.bpCode} re-synced to SAP B1 by ${req.user!.username}`);
        return res.json({ success: true });
      } else {
        await pool.query(
          `UPDATE customers SET sap_sync_error=$1, updated_at=NOW() WHERE id=$2`,
          [sapResult.error ?? 'Unknown SAP error', customerId]
        );
        await pool.query(
          `INSERT INTO sap_customer_sync_logs (triggered_by, started_at, completed_at, status, total_fetched, imported, skipped, failed, error_summary)
           VALUES ($1, NOW(), NOW(), 'failed', 1, 0, 0, 1, $2)`,
          [req.user!.username ?? 'system', sapResult.error ?? 'Unknown SAP error']
        ).catch(() => {});
        console.error(`❌ [retry-sap-sync] Customer ${customer.bpCode} retry failed: ${sapResult.error}`);
        return res.json({ success: false, error: sapResult.error });
      }
    } catch (err: any) {
      console.error('[retry-sap-sync] error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/customers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const customerId = parseInt(req.params.id);
      
      // Check if the user has permission to delete customers
      const managementRoles = ['Superuser', 'General Manager', 'Senior Manager'];
      if (!managementRoles.includes(req.user!.role)) {
        return res.status(403).json({ error: 'Not authorized to delete customers' });
      }
      
      // Check if customer exists
      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      // Check if customer is associated with any projects
      const projects = await storage.getUserProjects(req.user!.id);
      const associatedProjects = projects.filter(project => project.customerId === customerId);
      
      if (associatedProjects.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete customer with associated projects', 
          projects: associatedProjects.map(p => ({ id: p.id, name: p.name, code: p.code }))
        });
      }
      
      await storage.deleteCustomer(customerId);
      res.status(204).send();
    } catch (error) {
      console.error(`Error deleting customer ${req.params.id}:`, error);
      sendError(res, error);
    }
  });

  // ─── GET /api/customers/sap-bp/:cardCode ─────────────────────────────────
  // Fetches raw SAP BP fields (including email) for a single CardCode — read-only lookup.
  app.get('/api/customers/sap-bp/:cardCode', ensureAuthenticated, async (req: Request, res: Response) => {
    const role: string = ((req.user as any)?.role) ?? '';
    const ALLOWED = ['Superuser', 'General Manager', 'Senior Manager'];
    if (!ALLOWED.includes(role)) return res.status(403).json({ message: 'Forbidden' });

    const cardCode = req.params.cardCode.trim().toUpperCase();
    try {
      const resp = await sapSession.request({ method: 'GET', path: `/b1s/v1/BusinessPartners('${cardCode}')` });
      if (!resp.ok) return res.status(resp.statusCode).json({ message: `SAP ${resp.statusCode}: ${resp.body?.substring(0, 200)}` });
      const bp = JSON.parse(resp.body);
      // Return the key fields the UI cares about
      return res.json({
        CardCode:      bp.CardCode,
        CardName:      bp.CardName,
        EmailAddress:  bp.EmailAddress   ?? null,
        Phone1:        bp.Phone1         ?? null,
        ContactPerson: bp.ContactPerson  ?? null,
        City:          bp.City           ?? null,
        Country:       bp.Country        ?? null,
        // First contact employee email as fallback
        contactEmail:  bp.ContactEmployees?.[0]?.E_Mail ?? null,
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ─── SAP country code (ISO 3166-1 alpha-2) → { name, continent } ──────────
  // Used by both customer-sap-sync and vendor-sap-sync to populate country_name,
  // country_code, and continent from the SAP `Country` field.
  const SAP_COUNTRY: Record<string, { name: string; continent: string }> = {
    AF: { name: 'Afghanistan',            continent: 'Asia'          },
    AL: { name: 'Albania',                continent: 'Europe'        },
    DZ: { name: 'Algeria',                continent: 'Africa'        },
    AO: { name: 'Angola',                 continent: 'Africa'        },
    AR: { name: 'Argentina',              continent: 'South America' },
    AM: { name: 'Armenia',                continent: 'Asia'          },
    AU: { name: 'Australia',              continent: 'Oceania'       },
    AT: { name: 'Austria',                continent: 'Europe'        },
    AZ: { name: 'Azerbaijan',             continent: 'Asia'          },
    BH: { name: 'Bahrain',                continent: 'Asia'          },
    BD: { name: 'Bangladesh',             continent: 'Asia'          },
    BY: { name: 'Belarus',                continent: 'Europe'        },
    BE: { name: 'Belgium',                continent: 'Europe'        },
    BJ: { name: 'Benin',                  continent: 'Africa'        },
    BT: { name: 'Bhutan',                 continent: 'Asia'          },
    BO: { name: 'Bolivia',                continent: 'South America' },
    BA: { name: 'Bosnia and Herzegovina', continent: 'Europe'        },
    BW: { name: 'Botswana',               continent: 'Africa'        },
    BR: { name: 'Brazil',                 continent: 'South America' },
    BN: { name: 'Brunei',                 continent: 'Asia'          },
    BG: { name: 'Bulgaria',               continent: 'Europe'        },
    BF: { name: 'Burkina Faso',           continent: 'Africa'        },
    BI: { name: 'Burundi',                continent: 'Africa'        },
    KH: { name: 'Cambodia',               continent: 'Asia'          },
    CM: { name: 'Cameroon',               continent: 'Africa'        },
    CA: { name: 'Canada',                 continent: 'North America' },
    CF: { name: 'Central African Republic', continent: 'Africa'      },
    TD: { name: 'Chad',                   continent: 'Africa'        },
    CL: { name: 'Chile',                  continent: 'South America' },
    CN: { name: 'China',                  continent: 'Asia'          },
    CO: { name: 'Colombia',               continent: 'South America' },
    KM: { name: 'Comoros',                continent: 'Africa'        },
    CG: { name: 'Congo',                  continent: 'Africa'        },
    CR: { name: 'Costa Rica',             continent: 'North America' },
    HR: { name: 'Croatia',                continent: 'Europe'        },
    CU: { name: 'Cuba',                   continent: 'North America' },
    CY: { name: 'Cyprus',                 continent: 'Europe'        },
    CZ: { name: 'Czech Republic',         continent: 'Europe'        },
    DK: { name: 'Denmark',                continent: 'Europe'        },
    DJ: { name: 'Djibouti',               continent: 'Africa'        },
    DO: { name: 'Dominican Republic',     continent: 'North America' },
    EC: { name: 'Ecuador',                continent: 'South America' },
    EG: { name: 'Egypt',                  continent: 'Africa'        },
    SV: { name: 'El Salvador',            continent: 'North America' },
    GQ: { name: 'Equatorial Guinea',      continent: 'Africa'        },
    ER: { name: 'Eritrea',                continent: 'Africa'        },
    EE: { name: 'Estonia',                continent: 'Europe'        },
    SZ: { name: 'Eswatini',               continent: 'Africa'        },
    ET: { name: 'Ethiopia',               continent: 'Africa'        },
    FJ: { name: 'Fiji',                   continent: 'Oceania'       },
    FI: { name: 'Finland',                continent: 'Europe'        },
    FR: { name: 'France',                 continent: 'Europe'        },
    GA: { name: 'Gabon',                  continent: 'Africa'        },
    GM: { name: 'Gambia',                 continent: 'Africa'        },
    GE: { name: 'Georgia',                continent: 'Asia'          },
    DE: { name: 'Germany',                continent: 'Europe'        },
    GH: { name: 'Ghana',                  continent: 'Africa'        },
    GR: { name: 'Greece',                 continent: 'Europe'        },
    GT: { name: 'Guatemala',              continent: 'North America' },
    GN: { name: 'Guinea',                 continent: 'Africa'        },
    GW: { name: 'Guinea-Bissau',          continent: 'Africa'        },
    GY: { name: 'Guyana',                 continent: 'South America' },
    HT: { name: 'Haiti',                  continent: 'North America' },
    HN: { name: 'Honduras',               continent: 'North America' },
    HU: { name: 'Hungary',                continent: 'Europe'        },
    IS: { name: 'Iceland',                continent: 'Europe'        },
    IN: { name: 'India',                  continent: 'Asia'          },
    ID: { name: 'Indonesia',              continent: 'Asia'          },
    IR: { name: 'Iran',                   continent: 'Asia'          },
    IQ: { name: 'Iraq',                   continent: 'Asia'          },
    IE: { name: 'Ireland',                continent: 'Europe'        },
    IL: { name: 'Israel',                 continent: 'Asia'          },
    IT: { name: 'Italy',                  continent: 'Europe'        },
    CI: { name: 'Ivory Coast',            continent: 'Africa'        },
    JM: { name: 'Jamaica',                continent: 'North America' },
    JP: { name: 'Japan',                  continent: 'Asia'          },
    JO: { name: 'Jordan',                 continent: 'Asia'          },
    KZ: { name: 'Kazakhstan',             continent: 'Asia'          },
    KE: { name: 'Kenya',                  continent: 'Africa'        },
    KW: { name: 'Kuwait',                 continent: 'Asia'          },
    KG: { name: 'Kyrgyzstan',             continent: 'Asia'          },
    LA: { name: 'Laos',                   continent: 'Asia'          },
    LV: { name: 'Latvia',                 continent: 'Europe'        },
    LB: { name: 'Lebanon',                continent: 'Asia'          },
    LS: { name: 'Lesotho',                continent: 'Africa'        },
    LR: { name: 'Liberia',                continent: 'Africa'        },
    LY: { name: 'Libya',                  continent: 'Africa'        },
    LI: { name: 'Liechtenstein',          continent: 'Europe'        },
    LT: { name: 'Lithuania',              continent: 'Europe'        },
    LU: { name: 'Luxembourg',             continent: 'Europe'        },
    MG: { name: 'Madagascar',             continent: 'Africa'        },
    MW: { name: 'Malawi',                 continent: 'Africa'        },
    MY: { name: 'Malaysia',               continent: 'Asia'          },
    MV: { name: 'Maldives',               continent: 'Asia'          },
    ML: { name: 'Mali',                   continent: 'Africa'        },
    MT: { name: 'Malta',                  continent: 'Europe'        },
    MR: { name: 'Mauritania',             continent: 'Africa'        },
    MU: { name: 'Mauritius',              continent: 'Africa'        },
    MX: { name: 'Mexico',                 continent: 'North America' },
    MD: { name: 'Moldova',                continent: 'Europe'        },
    MC: { name: 'Monaco',                 continent: 'Europe'        },
    MN: { name: 'Mongolia',               continent: 'Asia'          },
    ME: { name: 'Montenegro',             continent: 'Europe'        },
    MA: { name: 'Morocco',                continent: 'Africa'        },
    MZ: { name: 'Mozambique',             continent: 'Africa'        },
    MM: { name: 'Myanmar',                continent: 'Asia'          },
    NA: { name: 'Namibia',                continent: 'Africa'        },
    NP: { name: 'Nepal',                  continent: 'Asia'          },
    NL: { name: 'Netherlands',            continent: 'Europe'        },
    NZ: { name: 'New Zealand',            continent: 'Oceania'       },
    NI: { name: 'Nicaragua',              continent: 'North America' },
    NE: { name: 'Niger',                  continent: 'Africa'        },
    NG: { name: 'Nigeria',                continent: 'Africa'        },
    KP: { name: 'North Korea',            continent: 'Asia'          },
    MK: { name: 'North Macedonia',        continent: 'Europe'        },
    NO: { name: 'Norway',                 continent: 'Europe'        },
    OM: { name: 'Oman',                   continent: 'Asia'          },
    PK: { name: 'Pakistan',               continent: 'Asia'          },
    PS: { name: 'Palestine',              continent: 'Asia'          },
    PA: { name: 'Panama',                 continent: 'North America' },
    PG: { name: 'Papua New Guinea',       continent: 'Oceania'       },
    PY: { name: 'Paraguay',               continent: 'South America' },
    PE: { name: 'Peru',                   continent: 'South America' },
    PH: { name: 'Philippines',            continent: 'Asia'          },
    PL: { name: 'Poland',                 continent: 'Europe'        },
    PT: { name: 'Portugal',               continent: 'Europe'        },
    QA: { name: 'Qatar',                  continent: 'Asia'          },
    RO: { name: 'Romania',                continent: 'Europe'        },
    RU: { name: 'Russia',                 continent: 'Europe'        },
    RW: { name: 'Rwanda',                 continent: 'Africa'        },
    SA: { name: 'Saudi Arabia',           continent: 'Asia'          },
    SN: { name: 'Senegal',                continent: 'Africa'        },
    RS: { name: 'Serbia',                 continent: 'Europe'        },
    SL: { name: 'Sierra Leone',           continent: 'Africa'        },
    SG: { name: 'Singapore',              continent: 'Asia'          },
    SK: { name: 'Slovakia',               continent: 'Europe'        },
    SI: { name: 'Slovenia',               continent: 'Europe'        },
    SO: { name: 'Somalia',                continent: 'Africa'        },
    ZA: { name: 'South Africa',           continent: 'Africa'        },
    KR: { name: 'South Korea',            continent: 'Asia'          },
    SS: { name: 'South Sudan',            continent: 'Africa'        },
    ES: { name: 'Spain',                  continent: 'Europe'        },
    LK: { name: 'Sri Lanka',              continent: 'Asia'          },
    SD: { name: 'Sudan',                  continent: 'Africa'        },
    SR: { name: 'Suriname',               continent: 'South America' },
    SE: { name: 'Sweden',                 continent: 'Europe'        },
    CH: { name: 'Switzerland',            continent: 'Europe'        },
    SY: { name: 'Syria',                  continent: 'Asia'          },
    TW: { name: 'Taiwan',                 continent: 'Asia'          },
    TJ: { name: 'Tajikistan',             continent: 'Asia'          },
    TZ: { name: 'Tanzania',               continent: 'Africa'        },
    TH: { name: 'Thailand',               continent: 'Asia'          },
    TG: { name: 'Togo',                   continent: 'Africa'        },
    TT: { name: 'Trinidad and Tobago',    continent: 'North America' },
    TN: { name: 'Tunisia',                continent: 'Africa'        },
    TR: { name: 'Turkey',                 continent: 'Europe'        },
    TM: { name: 'Turkmenistan',           continent: 'Asia'          },
    UG: { name: 'Uganda',                 continent: 'Africa'        },
    UA: { name: 'Ukraine',                continent: 'Europe'        },
    AE: { name: 'United Arab Emirates',   continent: 'Asia'          },
    GB: { name: 'United Kingdom',         continent: 'Europe'        },
    US: { name: 'United States',          continent: 'North America' },
    UY: { name: 'Uruguay',                continent: 'South America' },
    UZ: { name: 'Uzbekistan',             continent: 'Asia'          },
    VE: { name: 'Venezuela',              continent: 'South America' },
    VN: { name: 'Vietnam',                continent: 'Asia'          },
    YE: { name: 'Yemen',                  continent: 'Asia'          },
    ZM: { name: 'Zambia',                 continent: 'Africa'        },
    ZW: { name: 'Zimbabwe',               continent: 'Africa'        },
  };

  // ─── POST /api/customers/sap-sync ────────────────────────────────────────
  // Syncs customers from SAP BusinessPartners (CardType=cCustomer, CardCode > C10300)
  // Only inserts NEW records — existing sap_card_code rows are skipped.
  // Allowed roles: Superuser, General Manager, Senior Manager
  app.post('/api/customers/sap-sync', ensureAuthenticated, async (req: Request, res: Response) => {
    const user = req.user!;
    const role: string = (user as any).role ?? '';
    const ALLOWED = ['Superuser', 'General Manager', 'Senior Manager'];
    if (!ALLOWED.includes(role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }

    const sapUser = process.env.SAP_B1_USERNAME || '';
    const sapPass = process.env.SAP_B1_PASSWORD || '';
    const sapDb   = process.env.SAP_COMPANY_DB || '';
    if (!sapUser || !sapPass || !sapDb) {
      return res.status(500).json({ message: 'SAP credentials not configured' });
    }

    // Optional: single-card test mode — body { cardCode: 'C10301' }
    const testCardCode: string | undefined = typeof req.body?.cardCode === 'string'
      ? req.body.cardCode.trim().toUpperCase()
      : undefined;

    let logId: number | null = null;
    const errors: string[] = [];
    let totalFetched = 0, imported = 0, skipped = 0, failed = 0;

    try {
      // Create audit log row
      const logRes = await pool.query(
        `INSERT INTO sap_customer_sync_logs (triggered_by, started_at, status) VALUES ($1, NOW(), 'running') RETURNING id`,
        [(user as any).id],
      );
      logId = logRes.rows[0].id;

      // SAP CardType → local card_type mapping.
      // SAP Service Layer uses full strings ('cCustomer', 'cSupplier', 'cLead').
      // card_type is read from the SAP response, never hardcoded.
      const sapCardTypeMap: Record<string, string> = {
        cCustomer: 'C',
        cSupplier: 'V',
        cLead:     'L',
      };

      type ContactEntry = { Name: string; Position: string; Email: string; Phone: string; };
      type BPRow = {
        CardCode: string; CardType: string; CardName: string;
        Currency: string; FederalTaxID: string;
        ContactPerson: string; Phone1: string;
        Address: string; City: string; Country: string; EmailAddress: string;
        UStateSupply: string; UBpGstType: string;
        Contacts: ContactEntry[];
        BillToAddress: string | null; ShipToAddress: string | null;
      };
      const parseSapBpRow = (bp: any): BPRow => {
        const code = String(bp.CardCode ?? '').trim();
        const bpContacts: any[] = Array.isArray(bp.ContactEmployees) ? bp.ContactEmployees : [];
        const bpAddresses: any[] = Array.isArray(bp.BPAddresses) ? bp.BPAddresses : [];
        const fmtAddr = (a: any) => a ? [a.Street, a.City, a.State, a.ZipCode].filter(Boolean).join(', ') || null : null;
        const billEntry = bpAddresses.find((a) => a?.AddressType === 'bo_BillTo');
        const shipEntry = bpAddresses.find((a) => a?.AddressType === 'bo_ShipTo');
        // SAP sometimes returns literal field names (e.g. "Position") as placeholder values — reject them.
        const sapStr = (v: any, ...placeholders: string[]): string => {
          const s = String(v ?? '').trim();
          return placeholders.some((p) => p.toLowerCase() === s.toLowerCase()) ? '' : s;
        };
        return {
          CardCode:      code,
          CardType:      String(bp.CardType      ?? '').trim(),
          CardName:      String(bp.CardName      ?? '').trim(),
          Currency:      String(bp.Currency      ?? '').trim(),
          FederalTaxID:  String(bp.GlblLocNum    ?? bp.FederalTaxID ?? '').trim(),
          ContactPerson: String(bp.ContactPerson ?? '').trim(),
          Phone1:        String(bp.Cellular       ?? bp.Phone1       ?? '').trim(),
          Address:       String(bp.Address       ?? '').trim(),
          City:          String(bp.City          ?? '').trim(),
          Country:       String(bp.Country       ?? '').trim(),
          EmailAddress:  String(bp.EmailAddress  ?? bp.ContactEmployees?.[0]?.E_Mail ?? '').trim(),
          UStateSupply:  String(bp.U_StateSupply ?? '').trim(),
          UBpGstType:    String(bp.U_BP_GstType  ?? '').trim(),
          Contacts: bpContacts.slice(0, 3).map((c) => ({
            Name:     sapStr(c.Name,     'Name'),
            Position: sapStr(c.Position, 'Position'),
            Email:    sapStr(c.E_Mail,   'E_Mail', 'Email'),
            Phone:    sapStr(c.Phone1,   'Phone1', 'Phone'),
          })),
          BillToAddress: fmtAddr(billEntry) || String(bp.Address ?? '').trim() || null,
          ShipToAddress: fmtAddr(shipEntry),
        };
      };
      let filteredRows: BPRow[] = [];

      if (testCardCode) {
        // ── Single-card test mode ──────────────────────────────────────────────
        // Fetch one BP by primary key — no $select so all fields (including UDFs) are returned.
        console.log(`[customer-sap-sync] TEST MODE — fetching single BP: ${testCardCode}`);
        const resp = await sapSession.request({
          method: 'GET', path: `/b1s/v1/BusinessPartners('${testCardCode}')`,
        });
        if (!resp.ok) {
          throw new Error(`SAP returned ${resp.statusCode}: ${resp.body?.substring(0, 300)}`);
        }
        const bp = JSON.parse(resp.body);
        // Dump ALL non-array top-level fields so we can identify GSTIN field name
        const testRaw = Object.keys(bp).filter(k => !Array.isArray(bp[k])).reduce((acc: any, k) => { acc[k] = bp[k]; return acc; }, {});
        console.log(`[customer-sap-sync] TEST RAW ALL FIELDS for ${bp.CardCode}:`, JSON.stringify(testRaw).substring(0, 4000));
        if (bp.CardCode) filteredRows = [parseSapBpRow(bp)];
        totalFetched = filteredRows.length;
        console.log(`[customer-sap-sync] TEST fetched ${totalFetched} record(s)`);
      } else {
        // ── Bulk sync mode ─────────────────────────────────────────────────────
        // No $select — SAP strips UDF columns when $select is present.
        // $filter on standard field (CardType) still works without $select.
        const PAGE_SIZE = 20;
        let sapSkip = 0;
        const allRows: BPRow[] = [];

        while (true) {
          const qs = new URLSearchParams({
            '$filter': "CardType eq 'cCustomer'",
            '$top':    String(PAGE_SIZE),
            '$skip':   String(sapSkip),
          }).toString();

          const resp = await sapSession.request({
            method: 'GET', path: `/b1s/v1/BusinessPartners?${qs}`,
          });

          if (!resp.ok) {
            throw new Error(`SAP returned ${resp.statusCode}: ${resp.body?.substring(0, 300)}`);
          }

          const page = JSON.parse(resp.body).value ?? [];
          for (const bp of page) {
            const code = String(bp.CardCode ?? '').trim();
            if (!code) continue;
            // Diagnostic: log raw SAP fields for first 3 customer records per sync
            if (allRows.length < 3) {
              console.log(`[customer-sap-sync] RAW bp CardCode=${bp.CardCode} | GlblLocNum=${JSON.stringify(bp.GlblLocNum)} | FederalTaxID=${JSON.stringify(bp.FederalTaxID)} | Cellular=${JSON.stringify(bp.Cellular)} | Phone1=${JSON.stringify(bp.Phone1)} | U_StateSupply=${JSON.stringify(bp.U_StateSupply)} | U_BP_GstType=${JSON.stringify(bp.U_BP_GstType)} | ContactEmployees_count=${Array.isArray(bp.ContactEmployees) ? bp.ContactEmployees.length : 'MISSING'} | BPAddresses_count=${Array.isArray(bp.BPAddresses) ? bp.BPAddresses.length : 'MISSING'}`);
            }
            allRows.push(parseSapBpRow(bp));
          }

          if (page.length < PAGE_SIZE) break;
          sapSkip += PAGE_SIZE;
          if (allRows.length >= 10000) {
            console.warn('[customer-sap-sync] capped at 10 000 records');
            break;
          }
        }

        // Client-side filter: cCustomer CardType + C-prefix CardCode + CardCode > 'C10300'.
        // Belt-and-suspenders: CardType from SAP is the authoritative guard; C-prefix + numeric
        // range are secondary safety checks against data anomalies.
        filteredRows = allRows.filter(
          (r) => r.CardType === 'cCustomer' && /^C\d+$/i.test(r.CardCode) && r.CardCode > 'C10300',
        );
        totalFetched = filteredRows.length;
        console.log(`[customer-sap-sync] fetched ${allRows.length} from SAP, ${totalFetched} pass cCustomer + C-prefix + CardCode > 'C10300' filter`);
      }

      // Load existing sap_card_codes in one query to avoid per-row round-trips
      const existingRes = await pool.query<{ sap_card_code: string }>(
        `SELECT sap_card_code FROM customers WHERE sap_card_code IS NOT NULL`,
      );
      const existingCodes = new Set(existingRes.rows.map((r) => r.sap_card_code));

      for (const row of filteredRows) {
        if (existingCodes.has(row.CardCode)) {
          // Patch missing fields on existing records (test mode or bulk re-sync).
          const primaryEmail = row.Contacts[0]?.Email || row.EmailAddress || null;
          const countryInfo2 = SAP_COUNTRY[(row.Country ?? '').toUpperCase()] ?? null;
          const gstin2 = (row.FederalTaxID && row.FederalTaxID !== '') ? row.FederalTaxID : null;
          await pool.query(
            `UPDATE customers SET
               phone1             = COALESCE(NULLIF(phone1,''),             $2),
               contact_position   = COALESCE(NULLIF(contact_position,''),  $3),
               email              = COALESCE(NULLIF(email,''),              $4),
               sap_email          = COALESCE(NULLIF(sap_email,''),          $4),
               contact2_name      = COALESCE(NULLIF(contact2_name,''),      $5),
               contact2_position  = COALESCE(NULLIF(contact2_position,''),  $6),
               contact2_email     = COALESCE(NULLIF(contact2_email,''),     $7),
               contact2_phone     = COALESCE(NULLIF(contact2_phone,''),     $8),
               contact3_name      = COALESCE(NULLIF(contact3_name,''),      $9),
               contact3_position  = COALESCE(NULLIF(contact3_position,''),  $10),
               contact3_email     = COALESCE(NULLIF(contact3_email,''),     $11),
               contact3_phone     = COALESCE(NULLIF(contact3_phone,''),     $12),
               bill_to_address    = COALESCE(NULLIF(bill_to_address,''),    $13),
               ship_to_address    = COALESCE(NULLIF(ship_to_address,''),    $14),
               currency           = COALESCE(NULLIF(currency,''),           $15),
               country_name       = COALESCE(NULLIF(country_name,''),       $16),
               country_code       = COALESCE(NULLIF(country_code,''),       $17),
               continent          = COALESCE(NULLIF(continent,''),          $18),
               glbl_loc_num       = CASE WHEN $19::text IS NOT NULL AND (glbl_loc_num IS NULL OR glbl_loc_num = 'NA') THEN $19::text ELSE COALESCE(NULLIF(glbl_loc_num,''), 'NA') END,
               u_state_supply     = COALESCE(NULLIF(u_state_supply,''),     $20),
               u_bp_gst_type      = COALESCE(NULLIF(u_bp_gst_type,''),      $21),
               sap_currency       = COALESCE(NULLIF(sap_currency,''),       $22),
               sap_synced_at = NOW(), updated_at = NOW()
             WHERE sap_card_code = $1`,
            [
              row.CardCode,
              row.Phone1 || null,
              row.Contacts[0]?.Position || null,
              primaryEmail,
              row.Contacts[1]?.Name || null, row.Contacts[1]?.Position || null,
              row.Contacts[1]?.Email || null, row.Contacts[1]?.Phone || null,
              row.Contacts[2]?.Name || null, row.Contacts[2]?.Position || null,
              row.Contacts[2]?.Email || null, row.Contacts[2]?.Phone || null,
              row.BillToAddress,
              row.ShipToAddress,
              row.Currency || null,
              countryInfo2?.name || null, row.Country || null, countryInfo2?.continent || null,
              gstin2,
              row.UStateSupply || null,
              row.UBpGstType || null,
              row.Currency || null,
            ],
          );
          skipped++;
          continue;
        }
        try {
          // short_code is varchar(5) NOT NULL UNIQUE.
          // Strip the leading 'C' and take up to 5 digits — e.g. C10301 → '10301'.
          const shortCode = row.CardCode.replace(/^[Cc]/, '').slice(0, 5);
          // card_type sourced from SAP CardType field, not hardcoded.
          const localCardType = sapCardTypeMap[row.CardType] ?? 'C';
          const primaryEmail = row.Contacts[0]?.Email || row.EmailAddress || null;
          const countryInfo = SAP_COUNTRY[(row.Country ?? '').toUpperCase()] ?? null;
          const gstin = (row.FederalTaxID && row.FederalTaxID !== '') ? row.FederalTaxID : 'NA';
          await pool.query(
            `INSERT INTO customers
               (bp_code, bp_name, short_code, sap_card_code, card_type,
                contact_person, contact_position, phone1, email,
                contact2_name, contact2_position, contact2_email, contact2_phone,
                contact3_name, contact3_position, contact3_email, contact3_phone,
                bill_to_address, ship_to_address,
                sap_mail_city, sap_mail_country, sap_email, sap_currency,
                currency, country_name, country_code, continent,
                glbl_loc_num, u_state_supply, u_bp_gst_type,
                sap_sync_status, sap_synced_at, created_at, updated_at)
             VALUES
               ($1,$2,$3,$4,$5,
                $6,$7,$8,$9,
                $10,$11,$12,$13,
                $14,$15,$16,$17,
                $18,$19,
                $20,$21,$22,$23,
                $24,$25,$26,$27,
                $28,$29,$30,
                'synced',NOW(),NOW(),NOW())
             ON CONFLICT DO NOTHING`,
            [
              row.CardCode, row.CardName, shortCode, row.CardCode, localCardType,
              row.ContactPerson || null, row.Contacts[0]?.Position || null, row.Phone1 || null, primaryEmail,
              row.Contacts[1]?.Name || null, row.Contacts[1]?.Position || null, row.Contacts[1]?.Email || null, row.Contacts[1]?.Phone || null,
              row.Contacts[2]?.Name || null, row.Contacts[2]?.Position || null, row.Contacts[2]?.Email || null, row.Contacts[2]?.Phone || null,
              row.BillToAddress, row.ShipToAddress,
              row.City || null, row.Country || null, primaryEmail, row.Currency || null,
              row.Currency || 'USD', countryInfo?.name || null, row.Country || null, countryInfo?.continent || null,
              gstin, row.UStateSupply || 'MH', row.UBpGstType || 'G',
            ],
          );
          existingCodes.add(row.CardCode);
          imported++;
        } catch (err: any) {
          failed++;
          errors.push(`${row.CardCode}: ${err.message}`);
          console.error(`[customer-sap-sync] insert failed for ${row.CardCode}:`, err.message);
        }
      }

      // Do NOT logout — shared session must stay alive for vendor sync

      // Update audit log — success
      if (logId) {
        await pool.query(
          `UPDATE sap_customer_sync_logs SET
             completed_at = NOW(), status = $1,
             total_fetched = $2, imported = $3, skipped = $4, failed = $5, error_summary = $6
           WHERE id = $7`,
          [
            failed > 0 ? 'partial' : 'success',
            totalFetched, imported, skipped, failed,
            errors.length > 0 ? errors.slice(0, 20).join('\n') : null,
            logId,
          ],
        );
      }

      // ── GSTIN enrichment pass ───────────────────────────────────────────────────
      // SAP's bulk list endpoint does NOT return GlblLocNum.
      // Fetch each record individually for any customer whose GSTIN is still 'NA'.
      try {
        const naRows = await pool.query<{ sap_card_code: string }>(
          `SELECT sap_card_code FROM customers WHERE card_type = 'C' AND sap_card_code IS NOT NULL AND (glbl_loc_num IS NULL OR glbl_loc_num = 'NA')`,
        );
        let gstinUpdated = 0;
        for (const nr of naRows.rows) {
          try {
            const gstin = await querySapGstin(nr.sap_card_code);
            console.log(`[customer-sap-sync] GSTIN SQL enrich ${nr.sap_card_code}: raw="${gstin}"`);
            if (gstin && gstin.length >= 5) {
              await pool.query(`UPDATE customers SET glbl_loc_num = $1, updated_at = NOW() WHERE sap_card_code = $2`, [gstin, nr.sap_card_code]);
              gstinUpdated++;
            }
          } catch (e2: any) { console.warn(`[customer-sap-sync] GSTIN enrich error ${nr.sap_card_code}:`, e2.message); }
        }
        console.log(`[customer-sap-sync] GSTIN enrichment: ${gstinUpdated}/${naRows.rows.length} records updated`);
      } catch (e: any) {
        console.warn('[customer-sap-sync] GSTIN enrichment skipped:', e.message);
      }

      console.log(`[customer-sap-sync] done — fetched=${totalFetched} imported=${imported} skipped=${skipped} failed=${failed}`);
      return res.json({ totalFetched, imported, skipped, failed, errors: errors.slice(0, 20) });

    } catch (err: any) {
      console.error('[customer-sap-sync] fatal error:', err.message);
      // Do NOT logout — shared session must stay alive for vendor sync
      if (logId) {
        await pool.query(
          `UPDATE sap_customer_sync_logs SET
             completed_at = NOW(), status = 'failed',
             total_fetched = $1, imported = $2, skipped = $3, failed = $4, error_summary = $5
           WHERE id = $6`,
          [totalFetched, imported, skipped, failed, err.message, logId],
        ).catch(() => {});
      }
      return res.status(500).json({ message: err.message });
    }
  });

  // ─── POST /api/customers/vendor-sap-sync ────────────────────────────────────
  // Bulk-syncs Vendor/Supplier BPs from SAP (CardType=cSupplier, CardCode starts with V).
  // INSERT-only policy — existing sap_card_code rows are skipped.
  // Sets card_type='V' and maps EmailAddress to both email and sap_email.
  // Allowed roles: Superuser, General Manager, Senior Manager
  app.post('/api/customers/vendor-sap-sync', ensureAuthenticated, async (req: Request, res: Response) => {
    const user = req.user!;
    const role: string = (user as any).role ?? '';
    const ALLOWED = ['Superuser', 'General Manager', 'Senior Manager'];
    if (!ALLOWED.includes(role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }

    const sapUser = process.env.SAP_B1_USERNAME || '';
    const sapPass = process.env.SAP_B1_PASSWORD || '';
    const sapDb   = process.env.SAP_COMPANY_DB || '';
    if (!sapUser || !sapPass || !sapDb) {
      return res.status(500).json({ message: 'SAP credentials not configured' });
    }

    let logId: number | null = null;
    const errors: string[] = [];
    let totalFetched = 0, imported = 0, skipped = 0, failed = 0;

    try {
      const logRes = await pool.query(
        `INSERT INTO sap_customer_sync_logs (triggered_by, started_at, status) VALUES ($1, NOW(), 'running') RETURNING id`,
        [(user as any).id],
      );
      logId = logRes.rows[0].id;

      // SAP CardType → local card_type mapping (same as customer sync).
      const sapCardTypeMap: Record<string, string> = {
        cCustomer: 'C',
        cSupplier: 'V',
        cLead:     'L',
      };

      type VContactEntry = { Name: string; Position: string; Email: string; Phone: string; };
      type VBPRow = {
        CardCode: string; CardType: string; CardName: string;
        Currency: string; FederalTaxID: string;
        ContactPerson: string; Phone1: string;
        Address: string; City: string; Country: string; EmailAddress: string;
        UStateSupply: string; UBpGstType: string;
        Contacts: VContactEntry[];
        BillToAddress: string | null; ShipToAddress: string | null;
      };
      const parseVendorBpRow = (bp: any): VBPRow => {
        const code = String(bp.CardCode ?? '').trim();
        const bpContacts: any[] = Array.isArray(bp.ContactEmployees) ? bp.ContactEmployees : [];
        const bpAddresses: any[] = Array.isArray(bp.BPAddresses) ? bp.BPAddresses : [];
        const fmtAddr = (a: any) => a ? [a.Street, a.City, a.State, a.ZipCode].filter(Boolean).join(', ') || null : null;
        const billEntry = bpAddresses.find((a) => a?.AddressType === 'bo_BillTo');
        const shipEntry = bpAddresses.find((a) => a?.AddressType === 'bo_ShipTo');
        // SAP sometimes returns literal field names (e.g. "Position") as placeholder values — reject them.
        const sapStr = (v: any, ...placeholders: string[]): string => {
          const s = String(v ?? '').trim();
          return placeholders.some((p) => p.toLowerCase() === s.toLowerCase()) ? '' : s;
        };
        return {
          CardCode:      code,
          CardType:      String(bp.CardType      ?? '').trim(),
          CardName:      String(bp.CardName      ?? '').trim(),
          Currency:      String(bp.Currency      ?? '').trim(),
          FederalTaxID:  String(bp.GlblLocNum    ?? bp.FederalTaxID ?? '').trim(),
          ContactPerson: String(bp.ContactPerson ?? '').trim(),
          Phone1:        String(bp.Cellular       ?? bp.Phone1       ?? '').trim(),
          Address:       String(bp.Address       ?? '').trim(),
          City:          String(bp.City          ?? '').trim(),
          Country:       String(bp.Country       ?? '').trim(),
          EmailAddress:  String(bp.EmailAddress  ?? bp.ContactEmployees?.[0]?.E_Mail ?? '').trim(),
          UStateSupply:  String(bp.U_StateSupply ?? '').trim(),
          UBpGstType:    String(bp.U_BP_GstType  ?? '').trim(),
          Contacts: bpContacts.slice(0, 3).map((c) => ({
            Name:     sapStr(c.Name,     'Name'),
            Position: sapStr(c.Position, 'Position'),
            Email:    sapStr(c.E_Mail,   'E_Mail', 'Email'),
            Phone:    sapStr(c.Phone1,   'Phone1', 'Phone'),
          })),
          BillToAddress: fmtAddr(billEntry) || String(bp.Address ?? '').trim() || null,
          ShipToAddress: fmtAddr(shipEntry),
        };
      };
      const testCardCode: string = (req.body?.cardCode ?? '').toString().trim().toUpperCase();
      const allRows: VBPRow[] = [];
      let filteredRows: VBPRow[] = [];

      if (testCardCode) {
        // ── Single-card test mode ──────────────────────────────────────────────
        console.log(`[vendor-sap-sync] TEST MODE — fetching single BP: ${testCardCode}`);
        const resp = await sapSession.request({
          method: 'GET', path: `/b1s/v1/BusinessPartners('${testCardCode}')`,
        });
        if (!resp.ok) {
          throw new Error(`SAP returned ${resp.statusCode}: ${resp.body?.substring(0, 300)}`);
        }
        const bp = JSON.parse(resp.body);
        // Dump ALL non-array top-level fields so we can identify correct field names
        const testRaw = Object.keys(bp).filter(k => !Array.isArray(bp[k])).reduce((acc: Record<string,any>, k) => { acc[k] = bp[k]; return acc; }, {});
        console.log(`[vendor-sap-sync] TEST RAW ALL FIELDS for ${bp.CardCode}:`, JSON.stringify(testRaw).substring(0, 5000));
        if (bp.CardCode) filteredRows = [parseVendorBpRow(bp)];
        totalFetched = filteredRows.length;
        console.log(`[vendor-sap-sync] TEST fetched ${totalFetched} record(s)`);
      } else {
        // ── Bulk sync mode ─────────────────────────────────────────────────────
        const PAGE_SIZE = 20;
        let sapSkip = 0;

        while (true) {
          // No $select — SAP strips UDF columns (U_StateSupply, U_BP_GstType) when $select is present.
          const qs = new URLSearchParams({
            '$filter': "CardType eq 'cSupplier'",
            '$top':    String(PAGE_SIZE),
            '$skip':   String(sapSkip),
          }).toString();

          const resp = await sapSession.request({ method: 'GET', path: `/b1s/v1/BusinessPartners?${qs}` });
          if (!resp.ok) {
            throw new Error(`SAP returned ${resp.statusCode}: ${resp.body?.substring(0, 300)}`);
          }

          const page = JSON.parse(resp.body).value ?? [];
          for (const bp of page) {
            const code = String(bp.CardCode ?? '').trim();
            if (!code) continue;
            // Diagnostic: log raw SAP fields for first 3 vendor records per page
            if (allRows.length < 3) {
              console.log(`[vendor-sap-sync] RAW bp CardCode=${bp.CardCode} | GlblLocNum=${JSON.stringify(bp.GlblLocNum)} | FederalTaxID=${JSON.stringify(bp.FederalTaxID)} | Cellular=${JSON.stringify(bp.Cellular)} | Phone1=${JSON.stringify(bp.Phone1)} | U_StateSupply=${JSON.stringify(bp.U_StateSupply)} | U_BP_GstType=${JSON.stringify(bp.U_BP_GstType)} | ContactEmployees_count=${Array.isArray(bp.ContactEmployees) ? bp.ContactEmployees.length : 'MISSING'} | BPAddresses_count=${Array.isArray(bp.BPAddresses) ? bp.BPAddresses.length : 'MISSING'}`);
            }
            allRows.push(parseVendorBpRow(bp));
          }

          if (page.length < PAGE_SIZE) break;
          sapSkip += PAGE_SIZE;
          if (allRows.length >= 10000) {
            console.warn('[vendor-sap-sync] capped at 10 000 records');
            break;
          }
        }

        // Client-side filter: V-prefixed CardCodes only (excludes legacy S-prefix SAP suppliers)
        filteredRows = allRows.filter((r) => /^V\d+$/i.test(r.CardCode));
        totalFetched = filteredRows.length;
        console.log(`[vendor-sap-sync] fetched ${allRows.length} from SAP, ${totalFetched} pass V-prefix filter`);
      }

      const existingRes = await pool.query<{ sap_card_code: string }>(
        `SELECT sap_card_code FROM customers WHERE sap_card_code IS NOT NULL`,
      );
      const existingCodes = new Set(existingRes.rows.map((r) => r.sap_card_code));

      for (const row of filteredRows) {
        if (existingCodes.has(row.CardCode)) {
          // Correct card_type if wrong, AND backfill any previously-empty enrichment fields.
          const vPrimaryEmail = row.Contacts[0]?.Email || row.EmailAddress || null;
          const vCountryInfo = SAP_COUNTRY[(row.Country ?? '').toUpperCase()] ?? null;
          const vGstin2 = (row.FederalTaxID && row.FederalTaxID !== '') ? row.FederalTaxID : null;
          await pool.query(
            `UPDATE customers SET
               card_type          = 'V',
               phone1             = COALESCE(NULLIF(phone1,''),             $2),
               contact_position   = COALESCE(NULLIF(contact_position,''),  $3),
               email              = COALESCE(NULLIF(email,''),              $4),
               sap_email          = COALESCE(NULLIF(sap_email,''),          $4),
               contact2_name      = COALESCE(NULLIF(contact2_name,''),      $5),
               contact2_position  = COALESCE(NULLIF(contact2_position,''),  $6),
               contact2_email     = COALESCE(NULLIF(contact2_email,''),     $7),
               contact2_phone     = COALESCE(NULLIF(contact2_phone,''),     $8),
               contact3_name      = COALESCE(NULLIF(contact3_name,''),      $9),
               contact3_position  = COALESCE(NULLIF(contact3_position,''),  $10),
               contact3_email     = COALESCE(NULLIF(contact3_email,''),     $11),
               contact3_phone     = COALESCE(NULLIF(contact3_phone,''),     $12),
               bill_to_address    = COALESCE(NULLIF(bill_to_address,''),    $13),
               ship_to_address    = COALESCE(NULLIF(ship_to_address,''),    $14),
               currency           = COALESCE(NULLIF(currency,''),           $15),
               country_name       = COALESCE(NULLIF(country_name,''),       $16),
               country_code       = COALESCE(NULLIF(country_code,''),       $17),
               continent          = COALESCE(NULLIF(continent,''),          $18),
               glbl_loc_num       = CASE WHEN $19::text IS NOT NULL AND (glbl_loc_num IS NULL OR glbl_loc_num = 'NA') THEN $19::text ELSE COALESCE(NULLIF(glbl_loc_num,''), 'NA') END,
               u_state_supply     = COALESCE(NULLIF(u_state_supply,''),     $20),
               u_bp_gst_type      = COALESCE(NULLIF(u_bp_gst_type,''),      $21),
               sap_currency       = COALESCE(NULLIF(sap_currency,''),       $22),
               sap_synced_at = NOW(), updated_at = NOW()
             WHERE sap_card_code = $1`,
            [
              row.CardCode,
              row.Phone1 || null,
              row.Contacts[0]?.Position || null,
              vPrimaryEmail,
              row.Contacts[1]?.Name || null, row.Contacts[1]?.Position || null,
              row.Contacts[1]?.Email || null, row.Contacts[1]?.Phone || null,
              row.Contacts[2]?.Name || null, row.Contacts[2]?.Position || null,
              row.Contacts[2]?.Email || null, row.Contacts[2]?.Phone || null,
              row.BillToAddress,
              row.ShipToAddress,
              row.Currency || null,
              vCountryInfo?.name || null, row.Country || null, vCountryInfo?.continent || null,
              vGstin2,
              row.UStateSupply || null,
              row.UBpGstType || null,
              row.Currency || null,
            ],
          );
          skipped++;
          continue;
        }
        try {
          // short_code: strip leading 'V' and take up to 5 digits — e.g. V10001 → '10001'.
          const shortCode = row.CardCode.replace(/^[Vv]/, '').slice(0, 5);
          // card_type sourced from SAP CardType field, not hardcoded.
          const localCardType = sapCardTypeMap[row.CardType] ?? 'V';
          const vPrimaryEmail = row.Contacts[0]?.Email || row.EmailAddress || null;
          const vCountryInfo = SAP_COUNTRY[(row.Country ?? '').toUpperCase()] ?? null;
          const vGstin = (row.FederalTaxID && row.FederalTaxID !== '') ? row.FederalTaxID : 'NA';
          await pool.query(
            `INSERT INTO customers
               (bp_code, bp_name, short_code, sap_card_code, card_type,
                contact_person, contact_position, phone1, email,
                contact2_name, contact2_position, contact2_email, contact2_phone,
                contact3_name, contact3_position, contact3_email, contact3_phone,
                bill_to_address, ship_to_address,
                sap_mail_city, sap_mail_country, sap_email, sap_currency,
                currency, country_name, country_code, continent,
                glbl_loc_num, u_state_supply, u_bp_gst_type,
                sap_sync_status, sap_synced_at, created_at, updated_at)
             VALUES
               ($1,$2,$3,$4,$5,
                $6,$7,$8,$9,
                $10,$11,$12,$13,
                $14,$15,$16,$17,
                $18,$19,
                $20,$21,$22,$23,
                $24,$25,$26,$27,
                $28,$29,$30,
                'synced',NOW(),NOW(),NOW())
             ON CONFLICT DO NOTHING`,
            [
              row.CardCode, row.CardName, shortCode, row.CardCode, localCardType,
              row.ContactPerson || null, row.Contacts[0]?.Position || null, row.Phone1 || null, vPrimaryEmail,
              row.Contacts[1]?.Name || null, row.Contacts[1]?.Position || null, row.Contacts[1]?.Email || null, row.Contacts[1]?.Phone || null,
              row.Contacts[2]?.Name || null, row.Contacts[2]?.Position || null, row.Contacts[2]?.Email || null, row.Contacts[2]?.Phone || null,
              row.BillToAddress, row.ShipToAddress,
              row.City || null, row.Country || null, vPrimaryEmail, row.Currency || null,
              row.Currency || 'USD', vCountryInfo?.name || null, row.Country || null, vCountryInfo?.continent || null,
              vGstin, row.UStateSupply || 'MH', row.UBpGstType || 'G',
            ],
          );
          existingCodes.add(row.CardCode);
          imported++;
        } catch (err: any) {
          failed++;
          errors.push(`${row.CardCode}: ${err.message}`);
          console.error(`[vendor-sap-sync] insert failed for ${row.CardCode}:`, err.message);
        }
      }

      if (logId) {
        await pool.query(
          `UPDATE sap_customer_sync_logs SET
             completed_at = NOW(), status = $1,
             total_fetched = $2, imported = $3, skipped = $4, failed = $5, error_summary = $6
           WHERE id = $7`,
          [
            failed > 0 ? 'partial' : 'success',
            totalFetched, imported, skipped, failed,
            errors.length > 0 ? errors.slice(0, 20).join('\n') : null,
            logId,
          ],
        );
      }

      // ── GSTIN enrichment pass ───────────────────────────────────────────────────
      // SAP's bulk list endpoint does NOT return GlblLocNum.
      // Fetch each vendor individually for any record whose GSTIN is still 'NA'.
      try {
        const naRows = await pool.query<{ sap_card_code: string }>(
          `SELECT sap_card_code FROM customers WHERE card_type = 'V' AND sap_card_code IS NOT NULL AND (glbl_loc_num IS NULL OR glbl_loc_num = 'NA')`,
        );
        let gstinUpdated = 0;
        for (const nr of naRows.rows) {
          try {
            const gstin = await querySapGstin(nr.sap_card_code);
            console.log(`[vendor-sap-sync] GSTIN SQL enrich ${nr.sap_card_code}: raw="${gstin}"`);
            if (gstin && gstin.length >= 5) {
              await pool.query(`UPDATE customers SET glbl_loc_num = $1, updated_at = NOW() WHERE sap_card_code = $2`, [gstin, nr.sap_card_code]);
              gstinUpdated++;
            }
          } catch (e2: any) { console.warn(`[vendor-sap-sync] GSTIN enrich error ${nr.sap_card_code}:`, e2.message); }
        }
        console.log(`[vendor-sap-sync] GSTIN enrichment: ${gstinUpdated}/${naRows.rows.length} records updated`);
      } catch (e: any) {
        console.warn('[vendor-sap-sync] GSTIN enrichment skipped:', e.message);
      }

      console.log(`[vendor-sap-sync] done — fetched=${totalFetched} imported=${imported} skipped=${skipped} failed=${failed}`);
      return res.json({ totalFetched, imported, skipped, failed, errors: errors.slice(0, 20) });

    } catch (err: any) {
      console.error('[vendor-sap-sync] fatal error:', err.message);
      if (logId) {
        await pool.query(
          `UPDATE sap_customer_sync_logs SET
             completed_at = NOW(), status = 'failed',
             total_fetched = $1, imported = $2, skipped = $3, failed = $4, error_summary = $5
           WHERE id = $6`,
          [totalFetched, imported, skipped, failed, err.message, logId],
        ).catch(() => {});
      }
      return res.status(500).json({ message: err.message });
    }
  });

  // ─── Planning Record Lifecycle Routes ─────────────────────────────────────

  app.get('/api/projects/:projectId/planning-records', ensureAuthenticated, requirePageAccess('planning-control'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;

      let query = sql`SELECT ipr.*, u1.username as assigned_to_name, u2.username as created_by_name,
                              u3.username as reviewed_by_name, u4.username as released_by_name,
                              u5.username as cancelled_by_name,
                              mi.description as item_description, mi.item_code,
                              mi.uom as item_uom, mi.make_or_buy as item_make_or_buy,
                              mi.specification as item_specification, mi.drawing_no as item_drawing_no,
                              mi.standard_cost as item_standard_cost
                       FROM item_planning_records ipr
                       LEFT JOIN users u1 ON ipr.assigned_to = u1.id
                       LEFT JOIN users u2 ON ipr.created_by = u2.id
                       LEFT JOIN users u3 ON ipr.reviewed_by = u3.id
                       LEFT JOIN users u4 ON ipr.released_by = u4.id
                       LEFT JOIN users u5 ON ipr.cancelled_by = u5.id
                       LEFT JOIN master_items mi ON ipr.master_item_id = mi.id
                       WHERE ipr.project_id = ${projectId}`;

      if (statusFilter) query = sql`${query} AND ipr.status = ${statusFilter}`;
      if (itemFilter) query = sql`${query} AND ipr.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY ipr.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/planning-records/:id', ensureAuthenticated, requirePageAccess('planning-control'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');

      const result = await db.execute(
        sql`SELECT ipr.*, u1.username as assigned_to_name, u2.username as created_by_name,
                   u3.username as reviewed_by_name, u4.username as released_by_name,
                   u5.username as cancelled_by_name,
                   mi.description as item_description, mi.item_code,
                   mi.uom as item_uom, mi.make_or_buy as item_make_or_buy,
                   mi.specification as item_specification, mi.drawing_no as item_drawing_no,
                   mi.standard_cost as item_standard_cost
            FROM item_planning_records ipr
            LEFT JOIN users u1 ON ipr.assigned_to = u1.id
            LEFT JOIN users u2 ON ipr.created_by = u2.id
            LEFT JOIN users u3 ON ipr.reviewed_by = u3.id
            LEFT JOIN users u4 ON ipr.released_by = u4.id
            LEFT JOIN users u5 ON ipr.cancelled_by = u5.id
            LEFT JOIN master_items mi ON ipr.master_item_id = mi.id
            WHERE ipr.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      res.json(result.rows[0]);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/planning-records/:id/submit-for-review', ensureAuthenticated, requirePageAccess('planning-control'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('item_planning_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM item_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'draft') {
        return sendBusinessError(res, `Cannot submit for review: record is in '${record.status}' status. Only 'draft' records can be submitted.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(itemPlanningRecords)
          .set({ status: 'under_review', updatedAt: new Date() })
          .where(eq(itemPlanningRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'planning_record.submitted_for_review', ${JSON.stringify({
            planningRecordId: id, planningType: record.planning_type,
            projectItemId: record.project_item_id, submittedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[PlanningLifecycle] Record ${id} submitted for review by user ${userId}`);
      res.json({ success: true, message: 'Planning record submitted for review', id, newStatus: 'under_review' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/planning-records/:id/review', ensureAuthenticated, requirePageAccess('planning-control'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('item_planning_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');
      const userId = (req.user as any)?.id;
      const { reviewNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM item_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_review') {
        return sendBusinessError(res, `Cannot review: record is in '${record.status}' status. Only 'under_review' records can be reviewed.`);
      }

      if (record.created_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the creator/submitter cannot also review the same planning record.');
      }

      await db.transaction(async (tx) => {
        await tx.update(itemPlanningRecords)
          .set({
            reviewedBy: userId, reviewedAt: new Date(),
            reviewNote: reviewNote || null, updatedAt: new Date(),
          })
          .where(eq(itemPlanningRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'planning_record.reviewed', ${JSON.stringify({
            planningRecordId: id, planningType: record.planning_type,
            projectItemId: record.project_item_id, reviewedBy: userId, reviewNote,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[PlanningLifecycle] Record ${id} reviewed by user ${userId}`);
      res.json({ success: true, message: 'Planning record reviewed', id, reviewedBy: userId });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/planning-records/:id/release', ensureAuthenticated, requirePageAccess('planning-control'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Senior Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('item_planning_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');
      const userId = (req.user as any)?.id;
      const { releaseNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM item_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_review') {
        return sendBusinessError(res, `Cannot release: record is in '${record.status}' status. Only reviewed 'under_review' records can be released.`);
      }
      if (!record.reviewed_by) {
        return sendBusinessError(res, 'Cannot release: record has not been reviewed yet. Please review first.');
      }

      if (record.reviewed_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the reviewer cannot also release the same planning record. A different authorized user must release it.');
      }

      if (record.created_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the creator/submitter cannot also release the same planning record.');
      }

      const conflicting = await db.execute(
        sql`SELECT id FROM item_planning_records 
            WHERE project_id = ${record.project_id}
              AND project_item_id = ${record.project_item_id}
              AND planning_type = ${record.planning_type}
              AND status = 'released' AND id != ${id}`
      );
      if (conflicting.rows.length > 0) {
        return sendBusinessError(res, `Cannot release: another released planning record (ID ${(conflicting.rows[0] as any).id}) already exists for this item and planning type. Supersede it first.`);
      }

      let procurementExecId: number | null = null;
      let productionExecId: number | null = null;

      await db.transaction(async (tx) => {
        await tx.update(itemPlanningRecords)
          .set({
            status: 'released', releasedBy: userId, releasedAt: new Date(),
            releaseNote: releaseNote || null, updatedAt: new Date(),
          })
          .where(eq(itemPlanningRecords.id, id));

        if (record.planning_type === 'procurement') {
          const existingExec = await tx.execute(
            sql`SELECT id FROM procurement_execution_records 
                WHERE planning_record_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_po')`
          );
          if (existingExec.rows.length === 0) {
            const itemSnapshot = await tx.execute(
              sql`SELECT mi.item_code, mi.description, mi.specification, mi.uom, mi.drawing_no,
                         mi.preferred_vendor_id, mi.estimated_cost, v.name as vendor_name,
                         pi.quantity, pi.estimated_cost as project_estimated_cost
                  FROM project_items pi
                  JOIN master_items mi ON pi.item_id = mi.id
                  LEFT JOIN vendors v ON mi.preferred_vendor_id = v.id
                  WHERE pi.id = ${record.project_item_id}`
            );
            const snap = (itemSnapshot.rows[0] as any) || {};
            const qty = parseFloat(snap.quantity || '0');
            const unitCost = parseFloat(snap.estimated_cost || snap.project_estimated_cost || '0');

            const procurementNumber = await epcCoding.generateDocumentNumber(record.project_id, 'BUY', tx);
            const [newExec] = await tx.insert(procurementExecutionRecords).values({
              procurementNumber,
              projectId: record.project_id,
              projectItemId: record.project_item_id,
              planningRecordId: id,
              masterItemId: record.master_item_id,
              itemCode: snap.item_code || null,
              itemDescription: snap.description || null,
              itemSpecification: snap.specification || null,
              uom: snap.uom || null,
              drawingNo: snap.drawing_no || null,
              quantity: String(qty),
              estimatedUnitCost: unitCost > 0 ? String(unitCost) : null,
              estimatedTotalCost: unitCost > 0 && qty > 0 ? String(unitCost * qty) : null,
              preferredVendorId: snap.preferred_vendor_id || null,
              preferredVendorName: snap.vendor_name || null,
              status: 'draft',
              assignedTo: record.assigned_to,
              createdBy: userId,
            }).returning();
            procurementExecId = newExec.id;
          } else {
            procurementExecId = (existingExec.rows[0] as any).id;
          }
        }

        if (record.planning_type === 'production') {
          const existingExec = await tx.execute(
            sql`SELECT id FROM production_execution_records 
                WHERE planning_record_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_wo')`
          );
          if (existingExec.rows.length === 0) {
            const itemSnapshot = await tx.execute(
              sql`SELECT mi.item_code, mi.description, mi.specification, mi.uom, mi.drawing_no,
                         mi.latest_revision, mi.standard_cost, mi.make_or_buy,
                         pi.quantity, pi.estimated_cost as project_estimated_cost
                  FROM project_items pi
                  JOIN master_items mi ON pi.item_id = mi.id
                  WHERE pi.id = ${record.project_item_id}`
            );
            const snap = (itemSnapshot.rows[0] as any) || {};
            const qty = parseFloat(snap.quantity || '0');
            const unitCost = parseFloat(snap.standard_cost || snap.project_estimated_cost || '0');

            const productionNumber = await epcCoding.generateDocumentNumber(record.project_id, 'MFG', tx);
            const [newExec] = await tx.insert(productionExecutionRecords).values({
              productionNumber,
              projectId: record.project_id,
              projectItemId: record.project_item_id,
              planningRecordId: id,
              masterItemId: record.master_item_id,
              itemCode: snap.item_code || null,
              itemDescription: snap.description || null,
              itemSpecification: snap.specification || null,
              uom: snap.uom || null,
              drawingNo: snap.drawing_no || null,
              drawingRevision: snap.latest_revision || null,
              quantity: String(qty),
              estimatedUnitCost: unitCost > 0 ? String(unitCost) : null,
              estimatedTotalCost: unitCost > 0 && qty > 0 ? String(unitCost * qty) : null,
              makeClassification: snap.make_or_buy || 'Make',
              status: 'draft',
              assignedTo: record.assigned_to,
              createdBy: userId,
            }).returning();
            productionExecId = newExec.id;
          } else {
            productionExecId = (existingExec.rows[0] as any).id;
          }
        }

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'planning_record.released', ${JSON.stringify({
            planningRecordId: id, planningType: record.planning_type,
            projectItemId: record.project_item_id, releasedBy: userId, releaseNote,
          })}::jsonb, 'lifecycle_action', NOW())`);

        if (procurementExecId) {
          await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
            VALUES (${record.project_id}, 'procurement_execution.created_from_release', ${JSON.stringify({
              procurementExecId, planningRecordId: id,
              projectItemId: record.project_item_id, createdBy: userId,
            })}::jsonb, 'lifecycle_action', NOW())`);
        }

        if (productionExecId) {
          await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
            VALUES (${record.project_id}, 'production_execution.created_from_release', ${JSON.stringify({
              productionExecId, planningRecordId: id,
              projectItemId: record.project_item_id, createdBy: userId,
            })}::jsonb, 'lifecycle_action', NOW())`);
        }
      });

      console.log(`[PlanningLifecycle] Record ${id} released by user ${userId}`);
      res.json({ success: true, message: 'Planning record released', id, newStatus: 'released', procurementExecId, productionExecId });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/planning-records/:id/cancel', ensureAuthenticated, requirePageAccess('planning-control'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('item_planning_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM item_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'canceled') {
        return sendBusinessError(res, `Cannot cancel: record is already '${record.status}'.`);
      }

      let cascadedProcExecIds: number[] = [];
      let cascadedProdExecIds: number[] = [];

      await db.transaction(async (tx) => {
        await tx.update(itemPlanningRecords)
          .set({
            status: 'canceled', cancelledBy: userId, cancelledAt: new Date(),
            cancelReason, updatedAt: new Date(),
          })
          .where(eq(itemPlanningRecords.id, id));

        if (record.planning_type === 'procurement') {
          const cascadeResult = await tx.execute(
            sql`UPDATE procurement_execution_records 
                SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                    cancel_reason = ${'Planning record canceled: ' + cancelReason}, updated_at = NOW()
                WHERE planning_record_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_po')
                RETURNING id`
          );
          cascadedProcExecIds = cascadeResult.rows.map((r: any) => r.id);
          for (const procId of cascadedProcExecIds) {
            const canceledQPs = await tx.execute(
              sql`UPDATE quality_planning_records 
                  SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                      cancel_reason = ${'Upstream planning record canceled: ' + cancelReason}, updated_at = NOW()
                  WHERE procurement_exec_id = ${procId} AND status IN ('draft', 'under_preparation', 'ready_for_inspection_setup')
                  RETURNING id`
            );
            for (const qpRow of canceledQPs.rows) {
              await tx.execute(
                sql`UPDATE inspection_execution_records 
                    SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                        cancel_reason = ${'Upstream planning record canceled: ' + cancelReason}, updated_at = NOW()
                    WHERE quality_plan_id = ${(qpRow as any).id} AND status IN ('draft', 'scheduled', 'in_progress')`
              );
            }
            const canceledPOPreps = await tx.execute(
              sql`UPDATE po_preparation_records 
                  SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                      cancel_reason = ${'Upstream planning record canceled: ' + cancelReason}, updated_at = NOW()
                  WHERE execution_record_id = ${procId} AND status IN ('draft', 'under_review', 'ready_for_po_creation')
                  RETURNING id`
            );
            for (const ppRow of canceledPOPreps.rows) {
              await tx.execute(
                sql`UPDATE epc_purchase_orders 
                    SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                        cancel_reason = ${'Upstream planning record canceled: ' + cancelReason}, updated_at = NOW()
                    WHERE po_preparation_id = ${(ppRow as any).id} AND status NOT IN ('canceled', 'superseded')`
              );
            }
          }
        }
        if (record.planning_type === 'production') {
          const cascadeResult = await tx.execute(
            sql`UPDATE production_execution_records 
                SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                    cancel_reason = ${'Planning record canceled: ' + cancelReason}, updated_at = NOW()
                WHERE planning_record_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_wo')
                RETURNING id`
          );
          cascadedProdExecIds = cascadeResult.rows.map((r: any) => r.id);
          for (const prodId of cascadedProdExecIds) {
            const canceledQPs = await tx.execute(
              sql`UPDATE quality_planning_records 
                  SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                      cancel_reason = ${'Upstream planning record canceled: ' + cancelReason}, updated_at = NOW()
                  WHERE production_exec_id = ${prodId} AND status IN ('draft', 'under_preparation', 'ready_for_inspection_setup')
                  RETURNING id`
            );
            for (const qpRow of canceledQPs.rows) {
              await tx.execute(
                sql`UPDATE inspection_execution_records 
                    SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                        cancel_reason = ${'Upstream planning record canceled: ' + cancelReason}, updated_at = NOW()
                    WHERE quality_plan_id = ${(qpRow as any).id} AND status IN ('draft', 'scheduled', 'in_progress')`
              );
            }
            const canceledWOPreps = await tx.execute(
              sql`UPDATE wo_preparation_records 
                  SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                      cancel_reason = ${'Upstream planning record canceled: ' + cancelReason}, updated_at = NOW()
                  WHERE execution_record_id = ${prodId} AND status IN ('draft', 'under_review', 'ready_for_wo_creation')
                  RETURNING id`
            );
            for (const wpRow of canceledWOPreps.rows) {
              await tx.execute(
                sql`UPDATE epc_work_orders 
                    SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                        cancel_reason = ${'Upstream planning record canceled: ' + cancelReason}, updated_at = NOW()
                    WHERE wo_preparation_id = ${(wpRow as any).id} AND status NOT IN ('canceled', 'superseded')`
              );
            }
          }
        }

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'planning_record.canceled', ${JSON.stringify({
            planningRecordId: id, planningType: record.planning_type,
            projectItemId: record.project_item_id, cancelledBy: userId, cancelReason,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[PlanningLifecycle] Record ${id} canceled by user ${userId}`);
      res.json({ success: true, message: 'Planning record canceled', id, newStatus: 'canceled', cascadedProcExecIds, cascadedProdExecIds });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/planning-records/:id/revert-to-draft', ensureAuthenticated, requirePageAccess('planning-control'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('item_planning_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM item_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_review') {
        return sendBusinessError(res, `Cannot revert: only 'under_review' records can be reverted to draft. Current status: '${record.status}'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(itemPlanningRecords)
          .set({
            status: 'draft', reviewedBy: null, reviewedAt: null, reviewNote: null, updatedAt: new Date(),
          })
          .where(eq(itemPlanningRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'planning_record.reverted_to_draft', ${JSON.stringify({
            planningRecordId: id, planningType: record.planning_type,
            projectItemId: record.project_item_id, revertedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[PlanningLifecycle] Record ${id} reverted to draft by user ${userId}`);
      res.json({ success: true, message: 'Planning record reverted to draft', id, newStatus: 'draft' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/planning-records/:id/convert', ensureAuthenticated, requirePageAccess('planning-control'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('item_planning_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid planning record ID');
      const userId = (req.user as any)?.id;
      const { targetType, note } = req.body || {};

      if (!targetType || !['procurement', 'production'].includes(targetType)) {
        return sendValidationError(res, 'targetType must be "procurement" or "production"');
      }

      const existing = await db.execute(sql`SELECT * FROM item_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Planning record not found');
      const record = existing.rows[0] as any;

      if (record.planning_type !== 'review') {
        return sendBusinessError(res, 'Only review-type planning records can be converted.');
      }
      if (record.status === 'superseded' || record.status === 'canceled') {
        return sendBusinessError(res, `Cannot convert: record is '${record.status}'.`);
      }

      const conflicting = await db.execute(
        sql`SELECT id FROM item_planning_records 
            WHERE project_id = ${record.project_id}
              AND project_item_id = ${record.project_item_id}
              AND planning_type = ${targetType}
              AND status IN ('draft', 'under_review', 'released')`
      );
      if (conflicting.rows.length > 0) {
        return sendBusinessError(res, `Cannot convert: an active ${targetType} planning record (ID ${(conflicting.rows[0] as any).id}) already exists for this item.`);
      }

      const newClassification = targetType === 'procurement' ? 'Buy' : 'Make';
      let newRecord: any;
      await db.transaction(async (tx) => {
        const planningNumber = await epcCoding.generateDocumentNumber(record.project_id, 'PLN', tx);
        const [created] = await tx.insert(itemPlanningRecords).values({
          planningNumber,
          projectId: record.project_id,
          projectItemId: record.project_item_id,
          masterItemId: record.master_item_id,
          planningType: targetType,
          status: 'draft',
          classificationSnapshot: newClassification,
          linkedTaskId: record.linked_task_id,
          assignedTo: record.assigned_to,
          createdBy: userId,
          notes: note || `Converted from review record #${id}`,
        }).returning();
        newRecord = created;

        await tx.update(itemPlanningRecords)
          .set({
            status: 'superseded', supersededBy: newRecord.id, supersededAt: new Date(),
            supersessionReason: `Converted to ${targetType} planning record #${newRecord.id}`,
            updatedAt: new Date(),
          })
          .where(eq(itemPlanningRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'planning_record.converted', ${JSON.stringify({
            originalRecordId: id, newRecordId: 0,
            fromType: 'review', toType: targetType,
            projectItemId: record.project_item_id, convertedBy: userId, note,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[PlanningLifecycle] Review record ${id} converted to ${targetType} record ${newRecord.id} by user ${userId}`);
      res.json({
        success: true, message: `Review record converted to ${targetType}`,
        originalRecordId: id, newRecord,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ─── Procurement Execution Record Lifecycle Routes ─────────────────────────

  app.get('/api/projects/:projectId/procurement-executions', ensureAuthenticated, requirePageAccess('procurement-production'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;

      let query = sql`SELECT per.*, u1.username as assigned_to_name, u2.username as created_by_name,
                             u3.username as prepared_by_name, v.name as vendor_display_name
                      FROM procurement_execution_records per
                      LEFT JOIN users u1 ON per.assigned_to = u1.id
                      LEFT JOIN users u2 ON per.created_by = u2.id
                      LEFT JOIN users u3 ON per.prepared_by = u3.id
                      LEFT JOIN vendors v ON per.preferred_vendor_id = v.id
                      WHERE per.project_id = ${projectId}`;

      if (statusFilter) query = sql`${query} AND per.status = ${statusFilter}`;
      if (itemFilter) query = sql`${query} AND per.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY per.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/procurement-executions/:id', ensureAuthenticated, requirePageAccess('procurement-production'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid procurement execution ID');

      const result = await db.execute(
        sql`SELECT per.*, u1.username as assigned_to_name, u2.username as created_by_name,
                   u3.username as prepared_by_name, v.name as vendor_display_name
            FROM procurement_execution_records per
            LEFT JOIN users u1 ON per.assigned_to = u1.id
            LEFT JOIN users u2 ON per.created_by = u2.id
            LEFT JOIN users u3 ON per.prepared_by = u3.id
            LEFT JOIN vendors v ON per.preferred_vendor_id = v.id
            WHERE per.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Procurement execution record not found');
      res.json(result.rows[0]);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/procurement-executions/:id', ensureAuthenticated, requirePageAccess('procurement-production'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid procurement execution ID');

      const existing = await db.execute(sql`SELECT * FROM procurement_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Procurement execution record not found');
      const record = existing.rows[0] as any;

      // Phase 2 PLC hard-block
      if (record.planning_record_id) {
        const plcChk = await pool.query(`SELECT 1 FROM procurement_list_lines WHERE planning_record_id = $1 AND status NOT IN ('cancelled','superseded') LIMIT 1`, [record.planning_record_id]);
        if ((plcChk.rowCount ?? 0) > 0) return res.status(423).json({ error: 'deprecated_path', message: 'Use Procurement List Control to advance this procurement line.' });
      }

      if (record.status === 'superseded' || record.status === 'canceled') {
        return sendBusinessError(res, `Cannot edit: record is '${record.status}'.`);
      }
      if (record.status === 'ready_for_po') {
        return sendBusinessError(res, 'Cannot edit: record is already ready for PO. Revert to under_preparation first.');
      }

      const { quantity, estimatedUnitCost, preferredVendorId, preferredVendorName, procurementNotes } = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (quantity !== undefined) updates.quantity = String(quantity);
      if (estimatedUnitCost !== undefined) {
        updates.estimatedUnitCost = estimatedUnitCost ? String(estimatedUnitCost) : null;
        const qty = quantity !== undefined ? parseFloat(String(quantity)) : parseFloat(record.quantity || '0');
        const uc = parseFloat(String(estimatedUnitCost));
        updates.estimatedTotalCost = uc > 0 && qty > 0 ? String(uc * qty) : null;
      }
      if (preferredVendorId !== undefined) updates.preferredVendorId = preferredVendorId || null;
      if (preferredVendorName !== undefined) updates.preferredVendorName = preferredVendorName || null;
      if (procurementNotes !== undefined) updates.procurementNotes = procurementNotes || null;

      await db.update(procurementExecutionRecords).set(updates).where(eq(procurementExecutionRecords.id, id));
      res.json({ success: true, message: 'Procurement execution record updated', id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/procurement-executions/:id/start-preparation', ensureAuthenticated, requirePageAccess('procurement-production'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid procurement execution ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM procurement_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Procurement execution record not found');
      const record = existing.rows[0] as any;

      // Phase 2 PLC hard-block
      if (record.planning_record_id) {
        const plcChk = await pool.query(`SELECT 1 FROM procurement_list_lines WHERE planning_record_id = $1 AND status NOT IN ('cancelled','superseded') LIMIT 1`, [record.planning_record_id]);
        if ((plcChk.rowCount ?? 0) > 0) return res.status(423).json({ error: 'deprecated_path', message: 'Use Procurement List Control to advance this procurement line.' });
      }

      if (record.status !== 'draft') {
        return sendBusinessError(res, `Cannot start preparation: record is in '${record.status}' status. Only 'draft' records can start preparation.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(procurementExecutionRecords)
          .set({ status: 'under_preparation', preparedBy: userId, preparedAt: new Date(), updatedAt: new Date() })
          .where(eq(procurementExecutionRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'procurement_execution.preparation_started', ${JSON.stringify({
            procurementExecId: id, projectItemId: record.project_item_id,
            planningRecordId: record.planning_record_id, startedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[ProcurementExec] Record ${id} preparation started by user ${userId}`);
      res.json({ success: true, message: 'Procurement preparation started', id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/procurement-executions/:id/mark-ready', ensureAuthenticated, requirePageAccess('procurement-production'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid procurement execution ID');
      const userId = (req.user as any)?.id;
      const { preparationNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM procurement_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Procurement execution record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_preparation') {
        return sendBusinessError(res, `Cannot mark ready: record is in '${record.status}' status. Only 'under_preparation' records can be marked ready.`);
      }

      const qty = parseFloat(record.quantity || '0');
      if (qty <= 0) {
        return sendBusinessError(res, 'Cannot mark ready: quantity must be greater than zero.');
      }

      const classResult = await db.execute(sql`SELECT make_or_buy FROM master_items WHERE id = ${record.master_item_id}`);
      const classification = classResult.rows.length > 0 ? (classResult.rows[0] as any).make_or_buy : null;
      const isBuy = classification === 'Buy';
      const isMake = classification === 'Make';

      const procGateItemCode = record.item_code || record.item_description || `Item #${record.project_item_id}`;

      if (isDwgGateRequired(classification)) {
      const dcResult = await db.execute(
        sql`SELECT id, status, released_for_procurement, released_for_manufacturing, dwg_control_number
            FROM epc_drawing_controls
            WHERE project_item_id = ${record.project_item_id}
              AND status NOT IN ('superseded', 'canceled')
            ORDER BY CASE WHEN status = 'released' THEN 0 WHEN status = 'approved' THEN 1 ELSE 2 END, id DESC
            LIMIT 1`
      );
      const dc = dcResult.rows.length > 0 ? (dcResult.rows[0] as any) : null;

      if (!dc) {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'procurement_execution.gate_blocked', ${JSON.stringify({
            procurementExecId: id, projectItemId: record.project_item_id,
            gate: 'drawing_control', reason: 'No drawing control exists', blockedBy: userId,
          })}::jsonb, 'gate_enforcement', NOW())`);
        const gateDesignLead = await resolveAssignee(record.project_id, 'Engineering', userId);
        const gatePM = await resolveManagerId(record.project_id);
        await createEpcTask({
          projectId: record.project_id, entityType: 'procurement_execution', recordId: id, actionCode: 'gate_blocked',
          title: `Resolve drawing gate block for ${procGateItemCode}`,
          description: `Procurement execution #${id} is blocked: no drawing control exists for this item. Create and release a drawing control to unblock.`,
          assignedTo: gateDesignLead, createdBy: userId, priority: 'High', dueDays: 2,
        });
        const gateAlertRecipients = [gateDesignLead, gatePM].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        await createEpcAlertMulti(gateAlertRecipients, {
          type: 'epc_gate_blocked', title: `CRITICAL: Procurement gate blocked — no drawing for ${procGateItemCode}`,
          message: `Procurement execution for ${procGateItemCode} is blocked. No drawing control exists. Action required.`,
          link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
          entityType: 'procurement_execution', recordId: id, actionCode: 'gate_blocked',
        });
        return sendBusinessError(res, 'Cannot mark ready: no drawing control exists for this item. Create and release a drawing control first.', 
          { action: 'Create a Drawing Control for this project item, then progress it through review → approval → release.' });
      }

      if (isBuy && !dc.released_for_procurement) {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'procurement_execution.gate_blocked', ${JSON.stringify({
            procurementExecId: id, projectItemId: record.project_item_id,
            gate: 'drawing_procurement_release', reason: 'Drawing not released for procurement',
            dwgControlNumber: dc.dwg_control_number, dwgStatus: dc.status, blockedBy: userId,
          })}::jsonb, 'gate_enforcement', NOW())`);
        const gateDesignLead2 = await resolveAssignee(record.project_id, 'Engineering', userId);
        const gatePM2 = await resolveManagerId(record.project_id);
        await createEpcTask({
          projectId: record.project_id, entityType: 'procurement_execution', recordId: id, actionCode: 'gate_blocked',
          title: `Resolve drawing release gate for ${procGateItemCode}`,
          description: `Procurement execution #${id} blocked: drawing ${dc.dwg_control_number} is not released for procurement.`,
          assignedTo: gateDesignLead2, createdBy: userId, priority: 'High', dueDays: 2,
        });
        const gateAlertRecipients2 = [gateDesignLead2, gatePM2].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        await createEpcAlertMulti(gateAlertRecipients2, {
          type: 'epc_gate_blocked', title: `CRITICAL: Procurement gate blocked — drawing not released for ${procGateItemCode}`,
          message: `Drawing ${dc.dwg_control_number} is not released for procurement. Procurement for ${procGateItemCode} is blocked.`,
          link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
          entityType: 'procurement_execution', recordId: id, actionCode: 'gate_blocked',
        });
        return sendBusinessError(res, `Cannot mark ready: drawing control ${dc.dwg_control_number} is not released for procurement. Release the drawing for procurement first.`,
          { action: `Release drawing ${dc.dwg_control_number} for procurement (set released_for_procurement = true).` });
      }

      if (isMake && !dc.released_for_manufacturing) {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'procurement_execution.gate_blocked', ${JSON.stringify({
            procurementExecId: id, projectItemId: record.project_item_id,
            gate: 'drawing_manufacturing_release', reason: 'Drawing not released for manufacturing',
            dwgControlNumber: dc.dwg_control_number, dwgStatus: dc.status, blockedBy: userId,
          })}::jsonb, 'gate_enforcement', NOW())`);
        const gateDesignLead3 = await resolveAssignee(record.project_id, 'Engineering', userId);
        const gatePM3 = await resolveManagerId(record.project_id);
        await createEpcTask({
          projectId: record.project_id, entityType: 'procurement_execution', recordId: id, actionCode: 'gate_blocked',
          title: `Resolve drawing release gate for ${procGateItemCode}`,
          description: `Procurement execution #${id} blocked: drawing ${dc.dwg_control_number} is not released for manufacturing.`,
          assignedTo: gateDesignLead3, createdBy: userId, priority: 'High', dueDays: 2,
        });
        const gateAlertRecipients3 = [gateDesignLead3, gatePM3].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        await createEpcAlertMulti(gateAlertRecipients3, {
          type: 'epc_gate_blocked', title: `CRITICAL: Procurement gate blocked — drawing not released for ${procGateItemCode}`,
          message: `Drawing ${dc.dwg_control_number} is not released for manufacturing. Procurement for ${procGateItemCode} is blocked.`,
          link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
          entityType: 'procurement_execution', recordId: id, actionCode: 'gate_blocked',
        });
        return sendBusinessError(res, `Cannot mark ready: drawing control ${dc.dwg_control_number} is not released for manufacturing. Release the drawing for manufacturing first.`,
          { action: `Release drawing ${dc.dwg_control_number} for manufacturing (set released_for_manufacturing = true).` });
      }

      if (!isBuy && !isMake && dc.status !== 'released') {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'procurement_execution.gate_blocked', ${JSON.stringify({
            procurementExecId: id, projectItemId: record.project_item_id,
            gate: 'drawing_release', reason: 'Drawing not released',
            dwgControlNumber: dc.dwg_control_number, dwgStatus: dc.status, blockedBy: userId,
          })}::jsonb, 'gate_enforcement', NOW())`);
        const gateDesignLead4 = await resolveAssignee(record.project_id, 'Engineering', userId);
        const gatePM4 = await resolveManagerId(record.project_id);
        await createEpcTask({
          projectId: record.project_id, entityType: 'procurement_execution', recordId: id, actionCode: 'gate_blocked',
          title: `Resolve drawing release gate for ${procGateItemCode}`,
          description: `Procurement execution #${id} blocked: drawing ${dc.dwg_control_number} is in '${dc.status}' status, not released.`,
          assignedTo: gateDesignLead4, createdBy: userId, priority: 'High', dueDays: 2,
        });
        const gateAlertRecipients4 = [gateDesignLead4, gatePM4].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        await createEpcAlertMulti(gateAlertRecipients4, {
          type: 'epc_gate_blocked', title: `CRITICAL: Procurement gate blocked — drawing not released for ${procGateItemCode}`,
          message: `Drawing ${dc.dwg_control_number} is in '${dc.status}' status. Procurement for ${procGateItemCode} is blocked.`,
          link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
          entityType: 'procurement_execution', recordId: id, actionCode: 'gate_blocked',
        });
        return sendBusinessError(res, `Cannot mark ready: drawing control ${dc.dwg_control_number} is in '${dc.status}' status. It must be released first.`,
          { action: `Progress drawing ${dc.dwg_control_number} through review → approval → release.` });
      }
      }

      const bomTypes = isBuy ? ['procurement', 'assembly'] : isMake ? ['manufacturing', 'assembly'] : ['procurement', 'manufacturing', 'assembly'];
      const bomResult = await db.execute(
        sql`SELECT id, status, bom_number, bom_type
            FROM epc_bom_headers
            WHERE project_item_id = ${record.project_item_id}
              AND bom_type = ANY(${bomTypes})
              AND status NOT IN ('superseded', 'canceled')
            ORDER BY CASE WHEN status = 'released' THEN 0 WHEN status = 'approved' THEN 1 ELSE 2 END, id DESC
            LIMIT 1`
      );
      const bom = bomResult.rows.length > 0 ? (bomResult.rows[0] as any) : null;

      if (!bom) {
        const expectedType = isBuy ? 'procurement or assembly' : isMake ? 'manufacturing or assembly' : 'any';
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'procurement_execution.gate_blocked', ${JSON.stringify({
            procurementExecId: id, projectItemId: record.project_item_id,
            gate: 'bom_missing', reason: `No ${expectedType} BOM exists`, blockedBy: userId,
          })}::jsonb, 'gate_enforcement', NOW())`);
        const gateDesignLead5 = await resolveAssignee(record.project_id, 'Engineering', userId);
        const gatePM5 = await resolveManagerId(record.project_id);
        await createEpcTask({
          projectId: record.project_id, entityType: 'procurement_execution', recordId: id, actionCode: 'gate_blocked',
          title: `Resolve BOM gate block for ${procGateItemCode}`,
          description: `Procurement execution #${id} blocked: no ${expectedType} BOM exists. Create and release a BOM to unblock.`,
          assignedTo: gateDesignLead5, createdBy: userId, priority: 'High', dueDays: 2,
        });
        const gateAlertRecipients5 = [gateDesignLead5, gatePM5].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        await createEpcAlertMulti(gateAlertRecipients5, {
          type: 'epc_gate_blocked', title: `CRITICAL: Procurement gate blocked — no BOM for ${procGateItemCode}`,
          message: `No ${expectedType} BOM exists for ${procGateItemCode}. Procurement is blocked.`,
          link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
          entityType: 'procurement_execution', recordId: id, actionCode: 'gate_blocked',
        });
        return sendBusinessError(res, `Cannot mark ready: no ${expectedType} BOM exists for this item. Create and release a BOM first.`,
          { action: `Create a ${expectedType} BOM for this project item, then progress it through review → approval → release.` });
      }

      if (bom.status !== 'released') {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'procurement_execution.gate_blocked', ${JSON.stringify({
            procurementExecId: id, projectItemId: record.project_item_id,
            gate: 'bom_not_released', reason: `BOM ${bom.bom_number} is in '${bom.status}' status`,
            bomNumber: bom.bom_number, bomStatus: bom.status, bomType: bom.bom_type, blockedBy: userId,
          })}::jsonb, 'gate_enforcement', NOW())`);
        const gateDesignLead6 = await resolveAssignee(record.project_id, 'Engineering', userId);
        const gatePM6 = await resolveManagerId(record.project_id);
        await createEpcTask({
          projectId: record.project_id, entityType: 'procurement_execution', recordId: id, actionCode: 'gate_blocked',
          title: `Resolve BOM release gate for ${procGateItemCode}`,
          description: `Procurement execution #${id} blocked: BOM ${bom.bom_number} is in '${bom.status}' status, not released.`,
          assignedTo: gateDesignLead6, createdBy: userId, priority: 'High', dueDays: 2,
        });
        const gateAlertRecipients6 = [gateDesignLead6, gatePM6].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        await createEpcAlertMulti(gateAlertRecipients6, {
          type: 'epc_gate_blocked', title: `CRITICAL: Procurement gate blocked — BOM not released for ${procGateItemCode}`,
          message: `BOM ${bom.bom_number} is in '${bom.status}' status. Procurement for ${procGateItemCode} is blocked.`,
          link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
          entityType: 'procurement_execution', recordId: id, actionCode: 'gate_blocked',
        });
        return sendBusinessError(res, `Cannot mark ready: BOM ${bom.bom_number} (${bom.bom_type}) is in '${bom.status}' status. It must be released first.`,
          { action: `Progress BOM ${bom.bom_number} through review → approval → release.` });
      }

      let qualityPlanId: number | null = null;
      let poPrepId: number | null = null;

      await db.transaction(async (tx) => {
        await tx.update(procurementExecutionRecords)
          .set({
            status: 'ready_for_po', preparationNote: preparationNote || null, updatedAt: new Date(),
          })
          .where(eq(procurementExecutionRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'procurement_execution.ready_for_po', ${JSON.stringify({
            procurementExecId: id, projectItemId: record.project_item_id,
            planningRecordId: record.planning_record_id, markedBy: userId,
            quantity: record.quantity, estimatedTotalCost: record.estimated_total_cost,
            preferredVendorName: record.preferred_vendor_name, preparationNote,
          })}::jsonb, 'lifecycle_action', NOW())`);

        const existingQP = await tx.execute(
          sql`SELECT id FROM quality_planning_records 
              WHERE procurement_exec_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_inspection_setup')`
        );
        if (existingQP.rows.length === 0) {
          const qualityPlanNumber = await epcCoding.generateDocumentNumber(record.project_id, 'QPL', tx);
          const [qpRec] = await tx.insert(qualityPlanningRecords).values({
            qualityPlanNumber,
            projectId: record.project_id,
            projectItemId: record.project_item_id,
            masterItemId: record.master_item_id,
            sourceContext: 'procurement',
            procurementExecId: id,
            planningRecordId: record.planning_record_id,
            itemCode: record.item_code || null,
            itemDescription: record.item_description || null,
            itemSpecification: record.item_specification || null,
            uom: record.uom || null,
            drawingNo: record.drawing_no || null,
            quantity: record.quantity,
            qualityRequirementType: 'incoming_inspection',
            status: 'draft',
            assignedTo: record.assigned_to,
            createdBy: userId,
          }).returning();
          qualityPlanId = qpRec.id;
          await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
            VALUES (${record.project_id}, 'quality_planning.created_from_procurement', ${JSON.stringify({
              qualityPlanId: qpRec.id, procurementExecId: id,
              projectItemId: record.project_item_id, qualityType: 'incoming_inspection', createdBy: userId,
            })}::jsonb, 'lifecycle_action', NOW())`);
        } else {
          qualityPlanId = (existingQP.rows[0] as any).id;
        }

        const existingPOPrep = await tx.execute(
          sql`SELECT id FROM po_preparation_records 
              WHERE execution_record_id = ${id} AND status IN ('draft', 'under_review', 'ready_for_po_creation')`
        );
        if (existingPOPrep.rows.length === 0) {
          const poPrepNumber = await epcCoding.generateDocumentNumber(record.project_id, 'POP', tx);
          const [poPrepRec] = await tx.insert(poPreparationRecords).values({
            poPrepNumber,
            projectId: record.project_id,
            projectItemId: record.project_item_id,
            planningRecordId: record.planning_record_id,
            executionRecordId: id,
            qualityPlanId: qualityPlanId,
            masterItemId: record.master_item_id,
            itemCode: record.item_code || null,
            itemDescription: record.item_description || null,
            itemSpecification: record.item_specification || null,
            uom: record.uom || null,
            drawingNo: record.drawing_no || null,
            quantity: record.quantity,
            estimatedUnitCost: record.estimated_unit_cost || null,
            estimatedTotalCost: record.estimated_total_cost || null,
            preferredVendorId: record.preferred_vendor_id || null,
            preferredVendorName: record.preferred_vendor_name || null,
            procurementNotes: record.procurement_notes || null,
            status: 'draft',
            assignedTo: record.assigned_to,
            createdBy: userId,
          }).returning();
          poPrepId = poPrepRec.id;
          await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
            VALUES (${record.project_id}, 'po_preparation.created', ${JSON.stringify({
              poPrepId: poPrepRec.id, executionRecordId: id, qualityPlanId,
              projectItemId: record.project_item_id, createdBy: userId,
            })}::jsonb, 'lifecycle_action', NOW())`);
        } else {
          poPrepId = (existingPOPrep.rows[0] as any).id;
        }
      });

      console.log(`[ProcurementExec] Record ${id} marked ready for PO by user ${userId}`);
      res.json({ success: true, message: 'Procurement execution record marked ready for PO', id, newStatus: 'ready_for_po', qualityPlanId, poPrepId });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/procurement-executions/:id/revert-to-preparation', ensureAuthenticated, requirePageAccess('procurement-production'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid procurement execution ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM procurement_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Procurement execution record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'ready_for_po') {
        return sendBusinessError(res, `Cannot revert: only 'ready_for_po' records can be reverted. Current status: '${record.status}'.`);
      }

      const activeDownstream = await db.execute(
        sql`SELECT 'quality_plan' AS type, id, status FROM quality_planning_records WHERE procurement_exec_id = ${id} AND status NOT IN ('canceled', 'superseded')
            UNION ALL
            SELECT 'po_preparation' AS type, id, status FROM po_preparation_records WHERE execution_record_id = ${id} AND status NOT IN ('canceled', 'superseded')`
      );
      if (activeDownstream.rows.length > 0) {
        return sendBusinessError(res, `Cannot revert: ${activeDownstream.rows.length} active downstream record(s) exist. Cancel them first or use the cancel action instead.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(procurementExecutionRecords)
          .set({ status: 'under_preparation', preparationNote: null, updatedAt: new Date() })
          .where(eq(procurementExecutionRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'procurement_execution.reverted_to_preparation', ${JSON.stringify({
            procurementExecId: id, projectItemId: record.project_item_id, revertedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[ProcurementExec] Record ${id} reverted to preparation by user ${userId}`);
      res.json({ success: true, message: 'Reverted to under_preparation', id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/procurement-executions/:id/cancel', ensureAuthenticated, requirePageAccess('procurement-production'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid procurement execution ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM procurement_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Procurement execution record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'canceled') {
        return sendBusinessError(res, `Cannot cancel: record is already '${record.status}'.`);
      }

      let cascadedQualityPlanIds: number[] = [];
      let cascadedPoPrepIds: number[] = [];

      await db.transaction(async (tx) => {
        await tx.update(procurementExecutionRecords)
          .set({
            status: 'canceled', cancelledBy: userId, cancelledAt: new Date(),
            cancelReason, updatedAt: new Date(),
          })
          .where(eq(procurementExecutionRecords.id, id));

        const qpCascade = await tx.execute(
          sql`UPDATE quality_planning_records 
              SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                  cancel_reason = ${'Upstream procurement execution canceled: ' + cancelReason}, updated_at = NOW()
              WHERE procurement_exec_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_inspection_setup')
              RETURNING id`
        );
        cascadedQualityPlanIds = qpCascade.rows.map((r: any) => r.id);

        const poPrepCascade = await tx.execute(
          sql`UPDATE po_preparation_records 
              SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                  cancel_reason = ${'Upstream procurement execution canceled: ' + cancelReason}, updated_at = NOW()
              WHERE execution_record_id = ${id} AND status IN ('draft', 'under_review', 'ready_for_po_creation')
              RETURNING id`
        );
        cascadedPoPrepIds = poPrepCascade.rows.map((r: any) => r.id);

        for (const qpRow of qpCascade.rows) {
          await tx.execute(
            sql`UPDATE inspection_execution_records 
                SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                    cancel_reason = ${'Upstream procurement execution canceled: ' + cancelReason}, updated_at = NOW()
                WHERE quality_plan_id = ${(qpRow as any).id} AND status IN ('draft', 'scheduled', 'in_progress')`
          );
        }

        for (const poPrepRow of poPrepCascade.rows) {
          await tx.execute(
            sql`UPDATE epc_purchase_orders 
                SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                    cancel_reason = ${'Upstream procurement execution canceled: ' + cancelReason}, updated_at = NOW()
                WHERE po_preparation_id = ${(poPrepRow as any).id} AND status NOT IN ('canceled', 'superseded')`
          );
        }

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'procurement_execution.canceled', ${JSON.stringify({
            procurementExecId: id, projectItemId: record.project_item_id,
            planningRecordId: record.planning_record_id, cancelledBy: userId, cancelReason,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[ProcurementExec] Record ${id} canceled by user ${userId}`);
      res.json({ success: true, message: 'Procurement execution record canceled', id, newStatus: 'canceled',
        cascadedQualityPlanIds, cascadedPoPrepIds,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ─── Production Execution Record Lifecycle Routes ──────────────────────────

  app.get('/api/projects/:projectId/production-executions', ensureAuthenticated, requirePageAccess('procurement-production'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;

      let query = sql`SELECT per.*,
                             u1.username as assigned_to_name, u2.username as created_by_name,
                             u3.username as prepared_by_name, u4.username as cancelled_by_name,
                             COALESCE(per.drawing_no, mi.drawing_no) as drawing_no,
                             COALESCE(per.drawing_revision, mi.latest_revision) as drawing_revision,
                             mi.specification as item_specification_master,
                             mi.uom as item_uom_master, mi.make_or_buy as item_make_or_buy
                      FROM production_execution_records per
                      LEFT JOIN users u1 ON per.assigned_to = u1.id
                      LEFT JOIN users u2 ON per.created_by = u2.id
                      LEFT JOIN users u3 ON per.prepared_by = u3.id
                      LEFT JOIN users u4 ON per.cancelled_by = u4.id
                      LEFT JOIN master_items mi ON per.master_item_id = mi.id
                      WHERE per.project_id = ${projectId}`;

      if (statusFilter) query = sql`${query} AND per.status = ${statusFilter}`;
      if (itemFilter) query = sql`${query} AND per.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY per.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/production-executions/:id', ensureAuthenticated, requirePageAccess('procurement-production'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid production execution ID');

      const result = await db.execute(
        sql`SELECT per.*,
                   u1.username as assigned_to_name, u2.username as created_by_name,
                   u3.username as prepared_by_name, u4.username as cancelled_by_name,
                   COALESCE(per.drawing_no, mi.drawing_no) as drawing_no,
                   COALESCE(per.drawing_revision, mi.latest_revision) as drawing_revision,
                   mi.specification as item_specification_master,
                   mi.uom as item_uom_master, mi.make_or_buy as item_make_or_buy
            FROM production_execution_records per
            LEFT JOIN users u1 ON per.assigned_to = u1.id
            LEFT JOIN users u2 ON per.created_by = u2.id
            LEFT JOIN users u3 ON per.prepared_by = u3.id
            LEFT JOIN users u4 ON per.cancelled_by = u4.id
            LEFT JOIN master_items mi ON per.master_item_id = mi.id
            WHERE per.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Production execution record not found');
      res.json(result.rows[0]);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/production-executions/:id', ensureAuthenticated, requirePageAccess('procurement-production'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid production execution ID');

      const existing = await db.execute(sql`SELECT * FROM production_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Production execution record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'canceled') {
        return sendBusinessError(res, `Cannot edit: record is '${record.status}'.`);
      }
      if (record.status === 'ready_for_wo') {
        return sendBusinessError(res, 'Cannot edit: record is already ready for WO. Revert to under_preparation first.');
      }

      const { quantity, estimatedUnitCost, drawingNo, drawingRevision, manufacturingNotes } = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (quantity !== undefined) updates.quantity = String(quantity);
      if (estimatedUnitCost !== undefined) {
        updates.estimatedUnitCost = estimatedUnitCost ? String(estimatedUnitCost) : null;
        const qty = quantity !== undefined ? parseFloat(String(quantity)) : parseFloat(record.quantity || '0');
        const uc = parseFloat(String(estimatedUnitCost));
        updates.estimatedTotalCost = uc > 0 && qty > 0 ? String(uc * qty) : null;
      }
      if (drawingNo !== undefined) updates.drawingNo = drawingNo || null;
      if (drawingRevision !== undefined) updates.drawingRevision = drawingRevision || null;
      if (manufacturingNotes !== undefined) updates.manufacturingNotes = manufacturingNotes || null;

      await db.update(productionExecutionRecords).set(updates).where(eq(productionExecutionRecords.id, id));
      res.json({ success: true, message: 'Production execution record updated', id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/production-executions/:id/start-preparation', ensureAuthenticated, requirePageAccess('procurement-production'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid production execution ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM production_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Production execution record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'draft') {
        return sendBusinessError(res, `Cannot start preparation: record is in '${record.status}' status. Only 'draft' records can start preparation.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(productionExecutionRecords)
          .set({ status: 'under_preparation', preparedBy: userId, preparedAt: new Date(), updatedAt: new Date() })
          .where(eq(productionExecutionRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'production_execution.preparation_started', ${JSON.stringify({
            productionExecId: id, projectItemId: record.project_item_id,
            planningRecordId: record.planning_record_id, startedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[ProductionExec] Record ${id} preparation started by user ${userId}`);
      res.json({ success: true, message: 'Production preparation started', id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/production-executions/:id/mark-ready', ensureAuthenticated, requirePageAccess('procurement-production'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid production execution ID');
      const userId = (req.user as any)?.id;
      const { preparationNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM production_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Production execution record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_preparation') {
        return sendBusinessError(res, `Cannot mark ready: record is in '${record.status}' status. Only 'under_preparation' records can be marked ready.`);
      }

      const qty = parseFloat(record.quantity || '0');
      if (qty <= 0) {
        return sendBusinessError(res, 'Cannot mark ready: quantity must be greater than zero.');
      }

      const classResult = await db.execute(sql`SELECT make_or_buy FROM master_items WHERE id = ${record.master_item_id}`);
      const classification = classResult.rows.length > 0 ? (classResult.rows[0] as any).make_or_buy : null;
      const isBuy = classification === 'Buy';
      const isMake = classification === 'Make';

      const prodGateItemCode = record.item_code || record.item_description || `Item #${record.project_item_id}`;

      if (isDwgGateRequired(classification)) {
      const dcResult = await db.execute(
        sql`SELECT id, status, released_for_procurement, released_for_manufacturing, dwg_control_number
            FROM epc_drawing_controls
            WHERE project_item_id = ${record.project_item_id}
              AND status NOT IN ('superseded', 'canceled')
            ORDER BY CASE WHEN status = 'released' THEN 0 WHEN status = 'approved' THEN 1 ELSE 2 END, id DESC
            LIMIT 1`
      );
      const dc = dcResult.rows.length > 0 ? (dcResult.rows[0] as any) : null;

      if (!dc) {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'production_execution.gate_blocked', ${JSON.stringify({
            productionExecId: id, projectItemId: record.project_item_id,
            gate: 'drawing_control', reason: 'No drawing control exists', blockedBy: userId,
          })}::jsonb, 'gate_enforcement', NOW())`);
        const pGateDesign = await resolveAssignee(record.project_id, 'Engineering', userId);
        const pGatePM = await resolveManagerId(record.project_id);
        await createEpcTask({
          projectId: record.project_id, entityType: 'production_execution', recordId: id, actionCode: 'gate_blocked',
          title: `Resolve drawing gate block for ${prodGateItemCode}`,
          description: `Production execution #${id} is blocked: no drawing control exists. Create and release a drawing control to unblock.`,
          assignedTo: pGateDesign, createdBy: userId, priority: 'High', dueDays: 2,
        });
        const pGateRecipients = [pGateDesign, pGatePM].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        await createEpcAlertMulti(pGateRecipients, {
          type: 'epc_gate_blocked', title: `CRITICAL: Production gate blocked — no drawing for ${prodGateItemCode}`,
          message: `Production execution for ${prodGateItemCode} is blocked. No drawing control exists.`,
          link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
          entityType: 'production_execution', recordId: id, actionCode: 'gate_blocked',
        });
        return sendBusinessError(res, 'Cannot mark ready: no drawing control exists for this item. Create and release a drawing control first.',
          { action: 'Create a Drawing Control for this project item, then progress it through review → approval → release.' });
      }

      if (isMake && !dc.released_for_manufacturing) {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'production_execution.gate_blocked', ${JSON.stringify({
            productionExecId: id, projectItemId: record.project_item_id,
            gate: 'drawing_manufacturing_release', reason: 'Drawing not released for manufacturing',
            dwgControlNumber: dc.dwg_control_number, dwgStatus: dc.status, blockedBy: userId,
          })}::jsonb, 'gate_enforcement', NOW())`);
        const pGateDesign2 = await resolveAssignee(record.project_id, 'Engineering', userId);
        const pGatePM2 = await resolveManagerId(record.project_id);
        await createEpcTask({
          projectId: record.project_id, entityType: 'production_execution', recordId: id, actionCode: 'gate_blocked',
          title: `Resolve drawing release gate for ${prodGateItemCode}`,
          description: `Production execution #${id} blocked: drawing ${dc.dwg_control_number} not released for manufacturing.`,
          assignedTo: pGateDesign2, createdBy: userId, priority: 'High', dueDays: 2,
        });
        const pGateRecipients2 = [pGateDesign2, pGatePM2].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        await createEpcAlertMulti(pGateRecipients2, {
          type: 'epc_gate_blocked', title: `CRITICAL: Production gate blocked — drawing not released for ${prodGateItemCode}`,
          message: `Drawing ${dc.dwg_control_number} not released for manufacturing. Production for ${prodGateItemCode} is blocked.`,
          link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
          entityType: 'production_execution', recordId: id, actionCode: 'gate_blocked',
        });
        return sendBusinessError(res, `Cannot mark ready: drawing control ${dc.dwg_control_number} is not released for manufacturing. Release the drawing for manufacturing first.`,
          { action: `Release drawing ${dc.dwg_control_number} for manufacturing (set released_for_manufacturing = true).` });
      }

      if (isBuy && !dc.released_for_procurement) {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'production_execution.gate_blocked', ${JSON.stringify({
            productionExecId: id, projectItemId: record.project_item_id,
            gate: 'drawing_procurement_release', reason: 'Drawing not released for procurement',
            dwgControlNumber: dc.dwg_control_number, dwgStatus: dc.status, blockedBy: userId,
          })}::jsonb, 'gate_enforcement', NOW())`);
        const pGateDesign3 = await resolveAssignee(record.project_id, 'Engineering', userId);
        const pGatePM3 = await resolveManagerId(record.project_id);
        await createEpcTask({
          projectId: record.project_id, entityType: 'production_execution', recordId: id, actionCode: 'gate_blocked',
          title: `Resolve drawing release gate for ${prodGateItemCode}`,
          description: `Production execution #${id} blocked: drawing ${dc.dwg_control_number} not released for procurement.`,
          assignedTo: pGateDesign3, createdBy: userId, priority: 'High', dueDays: 2,
        });
        const pGateRecipients3 = [pGateDesign3, pGatePM3].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        await createEpcAlertMulti(pGateRecipients3, {
          type: 'epc_gate_blocked', title: `CRITICAL: Production gate blocked — drawing not released for ${prodGateItemCode}`,
          message: `Drawing ${dc.dwg_control_number} not released for procurement. Production for ${prodGateItemCode} is blocked.`,
          link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
          entityType: 'production_execution', recordId: id, actionCode: 'gate_blocked',
        });
        return sendBusinessError(res, `Cannot mark ready: drawing control ${dc.dwg_control_number} is not released for procurement. Release the drawing for procurement first.`,
          { action: `Release drawing ${dc.dwg_control_number} for procurement (set released_for_procurement = true).` });
      }

      if (!isBuy && !isMake && dc.status !== 'released') {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'production_execution.gate_blocked', ${JSON.stringify({
            productionExecId: id, projectItemId: record.project_item_id,
            gate: 'drawing_release', reason: 'Drawing not released',
            dwgControlNumber: dc.dwg_control_number, dwgStatus: dc.status, blockedBy: userId,
          })}::jsonb, 'gate_enforcement', NOW())`);
        const pGateDesign4 = await resolveAssignee(record.project_id, 'Engineering', userId);
        const pGatePM4 = await resolveManagerId(record.project_id);
        await createEpcTask({
          projectId: record.project_id, entityType: 'production_execution', recordId: id, actionCode: 'gate_blocked',
          title: `Resolve drawing release gate for ${prodGateItemCode}`,
          description: `Production execution #${id} blocked: drawing ${dc.dwg_control_number} is in '${dc.status}' status, not released.`,
          assignedTo: pGateDesign4, createdBy: userId, priority: 'High', dueDays: 2,
        });
        const pGateRecipients4 = [pGateDesign4, pGatePM4].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        await createEpcAlertMulti(pGateRecipients4, {
          type: 'epc_gate_blocked', title: `CRITICAL: Production gate blocked — drawing not released for ${prodGateItemCode}`,
          message: `Drawing ${dc.dwg_control_number} is in '${dc.status}' status. Production for ${prodGateItemCode} is blocked.`,
          link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
          entityType: 'production_execution', recordId: id, actionCode: 'gate_blocked',
        });
        return sendBusinessError(res, `Cannot mark ready: drawing control ${dc.dwg_control_number} is in '${dc.status}' status. It must be released first.`,
          { action: `Progress drawing ${dc.dwg_control_number} through review → approval → release.` });
      }
      }

      const bomTypes2 = isMake ? ['manufacturing', 'assembly'] : isBuy ? ['procurement', 'assembly'] : ['procurement', 'manufacturing', 'assembly'];
      const bomResult = await db.execute(
        sql`SELECT id, status, bom_number, bom_type
            FROM epc_bom_headers
            WHERE project_item_id = ${record.project_item_id}
              AND bom_type = ANY(${bomTypes2})
              AND status NOT IN ('superseded', 'canceled')
            ORDER BY CASE WHEN status = 'released' THEN 0 WHEN status = 'approved' THEN 1 ELSE 2 END, id DESC
            LIMIT 1`
      );
      const bom = bomResult.rows.length > 0 ? (bomResult.rows[0] as any) : null;

      if (!bom) {
        const expectedType = isMake ? 'manufacturing or assembly' : isBuy ? 'procurement or assembly' : 'any';
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'production_execution.gate_blocked', ${JSON.stringify({
            productionExecId: id, projectItemId: record.project_item_id,
            gate: 'bom_missing', reason: `No ${expectedType} BOM exists`, blockedBy: userId,
          })}::jsonb, 'gate_enforcement', NOW())`);
        const pGateDesign5 = await resolveAssignee(record.project_id, 'Engineering', userId);
        const pGatePM5 = await resolveManagerId(record.project_id);
        await createEpcTask({
          projectId: record.project_id, entityType: 'production_execution', recordId: id, actionCode: 'gate_blocked',
          title: `Resolve BOM gate block for ${prodGateItemCode}`,
          description: `Production execution #${id} blocked: no ${expectedType} BOM exists. Create and release a BOM to unblock.`,
          assignedTo: pGateDesign5, createdBy: userId, priority: 'High', dueDays: 2,
        });
        const pGateRecipients5 = [pGateDesign5, pGatePM5].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        await createEpcAlertMulti(pGateRecipients5, {
          type: 'epc_gate_blocked', title: `CRITICAL: Production gate blocked — no BOM for ${prodGateItemCode}`,
          message: `No ${expectedType} BOM exists for ${prodGateItemCode}. Production is blocked.`,
          link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
          entityType: 'production_execution', recordId: id, actionCode: 'gate_blocked',
        });
        return sendBusinessError(res, `Cannot mark ready: no ${expectedType} BOM exists for this item. Create and release a BOM first.`,
          { action: `Create a ${expectedType} BOM for this project item, then progress it through review → approval → release.` });
      }

      if (bom.status !== 'released') {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'production_execution.gate_blocked', ${JSON.stringify({
            productionExecId: id, projectItemId: record.project_item_id,
            gate: 'bom_not_released', reason: `BOM ${bom.bom_number} is in '${bom.status}' status`,
            bomNumber: bom.bom_number, bomStatus: bom.status, bomType: bom.bom_type, blockedBy: userId,
          })}::jsonb, 'gate_enforcement', NOW())`);
        const pGateDesign6 = await resolveAssignee(record.project_id, 'Engineering', userId);
        const pGatePM6 = await resolveManagerId(record.project_id);
        await createEpcTask({
          projectId: record.project_id, entityType: 'production_execution', recordId: id, actionCode: 'gate_blocked',
          title: `Resolve BOM release gate for ${prodGateItemCode}`,
          description: `Production execution #${id} blocked: BOM ${bom.bom_number} is in '${bom.status}' status, not released.`,
          assignedTo: pGateDesign6, createdBy: userId, priority: 'High', dueDays: 2,
        });
        const pGateRecipients6 = [pGateDesign6, pGatePM6].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        await createEpcAlertMulti(pGateRecipients6, {
          type: 'epc_gate_blocked', title: `CRITICAL: Production gate blocked — BOM not released for ${prodGateItemCode}`,
          message: `BOM ${bom.bom_number} is in '${bom.status}' status. Production for ${prodGateItemCode} is blocked.`,
          link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
          entityType: 'production_execution', recordId: id, actionCode: 'gate_blocked',
        });
        return sendBusinessError(res, `Cannot mark ready: BOM ${bom.bom_number} (${bom.bom_type}) is in '${bom.status}' status. It must be released first.`,
          { action: `Progress BOM ${bom.bom_number} through review → approval → release.` });
      }

      let qualityPlanId: number | null = null;
      let woPrepId: number | null = null;

      await db.transaction(async (tx) => {
        await tx.update(productionExecutionRecords)
          .set({ status: 'ready_for_wo', preparationNote: preparationNote || null, updatedAt: new Date() })
          .where(eq(productionExecutionRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'production_execution.ready_for_wo', ${JSON.stringify({
            productionExecId: id, projectItemId: record.project_item_id,
            planningRecordId: record.planning_record_id, markedBy: userId,
            quantity: record.quantity, drawingNo: record.drawing_no,
            estimatedTotalCost: record.estimated_total_cost, preparationNote,
          })}::jsonb, 'lifecycle_action', NOW())`);

        const existingQP = await tx.execute(
          sql`SELECT id FROM quality_planning_records 
              WHERE production_exec_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_inspection_setup')`
        );
        if (existingQP.rows.length === 0) {
          const qualityPlanNumber = await epcCoding.generateDocumentNumber(record.project_id, 'QPL', tx);
          const [qpRec] = await tx.insert(qualityPlanningRecords).values({
            qualityPlanNumber,
            projectId: record.project_id,
            projectItemId: record.project_item_id,
            masterItemId: record.master_item_id,
            sourceContext: 'production',
            productionExecId: id,
            planningRecordId: record.planning_record_id,
            itemCode: record.item_code || null,
            itemDescription: record.item_description || null,
            itemSpecification: record.item_specification || null,
            uom: record.uom || null,
            drawingNo: record.drawing_no || null,
            drawingRevision: record.drawing_revision || null,
            quantity: record.quantity,
            qualityRequirementType: 'in_process_final_inspection',
            status: 'draft',
            assignedTo: record.assigned_to,
            createdBy: userId,
          }).returning();
          qualityPlanId = qpRec.id;
          await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
            VALUES (${record.project_id}, 'quality_planning.created_from_production', ${JSON.stringify({
              qualityPlanId: qpRec.id, productionExecId: id,
              projectItemId: record.project_item_id, qualityType: 'in_process_final_inspection', createdBy: userId,
            })}::jsonb, 'lifecycle_action', NOW())`);
        } else {
          qualityPlanId = (existingQP.rows[0] as any).id;
        }

        const existingWOPrep = await tx.execute(
          sql`SELECT id FROM wo_preparation_records 
              WHERE execution_record_id = ${id} AND status IN ('draft', 'under_review', 'ready_for_wo_creation')`
        );
        if (existingWOPrep.rows.length === 0) {
          const woPrepNumber = await epcCoding.generateDocumentNumber(record.project_id, 'WOP', tx);
          const [woPrepRec] = await tx.insert(woPreparationRecords).values({
            woPrepNumber,
            projectId: record.project_id,
            projectItemId: record.project_item_id,
            planningRecordId: record.planning_record_id,
            executionRecordId: id,
            qualityPlanId: qualityPlanId,
            masterItemId: record.master_item_id,
            itemCode: record.item_code || null,
            itemDescription: record.item_description || null,
            itemSpecification: record.item_specification || null,
            uom: record.uom || null,
            drawingNo: record.drawing_no || null,
            drawingRevision: record.drawing_revision || null,
            quantity: record.quantity,
            estimatedUnitCost: record.estimated_unit_cost || null,
            estimatedTotalCost: record.estimated_total_cost || null,
            makeClassification: record.make_classification || null,
            manufacturingNotes: record.manufacturing_notes || null,
            status: 'draft',
            assignedTo: record.assigned_to,
            createdBy: userId,
          }).returning();
          woPrepId = woPrepRec.id;
          await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
            Values (${record.project_id}, 'wo_preparation.created', ${JSON.stringify({
              woPrepId: woPrepRec.id, executionRecordId: id, qualityPlanId,
              projectItemId: record.project_item_id, createdBy: userId,
            })}::jsonb, 'lifecycle_action', NOW())`);
        } else {
          woPrepId = (existingWOPrep.rows[0] as any).id;
        }
      });

      console.log(`[ProductionExec] Record ${id} marked ready for WO by user ${userId}`);
      res.json({ success: true, message: 'Production execution record marked ready for WO', id, newStatus: 'ready_for_wo', qualityPlanId, woPrepId });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/production-executions/:id/revert-to-preparation', ensureAuthenticated, requirePageAccess('procurement-production'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid production execution ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM production_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Production execution record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'ready_for_wo') {
        return sendBusinessError(res, `Cannot revert: only 'ready_for_wo' records can be reverted. Current status: '${record.status}'.`);
      }

      const activeDownstream = await db.execute(
        sql`SELECT 'quality_plan' AS type, id, status FROM quality_planning_records WHERE production_exec_id = ${id} AND status NOT IN ('canceled', 'superseded')
            UNION ALL
            SELECT 'wo_preparation' AS type, id, status FROM wo_preparation_records WHERE execution_record_id = ${id} AND status NOT IN ('canceled', 'superseded')`
      );
      if (activeDownstream.rows.length > 0) {
        return sendBusinessError(res, `Cannot revert: ${activeDownstream.rows.length} active downstream record(s) exist. Cancel them first or use the cancel action instead.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(productionExecutionRecords)
          .set({ status: 'under_preparation', preparationNote: null, updatedAt: new Date() })
          .where(eq(productionExecutionRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'production_execution.reverted_to_preparation', ${JSON.stringify({
            productionExecId: id, projectItemId: record.project_item_id, revertedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[ProductionExec] Record ${id} reverted to preparation by user ${userId}`);
      res.json({ success: true, message: 'Reverted to under_preparation', id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/production-executions/:id/cancel', ensureAuthenticated, requirePageAccess('procurement-production'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid production execution ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM production_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Production execution record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'canceled') {
        return sendBusinessError(res, `Cannot cancel: record is already '${record.status}'.`);
      }

      let cascadedQualityPlanIds: number[] = [];
      let cascadedWoPrepIds: number[] = [];

      await db.transaction(async (tx) => {
        await tx.update(productionExecutionRecords)
          .set({
            status: 'canceled', cancelledBy: userId, cancelledAt: new Date(),
            cancelReason, updatedAt: new Date(),
          })
          .where(eq(productionExecutionRecords.id, id));

        const qpCascade = await tx.execute(
          sql`UPDATE quality_planning_records 
              SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                  cancel_reason = ${'Upstream production execution canceled: ' + cancelReason}, updated_at = NOW()
              WHERE production_exec_id = ${id} AND status IN ('draft', 'under_preparation', 'ready_for_inspection_setup')
              RETURNING id`
        );
        cascadedQualityPlanIds = qpCascade.rows.map((r: any) => r.id);

        const woPrepCascade = await tx.execute(
          sql`UPDATE wo_preparation_records 
              SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                  cancel_reason = ${'Upstream production execution canceled: ' + cancelReason}, updated_at = NOW()
              WHERE execution_record_id = ${id} AND status IN ('draft', 'under_review', 'ready_for_wo_creation')
              RETURNING id`
        );
        cascadedWoPrepIds = woPrepCascade.rows.map((r: any) => r.id);

        for (const qpRow of qpCascade.rows) {
          await tx.execute(
            sql`UPDATE inspection_execution_records 
                SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                    cancel_reason = ${'Upstream production execution canceled: ' + cancelReason}, updated_at = NOW()
                WHERE quality_plan_id = ${(qpRow as any).id} AND status IN ('draft', 'scheduled', 'in_progress')`
          );
        }

        for (const woPrepRow of woPrepCascade.rows) {
          await tx.execute(
            sql`UPDATE epc_work_orders 
                SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                    cancel_reason = ${'Upstream production execution canceled: ' + cancelReason}, updated_at = NOW()
                WHERE wo_preparation_id = ${(woPrepRow as any).id} AND status NOT IN ('canceled', 'superseded')`
          );
        }

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'production_execution.canceled', ${JSON.stringify({
            productionExecId: id, projectItemId: record.project_item_id,
            planningRecordId: record.planning_record_id, cancelledBy: userId, cancelReason,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[ProductionExec] Record ${id} canceled by user ${userId}`);
      res.json({ success: true, message: 'Production execution record canceled', id, newStatus: 'canceled',
        cascadedQualityPlanIds, cascadedWoPrepIds,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ─── Quality Planning Record Lifecycle Routes ──────────────────────────────

  app.get('/api/projects/:projectId/quality-plans', ensureAuthenticated, requirePageAccess('quality-inspection'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const sourceFilter = req.query.sourceContext as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;
      const user = req.user as any;
      const visibilityScope = (req as any).visibilityScope || 'department_records';
      const qpOwnershipConfig: OwnershipFilterConfig = { createdByColumn: 'created_by', assignedToColumn: 'assigned_to', mode: 'department' };
      const { whereSql, joinSql } = buildOwnershipWhereClause(user, visibilityScope, qpOwnershipConfig, 'qp');

      let query = sql`SELECT qp.*, u1.username as assigned_to_name, u2.username as created_by_name,
                             u3.username as prepared_by_name
                      FROM quality_planning_records qp
                      LEFT JOIN users u1 ON qp.assigned_to = u1.id
                      LEFT JOIN users u2 ON qp.created_by = u2.id
                      LEFT JOIN users u3 ON qp.prepared_by = u3.id`;
      if (joinSql) query = sql`${query} ${joinSql}`;
      query = sql`${query} WHERE qp.project_id = ${projectId}`;
      if (whereSql) query = sql`${query} AND ${whereSql}`;

      if (statusFilter) query = sql`${query} AND qp.status = ${statusFilter}`;
      if (sourceFilter) query = sql`${query} AND qp.source_context = ${sourceFilter}`;
      if (itemFilter) query = sql`${query} AND qp.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY qp.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/quality-plans/:id', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid quality plan ID');

      const result = await db.execute(
        sql`SELECT qp.*, u1.username as assigned_to_name, u2.username as created_by_name,
                   u3.username as prepared_by_name
            FROM quality_planning_records qp
            LEFT JOIN users u1 ON qp.assigned_to = u1.id
            LEFT JOIN users u2 ON qp.created_by = u2.id
            LEFT JOIN users u3 ON qp.prepared_by = u3.id
            WHERE qp.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Quality planning record not found');

      const record = result.rows[0] as any;
      const user = req.user as any;
      const { visibilityScope } = await checkProjectMembership(user.id, user.role, record.project_id);
      const creatorDept = await lookupCreatorDepartment(record.created_by);
      if (!checkRecordOwnership(record, creatorDept, user, visibilityScope, 'department')) {
        return denyRecordAccess(res, req);
      }

      res.json(record);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/quality-plans/:id', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('quality_planning_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid quality plan ID');

      const existing = await db.execute(sql`SELECT * FROM quality_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Quality planning record not found');
      const record = existing.rows[0] as any;

      const user = req.user as any;
      if (!(await enforceWriteOwnership(record, user, 'department', req, res))) return;

      if (record.status === 'superseded' || record.status === 'canceled') {
        return sendBusinessError(res, `Cannot edit: record is '${record.status}'.`);
      }
      if (record.status === 'ready_for_inspection_setup') {
        return sendBusinessError(res, 'Cannot edit: record is already ready for inspection setup. Revert to under_preparation first.');
      }

      const { qualityRequirementType, qualityNotes, quantity } = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (qualityRequirementType !== undefined) updates.qualityRequirementType = qualityRequirementType;
      if (qualityNotes !== undefined) updates.qualityNotes = qualityNotes || null;
      if (quantity !== undefined) updates.quantity = String(quantity);

      await db.update(qualityPlanningRecords).set(updates).where(eq(qualityPlanningRecords.id, id));
      res.json({ success: true, message: 'Quality planning record updated', id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/quality-plans/:id/start-preparation', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('quality_planning_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid quality plan ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM quality_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Quality planning record not found');
      const record = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(record, req.user as any, 'department', req, res))) return;

      if (record.status !== 'draft') {
        return sendBusinessError(res, `Cannot start preparation: record is in '${record.status}' status. Only 'draft' records can start preparation.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(qualityPlanningRecords)
          .set({ status: 'under_preparation', preparedBy: userId, preparedAt: new Date(), updatedAt: new Date() })
          .where(eq(qualityPlanningRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'quality_planning.preparation_started', ${JSON.stringify({
            qualityPlanId: id, sourceContext: record.source_context,
            qualityRequirementType: record.quality_requirement_type,
            projectItemId: record.project_item_id, startedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[QualityPlan] Record ${id} preparation started by user ${userId}`);
      res.json({ success: true, message: 'Quality preparation started', id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/quality-plans/:id/mark-ready', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('quality_planning_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid quality plan ID');
      const userId = (req.user as any)?.id;
      const { preparationNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM quality_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Quality planning record not found');
      const record = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(record, req.user as any, 'department', req, res))) return;

      if (record.status !== 'under_preparation') {
        return sendBusinessError(res, `Cannot mark ready: record is in '${record.status}' status. Only 'under_preparation' records can be marked ready.`);
      }

      let inspExecId: number | null = null;

      await db.transaction(async (tx) => {
        await tx.update(qualityPlanningRecords)
          .set({ status: 'ready_for_inspection_setup', preparationNote: preparationNote || null, updatedAt: new Date() })
          .where(eq(qualityPlanningRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'quality_planning.ready_for_inspection_setup', ${JSON.stringify({
            qualityPlanId: id, sourceContext: record.source_context,
            qualityRequirementType: record.quality_requirement_type,
            projectItemId: record.project_item_id, markedBy: userId, preparationNote,
          })}::jsonb, 'lifecycle_action', NOW())`);

        const existingIE = await tx.execute(
          sql`SELECT id FROM inspection_execution_records 
              WHERE quality_plan_id = ${id} AND status IN ('draft', 'scheduled', 'in_progress')`
        );
        if (existingIE.rows.length === 0) {
          const inspType = record.source_context === 'procurement' ? 'incoming_inspection'
            : (record.quality_requirement_type === 'in_process_final_inspection' ? 'in_process_final_inspection' : record.quality_requirement_type);
          const inspectionNumber = await epcCoding.generateDocumentNumber(record.project_id, 'INS', tx);
          const [ieRec] = await tx.insert(inspectionExecutionRecords).values({
            inspectionNumber,
            projectId: record.project_id,
            projectItemId: record.project_item_id,
            planningRecordId: record.planning_record_id || null,
            executionRecordId: record.procurement_exec_id || record.production_exec_id || null,
            qualityPlanId: id,
            masterItemId: record.master_item_id,
            sourceContext: record.source_context,
            inspectionType: inspType,
            itemCode: record.item_code || null,
            itemDescription: record.item_description || null,
            itemSpecification: record.item_specification || null,
            uom: record.uom || null,
            drawingNo: record.drawing_no || null,
            drawingRevision: record.drawing_revision || null,
            quantity: record.quantity,
            status: 'draft',
            assignedTo: record.assigned_to,
            createdBy: userId,
          }).returning();
          inspExecId = ieRec.id;
          await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
            VALUES (${record.project_id}, 'inspection_execution.created', ${JSON.stringify({
              inspExecId: ieRec.id, qualityPlanId: id, sourceContext: record.source_context,
              inspectionType: inspType, projectItemId: record.project_item_id, createdBy: userId,
            })}::jsonb, 'lifecycle_action', NOW())`);
        } else {
          inspExecId = (existingIE.rows[0] as any).id;
        }
      });

      console.log(`[QualityPlan] Record ${id} marked ready for inspection setup by user ${userId}`);
      res.json({ success: true, message: 'Quality planning record marked ready for inspection setup', id, newStatus: 'ready_for_inspection_setup', inspExecId });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/quality-plans/:id/revert-to-preparation', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('quality_planning_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid quality plan ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM quality_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Quality planning record not found');
      const record = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(record, req.user as any, 'department', req, res))) return;

      if (record.status !== 'ready_for_inspection_setup') {
        return sendBusinessError(res, `Cannot revert: only 'ready_for_inspection_setup' records can be reverted. Current status: '${record.status}'.`);
      }

      const activeInspections = await db.execute(
        sql`SELECT id, status FROM inspection_execution_records WHERE quality_plan_id = ${id} AND status NOT IN ('canceled', 'superseded')`
      );
      if (activeInspections.rows.length > 0) {
        return sendBusinessError(res, `Cannot revert: ${activeInspections.rows.length} active inspection record(s) exist. Cancel them first or use the cancel action instead.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(qualityPlanningRecords)
          .set({ status: 'under_preparation', preparationNote: null, updatedAt: new Date() })
          .where(eq(qualityPlanningRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'quality_planning.reverted_to_preparation', ${JSON.stringify({
            qualityPlanId: id, projectItemId: record.project_item_id, revertedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[QualityPlan] Record ${id} reverted to preparation by user ${userId}`);
      res.json({ success: true, message: 'Reverted to under_preparation', id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/quality-plans/:id/cancel', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('quality_planning_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid quality plan ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM quality_planning_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Quality planning record not found');
      const record = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(record, req.user as any, 'department', req, res))) return;

      if (record.status === 'superseded' || record.status === 'canceled') {
        return sendBusinessError(res, `Cannot cancel: record is already '${record.status}'.`);
      }

      let cascadedInspExecIds: number[] = [];

      await db.transaction(async (tx) => {
        await tx.update(qualityPlanningRecords)
          .set({
            status: 'canceled', cancelledBy: userId, cancelledAt: new Date(),
            cancelReason, updatedAt: new Date(),
          })
          .where(eq(qualityPlanningRecords.id, id));

        const ieCascade = await tx.execute(
          sql`UPDATE inspection_execution_records 
              SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                  cancel_reason = ${'Upstream quality plan canceled: ' + cancelReason}, updated_at = NOW()
              WHERE quality_plan_id = ${id} AND status IN ('draft', 'scheduled', 'in_progress')
              RETURNING id`
        );
        cascadedInspExecIds = ieCascade.rows.map((r: any) => r.id);

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'quality_planning.canceled', ${JSON.stringify({
            qualityPlanId: id, sourceContext: record.source_context,
            projectItemId: record.project_item_id, cancelledBy: userId, cancelReason,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[QualityPlan] Record ${id} canceled by user ${userId}`);
      res.json({ success: true, message: 'Quality planning record canceled', id, newStatus: 'canceled',
        cascadedInspExecIds,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ─── Inspection Execution Record Lifecycle Routes ──────────────────────────

  app.get('/api/projects/:projectId/inspection-executions', ensureAuthenticated, requirePageAccess('quality-inspection'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;
      const typeFilter = req.query.inspectionType as string | undefined;
      const user = req.user as any;
      const visibilityScope = (req as any).visibilityScope || 'department_records';
      const ieOwnershipConfig: OwnershipFilterConfig = { createdByColumn: 'created_by', assignedToColumn: 'assigned_to', mode: 'department' };
      const { whereSql, joinSql } = buildOwnershipWhereClause(user, visibilityScope, ieOwnershipConfig, 'ie');

      let query = sql`SELECT ie.*, u1.username as assigned_to_name, u2.username as created_by_name,
                             u3.username as scheduled_by_name, u4.username as completed_by_name
                      FROM inspection_execution_records ie
                      LEFT JOIN users u1 ON ie.assigned_to = u1.id
                      LEFT JOIN users u2 ON ie.created_by = u2.id
                      LEFT JOIN users u3 ON ie.scheduled_by = u3.id
                      LEFT JOIN users u4 ON ie.completed_by = u4.id`;
      if (joinSql) query = sql`${query} ${joinSql}`;
      query = sql`${query} WHERE ie.project_id = ${projectId}`;
      if (whereSql) query = sql`${query} AND ${whereSql}`;

      if (statusFilter) query = sql`${query} AND ie.status = ${statusFilter}`;
      if (itemFilter) query = sql`${query} AND ie.project_item_id = ${itemFilter}`;
      if (typeFilter) query = sql`${query} AND ie.inspection_type = ${typeFilter}`;
      query = sql`${query} ORDER BY ie.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/inspection-executions/:id', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid inspection execution ID');

      const result = await db.execute(
        sql`SELECT ie.*, u1.username as assigned_to_name, u2.username as created_by_name,
                   u3.username as scheduled_by_name, u4.username as completed_by_name
            FROM inspection_execution_records ie
            LEFT JOIN users u1 ON ie.assigned_to = u1.id
            LEFT JOIN users u2 ON ie.created_by = u2.id
            LEFT JOIN users u3 ON ie.scheduled_by = u3.id
            LEFT JOIN users u4 ON ie.completed_by = u4.id
            WHERE ie.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Inspection execution record not found');

      const record = result.rows[0] as any;
      const user = req.user as any;
      const { visibilityScope } = await checkProjectMembership(user.id, user.role, record.project_id);
      const creatorDept = await lookupCreatorDepartment(record.created_by);
      if (!checkRecordOwnership(record, creatorDept, user, visibilityScope, 'department')) {
        return denyRecordAccess(res, req);
      }

      res.json(record);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/inspection-executions/:id', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('inspection_execution_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid inspection execution ID');

      const existing = await db.execute(sql`SELECT * FROM inspection_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Inspection execution record not found');
      const record = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(record, req.user as any, 'department', req, res))) return;

      if (['completed', 'failed', 'superseded', 'canceled'].includes(record.status)) {
        return sendBusinessError(res, `Cannot edit: record is in terminal status '${record.status}'.`);
      }

      const { assignedTo, inspectionType, inspectionNotes, quantity } = req.body || {};

      const hasUpdates = [assignedTo, inspectionType, inspectionNotes, quantity].some(v => v !== undefined);
      if (!hasUpdates) return sendValidationError(res, 'No valid fields to update');

      const updates: any = { updatedAt: new Date() };
      if (assignedTo !== undefined) updates.assignedTo = assignedTo || null;
      if (inspectionType !== undefined) updates.inspectionType = inspectionType;
      if (inspectionNotes !== undefined) updates.inspectionNotes = inspectionNotes || null;
      if (quantity !== undefined) updates.quantity = String(quantity);

      await db.update(inspectionExecutionRecords).set(updates).where(eq(inspectionExecutionRecords.id, id));

      const result = await db.execute(sql`SELECT * FROM inspection_execution_records WHERE id = ${id}`);
      res.json(result.rows[0]);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/inspection-executions/:id/schedule', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('inspection_execution_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid inspection execution ID');
      const userId = (req.user as any)?.id;
      const { scheduledDate, inspectorId } = req.body || {};

      if (!scheduledDate) return sendValidationError(res, 'Scheduled date is required');

      const existing = await db.execute(sql`SELECT * FROM inspection_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Inspection execution record not found');
      const record = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(record, req.user as any, 'department', req, res))) return;

      if (record.status !== 'draft') {
        return sendBusinessError(res, `Cannot schedule: record status is '${record.status}', expected 'draft'.`);
      }

      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE inspection_execution_records 
              SET status = 'scheduled', scheduled_date = ${scheduledDate}, scheduled_at = NOW(),
                  scheduled_by = ${userId},
                  assigned_to = COALESCE(${inspectorId || null}, assigned_to), updated_at = NOW()
              WHERE id = ${id}`
        );

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'inspection_execution.scheduled', ${JSON.stringify({
            inspectionExecId: id, qualityPlanId: record.quality_plan_id,
            projectItemId: record.project_item_id, scheduledBy: userId, scheduledDate,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[InspectionExec] Record ${id} scheduled for ${scheduledDate} by user ${userId}`);
      res.json({ success: true, message: 'Inspection execution record scheduled', id, newStatus: 'scheduled' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/inspection-executions/:id/start', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('inspection_execution_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid inspection execution ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM inspection_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Inspection execution record not found');
      const record = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(record, req.user as any, 'department', req, res))) return;

      if (record.status !== 'scheduled') {
        return sendBusinessError(res, `Cannot start: record status is '${record.status}', expected 'scheduled'.`);
      }

      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE inspection_execution_records 
              SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
              WHERE id = ${id}`
        );

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'inspection_execution.started', ${JSON.stringify({
            inspectionExecId: id, qualityPlanId: record.quality_plan_id,
            projectItemId: record.project_item_id, startedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[InspectionExec] Record ${id} started by user ${userId}`);
      res.json({ success: true, message: 'Inspection execution started', id, newStatus: 'in_progress' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/inspection-executions/:id/complete', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('inspection_execution_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid inspection execution ID');
      const userId = (req.user as any)?.id;
      const { result, findings, measurementData } = req.body || {};

      if (!result || !['pass', 'conditional_pass', 'fail'].includes(result)) {
        return sendValidationError(res, 'Result is required: pass, conditional_pass, or fail');
      }

      const existing = await db.execute(sql`SELECT * FROM inspection_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Inspection execution record not found');
      const record = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(record, req.user as any, 'department', req, res))) return;

      if (record.status !== 'in_progress') {
        return sendBusinessError(res, `Cannot complete: record status is '${record.status}', expected 'in_progress'.`);
      }

      let qualityLinkage: any = { linkedPOs: 0, linkedWOs: 0 };

      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE inspection_execution_records 
              SET status = 'completed', result = ${result}, completed_by = ${userId}, completed_at = NOW(),
                  findings = ${findings || null}, measurement_data = ${measurementData ? JSON.stringify(measurementData) : null}::jsonb,
                  updated_at = NOW()
              WHERE id = ${id}`
        );

        if (result === 'pass' || result === 'conditional_pass') {
          const qpResult = await tx.execute(
            sql`SELECT qp.procurement_exec_id, qp.production_exec_id, qp.source_context
                FROM quality_planning_records qp WHERE qp.id = ${record.quality_plan_id}`
          );
          const qp = qpResult.rows[0] as any;

          if (qp) {
            if (qp.procurement_exec_id) {
              const poUpdate = await tx.execute(
                sql`UPDATE epc_purchase_orders 
                    SET quality_status = 'inspection_cleared', quality_cleared_by = ${userId}, quality_cleared_at = NOW(),
                        quality_cleared_inspection_id = ${id}, quality_failure_reason = NULL, quality_failed_inspection_id = NULL, updated_at = NOW()
                    WHERE execution_record_id = ${qp.procurement_exec_id}
                      AND project_item_id = ${record.project_item_id}
                      AND status NOT IN ('canceled', 'superseded')
                      AND quality_status != 'inspection_cleared'
                    RETURNING id, po_number`
              );
              qualityLinkage.linkedPOs = poUpdate.rows.length;
              for (const poRow of poUpdate.rows) {
                await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
                  VALUES (${record.project_id}, 'epc_purchase_order.quality_cleared', ${JSON.stringify({
                    epcPoId: (poRow as any).id, poNumber: (poRow as any).po_number,
                    inspectionExecId: id, result, inspectionType: record.inspection_type,
                    qualityPlanId: record.quality_plan_id, clearedBy: userId,
                  })}::jsonb, 'quality_linkage', NOW())`);
              }
            }

            if (qp.production_exec_id) {
              const woUpdate = await tx.execute(
                sql`UPDATE epc_work_orders 
                    SET quality_status = 'inspection_cleared', quality_cleared_by = ${userId}, quality_cleared_at = NOW(),
                        quality_cleared_inspection_id = ${id}, quality_failure_reason = NULL, quality_failed_inspection_id = NULL, updated_at = NOW()
                    WHERE execution_record_id = ${qp.production_exec_id}
                      AND project_item_id = ${record.project_item_id}
                      AND status NOT IN ('canceled', 'superseded')
                      AND quality_status != 'inspection_cleared'
                    RETURNING id, wo_number`
              );
              qualityLinkage.linkedWOs = woUpdate.rows.length;
              for (const woRow of woUpdate.rows) {
                await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
                  VALUES (${record.project_id}, 'epc_work_order.quality_cleared', ${JSON.stringify({
                    epcWoId: (woRow as any).id, woNumber: (woRow as any).wo_number,
                    inspectionExecId: id, result, inspectionType: record.inspection_type,
                    qualityPlanId: record.quality_plan_id, clearedBy: userId,
                  })}::jsonb, 'quality_linkage', NOW())`);
              }
            }
          }
        }

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'inspection_execution.completed', ${JSON.stringify({
            inspectionExecId: id, qualityPlanId: record.quality_plan_id,
            projectItemId: record.project_item_id, completedBy: userId, result,
            qualityLinkage,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      if (result === 'pass' || result === 'conditional_pass') {
        try {
          const piResult = await db.execute(sql`SELECT pi.id, pi.master_item_id, pi.item_code, pi.item_description, pi.uom, pi.quantity, pi.classification
            FROM project_items pi WHERE pi.id = ${record.project_item_id}`);
          if (piResult.rows.length > 0) {
            const pi = piResult.rows[0] as any;
            const drNumber = await epcCoding.generateDocumentNumber(record.project_id, 'DR', db);
            const sourceType = pi.classification === 'Buy' ? 'purchase_order' : 'work_order';
            const drInsert = await db.execute(
              sql`INSERT INTO epc_dispatch_readiness
                  (dr_number, project_id, project_item_id, master_item_id,
                   inspection_execution_id, quality_plan_id,
                   item_code, item_description, uom, quantity,
                   quality_clearance_date, quality_clearance_reference,
                   source_type, status, created_by, created_at)
                  VALUES (${drNumber}, ${record.project_id}, ${record.project_item_id}, ${pi.master_item_id},
                          ${id}, ${record.quality_plan_id},
                          ${pi.item_code}, ${pi.item_description}, ${pi.uom || 'EA'}, ${pi.quantity || 1},
                          NOW(), ${'Inspection ' + id + ' - ' + result},
                          ${sourceType}, 'ready', ${userId}, NOW())
                  RETURNING id`
            );
            const drId = (drInsert.rows[0] as any)?.id;
            console.log(`[InspectionExec] Auto-created dispatch readiness ${drNumber} for project item ${record.project_item_id}`);

            const dspAssigneeResult = await resolveEpcAssignee('DSP_prepare', record.project_id, String(userId));
            const dspAssigneeId = dspAssigneeResult.userId;
            if (dspAssigneeId && drId) {
              const projCode = await resolveProjectCode(record.project_id);
              await createEpcTask({
                projectId: record.project_id, entityType: 'dispatch_readiness', recordId: drId, actionCode: 'prepare_dispatch',
                title: `Prepare Dispatch ${drNumber} — ${projCode}`,
                description: `Item ${pi.item_description || pi.item_code} has passed inspection and is ready for dispatch. Please prepare packaging and shipping details.`,
                assignedTo: dspAssigneeId, createdBy: userId, priority: 'High', dueDays: 3,
              });
            }
          }
        } catch (drErr: any) {
          console.error(`[InspectionExec] Warning: Failed to auto-create dispatch readiness:`, drErr.message);
        }
      }

      console.log(`[InspectionExec] Record ${id} completed with result '${result}' by user ${userId}. Quality linkage: POs=${qualityLinkage.linkedPOs}, WOs=${qualityLinkage.linkedWOs}`);
      res.json({ success: true, message: 'Inspection execution completed', id, newStatus: 'completed', result, qualityLinkage });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/inspection-executions/:id/fail', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('inspection_execution_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid inspection execution ID');
      const userId = (req.user as any)?.id;
      const { failureReason, findings } = req.body || {};

      if (!failureReason) return sendValidationError(res, 'Failure reason is required');

      const existing = await db.execute(sql`SELECT * FROM inspection_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Inspection execution record not found');
      const record = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(record, req.user as any, 'department', req, res))) return;

      if (record.status !== 'in_progress') {
        return sendBusinessError(res, `Cannot fail: record status is '${record.status}', expected 'in_progress'.`);
      }

      let qualityLinkage: any = { blockedPOs: 0, blockedWOs: 0, ncrTaskId: null };

      const txInspResult = await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE inspection_execution_records 
              SET status = 'failed', result = 'fail', failed_by = ${userId}, failed_at = NOW(),
                  findings = ${findings || null}, failure_reason = ${failureReason}, updated_at = NOW()
              WHERE id = ${id}`
        );

        const qpResult = await tx.execute(
          sql`SELECT qp.procurement_exec_id, qp.production_exec_id, qp.source_context
              FROM quality_planning_records qp WHERE qp.id = ${record.quality_plan_id}`
        );
        const qp = qpResult.rows[0] as any;

        if (qp) {
          if (qp.procurement_exec_id) {
            const poBlock = await tx.execute(
              sql`UPDATE epc_purchase_orders 
                  SET quality_status = 'inspection_failed', quality_failure_reason = ${failureReason},
                      quality_failed_inspection_id = ${id}, updated_at = NOW()
                  WHERE execution_record_id = ${qp.procurement_exec_id}
                    AND project_item_id = ${record.project_item_id}
                    AND status NOT IN ('canceled', 'superseded')
                    AND quality_status != 'inspection_failed'
                  RETURNING id, po_number`
            );
            qualityLinkage.blockedPOs = poBlock.rows.length;
            for (const poRow of poBlock.rows) {
              await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
                VALUES (${record.project_id}, 'epc_purchase_order.quality_blocked', ${JSON.stringify({
                  epcPoId: (poRow as any).id, poNumber: (poRow as any).po_number,
                  inspectionExecId: id, failureReason, inspectionType: record.inspection_type,
                  qualityPlanId: record.quality_plan_id, blockedBy: userId,
                })}::jsonb, 'quality_linkage', NOW())`);
            }
          }

          if (qp.production_exec_id) {
            const woBlock = await tx.execute(
              sql`UPDATE epc_work_orders 
                  SET quality_status = 'inspection_failed', quality_failure_reason = ${failureReason},
                      quality_failed_inspection_id = ${id}, updated_at = NOW()
                  WHERE execution_record_id = ${qp.production_exec_id}
                    AND project_item_id = ${record.project_item_id}
                    AND status NOT IN ('canceled', 'superseded')
                    AND quality_status != 'inspection_failed'
                  RETURNING id, wo_number`
            );
            qualityLinkage.blockedWOs = woBlock.rows.length;
            for (const woRow of woBlock.rows) {
              await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
                VALUES (${record.project_id}, 'epc_work_order.quality_blocked', ${JSON.stringify({
                  epcWoId: (woRow as any).id, woNumber: (woRow as any).wo_number,
                  inspectionExecId: id, failureReason, inspectionType: record.inspection_type,
                  qualityPlanId: record.quality_plan_id, blockedBy: userId,
                })}::jsonb, 'quality_linkage', NOW())`);
            }
          }
        }

        const existingNcr = await tx.execute(
          sql`SELECT id FROM tasks 
              WHERE source_type = 'inspection_ncr' AND source_id = ${id}
              LIMIT 1`
        );
        if (existingNcr.rows.length === 0) {
          const itemDesc = record.item_description || record.item_code || 'Unknown Item';
          const inspType = record.inspection_type || 'general';
          const ncrTitle = `[NCR] Inspection Failed: ${itemDesc} (${inspType})`;
          const ncrDesc = `Non-Conformance Report for failed inspection execution #${id}.\n\nItem: ${itemDesc}\nInspection Type: ${inspType}\nFailure Reason: ${failureReason}\n${findings ? `Findings: ${findings}` : ''}\n\nProject Item ID: ${record.project_item_id}\nQuality Plan ID: ${record.quality_plan_id}`;

          const ncrResult = await tx.execute(
            sql`INSERT INTO tasks (title, description, status, priority, category, source_type, source_id, source_agent, created_by, created_at, due_date)
                VALUES (${ncrTitle}, ${ncrDesc}, 'pending', 'high', 'Quality', 'inspection_ncr', ${id}, 'quality_linkage', ${userId}, NOW(), ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]})
                RETURNING id`
          );
          qualityLinkage.ncrTaskId = (ncrResult.rows[0] as any).id;
        } else {
          qualityLinkage.ncrTaskId = (existingNcr.rows[0] as any).id;
          qualityLinkage.ncrAlreadyExists = true;
        }

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'inspection_execution.failed', ${JSON.stringify({
            inspectionExecId: id, qualityPlanId: record.quality_plan_id,
            projectItemId: record.project_item_id, failedBy: userId, failureReason,
            qualityLinkage,
          })}::jsonb, 'lifecycle_action', NOW())`);

        const inspItemDesc = record.item_description || record.item_code || 'Unknown Item';
        const [inspQcResult, inspProcResult, inspProdResult] = await Promise.all([
          resolveEpcAssignee('INS_verify', record.project_id, String(userId)),
          resolveEpcAssignee('PO_approve', record.project_id, String(userId)),
          resolveEpcAssignee('WO_approve', record.project_id, String(userId)),
        ]);
        const inspQualityLead = inspQcResult.userId;
        const inspProcLead = inspProcResult.userId;
        const inspProdLead = inspProdResult.userId;
        const inspPM = await resolveManagerId(record.project_id, tx);
        return { inspItemDesc, inspQualityLead, inspProcLead, inspProdLead, inspPM };
      });

      const inspAlertRecipients = [txInspResult.inspQualityLead, txInspResult.inspProcLead, txInspResult.inspProdLead, txInspResult.inspPM]
        .filter((v, i, a) => v && a.indexOf(v) === i) as number[];
      await createEpcAlertMulti(inspAlertRecipients, {
        type: 'epc_inspection_failed',
        title: `CRITICAL: Inspection failed for ${txInspResult.inspItemDesc}`,
        message: `Inspection for ${txInspResult.inspItemDesc} (${record.inspection_type || 'general'}) has failed. Reason: ${failureReason}. ${qualityLinkage.blockedPOs > 0 ? `${qualityLinkage.blockedPOs} PO(s) blocked. ` : ''}${qualityLinkage.blockedWOs > 0 ? `${qualityLinkage.blockedWOs} WO(s) blocked. ` : ''}NCR task #${qualityLinkage.ncrTaskId} created.`,
        link: `/epc/execution-control`, priority: 'critical', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
        entityType: 'inspection_execution', recordId: id, actionCode: 'failed',
      });

      console.log(`[InspectionExec] Record ${id} failed by user ${userId}: ${failureReason}. Quality linkage: POs=${qualityLinkage.blockedPOs}, WOs=${qualityLinkage.blockedWOs}, NCR task=${qualityLinkage.ncrTaskId}`);
      res.json({ success: true, message: 'Inspection execution marked as failed', id, newStatus: 'failed', qualityLinkage });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/inspection-executions/:id/cancel', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('inspection_execution_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid inspection execution ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM inspection_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Inspection execution record not found');
      const record = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(record, req.user as any, 'department', req, res))) return;

      if (['completed', 'failed', 'superseded', 'canceled'].includes(record.status)) {
        return sendBusinessError(res, `Cannot cancel: record is already '${record.status}'.`);
      }

      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE inspection_execution_records 
              SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                  cancel_reason = ${cancelReason}, updated_at = NOW()
              WHERE id = ${id}`
        );

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'inspection_execution.canceled', ${JSON.stringify({
            inspectionExecId: id, qualityPlanId: record.quality_plan_id,
            projectItemId: record.project_item_id, cancelledBy: userId, cancelReason,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[InspectionExec] Record ${id} canceled by user ${userId}`);
      res.json({ success: true, message: 'Inspection execution record canceled', id, newStatus: 'canceled' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/inspection-executions/:id/mark-rework-required', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('inspection_execution_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid inspection execution ID');
      const userId = (req.user as any)?.id;
      const { reworkNotes } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM inspection_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Inspection execution record not found');
      const record = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(record, req.user as any, 'department', req, res))) return;

      if (record.status !== 'failed') {
        return sendBusinessError(res, `Cannot mark rework required: record status is '${record.status}', expected 'failed'.`);
      }

      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE inspection_execution_records 
              SET status = 'rework_required', result_notes = ${reworkNotes || null}, updated_at = NOW()
              WHERE id = ${id}`
        );

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'inspection_execution.rework_required', ${JSON.stringify({
            inspectionExecId: id, qualityPlanId: record.quality_plan_id,
            projectItemId: record.project_item_id, markedBy: userId, reworkNotes,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[InspectionExec] Record ${id} marked rework required by user ${userId}`);
      res.json({ success: true, message: 'Inspection marked as rework required', id, newStatus: 'rework_required' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/inspection-executions/:id/close', ensureAuthenticated, requirePageAccess('quality-inspection'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Senior Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('inspection_execution_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid inspection execution ID');
      const userId = (req.user as any)?.id;
      const { closingNotes } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM inspection_execution_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Inspection execution record not found');
      const record = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(record, req.user as any, 'department', req, res))) return;

      if (!['completed', 'rework_required'].includes(record.status)) {
        return sendBusinessError(res, `Cannot close: record status is '${record.status}'. Only 'completed' or 'rework_required' records can be closed.`);
      }

      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE inspection_execution_records 
              SET status = 'closed', result_notes = COALESCE(result_notes || E'\n', '') || ${closingNotes ? 'Closing notes: ' + closingNotes : ''}, updated_at = NOW()
              WHERE id = ${id}`
        );

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'inspection_execution.closed', ${JSON.stringify({
            inspectionExecId: id, qualityPlanId: record.quality_plan_id,
            projectItemId: record.project_item_id, closedBy: userId, closingNotes,
            previousStatus: record.status,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[InspectionExec] Record ${id} closed by user ${userId}`);
      res.json({ success: true, message: 'Inspection record closed', id, newStatus: 'closed' });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ─── PO Preparation Record Lifecycle Routes ──────────────────────────────

  app.get('/api/projects/:projectId/po-preparations', ensureAuthenticated, requirePageAccess('purchase-orders'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;

      let query = sql`SELECT pp.*, u1.username as assigned_to_name, u2.username as created_by_name,
                             u3.username as reviewed_by_name, u4.username as ready_by_name
                      FROM po_preparation_records pp
                      LEFT JOIN users u1 ON pp.assigned_to = u1.id
                      LEFT JOIN users u2 ON pp.created_by = u2.id
                      LEFT JOIN users u3 ON pp.reviewed_by = u3.id
                      LEFT JOIN users u4 ON pp.ready_by = u4.id
                      WHERE pp.project_id = ${projectId}`;

      if (statusFilter) query = sql`${query} AND pp.status = ${statusFilter}`;
      if (itemFilter) query = sql`${query} AND pp.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY pp.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/po-preparations/:id', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');

      const result = await db.execute(
        sql`SELECT pp.*, u1.username as assigned_to_name, u2.username as created_by_name,
                   u3.username as reviewed_by_name, u4.username as ready_by_name
            FROM po_preparation_records pp
            LEFT JOIN users u1 ON pp.assigned_to = u1.id
            LEFT JOIN users u2 ON pp.created_by = u2.id
            LEFT JOIN users u3 ON pp.reviewed_by = u3.id
            LEFT JOIN users u4 ON pp.ready_by = u4.id
            WHERE pp.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      res.json(result.rows[0]);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/po-preparations/:id', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('po_preparation_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const record = existing.rows[0] as any;

      // Phase 2 PLC hard-block
      if (record.planning_record_id) {
        const plcChk = await pool.query(`SELECT 1 FROM procurement_list_lines WHERE planning_record_id = $1 AND status NOT IN ('cancelled','superseded') LIMIT 1`, [record.planning_record_id]);
        if ((plcChk.rowCount ?? 0) > 0) return res.status(423).json({ error: 'deprecated_path', message: 'Use Procurement List Control to advance this procurement line.' });
      }

      if (record.status === 'superseded' || record.status === 'canceled') {
        return sendBusinessError(res, `Cannot edit: record is '${record.status}'.`);
      }
      if (record.status === 'ready_for_po_creation') {
        return sendBusinessError(res, 'Cannot edit: record is already ready for PO creation. Revert to under_review first.');
      }

      const { quantity, estimatedUnitCost, estimatedTotalCost, preferredVendorId,
              preferredVendorName, procurementNotes, reviewNotes } = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (quantity !== undefined) updates.quantity = String(quantity);
      if (estimatedUnitCost !== undefined) updates.estimatedUnitCost = estimatedUnitCost ? String(estimatedUnitCost) : null;
      if (estimatedTotalCost !== undefined) updates.estimatedTotalCost = estimatedTotalCost ? String(estimatedTotalCost) : null;
      if (preferredVendorId !== undefined) updates.preferredVendorId = preferredVendorId || null;
      if (preferredVendorName !== undefined) updates.preferredVendorName = preferredVendorName || null;
      if (procurementNotes !== undefined) updates.procurementNotes = procurementNotes || null;
      if (reviewNotes !== undefined) updates.reviewNotes = reviewNotes || null;

      await db.update(poPreparationRecords).set(updates).where(eq(poPreparationRecords.id, id));
      res.json({ success: true, message: 'PO preparation record updated', id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/po-preparations/:id/submit-for-review', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('po_preparation_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const record = existing.rows[0] as any;

      // Phase 2 PLC hard-block
      if (record.planning_record_id) {
        const plcChk = await pool.query(`SELECT 1 FROM procurement_list_lines WHERE planning_record_id = $1 AND status NOT IN ('cancelled','superseded') LIMIT 1`, [record.planning_record_id]);
        if ((plcChk.rowCount ?? 0) > 0) return res.status(423).json({ error: 'deprecated_path', message: 'Use Procurement List Control to advance this procurement line.' });
      }

      if (record.status !== 'draft') {
        return sendBusinessError(res, `Cannot submit for review: record is in '${record.status}' status. Only 'draft' records can be submitted.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(poPreparationRecords)
          .set({ status: 'under_review', updatedAt: new Date() })
          .where(eq(poPreparationRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'po_preparation.submitted_for_review', ${JSON.stringify({
            poPrepId: id, executionRecordId: record.execution_record_id,
            projectItemId: record.project_item_id, submittedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[POPrep] Record ${id} submitted for review by user ${userId}`);
      res.json({ success: true, message: 'PO preparation submitted for review', id, newStatus: 'under_review' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/po-preparations/:id/approve', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('po_preparation_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');
      const userId = (req.user as any)?.id;
      const { reviewNotes } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const record = existing.rows[0] as any;

      // Phase 2 PLC hard-block
      if (record.planning_record_id) {
        const plcChk = await pool.query(`SELECT 1 FROM procurement_list_lines WHERE planning_record_id = $1 AND status NOT IN ('cancelled','superseded') LIMIT 1`, [record.planning_record_id]);
        if ((plcChk.rowCount ?? 0) > 0) return res.status(423).json({ error: 'deprecated_path', message: 'Use Procurement List Control to advance this procurement line.' });
      }

      if (record.status !== 'under_review') {
        return sendBusinessError(res, `Cannot approve: record is in '${record.status}' status. Only 'under_review' records can be approved.`);
      }

      if (record.created_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the creator cannot also approve the same PO preparation record.');
      }

      await db.transaction(async (tx) => {
        await tx.update(poPreparationRecords)
          .set({
            status: 'ready_for_po_creation', reviewedBy: userId, reviewedAt: new Date(),
            readyBy: userId, readyAt: new Date(),
            reviewNotes: reviewNotes || null, updatedAt: new Date(),
          })
          .where(eq(poPreparationRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'po_preparation.ready_for_po_creation', ${JSON.stringify({
            poPrepId: id, executionRecordId: record.execution_record_id,
            projectItemId: record.project_item_id, approvedBy: userId, reviewNotes,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[POPrep] Record ${id} approved and ready for PO creation by user ${userId}`);
      res.json({ success: true, message: 'PO preparation approved — ready for PO creation', id, newStatus: 'ready_for_po_creation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/po-preparations/:id/revert-to-draft', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('po_preparation_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const record = existing.rows[0] as any;

      // Phase 2 PLC hard-block
      if (record.planning_record_id) {
        const plcChk = await pool.query(`SELECT 1 FROM procurement_list_lines WHERE planning_record_id = $1 AND status NOT IN ('cancelled','superseded') LIMIT 1`, [record.planning_record_id]);
        if ((plcChk.rowCount ?? 0) > 0) return res.status(423).json({ error: 'deprecated_path', message: 'Use Procurement List Control to advance this procurement line.' });
      }

      if (record.status !== 'under_review') {
        return sendBusinessError(res, `Cannot revert to draft: only 'under_review' records can be reverted. Current status: '${record.status}'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(poPreparationRecords)
          .set({ status: 'draft', reviewedBy: null, reviewedAt: null, reviewNotes: null, updatedAt: new Date() })
          .where(eq(poPreparationRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'po_preparation.reverted_to_draft', ${JSON.stringify({
            poPrepId: id, projectItemId: record.project_item_id, revertedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[POPrep] Record ${id} reverted to draft by user ${userId}`);
      res.json({ success: true, message: 'Reverted to draft', id, newStatus: 'draft' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/po-preparations/:id/revert-to-review', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('po_preparation_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const record = existing.rows[0] as any;

      // Phase 2 PLC hard-block
      if (record.planning_record_id) {
        const plcChk = await pool.query(`SELECT 1 FROM procurement_list_lines WHERE planning_record_id = $1 AND status NOT IN ('cancelled','superseded') LIMIT 1`, [record.planning_record_id]);
        if ((plcChk.rowCount ?? 0) > 0) return res.status(423).json({ error: 'deprecated_path', message: 'Use Procurement List Control to advance this procurement line.' });
      }

      if (record.status !== 'ready_for_po_creation') {
        return sendBusinessError(res, `Cannot revert to review: only 'ready_for_po_creation' records can be reverted. Current status: '${record.status}'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(poPreparationRecords)
          .set({ status: 'under_review', readyBy: null, readyAt: null, updatedAt: new Date() })
          .where(eq(poPreparationRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'po_preparation.reverted_to_review', ${JSON.stringify({
            poPrepId: id, projectItemId: record.project_item_id, revertedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[POPrep] Record ${id} reverted to under_review by user ${userId}`);
      res.json({ success: true, message: 'Reverted to under_review', id, newStatus: 'under_review' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/po-preparations/:id/cancel', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('po_preparation_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid PO preparation ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const record = existing.rows[0] as any;

      // Phase 2 PLC hard-block
      if (record.planning_record_id) {
        const plcChk = await pool.query(`SELECT 1 FROM procurement_list_lines WHERE planning_record_id = $1 AND status NOT IN ('cancelled','superseded') LIMIT 1`, [record.planning_record_id]);
        if ((plcChk.rowCount ?? 0) > 0) return res.status(423).json({ error: 'deprecated_path', message: 'Use Procurement List Control to advance this procurement line.' });
      }

      if (record.status === 'superseded' || record.status === 'canceled') {
        return sendBusinessError(res, `Cannot cancel: record is already '${record.status}'.`);
      }

      let cascadedEpcPoIds: number[] = [];

      await db.transaction(async (tx) => {
        await tx.update(poPreparationRecords)
          .set({
            status: 'canceled', cancelledBy: userId, cancelledAt: new Date(),
            cancelReason, updatedAt: new Date(),
          })
          .where(eq(poPreparationRecords.id, id));

        const epcPoCascade = await tx.execute(
          sql`UPDATE epc_purchase_orders 
              SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                  cancel_reason = ${'Upstream PO preparation canceled: ' + cancelReason}, updated_at = NOW()
              WHERE po_preparation_id = ${id} AND status NOT IN ('canceled', 'superseded')
              RETURNING id, po_number`
        );
        cascadedEpcPoIds = epcPoCascade.rows.map((r: any) => r.id);

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'po_preparation.canceled', ${JSON.stringify({
            poPrepId: id, executionRecordId: record.execution_record_id,
            projectItemId: record.project_item_id, cancelledBy: userId, cancelReason,
          })}::jsonb, 'lifecycle_action', NOW())`);

        for (const poRow of epcPoCascade.rows) {
          await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
            VALUES (${record.project_id}, 'epc_purchase_order.canceled_by_upstream', ${JSON.stringify({
              epcPoId: (poRow as any).id, poNumber: (poRow as any).po_number,
              poPrepId: id, cancelledBy: userId, reason: 'Upstream PO preparation canceled',
            })}::jsonb, 'lifecycle_action', NOW())`);
        }
      });

      console.log(`[POPrep] Record ${id} canceled by user ${userId}. Cascaded EPC POs: ${cascadedEpcPoIds}`);
      res.json({ success: true, message: 'PO preparation record canceled', id, newStatus: 'canceled', cascadedEpcPoIds });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ─── WO Preparation Record Lifecycle Routes ──────────────────────────────

  app.get('/api/projects/:projectId/wo-preparations', ensureAuthenticated, requirePageAccess('work-orders'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;

      let query = sql`SELECT wp.*, u1.username as assigned_to_name, u2.username as created_by_name,
                             u3.username as reviewed_by_name, u4.username as ready_by_name
                      FROM wo_preparation_records wp
                      LEFT JOIN users u1 ON wp.assigned_to = u1.id
                      LEFT JOIN users u2 ON wp.created_by = u2.id
                      LEFT JOIN users u3 ON wp.reviewed_by = u3.id
                      LEFT JOIN users u4 ON wp.ready_by = u4.id
                      WHERE wp.project_id = ${projectId}`;

      if (statusFilter) query = sql`${query} AND wp.status = ${statusFilter}`;
      if (itemFilter) query = sql`${query} AND wp.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY wp.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/wo-preparations/:id', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid WO preparation ID');

      const result = await db.execute(
        sql`SELECT wp.*, u1.username as assigned_to_name, u2.username as created_by_name,
                   u3.username as reviewed_by_name, u4.username as ready_by_name
            FROM wo_preparation_records wp
            LEFT JOIN users u1 ON wp.assigned_to = u1.id
            LEFT JOIN users u2 ON wp.created_by = u2.id
            LEFT JOIN users u3 ON wp.reviewed_by = u3.id
            LEFT JOIN users u4 ON wp.ready_by = u4.id
            WHERE wp.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'WO preparation record not found');
      res.json(result.rows[0]);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/wo-preparations/:id', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('wo_preparation_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid WO preparation ID');

      const existing = await db.execute(sql`SELECT * FROM wo_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'WO preparation record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'canceled') {
        return sendBusinessError(res, `Cannot edit: record is '${record.status}'.`);
      }
      if (record.status === 'ready_for_wo_creation') {
        return sendBusinessError(res, 'Cannot edit: record is already ready for WO creation. Revert to under_review first.');
      }

      const { quantity, estimatedUnitCost, estimatedTotalCost, drawingNo, drawingRevision,
              makeClassification, manufacturingNotes, reviewNotes } = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (quantity !== undefined) updates.quantity = String(quantity);
      if (estimatedUnitCost !== undefined) updates.estimatedUnitCost = estimatedUnitCost ? String(estimatedUnitCost) : null;
      if (estimatedTotalCost !== undefined) updates.estimatedTotalCost = estimatedTotalCost ? String(estimatedTotalCost) : null;
      if (drawingNo !== undefined) updates.drawingNo = drawingNo || null;
      if (drawingRevision !== undefined) updates.drawingRevision = drawingRevision || null;
      if (makeClassification !== undefined) updates.makeClassification = makeClassification || null;
      if (manufacturingNotes !== undefined) updates.manufacturingNotes = manufacturingNotes || null;
      if (reviewNotes !== undefined) updates.reviewNotes = reviewNotes || null;

      await db.update(woPreparationRecords).set(updates).where(eq(woPreparationRecords.id, id));
      res.json({ success: true, message: 'WO preparation record updated', id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/wo-preparations/:id/submit-for-review', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('wo_preparation_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid WO preparation ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM wo_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'WO preparation record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'draft') {
        return sendBusinessError(res, `Cannot submit for review: record is in '${record.status}' status. Only 'draft' records can be submitted.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(woPreparationRecords)
          .set({ status: 'under_review', updatedAt: new Date() })
          .where(eq(woPreparationRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'wo_preparation.submitted_for_review', ${JSON.stringify({
            woPrepId: id, executionRecordId: record.execution_record_id,
            projectItemId: record.project_item_id, submittedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[WOPrep] Record ${id} submitted for review by user ${userId}`);
      res.json({ success: true, message: 'WO preparation submitted for review', id, newStatus: 'under_review' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/wo-preparations/:id/approve', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('wo_preparation_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid WO preparation ID');
      const userId = (req.user as any)?.id;
      const { reviewNotes } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM wo_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'WO preparation record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_review') {
        return sendBusinessError(res, `Cannot approve: record is in '${record.status}' status. Only 'under_review' records can be approved.`);
      }

      if (record.created_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the creator cannot also approve the same WO preparation record.');
      }

      await db.transaction(async (tx) => {
        await tx.update(woPreparationRecords)
          .set({
            status: 'ready_for_wo_creation', reviewedBy: userId, reviewedAt: new Date(),
            readyBy: userId, readyAt: new Date(),
            reviewNotes: reviewNotes || null, updatedAt: new Date(),
          })
          .where(eq(woPreparationRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'wo_preparation.ready_for_wo_creation', ${JSON.stringify({
            woPrepId: id, executionRecordId: record.execution_record_id,
            projectItemId: record.project_item_id, approvedBy: userId, reviewNotes,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[WOPrep] Record ${id} approved and ready for WO creation by user ${userId}`);
      res.json({ success: true, message: 'WO preparation approved — ready for WO creation', id, newStatus: 'ready_for_wo_creation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/wo-preparations/:id/revert-to-draft', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('wo_preparation_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid WO preparation ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM wo_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'WO preparation record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'under_review') {
        return sendBusinessError(res, `Cannot revert to draft: only 'under_review' records can be reverted. Current status: '${record.status}'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(woPreparationRecords)
          .set({ status: 'draft', reviewedBy: null, reviewedAt: null, reviewNotes: null, updatedAt: new Date() })
          .where(eq(woPreparationRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'wo_preparation.reverted_to_draft', ${JSON.stringify({
            woPrepId: id, projectItemId: record.project_item_id, revertedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[WOPrep] Record ${id} reverted to draft by user ${userId}`);
      res.json({ success: true, message: 'Reverted to draft', id, newStatus: 'draft' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/wo-preparations/:id/revert-to-review', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('wo_preparation_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid WO preparation ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM wo_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'WO preparation record not found');
      const record = existing.rows[0] as any;

      if (record.status !== 'ready_for_wo_creation') {
        return sendBusinessError(res, `Cannot revert to review: only 'ready_for_wo_creation' records can be reverted. Current status: '${record.status}'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(woPreparationRecords)
          .set({ status: 'under_review', readyBy: null, readyAt: null, updatedAt: new Date() })
          .where(eq(woPreparationRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'wo_preparation.reverted_to_review', ${JSON.stringify({
            woPrepId: id, projectItemId: record.project_item_id, revertedBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[WOPrep] Record ${id} reverted to under_review by user ${userId}`);
      res.json({ success: true, message: 'Reverted to under_review', id, newStatus: 'under_review' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/wo-preparations/:id/cancel', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('wo_preparation_records', id, res))) return;
      if (isNaN(id)) return sendValidationError(res, 'Invalid WO preparation ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM wo_preparation_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'WO preparation record not found');
      const record = existing.rows[0] as any;

      if (record.status === 'superseded' || record.status === 'canceled') {
        return sendBusinessError(res, `Cannot cancel: record is already '${record.status}'.`);
      }

      let cascadedEpcWoIds: number[] = [];

      await db.transaction(async (tx) => {
        await tx.update(woPreparationRecords)
          .set({
            status: 'canceled', cancelledBy: userId, cancelledAt: new Date(),
            cancelReason, updatedAt: new Date(),
          })
          .where(eq(woPreparationRecords.id, id));

        const epcWoCascade = await tx.execute(
          sql`UPDATE epc_work_orders 
              SET status = 'canceled', cancelled_by = ${userId}, cancelled_at = NOW(),
                  cancel_reason = ${'Upstream WO preparation canceled: ' + cancelReason}, updated_at = NOW()
              WHERE wo_preparation_id = ${id} AND status NOT IN ('canceled', 'superseded')
              RETURNING id, wo_number`
        );
        cascadedEpcWoIds = epcWoCascade.rows.map((r: any) => r.id);

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${record.project_id}, 'wo_preparation.canceled', ${JSON.stringify({
            woPrepId: id, executionRecordId: record.execution_record_id,
            projectItemId: record.project_item_id, cancelledBy: userId, cancelReason,
          })}::jsonb, 'lifecycle_action', NOW())`);

        for (const woRow of epcWoCascade.rows) {
          await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
            VALUES (${record.project_id}, 'epc_work_order.canceled_by_upstream', ${JSON.stringify({
              epcWoId: (woRow as any).id, woNumber: (woRow as any).wo_number,
              woPrepId: id, cancelledBy: userId, reason: 'Upstream WO preparation canceled',
            })}::jsonb, 'lifecycle_action', NOW())`);
        }
      });

      console.log(`[WOPrep] Record ${id} canceled by user ${userId}. Cascaded EPC WOs: ${cascadedEpcWoIds}`);
      res.json({ success: true, message: 'WO preparation record canceled', id, newStatus: 'canceled', cascadedEpcWoIds });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ─── EPC Purchase Order Routes ──────────────────────────────────────────

  app.get('/api/projects/:projectId/epc-purchase-orders', ensureAuthenticated, requirePageAccess('purchase-orders'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;
      const user = req.user as any;
      const visibilityScope = (req as any).visibilityScope || 'department_records';
      const poOwnershipConfig: OwnershipFilterConfig = { createdByColumn: 'created_by', mode: 'strict' };
      const { whereSql, joinSql } = buildOwnershipWhereClause(user, visibilityScope, poOwnershipConfig, 'epo');

      let query = sql`SELECT epo.*, u1.username as created_by_name, u2.username as approved_by_name,
                             u3.username as issued_by_name, u4.username as cancelled_by_name,
                             v.name as vendor_display_name,
                             mi.item_code as item_code, mi.description as item_description,
                             mi.uom as item_uom, mi.make_or_buy as item_make_or_buy,
                             mi.specification as item_specification, mi.drawing_no as item_drawing_no
                      FROM epc_purchase_orders epo
                      LEFT JOIN users u1 ON epo.created_by = u1.id
                      LEFT JOIN users u2 ON epo.approved_by = u2.id
                      LEFT JOIN users u3 ON epo.issued_by = u3.id
                      LEFT JOIN users u4 ON epo.cancelled_by = u4.id
                      LEFT JOIN vendors v ON epo.vendor_id = v.id
                      LEFT JOIN master_items mi ON epo.master_item_id = mi.id`;
      if (joinSql) query = sql`${query} ${joinSql}`;
      query = sql`${query} WHERE epo.project_id = ${projectId}`;
      if (whereSql) query = sql`${query} AND ${whereSql}`;

      if (statusFilter) query = sql`${query} AND epo.status = ${statusFilter}`;
      if (itemFilter) query = sql`${query} AND epo.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY epo.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/epc-purchase-orders/:id', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid EPC purchase order ID');

      const result = await db.execute(
        sql`SELECT epo.*, u1.username as created_by_name, u2.username as approved_by_name,
                   u3.username as issued_by_name, u4.username as cancelled_by_name,
                   v.name as vendor_display_name,
                   mi.item_code as item_code, mi.description as item_description,
                   mi.uom as item_uom, mi.make_or_buy as item_make_or_buy,
                   mi.specification as item_specification, mi.drawing_no as item_drawing_no
            FROM epc_purchase_orders epo
            LEFT JOIN users u1 ON epo.created_by = u1.id
            LEFT JOIN users u2 ON epo.approved_by = u2.id
            LEFT JOIN users u3 ON epo.issued_by = u3.id
            LEFT JOIN users u4 ON epo.cancelled_by = u4.id
            LEFT JOIN vendors v ON epo.vendor_id = v.id
            LEFT JOIN master_items mi ON epo.master_item_id = mi.id
            WHERE epo.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'EPC purchase order not found');

      const record = result.rows[0] as any;
      const user = req.user as any;
      const { visibilityScope } = await checkProjectMembership(user.id, user.role, record.project_id);
      if (!checkRecordOwnership(record, null, user, visibilityScope, 'strict')) {
        return denyRecordAccess(res, req);
      }

      const items = await db.execute(
        sql`SELECT * FROM epc_purchase_order_items WHERE epc_purchase_order_id = ${id} ORDER BY line_number`
      );

      res.json({ ...record, items: items.rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/po-preparations/:id/create-purchase-order', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const poPrepId = parseInt(req.params.id);
      if (isNaN(poPrepId)) return sendValidationError(res, 'Invalid PO preparation ID');
      const userId = (req.user as any)?.id;
      const { paymentTerms, deliveryTerms, poNotes } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM po_preparation_records WHERE id = ${poPrepId}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'PO preparation record not found');
      const prep = existing.rows[0] as any;

      // Phase 2 PLC hard-block
      if (prep.planning_record_id) {
        const plcChk = await pool.query(`SELECT 1 FROM procurement_list_lines WHERE planning_record_id = $1 AND status NOT IN ('cancelled','superseded') LIMIT 1`, [prep.planning_record_id]);
        if ((plcChk.rowCount ?? 0) > 0) return res.status(423).json({ error: 'deprecated_path', message: 'Use Procurement List Control to advance this procurement line.' });
      }

      if (!(await guardProjectNotFrozen(prep.project_id, res))) return;

      if (prep.status !== 'ready_for_po_creation') {
        return sendBusinessError(res, `Cannot create PO: PO preparation status is '${prep.status}', expected 'ready_for_po_creation'.`);
      }

      const planningStrictMode = await isFeatureFlagEnabled('EPC_PLANNING_GATING_STRICT');
      if (!prep.planning_record_id) {
        if (planningStrictMode) {
          await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, event_data, created_by, created_at)
            VALUES (${prep.project_id}, 'planning_gate_blocked', ${JSON.stringify({
              type: 'po', prepId: poPrepId, projectItemId: prep.project_item_id,
              reason: 'No planning record linked', mode: 'strict',
            })}::jsonb, ${userId}, NOW())`);
          return sendBusinessError(res, 'Cannot create PO: no planning record found for this item. A released planning record is required before PO creation.');
        }
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, event_data, created_by, created_at)
          VALUES (${prep.project_id}, 'planning_gate_bypass', ${JSON.stringify({
            type: 'po', prepId: poPrepId, projectItemId: prep.project_item_id,
            reason: 'No planning_record_id on preparation record', mode: 'transitional',
          })}::jsonb, ${userId}, NOW())`);
        console.log(`[Planning-Gate] PO prep ${poPrepId}: no planning_record_id — bypass logged (transitional mode)`);
      } else {
        const planResult = await db.execute(sql`SELECT id, status FROM item_planning_records WHERE id = ${prep.planning_record_id}`);
        if (planResult.rows.length === 0) {
          return sendBusinessError(res, 'Cannot create PO: linked planning record not found.');
        }
        const planRec = planResult.rows[0] as any;
        if (planRec.status !== 'released') {
          await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, event_data, created_by, created_at)
            VALUES (${prep.project_id}, 'planning_gate_blocked', ${JSON.stringify({
              type: 'po', prepId: poPrepId, planningRecordId: prep.planning_record_id,
              planningStatus: planRec.status, reason: 'Planning not released',
            })}::jsonb, ${userId}, NOW())`);
          return sendBusinessError(res, `Cannot create PO: planning record is in '${planRec.status}' status. Planning must be released first.`);
        }
      }

      const bomCheck = await db.execute(
        sql`SELECT bh.id, bh.bom_number, bh.status, bh.revision_code
            FROM epc_bom_headers bh
            WHERE bh.project_item_id = ${prep.project_item_id} AND bh.is_current = true
            ORDER BY bh.id DESC LIMIT 1`
      );
      let bomHeaderId: number | null = null;
      let bomLineId: number | null = null;
      let bomBypass = false;
      const strictMode = await isFeatureFlagEnabled('EPC_BOM_GATING_STRICT');
      if (bomCheck.rows.length > 0) {
        const bom = bomCheck.rows[0] as any;
        if (!['released', 'locked'].includes(bom.status)) {
          return sendBusinessError(res, `Cannot create PO: BOM ${bom.bom_number} (Rev ${bom.revision_code}) is '${bom.status}'. BOM must be Released or Locked before a Purchase Order can be created.`);
        }
        bomHeaderId = bom.id;
        const bomLineMatch = await db.execute(
          sql`SELECT id FROM epc_bom_lines WHERE bom_header_id = ${bom.id} AND component_item_id = ${prep.master_item_id} LIMIT 1`
        );
        if (bomLineMatch.rows.length > 0) bomLineId = (bomLineMatch.rows[0] as any).id;
      } else {
        if (strictMode) {
          const piResult = await db.execute(sql`SELECT pi.item_number, mi.item_code FROM project_items pi LEFT JOIN master_items mi ON mi.id = pi.master_item_id WHERE pi.id = ${prep.project_item_id}`);
          const piInfo = piResult.rows[0] as any;
          return sendBusinessError(res, `Cannot create PO: No BOM exists for project item ${piInfo?.item_number || prep.project_item_id} (${piInfo?.item_code || 'unknown'}). Create and Release a BOM for this project item before creating a Purchase Order. [Strict EPC mode is ON]`);
        }
        bomBypass = true;
      }

      const existingPO = await db.execute(
        sql`SELECT id, po_number, status FROM epc_purchase_orders 
            WHERE po_preparation_id = ${poPrepId} AND status NOT IN ('canceled', 'superseded')`
      );
      if (existingPO.rows.length > 0) {
        const ePO = existingPO.rows[0] as any;
        return sendBusinessError(res, `PO already exists for this preparation record: ${ePO.po_number} (ID ${ePO.id}, status: ${ePO.status}). Only one active PO per PO prep record is allowed.`);
      }

      let newPoId: number;
      let poNumber: string;

      await db.transaction(async (tx) => {
        poNumber = await epcCoding.generateDocumentNumber(prep.project_id, 'PO', tx);
        const [newPO] = await tx.insert(epcPurchaseOrders).values({
          poNumber,
          projectId: prep.project_id,
          projectItemId: prep.project_item_id,
          planningRecordId: prep.planning_record_id,
          executionRecordId: prep.execution_record_id,
          poPreparationId: poPrepId,
          qualityPlanId: prep.quality_plan_id || null,
          masterItemId: prep.master_item_id,
          vendorId: prep.preferred_vendor_id || null,
          vendorName: prep.preferred_vendor_name || null,
          totalAmount: prep.estimated_total_cost || null,
          currency: 'INR',
          paymentTerms: paymentTerms || null,
          deliveryTerms: deliveryTerms || null,
          poNotes: poNotes || null,
          status: 'draft',
          sourceBomHeaderId: bomHeaderId,
          sourceBomLineId: bomLineId,
          createdBy: userId,
        }).returning();
        newPoId = newPO.id;

        await tx.insert(epcPurchaseOrderItems).values({
          epcPurchaseOrderId: newPO.id,
          lineNumber: 1,
          masterItemId: prep.master_item_id,
          itemCode: prep.item_code || null,
          itemDescription: prep.item_description || null,
          itemSpecification: prep.item_specification || null,
          uom: prep.uom || null,
          drawingNo: prep.drawing_no || null,
          quantity: prep.quantity,
          unitCost: prep.estimated_unit_cost || null,
          totalCost: prep.estimated_total_cost || null,
          sourceBomLineId: bomLineId,
          procurementNotes: prep.procurement_notes || null,
        });

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${prep.project_id}, 'epc_purchase_order.created', ${JSON.stringify({
            epcPoId: newPO.id, poNumber, poPrepId, executionRecordId: prep.execution_record_id,
            planningRecordId: prep.planning_record_id, projectItemId: prep.project_item_id,
            vendorName: prep.preferred_vendor_name, totalAmount: prep.estimated_total_cost,
            createdBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);

        if (bomBypass) {
          await tx.insert(bomGatingBypassLog).values({
            documentType: 'PO',
            documentId: newPO.id,
            documentNumber: poNumber,
            projectId: prep.project_id,
            projectItemId: prep.project_item_id,
            reason: 'no_bom_exists',
            createdBy: userId,
          });
          console.log(`[BOM-GATE] BYPASS: PO ${poNumber} created without BOM for project item ${prep.project_item_id} (Transitional mode)`);
        }

        const poApproveResult = await resolveEpcAssignee('PO_approve', prep.project_id, String(userId));
        const poProjectCode = await resolveProjectCode(prep.project_id, tx);
        await createEpcTask({
          projectId: prep.project_id, entityType: 'purchase_order', recordId: newPO.id, actionCode: 'approve',
          title: `Approve EPC PO ${poNumber} for ${poProjectCode}`,
          description: `Purchase order ${poNumber} has been created and requires Manager approval. Vendor: ${prep.preferred_vendor_name || 'TBD'}. Amount: ${prep.estimated_total_cost || 'TBD'}.`,
          assignedTo: poApproveResult.userId, createdBy: userId, priority: 'High', dueDays: 2, tx,
        });
      });

      console.log(`[EPC-PO] Purchase order created from PO prep ${poPrepId} by user ${userId}`);
      res.json({ success: true, message: `Purchase order ${poNumber} created`, id: newPoId!, poNumber, poPrepId, status: 'draft' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/epc-purchase-orders/:id', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid EPC purchase order ID');

      const existing = await db.execute(sql`SELECT * FROM epc_purchase_orders WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'EPC purchase order not found');
      const po = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(po, req.user as any, 'strict', req, res))) return;

      if (['canceled', 'superseded', 'issued', ON_HOLD_STATUS].includes(po.status)) {
        return sendBusinessError(res, `Cannot edit: PO is in status '${po.status}'.`);
      }

      const { vendorId, vendorName, paymentTerms, deliveryTerms, poNotes, totalAmount } = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (vendorId !== undefined) updates.vendorId = vendorId || null;
      if (vendorName !== undefined) updates.vendorName = vendorName || null;
      if (paymentTerms !== undefined) updates.paymentTerms = paymentTerms || null;
      if (deliveryTerms !== undefined) updates.deliveryTerms = deliveryTerms || null;
      if (poNotes !== undefined) updates.poNotes = poNotes || null;
      if (totalAmount !== undefined) updates.totalAmount = totalAmount ? String(totalAmount) : null;

      await db.update(epcPurchaseOrders).set(updates).where(eq(epcPurchaseOrders.id, id));
      res.json({ success: true, message: 'EPC purchase order updated', id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-purchase-orders/:id/approve', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid EPC purchase order ID');
      const userId = (req.user as any)?.id;
      const { approvalNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM epc_purchase_orders WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'EPC purchase order not found');
      const po = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(po, req.user as any, 'strict', req, res))) return;

      if (po.status !== 'draft') {
        return sendBusinessError(res, `Cannot approve: PO status is '${po.status}', expected 'draft'.`);
      }

      if (po.created_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the creator cannot also approve the same purchase order.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcPurchaseOrders)
          .set({
            status: 'approved', approvedBy: userId, approvedAt: new Date(),
            approvalNote: approvalNote || null, updatedAt: new Date(),
          })
          .where(eq(epcPurchaseOrders.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${po.project_id}, 'epc_purchase_order.approved', ${JSON.stringify({
            epcPoId: id, poNumber: po.po_number, approvedBy: userId, approvalNote,
            projectItemId: po.project_item_id, poPrepId: po.po_preparation_id,
          })}::jsonb, 'lifecycle_action', NOW())`);

        const poIssueResult = await resolveEpcAssignee('PO_issue', po.project_id, String(userId));
        const poIssProjectCode = await resolveProjectCode(po.project_id, tx);
        await createEpcTask({
          projectId: po.project_id, entityType: 'purchase_order', recordId: id, actionCode: 'issue',
          title: `Issue EPC PO ${po.po_number} for ${poIssProjectCode}`,
          description: `Purchase order ${po.po_number} has been approved and is ready to be issued by a Senior Manager.`,
          assignedTo: poIssueResult.userId, createdBy: userId, priority: 'High', dueDays: 1, tx,
        });
      });

      console.log(`[EPC-PO] Purchase order ${po.po_number} approved by user ${userId}`);
      res.json({ success: true, message: `Purchase order ${po.po_number} approved`, id, newStatus: 'approved' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-purchase-orders/:id/issue', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Senior Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid EPC purchase order ID');
      const userId = (req.user as any)?.id;
      const { issueNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM epc_purchase_orders WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'EPC purchase order not found');
      const po = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(po, req.user as any, 'strict', req, res))) return;

      if (po.status !== 'approved') {
        return sendBusinessError(res, `Cannot issue: PO status is '${po.status}', expected 'approved'.`);
      }

      if (po.quality_status === 'inspection_failed') {
        return sendBusinessError(res, `Cannot issue: PO has failed quality inspection. Resolve the NCR before issuing.`);
      }

      if (po.quality_status === 'pending_inspection') {
        return sendBusinessError(res, `Cannot issue: PO is pending quality inspection clearance.`);
      }

      if (po.approved_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the approver cannot also issue the same purchase order. A different authorized user must issue it.');
      }

      if (po.created_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the creator cannot also issue the same purchase order.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcPurchaseOrders)
          .set({
            status: 'issued', issuedBy: userId, issuedAt: new Date(),
            issueNote: issueNote || null, updatedAt: new Date(),
          })
          .where(eq(epcPurchaseOrders.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${po.project_id}, 'epc_purchase_order.issued', ${JSON.stringify({
            epcPoId: id, poNumber: po.po_number, issuedBy: userId, issueNote,
            projectItemId: po.project_item_id, poPrepId: po.po_preparation_id,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[EPC-PO] Purchase order ${po.po_number} issued by user ${userId}`);

      let inspectionResult = null;
      if (po.project_item_id) {
        try {
          inspectionResult = await triggerInspectionOnPoIssuance(id, po.po_number, po.project_id, po.project_item_id, userId);
        } catch (insErr) {
          console.error(`[EPC-PO] Inspection trigger error for ${po.po_number}:`, insErr);
        }
      }

      res.json({
        success: true, message: `Purchase order ${po.po_number} issued`, id, newStatus: 'issued',
        ...(inspectionResult ? { inspection: inspectionResult } : {}),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-purchase-orders/:id/cancel', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid EPC purchase order ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM epc_purchase_orders WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'EPC purchase order not found');
      const po = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(po, req.user as any, 'strict', req, res))) return;

      if (['canceled', 'superseded', ON_HOLD_STATUS].includes(po.status)) {
        return sendBusinessError(res, `Cannot cancel: PO is '${po.status}'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcPurchaseOrders)
          .set({
            status: 'canceled', cancelledBy: userId, cancelledAt: new Date(),
            cancelReason, updatedAt: new Date(),
          })
          .where(eq(epcPurchaseOrders.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${po.project_id}, 'epc_purchase_order.canceled', ${JSON.stringify({
            epcPoId: id, poNumber: po.po_number, cancelledBy: userId, cancelReason,
            previousStatus: po.status, projectItemId: po.project_item_id,
          })}::jsonb, 'lifecycle_action', NOW())`);

        await markTasksObsolete('purchase_order', id, 'po_canceled', tx);
      });

      console.log(`[EPC-PO] Purchase order ${po.po_number} canceled by user ${userId}`);
      res.json({ success: true, message: `Purchase order ${po.po_number} canceled`, id, newStatus: 'canceled' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-purchase-orders/:id/revert-to-draft', ensureAuthenticated, requirePageAccess('purchase-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid EPC purchase order ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM epc_purchase_orders WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'EPC purchase order not found');
      const po = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(po, req.user as any, 'strict', req, res))) return;

      if (po.status !== 'approved') {
        return sendBusinessError(res, `Cannot revert to draft: only 'approved' POs can be reverted. Current status: '${po.status}'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcPurchaseOrders)
          .set({
            status: 'draft', approvedBy: null, approvedAt: null,
            approvalNote: null, updatedAt: new Date(),
          })
          .where(eq(epcPurchaseOrders.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${po.project_id}, 'epc_purchase_order.reverted_to_draft', ${JSON.stringify({
            epcPoId: id, poNumber: po.po_number, revertedBy: userId,
            projectItemId: po.project_item_id,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[EPC-PO] Purchase order ${po.po_number} reverted to draft by user ${userId}`);
      res.json({ success: true, message: `Purchase order ${po.po_number} reverted to draft`, id, newStatus: 'draft' });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ─── EPC Work Order Routes ──────────────────────────────────────────────

  app.get('/api/projects/:projectId/epc-work-orders', ensureAuthenticated, requirePageAccess('work-orders'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid project ID');

      const statusFilter = req.query.status as string | undefined;
      const itemFilter = req.query.projectItemId ? parseInt(req.query.projectItemId as string) : undefined;
      const user = req.user as any;
      const visibilityScope = (req as any).visibilityScope || 'department_records';
      const woOwnershipConfig: OwnershipFilterConfig = { createdByColumn: 'created_by', mode: 'strict' };
      const { whereSql, joinSql } = buildOwnershipWhereClause(user, visibilityScope, woOwnershipConfig, 'ewo');

      let query = sql`SELECT ewo.*, u1.username as created_by_name, u2.username as approved_by_name,
                             u3.username as released_by_name
                      FROM epc_work_orders ewo
                      LEFT JOIN users u1 ON ewo.created_by = u1.id
                      LEFT JOIN users u2 ON ewo.approved_by = u2.id
                      LEFT JOIN users u3 ON ewo.released_by = u3.id`;
      if (joinSql) query = sql`${query} ${joinSql}`;
      query = sql`${query} WHERE ewo.project_id = ${projectId}`;
      if (whereSql) query = sql`${query} AND ${whereSql}`;

      if (statusFilter) query = sql`${query} AND ewo.status = ${statusFilter}`;
      if (itemFilter) query = sql`${query} AND ewo.project_item_id = ${itemFilter}`;
      query = sql`${query} ORDER BY ewo.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/epc-work-orders/:id', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid EPC work order ID');

      const result = await db.execute(
        sql`SELECT ewo.*, u1.username as created_by_name, u2.username as approved_by_name,
                   u3.username as released_by_name
            FROM epc_work_orders ewo
            LEFT JOIN users u1 ON ewo.created_by = u1.id
            LEFT JOIN users u2 ON ewo.approved_by = u2.id
            LEFT JOIN users u3 ON ewo.released_by = u3.id
            WHERE ewo.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'EPC work order not found');

      const record = result.rows[0] as any;
      const user = req.user as any;
      const { visibilityScope } = await checkProjectMembership(user.id, user.role, record.project_id);
      if (!checkRecordOwnership(record, null, user, visibilityScope, 'strict')) {
        return denyRecordAccess(res, req);
      }

      const items = await db.execute(
        sql`SELECT * FROM epc_work_order_items WHERE epc_work_order_id = ${id} ORDER BY line_number`
      );

      res.json({ ...record, items: items.rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/wo-preparations/:id/create-work-order', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const woPrepId = parseInt(req.params.id);
      if (isNaN(woPrepId)) return sendValidationError(res, 'Invalid WO preparation ID');
      const userId = (req.user as any)?.id;
      const { woNotes } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM wo_preparation_records WHERE id = ${woPrepId}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'WO preparation record not found');
      const prep = existing.rows[0] as any;

      if (!(await guardProjectNotFrozen(prep.project_id, res))) return;

      if (prep.status !== 'ready_for_wo_creation') {
        return sendBusinessError(res, `Cannot create WO: WO preparation status is '${prep.status}', expected 'ready_for_wo_creation'.`);
      }

      const woPlanningStrictMode = await isFeatureFlagEnabled('EPC_PLANNING_GATING_STRICT');
      if (!prep.planning_record_id) {
        if (woPlanningStrictMode) {
          await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, event_data, created_by, created_at)
            VALUES (${prep.project_id}, 'planning_gate_blocked', ${JSON.stringify({
              type: 'wo', prepId: woPrepId, projectItemId: prep.project_item_id,
              reason: 'No planning record linked', mode: 'strict',
            })}::jsonb, ${userId}, NOW())`);
          return sendBusinessError(res, 'Cannot create WO: no planning record found for this item. A released planning record is required before WO creation.');
        }
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, event_data, created_by, created_at)
          VALUES (${prep.project_id}, 'planning_gate_bypass', ${JSON.stringify({
            type: 'wo', prepId: woPrepId, projectItemId: prep.project_item_id,
            reason: 'No planning_record_id on preparation record', mode: 'transitional',
          })}::jsonb, ${userId}, NOW())`);
        console.log(`[Planning-Gate] WO prep ${woPrepId}: no planning_record_id — bypass logged (transitional mode)`);
      } else {
        const woPlanResult = await db.execute(sql`SELECT id, status FROM item_planning_records WHERE id = ${prep.planning_record_id}`);
        if (woPlanResult.rows.length === 0) {
          return sendBusinessError(res, 'Cannot create WO: linked planning record not found.');
        }
        const woPlanRec = woPlanResult.rows[0] as any;
        if (woPlanRec.status !== 'released') {
          await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_type, event_data, created_by, created_at)
            VALUES (${prep.project_id}, 'planning_gate_blocked', ${JSON.stringify({
              type: 'wo', prepId: woPrepId, planningRecordId: prep.planning_record_id,
              planningStatus: woPlanRec.status, reason: 'Planning not released',
            })}::jsonb, ${userId}, NOW())`);
          return sendBusinessError(res, `Cannot create WO: planning record is in '${woPlanRec.status}' status. Planning must be released first.`);
        }
      }

      const bomCheck = await db.execute(
        sql`SELECT bh.id, bh.bom_number, bh.status, bh.revision_code
            FROM epc_bom_headers bh
            WHERE bh.project_item_id = ${prep.project_item_id} AND bh.is_current = true
            ORDER BY bh.id DESC LIMIT 1`
      );
      let bomHeaderId: number | null = null;
      let bomLineId: number | null = null;
      let bomBypass = false;
      const strictMode = await isFeatureFlagEnabled('EPC_BOM_GATING_STRICT');
      if (bomCheck.rows.length > 0) {
        const bom = bomCheck.rows[0] as any;
        if (!['released', 'locked'].includes(bom.status)) {
          return sendBusinessError(res, `Cannot create WO: BOM ${bom.bom_number} (Rev ${bom.revision_code}) is '${bom.status}'. BOM must be Released or Locked before a Work Order can be created.`);
        }
        bomHeaderId = bom.id;
        const bomLineMatch = await db.execute(
          sql`SELECT id FROM epc_bom_lines WHERE bom_header_id = ${bom.id} AND component_item_id = ${prep.master_item_id} LIMIT 1`
        );
        if (bomLineMatch.rows.length > 0) bomLineId = (bomLineMatch.rows[0] as any).id;
      } else {
        if (strictMode) {
          const piResult = await db.execute(sql`SELECT pi.item_number, mi.item_code FROM project_items pi LEFT JOIN master_items mi ON mi.id = pi.master_item_id WHERE pi.id = ${prep.project_item_id}`);
          const piInfo = piResult.rows[0] as any;
          return sendBusinessError(res, `Cannot create WO: No BOM exists for project item ${piInfo?.item_number || prep.project_item_id} (${piInfo?.item_code || 'unknown'}). Create and Release a BOM for this project item before creating a Work Order. [Strict EPC mode is ON]`);
        }
        bomBypass = true;
      }

      const existingWO = await db.execute(
        sql`SELECT id, wo_number, status FROM epc_work_orders 
            WHERE wo_preparation_id = ${woPrepId} AND status NOT IN ('canceled', 'superseded')`
      );
      if (existingWO.rows.length > 0) {
        const eWO = existingWO.rows[0] as any;
        return sendBusinessError(res, `WO already exists for this preparation record: ${eWO.wo_number} (ID ${eWO.id}, status: ${eWO.status}). Only one active WO per WO prep record is allowed.`);
      }

      let newWoId: number;
      let woNumber: string;

      await db.transaction(async (tx) => {
        woNumber = await epcCoding.generateDocumentNumber(prep.project_id, 'WO', tx);
        const [newWO] = await tx.insert(epcWorkOrders).values({
          woNumber,
          projectId: prep.project_id,
          projectItemId: prep.project_item_id,
          planningRecordId: prep.planning_record_id,
          executionRecordId: prep.execution_record_id,
          woPreparationId: woPrepId,
          qualityPlanId: prep.quality_plan_id || null,
          masterItemId: prep.master_item_id,
          itemCode: prep.item_code || null,
          itemDescription: prep.item_description || null,
          itemSpecification: prep.item_specification || null,
          uom: prep.uom || null,
          drawingNo: prep.drawing_no || null,
          drawingRevision: prep.drawing_revision || null,
          quantity: prep.quantity,
          estimatedUnitCost: prep.estimated_unit_cost || null,
          estimatedTotalCost: prep.estimated_total_cost || null,
          makeClassification: prep.make_classification || null,
          manufacturingNotes: prep.manufacturing_notes || null,
          woNotes: woNotes || null,
          status: 'draft',
          sourceBomHeaderId: bomHeaderId,
          sourceBomLineId: bomLineId,
          createdBy: userId,
        }).returning();
        newWoId = newWO.id;

        await tx.insert(epcWorkOrderItems).values({
          epcWorkOrderId: newWO.id,
          lineNumber: 1,
          masterItemId: prep.master_item_id,
          itemCode: prep.item_code || null,
          itemDescription: prep.item_description || null,
          itemSpecification: prep.item_specification || null,
          uom: prep.uom || null,
          drawingNo: prep.drawing_no || null,
          drawingRevision: prep.drawing_revision || null,
          quantity: prep.quantity,
          unitCost: prep.estimated_unit_cost || null,
          totalCost: prep.estimated_total_cost || null,
          sourceBomLineId: bomLineId,
          manufacturingNotes: prep.manufacturing_notes || null,
        });

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${prep.project_id}, 'epc_work_order.created', ${JSON.stringify({
            epcWoId: newWO.id, woNumber, woPrepId, executionRecordId: prep.execution_record_id,
            planningRecordId: prep.planning_record_id, projectItemId: prep.project_item_id,
            makeClassification: prep.make_classification, estimatedTotalCost: prep.estimated_total_cost,
            createdBy: userId,
          })}::jsonb, 'lifecycle_action', NOW())`);

        if (bomBypass) {
          await tx.insert(bomGatingBypassLog).values({
            documentType: 'WO',
            documentId: newWO.id,
            documentNumber: woNumber,
            projectId: prep.project_id,
            projectItemId: prep.project_item_id,
            reason: 'no_bom_exists',
            createdBy: userId,
          });
          console.log(`[BOM-GATE] BYPASS: WO ${woNumber} created without BOM for project item ${prep.project_item_id} (Transitional mode)`);
        }

        const woApproveResult = await resolveEpcAssignee('WO_approve', prep.project_id, String(userId));
        const woProjectCode = await resolveProjectCode(prep.project_id, tx);
        await createEpcTask({
          projectId: prep.project_id, entityType: 'work_order', recordId: newWO.id, actionCode: 'approve',
          title: `Approve EPC WO ${woNumber} for ${woProjectCode}`,
          description: `Work order ${woNumber} has been created and requires Manager approval. Classification: ${prep.make_classification || 'N/A'}.`,
          assignedTo: woApproveResult.userId, createdBy: userId, priority: 'High', dueDays: 2, tx,
        });
      });

      console.log(`[EPC-WO] Work order created from WO prep ${woPrepId} by user ${userId}`);
      res.json({ success: true, message: `Work order ${woNumber} created`, id: newWoId!, woNumber, woPrepId, status: 'draft' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/epc-work-orders/:id', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid EPC work order ID');

      const existing = await db.execute(sql`SELECT * FROM epc_work_orders WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'EPC work order not found');
      const wo = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(wo, req.user as any, 'strict', req, res))) return;

      if (['canceled', 'superseded', 'released', ON_HOLD_STATUS].includes(wo.status)) {
        return sendBusinessError(res, `Cannot edit: WO is in status '${wo.status}'.`);
      }

      const { manufacturingNotes, woNotes, estimatedUnitCost, estimatedTotalCost, drawingNo, drawingRevision } = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (manufacturingNotes !== undefined) updates.manufacturingNotes = manufacturingNotes || null;
      if (woNotes !== undefined) updates.woNotes = woNotes || null;
      if (estimatedUnitCost !== undefined) updates.estimatedUnitCost = estimatedUnitCost ? String(estimatedUnitCost) : null;
      if (estimatedTotalCost !== undefined) updates.estimatedTotalCost = estimatedTotalCost ? String(estimatedTotalCost) : null;
      if (drawingNo !== undefined) updates.drawingNo = drawingNo || null;
      if (drawingRevision !== undefined) updates.drawingRevision = drawingRevision || null;

      await db.update(epcWorkOrders).set(updates).where(eq(epcWorkOrders.id, id));
      res.json({ success: true, message: 'EPC work order updated', id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-work-orders/:id/approve', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid EPC work order ID');
      const userId = (req.user as any)?.id;
      const { approvalNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM epc_work_orders WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'EPC work order not found');
      const wo = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(wo, req.user as any, 'strict', req, res))) return;

      if (wo.status !== 'draft') {
        return sendBusinessError(res, `Cannot approve: WO status is '${wo.status}', expected 'draft'.`);
      }

      const isSystemGenerated = wo.wo_preparation_id != null;
      if (wo.created_by === userId && !isSystemGenerated) {
        return sendBusinessError(res, 'Self-action prevented: the creator cannot also approve a manually created work order.');
      }

      await db.update(epcWorkOrders)
        .set({
          status: 'approved', approvedBy: userId, approvedAt: new Date(),
          approvalNote: approvalNote || null, updatedAt: new Date(),
        })
        .where(eq(epcWorkOrders.id, id));

      try {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${wo.project_id}, 'epc_work_order.approved', ${JSON.stringify({
            epcWoId: id, woNumber: wo.wo_number, approvedBy: userId, approvalNote,
            projectItemId: wo.project_item_id, woPrepId: wo.wo_preparation_id,
          })}::jsonb, 'lifecycle_action', NOW())`);
      } catch (evtErr) {
        console.error(`[EPC-WO] Non-critical: failed to insert workflow event for ${wo.wo_number}`, evtErr);
      }

      try {
        const woReleaseResult = await resolveEpcAssignee('WO_release', wo.project_id, String(userId));
        const woRelProjectCode = await resolveProjectCode(wo.project_id);
        await createEpcTask({
          projectId: wo.project_id, entityType: 'work_order', recordId: id, actionCode: 'release',
          title: `Release EPC WO ${wo.wo_number} for ${woRelProjectCode}`,
          description: `Work order ${wo.wo_number} has been approved and is ready to be released by a Senior Manager.`,
          assignedTo: woReleaseResult.userId, createdBy: userId, priority: 'High', dueDays: 1,
        });
      } catch (taskErr) {
        console.error(`[EPC-WO] Non-critical: failed to create release task for ${wo.wo_number}`, taskErr);
      }

      console.log(`[EPC-WO] Work order ${wo.wo_number} approved by user ${userId}`);
      res.json({ success: true, message: `Work order ${wo.wo_number} approved`, id, newStatus: 'approved' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-work-orders/:id/release', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Senior Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid EPC work order ID');
      const userId = (req.user as any)?.id;
      const { releaseNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM epc_work_orders WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'EPC work order not found');
      const wo = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(wo, req.user as any, 'strict', req, res))) return;

      if (wo.status !== 'approved') {
        return sendBusinessError(res, `Cannot release: WO status is '${wo.status}', expected 'approved'.`);
      }

      if (wo.quality_status === 'inspection_failed') {
        return sendBusinessError(res, `Cannot release: WO has failed quality inspection. Resolve the NCR before releasing.`);
      }


      const isSystemGenerated = wo.wo_notes && wo.wo_notes.startsWith('Auto-created from Execution Draft');

      if (wo.approved_by === userId && !isSystemGenerated) {
        return sendBusinessError(res, 'Self-action prevented: the approver cannot also release the same work order. A different authorized user must release it.');
      }

      if (wo.created_by === userId && !isSystemGenerated) {
        return sendBusinessError(res, 'Self-action prevented: the creator cannot also release the same work order.');
      }

      await db.update(epcWorkOrders)
        .set({
          status: 'released', releasedBy: userId, releasedAt: new Date(),
          releaseNote: releaseNote || null, updatedAt: new Date(),
        })
        .where(eq(epcWorkOrders.id, id));

      try {
        await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${wo.project_id}, 'epc_work_order.released', ${JSON.stringify({
            epcWoId: id, woNumber: wo.wo_number, releasedBy: userId, releaseNote,
            projectItemId: wo.project_item_id, woPrepId: wo.wo_preparation_id,
          })}::jsonb, 'lifecycle_action', NOW())`);
      } catch (evtErr) {
        console.error(`[EPC-WO] Non-critical: failed to insert workflow event for ${wo.wo_number}`, evtErr);
      }

      console.log(`[EPC-WO] Work order ${wo.wo_number} released by user ${userId}`);

      let inspectionResult = null;
      if (wo.project_item_id) {
        try {
          inspectionResult = await triggerInspectionOnWoRelease(id, wo.wo_number, wo.project_id, wo.project_item_id, userId);
        } catch (insErr) {
          console.error(`[EPC-WO] Inspection trigger error for ${wo.wo_number}:`, insErr);
        }
      }

      res.json({
        success: true, message: `Work order ${wo.wo_number} released`, id, newStatus: 'released',
        ...(inspectionResult ? { inspection: inspectionResult } : {}),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-work-orders/:id/cancel', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid EPC work order ID');
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'Cancel reason is required');

      const existing = await db.execute(sql`SELECT * FROM epc_work_orders WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'EPC work order not found');
      const wo = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(wo, req.user as any, 'strict', req, res))) return;

      if (['canceled', 'superseded', ON_HOLD_STATUS].includes(wo.status)) {
        return sendBusinessError(res, `Cannot cancel: WO is '${wo.status}'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcWorkOrders)
          .set({
            status: 'canceled', cancelledBy: userId, cancelledAt: new Date(),
            cancelReason, updatedAt: new Date(),
          })
          .where(eq(epcWorkOrders.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${wo.project_id}, 'epc_work_order.canceled', ${JSON.stringify({
            epcWoId: id, woNumber: wo.wo_number, cancelledBy: userId, cancelReason,
            previousStatus: wo.status, projectItemId: wo.project_item_id,
          })}::jsonb, 'lifecycle_action', NOW())`);

        await markTasksObsolete('work_order', id, 'wo_canceled', tx);
      });

      console.log(`[EPC-WO] Work order ${wo.wo_number} canceled by user ${userId}`);
      res.json({ success: true, message: `Work order ${wo.wo_number} canceled`, id, newStatus: 'canceled' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-work-orders/:id/revert-to-draft', ensureAuthenticated, requirePageAccess('work-orders'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid EPC work order ID');
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM epc_work_orders WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'EPC work order not found');
      const wo = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(wo, req.user as any, 'strict', req, res))) return;

      if (wo.status !== 'approved') {
        return sendBusinessError(res, `Cannot revert to draft: only 'approved' WOs can be reverted. Current status: '${wo.status}'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcWorkOrders)
          .set({
            status: 'draft', approvedBy: null, approvedAt: null,
            approvalNote: null, updatedAt: new Date(),
          })
          .where(eq(epcWorkOrders.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${wo.project_id}, 'epc_work_order.reverted_to_draft', ${JSON.stringify({
            epcWoId: id, woNumber: wo.wo_number, revertedBy: userId,
            projectItemId: wo.project_item_id,
          })}::jsonb, 'lifecycle_action', NOW())`);
      });

      console.log(`[EPC-WO] Work order ${wo.wo_number} reverted to draft by user ${userId}`);
      res.json({ success: true, message: `Work order ${wo.wo_number} reverted to draft`, id, newStatus: 'draft' });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== EPC DISPATCH READINESS BRIDGE ====================

  app.get('/api/projects/:projectId/dispatch-readiness', ensureAuthenticated, requirePageAccess('dispatch-logistics'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const user = req.user as any;
      const visibilityScope = (req as any).visibilityScope || 'department_records';
      const drOwnershipConfig: OwnershipFilterConfig = { createdByColumn: 'created_by', mode: 'department' };
      const { whereSql, joinSql } = buildOwnershipWhereClause(user, visibilityScope, drOwnershipConfig, 'dr');

      let query = sql`SELECT dr.*, 
              u1.username AS created_by_name, u2.username AS prepared_by_name, 
              u3.username AS ready_marked_by_name, u4.username AS dispatched_by_name,
              u5.username AS cancelled_by_name,
              pi.description AS project_item_description,
              po.po_number, wo.wo_number
            FROM epc_dispatch_readiness dr
            LEFT JOIN users u1 ON dr.created_by = u1.id
            LEFT JOIN users u2 ON dr.prepared_by = u2.id
            LEFT JOIN users u3 ON dr.ready_marked_by = u3.id
            LEFT JOIN users u4 ON dr.dispatched_by = u4.id
            LEFT JOIN users u5 ON dr.cancelled_by = u5.id
            LEFT JOIN project_items pi ON dr.project_item_id = pi.id
            LEFT JOIN epc_purchase_orders po ON dr.epc_purchase_order_id = po.id
            LEFT JOIN epc_work_orders wo ON dr.epc_work_order_id = wo.id`;
      if (joinSql) query = sql`${query} ${joinSql}`;
      query = sql`${query} WHERE dr.project_id = ${projectId}`;
      if (whereSql) query = sql`${query} AND ${whereSql}`;
      query = sql`${query} ORDER BY dr.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/dispatch-readiness/:id', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const result = await db.execute(
        sql`SELECT dr.*, 
              u1.username AS created_by_name, u2.username AS prepared_by_name, 
              u3.username AS ready_marked_by_name, u4.username AS dispatched_by_name,
              u5.username AS cancelled_by_name,
              pi.description AS project_item_description,
              po.po_number, wo.wo_number
            FROM epc_dispatch_readiness dr
            LEFT JOIN users u1 ON dr.created_by = u1.id
            LEFT JOIN users u2 ON dr.prepared_by = u2.id
            LEFT JOIN users u3 ON dr.ready_marked_by = u3.id
            LEFT JOIN users u4 ON dr.dispatched_by = u4.id
            LEFT JOIN users u5 ON dr.cancelled_by = u5.id
            LEFT JOIN project_items pi ON dr.project_item_id = pi.id
            LEFT JOIN epc_purchase_orders po ON dr.epc_purchase_order_id = po.id
            LEFT JOIN epc_work_orders wo ON dr.epc_work_order_id = wo.id
            WHERE dr.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Dispatch readiness record not found');

      const record = result.rows[0] as any;
      const user = req.user as any;
      const { visibilityScope } = await checkProjectMembership(user.id, user.role, record.project_id);
      const creatorDept = await lookupCreatorDepartment(record.created_by);
      if (!checkRecordOwnership(record, creatorDept, user, visibilityScope, 'department')) {
        return denyRecordAccess(res, req);
      }

      res.json(record);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/dispatch-readiness', ensureAuthenticated, requirePageAccess('dispatch-logistics'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const projectId = parseInt(req.params.projectId);
      if (!(await guardProjectNotFrozen(projectId, res))) return;
      const userId = (req.user as any)?.id;
      const {
        projectItemId, epcPurchaseOrderId, epcWorkOrderId, inspectionExecutionId,
        qualityPlanId, masterItemId, quantity, dispatchQuantity,
        packagingType, packagingNotes, shippingMethod, shippingNotes,
        dispatchNotes, specialHandling, destinationAddress, estimatedDispatchDate,
      } = req.body;

      if (!projectItemId || !masterItemId || !quantity) {
        return sendValidationError(res, 'projectItemId, masterItemId, and quantity are required.');
      }

      if (!epcPurchaseOrderId && !epcWorkOrderId) {
        return sendValidationError(res, 'At least one of epcPurchaseOrderId or epcWorkOrderId is required.');
      }

      let sourceType = 'purchase_order';
      let qualityClearanceDate: Date | null = null;
      let qualityClearanceReference = '';

      if (epcPurchaseOrderId) {
        const poResult = await db.execute(sql`SELECT * FROM epc_purchase_orders WHERE id = ${epcPurchaseOrderId} AND project_id = ${projectId}`);
        if (poResult.rows.length === 0) return sendNotFound(res, 'Linked EPC purchase order not found in this project');
        const po = poResult.rows[0] as any;
        if (po.quality_status !== 'inspection_cleared') {
          return sendBusinessError(res, `Cannot create dispatch readiness: PO ${po.po_number} quality status is '${po.quality_status}'. Must be inspection_cleared.`);
        }
        if (po.status === 'canceled' || po.status === 'superseded') {
          return sendBusinessError(res, `Cannot create dispatch readiness: PO ${po.po_number} is ${po.status}.`);
        }
        sourceType = 'purchase_order';
        qualityClearanceDate = po.quality_cleared_at;
        qualityClearanceReference = `PO ${po.po_number} cleared inspection #${po.quality_cleared_inspection_id}`;
      }

      if (epcWorkOrderId) {
        const woResult = await db.execute(sql`SELECT * FROM epc_work_orders WHERE id = ${epcWorkOrderId} AND project_id = ${projectId}`);
        if (woResult.rows.length === 0) return sendNotFound(res, 'Linked EPC work order not found in this project');
        const wo = woResult.rows[0] as any;
        if (wo.quality_status !== 'inspection_cleared') {
          return sendBusinessError(res, `Cannot create dispatch readiness: WO ${wo.wo_number} quality status is '${wo.quality_status}'. Must be inspection_cleared.`);
        }
        if (wo.status === 'canceled' || wo.status === 'superseded') {
          return sendBusinessError(res, `Cannot create dispatch readiness: WO ${wo.wo_number} is ${wo.status}.`);
        }
        sourceType = epcPurchaseOrderId ? 'both' : 'work_order';
        if (!qualityClearanceDate) {
          qualityClearanceDate = wo.quality_cleared_at;
          qualityClearanceReference = `WO ${wo.wo_number} cleared inspection #${wo.quality_cleared_inspection_id}`;
        } else {
          qualityClearanceReference += ` + WO ${wo.wo_number} cleared inspection #${wo.quality_cleared_inspection_id}`;
        }
      }

      const existingCheck = await db.execute(
        sql`SELECT id, dr_number FROM epc_dispatch_readiness 
            WHERE project_item_id = ${projectItemId} 
              AND project_id = ${projectId}
              AND COALESCE(epc_purchase_order_id, 0) = COALESCE(${epcPurchaseOrderId || null}::int, 0)
              AND COALESCE(epc_work_order_id, 0) = COALESCE(${epcWorkOrderId || null}::int, 0)
              AND status NOT IN ('canceled', 'superseded', 'dispatched')`
      );
      if (existingCheck.rows.length > 0) {
        const existing = existingCheck.rows[0] as any;
        return sendBusinessError(res, `Active dispatch readiness ${existing.dr_number} already exists for this item context (id: ${existing.id}). Cancel or complete the existing record first.`);
      }

      const miResult = await db.execute(sql`SELECT item_code, description, uom FROM master_items WHERE id = ${masterItemId}`);
      const mi = miResult.rows[0] as any;

      await db.transaction(async (tx) => {
        const drNumber = await epcCoding.generateDocumentNumber(projectId, 'DR', tx);
        const inserted = await tx.insert(epcDispatchReadiness).values({
          drNumber,
          projectId,
          projectItemId,
          epcPurchaseOrderId: epcPurchaseOrderId || null,
          epcWorkOrderId: epcWorkOrderId || null,
          inspectionExecutionId: inspectionExecutionId || null,
          qualityPlanId: qualityPlanId || null,
          masterItemId,
          itemCode: mi?.item_code || null,
          itemDescription: mi?.description || null,
          uom: mi?.uom || null,
          quantity,
          dispatchQuantity: dispatchQuantity || quantity,
          packagingType: packagingType || null,
          packagingNotes: packagingNotes || null,
          shippingMethod: shippingMethod || null,
          shippingNotes: shippingNotes || null,
          dispatchNotes: dispatchNotes || null,
          specialHandling: specialHandling || null,
          destinationAddress: destinationAddress || null,
          estimatedDispatchDate: estimatedDispatchDate ? new Date(estimatedDispatchDate) : null,
          qualityClearanceDate: qualityClearanceDate,
          qualityClearanceReference: qualityClearanceReference || null,
          sourceType,
          status: 'draft',
          createdBy: userId,
        }).returning();

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${projectId}, 'dispatch_readiness.created', ${JSON.stringify({
            drId: inserted[0].id, drNumber, projectItemId, masterItemId,
            epcPurchaseOrderId, epcWorkOrderId, sourceType, quantity,
            createdBy: userId,
          })}::jsonb, 'dispatch_readiness', NOW())`);

        console.log(`[DR] Dispatch readiness ${drNumber} created for project ${projectId}, item ${projectItemId} by user ${userId}`);
        res.status(201).json({ success: true, message: `Dispatch readiness ${drNumber} created`, record: inserted[0] });
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/dispatch-readiness/:id/start-preparation', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_dispatch_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { preparationNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM epc_dispatch_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Dispatch readiness record not found');
      const dr = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(dr, req.user as any, 'department', req, res))) return;

      if (dr.status !== 'draft') {
        return sendBusinessError(res, `Cannot start preparation: status is '${dr.status}', expected 'draft'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDispatchReadiness)
          .set({ status: 'under_preparation', preparedBy: userId, preparedAt: new Date(), preparationNote: preparationNote || null, updatedAt: new Date() })
          .where(eq(epcDispatchReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${dr.project_id}, 'dispatch_readiness.preparation_started', ${JSON.stringify({
            drId: id, drNumber: dr.dr_number, preparedBy: userId, projectItemId: dr.project_item_id,
          })}::jsonb, 'dispatch_readiness', NOW())`);
      });

      console.log(`[DR] ${dr.dr_number} moved to under_preparation by user ${userId}`);
      res.json({ success: true, message: `${dr.dr_number} preparation started`, id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/dispatch-readiness/:id/mark-ready', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_dispatch_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { readyNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM epc_dispatch_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Dispatch readiness record not found');
      const dr = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(dr, req.user as any, 'department', req, res))) return;

      if (dr.status !== 'under_preparation') {
        return sendBusinessError(res, `Cannot mark ready: status is '${dr.status}', expected 'under_preparation'.`);
      }

      if (dr.epc_purchase_order_id) {
        const poCheck = await db.execute(sql`SELECT quality_status FROM epc_purchase_orders WHERE id = ${dr.epc_purchase_order_id}`);
        if (poCheck.rows.length > 0 && (poCheck.rows[0] as any).quality_status !== 'inspection_cleared') {
          return sendBusinessError(res, `Cannot mark ready: linked PO quality status reverted to '${(poCheck.rows[0] as any).quality_status}'.`);
        }
      }
      if (dr.epc_work_order_id) {
        const woCheck = await db.execute(sql`SELECT quality_status FROM epc_work_orders WHERE id = ${dr.epc_work_order_id}`);
        if (woCheck.rows.length > 0 && (woCheck.rows[0] as any).quality_status !== 'inspection_cleared') {
          return sendBusinessError(res, `Cannot mark ready: linked WO quality status reverted to '${(woCheck.rows[0] as any).quality_status}'.`);
        }
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDispatchReadiness)
          .set({ status: 'ready_for_dispatch', readyMarkedBy: userId, readyMarkedAt: new Date(), readyNote: readyNote || null, updatedAt: new Date() })
          .where(eq(epcDispatchReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${dr.project_id}, 'dispatch_readiness.marked_ready', ${JSON.stringify({
            drId: id, drNumber: dr.dr_number, readyMarkedBy: userId, projectItemId: dr.project_item_id,
          })}::jsonb, 'dispatch_readiness', NOW())`);
      });

      console.log(`[DR] ${dr.dr_number} marked ready_for_dispatch by user ${userId}`);
      res.json({ success: true, message: `${dr.dr_number} is ready for dispatch`, id, newStatus: 'ready_for_dispatch' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/dispatch-readiness/:id/dispatch', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_dispatch_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { dispatchReference } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM epc_dispatch_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Dispatch readiness record not found');
      const dr = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(dr, req.user as any, 'department', req, res))) return;

      if (dr.status !== 'ready_for_dispatch') {
        return sendBusinessError(res, `Cannot dispatch: status is '${dr.status}', expected 'ready_for_dispatch'.`);
      }

      if (dr.created_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the creator cannot also mark as dispatched.');
      }

      if (dr.epc_purchase_order_id) {
        const poCheck = await db.execute(sql`SELECT quality_status FROM epc_purchase_orders WHERE id = ${dr.epc_purchase_order_id}`);
        if (poCheck.rows.length > 0 && (poCheck.rows[0] as any).quality_status !== 'inspection_cleared') {
          return sendBusinessError(res, `Cannot dispatch: linked PO quality status is '${(poCheck.rows[0] as any).quality_status}'.`);
        }
      }
      if (dr.epc_work_order_id) {
        const woCheck = await db.execute(sql`SELECT quality_status FROM epc_work_orders WHERE id = ${dr.epc_work_order_id}`);
        if (woCheck.rows.length > 0 && (woCheck.rows[0] as any).quality_status !== 'inspection_cleared') {
          return sendBusinessError(res, `Cannot dispatch: linked WO quality status is '${(woCheck.rows[0] as any).quality_status}'.`);
        }
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDispatchReadiness)
          .set({ status: 'dispatched', dispatchedBy: userId, dispatchedAt: new Date(), dispatchReference: dispatchReference || null, updatedAt: new Date() })
          .where(eq(epcDispatchReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${dr.project_id}, 'dispatch_readiness.dispatched', ${JSON.stringify({
            drId: id, drNumber: dr.dr_number, dispatchedBy: userId, projectItemId: dr.project_item_id,
            dispatchReference: dispatchReference || null,
          })}::jsonb, 'dispatch_readiness', NOW())`);
      });

      console.log(`[DR] ${dr.dr_number} dispatched by user ${userId}`);
      res.json({ success: true, message: `${dr.dr_number} marked as dispatched`, id, newStatus: 'dispatched' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/dispatch-readiness/:id/cancel', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_dispatch_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'cancelReason is required.');

      const existing = await db.execute(sql`SELECT * FROM epc_dispatch_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Dispatch readiness record not found');
      const dr = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(dr, req.user as any, 'department', req, res))) return;

      if (dr.status === 'canceled' || dr.status === 'superseded' || dr.status === 'dispatched') {
        return sendBusinessError(res, `Cannot cancel: status is '${dr.status}' (terminal state).`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDispatchReadiness)
          .set({ status: 'canceled', cancelledBy: userId, cancelledAt: new Date(), cancelReason, updatedAt: new Date() })
          .where(eq(epcDispatchReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${dr.project_id}, 'dispatch_readiness.canceled', ${JSON.stringify({
            drId: id, drNumber: dr.dr_number, cancelledBy: userId, cancelReason,
            previousStatus: dr.status, projectItemId: dr.project_item_id,
          })}::jsonb, 'dispatch_readiness', NOW())`);
      });

      console.log(`[DR] ${dr.dr_number} canceled by user ${userId}: ${cancelReason}`);
      res.json({ success: true, message: `${dr.dr_number} canceled`, id, newStatus: 'canceled' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/dispatch-readiness/:id/supersede', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_dispatch_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { supersessionReason, newDrId } = req.body || {};

      if (!supersessionReason) return sendValidationError(res, 'supersessionReason is required.');

      const existing = await db.execute(sql`SELECT * FROM epc_dispatch_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Dispatch readiness record not found');
      const dr = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(dr, req.user as any, 'department', req, res))) return;

      if (dr.status === 'canceled' || dr.status === 'superseded' || dr.status === 'dispatched') {
        return sendBusinessError(res, `Cannot supersede: status is '${dr.status}' (terminal state).`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDispatchReadiness)
          .set({
            status: 'superseded', supersededById: newDrId || null, supersededAt: new Date(),
            supersessionReason, updatedAt: new Date(),
          })
          .where(eq(epcDispatchReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${dr.project_id}, 'dispatch_readiness.superseded', ${JSON.stringify({
            drId: id, drNumber: dr.dr_number, supersededBy: userId, supersessionReason,
            newDrId: newDrId || null, previousStatus: dr.status, projectItemId: dr.project_item_id,
          })}::jsonb, 'dispatch_readiness', NOW())`);
      });

      console.log(`[DR] ${dr.dr_number} superseded by user ${userId}: ${supersessionReason}`);
      res.json({ success: true, message: `${dr.dr_number} superseded`, id, newStatus: 'superseded' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/dispatch-readiness/:id', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM epc_dispatch_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Dispatch readiness record not found');
      const dr = existing.rows[0] as any;

      await guardProjectNotFrozen(dr.project_id, res);
      if (!(await enforceWriteOwnership(dr, req.user as any, 'department', req, res))) return;

      if (dr.status === 'canceled' || dr.status === 'superseded' || dr.status === 'dispatched') {
        return sendBusinessError(res, `Cannot update: status is '${dr.status}' (terminal state).`);
      }

      const allowedFields = [
        'dispatchQuantity', 'packagingType', 'packagingNotes', 'shippingMethod',
        'shippingNotes', 'dispatchNotes', 'specialHandling', 'destinationAddress',
        'estimatedDispatchDate', 'itemSpecification',
      ];
      const updates: Record<string, any> = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          if (field === 'estimatedDispatchDate') {
            updates[field] = req.body[field] ? new Date(req.body[field]) : null;
          } else {
            updates[field] = req.body[field];
          }
        }
      }

      await db.update(epcDispatchReadiness).set(updates).where(eq(epcDispatchReadiness.id, id));

      console.log(`[DR] ${dr.dr_number} updated by user ${userId}`);
      res.json({ success: true, message: `${dr.dr_number} updated`, id });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== EPC DISPATCH RECORDS BRIDGE ====================

  app.get('/api/projects/:projectId/dispatch-records', ensureAuthenticated, requirePageAccess('dispatch-logistics'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const user = req.user as any;
      const visibilityScope = (req as any).visibilityScope || 'department_records';
      const dRecOwnershipConfig: OwnershipFilterConfig = { createdByColumn: 'created_by', mode: 'department' };
      const { whereSql, joinSql } = buildOwnershipWhereClause(user, visibilityScope, dRecOwnershipConfig, 'd');

      let query = sql`SELECT d.*, 
              u1.username AS created_by_name, u2.username AS confirmed_by_name,
              u3.username AS shipped_by_name, u4.username AS delivered_by_name,
              u5.username AS cancelled_by_name, u6.username AS delivery_confirmed_by_name,
              pi.description AS project_item_description,
              dr.dr_number, po.po_number, wo.wo_number
            FROM epc_dispatch_records d
            LEFT JOIN users u1 ON d.created_by = u1.id
            LEFT JOIN users u2 ON d.confirmed_by = u2.id
            LEFT JOIN users u3 ON d.shipped_by = u3.id
            LEFT JOIN users u4 ON d.delivered_by = u4.id
            LEFT JOIN users u5 ON d.cancelled_by = u5.id
            LEFT JOIN users u6 ON d.delivery_confirmed_by = u6.id
            LEFT JOIN project_items pi ON d.project_item_id = pi.id
            LEFT JOIN epc_dispatch_readiness dr ON d.dispatch_readiness_id = dr.id
            LEFT JOIN epc_purchase_orders po ON d.epc_purchase_order_id = po.id
            LEFT JOIN epc_work_orders wo ON d.epc_work_order_id = wo.id`;
      if (joinSql) query = sql`${query} ${joinSql}`;
      query = sql`${query} WHERE d.project_id = ${projectId}`;
      if (whereSql) query = sql`${query} AND ${whereSql}`;
      query = sql`${query} ORDER BY d.created_at DESC`;

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/dispatch-records/:id', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const result = await db.execute(
        sql`SELECT d.*, 
              u1.username AS created_by_name, u2.username AS confirmed_by_name,
              u3.username AS shipped_by_name, u4.username AS delivered_by_name,
              u5.username AS cancelled_by_name, u6.username AS delivery_confirmed_by_name,
              pi.description AS project_item_description,
              dr.dr_number, po.po_number, wo.wo_number
            FROM epc_dispatch_records d
            LEFT JOIN users u1 ON d.created_by = u1.id
            LEFT JOIN users u2 ON d.confirmed_by = u2.id
            LEFT JOIN users u3 ON d.shipped_by = u3.id
            LEFT JOIN users u4 ON d.delivered_by = u4.id
            LEFT JOIN users u5 ON d.cancelled_by = u5.id
            LEFT JOIN users u6 ON d.delivery_confirmed_by = u6.id
            LEFT JOIN project_items pi ON d.project_item_id = pi.id
            LEFT JOIN epc_dispatch_readiness dr ON d.dispatch_readiness_id = dr.id
            LEFT JOIN epc_purchase_orders po ON d.epc_purchase_order_id = po.id
            LEFT JOIN epc_work_orders wo ON d.epc_work_order_id = wo.id
            WHERE d.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Dispatch record not found');

      const record = result.rows[0] as any;
      const user = req.user as any;
      const { visibilityScope } = await checkProjectMembership(user.id, user.role, record.project_id);
      const creatorDept = await lookupCreatorDepartment(record.created_by);
      if (!checkRecordOwnership(record, creatorDept, user, visibilityScope, 'department')) {
        return denyRecordAccess(res, req);
      }

      res.json(record);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/dispatch-records', ensureAuthenticated, requirePageAccess('dispatch-logistics'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      await guardProjectNotFrozen(projectId, res);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const {
        dispatchReadinessId, dispatchDate, transporterName, transporterContact,
        vehicleNumber, trackingNumber, lrNumber, lrDate, logisticsNotes,
        deliveryAddress, expectedDeliveryDate, dispatchNotes,
      } = req.body;

      if (!dispatchReadinessId) {
        return sendValidationError(res, 'dispatchReadinessId is required.');
      }

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Manager level and above can create dispatch records.');
      }

      const drResult = await db.execute(
        sql`SELECT * FROM epc_dispatch_readiness WHERE id = ${dispatchReadinessId} AND project_id = ${projectId}`
      );
      if (drResult.rows.length === 0) return sendNotFound(res, 'Dispatch readiness record not found in this project');
      const dr = drResult.rows[0] as any;

      if (dr.status !== 'ready_for_dispatch' && dr.status !== 'dispatched') {
        return sendBusinessError(res, `Cannot create dispatch record: readiness status is '${dr.status}', expected 'ready_for_dispatch' or 'dispatched'.`);
      }

      const existingCheck = await db.execute(
        sql`SELECT id, dispatch_number FROM epc_dispatch_records 
            WHERE dispatch_readiness_id = ${dispatchReadinessId}
              AND status NOT IN ('canceled', 'superseded')`
      );
      if (existingCheck.rows.length > 0) {
        const existing = existingCheck.rows[0] as any;
        return sendBusinessError(res, `Active dispatch record ${existing.dispatch_number} already exists for this readiness record (id: ${existing.id}). Cancel or supersede it first.`);
      }

      await db.transaction(async (tx) => {
        const dispatchNumber = await epcCoding.generateDocumentNumber(projectId, 'DSP', tx);
        const inserted = await tx.insert(epcDispatchRecords).values({
          dispatchNumber,
          projectId,
          projectItemId: dr.project_item_id,
          dispatchReadinessId,
          epcPurchaseOrderId: dr.epc_purchase_order_id || null,
          epcWorkOrderId: dr.epc_work_order_id || null,
          inspectionExecutionId: dr.inspection_execution_id || null,
          qualityPlanId: dr.quality_plan_id || null,
          masterItemId: dr.master_item_id,
          itemCode: dr.item_code,
          itemDescription: dr.item_description,
          itemSpecification: dr.item_specification,
          uom: dr.uom,
          quantity: dr.quantity,
          dispatchQuantity: dr.dispatch_quantity || dr.quantity,
          packagingType: dr.packaging_type,
          packagingNotes: dr.packaging_notes,
          shippingMethod: dr.shipping_method,
          shippingNotes: dr.shipping_notes,
          dispatchNotes: dispatchNotes || dr.dispatch_notes,
          specialHandling: dr.special_handling,
          destinationAddress: dr.destination_address,
          qualityClearanceDate: dr.quality_clearance_date,
          qualityClearanceReference: dr.quality_clearance_reference,
          sourceType: dr.source_type,
          dispatchDate: dispatchDate ? new Date(dispatchDate) : null,
          transporterName: transporterName || null,
          transporterContact: transporterContact || null,
          vehicleNumber: vehicleNumber || null,
          trackingNumber: trackingNumber || null,
          lrNumber: lrNumber || null,
          lrDate: lrDate ? new Date(lrDate) : null,
          logisticsNotes: logisticsNotes || null,
          deliveryAddress: deliveryAddress || dr.destination_address,
          expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
          status: 'draft',
          createdBy: userId,
        }).returning();

        if (dr.status === 'ready_for_dispatch') {
          await tx.update(epcDispatchReadiness)
            .set({ status: 'dispatched', dispatchedBy: userId, dispatchedAt: new Date(), dispatchReference: dispatchNumber, updatedAt: new Date() })
            .where(eq(epcDispatchReadiness.id, dispatchReadinessId));
        }

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${projectId}, 'dispatch_record.created', ${JSON.stringify({
            dispatchId: inserted[0].id, dispatchNumber, dispatchReadinessId, drNumber: dr.dr_number,
            projectItemId: dr.project_item_id, masterItemId: dr.master_item_id,
            sourceType: dr.source_type, quantity: dr.dispatch_quantity || dr.quantity,
            createdBy: userId,
          })}::jsonb, 'dispatch_execution', NOW())`);

        console.log(`[DISP] Dispatch record ${dispatchNumber} created from readiness ${dr.dr_number} by user ${userId}`);
        res.status(201).json({ success: true, message: `Dispatch record ${dispatchNumber} created`, record: inserted[0] });
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/dispatch-records/:id/confirm', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_dispatch_records', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { confirmationNote } = req.body || {};

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Manager level and above can confirm dispatch records.');
      }

      const existing = await db.execute(sql`SELECT * FROM epc_dispatch_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Dispatch record not found');
      const d = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(d, req.user as any, 'department', req, res))) return;

      if (d.status !== 'draft') {
        return sendBusinessError(res, `Cannot confirm: status is '${d.status}', expected 'draft'.`);
      }

      if (d.created_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the creator cannot also confirm the same dispatch record.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDispatchRecords)
          .set({ status: 'confirmed', confirmedBy: userId, confirmedAt: new Date(), confirmationNote: confirmationNote || null, updatedAt: new Date() })
          .where(eq(epcDispatchRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${d.project_id}, 'dispatch_record.confirmed', ${JSON.stringify({
            dispatchId: id, dispatchNumber: d.dispatch_number, confirmedBy: userId,
            projectItemId: d.project_item_id,
          })}::jsonb, 'dispatch_execution', NOW())`);
      });

      console.log(`[DISP] ${d.dispatch_number} confirmed by user ${userId}`);
      res.json({ success: true, message: `${d.dispatch_number} confirmed`, id, newStatus: 'confirmed' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/dispatch-records/:id/ship', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_dispatch_records', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { shipmentNote, transporterName, vehicleNumber, trackingNumber, lrNumber, lrDate } = req.body || {};

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Manager level and above can mark dispatch as shipped.');
      }

      const existing = await db.execute(sql`SELECT * FROM epc_dispatch_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Dispatch record not found');
      const d = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(d, req.user as any, 'department', req, res))) return;

      if (d.status !== 'confirmed') {
        return sendBusinessError(res, `Cannot ship: status is '${d.status}', expected 'confirmed'.`);
      }

      const updateFields: Record<string, any> = {
        status: 'shipped', shippedBy: userId, shippedAt: new Date(),
        shipmentNote: shipmentNote || null, updatedAt: new Date(),
        dispatchDate: d.dispatch_date || new Date(),
      };
      if (transporterName) updateFields.transporterName = transporterName;
      if (vehicleNumber) updateFields.vehicleNumber = vehicleNumber;
      if (trackingNumber) updateFields.trackingNumber = trackingNumber;
      if (lrNumber) updateFields.lrNumber = lrNumber;
      if (lrDate) updateFields.lrDate = new Date(lrDate);

      await db.transaction(async (tx) => {
        await tx.update(epcDispatchRecords).set(updateFields).where(eq(epcDispatchRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${d.project_id}, 'dispatch_record.shipped', ${JSON.stringify({
            dispatchId: id, dispatchNumber: d.dispatch_number, shippedBy: userId,
            projectItemId: d.project_item_id, transporterName: transporterName || d.transporter_name,
            vehicleNumber: vehicleNumber || d.vehicle_number,
          })}::jsonb, 'dispatch_execution', NOW())`);

        try {
          const dspConfirmResult = await resolveEpcAssignee('DSP_confirm', d.project_id, String(userId));
          const dspProjectCode = await resolveProjectCode(d.project_id, tx);
          await createEpcTask({
            projectId: d.project_id, entityType: 'dispatch_record', recordId: id, actionCode: 'confirm_delivery',
            title: `Confirm Delivery — ${d.dispatch_number} — ${dspProjectCode}`,
            description: `Dispatch ${d.dispatch_number} has been shipped. Please confirm delivery once the consignment is received at site.`,
            assignedTo: dspConfirmResult.userId, createdBy: userId, priority: 'High', dueDays: 7, tx,
          });
        } catch (taskErr) {
          console.error(`[DISP] Non-critical: failed to create delivery confirmation task for ${d.dispatch_number}`, taskErr);
        }
      });

      console.log(`[DISP] ${d.dispatch_number} shipped by user ${userId}`);
      res.json({ success: true, message: `${d.dispatch_number} marked as shipped`, id, newStatus: 'shipped' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/dispatch-records/:id/deliver', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_dispatch_records', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { deliveryNote, actualDeliveryDate } = req.body || {};

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Manager level and above can confirm delivery.');
      }

      const existing = await db.execute(sql`SELECT * FROM epc_dispatch_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Dispatch record not found');
      const d = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(d, req.user as any, 'department', req, res))) return;

      if (d.status !== 'shipped') {
        return sendBusinessError(res, `Cannot mark delivered: status is '${d.status}', expected 'shipped'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDispatchRecords)
          .set({
            status: 'delivered', deliveredBy: userId, deliveredAt: new Date(),
            deliveryNote: deliveryNote || null,
            actualDeliveryDate: actualDeliveryDate ? new Date(actualDeliveryDate) : new Date(),
            deliveryConfirmedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(epcDispatchRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${d.project_id}, 'dispatch_record.delivered', ${JSON.stringify({
            dispatchId: id, dispatchNumber: d.dispatch_number, deliveredBy: userId,
            projectItemId: d.project_item_id,
            actualDeliveryDate: actualDeliveryDate || new Date().toISOString(),
          })}::jsonb, 'dispatch_execution', NOW())`);
      });

      try {
        const existingBr = await db.execute(
          sql`SELECT id FROM epc_billing_readiness WHERE dispatch_record_id = ${id} AND billing_basis = 'dispatch' AND status NOT IN ('canceled', 'superseded')`
        );
        if (existingBr.rows.length === 0) {
          const brNumber = await epcCoding.generateDocumentNumber(d.project_id, 'BR', db);
          const brInsert = await db.execute(
            sql`INSERT INTO epc_billing_readiness
                (br_number, project_id, project_item_id, dispatch_record_id,
                 dispatch_readiness_id, epc_purchase_order_id, epc_work_order_id,
                 inspection_execution_id, quality_plan_id, master_item_id,
                 billing_basis, item_code, item_description, item_specification,
                 uom, quantity, currency, tax_applicable,
                 dispatch_number, dispatch_date, delivery_date,
                 source_type, status, created_by, created_at)
                VALUES (${brNumber}, ${d.project_id}, ${d.project_item_id}, ${id},
                        ${d.dispatch_readiness_id || null}, ${d.epc_purchase_order_id || null}, ${d.epc_work_order_id || null},
                        ${d.inspection_execution_id || null}, ${d.quality_plan_id || null}, ${d.master_item_id || null},
                        'dispatch', ${d.item_code || null}, ${d.item_description || null}, ${d.item_specification || null},
                        ${d.uom || null}, ${d.quantity || d.dispatch_quantity || null}, 'INR', true,
                        ${d.dispatch_number}, ${d.dispatch_date || null}, ${actualDeliveryDate ? new Date(actualDeliveryDate) : new Date()},
                        ${d.source_type || 'purchase_order'}, 'draft', ${userId}, NOW())
                RETURNING id`
          );
          const brId = (brInsert.rows[0] as any)?.id;
          console.log(`[DISP] Auto-created billing readiness ${brNumber} for dispatch ${d.dispatch_number}`);

          await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
            VALUES (${d.project_id}, 'billing_readiness.created', ${JSON.stringify({
              brId, brNumber, billingBasis: 'dispatch',
              dispatchRecordId: id, projectItemId: d.project_item_id, createdBy: userId,
              autoCreated: true,
            })}::jsonb, 'dispatch_delivery_trigger', NOW())`);

          const invAssigneeResult = await resolveEpcAssignee('INV_prepare', d.project_id, String(userId));
          const invAssigneeId = invAssigneeResult.userId;
          if (invAssigneeId && brId) {
            const projCode = await resolveProjectCode(d.project_id);
            await createEpcTask({
              projectId: d.project_id, entityType: 'billing_readiness', recordId: brId, actionCode: 'review_billing',
              title: `Review Billing ${brNumber} — ${projCode}`,
              description: `Dispatch ${d.dispatch_number} has been delivered. Billing readiness ${brNumber} created for item ${d.item_description || d.item_code || 'N/A'}. Please review and submit for approval.`,
              assignedTo: invAssigneeId, createdBy: userId, priority: 'High', dueDays: 5,
            });
          }
        }
      } catch (brErr: any) {
        console.error(`[DISP] Warning: Failed to auto-create billing readiness for ${d.dispatch_number}:`, brErr.message);
      }

      console.log(`[DISP] ${d.dispatch_number} delivered, confirmed by user ${userId}`);
      res.json({ success: true, message: `${d.dispatch_number} marked as delivered`, id, newStatus: 'delivered' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/dispatch-records/:id/cancel', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_dispatch_records', id, res))) return;
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'cancelReason is required.');

      const existing = await db.execute(sql`SELECT * FROM epc_dispatch_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Dispatch record not found');
      const d = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(d, req.user as any, 'department', req, res))) return;

      if (d.status === 'canceled' || d.status === 'superseded' || d.status === 'delivered') {
        return sendBusinessError(res, `Cannot cancel: status is '${d.status}' (terminal state).`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDispatchRecords)
          .set({ status: 'canceled', cancelledBy: userId, cancelledAt: new Date(), cancelReason, updatedAt: new Date() })
          .where(eq(epcDispatchRecords.id, id));

        if (d.status !== 'shipped') {
          const otherActive = await tx.execute(
            sql`SELECT id FROM epc_dispatch_records 
                WHERE dispatch_readiness_id = ${d.dispatch_readiness_id} 
                  AND id != ${id} AND status NOT IN ('canceled', 'superseded')`
          );
          if (otherActive.rows.length === 0) {
            await tx.update(epcDispatchReadiness)
              .set({ status: 'ready_for_dispatch', dispatchedBy: null, dispatchedAt: null, dispatchReference: null, updatedAt: new Date() })
              .where(eq(epcDispatchReadiness.id, d.dispatch_readiness_id));
          }
        }

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${d.project_id}, 'dispatch_record.canceled', ${JSON.stringify({
            dispatchId: id, dispatchNumber: d.dispatch_number, cancelledBy: userId,
            cancelReason, previousStatus: d.status, projectItemId: d.project_item_id,
          })}::jsonb, 'dispatch_execution', NOW())`);
      });

      console.log(`[DISP] ${d.dispatch_number} canceled by user ${userId}: ${cancelReason}`);
      res.json({ success: true, message: `${d.dispatch_number} canceled`, id, newStatus: 'canceled' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/dispatch-records/:id/supersede', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_dispatch_records', id, res))) return;
      const userId = (req.user as any)?.id;
      const { supersessionReason, newDispatchId } = req.body || {};

      if (!supersessionReason) return sendValidationError(res, 'supersessionReason is required.');

      const existing = await db.execute(sql`SELECT * FROM epc_dispatch_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Dispatch record not found');
      const d = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(d, req.user as any, 'department', req, res))) return;

      if (d.status === 'canceled' || d.status === 'superseded' || d.status === 'delivered') {
        return sendBusinessError(res, `Cannot supersede: status is '${d.status}' (terminal state).`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDispatchRecords)
          .set({
            status: 'superseded', supersededById: newDispatchId || null, supersededAt: new Date(),
            supersessionReason, updatedAt: new Date(),
          })
          .where(eq(epcDispatchRecords.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${d.project_id}, 'dispatch_record.superseded', ${JSON.stringify({
            dispatchId: id, dispatchNumber: d.dispatch_number, supersededBy: userId,
            supersessionReason, newDispatchId: newDispatchId || null,
            previousStatus: d.status, projectItemId: d.project_item_id,
          })}::jsonb, 'dispatch_execution', NOW())`);
      });

      console.log(`[DISP] ${d.dispatch_number} superseded by user ${userId}: ${supersessionReason}`);
      res.json({ success: true, message: `${d.dispatch_number} superseded`, id, newStatus: 'superseded' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/dispatch-records/:id', ensureAuthenticated, requirePageAccess('dispatch-logistics'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM epc_dispatch_records WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Dispatch record not found');
      const d = existing.rows[0] as any;

      await guardProjectNotFrozen(d.project_id, res);
      if (!(await enforceWriteOwnership(d, req.user as any, 'department', req, res))) return;

      if (d.status === 'canceled' || d.status === 'superseded' || d.status === 'delivered') {
        return sendBusinessError(res, `Cannot update: status is '${d.status}' (terminal state).`);
      }

      const allowedFields = [
        'dispatchDate', 'transporterName', 'transporterContact', 'vehicleNumber',
        'trackingNumber', 'lrNumber', 'lrDate', 'logisticsNotes', 'deliveryAddress',
        'expectedDeliveryDate', 'dispatchNotes', 'shippingNotes', 'specialHandling',
      ];
      const updates: Record<string, any> = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          if (['dispatchDate', 'lrDate', 'expectedDeliveryDate'].includes(field)) {
            updates[field] = req.body[field] ? new Date(req.body[field]) : null;
          } else {
            updates[field] = req.body[field];
          }
        }
      }

      await db.update(epcDispatchRecords).set(updates).where(eq(epcDispatchRecords.id, id));

      console.log(`[DISP] ${d.dispatch_number} updated by user ${userId}`);
      res.json({ success: true, message: `${d.dispatch_number} updated`, id });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== EPC COMMISSIONING / HANDOVER READINESS BRIDGE ====================

  app.get('/api/projects/:projectId/commissioning-readiness', ensureAuthenticated, requirePageAccess('commissioning-handover'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const result = await db.execute(
        sql`SELECT c.*,
              u1.username AS created_by_name, u2.username AS prepared_by_name,
              u3.username AS ready_marked_by_name, u4.username AS commissioned_by_name,
              u5.username AS handed_over_by_name, u6.username AS cancelled_by_name,
              pi.description AS project_item_description,
              d.dispatch_number AS linked_dispatch_number, po.po_number, wo.wo_number
            FROM epc_commissioning_readiness c
            LEFT JOIN users u1 ON c.created_by = u1.id
            LEFT JOIN users u2 ON c.prepared_by = u2.id
            LEFT JOIN users u3 ON c.ready_marked_by = u3.id
            LEFT JOIN users u4 ON c.commissioned_by = u4.id
            LEFT JOIN users u5 ON c.handed_over_by = u5.id
            LEFT JOIN users u6 ON c.cancelled_by = u6.id
            LEFT JOIN project_items pi ON c.project_item_id = pi.id
            LEFT JOIN epc_dispatch_records d ON c.dispatch_record_id = d.id
            LEFT JOIN epc_purchase_orders po ON c.epc_purchase_order_id = po.id
            LEFT JOIN epc_work_orders wo ON c.epc_work_order_id = wo.id
            WHERE c.project_id = ${projectId}
            ORDER BY c.created_at DESC`
      );
      res.json(result.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/commissioning-readiness/:id', ensureAuthenticated, requirePageAccess('commissioning-handover'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const result = await db.execute(
        sql`SELECT c.*,
              u1.username AS created_by_name, u2.username AS prepared_by_name,
              u3.username AS ready_marked_by_name, u4.username AS commissioned_by_name,
              u5.username AS handed_over_by_name, u6.username AS cancelled_by_name,
              pi.description AS project_item_description,
              d.dispatch_number AS linked_dispatch_number, po.po_number, wo.wo_number
            FROM epc_commissioning_readiness c
            LEFT JOIN users u1 ON c.created_by = u1.id
            LEFT JOIN users u2 ON c.prepared_by = u2.id
            LEFT JOIN users u3 ON c.ready_marked_by = u3.id
            LEFT JOIN users u4 ON c.commissioned_by = u4.id
            LEFT JOIN users u5 ON c.handed_over_by = u5.id
            LEFT JOIN users u6 ON c.cancelled_by = u6.id
            LEFT JOIN project_items pi ON c.project_item_id = pi.id
            LEFT JOIN epc_dispatch_records d ON c.dispatch_record_id = d.id
            LEFT JOIN epc_purchase_orders po ON c.epc_purchase_order_id = po.id
            LEFT JOIN epc_work_orders wo ON c.epc_work_order_id = wo.id
            WHERE c.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found');
      const cr = result.rows[0] as any;
      const user = req.user as any;
      const { isMember } = await checkProjectMembership(user.id, user.role, cr.project_id);
      if (!isMember) return res.status(403).json({ error: "Access denied", code: "PROJECT_ACCESS_DENIED" });
      res.json(cr);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/commissioning-readiness', ensureAuthenticated, requirePageAccess('commissioning-handover'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (!(await guardProjectNotFrozen(projectId, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const {
        dispatchRecordId, siteName, siteAddress, siteContactPerson, siteContactPhone,
        installationRequired, installationNotes, trainingRequired, trainingNotes,
        commissioningNotes,
      } = req.body;

      if (!dispatchRecordId) {
        return sendValidationError(res, 'dispatchRecordId is required.');
      }

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Manager level and above can create commissioning readiness records.');
      }

      const dispResult = await db.execute(
        sql`SELECT * FROM epc_dispatch_records WHERE id = ${dispatchRecordId} AND project_id = ${projectId}`
      );
      if (dispResult.rows.length === 0) return sendNotFound(res, 'Dispatch record not found in this project');
      const disp = dispResult.rows[0] as any;

      if (disp.status !== 'shipped' && disp.status !== 'delivered') {
        return sendBusinessError(res, `Cannot create commissioning readiness: dispatch status is '${disp.status}', expected 'shipped' or 'delivered'.`);
      }

      const existingCheck = await db.execute(
        sql`SELECT id, cr_number FROM epc_commissioning_readiness
            WHERE dispatch_record_id = ${dispatchRecordId}
              AND status NOT IN ('canceled', 'superseded')`
      );
      if (existingCheck.rows.length > 0) {
        const existing = existingCheck.rows[0] as any;
        return sendBusinessError(res, `Active commissioning readiness ${existing.cr_number} already exists for this dispatch record (id: ${existing.id}).`);
      }

      let crCreated: { id: number; crNumber: string; itemCode: string; itemDescription: string } | null = null;
      await db.transaction(async (tx) => {
        const crNumber = await epcCoding.generateDocumentNumber(projectId, 'CR', tx);
        const inserted = await tx.insert(epcCommissioningReadiness).values({
          crNumber,
          projectId,
          projectItemId: disp.project_item_id,
          dispatchRecordId,
          dispatchReadinessId: disp.dispatch_readiness_id || null,
          epcPurchaseOrderId: disp.epc_purchase_order_id || null,
          epcWorkOrderId: disp.epc_work_order_id || null,
          inspectionExecutionId: disp.inspection_execution_id || null,
          qualityPlanId: disp.quality_plan_id || null,
          masterItemId: disp.master_item_id,
          itemCode: disp.item_code,
          itemDescription: disp.item_description,
          itemSpecification: disp.item_specification,
          uom: disp.uom,
          quantity: disp.dispatch_quantity || disp.quantity,
          dispatchNumber: disp.dispatch_number,
          dispatchDate: disp.dispatch_date,
          deliveryDate: disp.actual_delivery_date || disp.expected_delivery_date,
          siteName: siteName || null,
          siteAddress: siteAddress || disp.delivery_address,
          siteContactPerson: siteContactPerson || null,
          siteContactPhone: siteContactPhone || null,
          installationRequired: installationRequired !== undefined ? installationRequired : true,
          installationNotes: installationNotes || null,
          trainingRequired: trainingRequired !== undefined ? trainingRequired : false,
          trainingNotes: trainingNotes || null,
          commissioningNotes: commissioningNotes || null,
          qualityClearanceReference: disp.quality_clearance_reference,
          sourceType: disp.source_type,
          status: 'draft',
          createdBy: userId,
        }).returning();

        crCreated = { id: inserted[0].id, crNumber, itemCode: disp.item_code, itemDescription: disp.item_description };

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${projectId}, 'commissioning_readiness.created', ${JSON.stringify({
            crId: inserted[0].id, crNumber, dispatchRecordId, dispatchNumber: disp.dispatch_number,
            projectItemId: disp.project_item_id, masterItemId: disp.master_item_id,
            sourceType: disp.source_type, createdBy: userId,
          })}::jsonb, 'commissioning', NOW())`);

        console.log(`[CR] Commissioning readiness ${crNumber} created from dispatch ${disp.dispatch_number} by user ${userId}`);
        res.status(201).json({ success: true, message: `Commissioning readiness ${crNumber} created`, record: inserted[0] });
      });

      // Auto-create commissioning execution task (COM gate)
      if (crCreated) {
        try {
          const { id: crId, crNumber, itemCode, itemDescription } = crCreated as any;
          const projCode = await resolveProjectCode(projectId);
          const comAssignee = await resolveEpcAssignee('COM_execute', projectId, String(userId));
          if (comAssignee.userId) {
            await createEpcTask({
              projectId, entityType: 'commissioning_readiness', recordId: crId, actionCode: 'execute_commissioning',
              title: `Execute Commissioning ${crNumber} — ${projCode}`,
              description: `Item ${itemDescription || itemCode} has been dispatched and is ready for commissioning at site. Please execute the commissioning checklist and report completion.`,
              assignedTo: comAssignee.userId, createdBy: userId, priority: 'High', dueDays: 7,
            });
            console.log(`[CR] COM_execute task created for ${crNumber} → user ${comAssignee.userId}`);
          }
          const comVerifyAssignee = await resolveEpcAssignee('COM_verify', projectId, String(userId));
          if (comVerifyAssignee.userId) {
            await createEpcTask({
              projectId, entityType: 'commissioning_readiness', recordId: crId, actionCode: 'verify_commissioning',
              title: `Verify & Approve Commissioning ${crNumber} — ${projCode}`,
              description: `Review and verify commissioning completion for ${itemDescription || itemCode}. Approve handover once satisfied.`,
              assignedTo: comVerifyAssignee.userId, createdBy: userId, priority: 'High', dueDays: 10,
            });
            console.log(`[CR] COM_verify task created for ${crNumber} → user ${comVerifyAssignee.userId}`);
          }
        } catch (taskErr: any) {
          console.error(`[CR] Non-critical: COM task creation failed:`, taskErr.message);
        }
      }
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/commissioning-readiness/:id/start-preparation', ensureAuthenticated, requirePageAccess('commissioning-handover'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_commissioning_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { preparationNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM epc_commissioning_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found');
      const cr = existing.rows[0] as any;

      if (cr.status !== 'draft') {
        return sendBusinessError(res, `Cannot start preparation: status is '${cr.status}', expected 'draft'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcCommissioningReadiness)
          .set({ status: 'under_preparation', preparedBy: userId, preparedAt: new Date(), preparationNote: preparationNote || null, updatedAt: new Date() })
          .where(eq(epcCommissioningReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${cr.project_id}, 'commissioning_readiness.preparation_started', ${JSON.stringify({
            crId: id, crNumber: cr.cr_number, preparedBy: userId, projectItemId: cr.project_item_id,
          })}::jsonb, 'commissioning', NOW())`);

        try {
          const comExecResult = await resolveEpcAssignee('COM_execute', cr.project_id, String(userId));
          const comProjectCode = await resolveProjectCode(cr.project_id, tx);
          await createEpcTask({
            projectId: cr.project_id, entityType: 'commissioning_readiness', recordId: id, actionCode: 'execute',
            title: `Execute Commissioning — ${cr.cr_number} — ${comProjectCode}`,
            description: `Commissioning readiness ${cr.cr_number} is now under preparation. Please proceed with site commissioning activities, documentation, and test certificates.`,
            assignedTo: comExecResult.userId, createdBy: userId, priority: 'High', dueDays: 7, tx,
          });
        } catch (taskErr) {
          console.error(`[CR] Non-critical: failed to create COM_execute task for ${cr.cr_number}`, taskErr);
        }
      });

      console.log(`[CR] ${cr.cr_number} moved to under_preparation by user ${userId}`);
      res.json({ success: true, message: `${cr.cr_number} preparation started`, id, newStatus: 'under_preparation' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/commissioning-readiness/:id/mark-ready', ensureAuthenticated, requirePageAccess('commissioning-handover'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_commissioning_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { readyNote } = req.body || {};

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Manager level and above can mark commissioning as ready.');
      }

      const existing = await db.execute(sql`SELECT * FROM epc_commissioning_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found');
      const cr = existing.rows[0] as any;

      if (cr.status !== 'under_preparation') {
        return sendBusinessError(res, `Cannot mark ready: status is '${cr.status}', expected 'under_preparation'.`);
      }

      if (!cr.site_readiness_confirmed) {
        return sendBusinessError(res, 'Cannot mark ready: site readiness has not been confirmed. Update site_readiness_confirmed first.');
      }

      if (!cr.documentation_complete) {
        return sendBusinessError(res, 'Cannot mark ready: documentation is not complete. Update documentation_complete first.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcCommissioningReadiness)
          .set({ status: 'ready_for_commissioning', readyMarkedBy: userId, readyMarkedAt: new Date(), readyNote: readyNote || null, updatedAt: new Date() })
          .where(eq(epcCommissioningReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${cr.project_id}, 'commissioning_readiness.marked_ready', ${JSON.stringify({
            crId: id, crNumber: cr.cr_number, readyMarkedBy: userId, projectItemId: cr.project_item_id,
            siteReadinessConfirmed: true, documentationComplete: true,
          })}::jsonb, 'commissioning', NOW())`);
      });

      console.log(`[CR] ${cr.cr_number} marked ready_for_commissioning by user ${userId}`);
      res.json({ success: true, message: `${cr.cr_number} is ready for commissioning`, id, newStatus: 'ready_for_commissioning' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/commissioning-readiness/:id/commission', ensureAuthenticated, requirePageAccess('commissioning-handover'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_commissioning_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { commissioningNote, commissioningDate } = req.body || {};

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Manager level and above can commission items.');
      }

      const existing = await db.execute(sql`SELECT * FROM epc_commissioning_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found');
      const cr = existing.rows[0] as any;

      if (cr.status !== 'ready_for_commissioning') {
        return sendBusinessError(res, `Cannot commission: status is '${cr.status}', expected 'ready_for_commissioning'.`);
      }

      if (cr.created_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the creator cannot also commission the same record.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcCommissioningReadiness)
          .set({
            status: 'commissioned', commissionedBy: userId, commissionedAt: new Date(),
            commissioningNote: commissioningNote || null,
            commissioningDate: commissioningDate ? new Date(commissioningDate) : new Date(),
            updatedAt: new Date(),
          })
          .where(eq(epcCommissioningReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${cr.project_id}, 'commissioning_readiness.commissioned', ${JSON.stringify({
            crId: id, crNumber: cr.cr_number, commissionedBy: userId, projectItemId: cr.project_item_id,
            commissioningDate: commissioningDate || new Date().toISOString(),
          })}::jsonb, 'commissioning', NOW())`);

        try {
          const comVerifyResult = await resolveEpcAssignee('COM_verify', cr.project_id, String(userId));
          const comVerProjCode = await resolveProjectCode(cr.project_id, tx);
          await createEpcTask({
            projectId: cr.project_id, entityType: 'commissioning_readiness', recordId: id, actionCode: 'verify',
            title: `Verify & Sign Off Commissioning — ${cr.cr_number} — ${comVerProjCode}`,
            description: `Commissioning ${cr.cr_number} has been executed. Please review test certificates, verify site readiness, and sign off the customer handover.`,
            assignedTo: comVerifyResult.userId, createdBy: userId, priority: 'High', dueDays: 3, tx,
          });
        } catch (taskErr) {
          console.error(`[CR] Non-critical: failed to create COM_verify task for ${cr.cr_number}`, taskErr);
        }
      });

      console.log(`[CR] ${cr.cr_number} commissioned by user ${userId}`);
      res.json({ success: true, message: `${cr.cr_number} commissioned`, id, newStatus: 'commissioned' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/commissioning-readiness/:id/handover', ensureAuthenticated, requirePageAccess('commissioning-handover'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_commissioning_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { handoverNotes, handoverDate, handoverAcceptedBy, handoverAcceptanceNote } = req.body || {};

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Senior Manager level and above can execute handover.');
      }

      const existing = await db.execute(sql`SELECT * FROM epc_commissioning_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found');
      const cr = existing.rows[0] as any;

      if (cr.status !== 'commissioned' && cr.status !== 'ready_for_handover') {
        return sendBusinessError(res, `Cannot handover: status is '${cr.status}', expected 'commissioned' or 'ready_for_handover'.`);
      }

      if (!cr.test_certificates_available) {
        return sendBusinessError(res, 'Cannot handover: test certificates are not available.');
      }

      if (cr.training_required && !cr.training_notes) {
        return sendBusinessError(res, 'Cannot handover: training is required but no training notes/confirmation provided.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcCommissioningReadiness)
          .set({
            status: 'handed_over', handedOverBy: userId, handedOverAt: new Date(),
            handoverDate: handoverDate ? new Date(handoverDate) : new Date(),
            handoverNotes: handoverNotes || cr.handover_notes,
            handoverAcceptedBy: handoverAcceptedBy || null,
            handoverAcceptanceNote: handoverAcceptanceNote || null,
            updatedAt: new Date(),
          })
          .where(eq(epcCommissioningReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${cr.project_id}, 'commissioning_readiness.handed_over', ${JSON.stringify({
            crId: id, crNumber: cr.cr_number, handedOverBy: userId, projectItemId: cr.project_item_id,
            handoverDate: handoverDate || new Date().toISOString(),
            handoverAcceptedBy: handoverAcceptedBy || null,
          })}::jsonb, 'commissioning', NOW())`);
      });

      console.log(`[CR] ${cr.cr_number} handed over by user ${userId}`);
      res.json({ success: true, message: `${cr.cr_number} handed over`, id, newStatus: 'handed_over' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/commissioning-readiness/:id/cancel', ensureAuthenticated, requirePageAccess('commissioning-handover'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_commissioning_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'cancelReason is required.');

      const existing = await db.execute(sql`SELECT * FROM epc_commissioning_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found');
      const cr = existing.rows[0] as any;

      if (cr.status === 'canceled' || cr.status === 'superseded' || cr.status === 'handed_over' || cr.status === 'closed') {
        return sendBusinessError(res, `Cannot cancel: status is '${cr.status}' (terminal state).`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcCommissioningReadiness)
          .set({ status: 'canceled', cancelledBy: userId, cancelledAt: new Date(), cancelReason, updatedAt: new Date() })
          .where(eq(epcCommissioningReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${cr.project_id}, 'commissioning_readiness.canceled', ${JSON.stringify({
            crId: id, crNumber: cr.cr_number, cancelledBy: userId, cancelReason,
            previousStatus: cr.status, projectItemId: cr.project_item_id,
          })}::jsonb, 'commissioning', NOW())`);
      });

      console.log(`[CR] ${cr.cr_number} canceled by user ${userId}: ${cancelReason}`);
      res.json({ success: true, message: `${cr.cr_number} canceled`, id, newStatus: 'canceled' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/commissioning-readiness/:id/supersede', ensureAuthenticated, requirePageAccess('commissioning-handover'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_commissioning_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { supersessionReason, newCrId } = req.body || {};

      if (!supersessionReason) return sendValidationError(res, 'supersessionReason is required.');

      const existing = await db.execute(sql`SELECT * FROM epc_commissioning_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found');
      const cr = existing.rows[0] as any;

      if (cr.status === 'canceled' || cr.status === 'superseded' || cr.status === 'handed_over' || cr.status === 'closed') {
        return sendBusinessError(res, `Cannot supersede: status is '${cr.status}' (terminal state).`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcCommissioningReadiness)
          .set({
            status: 'superseded', supersededById: newCrId || null, supersededAt: new Date(),
            supersessionReason, updatedAt: new Date(),
          })
          .where(eq(epcCommissioningReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${cr.project_id}, 'commissioning_readiness.superseded', ${JSON.stringify({
            crId: id, crNumber: cr.cr_number, supersededBy: userId, supersessionReason,
            newCrId: newCrId || null, previousStatus: cr.status, projectItemId: cr.project_item_id,
          })}::jsonb, 'commissioning', NOW())`);
      });

      console.log(`[CR] ${cr.cr_number} superseded by user ${userId}: ${supersessionReason}`);
      res.json({ success: true, message: `${cr.cr_number} superseded`, id, newStatus: 'superseded' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/commissioning-readiness/:id', ensureAuthenticated, requirePageAccess('commissioning-handover'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;

      const existing = await db.execute(sql`SELECT * FROM epc_commissioning_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found');
      const cr = existing.rows[0] as any;

      await guardProjectNotFrozen(cr.project_id, res);
      if (cr.status === 'canceled' || cr.status === 'superseded' || cr.status === 'handed_over' || cr.status === 'closed') {
        return sendBusinessError(res, `Cannot update: status is '${cr.status}' (terminal state).`);
      }

      const checklistFields = [
        'testCertificatesAvailable', 'warrantyDocumentsAvailable', 'operationManualAvailable',
        'sparePartsListAvailable', 'trainingRequired', 'siteReadinessConfirmed',
        'utilitiesConfirmed', 'documentationComplete', 'installationRequired',
      ];
      const hasChecklistUpdate = checklistFields.some(f => req.body[f] !== undefined);
      if (hasChecklistUpdate && roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to update commissioning checklist items.');
      }

      const allowedFields = [
        'siteName', 'siteAddress', 'siteContactPerson', 'siteContactPhone',
        'siteReadinessConfirmed', 'siteReadinessNote', 'installationRequired', 'installationNotes',
        'utilitiesConfirmed', 'utilitiesNote', 'documentationComplete', 'documentationNote',
        'testCertificatesAvailable', 'warrantyDocumentsAvailable', 'operationManualAvailable',
        'sparePartsListAvailable', 'trainingRequired', 'trainingNotes',
        'commissioningNotes', 'handoverNotes',
      ];
      const updates: Record<string, any> = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      await db.update(epcCommissioningReadiness).set(updates).where(eq(epcCommissioningReadiness.id, id));

      console.log(`[CR] ${cr.cr_number} updated by user ${userId}`);
      res.json({ success: true, message: `${cr.cr_number} updated`, id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/commissioning-readiness/:id/open-punch-list', ensureAuthenticated, requirePageAccess('commissioning-handover'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_commissioning_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { punchListNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM epc_commissioning_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found');
      const cr = existing.rows[0] as any;

      if (cr.status !== 'commissioned') {
        return sendBusinessError(res, `Cannot open punch list: status is '${cr.status}', expected 'commissioned'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcCommissioningReadiness)
          .set({ status: 'punch_list_open', commissioningNote: punchListNote || cr.commissioning_note, updatedAt: new Date() })
          .where(eq(epcCommissioningReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${cr.project_id}, 'commissioning_readiness.punch_list_opened', ${JSON.stringify({
            crId: id, crNumber: cr.cr_number, openedBy: userId, projectItemId: cr.project_item_id,
            punchListNote: punchListNote || null,
          })}::jsonb, 'commissioning', NOW())`);
      });

      console.log(`[CR] ${cr.cr_number} punch list opened by user ${userId}`);
      res.json({ success: true, message: `${cr.cr_number} punch list opened`, id, newStatus: 'punch_list_open' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/commissioning-readiness/:id/resolve-punch-list', ensureAuthenticated, requirePageAccess('commissioning-handover'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_commissioning_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { resolutionNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM epc_commissioning_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found');
      const cr = existing.rows[0] as any;

      if (cr.status !== 'punch_list_open') {
        return sendBusinessError(res, `Cannot resolve punch list: status is '${cr.status}', expected 'punch_list_open'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcCommissioningReadiness)
          .set({ status: 'ready_for_handover', readyNote: resolutionNote || cr.ready_note, updatedAt: new Date() })
          .where(eq(epcCommissioningReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${cr.project_id}, 'commissioning_readiness.punch_list_resolved', ${JSON.stringify({
            crId: id, crNumber: cr.cr_number, resolvedBy: userId, projectItemId: cr.project_item_id,
            resolutionNote: resolutionNote || null,
          })}::jsonb, 'commissioning', NOW())`);
      });

      console.log(`[CR] ${cr.cr_number} punch list resolved, ready for handover by user ${userId}`);
      res.json({ success: true, message: `${cr.cr_number} ready for handover`, id, newStatus: 'ready_for_handover' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/commissioning-readiness/:id/close', ensureAuthenticated, requirePageAccess('commissioning-handover'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Senior Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_commissioning_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { closingNote } = req.body || {};

      const existing = await db.execute(sql`SELECT * FROM epc_commissioning_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found');
      const cr = existing.rows[0] as any;

      if (cr.status !== 'handed_over') {
        return sendBusinessError(res, `Cannot close: status is '${cr.status}', expected 'handed_over'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcCommissioningReadiness)
          .set({ status: 'closed', handoverNotes: closingNote || cr.handover_notes, updatedAt: new Date() })
          .where(eq(epcCommissioningReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${cr.project_id}, 'commissioning_readiness.closed', ${JSON.stringify({
            crId: id, crNumber: cr.cr_number, closedBy: userId, projectItemId: cr.project_item_id,
            closingNote: closingNote || null,
          })}::jsonb, 'commissioning', NOW())`);
      });

      console.log(`[CR] ${cr.cr_number} closed by user ${userId}`);
      res.json({ success: true, message: `${cr.cr_number} closed`, id, newStatus: 'closed' });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== EPC INVOICE TRIGGER / BILLING READINESS BRIDGE ====================

  app.get('/api/projects/:projectId/billing-readiness', ensureAuthenticated, requirePageAccess('invoices'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const user = req.user as any;
      const visibilityScope = (req as any).visibilityScope || 'department_records';
      const brOwnershipConfig: OwnershipFilterConfig = { createdByColumn: 'created_by', mode: 'strict' };
      const { whereSql } = buildOwnershipWhereClause(user, visibilityScope, brOwnershipConfig, 'b');

      let query = sql`SELECT b.*,
              u1.username AS created_by_name, u2.username AS reviewed_by_name,
              u3.username AS ready_marked_by_name, u4.username AS invoiced_by_name,
              u5.username AS cancelled_by_name,
              pi.description AS project_item_description,
              d.dispatch_number AS linked_dispatch_number,
              cr.cr_number AS linked_cr_number,
              po.po_number, wo.wo_number
            FROM epc_billing_readiness b
            LEFT JOIN users u1 ON b.created_by = u1.id
            LEFT JOIN users u2 ON b.reviewed_by = u2.id
            LEFT JOIN users u3 ON b.ready_marked_by = u3.id
            LEFT JOIN users u4 ON b.invoiced_by = u4.id
            LEFT JOIN users u5 ON b.cancelled_by = u5.id
            LEFT JOIN project_items pi ON b.project_item_id = pi.id
            LEFT JOIN epc_dispatch_records d ON b.dispatch_record_id = d.id
            LEFT JOIN epc_commissioning_readiness cr ON b.commissioning_readiness_id = cr.id
            LEFT JOIN epc_purchase_orders po ON b.epc_purchase_order_id = po.id
            LEFT JOIN epc_work_orders wo ON b.epc_work_order_id = wo.id`;
      query = sql`${query} WHERE b.project_id = ${projectId}`;
      if (whereSql) query = sql`${query} AND ${whereSql}`;
      query = sql`${query} ORDER BY b.created_at DESC`;

      const result = await db.execute(query);
      const rows = result.rows;
      if (roleHierarchy[user.role] > roleHierarchy['Manager']) {
        const amountFields = ['total_amount', 'gross_amount', 'net_amount', 'tax_amount', 'discount_amount'];
        for (const row of rows as any[]) {
          for (const f of amountFields) { if (f in row) row[f] = null; }
        }
      }
      res.json(rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/billing-readiness/:id', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const result = await db.execute(
        sql`SELECT b.*,
              u1.username AS created_by_name, u2.username AS reviewed_by_name,
              u3.username AS ready_marked_by_name, u4.username AS invoiced_by_name,
              u5.username AS cancelled_by_name,
              pi.description AS project_item_description,
              d.dispatch_number AS linked_dispatch_number,
              cr.cr_number AS linked_cr_number,
              po.po_number, wo.wo_number
            FROM epc_billing_readiness b
            LEFT JOIN users u1 ON b.created_by = u1.id
            LEFT JOIN users u2 ON b.reviewed_by = u2.id
            LEFT JOIN users u3 ON b.ready_marked_by = u3.id
            LEFT JOIN users u4 ON b.invoiced_by = u4.id
            LEFT JOIN users u5 ON b.cancelled_by = u5.id
            LEFT JOIN project_items pi ON b.project_item_id = pi.id
            LEFT JOIN epc_dispatch_records d ON b.dispatch_record_id = d.id
            LEFT JOIN epc_commissioning_readiness cr ON b.commissioning_readiness_id = cr.id
            LEFT JOIN epc_purchase_orders po ON b.epc_purchase_order_id = po.id
            LEFT JOIN epc_work_orders wo ON b.epc_work_order_id = wo.id
            WHERE b.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Billing readiness record not found');

      const record = result.rows[0] as any;
      const user = req.user as any;
      const { visibilityScope } = await checkProjectMembership(user.id, user.role, record.project_id);
      if (!checkRecordOwnership(record, null, user, visibilityScope, 'strict')) {
        return denyRecordAccess(res, req);
      }

      if (roleHierarchy[user.role] > roleHierarchy['Manager']) {
        const amountFields = ['total_amount', 'gross_amount', 'net_amount', 'tax_amount', 'discount_amount'];
        for (const f of amountFields) { if (f in record) record[f] = null; }
      }
      res.json(record);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/billing-readiness', ensureAuthenticated, requirePageAccess('invoices'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (!(await guardProjectNotFrozen(projectId, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const {
        billingBasis, dispatchRecordId, commissioningReadinessId,
        milestoneName, milestoneDescription, unitPrice, totalAmount,
        taxApplicable, taxPercentage, taxAmount, grossAmount, currency,
        customerName, customerAddress, customerGst, customerPoNumber, customerPoDate,
        billingAddress, shippingAddress, billingNotes, exceptionNotes,
      } = req.body;

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Manager level and above can create billing readiness records.');
      }

      if (!billingBasis || !['dispatch', 'commissioning', 'handover'].includes(billingBasis)) {
        return sendValidationError(res, 'billingBasis is required and must be one of: dispatch, commissioning, handover.');
      }

      let sourceRecord: any = null;
      let idempotencyField = '';
      let idempotencyValue: number | null = null;

      if (billingBasis === 'dispatch') {
        if (!dispatchRecordId) return sendValidationError(res, 'dispatchRecordId is required for dispatch-based billing.');
        const dispResult = await db.execute(
          sql`SELECT * FROM epc_dispatch_records WHERE id = ${dispatchRecordId} AND project_id = ${projectId}`
        );
        if (dispResult.rows.length === 0) return sendNotFound(res, 'Dispatch record not found in this project.');
        sourceRecord = dispResult.rows[0] as any;
        if (sourceRecord.status !== 'shipped' && sourceRecord.status !== 'delivered') {
          return sendBusinessError(res, `Cannot create billing readiness: dispatch status is '${sourceRecord.status}', expected 'shipped' or 'delivered'.`);
        }
        idempotencyField = 'dispatch_record_id';
        idempotencyValue = dispatchRecordId;
      } else if (billingBasis === 'commissioning') {
        if (!commissioningReadinessId) return sendValidationError(res, 'commissioningReadinessId is required for commissioning-based billing.');
        const crResult = await db.execute(
          sql`SELECT * FROM epc_commissioning_readiness WHERE id = ${commissioningReadinessId} AND project_id = ${projectId}`
        );
        if (crResult.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found in this project.');
        sourceRecord = crResult.rows[0] as any;
        if (sourceRecord.status !== 'commissioned' && sourceRecord.status !== 'handed_over') {
          return sendBusinessError(res, `Cannot create billing readiness: commissioning status is '${sourceRecord.status}', expected 'commissioned' or 'handed_over'.`);
        }
        idempotencyField = 'commissioning_readiness_id';
        idempotencyValue = commissioningReadinessId;
      } else if (billingBasis === 'handover') {
        if (!commissioningReadinessId) return sendValidationError(res, 'commissioningReadinessId is required for handover-based billing.');
        const crResult = await db.execute(
          sql`SELECT * FROM epc_commissioning_readiness WHERE id = ${commissioningReadinessId} AND project_id = ${projectId}`
        );
        if (crResult.rows.length === 0) return sendNotFound(res, 'Commissioning readiness record not found in this project.');
        sourceRecord = crResult.rows[0] as any;
        if (sourceRecord.status !== 'handed_over') {
          return sendBusinessError(res, `Cannot create billing readiness: commissioning status is '${sourceRecord.status}', expected 'handed_over'.`);
        }
        idempotencyField = 'commissioning_readiness_id';
        idempotencyValue = commissioningReadinessId;
      }

      const existingCheck = await db.execute(
        sql`SELECT id, br_number FROM epc_billing_readiness
            WHERE ${sql.raw(idempotencyField)} = ${idempotencyValue}
              AND billing_basis = ${billingBasis}
              AND status NOT IN ('canceled', 'superseded')`
      );
      if (existingCheck.rows.length > 0) {
        const existing = existingCheck.rows[0] as any;
        return sendBusinessError(res, `Active billing readiness ${existing.br_number} already exists for this ${billingBasis} context (id: ${existing.id}).`);
      }

      let brCreated: { id: number; brNumber: string; billingBasis: string; itemCode: string; itemDescription: string } | null = null;
      await db.transaction(async (tx) => {
        const brNumber = await epcCoding.generateDocumentNumber(projectId, 'BR', tx);
        const inserted = await tx.insert(epcBillingReadiness).values({
          brNumber,
          projectId,
          projectItemId: sourceRecord.project_item_id || null,
          dispatchRecordId: billingBasis === 'dispatch' ? dispatchRecordId : (sourceRecord.dispatch_record_id || null),
          commissioningReadinessId: (billingBasis === 'commissioning' || billingBasis === 'handover') ? commissioningReadinessId : null,
          dispatchReadinessId: sourceRecord.dispatch_readiness_id || null,
          epcPurchaseOrderId: sourceRecord.epc_purchase_order_id || null,
          epcWorkOrderId: sourceRecord.epc_work_order_id || null,
          inspectionExecutionId: sourceRecord.inspection_execution_id || null,
          qualityPlanId: sourceRecord.quality_plan_id || null,
          masterItemId: sourceRecord.master_item_id || null,
          billingBasis,
          milestoneName: milestoneName || null,
          milestoneDescription: milestoneDescription || null,
          itemCode: sourceRecord.item_code || null,
          itemDescription: sourceRecord.item_description || null,
          itemSpecification: sourceRecord.item_specification || null,
          uom: sourceRecord.uom || null,
          quantity: sourceRecord.quantity || sourceRecord.dispatch_quantity || null,
          unitPrice: unitPrice || null,
          totalAmount: totalAmount || null,
          currency: currency || 'INR',
          taxApplicable: taxApplicable !== undefined ? taxApplicable : true,
          taxPercentage: taxPercentage || null,
          taxAmount: taxAmount || null,
          grossAmount: grossAmount || null,
          dispatchNumber: sourceRecord.dispatch_number || null,
          dispatchDate: sourceRecord.dispatch_date || null,
          deliveryDate: sourceRecord.actual_delivery_date || sourceRecord.delivery_date || null,
          crNumber: sourceRecord.cr_number || null,
          commissioningDate: sourceRecord.commissioning_date || null,
          handoverDate: sourceRecord.handover_date || null,
          customerName: customerName || null,
          customerAddress: customerAddress || null,
          customerGst: customerGst || null,
          customerPoNumber: customerPoNumber || null,
          customerPoDate: customerPoDate ? new Date(customerPoDate) : null,
          billingAddress: billingAddress || null,
          shippingAddress: shippingAddress || sourceRecord.delivery_address || sourceRecord.site_address || null,
          billingNotes: billingNotes || null,
          exceptionNotes: exceptionNotes || null,
          sourceType: sourceRecord.source_type || 'purchase_order',
          status: 'draft',
          createdBy: userId,
        }).returning();

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${projectId}, 'billing_readiness.created', ${JSON.stringify({
            brId: inserted[0].id, brNumber, billingBasis,
            dispatchRecordId: billingBasis === 'dispatch' ? dispatchRecordId : null,
            commissioningReadinessId: (billingBasis === 'commissioning' || billingBasis === 'handover') ? commissioningReadinessId : null,
            projectItemId: sourceRecord.project_item_id, createdBy: userId,
          })}::jsonb, 'billing', NOW())`);

        brCreated = { id: inserted[0].id, brNumber, billingBasis, itemCode: sourceRecord.item_code || '', itemDescription: sourceRecord.item_description || '' };
        console.log(`[BR] Billing readiness ${brNumber} created (basis: ${billingBasis}) by user ${userId}`);
        res.status(201).json({ success: true, message: `Billing readiness ${brNumber} created`, record: inserted[0] });
      });

      // Auto-create invoice preparation and approval tasks (INV gate)
      if (brCreated) {
        try {
          const { id: brId, brNumber, billingBasis: basis, itemCode, itemDescription } = brCreated as any;
          const projCode = await resolveProjectCode(projectId);
          const itemLabel = itemDescription || itemCode;
          const invPrepAssignee = await resolveEpcAssignee('INV_prepare', projectId, String(userId));
          if (invPrepAssignee.userId) {
            await createEpcTask({
              projectId, entityType: 'billing_readiness', recordId: brId, actionCode: 'prepare_invoice',
              title: `Prepare Invoice for ${brNumber} — ${projCode}`,
              description: `Billing readiness ${brNumber} (basis: ${basis}) is ready for invoicing. Item: ${itemLabel}. Please prepare the invoice and submit for approval.`,
              assignedTo: invPrepAssignee.userId, createdBy: userId, priority: 'High', dueDays: 3,
            });
            console.log(`[BR] INV_prepare task created for ${brNumber} → user ${invPrepAssignee.userId}`);
          }
          const invApproveAssignee = await resolveEpcAssignee('INV_approve', projectId, String(userId));
          if (invApproveAssignee.userId) {
            await createEpcTask({
              projectId, entityType: 'billing_readiness', recordId: brId, actionCode: 'approve_invoice',
              title: `Approve Invoice for ${brNumber} — ${projCode}`,
              description: `Review and approve the invoice for billing readiness ${brNumber} (basis: ${basis}). Item: ${itemLabel}.`,
              assignedTo: invApproveAssignee.userId, createdBy: userId, priority: 'High', dueDays: 5,
            });
            console.log(`[BR] INV_approve task created for ${brNumber} → user ${invApproveAssignee.userId}`);
          }
        } catch (taskErr: any) {
          console.error(`[BR] Non-critical: INV task creation failed:`, taskErr.message);
        }
      }
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/billing-readiness/:id/submit-review', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_billing_readiness', id, res))) return;
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM epc_billing_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Billing readiness record not found');
      const br = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(br, req.user as any, 'strict', req, res))) return;

      if (br.status !== 'draft') {
        return sendBusinessError(res, `Cannot submit for review: status is '${br.status}', expected 'draft'.`);
      }

      if (!br.total_amount && !br.unit_price) {
        return sendBusinessError(res, 'Cannot submit for review: total_amount or unit_price must be set before review.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcBillingReadiness)
          .set({ status: 'under_review', updatedAt: new Date() })
          .where(eq(epcBillingReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${br.project_id}, 'billing_readiness.submitted_for_review', ${JSON.stringify({
            brId: id, brNumber: br.br_number, submittedBy: userId, billingBasis: br.billing_basis,
          })}::jsonb, 'billing', NOW())`);
      });

      console.log(`[BR] ${br.br_number} submitted for review by user ${userId}`);
      res.json({ success: true, message: `${br.br_number} submitted for review`, id, newStatus: 'under_review' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/billing-readiness/:id/approve', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_billing_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { reviewNote, readyNote } = req.body || {};

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Senior Manager level and above can approve billing readiness.');
      }

      const existing = await db.execute(sql`SELECT * FROM epc_billing_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Billing readiness record not found');
      const br = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(br, req.user as any, 'strict', req, res))) return;

      if (br.status !== 'under_review') {
        return sendBusinessError(res, `Cannot approve: status is '${br.status}', expected 'under_review'.`);
      }

      if (br.created_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the creator cannot also approve the billing readiness.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcBillingReadiness)
          .set({
            status: 'ready_for_invoice',
            reviewedBy: userId, reviewedAt: new Date(), reviewNote: reviewNote || null,
            readyMarkedBy: userId, readyMarkedAt: new Date(), readyNote: readyNote || null,
            updatedAt: new Date(),
          })
          .where(eq(epcBillingReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${br.project_id}, 'billing_readiness.approved', ${JSON.stringify({
            brId: id, brNumber: br.br_number, approvedBy: userId, billingBasis: br.billing_basis,
            totalAmount: br.total_amount, grossAmount: br.gross_amount,
          })}::jsonb, 'billing', NOW())`);
      });

      console.log(`[BR] ${br.br_number} approved (ready_for_invoice) by user ${userId}`);
      res.json({ success: true, message: `${br.br_number} approved and ready for invoice`, id, newStatus: 'ready_for_invoice' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/billing-readiness/:id/mark-invoiced', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_billing_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { invoiceReference, invoiceNote } = req.body || {};

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Senior Manager level and above can mark billing as invoiced.');
      }

      if (!invoiceReference) return sendValidationError(res, 'invoiceReference is required to mark as invoiced.');

      const existing = await db.execute(sql`SELECT * FROM epc_billing_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Billing readiness record not found');
      const br = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(br, req.user as any, 'strict', req, res))) return;

      if (br.status !== 'ready_for_invoice') {
        return sendBusinessError(res, `Cannot mark invoiced: status is '${br.status}', expected 'ready_for_invoice'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcBillingReadiness)
          .set({
            status: 'invoiced', invoicedBy: userId, invoicedAt: new Date(),
            invoiceReference, invoiceNote: invoiceNote || null, updatedAt: new Date(),
          })
          .where(eq(epcBillingReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${br.project_id}, 'billing_readiness.invoiced', ${JSON.stringify({
            brId: id, brNumber: br.br_number, invoicedBy: userId, invoiceReference,
            billingBasis: br.billing_basis, totalAmount: br.total_amount, grossAmount: br.gross_amount,
          })}::jsonb, 'billing', NOW())`);
      });

      console.log(`[BR] ${br.br_number} marked invoiced (ref: ${invoiceReference}) by user ${userId}`);
      res.json({ success: true, message: `${br.br_number} marked as invoiced`, id, newStatus: 'invoiced', invoiceReference });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/billing-readiness/:id/cancel', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_billing_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'cancelReason is required.');

      const existing = await db.execute(sql`SELECT * FROM epc_billing_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Billing readiness record not found');
      const br = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(br, req.user as any, 'strict', req, res))) return;

      if (br.status === 'canceled' || br.status === 'superseded' || br.status === 'invoiced') {
        return sendBusinessError(res, `Cannot cancel: status is '${br.status}' (terminal state).`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcBillingReadiness)
          .set({ status: 'canceled', cancelledBy: userId, cancelledAt: new Date(), cancelReason, updatedAt: new Date() })
          .where(eq(epcBillingReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${br.project_id}, 'billing_readiness.canceled', ${JSON.stringify({
            brId: id, brNumber: br.br_number, cancelledBy: userId, cancelReason,
            previousStatus: br.status, billingBasis: br.billing_basis,
          })}::jsonb, 'billing', NOW())`);
      });

      console.log(`[BR] ${br.br_number} canceled by user ${userId}: ${cancelReason}`);
      res.json({ success: true, message: `${br.br_number} canceled`, id, newStatus: 'canceled' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/billing-readiness/:id/supersede', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_billing_readiness', id, res))) return;
      const userId = (req.user as any)?.id;
      const { supersessionReason, newBrId } = req.body || {};

      if (!supersessionReason) return sendValidationError(res, 'supersessionReason is required.');

      const existing = await db.execute(sql`SELECT * FROM epc_billing_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Billing readiness record not found');
      const br = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(br, req.user as any, 'strict', req, res))) return;

      if (br.status === 'canceled' || br.status === 'superseded' || br.status === 'invoiced') {
        return sendBusinessError(res, `Cannot supersede: status is '${br.status}' (terminal state).`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcBillingReadiness)
          .set({
            status: 'superseded', supersededById: newBrId || null, supersededAt: new Date(),
            supersessionReason, updatedAt: new Date(),
          })
          .where(eq(epcBillingReadiness.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${br.project_id}, 'billing_readiness.superseded', ${JSON.stringify({
            brId: id, brNumber: br.br_number, supersededBy: userId, supersessionReason,
            newBrId: newBrId || null, previousStatus: br.status, billingBasis: br.billing_basis,
          })}::jsonb, 'billing', NOW())`);
      });

      console.log(`[BR] ${br.br_number} superseded by user ${userId}: ${supersessionReason}`);
      res.json({ success: true, message: `${br.br_number} superseded`, id, newStatus: 'superseded' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/billing-readiness/:id', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_billing_readiness', id, res))) return;
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM epc_billing_readiness WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Billing readiness record not found');
      const br = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(br, req.user as any, 'strict', req, res))) return;

      if (br.status === 'canceled' || br.status === 'superseded' || br.status === 'invoiced') {
        return sendBusinessError(res, `Cannot update: status is '${br.status}' (terminal state).`);
      }

      const allowedFields = [
        'milestoneName', 'milestoneDescription', 'unitPrice', 'totalAmount',
        'taxApplicable', 'taxPercentage', 'taxAmount', 'grossAmount', 'currency',
        'customerName', 'customerAddress', 'customerGst', 'customerPoNumber', 'customerPoDate',
        'billingAddress', 'shippingAddress', 'billingNotes', 'exceptionNotes', 'supportingDocuments',
      ];
      const updates: Record<string, any> = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          if (field === 'customerPoDate') {
            updates[field] = req.body[field] ? new Date(req.body[field]) : null;
          } else {
            updates[field] = req.body[field];
          }
        }
      }

      await db.update(epcBillingReadiness).set(updates).where(eq(epcBillingReadiness.id, id));

      console.log(`[BR] ${br.br_number} updated by user ${userId}`);
      res.json({ success: true, message: `${br.br_number} updated`, id });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== EPC ACTUAL INVOICE BRIDGE ====================

  app.get('/api/projects/:projectId/epc-invoices', ensureAuthenticated, requirePageAccess('invoices'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const user = req.user as any;
      const visibilityScope = (req as any).visibilityScope || 'department_records';
      const invOwnershipConfig: OwnershipFilterConfig = { createdByColumn: 'created_by', mode: 'strict' };
      const { whereSql } = buildOwnershipWhereClause(user, visibilityScope, invOwnershipConfig, 'i');

      let query = sql`SELECT i.*,
              u1.username AS created_by_name, u2.username AS approved_by_name,
              u3.username AS issued_by_name, u4.username AS cancelled_by_name,
              pi.description AS project_item_description,
              br.br_number AS linked_br_number,
              d.dispatch_number AS linked_dispatch_number,
              cr.cr_number AS linked_cr_number,
              po.po_number, wo.wo_number
            FROM epc_invoices i
            LEFT JOIN users u1 ON i.created_by = u1.id
            LEFT JOIN users u2 ON i.approved_by = u2.id
            LEFT JOIN users u3 ON i.issued_by = u3.id
            LEFT JOIN users u4 ON i.cancelled_by = u4.id
            LEFT JOIN project_items pi ON i.project_item_id = pi.id
            LEFT JOIN epc_billing_readiness br ON i.billing_readiness_id = br.id
            LEFT JOIN epc_dispatch_records d ON i.dispatch_record_id = d.id
            LEFT JOIN epc_commissioning_readiness cr ON i.commissioning_readiness_id = cr.id
            LEFT JOIN epc_purchase_orders po ON i.epc_purchase_order_id = po.id
            LEFT JOIN epc_work_orders wo ON i.epc_work_order_id = wo.id`;
      query = sql`${query} WHERE i.project_id = ${projectId}`;
      if (whereSql) query = sql`${query} AND ${whereSql}`;
      query = sql`${query} ORDER BY i.created_at DESC`;

      const result = await db.execute(query);
      const rows = result.rows;
      if (roleHierarchy[user.role] > roleHierarchy['Manager']) {
        const amountFields = ['gross_amount', 'net_amount', 'tax_amount', 'amount_paid', 'amount_outstanding', 'discount_amount'];
        for (const row of rows as any[]) {
          for (const f of amountFields) { if (f in row) row[f] = null; }
        }
      }
      res.json(rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/epc-invoices/:id', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const result = await db.execute(
        sql`SELECT i.*,
              u1.username AS created_by_name, u2.username AS approved_by_name,
              u3.username AS issued_by_name, u4.username AS cancelled_by_name,
              pi.description AS project_item_description,
              br.br_number AS linked_br_number,
              d.dispatch_number AS linked_dispatch_number,
              cr.cr_number AS linked_cr_number,
              po.po_number, wo.wo_number
            FROM epc_invoices i
            LEFT JOIN users u1 ON i.created_by = u1.id
            LEFT JOIN users u2 ON i.approved_by = u2.id
            LEFT JOIN users u3 ON i.issued_by = u3.id
            LEFT JOIN users u4 ON i.cancelled_by = u4.id
            LEFT JOIN project_items pi ON i.project_item_id = pi.id
            LEFT JOIN epc_billing_readiness br ON i.billing_readiness_id = br.id
            LEFT JOIN epc_dispatch_records d ON i.dispatch_record_id = d.id
            LEFT JOIN epc_commissioning_readiness cr ON i.commissioning_readiness_id = cr.id
            LEFT JOIN epc_purchase_orders po ON i.epc_purchase_order_id = po.id
            LEFT JOIN epc_work_orders wo ON i.epc_work_order_id = wo.id
            WHERE i.id = ${id}`
      );
      if (result.rows.length === 0) return sendNotFound(res, 'Invoice not found');

      const record = result.rows[0] as any;
      const user = req.user as any;
      const { visibilityScope } = await checkProjectMembership(user.id, user.role, record.project_id);
      if (!checkRecordOwnership(record, null, user, visibilityScope, 'strict')) {
        return denyRecordAccess(res, req);
      }

      if (roleHierarchy[user.role] > roleHierarchy['Manager']) {
        const amountFields = ['gross_amount', 'net_amount', 'tax_amount', 'amount_paid', 'amount_outstanding', 'discount_amount'];
        for (const f of amountFields) { if (f in record) record[f] = null; }
      }
      res.json(record);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/epc-invoices', ensureAuthenticated, requirePageAccess('invoices'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (!(await guardProjectNotFrozen(projectId, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const {
        billingReadinessId, invoiceDate, dueDate, paymentTerms,
        invoiceNotes, internalNotes, discountAmount, discountNote,
      } = req.body;

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Manager level and above can create invoices.');
      }

      if (!billingReadinessId) return sendValidationError(res, 'billingReadinessId is required.');

      const brResult = await db.execute(
        sql`SELECT * FROM epc_billing_readiness WHERE id = ${billingReadinessId} AND project_id = ${projectId}`
      );
      if (brResult.rows.length === 0) return sendNotFound(res, 'Billing readiness record not found in this project.');
      const br = brResult.rows[0] as any;

      if (br.status !== 'ready_for_invoice') {
        return sendBusinessError(res, `Cannot create invoice: billing readiness status is '${br.status}', expected 'ready_for_invoice'.`);
      }

      const existingCheck = await db.execute(
        sql`SELECT id, invoice_number FROM epc_invoices
            WHERE billing_readiness_id = ${billingReadinessId}
              AND status NOT IN ('canceled', 'superseded')`
      );
      if (existingCheck.rows.length > 0) {
        const existing = existingCheck.rows[0] as any;
        return sendBusinessError(res, `Active invoice ${existing.invoice_number} already exists for this billing readiness (id: ${existing.id}).`);
      }

      const totalAmt = parseFloat(br.total_amount || '0');
      const disc = parseFloat(discountAmount || '0');
      const taxAmt = parseFloat(br.tax_amount || '0');
      const computedGross = totalAmt - disc + taxAmt;
      const grossAmt = computedGross > 0 ? computedGross : parseFloat(br.gross_amount || '0');

      await db.transaction(async (tx) => {
        const invoiceNumber = await epcCoding.generateDocumentNumber(projectId, 'INV', tx);
        const inserted = await tx.insert(epcInvoices).values({
          invoiceNumber,
          projectId,
          projectItemId: br.project_item_id || null,
          billingReadinessId,
          dispatchRecordId: br.dispatch_record_id || null,
          commissioningReadinessId: br.commissioning_readiness_id || null,
          dispatchReadinessId: br.dispatch_readiness_id || null,
          epcPurchaseOrderId: br.epc_purchase_order_id || null,
          epcWorkOrderId: br.epc_work_order_id || null,
          inspectionExecutionId: br.inspection_execution_id || null,
          qualityPlanId: br.quality_plan_id || null,
          masterItemId: br.master_item_id || null,
          billingBasis: br.billing_basis,
          milestoneName: br.milestone_name || null,
          milestoneDescription: br.milestone_description || null,
          itemCode: br.item_code || null,
          itemDescription: br.item_description || null,
          itemSpecification: br.item_specification || null,
          uom: br.uom || null,
          quantity: br.quantity || null,
          unitPrice: br.unit_price || null,
          totalAmount: br.total_amount || '0',
          currency: br.currency || 'INR',
          taxApplicable: br.tax_applicable !== false,
          taxPercentage: br.tax_percentage || null,
          taxAmount: br.tax_amount || null,
          grossAmount: String(grossAmt),
          amountPaid: '0',
          amountOutstanding: String(grossAmt),
          discountAmount: discountAmount ? String(disc) : '0',
          discountNote: discountNote || null,
          customerName: br.customer_name || null,
          customerAddress: br.customer_address || null,
          customerGst: br.customer_gst || null,
          customerPoNumber: br.customer_po_number || null,
          customerPoDate: br.customer_po_date || null,
          billingAddress: br.billing_address || null,
          shippingAddress: br.shipping_address || null,
          dispatchNumber: br.dispatch_number || null,
          dispatchDate: br.dispatch_date || null,
          deliveryDate: br.delivery_date || null,
          crNumber: br.cr_number || null,
          commissioningDate: br.commissioning_date || null,
          handoverDate: br.handover_date || null,
          brNumber: br.br_number,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          dueDate: dueDate ? new Date(dueDate) : null,
          paymentTerms: paymentTerms || null,
          invoiceNotes: invoiceNotes || null,
          internalNotes: internalNotes || null,
          sourceType: br.source_type || 'purchase_order',
          status: 'draft',
          createdBy: userId,
        }).returning();

        await tx.update(epcBillingReadiness)
          .set({ status: 'invoiced', invoicedBy: userId, invoicedAt: new Date(), invoiceReference: invoiceNumber, updatedAt: new Date() })
          .where(eq(epcBillingReadiness.id, billingReadinessId));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${projectId}, 'epc_invoice.created', ${JSON.stringify({
            invoiceId: inserted[0].id, invoiceNumber, billingReadinessId, brNumber: br.br_number,
            billingBasis: br.billing_basis, totalAmount: br.total_amount, grossAmount: String(grossAmt),
            projectItemId: br.project_item_id, createdBy: userId,
          })}::jsonb, 'invoice', NOW())`);

        console.log(`[INV] Invoice ${invoiceNumber} created from BR ${br.br_number} by user ${userId}`);
        res.status(201).json({ success: true, message: `Invoice ${invoiceNumber} created`, record: inserted[0] });
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-invoices/:id/approve', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_invoices', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { approvalNote } = req.body || {};

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Senior Manager level and above can approve invoices.');
      }

      const existing = await db.execute(sql`SELECT * FROM epc_invoices WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Invoice not found');
      const inv = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(inv, req.user as any, 'strict', req, res))) return;

      if (inv.status !== 'draft') {
        return sendBusinessError(res, `Cannot approve: status is '${inv.status}', expected 'draft'.`);
      }

      if (inv.created_by === userId) {
        return sendBusinessError(res, 'Self-action prevented: the creator cannot also approve the invoice.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcInvoices)
          .set({ status: 'approved', approvedBy: userId, approvedAt: new Date(), approvalNote: approvalNote || null, updatedAt: new Date() })
          .where(eq(epcInvoices.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${inv.project_id}, 'epc_invoice.approved', ${JSON.stringify({
            invoiceId: id, invoiceNumber: inv.invoice_number, approvedBy: userId,
            grossAmount: inv.gross_amount, billingBasis: inv.billing_basis,
          })}::jsonb, 'invoice', NOW())`);
      });

      console.log(`[INV] ${inv.invoice_number} approved by user ${userId}`);
      res.json({ success: true, message: `${inv.invoice_number} approved`, id, newStatus: 'approved' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-invoices/:id/issue', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_invoices', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { issueNote } = req.body || {};

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Senior Manager level and above can issue invoices.');
      }

      const existing = await db.execute(sql`SELECT * FROM epc_invoices WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Invoice not found');
      const inv = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(inv, req.user as any, 'strict', req, res))) return;

      if (inv.status !== 'approved') {
        return sendBusinessError(res, `Cannot issue: status is '${inv.status}', expected 'approved'.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcInvoices)
          .set({ status: 'issued', issuedBy: userId, issuedAt: new Date(), issueNote: issueNote || null, updatedAt: new Date() })
          .where(eq(epcInvoices.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${inv.project_id}, 'epc_invoice.issued', ${JSON.stringify({
            invoiceId: id, invoiceNumber: inv.invoice_number, issuedBy: userId,
            grossAmount: inv.gross_amount, billingBasis: inv.billing_basis,
          })}::jsonb, 'invoice', NOW())`);
      });

      console.log(`[INV] ${inv.invoice_number} issued by user ${userId}`);
      res.json({ success: true, message: `${inv.invoice_number} issued`, id, newStatus: 'issued' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-invoices/:id/record-payment', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_invoices', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { paymentAmount, paymentNote } = req.body || {};

      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!allowedRoles.includes(userRole)) {
        return sendPermissionError(res, 'Only Manager level and above can record payments.');
      }

      if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
        return sendValidationError(res, 'paymentAmount is required and must be greater than zero.');
      }

      const existing = await db.execute(sql`SELECT * FROM epc_invoices WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Invoice not found');
      const inv = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(inv, req.user as any, 'strict', req, res))) return;

      if (inv.status !== 'issued' && inv.status !== 'partially_paid') {
        return sendBusinessError(res, `Cannot record payment: status is '${inv.status}', expected 'issued' or 'partially_paid'.`);
      }

      const payment = parseFloat(paymentAmount);
      const currentPaid = parseFloat(inv.amount_paid || '0');
      const gross = parseFloat(inv.gross_amount || '0');
      const newPaid = currentPaid + payment;

      if (newPaid > gross) {
        return sendBusinessError(res, `Payment of ${payment} would exceed gross amount ${gross}. Current paid: ${currentPaid}, remaining: ${gross - currentPaid}.`);
      }

      const newOutstanding = gross - newPaid;
      const newStatus = newPaid >= gross ? 'paid' : 'partially_paid';

      await db.transaction(async (tx) => {
        await tx.update(epcInvoices)
          .set({
            status: newStatus, amountPaid: String(newPaid), amountOutstanding: String(newOutstanding),
            updatedAt: new Date(),
          })
          .where(eq(epcInvoices.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${inv.project_id}, 'epc_invoice.payment_recorded', ${JSON.stringify({
            invoiceId: id, invoiceNumber: inv.invoice_number, recordedBy: userId,
            paymentAmount: payment, totalPaid: newPaid, outstanding: newOutstanding,
            newStatus, billingBasis: inv.billing_basis, paymentNote: paymentNote || null,
          })}::jsonb, 'invoice', NOW())`);
      });

      console.log(`[INV] ${inv.invoice_number} payment ${payment} recorded by user ${userId}, new status: ${newStatus}`);
      res.json({
        success: true, message: `Payment of ${payment} recorded on ${inv.invoice_number}`,
        id, newStatus, amountPaid: newPaid, amountOutstanding: newOutstanding,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-invoices/:id/cancel', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_invoices', id, res))) return;
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body || {};

      if (!cancelReason) return sendValidationError(res, 'cancelReason is required.');

      const existing = await db.execute(sql`SELECT * FROM epc_invoices WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Invoice not found');
      const inv = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(inv, req.user as any, 'strict', req, res))) return;

      if (inv.status === 'canceled' || inv.status === 'superseded' || inv.status === 'paid') {
        return sendBusinessError(res, `Cannot cancel: status is '${inv.status}' (terminal state).`);
      }

      if (inv.status === 'partially_paid') {
        return sendBusinessError(res, 'Cannot cancel a partially paid invoice. Reverse payments first or supersede.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcInvoices)
          .set({ status: 'canceled', cancelledBy: userId, cancelledAt: new Date(), cancelReason, updatedAt: new Date() })
          .where(eq(epcInvoices.id, id));

        if (inv.status === 'draft') {
          const otherActive = await tx.execute(
            sql`SELECT id FROM epc_invoices WHERE billing_readiness_id = ${inv.billing_readiness_id} AND id != ${id} AND status NOT IN ('canceled', 'superseded')`
          );
          if (otherActive.rows.length === 0) {
            await tx.update(epcBillingReadiness)
              .set({ status: 'ready_for_invoice', invoicedBy: null, invoicedAt: null, invoiceReference: null, updatedAt: new Date() })
              .where(eq(epcBillingReadiness.id, inv.billing_readiness_id));
          }
        }

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${inv.project_id}, 'epc_invoice.canceled', ${JSON.stringify({
            invoiceId: id, invoiceNumber: inv.invoice_number, cancelledBy: userId, cancelReason,
            previousStatus: inv.status, billingBasis: inv.billing_basis,
          })}::jsonb, 'invoice', NOW())`);
      });

      console.log(`[INV] ${inv.invoice_number} canceled by user ${userId}: ${cancelReason}`);
      res.json({ success: true, message: `${inv.invoice_number} canceled`, id, newStatus: 'canceled' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/epc-invoices/:id/supersede', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      if (!requireMinRole(req, res, 'Senior Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_invoices', id, res))) return;
      const userId = (req.user as any)?.id;
      const { supersessionReason, newInvoiceId } = req.body || {};

      if (!supersessionReason) return sendValidationError(res, 'supersessionReason is required.');

      const existing = await db.execute(sql`SELECT * FROM epc_invoices WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Invoice not found');
      const inv = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(inv, req.user as any, 'strict', req, res))) return;

      if (inv.status === 'canceled' || inv.status === 'superseded' || inv.status === 'paid') {
        return sendBusinessError(res, `Cannot supersede: status is '${inv.status}' (terminal state).`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcInvoices)
          .set({
            status: 'superseded', supersededById: newInvoiceId || null, supersededAt: new Date(),
            supersessionReason, updatedAt: new Date(),
          })
          .where(eq(epcInvoices.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${inv.project_id}, 'epc_invoice.superseded', ${JSON.stringify({
            invoiceId: id, invoiceNumber: inv.invoice_number, supersededBy: userId,
            supersessionReason, newInvoiceId: newInvoiceId || null,
            previousStatus: inv.status, billingBasis: inv.billing_basis,
          })}::jsonb, 'invoice', NOW())`);
      });

      console.log(`[INV] ${inv.invoice_number} superseded by user ${userId}: ${supersessionReason}`);
      res.json({ success: true, message: `${inv.invoice_number} superseded`, id, newStatus: 'superseded' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/epc-invoices/:id', ensureAuthenticated, requirePageAccess('invoices'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_invoices', id, res))) return;
      const userId = (req.user as any)?.id;

      const existing = await db.execute(sql`SELECT * FROM epc_invoices WHERE id = ${id}`);
      if (existing.rows.length === 0) return sendNotFound(res, 'Invoice not found');
      const inv = existing.rows[0] as any;

      if (!(await enforceWriteOwnership(inv, req.user as any, 'strict', req, res))) return;

      if (inv.status !== 'draft') {
        return sendBusinessError(res, `Cannot update: only draft invoices can be edited. Current status: '${inv.status}'.`);
      }

      const allowedFields = [
        'invoiceDate', 'dueDate', 'paymentTerms', 'invoiceNotes', 'internalNotes',
        'discountAmount', 'discountNote', 'customerName', 'customerAddress',
        'customerGst', 'customerPoNumber', 'customerPoDate', 'billingAddress', 'shippingAddress',
      ];
      const updates: Record<string, any> = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          if (field === 'invoiceDate' || field === 'dueDate' || field === 'customerPoDate') {
            updates[field] = req.body[field] ? new Date(req.body[field]) : null;
          } else {
            updates[field] = req.body[field];
          }
        }
      }

      if (req.body.discountAmount !== undefined) {
        const totalAmt = parseFloat(inv.total_amount || '0');
        const disc = parseFloat(req.body.discountAmount || '0');
        const taxAmt = parseFloat(inv.tax_amount || '0');
        const newGross = totalAmt - disc + taxAmt;
        updates.grossAmount = String(newGross);
        updates.amountOutstanding = String(newGross - parseFloat(inv.amount_paid || '0'));
      }

      await db.update(epcInvoices).set(updates).where(eq(epcInvoices.id, id));

      console.log(`[INV] ${inv.invoice_number} updated by user ${userId}`);
      res.json({ success: true, message: `${inv.invoice_number} updated`, id });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== EPC DWG AUTO-LINKING ====================

  app.post('/api/projects/:projectId/drawing-controls/auto-link', ensureAuthenticated, requirePageAccess('drawing-controls'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (!(await guardProjectNotFrozen(projectId, res))) return;
      const userId = (req.user as any)?.id;
      if (!requireMinRole(req, res, 'Manager')) return;

      const { autoLinkUnlinkedDrawings } = await import('./utils/epc-dwg-linking');
      const result = await autoLinkUnlinkedDrawings(projectId, userId);
      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== EPC INSPECTION AGING CHECK ====================

  app.post('/api/projects/:projectId/inspection-aging-check', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = (req.user as any)?.id;
      if (!requireMinRole(req, res, 'Manager')) return;

      const { checkPendingInspectionAging } = await import('./utils/epc-inspection-trigger');
      const agingDays = parseInt(req.body.agingDays) || 7;
      const count = await checkPendingInspectionAging(projectId, userId, agingDays);
      res.json({ success: true, agingInspections: count });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== EPC DRAWING CONTROL LAYER ====================

  app.get('/api/projects/:projectId/drawing-controls', ensureAuthenticated, requirePageAccess('drawing-controls'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const results = await db.execute(
        sql`SELECT dc.*, COALESCE(att.cnt, 0)::int AS attachment_count,
                   u_assigned.username AS assigned_to_name, u_assigned.department AS assigned_to_department
            FROM epc_drawing_controls dc
            LEFT JOIN (
              SELECT parent_entity_id, COUNT(*)::int AS cnt
              FROM epc_document_attachments
              WHERE parent_entity_type = 'epc_drawing_controls' AND doc_type = 'DWG' AND status = 'active'
              GROUP BY parent_entity_id
            ) att ON att.parent_entity_id = dc.id
            LEFT JOIN users u_assigned ON u_assigned.id = dc.assigned_to
            WHERE dc.project_id = ${projectId}
            ORDER BY dc.created_at DESC`
      );
      res.json(results.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/drawing-controls/:id', ensureAuthenticated, requirePageAccess('drawing-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const results = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
      const dc = results.rows[0] as any;
      const user = req.user as any;
      const { isMember } = await checkProjectMembership(user.id, user.role, dc.project_id);
      if (!isMember) return res.status(403).json({ error: "Access denied", code: "PROJECT_ACCESS_DENIED" });
      res.json(dc);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/drawing-controls', ensureAuthenticated, requirePageAccess('drawing-controls'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const userRole = (req.user as any)?.role;
      if (roleHierarchy[userRole] > roleHierarchy['Senior Executive']) {
        return sendPermissionError(res, 'Senior Executive or above required to create drawing controls.');
      }
      const projectId = parseInt(req.params.projectId);
      if (!(await guardProjectNotFrozen(projectId, res))) return;
      const userId = (req.user as any)?.id;
      const {
        projectItemId, masterItemId, designDrawingId,
        drawingNumber, drawingTitle, drawingRevision, drawingCategory, disciplineCode,
        drawingPurpose, notes,
        clientApprovalRequired,
        procurementReleaseRequired, manufacturingReleaseRequired,
      } = req.body;

      if (!projectItemId || !masterItemId) {
        return sendValidationError(res, 'projectItemId and masterItemId are required.');
      }

      const validPurposes = ['procurement', 'manufacturing', 'construction', 'general'];
      if (drawingPurpose && !validPurposes.includes(drawingPurpose)) {
        return sendValidationError(res, `drawingPurpose must be one of: ${validPurposes.join(', ')}`);
      }

      const existingCheck = await db.execute(
        sql`SELECT id, dwg_control_number FROM epc_drawing_controls 
            WHERE project_item_id = ${projectItemId} 
              AND project_id = ${projectId}
              AND status NOT IN ('canceled', 'superseded')`
      );
      if (existingCheck.rows.length > 0) {
        const existing = existingCheck.rows[0] as any;
        return sendBusinessError(res, `Active drawing control ${existing.dwg_control_number} already exists for this project item (id: ${existing.id}). Cancel or supersede it first.`);
      }

      const miResult = await db.execute(sql`SELECT item_code, description, make_or_buy FROM master_items WHERE id = ${masterItemId}`);
      if (miResult.rows.length === 0) return sendNotFound(res, 'Master item not found');
      const mi = miResult.rows[0] as any;
      const classification = mi.make_or_buy || null;

      let snapDrawingNumber = drawingNumber || null;
      let snapDrawingTitle = drawingTitle || null;
      let snapDrawingRevision = drawingRevision || null;
      let snapDrawingCategory = drawingCategory || null;
      let snapDisciplineCode = disciplineCode || null;

      if (designDrawingId) {
        const ddResult = await db.execute(sql`SELECT * FROM design_drawings WHERE id = ${designDrawingId}`);
        if (ddResult.rows.length === 0) return sendNotFound(res, 'Design drawing not found');
        const dd = ddResult.rows[0] as any;
        snapDrawingNumber = snapDrawingNumber || dd.drawing_number;
        snapDrawingTitle = snapDrawingTitle || dd.drawing_title;
        snapDrawingRevision = snapDrawingRevision || dd.current_revision;
        snapDrawingCategory = snapDrawingCategory || dd.category;
        snapDisciplineCode = snapDisciplineCode || dd.discipline_code;
      }

      const purpose = drawingPurpose || 'general';
      let procReq = procurementReleaseRequired;
      let mfgReq = manufacturingReleaseRequired;
      if (procReq === undefined || procReq === null) {
        procReq = classification === 'Buy' || purpose === 'procurement' || purpose === 'general';
      }
      if (mfgReq === undefined || mfgReq === null) {
        mfgReq = classification === 'Make' || purpose === 'manufacturing' || purpose === 'general';
      }

      await db.transaction(async (tx) => {
        const dwgControlNumber = await epcCoding.generateDocumentNumber(projectId, 'DWG', tx);

        const inserted = await tx.insert(epcDrawingControls).values({
          dwgControlNumber,
          revisionCode: '00',
          isCurrent: true,
          revisionStatus: 'draft',
          projectId,
          projectItemId,
          masterItemId,
          designDrawingId: designDrawingId || null,
          drawingNumber: snapDrawingNumber,
          drawingTitle: snapDrawingTitle,
          drawingRevision: snapDrawingRevision,
          drawingCategory: snapDrawingCategory,
          disciplineCode: snapDisciplineCode,
          itemCode: mi.item_code,
          itemDescription: mi.description,
          classificationSnapshot: classification,
          drawingPurpose: purpose,
          procurementReleaseRequired: procReq,
          manufacturingReleaseRequired: mfgReq,
          clientApprovalRequired: clientApprovalRequired || false,
          clientApprovalStatus: clientApprovalRequired ? 'pending' : 'not_required',
          status: 'draft',
          notes: notes || null,
          createdBy: userId,
        }).returning();

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${projectId}, 'drawing_control.created', ${JSON.stringify({
            dwgId: inserted[0].id, dwgControlNumber, projectItemId, masterItemId,
            designDrawingId, drawingPurpose: purpose, classification,
            procurementReleaseRequired: procReq, manufacturingReleaseRequired: mfgReq,
            createdBy: userId,
          })}::jsonb, 'drawing_control', NOW())`);

        console.log(`[DWG-CTRL] ${dwgControlNumber} created for project ${projectId}, item ${projectItemId} by user ${userId}`);
        res.status(201).json({ success: true, message: `Drawing control ${dwgControlNumber} created`, record: inserted[0] });
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drawing-controls/:id/submit-for-review', ensureAuthenticated, requirePageAccess('drawing-controls'), async (req: Request, res: Response) => {
    try {
      const userRole = (req.user as any)?.role;
      if (roleHierarchy[userRole] > roleHierarchy['Senior Executive']) {
        return sendPermissionError(res, 'Senior Executive or above required to submit drawing controls for review.');
      }
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_drawing_controls', id, res))) return;
      const userId = (req.user as any)?.id;
      const { submissionNote } = req.body;

      const results = await db.execute(sql`SELECT dc.*, u_asgn.username AS assigned_to_name FROM epc_drawing_controls dc LEFT JOIN users u_asgn ON u_asgn.id = dc.assigned_to WHERE dc.id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'draft') {
        return sendBusinessError(res, `Cannot submit: current status is '${rec.status}'. Must be 'draft'.`);
      }

      if (!rec.drawing_number) {
        return sendBusinessError(res, 'Cannot submit: drawing number is required before review submission.');
      }

      const attCheck = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM epc_document_attachments WHERE parent_entity_type = 'epc_drawing_controls' AND parent_entity_id = ${id} AND doc_type = 'DWG' AND status = 'active'`);
      const attCount = (attCheck.rows[0] as any)?.cnt || 0;
      if (attCount === 0) {
        return sendBusinessError(res, 'Cannot submit: at least one drawing file must be uploaded before submitting for review.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDrawingControls).set({
          status: 'under_review',
          submittedBy: userId,
          submittedAt: new Date(),
          submissionNote: submissionNote || null,
          updatedAt: new Date(),
        }).where(eq(epcDrawingControls.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${rec.project_id}, 'drawing_control.submitted', ${JSON.stringify({
            dwgId: id, dwgControlNumber: rec.dwg_control_number, submittedBy: userId,
          })}::jsonb, 'drawing_control', NOW())`);

        let dwgReviewAssignee: number | null = null;
        if (rec.assigned_to) {
          const mgrResult = await tx.execute(sql`SELECT reporting_manager_id FROM users WHERE id = ${rec.assigned_to} AND is_active = true`);
          if (mgrResult.rows.length > 0 && (mgrResult.rows[0] as any).reporting_manager_id) {
            dwgReviewAssignee = (mgrResult.rows[0] as any).reporting_manager_id;
          }
        }
        if (!dwgReviewAssignee) {
          const dwgRevFallback = await resolveEpcAssignee('DWG_approve', rec.project_id, String(userId));
          dwgReviewAssignee = dwgRevFallback.userId;
        }
        const dwgProjectCode = await resolveProjectCode(rec.project_id, tx);
        await createEpcTask({
          projectId: rec.project_id, entityType: 'drawing_control', recordId: id, actionCode: 'review',
          title: `Review Drawing ${rec.dwg_control_number} for ${dwgProjectCode}`,
          description: `Drawing ${rec.dwg_control_number} has been submitted for review by ${rec.assigned_to_name || 'engineer'}. Please review and provide your recommendation (approve/reject).`,
          assignedTo: dwgReviewAssignee, createdBy: userId, priority: 'High', dueDays: 3, tx,
        });
      });

      console.log(`[DWG-CTRL] ${rec.dwg_control_number} submitted for review by user ${userId}`);
      res.json({ success: true, message: `${rec.dwg_control_number} submitted for review` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drawing-controls/:id/review', ensureAuthenticated, requirePageAccess('drawing-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_drawing_controls', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { reviewNote, recommendation } = req.body;

      if (roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to review drawing controls.');
      }

      const results = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'under_review') {
        return sendBusinessError(res, `Cannot review: current status is '${rec.status}'. Must be 'under_review'.`);
      }

      if (rec.submitted_by === userId) {
        return sendBusinessError(res, 'Self-review not allowed: submitter cannot review their own submission.');
      }

      const validRecs = ['approve', 'reject', 'approve_with_comments'];
      if (!recommendation || !validRecs.includes(recommendation)) {
        return sendValidationError(res, `recommendation is required and must be one of: ${validRecs.join(', ')}`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDrawingControls).set({
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewNote: reviewNote || null,
          reviewRecommendation: recommendation,
          updatedAt: new Date(),
        }).where(eq(epcDrawingControls.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${rec.project_id}, 'drawing_control.reviewed', ${JSON.stringify({
            dwgId: id, dwgControlNumber: rec.dwg_control_number, reviewedBy: userId, recommendation,
          })}::jsonb, 'drawing_control', NOW())`);

        if (recommendation === 'approve' || recommendation === 'approve_with_comments') {
          let dwgApproveAssignee: number | null = null;
          const reviewerMgr = await tx.execute(sql`SELECT reporting_manager_id FROM users WHERE id = ${userId} AND is_active = true`);
          if (reviewerMgr.rows.length > 0 && (reviewerMgr.rows[0] as any).reporting_manager_id) {
            dwgApproveAssignee = (reviewerMgr.rows[0] as any).reporting_manager_id;
          }
          if (!dwgApproveAssignee) {
            const dwgAppFallback = await resolveEpcAssignee('DWG_approve', rec.project_id, String(userId));
            dwgApproveAssignee = dwgAppFallback.userId;
          }
          const dwgProjectCode = await resolveProjectCode(rec.project_id, tx);
          await createEpcTask({
            projectId: rec.project_id, entityType: 'drawing_control', recordId: id, actionCode: 'approve',
            title: `Approve Drawing ${rec.dwg_control_number} for ${dwgProjectCode}`,
            description: `Drawing ${rec.dwg_control_number} has been reviewed with recommendation: ${recommendation}. Senior Manager approval is needed.`,
            assignedTo: dwgApproveAssignee, createdBy: userId, priority: 'High', dueDays: 2, tx,
          });
        }
      });

      console.log(`[DWG-CTRL] ${rec.dwg_control_number} reviewed (${recommendation}) by user ${userId}`);
      res.json({ success: true, message: `${rec.dwg_control_number} reviewed with recommendation: ${recommendation}` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drawing-controls/:id/approve', ensureAuthenticated, requirePageAccess('drawing-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_drawing_controls', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { approvalNote } = req.body;

      if (!requireMinRole(req, res, 'Senior Manager')) return;

      const results = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'under_review') {
        return sendBusinessError(res, `Cannot approve: current status is '${rec.status}'. Must be 'under_review'.`);
      }

      if (rec.review_recommendation === 'reject') {
        return sendBusinessError(res, 'Cannot approve: review recommendation is "reject". Revert to draft or supersede.');
      }

      if (rec.submitted_by && rec.submitted_by === userId) {
        return sendBusinessError(res, 'Self-approval not allowed: the person who submitted this drawing for review cannot also approve it. A different Senior Manager, General Manager, or Superuser must approve.');
      }

      if (rec.client_approval_required && rec.client_approval_status !== 'approved') {
        return sendBusinessError(res, `Cannot approve: client approval is required but status is '${rec.client_approval_status}'.`);
      }

      await db.transaction(async (tx) => {
        // If no one has reviewed yet, auto-record the approver as the reviewer too
        const reviewedBy = rec.reviewed_by || userId;
        const reviewedAt = rec.reviewed_at || new Date();
        const reviewRecommendation = rec.review_recommendation || 'approve';

        await tx.update(epcDrawingControls).set({
          status: 'approved',
          reviewedBy,
          reviewedAt,
          reviewRecommendation,
          approvedBy: userId,
          approvedAt: new Date(),
          approvalNote: approvalNote || null,
          updatedAt: new Date(),
        }).where(eq(epcDrawingControls.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${rec.project_id}, 'drawing_control.approved', ${JSON.stringify({
            dwgId: id, dwgControlNumber: rec.dwg_control_number, approvedBy: userId,
          })}::jsonb, 'drawing_control', NOW())`);

        const dwgProjectCode = await resolveProjectCode(rec.project_id, tx);
        await createEpcTask({
          projectId: rec.project_id, entityType: 'drawing_control', recordId: id, actionCode: 'release',
          title: `Release Drawing ${rec.dwg_control_number} for ${dwgProjectCode}`,
          description: `Drawing ${rec.dwg_control_number} has been approved. It is now pending release.`,
          assignedTo: userId, createdBy: userId, priority: 'Medium', dueDays: 2, tx,
        });

        // Notify the submitter that their drawing has been approved
        if (rec.submitted_by && rec.submitted_by !== userId) {
          await createEpcTask({
            projectId: rec.project_id, entityType: 'drawing_control', recordId: id, actionCode: 'approved_notification',
            title: `Drawing ${rec.dwg_control_number} Approved`,
            description: `Your drawing ${rec.dwg_control_number} (${dwgProjectCode}) has been approved${approvalNote ? ` with note: "${approvalNote}"` : ''}. It is now pending release.`,
            assignedTo: rec.submitted_by, createdBy: userId, priority: 'Medium', dueDays: 1, tx,
          });
        }
      });

      console.log(`[DWG-CTRL] ${rec.dwg_control_number} approved by user ${userId}`);
      res.json({ success: true, message: `${rec.dwg_control_number} approved` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drawing-controls/:id/release', ensureAuthenticated, requirePageAccess('drawing-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_drawing_controls', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { releaseNote, releaseForProcurement, releaseForManufacturing } = req.body;

      if (!requireMinRole(req, res, 'Senior Manager')) return;

      const results = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'approved') {
        return sendBusinessError(res, `Cannot release: current status is '${rec.status}'. Must be 'approved'.`);
      }

      const updates: any = {
        status: 'released',
        releasedBy: userId,
        releasedAt: new Date(),
        releaseNote: releaseNote || null,
        updatedAt: new Date(),
      };

      if (releaseForProcurement === true && rec.procurement_release_required) {
        updates.releasedForProcurement = true;
        updates.releasedForProcurementAt = new Date();
        updates.releasedForProcurementBy = userId;
      } else if (rec.procurement_release_required && !rec.released_for_procurement) {
        updates.releasedForProcurement = true;
        updates.releasedForProcurementAt = new Date();
        updates.releasedForProcurementBy = userId;
      }

      if (releaseForManufacturing === true && rec.manufacturing_release_required) {
        updates.releasedForManufacturing = true;
        updates.releasedForManufacturingAt = new Date();
        updates.releasedForManufacturingBy = userId;
      } else if (rec.manufacturing_release_required && !rec.released_for_manufacturing) {
        updates.releasedForManufacturing = true;
        updates.releasedForManufacturingAt = new Date();
        updates.releasedForManufacturingBy = userId;
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDrawingControls).set(updates).where(eq(epcDrawingControls.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${rec.project_id}, 'drawing_control.released', ${JSON.stringify({
            dwgId: id, dwgControlNumber: rec.dwg_control_number, releasedBy: userId,
            releasedForProcurement: updates.releasedForProcurement || rec.released_for_procurement,
            releasedForManufacturing: updates.releasedForManufacturing || rec.released_for_manufacturing,
          })}::jsonb, 'drawing_control', NOW())`);

        const dwgProjectCode = await resolveProjectCode(rec.project_id, tx);

        if (rec.assigned_to) {
          await createEpcTask({
            projectId: rec.project_id, entityType: 'drawing_control', recordId: id, actionCode: 'released_notification',
            title: `Drawing ${rec.dwg_control_number} Released — ${dwgProjectCode}`,
            description: `Your drawing ${rec.dwg_control_number} (${rec.item_description || rec.item_code || ''}) has been released for project ${dwgProjectCode}.`,
            assignedTo: rec.assigned_to, createdBy: userId, priority: 'Low', dueDays: 0, tx,
          });
        }

        const procReleased = updates.releasedForProcurement || rec.released_for_procurement;
        if (procReleased) {
          const procAssigneeResult = await resolveEpcAssignee('PO_prepare', rec.project_id, String(userId));
          if (procAssigneeResult.userId) {
            await createEpcTask({
              projectId: rec.project_id, entityType: 'drawing_control', recordId: id, actionCode: 'procurement_released',
              title: `Drawing Released for Procurement — ${rec.dwg_control_number} — ${dwgProjectCode}`,
              description: `Drawing ${rec.dwg_control_number} (${rec.item_description || rec.item_code || ''}) has been released for procurement. Please proceed with purchase planning.`,
              assignedTo: procAssigneeResult.userId, createdBy: userId, priority: 'High', dueDays: 3, tx,
            });
          }
        }

        const mfgReleased = updates.releasedForManufacturing || rec.released_for_manufacturing;
        if (mfgReleased) {
          const mfgAssigneeResult = await resolveEpcAssignee('WO_prepare', rec.project_id, String(userId));
          if (mfgAssigneeResult.userId) {
            await createEpcTask({
              projectId: rec.project_id, entityType: 'drawing_control', recordId: id, actionCode: 'manufacturing_released',
              title: `Drawing Released for Manufacturing — ${rec.dwg_control_number} — ${dwgProjectCode}`,
              description: `Drawing ${rec.dwg_control_number} (${rec.item_description || rec.item_code || ''}) has been released for manufacturing. Please proceed with production planning.`,
              assignedTo: mfgAssigneeResult.userId, createdBy: userId, priority: 'High', dueDays: 3, tx,
            });
          }
        }
      });

      console.log(`[DWG-CTRL] ${rec.dwg_control_number} released by user ${userId}`);
      res.json({ success: true, message: `${rec.dwg_control_number} released` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drawing-controls/:id/release-gate', ensureAuthenticated, requirePageAccess('drawing-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_drawing_controls', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { gateType } = req.body;

      if (roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to toggle release gates.');
      }

      const validGates = ['procurement', 'manufacturing'];
      if (!gateType || !validGates.includes(gateType)) {
        return sendValidationError(res, `gateType is required and must be one of: ${validGates.join(', ')}`);
      }

      const results = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'released') {
        return sendBusinessError(res, `Cannot set release gate: status must be 'released'. Current: '${rec.status}'.`);
      }

      const updates: any = { updatedAt: new Date() };

      if (gateType === 'procurement') {
        if (!rec.procurement_release_required) {
          return sendBusinessError(res, 'Procurement release is not required for this drawing control.');
        }
        if (rec.released_for_procurement) {
          return sendBusinessError(res, 'Already released for procurement.');
        }
        updates.releasedForProcurement = true;
        updates.releasedForProcurementAt = new Date();
        updates.releasedForProcurementBy = userId;
      }

      if (gateType === 'manufacturing') {
        if (!rec.manufacturing_release_required) {
          return sendBusinessError(res, 'Manufacturing release is not required for this drawing control.');
        }
        if (rec.released_for_manufacturing) {
          return sendBusinessError(res, 'Already released for manufacturing.');
        }
        updates.releasedForManufacturing = true;
        updates.releasedForManufacturingAt = new Date();
        updates.releasedForManufacturingBy = userId;
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDrawingControls).set(updates).where(eq(epcDrawingControls.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${rec.project_id}, 'drawing_control.release_gate', ${JSON.stringify({
            dwgId: id, dwgControlNumber: rec.dwg_control_number, gateType, releasedBy: userId,
          })}::jsonb, 'drawing_control', NOW())`);
      });

      console.log(`[DWG-CTRL] ${rec.dwg_control_number} release gate '${gateType}' set by user ${userId}`);
      res.json({ success: true, message: `${rec.dwg_control_number} released for ${gateType}` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drawing-controls/:id/client-approval', ensureAuthenticated, requirePageAccess('drawing-controls'), async (req: Request, res: Response) => {
    try {
      const userRole = (req.user as any)?.role;
      if (roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to record client approval.');
      }
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_drawing_controls', id, res))) return;
      const userId = (req.user as any)?.id;
      const { status, clientApprovedBy, notes } = req.body;

      const validStatuses = ['approved', 'rejected'];
      if (!status || !validStatuses.includes(status)) {
        return sendValidationError(res, `status is required and must be one of: ${validStatuses.join(', ')}`);
      }

      const results = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
      const rec = results.rows[0] as any;

      if (!rec.client_approval_required) {
        return sendBusinessError(res, 'Client approval is not required for this drawing control.');
      }

      if (!['draft', 'under_review'].includes(rec.status)) {
        return sendBusinessError(res, `Cannot update client approval: drawing control status is '${rec.status}'.`);
      }

      await db.update(epcDrawingControls).set({
        clientApprovalStatus: status,
        clientApprovedAt: new Date(),
        clientApprovedBy: clientApprovedBy || null,
        clientApprovalNotes: notes || null,
        updatedAt: new Date(),
      }).where(eq(epcDrawingControls.id, id));

      console.log(`[DWG-CTRL] ${rec.dwg_control_number} client approval: ${status} by user ${userId}`);
      res.json({ success: true, message: `${rec.dwg_control_number} client approval: ${status}` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drawing-controls/:id/cancel', ensureAuthenticated, requirePageAccess('drawing-controls'), async (req: Request, res: Response) => {
    try {
      const userRole = (req.user as any)?.role;
      if (!requireMinRole(req, res, 'Senior Manager')) return;
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_drawing_controls', id, res))) return;
      const userId = (req.user as any)?.id;
      const { cancelReason } = req.body;

      if (!cancelReason?.trim()) {
        return sendValidationError(res, 'cancelReason is required.');
      }

      const results = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
      const rec = results.rows[0] as any;

      if (['canceled', 'superseded', ON_HOLD_STATUS].includes(rec.status)) {
        return sendBusinessError(res, `Cannot cancel: record is '${rec.status}'.`);
      }
      if (rec.status === 'released') {
        return sendBusinessError(res, 'Cannot cancel a released drawing control. Supersede it instead.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcDrawingControls).set({
          status: 'canceled',
          cancelledBy: userId,
          cancelledAt: new Date(),
          cancelReason,
          updatedAt: new Date(),
        }).where(eq(epcDrawingControls.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${rec.project_id}, 'drawing_control.canceled', ${JSON.stringify({
            dwgId: id, dwgControlNumber: rec.dwg_control_number, cancelledBy: userId, cancelReason,
          })}::jsonb, 'drawing_control', NOW())`);

        await markTasksObsolete('drawing_control', id, 'drawing_canceled', tx);
      });

      console.log(`[DWG-CTRL] ${rec.dwg_control_number} canceled by user ${userId}`);
      res.json({ success: true, message: `${rec.dwg_control_number} canceled` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drawing-controls/:id/supersede', ensureAuthenticated, requirePageAccess('drawing-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_drawing_controls', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { supersessionReason, newDrawingRevision, newDesignDrawingId } = req.body;

      if (!requireMinRole(req, res, 'Senior Manager')) return;

      if (!supersessionReason?.trim()) {
        return sendValidationError(res, 'supersessionReason is required.');
      }

      const results = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
      const rec = results.rows[0] as any;

      if (['canceled', 'superseded', ON_HOLD_STATUS].includes(rec.status)) {
        return sendBusinessError(res, `Cannot supersede: record is '${rec.status}'.`);
      }
      if (rec.status !== 'released') {
        return sendBusinessError(res, 'Only a released drawing can be superseded. Cancel it instead if it has not been released.');
      }
      if (!rec.is_current) {
        return sendBusinessError(res, 'Cannot supersede a non-current revision.');
      }

      let newSnapNumber = rec.drawing_number;
      let newSnapTitle = rec.drawing_title;
      let newSnapRevision = newDrawingRevision || rec.drawing_revision;
      let newSnapCategory = rec.drawing_category;
      let newSnapDiscipline = rec.discipline_code;
      let newDesignId = newDesignDrawingId || rec.design_drawing_id;

      if (newDesignDrawingId) {
        const ddResult = await db.execute(sql`SELECT * FROM design_drawings WHERE id = ${newDesignDrawingId}`);
        if (ddResult.rows.length === 0) return sendNotFound(res, 'New design drawing not found');
        const dd = ddResult.rows[0] as any;
        newSnapNumber = dd.drawing_number;
        newSnapTitle = dd.drawing_title;
        newSnapRevision = newDrawingRevision || dd.current_revision;
        newSnapCategory = dd.category;
        newSnapDiscipline = dd.discipline_code;
      }

      const nextRevisionCode = epcCoding.incrementRevisionCode(rec.revision_code);
      const newDwgNumber = rec.dwg_control_number;

      const dwgTxResult = await db.transaction(async (tx) => {
        // Step 1: clear is_current on the old drawing FIRST so the partial unique
        // index idx_dwg_current_doc (UNIQUE dwg_control_number WHERE is_current=true)
        // doesn't block the subsequent INSERT of the new draft revision.
        await tx.update(epcDrawingControls).set({
          isCurrent: false,
          status: 'superseded',
          revisionStatus: 'superseded',
          supersededAt: new Date(),
          supersessionReason,
          updatedAt: new Date(),
        }).where(eq(epcDrawingControls.id, id));

        // Step 2: insert the new draft revision now that the slot is free.
        const inserted = await tx.insert(epcDrawingControls).values({
          dwgControlNumber: rec.dwg_control_number,
          revisionCode: nextRevisionCode,
          isCurrent: true,
          revisionStatus: 'draft',
          supersedesId: id,
          projectId: rec.project_id,
          projectItemId: rec.project_item_id,
          masterItemId: rec.master_item_id,
          designDrawingId: newDesignId,
          drawingNumber: newSnapNumber,
          drawingTitle: newSnapTitle,
          drawingRevision: newSnapRevision,
          drawingCategory: newSnapCategory,
          disciplineCode: newSnapDiscipline,
          itemCode: rec.item_code,
          itemDescription: rec.item_description,
          classificationSnapshot: rec.classification_snapshot,
          drawingPurpose: rec.drawing_purpose,
          procurementReleaseRequired: rec.procurement_release_required,
          manufacturingReleaseRequired: rec.manufacturing_release_required,
          clientApprovalRequired: rec.client_approval_required,
          clientApprovalStatus: rec.client_approval_required ? 'pending' : 'not_required',
          status: 'draft',
          notes: `Supersedes Rev ${rec.revision_code} (was ${rec.status}). Reason: ${supersessionReason}`,
          createdBy: userId,
        }).returning();

        // Step 3: write back the supersededBy FK now that we have the new ID.
        await tx.update(epcDrawingControls).set({
          supersededBy: inserted[0].id,
        }).where(eq(epcDrawingControls.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${rec.project_id}, 'drawing_control.superseded', ${JSON.stringify({
            oldDwgId: id, oldDwgNumber: rec.dwg_control_number, oldRevision: rec.revision_code,
            newDwgId: inserted[0].id, newDwgNumber, newRevision: nextRevisionCode,
            supersessionReason, supersededBy: userId,
          })}::jsonb, 'drawing_control', NOW())`);

        await markTasksObsolete('drawing_control', id, `drawing_superseded_by_${inserted[0].id}`, tx);

        await markAttachmentsSuperseded(rec.dwg_control_number, rec.revision_code, userId, rec.project_id, tx);

        const dwgSupDesignLead = await resolveAssignee(rec.project_id, 'Engineering', userId, tx);
        const dwgSupPM = await resolveManagerId(rec.project_id, tx);
        const dwgSupProjectCode = await resolveProjectCode(rec.project_id, tx);
        const dwgSupProcurementLead = await resolveAssignee(rec.project_id, 'Purchase', userId, tx);
        const dwgSupProductionLead = await resolveAssignee(rec.project_id, 'Production', userId, tx);

        // Task for Engineering — review BOMs and downstream execution records
        await createEpcTask({
          projectId: rec.project_id, entityType: 'drawing_control', recordId: id, actionCode: 'supersession_review',
          title: `Review downstream impact of superseded Drawing ${rec.dwg_control_number}`,
          description: `Drawing ${rec.dwg_control_number} has been superseded by ${newDwgNumber} on ${dwgSupProjectCode}. Reason: ${supersessionReason}. Review downstream execution records and BOMs that may reference the old revision.`,
          assignedTo: dwgSupDesignLead || dwgSupPM, createdBy: userId, priority: 'High', dueDays: 3, tx,
        });

        // Task for Procurement — check open POs referencing old drawing revision
        if (dwgSupProcurementLead) {
          await createEpcTask({
            projectId: rec.project_id, entityType: 'drawing_control', recordId: id, actionCode: 'po_supersession_review',
            title: `PO Review: Drawing ${rec.dwg_control_number} superseded (Rev ${rec.revision_code} → ${nextRevisionCode})`,
            description: `Drawing ${rec.dwg_control_number} on project ${dwgSupProjectCode} has been superseded (Rev ${rec.revision_code} was ${rec.status}). Reason: ${supersessionReason}. Review all open Purchase Orders on this project — any PO referencing the old drawing revision must be updated or held pending the new Rev ${nextRevisionCode} release.`,
            assignedTo: dwgSupProcurementLead, createdBy: userId, priority: 'High', dueDays: 3, tx,
          });
        }

        // Task for Production — check open Work Orders / MOs referencing old drawing revision
        if (dwgSupProductionLead) {
          await createEpcTask({
            projectId: rec.project_id, entityType: 'drawing_control', recordId: id, actionCode: 'mo_supersession_review',
            title: `MO Review: Drawing ${rec.dwg_control_number} superseded (Rev ${rec.revision_code} → ${nextRevisionCode})`,
            description: `Drawing ${rec.dwg_control_number} on project ${dwgSupProjectCode} has been superseded (Rev ${rec.revision_code} was ${rec.status}). Reason: ${supersessionReason}. Review all open Manufacturing / Work Orders on this project — any MO referencing the old drawing revision must be reviewed before shop-floor execution proceeds.`,
            assignedTo: dwgSupProductionLead, createdBy: userId, priority: 'High', dueDays: 3, tx,
          });
        }

        const dwgSupEnggRecipients = [dwgSupDesignLead, dwgSupPM].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
        const dwgSupPoRecipients = [dwgSupProcurementLead].filter(Boolean) as number[];
        const dwgSupMoRecipients = [dwgSupProductionLead].filter(Boolean) as number[];

        return { inserted: inserted[0], dwgSupEnggRecipients, dwgSupPoRecipients, dwgSupMoRecipients, dwgSupProjectCode };
      });

      const supersessionAlertBase = {
        type: 'epc_supersession' as const, sourceType: 'epc_automation' as const,
        sourceId: id, createdBy: userId,
        entityType: 'drawing_control', recordId: id, actionCode: 'superseded',
      };

      // Engineering & PM alert
      await createEpcAlertMulti(dwgTxResult.dwgSupEnggRecipients, {
        ...supersessionAlertBase,
        title: `Drawing ${rec.dwg_control_number} superseded`,
        message: `Drawing ${rec.dwg_control_number} has been superseded by ${newDwgNumber} on project ${dwgTxResult.dwgSupProjectCode}. Reason: ${supersessionReason}. Downstream execution records may reference the old revision.`,
        link: `/epc/execution-control`, priority: 'high',
      });

      // Procurement alert
      if (dwgTxResult.dwgSupPoRecipients.length > 0) {
        await createEpcAlertMulti(dwgTxResult.dwgSupPoRecipients, {
          ...supersessionAlertBase,
          title: `PO Alert: Drawing ${rec.dwg_control_number} superseded`,
          message: `Drawing ${rec.dwg_control_number} (Rev ${rec.revision_code}, was ${rec.status}) has been superseded by ${newDwgNumber} on project ${dwgTxResult.dwgSupProjectCode}. Reason: ${supersessionReason}. Review open Purchase Orders — material procurement against the old revision must be put on hold pending the new revision release.`,
          link: `/epc/purchase-orders`, priority: 'high',
        });
      }

      // Production / MO alert
      if (dwgTxResult.dwgSupMoRecipients.length > 0) {
        await createEpcAlertMulti(dwgTxResult.dwgSupMoRecipients, {
          ...supersessionAlertBase,
          title: `MO Alert: Drawing ${rec.dwg_control_number} superseded`,
          message: `Drawing ${rec.dwg_control_number} (Rev ${rec.revision_code}, was ${rec.status}) has been superseded by ${newDwgNumber} on project ${dwgTxResult.dwgSupProjectCode}. Reason: ${supersessionReason}. Review open Manufacturing / Work Orders — shop-floor execution against the old revision must be reviewed before proceeding.`,
          link: `/epc/work-orders`, priority: 'high',
        });
      }

      console.log(`[DWG-CTRL] ${rec.dwg_control_number} superseded by ${newDwgNumber}, user ${userId}`);
      res.status(201).json({
        success: true,
        message: `${rec.dwg_control_number} superseded → new ${newDwgNumber} created`,
        oldRecord: { id, dwgControlNumber: rec.dwg_control_number, status: 'superseded' },
        newRecord: dwgTxResult.inserted,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drawing-controls/:id/revert-to-draft', ensureAuthenticated, requirePageAccess('drawing-controls'), async (req: Request, res: Response) => {
    try {
      const userRole = (req.user as any)?.role;
      if (roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to revert drawing controls to draft.');
      }
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_drawing_controls', id, res))) return;
      const userId = (req.user as any)?.id;

      const results = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'under_review') {
        return sendBusinessError(res, `Cannot revert: current status is '${rec.status}'. Must be 'under_review'.`);
      }

      await db.update(epcDrawingControls).set({
        status: 'draft',
        submittedBy: null,
        submittedAt: null,
        submissionNote: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        reviewRecommendation: null,
        updatedAt: new Date(),
      }).where(eq(epcDrawingControls.id, id));

      console.log(`[DWG-CTRL] ${rec.dwg_control_number} reverted to draft by user ${userId}`);
      res.json({ success: true, message: `${rec.dwg_control_number} reverted to draft` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/drawing-controls/:id', ensureAuthenticated, requirePageAccess('drawing-controls'), async (req: Request, res: Response) => {
    try {
      const userRole = (req.user as any)?.role;
      if (roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to edit drawing controls.');
      }
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_drawing_controls', id, res))) return;
      const userId = (req.user as any)?.id;

      const results = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'draft') {
        return sendBusinessError(res, `Cannot update: status is '${rec.status}'. Only 'draft' records can be edited.`);
      }

      const allowedFields = [
        'drawingNumber', 'drawingTitle', 'drawingRevision', 'drawingCategory',
        'disciplineCode', 'drawingPurpose', 'notes', 'designDrawingId',
        'procurementReleaseRequired', 'manufacturingReleaseRequired',
        'clientApprovalRequired',
      ];
      const updates: any = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (updates.clientApprovalRequired !== undefined) {
        updates.clientApprovalStatus = updates.clientApprovalRequired ? 'pending' : 'not_required';
      }

      if (updates.designDrawingId) {
        const ddResult = await db.execute(sql`SELECT * FROM design_drawings WHERE id = ${updates.designDrawingId}`);
        if (ddResult.rows.length === 0) return sendNotFound(res, 'Design drawing not found');
        const dd = ddResult.rows[0] as any;
        if (!updates.drawingNumber) updates.drawingNumber = dd.drawing_number;
        if (!updates.drawingTitle) updates.drawingTitle = dd.drawing_title;
        if (!updates.drawingRevision) updates.drawingRevision = dd.current_revision;
        if (!updates.drawingCategory) updates.drawingCategory = dd.category;
        if (!updates.disciplineCode) updates.disciplineCode = dd.discipline_code;
      }

      await db.update(epcDrawingControls).set(updates).where(eq(epcDrawingControls.id, id));

      console.log(`[DWG-CTRL] ${rec.dwg_control_number} updated by user ${userId}`);
      res.json({ success: true, message: `${rec.dwg_control_number} updated`, id });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== EPC BOM CONTROL LAYER ====================



  app.get('/api/projects/:projectId/bom-headers', ensureAuthenticated, requirePageAccess('bom-controls'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { bomType, status, projectItemId } = req.query;
      let query = `SELECT bh.*, u1.username as created_by_name, u2.username as submitted_by_name,
        u3.username as reviewed_by_name, u4.username as approved_by_name, u5.username as released_by_name
        FROM epc_bom_headers bh
        LEFT JOIN users u1 ON bh.created_by = u1.id
        LEFT JOIN users u2 ON bh.submitted_by = u2.id
        LEFT JOIN users u3 ON bh.reviewed_by = u3.id
        LEFT JOIN users u4 ON bh.approved_by = u4.id
        LEFT JOIN users u5 ON bh.released_by = u5.id
        WHERE bh.project_id = ${projectId}`;
      if (bomType) query += ` AND bh.bom_type = '${bomType}'`;
      if (status) query += ` AND bh.status = '${status}'`;
      if (projectItemId) query += ` AND bh.project_item_id = ${parseInt(projectItemId as string)}`;
      query += ` ORDER BY bh.created_at DESC`;
      const results = await db.execute(sql.raw(query));
      res.json(results.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/bom-headers/:id', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const results = await db.execute(sql`
        SELECT bh.*, u1.username as created_by_name, u2.username as submitted_by_name,
          u3.username as reviewed_by_name, u4.username as approved_by_name, u5.username as released_by_name
        FROM epc_bom_headers bh
        LEFT JOIN users u1 ON bh.created_by = u1.id
        LEFT JOIN users u2 ON bh.submitted_by = u2.id
        LEFT JOIN users u3 ON bh.reviewed_by = u3.id
        LEFT JOIN users u4 ON bh.approved_by = u4.id
        LEFT JOIN users u5 ON bh.released_by = u5.id
        WHERE bh.id = ${id}
      `);
      if (results.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const bom = results.rows[0] as any;
      const user = req.user as any;
      const { isMember } = await checkProjectMembership(user.id, user.role, bom.project_id);
      if (!isMember) return res.status(403).json({ error: "Access denied", code: "PROJECT_ACCESS_DENIED" });
      res.json(bom);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/projects/:projectId/bom-headers', ensureAuthenticated, requirePageAccess('bom-controls'), requireProjectMembership(), async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;

      if (!(await guardProjectNotFrozen(projectId, res))) return;
      if (!(await guardCostNotLocked(projectId, res))) return;

      if (roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to create BOMs.');
      }
      const { projectItemId, masterItemId, drawingControlId, bomType, bomRevision, bomTitle, bomDescription, notes } = req.body;

      if (!projectItemId || !masterItemId) {
        return sendValidationError(res, 'projectItemId and masterItemId are required');
      }

      const validBomType = bomType || 'assembly';
      if (!['procurement', 'manufacturing', 'assembly'].includes(validBomType)) {
        return sendValidationError(res, 'bomType must be procurement, manufacturing, or assembly');
      }

      const existingCheck = await db.execute(sql`
        SELECT id, bom_number FROM epc_bom_headers 
        WHERE project_item_id = ${projectItemId} AND bom_type = ${validBomType}
        AND status NOT IN ('superseded', 'canceled')
      `);
      if (existingCheck.rows.length > 0) {
        return sendBusinessError(res, `Active BOM (${(existingCheck.rows[0] as any).bom_number}) already exists for this project item with type '${validBomType}'. Supersede it to create a new one.`);
      }

      const itemResult = await db.execute(sql`SELECT description, item_code, make_or_buy FROM master_items WHERE id = ${masterItemId}`);
      if (itemResult.rows.length === 0) return sendNotFound(res, 'Master item not found');
      const item = itemResult.rows[0] as any;

      let drawingNumber: string | null = null;
      let drawingRevisionSnap: string | null = null;
      if (drawingControlId) {
        const dcResult = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${drawingControlId}`);
        if (dcResult.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
        const dc = dcResult.rows[0] as any;
        if (dc.project_item_id !== projectItemId) {
          return sendBusinessError(res, 'Drawing control does not belong to the same project item');
        }
        drawingNumber = dc.drawing_number;
        drawingRevisionSnap = dc.drawing_revision;
      }

      const created = await db.transaction(async (tx) => {
        const bomNumber = await epcCoding.generateDocumentNumber(projectId, 'BOM', tx);
        const [bom] = await tx.insert(epcBomHeaders).values({
          projectId,
          projectItemId,
          masterItemId,
          drawingControlId: drawingControlId || null,
          bomNumber,
          revisionCode: 'A',
          isCurrent: true,
          revisionStatus: 'draft',
          bomRevision: bomRevision || 'A',
          bomType: validBomType,
          bomTitle: bomTitle || `${item.description} - ${validBomType} BOM`,
          bomDescription: bomDescription || null,
          itemCode: item.item_code,
          itemDescription: item.description,
          classificationSnapshot: item.make_or_buy,
          drawingNumber,
          drawingRevision: drawingRevisionSnap,
          notes: notes || null,
          createdBy: userId,
        }).returning();
        return bom;
      });

      console.log(`[BOM] ${created.bomNumber} created for project ${projectId}, item ${masterItemId}, type ${validBomType} by user ${userId}`);
      res.status(201).json({ success: true, data: created, message: `BOM ${created.bomNumber} created` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/bom-headers/:id', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_bom_headers', id, res))) return;
      if (!(await guardRecordCostNotLocked('epc_bom_headers', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      if (roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to edit BOMs.');
      }

      const results = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'draft') {
        return sendBusinessError(res, `Cannot update: status is '${rec.status}'. Only 'draft' records can be edited.`);
      }

      const allowedFields = ['bomTitle', 'bomDescription', 'bomRevision', 'drawingControlId', 'notes'];
      const updates: any = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      if (updates.drawingControlId) {
        const dcResult = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${updates.drawingControlId}`);
        if (dcResult.rows.length === 0) return sendNotFound(res, 'Drawing control record not found');
        const dc = dcResult.rows[0] as any;
        updates.drawingNumber = dc.drawing_number;
        updates.drawingRevision = dc.drawing_revision;
      }

      await db.update(epcBomHeaders).set(updates).where(eq(epcBomHeaders.id, id));
      console.log(`[BOM] ${rec.bom_number} updated by user ${userId}`);
      res.json({ success: true, message: `${rec.bom_number} updated`, id });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/bom-headers/:id/submit-for-review', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_bom_headers', id, res))) return;
      if (!(await guardRecordCostNotLocked('epc_bom_headers', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      if (roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to submit BOMs for review.');
      }
      const { submissionNote } = req.body;

      const results = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'draft') {
        return sendBusinessError(res, `Cannot submit: current status is '${rec.status}'. Must be 'draft'.`);
      }

      const lineCheck = await db.execute(sql`SELECT COUNT(*) as cnt FROM epc_bom_lines WHERE bom_header_id = ${id}`);
      if (parseInt((lineCheck.rows[0] as any).cnt) === 0) {
        return sendBusinessError(res, 'Cannot submit: BOM has no lines. Add at least one component.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcBomHeaders).set({
          status: 'under_review',
          submittedBy: userId,
          submittedAt: new Date(),
          submissionNote: submissionNote || null,
          updatedAt: new Date(),
        }).where(eq(epcBomHeaders.id, id));

        const bomReviewResult = await resolveEpcAssignee('BOM_approve', rec.project_id, String(userId));
        const bomProjectCode = await resolveProjectCode(rec.project_id, tx);
        await createEpcTask({
          projectId: rec.project_id, entityType: 'bom_header', recordId: id, actionCode: 'review',
          title: `Review BOM ${rec.bom_number} for ${bomProjectCode}`,
          description: `BOM ${rec.bom_number} (${rec.bom_type}) has been submitted for review. Please review and provide your recommendation.`,
          assignedTo: bomReviewResult.userId, createdBy: userId, priority: 'High', dueDays: 3, tx,
        });
      });

      console.log(`[BOM] ${rec.bom_number} submitted for review by user ${userId}`);
      res.json({ success: true, message: `${rec.bom_number} submitted for review` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/bom-headers/:id/review', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_bom_headers', id, res))) return;
      if (!(await guardRecordCostNotLocked('epc_bom_headers', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { reviewNote, recommendation } = req.body;

      if (!recommendation || !['approve', 'reject', 'approve_with_comments'].includes(recommendation)) {
        return sendValidationError(res, 'recommendation is required: approve, reject, or approve_with_comments');
      }

      const managerRoles = ['Manager', 'Senior Manager', 'General Manager', 'Superuser'];
      if (!managerRoles.includes(userRole)) {
        return sendPermissionError(res, 'Manager or above required to review');
      }

      const results = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'under_review') {
        return sendBusinessError(res, `Cannot review: current status is '${rec.status}'. Must be 'under_review'.`);
      }

      if (rec.submitted_by === userId) {
        return sendBusinessError(res, 'Self-review not allowed: submitter cannot be reviewer.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcBomHeaders).set({
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewNote: reviewNote || null,
          reviewRecommendation: recommendation,
          updatedAt: new Date(),
        }).where(eq(epcBomHeaders.id, id));

        if (recommendation === 'approve' || recommendation === 'approve_with_comments') {
          const bomApproveResult = await resolveEpcAssignee('BOM_approve', rec.project_id, String(userId));
          const bomProjectCode = await resolveProjectCode(rec.project_id, tx);
          await createEpcTask({
            projectId: rec.project_id, entityType: 'bom_header', recordId: id, actionCode: 'approve',
            title: `Approve BOM ${rec.bom_number} for ${bomProjectCode}`,
            description: `BOM ${rec.bom_number} (${rec.bom_type}) has been reviewed with recommendation: ${recommendation}. Senior Manager approval is needed.`,
            assignedTo: bomApproveResult.userId, createdBy: userId, priority: 'High', dueDays: 2, tx,
          });
        }
      });

      console.log(`[BOM] ${rec.bom_number} reviewed by user ${userId}, recommendation: ${recommendation}`);
      res.json({ success: true, message: `${rec.bom_number} reviewed (${recommendation})` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/bom-headers/:id/approve', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_bom_headers', id, res))) return;
      if (!(await guardRecordCostNotLocked('epc_bom_headers', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { approvalNote } = req.body;

      if (!requireMinRole(req, res, 'Senior Manager')) return;

      const results = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'under_review') {
        return sendBusinessError(res, `Cannot approve: current status is '${rec.status}'. Must be 'under_review'.`);
      }

      if (!rec.reviewed_by) {
        return sendBusinessError(res, 'Cannot approve: BOM has not been reviewed yet.');
      }

      if (rec.review_recommendation === 'reject') {
        return sendBusinessError(res, 'Cannot approve: review recommendation is "reject". Revert to draft first.');
      }

      if (rec.created_by === userId) {
        return sendBusinessError(res, 'Self-approval not allowed: creator cannot be approver.');
      }

      await db.transaction(async (tx) => {
        await tx.update(epcBomHeaders).set({
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          approvalNote: approvalNote || null,
          updatedAt: new Date(),
        }).where(eq(epcBomHeaders.id, id));

        const bomReleaseResult = await resolveEpcAssignee('BOM_release', rec.project_id, String(userId));
        const bomProjectCode = await resolveProjectCode(rec.project_id, tx);
        await createEpcTask({
          projectId: rec.project_id, entityType: 'bom_header', recordId: id, actionCode: 'release',
          title: `Release BOM ${rec.bom_number} for ${bomProjectCode}`,
          description: `BOM ${rec.bom_number} (${rec.bom_type}) has been approved. It is now pending release by a Senior Manager.`,
          assignedTo: bomReleaseResult.userId, createdBy: userId, priority: 'Medium', dueDays: 2, tx,
        });
      });

      console.log(`[BOM] ${rec.bom_number} approved by user ${userId}`);
      res.json({ success: true, message: `${rec.bom_number} approved` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/bom-headers/:id/release', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_bom_headers', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { releaseNote } = req.body;

      if (!requireMinRole(req, res, 'Senior Manager')) return;

      const results = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'approved') {
        return sendBusinessError(res, `Cannot release: current status is '${rec.status}'. Must be 'approved'.`);
      }

      await db.update(epcBomHeaders).set({
        status: 'released',
        releasedBy: userId,
        releasedAt: new Date(),
        releaseNote: releaseNote || null,
        updatedAt: new Date(),
      }).where(eq(epcBomHeaders.id, id));

      console.log(`[BOM] ${rec.bom_number} released by user ${userId}`);

      let reconciliationResult = null;
      if (rec.supersedes_id) {
        try {
          reconciliationResult = await reconcileBomSupersession(rec.supersedes_id, id, userId);
          console.log(`[BOM] Reconciliation completed for ${rec.bom_number} vs superseded BOM ${rec.supersedes_id}`);
        } catch (reconErr) {
          console.error(`[BOM] Reconciliation error for ${rec.bom_number}:`, reconErr);
        }
      }

      res.json({
        success: true,
        message: `${rec.bom_number} released`,
        ...(reconciliationResult ? { reconciliation: reconciliationResult } : {}),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/bom-headers/:id/lock', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_bom_headers', id, res))) return;
      if (!(await guardRecordCostNotLocked('epc_bom_headers', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      if (!requireMinRole(req, res, 'Senior Manager')) return;

      const results = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const rec = results.rows[0] as any;

      if (rec.status !== 'released') {
        return sendBusinessError(res, `Cannot lock: current status is '${rec.status}'. Must be 'released'.`);
      }

      await db.update(epcBomHeaders).set({
        status: 'locked',
        updatedAt: new Date(),
      }).where(eq(epcBomHeaders.id, id));

      console.log(`[BOM] ${rec.bom_number} locked by user ${userId}`);
      res.json({ success: true, message: `${rec.bom_number} locked` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/bom-headers/:id/cancel', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await guardRecordProjectNotFrozen('epc_bom_headers', id, res))) return;
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      if (!requireMinRole(req, res, 'Senior Manager')) return;
      const { cancelReason } = req.body;

      if (!cancelReason) return sendValidationError(res, 'cancelReason is required');

      const results = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const rec = results.rows[0] as any;

      if (rec.status === 'released') {
        return sendBusinessError(res, 'Cannot cancel a released BOM. Supersede it instead.');
      }
      if (['superseded', 'canceled'].includes(rec.status)) {
        return sendBusinessError(res, `BOM is already ${rec.status}.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(epcBomHeaders).set({
          status: 'canceled',
          cancelledBy: userId,
          cancelledAt: new Date(),
          cancelReason,
          updatedAt: new Date(),
        }).where(eq(epcBomHeaders.id, id));

        await markTasksObsolete('bom_header', id, 'bom_canceled', tx);
      });

      console.log(`[BOM] ${rec.bom_number} canceled by user ${userId}`);
      res.json({ success: true, message: `${rec.bom_number} canceled` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/bom-headers/:id/supersede', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const { supersessionReason, newBomRevision } = req.body;

      if (!requireMinRole(req, res, 'Senior Manager')) return;
      if (!(await guardRecordCostNotLocked('epc_bom_headers', id, res))) return;

      if (!supersessionReason) return sendValidationError(res, 'supersessionReason is required');

      const results = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const rec = results.rows[0] as any;

      if (!(await guardProjectNotFrozen(rec.project_id, res))) return;

      if (['superseded', 'canceled'].includes(rec.status)) {
        return sendBusinessError(res, `Cannot supersede: BOM is already ${rec.status}.`);
      }
      if (!rec.is_current) {
        return sendBusinessError(res, 'Cannot supersede a non-current revision.');
      }

      const nextRevisionCode = epcCoding.incrementRevisionCode(rec.revision_code);
      const nextBomRevision = newBomRevision || epcCoding.incrementRevisionCode(rec.bom_revision);

      const txResult = await db.transaction(async (tx) => {
        // Step 1: clear is_current on the old BOM FIRST so the partial unique
        // index idx_bom_current_doc (UNIQUE bom_number WHERE is_current=true)
        // doesn't block the subsequent INSERT of the new draft revision.
        await tx.update(epcBomHeaders).set({
          isCurrent: false,
          status: 'superseded',
          revisionStatus: 'superseded',
          supersededAt: new Date(),
          supersessionReason,
          updatedAt: new Date(),
        }).where(eq(epcBomHeaders.id, id));

        // Step 2: insert the new draft BOM revision now that the slot is free.
        const [newBom] = await tx.insert(epcBomHeaders).values({
          projectId: rec.project_id,
          projectItemId: rec.project_item_id,
          masterItemId: rec.master_item_id,
          drawingControlId: rec.drawing_control_id,
          bomNumber: rec.bom_number,
          revisionCode: nextRevisionCode,
          isCurrent: true,
          revisionStatus: 'draft',
          supersedesId: id,
          bomRevision: nextBomRevision,
          bomType: rec.bom_type,
          bomTitle: rec.bom_title,
          bomDescription: rec.bom_description,
          itemCode: rec.item_code,
          itemDescription: rec.item_description,
          classificationSnapshot: rec.classification_snapshot,
          drawingNumber: rec.drawing_number,
          drawingRevision: rec.drawing_revision,
          notes: `Supersedes Rev ${rec.revision_code} (was ${rec.status}). Reason: ${supersessionReason}`,
          createdBy: userId,
        }).returning();

        const existingLines = await tx.execute(sql`SELECT * FROM epc_bom_lines WHERE bom_header_id = ${id} ORDER BY line_number`);
        for (const line of existingLines.rows as any[]) {
          await tx.insert(epcBomLines).values({
            bomHeaderId: newBom.id,
            lineNumber: line.line_number,
            componentItemId: line.component_item_id,
            componentItemCode: line.component_item_code,
            componentDescription: line.component_description,
            componentSpecification: line.component_specification,
            componentUom: line.component_uom,
            componentMakeOrBuy: line.component_make_or_buy,
            quantityPerUnit: line.quantity_per_unit,
            componentDrawingNo: line.component_drawing_no,
            estimatedUnitCost: line.estimated_unit_cost,
            estimatedTotalCost: line.estimated_total_cost,
            procurementLeadTimeDays: line.procurement_lead_time_days,
            preferredVendor: line.preferred_vendor,
            planningRequired: line.planning_required ?? true,
            notes: line.notes,
          });
        }

        const lineCount = existingLines.rows.length;
        if (lineCount > 0) {
          await tx.update(epcBomHeaders).set({ totalLineCount: lineCount }).where(eq(epcBomHeaders.id, newBom.id));
        }

        // Step 3: write back the supersededBy FK now that we have the new BOM ID.
        await tx.update(epcBomHeaders).set({
          supersededBy: newBom.id,
        }).where(eq(epcBomHeaders.id, id));

        const childPlanningResults = await tx.execute(sql`
          SELECT id, status FROM item_planning_records
          WHERE source_bom_header_id = ${id} AND source = 'bom_explosion'
            AND status NOT IN ('canceled', 'superseded')
        `);
        let autoCancelled = 0, flaggedForReview = 0;
        for (const child of childPlanningResults.rows as any[]) {
          if (child.status === 'draft') {
            await tx.execute(sql`
              UPDATE item_planning_records SET status = 'canceled', cancel_reason = ${'Parent BOM superseded: ' + supersessionReason},
                cancelled_by = ${userId}, cancelled_at = NOW(), updated_at = NOW()
              WHERE id = ${child.id}
            `);
            autoCancelled++;
          } else {
            await tx.execute(sql`
              UPDATE item_planning_records SET supersession_reason = ${'Parent BOM superseded — review required: ' + supersessionReason},
                updated_at = NOW()
              WHERE id = ${child.id}
            `);
            flaggedForReview++;
          }
        }
        await tx.execute(sql`
          UPDATE bom_explosion_logs SET status = 'superseded', superseded_at = NOW()
          WHERE bom_header_id = ${id} AND status = 'created'
        `);

        await markTasksObsolete('bom_header', id, `bom_superseded_by_${newBom.id}`, tx);

        await markAttachmentsSuperseded(rec.bom_number, rec.revision_code, userId, rec.project_id, tx);

        const bomSupDesignLead = await resolveAssignee(rec.project_id, 'Engineering', userId, tx);
        const bomSupPM = await resolveManagerId(rec.project_id, tx);
        const bomSupProjectCode = await resolveProjectCode(rec.project_id, tx);
        await createEpcTask({
          projectId: rec.project_id, entityType: 'bom_header', recordId: id, actionCode: 'supersession_review',
          title: `Review child planning records after BOM ${rec.bom_number} supersession`,
          description: `BOM ${rec.bom_number} (${rec.bom_type}) has been superseded by ${newBom.bomNumber} on ${bomSupProjectCode}. Reason: ${supersessionReason}. ${autoCancelled} draft planning records auto-canceled, ${flaggedForReview} flagged for review.`,
          assignedTo: bomSupDesignLead || bomSupPM, createdBy: userId, priority: 'High', dueDays: 2, tx,
        });

        const bomSupAlertRecipients = [bomSupDesignLead, bomSupPM].filter((v, i, a) => v && a.indexOf(v) === i) as number[];

        return { newBom, autoCancelled, flaggedForReview, bomSupAlertRecipients, bomSupProjectCode };
      });

      const newBomNum = txResult.newBom.bomNumber;
      await createEpcAlertMulti(txResult.bomSupAlertRecipients, {
        type: 'epc_supersession', title: `BOM ${rec.bom_number} superseded`,
        message: `BOM ${rec.bom_number} (${rec.bom_type}) superseded by ${newBomNum} on project ${txResult.bomSupProjectCode}. Reason: ${supersessionReason}. ${txResult.autoCancelled} draft planning records auto-canceled, ${txResult.flaggedForReview} flagged for review.`,
        link: `/epc/execution-control`, priority: 'high', sourceType: 'epc_automation', sourceId: id, createdBy: userId,
        entityType: 'bom_header', recordId: id, actionCode: 'superseded',
      });

      console.log(`[BOM] ${rec.bom_number} superseded by ${newBomNum} (user ${userId}). Child planning: ${txResult.autoCancelled} auto-canceled, ${txResult.flaggedForReview} flagged for review.`);
      res.status(201).json({
        success: true,
        message: `${rec.bom_number} superseded. New BOM: ${newBomNum} (Rev ${nextRevisionCode})`,
        oldBomId: id,
        newBom: txResult.newBom,
        childPlanningImpact: { autoCancelled: txResult.autoCancelled, flaggedForReview: txResult.flaggedForReview },
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/bom-headers/:id/revert-to-draft', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      if (roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to revert BOMs to draft.');
      }

      const results = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${id}`);
      if (results.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const rec = results.rows[0] as any;

      if (!(await guardProjectNotFrozen(rec.project_id, res))) return;
      if (!(await guardCostNotLocked(rec.project_id, res))) return;
      if (rec.status !== 'under_review') {
        return sendBusinessError(res, `Cannot revert: current status is '${rec.status}'. Must be 'under_review'.`);
      }

      await db.update(epcBomHeaders).set({
        status: 'draft',
        submittedBy: null,
        submittedAt: null,
        submissionNote: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        reviewRecommendation: null,
        updatedAt: new Date(),
      }).where(eq(epcBomHeaders.id, id));

      console.log(`[BOM] ${rec.bom_number} reverted to draft by user ${userId}`);
      res.json({ success: true, message: `${rec.bom_number} reverted to draft` });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== BOM EXPLOSION ====================

  app.get('/api/bom-headers/:id/explosion-preview', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const headerResult = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${id}`);
      if (headerResult.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const header = headerResult.rows[0] as any;

      if (!['released', 'locked'].includes(header.status)) {
        return sendBusinessError(res, `BOM must be Released or Locked to preview explosion. Current status: '${header.status}'.`);
      }

      const parentItemResult = await db.execute(sql`SELECT * FROM project_items WHERE id = ${header.project_item_id}`);
      const parentItem = parentItemResult.rows[0] as any;
      const parentQty = parentItem ? parseFloat(parentItem.quantity) : 1;

      const linesResult = await db.execute(sql`
        SELECT bl.*, mi.item_code as master_item_code, mi.description as master_description, mi.make_or_buy as master_make_or_buy, mi.uom as master_uom
        FROM epc_bom_lines bl
        LEFT JOIN master_items mi ON mi.id = bl.component_item_id
        WHERE bl.bom_header_id = ${id}
        ORDER BY bl.line_number
      `);

      const preview = [];
      for (const line of linesResult.rows as any[]) {
        const lineQty = parseFloat(line.quantity_per_unit || '1');
        const computedQty = parentQty * lineQty;
        const classification = line.component_make_or_buy || line.master_make_or_buy || null;

        if (!line.planning_required) {
          preview.push({
            lineId: line.id,
            lineNumber: line.line_number,
            componentItemId: line.component_item_id,
            componentItemCode: line.component_item_code || line.master_item_code,
            componentDescription: line.component_description || line.master_description,
            classification,
            quantityPerUnit: lineQty,
            computedQuantity: computedQty,
            uom: line.component_uom || line.master_uom,
            action: 'skipped_not_required',
            reason: 'planning_required is false',
          });
          continue;
        }

        if (!classification) {
          const existingChild = await db.execute(sql`
            SELECT pi.id FROM project_items pi
            WHERE pi.project_id = ${header.project_id}
              AND pi.parent_project_item_id = ${header.project_item_id}
              AND pi.item_id = ${line.component_item_id}
              AND pi.source_bom_line_id = ${line.id}
              AND pi.source = 'bom_explosion'
              AND pi.status != 'Cancelled'
          `);
          preview.push({
            lineId: line.id,
            lineNumber: line.line_number,
            componentItemId: line.component_item_id,
            componentItemCode: line.component_item_code || line.master_item_code,
            componentDescription: line.component_description || line.master_description,
            classification: null,
            quantityPerUnit: lineQty,
            computedQuantity: computedQty,
            uom: line.component_uom || line.master_uom,
            action: existingChild.rows.length > 0 ? 'reuse' : 'needs_review',
            reason: 'Unknown classification — will create review planning record',
          });
          continue;
        }

        const existingChild = await db.execute(sql`
          SELECT pi.id FROM project_items pi
          WHERE pi.project_id = ${header.project_id}
            AND pi.parent_project_item_id = ${header.project_item_id}
            AND pi.item_id = ${line.component_item_id}
            AND pi.source_bom_line_id = ${line.id}
            AND pi.source = 'bom_explosion'
            AND pi.status != 'Cancelled'
        `);

        if (existingChild.rows.length > 0) {
          const childId = (existingChild.rows[0] as any).id;
          const existingPlanning = await db.execute(sql`
            SELECT id, status FROM item_planning_records
            WHERE project_item_id = ${childId}
              AND source_bom_line_id = ${line.id}
              AND source = 'bom_explosion'
              AND status NOT IN ('canceled', 'superseded')
          `);
          if (existingPlanning.rows.length > 0) {
            preview.push({
              lineId: line.id,
              lineNumber: line.line_number,
              componentItemId: line.component_item_id,
              componentItemCode: line.component_item_code || line.master_item_code,
              componentDescription: line.component_description || line.master_description,
              classification,
              quantityPerUnit: lineQty,
              computedQuantity: computedQty,
              uom: line.component_uom || line.master_uom,
              action: 'skip_existing',
              reason: `Active planning record already exists (ID: ${(existingPlanning.rows[0] as any).id}, status: ${(existingPlanning.rows[0] as any).status})`,
              existingProjectItemId: childId,
              existingPlanningRecordId: (existingPlanning.rows[0] as any).id,
            });
          } else {
            preview.push({
              lineId: line.id,
              lineNumber: line.line_number,
              componentItemId: line.component_item_id,
              componentItemCode: line.component_item_code || line.master_item_code,
              componentDescription: line.component_description || line.master_description,
              classification,
              quantityPerUnit: lineQty,
              computedQuantity: computedQty,
              uom: line.component_uom || line.master_uom,
              action: 'reuse',
              reason: `Child project item exists (ID: ${childId}), new planning record will be created`,
              existingProjectItemId: childId,
            });
          }
        } else {
          preview.push({
            lineId: line.id,
            lineNumber: line.line_number,
            componentItemId: line.component_item_id,
            componentItemCode: line.component_item_code || line.master_item_code,
            componentDescription: line.component_description || line.master_description,
            classification,
            quantityPerUnit: lineQty,
            computedQuantity: computedQty,
            uom: line.component_uom || line.master_uom,
            action: 'create',
            reason: `New child project item + ${classification === 'Buy' ? 'procurement' : classification === 'Make' ? 'production' : 'review'} planning record`,
          });
        }
      }

      const totalLines = preview.length;
      const explodableLines = preview.filter(p => ['create', 'reuse', 'needs_review'].includes(p.action)).length;
      const skipExisting = preview.filter(p => p.action === 'skip_existing').length;
      const skippedNotRequired = preview.filter(p => p.action === 'skipped_not_required').length;

      let explosionState: string;
      if (skipExisting === 0 && explodableLines === 0 && skippedNotRequired === totalLines) {
        explosionState = 'not_exploded';
      } else if (skipExisting > 0 && explodableLines === 0) {
        explosionState = 'fully_exploded';
      } else if (skipExisting > 0 && explodableLines > 0) {
        explosionState = 'partially_exploded';
      } else {
        explosionState = 'not_exploded';
      }

      res.json({
        success: true,
        bomHeaderId: id,
        bomNumber: header.bom_number,
        parentProjectItemId: header.project_item_id,
        parentQuantity: parentQty,
        explosionState,
        summary: { totalLines, explodableLines, skipExisting, skippedNotRequired },
        lines: preview,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/bom-headers/:id/explode', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const { lineIds, confirm } = req.body;

      if (!confirm) {
        return sendValidationError(res, 'Manual confirmation required. Set confirm: true to proceed.');
      }
      if (!lineIds || !Array.isArray(lineIds) || lineIds.length === 0) {
        return sendValidationError(res, 'lineIds array is required and must not be empty.');
      }

      const headerResult = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${id}`);
      if (headerResult.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      if (!(await guardProjectNotFrozen((headerResult.rows[0] as any).project_id, res))) return;
      if (!(await guardCostNotLocked((headerResult.rows[0] as any).project_id, res))) return;
      const header = headerResult.rows[0] as any;

      if (!['released', 'locked'].includes(header.status)) {
        return sendBusinessError(res, `BOM must be Released or Locked to explode. Current status: '${header.status}'.`);
      }

      const parentItemResult = await db.execute(sql`SELECT * FROM project_items WHERE id = ${header.project_item_id}`);
      if (parentItemResult.rows.length === 0) return sendNotFound(res, 'Parent project item not found');
      const parentItem = parentItemResult.rows[0] as any;
      const parentQty = parseFloat(parentItem.quantity || '1');

      const projectResult = await db.execute(sql`SELECT project_code FROM projects WHERE id = ${header.project_id}`);
      const projectCode = (projectResult.rows[0] as any)?.project_code || '';

      const results = await db.transaction(async (tx) => {
        const txResults: any[] = [];

        for (const lineId of lineIds) {
          const lineResult = await tx.execute(sql`
            SELECT bl.*, mi.item_code as master_item_code, mi.description as master_description, mi.make_or_buy as master_make_or_buy, mi.uom as master_uom
            FROM epc_bom_lines bl
            LEFT JOIN master_items mi ON mi.id = bl.component_item_id
            WHERE bl.id = ${lineId} AND bl.bom_header_id = ${id}
          `);
          if (lineResult.rows.length === 0) {
            txResults.push({ lineId, action: 'error', reason: 'BOM line not found or does not belong to this BOM' });
            continue;
          }
          const line = lineResult.rows[0] as any;

          if (!line.planning_required) {
            txResults.push({ lineId, lineNumber: line.line_number, action: 'skipped_not_required', reason: 'planning_required is false' });
            continue;
          }

          const lineQty = parseFloat(line.quantity_per_unit || '1');
          const computedQty = parentQty * lineQty;
          const classification = line.component_make_or_buy || line.master_make_or_buy || null;
          const planningType = classification === 'Buy' ? 'procurement' : classification === 'Make' ? 'production' : 'review';
          const componentCode = line.component_item_code || line.master_item_code || '';
          const componentDesc = line.component_description || line.master_description || '';
          const componentUom = line.component_uom || line.master_uom || '';

          let childProjectItemId: number;
          let childAction: string;

          const existingChild = await tx.execute(sql`
            SELECT id FROM project_items
            WHERE project_id = ${header.project_id}
              AND parent_project_item_id = ${header.project_item_id}
              AND item_id = ${line.component_item_id}
              AND source_bom_line_id = ${line.id}
              AND source = 'bom_explosion'
              AND status != 'Cancelled'
          `);

          if (existingChild.rows.length > 0) {
            childProjectItemId = (existingChild.rows[0] as any).id;
            childAction = 'reused';
            await tx.execute(sql`
              UPDATE project_items SET required_quantity = ${computedQty.toString()}, updated_at = NOW()
              WHERE id = ${childProjectItemId}
            `);
          } else {
            try {
              const insertResult = await tx.execute(sql`
                INSERT INTO project_items (project_id, project_code, item_id, quantity, required_quantity,
                  parent_project_item_id, source_bom_header_id, source_bom_line_id, source, status, created_at, updated_at)
                VALUES (${header.project_id}, ${projectCode}, ${line.component_item_id}, ${computedQty.toString()},
                  ${computedQty.toString()}, ${header.project_item_id}, ${id}, ${line.id}, 'bom_explosion', 'Not Started', NOW(), NOW())
                RETURNING id
              `);
              childProjectItemId = (insertResult.rows[0] as any).id;
              childAction = 'created';
            } catch (insertErr: any) {
              if (insertErr.code === '23505') {
                const retryChild = await tx.execute(sql`
                  SELECT id FROM project_items
                  WHERE project_id = ${header.project_id}
                    AND parent_project_item_id = ${header.project_item_id}
                    AND item_id = ${line.component_item_id}
                    AND source_bom_line_id = ${line.id}
                    AND source = 'bom_explosion'
                    AND status != 'Cancelled'
                `);
                if (retryChild.rows.length > 0) {
                  childProjectItemId = (retryChild.rows[0] as any).id;
                  childAction = 'reused';
                } else {
                  txResults.push({ lineId, lineNumber: line.line_number, action: 'error', reason: 'Unique constraint conflict but no reusable item found' });
                  continue;
                }
              } else {
                throw insertErr;
              }
            }
          }

          const existingPlanning = await tx.execute(sql`
            SELECT id, status FROM item_planning_records
            WHERE project_item_id = ${childProjectItemId}
              AND source_bom_line_id = ${line.id}
              AND source = 'bom_explosion'
              AND status NOT IN ('canceled', 'superseded')
          `);

          if (existingPlanning.rows.length > 0) {
            txResults.push({
              lineId, lineNumber: line.line_number, action: 'skip_existing',
              reason: `Active planning record already exists (ID: ${(existingPlanning.rows[0] as any).id})`,
              childProjectItemId, planningRecordId: (existingPlanning.rows[0] as any).id,
            });
            continue;
          }

          const explosionPlanningNumber = await epcCoding.generateDocumentNumber(header.project_id, 'PLN', tx);
          const planningResult = await tx.execute(sql`
            INSERT INTO item_planning_records (project_id, project_item_id, master_item_id, planning_type,
              classification_snapshot, source, source_bom_header_id, source_bom_line_id, parent_project_item_id,
              quantity, planning_number, status, created_by, created_at, updated_at)
            VALUES (${header.project_id}, ${childProjectItemId}, ${line.component_item_id}, ${planningType},
              ${classification}, 'bom_explosion', ${id}, ${line.id}, ${header.project_item_id},
              ${computedQty.toString()}, ${explosionPlanningNumber}, 'draft', ${userId}, NOW(), NOW())
            RETURNING id
          `);
          const planningRecordId = (planningResult.rows[0] as any).id;

          await tx.execute(sql`
            INSERT INTO bom_explosion_logs (bom_header_id, bom_line_id, project_item_id, planning_record_id,
              component_item_id, classification_used, quantity_computed, status, exploded_by, exploded_at)
            VALUES (${id}, ${line.id}, ${childProjectItemId}, ${planningRecordId},
              ${line.component_item_id}, ${classification}, ${computedQty.toString()}, 'created', ${userId}, NOW())
          `);

          await tx.execute(sql`
            INSERT INTO project_workflow_events (project_id, event_type, event_data, created_by, created_at)
            VALUES (${header.project_id}, 'bom_explosion.child_created', ${JSON.stringify({
              bomHeaderId: id, bomNumber: header.bom_number, bomLineId: line.id, lineNumber: line.line_number,
              componentItemCode: componentCode, componentDescription: componentDesc,
              classification, planningType, computedQuantity: computedQty,
              childProjectItemId, planningRecordId, childItemAction: childAction,
            })}, ${userId}, NOW())
          `);

          txResults.push({
            lineId, lineNumber: line.line_number,
            action: childAction === 'created' ? 'created' : 'reused_and_created',
            childProjectItemId, childProjectItemAction: childAction,
            planningRecordId, planningType, classification,
            computedQuantity: computedQty,
            componentItemCode: componentCode,
            componentDescription: componentDesc,
          });
        }

        return txResults;
      });

      const created = results.filter(r => ['created', 'reused_and_created'].includes(r.action)).length;
      const skipped = results.filter(r => r.action === 'skip_existing').length;
      const errors = results.filter(r => r.action === 'error').length;

      console.log(`[BOM EXPLOSION] ${header.bom_number}: ${created} created, ${skipped} skipped, ${errors} errors (user ${userId})`);
      res.status(201).json({
        success: true,
        message: `BOM ${header.bom_number} explosion complete: ${created} child records created, ${skipped} skipped, ${errors} errors.`,
        bomHeaderId: id,
        bomNumber: header.bom_number,
        summary: { created, skipped, errors, total: results.length },
        results,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/bom-headers/:id/explosion-status', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const headerResult = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${id}`);
      if (headerResult.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const header = headerResult.rows[0] as any;

      const linesResult = await db.execute(sql`
        SELECT id, line_number, component_item_id, component_item_code, component_description,
          component_make_or_buy, quantity_per_unit, planning_required
        FROM epc_bom_lines WHERE bom_header_id = ${id} ORDER BY line_number
      `);

      const logsResult = await db.execute(sql`
        SELECT bel.*, ipr.status as planning_status, ipr.planning_type
        FROM bom_explosion_logs bel
        LEFT JOIN item_planning_records ipr ON ipr.id = bel.planning_record_id
        WHERE bel.bom_header_id = ${id}
        ORDER BY bel.exploded_at
      `);

      const logsByLine = new Map<number, any>();
      for (const log of logsResult.rows as any[]) {
        if (!logsByLine.has(log.bom_line_id) || log.status === 'created') {
          logsByLine.set(log.bom_line_id, log);
        }
      }

      const lineStatuses = [];
      let explodedCount = 0;
      let eligibleCount = 0;

      for (const line of linesResult.rows as any[]) {
        const log = logsByLine.get(line.id);
        const isEligible = line.planning_required;
        if (isEligible) eligibleCount++;

        if (!isEligible) {
          lineStatuses.push({
            lineId: line.id, lineNumber: line.line_number,
            componentItemCode: line.component_item_code,
            componentDescription: line.component_description,
            planningRequired: false,
            exploded: false, explosionStatus: 'not_required',
          });
        } else if (log && log.status === 'created') {
          explodedCount++;
          lineStatuses.push({
            lineId: line.id, lineNumber: line.line_number,
            componentItemCode: line.component_item_code,
            componentDescription: line.component_description,
            planningRequired: true,
            exploded: true, explosionStatus: 'exploded',
            childProjectItemId: log.project_item_id,
            planningRecordId: log.planning_record_id,
            planningStatus: log.planning_status,
            planningType: log.planning_type,
            classificationUsed: log.classification_used,
            quantityComputed: log.quantity_computed,
            explodedBy: log.exploded_by,
            explodedAt: log.exploded_at,
          });
        } else if (log && log.status === 'superseded') {
          lineStatuses.push({
            lineId: line.id, lineNumber: line.line_number,
            componentItemCode: line.component_item_code,
            componentDescription: line.component_description,
            planningRequired: true,
            exploded: false, explosionStatus: 'superseded',
            supersededAt: log.superseded_at,
          });
        } else {
          lineStatuses.push({
            lineId: line.id, lineNumber: line.line_number,
            componentItemCode: line.component_item_code,
            componentDescription: line.component_description,
            planningRequired: true,
            exploded: false, explosionStatus: 'pending',
          });
        }
      }

      let explosionState: string;
      if (eligibleCount === 0) {
        explosionState = 'not_exploded';
      } else if (explodedCount === 0) {
        explosionState = 'not_exploded';
      } else if (explodedCount >= eligibleCount) {
        explosionState = 'fully_exploded';
      } else {
        explosionState = 'partially_exploded';
      }

      res.json({
        success: true,
        bomHeaderId: id,
        bomNumber: header.bom_number,
        bomStatus: header.status,
        explosionState,
        summary: { totalLines: linesResult.rows.length, eligibleCount, explodedCount },
        lines: lineStatuses,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ==================== BOM LINES ====================

  app.get('/api/bom-headers/:bomHeaderId/lines', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const bomHeaderId = parseInt(req.params.bomHeaderId);
      const headerCheck = await db.execute(sql`SELECT id FROM epc_bom_headers WHERE id = ${bomHeaderId}`);
      if (headerCheck.rows.length === 0) return sendNotFound(res, 'BOM header not found');

      const results = await db.execute(sql`
        SELECT bl.*, mi.description as master_item_description, mi.item_code as master_item_code
        FROM epc_bom_lines bl
        LEFT JOIN master_items mi ON bl.component_item_id = mi.id
        WHERE bl.bom_header_id = ${bomHeaderId}
        ORDER BY bl.line_number
      `);
      res.json(results.rows);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/bom-headers/:bomHeaderId/lines', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const bomHeaderId = parseInt(req.params.bomHeaderId);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      if (roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to add BOM lines.');
      }

      const headerResult = await db.execute(sql`SELECT * FROM epc_bom_headers WHERE id = ${bomHeaderId}`);
      if (headerResult.rows.length === 0) return sendNotFound(res, 'BOM header not found');
      const header = headerResult.rows[0] as any;

      if (!(await guardProjectNotFrozen(header.project_id, res))) return;
      if (!(await guardCostNotLocked(header.project_id, res))) return;
      if (header.status !== 'draft') {
        return sendBusinessError(res, `Cannot add lines: BOM status is '${header.status}'. Only 'draft' BOMs can be modified.`);
      }

      const { componentItemId, quantityPerUnit, componentDrawingNo, estimatedUnitCost, procurementLeadTimeDays, preferredVendor, notes, componentSpecification } = req.body;

      if (!componentItemId) return sendValidationError(res, 'componentItemId is required');

      const itemResult = await db.execute(sql`SELECT * FROM master_items WHERE id = ${componentItemId}`);
      if (itemResult.rows.length === 0) return sendNotFound(res, 'Component item not found');
      const item = itemResult.rows[0] as any;

      const maxLineResult = await db.execute(sql`SELECT COALESCE(MAX(line_number), 0) as max_line FROM epc_bom_lines WHERE bom_header_id = ${bomHeaderId}`);
      const nextLine = parseInt((maxLineResult.rows[0] as any).max_line) + 1;

      const qty = parseFloat(quantityPerUnit) || 1;
      const unitCost = estimatedUnitCost ? parseFloat(estimatedUnitCost) : null;
      const totalCost = unitCost !== null ? (unitCost * qty).toFixed(2) : null;

      const [created] = await db.insert(epcBomLines).values({
        bomHeaderId,
        lineNumber: nextLine,
        componentItemId,
        componentItemCode: item.item_code,
        componentDescription: item.description,
        componentSpecification: componentSpecification || null,
        componentUom: item.uom || null,
        componentMakeOrBuy: item.make_or_buy || null,
        quantityPerUnit: String(qty),
        componentDrawingNo: componentDrawingNo || null,
        estimatedUnitCost: unitCost !== null ? String(unitCost) : null,
        estimatedTotalCost: totalCost,
        procurementLeadTimeDays: procurementLeadTimeDays || null,
        preferredVendor: preferredVendor || null,
        notes: notes || null,
      }).returning();

      const countResult = await db.execute(sql`SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(estimated_total_cost AS DECIMAL)), 0) as total_cost FROM epc_bom_lines WHERE bom_header_id = ${bomHeaderId}`);
      const lineCount = parseInt((countResult.rows[0] as any).cnt);
      const totalEstCost = parseFloat((countResult.rows[0] as any).total_cost) || 0;

      await db.update(epcBomHeaders).set({
        totalLineCount: lineCount,
        totalEstimatedCost: String(totalEstCost),
        updatedAt: new Date(),
      }).where(eq(epcBomHeaders.id, bomHeaderId));

      console.log(`[BOM] Line ${nextLine} added to ${header.bom_number} (component: ${item.item_code}) by user ${userId}`);
      res.status(201).json({ success: true, data: created, message: `Line ${nextLine} added` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/bom-lines/:id', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      if (roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to edit BOM lines.');
      }

      const lineResult = await db.execute(sql`SELECT bl.*, bh.status as header_status, bh.bom_number, pi.project_id FROM epc_bom_lines bl JOIN epc_bom_headers bh ON bl.bom_header_id = bh.id JOIN project_items pi ON pi.id = bh.project_item_id WHERE bl.id = ${id}`);
      if (lineResult.rows.length === 0) return sendNotFound(res, 'BOM line not found');
      const line = lineResult.rows[0] as any;

      if (!(await guardCostNotLocked(line.project_id, res))) return;
      if (line.header_status !== 'draft') {
        return sendBusinessError(res, `Cannot update line: BOM status is '${line.header_status}'. Only 'draft' BOMs can be modified.`);
      }

      const allowedFields = ['quantityPerUnit', 'componentDrawingNo', 'estimatedUnitCost', 'procurementLeadTimeDays', 'preferredVendor', 'notes', 'componentSpecification'];
      const updates: any = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      if (updates.quantityPerUnit !== undefined || updates.estimatedUnitCost !== undefined) {
        const qty = updates.quantityPerUnit !== undefined ? parseFloat(updates.quantityPerUnit) : parseFloat(line.quantity_per_unit);
        const unitCost = updates.estimatedUnitCost !== undefined ? parseFloat(updates.estimatedUnitCost) : (line.estimated_unit_cost ? parseFloat(line.estimated_unit_cost) : null);
        if (unitCost !== null) {
          updates.estimatedTotalCost = String((unitCost * qty).toFixed(2));
        }
        if (updates.quantityPerUnit !== undefined) updates.quantityPerUnit = String(qty);
        if (updates.estimatedUnitCost !== undefined) updates.estimatedUnitCost = unitCost !== null ? String(unitCost) : null;
      }

      await db.update(epcBomLines).set(updates).where(eq(epcBomLines.id, id));

      const countResult = await db.execute(sql`SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(estimated_total_cost AS DECIMAL)), 0) as total_cost FROM epc_bom_lines WHERE bom_header_id = ${line.bom_header_id}`);
      await db.update(epcBomHeaders).set({
        totalEstimatedCost: String(parseFloat((countResult.rows[0] as any).total_cost) || 0),
        updatedAt: new Date(),
      }).where(eq(epcBomHeaders.id, line.bom_header_id));

      console.log(`[BOM] Line ${line.line_number} updated on ${line.bom_number} by user ${userId}`);
      res.json({ success: true, message: `Line ${line.line_number} updated` });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/bom-lines/:id', ensureAuthenticated, requirePageAccess('bom-controls'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      if (roleHierarchy[userRole] > roleHierarchy['Manager']) {
        return sendPermissionError(res, 'Manager or above required to delete BOM lines.');
      }

      const lineResult = await db.execute(sql`SELECT bl.*, bh.status as header_status, bh.bom_number, bh.id as header_id, pi.project_id FROM epc_bom_lines bl JOIN epc_bom_headers bh ON bl.bom_header_id = bh.id JOIN project_items pi ON pi.id = bh.project_item_id WHERE bl.id = ${id}`);
      if (lineResult.rows.length === 0) return sendNotFound(res, 'BOM line not found');
      const line = lineResult.rows[0] as any;

      if (!(await guardCostNotLocked(line.project_id, res))) return;
      if (line.header_status !== 'draft') {
        return sendBusinessError(res, `Cannot delete line: BOM status is '${line.header_status}'. Only 'draft' BOMs can be modified.`);
      }

      await db.delete(epcBomLines).where(eq(epcBomLines.id, id));

      const countResult = await db.execute(sql`SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(estimated_total_cost AS DECIMAL)), 0) as total_cost FROM epc_bom_lines WHERE bom_header_id = ${line.header_id}`);
      await db.update(epcBomHeaders).set({
        totalLineCount: parseInt((countResult.rows[0] as any).cnt),
        totalEstimatedCost: String(parseFloat((countResult.rows[0] as any).total_cost) || 0),
        updatedAt: new Date(),
      }).where(eq(epcBomHeaders.id, line.header_id));

      console.log(`[BOM] Line ${line.line_number} deleted from ${line.bom_number} by user ${userId}`);
      res.json({ success: true, message: `Line ${line.line_number} deleted` });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Master Items routes moved to server/routes.ts to avoid conflicts
  // The main routes file has the complete implementation with project filtering support

  auditFreezeGuardCoverage();
}

const FREEZE_GUARD_EXEMPT_ROUTES = new Set([
  'GET ',
  '/api/projects/:projectId/phases',
  '/api/projects/:projectId/members',
  '/api/projects/:projectId/items',
  '/api/projects/:projectId/inspection-aging-check',
  '/api/projects/:id',
]);

async function auditFreezeGuardCoverage() {
  const { readFileSync, existsSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const __auditDirname = dirname(fileURLToPath(import.meta.url));
  const sourceFile = join(__auditDirname, 'project-routes.ts');
  if (!existsSync(sourceFile)) {
    console.log(`[Freeze-Audit] ⏭️ Skipped — source file not available in production build`);
    return;
  }
  const source: string = readFileSync(sourceFile, 'utf8');

  const routePattern = /app\.(post|patch|put)\(\s*['"`](\/api\/[^'"`]+)['"`]/g;
  const allWriteRoutes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = routePattern.exec(source)) !== null) {
    allWriteRoutes.push(`${match[1].toUpperCase()} ${match[2]}`);
  }

  const guardPattern = /guardProjectNotFrozen|guardRecordProjectNotFrozen/g;
  const guardPositions: number[] = [];
  let gm: RegExpExecArray | null;
  while ((gm = guardPattern.exec(source)) !== null) {
    if (source.substring(Math.max(0, gm.index - 30), gm.index).includes('function ')) continue;
    if (source.substring(Math.max(0, gm.index - 30), gm.index).includes('return ')) continue;
    guardPositions.push(gm.index);
  }

  const unguarded: string[] = [];
  const routeBodyPattern = /app\.(post|patch|put)\(\s*['"`](\/api\/[^'"`]+)['"`]/g;
  let rm: RegExpExecArray | null;
  while ((rm = routeBodyPattern.exec(source)) !== null) {
    const routeKey = `${rm[1].toUpperCase()} ${rm[2]}`;

    let exempt = false;
    for (const ex of FREEZE_GUARD_EXEMPT_ROUTES) {
      if (routeKey.includes(ex) || rm[2].includes(ex)) { exempt = true; break; }
    }
    if (exempt) continue;

    if (!rm[2].includes('/api/projects/') && !rm[2].includes('/api/planning-records/') &&
        !rm[2].includes('/api/quality-plans/') && !rm[2].includes('/api/inspection-') &&
        !rm[2].includes('/api/po-prep') && !rm[2].includes('/api/wo-prep') &&
        !rm[2].includes('/api/dispatch-') && !rm[2].includes('/api/commissioning-') &&
        !rm[2].includes('/api/billing-') && !rm[2].includes('/api/epc-invoices/') &&
        !rm[2].includes('/api/drawing-controls/') && !rm[2].includes('/api/bom-')) {
      continue;
    }

    const nextRouteMatch = routeBodyPattern.exec(source);
    const blockEnd = nextRouteMatch ? nextRouteMatch.index : source.length;
    routeBodyPattern.lastIndex = rm.index + rm[0].length;

    const hasGuard = guardPositions.some(pos => pos > rm!.index && pos < blockEnd);
    if (!hasGuard) {
      unguarded.push(routeKey);
    }
  }

  if (unguarded.length === 0) {
    console.log(`[Freeze-Audit] ✅ All ${allWriteRoutes.length} project-scoped write endpoints have freeze guards.`);
  } else {
    console.warn(`[Freeze-Audit] ⚠️ ${unguarded.length} project-scoped write endpoint(s) MISSING freeze guard:`);
    for (const r of unguarded) {
      console.warn(`[Freeze-Audit]   ❌ ${r}`);
    }
  }
}