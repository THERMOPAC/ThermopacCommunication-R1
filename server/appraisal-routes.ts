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

// ==========================================
// PHASE 3: KPI CRUD
// ==========================================

router.get('/:id/kpis', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });

    const isAuthorized = ['Superuser', 'HR', 'Admin'].includes(user.role)
      || appraisal.employeeId === user.id || appraisal.l1ReviewerId === user.id
      || appraisal.l2ReviewerId === user.id || appraisal.l3ApproverId === user.id;
    if (!isAuthorized) return res.status(403).json({ error: 'Not authorized' });

    const kpis = await db.select().from(employeeAppraisalKpis)
      .where(eq(employeeAppraisalKpis.appraisalId, appraisalId))
      .orderBy(employeeAppraisalKpis.sortOrder);
    res.json(kpis);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

router.post('/:id/kpis', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });
    if (appraisal.isLocked) return res.status(400).json({ error: 'Appraisal is locked' });

    const canAdd = (appraisal.employeeId === user.id && ['open', 'draft'].includes(appraisal.status))
      || ['Superuser', 'HR'].includes(user.role);
    if (!canAdd) return res.status(403).json({ error: 'Cannot add KPI at this stage' });

    const { kpiTitle, kpiDescription, weightage, targetValue, selfScore, selfComments, sortOrder } = req.body;
    const [kpi] = await db.insert(employeeAppraisalKpis).values({
      appraisalId, kpiTitle, kpiDescription, weightage: weightage?.toString(),
      targetValue, selfScore: selfScore?.toString(), selfComments, sortOrder: sortOrder || 0,
    }).returning();

    await logAudit('kpi', kpi.id, 'kpi_created', user.id, getUserDisplayName(user), false, { appraisalId, kpiTitle });
    res.status(201).json(kpi);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create KPI' });
  }
});

router.put('/:id/kpis/:kpiId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const kpiId = parseInt(req.params.kpiId);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });
    if (appraisal.isLocked) return res.status(400).json({ error: 'Appraisal is locked' });

    const updateFields: any = { updatedAt: new Date() };

    if (appraisal.employeeId === user.id && ['open', 'draft'].includes(appraisal.status)) {
      if (req.body.kpiTitle !== undefined) updateFields.kpiTitle = req.body.kpiTitle;
      if (req.body.kpiDescription !== undefined) updateFields.kpiDescription = req.body.kpiDescription;
      if (req.body.weightage !== undefined) updateFields.weightage = req.body.weightage.toString();
      if (req.body.targetValue !== undefined) updateFields.targetValue = req.body.targetValue;
      if (req.body.achievedValue !== undefined) updateFields.achievedValue = req.body.achievedValue;
      if (req.body.selfScore !== undefined) updateFields.selfScore = req.body.selfScore.toString();
      if (req.body.selfComments !== undefined) updateFields.selfComments = req.body.selfComments;
      if (req.body.sortOrder !== undefined) updateFields.sortOrder = req.body.sortOrder;
    } else if (appraisal.l1ReviewerId === user.id && appraisal.status === 'self_submitted') {
      if (req.body.managerScore !== undefined) updateFields.managerScore = req.body.managerScore.toString();
      if (req.body.managerComments !== undefined) updateFields.managerComments = req.body.managerComments;
    } else if (appraisal.l2ReviewerId === user.id && appraisal.status === 'l1_reviewed') {
      if (req.body.l2Score !== undefined) updateFields.l2Score = req.body.l2Score.toString();
      if (req.body.l2Comments !== undefined) updateFields.l2Comments = req.body.l2Comments;
    } else if (['Superuser', 'HR'].includes(user.role)) {
      Object.assign(updateFields, req.body);
      if (updateFields.weightage) updateFields.weightage = updateFields.weightage.toString();
      if (updateFields.selfScore) updateFields.selfScore = updateFields.selfScore.toString();
      if (updateFields.managerScore) updateFields.managerScore = updateFields.managerScore.toString();
      if (updateFields.l2Score) updateFields.l2Score = updateFields.l2Score.toString();
    } else {
      return res.status(403).json({ error: 'Not authorized to update KPI at this stage' });
    }

    const [updated] = await db.update(employeeAppraisalKpis).set(updateFields)
      .where(and(eq(employeeAppraisalKpis.id, kpiId), eq(employeeAppraisalKpis.appraisalId, appraisalId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'KPI not found' });

    await logAudit('kpi', kpiId, 'kpi_updated', user.id, getUserDisplayName(user), false, updateFields);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to update KPI' });
  }
});

router.delete('/:id/kpis/:kpiId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const kpiId = parseInt(req.params.kpiId);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });
    if (appraisal.isLocked) return res.status(400).json({ error: 'Appraisal is locked' });

    const canDelete = (appraisal.employeeId === user.id && ['open', 'draft'].includes(appraisal.status))
      || ['Superuser', 'HR'].includes(user.role);
    if (!canDelete) return res.status(403).json({ error: 'Cannot delete KPI at this stage' });

    await db.delete(employeeAppraisalKpis)
      .where(and(eq(employeeAppraisalKpis.id, kpiId), eq(employeeAppraisalKpis.appraisalId, appraisalId)));

    await logAudit('kpi', kpiId, 'kpi_deleted', user.id, getUserDisplayName(user), false, { appraisalId });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete KPI' });
  }
});

// ==========================================
// PHASE 3: COMPETENCY CRUD
// ==========================================

router.get('/:id/competencies', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });

    const isAuthorized = ['Superuser', 'HR', 'Admin'].includes(user.role)
      || appraisal.employeeId === user.id || appraisal.l1ReviewerId === user.id
      || appraisal.l2ReviewerId === user.id || appraisal.l3ApproverId === user.id;
    if (!isAuthorized) return res.status(403).json({ error: 'Not authorized' });

    const competencies = await db.select().from(employeeAppraisalCompetencies)
      .where(eq(employeeAppraisalCompetencies.appraisalId, appraisalId))
      .orderBy(employeeAppraisalCompetencies.sortOrder);
    res.json(competencies);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch competencies' });
  }
});

router.post('/:id/competencies', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });
    if (appraisal.isLocked) return res.status(400).json({ error: 'Appraisal is locked' });

    const canAdd = (appraisal.employeeId === user.id && ['open', 'draft'].includes(appraisal.status))
      || ['Superuser', 'HR'].includes(user.role);
    if (!canAdd) return res.status(403).json({ error: 'Cannot add competency at this stage' });

    const { competencyName, competencyDescription, selfScore, selfComments, sortOrder } = req.body;
    const [comp] = await db.insert(employeeAppraisalCompetencies).values({
      appraisalId, competencyName, competencyDescription,
      selfScore: selfScore?.toString(), selfComments, sortOrder: sortOrder || 0,
    }).returning();

    await logAudit('competency', comp.id, 'competency_created', user.id, getUserDisplayName(user), false, { appraisalId, competencyName });
    res.status(201).json(comp);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create competency' });
  }
});

router.put('/:id/competencies/:compId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const compId = parseInt(req.params.compId);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });
    if (appraisal.isLocked) return res.status(400).json({ error: 'Appraisal is locked' });

    const updateFields: any = { updatedAt: new Date() };

    if (appraisal.employeeId === user.id && ['open', 'draft'].includes(appraisal.status)) {
      if (req.body.competencyName !== undefined) updateFields.competencyName = req.body.competencyName;
      if (req.body.competencyDescription !== undefined) updateFields.competencyDescription = req.body.competencyDescription;
      if (req.body.selfScore !== undefined) updateFields.selfScore = req.body.selfScore.toString();
      if (req.body.selfComments !== undefined) updateFields.selfComments = req.body.selfComments;
      if (req.body.sortOrder !== undefined) updateFields.sortOrder = req.body.sortOrder;
    } else if (appraisal.l1ReviewerId === user.id && appraisal.status === 'self_submitted') {
      if (req.body.managerScore !== undefined) updateFields.managerScore = req.body.managerScore.toString();
      if (req.body.managerComments !== undefined) updateFields.managerComments = req.body.managerComments;
    } else if (appraisal.l2ReviewerId === user.id && appraisal.status === 'l1_reviewed') {
      if (req.body.l2Score !== undefined) updateFields.l2Score = req.body.l2Score.toString();
      if (req.body.l2Comments !== undefined) updateFields.l2Comments = req.body.l2Comments;
    } else if (['Superuser', 'HR'].includes(user.role)) {
      Object.assign(updateFields, req.body);
      if (updateFields.selfScore) updateFields.selfScore = updateFields.selfScore.toString();
      if (updateFields.managerScore) updateFields.managerScore = updateFields.managerScore.toString();
      if (updateFields.l2Score) updateFields.l2Score = updateFields.l2Score.toString();
    } else {
      return res.status(403).json({ error: 'Not authorized to update competency at this stage' });
    }

    const [updated] = await db.update(employeeAppraisalCompetencies).set(updateFields)
      .where(and(eq(employeeAppraisalCompetencies.id, compId), eq(employeeAppraisalCompetencies.appraisalId, appraisalId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Competency not found' });

    await logAudit('competency', compId, 'competency_updated', user.id, getUserDisplayName(user), false, updateFields);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to update competency' });
  }
});

router.delete('/:id/competencies/:compId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const compId = parseInt(req.params.compId);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });
    if (appraisal.isLocked) return res.status(400).json({ error: 'Appraisal is locked' });

    const canDelete = (appraisal.employeeId === user.id && ['open', 'draft'].includes(appraisal.status))
      || ['Superuser', 'HR'].includes(user.role);
    if (!canDelete) return res.status(403).json({ error: 'Cannot delete competency at this stage' });

    await db.delete(employeeAppraisalCompetencies)
      .where(and(eq(employeeAppraisalCompetencies.id, compId), eq(employeeAppraisalCompetencies.appraisalId, appraisalId)));

    await logAudit('competency', compId, 'competency_deleted', user.id, getUserDisplayName(user), false, { appraisalId });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete competency' });
  }
});

// ==========================================
// PHASE 3: COMMENTS CRUD
// ==========================================

router.get('/:id/comments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });

    const isAuthorized = ['Superuser', 'HR', 'Admin'].includes(user.role)
      || appraisal.employeeId === user.id || appraisal.l1ReviewerId === user.id
      || appraisal.l2ReviewerId === user.id || appraisal.l3ApproverId === user.id;
    if (!isAuthorized) return res.status(403).json({ error: 'Not authorized' });

    const comments = await db.select().from(appraisalComments)
      .where(eq(appraisalComments.appraisalId, appraisalId))
      .orderBy(appraisalComments.createdAt);
    res.json(comments);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

router.post('/:id/comments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });
    if (appraisal.isLocked) return res.status(400).json({ error: 'Appraisal is locked' });

    const isAuthorized = ['Superuser', 'HR', 'Admin'].includes(user.role)
      || appraisal.employeeId === user.id || appraisal.l1ReviewerId === user.id
      || appraisal.l2ReviewerId === user.id || appraisal.l3ApproverId === user.id;
    if (!isAuthorized) return res.status(403).json({ error: 'Not authorized' });

    let commentByRole = 'employee';
    if (appraisal.l1ReviewerId === user.id) commentByRole = 'l1_reviewer';
    else if (appraisal.l2ReviewerId === user.id) commentByRole = 'l2_reviewer';
    else if (appraisal.l3ApproverId === user.id) commentByRole = 'l3_approver';
    else if (['Superuser', 'HR', 'Admin'].includes(user.role)) commentByRole = user.role.toLowerCase();

    const { section, comment } = req.body;
    if (!section || !comment) return res.status(400).json({ error: 'Section and comment are required' });

    const [newComment] = await db.insert(appraisalComments).values({
      appraisalId, section, commentBy: user.id,
      commentByName: getUserDisplayName(user), commentByRole, comment,
    }).returning();

    res.status(201).json(newComment);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create comment' });
  }
});

// ==========================================
// PHASE 3: SELF-ASSESSMENT NARRATIVE
// ==========================================

router.put('/:id/self-assessment', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });
    if (appraisal.isLocked) return res.status(400).json({ error: 'Appraisal is locked' });

    if (appraisal.employeeId !== user.id) {
      return res.status(403).json({ error: 'Only the employee can edit self-assessment' });
    }
    if (!['open', 'draft'].includes(appraisal.status)) {
      return res.status(400).json({ error: 'Self-assessment can only be edited when status is Open or Draft' });
    }

    const { selfAssessmentNarrative } = req.body;
    const [updated] = await db.update(employeeAppraisals)
      .set({ selfAssessmentNarrative, updatedAt: new Date() })
      .where(eq(employeeAppraisals.id, appraisalId))
      .returning();

    await logAudit('appraisal', appraisalId, 'self_assessment_updated', user.id, getUserDisplayName(user), false, { length: selfAssessmentNarrative?.length });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to update self-assessment' });
  }
});

// ==========================================
// PHASE 3: SCORE CALCULATION
// ==========================================

router.get('/:id/score', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });

    const isAuthorized = ['Superuser', 'HR', 'Admin'].includes(user.role)
      || appraisal.employeeId === user.id || appraisal.l1ReviewerId === user.id
      || appraisal.l2ReviewerId === user.id || appraisal.l3ApproverId === user.id;
    if (!isAuthorized) return res.status(403).json({ error: 'Not authorized' });

    const kpis = await db.select().from(employeeAppraisalKpis)
      .where(eq(employeeAppraisalKpis.appraisalId, appraisalId));
    const competencies = await db.select().from(employeeAppraisalCompetencies)
      .where(eq(employeeAppraisalCompetencies.appraisalId, appraisalId));

    let kpiWeightedScore = 0;
    let totalWeight = 0;
    for (const kpi of kpis) {
      const score = kpi.managerScore ? parseFloat(kpi.managerScore) : (kpi.selfScore ? parseFloat(kpi.selfScore) : 0);
      const weight = parseFloat(kpi.weightage) || 0;
      kpiWeightedScore += score * weight;
      totalWeight += weight;
    }
    kpiWeightedScore = totalWeight > 0 ? kpiWeightedScore / totalWeight : 0;

    let competencyAvgScore = 0;
    let compCount = 0;
    for (const comp of competencies) {
      const score = comp.managerScore ? parseFloat(comp.managerScore) : (comp.selfScore ? parseFloat(comp.selfScore) : 0);
      if (score > 0) {
        competencyAvgScore += score;
        compCount++;
      }
    }
    competencyAvgScore = compCount > 0 ? competencyAvgScore / compCount : 0;

    const overallCalculatedScore = (kpiWeightedScore * 0.70) + (competencyAvgScore * 0.30);

    const l2Override = appraisal.l2Score ? parseFloat(appraisal.l2Score) : null;
    const effectiveScore = l2Override !== null ? l2Override : overallCalculatedScore;
    const ratingBand = getRatingBand(effectiveScore);

    const kpiSelfWeightedScore = kpis.reduce((sum, kpi) => {
      const score = kpi.selfScore ? parseFloat(kpi.selfScore) : 0;
      const weight = parseFloat(kpi.weightage) || 0;
      return sum + (score * weight);
    }, 0) / (totalWeight || 1);

    const compSelfAvg = competencies.reduce((sum, c) => sum + (c.selfScore ? parseFloat(c.selfScore) : 0), 0)
      / (competencies.filter(c => c.selfScore).length || 1);

    res.json({
      kpiWeightedScore: Math.round(kpiWeightedScore * 100) / 100,
      competencyAvgScore: Math.round(competencyAvgScore * 100) / 100,
      overallCalculatedScore: Math.round(overallCalculatedScore * 100) / 100,
      l2OverrideScore: l2Override,
      l2OverrideReason: appraisal.l2OverrideReason,
      effectiveScore: Math.round(effectiveScore * 100) / 100,
      ratingBand,
      selfAssessment: {
        kpiSelfWeightedScore: Math.round(kpiSelfWeightedScore * 100) / 100,
        competencySelfAvgScore: Math.round(compSelfAvg * 100) / 100,
        overallSelfScore: Math.round((kpiSelfWeightedScore * 0.70 + compSelfAvg * 0.30) * 100) / 100,
      },
      totalKpis: kpis.length,
      totalCompetencies: competencies.length,
      totalKpiWeight: totalWeight,
      weightageValid: Math.abs(totalWeight - 100) < 0.01,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to calculate score' });
  }
});

// ==========================================
// PHASE 3: APPROVAL HISTORY
// ==========================================

router.get('/:id/approvals', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });

    const isAuthorized = ['Superuser', 'HR', 'Admin'].includes(user.role)
      || appraisal.employeeId === user.id || appraisal.l1ReviewerId === user.id
      || appraisal.l2ReviewerId === user.id || appraisal.l3ApproverId === user.id;
    if (!isAuthorized) return res.status(403).json({ error: 'Not authorized' });

    const approvals = await db.select().from(appraisalApprovals)
      .where(eq(appraisalApprovals.appraisalId, appraisalId))
      .orderBy(appraisalApprovals.createdAt);
    res.json(approvals);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch approval history' });
  }
});

// ==========================================
// PHASE 3: AUDIT LOG
// ==========================================

router.get('/:id/audit', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) {
      return res.status(403).json({ error: 'Only HR/Superuser can view audit logs' });
    }
    const appraisalId = parseInt(req.params.id);
    const logs = await db.select().from(appraisalAuditLog)
      .where(and(eq(appraisalAuditLog.entityType, 'appraisal'), eq(appraisalAuditLog.entityId, appraisalId)))
      .orderBy(desc(appraisalAuditLog.createdAt));
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// ==========================================
// PHASE 4: STATUS TRANSITIONS — WORKFLOW
// ==========================================

async function recalcAndSaveScore(appraisalId: number) {
  const kpis = await db.select().from(employeeAppraisalKpis)
    .where(eq(employeeAppraisalKpis.appraisalId, appraisalId));
  const competencies = await db.select().from(employeeAppraisalCompetencies)
    .where(eq(employeeAppraisalCompetencies.appraisalId, appraisalId));

  let kpiWeightedScore = 0;
  let totalWeight = 0;
  for (const kpi of kpis) {
    const score = kpi.managerScore ? parseFloat(kpi.managerScore) : (kpi.selfScore ? parseFloat(kpi.selfScore) : 0);
    const weight = parseFloat(kpi.weightage) || 0;
    kpiWeightedScore += score * weight;
    totalWeight += weight;
  }
  kpiWeightedScore = totalWeight > 0 ? kpiWeightedScore / totalWeight : 0;

  let competencyAvgScore = 0;
  let compCount = 0;
  for (const comp of competencies) {
    const score = comp.managerScore ? parseFloat(comp.managerScore) : (comp.selfScore ? parseFloat(comp.selfScore) : 0);
    if (score > 0) { competencyAvgScore += score; compCount++; }
  }
  competencyAvgScore = compCount > 0 ? competencyAvgScore / compCount : 0;

  const overallCalculatedScore = (kpiWeightedScore * 0.70) + (competencyAvgScore * 0.30);

  await db.update(employeeAppraisals).set({
    kpiWeightedScore: (Math.round(kpiWeightedScore * 100) / 100).toString(),
    competencyAvgScore: (Math.round(competencyAvgScore * 100) / 100).toString(),
    overallCalculatedScore: (Math.round(overallCalculatedScore * 100) / 100).toString(),
    updatedAt: new Date(),
  }).where(eq(employeeAppraisals.id, appraisalId));

  return { kpiWeightedScore, competencyAvgScore, overallCalculatedScore };
}

router.post('/:id/self-submit', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });

    if (appraisal.employeeId !== user.id) return res.status(403).json({ error: 'Only the employee can self-submit' });
    if (appraisal.status !== 'open') return res.status(400).json({ error: 'Appraisal must be in Open status to self-submit' });

    const kpis = await db.select().from(employeeAppraisalKpis).where(eq(employeeAppraisalKpis.appraisalId, appraisalId));
    if (kpis.length === 0) return res.status(400).json({ error: 'At least one KPI is required' });

    const totalWeight = kpis.reduce((sum, k) => sum + (parseFloat(k.weightage) || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.01) return res.status(400).json({ error: `KPI weightages must sum to 100 (current: ${totalWeight})` });

    if (!appraisal.selfAssessmentNarrative || appraisal.selfAssessmentNarrative.trim().length === 0) {
      return res.status(400).json({ error: 'Self-assessment narrative is required' });
    }

    await recalcAndSaveScore(appraisalId);

    const [updated] = await db.update(employeeAppraisals).set({
      status: 'self_submitted', selfSubmittedAt: new Date(), updatedAt: new Date(),
    }).where(eq(employeeAppraisals.id, appraisalId)).returning();

    await db.insert(appraisalApprovals).values({
      appraisalId, previousStatus: 'open', newStatus: 'self_submitted',
      performedBy: user.id, performedByName: getUserDisplayName(user), remarks: req.body.remarks || 'Self-assessment submitted',
    });
    await logAudit('appraisal', appraisalId, 'self_submitted', user.id, getUserDisplayName(user), false, { kpiCount: kpis.length });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to self-submit' });
  }
});

router.post('/:id/l1-review', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });

    if (appraisal.l1ReviewerId !== user.id) return res.status(403).json({ error: 'Only L1 Reviewer can perform L1 review' });
    if (appraisal.status !== 'self_submitted') return res.status(400).json({ error: 'Appraisal must be in Self Submitted status for L1 review' });

    const kpis = await db.select().from(employeeAppraisalKpis).where(eq(employeeAppraisalKpis.appraisalId, appraisalId));
    const missingManagerScore = kpis.filter(k => !k.managerScore);
    if (missingManagerScore.length > 0) return res.status(400).json({ error: `All KPIs must have manager score (${missingManagerScore.length} missing)` });

    const competencies = await db.select().from(employeeAppraisalCompetencies).where(eq(employeeAppraisalCompetencies.appraisalId, appraisalId));
    const missingCompScore = competencies.filter(c => !c.managerScore);
    if (missingCompScore.length > 0) return res.status(400).json({ error: `All competencies must have manager score (${missingCompScore.length} missing)` });

    const { l1Comments, l1IncrementRecommendation, l1PromotionRecommendation, l1TrainingRecommendation } = req.body;
    if (!l1Comments || l1Comments.trim().length === 0) return res.status(400).json({ error: 'L1 comments are required' });

    const scores = await recalcAndSaveScore(appraisalId);

    const [updated] = await db.update(employeeAppraisals).set({
      status: 'l1_reviewed', l1ReviewedAt: new Date(),
      l1Score: (Math.round(scores.overallCalculatedScore * 100) / 100).toString(),
      l1Comments, l1IncrementRecommendation, l1PromotionRecommendation, l1TrainingRecommendation,
      updatedAt: new Date(),
    }).where(eq(employeeAppraisals.id, appraisalId)).returning();

    await db.insert(appraisalApprovals).values({
      appraisalId, previousStatus: 'self_submitted', newStatus: 'l1_reviewed',
      performedBy: user.id, performedByName: getUserDisplayName(user), remarks: req.body.remarks || 'L1 review completed',
    });
    await logAudit('appraisal', appraisalId, 'l1_reviewed', user.id, getUserDisplayName(user), false, { l1Score: scores.overallCalculatedScore });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to complete L1 review' });
  }
});

router.post('/:id/l2-review', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });

    if (appraisal.l2ReviewerId !== user.id) return res.status(403).json({ error: 'Only L2 Reviewer can perform L2 review' });
    if (appraisal.status !== 'l1_reviewed') return res.status(400).json({ error: 'Appraisal must be in L1 Reviewed status for L2 review' });

    const { l2Comments, l2Score, l2OverrideReason, l2IncrementRecommendation, l2PromotionRecommendation, l2TrainingRecommendation } = req.body;
    if (!l2Comments || l2Comments.trim().length === 0) return res.status(400).json({ error: 'L2 comments are required' });

    if (l2Score !== undefined && l2Score !== null) {
      if (!l2OverrideReason || l2OverrideReason.trim().length === 0) {
        return res.status(400).json({ error: 'Override reason is required when providing L2 score' });
      }
    }

    const updateSet: any = {
      status: 'l2_reviewed', l2ReviewedAt: new Date(), l2Comments,
      l2IncrementRecommendation, l2PromotionRecommendation, l2TrainingRecommendation,
      updatedAt: new Date(),
    };
    if (l2Score !== undefined && l2Score !== null) {
      updateSet.l2Score = l2Score.toString();
      updateSet.l2OverrideReason = l2OverrideReason;
    }

    const [updated] = await db.update(employeeAppraisals).set(updateSet)
      .where(eq(employeeAppraisals.id, appraisalId)).returning();

    await db.insert(appraisalApprovals).values({
      appraisalId, previousStatus: 'l1_reviewed', newStatus: 'l2_reviewed',
      performedBy: user.id, performedByName: getUserDisplayName(user), remarks: req.body.remarks || 'L2 review completed',
    });
    await logAudit('appraisal', appraisalId, 'l2_reviewed', user.id, getUserDisplayName(user), false, { l2Score: l2Score || 'no override', l2OverrideReason });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to complete L2 review' });
  }
});

router.post('/:id/l3-approve', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });

    if (appraisal.l3ApproverId !== user.id) return res.status(403).json({ error: 'Only L3 Approver can give final approval' });
    if (appraisal.status !== 'l2_reviewed') return res.status(400).json({ error: 'Appraisal must be in L2 Reviewed status for final approval' });

    const effectiveScore = appraisal.l2Score ? parseFloat(appraisal.l2Score) : (appraisal.overallCalculatedScore ? parseFloat(appraisal.overallCalculatedScore) : 0);
    const finalRating = getRatingBand(effectiveScore);

    const finalRecommendations = {
      increment: appraisal.l2IncrementRecommendation || appraisal.l1IncrementRecommendation,
      promotion: appraisal.l2PromotionRecommendation || appraisal.l1PromotionRecommendation,
      training: appraisal.l2TrainingRecommendation || appraisal.l1TrainingRecommendation,
    };

    const [updated] = await db.update(employeeAppraisals).set({
      status: 'approved', l3ApprovedAt: new Date(), l3Comments: req.body.l3Comments || null,
      finalScore: (Math.round(effectiveScore * 100) / 100).toString(),
      finalRating, finalRecommendations,
      isLocked: true, updatedAt: new Date(),
    }).where(eq(employeeAppraisals.id, appraisalId)).returning();

    await db.insert(appraisalApprovals).values({
      appraisalId, previousStatus: 'l2_reviewed', newStatus: 'approved',
      performedBy: user.id, performedByName: getUserDisplayName(user), remarks: req.body.remarks || 'Final approval granted',
    });
    await logAudit('appraisal', appraisalId, 'l3_approved', user.id, getUserDisplayName(user), false, { finalScore: effectiveScore, finalRating });

    await db.update(appraisalCycles).set({
      completedAppraisals: sql`completed_appraisals + 1`, updatedAt: new Date(),
    }).where(eq(appraisalCycles.id, appraisal.cycleId));

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to approve' });
  }
});

router.post('/:id/reopen', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) {
      return res.status(403).json({ error: 'Only HR/Superuser can reopen appraisals' });
    }

    const appraisalId = parseInt(req.params.id);
    const [appraisal] = await db.select().from(employeeAppraisals).where(eq(employeeAppraisals.id, appraisalId));
    if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });

    if (!['approved', 'closed'].includes(appraisal.status)) {
      return res.status(400).json({ error: 'Only Approved or Closed appraisals can be reopened' });
    }

    const { reopenReason, reopenTargetStage } = req.body;
    if (!reopenReason) return res.status(400).json({ error: 'Reopen reason is required' });

    const validTargets = ['open', 'self_submitted', 'l1_reviewed'];
    const targetStage = reopenTargetStage || 'open';
    if (!validTargets.includes(targetStage)) {
      return res.status(400).json({ error: `Invalid target stage. Must be one of: ${validTargets.join(', ')}` });
    }

    const previousStatus = appraisal.status;
    const [updated] = await db.update(employeeAppraisals).set({
      status: targetStage, isLocked: false,
      reopenedAt: new Date(), reopenedBy: user.id,
      reopenReason, reopenTargetStage: targetStage, updatedAt: new Date(),
    }).where(eq(employeeAppraisals.id, appraisalId)).returning();

    if (previousStatus === 'approved') {
      await db.update(appraisalCycles).set({
        completedAppraisals: sql`GREATEST(completed_appraisals - 1, 0)`, updatedAt: new Date(),
      }).where(eq(appraisalCycles.id, appraisal.cycleId));
    }

    await db.insert(appraisalApprovals).values({
      appraisalId, previousStatus, newStatus: targetStage,
      performedBy: user.id, performedByName: getUserDisplayName(user), remarks: `Reopened: ${reopenReason}`,
    });
    await logAudit('appraisal', appraisalId, 'reopened', user.id, getUserDisplayName(user), false, { previousStatus, targetStage, reopenReason });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to reopen' });
  }
});

// ==========================================
// PHASE 5: HELPER — Resolve L1/L2/L3 Hierarchy
// ==========================================

async function resolveHierarchy(employee: any): Promise<{ l1: any; l2Id: number; l2Name: string; l3Id: number; l3Name: string; skipReason?: string }> {
  if (!employee.reportingManagerId) return { l1: null, l2Id: 0, l2Name: '', l3Id: 0, l3Name: '', skipReason: 'no_manager' };
  const [l1] = await db.select().from(users).where(eq(users.id, employee.reportingManagerId));
  if (!l1) return { l1: null, l2Id: 0, l2Name: '', l3Id: 0, l3Name: '', skipReason: 'l1_not_found' };

  let l2Id: number = 0, l2Name = '';
  if (l1.reportingManagerId) {
    const [l2User] = await db.select().from(users).where(eq(users.id, l1.reportingManagerId));
    if (l2User) { l2Id = l2User.id; l2Name = getUserDisplayName(l2User); }
    else return { l1, l2Id: 0, l2Name: '', l3Id: 0, l3Name: '', skipReason: 'l2_not_found' };
  } else {
    return { l1, l2Id: 0, l2Name: '', l3Id: 0, l3Name: '', skipReason: 'l1_no_manager_for_l2' };
  }

  let l3Id: number = 0, l3Name = '';
  const [l2User] = await db.select().from(users).where(eq(users.id, l2Id));
  if (l2User && l2User.reportingManagerId) {
    const [l3User] = await db.select().from(users).where(eq(users.id, l2User.reportingManagerId));
    if (l3User) { l3Id = l3User.id; l3Name = getUserDisplayName(l3User); }
    else {
      const [fallback] = await db.select().from(users).where(eq(users.role, 'Superuser'));
      if (fallback) { l3Id = fallback.id; l3Name = getUserDisplayName(fallback); }
      else return { l1, l2Id, l2Name, l3Id: 0, l3Name: '', skipReason: 'no_l3_or_superuser' };
    }
  } else {
    const [fallback] = await db.select().from(users).where(eq(users.role, 'Superuser'));
    if (fallback) { l3Id = fallback.id; l3Name = getUserDisplayName(fallback); }
    else return { l1, l2Id, l2Name, l3Id: 0, l3Name: '', skipReason: 'no_l3_or_superuser' };
  }

  return { l1, l2Id, l2Name, l3Id, l3Name };
}

// ==========================================
// PHASE 5: CYCLE GENERATOR JOB (5 AM daily)
// ==========================================

function computeFinancialYear(triggerMonth: number, triggerDay: number, referenceDate: Date): string {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;
  if (triggerMonth >= 4) {
    return `${year}-${(year + 1).toString().slice(2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(2)}`;
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function runCycleGeneratorJob(dryRun: boolean = false): Promise<{ created: any[]; skipped: any[]; errors: any[] }> {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  const created: any[] = [];
  const skipped: any[] = [];
  const errors: any[] = [];

  const templates = await db.select().from(appraisalCycleTemplates)
    .where(and(eq(appraisalCycleTemplates.isActive, true), eq(appraisalCycleTemplates.autoCreate, true)));

  for (const tmpl of templates) {
    if (tmpl.triggerMonth !== currentMonth || tmpl.triggerDay !== currentDay) {
      skipped.push({ templateId: tmpl.id, name: tmpl.name, reason: 'not_trigger_date', triggerDate: `${tmpl.triggerMonth}/${tmpl.triggerDay}`, today: `${currentMonth}/${currentDay}` });
      continue;
    }

    const fy = computeFinancialYear(tmpl.triggerMonth, tmpl.triggerDay, today);
    const cycleName = tmpl.cycleType === 'annual'
      ? `Annual Appraisal FY ${fy}`
      : `Mid-Year Review FY ${fy}`;

    const existingCycles = await db.select().from(appraisalCycles)
      .where(and(eq(appraisalCycles.templateId, tmpl.id), eq(appraisalCycles.financialYear, fy)));
    if (existingCycles.length > 0) {
      skipped.push({ templateId: tmpl.id, name: tmpl.name, reason: 'cycle_already_exists', financialYear: fy, existingCycleId: existingCycles[0].id });
      continue;
    }

    const startDate = `${today.getFullYear()}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
    const selfDeadline = addDays(startDate, tmpl.selfDeadlineDays);
    const managerDeadline = addDays(startDate, tmpl.managerDeadlineDays);
    const l2Deadline = addDays(startDate, tmpl.l2DeadlineDays);
    const approvalDeadline = addDays(startDate, tmpl.approvalDeadlineDays);
    const closureDate = addDays(startDate, tmpl.approvalDeadlineDays + tmpl.closureBufferDays);

    const cycleData = {
      templateId: tmpl.id, name: cycleName, cycleType: tmpl.cycleType,
      financialYear: fy, status: 'draft' as const,
      startDate, selfAssessmentDeadline: selfDeadline, managerReviewDeadline: managerDeadline,
      l2ReviewDeadline: l2Deadline, approvalDeadline, closureDate,
      isAutoGenerated: true, createdBy: null as any,
    };

    if (dryRun) {
      created.push({ action: 'would_create_cycle', template: tmpl.name, ...cycleData });
      continue;
    }

    try {
      const [cycle] = await db.insert(appraisalCycles).values(cycleData).returning();
      await logAudit('cycle', cycle.id, 'cycle_auto_generated', null, 'System', true, { templateId: tmpl.id, financialYear: fy });
      created.push({ cycleId: cycle.id, name: cycleName, financialYear: fy, templateId: tmpl.id });
    } catch (err: any) {
      errors.push({ templateId: tmpl.id, name: tmpl.name, error: err.message });
    }
  }

  return { created, skipped, errors };
}

// ==========================================
// PHASE 5: ACTIVATION JOB (5:30 AM daily)
// ==========================================

async function runActivationJob(dryRun: boolean = false): Promise<{ activatedCycles: any[]; createdAppraisals: any[]; skippedEmployees: any[]; errors: any[] }> {
  const activatedCycles: any[] = [];
  const createdAppraisals: any[] = [];
  const skippedEmployees: any[] = [];
  const errors: any[] = [];

  const today = new Date().toISOString().split('T')[0];
  const draftCycles = await db.select().from(appraisalCycles).where(eq(appraisalCycles.status, 'draft'));
  const cyclesToActivate = draftCycles.filter(c => c.startDate <= today);

  for (const cycle of cyclesToActivate) {
    let templateMinServiceDays = 90;
    if (cycle.templateId) {
      const [tmpl] = await db.select().from(appraisalCycleTemplates).where(eq(appraisalCycleTemplates.id, cycle.templateId));
      if (tmpl) templateMinServiceDays = tmpl.minServiceDays;
    }

    const allActiveUsers = await db.select().from(users).where(eq(users.isActive, true));
    const existingAppraisals = await db.select({ employeeId: employeeAppraisals.employeeId })
      .from(employeeAppraisals).where(eq(employeeAppraisals.cycleId, cycle.id));
    const existingEmployeeIds = new Set(existingAppraisals.map(a => a.employeeId));

    let appraisalCount = 0;
    for (const emp of allActiveUsers) {
      const empName = getUserDisplayName(emp);

      if (existingEmployeeIds.has(emp.id)) {
        skippedEmployees.push({ cycleId: cycle.id, employeeId: emp.id, name: empName, reason: 'already_exists' });
        continue;
      }

      if (emp.dateOfJoining) {
        const joinDate = new Date(emp.dateOfJoining);
        const cycleStartDate = new Date(cycle.startDate);
        const daysSinceJoining = Math.floor((cycleStartDate.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceJoining < templateMinServiceDays) {
          skippedEmployees.push({ cycleId: cycle.id, employeeId: emp.id, name: empName, reason: 'insufficient_service', daysSinceJoining, minRequired: templateMinServiceDays });
          continue;
        }
      }

      const hierarchy = await resolveHierarchy(emp);
      if (hierarchy.skipReason) {
        skippedEmployees.push({ cycleId: cycle.id, employeeId: emp.id, name: empName, reason: hierarchy.skipReason });
        continue;
      }

      if (dryRun) {
        createdAppraisals.push({ action: 'would_create', cycleId: cycle.id, employeeId: emp.id, name: empName, l1: getUserDisplayName(hierarchy.l1), l2: hierarchy.l2Name, l3: hierarchy.l3Name });
        appraisalCount++;
        continue;
      }

      try {
        const [appraisal] = await db.insert(employeeAppraisals).values({
          cycleId: cycle.id,
          employeeId: emp.id,
          employeeName: empName,
          employeeCode: emp.employeeCode || undefined,
          department: emp.department || undefined,
          designation: emp.jobTitle || undefined,
          dateOfJoining: emp.dateOfJoining || undefined,
          l1ReviewerId: hierarchy.l1.id,
          l1ReviewerName: getUserDisplayName(hierarchy.l1),
          l2ReviewerId: hierarchy.l2Id,
          l2ReviewerName: hierarchy.l2Name,
          l3ApproverId: hierarchy.l3Id,
          l3ApproverName: hierarchy.l3Name,
          status: 'open',
        }).returning();
        createdAppraisals.push({ appraisalId: appraisal.id, employeeId: emp.id, name: empName });
        appraisalCount++;
        await logAudit('appraisal', appraisal.id, 'appraisal_auto_created', null, 'System', true, { cycleId: cycle.id, employeeId: emp.id });
      } catch (err: any) {
        errors.push({ cycleId: cycle.id, employeeId: emp.id, name: empName, error: err.message });
      }
    }

    if (!dryRun) {
      await db.update(appraisalCycles).set({
        status: 'active', totalAppraisals: appraisalCount + existingAppraisals.length, updatedAt: new Date(),
      }).where(eq(appraisalCycles.id, cycle.id));
      await logAudit('cycle', cycle.id, 'cycle_auto_activated', null, 'System', true, { totalAppraisals: appraisalCount + existingAppraisals.length });
    }

    activatedCycles.push({ cycleId: cycle.id, name: cycle.name, appraisalsCreated: appraisalCount, dryRun });
  }

  return { activatedCycles, createdAppraisals, skippedEmployees, errors };
}

// ==========================================
// PHASE 5: CRON SCHEDULING
// ==========================================

function scheduleDailyJob(hour: number, minute: number, jobName: string, jobFn: () => Promise<any>) {
  const runCheck = () => {
    const now = new Date();
    if (now.getHours() === hour && now.getMinutes() === minute) {
      console.log(`[AppraisalJobs] Running ${jobName} at ${now.toISOString()}`);
      jobFn().then(result => {
        console.log(`[AppraisalJobs] ${jobName} completed:`, JSON.stringify(result, null, 2));
      }).catch(err => {
        console.error(`[AppraisalJobs] ${jobName} failed:`, err);
      });
    }
  };
  setInterval(runCheck, 60 * 1000);
  console.log(`[AppraisalJobs] Scheduled ${jobName} at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} daily`);
}

scheduleDailyJob(5, 0, 'CycleGeneratorJob', () => runCycleGeneratorJob(false));
scheduleDailyJob(5, 30, 'ActivationJob', () => runActivationJob(false));

// ==========================================
// PHASE 5: DRY-RUN & MANUAL TRIGGER API
// ==========================================

router.post('/jobs/cycle-generator/dry-run', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) return res.status(403).json({ error: 'Only HR/Superuser' });
    const result = await runCycleGeneratorJob(true);
    res.json({ dryRun: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Dry run failed' });
  }
});

router.post('/jobs/cycle-generator/run', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) return res.status(403).json({ error: 'Only HR/Superuser' });
    const result = await runCycleGeneratorJob(false);
    await logAudit('system', 0, 'manual_cycle_generator_run', user.id, getUserDisplayName(user), false, result);
    res.json({ dryRun: false, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Manual run failed' });
  }
});

router.post('/jobs/activation/dry-run', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) return res.status(403).json({ error: 'Only HR/Superuser' });
    const result = await runActivationJob(true);
    res.json({ dryRun: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Dry run failed' });
  }
});

router.post('/jobs/activation/run', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) return res.status(403).json({ error: 'Only HR/Superuser' });
    const result = await runActivationJob(false);
    await logAudit('system', 0, 'manual_activation_run', user.id, getUserDisplayName(user), false, result);
    res.json({ dryRun: false, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Manual run failed' });
  }
});

router.post('/cycles/:cycleId/activate', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) return res.status(403).json({ error: 'Only HR/Superuser' });

    const cycleId = parseInt(req.params.cycleId);
    const [cycle] = await db.select().from(appraisalCycles).where(eq(appraisalCycles.id, cycleId));
    if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
    if (cycle.status !== 'draft') return res.status(400).json({ error: 'Only draft cycles can be activated' });

    let templateMinServiceDays = 90;
    if (cycle.templateId) {
      const [tmpl] = await db.select().from(appraisalCycleTemplates).where(eq(appraisalCycleTemplates.id, cycle.templateId));
      if (tmpl) templateMinServiceDays = tmpl.minServiceDays;
    }

    const allActiveUsers = await db.select().from(users).where(eq(users.isActive, true));
    const existingAppraisals = await db.select({ employeeId: employeeAppraisals.employeeId })
      .from(employeeAppraisals).where(eq(employeeAppraisals.cycleId, cycleId));
    const existingEmployeeIds = new Set(existingAppraisals.map(a => a.employeeId));

    let createdCount = 0;
    const created: any[] = [];
    const skipped: any[] = [];
    const errors: any[] = [];

    for (const emp of allActiveUsers) {
      const empName = getUserDisplayName(emp);
      if (existingEmployeeIds.has(emp.id)) { skipped.push({ id: emp.id, name: empName, reason: 'already_exists' }); continue; }

      if (emp.dateOfJoining) {
        const daysSinceJoining = Math.floor((new Date(cycle.startDate).getTime() - new Date(emp.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceJoining < templateMinServiceDays) { skipped.push({ id: emp.id, name: empName, reason: 'insufficient_service' }); continue; }
      }

      const hierarchy = await resolveHierarchy(emp);
      if (hierarchy.skipReason) { skipped.push({ id: emp.id, name: empName, reason: hierarchy.skipReason }); continue; }

      try {
        const [appraisal] = await db.insert(employeeAppraisals).values({
          cycleId, employeeId: emp.id, employeeName: empName,
          employeeCode: emp.employeeCode || undefined, department: emp.department || undefined,
          designation: emp.jobTitle || undefined, dateOfJoining: emp.dateOfJoining || undefined,
          l1ReviewerId: hierarchy.l1.id, l1ReviewerName: getUserDisplayName(hierarchy.l1),
          l2ReviewerId: hierarchy.l2Id, l2ReviewerName: hierarchy.l2Name,
          l3ApproverId: hierarchy.l3Id, l3ApproverName: hierarchy.l3Name,
          status: 'open',
        }).returning();
        created.push({ appraisalId: appraisal.id, employeeId: emp.id, name: empName });
        createdCount++;
        await logAudit('appraisal', appraisal.id, 'appraisal_created_on_activation', user.id, getUserDisplayName(user), false, { cycleId, employeeId: emp.id });
      } catch (err: any) {
        errors.push({ employeeId: emp.id, name: empName, error: err.message });
      }
    }

    await db.update(appraisalCycles).set({
      status: 'active', totalAppraisals: createdCount + existingAppraisals.length, updatedAt: new Date(),
    }).where(eq(appraisalCycles.id, cycleId));
    await logAudit('cycle', cycleId, 'cycle_manually_activated', user.id, getUserDisplayName(user), false, { totalAppraisals: createdCount + existingAppraisals.length });

    res.json({ cycleId, status: 'active', created, skipped, errors, totalAppraisals: createdCount + existingAppraisals.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to activate cycle' });
  }
});

router.post('/cycles/:cycleId/pause', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) return res.status(403).json({ error: 'Only HR/Superuser' });
    const cycleId = parseInt(req.params.cycleId);
    const [cycle] = await db.select().from(appraisalCycles).where(eq(appraisalCycles.id, cycleId));
    if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
    if (cycle.status === 'paused') return res.status(400).json({ error: 'Cycle is already paused' });
    if (!['active', 'draft'].includes(cycle.status)) return res.status(400).json({ error: 'Only active or draft cycles can be paused' });

    const { pauseReason } = req.body;
    if (!pauseReason) return res.status(400).json({ error: 'Pause reason is required' });

    const [updated] = await db.update(appraisalCycles).set({
      previousStatusBeforePause: cycle.status, status: 'paused',
      pausedAt: new Date(), pausedBy: user.id, pauseReason, updatedAt: new Date(),
    }).where(eq(appraisalCycles.id, cycleId)).returning();

    await logAudit('cycle', cycleId, 'cycle_paused', user.id, getUserDisplayName(user), false, { previousStatus: cycle.status, pauseReason });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to pause cycle' });
  }
});

router.post('/cycles/:cycleId/resume', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) return res.status(403).json({ error: 'Only HR/Superuser' });
    const cycleId = parseInt(req.params.cycleId);
    const [cycle] = await db.select().from(appraisalCycles).where(eq(appraisalCycles.id, cycleId));
    if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
    if (cycle.status !== 'paused') return res.status(400).json({ error: 'Only paused cycles can be resumed' });

    const resumeStatus = cycle.previousStatusBeforePause || 'active';
    const [updated] = await db.update(appraisalCycles).set({
      status: resumeStatus, pausedAt: null, pausedBy: null, pauseReason: null,
      previousStatusBeforePause: null, updatedAt: new Date(),
    }).where(eq(appraisalCycles.id, cycleId)).returning();

    await logAudit('cycle', cycleId, 'cycle_resumed', user.id, getUserDisplayName(user), false, { resumedTo: resumeStatus });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to resume cycle' });
  }
});

router.get('/jobs/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!['Superuser', 'HR'].includes(user.role)) return res.status(403).json({ error: 'Only HR/Superuser' });

    const recentAuditLogs = await db.select().from(appraisalAuditLog)
      .where(or(
        eq(appraisalAuditLog.action, 'cycle_auto_generated'),
        eq(appraisalAuditLog.action, 'cycle_auto_activated'),
        eq(appraisalAuditLog.action, 'manual_cycle_generator_run'),
        eq(appraisalAuditLog.action, 'manual_activation_run'),
      ))
      .orderBy(desc(appraisalAuditLog.createdAt))
      .limit(20);

    const templates = await db.select().from(appraisalCycleTemplates)
      .where(and(eq(appraisalCycleTemplates.isActive, true), eq(appraisalCycleTemplates.autoCreate, true)));

    const activeCycles = await db.select().from(appraisalCycles).where(eq(appraisalCycles.status, 'active'));
    const draftCycles = await db.select().from(appraisalCycles).where(eq(appraisalCycles.status, 'draft'));

    res.json({
      scheduledJobs: [
        { name: 'CycleGeneratorJob', schedule: '05:00 AM daily', description: 'Creates cycles from templates on trigger dates' },
        { name: 'ActivationJob', schedule: '05:30 AM daily', description: 'Activates draft cycles whose start date has arrived, creates appraisals' },
      ],
      activeTemplates: templates.length,
      activeCycles: activeCycles.length,
      draftCycles: draftCycles.length,
      recentJobRuns: recentAuditLogs,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

export default router;
