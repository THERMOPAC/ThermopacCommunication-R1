import multer from 'multer';
import { Router, Request, Response } from 'express';
import { read, utils } from 'xlsx';
import { storage } from './storage';
import { insertProjectItemSchema, insertMasterItemSchema } from '@shared/schema';
import { z } from 'zod';
// No need to import Express type, we'll use any for MulterFile

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

function canManage(role: string): boolean {
  const managerRoles = ["Superuser", "General Manager", "Senior Manager", "Manager"];
  return managerRoles.includes(role);
}

export function setupProjectItemsImportRoutes(app: Router) {
  // Configure multer for file uploads
  const multerStorage = multer.memoryStorage();
  const upload = multer({ 
    storage: multerStorage,
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB max file size
    }
  });

  // Map Excel column names to project item fields
  const columnMap: Record<string, string> = {
    'Item Code': 'itemCode',
    'Description': 'description',
    'Quantity': 'quantity',
    'UOM': 'uom',
    'Specification': 'specification',
    'Make': 'make',
    'Source Type': 'sourceType',
    'Supplier': 'supplier',
    'Make or Buy': 'make_or_buy',   // Added to support the make_or_buy column
    'Drawing No': 'drawingNo',      // Added to support the drawing_no column
    'Drawing Number': 'drawingNo'   // Alternative column name for drawing_no
  };

  // Define the fields that are required
  const requiredFields = ['itemCode', 'description', 'quantity', 'uom'];

  // Treat the req as any for multer file handling
  // This avoids TypeScript errors with the multer file interface
  type MulterRequest = any;

  app.post('/api/projects/items/import-excel', ensureAuthenticated, upload.single('file'), async (req: MulterRequest, res: Response) => {
    try {
      // Check if user has permissions to import project items
      if (!canManage(req.user!.role)) {
        return res.status(403).json({ message: "You don't have permission to import project items" });
      }

      // Check if file was provided
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Get the project ID and code from the request body
      const projectIdRaw = req.body.projectId;
      const projectCode = req.body.projectCode;
      
      console.log('Received project import request:', {
        projectIdRaw,
        projectCode,
        body: req.body
      });
      
      // Convert the projectId to a number
      const projectId = parseInt(projectIdRaw);

      if (isNaN(projectId) || !projectCode) {
        console.error('Invalid project data:', { projectIdRaw, projectId, projectCode });
        return res.status(400).json({ message: "Valid project ID and project code are required" });
      }
      
      // We can't directly check if project exists with getProject since it's using a different interface
      // Instead, we'll log the project ID for debugging and continue
      console.log('Processing import for project ID:', projectId, 'with code:', projectCode);

      // Check file type
      const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
      ];

      if (!allowedMimeTypes.includes(req.file.mimetype) && 
          !req.file.originalname.endsWith('.xlsx') && 
          !req.file.originalname.endsWith('.xls')) {
        return res.status(400).json({ message: "Invalid file type. Only Excel files (.xlsx, .xls) are allowed." });
      }

      const workbook = read(req.file.buffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = utils.sheet_to_json(worksheet, { header: 'A' });

      if (data.length < 2) {
        return res.status(400).json({ message: "The Excel file is empty or has no data rows" });
      }

      // Extract header row (first row)
      const headerRow: any = data[0];
      const headers: Record<string, number> = {};

      // Map Excel column letters to our field names
      Object.keys(headerRow).forEach(key => {
        const columnName = headerRow[key];
        if (columnName && columnMap[columnName]) {
          headers[columnMap[columnName]] = key.charCodeAt(0) - 65; // Convert A->0, B->1, etc.
        }
      });

      // Check if all required fields are present
      const missingFields = requiredFields.filter(field => !headers.hasOwnProperty(field));
      if (missingFields.length > 0) {
        return res.status(400).json({
          message: `Missing required columns: ${missingFields.join(', ')}`,
          requiredColumns: Object.keys(columnMap).filter(col => 
            requiredFields.includes(columnMap[col])
          ).join(', ')
        });
      }

      // Skip the header row, process data rows
      const results = {
        totalRecords: data.length - 1,
        imported: 0,
        skipped: 0,
        errors: [] as string[]
      };

      // Prepare items for import
      for (let i = 1; i < data.length; i++) {
        const row: any = data[i];
        
        // Skip empty rows
        if (!row['A']) {
          results.skipped++;
          continue;
        }

        // Extract raw data from Excel
        const rawItemData: Record<string, any> = {};
        for (const [field, colIndex] of Object.entries(headers)) {
          const colLetter = String.fromCharCode(65 + colIndex);
          
          if (row[colLetter] !== undefined) {
            if (field === 'quantity') {
              // Parse quantity to number
              const numValue = parseFloat(row[colLetter]);
              rawItemData[field] = isNaN(numValue) ? 0 : numValue;
            } else {
              rawItemData[field] = row[colLetter].toString().trim();
            }
          }
        }

        try {
          // First check if we have a master item with this code
          const itemCode = rawItemData.itemCode;
          if (!itemCode) {
            results.errors.push(`Row ${i+1}: Missing item code`);
            results.skipped++;
            continue;
          }

          // Step 1: Check if the master item exists or needs to be created
          let masterItem = await storage.getMasterItemByCode(itemCode);
          let masterItemId: number;

          if (!masterItem) {
            // Create new master item
            // Format makeOrBuy to match the expected enum values
            let makeOrBuy = null;
            if (rawItemData.make_or_buy) {
              // Normalize the value to match our enum
              const normalizedValue = rawItemData.make_or_buy.trim();
              if (normalizedValue.toLowerCase() === 'make' || normalizedValue.toLowerCase() === 'm') {
                makeOrBuy = 'Make';
              } else if (normalizedValue.toLowerCase() === 'buy' || normalizedValue.toLowerCase() === 'b') {
                makeOrBuy = 'Buy';
              }
            }
            
            const masterItemData = {
              itemCode: rawItemData.itemCode,
              description: rawItemData.description || 'No description provided',
              specification: rawItemData.specification || null,
              uom: rawItemData.uom || 'Nos',
              makeOrBuy: makeOrBuy,
              drawingNo: rawItemData.drawingNo || null,
              supplier: rawItemData.supplier || null,
              notes: rawItemData.notes || null,
              standardCost: rawItemData.standardCost || null
            };

            try {
              // Validate master item data
              const validMasterItem = insertMasterItemSchema.parse(masterItemData);
              
              // Create the master item
              masterItem = await storage.createMasterItem(validMasterItem);
              console.log('Created new master item:', masterItem.itemCode);
              masterItemId = masterItem.id;
            } catch (error) {
              console.error('Error creating master item:', error);
              if (error instanceof z.ZodError) {
                const errorMessages = error.errors.map(err => 
                  `Row ${i+1}: ${err.path.join('.')} - ${err.message} (master item)`
                );
                results.errors.push(...errorMessages);
              } else {
                results.errors.push(`Row ${i+1}: ${(error as Error).message || 'Unknown error'} (master item)`);
              }
              results.skipped++;
              continue;
            }
          } else {
            // Use existing master item but check if we need to update the drawing number
            masterItemId = masterItem.id;
            
            // Check if Drawing_No needs to be updated
            if (rawItemData.drawingNo && (!masterItem.drawingNo || masterItem.drawingNo !== rawItemData.drawingNo)) {
              console.log('Updating drawing number for existing master item:', masterItem.itemCode, 'to:', rawItemData.drawingNo);
              await storage.updateMasterItem(masterItem.id, { drawingNo: rawItemData.drawingNo });
            }
            
            console.log('Using existing master item:', masterItem.itemCode, 'with ID:', masterItemId);
          }

          // Step: 2 Create or update the project item referencing the master item
          // Ensure quantity is a valid number (default to 1 if not provided or invalid)
          const quantity = typeof rawItemData.quantity === 'number' && !isNaN(rawItemData.quantity) && rawItemData.quantity > 0 
            ? rawItemData.quantity 
            : 1;
          
          // Parse estimated cost if provided, otherwise set to null
          let estimatedCost = null;
          if (rawItemData.estimatedCost !== undefined && rawItemData.estimatedCost !== null) {
            const cost = parseFloat(rawItemData.estimatedCost);
            if (!isNaN(cost)) {
              estimatedCost = cost;
            }
          }
          
          // Parse actual cost if provided, otherwise set to null
          let actualCost = null;
          if (rawItemData.actualCost !== undefined && rawItemData.actualCost !== null) {
            const cost = parseFloat(rawItemData.actualCost);
            if (!isNaN(cost)) {
              actualCost = cost;
            }
          }
          
          const projectItemData = {
            projectId,
            projectCode,
            itemId: masterItemId,
            quantity,
            estimatedCost,
            actualCost,
            notes: rawItemData.notes || ''
          };

          try {
            // Validate project item data
            const validProjectItem = insertProjectItemSchema.parse(projectItemData);
            
            // Check if this item already exists for this project
            const existingItem = await storage.getProjectItemByItemIdAndProject(
              masterItemId,
              projectId
            );

            if (existingItem) {
              // Update the existing item instead of skipping it
              const { projectId, projectCode, itemId, ...updateDataRaw } = validProjectItem;
              
              // Convert numeric values to strings for compatibility with database schema
              const updateData: Record<string, any> = {};
              for (const [key, value] of Object.entries(updateDataRaw)) {
                if (typeof value === 'number') {
                  updateData[key] = value.toString();
                } else {
                  updateData[key] = value;
                }
              }
              
              console.log('Updating project item with data:', {
                id: existingItem.id,
                itemId: masterItemId,
                updateData
              });
              
              await storage.updateProjectItem(existingItem.id, updateData);
              console.log('Updated existing project item for master item ID:', masterItemId);
              results.imported++;
            } else {
              // Create new project item
              // Convert numeric values to strings for database schema compatibility
              const createData: Record<string, any> = {};
              for (const [key, value] of Object.entries(validProjectItem)) {
                if (typeof value === 'number') {
                  createData[key] = value.toString();
                } else {
                  createData[key] = value;
                }
              }
              // Use type assertion to bypass type checking since we've explicitly converted values
              await storage.createProjectItem(createData as any);
              console.log('Created new project item for master item ID:', masterItemId);
              results.imported++;
            }
          } catch (error) {
            console.error('Error with project item:', error);
            if (error instanceof z.ZodError) {
              const errorMessages = error.errors.map(err => 
                `Row ${i+1}: ${err.path.join('.')} - ${err.message} (project item)`
              );
              results.errors.push(...errorMessages);
            } else {
              results.errors.push(`Row ${i+1}: ${(error as Error).message || 'Unknown error'} (project item)`);
            }
            results.skipped++;
          }
        } catch (error) {
          console.error('General error in item processing:', error);
          results.errors.push(`Row ${i+1}: System error - ${(error as Error).message || 'Unknown error'}`);
          results.skipped++;
        }
      }

      console.log(`Project items import completed: ${results.imported} imported, ${results.skipped} skipped`);
      res.status(200).json({ results });
      
    } catch (error) {
      console.error('Error importing project items:', error);
      
      // Handle database connection errors specifically
      if (error instanceof Error && 
          (error.message.includes('terminating connection') || 
           error.message.includes('database') || 
           error.toString().includes('57P01'))) {
        return res.status(503).json({
          message: 'Database connection error: The database server is currently unavailable. Please try again in a moment.',
          error: process.env.NODE_ENV === 'development' ? error : undefined,
          isDbConnectionError: true
        });
      }
      
      // Handle other errors
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Error importing project items',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  });
}