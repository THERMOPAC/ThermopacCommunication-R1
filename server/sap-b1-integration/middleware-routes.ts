import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, count, desc } from 'drizzle-orm';
import { 
  sapPurchaseOrders, 
  sapPurchaseOrderItems,
  sapPurchaseRequisitions,
  sapGoodsReceiptPo,
  sapPurchaseInvoices
} from '../../shared/schema';

const router = Router();

// Simple authentication middleware for authenticated routes
const ensureAuthenticated = (req: any, res: Response, next: any) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ success: false, error: 'Authentication required' });
};

// Middleware API authentication
const authenticateMiddleware = (req: Request, res: Response, next: any) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey || apiKey !== process.env.SAP_MIDDLEWARE_API_KEY) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized - Invalid middleware API key' 
    });
  }
  
  next();
};

// Health check for middleware
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'Replit SAP B1 Integration Ready',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /purchase-orders/sync',
      'POST /purchase-order-items/sync', 
      'POST /vendors/sync',
      'POST /dashboard/stats/sync'
    ]
  });
});

// Sync purchase orders from middleware
router.post('/purchase-orders/sync', authenticateMiddleware, async (req: Request, res: Response) => {
  try {
    const { purchaseOrders, source, timestamp } = req.body;
    
    if (!purchaseOrders || !Array.isArray(purchaseOrders)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid purchase orders data'
      });
    }

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const po of purchaseOrders) {
      try {
        // Check if purchase order already exists
        const existing = await db.select()
          .from(sapPurchaseOrders)
          .where(eq(sapPurchaseOrders.purchaseOrderId, po.purchaseOrderId))
          .limit(1);

        if (existing.length > 0) {
          // Update existing record
          await db.update(sapPurchaseOrders)
            .set({
              documentNumber: po.documentNumber,
              orderDate: new Date(po.orderDate),
              dueDate: po.dueDate ? new Date(po.dueDate) : null,
              vendorCode: po.vendorCode,
              vendorName: po.vendorName,
              totalAmount: parseFloat(po.totalAmount) || 0,
              status: po.status,
              project: po.project,
              comments: po.comments,
              totalGSTAmount: parseFloat(po.totalGSTAmount) || 0,
              currency: po.currency,
              lastSyncedAt: new Date(),
              syncSource: source
            })
            .where(eq(sapPurchaseOrders.purchaseOrderId, po.purchaseOrderId));
          
          synced++;
        } else {
          // Insert new record
          await db.insert(sapPurchaseOrders).values({
            purchaseOrderId: po.purchaseOrderId,
            documentNumber: po.documentNumber,
            orderDate: new Date(po.orderDate),
            dueDate: po.dueDate ? new Date(po.dueDate) : null,
            vendorCode: po.vendorCode,
            vendorName: po.vendorName,
            totalAmount: parseFloat(po.totalAmount) || 0,
            status: po.status,
            project: po.project,
            comments: po.comments,
            totalGSTAmount: parseFloat(po.totalGSTAmount) || 0,
            currency: po.currency,
            lastSyncedAt: new Date(),
            syncSource: source
          });
          
          synced++;
        }
      } catch (error) {
        console.error(`Error syncing PO ${po.purchaseOrderId}:`, error);
        errors++;
      }
    }

    console.log(`Purchase Orders sync: ${synced} synced, ${skipped} skipped, ${errors} errors`);
    
    res.json({
      success: true,
      synced,
      skipped,
      errors,
      message: 'Purchase orders sync completed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Purchase orders sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Purchase orders sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Sync purchase order items from middleware
router.post('/purchase-order-items/sync', authenticateMiddleware, async (req: Request, res: Response) => {
  try {
    const { purchaseOrderId, items, source, timestamp } = req.body;
    
    if (!purchaseOrderId || !items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid purchase order items data'
      });
    }

    // Delete existing items for this purchase order
    await db.delete(sapPurchaseOrderItems)
      .where(eq(sapPurchaseOrderItems.purchaseOrderId, purchaseOrderId));

    let synced = 0;
    let errors = 0;

    for (const item of items) {
      try {
        await db.insert(sapPurchaseOrderItems).values({
          purchaseOrderId: purchaseOrderId,
          lineNumber: item.lineNumber,
          itemCode: item.itemCode,
          description: item.description,
          quantity: parseFloat(item.quantity) || 0,
          unitPrice: parseFloat(item.unitPrice) || 0,
          lineTotal: parseFloat(item.lineTotal) || 0,
          currency: item.currency,
          gstType: item.gstType,
          gstRate: parseFloat(item.gstRate) || 0,
          gstAmount: parseFloat(item.gstAmount) || 0,
          cgstRate: parseFloat(item.cgstRate) || 0,
          cgstAmount: parseFloat(item.cgstAmount) || 0,
          sgstRate: parseFloat(item.sgstRate) || 0,
          sgstAmount: parseFloat(item.sgstAmount) || 0,
          igstRate: parseFloat(item.igstRate) || 0,
          igstAmount: parseFloat(item.igstAmount) || 0,
          hsnSacCode: item.hsnSacCode,
          warehouseCode: item.warehouseCode,
          project: item.project,
          lastSyncedAt: new Date(),
          syncSource: source
        });
        
        synced++;
      } catch (error) {
        console.error(`Error syncing item ${item.lineNumber}:`, error);
        errors++;
      }
    }

    console.log(`Purchase Order Items sync for PO ${purchaseOrderId}: ${synced} synced, ${errors} errors`);
    
    res.json({
      success: true,
      synced,
      errors,
      message: 'Purchase order items sync completed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Purchase order items sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Purchase order items sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Sync vendors from middleware
router.post('/vendors/sync', authenticateMiddleware, async (req: Request, res: Response) => {
  try {
    const { vendors, source, timestamp } = req.body;
    
    if (!vendors || !Array.isArray(vendors)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid vendors data'
      });
    }

    let synced = 0;
    let errors = 0;

    for (const vendor of vendors) {
      try {
        // Check if vendor already exists
        const existing = await db.select()
          .from(sapVendors)
          .where(eq(sapVendors.vendorCode, vendor.vendorCode))
          .limit(1);

        if (existing.length > 0) {
          // Update existing record
          await db.update(sapVendors)
            .set({
              vendorName: vendor.vendorName,
              phone: vendor.phone,
              fax: vendor.fax,
              email: vendor.email,
              address: vendor.address,
              city: vendor.city,
              country: vendor.country,
              zipCode: vendor.zipCode,
              currency: vendor.currency,
              creditLimit: parseFloat(vendor.creditLimit) || 0,
              currentBalance: parseFloat(vendor.currentBalance) || 0,
              groupCode: vendor.groupCode,
              licenseNumber: vendor.licenseNumber,
              vatNumber: vendor.vatNumber,
              isActive: vendor.isActive === 'Y',
              lastSyncedAt: new Date(),
              syncSource: source
            })
            .where(eq(sapVendors.vendorCode, vendor.vendorCode));
        } else {
          // Insert new record
          await db.insert(sapVendors).values({
            vendorCode: vendor.vendorCode,
            vendorName: vendor.vendorName,
            phone: vendor.phone,
            fax: vendor.fax,
            email: vendor.email,
            address: vendor.address,
            city: vendor.city,
            country: vendor.country,
            zipCode: vendor.zipCode,
            currency: vendor.currency,
            creditLimit: parseFloat(vendor.creditLimit) || 0,
            currentBalance: parseFloat(vendor.currentBalance) || 0,
            groupCode: vendor.groupCode,
            licenseNumber: vendor.licenseNumber,
            vatNumber: vendor.vatNumber,
            isActive: vendor.isActive === 'Y',
            lastSyncedAt: new Date(),
            syncSource: source
          });
        }
        
        synced++;
      } catch (error) {
        console.error(`Error syncing vendor ${vendor.vendorCode}:`, error);
        errors++;
      }
    }

    console.log(`Vendors sync: ${synced} synced, ${errors} errors`);
    
    res.json({
      success: true,
      synced,
      errors,
      message: 'Vendors sync completed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Vendors sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Vendors sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Sync dashboard stats from middleware
router.post('/dashboard/stats/sync', authenticateMiddleware, async (req: Request, res: Response) => {
  try {
    const { stats, source, timestamp } = req.body;
    
    if (!stats) {
      return res.status(400).json({
        success: false,
        error: 'Invalid dashboard stats data'
      });
    }

    // Delete existing stats (keep only latest)
    await db.delete(sapDashboardStats);

    // Insert new stats
    await db.insert(sapDashboardStats).values({
      totalPurchaseOrders: parseInt(stats.totalPurchaseOrders) || 0,
      totalVendors: parseInt(stats.totalVendors) || 0,
      pendingPurchaseOrders: parseInt(stats.pendingPurchaseOrders) || 0,
      monthlyPurchaseValue: parseFloat(stats.monthlyPurchaseValue) || 0,
      lastSyncedAt: new Date(),
      syncSource: source
    });

    console.log('Dashboard stats sync completed');
    
    res.json({
      success: true,
      synced: 1,
      message: 'Dashboard stats sync completed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Dashboard stats sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Dashboard stats sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get sync status for debugging
router.get('/sync/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const [purchaseOrdersCount, vendorsCount, latestStats] = await Promise.all([
      db.select({ count: count() }).from(sapPurchaseOrders),
      db.select({ count: count() }).from(sapVendors),
      db.select().from(sapDashboardStats).orderBy(desc(sapDashboardStats.lastSyncedAt)).limit(1)
    ]);

    res.json({
      success: true,
      syncStatus: {
        purchaseOrdersCount: purchaseOrdersCount[0]?.count || 0,
        vendorsCount: vendorsCount[0]?.count || 0,
        latestStatsSync: latestStats[0]?.lastSyncedAt || null,
        middlewareApiConfigured: !!process.env.SAP_MIDDLEWARE_API_KEY
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as middlewareRoutes };