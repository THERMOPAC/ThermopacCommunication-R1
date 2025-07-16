const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Enhanced CORS configuration
app.use(cors({
  origin: [
    'http://localhost:5000',
    'https://thermopac-communication-thermopacllp.replit.app',
    /^https:\/\/.*\.ngrok\.io$/,
    /^https:\/\/.*\.loca\.lt$/,
    /^https:\/\/.*\.localtunnel\.me$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

app.use(express.json({ limit: '50mb' }));

// SAP B1 Service Layer Configuration
const sapConfig = {
  baseUrl: process.env.SAP_SERVICE_LAYER_URL || 'https://192.168.1.100:50000/b1s/v1',
  username: process.env.SAP_USERNAME || 'manager',
  password: process.env.SAP_PASSWORD || '',
  companyDB: process.env.SAP_COMPANY_DB || 'SBODemoUS'
};

// Global session variables
let sessionId = null;
let sessionTimeout = null;

// Create axios instance with custom HTTPS agent (for self-signed certificates)
const sapClient = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false // Accept self-signed certificates
  }),
  timeout: 30000
});

// API Authentication Middleware
const authenticateAPI = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
  const validKeys = [
    process.env.REPLIT_API_KEY,
    process.env.API_SECRET_KEY,
    '01c8cc8a576717e893a547b4e020f93a8aa5d1118f61a7d58a299b386746720e',
    '732550167ebcc2cd051d57fc453aed6adaabc70918649c62661118a067f783db'
  ].filter(Boolean);

  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or missing API key',
      timestamp: new Date().toISOString()
    });
  }

  next();
};

// SAP B1 Service Layer Authentication
async function authenticateSAP() {
  try {
    console.log('🔐 Authenticating with SAP B1 Service Layer...');
    console.log('Service Layer URL:', sapConfig.baseUrl);
    console.log('Company DB:', sapConfig.companyDB);
    
    const response = await sapClient.post(`${sapConfig.baseUrl}/Login`, {
      CompanyDB: sapConfig.companyDB,
      UserName: sapConfig.username,
      Password: sapConfig.password
    });

    if (response.data && response.headers['set-cookie']) {
      // Extract session ID from cookies
      const cookies = response.headers['set-cookie'];
      const sessionCookie = cookies.find(cookie => cookie.startsWith('B1SESSION='));
      
      if (sessionCookie) {
        sessionId = sessionCookie.split(';')[0];
        console.log('✅ SAP B1 authentication successful');
        
        // Set session timeout (default 30 minutes)
        sessionTimeout = setTimeout(() => {
          console.log('🔄 SAP session expired, clearing session');
          sessionId = null;
        }, 25 * 60 * 1000); // 25 minutes
        
        return true;
      }
    }
    
    throw new Error('No session cookie received');
  } catch (error) {
    console.error('❌ SAP B1 authentication failed:', error.message);
    sessionId = null;
    return false;
  }
}

// Ensure valid SAP session
async function ensureSAPSession() {
  if (!sessionId) {
    return await authenticateSAP();
  }
  return true;
}

// Make authenticated request to SAP Service Layer
async function sapRequest(method, endpoint, data = null) {
  const hasSession = await ensureSAPSession();
  if (!hasSession) {
    throw new Error('SAP authentication failed');
  }

  const config = {
    method,
    url: `${sapConfig.baseUrl}/${endpoint}`,
    headers: {
      'Cookie': sessionId,
      'Content-Type': 'application/json'
    }
  };

  if (data) {
    config.data = data;
  }

  const response = await sapClient(config);
  return response.data;
}

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'SAP B1 Service Layer Middleware is running',
    version: '2.0.0',
    serviceLayer: sapConfig.baseUrl,
    sessionActive: !!sessionId
  });
});

// SAP connection status
app.get('/sap/status', authenticateAPI, async (req, res) => {
  console.log('📊 SAP Service Layer status requested');
  
  try {
    const hasSession = await ensureSAPSession();
    
    if (hasSession) {
      // Test with a simple query
      const companies = await sapRequest('GET', 'CompanyService_GetCompanyList');
      
      res.json({
        success: true,
        connected: true,
        message: 'SAP B1 Service Layer connection active',
        serviceLayer: sapConfig.baseUrl,
        companyDB: sapConfig.companyDB,
        companiesCount: companies.value ? companies.value.length : 0,
        sessionActive: true,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: false,
        connected: false,
        message: 'SAP B1 Service Layer authentication failed',
        serviceLayer: sapConfig.baseUrl,
        sessionActive: false,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ SAP Service Layer status check failed:', error.message);
    res.json({
      success: false,
      connected: false,
      message: 'SAP B1 Service Layer connection error',
      error: error.message,
      serviceLayer: sapConfig.baseUrl,
      sessionActive: false,
      timestamp: new Date().toISOString()
    });
  }
});

// Test connection endpoint
app.post('/connection/test', authenticateAPI, async (req, res) => {
  console.log('🔧 Service Layer connection test requested');
  
  try {
    const hasSession = await ensureSAPSession();
    
    if (hasSession) {
      // Test with CompanyService
      const result = await sapRequest('GET', 'CompanyService_GetCompanyList');
      
      res.json({
        success: true,
        message: 'SAP B1 Service Layer connection test successful',
        serviceLayer: sapConfig.baseUrl,
        testResult: result,
        sessionActive: true,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: false,
        message: 'SAP B1 Service Layer authentication failed',
        serviceLayer: sapConfig.baseUrl,
        sessionActive: false,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Service Layer connection test failed:', error.message);
    res.json({
      success: false,
      message: 'SAP B1 Service Layer test failed',
      error: error.message,
      serviceLayer: sapConfig.baseUrl,
      sessionActive: false,
      timestamp: new Date().toISOString()
    });
  }
});

// Purchase Orders endpoint via Service Layer
app.get('/sap/purchase-orders', authenticateAPI, async (req, res) => {
  console.log('📋 Purchase orders requested via Service Layer');
  
  try {
    const { $top = 100, $skip = 0, $filter = '' } = req.query;
    
    let endpoint = `PurchaseOrders?$top=${$top}&$skip=${$skip}`;
    if ($filter) {
      endpoint += `&$filter=${$filter}`;
    }
    
    const result = await sapRequest('GET', endpoint);
    
    res.json({
      success: true,
      data: result.value || [],
      count: result.value ? result.value.length : 0,
      nextLink: result['@odata.nextLink'] || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Purchase orders query failed:', error.message);
    res.json({
      success: false,
      message: 'Failed to fetch purchase orders from Service Layer',
      error: error.message,
      data: []
    });
  }
});

// Business Partners (Vendors) endpoint via Service Layer
app.get('/sap/vendors', authenticateAPI, async (req, res) => {
  console.log('👥 Vendors requested via Service Layer');
  
  try {
    const { $top = 100, $skip = 0 } = req.query;
    
    // Filter for vendors (CardType = 'cSupplier')
    const endpoint = `BusinessPartners?$top=${$top}&$skip=${$skip}&$filter=CardType eq 'cSupplier'`;
    
    const result = await sapRequest('GET', endpoint);
    
    res.json({
      success: true,
      data: result.value || [],
      count: result.value ? result.value.length : 0,
      nextLink: result['@odata.nextLink'] || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Vendors query failed:', error.message);
    res.json({
      success: false,
      message: 'Failed to fetch vendors from Service Layer',
      error: error.message,
      data: []
    });
  }
});

// Purchase Order Lines endpoint
app.get('/sap/purchase-order-lines/:docEntry', authenticateAPI, async (req, res) => {
  console.log('📦 Purchase order lines requested for DocEntry:', req.params.docEntry);
  
  try {
    const endpoint = `PurchaseOrders(${req.params.docEntry})/DocumentLines`;
    
    const result = await sapRequest('GET', endpoint);
    
    res.json({
      success: true,
      data: result.value || [],
      count: result.value ? result.value.length : 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Purchase order lines query failed:', error.message);
    res.json({
      success: false,
      message: 'Failed to fetch purchase order lines from Service Layer',
      error: error.message,
      data: []
    });
  }
});

// Items endpoint via Service Layer
app.get('/sap/items', authenticateAPI, async (req, res) => {
  console.log('🏷️ Items requested via Service Layer');
  
  try {
    const { $top = 100, $skip = 0, $filter = '' } = req.query;
    
    let endpoint = `Items?$top=${$top}&$skip=${$skip}`;
    if ($filter) {
      endpoint += `&$filter=${$filter}`;
    }
    
    const result = await sapRequest('GET', endpoint);
    
    res.json({
      success: true,
      data: result.value || [],
      count: result.value ? result.value.length : 0,
      nextLink: result['@odata.nextLink'] || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Items query failed:', error.message);
    res.json({
      success: false,
      message: 'Failed to fetch items from Service Layer',
      error: error.message,
      data: []
    });
  }
});

// Sync endpoint for cloud application
app.post('/sync/purchase-orders', authenticateAPI, async (req, res) => {
  console.log('🔄 Sync purchase orders requested');
  
  try {
    // Fetch recent purchase orders
    const endpoint = `PurchaseOrders?$top=50&$orderby=DocDate desc`;
    const result = await sapRequest('GET', endpoint);
    
    res.json({
      success: true,
      message: 'Purchase orders sync completed via Service Layer',
      synced: result.value ? result.value.length : 0,
      data: result.value || [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    res.json({
      success: false,
      message: 'Sync failed',
      error: error.message
    });
  }
});

// Logout endpoint
app.post('/sap/logout', authenticateAPI, async (req, res) => {
  console.log('🚪 SAP logout requested');
  
  try {
    if (sessionId) {
      await sapClient.post(`${sapConfig.baseUrl}/Logout`, {}, {
        headers: {
          'Cookie': sessionId
        }
      });
      
      sessionId = null;
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
        sessionTimeout = null;
      }
    }
    
    res.json({
      success: true,
      message: 'SAP session logged out successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Logout failed:', error.message);
    res.json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('💥 Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: error.message
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  
  if (sessionId) {
    try {
      await sapClient.post(`${sapConfig.baseUrl}/Logout`, {}, {
        headers: {
          'Cookie': sessionId
        }
      });
      console.log('✅ SAP session logged out');
    } catch (error) {
      console.error('❌ Error logging out:', error.message);
    }
  }
  
  if (sessionTimeout) {
    clearTimeout(sessionTimeout);
  }
  
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 SAP B1 Service Layer Middleware started successfully');
  console.log(`📡 Server running on port ${PORT} (all interfaces)`);
  console.log(`🔗 Local: http://localhost:${PORT}/health`);
  console.log(`🌐 Network: http://192.168.1.48:${PORT}/health`);
  console.log(`🔧 Service Layer: ${sapConfig.baseUrl}`);
  console.log(`🏢 Company DB: ${sapConfig.companyDB}`);
  console.log('✅ Ready for Service Layer connections');
});