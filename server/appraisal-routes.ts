import { Router, Request, Response } from 'express';
import { db } from './db';
import {
  appraisalCycleTemplates, appraisalCycles, employeeAppraisals,
  employeeAppraisalKpis, employeeAppraisalCompetencies,
  appraisalComments, appraisalApprovals, appraisalAuditLog,
  users,
  InsertAppraisalCycleTemplate, InsertAppraisalCycle, InsertEmployeeAppraisal,
  insertAppraisalCycleTemplateSchema, insertAppraisalCycleSchema, insertEmployeeAppraisalSchema
} from '@shared/schema';
import { eq, and, or, desc, sql, count } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';

const router = Router();

function getUserDisplayName(user: any): string {
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.cardName) return user.cardName;
  return user.username;
}

function getRatingBand(score: number): string {
  if (score >= 4.5) return 'excellent';
  if (score >= 3.5) return 'very_good';
  if (score >= 2.5) return 'good';
  if (score >= 1.5) return 'fair';
  return 'poor';
}

async function logAudit(entityType: string, entityId: number, action: string, performedBy: number | null, performedByName: string | null, performedBySystem: boolean, details: any) {
  await db.insert(appraisalAuditLog).values({
    entityType,
    entityId,
    action,
    performedBy,
    performedByName,
    performedBySystem,
    details,
  });
}

// ==========================================
// TEMPLATE ENDPOINTS
// ==========================================

router.get('/templates', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const templates = await db.select().from(appraisalCycleTemplates).orderBy(appraisalCycleTemplates.id);
    res.json(templates);
  } catch (error: any) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.post('/templates', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) {
      return res.status(403).json({ error: 'Only HR/Superuser can manage templates' });
    }
    const parsed = insertAppraisalCycleTemplateSchema.parse(req.body);
    const [template] = await db.insert(appraisalCycleTemplates).values(parsed).returning();
    await logAudit('template', template.id, 'template_created', user.id, getUserDisplayName(user), false, { name: template.name });
    res.status(201).json(template);
  } catch (error: any) {
    console.error('Error creating template:', error);
    res.status(400).json({ error: error.message || 'Failed to create template' });
  }
});

router.put('/templates/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) {
      return res.status(403).json({ error: 'Only HR/Superuser can manage templates' });
    }
    const id = parseInt(req.params.id);
    const { name, cycleType, triggerMonth, triggerDay, selfDeadlineDays, managerDeadlineDays, l2DeadlineDays, approvalDeadlineDays, closureBufferDays, minServiceDays, autoCreate, isActive } = req.body;
    const [updated] = await db.update(appraisalCycleTemplates)
      .set({ name, cycleType, triggerMonth, triggerDay, selfDeadlineDays, managerDeadlineDays, l2DeadlineDays, approvalDeadlineDays, closureBufferDays, minServiceDays, autoCreate, isActive, updatedAt: new Date() })
      .where(eq(appraisalCycleTemplates.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Template not found' });
    await logAudit('template', id, 'template_updated', user.id, getUserDisplayName(user), false, req.body);
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating template:', error);
    res.status(400).json({ error: error.message || 'Failed to update template' });
  }
});

// ==========================================
// CYCLE ENDPOINTS
// ==========================================

router.get('/cycles', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const cycles = await db.select().from(appraisalCycles).orderBy(desc(appraisalCycles.createdAt));
    res.json(cycles);
  } catch (error: any) {
    console.error('Error fetching cycles:', error);
    res.status(500).json({ error: 'Failed to fetch cycles' });
  }
});

router.get('/cycles/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [cycle] = await db.select().from(appraisalCycles).where(eq(appraisalCycles.id, id));
    if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
    res.json(cycle);
  } catch (error: any) {
    console.error('Error fetching cycle:', error);
    res.status(500).json({ error: 'Failed to fetch cycle' });
  }
});

router.post('/cycles', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) {
      return res.status(403).json({ error: 'Only HR/Superuser can create cycles' });
    }
    const parsed = insertAppraisalCycleSchema.parse({ ...req.body, createdBy: user.id });
    const [cycle] = await db.insert(appraisalCycles).values(parsed).returning();
    await logAudit('cycle', cycle.id, 'cycle_created', user.id, getUserDisplayName(user), false, { name: cycle.name, financialYear: cycle.financialYear });
    res.status(201).json(cycle);
  } catch (error: any) {
    console.error('Error creating cycle:', error);
    res.status(400).json({ error: error.message || 'Failed to create cycle' });
  }
});

router.put('/cycles/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) {
      return res.status(403).json({ error: 'Only HR/Superuser can update cycles' });
    }
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(appraisalCycles).where(eq(appraisalCycles.id, id));
    if (!existing) return res.status(404).json({ error: 'Cycle not found' });

    const { name, status, selfAssessmentDeadline, managerReviewDeadline, l2ReviewDeadline, approvalDeadline, closureDate } = req.body;
    const [updated] = await db.update(appraisalCycles)
      .set({ name, status, selfAssessmentDeadline, managerReviewDeadline, l2ReviewDeadline, approvalDeadline, closureDate, updatedAt: new Date() })
      .where(eq(appraisalCycles.id, id))
      .returning();
    await logAudit('cycle', id, 'cycle_updated', user.id, getUserDisplayName(user), false, req.body);
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating cycle:', error);
    res.status(400).json({ error: error.message || 'Failed to update cycle' });
  }
});

// ==========================================
// APPRAISAL LIST ENDPOINT — ROLE-BASED FILTERING
// ==========================================

router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const view = (req.query.view as string) || 'my';
    const cycleId = req.query.cycleId ? parseInt(req.query.cycleId as string) : undefined;

    let conditions: any[] = [];

    switch (view) {
      case 'my':
        conditions.push(eq(employeeAppraisals.employeeId, user.id));
        break;
      case 'l1':
        conditions.push(eq(employeeAppraisals.l1ReviewerId, user.id));
        break;
      case 'l2':
        conditions.push(eq(employeeAppraisals.l2ReviewerId, user.id));
        break;
      case 'l3':
        conditions.push(eq(employeeAppraisals.l3ApproverId, user.id));
        break;
      case 'all':
        if (!['Superuser', 'HR', 'Admin'].includes(user.role)) {
          return res.status(403).json({ error: 'Only HR/Admin/Superuser can view all appraisals' });
        }
        break;
      default:
        conditions.push(eq(employeeAppraisals.employeeId, user.id));
    }

    if (cycleId) {
      conditions.push(eq(employeeAppraisals.cycleId, cycleId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const appraisals = await db.select().from(employeeAppraisals)
      .where(whereClause)
      .orderBy(desc(employeeAppraisals.createdAt));

    res.json(appraisals);
  } catch (error: any) {
    console.error('Error fetching appraisals:', error);
    res.status(500).json({ error: 'Failed to fetch appraisals' });
  }
});

// ==========================================
// ROLE CHECK — which tabs/views a user has
// (must be before /:id to avoid route conflict)
// ==========================================

router.get('/user/role-check', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    const [myCount] = await db.select({ count: count() }).from(employeeAppraisals)
      .where(eq(employeeAppraisals.employeeId, user.id));
    const [l1Count] = await db.select({ count: count() }).from(employeeAppraisals)
      .where(eq(employeeAppraisals.l1ReviewerId, user.id));
    const [l2Count] = await db.select({ count: count() }).from(employeeAppraisals)
      .where(eq(employeeAppraisals.l2ReviewerId, user.id));
    const [l3Count] = await db.select({ count: count() }).from(employeeAppraisals)
      .where(eq(employeeAppraisals.l3ApproverId, user.id));

    const isHrAdmin = ['Superuser', 'HR', 'Admin'].includes(user.role);

    res.json({
      hasMyAppraisals: (myCount?.count || 0) > 0,
      isL1Reviewer: (l1Count?.count || 0) > 0,
      isL2Reviewer: (l2Count?.count || 0) > 0,
      isL3Approver: (l3Count?.count || 0) > 0,
      isHrAdmin,
    });
  } catch (error: any) {
    console.error('Error checking roles:', error);
    res.status(500).json({ error: 'Failed to check roles' });
  }
});

// ==========================================
// SINGLE APPRAISAL DETAIL
// ==========================================

router.get('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const id = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, id));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });

    const isAuthorized = ['Superuser', 'HR', 'Admin'].includes(user.role)
      || appraisal.employeeId === user.id
      || appraisal.l1ReviewerId === user.id
      || appraisal.l2ReviewerId === user.id
      || appraisal.l3ApproverId === user.id;

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Not authorized to view this appraisal' });
    }

    res.json(appraisal);
  } catch (error: any) {
    console.error('Error fetching appraisal:', error);
    res.status(500).json({ error: 'Failed to fetch appraisal' });
  }
});

// ==========================================
// CREATE APPRAISAL (manual) with L1/L2/L3 snapshot
// ==========================================

router.post('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) {
      return res.status(403).json({ error: 'Only HR/Superuser can create appraisals' });
    }

    const { cycleId, employeeId } = req.body;
    if (!cycleId || !employeeId) {
      return res.status(400).json({ error: 'cycleId and employeeId are required' });
    }

    const [existingAppraisal] = await db.select().from(employeeAppraisals)
      .where(and(eq(employeeAppraisals.cycleId, cycleId), eq(employeeAppraisals.employeeId, employeeId)));
    if (existingAppraisal) {
      return res.status(409).json({ error: 'Appraisal already exists for this employee in this cycle' });
    }

    const [employee] = await db.select().from(users).where(eq(users.id, employeeId));
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if (!employee.isActive) return res.status(400).json({ error: 'Employee is not active' });
    if (!employee.reportingManagerId) return res.status(400).json({ error: 'Employee has no reporting manager (L1)' });

    const [l1] = await db.select().from(users).where(eq(users.id, employee.reportingManagerId));
    if (!l1) return res.status(400).json({ error: 'L1 Reviewer (Reporting Manager) not found' });

    let l2Id: number;
    let l2Name: string;
    if (l1.reportingManagerId) {
      const [l2User] = await db.select().from(users).where(eq(users.id, l1.reportingManagerId));
      if (l2User) {
        l2Id = l2User.id;
        l2Name = getUserDisplayName(l2User);
      } else {
        return res.status(400).json({ error: 'L2 Reviewer (L1\'s manager) not found in database' });
      }
    } else {
      return res.status(400).json({ error: 'L1 has no reporting manager — cannot determine L2 Reviewer' });
    }

    let l3Id: number;
    let l3Name: string;
    const [l2User] = await db.select().from(users).where(eq(users.id, l2Id));
    if (l2User && l2User.reportingManagerId) {
      const [l3User] = await db.select().from(users).where(eq(users.id, l2User.reportingManagerId));
      if (l3User) {
        l3Id = l3User.id;
        l3Name = getUserDisplayName(l3User);
      } else {
        const [fallback] = await db.select().from(users).where(eq(users.role, 'Superuser'));
        if (!fallback) return res.status(400).json({ error: 'No L3 approver available' });
        l3Id = fallback.id;
        l3Name = getUserDisplayName(fallback);
      }
    } else {
      const [fallback] = await db.select().from(users).where(eq(users.role, 'Superuser'));
      if (!fallback) return res.status(400).json({ error: 'No L3 approver or Superuser fallback available' });
      l3Id = fallback.id;
      l3Name = getUserDisplayName(fallback);
    }

    const [appraisal] = await db.insert(employeeAppraisals).values({
      cycleId,
      employeeId: employee.id,
      employeeName: getUserDisplayName(employee),
      employeeCode: employee.employeeCode || undefined,
      department: employee.department || undefined,
      designation: employee.jobTitle || undefined,
      dateOfJoining: employee.dateOfJoining || undefined,
      l1ReviewerId: l1.id,
      l1ReviewerName: getUserDisplayName(l1),
      l2ReviewerId: l2Id,
      l2ReviewerName: l2Name,
      l3ApproverId: l3Id,
      l3ApproverName: l3Name,
      status: 'draft',
    }).returning();

    await logAudit('appraisal', appraisal.id, 'appraisal_created', user.id, getUserDisplayName(user), false, {
      employeeId: employee.id,
      employeeName: getUserDisplayName(employee),
      l1: getUserDisplayName(l1),
      l2: l2Name,
      l3: l3Name,
    });

    res.status(201).json(appraisal);
  } catch (error: any) {
    console.error('Error creating appraisal:', error);
    res.status(400).json({ error: error.message || 'Failed to create appraisal' });
  }
});

// ==========================================
// ELIGIBLE EMPLOYEES FOR A CYCLE
// ==========================================

router.get('/cycles/:cycleId/eligible-employees', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) {
      return res.status(403).json({ error: 'Only HR/Superuser can view eligible employees' });
    }

    const cycleId = parseInt(req.params.cycleId);
    const [cycle] = await db.select().from(appraisalCycles).where(eq(appraisalCycles.id, cycleId));
    if (!cycle) return res.status(404).json({ error: 'Cycle not found' });

    let templateMinServiceDays = 90;
    if (cycle.templateId) {
      const [tmpl] = await db.select().from(appraisalCycleTemplates).where(eq(appraisalCycleTemplates.id, cycle.templateId));
      if (tmpl) templateMinServiceDays = tmpl.minServiceDays;
    }

    const allActiveUsers = await db.select().from(users).where(eq(users.isActive, true));
    const existingAppraisals = await db.select({ employeeId: employeeAppraisals.employeeId })
      .from(employeeAppraisals).where(eq(employeeAppraisals.cycleId, cycleId));
    const existingEmployeeIds = new Set(existingAppraisals.map(a => a.employeeId));

    const eligible: any[] = [];
    const skipped: any[] = [];

    for (const emp of allActiveUsers) {
      const empName = getUserDisplayName(emp);

      if (existingEmployeeIds.has(emp.id)) {
        skipped.push({ id: emp.id, name: empName, reason: 'already_exists' });
        continue;
      }
      if (!emp.reportingManagerId) {
        skipped.push({ id: emp.id, name: empName, reason: 'no_manager' });
        continue;
      }
      if (emp.dateOfJoining) {
        const joinDate = new Date(emp.dateOfJoining);
        const cycleStartDate = new Date(cycle.startDate);
        const daysSinceJoining = Math.floor((cycleStartDate.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceJoining < templateMinServiceDays) {
          skipped.push({ id: emp.id, name: empName, reason: 'insufficient_service', daysSinceJoining, minRequired: templateMinServiceDays });
          continue;
        }
      }

      eligible.push({ id: emp.id, name: empName, department: emp.department, designation: emp.jobTitle, reportingManagerId: emp.reportingManagerId });
    }

    res.json({ eligible, skipped, total: allActiveUsers.length });
  } catch (error: any) {
    console.error('Error fetching eligible employees:', error);
    res.status(500).json({ error: 'Failed to fetch eligible employees' });
  }
});

export default router;
