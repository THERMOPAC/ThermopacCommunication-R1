import { Request, Response, NextFunction } from 'express';
import { sapSessionManager } from '../sap-session-manager';

// Extend Request type to include SAP session info
declare global {
  namespace Express {
    interface Request {
      sapSession?: {
        sessionId: string;
        routeId?: string;
        companyDb: string;
        userId: number;
      };
    }
  }
}

// Middleware to require valid SAP B1 session
export const requireSapSession = (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const session = sapSessionManager.getSession(userId);
    
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'SAP session required. Please login to SAP B1 first.',
        code: 'SAP_SESSION_REQUIRED'
      });
    }

    req.sapSession = {
      sessionId: session.sessionId,
      routeId: session.routeId,
      companyDb: session.companyDb,
      userId: session.userId
    };

    next();
  } catch (error) {
    console.error('SAP session middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Session validation error',
      code: 'SAP_SESSION_ERROR'
    });
  }
};

// Middleware to check if user has SAP B1 access permission
export const requireSapAccess = (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Check if user has SAP B1 access (assuming this field exists or user is Superuser)
    const hasSapAccess = user.role === 'Superuser' || (user as any).has_sap_b1 === true;
    
    if (!hasSapAccess) {
      return res.status(403).json({
        success: false,
        error: 'SAP B1 access not authorized. Contact administrator for permissions.',
        code: 'SAP_ACCESS_DENIED'
      });
    }

    next();
  } catch (error) {
    console.error('SAP access middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Permission validation error',
      code: 'SAP_PERMISSION_ERROR'
    });
  }
};

export default { requireSapSession, requireSapAccess };