import { Request, Response, NextFunction } from 'express';

// Simple CORS middleware function that sets appropriate headers
export function cors(req: Request, res: Response, next: NextFunction) {
  // Set CORS headers to allow requests from any origin (for testing only)
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle OPTIONS method specially for CORS preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
}