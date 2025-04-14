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

  // Map Excel column names to component item fields (including variations of names)
  const columnMap: Record<string, string> = {
    // Standard column names
    'Item Code': 'itemCode',
    'ItemCode': 'itemCode',
    'Quantity': 'quantity',
    'QTY': 'quantity',
    'Description': 'description',
    'UOM': 'uom',
    // Additional variations
    'Item': 'itemCode',
    'Component Code': 'itemCode',
    'Component': 'itemCode',
    'Part Number': 'itemCode',
    'Qty': 'quantity',
    'Desc': 'description'
  };
  
  // Define required fields
  const requiredFields = ['itemCode', 'quantity'];

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

      // Process Excel file - support both formats (header-based and non-header-based)
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // First try to read as JSON with headers
      let data = xlsx.utils.sheet_to_json(worksheet);
      let useHeaderMapping = false;
      
      // If no data found, try reading with column letters as headers
      if (data.length === 0) {
        data = xlsx.utils.sheet_to_json(worksheet, { header: 'A' });
        useHeaderMapping = true;
      }

      console.log(`Processing ${data.length} rows from Excel for parent item ${parentItemCode}`);

      if (data.length === 0) {
        return res.status(400).json({ error: 'Excel file contains no data' });
      }

      // Track import results
      const results = {
        totalRecords: data.length - (useHeaderMapping ? 1 : 0), // Subtract header row when using header mapping
        imported: 0,
        skipped: 0,
        errors: [] as string[]
      };

      // If using header mapping, extract and map headers from first row
      let headers: Record<string, string> = {};
      if (useHeaderMapping) {
        const headerRow: any = data[0];
        
        Object.keys(headerRow).forEach((colLetter) => {
          const columnName = headerRow[colLetter]?.toString();
          if (columnName && columnMap[columnName]) {
            headers[colLetter] = columnMap[columnName];
          }
        });
        
        // Check if required fields are present
        const missingFields = requiredFields.filter(field => 
          !Object.values(headers).includes(field)
        );
        
        if (missingFields.length > 0) {
          return res.status(400).json({ 
            error: `Missing required columns: ${missingFields.join(', ')}`,
            requiredColumns: Object.keys(columnMap)
              .filter(col => requiredFields.includes(columnMap[col]))
              .join(', ')
          });
        }
      }

      // Process each row
      const startIndex = useHeaderMapping ? 1 : 0; // Skip header row if using header mapping
      for (let i = startIndex; i < data.length; i++) {
        try {
          const row = data[i] as Record<string, any>;
          let itemCode: string | undefined;
          let quantity: number = 1;
          
          // Extract data based on format
          if (useHeaderMapping) {
            // Use mapped headers
            for (const [colLetter, fieldName] of Object.entries(headers)) {
              if (row[colLetter] !== undefined) {
                if (fieldName === 'itemCode') {
                  itemCode = row[colLetter].toString().trim();
                } else if (fieldName === 'quantity') {
                  const numValue = parseFloat(row[colLetter]);
                  quantity = isNaN(numValue) ? 1 : numValue;
                }
              }
            }
          } else {
            // Direct column names in the Excel
            // Check for itemCode under various possible column names
            for (const possibleName of ['ItemCode', 'Item Code', 'Item', 'Component Code', 'Component', 'Part Number']) {
              if (row[possibleName] !== undefined) {
                itemCode = row[possibleName].toString().trim();
                break;
              }
            }
            
            // Check for quantity under various possible column names
            for (const possibleName of ['Quantity', 'QTY', 'Qty']) {
              if (row[possibleName] !== undefined) {
                const numValue = parseFloat(row[possibleName]);
                quantity = isNaN(numValue) ? 1 : numValue;
                break;
              }
            }
          }

          // Skip empty rows or rows without item code
          if (!itemCode) {
            results.errors.push(`Row ${i + 1}: Missing Item Code`);
            results.skipped++;
            continue;
          }
          
          console.log(`Processing item code: ${itemCode} with quantity: ${quantity}`);

          // Find the component item by code
          const componentItems = await db.select()
            .from(masterItems)
            .where(eq(masterItems.itemCode, itemCode))
            .limit(1);

          let componentItem;
          
          if (componentItems.length === 0) {
            // Item doesn't exist - create a new master item similar to project items import
            console.log(`Creating new master item: ${itemCode}`);
            
            try {
              // Get description from the Excel if available
              let description = '';
              if (useHeaderMapping) {
                for (const [colLetter, fieldName] of Object.entries(headers)) {
                  if (fieldName === 'description' && row[colLetter]) {
                    description = row[colLetter].toString().trim();
                    break;
                  }
                }
              } else {
                // Check common description column names
                for (const descField of ['Description', 'Desc']) {
                  if (row[descField]) {
                    description = row[descField].toString().trim();
                    break;
                  }
                }
              }
              
              // Create minimal master item record
              const [newItem] = await db.insert(masterItems)
                .values({
                  itemCode: itemCode,
                  description: description || `Component ${itemCode}`,
                  uom: 'Nos', // Default UOM
                  createdAt: new Date(),
                  updatedAt: new Date()
                })
                .returning();
              
              componentItem = newItem;
              console.log(`Created new master item with ID: ${componentItem.id}`);
            } catch (err) {
              console.error(`Failed to create master item ${itemCode}:`, err);
              results.errors.push(`Row ${i + 1}: Failed to create master item for ${itemCode}: ${err instanceof Error ? err.message : 'Unknown error'}`);
              results.skipped++;
              continue;
            }
          } else {
            componentItem = componentItems[0];
          }

          // Skip if trying to add parent as its own component (prevent circular references)
          if (componentItem.id === parentItemId) {
            results.errors.push(`Row ${i + 1}: Cannot add item ${itemCode} as a component of itself`);
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
                quantity: quantity.toString(),
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
                quantity: quantity.toString(),
                createdAt: new Date(),
                updatedAt: new Date()
              });

            console.log(`Added component ${itemCode} to parent ${parentItemCode}`);
          }

          results.imported++;
        } catch (err) {
          console.error('Error processing row:', err);
          results.errors.push(`Row ${i + 1}: Error processing row: ${err instanceof Error ? err.message : 'Unknown error'}`);
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