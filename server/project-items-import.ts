import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { storage } from './storage';
import { InsertProjectItem } from '@shared/schema';

// Define a function to check if a user is authenticated
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).send('Not authenticated');
}

// Define a function to check if a user can manage project items
function canManage(role: string): boolean {
  return ['Superuser', 'General Manager', 'Senior Manager', 'Manager'].includes(role);
}

export function setupProjectItemsImportRoutes(app: Router) {
  // Configure multer for memory storage
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    }
  });

  // Define expected column headers and required fields
  const EXPECTED_COLUMNS = [
    'Item Code',
    'Description',
    'Quantity',
    'UOM',
  ];

  // Define column mapping from Excel headers to database fields
  const COLUMN_MAPPING: Record<string, keyof InsertProjectItem> = {
    'Item Code': 'itemCode',
    'Description': 'description',
    'Quantity': 'quantity',
    'UOM': 'uom',
    'Specification': 'specification',
    'Make': 'make',
    'Source Type': 'sourceType',
    'Supplier': 'supplier'
  };

  // Define the interface for the file in the request
  interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }

  // Extend the Request interface to include the file
  interface MulterRequest extends Request {
    file?: File;
    user?: any;
  }

  // Set up the route for importing project items from Excel
  app.post('/api/projects/items/import-excel', ensureAuthenticated, upload.single('file'), async (req: MulterRequest, res: Response) => {
    try {
      // Check if user role can manage project items
      if (!req.user || !canManage(req.user.role)) {
        return res.status(403).send('You do not have permission to import project items');
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).send('No file uploaded');
      }

      // Check if the file is an Excel file
      if (!req.file.mimetype.includes('excel') && !req.file.originalname.match(/\.(xlsx|xls)$/)) {
        return res.status(400).send('Only Excel files are allowed');
      }

      // Get project ID and code from the request
      const projectId = parseInt(req.body.projectId);
      const projectCode = req.body.projectCode;

      if (!projectId || isNaN(projectId)) {
        return res.status(400).send('Invalid project ID');
      }

      if (!projectCode) {
        return res.status(400).send('Project code is required');
      }

      // Read the Excel file
      const workbook = XLSX.read(req.file.buffer);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<any>(worksheet);

      if (data.length === 0) {
        return res.status(400).send('Excel file is empty');
      }

      // Validate the file has required columns
      const firstRow = data[0];
      const missingColumns = EXPECTED_COLUMNS.filter(col => !(col in firstRow));
      
      if (missingColumns.length > 0) {
        return res.status(400).send(`Missing required columns: ${missingColumns.join(', ')}`);
      }

      // Results tracking
      const results = {
        totalRecords: data.length,
        imported: 0,
        skipped: 0,
        errors: [] as string[]
      };

      // Process each row
      for (const row of data) {
        try {
          // Map Excel columns to database fields
          const item: Partial<InsertProjectItem> = {
            projectId,
            projectCode,
          };

          // Map each column
          for (const [excelCol, dbField] of Object.entries(COLUMN_MAPPING)) {
            if (excelCol in row) {
              // Handle numeric fields
              if (dbField === 'quantity') {
                item[dbField] = parseFloat(row[excelCol]);
                if (isNaN(item[dbField] as number)) {
                  throw new Error(`Invalid quantity value for item code "${row['Item Code']}"`);
                }
              } else {
                item[dbField] = row[excelCol]?.toString()?.trim();
              }
            }
          }

          // Validate required fields
          if (!item.itemCode) {
            throw new Error('Item Code is required');
          }

          if (!item.description) {
            throw new Error(`Description is required for item code "${item.itemCode}"`);
          }

          if (item.quantity === undefined || item.quantity <= 0) {
            throw new Error(`Quantity must be greater than 0 for item code "${item.itemCode}"`);
          }

          if (!item.uom) {
            throw new Error(`UOM is required for item code "${item.itemCode}"`);
          }

          // Check if item with same code already exists in this project
          const existingItem = await storage.getProjectItemByCodeAndProject(item.itemCode!, projectCode);
          
          if (existingItem) {
            results.skipped++;
            results.errors.push(`Item with code "${item.itemCode}" already exists in this project`);
            continue;
          }

          // Create the project item
          await storage.createProjectItem(item as InsertProjectItem);
          results.imported++;
        } catch (error: any) {
          results.skipped++;
          results.errors.push(error.message || 'Unknown error processing row');
        }
      }

      return res.status(200).json({ results });

    } catch (error: any) {
      console.error('Error importing project items:', error);
      return res.status(500).send(error.message || 'An error occurred during import');
    }
  });
}