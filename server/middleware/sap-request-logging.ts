import { Request, Response, NextFunction } from 'express';

// Middleware to disable request body logging for SAP connect route
export const disableSapConnectLogging = (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/api/sap/b1/connect') {
    // Mark this request to skip detailed logging
    (req as any).skipRequestLogging = true;
    
    // In production, completely disable console output for this route
    if (process.env.NODE_ENV === 'production') {
      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;
      
      // Temporarily disable console logging for this request
      console.log = () => {};
      console.error = () => {};
      
      // Restore console logging after request completes
      res.on('finish', () => {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
      });
    }
  }
  next();
};

// Global password redaction middleware
export const redactSensitiveFields = (req: Request, res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === 'object') {
    // Create a copy for logging without modifying the original
    const sanitizedBody = { ...req.body };
    
    // Redact password fields
    if ('password' in sanitizedBody) {
      sanitizedBody.password = '[REDACTED]';
    }
    if ('Password' in sanitizedBody) {
      sanitizedBody.Password = '[REDACTED]';
    }
    
    // Store sanitized version for potential logging (but not for SAP connect route)
    if (!(req as any).skipRequestLogging && process.env.NODE_ENV !== 'production') {
      (req as any).sanitizedBody = sanitizedBody;
    }
  }
  next();
};

export default { disableSapConnectLogging, redactSensitiveFields };