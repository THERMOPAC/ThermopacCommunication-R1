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
  
  // Route to download sample Excel file
  app.get('/api/customers/sample-excel', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      // Check if user has management privileges
      const user = req.user as any;
      if (!canManage(user?.role)) {
        return res.status(403).json({ 
          message: "You don't have permission to download sample files" 
        });
      }

      // Create sample data
      const sampleData = [
        {
          'BP Code': 'C001',
          'BP Name': 'ACME Corporation',
          'Contact Person': 'John Smith',
          'E-Mail': 'john.smith@acme.com',
          'Bill_To_Address': '123 Business St, Suite 100, New York, NY 10001',
          'Ship_To_Address': '456 Warehouse Ave, Brooklyn, NY 11201',
          'Continent': 'North America',
          'Country Name': 'United States'
        },
        {
          'BP Code': 'C002',
          'BP Name': 'Global Industries Ltd',
          'Contact Person': 'Sarah Johnson',
          'E-Mail': 'sarah.j@globalind.com',
          'Bill_To_Address': '789 Corporate Blvd, London, UK SW1A 1AA',
          'Ship_To_Address': '321 Distribution Center, Manchester, UK M1 1AA',
          'Continent': 'Europe',
          'Country Name': 'United Kingdom'
        },
        {
          'BP Code': 'C003',
          'BP Name': 'Tech Solutions Pvt Ltd',
          'Contact Person': 'Raj Patel',
          'E-Mail': 'raj.patel@techsol.in',
          'Bill_To_Address': 'Plot 45, IT Park, Bangalore, Karnataka 560001',
          'Ship_To_Address': 'Warehouse 12, Electronic City, Bangalore 560100',
          'Continent': 'Asia',
          'Country Name': 'India'
        }
      ];

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(sampleData);

      // Set column widths for better readability
      const columnWidths = [
        { wch: 12 }, // BP Code
        { wch: 30 }, // BP Name
        { wch: 20 }, // Contact Person
        { wch: 25 }, // E-Mail
        { wch: 40 }, // Bill_To_Address
        { wch: 40 }, // Ship_To_Address
        { wch: 15 }, // Continent
        { wch: 15 }  // Country Name
      ];
      worksheet['!cols'] = columnWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Data');

      // Generate Excel buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=customer_import_sample.xlsx');
      res.setHeader('Content-Length', excelBuffer.length);

      // Send the file
      res.send(excelBuffer);
    } catch (error) {
      console.error('Error generating sample Excel file:', error);
      return res.status(500).json({
        message: "An error occurred while generating the sample file",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
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

          // Create new customer with all available fields including bill and ship addresses
          await storage.createCustomer({
            bpCode: row['BP Code'],
            bpName: row['BP Name'],
            contactPerson: row['Contact Person'] || null,
            email: row['E-Mail'] || null,
            billToAddress: row['Bill_To_Address'] || null,
            shipToAddress: row['Ship_To_Address'] || null,
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
          results.errors.push(`Error processing row: ${JSON.stringify(row)}. Error: ${errorMsg}`);
        }
      }

      // Add helpful message about supported columns
      const supportedFields = "BP Code, BP Name, Contact Person, E-Mail, Bill_To_Address, Ship_To_Address, Continent, Country Name";
      
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