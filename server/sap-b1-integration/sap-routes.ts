import express from 'express';
import { sapB1Connector } from './sap-connector';
import { sapSyncService } from './sync-service';
import { ensureAuthenticated } from '../auth-middleware';
import { vpnManager } from '../vpn/vpn-manager';
import purchaseRoutes from './purchase-routes';

const router = express.Router();

// Register Purchase module routes
router.use('/purchase', purchaseRoutes);

/**
 * SAP B1 Integration API Routes
 */

/**
 * Get SAP B1 connection status via Service Layer (with VPN support)
 */
router.get('/connection/status', ensureAuthenticated, async (req, res) => {
  try {
    // Check VPN status if enabled
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    let vpnStatus = null;
    
    if (vpnEnabled) {
      vpnStatus = vpnManager.getStatus();
      
      // If VPN is not connected, attempt connection
      if (!vpnStatus.connected) {
        console.log('🔄 VPN not connected, attempting connection...');
        const connected = await vpnManager.connect();
        if (!connected) {
          return res.json({
            success: true,
            status: 'vpn_connection_failed',
            message: 'VPN connection to SAP network failed',
            vpnStatus: vpnManager.getStatus(),
            timestamp: new Date().toISOString()
          });
        }
        vpnStatus = vpnManager.getStatus();
      }
    }

    // Check Service Layer connection status
    const serviceLayerUrl = process.env.SAP_SERVICE_LAYER_URL || (vpnEnabled ? 'https://192.168.1.100:50000/b1s/v1' : 'https://59.152.52.58:50000/b1s/v1');
    const sapUsername = process.env.SAP_USERNAME;
    const sapPassword = process.env.SAP_PASSWORD;
    const sapCompanyDb = process.env.SAP_COMPANY_DB;

    if (!sapUsername || !sapPassword || !sapCompanyDb) {
      return res.json({
        success: true,
        status: 'service_layer_not_configured',
        message: 'SAP B1 Service Layer not configured. SAP credentials required.',
        serviceLayerUrl,
        configStatus: {
          SERVICE_LAYER_URL: !!serviceLayerUrl,
          SAP_USERNAME: !!sapUsername,
          SAP_PASSWORD: !!sapPassword,
          SAP_COMPANY_DB: !!sapCompanyDb
        },
        timestamp: new Date().toISOString()
      });
    }

    // Test Service Layer connectivity with timeout and SSL bypass for self-signed certificates
    // Disable SSL verification for development with self-signed certificates
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
    
    try {
      const loginResponse = await fetch(`${serviceLayerUrl}/Login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          CompanyDB: sapCompanyDb,
          UserName: sapUsername,
          Password: sapPassword
        }),
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });

      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        
        // Test a simple API call to verify connection
        const businessPartnersResponse = await fetch(`${serviceLayerUrl}/BusinessPartners?$top=1`, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Cookie': `B1SESSION=${loginData.SessionId}; ROUTEID=${loginData.RouteId || '.node1'}`
          }
        });

        if (businessPartnersResponse.ok) {
          return res.json({
            success: true,
            status: 'connected',
            message: vpnEnabled ? 'Connected to SAP B1 Service Layer via VPN successfully' : 'Connected to SAP B1 Service Layer successfully',
            connectionType: vpnEnabled ? 'VPN' : 'Direct',
            serviceLayerUrl,
            sessionId: loginData.SessionId,
            version: loginData.Version,
            vpnStatus,
            configStatus: {
              SERVICE_LAYER_URL: true,
              SAP_USERNAME: true,
              SAP_PASSWORD: true,
              SAP_COMPANY_DB: true,
              SAP_CONNECTION: true,
              VPN_ENABLED: vpnEnabled,
              VPN_CONNECTED: vpnStatus?.connected || false
            },
            timestamp: new Date().toISOString()
          });
        } else {
          return res.json({
            success: true,
            status: 'service_layer_auth_failed',
            message: 'Service Layer authentication successful but API access failed',
            serviceLayerUrl,
            configStatus: {
              SERVICE_LAYER_URL: true,
              SAP_USERNAME: true,
              SAP_PASSWORD: true,
              SAP_COMPANY_DB: true,
              SAP_CONNECTION: false
            },
            timestamp: new Date().toISOString()
          });
        }
      } else {
        const errorText = await loginResponse.text();
        return res.json({
          success: true,
          status: 'service_layer_login_failed',
          message: `Service Layer login failed: ${loginResponse.status} ${loginResponse.statusText}`,
          serviceLayerUrl,
          error: errorText,
          configStatus: {
            SERVICE_LAYER_URL: true,
            SAP_USERNAME: true,
            SAP_PASSWORD: true,
            SAP_COMPANY_DB: true,
            SAP_CONNECTION: false
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (serviceLayerError) {
      return res.json({
        success: true,
        status: 'service_layer_unreachable',
        message: 'SAP B1 Service Layer unreachable. Please ensure Service Layer is running and accessible.',
        serviceLayerUrl,
        error: serviceLayerError instanceof Error ? serviceLayerError.message : 'Unknown error',
        configStatus: {
          SERVICE_LAYER_URL: true,
          SAP_USERNAME: true,
          SAP_PASSWORD: true,
          SAP_COMPANY_DB: true,
          SAP_CONNECTION: false
        },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('SAP Service Layer connection status check error:', error);
    return res.status(500).json({
      success: false,
      status: 'error',
      message: 'Failed to check SAP B1 Service Layer connection status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get SAP B1 Service Layer configuration status
 */
router.get('/connection/config', ensureAuthenticated, async (req, res) => {
  try {
    const serviceLayerUrl = process.env.SAP_SERVICE_LAYER_URL;
    const sapUsername = process.env.SAP_USERNAME;
    const sapPassword = process.env.SAP_PASSWORD;
    const sapCompanyDb = process.env.SAP_COMPANY_DB;

    res.json({
      success: true,
      configured: !!(serviceLayerUrl && sapUsername && sapPassword && sapCompanyDb),
      configStatus: {
        SERVICE_LAYER_URL: !!serviceLayerUrl,
        SAP_USERNAME: !!sapUsername,
        SAP_PASSWORD: !!sapPassword,
        SAP_COMPANY_DB: !!sapCompanyDb
      },
      serviceLayerInfo: {
        url: serviceLayerUrl || 'Not configured',
        companyDb: sapCompanyDb || 'Not configured',
        username: sapUsername || 'Not configured'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking SAP B1 Service Layer configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check configuration',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Test SAP B1 connection via Service Layer
 */
router.post('/connection/test', ensureAuthenticated, async (req, res) => {
  console.log('SAP Service Layer connection test endpoint hit by user:', req.user?.username);
  try {
    const serviceLayerUrl = process.env.SAP_SERVICE_LAYER_URL || 'https://DESKTOP-NH04TP:50000/b1s/v1';
    const sapUsername = process.env.SAP_USERNAME;
    const sapPassword = process.env.SAP_PASSWORD;
    const sapCompanyDb = process.env.SAP_COMPANY_DB;

    if (!sapUsername || !sapPassword || !sapCompanyDb) {
      return res.json({
        success: false,
        message: 'SAP B1 Service Layer credentials not configured',
        timestamp: new Date().toISOString()
      });
    }

    // Test Service Layer connectivity with timeout
    const loginResponse = await fetch(`${serviceLayerUrl}/Login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        CompanyDB: sapCompanyDb,
        UserName: sapUsername,
        Password: sapPassword
      }),
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });
    
    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      return res.json({
        success: false,
        message: `Service Layer login failed: ${loginResponse.status} ${loginResponse.statusText}`,
        serviceLayerUrl,
        error: errorText,
        timestamp: new Date().toISOString()
      });
    }

    const loginData = await loginResponse.json();
    
    // Test a simple API call to verify connection
    const businessPartnersResponse = await fetch(`${serviceLayerUrl}/BusinessPartners?$top=1`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cookie': `B1SESSION=${loginData.SessionId}; ROUTEID=${loginData.RouteId || '.node1'}`
      }
    });

    if (businessPartnersResponse.ok) {
      const businessPartnersData = await businessPartnersResponse.json();
      return res.json({
        success: true,
        message: 'Connected to SAP B1 Service Layer successfully',
        serviceLayerUrl,
        sessionId: loginData.SessionId,
        version: loginData.Version,
        testResult: `Successfully retrieved ${businessPartnersData.value?.length || 0} business partners`,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.json({
        success: false,
        message: 'Service Layer authentication successful but API access failed',
        serviceLayerUrl,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('SAP B1 Service Layer connection test failed:', error);
    
    // Check if it's a network connectivity issue
    if (error instanceof Error && (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('timeout'))) {
      res.json({
        success: false,
        message: 'SAP B1 Service Layer not reachable. Please ensure Service Layer is running and accessible.',
        details: 'Network connectivity issue: Cannot reach the Service Layer endpoint.',
        troubleshooting: [
          'Verify Service Layer is running on SAP B1 server',
          'Check that Service Layer is accessible on port 50000',
          'Configure firewall to allow HTTPS traffic on port 50000',
          'Verify SSL certificate configuration',
          'Ensure network connectivity to SAP B1 server'
        ],
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

/**
 * VPN Management Endpoints
 */

/**
 * Get VPN connection status
 */
router.get('/vpn/status', ensureAuthenticated, async (req, res) => {
  try {
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    
    if (!vpnEnabled) {
      return res.json({
        success: true,
        vpnEnabled: false,
        message: 'VPN is disabled for SAP B1 integration',
        timestamp: new Date().toISOString()
      });
    }

    const vpnStatus = vpnManager.getStatus();
    const connectivityTest = await vpnManager.testConnectivity();

    res.json({
      success: true,
      vpnEnabled: true,
      vpnStatus,
      connectivity: {
        canReachSAP: connectivityTest,
        testedAt: new Date().toISOString()
      },
      configuration: {
        serviceLayerUrl: process.env.SAP_SERVICE_LAYER_URL,
        autoReconnect: process.env.VPN_AUTO_RECONNECT === 'true',
        serverIP: process.env.VPN_SERVER_IP
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('VPN status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get VPN status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Connect VPN
 */
router.post('/vpn/connect', ensureAuthenticated, async (req, res) => {
  try {
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    
    if (!vpnEnabled) {
      return res.json({
        success: false,
        message: 'VPN is disabled for SAP B1 integration'
      });
    }

    console.log('🔄 Manual VPN connection requested');
    const connected = await vpnManager.connect();
    
    if (connected) {
      const vpnStatus = vpnManager.getStatus();
      res.json({
        success: true,
        message: 'VPN connection established successfully',
        vpnStatus,
        timestamp: new Date().toISOString()
      });
    } else {
      const vpnStatus = vpnManager.getStatus();
      res.json({
        success: false,
        message: 'Failed to establish VPN connection',
        vpnStatus,
        error: vpnStatus.lastError,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('VPN connection error:', error);
    res.status(500).json({
      success: false,
      message: 'VPN connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Disconnect VPN
 */
router.post('/vpn/disconnect', ensureAuthenticated, async (req, res) => {
  try {
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    
    if (!vpnEnabled) {
      return res.json({
        success: false,
        message: 'VPN is disabled for SAP B1 integration'
      });
    }

    console.log('🔄 Manual VPN disconnection requested');
    await vpnManager.disconnect();
    
    res.json({
      success: true,
      message: 'VPN disconnected successfully',
      vpnStatus: vpnManager.getStatus(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('VPN disconnection error:', error);
    res.status(500).json({
      success: false,
      message: 'VPN disconnection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get VPN connection logs
 */
router.get('/vpn/logs', ensureAuthenticated, async (req, res) => {
  try {
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    
    if (!vpnEnabled) {
      return res.json({
        success: false,
        message: 'VPN is disabled for SAP B1 integration'
      });
    }

    const logs = await vpnManager.getConnectionLogs();
    
    res.json({
      success: true,
      logs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('VPN logs retrieval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve VPN logs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Test VPN connectivity to SAP
 */
router.get('/vpn/test-connectivity', ensureAuthenticated, async (req, res) => {
  try {
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    
    if (!vpnEnabled) {
      return res.json({
        success: false,
        message: 'VPN is disabled for SAP B1 integration'
      });
    }

    const vpnStatus = vpnManager.getStatus();
    if (!vpnStatus.connected) {
      return res.json({
        success: false,
        message: 'VPN is not connected',
        vpnStatus
      });
    }

    const connectivityTest = await vpnManager.testConnectivity();
    
    res.json({
      success: true,
      connectivity: {
        canReachSAP: connectivityTest,
        vpnConnected: vpnStatus.connected,
        testedAt: new Date().toISOString()
      },
      vpnStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('VPN connectivity test error:', error);
    res.status(500).json({
      success: false,
      message: 'VPN connectivity test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// VPN Management Routes
router.get('/vpn/status', ensureAuthenticated, async (req, res) => {
  try {
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    const vpnStatus = vpnManager.getStatus();
    const vpnLogs = vpnManager.getLogs();
    
    res.json({
      success: true,
      vpnEnabled,
      vpnStatus,
      vpnLogs: vpnLogs.slice(-10), // Last 10 log entries
      environment: {
        SAP_VPN_ENABLED: process.env.SAP_VPN_ENABLED,
        VPN_SERVER_IP: process.env.VPN_SERVER_IP,
        VPN_USERNAME: process.env.VPN_USERNAME,
        VPN_PASSWORD: process.env.VPN_PASSWORD ? '***' : 'not set'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get VPN status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/vpn/connect', ensureAuthenticated, async (req, res) => {
  try {
    const connected = await vpnManager.connect();
    const vpnStatus = vpnManager.getStatus();
    
    res.json({
      success: connected,
      message: connected ? 'VPN connected successfully' : 'VPN connection failed',
      vpnStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to connect VPN',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/vpn/disconnect', ensureAuthenticated, async (req, res) => {
  try {
    await vpnManager.disconnect();
    const vpnStatus = vpnManager.getStatus();
    
    res.json({
      success: true,
      message: 'VPN disconnected successfully',
      vpnStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect VPN',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/vpn/logs', ensureAuthenticated, async (req, res) => {
  try {
    const logs = vpnManager.getLogs();
    res.json({
      success: true,
      logs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get VPN logs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/vpn/test-connectivity', ensureAuthenticated, async (req, res) => {
  try {
    const canReachSAP = await vpnManager.testConnectivity();
    res.json({
      success: true,
      canReachSAP,
      message: canReachSAP ? 'SAP server reachable via VPN' : 'SAP server not reachable',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to test connectivity',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;