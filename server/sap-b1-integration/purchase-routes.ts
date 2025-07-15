import express from 'express';
import { db } from '../db';
import { ensureAuthenticated } from '../auth-middleware';
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

// Purchase Orders Endpoints
router.get('/purchase-orders', async (req, res) => {
  try {
    const { 
      vendorCode, 
      status, 
      dateFrom, 
      dateTo, 
      limit = 50, 
      offset = 0 
    } = req.query;

    let query = db.select().from(sapPurchaseOrders);
    
    // Apply filters
    const conditions: any[] = [];
    
    if (vendorCode) {
      conditions.push(eq(sapPurchaseOrders.vendorCode, vendorCode as string));
    }
    
    if (status) {
      conditions.push(eq(sapPurchaseOrders.docStatus, status as string));
    }
    
    if (dateFrom) {
      conditions.push(gte(sapPurchaseOrders.docDate, new Date(dateFrom as string)));
    }
    
    if (dateTo) {
      conditions.push(lte(sapPurchaseOrders.docDate, new Date(dateTo as string)));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    const purchaseOrders = await query
      .orderBy(desc(sapPurchaseOrders.docDate))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({
      success: true,
      data: purchaseOrders,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        hasMore: purchaseOrders.length === Number(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
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

// Dashboard Statistics Endpoint
router.get('/dashboard-stats', async (req, res) => {
  try {
    // Get purchase orders statistics
    const openPurchaseOrders = await db
      .select()
      .from(sapPurchaseOrders)
      .where(eq(sapPurchaseOrders.docStatus, 'O'));

    const totalPurchaseOrders = await db
      .select()
      .from(sapPurchaseOrders);

    // Get purchase requisitions statistics
    const openRequisitions = await db
      .select()
      .from(sapPurchaseRequisitions)
      .where(eq(sapPurchaseRequisitions.docStatus, 'O'));

    // Get this month's purchase invoices
    const currentMonth = new Date();
    currentMonth.setDate(1);
    const thisMonthInvoices = await db
      .select()
      .from(sapPurchaseInvoices)
      .where(gte(sapPurchaseInvoices.docDate, currentMonth));

    // Calculate total amounts
    const totalPurchaseValue = totalPurchaseOrders.reduce((sum, po) => sum + (po.docTotal || 0), 0);
    const thisMonthInvoiceValue = thisMonthInvoices.reduce((sum, inv) => sum + (inv.docTotal || 0), 0);

    res.json({
      success: true,
      data: {
        purchaseOrders: {
          total: totalPurchaseOrders.length,
          open: openPurchaseOrders.length,
          closed: totalPurchaseOrders.length - openPurchaseOrders.length,
          totalValue: totalPurchaseValue
        },
        requisitions: {
          total: openRequisitions.length,
          open: openRequisitions.length
        },
        invoices: {
          thisMonth: thisMonthInvoices.length,
          thisMonthValue: thisMonthInvoiceValue
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