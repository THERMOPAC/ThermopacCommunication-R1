import express from 'express';
import { db } from '../db';
import { ensureAuthenticated } from '../auth-middleware';
import { sapB1Connector } from './sap-connector';
import { 
  sapPurchaseOrders, 
  sapPurchaseOrderItems, 
  sapPurchaseRequisitions, 
  sapGoodsReceiptPo, 
  sapPurchaseInvoices 
} from '../../shared/schema';
import { eq, desc, and, gte, lte, ilike, or } from 'drizzle-orm';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(ensureAuthenticated);

// Purchase Orders Endpoints - Live SAP B1 Integration
router.get('/purchase-orders', async (req, res) => {
  try {
    const { 
      vendorCode, 
      status, 
      dateFrom, 
      dateTo, 
      projectCode,
      financialYear,
      limit = 50, 
      offset = 0 
    } = req.query;

    // Prepare filters for SAP connector
    const filters = {
      vendorCode: vendorCode as string,
      status: status as string,
      fromDate: dateFrom ? new Date(dateFrom as string) : undefined,
      toDate: dateTo ? new Date(dateTo as string) : undefined,
      projectCode: projectCode as string,
      financialYear: financialYear as string,
      limit: Number(limit),
      offset: Number(offset)
    };

    // Get purchase orders from SAP B1 with Item/Service classification data
    const rawPurchaseOrders = await sapB1Connector.getPurchaseOrders(filters);

    // Process and classify each purchase order
    const processedPurchaseOrders = rawPurchaseOrders.map((po: any) => {
      const itemCount = parseInt(po.ItemCount || 0);
      const serviceCount = parseInt(po.ServiceCount || 0);
      const totalLines = parseInt(po.TotalLines || 0);

      // Determine order type based on item/service distribution
      let orderType: 'Item' | 'Service' | 'Mixed';
      const hasItems = itemCount > 0;
      const hasServices = serviceCount > 0;

      if (hasItems && hasServices) {
        orderType = 'Mixed';
      } else if (hasItems && !hasServices) {
        orderType = 'Item';
      } else if (!hasItems && hasServices) {
        orderType = 'Service';
      } else {
        // Default case - shouldn't happen but handles edge cases
        orderType = 'Item';
      }

      return {
        docEntry: po.DocEntry,
        docNum: po.DocNum,
        docDate: po.DocDate,
        vendorCode: po.CardCode,
        vendorName: po.CardName,
        docTotal: po.DocTotal,
        docCurrency: po.DocCur,
        docStatus: po.DocStatus,
        comments: po.Comments || '',
        orderType,
        hasItems,
        hasServices,
        itemCount,
        serviceCount,
        // Additional SAP B1 data
        projectCode: po.ProjectCode,
        projectName: po.ProjectName,
        financialYear: po.FinancialYear,
        vendorPhone: po.VendorPhone,
        vendorEmail: po.VendorEmail,
        vendorAddress: po.VendorAddress,
        vendorCity: po.VendorCity,
        vendorCountry: po.VendorCountry
      };
    });

    res.json({
      success: true,
      data: processedPurchaseOrders,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        hasMore: processedPurchaseOrders.length === Number(limit)
      },
      classification: {
        totalOrders: processedPurchaseOrders.length,
        itemOrders: processedPurchaseOrders.filter(po => po.orderType === 'Item').length,
        serviceOrders: processedPurchaseOrders.filter(po => po.orderType === 'Service').length,
        mixedOrders: processedPurchaseOrders.filter(po => po.orderType === 'Mixed').length
      }
    });
  } catch (error) {
    console.error('Error fetching purchase orders from SAP B1:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch purchase orders from SAP B1',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/purchase-orders/:docEntry', async (req, res) => {
  try {
    const { docEntry } = req.params;
    
    const [purchaseOrder] = await db
      .select()
      .from(sapPurchaseOrders)
      .where(eq(sapPurchaseOrders.docEntry, Number(docEntry)));

    if (!purchaseOrder) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }

    // Get line items
    const lineItems = await db
      .select()
      .from(sapPurchaseOrderItems)
      .where(eq(sapPurchaseOrderItems.docEntry, Number(docEntry)))
      .orderBy(sapPurchaseOrderItems.lineNum);

    res.json({
      success: true,
      data: {
        ...purchaseOrder,
        lineItems
      }
    });
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/purchase-orders', async (req, res) => {
  try {
    const { purchaseOrder, lineItems } = req.body;
    
    // Insert purchase order
    const [newPurchaseOrder] = await db
      .insert(sapPurchaseOrders)
      .values({
        ...purchaseOrder,
        createdBy: req.user.id,
        updatedBy: req.user.id
      })
      .returning();

    // Insert line items if provided
    if (lineItems && lineItems.length > 0) {
      await db
        .insert(sapPurchaseOrderItems)
        .values(lineItems.map((item: any) => ({
          ...item,
          docEntry: newPurchaseOrder.docEntry
        })));
    }

    res.json({
      success: true,
      message: 'Purchase order created successfully',
      data: newPurchaseOrder
    });
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.put('/purchase-orders/:docEntry', async (req, res) => {
  try {
    const { docEntry } = req.params;
    const { purchaseOrder, lineItems } = req.body;
    
    // Update purchase order
    const [updatedPurchaseOrder] = await db
      .update(sapPurchaseOrders)
      .set({
        ...purchaseOrder,
        updatedBy: req.user.id,
        updatedAt: new Date()
      })
      .where(eq(sapPurchaseOrders.docEntry, Number(docEntry)))
      .returning();

    if (!updatedPurchaseOrder) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }

    // Update line items if provided
    if (lineItems) {
      // Delete existing line items
      await db
        .delete(sapPurchaseOrderItems)
        .where(eq(sapPurchaseOrderItems.docEntry, Number(docEntry)));
      
      // Insert new line items
      if (lineItems.length > 0) {
        await db
          .insert(sapPurchaseOrderItems)
          .values(lineItems.map((item: any) => ({
            ...item,
            docEntry: Number(docEntry)
          })));
      }
    }

    res.json({
      success: true,
      message: 'Purchase order updated successfully',
      data: updatedPurchaseOrder
    });
  } catch (error) {
    console.error('Error updating purchase order:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Purchase Requisitions Endpoints
router.get('/purchase-requisitions', async (req, res) => {
  try {
    const { 
      requesterCode, 
      status, 
      priority, 
      dateFrom, 
      dateTo, 
      limit = 50, 
      offset = 0 
    } = req.query;

    let query = db.select().from(sapPurchaseRequisitions);
    
    // Apply filters
    const conditions: any[] = [];
    
    if (requesterCode) {
      conditions.push(eq(sapPurchaseRequisitions.requesterCode, requesterCode as string));
    }
    
    if (status) {
      conditions.push(eq(sapPurchaseRequisitions.docStatus, status as string));
    }
    
    if (priority) {
      conditions.push(eq(sapPurchaseRequisitions.priority, priority as string));
    }
    
    if (dateFrom) {
      conditions.push(gte(sapPurchaseRequisitions.docDate, new Date(dateFrom as string)));
    }
    
    if (dateTo) {
      conditions.push(lte(sapPurchaseRequisitions.docDate, new Date(dateTo as string)));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    const requisitions = await query
      .orderBy(desc(sapPurchaseRequisitions.docDate))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({
      success: true,
      data: requisitions,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        hasMore: requisitions.length === Number(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching purchase requisitions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/purchase-requisitions/:docEntry', async (req, res) => {
  try {
    const { docEntry } = req.params;
    
    const [requisition] = await db
      .select()
      .from(sapPurchaseRequisitions)
      .where(eq(sapPurchaseRequisitions.docEntry, Number(docEntry)));

    if (!requisition) {
      return res.status(404).json({ success: false, error: 'Purchase requisition not found' });
    }

    res.json({
      success: true,
      data: requisition
    });
  } catch (error) {
    console.error('Error fetching purchase requisition:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Goods Receipt PO Endpoints
router.get('/goods-receipt-po', async (req, res) => {
  try {
    const { 
      vendorCode, 
      status, 
      dateFrom, 
      dateTo, 
      baseDocEntry,
      limit = 50, 
      offset = 0 
    } = req.query;

    let query = db.select().from(sapGoodsReceiptPo);
    
    // Apply filters
    const conditions: any[] = [];
    
    if (vendorCode) {
      conditions.push(eq(sapGoodsReceiptPo.vendorCode, vendorCode as string));
    }
    
    if (status) {
      conditions.push(eq(sapGoodsReceiptPo.docStatus, status as string));
    }
    
    if (baseDocEntry) {
      conditions.push(eq(sapGoodsReceiptPo.baseDocEntry, Number(baseDocEntry)));
    }
    
    if (dateFrom) {
      conditions.push(gte(sapGoodsReceiptPo.docDate, new Date(dateFrom as string)));
    }
    
    if (dateTo) {
      conditions.push(lte(sapGoodsReceiptPo.docDate, new Date(dateTo as string)));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    const goodsReceipts = await query
      .orderBy(desc(sapGoodsReceiptPo.docDate))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({
      success: true,
      data: goodsReceipts,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        hasMore: goodsReceipts.length === Number(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching goods receipt PO:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Purchase Invoices Endpoints
router.get('/purchase-invoices', async (req, res) => {
  try {
    const { 
      vendorCode, 
      status, 
      dateFrom, 
      dateTo, 
      baseDocEntry,
      limit = 50, 
      offset = 0 
    } = req.query;

    let query = db.select().from(sapPurchaseInvoices);
    
    // Apply filters
    const conditions: any[] = [];
    
    if (vendorCode) {
      conditions.push(eq(sapPurchaseInvoices.vendorCode, vendorCode as string));
    }
    
    if (status) {
      conditions.push(eq(sapPurchaseInvoices.docStatus, status as string));
    }
    
    if (baseDocEntry) {
      conditions.push(eq(sapPurchaseInvoices.baseDocEntry, Number(baseDocEntry)));
    }
    
    if (dateFrom) {
      conditions.push(gte(sapPurchaseInvoices.docDate, new Date(dateFrom as string)));
    }
    
    if (dateTo) {
      conditions.push(lte(sapPurchaseInvoices.docDate, new Date(dateTo as string)));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    const purchaseInvoices = await query
      .orderBy(desc(sapPurchaseInvoices.docDate))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({
      success: true,
      data: purchaseInvoices,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        hasMore: purchaseInvoices.length === Number(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching purchase invoices:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Dashboard Statistics Endpoint - Enhanced with Live SAP B1 Data & Item/Service Classification
router.get('/dashboard-stats', async (req, res) => {
  try {
    // Get live purchase orders from SAP B1 with classification data
    const allPurchaseOrders = await sapB1Connector.getPurchaseOrders({
      limit: 1000 // Get more data for comprehensive statistics
    });

    // Process orders to get classification statistics
    let totalOrders = 0;
    let openOrders = 0;
    let closedOrders = 0;
    let itemOrders = 0;
    let serviceOrders = 0;
    let mixedOrders = 0;
    let totalValue = 0;

    allPurchaseOrders.forEach((po: any) => {
      totalOrders++;
      totalValue += po.DocTotal || 0;
      
      // Count by status
      if (po.DocStatus === 'O') {
        openOrders++;
      } else {
        closedOrders++;
      }

      // Classify by item/service type
      const itemCount = parseInt(po.ItemCount || 0);
      const serviceCount = parseInt(po.ServiceCount || 0);
      const hasItems = itemCount > 0;
      const hasServices = serviceCount > 0;

      if (hasItems && hasServices) {
        mixedOrders++;
      } else if (hasItems && !hasServices) {
        itemOrders++;
      } else if (!hasItems && hasServices) {
        serviceOrders++;
      }
    });

    // Get current month statistics
    const currentMonth = new Date();
    const thisMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const thisMonthOrders = allPurchaseOrders.filter((po: any) => {
      const docDate = new Date(po.DocDate);
      return docDate >= thisMonthStart;
    });

    const thisMonthValue = thisMonthOrders.reduce((sum: number, po: any) => sum + (po.DocTotal || 0), 0);

    // Get unique vendors count
    const uniqueVendors = new Set(allPurchaseOrders.map((po: any) => po.CardCode));

    res.json({
      success: true,
      data: {
        totalOrders,
        pendingOrders: openOrders,
        totalValue: Math.round(totalValue),
        activeVendors: uniqueVendors.size,
        // Enhanced classification statistics
        classification: {
          itemOrders,
          serviceOrders,
          mixedOrders,
          percentages: {
            itemPercent: totalOrders > 0 ? Math.round((itemOrders / totalOrders) * 100) : 0,
            servicePercent: totalOrders > 0 ? Math.round((serviceOrders / totalOrders) * 100) : 0,
            mixedPercent: totalOrders > 0 ? Math.round((mixedOrders / totalOrders) * 100) : 0
          }
        },
        // Monthly statistics
        thisMonth: {
          orders: thisMonthOrders.length,
          value: Math.round(thisMonthValue)
        },
        // Status breakdown
        status: {
          open: openOrders,
          closed: closedOrders,
          openPercent: totalOrders > 0 ? Math.round((openOrders / totalOrders) * 100) : 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Search Endpoint
router.get('/search', async (req, res) => {
  try {
    const { query, type = 'all', limit = 20 } = req.query;
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }

    const searchQuery = `%${query}%`;
    const results: any = {};

    // Search Purchase Orders
    if (type === 'all' || type === 'purchase-orders') {
      results.purchaseOrders = await db
        .select()
        .from(sapPurchaseOrders)
        .where(
          or(
            ilike(sapPurchaseOrders.docNum, searchQuery),
            ilike(sapPurchaseOrders.vendorName, searchQuery),
            ilike(sapPurchaseOrders.comments, searchQuery)
          )
        )
        .limit(Number(limit));
    }

    // Search Purchase Requisitions
    if (type === 'all' || type === 'requisitions') {
      results.requisitions = await db
        .select()
        .from(sapPurchaseRequisitions)
        .where(
          or(
            ilike(sapPurchaseRequisitions.docNum, searchQuery),
            ilike(sapPurchaseRequisitions.requesterName, searchQuery),
            ilike(sapPurchaseRequisitions.comments, searchQuery)
          )
        )
        .limit(Number(limit));
    }

    // Search Purchase Invoices
    if (type === 'all' || type === 'invoices') {
      results.invoices = await db
        .select()
        .from(sapPurchaseInvoices)
        .where(
          or(
            ilike(sapPurchaseInvoices.docNum, searchQuery),
            ilike(sapPurchaseInvoices.vendorName, searchQuery),
            ilike(sapPurchaseInvoices.comments, searchQuery)
          )
        )
        .limit(Number(limit));
    }

    res.json({
      success: true,
      data: results,
      query: query as string
    });
  } catch (error) {
    console.error('Error searching purchase data:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Sync Status Endpoint
router.get('/sync-status', async (req, res) => {
  try {
    const syncStatus = {
      purchaseOrders: {
        pending: 0,
        synced: 0,
        error: 0
      },
      requisitions: {
        pending: 0,
        synced: 0,
        error: 0
      },
      invoices: {
        pending: 0,
        synced: 0,
        error: 0
      }
    };

    // Get purchase orders sync status
    const poStatusCounts = await db
      .select()
      .from(sapPurchaseOrders);
    
    poStatusCounts.forEach(po => {
      if (po.sapSyncStatus === 'pending') syncStatus.purchaseOrders.pending++;
      else if (po.sapSyncStatus === 'synced') syncStatus.purchaseOrders.synced++;
      else if (po.sapSyncStatus === 'error') syncStatus.purchaseOrders.error++;
    });

    // Get requisitions sync status
    const reqStatusCounts = await db
      .select()
      .from(sapPurchaseRequisitions);
    
    reqStatusCounts.forEach(req => {
      if (req.sapSyncStatus === 'pending') syncStatus.requisitions.pending++;
      else if (req.sapSyncStatus === 'synced') syncStatus.requisitions.synced++;
      else if (req.sapSyncStatus === 'error') syncStatus.requisitions.error++;
    });

    // Get invoices sync status
    const invStatusCounts = await db
      .select()
      .from(sapPurchaseInvoices);
    
    invStatusCounts.forEach(inv => {
      if (inv.sapSyncStatus === 'pending') syncStatus.invoices.pending++;
      else if (inv.sapSyncStatus === 'synced') syncStatus.invoices.synced++;
      else if (inv.sapSyncStatus === 'error') syncStatus.invoices.error++;
    });

    res.json({
      success: true,
      data: syncStatus
    });
  } catch (error) {
    console.error('Error fetching sync status:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;