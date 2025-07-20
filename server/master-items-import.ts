import { Router, Request, Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { storage } from "./storage";

// Authentication middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

// Authorization check
function canManage(role: string): boolean {
  return ["Superuser", "General Manager", "Senior Manager", "Manager"].includes(role);
}

export function setupMasterItemsImportRoutes(app: Router) {
  // Configure multer for file upload
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    },
  });

  // Route to download sample Excel file
  app.get('/api/master-items/sample-excel', async (req: Request, res: Response) => {
    try {
      console.log('Master items sample Excel download requested');

      // Create sample data
      const sampleData = [
        {
          'Item Code': 'PUMP-001',
          'Description': 'Centrifugal Pump 100HP',
          'UOM': 'Nos',
          'Make/Buy': 'Buy',
          'Drawing No': 'DWG-PUMP-001'
        },
        {
          'Item Code': 'VALVE-002',
          'Description': 'Gate Valve DN150 PN16',
          'UOM': 'Nos',
          'Make/Buy': 'Buy',
          'Drawing No': 'DWG-VALVE-002'
        },
        {
          'Item Code': 'PIPE-003',
          'Description': 'Carbon Steel Pipe 6" Sch40',
          'UOM': 'Meter',
          'Make/Buy': 'Buy',
          'Drawing No': 'DWG-PIPE-003'
        },
        {
          'Item Code': 'TANK-004',
          'Description': 'Storage Tank 1000L SS316',
          'UOM': 'Nos',
          'Make/Buy': 'Make',
          'Drawing No': 'DWG-TANK-004'
        },
        {
          'Item Code': 'MOTOR-005',
          'Description': 'Electric Motor 50HP 415V',
          'UOM': 'Nos',
          'Make/Buy': 'Buy',
          'Drawing No': 'DWG-MOTOR-005'
        }
      ];

      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(sampleData);

      // Set column widths for better readability
      worksheet['!cols'] = [
        { wch: 15 }, // Item Code
        { wch: 30 }, // Description
        { wch: 10 }, // UOM
        { wch: 12 }, // Make/Buy
        { wch: 20 }  // Drawing No
      ];

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Master Items');

      // Generate Excel buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      // Set headers for file download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="master_items_sample.xlsx"');
      
      // Send the Excel file
      res.send(excelBuffer);
      
      console.log('Master items sample Excel file sent successfully');
    } catch (error) {
      console.error('Error creating master items sample Excel file:', error);
      res.status(500).json({ error: 'Failed to generate sample file' });
    }
  });

  app.post('/api/master-items/import-excel', ensureAuthenticated, upload.single('file'), async (req: any, res: Response) => {
    try {
      // Check authorization
      if (!req.user || !canManage(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: "You don't have permission to import master items"
        });
      }

      // Check if file was provided
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No file uploaded"
        });
      }

      // Check file type
      const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();
      if (!["xlsx", "xls", "csv"].includes(fileExtension || "")) {
        return res.status(400).json({
          success: false,
          error: "Invalid file format. Please upload an Excel file (.xlsx, .xls) or CSV file"
        });
      }

      // Read Excel file
      const workbook = XLSX.read(req.file.buffer);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

      // Process the data
      const results = {
        total: jsonData.length,
        created: 0,
        skipped: 0,
        errors: [] as any[],
      };

      // Validate and import each row
      for (const row of jsonData) {
        try {
          // Extract fields from Excel row with more flexible column names
          const getValueFromRow = (possibleKeys: string[], defaultValue: string = '') => {
            for (const key of possibleKeys) {
              if (row[key] !== undefined) {
                return String(row[key] || '').trim();
              }
            }
            return defaultValue;
          };
          
          const itemData: any = {
            itemCode: getValueFromRow(['Item Code', 'ItemCode', 'Item_Code', 'Code']),
            description: getValueFromRow(['Description', 'Desc', 'Item Description']),
            uom: getValueFromRow(['UOM', 'Unit', 'Unit of Measure', 'Unit Of Measurement', 'UnitOfMeasure', 'Unit_of_Measure']),
            makeOrBuy: getValueFromRow(['make_or_buy', 'Make or Buy', 'Make/Buy', 'MakeOrBuy', 'Make_Buy']),
            drawingNo: getValueFromRow(['Drawing_No', 'Drawing No', 'DrawingNo', 'Drawing Number', 'Drawing']),
            // Additional optional fields
            supplier: getValueFromRow(['Supplier', 'Vendor', 'Source']),
            specification: getValueFromRow(['Specification', 'Specs', 'Specifications', 'Technical Specification']),
            standardCost: (() => {
              const cost = getValueFromRow(['Standard Cost', 'StandardCost', 'Cost', 'Price', 'Standard_Cost']);
              return cost ? parseFloat(cost) : undefined;
            })(),
            notes: getValueFromRow(['Notes', 'Note', 'Comments', 'Remarks']),
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Validate required fields
          if (!itemData.itemCode) {
            throw new Error("Item Code is required");
          }

          // Check if item code already exists
          const existingItem = await storage.getMasterItemByCode(itemData.itemCode);
          if (existingItem) {
            results.skipped++;
            results.errors.push({
              row: Object.assign({}, row),
              error: `Item Code "${itemData.itemCode}" already exists`
            });
            continue;
          }

          // Create the master item
          await storage.createMasterItem(itemData);
          results.created++;
        } catch (error) {
          results.skipped++;
          results.errors.push({
            row: Object.assign({}, row),
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      // Return import results
      res.status(200).json({
        success: true,
        results
      });
    } catch (error) {
      console.error("Error importing master items:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "An error occurred while importing master items"
      });
    }
  });
}