import { Request, Response, NextFunction } from 'express';

export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  console.log('Auth check for:', req.path, 'Authenticated:', req.isAuthenticated(), 'User:', req.user?.username);
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}