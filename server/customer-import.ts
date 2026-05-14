import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import { buildExcelBuffer } from './excel-utils';
import { storage } from './storage';
import { pool } from './db';

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
  app.get('/api/customers/sample-excel', async (req: Request, res: Response) => {
    try {
      // Skip authentication check for now to debug the core functionality
      console.log('Sample Excel download requested');

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

      const columnWidths = [12, 30, 20, 25, 40, 40, 15, 15];
      const excelBuffer = await buildExcelBuffer('Customer Data', sampleData, columnWidths);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=customer_import_sample.xlsx');
      res.setHeader('Content-Length', excelBuffer.length);
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

  // ─── POST /api/customers/sap-sync ────────────────────────────────────────
  // Syncs customers from SAP BusinessPartners (CardType=C, CardCode > C10300)
  // Only inserts NEW records — existing sap_card_code rows are skipped.
  // Allowed roles: Superuser, General Manager, Senior Manager
  app.post('/api/customers/sap-sync', ensureAuthenticated, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const role: string = user?.role ?? '';
    const ALLOWED = ['Superuser', 'General Manager', 'Senior Manager'];
    if (!ALLOWED.includes(role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }

    const sapUser = process.env.SAP_USERNAME || '';
    const sapPass = process.env.SAP_PASSWORD || '';
    const sapDb   = process.env.SAP_COMPANY_DB || '';
    if (!sapUser || !sapPass || !sapDb) {
      return res.status(500).json({ message: 'SAP credentials not configured' });
    }

    // Create audit log row
    const logRes = await pool.query(
      `INSERT INTO sap_customer_sync_logs (triggered_by, started_at, status) VALUES ($1, NOW(), 'running') RETURNING id`,
      [user.id],
    );
    const logId: number = logRes.rows[0].id;

    let sessionCookie = '';
    const errors: string[] = [];
    let totalFetched = 0, imported = 0, skipped = 0, failed = 0;

    try {
      const { sapHttpsClient } = await import('./sap-b1-integration/sap-https-client');
      const loginResp = await sapHttpsClient.login(sapUser, sapPass, sapDb);
      sessionCookie = loginResp.sessionCookie;

      const PAGE_SIZE = 20;
      let sapSkip = 0;
      const allRows: Array<{
        CardCode: string; CardName: string; ContactPerson: string;
        Phone1: string; Address: string; City: string; Country: string; E_Mail: string;
      }> = [];

      // Paginate SAP with $select — standard fields only, no UDF, so $select is safe
      while (true) {
        const qs = new URLSearchParams({
          '$select': 'CardCode,CardName,ContactPerson,Phone1,Address,City,Country,E_Mail',
          '$filter': "CardType eq 'C' AND CardCode gt 'C10300'",
          '$top':    String(PAGE_SIZE),
          '$skip':   String(sapSkip),
        }).toString();

        const resp = await sapHttpsClient.authenticatedRequest(sessionCookie, {
          method: 'GET', url: '', path: `/b1s/v1/BusinessPartners?${qs}`,
        });

        if (!resp.ok) {
          throw new Error(`SAP returned ${resp.statusCode}: ${resp.body?.substring(0, 300)}`);
        }

        const page = JSON.parse(resp.body).value ?? [];
        for (const bp of page) {
          const code = String(bp.CardCode ?? '').trim();
          if (!code) continue;
          allRows.push({
            CardCode:      code,
            CardName:      String(bp.CardName      ?? '').trim(),
            ContactPerson: String(bp.ContactPerson ?? '').trim(),
            Phone1:        String(bp.Phone1        ?? '').trim(),
            Address:       String(bp.Address       ?? '').trim(),
            City:          String(bp.City          ?? '').trim(),
            Country:       String(bp.Country       ?? '').trim(),
            E_Mail:        String(bp.E_Mail        ?? '').trim(),
          });
        }

        if (page.length < PAGE_SIZE) break;
        sapSkip += PAGE_SIZE;
        if (allRows.length >= 10000) {
          console.warn('[customer-sap-sync] capped at 10 000 records');
          break;
        }
      }

      totalFetched = allRows.length;
      console.log(`[customer-sap-sync] fetched ${totalFetched} customers from SAP`);

      // Load existing sap_card_codes in one query to avoid per-row round-trips
      const existingRes = await pool.query<{ sap_card_code: string }>(
        `SELECT sap_card_code FROM customers WHERE sap_card_code IS NOT NULL`,
      );
      const existingCodes = new Set(existingRes.rows.map((r) => r.sap_card_code));

      for (const row of allRows) {
        if (existingCodes.has(row.CardCode)) {
          skipped++;
          continue;
        }
        try {
          await pool.query(
            `INSERT INTO customers
               (bp_code, bp_name, sap_card_code, contact_person, email, phone1,
                bill_to_address, sap_mail_city, sap_mail_country,
                sap_sync_status, sap_synced_at, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'synced',NOW(),NOW(),NOW())
             ON CONFLICT DO NOTHING`,
            [
              row.CardCode, row.CardName, row.CardCode,
              row.ContactPerson || null, row.E_Mail || null, row.Phone1 || null,
              row.Address || null, row.City || null, row.Country || null,
            ],
          );
          existingCodes.add(row.CardCode); // prevent duplication within same run
          imported++;
        } catch (err: any) {
          failed++;
          errors.push(`${row.CardCode}: ${err.message}`);
          console.error(`[customer-sap-sync] insert failed for ${row.CardCode}:`, err.message);
        }
      }

      // Logout (non-fatal)
      sapHttpsClient.logout(sessionCookie).catch(() => {});

      // Update audit log — success
      await pool.query(
        `UPDATE sap_customer_sync_logs SET
           completed_at = NOW(), status = $1,
           total_fetched = $2, imported = $3, skipped = $4, failed = $5, error_summary = $6
         WHERE id = $7`,
        [
          failed > 0 ? 'partial' : 'success',
          totalFetched, imported, skipped, failed,
          errors.length > 0 ? errors.slice(0, 20).join('\n') : null,
          logId,
        ],
      );

      console.log(`[customer-sap-sync] done — fetched=${totalFetched} imported=${imported} skipped=${skipped} failed=${failed}`);
      return res.json({ totalFetched, imported, skipped, failed, errors: errors.slice(0, 20) });

    } catch (err: any) {
      console.error('[customer-sap-sync] fatal error:', err.message);
      if (sessionCookie) {
        const { sapHttpsClient } = await import('./sap-b1-integration/sap-https-client');
        sapHttpsClient.logout(sessionCookie).catch(() => {});
      }
      await pool.query(
        `UPDATE sap_customer_sync_logs SET
           completed_at = NOW(), status = 'failed',
           total_fetched = $1, imported = $2, skipped = $3, failed = $4, error_summary = $5
         WHERE id = $6`,
        [totalFetched, imported, skipped, failed, err.message, logId],
      );
      return res.status(500).json({ message: err.message });
    }
  });
}