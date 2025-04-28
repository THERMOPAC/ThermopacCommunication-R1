import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to ensure a user is authenticated before accessing a route
 */
export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  
  res.status(401).json({ error: 'Not authenticated' });
}