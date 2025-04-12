import { Request, Response, Router } from 'express';
import multer from 'multer';
import * as xlsx from 'xlsx';
import { db } from './db';
import { eq, and } from 'drizzle-orm';
import { masterItems, itemComponents } from '@shared/schema';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function canManage(role: string): boolean {
  return ['Superuser', 'General Manager', 'Senior Manager', 'Manager'].includes(role);
}

export function setupItemComponentsImportRoutes(app: Router) {
  interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }

  // Configure multer for memory storage
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    }
  });

  interface MulterRequest extends Request {
    file?: Express.Multer.File;
    user?: any;
  }

  app.post('/api/master-items/components/import-excel', ensureAuthenticated, upload.single('file'), async (req: MulterRequest, res: Response) => {
    try {
      // Check role-based permissions
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ error: 'Not authorized to import item components' });
      }

      // Check if file exists
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Get parent item ID from form data
      const parentItemId = parseInt(req.body.parentItemId);
      const parentItemCode = req.body.parentItemCode;
      
      if (isNaN(parentItemId)) {
        return res.status(400).json({ error: 'Invalid parent item ID' });
      }

      // Verify parent item exists
      const parentItem = await db.select()
        .from(masterItems)
        .where(eq(masterItems.id, parentItemId))
        .limit(1);

      if (parentItem.length === 0) {
        return res.status(404).json({ error: 'Parent item not found' });
      }

      // Process Excel file
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);

      console.log(`Processing ${data.length} rows from Excel for parent item ${parentItemCode}`);

      if (data.length === 0) {
        return res.status(400).json({ error: 'Excel file contains no data' });
      }

      // Track import results
      const results = {
        totalRecords: data.length,
        imported: 0,
        skipped: 0,
        errors: [] as string[]
      };

      // Process each row
      for (const row of data) {
        try {
          // Validate row data
          const rowObj = row as Record<string, any>;
          const itemCode = rowObj.ItemCode || rowObj['Item Code'];
          const quantity = rowObj.Quantity || rowObj.QTY || 1;

          if (!itemCode) {
            results.errors.push(`Row missing Item Code`);
            results.skipped++;
            continue;
          }

          // Find the component item by code
          const componentItems = await db.select()
            .from(masterItems)
            .where(eq(masterItems.itemCode, itemCode))
            .limit(1);

          if (componentItems.length === 0) {
            results.errors.push(`Item with code ${itemCode} not found`);
            results.skipped++;
            continue;
          }

          const componentItem = componentItems[0];

          // Skip if trying to add parent as its own component (prevent circular references)
          if (componentItem.id === parentItemId) {
            results.errors.push(`Cannot add item ${itemCode} as a component of itself`);
            results.skipped++;
            continue;
          }

          // Check if the component already exists for this parent
          const existingComponents = await db.select()
            .from(itemComponents)
            .where(
              and(
                eq(itemComponents.parentItemId, parentItemId),
                eq(itemComponents.componentItemId, componentItem.id)
              )
            );

          if (existingComponents.length > 0) {
            // Update the quantity if the component already exists
            await db.update(itemComponents)
              .set({
                quantity: parseFloat(quantity.toString()),
                updatedAt: new Date()
              })
              .where(eq(itemComponents.id, existingComponents[0].id));

            console.log(`Updated component ${itemCode} for parent ${parentItemCode}`);
          } else {
            // Insert new component
            await db.insert(itemComponents)
              .values({
                parentItemId: parentItemId,
                componentItemId: componentItem.id,
                quantity: parseFloat(quantity.toString()),
                createdAt: new Date(),
                updatedAt: new Date()
              });

            console.log(`Added component ${itemCode} to parent ${parentItemCode}`);
          }

          results.imported++;
        } catch (err) {
          console.error('Error processing row:', err);
          results.errors.push(`Error processing row: ${err instanceof Error ? err.message : 'Unknown error'}`);
          results.skipped++;
        }
      }

      console.log(`Import results: ${results.imported} imported, ${results.skipped} skipped`);
      res.status(200).json({
        message: 'Import processed',
        results: results
      });
    } catch (error) {
      console.error('Error importing components:', error);
      res.status(500).json({
        error: 'Failed to import components',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/master-items/:id/components', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      
      if (isNaN(itemId)) {
        return res.status(400).json({ error: 'Invalid item ID' });
      }

      // Join item_components with master_items to get component details
      const components = await db.select({
        id: itemComponents.id,
        parentItemId: itemComponents.parentItemId,
        componentItemId: itemComponents.componentItemId,
        quantity: itemComponents.quantity,
        componentItemCode: masterItems.itemCode,
        componentDescription: masterItems.description,
        componentUom: masterItems.uom,
        componentMakeOrBuy: masterItems.makeOrBuy,
        componentDrawingNo: masterItems.drawingNo,
        createdAt: itemComponents.createdAt,
        updatedAt: itemComponents.updatedAt
      })
      .from(itemComponents)
      .innerJoin(
        masterItems,
        eq(itemComponents.componentItemId, masterItems.id)
      )
      .where(eq(itemComponents.parentItemId, itemId));

      res.status(200).json(components);
    } catch (error) {
      console.error('Error fetching item components:', error);
      res.status(500).json({
        error: 'Failed to fetch item components',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}