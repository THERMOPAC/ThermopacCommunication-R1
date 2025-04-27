import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to ensure a user is authenticated before accessing a route
 */
export const ensureAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  console.log('Unauthenticated user tried to access protected route:', req.path);
  return res.status(401).json({ error: 'Not authenticated' });
};

/**
 * Middleware to check if a user has the required role
 * @param roles Array of allowed roles
 */
export const hasRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      console.log('Unauthenticated user tried to access role-protected route:', req.path);
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const userRole = req.user?.role;
    
    if (!userRole || !roles.includes(userRole)) {
      console.log(`User ${req.user?.username} with role ${userRole} tried to access role-protected route:`, req.path);
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    return next();
  };
};

/**
 * Middleware to ensure a user has the "Superuser" role
 */
export const isSuperuser = hasRole(['Superuser']);

/**
 * Middleware to ensure a user has the "Admin" role
 */
export const isAdmin = hasRole(['Admin', 'Superuser']);

/**
 * Middleware to ensure a user is the creator of a resource or has admin privileges
 * @param getResourceCreatorId Function to extract the creator ID from the request
 */
export const isCreatorOrAdmin = (getResourceCreatorId: (req: Request) => Promise<number | null>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      console.log('Unauthenticated user tried to access creator-protected route:', req.path);
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    // Admins and superusers can access all resources
    if (userRole === 'Admin' || userRole === 'Superuser') {
      return next();
    }
    
    // For other users, check if they're the creator
    try {
      const creatorId = await getResourceCreatorId(req);
      
      if (creatorId === null) {
        console.log('Resource not found when checking creator:', req.path);
        return res.status(404).json({ error: 'Resource not found' });
      }
      
      if (creatorId === userId) {
        return next();
      }
      
      console.log(`User ${req.user?.username} tried to access resource created by user ${creatorId}:`, req.path);
      return res.status(403).json({ error: 'Forbidden: You do not have permission to access this resource' });
    } catch (error) {
      console.error('Error in isCreatorOrAdmin middleware:', error);
      return res.status(500).json({ error: 'Internal server error when checking permissions' });
    }
  };
};