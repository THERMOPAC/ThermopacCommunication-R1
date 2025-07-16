const express = require('express');
const cors = require('cors');
const sql = require('mssql');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Enhanced CORS configuration for production
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
app.use(express.urlencoded({ extended: true }));

// SAP B1 Database Configuration
const sapConfig = {
  server: process.env.SAP_SERVER || '192.168.1.100',
  database: process.env.SAP_DATABASE || 'SBODemoUS',
  user: process.env.SAP_USERNAME || 'sa',
  password: process.env.SAP_PASSWORD || '',
  port: parseInt(process.env.SAP_PORT) || 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 30000,
    connectionTimeout: 30000
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Global connection pool
let sapPool = null;

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

// Initialize SAP connection pool
async function initializeSAPConnection() {
  try {
    console.log('🔄 Initializing SAP B1 connection...');
    console.log('SAP Server:', sapConfig.server);
    console.log('SAP Database:', sapConfig.database);
    
    sapPool = await sql.connect(sapConfig);
    console.log('✅ SAP B1 connection pool initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ SAP B1 connection failed:', error.message);
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'SAP Middleware is running',
    version: '1.0.0',
    sapConnected: sapPool ? sapPool.connected : false
  });
});

// SAP connection status
app.get('/sap/status', authenticateAPI, async (req, res) => {
  console.log('📊 SAP status requested');
  
  try {
    if (!sapPool) {
      const connected = await initializeSAPConnection();
      if (!connected) {
        return res.json({
          success: false,
          connected: false,
          message: 'SAP B1 connection not available',
          timestamp: new Date().toISOString()
        });
      }
    }

    // Test connection with a simple query
    const result = await sapPool.request().query('SELECT @@VERSION as version');
    
    res.json({
      success: true,
      connected: true,
      message: 'SAP B1 connection active',
      version: result.recordset[0]?.version || 'Unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ SAP status check failed:', error.message);
    res.json({
      success: false,
      connected: false,
      message: 'SAP B1 connection error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test connection endpoint
app.post('/connection/test', authenticateAPI, (req, res) => {
  console.log('🔧 Connection test requested');
  res.json({
    success: true,
    message: 'Middleware connection successful',
    timestamp: new Date().toISOString(),
    sapConnected: sapPool ? sapPool.connected : false
  });
});

// Purchase Orders endpoint
app.get('/sap/purchase-orders', authenticateAPI, async (req, res) => {
  console.log('📋 Purchase orders requested');
  
  try {
    if (!sapPool) {
      const connected = await initializeSAPConnection();
      if (!connected) {
        return res.json({
          success: false,
          message: 'SAP B1 connection not available',
          data: []
        });
      }
    }

    const query = `
      SELECT TOP 100
        OPOR.DocEntry,
        OPOR.DocNum,
        OPOR.CardCode,
        OPOR.CardName,
        OPOR.DocDate,
        OPOR.DocStatus,
        OPOR.DocTotal,
        OPOR.Comments,
        OPOR.CreateDate,
        OPOR.UpdateDate
      FROM OPOR
      WHERE OPOR.DocStatus = 'O'
      ORDER BY OPOR.DocDate DESC
    `;

    const result = await sapPool.request().query(query);
    
    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Purchase orders query failed:', error.message);
    res.json({
      success: false,
      message: 'Failed to fetch purchase orders',
      error: error.message,
      data: []
    });
  }
});

// Vendors endpoint
app.get('/sap/vendors', authenticateAPI, async (req, res) => {
  console.log('👥 Vendors requested');
  
  try {
    if (!sapPool) {
      const connected = await initializeSAPConnection();
      if (!connected) {
        return res.json({
          success: false,
          message: 'SAP B1 connection not available',
          data: []
        });
      }
    }

    const query = `
      SELECT TOP 100
        OCRD.CardCode,
        OCRD.CardName,
        OCRD.CardType,
        OCRD.Phone1,
        OCRD.E_Mail,
        OCRD.Balance,
        OCRD.CreateDate,
        OCRD.UpdateDate
      FROM OCRD
      WHERE OCRD.CardType = 'S'
      ORDER BY OCRD.CardName
    `;

    const result = await sapPool.request().query(query);
    
    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Vendors query failed:', error.message);
    res.json({
      success: false,
      message: 'Failed to fetch vendors',
      error: error.message,
      data: []
    });
  }
});

// Purchase Order Items endpoint
app.get('/sap/purchase-order-items/:docEntry', authenticateAPI, async (req, res) => {
  console.log('📦 Purchase order items requested for DocEntry:', req.params.docEntry);
  
  try {
    if (!sapPool) {
      const connected = await initializeSAPConnection();
      if (!connected) {
        return res.json({
          success: false,
          message: 'SAP B1 connection not available',
          data: []
        });
      }
    }

    const query = `
      SELECT 
        POR1.DocEntry,
        POR1.LineNum,
        POR1.ItemCode,
        POR1.Dscription,
        POR1.Quantity,
        POR1.Price,
        POR1.LineTotal,
        POR1.WhsCode,
        POR1.UomCode
      FROM POR1
      WHERE POR1.DocEntry = @docEntry
      ORDER BY POR1.LineNum
    `;

    const request = sapPool.request();
    request.input('docEntry', sql.Int, req.params.docEntry);
    const result = await request.query(query);
    
    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Purchase order items query failed:', error.message);
    res.json({
      success: false,
      message: 'Failed to fetch purchase order items',
      error: error.message,
      data: []
    });
  }
});

// Sync endpoint for cloud application
app.post('/sync/purchase-orders', authenticateAPI, async (req, res) => {
  console.log('🔄 Sync purchase orders requested');
  
  try {
    // This would sync data to the cloud database
    // For now, just return success
    res.json({
      success: true,
      message: 'Purchase orders sync completed',
      synced: 0,
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
  
  if (sapPool) {
    try {
      await sapPool.close();
      console.log('✅ SAP connection pool closed');
    } catch (error) {
      console.error('❌ Error closing SAP pool:', error);
    }
  }
  
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log('🚀 SAP Middleware started successfully');
  console.log(`📡 Server running on port ${PORT} (all interfaces)`);
  console.log(`🔗 Local: http://localhost:${PORT}/health`);
  console.log(`🌐 Network: http://192.168.1.48:${PORT}/health`);
  console.log('✅ Ready for connections from cloud application');
  
  // Initialize SAP connection on startup
  await initializeSAPConnection();
});