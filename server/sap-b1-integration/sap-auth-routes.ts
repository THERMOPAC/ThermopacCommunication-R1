/**
 * SAP USER AUTH ROUTES — user-facing SAP login/logout/session-status endpoints.
 *
 * PURPOSE: Allows individual users to authenticate with SAP B1 Service Layer via
 * POST /api/sap/connect. The resulting per-user session is stored in SapSessionManager
 * and consumed by routes that have NOT yet been migrated to the central session singleton:
 *   - server/sap-b1-integration/sap-purchase-routes.ts  (via requireSapAccess middleware)
 *   - server/plc-sap-routes.ts
 *
 * This is SEPARATE from SapCentralSession (sap-central-session.ts), which is the
 * system singleton used by all other migrated routes and must NOT be called from here.
 *
 * This file will be removed once all consumers above are migrated to sapSession.request().
 */
import express from 'express';
import { ensureAuthenticated } from '../middleware/auth-middleware';
import { sapLoginLimiter } from '../middleware/sap-rate-limiter';
import { disableSapConnectLogging, redactSensitiveFields } from '../middleware/sap-request-logging';
import { sapSessionManager } from '../sap-session-manager';
import { sapHttpsClient } from './sap-https-client';

const router = express.Router();

// Apply logging middleware globally
router.use(redactSensitiveFields);

// SAP B1 Login endpoint with rate limiting and no request logging
router.post('/connect', 
  ensureAuthenticated,
  disableSapConnectLogging,
  sapLoginLimiter,
  async (req, res) => {
    try {
      // Prefer credentials from Secrets; fall back to request body for manual override
      const username  = process.env.SAP_USERNAME  || req.body?.username;
      const password  = process.env.SAP_PASSWORD  || req.body?.password;
      const companyDb = process.env.SAP_COMPANY_DB || req.body?.companyDb;
      const userId = req.user!.id;

      sapSessionManager.incrementLoginAttempts();

      // Validate required fields
      if (!username || !password || !companyDb) {
        sapSessionManager.incrementLoginFailures();
        return res.status(400).json({
          success: false,
          error: 'SAP credentials not configured. Please set SAP_USERNAME, SAP_PASSWORD, SAP_COMPANY_DB in Secrets.'
        });
      }

      // Attempt SAP B1 Service Layer login
      const { sessionId, response } = await sapHttpsClient.login(username, password, companyDb);
      
      // Extract ROUTEID from response if available
      let routeId: string | undefined;
      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader) {
        const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        for (const cookie of cookieArray) {
          const match = cookie.match(/ROUTEID=([^;]+)/);
          if (match) {
            routeId = match[1];
            break;
          }
        }
      }

      // Store session server-side only (include companyDb for fallback logins)
      sapSessionManager.setSession(userId, sessionId, routeId, companyDb);
      sapSessionManager.incrementLoginSuccesses();

      // Test API access with a simple call
      const testResponse = await sapHttpsClient.authenticatedRequest(sessionId, {
        method: 'GET',
        path: '/b1s/v1/$metadata',
        headers: routeId ? { 'Cookie': `ROUTEID=${routeId}` } : {}
      });

      if (!testResponse.ok) {
        // Session created but API access failed - might be permissions issue
        console.warn(`SAP session created but API test failed: ${testResponse.statusCode}`);
      }

      const ttlSeconds = sapSessionManager.getTtlSeconds(userId);

      res.json({
        success: true,
        message: 'SAP B1 authentication successful',
        ttlSeconds,
        hasApiAccess: testResponse.ok
      });

    } catch (error) {
      sapSessionManager.incrementLoginFailures();
      console.error('SAP B1 login error:', error);
      
      res.status(401).json({
        success: false,
        error: 'Authentication failed. Please check your credentials and try again.',
        code: 'SAP_AUTH_FAILED'
      });
    }
  }
);

// Check session status
router.get('/session/status', ensureAuthenticated, (req, res) => {
  try {
    const userId = req.user!.id;
    const ttlSeconds = sapSessionManager.getTtlSeconds(userId);
    
    if (ttlSeconds === null) {
      return res.status(401).json({
        success: false,
        error: 'No active SAP session',
        code: 'SAP_SESSION_EXPIRED'
      });
    }

    res.json({
      success: true,
      ttlSeconds,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
    });
  } catch (error) {
    console.error('SAP session status error:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to check session status',
      code: 'SAP_SESSION_ERROR'
    });
  }
});

// Manual logout
router.delete('/session', ensureAuthenticated, (req, res) => {
  try {
    const userId = req.user!.id;
    const session = sapSessionManager.getSession(userId);
    
    if (session) {
      // Attempt to logout from SAP Service Layer
      sapHttpsClient.authenticatedRequest(session.sessionId, {
        method: 'POST',
        path: '/b1s/v1/Logout'
      }).catch(err => {
        // Ignore logout errors - session will be cleared anyway
        console.warn('SAP logout API call failed:', err.message);
      });
    }
    
    sapSessionManager.clearSession(userId);
    
    res.json({
      success: true,
      message: 'SAP session cleared'
    });
  } catch (error) {
    console.error('SAP logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Error during logout',
      code: 'SAP_LOGOUT_ERROR'
    });
  }
});

// Health check endpoint (non-authenticated, no internal details)
router.get('/health', async (req, res) => {
  try {
    // Simple connectivity test without authentication
    const startTime = Date.now();
    const response = await sapHttpsClient.request({
      method: 'GET',
      path: '/b1s/v1',
      timeout: 5000
    });
    const responseTime = Date.now() - startTime;
    
    // Determine service status based on response
    let status = 'down';
    if (response.ok || response.statusCode === 401) {
      // 401 is expected for unauthenticated requests
      status = 'healthy';
    } else if (response.statusCode < 500) {
      status = 'degraded';
    }

    res.json({
      service: 'sap-b1-service-layer',
      status,
      responseTimeMs: responseTime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      service: 'sap-b1-service-layer',
      status: 'down',
      responseTimeMs: null,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;