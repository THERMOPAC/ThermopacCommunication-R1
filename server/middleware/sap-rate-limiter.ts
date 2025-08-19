import rateLimit from 'express-rate-limit';
import { Request } from 'express';

// Rate limiter for SAP B1 login endpoint
export const sapLoginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 5, // 5 attempts per IP + user combination per minute
  keyGenerator: (req: Request): string => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = req.user?.id || 'anonymous';
    return `sap_login:${ip}:${userId}`;
  },
  message: {
    success: false,
    error: 'Too many SAP login attempts. Please wait before trying again.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

export default sapLoginLimiter;