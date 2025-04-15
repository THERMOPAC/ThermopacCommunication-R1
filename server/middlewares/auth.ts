import { Request, Response, NextFunction } from 'express';
import { checkModulePermission } from '../utils/permission-utils';
import { Module } from '@shared/schema';

/**
 * Middleware to check if a user is authenticated
 * Use this on routes that require authentication
 */
export function authenticateUser(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized - Please log in' });
  }
  
  next();
}

/**
 * Middleware to check if a user has a specific role
 * @param roles Array of allowed roles
 */
export function checkRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized - Please log in' });
    }
    
    const userRole = req.user?.role;
    
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ 
        message: 'Forbidden - You do not have permission to access this resource'
      });
    }
    
    next();
  };
}

/**
 * Middleware to check if a user is a superuser
 */
export function requireSuperuser(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized - Please log in' });
  }
  
  if (req.user?.role !== 'Superuser') {
    return res.status(403).json({ 
      message: 'Forbidden - This action requires superuser privileges'
    });
  }
  
  next();
}

/**
 * Middleware to check if a user has administrative permissions
 * (Superuser, General Manager, or Senior Manager)
 */
export function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized - Please log in' });
  }
  
  const adminRoles = ['Superuser', 'General Manager', 'Senior Manager'];
  if (!adminRoles.includes(req.user?.role)) {
    return res.status(403).json({ 
      message: 'Forbidden - This action requires administrative privileges'
    });
  }
  
  next();
}

/**
 * Middleware to check if a user has permission for a specific module action
 * @param moduleName The module to check permission for
 * @param permission The permission type (view, create, edit, delete)
 */
export function checkModulePermissionMiddleware(
  moduleName: Module,
  permission: 'view' | 'create' | 'edit' | 'delete'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized - Please log in' });
    }
    
    const userId = req.user?.id;
    if (!userId) {
      return res.status(403).json({ message: 'Invalid user session' });
    }
    
    const hasPermission = await checkModulePermission(userId, moduleName, permission);
    
    if (!hasPermission) {
      return res.status(403).json({ 
        message: `You do not have ${permission} permission for the ${moduleName} module`
      });
    }
    
    next();
  };
}