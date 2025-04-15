import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { modulePermissions, roleModulePermissions, users, type Module, type User } from '@shared/schema';

/**
 * Checks if a user has a specific permission on a module
 */
export async function checkModulePermission(
  userId: number, 
  moduleName: Module,
  permission: 'view' | 'create' | 'edit' | 'delete'
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
        canDelete: permissions.canDelete ?? false
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
  
  // Get all available modules
  const allModules = await db.select().from(roleModulePermissions)
    .where(eq(roleModulePermissions.role, "General Manager")) // Using this to get a complete list of modules
    .then(perms => perms.map(p => p.moduleName))
    .then(modules => Array.from(new Set(modules))) as Module[]; // Get unique modules
  
  // Combine permissions
  const result: Record<Module, { 
    canView: boolean;
    canCreate: boolean; 
    canEdit: boolean;
    canDelete: boolean;
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