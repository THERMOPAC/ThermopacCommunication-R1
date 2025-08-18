import { Router } from 'express';
import { ensureAuthenticated } from '../auth-middleware';

const router = Router();

// Apply authentication to credential management endpoints
router.use(ensureAuthenticated);

// Test SAP connection with provided credentials
router.post('/connection/test', async (req, res) => {
  try {
    const { username, password, companyDb } = req.body;
    
    if (!username || !password || !companyDb) {
      return res.status(400).json({
        success: false,
        error: 'Username, password, and company database are required'
      });
    }

    // Use the working public IP Service Layer connection
    const publicIP = '59.152.52.58';
    const serviceLayerPort = '50000';
    const baseURL = `https://${publicIP}:${serviceLayerPort}/b1s/v1`;
    
    // Create HTTPS agent to bypass SSL certificate verification
    const https = await import('https');
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });

    console.log('🔥 SAP CONNECTION TEST STARTED - Testing Service Layer');
    console.log('🔑 SAP Credentials Check:', {
      serviceLayerUrl: baseURL,
      sapUsername: username,
      passwordLength: password.length,
      sapCompanyDb: companyDb
    });

    console.log('🔐 Attempting HTTPS connection with SSL bypass...');
    console.log('🎯 Target URL:', `${baseURL}/Login`);

    // Test login to Service Layer
    const loginResponse = await fetch(`${baseURL}/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        CompanyDB: companyDb,
        UserName: username,
        Password: password
      }),
      signal: AbortSignal.timeout(30000),
      // @ts-ignore
      agent: httpsAgent
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      console.log('❌ SAP login failed:', loginResponse.status, errorText);
      
      return res.status(400).json({
        success: false,
        error: `SAP login failed: ${loginResponse.status} - ${errorText}`,
        details: {
          status: loginResponse.status,
          response: errorText
        }
      });
    }

    const sessionId = loginResponse.headers.get('set-cookie')?.match(/B1SESSION=([^;]+)/)?.[1];
    if (!sessionId) {
      console.log('❌ No session ID received');
      return res.status(400).json({
        success: false,
        error: 'No session ID received from SAP Service Layer'
      });
    }

    console.log('✅ HTTPS SSL bypass successful - Service Layer login working');

    // Test a simple API call to verify permissions
    const testResponse = await fetch(`${baseURL}/PurchaseOrders?$top=1`, {
      headers: {
        'Cookie': `B1SESSION=${sessionId}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(15000),
      // @ts-ignore
      agent: httpsAgent
    });

    if (!testResponse.ok) {
      console.log('❌ Purchase Orders API test failed:', testResponse.status);
      return res.status(400).json({
        success: false,
        error: `API access test failed: ${testResponse.status}`,
        details: {
          message: 'Login successful but unable to access purchase order data'
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
        serviceLayerUrl: baseURL,
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
router.post('/credentials', async (req, res) => {
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
      username: username,
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

    // Test the connection with current credentials
    const publicIP = '59.152.52.58';
    const serviceLayerPort = '50000';
    const baseURL = `https://${publicIP}:${serviceLayerPort}/b1s/v1`;
    
    const https = await import('https');
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });

    const loginResponse = await fetch(`${baseURL}/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        CompanyDB: process.env.SAP_COMPANY_DB,
        UserName: process.env.SAP_USERNAME,
        Password: process.env.SAP_PASSWORD
      }),
      signal: AbortSignal.timeout(15000),
      // @ts-ignore
      agent: httpsAgent
    });

    const isConnected = loginResponse.ok;
    
    res.json({
      success: true,
      status: isConnected ? 'connected' : 'disconnected',
      isConnected,
      lastTestTime: new Date().toISOString(),
      error: isConnected ? undefined : `Login failed: ${loginResponse.status}`,
      details: {
        serviceLayerUrl: baseURL,
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

export default router;