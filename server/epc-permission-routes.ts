import { Express, Request, Response } from 'express';
import { roleHierarchy } from '@shared/roles';
import {
  EPC_PAGES,
  EPC_ACTIONS,
  EPC_DATA_RULES,
  EPC_GAPS,
  ROLE_LABELS,
  ROLE_LEVELS,
  type PagePermission,
  type ActionPermission,
  type DataRule,
  type GapFinding,
} from '@shared/epc-permission-registry';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ message: 'Not authenticated' });
}

export function registerEpcPermissionRoutes(app: Express) {
  app.get('/api/epc-permissions/matrix', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userRole = (req.user as any)?.role;
      const allowedRoles = ['Superuser', 'General Manager'];
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: 'Only General Manager and Superuser can access the permission dashboard.' });
      }

      const simulateRole = req.query.role as string | undefined;
      const simulateLevel = simulateRole && roleHierarchy[simulateRole] !== undefined
        ? roleHierarchy[simulateRole]
        : null;

      const pages = EPC_PAGES.map((p: PagePermission) => ({
        ...p,
        visibilityByRole: Object.fromEntries(
          ROLE_LEVELS.map(level => [
            level,
            level <= p.minViewRole,
          ])
        ),
        simulatedVisible: simulateLevel !== null ? simulateLevel <= p.minViewRole : null,
      }));

      const actions = EPC_ACTIONS.map((a: ActionPermission) => ({
        ...a,
        allowedByRole: Object.fromEntries(
          ROLE_LEVELS.map(level => [
            level,
            level <= a.minRoleLevel,
          ])
        ),
        simulatedAllowed: simulateLevel !== null ? simulateLevel <= a.minRoleLevel : null,
      }));

      const dataRules = EPC_DATA_RULES.map((d: DataRule) => ({
        ...d,
        visibleByRole: Object.fromEntries(
          ROLE_LEVELS.map(level => [
            level,
            level <= d.minViewRole,
          ])
        ),
        simulatedVisible: simulateLevel !== null ? simulateLevel <= d.minViewRole : null,
      }));

      const gaps: GapFinding[] = EPC_GAPS;

      res.json({
        pages,
        actions,
        dataRules,
        gaps,
        roleLabels: ROLE_LABELS,
        roleLevels: ROLE_LEVELS,
        simulatedRole: simulateRole || null,
        registryTimestamp: "2026-03-31",
        registryNote: "This registry is a normalization layer derived from actual backend route guards and frontend action definitions. Each entry references its real code source.",
      });
    } catch (error: any) {
      console.error('[EPC Permissions] matrix error:', error);
      res.status(500).json({ message: 'Failed to load permission matrix' });
    }
  });

  app.get('/api/epc-permissions/summary', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userRole = (req.user as any)?.role;
      const allowedRoles = ['Superuser', 'General Manager'];
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: 'Only General Manager and Superuser can access the permission dashboard.' });
      }

      const totalPages = EPC_PAGES.length;
      const totalActions = EPC_ACTIONS.length;
      const totalDataRules = EPC_DATA_RULES.length;
      const totalGaps = EPC_GAPS.length;

      const gapsBySeverity = {
        high: EPC_GAPS.filter(g => g.severity === 'high').length,
        medium: EPC_GAPS.filter(g => g.severity === 'medium').length,
        low: EPC_GAPS.filter(g => g.severity === 'low').length,
      };

      const gapsByCategory = EPC_GAPS.reduce((acc, g) => {
        acc[g.category] = (acc[g.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const smOnlyActions = EPC_ACTIONS.filter(a => a.minRoleLevel <= 2 && a.minRoleLevel > 1).length;
      const gmOnlyActions = EPC_ACTIONS.filter(a => a.minRoleLevel <= 1).length;
      const managerActions = EPC_ACTIONS.filter(a => a.minRoleLevel === 3).length;

      const alignedActions = EPC_ACTIONS.filter(a => a.aligned).length;
      const misalignedActions = EPC_ACTIONS.filter(a => !a.aligned).length;

      const selfActionPreventionCount = EPC_ACTIONS.filter(a => a.selfActionPrevention).length;

      const moduleCount = new Set(EPC_ACTIONS.map(a => a.pageId)).size;

      res.json({
        totalPages,
        totalActions,
        totalDataRules,
        totalGaps,
        gapsBySeverity,
        gapsByCategory,
        actionsByMinRole: {
          gmOnly: gmOnlyActions,
          smOnly: smOnlyActions,
          manager: managerActions,
        },
        alignedActions,
        misalignedActions,
        selfActionPreventionCount,
        moduleCount,
        registryTimestamp: "2026-03-31",
      });
    } catch (error: any) {
      console.error('[EPC Permissions] summary error:', error);
      res.status(500).json({ message: 'Failed to load permission summary' });
    }
  });
}
