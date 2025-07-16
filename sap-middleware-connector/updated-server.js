const express = require('express');
const cors = require('cors');
const sql = require('mssql');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// API Key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.REPLIT_API_KEY || '01c8cc8a576717e893a547b4e020f93a8aa5d1118f61a7d58a299b386746720e';
  
  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid API key' 
    });
  }
  next();
};

// SAP B1 Database Configuration
const sapConfig = {
  user: process.env.SAP_USERNAME || 'sa',
  password: process.env.SAP_PASSWORD || 'B1Admin',
  server: process.env.SAP_SERVER || '192.168.1.100',
  database: process.env.SAP_DATABASE || 'SBO-COMMON',
  port: parseInt(process.env.SAP_PORT) || 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 30000,
    connectionTimeout: 30000
  }
};

let sapPool = null;

// Initialize SAP connection
async function initializeSAPConnection() {
  try {
    console.log('🔗 Initializing SAP B1 connection...');
    console.log(`📡 Connecting to: ${sapConfig.server}:${sapConfig.port}`);
    console.log(`🗄️  Database: ${sapConfig.database}`);
    
    sapPool = await sql.connect(sapConfig);
    console.log('✅ SAP B1 connection established successfully');
    return true;
  } catch (error) {
    console.error('❌ SAP B1 connection failed:', error.message);
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    middleware: 'SAP B1 Middleware Connector',
    version: '1.0.0'
  });
});

// SAP connection status endpoint
app.get('/sap/status', authenticateApiKey, async (req, res) => {
  try {
    if (!sapPool) {
      return res.json({
        success: false,
        connected: false,
        message: 'SAP connection not initialized'
      });
    }

    // Test query to check connection
    const result = await sapPool.request().query('SELECT 1 as test');
    
    res.json({
      success: true,
      connected: true,
      server: sapConfig.server,
      database: sapConfig.database,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      success: false,
      connected: false,
      message: error.message
    });
  }
});

// Purchase Orders endpoint
app.get('/sap/purchase-orders', authenticateApiKey, async (req, res) => {
  try {
    if (!sapPool) {
      return res.status(500).json({
        success: false,
        message: 'SAP connection not available'
      });
    }

    const query = `
      SELECT TOP 10
        DocEntry,
        DocNum,
        CardCode,
        CardName,
        DocDate,
        DocStatus,
        DocTotal,
        Comments
      FROM OPOR
      ORDER BY DocDate DESC
    `;

    const result = await sapPool.request().query(query);
    
    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Vendors endpoint
app.get('/sap/vendors', authenticateApiKey, async (req, res) => {
  try {
    if (!sapPool) {
      return res.status(500).json({
        success: false,
        message: 'SAP connection not available'
      });
    }

    const query = `
      SELECT TOP 10
        CardCode,
        CardName,
        CardType,
        Phone1,
        E_Mail,
        Balance
      FROM OCRD
      WHERE CardType = 'S'
      ORDER BY CardName
    `;

    const result = await sapPool.request().query(query);
    
    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Middleware error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start server
async function startServer() {
  try {
    // Initialize SAP connection
    await initializeSAPConnection();
    
    // Start Express server on all interfaces for network access
    app.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 SAP B1 Middleware Connector started successfully');
      console.log(`📡 Server running on port ${PORT} (all interfaces)`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🌐 Network access: http://192.168.1.48:${PORT}/health`);
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