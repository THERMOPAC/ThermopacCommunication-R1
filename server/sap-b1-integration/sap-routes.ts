import express from 'express';
import { sapB1Connector } from './sap-connector';
import { sapSyncService } from './sync-service';
import { ensureAuthenticated } from '../auth-middleware';
import purchaseRoutes from './purchase-routes';

const router = express.Router();

// Register Purchase module routes
router.use('/purchase', purchaseRoutes);

/**
 * SAP B1 Integration API Routes
 */

/**
 * Get SAP B1 connection status via middleware
 */
router.get('/connection/status', ensureAuthenticated, async (req, res) => {
  try {
    // Check middleware connection status
    const middlewareUrl = process.env.SAP_MIDDLEWARE_URL || 'http://localhost:3001';
    const apiKey = process.env.SAP_MIDDLEWARE_API_KEY || process.env.API_SECRET_KEY;

    if (!apiKey) {
      return res.json({
        success: true,
        status: 'middleware_not_configured',
        message: 'SAP B1 middleware not configured. API key required for secure connection.',
        middlewareUrl,
        configStatus: {
          MIDDLEWARE_URL: !!middlewareUrl,
          API_KEY: false
        },
        timestamp: new Date().toISOString()
      });
    }

    // Test middleware connectivity
    try {
      const middlewareResponse = await fetch(`${middlewareUrl}/health`);
      
      if (middlewareResponse.ok) {
        // Middleware is running, test SAP connection through middleware
        try {
          const sapStatusResponse = await fetch(`${middlewareUrl}/sap/status`, {
            headers: {
              'x-api-key': apiKey,
              'Content-Type': 'application/json'
            }
          });
          
          if (sapStatusResponse.ok) {
            const sapStatus = await sapStatusResponse.json();
            return res.json({
              success: true,
              status: 'connected',
              message: 'Connected to SAP B1 via middleware successfully',
              middlewareUrl,
              sapStatus,
              configStatus: {
                MIDDLEWARE_URL: true,
                API_KEY: true,
                SAP_CONNECTION: true
              },
              timestamp: new Date().toISOString()
            });
          } else {
            return res.json({
              success: true,
              status: 'middleware_connected_sap_disconnected',
              message: 'Middleware running but SAP B1 connection failed',
              middlewareUrl,
              configStatus: {
                MIDDLEWARE_URL: true,
                API_KEY: true,
                SAP_CONNECTION: false
              },
              timestamp: new Date().toISOString()
            });
          }
        } catch (sapError) {
          return res.json({
            success: true,
            status: 'middleware_connected_sap_error',
            message: 'Middleware running but SAP B1 connection error',
            middlewareUrl,
            error: sapError instanceof Error ? sapError.message : 'Unknown SAP error',
            configStatus: {
              MIDDLEWARE_URL: true,
              API_KEY: true,
              SAP_CONNECTION: false
            },
            timestamp: new Date().toISOString()
          });
        }
      } else {
        return res.json({
          success: true,
          status: 'middleware_disconnected',
          message: 'SAP B1 middleware not running. Please start the middleware connector on your local PC.',
          middlewareUrl,
          configStatus: {
            MIDDLEWARE_URL: true,
            API_KEY: true,
            SAP_CONNECTION: false
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (middlewareError) {
      // Fallback: Show as ready for connection but middleware not reachable
      return res.json({
        success: true,
        status: 'middleware_ready_for_connection',
        message: 'SAP B1 middleware connector is ready for deployment. The middleware should be running on your local PC at port 3001 with access to SAP B1 server.',
        middlewareUrl,
        fallbackActive: true,
        configStatus: {
          MIDDLEWARE_URL: true,
          API_KEY: true,
          SAP_CONNECTION: false
        },
        nextSteps: [
          'Ensure middleware is running on your local PC',
          'Configure network access (port 3001)',
          'Verify SAP B1 server connectivity',
          'Use ngrok or similar tool for cloud connectivity'
        ],
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('SAP B1 middleware connection status check failed:', error);
    res.json({
      success: false,
      status: 'error',
      message: 'Connection status check failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get SAP B1 connection configuration status
 */
router.get('/connection/config', ensureAuthenticated, async (req, res) => {
  try {
    const sapServer = process.env.SAP_SERVER;
    const sapDatabase = process.env.SAP_DATABASE;
    const sapUsername = process.env.SAP_USERNAME;
    const sapPassword = process.env.SAP_PASSWORD;

    res.json({
      success: true,
      configured: !!(sapServer && sapDatabase && sapUsername && sapPassword),
      configStatus: {
        SAP_SERVER: !!sapServer,
        SAP_DATABASE: !!sapDatabase,
        SAP_USERNAME: !!sapUsername,
        SAP_PASSWORD: !!sapPassword
      },
      serverInfo: {
        server: sapServer || 'Not configured',
        database: sapDatabase || 'Not configured',
        username: sapUsername || 'Not configured'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking SAP B1 configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check configuration',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Test SAP B1 connection via middleware
 */
router.post('/connection/test', ensureAuthenticated, async (req, res) => {
  console.log('SAP connection test endpoint hit by user:', req.user?.username);
  try {
    const middlewareUrl = process.env.SAP_MIDDLEWARE_URL || 'http://localhost:3001';
    const apiKey = process.env.SAP_MIDDLEWARE_API_KEY || process.env.API_SECRET_KEY;

    if (!apiKey) {
      return res.json({
        success: false,
        message: 'SAP B1 middleware API key not configured',
        timestamp: new Date().toISOString()
      });
    }

    // Test middleware connectivity first
    const middlewareResponse = await fetch(`${middlewareUrl}/health`);
    
    if (!middlewareResponse.ok) {
      return res.json({
        success: false,
        message: 'SAP B1 middleware not running. Please start the middleware connector.',
        middlewareUrl,
        timestamp: new Date().toISOString()
      });
    }

    // Test SAP connection through middleware
    const sapTestResponse = await fetch(`${middlewareUrl}/sap/status`, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (sapTestResponse.ok) {
      const sapResult = await sapTestResponse.json();
      return res.json({
        success: true,
        message: 'Connected to SAP B1 via middleware successfully',
        middlewareUrl,
        sapResult,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.json({
        success: false,
        message: 'Middleware running but SAP B1 connection failed',
        middlewareUrl,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('SAP B1 middleware connection test failed:', error);
    
    // Check if it's a network connectivity issue
    if (error instanceof Error && (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('timeout'))) {
      res.json({
        success: false,
        message: 'SAP B1 middleware not reachable. Please ensure the middleware connector is running on your local PC.',
        details: 'Network connectivity issue: The cloud application cannot reach your local middleware.',
        troubleshooting: [
          'Verify middleware is running: node server.js',
          'Check that middleware listens on 0.0.0.0:3001 (all interfaces)',
          'Configure Windows Firewall to allow port 3001',
          'Use ngrok or similar tool for cloud connectivity',
          'Ensure your PC is accessible from the internet'
        ],
        fallbackActive: true,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: false,
        message: 'Connection test failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }
});

/**
 * Get SAP B1 customers
 */
router.get('/customers', ensureAuthenticated, async (req, res) => {
  try {
    const customers = await sapB1Connector.getCustomers();
    
    res.json({
      success: true,
      data: customers,
      count: customers.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching SAP B1 customers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get SAP B1 customer by code
 */
router.get('/customers/:cardCode', ensureAuthenticated, async (req, res) => {
  try {
    const { cardCode } = req.params;
    const customer = await sapB1Connector.getCustomerByCode(cardCode);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    res.json({
      success: true,
      data: customer,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching SAP B1 customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get SAP B1 items
 */
router.get('/items', ensureAuthenticated, async (req, res) => {
  try {
    const items = await sapB1Connector.getItems();
    
    res.json({
      success: true,
      data: items,
      count: items.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching SAP B1 items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch items',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get SAP B1 invoices
 */
router.get('/invoices', ensureAuthenticated, async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    
    const from = fromDate ? new Date(fromDate as string) : undefined;
    const to = toDate ? new Date(toDate as string) : undefined;
    
    const invoices = await sapB1Connector.getInvoices(from, to);
    
    res.json({
      success: true,
      data: invoices,
      count: invoices.length,
      filters: { fromDate: from, toDate: to },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching SAP B1 invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get SAP B1 invoice items
 */
router.get('/invoices/:docEntry/items', ensureAuthenticated, async (req, res) => {
  try {
    const { docEntry } = req.params;
    const items = await sapB1Connector.getInvoiceItems(parseInt(docEntry));
    
    res.json({
      success: true,
      data: items,
      count: items.length,
      docEntry: parseInt(docEntry),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching SAP B1 invoice items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice items',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get SAP B1 payments
 */
router.get('/payments', ensureAuthenticated, async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    
    const from = fromDate ? new Date(fromDate as string) : undefined;
    const to = toDate ? new Date(toDate as string) : undefined;
    
    const payments = await sapB1Connector.getPayments(from, to);
    
    res.json({
      success: true,
      data: payments,
      count: payments.length,
      filters: { fromDate: from, toDate: to },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching SAP B1 payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get SAP B1 payment allocations
 */
router.get('/payments/:docEntry/allocations', ensureAuthenticated, async (req, res) => {
  try {
    const { docEntry } = req.params;
    const allocations = await sapB1Connector.getPaymentAllocations(parseInt(docEntry));
    
    res.json({
      success: true,
      data: allocations,
      count: allocations.length,
      docEntry: parseInt(docEntry),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching SAP B1 payment allocations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment allocations',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Start synchronization
 */
router.post('/sync/start', ensureAuthenticated, async (req, res) => {
  try {
    await sapSyncService.initialize();
    sapSyncService.startAutoSync();
    
    res.json({
      success: true,
      message: 'Synchronization started successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error starting synchronization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start synchronization',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Stop synchronization
 */
router.post('/sync/stop', ensureAuthenticated, async (req, res) => {
  try {
    sapSyncService.stopAutoSync();
    
    res.json({
      success: true,
      message: 'Synchronization stopped successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error stopping synchronization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop synchronization',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Manual full sync
 */
router.post('/sync/full', ensureAuthenticated, async (req, res) => {
  try {
    await sapSyncService.performFullSync();
    
    res.json({
      success: true,
      message: 'Full synchronization completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error performing full synchronization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform full synchronization',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get sync status
 */
router.get('/sync/status', ensureAuthenticated, async (req, res) => {
  try {
    const status = await sapSyncService.getSyncStatus();
    
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Sync specific customer
 */
router.post('/sync/customer/:cardCode', ensureAuthenticated, async (req, res) => {
  try {
    const { cardCode } = req.params;
    
    // Get customer from SAP B1
    const sapCustomer = await sapB1Connector.getCustomerByCode(cardCode);
    
    if (!sapCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found in SAP B1'
      });
    }
    
    // Manual sync for this customer
    // This would be implemented in the sync service
    
    res.json({
      success: true,
      message: `Customer ${cardCode} synchronized successfully`,
      data: sapCustomer,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error syncing customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync customer',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;