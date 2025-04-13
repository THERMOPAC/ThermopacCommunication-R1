import { Request, Response, NextFunction } from 'express';

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