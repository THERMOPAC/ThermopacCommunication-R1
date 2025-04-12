import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as xlsx from 'xlsx';
import { db } from './db';
import { masterItems, itemComponents } from '@shared/schema';
import { eq, and, ne } from 'drizzle-orm';
import { SQL } from 'drizzle-orm';
import { Express } from 'express';

// Set up multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Authentication middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

// Permission check
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

  interface MulterRequest extends Request {
    file?: Express.Multer.File;
    user?: any;
  }

  // API endpoint for importing components from Excel
  app.post('/api/master-items/components/import-excel', ensureAuthenticated, upload.single('file'), async (req: MulterRequest, res: Response) => {
    try {
      // Check if user has permissions
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ message: "You don't have permission to import components" });
      }

      // Check if file was provided
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Get the parent item ID and code from the request body
      const parentItemIdRaw = req.body.parentItemId;
      const parentItemCode = req.body.parentItemCode;
      
      console.log('Received component import request:', {
        parentItemIdRaw,
        parentItemCode,
        body: req.body
      });
      
      // Convert the parentItemId to a number
      const parentItemId = parseInt(parentItemIdRaw);

      if (isNaN(parentItemId) || !parentItemCode) {
        console.error('Invalid parent item data:', { parentItemIdRaw, parentItemId, parentItemCode });
        return res.status(400).json({ message: "Valid parent item ID and item code are required" });
      }
      
      // Verify parent item exists
      const [parentItem] = await db.select().from(masterItems).where(eq(masterItems.id, parentItemId));
      
      if (!parentItem) {
        return res.status(404).json({ message: "Parent item not found" });
      }

      // Process Excel file
      const workbook = xlsx.read(req.file.buffer);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON (array of objects)
      const data = xlsx.utils.sheet_to_json(worksheet);
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ 
          message: "Invalid Excel file format or empty data",
          results: {
            totalRecords: 0,
            imported: 0,
            skipped: 0,
            errors: ["No data found in the uploaded file"]
          }
        });
      }
      
      console.log(`Processing ${data.length} rows from Excel file`);
      
      // Process each row
      const results = {
        totalRecords: data.length,
        imported: 0,
        skipped: 0,
        errors: [] as string[]
      };
      
      for (let i = 0; i < data.length; i++) {
        const row = data[i] as any;
        const rowNumber = i + 2; // Excel starts at 1 and first row is header

        try {
          // Get required fields
          const itemCode = row['Item Code'] || row['ItemCode'] || row['Item_Code'] || row['ITEM CODE'];
          const quantity = row['Quantity'] || row['QTY'] || row['Qty'];
          
          if (!itemCode) {
            results.errors.push(`Row ${rowNumber}: Missing Item Code`);
            results.skipped++;
            continue;
          }
          
          if (!quantity || isNaN(Number(quantity))) {
            results.errors.push(`Row ${rowNumber}: Missing or invalid Quantity for Item Code ${itemCode}`);
            results.skipped++;
            continue;
          }
          
          // Check if component is the same as parent (cannot add itself as a component)
          if (itemCode === parentItemCode) {
            results.errors.push(`Row ${rowNumber}: Cannot add item ${itemCode} as its own component`);
            results.skipped++;
            continue;
          }
          
          // Find the component item in master items
          const [componentItem] = await db.select().from(masterItems).where(eq(masterItems.itemCode, itemCode));
          
          if (!componentItem) {
            results.errors.push(`Row ${rowNumber}: Item Code ${itemCode} not found in master items`);
            results.skipped++;
            continue;
          }
          
          // Check if component already exists to avoid duplicates
          const [existingComponent] = await db.select()
            .from(itemComponents)
            .where(
              and(
                eq(itemComponents.parentItemId, parentItemId),
                eq(itemComponents.componentItemId, componentItem.id)
              )
            );
          
          if (existingComponent) {
            // Update existing component quantity
            await db.update(itemComponents)
              .set({ quantity: String(quantity) })
              .where(eq(itemComponents.id, existingComponent.id));
            
            results.imported++;
            console.log(`Updated component: ${itemCode} for parent ${parentItemCode}`);
          } else {
            // Insert new component
            await db.insert(itemComponents).values({
              parentItemId: parentItemId,
              componentItemId: componentItem.id,
              quantity: String(quantity)
            });
            
            results.imported++;
            console.log(`Added component: ${itemCode} for parent ${parentItemCode}`);
          }
        } catch (error) {
          console.error(`Error processing row ${rowNumber}:`, error);
          results.errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          results.skipped++;
        }
      }
      
      // Return results
      res.status(200).json({ 
        message: "Components import completed",
        results
      });
      
    } catch (error) {
      console.error('Error importing components:', error);
      res.status(500).json({ 
        message: "Failed to import components",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // API endpoint to get components for a master item
  app.get('/api/master-items/:id/components', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      
      if (isNaN(itemId)) {
        return res.status(400).json({ message: "Invalid item ID" });
      }
      
      // Get the parent item first
      const [parentItem] = await db.select().from(masterItems).where(eq(masterItems.id, itemId));
      
      if (!parentItem) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Get components with their details
      const componentsWithDetails = await db.select({
        id: itemComponents.id,
        parentItemId: itemComponents.parentItemId,
        componentItemId: itemComponents.componentItemId,
        quantity: itemComponents.quantity,
        componentItem: {
          id: masterItems.id,
          itemCode: masterItems.itemCode,
          description: masterItems.description,
          uom: masterItems.uom,
          makeOrBuy: masterItems.makeOrBuy,
          drawingNo: masterItems.drawingNo
        }
      })
      .from(itemComponents)
      .leftJoin(masterItems, eq(itemComponents.componentItemId, masterItems.id))
      .where(eq(itemComponents.parentItemId, itemId));
      
      res.status(200).json(componentsWithDetails);
      
    } catch (error) {
      console.error('Error fetching item components:', error);
      res.status(500).json({ 
        message: "Failed to fetch item components",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}