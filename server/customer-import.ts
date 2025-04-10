import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { storage } from './storage';

// Configure multer for memory storage (files are kept in memory as Buffer objects)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB limit
  }
});

// Authentication middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
}

// Function to check if a user has management privileges
function canManage(role: string): boolean {
  const managementRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
  return managementRoles.includes(role);
}

// Add customer import routes to express router
export function setupCustomerImportRoutes(app: Router) {
  // Define types for multer file to avoid TypeScript errors
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

  // Define the route to handle customer import from Excel
  app.post('/api/customers/import-excel', ensureAuthenticated, upload.single('file'), async (req: MulterRequest, res: Response) => {
    try {
      // Check if user has management privileges
      if (!canManage(req.user.role)) {
        return res.status(403).json({ 
          message: "You don't have permission to import customers" 
        });
      }

      // Check if a file was provided
      if (!req.file) {
        return res.status(400).json({ 
          message: "No file uploaded" 
        });
      }

      // Check file type
      if (!['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(req.file.mimetype)) {
        return res.status(400).json({ 
          message: "Invalid file type. Please upload an Excel file" 
        });
      }

      // Parse Excel data
      const buffer = req.file.buffer;
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      // Assuming the first sheet contains the data
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert sheet to JSON
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet);
      
      if (rows.length === 0) {
        return res.status(400).json({ 
          message: "The file contains no data" 
        });
      }

      // Process the data
      const results = {
        totalRecords: rows.length,
        imported: 0,
        skipped: 0,
        errors: [] as string[]
      };

      // Process each row
      for (const row of rows) {
        try {
          // Validate required fields
          if (!row['BP Code'] || !row['BP Name']) {
            results.skipped++;
            results.errors.push(`Skipped row with missing BP Code or BP Name: ${JSON.stringify(row)}`);
            continue;
          }

          // Check if customer with BP Code already exists
          const existingCustomer = await storage.getCustomerByBPCode(row['BP Code']);
          if (existingCustomer) {
            results.skipped++;
            results.errors.push(`Skipped existing BP Code: ${row['BP Code']}`);
            continue;
          }

          // Create new customer
          // Note: We're only using fields that exist in the database schema
          // Bill_To_Address and Ship_To_Address are in the Excel file but not in our database schema
          await storage.createCustomer({
            bpCode: row['BP Code'],
            bpName: row['BP Name'],
            contactPerson: row['Contact Person'] || null,
            email: row['E-Mail'] || null,
            continent: row['Continent'] || null,
            countryName: row['Country Name'] || null,
            createdAt: new Date(),
            updatedAt: new Date()
          });

          results.imported++;
        } catch (error) {
          console.error('Error processing row:', error);
          results.skipped++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push(`Error processing row: ${JSON.stringify(row)}. Note: Bill_To_Address and Ship_To_Address are not stored in the database. Error: ${errorMsg}`);
        }
      }

      // Add helpful message about supported columns
      const supportedFields = "BP Code, BP Name, Contact Person, E-Mail, Continent, Country Name";
      
      // Return results
      return res.status(200).json({
        message: "Import completed successfully",
        results,
        supportedFields
      });
    } catch (error) {
      console.error('Error importing customers:', error);
      return res.status(500).json({
        message: "An error occurred while importing customers",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
}