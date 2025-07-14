import { Request, Response, NextFunction } from 'express';

export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  // Check if passport is initialized (req.isAuthenticated exists)
  if (typeof req.isAuthenticated !== 'function') {
    console.log('Auth check for:', req.path, 'Passport not initialized yet');
    return res.status(401).json({ error: 'Authentication not initialized' });
  }
  
  // Enhanced debugging
  console.log('=== AUTH DEBUG START ===');
  console.log('Path:', req.path);
  console.log('Method:', req.method);
  console.log('Session ID:', req.sessionID);
  console.log('Session passport:', req.session?.passport);
  console.log('Request cookies:', req.headers.cookie);
  console.log('User object:', req.user);
  console.log('isAuthenticated():', req.isAuthenticated());
  console.log('=== AUTH DEBUG END ===');
  
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}