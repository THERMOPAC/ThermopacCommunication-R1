import multer from 'multer';
import { Router, Request, Response } from 'express';
import { read, utils } from 'xlsx';
import { storage } from './storage';
import { insertProjectItemSchema } from '@shared/schema';
import { z } from 'zod';

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
    'Make or Buy': 'make_or_buy'    // Added to support the make_or_buy column
  };

  // Define the fields that are required
  const requiredFields = ['itemCode', 'description', 'quantity', 'uom'];

  interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }

  interface MulterRequest extends Request {
    file?: File;
    user?: any;
  }

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

        // Create item object from row data
        const item: Record<string, any> = {
          projectId,
          projectCode,
          itemCode: '',
          description: '',
          quantity: 0,
          uom: ''
        };

        // Extract data using the headers mapping
        for (const [field, colIndex] of Object.entries(headers)) {
          const colLetter = String.fromCharCode(65 + colIndex);
          
          if (row[colLetter] !== undefined) {
            // Handle quantity field - store as string in database
            if (field === 'quantity') {
              // Parse to number for validation, but store as string
              const numValue = parseFloat(row[colLetter]);
              if (isNaN(numValue)) {
                item[field] = "0";
              } else {
                item[field] = numValue.toString();
              }
            } else {
              item[field] = row[colLetter].toString().trim();
            }
          }
        }

        try {
          // Validate against the schema
          const validItem = insertProjectItemSchema.parse(item);
          
          // Check if this item code already exists for this project
          try {
            // Try to see if a method for checking duplicate items exists
            let existingItem = null;
            
            try {
              existingItem = await storage.getProjectItemByCodeAndProject(
                validItem.itemCode, 
                validItem.projectId
              );
              console.log('Found existing item check result:', existingItem);
            } catch (lookupError) {
              console.error('Error looking up existing item:', lookupError);
              // If the method doesn't exist, we'll proceed with creation
              existingItem = null;
            }

            if (existingItem) {
              // Update the existing item instead of skipping it
              try {
                // Prepare update data - remove itemCode and projectId as they shouldn't be updated
                // Ensure all fields have the correct types
                const { itemCode, projectId, projectCode, ...updateDataRaw } = validItem;
                
                // Convert all numeric fields to strings for database compatibility
                const updateData: Record<string, any> = {};
                for (const [key, value] of Object.entries(updateDataRaw)) {
                  if (typeof value === 'number') {
                    updateData[key] = value.toString();
                  } else {
                    updateData[key] = value;
                  }
                }
                
                // Update the project item with new data
                console.log('Updating project item with data:', {
                  id: existingItem.id,
                  itemCode: validItem.itemCode,
                  updateData
                });
                await storage.updateProjectItem(existingItem.id, updateData);
                console.log('Updated existing project item:', validItem.itemCode);
                results.imported++;
              } catch (error) {
                const updateError = error as Error;
                console.error('Error updating project item:', updateError);
                results.errors.push(`Row ${i+1}: Failed to update item - ${updateError.message || 'Unknown error'}`);
                results.skipped++;
              }
            } else {
              // Create the project item
              try {
                await storage.createProjectItem(validItem);
                console.log('Created new project item:', validItem.itemCode);
                results.imported++;
              } catch (error) {
                const createError = error as Error;
                console.error('Error creating project item:', createError);
                results.errors.push(`Row ${i+1}: Failed to create item - ${createError.message || 'Unknown error'}`);
                results.skipped++;
              }
            }
          } catch (error) {
            const checkError = error as Error;
            console.error('General error in project item creation:', checkError);
            results.errors.push(`Row ${i+1}: System error - ${checkError.message || 'Unknown error'}`);
            results.skipped++;
          }
        } catch (error) {
          if (error instanceof z.ZodError) {
            const errorMessages = error.errors.map(err => 
              `Row ${i+1}: ${err.path.join('.')} - ${err.message}`
            );
            results.errors.push(...errorMessages);
          } else {
            results.errors.push(`Row ${i+1}: ${(error as Error).message || 'Unknown error'}`);
          }
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