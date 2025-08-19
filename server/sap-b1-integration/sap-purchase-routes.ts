import express from 'express';
import { ensureAuthenticated } from '../middleware/auth-middleware';
import { requireSapAccess, requireSapSession } from '../middleware/sap-auth-middleware';
import { sapHttpsClient } from './sap-https-client';

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

// Dashboard - Summary of open purchase documents
router.get('/dashboard', async (req, res) => {
  try {
    // Get summary data from multiple endpoints
    const [ordersResponse, quotationsResponse, invoicesResponse, receiptsResponse] = await Promise.allSettled([
      makeSapRequest(req, '/b1s/v1/PurchaseOrders?$select=DocNum,DocTotal,DocumentStatus&$filter=DocumentStatus eq \'bost_Open\'&$top=5'),
      makeSapRequest(req, '/b1s/v1/PurchaseQuotations?$select=DocNum,DocTotal,DocumentStatus&$top=5'),
      makeSapRequest(req, '/b1s/v1/PurchaseInvoices?$select=DocNum,DocTotal,DocumentStatus&$top=5'),
      makeSapRequest(req, '/b1s/v1/PurchaseDeliveryNotes?$select=DocNum,DocTotal,DocumentStatus&$top=5')
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

    res.json({
      success: true,
      data: dashboard
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

export default router;