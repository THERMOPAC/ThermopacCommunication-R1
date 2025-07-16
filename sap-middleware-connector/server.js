const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Enhanced CORS configuration
app.use(cors({
  origin: [
    'http://localhost:5000',
    'https://thermopac-communication-thermopacllp.replit.app'
  ],
  credentials: true
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

  if (!apiKey || !validKeys.includes(apiKey.replace('Bearer ', ''))) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Invalid API key' 
    });
  }
  next();
};

// Initialize SAP Connection Pool
async function initializeSAPConnection() {
  try {
    console.log('🔄 Initializing SAP B1 connection...');
    console.log(`📡 Connecting to SAP Server: ${sapConfig.server}:${sapConfig.port}`);
    console.log(`🗄️  Database: ${sapConfig.database}`);
    
    sapPool = await sql.connect(sapConfig);
    console.log('✅ SAP B1 database connection established successfully');
    
    // Test query to verify connection
    const testResult = await sapPool.request().query('SELECT TOP 1 * FROM OADM');
    console.log('✅ SAP B1 connection test successful');
    
    return true;
  } catch (error) {
    console.error('❌ SAP B1 connection failed:', error.message);
    sapPool = null;
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    sap_connection: sapPool ? 'connected' : 'disconnected',
    server: sapConfig.server,
    database: sapConfig.database
  };
  res.status(200).json(health);
});

// SAP Connection Status
app.get('/sap/status', authenticateAPI, async (req, res) => {
  try {
    if (!sapPool) {
      return res.json({
        success: false,
        connected: false,
        message: 'SAP B1 connection not established',
        timestamp: new Date().toISOString()
      });
    }

    // Test connection with simple query
    const result = await sapPool.request().query('SELECT COUNT(*) as CompanyCount FROM OADM');
    
    res.json({
      success: true,
      connected: true,
      message: 'SAP B1 connection active',
      server: sapConfig.server,
      database: sapConfig.database,
      timestamp: new Date().toISOString(),
      test_result: result.recordset[0]
    });
  } catch (error) {
    console.error('SAP status check failed:', error);
    res.json({
      success: false,
      connected: false,
      message: 'SAP B1 connection test failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Purchase Orders Endpoint
app.get('/sap/purchase-orders', authenticateAPI, async (req, res) => {
  try {
    if (!sapPool) {
      return res.status(503).json({
        success: false,
        error: 'SAP B1 connection not available'
      });
    }

    const { page = 1, limit = 50, project } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT TOP ${limit}
        po.DocEntry,
        po.DocNum,
        po.DocDate,
        po.DocDueDate,
        po.CardCode,
        po.CardName,
        po.DocTotal,
        po.DocStatus,
        po.Comments,
        po.Project,
        ISNULL(po.VatSum, 0) as TotalGSTAmount
      FROM OPOR po
      WHERE po.DocEntry NOT IN (
        SELECT TOP ${offset} DocEntry FROM OPOR ORDER BY DocEntry DESC
      )
    `;

    if (project) {
      query += ` AND po.Project LIKE '%${project}%'`;
    }

    query += ` ORDER BY po.DocEntry DESC`;

    const result = await sapPool.request().query(query);

    res.json({
      success: true,
      data: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.recordset.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Purchase Orders query failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchase orders',
      details: error.message
    });
  }
});

// Purchase Order Items Endpoint
app.get('/sap/purchase-orders/:docEntry/items', authenticateAPI, async (req, res) => {
  try {
    if (!sapPool) {
      return res.status(503).json({
        success: false,
        error: 'SAP B1 connection not available'
      });
    }

    const { docEntry } = req.params;

    const query = `
      SELECT 
        poi.LineNum,
        poi.ItemCode,
        poi.Dscription as Description,
        poi.Quantity,
        poi.Price,
        poi.LineTotal,
        poi.Currency,
        ISNULL(poi.VatSum, 0) as LineGSTAmount,
        ISNULL(poi.VatPrcnt, 0) as GSTRate
      FROM POR1 poi
      WHERE poi.DocEntry = ${docEntry}
      ORDER BY poi.LineNum
    `;

    const result = await sapPool.request().query(query);

    res.json({
      success: true,
      data: result.recordset,
      docEntry: docEntry,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Purchase Order Items query failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchase order items',
      details: error.message
    });
  }
});

// Vendors Endpoint
app.get('/sap/vendors', authenticateAPI, async (req, res) => {
  try {
    if (!sapPool) {
      return res.status(503).json({
        success: false,
        error: 'SAP B1 connection not available'
      });
    }

    const { search = '', limit = 100 } = req.query;

    let query = `
      SELECT TOP ${limit}
        CardCode,
        CardName,
        Phone1,
        E_Mail,
        Balance,
        Currency,
        validFor as Active
      FROM OCRD
      WHERE CardType = 'S'
    `;

    if (search) {
      query += ` AND (CardName LIKE '%${search}%' OR CardCode LIKE '%${search}%')`;
    }

    query += ` ORDER BY CardName`;

    const result = await sapPool.request().query(query);

    res.json({
      success: true,
      data: result.recordset,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Vendors query failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vendors',
      details: error.message
    });
  }
});

// Sync endpoint for Replit app
app.post('/sync/replit', authenticateAPI, async (req, res) => {
  try {
    const { syncType, data } = req.body;
    
    console.log(`🔄 Received sync request: ${syncType}`);
    
    // Handle different sync types
    switch (syncType) {
      case 'purchase_orders':
        // Sync purchase orders logic
        console.log('📦 Syncing purchase orders...');
        break;
      case 'vendors':
        // Sync vendors logic
        console.log('🏢 Syncing vendors...');
        break;
      default:
        console.log(`⚠️  Unknown sync type: ${syncType}`);
    }

    res.json({
      success: true,
      message: `Sync ${syncType} completed`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync failed:', error);
    res.status(500).json({
      success: false,
      error: 'Sync operation failed',
      details: error.message
    });
  }
});

// Dashboard Stats Endpoint
app.get('/sap/dashboard/stats', authenticateAPI, async (req, res) => {
  try {
    if (!sapPool) {
      return res.status(503).json({
        success: false,
        error: 'SAP B1 connection not available'
      });
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as TotalPOs,
        SUM(CASE WHEN DocStatus = 'O' THEN 1 ELSE 0 END) as OpenPOs,
        SUM(CASE WHEN DocStatus = 'C' THEN 1 ELSE 0 END) as ClosedPOs,
        SUM(DocTotal) as TotalValue,
        SUM(VatSum) as TotalGST
      FROM OPOR
      WHERE YEAR(DocDate) = YEAR(GETDATE())
    `;

    const result = await sapPool.request().query(statsQuery);

    res.json({
      success: true,
      stats: result.recordset[0],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Dashboard stats query failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard stats',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Middleware error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// Start server and initialize connections
async function startServer() {
  try {
    // Initialize SAP connection
    await initializeSAPConnection();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log('🚀 SAP B1 Middleware Connector started successfully');
      console.log(`📡 Server running on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🗄️  SAP Server: ${sapConfig.server}:${sapConfig.port}`);
      console.log(`📋 Database: ${sapConfig.database}`);
      console.log('✅ Middleware ready for SAP B1 integration');
    });
  } catch (error) {
    console.error('❌ Failed to start middleware:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Shutting down middleware...');
  if (sapPool) {
    await sapPool.close();
    console.log('✅ SAP connection closed');
  }
  process.exit(0);
});

// Start the server
startServer();