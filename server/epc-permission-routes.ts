import { Express, Request, Response } from 'express';
import { requireReauth } from './middleware/require-reauth';
import { roleHierarchy } from '@shared/roles';
import { db } from './db';
import { sql, eq, and, desc, inArray } from 'drizzle-orm';
import { permissionChangeRequests, permissionSnapshots, permissionAuditLog, departmentPagePermissions, pagePermissions, users } from '@shared/schema';
import {
  EPC_PAGES,
  EPC_ACTIONS,
  EPC_DATA_RULES,
  EPC_GAPS,
  ROLE_LABELS,
  ROLE_LEVELS,
  type PagePermission as RegistryPagePermission,
  type ActionPermission,
  type DataRule,
  type GapFinding,
} from '@shared/epc-permission-registry';
import crypto from 'crypto';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ message: 'Not authenticated' });
}

function requireDashboardAccess(req: Request, res: Response): boolean {
  const userRole = (req.user as any)?.role;
  if (!['Superuser', 'General Manager'].includes(userRole)) {
    res.status(403).json({ message: 'Only General Manager and Superuser can access the permission dashboard.' });
    return false;
  }
  return true;
}

function getRequestMeta(req: Request) {
  const user = req.user as any;
  return {
    userId: user?.id,
    username: user?.username || 'unknown',
    role: user?.role || 'unknown',
    ipAddress: req.ip || req.socket?.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
  };
}

async function writeAuditLog(req: Request, action: string, details: any, opts?: { changeRequestId?: number; snapshotId?: number; batchId?: string; tx?: any }) {
  const meta = getRequestMeta(req);
  const target = opts?.tx || db;
  await target.insert(permissionAuditLog).values({
    action,
    changeRequestId: opts?.changeRequestId || null,
    snapshotId: opts?.snapshotId || null,
    batchId: opts?.batchId || null,
    userId: meta.userId,
    username: meta.username,
    role: meta.role,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    details,
  });
}

async function writeAuditLogBestEffort(req: Request, action: string, details: any, opts?: { changeRequestId?: number; snapshotId?: number; batchId?: string }) {
  try {
    await writeAuditLog(req, action, details, opts);
  } catch (e) {
    console.error('[PermAudit] write error:', e);
  }
}

async function captureSnapshot(req: Request, snapshotType: string, description: string, tx?: any): Promise<number> {
  const meta = getRequestMeta(req);
  const target = tx || db;
  const deptRows = await target.select().from(departmentPagePermissions);
  const userRows = await target.select().from(pagePermissions);
  const snapshotData: any = { departmentMatrix: deptRows, userOverrides: userRows };

  const [snap] = await target.insert(permissionSnapshots).values({
    snapshotType: snapshotType as any,
    snapshotData,
    createdBy: meta.userId,
    description,
  }).returning();

  await writeAuditLog(req, 'snapshot', { snapshotType, description, recordCount: deptRows.length + userRows.length }, { snapshotId: snap.id, tx });
  return snap.id;
}

export function registerEpcPermissionRoutes(app: Express) {

  app.get('/api/epc-permissions/matrix', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!requireDashboardAccess(req, res)) return;

      const simulateRole = req.query.role as string | undefined;
      const simulateLevel = simulateRole && roleHierarchy[simulateRole] !== undefined
        ? roleHierarchy[simulateRole]
        : null;

      const pages = EPC_PAGES.map((p: RegistryPagePermission) => ({
        ...p,
        visibilityByRole: Object.fromEntries(
          ROLE_LEVELS.map(level => [level, level <= p.minViewRole])
        ),
        simulatedVisible: simulateLevel !== null ? simulateLevel <= p.minViewRole : null,
      }));

      const actions = EPC_ACTIONS.map((a: ActionPermission) => ({
        ...a,
        allowedByRole: Object.fromEntries(
          ROLE_LEVELS.map(level => [level, level <= a.minRoleLevel])
        ),
        simulatedAllowed: simulateLevel !== null ? simulateLevel <= a.minRoleLevel : null,
      }));

      const dataRules = EPC_DATA_RULES.map((d: DataRule) => ({
        ...d,
        visibleByRole: Object.fromEntries(
          ROLE_LEVELS.map(level => [level, level <= d.minViewRole])
        ),
        simulatedVisible: simulateLevel !== null ? simulateLevel <= d.minViewRole : null,
      }));

      const gaps: GapFinding[] = EPC_GAPS;

      res.json({
        pages, actions, dataRules, gaps,
        roleLabels: ROLE_LABELS,
        roleLevels: ROLE_LEVELS,
        simulatedRole: simulateRole || null,
        registryTimestamp: "2026-04-01",
        registryNote: "Phase 2 — Editable permissions with approval workflow & audit trail.",
      });
    } catch (error: any) {
      console.error('[EPC Permissions] matrix error:', error);
      res.status(500).json({ message: 'Failed to load permission matrix' });
    }
  });

  app.get('/api/epc-permissions/summary', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!requireDashboardAccess(req, res)) return;

      const totalPages = EPC_PAGES.length;
      const totalActions = EPC_ACTIONS.length;
      const totalDataRules = EPC_DATA_RULES.length;
      const totalGaps = EPC_GAPS.length;
      const openGaps = EPC_GAPS.filter(g => g.status === 'open');
      const resolvedGaps = EPC_GAPS.filter(g => g.status === 'resolved');
      const gapsBySeverity = {
        high: openGaps.filter(g => g.severity === 'high').length,
        medium: openGaps.filter(g => g.severity === 'medium').length,
        low: openGaps.filter(g => g.severity === 'low').length,
      };
      const gapsByCategory = openGaps.reduce((acc, g) => { acc[g.category] = (acc[g.category] || 0) + 1; return acc; }, {} as Record<string, number>);
      const smOnlyActions = EPC_ACTIONS.filter(a => a.minRoleLevel <= 2 && a.minRoleLevel > 1).length;
      const gmOnlyActions = EPC_ACTIONS.filter(a => a.minRoleLevel <= 1).length;
      const managerActions = EPC_ACTIONS.filter(a => a.minRoleLevel === 3).length;
      const alignedActions = EPC_ACTIONS.filter(a => a.aligned).length;
      const misalignedActions = EPC_ACTIONS.filter(a => !a.aligned).length;
      const selfActionPreventionCount = EPC_ACTIONS.filter(a => a.selfActionPrevention).length;
      const moduleCount = new Set(EPC_ACTIONS.map(a => a.pageId)).size;

      const pendingRequests = await db.select({ count: sql<number>`count(*)` })
        .from(permissionChangeRequests)
        .where(eq(permissionChangeRequests.status, 'pending'));
      const pendingCount = Number(pendingRequests[0]?.count || 0);

      res.json({
        totalPages, totalActions, totalDataRules, totalGaps,
        openGaps: openGaps.length, resolvedGaps: resolvedGaps.length,
        gapsBySeverity, gapsByCategory,
        actionsByMinRole: { gmOnly: gmOnlyActions, smOnly: smOnlyActions, manager: managerActions },
        alignedActions, misalignedActions, selfActionPreventionCount, moduleCount,
        pendingChangeRequests: pendingCount,
        registryTimestamp: "2026-04-01",
      });
    } catch (error: any) {
      console.error('[EPC Permissions] summary error:', error);
      res.status(500).json({ message: 'Failed to load permission summary' });
    }
  });

  app.post('/api/epc-permissions/change-requests', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!requireDashboardAccess(req, res)) return;
      const meta = getRequestMeta(req);
      const { changes, emergencyOverride, emergencyReason } = req.body;

      if (!changes || !Array.isArray(changes) || changes.length === 0) {
        return res.status(400).json({ message: 'At least one change is required.' });
      }

      if (emergencyOverride && meta.role !== 'Superuser') {
        return res.status(403).json({ message: 'Only Superuser can use emergency override.' });
      }

      const batchId = `batch-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const isEmergency = !!emergencyOverride;
      const status = isEmergency ? 'approved' : 'pending';

      for (const change of changes) {
        if (!change.requestType || !change.targetEntity || !change.targetId) {
          return res.status(400).json({ message: 'Each change requires requestType, targetEntity, targetId.' });
        }
      }

      const result = await db.transaction(async (tx) => {
        const insertedIds: number[] = [];
        for (const change of changes) {
          const { requestType, targetEntity, targetId, pageKey, actionId, currentValue, requestedValue } = change;
          const [row] = await tx.insert(permissionChangeRequests).values({
            batchId,
            requestType,
            targetEntity,
            targetId,
            pageKey: pageKey || null,
            actionId: actionId || null,
            currentValue: currentValue || null,
            requestedValue: requestedValue || null,
            requestedBy: meta.userId,
            status,
            emergencyOverride: isEmergency,
            emergencyReason: isEmergency ? (emergencyReason || 'Emergency override') : null,
            approvedBy: isEmergency ? meta.userId : null,
            approvedAt: isEmergency ? new Date() : null,
          }).returning();
          insertedIds.push(row.id);
        }

        const auditAction = isEmergency ? 'emergency_override' : 'create';
        await writeAuditLog(req, auditAction, {
          batchId,
          changeCount: changes.length,
          changeIds: insertedIds,
          isEmergency,
          emergencyReason: isEmergency ? emergencyReason : undefined,
        }, { batchId, tx });

        return insertedIds;
      });

      res.json({ batchId, changeIds: result, status, count: result.length });
    } catch (error: any) {
      console.error('[EPC Permissions] create change request error:', error);
      res.status(500).json({ message: 'Failed to create change request' });
    }
  });

  app.get('/api/epc-permissions/change-requests', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!requireDashboardAccess(req, res)) return;
      const statusFilter = req.query.status as string | undefined;

      let rows;
      if (statusFilter && ['pending', 'approved', 'rejected', 'applied'].includes(statusFilter)) {
        rows = await db.select().from(permissionChangeRequests)
          .where(eq(permissionChangeRequests.status, statusFilter))
          .orderBy(desc(permissionChangeRequests.requestedAt));
      } else {
        rows = await db.select().from(permissionChangeRequests)
          .orderBy(desc(permissionChangeRequests.requestedAt));
      }

      const userIds = [...new Set(rows.map(r => r.requestedBy).concat(rows.filter(r => r.approvedBy).map(r => r.approvedBy!)))];
      let userMap: Record<number, string> = {};
      if (userIds.length > 0) {
        const userRows = await db.select({ id: users.id, username: users.username, firstName: users.firstName, lastName: users.lastName })
          .from(users).where(inArray(users.id, userIds));
        for (const u of userRows) {
          userMap[u.id] = u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.username;
        }
      }

      const enriched = rows.map(r => ({
        ...r,
        requestedByName: userMap[r.requestedBy] || `User #${r.requestedBy}`,
        approvedByName: r.approvedBy ? (userMap[r.approvedBy] || `User #${r.approvedBy}`) : null,
      }));

      const batches: Record<string, any[]> = {};
      for (const r of enriched) {
        const key = r.batchId || `single-${r.id}`;
        if (!batches[key]) batches[key] = [];
        batches[key].push(r);
      }

      res.json({ requests: enriched, batches });
    } catch (error: any) {
      console.error('[EPC Permissions] list change requests error:', error);
      res.status(500).json({ message: 'Failed to list change requests' });
    }
  });

  app.post('/api/epc-permissions/change-requests/:id/approve', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!requireDashboardAccess(req, res)) return;
      const meta = getRequestMeta(req);
      const id = parseInt(req.params.id);

      const [cr] = await db.select().from(permissionChangeRequests).where(eq(permissionChangeRequests.id, id));
      if (!cr) return res.status(404).json({ message: 'Change request not found' });
      if (cr.status !== 'pending') return res.status(400).json({ message: `Cannot approve a ${cr.status} request.` });
      if (cr.requestedBy === meta.userId) return res.status(403).json({ message: 'Self-approval not allowed. A different authorized user must approve.' });

      await db.transaction(async (tx) => {
        if (cr.batchId) {
          const batchItems = await tx.select().from(permissionChangeRequests)
            .where(eq(permissionChangeRequests.batchId, cr.batchId));
          const allPending = batchItems.every(b => b.status === 'pending');
          if (!allPending) throw new Error('VALIDATION:All items in batch must be pending to approve.');

          await tx.update(permissionChangeRequests)
            .set({ status: 'approved', approvedBy: meta.userId, approvedAt: new Date() })
            .where(eq(permissionChangeRequests.batchId, cr.batchId));

          await writeAuditLog(req, 'approve', {
            batchId: cr.batchId,
            batchSize: batchItems.length,
            approvedIds: batchItems.map(b => b.id),
          }, { batchId: cr.batchId, tx });
        } else {
          await tx.update(permissionChangeRequests)
            .set({ status: 'approved', approvedBy: meta.userId, approvedAt: new Date() })
            .where(eq(permissionChangeRequests.id, id));

          await writeAuditLog(req, 'approve', { changeRequestId: id }, { changeRequestId: id, tx });
        }
      });

      res.json({ success: true, message: 'Change request approved.' });
    } catch (error: any) {
      if (error.message?.startsWith('VALIDATION:')) {
        return res.status(400).json({ message: error.message.replace('VALIDATION:', '') });
      }
      console.error('[EPC Permissions] approve error:', error);
      res.status(500).json({ message: 'Failed to approve change request' });
    }
  });

  app.post('/api/epc-permissions/change-requests/:id/reject', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!requireDashboardAccess(req, res)) return;
      const meta = getRequestMeta(req);
      const id = parseInt(req.params.id);
      const { reason } = req.body;

      if (!reason?.trim()) return res.status(400).json({ message: 'Rejection reason is required.' });

      const [cr] = await db.select().from(permissionChangeRequests).where(eq(permissionChangeRequests.id, id));
      if (!cr) return res.status(404).json({ message: 'Change request not found' });
      if (cr.status !== 'pending') return res.status(400).json({ message: `Cannot reject a ${cr.status} request.` });

      await db.transaction(async (tx) => {
        if (cr.batchId) {
          await tx.update(permissionChangeRequests)
            .set({ status: 'rejected', rejectionReason: reason.trim(), approvedBy: meta.userId, approvedAt: new Date() })
            .where(eq(permissionChangeRequests.batchId, cr.batchId));

          await writeAuditLog(req, 'reject', { batchId: cr.batchId, reason }, { batchId: cr.batchId, tx });
        } else {
          await tx.update(permissionChangeRequests)
            .set({ status: 'rejected', rejectionReason: reason.trim(), approvedBy: meta.userId, approvedAt: new Date() })
            .where(eq(permissionChangeRequests.id, id));

          await writeAuditLog(req, 'reject', { changeRequestId: id, reason }, { changeRequestId: id, tx });
        }
      });

      res.json({ success: true, message: 'Change request rejected.' });
    } catch (error: any) {
      console.error('[EPC Permissions] reject error:', error);
      res.status(500).json({ message: 'Failed to reject change request' });
    }
  });

  app.post('/api/epc-permissions/change-requests/:id/apply', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!requireDashboardAccess(req, res)) return;
      const meta = getRequestMeta(req);
      const id = parseInt(req.params.id);

      const [cr] = await db.select().from(permissionChangeRequests).where(eq(permissionChangeRequests.id, id));
      if (!cr) return res.status(404).json({ message: 'Change request not found' });
      if (cr.status !== 'approved') return res.status(400).json({ message: `Only approved requests can be applied. Current status: ${cr.status}` });

      // Emergency-override requests were already Superuser-validated at creation time —
      // skip the re-auth gate. For normal approvals, enforce it inline.
      if (!cr.emergencyOverride) {
        const { checkReauth } = await import('./middleware/require-reauth');
        if (!await checkReauth(req, res, 'user.change_permissions')) return;
      }

      const result = await db.transaction(async (tx) => {
        const snapshotId = await captureSnapshot(req, 'page_matrix', `Pre-apply snapshot for ${cr.batchId || `request #${id}`}`, tx);

        let itemsToApply = [cr];
        if (cr.batchId) {
          itemsToApply = await tx.select().from(permissionChangeRequests)
            .where(and(
              eq(permissionChangeRequests.batchId, cr.batchId),
              eq(permissionChangeRequests.status, 'approved')
            ));
        }

        let appliedCount = 0;
        const appliedDetails: any[] = [];

        for (const item of itemsToApply) {
          if (item.requestType === 'page_access' && item.targetEntity === 'department') {
            const granted = (item.requestedValue as any)?.granted;
            if (typeof granted === 'boolean' && item.pageKey) {
              const existing = await tx.select().from(departmentPagePermissions)
                .where(and(
                  eq(departmentPagePermissions.department, item.targetId),
                  eq(departmentPagePermissions.pageKey, item.pageKey)
                ));
              if (existing.length > 0) {
                await tx.update(departmentPagePermissions)
                  .set({ canView: granted, updatedAt: new Date() })
                  .where(eq(departmentPagePermissions.id, existing[0].id));
              } else {
                await tx.insert(departmentPagePermissions).values({
                  department: item.targetId,
                  pageKey: item.pageKey,
                  moduleName: 'Project Management',
                  canView: granted,
                });
              }
              appliedCount++;
              appliedDetails.push({ id: item.id, type: 'dept_page', dept: item.targetId, page: item.pageKey, granted });
            }
          } else if (item.requestType === 'page_access' && item.targetEntity === 'user') {
            const granted = (item.requestedValue as any)?.granted;
            if (typeof granted === 'boolean' && item.pageKey) {
              const userId = parseInt(item.targetId);
              const existing = await tx.select().from(pagePermissions)
                .where(and(
                  eq(pagePermissions.userId, userId),
                  eq(pagePermissions.pageKey, item.pageKey)
                ));
              if (existing.length > 0) {
                await tx.update(pagePermissions)
                  .set({ canView: granted, updatedAt: new Date() })
                  .where(eq(pagePermissions.id, existing[0].id));
              } else {
                await tx.insert(pagePermissions).values({
                  userId,
                  pageKey: item.pageKey,
                  moduleName: 'Project Management',
                  canView: granted,
                });
              }
              appliedCount++;
              appliedDetails.push({ id: item.id, type: 'user_page', userId, page: item.pageKey, granted });
            }
          }
        }

        const updateIds = itemsToApply.map(i => i.id);
        if (updateIds.length > 0) {
          await tx.update(permissionChangeRequests)
            .set({ status: 'applied', appliedAt: new Date() })
            .where(inArray(permissionChangeRequests.id, updateIds));
        }

        await writeAuditLog(req, 'apply', {
          snapshotId,
          batchId: cr.batchId,
          appliedCount,
          appliedDetails,
        }, { batchId: cr.batchId, snapshotId, tx });

        return { appliedCount, snapshotId };
      });

      res.json({ success: true, appliedCount: result.appliedCount, snapshotId: result.snapshotId, message: `Applied ${result.appliedCount} permission change(s).` });
    } catch (error: any) {
      console.error('[EPC Permissions] apply error:', error);
      res.status(500).json({ message: 'Failed to apply change request' });
    }
  });

  app.get('/api/epc-permissions/snapshots', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!requireDashboardAccess(req, res)) return;
      const rows = await db.select({
        id: permissionSnapshots.id,
        snapshotType: permissionSnapshots.snapshotType,
        createdBy: permissionSnapshots.createdBy,
        createdAt: permissionSnapshots.createdAt,
        description: permissionSnapshots.description,
      }).from(permissionSnapshots).orderBy(desc(permissionSnapshots.createdAt));

      const userIds = [...new Set(rows.map(r => r.createdBy))];
      let userMap: Record<number, string> = {};
      if (userIds.length > 0) {
        const userRows = await db.select({ id: users.id, username: users.username, firstName: users.firstName, lastName: users.lastName })
          .from(users).where(inArray(users.id, userIds));
        for (const u of userRows) {
          userMap[u.id] = u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.username;
        }
      }

      res.json(rows.map(r => ({
        ...r,
        createdByName: userMap[r.createdBy] || `User #${r.createdBy}`,
      })));
    } catch (error: any) {
      console.error('[EPC Permissions] snapshots error:', error);
      res.status(500).json({ message: 'Failed to list snapshots' });
    }
  });

  app.post('/api/epc-permissions/snapshots', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!requireDashboardAccess(req, res)) return;
      const { description } = req.body;
      const snapshotId = await captureSnapshot(req, 'full', description || 'Manual snapshot');
      res.json({ snapshotId, message: 'Snapshot captured successfully.' });
    } catch (error: any) {
      console.error('[EPC Permissions] create snapshot error:', error);
      res.status(500).json({ message: 'Failed to create snapshot' });
    }
  });

  app.post('/api/epc-permissions/snapshots/:id/restore', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!requireDashboardAccess(req, res)) return;
      const meta = getRequestMeta(req);

      if (meta.role !== 'Superuser') {
        return res.status(403).json({ message: 'Only Superuser can restore snapshots.' });
      }

      const id = parseInt(req.params.id);
      const [snap] = await db.select().from(permissionSnapshots).where(eq(permissionSnapshots.id, id));
      if (!snap) return res.status(404).json({ message: 'Snapshot not found' });

      const data = snap.snapshotData as any;

      await db.transaction(async (tx) => {
        await captureSnapshot(req, 'full', `Pre-restore backup before restoring snapshot #${id}`, tx);

        await tx.delete(departmentPagePermissions);
        if (data.departmentMatrix && Array.isArray(data.departmentMatrix)) {
          for (const row of data.departmentMatrix) {
            await tx.insert(departmentPagePermissions).values({
              department: row.department,
              pageKey: row.pageKey || row.page_key,
              moduleName: row.moduleName || row.module_name || 'Project Management',
              canView: row.canView ?? row.can_view ?? true,
            });
          }
        }

        await tx.delete(pagePermissions);
        if (data.userOverrides && Array.isArray(data.userOverrides)) {
          for (const row of data.userOverrides) {
            await tx.insert(pagePermissions).values({
              userId: row.userId || row.user_id,
              pageKey: row.pageKey || row.page_key,
              moduleName: row.moduleName || row.module_name || 'Project Management',
              canView: row.canView ?? row.can_view ?? true,
            });
          }
        }

        await writeAuditLog(req, 'rollback', {
          snapshotId: id,
          snapshotDescription: snap.description,
          restoredDeptRows: data.departmentMatrix?.length || 0,
          restoredUserRows: data.userOverrides?.length || 0,
        }, { snapshotId: id, tx });
      });

      res.json({ success: true, message: `Restored snapshot #${id} successfully.` });
    } catch (error: any) {
      console.error('[EPC Permissions] restore snapshot error:', error);
      res.status(500).json({ message: 'Failed to restore snapshot' });
    }
  });

  app.get('/api/epc-permissions/audit-log', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!requireDashboardAccess(req, res)) return;

      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const actionFilter = req.query.action as string | undefined;
      const userFilter = req.query.userId ? parseInt(req.query.userId as string) : undefined;

      let query = db.select().from(permissionAuditLog).orderBy(desc(permissionAuditLog.createdAt)).limit(limit).offset(offset);

      const conditions: any[] = [];
      if (actionFilter) conditions.push(eq(permissionAuditLog.action, actionFilter));
      if (userFilter) conditions.push(eq(permissionAuditLog.userId, userFilter));

      let rows;
      if (conditions.length > 0) {
        rows = await db.select().from(permissionAuditLog)
          .where(conditions.length === 1 ? conditions[0] : and(...conditions))
          .orderBy(desc(permissionAuditLog.createdAt))
          .limit(limit).offset(offset);
      } else {
        rows = await db.select().from(permissionAuditLog)
          .orderBy(desc(permissionAuditLog.createdAt))
          .limit(limit).offset(offset);
      }

      const totalResult = await db.select({ count: sql<number>`count(*)` }).from(permissionAuditLog);
      const total = Number(totalResult[0]?.count || 0);

      res.json({ entries: rows, total, limit, offset });
    } catch (error: any) {
      console.error('[EPC Permissions] audit-log error:', error);
      res.status(500).json({ message: 'Failed to load audit log' });
    }
  });

  app.get('/api/epc-permissions/audit-log/export', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!requireDashboardAccess(req, res)) return;

      const rows = await db.select().from(permissionAuditLog)
        .orderBy(desc(permissionAuditLog.createdAt));

      const csvHeader = 'ID,Action,User,Role,Batch ID,Change Request ID,Snapshot ID,IP Address,Details,Timestamp\n';
      const csvRows = rows.map(r =>
        `${r.id},"${r.action}","${r.username}","${r.role}","${r.batchId || ''}",${r.changeRequestId || ''},${r.snapshotId || ''},"${r.ipAddress || ''}","${JSON.stringify(r.details || {}).replace(/"/g, '""')}","${r.createdAt}"`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=permission-audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
      res.send(csvHeader + csvRows);
    } catch (error: any) {
      console.error('[EPC Permissions] audit-log export error:', error);
      res.status(500).json({ message: 'Failed to export audit log' });
    }
  });
}
