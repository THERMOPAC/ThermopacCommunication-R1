import { Router } from 'express';
import { ensureAuthenticated } from '../auth-middleware';
import { sapHttpsClient } from './sap-https-client';

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

// Get current SAP connection status
router.get('/connection/status', async (req, res) => {
  try {
    // Check if credentials are available
    const hasCredentials = !!(process.env.SAP_USERNAME && process.env.SAP_PASSWORD && process.env.SAP_COMPANY_DB);
    
    if (!hasCredentials) {
      return res.json({
        success: true,
        status: 'disconnected',
        isConnected: false,
        error: 'SAP credentials not configured'
      });
    }

    // Test the connection with current credentials using custom HTTPS client
    try {
      const { sessionId } = await sapHttpsClient.login(
        process.env.SAP_USERNAME!,
        process.env.SAP_PASSWORD!,
        process.env.SAP_COMPANY_DB!
      );
      var isConnected = true;
      var connectionError = undefined;
    } catch (error: any) {
      var isConnected = false;
      var connectionError = error.message;
    }
    
    res.json({
      success: true,
      status: isConnected ? 'connected' : 'disconnected',
      isConnected,
      lastTestTime: new Date().toISOString(),
      error: connectionError,
      details: {
        serviceLayerUrl: 'https://59.152.52.58:50000/b1s/v1',
        companyDb: process.env.SAP_COMPANY_DB,
        username: process.env.SAP_USERNAME
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

router.get('/config', ensureAuthenticated, async (req, res) => {
  const companyDb = process.env.SAP_COMPANY_DB || '';
  console.log(`[SAP Config] Returning companyDb: ${companyDb}`);
  res.json({
    companyDb,
    serviceLayerUrl: process.env.SAP_SERVICE_LAYER_URL || 'https://59.152.52.58:50000/b1s/v1',
  });
});

export default router;