const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Enable CORS for all origins
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

app.use(express.json());

// API Key validation
const API_KEY = '01c8cc8a576717e893a547b4e020f93a8aa5d1118f61a7d58a299b386746720e';

const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ success: false, message: 'Invalid API key' });
  }
  next();
};

// Basic health check - no auth required
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'SAP Middleware is running'
  });
});

// SAP status endpoint
app.get('/sap/status', validateApiKey, (req, res) => {
  console.log('SAP status requested');
  res.json({
    success: true,
    connected: false,
    message: 'SAP B1 middleware running, but SAP connection not configured',
    timestamp: new Date().toISOString()
  });
});

// Test connection endpoint
app.post('/connection/test', validateApiKey, (req, res) => {
  console.log('Connection test requested');
  res.json({
    success: true,
    message: 'Middleware connection successful',
    timestamp: new Date().toISOString()
  });
});

// Purchase orders endpoint
app.get('/sap/purchase-orders', validateApiKey, (req, res) => {
  console.log('Purchase orders requested');
  res.json({
    success: true,
    data: [
      {
        DocEntry: 1,
        DocNum: 'PO-001',
        CardCode: 'V001',
        CardName: 'Test Vendor',
        DocDate: '2025-07-16',
        DocStatus: 'Open',
        DocTotal: 10000,
        Comments: 'Test purchase order'
      }
    ],
    count: 1
  });
});

// Vendors endpoint
app.get('/sap/vendors', validateApiKey, (req, res) => {
  console.log('Vendors requested');
  res.json({
    success: true,
    data: [
      {
        CardCode: 'V001',
        CardName: 'Test Vendor',
        CardType: 'S',
        Phone1: '123-456-7890',
        E_Mail: 'vendor@example.com',
        Balance: 5000
      }
    ],
    count: 1
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start server on all interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 SAP Middleware started successfully');
  console.log(`📡 Server running on port ${PORT} (all interfaces)`);
  console.log(`🔗 Local: http://localhost:${PORT}/health`);
  console.log(`🌐 Network: http://192.168.1.48:${PORT}/health`);
  console.log('✅ Ready for connections from cloud application');
});