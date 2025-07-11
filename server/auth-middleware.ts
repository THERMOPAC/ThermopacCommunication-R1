import { Request, Response, NextFunction } from 'express';

export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  // Check if passport is initialized (req.isAuthenticated exists)
  if (typeof req.isAuthenticated !== 'function') {
    console.log('Auth check for:', req.path, 'Passport not initialized yet');
    return res.status(401).json({ error: 'Authentication not initialized' });
  }
  
  console.log('Auth check for:', req.path, 'Authenticated:', req.isAuthenticated(), 'User:', req.user?.username);
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}