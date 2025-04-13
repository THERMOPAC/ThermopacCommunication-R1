import { Request, Response, NextFunction } from 'express';

// Middleware to check if a user is authenticated
export function authenticateUser(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
}