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
          // Extract fields from Excel row
          const itemData: any = {
            itemCode: String(row['Item Code'] || '').trim(),
            description: String(row['Description'] || '').trim(),
            uom: String(row['UOM'] || '').trim(),
            make_or_buy: String(row['make_or_buy'] || '').trim(),
            drawing_no: String(row['Drawing_No'] || '').trim(),
            // Additional optional fields
            supplier: row['Supplier'] !== undefined ? String(row['Supplier']).trim() : undefined,
            specification: row['Specification'] !== undefined ? String(row['Specification']).trim() : undefined,
            standard_cost: row['Standard Cost'] !== undefined ? parseFloat(row['Standard Cost']) : undefined,
            notes: row['Notes'] !== undefined ? String(row['Notes']).trim() : undefined,
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