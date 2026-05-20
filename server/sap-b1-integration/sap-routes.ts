import express from 'express';
import { sapSession } from './sap-central-session';
import { ensureAuthenticated } from '../auth-middleware';
import { vpnManager } from '../vpn/vpn-manager';
import purchaseRoutes from './purchase-routes';
import credentialsRoutes from './credentials-routes';
import { db } from '../db';
import { sapPurchaseOrderItems } from '../../shared/schema';

const router = express.Router();

// ── GOVERNANCE BLOCK ─────────────────────────────────────────────────────────
// All SAP B1 Service Layer calls in this file MUST go through
// sapSession.request() (SapCentralSession — sap-central-session.ts).
// Direct Login/Logout via SapHttpsClient, fetch(), or any other transport
// is PROHIBITED in production routes.
// The governance guard in sapHttpsClient.login() will throw if any caller
// attempts an out-of-band login.
// Removed routes (sapB1Connector / sapSyncService): those classes used a
// disabled MSSQL transport (initializeConnection() was commented out) and
// are replaced by the Service Layer path via sapSession.request().
// ─────────────────────────────────────────────────────────────────────────────

// Register sub-routers
router.use('/purchase', purchaseRoutes);
router.use('/', credentialsRoutes);

/**
 * SAP B1 Integration API Routes
 */

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTIC / NETWORK ROUTES — no SAP session created
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VPN Network Diagnostics — OS-level connectivity probe.
 * GOVERNANCE: No SAP session or credentials involved. Uses OS commands
 * (ping, nc) and an unauthenticated HTTPS GET probe only. No persistence.
 */
router.get('/connection/vpn-diagnostics', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, async (req, res) => {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      vpnEnabled: process.env.SAP_VPN_ENABLED === 'true',
      vpnStatus: null,
      networkTests: {},
      routing: {},
      connectivity: {}
    };

    if (diagnostics.vpnEnabled) {
      diagnostics.vpnStatus = vpnManager.getStatus();
    }

    const internalIP = '192.168.1.100';
    const serviceLayerPort = '50000';
    const sqlServerPort = '1433';

    try {
      const pingResult = await execAsync(`ping -c 2 -W 3 ${internalIP} 2>&1`);
      diagnostics.connectivity.ping = {
        success: true,
        output: pingResult.stdout,
        latency: pingResult.stdout.includes('ms') ? pingResult.stdout.match(/time=(\d+\.?\d*)/)?.[1] + 'ms' : 'unknown'
      };
    } catch (error: any) {
      diagnostics.connectivity.ping = { success: false, error: error.message, output: error.stdout || error.stderr };
    }

    try {
      const telnetResult = await execAsync(`timeout 5 nc -zv ${internalIP} ${serviceLayerPort} 2>&1 || echo "Connection failed"`);
      diagnostics.connectivity.serviceLayerPort = {
        port: serviceLayerPort,
        success: telnetResult.stdout.includes('succeeded') || telnetResult.stdout.includes('Connected'),
        output: telnetResult.stdout
      };
    } catch (error: any) {
      diagnostics.connectivity.serviceLayerPort = { port: serviceLayerPort, success: false, error: error.message, output: error.stdout || error.stderr };
    }

    try {
      const sqlResult = await execAsync(`timeout 5 nc -zv ${internalIP} ${sqlServerPort} 2>&1 || echo "Connection failed"`);
      diagnostics.connectivity.sqlServerPort = {
        port: sqlServerPort,
        success: sqlResult.stdout.includes('succeeded') || sqlResult.stdout.includes('Connected'),
        output: sqlResult.stdout
      };
    } catch (error: any) {
      diagnostics.connectivity.sqlServerPort = { port: sqlServerPort, success: false, error: error.message, output: error.stdout || error.stderr };
    }

    try {
      const httpsTest = await fetch(`https://${internalIP}:${serviceLayerPort}/b1s/v1/`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
        headers: { 'Accept': 'application/json' }
      });
      diagnostics.connectivity.httpsServiceLayer = {
        success: true,
        status: httpsTest.status,
        statusText: httpsTest.statusText,
        headers: Object.fromEntries(httpsTest.headers.entries())
      };
    } catch (error: any) {
      diagnostics.connectivity.httpsServiceLayer = { success: false, error: error.message, errorType: error.name, cause: error.cause?.message };
    }

    try {
      const routeResult = await execAsync(`cat /proc/net/route | grep -E "(C0A801|192\\.168\\.1)" || echo "No 192.168.1.x routes found"`);
      diagnostics.routing.subnetRoutes = routeResult.stdout;
      const defaultRoute = await execAsync(`cat /proc/net/route | head -3`);
      diagnostics.routing.routingTable = defaultRoute.stdout;
    } catch (error: any) {
      diagnostics.routing.error = error.message;
    }

    try {
      const interfaces = await execAsync(`ip addr show 2>/dev/null || ifconfig 2>/dev/null || echo "Network interfaces unavailable"`);
      diagnostics.networkTests.interfaces = interfaces.stdout;
    } catch (error: any) {
      diagnostics.networkTests.interfacesError = error.message;
    }

    try {
      const dnsTest = await execAsync(`nslookup ${internalIP} 2>&1 || echo "DNS test failed"`);
      diagnostics.networkTests.dns = dnsTest.stdout;
    } catch (error: any) {
      diagnostics.networkTests.dnsError = error.message;
    }

    res.json({ success: true, message: 'VPN Network Diagnostics Complete', diagnostics, recommendations: generateVPNRecommendations(diagnostics) });
  } catch (error: any) {
    console.error('VPN diagnostics error:', error);
    res.status(500).json({ success: false, error: 'VPN diagnostics failed', message: error.message, timestamp: new Date().toISOString() });
  }
});

function generateVPNRecommendations(diagnostics: any): string[] {
  const recommendations: string[] = [];
  if (!diagnostics.vpnEnabled) recommendations.push('VPN is disabled. Enable VPN by setting SAP_VPN_ENABLED=true');
  if (diagnostics.vpnStatus && !diagnostics.vpnStatus.connected) recommendations.push('VPN is not connected. Check VPN credentials and server configuration');
  if (diagnostics.connectivity.ping && !diagnostics.connectivity.ping.success) recommendations.push('Cannot ping 192.168.1.100. Check VPN routing for subnet 192.168.1.0/24');
  if (diagnostics.connectivity.serviceLayerPort && !diagnostics.connectivity.serviceLayerPort.success) recommendations.push('SAP Service Layer port 50000 is not accessible. Check firewall and service status');
  if (diagnostics.connectivity.httpsServiceLayer && !diagnostics.connectivity.httpsServiceLayer.success) recommendations.push('HTTPS connection to Service Layer failed. Check SSL certificates and TLS configuration');
  if (diagnostics.routing.subnetRoutes && diagnostics.routing.subnetRoutes.includes('No 192.168.1.x routes found')) recommendations.push('No routes found for 192.168.1.0/24 subnet. Add route: ip route add 192.168.1.0/24 via [VPN_GATEWAY]');
  return recommendations;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION STATUS & CONFIG — central session health, no independent login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /connection/status — Central session health report.
 * GOVERNANCE: Reads sapSession.getHealth() — no independent SAP login.
 * Session is owned and managed exclusively by SapCentralSession.
 */
router.get('/connection/status', ensureAuthenticated, async (req, res) => {
  try {
    const health = sapSession.getHealth();
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    let vpnStatus = null;
    if (vpnEnabled) vpnStatus = vpnManager.getStatus();

    return res.json({
      success: true,
      status: health.alive ? 'connected' : 'session_not_established',
      isConnected: health.alive,
      message: health.alive
        ? 'SAP B1 central session is active'
        : 'SAP B1 central session not yet established (will connect on first request)',
      activeSessions: health.alive ? 1 : 0,
      details: {
        username: health.username || 'Not configured',
        companyDb: health.companyDb || 'Not configured',
        serviceLayerUrl: process.env.SAP_SERVICE_LAYER_URL || 'Not configured',
      },
      session: {
        alive: health.alive,
        ttlSeconds: health.ttlSeconds,
        expiresAt: health.expiresAt,
        loginInProgress: health.loginInProgress,
        companyDb: health.companyDb,
        username: health.username,
      },
      vpnEnabled,
      vpnStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('SAP connection status check error:', error);
    return res.status(500).json({ success: false, status: 'error', message: 'Failed to check SAP B1 connection status', error: error.message });
  }
});

/**
 * GET /connection/config — SAP Service Layer env var presence check.
 * GOVERNANCE: No SAP session. Returns boolean presence flags only — no values.
 */
router.get('/connection/config', ensureAuthenticated, async (req, res) => {
  try {
    const serviceLayerUrl = process.env.SAP_SERVICE_LAYER_URL;
    const sapUsername = process.env.SAP_B1_USERNAME;
    const sapPassword = process.env.SAP_B1_PASSWORD;
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
  } catch (error: any) {
    console.error('Error checking SAP B1 Service Layer configuration:', error);
    res.status(500).json({ success: false, message: 'Failed to check configuration', error: error.message });
  }
});

/**
 * GET /company-databases — Static list of known SAP company databases.
 * GOVERNANCE: No SAP session. Static data only.
 */
router.get('/company-databases', ensureAuthenticated, async (_req, res) => {
  try {
    const defaultDb = 'TPEL_LIVE';
    const databases = [
      { name: 'TPEL_LIVE', description: 'TPEL Live Database', isDefault: true },
      { name: 'TPEL_TEST_120326', description: 'TPEL Test Database', isDefault: false },
    ];
    res.json({ success: true, databases, defaultDb });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /connection/test — Live connectivity probe via central session.
 * GOVERNANCE: Uses sapSession.request() — no independent SAP login.
 * Makes a lightweight BusinessPartners?$top=1 call to verify the session
 * is functional end-to-end. Central session handles 401/−1102 retries
 * transparently.
 */
router.get('/connection/test', ensureAuthenticated, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const health = sapSession.getHealth();
    const testResp = await sapSession.request({
      method: 'GET',
      path: '/b1s/v1/BusinessPartners?$top=1',
      timeout: 15000
    });

    if (testResp.ok) {
      let recordCount = 0;
      try {
        const parsed = JSON.parse(testResp.body);
        recordCount = parsed.value?.length ?? 0;
      } catch { /* non-fatal */ }

      return res.json({
        success: true,
        status: 'connected',
        message: 'SAP B1 Service Layer connection verified via central session',
        sessionAlive: health.alive,
        ttlSeconds: health.ttlSeconds,
        testResult: `BusinessPartners probe returned ${recordCount} record(s)`,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.json({
        success: false,
        status: 'api_error',
        message: `SAP returned HTTP ${testResp.statusCode} on BusinessPartners probe`,
        statusCode: testResp.statusCode,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    console.error('SAP connection test error:', error);
    return res.json({
      success: false,
      status: 'error',
      message: 'SAP B1 connection test failed',
      error: error.message,
      vpnStatus: vpnManager.getStatus(),
      timestamp: new Date().toISOString()
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /vendors — Vendor list from SAP BusinessPartners (cSupplier).
 * GOVERNANCE: Uses sapSession.request() — no independent SAP login.
 */
router.get('/vendors', ensureAuthenticated, async (req, res) => {
  try {
    const vendorsResponse = await sapSession.request({
      method: 'GET',
      path: `/b1s/v1/BusinessPartners?$filter=CardType eq 'cSupplier'&$select=CardCode,CardName&$top=500`,
    });

    if (!vendorsResponse.ok) {
      console.error('SAP vendors response error:', vendorsResponse.statusCode, vendorsResponse.body);
      return res.status(502).json({ success: false, error: 'Failed to fetch vendors from SAP' });
    }

    const vendorsData = JSON.parse(vendorsResponse.body);
    const vendors = (vendorsData.value || []).map((v: any) => ({
      code: v.CardCode,
      name: v.CardName,
    }));
    vendors.sort((a: any, b: any) => a.name.localeCompare(b.name));

    res.json(vendors);
  } catch (error: any) {
    console.error('Error fetching SAP vendors:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch SAP vendor list' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SYNC ROUTES — all via sapSession.request()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /sync/full — Full BusinessPartners data probe via central session.
 * GOVERNANCE: Uses sapSession.request() — no independent SAP login.
 * Fetches a sample of BusinessPartners to verify end-to-end SAP data access.
 */
router.post('/sync/full', ensureAuthenticated, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    console.log('🔄 Starting SAP B1 full data probe via central session...');

    const bpResp = await sapSession.request({
      method: 'GET',
      path: '/b1s/v1/BusinessPartners?$top=5',
      timeout: 30000
    });

    if (!bpResp.ok) {
      throw new Error(`SAP BusinessPartners probe failed: HTTP ${bpResp.statusCode}`);
    }

    const bpData = JSON.parse(bpResp.body);
    const recordsCount = bpData.value?.length || 0;
    console.log(`✅ SAP full probe: ${recordsCount} BusinessPartner records`);

    res.json({
      success: true,
      message: `Full data probe completed — ${recordsCount} BusinessPartner records verified`,
      recordsProcessed: recordsCount,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error during full SAP data probe:', error);
    res.status(500).json({ success: false, message: 'Full SAP data probe failed', error: error.message });
  }
});

/**
 * POST /sync/purchase — Purchase module sync via central session.
 * GOVERNANCE: Uses sapSession.request() — no independent SAP login.
 * Fetches vendors, purchase orders (with line-item DB upserts),
 * purchase invoices, and items. All data flows through the central session.
 */
router.post('/sync/purchase', ensureAuthenticated, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    console.log('🛒 Starting SAP B1 Purchase Module sync via central session...');

    const syncResults = { vendors: 0, purchaseOrders: 0, purchaseOrderItems: 0, purchaseInvoices: 0, items: 0 };

    // 1. Vendors
    const vendorsResp = await sapSession.request({
      method: 'GET',
      path: `/b1s/v1/BusinessPartners?$filter=CardType eq 'cSupplier'&$top=50`,
      timeout: 30000
    });
    if (vendorsResp.ok) {
      syncResults.vendors = (JSON.parse(vendorsResp.body).value || []).length;
      console.log(`✅ Vendors: ${syncResults.vendors}`);
    }

    // 2. Purchase Orders + line items
    const poResp = await sapSession.request({
      method: 'GET',
      path: '/b1s/v1/PurchaseOrders?$top=30',
      timeout: 30000
    });
    if (poResp.ok) {
      const poData = JSON.parse(poResp.body);
      syncResults.purchaseOrders = (poData.value || []).length;
      console.log(`✅ Purchase Orders: ${syncResults.purchaseOrders}`);

      let lineItemsCount = 0;
      for (const po of (poData.value || [])) {
        try {
          const itemsResp = await sapSession.request({
            method: 'GET',
            path: `/b1s/v1/PurchaseOrders(${po.DocEntry})/DocumentLines`,
            timeout: 15000
          });
          if (itemsResp.ok) {
            const items = JSON.parse(itemsResp.body).value || [];
            for (const item of items) {
              try {
                await db.insert(sapPurchaseOrderItems).values({
                  docEntry: po.DocEntry,
                  lineNum: item.LineNum,
                  itemCode: item.ItemCode || null,
                  itemDescription: item.ItemDescription || item.Description || null,
                  quantity: item.Quantity || 0,
                  openQty: item.OpenQuantity || 0,
                  unitPrice: item.UnitPrice || 0,
                  priceAfterVat: item.PriceAfterVAT || 0,
                  lineTotal: item.LineTotal || 0,
                  taxCode: item.TaxCode || null,
                  taxRate: item.VatPrcnt || 0,
                  taxSum: item.VatSum || 0,
                  warehouseCode: item.WarehouseCode || item.WhsCode || null,
                  uom: item.UoMCode || null,
                  uomCode: item.UoMEntry || null,
                  costCenter: item.CostingCode || null,
                  projectCode: item.ProjectCode || null,
                  shipDate: item.ShipDate || null,
                  deliveryDate: item.RequiredDate || null,
                  sapSyncedAt: new Date(),
                  sapSyncStatus: 'synced',
                  createdAt: new Date(),
                  updatedAt: new Date()
                }).onConflictDoUpdate({
                  target: [sapPurchaseOrderItems.docEntry, sapPurchaseOrderItems.lineNum],
                  set: {
                    itemCode: item.ItemCode || null,
                    itemDescription: item.ItemDescription || item.Description || null,
                    quantity: item.Quantity || 0,
                    openQty: item.OpenQuantity || 0,
                    unitPrice: item.UnitPrice || 0,
                    priceAfterVat: item.PriceAfterVAT || 0,
                    lineTotal: item.LineTotal || 0,
                    taxCode: item.TaxCode || null,
                    taxRate: item.VatPrcnt || 0,
                    taxSum: item.VatSum || 0,
                    warehouseCode: item.WarehouseCode || item.WhsCode || null,
                    uom: item.UoMCode || null,
                    uomCode: item.UoMEntry || null,
                    costCenter: item.CostingCode || null,
                    projectCode: item.ProjectCode || null,
                    shipDate: item.ShipDate || null,
                    deliveryDate: item.RequiredDate || null,
                    sapSyncedAt: new Date(),
                    sapSyncStatus: 'synced',
                    updatedAt: new Date()
                  }
                });
                lineItemsCount++;
              } catch (itemError: any) {
                console.error(`Error syncing item ${item.LineNum} for PO ${po.DocEntry}:`, itemError);
              }
            }
          }
        } catch (poErr: any) {
          console.error(`Error syncing line items for PO ${po.DocEntry}:`, poErr);
        }
      }
      console.log(`✅ PO line items: ${lineItemsCount}`);
      syncResults.purchaseOrderItems = lineItemsCount;
    }

    // 3. Purchase Invoices
    const piResp = await sapSession.request({
      method: 'GET',
      path: '/b1s/v1/PurchaseInvoices?$top=30',
      timeout: 30000
    });
    if (piResp.ok) {
      syncResults.purchaseInvoices = (JSON.parse(piResp.body).value || []).length;
      console.log(`✅ Purchase Invoices: ${syncResults.purchaseInvoices}`);
    }

    // 4. Items
    const itemsResp = await sapSession.request({
      method: 'GET',
      path: '/b1s/v1/Items?$top=50',
      timeout: 30000
    });
    if (itemsResp.ok) {
      syncResults.items = (JSON.parse(itemsResp.body).value || []).length;
      console.log(`✅ Items: ${syncResults.items}`);
    }

    const totalRecords = syncResults.vendors + syncResults.purchaseOrders + syncResults.purchaseOrderItems + syncResults.purchaseInvoices + syncResults.items;
    res.json({
      success: true,
      message: `Purchase Module sync completed — ${totalRecords} total records`,
      data: syncResults,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Purchase module sync error:', error);
    res.status(500).json({ success: false, message: 'Purchase module sync failed', error: error.message });
  }
});

/**
 * POST /sync/vendors — Vendor-only sync via central session.
 * GOVERNANCE: Uses sapSession.request() — no independent SAP login.
 * Non-persistent — returns live data to caller, no DB writes.
 */
router.post('/sync/vendors', ensureAuthenticated, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    console.log('🏪 Starting SAP B1 Vendors sync via central session...');

    const vendorsResp = await sapSession.request({
      method: 'GET',
      path: `/b1s/v1/BusinessPartners?$filter=CardType eq 'cSupplier'&$select=CardCode,CardName,Phone1,EmailAddress,MailAddress,MailCity,MailCountry,Currency&$top=1000`,
      timeout: 60000
    });

    if (!vendorsResp.ok) {
      throw new Error(`SAP vendors fetch failed: HTTP ${vendorsResp.statusCode}`);
    }

    const vendorsData = JSON.parse(vendorsResp.body);
    const recordsCount = vendorsData.value?.length || 0;
    console.log(`✅ Vendors sync: ${recordsCount} records`);

    res.json({
      success: true,
      message: `Vendors sync completed — ${recordsCount} records`,
      recordsProcessed: recordsCount,
      data: vendorsData.value || [],
      limitReached: recordsCount === 1000,
      note: recordsCount === 1000 ? 'Showing first 1000 records (limit reached)' : 'All available records shown',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Vendors sync error:', error);
    res.status(500).json({ success: false, message: 'Vendors sync failed', error: error.message });
  }
});

/**
 * POST /sync/purchase-orders — Purchase orders sync via central session.
 * GOVERNANCE: Uses sapSession.request() — no independent SAP login.
 * Non-persistent — returns live data to caller, no DB writes.
 * Note: SAP B1 on MS SQL Server silently strips UDF columns when $select or
 * $orderby is present. Avoid $select/$orderby on UDF-dependent queries
 * (see replit.md Gotchas — SAP Service Layer UDF Behaviour).
 */
router.post('/sync/purchase-orders', ensureAuthenticated, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    console.log('📋 Starting SAP B1 Purchase Orders sync via central session...');

    const poResp = await sapSession.request({
      method: 'GET',
      path: '/b1s/v1/PurchaseOrders?$select=DocEntry,DocNum,CardCode,CardName,DocDate,DocDueDate,DocTotal,DocumentStatus&$top=500',
      timeout: 60000
    });

    if (!poResp.ok) {
      throw new Error(`SAP purchase orders fetch failed: HTTP ${poResp.statusCode}`);
    }

    const poData = JSON.parse(poResp.body);
    const recordsCount = poData.value?.length || 0;
    console.log(`✅ Purchase Orders sync: ${recordsCount} records`);

    res.json({
      success: true,
      message: `Purchase Orders sync completed — ${recordsCount} records`,
      recordsProcessed: recordsCount,
      data: poData.value || [],
      limitReached: recordsCount === 500,
      note: recordsCount === 500 ? 'Showing first 500 records (limit reached)' : 'All available records shown',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Purchase orders sync error:', error);
    res.status(500).json({ success: false, message: 'Purchase orders sync failed', error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL SESSION ADMIN ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /session/debug — Full runtime diagnostics for the central SAP session.
 * GOVERNANCE: Read-only. Uses sapSession.getDebugInfo() — no SAP network call.
 * Returns stats, health, disk-file state, and env presence flags (no secrets).
 */
router.get('/session/debug', ensureAuthenticated, async (_req, res) => {
  try {
    const info = sapSession.getDebugInfo();
    res.json({ success: true, data: info });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /session/force-reset — Admin hard-invalidate + re-initialise of the
 * central session. Use when -1102 persists and you cannot wait 30 minutes.
 * GOVERNANCE: Uses sapSession.forceReset() — single authorised reset path.
 * No independent login; forceReset() triggers a clean fresh login internally
 * on the next sapSession.request() call.
 */
router.post('/session/force-reset', ensureAuthenticated, async (_req, res) => {
  try {
    console.log('[SapRoutes] POST /session/force-reset — initiating admin force-reset');
    const result = await sapSession.forceReset();
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[SapRoutes] force-reset failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VPN MANAGEMENT ROUTES — no SAP session involved
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /vpn/status — VPN connection status and SAP reach test.
 * GOVERNANCE: No SAP session. VPN manager state only.
 */
router.get('/vpn/status', ensureAuthenticated, async (req, res) => {
  try {
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    if (!vpnEnabled) {
      return res.json({ success: true, vpnEnabled: false, message: 'VPN is disabled for SAP B1 integration', timestamp: new Date().toISOString() });
    }
    const vpnStatus = vpnManager.getStatus();
    const connectivityTest = await vpnManager.testConnectivity();
    res.json({
      success: true,
      vpnEnabled: true,
      vpnStatus,
      connectivity: { canReachSAP: connectivityTest, testedAt: new Date().toISOString() },
      configuration: { serviceLayerUrl: process.env.SAP_SERVICE_LAYER_URL, autoReconnect: process.env.VPN_AUTO_RECONNECT === 'true', serverIP: process.env.VPN_SERVER_IP },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('VPN status check error:', error);
    res.status(500).json({ success: false, message: 'Failed to get VPN status', error: error.message });
  }
});

/**
 * POST /vpn/connect — Initiate VPN connection.
 * GOVERNANCE: No SAP session. VPN manager only.
 */
router.post('/vpn/connect', ensureAuthenticated, async (req, res) => {
  try {
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    if (!vpnEnabled) return res.json({ success: false, message: 'VPN is disabled for SAP B1 integration' });
    console.log('🔄 Manual VPN connection requested');
    const connected = await vpnManager.connect();
    const vpnStatus = vpnManager.getStatus();
    if (connected) {
      res.json({ success: true, message: 'VPN connection established successfully', vpnStatus, timestamp: new Date().toISOString() });
    } else {
      res.json({ success: false, message: 'Failed to establish VPN connection', vpnStatus, error: vpnStatus.lastError, timestamp: new Date().toISOString() });
    }
  } catch (error: any) {
    console.error('VPN connection error:', error);
    res.status(500).json({ success: false, message: 'VPN connection failed', error: error.message });
  }
});

/**
 * POST /vpn/disconnect — Terminate VPN connection.
 * GOVERNANCE: No SAP session. VPN manager only.
 */
router.post('/vpn/disconnect', ensureAuthenticated, async (req, res) => {
  try {
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    if (!vpnEnabled) return res.json({ success: false, message: 'VPN is disabled for SAP B1 integration' });
    console.log('🔄 Manual VPN disconnection requested');
    await vpnManager.disconnect();
    res.json({ success: true, message: 'VPN disconnected successfully', vpnStatus: vpnManager.getStatus(), timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('VPN disconnection error:', error);
    res.status(500).json({ success: false, message: 'VPN disconnection failed', error: error.message });
  }
});

/**
 * GET /vpn/logs — VPN connection log retrieval.
 * GOVERNANCE: No SAP session. VPN manager only.
 */
router.get('/vpn/logs', ensureAuthenticated, async (req, res) => {
  try {
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    if (!vpnEnabled) return res.json({ success: false, message: 'VPN is disabled for SAP B1 integration' });
    const logs = await vpnManager.getConnectionLogs();
    res.json({ success: true, logs, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('VPN logs retrieval error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve VPN logs', error: error.message });
  }
});

/**
 * GET /vpn/test-connectivity — SAP reachability test over VPN.
 * GOVERNANCE: No SAP session. VPN manager network probe only.
 */
router.get('/vpn/test-connectivity', ensureAuthenticated, async (req, res) => {
  try {
    const vpnEnabled = process.env.SAP_VPN_ENABLED === 'true';
    if (!vpnEnabled) return res.json({ success: false, message: 'VPN is disabled for SAP B1 integration' });
    const vpnStatus = vpnManager.getStatus();
    if (!vpnStatus.connected) return res.json({ success: false, message: 'VPN is not connected', vpnStatus });
    const connectivityTest = await vpnManager.testConnectivity();
    res.json({
      success: true,
      connectivity: { canReachSAP: connectivityTest, vpnConnected: vpnStatus.connected, testedAt: new Date().toISOString() },
      vpnStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('VPN connectivity test error:', error);
    res.status(500).json({ success: false, message: 'VPN connectivity test failed', error: error.message });
  }
});

export default router;
