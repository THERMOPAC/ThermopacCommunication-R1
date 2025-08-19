import express from 'express';
import { ensureAuthenticated } from '../middleware/auth-middleware';
import { requireSapAccess, requireSapSession } from '../middleware/sap-auth-middleware';
import { sapHttpsClient } from './sap-https-client';
import { pool } from '../db';

const router = express.Router();

// Apply middleware to all routes
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

// Dashboard - Summary of open purchase documents with FY filtering
router.get('/dashboard', async (req, res) => {
  try {
    // Get user's sync settings for FY start date
    const userId = req.user!.id;
    const db = req.app.get('db');
    
    let fyStartDate = '2025-04-01'; // Default
    try {
      const settingsResult = await db.query(
        'SELECT fy_start_date FROM sap_sync_settings WHERE user_id = $1',
        [userId]
      );
      if (settingsResult.rows.length > 0 && settingsResult.rows[0].fy_start_date) {
        fyStartDate = settingsResult.rows[0].fy_start_date.toISOString().split('T')[0];
      }
    } catch (err) {
      console.warn('Failed to get FY settings, using default:', err);
    }

    // Build OData filters with FY filtering
    const fyFilter = `DocDate ge '${fyStartDate}'`;
    const openOrdersFilter = `DocumentStatus eq 'bost_Open' and ${fyFilter}`;
    
    // Get summary data from multiple endpoints with FY filtering
    const [ordersResponse, quotationsResponse, invoicesResponse, receiptsResponse] = await Promise.allSettled([
      makeSapRequest(req, `/b1s/v1/PurchaseOrders?$select=DocEntry,DocNum,DocTotal,DocumentStatus,DocDate&$filter=${openOrdersFilter}&$orderby=DocDate desc&$top=5`),
      makeSapRequest(req, `/b1s/v1/PurchaseQuotations?$select=DocEntry,DocNum,DocTotal,DocumentStatus,DocDate&$filter=${fyFilter}&$orderby=DocDate desc&$top=5`),
      makeSapRequest(req, `/b1s/v1/PurchaseInvoices?$select=DocEntry,DocNum,DocTotal,DocumentStatus,DocDate&$filter=${fyFilter}&$orderby=DocDate desc&$top=5`),
      makeSapRequest(req, `/b1s/v1/PurchaseDeliveryNotes?$select=DocEntry,DocNum,DocTotal,DocumentStatus,DocDate&$filter=${fyFilter}&$orderby=DocDate desc&$top=5`)
    ]);

    const dashboard = {
      summary: {
        openOrders: 0,
        totalOrderValue: 0,
        pendingInvoices: 0,
        pendingReceipts: 0
      },
      recentOrders: [],
      recentQuotations: [],
      alerts: []
    };

    // Process orders data
    if (ordersResponse.status === 'fulfilled') {
      const response = ordersResponse.value;
      const errorResponse = handleSapResponse(response, res, 'Dashboard orders query');
      if (errorResponse) return;
      
      try {
        const data = JSON.parse(response.body);
        dashboard.summary.openOrders = data.value?.length || 0;
        dashboard.summary.totalOrderValue = data.value?.reduce((sum: number, order: any) => sum + (order.DocTotal || 0), 0) || 0;
        dashboard.recentOrders = data.value || [];
      } catch (parseError) {
        console.warn('Failed to parse orders response:', parseError);
      }
    }

    // Process quotations data
    if (quotationsResponse.status === 'fulfilled') {
      const response = quotationsResponse.value;
      if (response.ok) {
        try {
          const data = JSON.parse(response.body);
          dashboard.recentQuotations = data.value || [];
        } catch (parseError) {
          console.warn('Failed to parse quotations response:', parseError);
        }
      }
    }

    // Add sync status information
    let syncStatus = null;
    try {
      const syncResult = await db.query(
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

    res.json({
      success: true,
      data: {
        ...dashboard,
        fyStartDate,
        syncStatus
      }
    });

  } catch (error) {
    console.error('SAP dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load dashboard data',
      code: 'SAP_DASHBOARD_ERROR'
    });
  }
});

// Purchase Quotations
router.get('/quotations', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    let filter = '';
    if (search) {
      filter = `$filter=contains(CardName,'${search}') or contains(DocNum,'${search}')`;
    }
    
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

// Purchase Orders
router.get('/orders', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    let filters = [];
    if (search) {
      filters.push(`(contains(CardName,'${search}') or contains(DocNum,'${search}'))`);
    }
    if (status && status !== 'all') {
      filters.push(`DocumentStatus eq '${status}'`);
    }
    
    const filterString = filters.length > 0 ? `$filter=${filters.join(' and ')}` : '';
    
    const queryParams = [
      `$top=${limit}`,
      `$skip=${skip}`,
      '$orderby=DocDate desc',
      filterString
    ].filter(Boolean).join('&');
    
    const response = await makeSapRequest(req, `/b1s/v1/PurchaseOrders?${queryParams}`);
    const errorResponse = handleSapResponse(response, res, 'Purchase orders query');
    if (errorResponse) return;

    const data = JSON.parse(response.body);
    
    res.json({
      success: true,
      data: {
        orders: data.value || [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: data['@odata.count'] || data.value?.length || 0
        }
      }
    });

  } catch (error) {
    console.error('SAP purchase orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load purchase orders',
      code: 'SAP_ORDERS_ERROR'
    });
  }
});

// Goods Receipt POs
router.get('/receipts', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    let filter = '';
    if (search) {
      filter = `$filter=contains(CardName,'${search}') or contains(DocNum,'${search}')`;
    }
    
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
    
    let filters = [];
    if (search) {
      filters.push(`(contains(CardName,'${search}') or contains(DocNum,'${search}'))`);
    }
    if (status && status !== 'all') {
      filters.push(`DocumentStatus eq '${status}'`);
    }
    
    const filterString = filters.length > 0 ? `$filter=${filters.join(' and ')}` : '';
    
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
    
    res.json({
      success: true,
      data: {
        settings: settings.rows[0],
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

// Update sync settings
router.put('/sync/settings', async (req, res) => {
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
    
    await db.query(
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

// Trigger manual sync
router.post('/sync/trigger', async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Check if sync is already running
    const runningSyncs = await db.query(
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
    const syncRecord = await db.query(
      'INSERT INTO sap_sync_history (user_id, sync_type, started_at, status) VALUES ($1, $2, CURRENT_TIMESTAMP, $3) RETURNING id',
      [userId, 'manual', 'in_progress']
    );
    
    const syncId = syncRecord.rows[0].id;
    
    // Start async sync process
    setImmediate(async () => {
      await performSyncOperation(req, userId, syncId, db);
    });
    
    res.json({
      success: true,
      message: 'Sync started successfully',
      syncId
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

// Get sync history
router.get('/sync/history', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    const history = await db.query(
      'SELECT * FROM sap_sync_history WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    
    const total = await db.query(
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
        
        // DocEntry-based upsert for cache consistency
        for (const doc of documents) {
          try {
            const isCancelled = doc.Cancelled === 'tYES';
            const isClosed = doc.DocumentStatus === 'bost_Close';
            
            await db.query(
              `INSERT INTO sap_document_cache 
                (doc_entry, doc_type, doc_num, doc_date, doc_total, document_status, vendor_code, vendor_name, is_cancelled, is_closed, raw_data, last_synced_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
               ON CONFLICT (doc_entry, doc_type) 
               DO UPDATE SET 
                 doc_num = EXCLUDED.doc_num,
                 doc_date = EXCLUDED.doc_date,
                 doc_total = EXCLUDED.doc_total,
                 document_status = EXCLUDED.document_status,
                 vendor_code = EXCLUDED.vendor_code,
                 vendor_name = EXCLUDED.vendor_name,
                 is_cancelled = EXCLUDED.is_cancelled,
                 is_closed = EXCLUDED.is_closed,
                 raw_data = EXCLUDED.raw_data,
                 last_synced_at = EXCLUDED.last_synced_at`,
              [
                doc.DocEntry,
                docType.type,
                doc.DocNum,
                doc.DocDate,
                doc.DocTotal,
                doc.DocumentStatus,
                doc.CardCode,
                doc.CardName,
                isCancelled,
                isClosed,
                JSON.stringify(doc)
              ]
            );
            
            docEntriesProcessed.push(doc.DocEntry);
            documentsProcessed++;
            
          } catch (docError) {
            console.error(`Error processing document ${doc.DocEntry}:`, docError);
          }
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

export default router;