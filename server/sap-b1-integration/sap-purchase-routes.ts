import express from 'express';
import multer from 'multer';
import { ensureAuthenticated } from '../middleware/auth-middleware';
import { requireSapAccess, requireSapSession } from '../middleware/sap-auth-middleware';
import { sapHttpsClient, SapHttpsClient } from './sap-https-client';
import { pool } from '../db';
import { getGrpoQcChecklistConfig, validateGrpoQcPayload } from '@shared/grpo-qc-config';

const router = express.Router();

function getIndianFinancialYearStart(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
}

// Settings-only routes that don't need SAP session
const settingsRouter = express.Router();
settingsRouter.use(ensureAuthenticated);
settingsRouter.use(requireSapAccess);

// Apply full middleware to SAP data routes
router.use(ensureAuthenticated);
router.use(requireSapAccess);
router.use(requireSapSession);

// Helper function to make authenticated SAP requests with ROUTEID stickiness
async function makeSapRequest(req: express.Request, path: string, options: any = {}) {
  const { sessionId, routeId } = req.sapSession!;
  
  const headers = {
    'Cookie': `B1SESSION=${sessionId}${routeId ? `; ROUTEID=${routeId}` : ''}`,
    ...options.headers
  };

  return await sapHttpsClient.authenticatedRequest(sessionId, {
    ...options,
    path,
    headers
  });
}

// Helper function to handle SAP API responses
function handleSapResponse(response: any, res: express.Response, operation: string) {
  if (response.statusCode === 401) {
    return res.status(401).json({
      success: false,
      error: 'SAP session expired. Please login again.',
      code: 'SAP_SESSION_EXPIRED'
    });
  }
  
  if (response.statusCode === 403) {
    return res.status(403).json({
      success: false,
      error: 'Insufficient SAP permissions for this operation.',
      code: 'SAP_INSUFFICIENT_PERMISSIONS'
    });
  }
  
  if (response.statusCode >= 500) {
    return res.status(502).json({
      success: false,
      error: 'SAP Service Layer unavailable. Please try again later.',
      code: 'SAP_SERVICE_UNAVAILABLE'
    });
  }
  
  if (!response.ok) {
    return res.status(400).json({
      success: false,
      error: `${operation} failed: ${response.statusCode}`,
      code: 'SAP_OPERATION_FAILED',
      details: response.body
    });
  }
  
  return null; // Success - no error response needed
}

// Dashboard - Live SAP stats (lean model: SAP = source of truth)
settingsRouter.get('/dashboard', async (req: any, res) => {
  try {
    const userId = req.user!.id;

    let fyStartDate = '2025-04-01';
    try {
      const settingsResult = await pool.query(
        'SELECT fy_start_date FROM sap_sync_settings WHERE user_id = $1',
        [userId]
      );
      if (settingsResult.rows.length > 0 && settingsResult.rows[0].fy_start_date) {
        const fyDate = settingsResult.rows[0].fy_start_date;
        fyStartDate = typeof fyDate === 'string' ? fyDate : fyDate.toISOString().split('T')[0];
      }
    } catch (err) {
      console.warn('Failed to get FY settings, using default:', err);
    }

    let syncStatus = null;
    try {
      const syncResult = await pool.query(
        'SELECT auto_sync_enabled, last_sync_at, next_sync_at, sync_interval_minutes FROM sap_sync_settings WHERE user_id = $1',
        [userId]
      );
      if (syncResult.rows.length > 0) {
        syncStatus = {
          autoSyncEnabled: syncResult.rows[0].auto_sync_enabled,
          lastSyncAt: syncResult.rows[0].last_sync_at,
          nextSyncAt: syncResult.rows[0].next_sync_at,
          syncIntervalMinutes: syncResult.rows[0].sync_interval_minutes
        };
      }
    } catch (err) {
      console.warn('Failed to get sync status:', err);
    }

    let totalOrders = 0, openOrders = 0, closedOrders = 0, totalValue = 0, openValue = 0;
    let uniqueVendors = 0;
    let totalInvoices = 0, pendingInvoices = 0, paidInvoices = 0, invoiceTotalValue = 0;
    let totalGrpo = 0, pendingGrpo = 0, completedGrpo = 0;
    let recentOrders: any[] = [];
    let sapAvailable = false;

    try {
      const sapClient = new SapHttpsClient();
      const sapServiceUrl = 'https://59.152.52.58:50000/b1s/v1';
      const loginResponse = await sapClient.request({
        method: 'POST', url: `${sapServiceUrl}/Login`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CompanyDB: process.env.SAP_COMPANY_DB, UserName: process.env.SAP_USERNAME, Password: process.env.SAP_PASSWORD }),
        timeout: 15000
      });

      if (loginResponse.statusCode === 200) {
        sapAvailable = true;
        const requestHeaders = {
          'Content-Type': 'application/json',
          'Cookie': loginResponse.headers['set-cookie']?.join('; ') || ''
        };

        const [allPOResp, openPOResp, recentPOResp, invoiceResp, openInvoiceResp, grpoResp, openGrpoResp, vendorResp] = await Promise.all([
          sapClient.request({
            method: 'GET',
            url: `${sapServiceUrl}/PurchaseOrders/$count?$filter=DocDate ge '${fyStartDate}'`,
            headers: requestHeaders, timeout: 30000
          }),
          sapClient.request({
            method: 'GET',
            url: `${sapServiceUrl}/PurchaseOrders/$count?$filter=DocDate ge '${fyStartDate}' and DocumentStatus eq 'bost_Open'`,
            headers: requestHeaders, timeout: 30000
          }),
          sapClient.request({
            method: 'GET',
            url: `${sapServiceUrl}/PurchaseOrders?$filter=DocDate ge '${fyStartDate}'&$select=DocEntry,DocNum,DocDate,CardName,DocTotal,DocumentStatus&$orderby=DocDate desc&$top=5`,
            headers: requestHeaders, timeout: 30000
          }),
          sapClient.request({
            method: 'GET',
            url: `${sapServiceUrl}/PurchaseInvoices/$count?$filter=DocDate ge '${fyStartDate}'`,
            headers: requestHeaders, timeout: 30000
          }),
          sapClient.request({
            method: 'GET',
            url: `${sapServiceUrl}/PurchaseInvoices/$count?$filter=DocDate ge '${fyStartDate}' and DocumentStatus eq 'bost_Open'`,
            headers: requestHeaders, timeout: 30000
          }),
          sapClient.request({
            method: 'GET',
            url: `${sapServiceUrl}/PurchaseDeliveryNotes/$count?$filter=DocDate ge '${fyStartDate}'`,
            headers: requestHeaders, timeout: 30000
          }),
          sapClient.request({
            method: 'GET',
            url: `${sapServiceUrl}/PurchaseDeliveryNotes/$count?$filter=DocDate ge '${fyStartDate}' and DocumentStatus eq 'bost_Open'`,
            headers: requestHeaders, timeout: 30000
          }),
          sapClient.request({
            method: 'GET',
            url: `${sapServiceUrl}/BusinessPartners/$count?$filter=CardType eq 'cSupplier' and Valid eq 'tYES'`,
            headers: requestHeaders, timeout: 30000
          }),
        ]);

        if (allPOResp.statusCode === 200) {
          const cnt = parseInt(allPOResp.body);
          if (!isNaN(cnt)) totalOrders = cnt;
        }

        if (openPOResp.statusCode === 200) {
          const cnt = parseInt(openPOResp.body);
          if (!isNaN(cnt)) openOrders = cnt;
        }
        closedOrders = totalOrders - openOrders;

        if (recentPOResp.statusCode === 200) {
          const recentData = JSON.parse(recentPOResp.body);
          recentOrders = (recentData.value || []).map((po: any) => ({
            DocEntry: po.DocEntry, DocNum: po.DocNum, DocDate: po.DocDate,
            CardName: po.CardName, DocTotal: po.DocTotal, DocumentStatus: po.DocumentStatus
          }));
        }

        if (invoiceResp.statusCode === 200) {
          const cnt = parseInt(invoiceResp.body);
          if (!isNaN(cnt)) totalInvoices = cnt;
        }
        if (openInvoiceResp.statusCode === 200) {
          const cnt = parseInt(openInvoiceResp.body);
          if (!isNaN(cnt)) pendingInvoices = cnt;
        }
        paidInvoices = totalInvoices - pendingInvoices;

        if (grpoResp.statusCode === 200) {
          const cnt = parseInt(grpoResp.body);
          if (!isNaN(cnt)) totalGrpo = cnt;
        }
        if (openGrpoResp.statusCode === 200) {
          const cnt = parseInt(openGrpoResp.body);
          if (!isNaN(cnt)) pendingGrpo = cnt;
        }
        completedGrpo = totalGrpo - pendingGrpo;

        if (vendorResp.statusCode === 200) {
          const cnt = parseInt(vendorResp.body);
          if (!isNaN(cnt)) uniqueVendors = cnt;
        }

        try {
          const poValueResp = await sapClient.request({
            method: 'GET',
            url: `${sapServiceUrl}/PurchaseOrders?$filter=DocDate ge '${fyStartDate}'&$select=DocTotal&$top=1&$inlinecount=allpages`,
            headers: requestHeaders, timeout: 15000
          });
          if (poValueResp.statusCode === 200) {
            const valData = JSON.parse(poValueResp.body);
            totalValue = (valData.value || []).reduce((s: number, o: any) => s + (parseFloat(o.DocTotal) || 0), 0);
          }
        } catch {}

        try {
          const invValueResp = await sapClient.request({
            method: 'GET',
            url: `${sapServiceUrl}/PurchaseInvoices?$filter=DocDate ge '${fyStartDate}'&$select=DocTotal&$top=1&$inlinecount=allpages`,
            headers: requestHeaders, timeout: 15000
          });
          if (invValueResp.statusCode === 200) {
            const valData = JSON.parse(invValueResp.body);
            invoiceTotalValue = (valData.value || []).reduce((s: number, o: any) => s + (parseFloat(o.DocTotal) || 0), 0);
          }
        } catch {}

        try { await sapClient.request({ method: 'POST', url: `${sapServiceUrl}/Logout`, headers: requestHeaders }); } catch {}
      }
    } catch (sapErr: any) {
      console.warn(`[Dashboard] SAP unavailable: ${sapErr.message}`);
    }

    if (!sapAvailable) {
      console.log(`[Dashboard] SAP unavailable — returning explicit unavailable state`);
      return res.json({
        success: true,
        status: 'sap_unavailable',
        data: null,
        warning: 'SAP Service Layer is currently unavailable. Dashboard data cannot be loaded. Please check VPN connectivity and SAP server status.',
        fyStartDate,
        syncStatus,
      });
    }

    const dashboard = {
      purchaseOrders: {
        total: totalOrders,
        pending: openOrders,
        approved: closedOrders,
        totalValue: Math.round(totalValue)
      },
      purchaseInvoices: { total: totalInvoices, pending: pendingInvoices, paid: paidInvoices, totalValue: Math.round(invoiceTotalValue) },
      vendors: { total: uniqueVendors, active: uniqueVendors },
      goodsReceipt: { total: totalGrpo, pending: pendingGrpo, completed: completedGrpo },
      recentActivity: recentOrders.map(order => ({
        type: 'Purchase Order',
        description: `PO-${order.DocNum} - ${order.CardName}`,
        timestamp: order.DocDate,
        amount: order.DocTotal
      })),
      alerts: [
        totalOrders > 800 ? 'High volume of purchase orders detected' : null,
        openValue > 1000000 ? 'High value open orders require attention' : null
      ].filter(Boolean),
      fyStartDate,
      syncStatus,
      source: 'sap_live'
    };

    console.log(`[Dashboard] SAP live. ${totalOrders} total orders, ${openOrders} open, ₹${totalValue.toLocaleString()} total value`);

    res.json({ success: true, status: 'sap_live', data: dashboard });

  } catch (error) {
    console.error('SAP dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to load dashboard data', code: 'SAP_DASHBOARD_ERROR' });
  }
});

// Purchase Quotations
router.get('/quotations', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const fyStart = getIndianFinancialYearStart();
    const filters = [`DocDate ge '${fyStart}'`];
    if (search) {
      filters.push(`(contains(CardName,'${search}') or contains(DocNum,'${search}'))`);
    }
    const filter = `$filter=${filters.join(' and ')}`;
    
    const queryParams = [
      `$top=${limit}`,
      `$skip=${skip}`,
      '$orderby=DocDate desc',
      filter
    ].filter(Boolean).join('&');
    
    const response = await makeSapRequest(req, `/b1s/v1/PurchaseQuotations?${queryParams}`);
    const errorResponse = handleSapResponse(response, res, 'Quotations query');
    if (errorResponse) return;

    const data = JSON.parse(response.body);
    
    res.json({
      success: true,
      data: {
        quotations: data.value || [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: data['@odata.count'] || data.value?.length || 0
        }
      }
    });

  } catch (error) {
    console.error('SAP quotations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load quotations',
      code: 'SAP_QUOTATIONS_ERROR'
    });
  }
});

// Purchase Order Series from SAP
router.get('/orders/series', async (req, res) => {
  try {
    const response = await makeSapRequest(req, `/b1s/v1/SeriesService_GetDocumentSeries`, 'POST', {
      DocumentTypeParams: { Document: '22' }
    });
    const errResp = handleSapResponse(response, res, 'PO series query');
    if (errResp) return;
    const data = JSON.parse(response.body);
    const series = (data.value || []).map((s: any) => ({
      Series: s.Series,
      SeriesName: s.Name,
      InitialNumber: s.InitialNumber,
      NextNumber: s.NextNumber
    }));
    res.json({ success: true, data: series });
  } catch (error) {
    console.error('PO series error:', error);
    res.status(500).json({ success: false, error: 'Failed to load PO series' });
  }
});

// Purchase Orders - Always live from SAP
router.get('/orders', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, series } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const fyStartDate = getIndianFinancialYearStart();
    let filterParts = [`DocDate ge '${fyStartDate}'`];
    if (status && status !== 'all') {
      filterParts.push(`DocumentStatus eq '${status === 'bost_Open' ? 'bost_Open' : 'bost_Close'}'`);
    }
    if (series && series !== 'all') {
      filterParts.push(`Series eq ${Number(series)}`);
    }
    if (search && search.toString().trim()) {
      const searchVal = search.toString().trim().replace(/'/g, "''");
      const searchNum = parseInt(searchVal);
      if (!isNaN(searchNum) && searchVal === String(searchNum)) {
        filterParts.push(`DocNum eq ${searchNum}`);
      } else {
        filterParts.push(`(contains(CardName,'${searchVal}') or contains(CardCode,'${searchVal}'))`);
      }
    }
    const filterStr = filterParts.join(' and ');
    const queryStr = `$top=${Number(limit)}&$skip=${offset}&$orderby=DocDate desc&$filter=${filterStr}&$inlinecount=allpages`;

    const response = await makeSapRequest(req, `/b1s/v1/PurchaseOrders?${queryStr}`);
    const errResp = handleSapResponse(response, res, 'Purchase orders query');
    if (errResp) return;

    const sapData = JSON.parse(response.body);
    const orders = (sapData.value || []).map((po: any) => ({
      DocEntry: po.DocEntry,
      DocNum: po.DocNum,
      DocDate: po.DocDate,
      DocDueDate: po.DocDueDate,
      CardCode: po.CardCode,
      CardName: po.CardName,
      DocTotal: po.DocTotal,
      DocumentStatus: po.DocumentStatus,
      cancelled: po.Cancelled === 'tYES' ? 'Y' : 'N',
      comments: po.Comments,
      doc_currency: po.DocCurrency,
      VatSum: po.VatSum,
      ContactPerson: po.ContactPersonCode,
      NumAtCard: po.NumAtCard,
      Project: po.Project,
      Series: po.Series
    }));

    res.json({
      success: true,
      source: 'sap_live',
      data: {
        orders,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: sapData['odata.count'] ? parseInt(sapData['odata.count']) : orders.length
        }
      }
    });

  } catch (error) {
    console.error('Purchase orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load purchase orders',
      code: 'ORDERS_ERROR'
    });
  }
});

// Single Purchase Order full detail from SAP
router.get('/orders/:docEntry', async (req, res) => {
  try {
    const { docEntry } = req.params;
    if (!docEntry || isNaN(Number(docEntry))) {
      return res.status(400).json({ success: false, error: 'Valid DocEntry is required' });
    }
    const response = await makeSapRequest(req, `/b1s/v1/PurchaseOrders(${docEntry})`);
    const errorResponse = handleSapResponse(response, res, 'Purchase order detail');
    if (errorResponse) return;
    const po = JSON.parse(response.body);
    res.json({ success: true, data: po });
  } catch (error) {
    console.error('SAP PO detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to load purchase order detail' });
  }
});

// Purchase Order Line Items - Real-time from SAP
router.get('/orders/:docEntry/items', async (req, res) => {
  try {
    const { docEntry } = req.params;
    
    if (!docEntry || isNaN(Number(docEntry))) {
      return res.status(400).json({
        success: false,
        error: 'Valid DocEntry is required',
        code: 'INVALID_DOC_ENTRY'
      });
    }

    const response = await makeSapRequest(req, `/b1s/v1/PurchaseOrders(${docEntry})/DocumentLines`);
    const errorResponse = handleSapResponse(response, res, 'Purchase order items query');
    if (errorResponse) return;

    const data = JSON.parse(response.body);
    
    res.json({
      success: true,
      data: {
        items: data.value || [],
        docEntry: Number(docEntry)
      }
    });

  } catch (error) {
    console.error('Purchase order items error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load purchase order items',
      code: 'SAP_PO_ITEMS_ERROR'
    });
  }
});

// Goods Receipt POs
router.get('/receipts', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const fyStart = getIndianFinancialYearStart();
    const filters = [`DocDate ge '${fyStart}'`];
    if (search) {
      filters.push(`(contains(CardName,'${search}') or contains(DocNum,'${search}'))`);
    }
    const filter = `$filter=${filters.join(' and ')}`;
    
    const queryParams = [
      `$top=${limit}`,
      `$skip=${skip}`,
      '$orderby=DocDate desc',
      filter
    ].filter(Boolean).join('&');
    
    const response = await makeSapRequest(req, `/b1s/v1/PurchaseDeliveryNotes?${queryParams}`);
    const errorResponse = handleSapResponse(response, res, 'Goods receipts query');
    if (errorResponse) return;

    const data = JSON.parse(response.body);
    
    res.json({
      success: true,
      data: {
        receipts: data.value || [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: data['@odata.count'] || data.value?.length || 0
        }
      }
    });

  } catch (error) {
    console.error('SAP goods receipts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load goods receipts',
      code: 'SAP_RECEIPTS_ERROR'
    });
  }
});

// Purchase Invoices
router.get('/invoices', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    const fyStart = getIndianFinancialYearStart();
    let filters = [`DocDate ge '${fyStart}'`];
    if (search) {
      filters.push(`(contains(CardName,'${search}') or contains(DocNum,'${search}'))`);
    }
    if (status && status !== 'all') {
      filters.push(`DocumentStatus eq '${status}'`);
    }
    
    const filterString = `$filter=${filters.join(' and ')}`;
    
    const queryParams = [
      `$top=${limit}`,
      `$skip=${skip}`,
      '$orderby=DocDate desc',
      filterString
    ].filter(Boolean).join('&');
    
    const response = await makeSapRequest(req, `/b1s/v1/PurchaseInvoices?${queryParams}`);
    const errorResponse = handleSapResponse(response, res, 'Purchase invoices query');
    if (errorResponse) return;

    const data = JSON.parse(response.body);
    
    res.json({
      success: true,
      data: {
        invoices: data.value || [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: data['@odata.count'] || data.value?.length || 0
        }
      }
    });

  } catch (error) {
    console.error('SAP purchase invoices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load purchase invoices',
      code: 'SAP_INVOICES_ERROR'
    });
  }
});

router.get('/invoices/:docEntry', async (req, res) => {
  try {
    const { docEntry } = req.params;
    const response = await makeSapRequest(req, `/b1s/v1/PurchaseInvoices(${docEntry})`);
    const errorResponse = handleSapResponse(response, res, 'Purchase invoice detail');
    if (errorResponse) return;

    const invoice = JSON.parse(response.body);
    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('SAP invoice detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to load invoice detail' });
  }
});

// Sync Management Routes

// Get sync status and settings
router.get('/sync/status', async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Get sync settings
    let settings = await pool.query(
      'SELECT * FROM sap_sync_settings WHERE user_id = $1',
      [userId]
    );
    
    if (settings.rows.length === 0) {
      // Create default settings
      await pool.query(
        `INSERT INTO sap_sync_settings (user_id, auto_sync_enabled, sync_interval_minutes, business_hours_start, business_hours_end, business_timezone, fy_start_date) 
         VALUES ($1, true, 60, '09:00', '20:00', 'Asia/Kolkata', '2025-04-01')`,
        [userId]
      );
      
      settings = await pool.query(
        'SELECT * FROM sap_sync_settings WHERE user_id = $1',
        [userId]
      );
    }
    
    // Get recent sync history
    const history = await pool.query(
      'SELECT * FROM sap_sync_history WHERE user_id = $1 ORDER BY started_at DESC LIMIT 10',
      [userId]
    );
    
    // Check if sync is currently running
    const runningSyncs = await pool.query(
      'SELECT * FROM sap_sync_history WHERE user_id = $1 AND status = $2',
      [userId, 'in_progress']
    );
    
    const settingsData = settings.rows[0];
    res.json({
      success: true,
      data: {
        settings: {
          autoSyncEnabled: settingsData.auto_sync_enabled,
          syncIntervalMinutes: settingsData.sync_interval_minutes,
          businessHoursStart: settingsData.business_hours_start,
          businessHoursEnd: settingsData.business_hours_end,
          businessTimezone: settingsData.business_timezone,
          fyStartDate: settingsData.fy_start_date,
          fy_start_date: settingsData.fy_start_date,
          lastSyncAt: settingsData.last_sync_at,
          nextSyncAt: settingsData.next_sync_at
        },
        recentHistory: history.rows,
        isRunning: runningSyncs.rows.length > 0
      }
    });
    
  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync status',
      code: 'SYNC_STATUS_ERROR'
    });
  }
});

// Update sync settings (settings router - no SAP session required)
settingsRouter.put('/sync/settings', async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      autoSyncEnabled,
      syncIntervalMinutes,
      businessHoursStart,
      businessHoursEnd,
      businessTimezone,
      fyStartDate
    } = req.body;
    
    await pool.query(
      `UPDATE sap_sync_settings SET 
        auto_sync_enabled = $2,
        sync_interval_minutes = $3,
        business_hours_start = $4,
        business_hours_end = $5,
        business_timezone = $6,
        fy_start_date = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1`,
      [userId, autoSyncEnabled, syncIntervalMinutes, businessHoursStart, businessHoursEnd, businessTimezone, fyStartDate]
    );
    
    res.json({
      success: true,
      message: 'Sync settings updated successfully'
    });
    
  } catch (error) {
    console.error('Update sync settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update sync settings',
      code: 'SYNC_SETTINGS_UPDATE_ERROR'
    });
  }
});

// Stop running sync
settingsRouter.post('/sync/stop', async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Find any running syncs for this user
    const runningSyncs = await pool.query(
      'SELECT * FROM sap_sync_history WHERE user_id = $1 AND status = $2',
      [userId, 'in_progress']
    );
    
    if (runningSyncs.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No running sync found to stop',
        code: 'NO_RUNNING_SYNC'
      });
    }
    
    // Update all running syncs to stopped status
    const updateResult = await pool.query(
      `UPDATE sap_sync_history 
       SET status = 'stopped', 
           completed_at = NOW(),
           error_message = 'Manually stopped by user'
       WHERE user_id = $1 AND status = 'in_progress'
       RETURNING *`,
      [userId]
    );
    
    console.log(`Stopped ${updateResult.rows.length} sync process(es) for user ${userId}`);
    
    res.json({
      success: true,
      data: {
        message: 'Sync stopped successfully',
        stoppedSyncs: updateResult.rows.length
      }
    });
    
  } catch (error) {
    console.error('Stop sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop sync',
      code: 'SYNC_STOP_ERROR'
    });
  }
});

// Trigger manual sync (moved to settings router - no SAP session required)
settingsRouter.post('/sync/trigger', async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Check if sync is already running
    const runningSyncs = await pool.query(
      'SELECT * FROM sap_sync_history WHERE user_id = $1 AND status = $2',
      [userId, 'in_progress']
    );
    
    if (runningSyncs.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Sync is already in progress',
        code: 'SYNC_ALREADY_RUNNING'
      });
    }
    
    // Create sync history record
    const syncRecord = await pool.query(
      'INSERT INTO sap_sync_history (user_id, sync_type, started_at, status) VALUES ($1, $2, NOW(), $3) RETURNING id',
      [userId, 'manual', 'in_progress']
    );
    
    const syncId = syncRecord.rows[0].id;
    
    // Perform sync immediately and return result
    let documentsProcessed = 0;
    let errorOccurred = false;
    let errorMessage = null;
    
    try {
      // Create direct SAP connection for sync (bypass session requirement)
      const sapClient = new SapHttpsClient();
      
      // Force correct SAP Service Layer URL - override incorrect env var
      const sapServiceUrl = 'https://59.152.52.58:50000/b1s/v1';
      console.log(`Using SAP Service Layer URL: ${sapServiceUrl}`);
      
      // Login to SAP B1 Service Layer with retry logic
      let loginResponse;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          console.log(`SAP login attempt ${retryCount + 1}/${maxRetries + 1} for user ${userId}`);
            
          loginResponse = await sapClient.request({
            method: 'POST',
            url: `${sapServiceUrl}/Login`,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              CompanyDB: process.env.SAP_COMPANY_DB,
              UserName: process.env.SAP_USERNAME,
              Password: process.env.SAP_PASSWORD
            }),
            timeout: 300000 // 5 minutes timeout
          });
          
          if (loginResponse.statusCode === 200) {
            console.log(`SAP login successful for user ${userId}`);
            break;
          }
          
        } catch (loginError: any) {
          console.error(`SAP login attempt ${retryCount + 1} failed:`, loginError.message);
          if (retryCount === maxRetries) {
            throw new Error(`SAP connection timeout - please verify SAP system is accessible at ${sapServiceUrl}. Error: ${loginError.message}`);
          }
          retryCount++;
          // Wait 5 seconds before retry
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      if (loginResponse.statusCode !== 200) {
        throw new Error(`SAP login failed: ${loginResponse.statusCode}`);
      }

      // Extract session cookies for subsequent requests
      const sessionCookie = loginResponse.headers['set-cookie']?.find(cookie => 
        cookie.startsWith('B1SESSION=') || cookie.startsWith('ROUTEID=')
      );
      
      const requestHeaders = {
        'Content-Type': 'application/json',
        'Cookie': loginResponse.headers['set-cookie']?.join('; ') || ''
      };

      // Get sync date filter from settings
      const syncSettings = await pool.query(
        'SELECT fy_start_date FROM sap_sync_settings WHERE user_id = $1',
        [userId]
      );
      
      let fyStartDate = '2025-04-01'; // Default
      if (syncSettings.rows.length > 0 && syncSettings.rows[0].fy_start_date) {
        const fyDate = syncSettings.rows[0].fy_start_date;
        fyStartDate = typeof fyDate === 'string' ? fyDate : fyDate.toISOString().split('T')[0];
      }
      
      // Sync Purchase Orders with pagination - process each batch immediately
      console.log(`Starting Purchase Orders sync from ${fyStartDate} using ${sapServiceUrl}`);
      
      let totalOrdersProcessed = 0;
      let skip = 0;
      const pageSize = 20; // Use 20 since SAP is limiting to 20 per request
      let hasMoreData = true;
      
      while (hasMoreData) {
        console.log(`Fetching orders batch: skip=${skip}, top=${pageSize}`);
        
        const ordersResponse = await sapClient.request({
          method: 'GET',
          url: `${sapServiceUrl}/PurchaseOrders?$top=${pageSize}&$skip=${skip}&$orderby=DocDate%20desc&$filter=DocDate%20ge%20'${fyStartDate}'`,
          headers: requestHeaders,
          timeout: 300000 // 5 minutes timeout
        });
        
        console.log(`Purchase Orders batch response: ${ordersResponse.statusCode}`);
        
        if (ordersResponse.statusCode === 200) {
          const batchData = JSON.parse(ordersResponse.body);
          const batchOrders = batchData.value || [];
          
          console.log(`SAP returned ${batchOrders.length} orders in this batch (skip=${skip})`);
          
          if (batchOrders.length > 0) {
            // Process this batch immediately
            console.log(`Processing batch of ${batchOrders.length} orders`);
            
            for (let i = 0; i < batchOrders.length; i++) {
              const order = batchOrders[i];
              totalOrdersProcessed++;
              
              try {
                // Lean model: No local mirror table writes (sap_purchase_orders, sap_purchase_order_items, sap_document_cache removed)
                // Sync now only counts documents from SAP for sync_history tracking
                if (totalOrdersProcessed % 100 === 0) {
                  console.log(`Processed ${totalOrdersProcessed} orders so far`);
                }
              } catch (error) {
                console.error(`Error processing order ${order.DocEntry}:`, error);
                throw error;
              }
            }
            
            console.log(`Completed batch processing. Total processed so far: ${totalOrdersProcessed}`);
            skip += pageSize;
            
            // Check if we got fewer results than requested - means we're at the end
            if (batchOrders.length < pageSize) {
              hasMoreData = false;
              console.log(`Reached end of data. Got ${batchOrders.length} < ${pageSize} records`);
            }
          } else {
            hasMoreData = false;
            console.log('No more orders to fetch');
          }
        } else {
          console.error(`Failed to fetch batch at skip=${skip}, status=${ordersResponse.statusCode}`);
          hasMoreData = false;
        }
        
        // Safety check to prevent infinite loops
        if (skip > 10000) {
          console.log('Safety limit reached at 10,000 records');
          hasMoreData = false;
        }
      }
      
      console.log(`Total orders processed and saved: ${totalOrdersProcessed}`);
      documentsProcessed += totalOrdersProcessed;
      
      // Sync Purchase Invoices with date filter
      const invoicesResponse = await sapClient.request({
        method: 'GET',
        url: `${process.env.SAP_SERVICE_LAYER_URL}/b1s/v1/PurchaseInvoices?$top=50&$orderby=DocDate%20desc&$filter=DocDate%20ge%20'${fyStartDate}'`,
        headers: requestHeaders
      });

      if (invoicesResponse.statusCode === 200) {
        const invoicesData = JSON.parse(invoicesResponse.body);
        documentsProcessed += invoicesData.value?.length || 0;
        // Lean model: No local cache writes. Invoice count tracked for sync_history only.
      }

      // Logout from SAP session
      try {
        await sapClient.request({
          method: 'POST',
          url: `${process.env.SAP_SERVICE_LAYER_URL}/b1s/v1/Logout`,
          headers: requestHeaders
        });
      } catch (logoutError) {
        console.warn('SAP logout warning:', logoutError);
      }
      
    } catch (syncError: any) {
      errorOccurred = true;
      errorMessage = syncError.message || 'Sync failed';
      console.error('Sync process error:', syncError);
    }
    
    // Update sync record with completion
    await pool.query(
      'UPDATE sap_sync_history SET completed_at = NOW(), status = $1, documents_synced = $2, error_message = $3 WHERE id = $4',
      [errorOccurred ? 'failed' : 'completed', documentsProcessed, errorMessage, syncId]
    );
    
    // Update sync settings with last sync time
    await pool.query(
      'UPDATE sap_sync_settings SET last_sync_at = NOW(), updated_at = NOW() WHERE user_id = $1',
      [userId]
    );
    
    if (errorOccurred) {
      return res.status(500).json({
        success: false,
        error: errorMessage,
        code: 'SYNC_FAILED'
      });
    }
    
    res.json({
      success: true,
      message: `✅ Sync completed successfully! Processed ${documentsProcessed} documents from SAP.`,
      data: {
        syncId,
        status: 'completed',
        documentsProcessed,
        completedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Trigger sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger sync',
      code: 'SYNC_TRIGGER_ERROR'
    });
  }
});

// Get sync status and settings
router.get('/sync/status', async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Get sync settings
    const settingsResult = await pool.query(
      'SELECT * FROM sap_sync_settings WHERE user_id = $1',
      [userId]
    );
    
    if (settingsResult.rows.length === 0) {
      // Create default settings if they don't exist
      await pool.query(
        `INSERT INTO sap_sync_settings (
          user_id, auto_sync_enabled, sync_interval_minutes, 
          business_hours_start, business_hours_end, business_timezone, fy_start_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, true, 60, '09:00:00', '20:00:00', 'Asia/Kolkata', '2024-04-01']
      );
      
      // Fetch the newly created settings
      const newSettingsResult = await pool.query(
        'SELECT * FROM sap_sync_settings WHERE user_id = $1',
        [userId]
      );
      settingsResult.rows = newSettingsResult.rows;
    }
    
    const settings = settingsResult.rows[0];
    
    // Get recent sync history
    const historyResult = await pool.query(
      'SELECT * FROM sap_sync_history WHERE user_id = $1 ORDER BY started_at DESC LIMIT 10',
      [userId]
    );
    
    // Check if sync is currently running
    const runningSync = await pool.query(
      'SELECT * FROM sap_sync_history WHERE user_id = $1 AND status = $2',
      [userId, 'in_progress']
    );
    
    res.json({
      success: true,
      data: {
        settings: {
          autoSyncEnabled: settings.auto_sync_enabled,
          syncIntervalMinutes: settings.sync_interval_minutes,
          businessHoursStart: settings.business_hours_start,
          businessHoursEnd: settings.business_hours_end,
          businessTimezone: settings.business_timezone,
          fy_start_date: settings.fy_start_date,
          lastSyncAt: settings.last_sync_at,
          nextSyncAt: settings.next_sync_at
        },
        recentHistory: historyResult.rows,
        isRunning: runningSync.rows.length > 0
      }
    });
    
  } catch (error) {
    console.error('Get sync status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync status',
      code: 'SYNC_STATUS_ERROR'
    });
  }
});

// Get sync settings
router.get('/sync/settings', async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const settings = await pool.query(
      'SELECT * FROM sap_sync_settings WHERE user_id = $1',
      [userId]
    );
    
    if (settings.rows.length === 0) {
      // Create default settings if none exist
      await pool.query(
        `INSERT INTO sap_sync_settings 
         (user_id, auto_sync_enabled, sync_interval_minutes, business_hours_start, business_hours_end, business_timezone, fy_start_date)
         VALUES ($1, true, 60, '09:00:00', '20:00:00', 'Asia/Kolkata', '2025-04-01')`,
        [userId]
      );
      
      const newSettings = await pool.query(
        'SELECT * FROM sap_sync_settings WHERE user_id = $1',
        [userId]
      );
      
      const setting = newSettings.rows[0];
      return res.json({
        success: true,
        data: {
          autoSyncEnabled: setting.auto_sync_enabled,
          syncIntervalMinutes: setting.sync_interval_minutes,
          businessHoursStart: setting.business_hours_start,
          businessHoursEnd: setting.business_hours_end,
          businessTimezone: setting.business_timezone,
          fyStartDate: setting.fy_start_date,
          fy_start_date: setting.fy_start_date,
          lastSyncAt: setting.last_sync_at,
          nextSyncAt: setting.next_sync_at
        }
      });
    }
    
    const setting = settings.rows[0];
    res.json({
      success: true,
      data: {
        autoSyncEnabled: setting.auto_sync_enabled,
        syncIntervalMinutes: setting.sync_interval_minutes,
        businessHoursStart: setting.business_hours_start,
        businessHoursEnd: setting.business_hours_end,
        businessTimezone: setting.business_timezone,
        fyStartDate: setting.fy_start_date,
        fy_start_date: setting.fy_start_date,
        lastSyncAt: setting.last_sync_at,
        nextSyncAt: setting.next_sync_at
      }
    });
    
  } catch (error) {
    console.error('Get sync settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync settings',
      code: 'SYNC_SETTINGS_ERROR'
    });
  }
});

// Update sync settings
router.put('/sync/settings', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { fyStartDate, autoSyncEnabled, syncIntervalMinutes, businessHoursStart, businessHoursEnd } = req.body;
    
    const updates = [];
    const values = [userId];
    let paramIndex = 2;
    
    if (fyStartDate !== undefined) {
      updates.push(`fy_start_date = $${paramIndex++}`);
      values.push(fyStartDate);
    }
    
    if (autoSyncEnabled !== undefined) {
      updates.push(`auto_sync_enabled = $${paramIndex++}`);
      values.push(autoSyncEnabled);
    }
    
    if (syncIntervalMinutes !== undefined) {
      updates.push(`sync_interval_minutes = $${paramIndex++}`);
      values.push(syncIntervalMinutes);
    }
    
    if (businessHoursStart !== undefined) {
      updates.push(`business_hours_start = $${paramIndex++}`);
      values.push(businessHoursStart);
    }
    
    if (businessHoursEnd !== undefined) {
      updates.push(`business_hours_end = $${paramIndex++}`);
      values.push(businessHoursEnd);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update',
        code: 'NO_UPDATES'
      });
    }
    
    updates.push(`updated_at = NOW()`);
    
    await pool.query(
      `UPDATE sap_sync_settings SET ${updates.join(', ')} WHERE user_id = $1`,
      values
    );
    
    res.json({
      success: true,
      message: 'Sync settings updated successfully'
    });
    
  } catch (error) {
    console.error('Update sync settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update sync settings',
      code: 'SYNC_SETTINGS_UPDATE_ERROR'
    });
  }
});

// Get sync history
router.get('/sync/history', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    const history = await pool.query(
      'SELECT * FROM sap_sync_history WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    
    const total = await pool.query(
      'SELECT COUNT(*) as count FROM sap_sync_history WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      success: true,
      data: {
        history: history.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: parseInt(total.rows[0].count)
        }
      }
    });
    
  } catch (error) {
    console.error('Sync history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync history',
      code: 'SYNC_HISTORY_ERROR'
    });
  }
});

// Helper function to perform sync operation with enhanced error handling
async function performSyncOperation(req: express.Request, userId: number, syncId: number, db: any) {
  let documentsProcessed = 0;
  let docEntriesProcessed: number[] = [];
  
  try {
    console.log(`Starting sync operation ${syncId} for user ${userId}`);
    
    // Get user's FY settings
    const settingsResult = await db.query(
      'SELECT fy_start_date FROM sap_sync_settings WHERE user_id = $1',
      [userId]
    );
    
    const fyStartDate = settingsResult.rows.length > 0 && settingsResult.rows[0].fy_start_date
      ? settingsResult.rows[0].fy_start_date.toISOString().split('T')[0]
      : '2025-04-01';
    
    const fyFilter = `DocDate ge '${fyStartDate}'`;
    
    // Document types to sync with DocEntry-based upsert
    const documentTypes = [
      { type: 'PurchaseOrder', endpoint: 'PurchaseOrders' },
      { type: 'PurchaseInvoice', endpoint: 'PurchaseInvoices' },
      { type: 'PurchaseQuotation', endpoint: 'PurchaseQuotations' },
      { type: 'PurchaseDeliveryNote', endpoint: 'PurchaseDeliveryNotes' }
    ];
    
    for (const docType of documentTypes) {
      try {
        console.log(`Syncing ${docType.type} documents...`);
        
        const response = await makeSapRequest(req, 
          `/b1s/v1/${docType.endpoint}?$select=DocEntry,DocNum,DocDate,DocTotal,DocumentStatus,CardCode,CardName,Cancelled,DocumentStatus&$filter=${fyFilter}&$orderby=DocEntry desc`
        );
        
        // Enhanced error handling for SAP auth errors
        if (response.statusCode === 401) {
          throw new Error('SAP_AUTH_ERROR: Session expired or invalid credentials');
        }
        
        if (response.statusCode === 403) {
          throw new Error('SAP_INSUFFICIENT_PERMISSIONS: Access denied to SAP resources');
        }
        
        if (!response.ok) {
          throw new Error(`SAP_API_ERROR: ${response.statusCode} - Request failed`);
        }
        
        const data = JSON.parse(response.body);
        const documents = data.value || [];
        
        // Lean model: No local cache writes. Count documents for sync_history only.
        for (const doc of documents) {
          docEntriesProcessed.push(doc.DocEntry);
          documentsProcessed++;
        }
        
        console.log(`Synced ${documents.length} ${docType.type} documents`);
        
      } catch (typeError) {
        console.error(`Error syncing ${docType.type}:`, typeError);
        
        // Stop gracefully on auth errors
        if (typeError instanceof Error && (typeError.message.includes('SAP_AUTH_ERROR') || typeError.message.includes('SAP_INSUFFICIENT_PERMISSIONS'))) {
          throw typeError;
        }
      }
    }
    
    // Update sync record as successful
    await db.query(
      'UPDATE sap_sync_history SET completed_at = CURRENT_TIMESTAMP, status = $1, documents_synced = $2, doc_entries_processed = $3 WHERE id = $4',
      ['success', documentsProcessed, docEntriesProcessed, syncId]
    );
    
    // Update last sync time in settings
    await db.query(
      'UPDATE sap_sync_settings SET last_sync_at = CURRENT_TIMESTAMP WHERE user_id = $1',
      [userId]
    );
    
    console.log(`Sync operation ${syncId} completed successfully. Processed ${documentsProcessed} documents.`);
    
  } catch (error) {
    console.error(`Sync operation ${syncId} failed:`, error);
    
    // Determine error code and message
    let errorCode = 'SYNC_GENERAL_ERROR';
    let errorMessage = 'Unknown error occurred';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      if (error.message.includes('SAP_AUTH_ERROR')) {
        errorCode = 'SAP_AUTH_ERROR';
      } else if (error.message.includes('SAP_INSUFFICIENT_PERMISSIONS')) {
        errorCode = 'SAP_INSUFFICIENT_PERMISSIONS';
      } else if (error.message.includes('SAP_API_ERROR')) {
        errorCode = 'SAP_API_ERROR';
      }
    }
    
    // Update sync record as failed
    await db.query(
      'UPDATE sap_sync_history SET completed_at = CURRENT_TIMESTAMP, status = $1, documents_synced = $2, doc_entries_processed = $3, error_message = $4, error_code = $5 WHERE id = $6',
      ['failed', documentsProcessed, docEntriesProcessed, errorMessage, errorCode, syncId]
    );
  }
}

// Dedicated Line Items Sync endpoint — DEPRECATED (lean model: line items fetched live from SAP)
settingsRouter.post('/sync/line-items', async (_req, res) => {
  console.warn('[DEPRECATED] POST /sync/line-items called — this endpoint is deprecated since lean architecture migration. Line items are fetched live from SAP.');
  res.status(410).json({
    success: false,
    deprecated: true,
    code: 'ENDPOINT_DEPRECATED',
    message: 'This endpoint is permanently removed. Line items are now fetched live from SAP when viewing PO details. No local sync is needed.',
    removedIn: 'Phase 1 — Lean Architecture Migration',
    alternative: 'GET /api/sap/b1/purchase/orders/:docEntry returns live line items from SAP',
  });
});

// ============================================================
// GRPO (Goods Receipt PO) Creation from Purchase Order
// ============================================================

const grpoLocks = new Map<number, { timestamp: number; userId: number }>();
const GRPO_LOCK_TIMEOUT_MS = 120000;

function cleanExpiredLocks() {
  const now = Date.now();
  for (const [key, lock] of grpoLocks.entries()) {
    if (now - lock.timestamp > GRPO_LOCK_TIMEOUT_MS) grpoLocks.delete(key);
  }
}

async function persistGrpoAudit(data: {
  poDocEntry: number;
  fingerprint: any;
  status: string;
  grpoDocEntry?: number;
  grpoDocNum?: number;
  sapError?: string;
  attachmentEntry?: number | null;
  attachmentFiles?: string[];
  durationMs?: number;
  createdBy?: number;
}) {
  try {
    await pool.query(
      `INSERT INTO grpo_audit_log (po_doc_entry, request_fingerprint, status, grpo_doc_entry, grpo_doc_num, sap_error, attachment_entry, attachment_files, duration_ms, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [data.poDocEntry, JSON.stringify(data.fingerprint), data.status, data.grpoDocEntry || null, data.grpoDocNum || null,
       data.sapError || null, data.attachmentEntry || null, data.attachmentFiles || null, data.durationMs || null, data.createdBy || null]
    );
  } catch (e: any) {
    console.error(`[GRPO_AUDIT] Failed to persist audit log:`, e.message);
  }
}

function makeGrpoFilename(originalname: string, poDocEntry?: string | number, index?: number, batchTimestamp?: number): string {
  const ext = originalname.split('.').pop() || '';
  const ts = batchTimestamp || Date.now();
  const poRef = poDocEntry ? `PO${poDocEntry}` : 'PO0';
  const idx = index ?? 1;
  return ext ? `GRPO_${poRef}_${ts}_${idx}.${ext}` : `GRPO_${poRef}_${ts}_${idx}`;
}

function buildMultipartBody(files: Array<{ buffer: Buffer; originalname: string; sapFilename?: string }>, boundary: string, poDocEntry?: string | number): Buffer {
  const batchTs = Date.now();
  const parts: Buffer[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filename = file.sapFilename || makeGrpoFilename(file.originalname, poDocEntry, i + 1, batchTs);
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    parts.push(Buffer.from(header, 'utf-8'));
    parts.push(file.buffer);
    parts.push(Buffer.from('\r\n', 'utf-8'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));
  return Buffer.concat(parts);
}

const grpoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.docx', '.doc', '.xls'];
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type ${ext} not allowed. Allowed: ${allowed.join(', ')}`));
  }
});

router.post('/grpo', grpoUpload.array('attachments', 5), async (req: any, res) => {
  const startTime = Date.now();
  let requestFingerprint: any = {};
  let sapSessionId: string | null = null;
  const sapClient = new SapHttpsClient();
  const sapServiceUrl = 'https://59.152.52.58:50000/b1s/v1';

  try {
    cleanExpiredLocks();

    const rawPayload = req.body.payload ? JSON.parse(req.body.payload) : req.body;
    const { poDocEntry, postingDate, remarks, selectedLines, headerUdfs } = rawPayload;
    const userId = req.user!.id;
    const files: any[] = req.files || [];

    requestFingerprint = {
      poDocEntry, postingDate,
      selectedLines: (selectedLines || []).map((l: any) => ({ lineNum: l.lineNum, qty: l.quantityToReceive })),
      userId, timestamp: new Date().toISOString(), fileCount: files.length
    };

    console.log(`[GRPO] Creation attempt:`, JSON.stringify(requestFingerprint));

    // === LAYER 1: Local DB Validation (fast pre-flight) ===

    if (!poDocEntry || !postingDate || !selectedLines || !Array.isArray(selectedLines) || selectedLines.length === 0) {
      return res.status(400).json({ success: false, error: 'Missing required fields: poDocEntry, postingDate, selectedLines', code: 'INVALID_REQUEST' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDate) || isNaN(new Date(postingDate).getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid posting date format. Use YYYY-MM-DD', code: 'INVALID_DATE' });
    }

    const hasAttachment = files.length > 0 || !!rawPayload.AttachmentEntry;
    if (!hasAttachment) {
      return res.status(400).json({ isValid: false, errorType: 'ATTACHMENT_REQUIRED', message: 'At least one attachment is mandatory before GRPO.', success: false, error: 'At least one attachment is mandatory before creating GRPO.', code: 'ATTACHMENT_REQUIRED' });
    }

    const cleanedLines = selectedLines.filter((l: any) => l.quantityToReceive > 0);
    if (cleanedLines.length === 0) {
      return res.status(400).json({ success: false, error: 'All selected lines have zero quantity', code: 'INVALID_QUANTITY' });
    }

    const seenBaseLines = new Set<number>();
    for (const line of cleanedLines) {
      if (seenBaseLines.has(line.lineNum)) {
        return res.status(400).json({ success: false, error: `Duplicate BaseLine ${line.lineNum} in selectedLines`, code: 'DUPLICATE_BASELINE' });
      }
      seenBaseLines.add(line.lineNum);
      if (line.quantityToReceive <= 0) {
        return res.status(400).json({ success: false, error: `Quantity must be greater than 0 for line ${line.lineNum}`, code: 'INVALID_QUANTITY' });
      }
    }

    if (grpoLocks.has(poDocEntry)) {
      const lock = grpoLocks.get(poDocEntry)!;
      if (Date.now() - lock.timestamp < GRPO_LOCK_TIMEOUT_MS) {
        console.log(`[GRPO] Duplicate submission blocked for PO ${poDocEntry}`);
        return res.status(409).json({ success: false, error: 'GRPO creation already in progress for this PO', code: 'DUPLICATE_SUBMISSION' });
      }
    }

    // === Set lock before SAP calls ===
    grpoLocks.set(poDocEntry, { timestamp: Date.now(), userId });

    // === SAP Session: Use user's authenticated session first, fallback to fresh login ===
    let requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

    if (req.sapSession?.sessionId) {
      sapSessionId = req.sapSession.sessionId;
      const routeId = req.sapSession.routeId;
      requestHeaders['Cookie'] = `B1SESSION=${sapSessionId}${routeId ? `; ROUTEID=${routeId}` : ''}`;
      console.log(`[GRPO] Using user's existing SAP session`);
    } else {
      let loginResponse;
      try {
        loginResponse = await sapClient.request({
          method: 'POST', url: `${sapServiceUrl}/Login`,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ CompanyDB: process.env.SAP_COMPANY_DB, UserName: process.env.SAP_USERNAME, Password: process.env.SAP_PASSWORD }),
          timeout: 60000
        });
      } catch (connErr: any) {
        grpoLocks.delete(poDocEntry);
        console.error(`[GRPO] SAP connection failed:`, connErr.message);
        return res.status(503).json({ success: false, error: 'Cannot connect to SAP Service Layer', code: 'SAP_UNREACHABLE' });
      }

      if (loginResponse.statusCode !== 200) {
        grpoLocks.delete(poDocEntry);
        return res.status(502).json({ success: false, error: `SAP login failed: ${loginResponse.statusCode}`, code: 'SAP_LOGIN_FAILED' });
      }

      const loginCookies = loginResponse.headers['set-cookie'];
      requestHeaders['Cookie'] = Array.isArray(loginCookies) ? loginCookies.join('; ') : (loginCookies || '');
      const sessionMatch = requestHeaders.Cookie.match(/B1SESSION=([^;]+)/);
      sapSessionId = sessionMatch ? sessionMatch[1] : null;
      console.log(`[GRPO] Using fresh SAP login session`);
    }

    // === LAYER 2: Live SAP Validation (MANDATORY) ===
    console.log(`[GRPO] Layer 2: Fetching live PO ${poDocEntry} from SAP`);

    let livePo: any;
    try {
      let livePOResponse = await sapClient.request({
        method: 'GET', url: `${sapServiceUrl}/PurchaseOrders(${poDocEntry})`,
        headers: requestHeaders, timeout: 60000
      });

      if (livePOResponse.statusCode === 401) {
        console.warn(`[GRPO] User SAP session expired (401). Retrying with fresh login...`);
        try {
          const retryLogin = await sapClient.request({
            method: 'POST', url: `${sapServiceUrl}/Login`,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ CompanyDB: process.env.SAP_COMPANY_DB, UserName: process.env.SAP_USERNAME, Password: process.env.SAP_PASSWORD }),
            timeout: 60000
          });
          if (retryLogin.statusCode === 200) {
            const retryCookies = retryLogin.headers['set-cookie'];
            requestHeaders['Cookie'] = Array.isArray(retryCookies) ? retryCookies.join('; ') : (retryCookies || '');
            const retryMatch = requestHeaders.Cookie.match(/B1SESSION=([^;]+)/);
            sapSessionId = retryMatch ? retryMatch[1] : null;
            console.log(`[GRPO] Fresh login successful, retrying PO fetch`);
            livePOResponse = await sapClient.request({
              method: 'GET', url: `${sapServiceUrl}/PurchaseOrders(${poDocEntry})`,
              headers: requestHeaders, timeout: 60000
            });
          }
        } catch (retryErr: any) {
          console.error(`[GRPO] Fresh login retry failed:`, retryErr.message);
        }
      }

      if (livePOResponse.statusCode !== 200) {
        grpoLocks.delete(poDocEntry);
        console.error(`[GRPO] SAP PO fetch failed: status=${livePOResponse.statusCode}, body=${livePOResponse.body?.substring(0, 500)}`);
        return res.status(400).json({ success: false, error: `PO ${poDocEntry} not found in SAP (status ${livePOResponse.statusCode})`, code: 'SAP_PO_NOT_FOUND' });
      }

      livePo = JSON.parse(livePOResponse.body);
    } catch (liveErr: any) {
      grpoLocks.delete(poDocEntry);
      console.error(`[GRPO] Live SAP validation failed:`, liveErr.message);
      return res.status(503).json({ success: false, error: 'Cannot validate PO status — SAP Service Layer is unreachable', code: 'SAP_UNREACHABLE' });
    }

    console.log(`[GRPO] PO ${poDocEntry} fetched: DocumentStatus=${livePo.DocumentStatus}, Cancelled=${livePo.Cancelled}, Lines=${(livePo.DocumentLines || []).length}`);

    if (livePo.Cancelled === 'tYES' || livePo.Cancelled === 'Y') {
      grpoLocks.delete(poDocEntry);
      return res.status(400).json({ success: false, error: `PO ${poDocEntry} is cancelled (confirmed by live SAP check)`, code: 'PO_CANCELLED' });
    }
    if (livePo.DocumentStatus === 'bost_Close' || livePo.DocumentStatus === 'C') {
      grpoLocks.delete(poDocEntry);
      return res.status(400).json({ success: false, error: `PO ${poDocEntry} is closed (confirmed by live SAP check)`, code: 'PO_CLOSED' });
    }

    const liveLines = livePo.DocumentLines || [];
    const validationErrors: any[] = [];
    const grpoDocumentLines: any[] = [];

    for (const sel of cleanedLines) {
      const liveLine = liveLines.find((l: any) => l.LineNum === sel.lineNum);
      if (!liveLine) {
        validationErrors.push({ lineNum: sel.lineNum, error: 'LINE_NOT_FOUND', message: `PO line ${sel.lineNum} not found in SAP` });
        continue;
      }

      if (liveLine.LineStatus === 'bost_Close' || liveLine.LineStatus === 'C') {
        validationErrors.push({ lineNum: sel.lineNum, error: 'LINE_CLOSED', message: `PO line ${sel.lineNum} is closed (confirmed by live SAP check)` });
        continue;
      }

      const rawOpenQty = parseFloat(liveLine.OpenQuantity ?? liveLine.RemainingOpenQuantity ?? 0);
      const liveOpenQty = rawOpenQty > 0 ? rawOpenQty : parseFloat(liveLine.Quantity || 0);
      if (sel.quantityToReceive > liveOpenQty) {
        validationErrors.push({ lineNum: sel.lineNum, error: 'EXCEEDS_OPEN_QTY', message: `Quantity ${sel.quantityToReceive} exceeds live open quantity ${liveOpenQty} for line ${sel.lineNum}` });
        continue;
      }

      const warehouseCode = sel.warehouseCode || liveLine.WarehouseCode || liveLine.WhsCode;
      const grpoLine: any = {
        Quantity: sel.quantityToReceive,
        WarehouseCode: warehouseCode,
        BaseType: 22,
        BaseEntry: poDocEntry,
        BaseLine: sel.lineNum
      };

      for (const [key, value] of Object.entries(liveLine)) {
        if (key.startsWith('U_') && value !== null && value !== undefined) {
          grpoLine[key] = value;
        }
      }

      if (sel.lineUdfs && typeof sel.lineUdfs === 'object') {
        for (const [key, value] of Object.entries(sel.lineUdfs)) {
          if (key.startsWith('U_')) grpoLine[key] = value;
        }
      }

      grpoDocumentLines.push(grpoLine);
    }

    if (validationErrors.length > 0) {
      grpoLocks.delete(poDocEntry);
      console.log(`[GRPO] Layer 2 validation failed:`, JSON.stringify(validationErrors));
      return res.status(400).json({ success: false, error: 'Validation failed', code: 'VALIDATION_FAILED', details: validationErrors });
    }

    console.log(`[GRPO] Layer 2 (live SAP) validation passed. ${grpoDocumentLines.length} lines validated.`);

    // === STEP 3: Upload Attachments via binary multipart (if any) ===
    let attachmentEntry: number | null = null;
    const attachmentFileNames: string[] = [];

    if (files.length > 0) {
      console.log(`[GRPO] Uploading ${files.length} attachment(s) to SAP via binary multipart`);

      try {
        const boundary = `----SAPAttachment${Date.now()}`;
        const multipartBody = buildMultipartBody(files, boundary, poDocEntry);
        files.forEach((f: any) => attachmentFileNames.push(f.originalname));

        const attachHeaders: Record<string, string> = {
          ...requestHeaders,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        };
        delete attachHeaders['Content-Type'];
        attachHeaders['Content-Type'] = `multipart/form-data; boundary=${boundary}`;

        const attachResponse = await sapClient.request({
          method: 'POST',
          url: `${sapServiceUrl}/Attachments2`,
          headers: attachHeaders,
          rawBody: multipartBody,
          timeout: 120000
        });

        if (attachResponse.statusCode === 200 || attachResponse.statusCode === 201) {
          const attachData = JSON.parse(attachResponse.body);
          attachmentEntry = attachData.AbsoluteEntry;
          console.log(`[GRPO] Attachment entry created via binary upload: ${attachmentEntry}`);
        } else {
          console.warn(`[GRPO] Binary attachment upload returned ${attachResponse.statusCode}: ${attachResponse.body}`);

          console.log(`[GRPO] Falling back to JSON metadata attachment method`);
          const fallbackBatchTs = Date.now();
          for (let fi = 0; fi < files.length; fi++) {
            const file = files[fi];
            const sapName = makeGrpoFilename(file.originalname, poDocEntry, fi + 1, fallbackBatchTs);
            const fileName = sapName.replace(/\.[^.]+$/, '');
            const fileExt = sapName.split('.').pop() || '';
            if (attachmentEntry === null) {
              const fallbackResponse = await sapClient.request({
                method: 'POST', url: `${sapServiceUrl}/Attachments2`,
                headers: requestHeaders,
                body: JSON.stringify({ Attachments2_Lines: [{ SourcePath: '', FileName: fileName, FileExtension: fileExt, Override: 'tYES' }] }),
                timeout: 60000
              });
              if (fallbackResponse.statusCode === 200 || fallbackResponse.statusCode === 201) {
                const fallbackData = JSON.parse(fallbackResponse.body);
                attachmentEntry = fallbackData.AbsoluteEntry;
                console.log(`[GRPO] Attachment entry created via JSON fallback: ${attachmentEntry}`);
              } else {
                console.warn(`[GRPO] JSON fallback also failed (${fallbackResponse.statusCode}). Proceeding without attachments.`);
              }
            }
          }
        }
      } catch (attachErr: any) {
        console.warn(`[GRPO] Attachment upload failed:`, attachErr.message);
        console.log(`[GRPO] Proceeding without attachments`);
        attachmentEntry = null;
      }
    }

    // === STEP 4: Create GRPO Document ===
    const grpoPayload: any = {
      CardCode: livePo.CardCode,
      DocDate: postingDate,
      DocDueDate: postingDate,
      Comments: remarks || `Goods Receipt against PO ${livePo.DocNum}`,
      DocumentLines: grpoDocumentLines
    };

    if (attachmentEntry !== null) {
      grpoPayload.AttachmentEntry = attachmentEntry;
    } else if (rawPayload.AttachmentEntry) {
      grpoPayload.AttachmentEntry = rawPayload.AttachmentEntry;
      console.log(`[GRPO] Using pre-uploaded AttachmentEntry: ${rawPayload.AttachmentEntry}`);
    }

    for (const [key, value] of Object.entries(livePo)) {
      if (key.startsWith('U_') && value !== null && value !== undefined) {
        grpoPayload[key] = value;
      }
    }

    if (headerUdfs && typeof headerUdfs === 'object') {
      for (const [key, value] of Object.entries(headerUdfs)) {
        if (key.startsWith('U_')) grpoPayload[key] = value;
      }
    }

    console.log(`[GRPO] Posting GRPO to SAP:`, JSON.stringify({ cardCode: grpoPayload.CardCode, lines: grpoPayload.DocumentLines.length, hasAttachment: !!attachmentEntry }));

    let grpoResponse: any;
    try {
      grpoResponse = await sapClient.request({
        method: 'POST', url: `${sapServiceUrl}/PurchaseDeliveryNotes`,
        headers: requestHeaders, body: JSON.stringify(grpoPayload), timeout: 300000
      });
    } catch (postErr: any) {
      grpoLocks.delete(poDocEntry);
      console.error(`[GRPO] TIMEOUT/ERROR during GRPO POST:`, postErr.message);
      await persistGrpoAudit({ poDocEntry, fingerprint: requestFingerprint, status: 'TIMEOUT_UNCERTAIN', sapError: postErr.message, attachmentEntry, attachmentFiles: attachmentFileNames, durationMs: Date.now() - startTime, createdBy: userId });
      return res.status(504).json({
        success: false,
        error: 'SAP did not respond in time. The GRPO may or may not have been created in SAP. Please verify in SAP B1 before retrying.',
        code: 'SAP_TIMEOUT_UNCERTAIN',
        requestFingerprint
      });
    }

    grpoLocks.delete(poDocEntry);

    if (grpoResponse.statusCode !== 200 && grpoResponse.statusCode !== 201) {
      let sapErrorMsg = grpoResponse.body;
      try {
        const errObj = JSON.parse(grpoResponse.body);
        sapErrorMsg = errObj.error?.message?.value || errObj.message || grpoResponse.body;
      } catch {}

      console.error(`[GRPO] SAP posting failed (${grpoResponse.statusCode}):`, sapErrorMsg);
      await persistGrpoAudit({ poDocEntry, fingerprint: requestFingerprint, status: 'SAP_FAILED', sapError: sapErrorMsg, attachmentEntry, attachmentFiles: attachmentFileNames, durationMs: Date.now() - startTime, createdBy: userId });
      return res.status(400).json({
        success: false, error: 'SAP posting failed', code: 'SAP_POSTING_FAILED',
        sapError: { code: grpoResponse.statusCode, message: sapErrorMsg }
      });
    }

    const grpoResult = JSON.parse(grpoResponse.body);
    const duration = Date.now() - startTime;

    console.log(`[GRPO] SUCCESS — DocEntry: ${grpoResult.DocEntry}, DocNum: ${grpoResult.DocNum}, Duration: ${duration}ms`);

    // === STEP 5: Post-GRPO audit (lean model — no local mirror table updates) ===
    // Local PO/GRPO mirror table writes removed. SAP is source of truth.
    // Only grpo_audit_log is persisted for traceability.

    await persistGrpoAudit({ poDocEntry, fingerprint: requestFingerprint, status: 'SUCCESS', grpoDocEntry: grpoResult.DocEntry, grpoDocNum: grpoResult.DocNum, attachmentEntry, attachmentFiles: attachmentFileNames, durationMs: duration, createdBy: userId });

    console.log(`[GRPO_AUDIT] ${JSON.stringify({
      event: 'GRPO_CREATION_SUCCESS', requestFingerprint,
      result: { grpoDocEntry: grpoResult.DocEntry, grpoDocNum: grpoResult.DocNum, docTotal: grpoResult.DocTotal, duration_ms: duration },
      attachmentEntry, attachmentFiles: attachmentFileNames
    })}`);

    // SAP Logout
    try {
      await sapClient.request({ method: 'POST', url: `${sapServiceUrl}/Logout`, headers: requestHeaders });
    } catch {}

    const linesPosted = grpoDocumentLines.map((l: any) => {
      const liveLine = liveLines.find((ll: any) => ll.LineNum === l.BaseLine);
      return { lineNum: l.BaseLine, itemCode: liveLine?.ItemCode || '', quantityReceived: l.Quantity, warehouseCode: l.WarehouseCode };
    });

    res.status(201).json({
      success: true,
      message: 'GRPO created successfully',
      data: {
        grpoDocEntry: grpoResult.DocEntry,
        grpoDocNum: grpoResult.DocNum,
        poDocEntry, poDocNum: livePo.DocNum,
        cardCode: livePo.CardCode, cardName: livePo.CardName,
        postingDate,
        docTotal: grpoResult.DocTotal || 0,
        linesPosted,
        attachmentEntry,
        attachmentFiles: attachmentFileNames
      }
    });

  } catch (error: any) {
    grpoLocks.delete(requestFingerprint.poDocEntry);
    console.error(`[GRPO] Unexpected error:`, error);
    await persistGrpoAudit({ poDocEntry: requestFingerprint.poDocEntry, fingerprint: requestFingerprint, status: 'ERROR', sapError: error.message, durationMs: Date.now() - startTime, createdBy: requestFingerprint.userId });

    if (sapSessionId) {
      try { await sapClient.request({ method: 'POST', url: `${sapServiceUrl}/Logout`, headers: { Cookie: `B1SESSION=${sapSessionId}` } }); } catch {}
    }

    res.status(500).json({ success: false, error: 'GRPO creation failed unexpectedly', code: 'GRPO_UNEXPECTED_ERROR', message: error.message });
  }
});

// === Direct GRPO endpoint — accepts SAP-native JSON format ===
router.post('/grpo/direct', async (req: any, res) => {
  const startTime = Date.now();
  const sapClient = new SapHttpsClient();
  const sapServiceUrl = 'https://59.152.52.58:50000/b1s/v1';
  const userId = req.user!.id;

  try {
    const payload = req.body;

    if (!payload.CardCode || !payload.DocumentLines || !Array.isArray(payload.DocumentLines) || payload.DocumentLines.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid payload: CardCode and DocumentLines are required', code: 'INVALID_REQUEST' });
    }

    const docLines = payload.DocumentLines.filter((l: any) => l.Quantity > 0);
    if (docLines.length === 0) {
      return res.status(400).json({ success: false, error: 'All lines have zero quantity', code: 'INVALID_QUANTITY' });
    }

    const baseEntries = new Set(docLines.map((l: any) => l.BaseEntry));
    if (baseEntries.size !== 1) {
      return res.status(400).json({ success: false, error: 'All lines must reference the same PO (BaseEntry)', code: 'INCONSISTENT_BASE_ENTRY' });
    }

    const seenBaseLines = new Set<number>();
    for (const line of docLines) {
      if (line.BaseType !== 22) {
        return res.status(400).json({ success: false, error: `Line BaseLine ${line.BaseLine} has invalid BaseType ${line.BaseType}, must be 22`, code: 'INVALID_BASE_TYPE' });
      }
      if (seenBaseLines.has(line.BaseLine)) {
        return res.status(400).json({ success: false, error: `Duplicate BaseLine ${line.BaseLine}`, code: 'DUPLICATE_BASELINE' });
      }
      seenBaseLines.add(line.BaseLine);
    }

    const poDocEntry = docLines[0].BaseEntry;

    console.log(`[GRPO-DIRECT] Validation+Post attempt for PO DocEntry ${poDocEntry}, ${docLines.length} lines, user ${userId}`);

    let loginResponse;
    try {
      loginResponse = await sapClient.request({
        method: 'POST', url: `${sapServiceUrl}/Login`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CompanyDB: process.env.SAP_COMPANY_DB, UserName: process.env.SAP_USERNAME, Password: process.env.SAP_PASSWORD }),
        timeout: 60000
      });
    } catch (connErr: any) {
      return res.status(503).json({ success: false, error: 'Cannot connect to SAP Service Layer', code: 'SAP_UNREACHABLE' });
    }

    if (loginResponse.statusCode !== 200) {
      return res.status(502).json({ success: false, error: `SAP login failed: ${loginResponse.statusCode}`, code: 'SAP_LOGIN_FAILED' });
    }

    const loginCookies = loginResponse.headers['set-cookie'];
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cookie': Array.isArray(loginCookies) ? loginCookies.join('; ') : (loginCookies || '')
    };

    // === STEP 1: Fetch live PO ===
    console.log(`[GRPO-DIRECT] Fetching live PO ${poDocEntry} from SAP`);
    let livePo: any;
    try {
      const livePOResponse = await sapClient.request({
        method: 'GET', url: `${sapServiceUrl}/PurchaseOrders(${poDocEntry})`,
        headers: requestHeaders, timeout: 60000
      });
      if (livePOResponse.statusCode !== 200) {
        return res.status(400).json({ success: false, error: `PO ${poDocEntry} not found in SAP (HTTP ${livePOResponse.statusCode})`, code: 'SAP_PO_NOT_FOUND' });
      }
      livePo = JSON.parse(livePOResponse.body);
    } catch (liveErr: any) {
      return res.status(503).json({ success: false, error: 'Cannot fetch PO from SAP', code: 'SAP_UNREACHABLE' });
    }

    // === STEP 2: Validate header ===
    if (livePo.Cancelled === 'tYES' || livePo.Cancelled === 'Y') {
      return res.status(400).json({ success: false, error: `PO ${poDocEntry} is cancelled`, code: 'PO_CANCELLED' });
    }
    if (livePo.DocumentStatus === 'bost_Close') {
      return res.status(400).json({ success: false, error: `PO ${poDocEntry} is closed`, code: 'PO_CLOSED' });
    }
    if (payload.CardCode !== livePo.CardCode) {
      return res.status(400).json({ success: false, error: `CardCode mismatch: payload has ${payload.CardCode}, PO has ${livePo.CardCode}`, code: 'CARDCODE_MISMATCH' });
    }

    // === STEP 3: Validate each line ===
    const liveLines = livePo.DocumentLines || [];
    const validationErrors: any[] = [];
    const validatedLines: any[] = [];

    for (const dl of docLines) {
      const liveLine = liveLines.find((l: any) => l.LineNum === dl.BaseLine);
      if (!liveLine) {
        validationErrors.push({ baseLine: dl.BaseLine, error: 'LINE_NOT_FOUND', message: `PO line ${dl.BaseLine} does not exist in SAP` });
        continue;
      }
      if (liveLine.LineStatus === 'bost_Close') {
        validationErrors.push({ baseLine: dl.BaseLine, itemCode: liveLine.ItemCode, error: 'LINE_CLOSED', message: `PO line ${dl.BaseLine} (${liveLine.ItemCode}) is closed` });
        continue;
      }
      const rawOpenQty2 = parseFloat(liveLine.OpenQuantity ?? liveLine.RemainingOpenQuantity ?? 0);
      const openQty = rawOpenQty2 > 0 ? rawOpenQty2 : parseFloat(liveLine.Quantity || 0);
      if (dl.Quantity > openQty) {
        validationErrors.push({ baseLine: dl.BaseLine, itemCode: liveLine.ItemCode, error: 'EXCEEDS_OPEN_QTY', message: `Qty ${dl.Quantity} exceeds open qty ${openQty} for line ${dl.BaseLine} (${liveLine.ItemCode})`, requestedQty: dl.Quantity, openQty });
        continue;
      }

      const validLine: any = {
        Quantity: dl.Quantity,
        WarehouseCode: dl.WarehouseCode || liveLine.WarehouseCode || liveLine.WhsCode,
        BaseType: 22,
        BaseEntry: poDocEntry,
        BaseLine: dl.BaseLine
      };

      for (const [key, value] of Object.entries(liveLine)) {
        if (key.startsWith('U_') && value !== null && value !== undefined) {
          validLine[key] = value;
        }
      }

      validatedLines.push(validLine);
    }

    if (validationErrors.length > 0) {
      console.log(`[GRPO-DIRECT] Validation FAILED: ${validationErrors.length} errors`, JSON.stringify(validationErrors));
      try { await sapClient.request({ method: 'POST', url: `${sapServiceUrl}/Logout`, headers: requestHeaders }); } catch {}
      return res.status(400).json({
        success: false,
        error: 'Pre-validation failed — GRPO NOT posted',
        code: 'VALIDATION_FAILED',
        validationResult: { passed: false, totalLines: docLines.length, failedLines: validationErrors.length, errors: validationErrors },
        poStatus: { docEntry: livePo.DocEntry, docNum: livePo.DocNum, status: livePo.DocumentStatus, cancelled: livePo.Cancelled, cardCode: livePo.CardCode, cardName: livePo.CardName }
      });
    }

    console.log(`[GRPO-DIRECT] All ${validatedLines.length} lines validated OK. Posting to SAP...`);

    // === STEP 4: Build final SAP payload ===
    const sapGrpoPayload: any = {
      CardCode: livePo.CardCode,
      DocDate: payload.DocDate || new Date().toISOString().split('T')[0],
      DocDueDate: payload.DocDate || new Date().toISOString().split('T')[0],
      Comments: payload.Comments || `Goods Receipt against PO ${livePo.DocNum}`,
      DocumentLines: validatedLines
    };

    if (payload.AttachmentEntry) {
      sapGrpoPayload.AttachmentEntry = payload.AttachmentEntry;
      console.log(`[GRPO-DIRECT] AttachmentEntry included: ${payload.AttachmentEntry}`);
    }

    for (const [key, value] of Object.entries(livePo)) {
      if (key.startsWith('U_') && value !== null && value !== undefined) {
        sapGrpoPayload[key] = value;
      }
    }

    console.log(`[GRPO-DIRECT] Final SAP payload:`, JSON.stringify(sapGrpoPayload, null, 2));

    // === STEP 5: POST to SAP ===
    let grpoResponse: any;
    try {
      grpoResponse = await sapClient.request({
        method: 'POST', url: `${sapServiceUrl}/PurchaseDeliveryNotes`,
        headers: requestHeaders, body: JSON.stringify(sapGrpoPayload), timeout: 300000
      });
    } catch (postErr: any) {
      console.error(`[GRPO-DIRECT] TIMEOUT/ERROR:`, postErr.message);
      return res.status(504).json({
        success: false, error: 'SAP did not respond in time. GRPO may or may not have been created.',
        code: 'SAP_TIMEOUT_UNCERTAIN',
        requestFingerprint: { poDocEntry, lineCount: validatedLines.length, quantities: validatedLines.map((l: any) => ({ baseLine: l.BaseLine, qty: l.Quantity })), timestamp: new Date().toISOString() }
      });
    }

    // === STEP 6: Handle response ===
    if (grpoResponse.statusCode !== 200 && grpoResponse.statusCode !== 201) {
      let sapErrorMsg = grpoResponse.body;
      let sapErrorDetail: any = {};
      try {
        const errObj = JSON.parse(grpoResponse.body);
        sapErrorMsg = errObj.error?.message?.value || errObj.message || grpoResponse.body;
        sapErrorDetail = errObj.error || errObj;
      } catch {}

      console.error(`[GRPO-DIRECT] SAP rejected (${grpoResponse.statusCode}):`, sapErrorMsg);
      try { await sapClient.request({ method: 'POST', url: `${sapServiceUrl}/Logout`, headers: requestHeaders }); } catch {}
      return res.status(400).json({
        success: false, error: 'SAP rejected the GRPO', code: 'SAP_POSTING_FAILED',
        sapError: { httpStatus: grpoResponse.statusCode, message: sapErrorMsg, detail: sapErrorDetail },
        payloadSent: sapGrpoPayload
      });
    }

    const grpoResult = JSON.parse(grpoResponse.body);
    const duration = Date.now() - startTime;

    console.log(`[GRPO-DIRECT] SUCCESS — DocEntry: ${grpoResult.DocEntry}, DocNum: ${grpoResult.DocNum}, Duration: ${duration}ms`);

    try { await sapClient.request({ method: 'POST', url: `${sapServiceUrl}/Logout`, headers: requestHeaders }); } catch {}

    const linesPosted = validatedLines.map((l: any) => {
      const liveLine = liveLines.find((ll: any) => ll.LineNum === l.BaseLine);
      return { baseLine: l.BaseLine, itemCode: liveLine?.ItemCode || '', itemDescription: liveLine?.ItemDescription || '', quantityReceived: l.Quantity, warehouseCode: l.WarehouseCode };
    });

    res.status(201).json({
      success: true,
      message: 'GRPO created successfully in SAP',
      data: {
        grpoDocEntry: grpoResult.DocEntry,
        grpoDocNum: grpoResult.DocNum,
        poDocEntry, poDocNum: livePo.DocNum,
        cardCode: livePo.CardCode, cardName: livePo.CardName,
        docDate: sapGrpoPayload.DocDate,
        docTotal: grpoResult.DocTotal || 0,
        linesPosted,
        totalLinesPosted: linesPosted.length,
        totalQuantityReceived: linesPosted.reduce((sum: number, l: any) => sum + l.quantityReceived, 0)
      },
      validationResult: { passed: true, totalLines: docLines.length, allLinesValid: true },
      payloadSent: sapGrpoPayload,
      timing: { durationMs: duration }
    });

  } catch (error: any) {
    console.error(`[GRPO-DIRECT] Unexpected error:`, error);
    res.status(500).json({ success: false, error: 'Unexpected error', code: 'GRPO_UNEXPECTED_ERROR', message: error.message });
  }
});

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls', '.docx', '.doc'];
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type ${ext} not allowed. Allowed: ${allowed.join(', ')}`));
  }
});

router.post('/attachments/upload', attachmentUpload.array('files', 10), async (req: any, res) => {
  const sapClient = new SapHttpsClient();
  const sapServiceUrl = 'https://59.152.52.58:50000/b1s/v1';

  async function doFreshLogin(): Promise<Record<string, string>> {
    const loginResp = await sapClient.request({
      method: 'POST', url: `${sapServiceUrl}/Login`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CompanyDB: process.env.SAP_COMPANY_DB, UserName: process.env.SAP_USERNAME, Password: process.env.SAP_PASSWORD }),
      timeout: 60000
    });
    if (loginResp.statusCode !== 200) throw new Error(`SAP login failed (${loginResp.statusCode})`);
    const cookies = loginResp.headers['set-cookie'];
    return { Cookie: Array.isArray(cookies) ? cookies.join('; ') : (cookies || '') };
  }

  try {
    const files: any[] = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided' });
    }

    let requestHeaders: Record<string, string> = {};
    let usedUserSession = false;
    if (req.sapSession?.sessionId) {
      const routeId = req.sapSession.routeId;
      requestHeaders = { Cookie: `B1SESSION=${req.sapSession.sessionId}${routeId ? `; ROUTEID=${routeId}` : ''}` };
      usedUserSession = true;
    } else {
      requestHeaders = await doFreshLogin();
    }

    const poDocEntry = req.body?.poDocEntry;
    const boundary = `----SAPBoundary${Date.now()}`;
    const multipartBody = buildMultipartBody(files, boundary, poDocEntry);

    const attachHeaders: Record<string, string> = {
      ...requestHeaders,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(multipartBody.length)
    };

    let attachResponse = await sapClient.request({
      method: 'POST',
      url: `${sapServiceUrl}/Attachments2`,
      headers: attachHeaders,
      rawBody: multipartBody,
      timeout: 120000
    });

    if (attachResponse.statusCode === 401 && usedUserSession) {
      console.warn(`[ATTACHMENT] User SAP session expired (401). Retrying with fresh login...`);
      try {
        requestHeaders = await doFreshLogin();
        const retryBoundary = `----SAPBoundary${Date.now()}`;
        const retryBody = buildMultipartBody(files, retryBoundary, poDocEntry);
        const retryHeaders: Record<string, string> = {
          ...requestHeaders,
          'Content-Type': `multipart/form-data; boundary=${retryBoundary}`,
          'Content-Length': String(retryBody.length)
        };
        attachResponse = await sapClient.request({
          method: 'POST',
          url: `${sapServiceUrl}/Attachments2`,
          headers: retryHeaders,
          rawBody: retryBody,
          timeout: 120000
        });
        console.log(`[ATTACHMENT] Retry result: ${attachResponse.statusCode}`);
      } catch (retryErr: any) {
        console.error(`[ATTACHMENT] Fresh login retry failed:`, retryErr.message);
      }
    }

    try { await sapClient.request({ method: 'POST', url: `${sapServiceUrl}/Logout`, headers: requestHeaders }); } catch {}

    if (attachResponse.statusCode === 200 || attachResponse.statusCode === 201) {
      const attachData = JSON.parse(attachResponse.body);
      const logBatchTs = Date.now();
      const sapFileNames = files.map((f: any, i: number) => makeGrpoFilename(f.originalname, poDocEntry, i + 1, logBatchTs));
      console.log(`[ATTACHMENT] Upload success — AbsoluteEntry: ${attachData.AbsoluteEntry}, Original: ${files.map((f: any) => f.originalname).join(', ')}, SAP: ${sapFileNames.join(', ')}`);
      return res.json({
        success: true,
        attachmentEntry: attachData.AbsoluteEntry,
        fileCount: files.length,
        fileNames: files.map((f: any) => f.originalname)
      });
    } else {
      console.error(`[ATTACHMENT] SAP rejected (${attachResponse.statusCode}):`, attachResponse.body);
      return res.status(400).json({
        success: false,
        error: `SAP attachment upload failed (${attachResponse.statusCode})`,
        sapError: attachResponse.body
      });
    }
  } catch (error: any) {
    console.error('[ATTACHMENT] Upload error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/grpo/qc-config', (_req: any, res) => {
  res.json({ success: true, config: getGrpoQcChecklistConfig() });
});

router.post('/grpo/qc-validate', (req: any, res) => {
  const result = validateGrpoQcPayload(req.body || {});
  res.json({ success: true, ...result });
});

const combinedRouter = express.Router();
combinedRouter.use('/', settingsRouter);
combinedRouter.use('/', router);

export default combinedRouter;