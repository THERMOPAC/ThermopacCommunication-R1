import { Response, Router, Request } from 'express';
import { db } from './db';
import { 
  projects, projectItems, masterItems, vendors,
  purchaseOrders, purchaseOrderItems, purchaseOrderHistory,
  insertPurchaseOrderSchema, insertPurchaseOrderItemSchema, insertPurchaseOrderHistorySchema
} from '@shared/schema';
import { eq, and, desc, asc, inArray, sql } from 'drizzle-orm';

// Authentication middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

export function setupProcurementRoutes(app: Router) {
  // ==================== VENDORS MANAGEMENT ====================
  
  /**
   * Get all vendors
   */
  app.get('/api/vendors', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const vendorsList = await db.query.vendors.findMany({
        where: eq(vendors.isActive, true),
        orderBy: asc(vendors.name)
      });
      
      res.status(200).json(vendorsList);
    } catch (error) {
      console.error('Error fetching vendors:', error);
      res.status(500).json({ error: 'Failed to fetch vendors' });
    }
  });
  
  // ==================== PURCHASE ORDERS ====================
  
  /**
   * Preview purchase orders for a project
   * This endpoint identifies all "Buy" items in a project and prepares them for purchase order generation
   */
  app.get('/api/procurement/purchase-orders/preview/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log('Processing purchase order preview request for project ID:', req.params.projectId);
      
      // Validate projectId parameter
      const projectId = parseInt(req.params.projectId);
      
      // Check if project ID is valid
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      // Get project to ensure it exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      console.log('Found project:', project.code, project.name);
      
      // Get all project items
      const allProjectItems = await db.query.projectItems.findMany({
        where: eq(projectItems.projectId, projectId)
      });
      
      console.log('Found project items:', allProjectItems.length);
      
      // Build a list of master item IDs used in this project
      const masterItemIds = allProjectItems.map(item => item.itemId);
      
      // Get master item details with the built-in inArray operation instead of raw SQL
      const masterItemsList = await db.query.masterItems.findMany({
        where: inArray(masterItems.id, masterItemIds),
      });
      
      console.log('Found master items:', masterItemsList.length);
      
      // Create a map for quick lookup of master item details
      const masterItemsMap = new Map<number, typeof masterItems.$inferSelect>();
      masterItemsList.forEach(item => {
        masterItemsMap.set(item.id, item);
      });
      
      // Group items by "makeOrBuy" status - focus on "Buy" items
      const buyItems = allProjectItems.filter(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        return masterItem && masterItem.makeOrBuy === 'Buy';
      });
      
      console.log('Buy items found:', buyItems.length);
      
      if (buyItems.length === 0) {
        return res.status(200).json({ 
          message: 'No "Buy" items found for this project',
          project: {
            id: project.id,
            code: project.code,
            name: project.name
          },
          itemCount: 0,
          items: []
        });
      }
      
      // Get existing purchase orders to check for duplicates
      const existingPurchaseOrders = await db.query.purchaseOrders.findMany({
        where: eq(purchaseOrders.projectId, projectId)
      });
      
      let filteredBuyItems = [...buyItems];
      if (existingPurchaseOrders.length > 0) {
        // Get all purchase order items for this project
        const existingPurchaseOrderIds = existingPurchaseOrders.map(po => po.id);
        const existingPurchaseOrderItems = await db.query.purchaseOrderItems.findMany({
          where: inArray(purchaseOrderItems.purchaseOrderId, existingPurchaseOrderIds)
        });
        
        // Create a set of project item IDs that already have purchase orders
        const existingProjectItemIds = new Set(existingPurchaseOrderItems.map(item => item.projectItemId));
        
        // Filter out items that already have purchase orders
        filteredBuyItems = buyItems.filter(item => !existingProjectItemIds.has(item.id));
      }
      
      // Check if we have any buy items left after filtering
      if (filteredBuyItems.length === 0) {
        return res.status(200).json({ 
          message: 'All "Buy" items already have purchase orders',
          project: {
            id: project.id,
            code: project.code,
            name: project.name
          },
          itemCount: 0,
          existingPurchaseOrderCount: existingPurchaseOrders.length,
          items: []
        });
      }
      
      // Get vendor information for all items with preferred vendors
      const vendorIds = masterItemsList
        .filter(item => item.preferredVendorId !== null)
        .map(item => item.preferredVendorId!)
        .filter(id => id !== undefined);
      
      // Fetch vendor data
      const vendorsList = vendorIds.length > 0 ? 
        await db.query.vendors.findMany({
          where: inArray(vendors.id, vendorIds)
        }) : [];
      
      // Create vendor map for quick lookup
      const vendorsMap = new Map<number, typeof vendors.$inferSelect>();
      vendorsList.forEach(vendor => {
        vendorsMap.set(vendor.id, vendor);
      });
      
      // Format items for the frontend
      const previewItems = filteredBuyItems.map(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        const vendorId = masterItem?.preferredVendorId || null;
        const vendor = vendorId ? vendorsMap.get(vendorId) : null;
        
        return {
          id: item.id,
          itemCode: masterItem?.itemCode || 'Unknown',
          description: masterItem?.description || 'Unknown Item',
          quantity: Number(item.quantity),
          unit: masterItem?.unit || 'EA',
          vendorId: vendorId,
          vendorName: vendor ? vendor.name : 'Unassigned',
          estimatedCost: masterItem?.estimatedCost ? Number(masterItem.estimatedCost) : 0
        };
      });

      // Return preview data in a format similar to work order preview
      return res.status(200).json({
        project: {
          id: project.id,
          code: project.code,
          name: project.name
        },
        itemCount: previewItems.length,
        items: previewItems,
        existingPurchaseOrderCount: existingPurchaseOrders.length
      });
    } catch (error) {
      console.error('Error previewing purchase orders:', error);
      res.status(500).json({ error: 'Failed to preview purchase orders' });
    }
  });
  
  /**
   * Generate purchase orders for a project
   * Creates purchase orders based on "Buy" items in the project
   */
  app.post('/api/procurement/purchase-orders/generate-for-project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { confirm, vendorAssignments } = req.body;
      const user = req.user!;
      
      // Check if project ID is valid
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      // Check for confirmation flag
      if (!confirm) {
        return res.status(400).json({ 
          requiresConfirmation: true,
          message: 'Please confirm to generate purchase orders'
        });
      }
      
      // Get project to ensure it exists
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Get all project items
      const allProjectItems = await db.query.projectItems.findMany({
        where: eq(projectItems.projectId, projectId)
      });
      
      // Build a list of master item IDs used in this project
      const masterItemIds = allProjectItems.map(item => item.itemId);
      
      // Get master item details with the built-in inArray operation
      const masterItemsList = await db.query.masterItems.findMany({
        where: inArray(masterItems.id, masterItemIds),
      });
      
      // Create a map for quick lookup of master item details
      const masterItemsMap = new Map<number, typeof masterItems.$inferSelect>();
      masterItemsList.forEach(item => {
        masterItemsMap.set(item.id, item);
      });
      
      // Group items by "makeOrBuy" status - focus on "Buy" items
      const buyItems = allProjectItems.filter(item => {
        const masterItem = masterItemsMap.get(item.itemId);
        return masterItem && masterItem.makeOrBuy === 'Buy';
      });
      
      if (buyItems.length === 0) {
        return res.status(400).json({ error: 'No "Buy" items found for this project' });
      }
      
      // Get existing purchase orders to check for duplicates
      const existingPurchaseOrders = await db.query.purchaseOrders.findMany({
        where: eq(purchaseOrders.projectId, projectId)
      });
      
      // Get next PO sequence number
      let nextPOSequence = 1;
      
      if (existingPurchaseOrders.length > 0) {
        // Get all purchase order items for this project
        const existingPurchaseOrderIds = existingPurchaseOrders.map(po => po.id);
        const existingPurchaseOrderItems = await db.query.purchaseOrderItems.findMany({
          where: inArray(purchaseOrderItems.purchaseOrderId, existingPurchaseOrderIds)
        });
        
        // Create a set of project item IDs that already have purchase orders
        const existingProjectItemIds = new Set(existingPurchaseOrderItems.map(item => item.projectItemId));
        
        // Filter out items that already have purchase orders
        const filteredBuyItems = buyItems.filter(item => !existingProjectItemIds.has(item.id));
        
        if (filteredBuyItems.length === 0) {
          return res.status(400).json({ error: 'All "Buy" items already have purchase orders' });
        }
        
        // Find the highest sequence number from existing purchase orders
        const poSequences = existingPurchaseOrders.map(po => {
          const parts = po.purchaseOrderNumber.split('-');
          return parseInt(parts[parts.length - 1]);
        });
        
        nextPOSequence = Math.max(...poSequences) + 1;
      }
      
      // Group items by vendorId from vendor assignments
      const itemsByVendor: Record<number, typeof buyItems> = {};
      
      if (vendorAssignments && Object.keys(vendorAssignments).length > 0) {
        // If vendor assignments are provided, use them to group items
        for (const [itemIdStr, vendorIdStr] of Object.entries(vendorAssignments)) {
          const itemId = parseInt(itemIdStr);
          const vendorId = parseInt(vendorIdStr as string);
          
          const projectItem = buyItems.find(item => item.id === itemId);
          if (projectItem) {
            if (!itemsByVendor[vendorId]) {
              itemsByVendor[vendorId] = [];
            }
            itemsByVendor[vendorId].push(projectItem);
          }
        }
      } else {
        // Otherwise, use preferred vendors from master items
        buyItems.forEach(item => {
          const masterItem = masterItemsMap.get(item.itemId);
          const vendorId = masterItem?.preferredVendorId || 0;
          
          if (!itemsByVendor[vendorId]) {
            itemsByVendor[vendorId] = [];
          }
          itemsByVendor[vendorId].push(item);
        });
      }
      
      // Get vendors information
      const vendorIds = Object.keys(itemsByVendor)
        .map(key => parseInt(key))
        .filter(id => id > 0);
      
      let vendorsMap: Map<number, typeof vendors.$inferSelect> = new Map();
      
      if (vendorIds.length > 0) {
        const vendorsList = await db.query.vendors.findMany({
          where: inArray(vendors.id, vendorIds)
        });
        
        vendorsList.forEach(vendor => {
          vendorsMap.set(vendor.id, vendor);
        });
      }
      
      // Create purchase orders for each vendor group
      const createdPOs = [];
      const now = new Date().toISOString();
      
      // Get current financial year
      const currentDate = new Date();
      const financialYearStart = new Date(currentDate.getFullYear(), 3, 1); // April 1
      let financialYear: string;
      
      if (currentDate < financialYearStart) {
        // Current date is between Jan-Mar, so FY is previous year to current year
        financialYear = `${currentDate.getFullYear() - 1}-${currentDate.getFullYear().toString().slice(-2)}`;
      } else {
        // Current date is between Apr-Dec, so FY is current year to next year
        financialYear = `${currentDate.getFullYear()}-${(currentDate.getFullYear() + 1).toString().slice(-2)}`;
      }
      
      for (const [vendorIdStr, items] of Object.entries(itemsByVendor)) {
        const vendorId = parseInt(vendorIdStr);
        
        if (items.length === 0) continue;
        
        // Generate purchase order number: PO-{Financial Year}-{Project Code}-{Sequence}
        const poNumber = `PO-${project.code}-${nextPOSequence}`;
        
        // Create purchase order
        const today = new Date();
        const requiredDate = new Date();
        requiredDate.setDate(today.getDate() + 30); // Default delivery in 30 days
        
        // Create values for the db query with camelCase keys matching schema
        const purchaseOrderValues = {
          projectId: projectId,
          vendorId: vendorId > 0 ? vendorId : vendorId, // Must provide a value even if it's 0
          purchaseOrderNumber: poNumber,
          title: `Materials for ${project.name}`,
          description: `Purchase order for ${project.code} project materials`,
          status: 'draft',
          priority: 'Medium',
          requestedDate: today, // Use Date objects directly
          requiredByDate: requiredDate,
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        const [purchaseOrder] = await db.insert(purchaseOrders)
          .values([purchaseOrderValues])
          .returning();
        
        // Create purchase order items
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const masterItem = masterItemsMap.get(item.itemId)!;
          const unitPrice = masterItem?.estimatedCost || 0;
          const quantity = Number(item.quantity);
          const totalPrice = Number(unitPrice) * quantity;
          
          const poItemValues = {
              purchaseOrderId: purchaseOrder.id,
              projectItemId: item.id,
              itemId: item.itemId,
              description: masterItem?.description || 'Unknown Item',
              quantity: item.quantity.toString(),
              unit: masterItem?.unit || 'EA',
              unitPrice: unitPrice.toString(),
              totalPrice: totalPrice.toString(),
              deliveryStatus: 'pending',
              lineNumber: i + 1,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
          await db.insert(purchaseOrderItems)
            .values([poItemValues]);
        }
        
        // Create purchase order history entry
        const historyValues = {
          purchaseOrderId: purchaseOrder.id,
          status: 'draft',
          comments: 'Purchase order generated from project items',
          changedBy: user.id,
          changedAt: new Date()
        };
          
        await db.insert(purchaseOrderHistory)
          .values([historyValues]);
        
        createdPOs.push({
          id: purchaseOrder.id,
          purchaseOrderNumber: poNumber,
          vendorId: purchaseOrder.vendorId,
          vendorName: vendorId > 0 ? vendorsMap.get(vendorId)?.name || 'Unknown Vendor' : 'Unassigned',
          itemCount: items.length
        });
        
        nextPOSequence++;
      }
      
      res.status(201).json({
        success: true,
        message: `Successfully created ${createdPOs.length} purchase orders`,
        purchaseOrders: createdPOs
      });
    } catch (error) {
      console.error('Error generating purchase orders:', error);
      res.status(500).json({ error: 'Failed to generate purchase orders' });
    }
  });
}