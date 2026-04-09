import { db } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import { modulePermissions, roleModulePermissions, departmentPagePermissions, pagePermissions, users, projectMembers, type Module, type User } from '@shared/schema';
import { roleHierarchy } from '@shared/roles';
import type { Request, Response, NextFunction } from 'express';

/**
 * Checks if a user has a specific permission on a module
 */
export async function checkModulePermission(
  userId: number, 
  moduleName: Module,
  permission: 'view' | 'create' | 'edit' | 'delete' | 'upload' | 'download'
): Promise<boolean> {
  // Get the user to check their role
  const userResults = await db.select().from(users).where(eq(users.id, userId));
  const user = userResults.length > 0 ? userResults[0] : null;
  
  if (!user) return false;
  
  // Superusers have full access to all modules
  if (user.role === 'Superuser') {
    return true;
  }
  
  // For other users, check user-specific permissions first
  const userPermissions = await db.select()
    .from(modulePermissions)
    .where(and(
      eq(modulePermissions.userId, userId),
      eq(modulePermissions.moduleName, moduleName)
    ));

  // If user has specific permissions set, use those
  if (userPermissions.length > 0) {
    const userPerm = userPermissions[0];
    
    switch (permission) {
      case 'view': return userPerm.canView;
      case 'create': return userPerm.canCreate;
      case 'edit': return userPerm.canEdit;
      case 'delete': return userPerm.canDelete;
      case 'upload': return userPerm.canUpload;
      case 'download': return userPerm.canDownload;
    }
  }

  // Otherwise, fall back to role-based permissions
  const rolePerms = await db.select()
    .from(roleModulePermissions)
    .where(and(
      eq(roleModulePermissions.role, user.role),
      eq(roleModulePermissions.moduleName, moduleName)
    ));

  if (rolePerms.length > 0) {
    const rolePerm = rolePerms[0];
    
    switch (permission) {
      case 'view': return rolePerm.canView;
      case 'create': return rolePerm.canCreate;
      case 'edit': return rolePerm.canEdit;
      case 'delete': return rolePerm.canDelete;
      case 'upload': return rolePerm.canUpload;
      case 'download': return rolePerm.canDownload;
    }
  }

  // Default to no permission
  return false;
}

/**
 * Sets custom module permissions for a specific user
 */
export async function setUserModulePermission(
  userId: number,
  moduleName: Module,
  permissions: {
    canView?: boolean;
    canCreate?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canUpload?: boolean;
    canDownload?: boolean;
  }
): Promise<void> {
  // Check if permission record already exists
  const existingPerms = await db.select()
    .from(modulePermissions)
    .where(and(
      eq(modulePermissions.userId, userId),
      eq(modulePermissions.moduleName, moduleName)
    ));

  if (existingPerms.length > 0) {
    // Update existing permissions
    await db.update(modulePermissions)
      .set({
        canView: permissions.canView !== undefined ? permissions.canView : existingPerms[0].canView,
        canCreate: permissions.canCreate !== undefined ? permissions.canCreate : existingPerms[0].canCreate,
        canEdit: permissions.canEdit !== undefined ? permissions.canEdit : existingPerms[0].canEdit,
        canDelete: permissions.canDelete !== undefined ? permissions.canDelete : existingPerms[0].canDelete,
        canUpload: permissions.canUpload !== undefined ? permissions.canUpload : existingPerms[0].canUpload,
        canDownload: permissions.canDownload !== undefined ? permissions.canDownload : existingPerms[0].canDownload,
        updatedAt: new Date()
      })
      .where(and(
        eq(modulePermissions.userId, userId),
        eq(modulePermissions.moduleName, moduleName)
      ));
  } else {
    // Create new permissions
    await db.insert(modulePermissions)
      .values({
        userId,
        moduleName,
        canView: permissions.canView ?? false,
        canCreate: permissions.canCreate ?? false, 
        canEdit: permissions.canEdit ?? false,
        canDelete: permissions.canDelete ?? false,
        canUpload: permissions.canUpload ?? false,
        canDownload: permissions.canDownload ?? false
      });
  }
}

/**
 * Gets all module permissions for a user
 */
export async function getUserModulePermissions(userId: number) {
  // Get user-specific permissions
  const userSpecificPerms = await db.select()
    .from(modulePermissions)
    .where(eq(modulePermissions.userId, userId));
  
  // Get user's role
  const userResults = await db.select().from(users).where(eq(users.id, userId));
  const user = userResults.length > 0 ? userResults[0] : null;
  
  if (!user) return {};
  
  // Get all available modules from the schema
  const { modules } = await import('../../shared/schema');
  const allModules = modules as readonly Module[];
  
  // Combine permissions
  const result: Record<Module, { 
    canView: boolean;
    canCreate: boolean; 
    canEdit: boolean;
    canDelete: boolean;
    canUpload: boolean;
    canDownload: boolean;
    isCustom: boolean; 
  }> = {} as any;
  
  // Check if user is a Superuser - they get full access to all modules
  if (user.role === 'Superuser') {
    allModules.forEach(moduleName => {
      result[moduleName] = {
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canUpload: true,
        canDownload: true,
        isCustom: false
      };
    });
    
    return result;
  }
  
  // For other users, get role-based permissions
  const rolePerms = await db.select()
    .from(roleModulePermissions)
    .where(eq(roleModulePermissions.role, user.role));
  
  // Start with role permissions as defaults
  rolePerms.forEach(rolePerm => {
    result[rolePerm.moduleName as Module] = {
      canView: rolePerm.canView,
      canCreate: rolePerm.canCreate,
      canEdit: rolePerm.canEdit,
      canDelete: rolePerm.canDelete,
      canUpload: rolePerm.canUpload ?? false,
      canDownload: rolePerm.canDownload ?? false,
      isCustom: false
    };
  });
  
  // Override with user-specific permissions where they exist
  userSpecificPerms.forEach(userPerm => {
    result[userPerm.moduleName as Module] = {
      canView: userPerm.canView,
      canCreate: userPerm.canCreate,
      canEdit: userPerm.canEdit,
      canDelete: userPerm.canDelete,
      canUpload: userPerm.canUpload,
      canDownload: userPerm.canDownload,
      isCustom: true
    };
  });
  
  return result;
}

/**
 * Resets a user's module permissions to role defaults
 */
export async function resetUserModulePermissions(userId: number, moduleName: Module): Promise<void> {
  await db.delete(modulePermissions)
    .where(and(
      eq(modulePermissions.userId, userId),
      eq(modulePermissions.moduleName, moduleName)
    ));
}

export async function checkUserPageOverride(userId: number, pageKey: string): Promise<boolean | null> {
  const rows = await db.select()
    .from(pagePermissions)
    .where(and(
      eq(pagePermissions.userId, userId),
      eq(pagePermissions.pageKey, pageKey)
    ));
  if (rows.length === 0) return null;
  return rows[0].canView;
}

export async function checkDeptPagePermission(department: string | null | undefined, pageKey: string): Promise<boolean> {
  if (!department) return false;
  const normalized = department.trim();
  if (!normalized) return false;
  const rows = await db.select()
    .from(departmentPagePermissions)
    .where(and(
      eq(departmentPagePermissions.pageKey, pageKey)
    ));
  const match = rows.find(r => r.department.trim().toLowerCase() === normalized.toLowerCase());
  if (!match) return false;
  return match.canView;
}

export async function checkPagePermission(userId: number, role: string, department: string | null | undefined, pageKey: string): Promise<boolean> {
  if (role === "Superuser") return true;
  const level = roleHierarchy[role] ?? 5;
  if (level <= 2) return true;

  const userOverride = await checkUserPageOverride(userId, pageKey);
  if (userOverride !== null) return userOverride;

  return checkDeptPagePermission(department, pageKey);
}

export async function getAllPagePermissionsForUser(userId: number, role: string, department: string | null | undefined): Promise<Record<string, boolean>> {
  const { epcPageKeys } = await import('../../shared/schema');

  if (role === "Superuser" || (roleHierarchy[role] ?? 5) <= 2) {
    const result: Record<string, boolean> = {};
    for (const key of epcPageKeys) result[key] = true;
    return result;
  }

  const userOverrides = await db.select()
    .from(pagePermissions)
    .where(eq(pagePermissions.userId, userId));

  const deptRows = await db.select()
    .from(departmentPagePermissions);

  const normalizedDept = department?.trim().toLowerCase() || "";

  const result: Record<string, boolean> = {};
  for (const key of epcPageKeys) {
    const override = userOverrides.find(o => o.pageKey === key);
    if (override) {
      result[key] = override.canView;
      continue;
    }
    const deptMatch = deptRows.find(
      r => r.pageKey === key && r.department.trim().toLowerCase() === normalizedDept
    );
    result[key] = deptMatch ? deptMatch.canView : false;
  }
  return result;
}

export function requirePageAccess(pageKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const allowed = await checkPagePermission(user.id, user.role, user.department, pageKey);
    if (!allowed) {
      return res.status(403).json({
        error: "Page access denied",
        code: "PAGE_ACCESS_DENIED",
        pageKey
      });
    }
    next();
  };
}

export async function checkProjectMembership(userId: number, role: string, projectId: number): Promise<{ isMember: boolean; visibilityScope: string }> {
  const level = roleHierarchy[role] ?? 5;
  if (role === "Superuser" || level <= 2) return { isMember: true, visibilityScope: 'project_all' };

  const rows = await db.select({ id: projectMembers.id, visibilityScope: projectMembers.visibilityScope })
    .from(projectMembers)
    .where(and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userId),
      eq(projectMembers.isActive, true)
    ))
    .limit(1);

  if (rows.length === 0) return { isMember: false, visibilityScope: 'department_records' };
  return { isMember: true, visibilityScope: rows[0].visibilityScope };
}

export function requireProjectMembership(paramName: string = 'projectId') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const projectId = parseInt(req.params[paramName]);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid project ID" });

    const { isMember, visibilityScope } = await checkProjectMembership(user.id, user.role, projectId);
    if (!isMember) {
      console.warn(`[PROJECT_ACCESS_DENIED] userId=${user.id} username=${user.username} role=${user.role} projectId=${projectId} path=${req.method} ${req.originalUrl}`);
      return res.status(403).json({
        error: "Project access denied",
        code: "PROJECT_ACCESS_DENIED",
        projectId
      });
    }
    (req as any).visibilityScope = visibilityScope;
    next();
  };
}

export type OwnershipFilterMode = 'strict' | 'department';

export interface OwnershipFilterConfig {
  createdByColumn: string;
  assignedToColumn?: string;
  mode: OwnershipFilterMode;
}

const SM_PLUS_LEVEL = 2;

function isSmPlus(role: string): boolean {
  const level = roleHierarchy[role] ?? 5;
  return role === "Superuser" || level <= SM_PLUS_LEVEL;
}

export function buildOwnershipWhereClause(
  user: { id: number; role: string; department: string | null },
  visibilityScope: string,
  config: OwnershipFilterConfig,
  tableAlias: string
): { whereSql: ReturnType<typeof sql> | null; joinSql: ReturnType<typeof sql> | null } {
  if (isSmPlus(user.role) || visibilityScope === 'project_all') {
    return { whereSql: null, joinSql: null };
  }

  const userId = user.id;
  const createdByRef = sql.raw(`${tableAlias}.${config.createdByColumn}`);
  const assignedToRef = config.assignedToColumn ? sql.raw(`${tableAlias}.${config.assignedToColumn}`) : null;

  if (config.mode === 'strict' || visibilityScope === 'own_records_only' || !user.department) {
    if (assignedToRef) {
      return {
        whereSql: sql`(${createdByRef} = ${userId} OR ${assignedToRef} = ${userId})`,
        joinSql: null
      };
    }
    return {
      whereSql: sql`(${createdByRef} = ${userId})`,
      joinSql: null
    };
  }

  const dept = user.department;
  const joinSql = sql`LEFT JOIN users ownership_creator ON ownership_creator.id = ${createdByRef}`;

  if (assignedToRef) {
    return {
      whereSql: sql`(${createdByRef} = ${userId} OR ${assignedToRef} = ${userId} OR ownership_creator.department = ${dept})`,
      joinSql
    };
  }
  return {
    whereSql: sql`(${createdByRef} = ${userId} OR ownership_creator.department = ${dept})`,
    joinSql
  };
}

export function checkRecordOwnership(
  record: { created_by?: number | null; assigned_to?: number | null },
  creatorDepartment: string | null,
  user: { id: number; role: string; department: string | null },
  visibilityScope: string,
  mode: OwnershipFilterMode
): boolean {
  if (isSmPlus(user.role) || visibilityScope === 'project_all') return true;

  if (record.created_by === user.id) return true;
  if (record.assigned_to && record.assigned_to === user.id) return true;

  if (mode === 'department' && visibilityScope !== 'own_records_only') {
    if (user.department && creatorDepartment && user.department === creatorDepartment) return true;
  }

  return false;
}

export async function lookupCreatorDepartment(createdBy: number | null): Promise<string | null> {
  if (!createdBy) return null;
  const rows = await db.select({ department: users.department })
    .from(users)
    .where(eq(users.id, createdBy))
    .limit(1);
  return rows.length > 0 ? rows[0].department : null;
}

export function denyRecordAccess(res: Response, req: Request): Response {
  const user = (req as any).user;
  console.warn(`[RECORD_ACCESS_DENIED] userId=${user?.id} username=${user?.username} role=${user?.role} path=${req.method} ${req.originalUrl}`);
  persistDenialLog(user, 'RECORD_ACCESS_DENIED', req);
  return res.status(403).json({
    error: "Access denied",
    code: "RECORD_ACCESS_DENIED"
  });
}

export function denyProjectAccess(res: Response, req: Request): Response {
  const user = (req as any).user;
  console.warn(`[PROJECT_ACCESS_DENIED] userId=${user?.id} username=${user?.username} role=${user?.role} path=${req.method} ${req.originalUrl}`);
  persistDenialLog(user, 'PROJECT_ACCESS_DENIED', req);
  return res.status(403).json({
    error: "Access denied",
    code: "PROJECT_ACCESS_DENIED"
  });
}

function persistDenialLog(user: any, code: string, req: Request): void {
  db.execute(sql`INSERT INTO access_denied_log (user_id, username, role, department, denial_code, method, path)
    VALUES (${user?.id || null}, ${user?.username || null}, ${user?.role || null}, ${user?.department || null}, ${code}, ${req.method}, ${req.originalUrl})`)
    .catch((err: any) => console.error('[DenialLog] Failed to persist:', err.message));
}

export async function enforceWriteOwnership(
  record: any,
  user: any,
  mode: OwnershipFilterMode,
  req: Request,
  res: Response
): Promise<boolean> {
  const { visibilityScope } = await checkProjectMembership(user.id, user.role, record.project_id);
  const creatorDept = mode === 'department' ? await lookupCreatorDepartment(record.created_by) : null;
  if (!checkRecordOwnership(record, creatorDept, user, visibilityScope, mode)) {
    denyRecordAccess(res, req);
    return false;
  }
  return true;
}