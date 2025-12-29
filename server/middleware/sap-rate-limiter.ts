import rateLimit, { Options } from 'express-rate-limit';
import { Request } from 'express';

// Rate limiter for SAP B1 login endpoint
export const sapLoginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 5, // 5 attempts per IP + user combination per minute
  keyGenerator: (req: Request): string => {
    // Use user ID as primary key for rate limiting (safer than IP-based)
    const userId = req.user?.id || 'anonymous';
    return `sap_login:${userId}`;
  },
  validate: { xForwardedForHeader: false },
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