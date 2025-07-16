const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const sapConnector = require('./sap-connector');
const replitSync = require('./sync-service');

const app = express();
const PORT = process.env.MIDDLEWARE_PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json());

// Security middleware
const authenticateRequest = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized - Invalid API key' 
    });
  }
  
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'SAP B1 Middleware Connector Running',
    timestamp: new Date().toISOString(),
    sapConnection: sapConnector.isConnected(),
    replitUrl: process.env.REPLIT_APP_URL
  });
});

// SAP B1 Connection Status
app.get('/sap/status', authenticateRequest, async (req, res) => {
  try {
    const status = await sapConnector.testConnection();
    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('SAP Connection Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'SAP connection failed',
      details: error.message
    });
  }
});

// SAP B1 Data Endpoints
app.get('/sap/purchase-orders', authenticateRequest, async (req, res) => {
  try {
    const { page = 1, limit = 50, project, status } = req.query;
    const purchaseOrders = await sapConnector.getPurchaseOrders({ page, limit, project, status });
    
    res.json({
      success: true,
      data: purchaseOrders.data,
      pagination: purchaseOrders.pagination,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Purchase Orders Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchase orders',
      details: error.message
    });
  }
});

app.get('/sap/purchase-order-items', authenticateRequest, async (req, res) => {
  try {
    const { purchaseOrderId } = req.query;
    const items = await sapConnector.getPurchaseOrderItems(purchaseOrderId);
    
    res.json({
      success: true,
      data: items,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Purchase Order Items Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchase order items',
      details: error.message
    });
  }
});

app.get('/sap/vendors', authenticateRequest, async (req, res) => {
  try {
    const vendors = await sapConnector.getVendors();
    
    res.json({
      success: true,
      data: vendors,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Vendors Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vendors',
      details: error.message
    });
  }
});

// Manual sync endpoints
app.post('/sync/purchase-orders', authenticateRequest, async (req, res) => {
  try {
    console.log('Manual sync: Purchase Orders requested');
    const result = await replitSync.syncPurchaseOrders();
    
    res.json({
      success: true,
      message: 'Purchase orders sync completed',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Manual Purchase Orders Sync Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Purchase orders sync failed',
      details: error.message
    });
  }
});

app.post('/sync/vendors', authenticateRequest, async (req, res) => {
  try {
    console.log('Manual sync: Vendors requested');
    const result = await replitSync.syncVendors();
    
    res.json({
      success: true,
      message: 'Vendors sync completed',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Manual Vendors Sync Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Vendors sync failed',
      details: error.message
    });
  }
});

app.post('/sync/all', authenticateRequest, async (req, res) => {
  try {
    console.log('Manual sync: All data requested');
    const results = await replitSync.syncAllData();
    
    res.json({
      success: true,
      message: 'Complete data sync completed',
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Manual Complete Sync Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Complete data sync failed',
      details: error.message
    });
  }
});

// Initialize scheduled sync
const initializeScheduledSync = () => {
  const syncInterval = process.env.SYNC_INTERVAL_MINUTES || 15;
  
  // Schedule sync every X minutes
  cron.schedule(`*/${syncInterval} * * * *`, async () => {
    try {
      console.log(`Scheduled sync started - ${new Date().toISOString()}`);
      await replitSync.syncAllData();
      console.log(`Scheduled sync completed - ${new Date().toISOString()}`);
    } catch (error) {
      console.error('Scheduled sync error:', error.message);
    }
  });
  
  console.log(`Scheduled sync initialized: Every ${syncInterval} minutes`);
};

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Start server
const startServer = async () => {
  try {
    // Test SAP connection on startup
    console.log('Testing SAP B1 connection...');
    await sapConnector.testConnection();
    console.log('✅ SAP B1 connection successful');
    
    // Initialize scheduled sync
    initializeScheduledSync();
    
    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 SAP B1 Middleware Connector running on port ${PORT}`);
      console.log(`📡 Replit App URL: ${process.env.REPLIT_APP_URL}`);
      console.log(`🔄 Sync Interval: ${process.env.SYNC_INTERVAL_MINUTES || 15} minutes`);
      console.log(`📊 SAP Server: ${process.env.SAP_SERVER}`);
      console.log(`🗄️  SAP Database: ${process.env.SAP_DATABASE}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start middleware connector:', error.message);
    console.error('Please check your SAP B1 connection settings in .env file');
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down SAP B1 Middleware Connector...');
  await sapConnector.closeConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down SAP B1 Middleware Connector...');
  await sapConnector.closeConnection();
  process.exit(0);
});

startServer();