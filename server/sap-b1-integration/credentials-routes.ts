import { Router } from 'express';
import { ensureAuthenticated } from '../auth-middleware';
import { sapHttpsClient } from './sap-https-client';
import { sapSessionManager } from '../sap-session-manager';

const router = Router();

// Test SAP connection with provided credentials
router.post('/connection/test', ensureAuthenticated, async (req, res) => {
  try {
    const { username, password, companyDb } = req.body;
    
    if (!username || !password || !companyDb) {
      return res.status(400).json({
        success: false,
        error: 'Username, password, and company database are required'
      });
    }

    console.log('🔥 SAP CONNECTION TEST STARTED - Testing Service Layer');
    console.log('🔑 SAP Credentials Check:', {
      passwordLength: password.length,
      sapCompanyDb: companyDb
    });

    console.log('🔐 Attempting HTTPS connection with SSL bypass...');

    // Test login using custom HTTPS client
    const { sessionId } = await sapHttpsClient.login(username, password, companyDb);

    console.log('✅ HTTPS SSL bypass successful - Service Layer login working');

    // Test a simple API call to verify permissions
    const testResponse = await sapHttpsClient.authenticatedRequest(sessionId, {
      method: 'GET',
      path: '/b1s/v1/PurchaseOrders?$top=1'
    });

    // Always logout immediately — orphaned sessions block subsequent logins
    try {
      await sapHttpsClient.authenticatedRequest(sessionId, { method: 'POST', path: '/b1s/v1/Logout' });
    } catch (_) {}

    if (!testResponse.ok) {
      console.log('❌ Purchase Orders API test failed:', testResponse.statusCode);
      return res.status(400).json({
        success: false,
        error: `API access test failed: ${testResponse.statusCode}`,
        details: {
          message: 'Login successful but unable to access purchase order data',
          response: testResponse.body
        }
      });
    }

    console.log('✅ Service Layer API test successful');

    res.json({
      success: true,
      message: 'SAP connection test successful',
      status: 'connected',
      testedAt: new Date().toISOString(),
      details: {
        serviceLayerUrl: 'https://59.152.52.58:50000/b1s/v1',
        companyDb: companyDb,
        username: username
      }
    });

  } catch (error: any) {
    console.error('❌ SAP connection test error:', error);
    res.status(500).json({
      success: false,
      error: 'Connection test failed',
      details: error.message
    });
  }
});

// Save SAP credentials to environment
router.post('/credentials', ensureAuthenticated, async (req, res) => {
  try {
    const { username, password, companyDb } = req.body;
    
    if (!username || !password || !companyDb) {
      return res.status(400).json({
        success: false,
        error: 'Username, password, and company database are required'
      });
    }

    // In a production environment, you would want to store these securely
    // For now, we'll update the process environment variables
    process.env.SAP_USERNAME = username;
    process.env.SAP_PASSWORD = password;
    process.env.SAP_COMPANY_DB = companyDb;

    console.log('🔐 SAP credentials updated:', {
      companyDb: companyDb,
      passwordSet: !!password
    });

    res.json({
      success: true,
      message: 'SAP credentials saved successfully',
      savedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error saving SAP credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save credentials',
      details: error.message
    });
  }
});

// Lightweight passive connection status — NO login, NO SAP session created.
// Called every 30 seconds by the SapIntegrationPage polling query.
// Reports whether credentials are configured and whether a cached session exists.
router.get('/connection/status', async (req, res) => {
  try {
    const sapUser = process.env.SAP_USERNAME || '';
    const sapPass = process.env.SAP_PASSWORD || '';
    const sapDb   = process.env.SAP_COMPANY_DB || '';

    if (!sapUser || !sapPass || !sapDb) {
      return res.json({
        success: true,
        status: 'disconnected',
        isConnected: false,
        error: `SAP credentials not configured — SAP_USERNAME=${!!sapUser}, SAP_PASSWORD=${!!sapPass}, SAP_COMPANY_DB=${sapDb || '(empty)'}`,
        details: { companyDb: sapDb, username: sapUser }
      });
    }

    // Check if any user has a valid cached SAP session
    const summary = sapSessionManager.getSessionsSummary();
    const hasActiveSession = summary.some(s => s.ttlSeconds > 0);

    res.json({
      success: true,
      status: hasActiveSession ? 'connected' : 'configured',
      isConnected: hasActiveSession,
      credentialsConfigured: true,
      activeSessions: summary.length,
      lastTestTime: new Date().toISOString(),
      details: {
        serviceLayerUrl: 'https://59.152.52.58:50000/b1s/v1',
        companyDb: sapDb,
        username: sapUser
      }
    });

  } catch (error: any) {
    console.error('❌ SAP status check error:', error);
    res.json({
      success: true,
      status: 'error',
      isConnected: false,
      error: error.message,
      lastTestTime: new Date().toISOString()
    });
  }
});

// Active connection ping — used by the "Test SAP B1 Connection" button.
// Reuses the shared SAP session (avoiding -1102 conflicts). Falls back to a
// fresh login only when no shared session exists, with automatic -1102 recovery.
router.post('/connection/ping', ensureAuthenticated, async (req, res) => {
  try {
    const sapUser = process.env.SAP_USERNAME || '';
    const sapPass = process.env.SAP_PASSWORD || '';
    const sapDb   = process.env.SAP_COMPANY_DB || '';

    if (!sapUser || !sapPass || !sapDb) {
      return res.json({
        success: false,
        status: 'disconnected',
        isConnected: false,
        error: `SAP credentials not configured — SAP_USERNAME=${!!sapUser}, SAP_PASSWORD=${!!sapPass}, SAP_COMPANY_DB=${sapDb || '(empty)'}`,
      });
    }

    console.log(`[SAP Ping] Testing connection → user=${sapUser} db=${sapDb}`);
    let isConnected = false;
    let connectionError: string | undefined;

    try {
      // Reuse the shared session — creates one (with -1102 force-logout retry) if none exists
      const { getSharedSapSession } = await import('../procurement-routes');
      const sessionCookie = await getSharedSapSession();

      // Verify the session is alive with a lightweight API call
      const testResp = await sapHttpsClient.authenticatedRequest(sessionCookie, {
        method: 'GET', url: '', path: '/b1s/v1/$metadata',
        timeout: 10000,
      });
      isConnected = testResp.statusCode < 500;
      console.log(`[SAP Ping] ✅ Connection OK — status=${testResp.statusCode}`);
    } catch (err: any) {
      connectionError = err.message;
      console.error(`[SAP Ping] ❌ Connection failed — db=${sapDb} user=${sapUser}: ${err.message}`);
    }

    res.json({
      success: isConnected,
      status: isConnected ? 'connected' : 'disconnected',
      isConnected,
      lastTestTime: new Date().toISOString(),
      error: connectionError,
      details: {
        serviceLayerUrl: 'https://59.152.52.58:50000/b1s/v1',
        companyDb: sapDb,
        username: sapUser
      }
    });

  } catch (error: any) {
    console.error('❌ SAP ping error:', error);
    res.json({
      success: false,
      status: 'error',
      isConnected: false,
      error: error.message,
      lastTestTime: new Date().toISOString()
    });
  }
});

router.get('/config', ensureAuthenticated, async (req, res) => {
  const companyDb = process.env.SAP_COMPANY_DB || '';
  console.log(`[SAP Config] Returning companyDb: ${companyDb}`);
  res.json({
    companyDb,
    serviceLayerUrl: process.env.SAP_SERVICE_LAYER_URL || 'https://59.152.52.58:50000/b1s/v1',
  });
});

export default router;