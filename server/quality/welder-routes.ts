import { Request, Response } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

// Define ensureAuthenticated middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Helper function to generate next Welder ID
async function generateNextWelderId() {
  const result = await db.execute(sql`
    SELECT MAX(CAST(SUBSTRING("welderId" FROM 3) AS INTEGER)) as max_id
    FROM welders
  `);
  
  const maxId = parseInt(result.rows[0]?.max_id) || 0;
  const nextId = maxId + 1;
  return `W-${nextId.toString().padStart(3, '0')}`;
}

// Helper function to generate next Certificate Number
async function generateNextCertificateNo() {
  const result = await db.execute(sql`
    SELECT MAX(CAST(SUBSTRING("certificateNo" FROM 5) AS INTEGER)) as max_id
    FROM welders
  `);
  
  const maxId = parseInt(result.rows[0]?.max_id) || 0;
  const nextId = maxId + 1;
  return `WQC-${nextId.toString().padStart(3, '0')}`;
}

export function setupWelderRoutes(app: any) {
  // Get all welders
  app.get('/api/quality/welders', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const welders = await db.execute(sql`
        SELECT * FROM welders ORDER BY "welderId" ASC
      `);
      
      res.json(welders.rows);
    } catch (error) {
      console.error('Error fetching welders:', error);
      res.status(500).json({ error: 'Failed to fetch welders' });
    }
  });

  // Get welder by ID
  app.get('/api/quality/welders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const welder = await db.execute(sql`
        SELECT * FROM welders WHERE id = ${id}
      `);
      
      if (welder.rows.length === 0) {
        return res.status(404).json({ error: 'Welder not found' });
      }
      
      res.json(welder.rows[0]);
    } catch (error) {
      console.error('Error fetching welder:', error);
      res.status(500).json({ error: 'Failed to fetch welder' });
    }
  });

  // Create new welder
  app.post('/api/quality/welders', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log("Received welder creation request:", JSON.stringify(req.body, null, 2));
      
      const {
        name,
        trade,
        processQualified,
        materialGroupQualified,
        thicknessRange,
        positionQualified,
        wpsNumber,
        testDate,
        testResults,
        certificateExpiryDate,
        status,
        remarks
      } = req.body;
      
      // Validate required fields
      if (!name || !trade || !wpsNumber || !testDate || !certificateExpiryDate || !status) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Ensure arrays are properly handled
      const processArray = Array.isArray(processQualified) ? processQualified : [];
      const materialArray = Array.isArray(materialGroupQualified) ? materialGroupQualified : [];
      const positionArray = Array.isArray(positionQualified) ? positionQualified : [];
      
      // Validate date formats
      try {
        if (testDate) {
          const parsedTestDate = new Date(testDate);
          if (isNaN(parsedTestDate.getTime())) {
            return res.status(400).json({ error: 'Invalid test date format. Use YYYY-MM-DD format.' });
          }
        }
        
        if (certificateExpiryDate) {
          const parsedExpiryDate = new Date(certificateExpiryDate);
          if (isNaN(parsedExpiryDate.getTime())) {
            return res.status(400).json({ error: 'Invalid certificate expiry date format. Use YYYY-MM-DD format.' });
          }
        }
      } catch (dateError) {
        console.error("Date validation error:", dateError);
        return res.status(400).json({ error: 'Invalid date format', details: String(dateError) });
      }

      // Generate IDs
      const welderId = await generateNextWelderId();
      const certificateNo = await generateNextCertificateNo();
      
      console.log("Generating IDs completed successfully. Welder ID:", welderId, "Certificate No:", certificateNo);
      
      // Simplify the SQL insert to focus on the potential issue
      try {
        console.log("About to execute database insert with arrays:", {
          processArray: JSON.stringify(processArray),
          materialArray: JSON.stringify(materialArray),
          positionArray: JSON.stringify(positionArray)
        });
        
        // Create welder record
        const result = await db.execute(sql`
          INSERT INTO welders (
            "welderId", 
            name, 
            trade, 
            "processQualified", 
            "materialGroupQualified", 
            "thicknessRange", 
            "positionQualified", 
            "wpsNumber", 
            "testDate", 
            "testResults", 
            "certificateNo", 
            "certificateExpiryDate", 
            status, 
            remarks,
            "createdAt"
          ) 
          VALUES (
            ${welderId}, 
            ${name}, 
            ${trade}, 
            ${processArray}, 
            ${materialArray}, 
            ${thicknessRange}, 
            ${positionArray}, 
            ${wpsNumber}, 
            ${testDate}, 
            ${testResults}, 
            ${certificateNo}, 
            ${certificateExpiryDate}, 
            ${status}, 
            ${remarks || ""},
            NOW()
          )
          RETURNING *
        `);
        
        console.log("Welder created successfully:", result.rows[0]);
        res.status(201).json(result.rows[0]);
      } catch (dbError) {
        console.error('Database error:', dbError);
        res.status(500).json({ 
          error: 'Database error',
          message: dbError instanceof Error ? dbError.message : String(dbError)
        });
      }
    } catch (error) {
      console.error('Error creating welder:', error);
      // Send a more detailed error response
      res.status(500).json({ 
        error: 'Failed to create welder', 
        message: error instanceof Error ? error.message : String(error),
        stack: process.env.NODE_ENV !== 'production' ? (error instanceof Error ? error.stack : undefined) : undefined
      });
    }
  });

  // Update welder
  app.put('/api/quality/welders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log("Received welder update request:", JSON.stringify(req.body, null, 2));
      
      const { id } = req.params;
      const {
        name,
        trade,
        processQualified,
        materialGroupQualified,
        thicknessRange,
        positionQualified,
        wpsNumber,
        testDate,
        testResults,
        certificateExpiryDate,
        status,
        remarks
      } = req.body;
      
      // Validate required fields
      if (!name || !trade || !wpsNumber || !testDate || !certificateExpiryDate || !status) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Ensure arrays are properly handled
      const processArray = Array.isArray(processQualified) ? processQualified : [];
      const materialArray = Array.isArray(materialGroupQualified) ? materialGroupQualified : [];
      const positionArray = Array.isArray(positionQualified) ? positionQualified : [];
      
      // Validate date formats
      try {
        if (testDate) {
          const parsedTestDate = new Date(testDate);
          if (isNaN(parsedTestDate.getTime())) {
            return res.status(400).json({ error: 'Invalid test date format. Use YYYY-MM-DD format.' });
          }
        }
        
        if (certificateExpiryDate) {
          const parsedExpiryDate = new Date(certificateExpiryDate);
          if (isNaN(parsedExpiryDate.getTime())) {
            return res.status(400).json({ error: 'Invalid certificate expiry date format. Use YYYY-MM-DD format.' });
          }
        }
      } catch (dateError) {
        console.error("Date validation error:", dateError);
        return res.status(400).json({ error: 'Invalid date format', details: String(dateError) });
      }
      
      console.log("About to execute database update with arrays:", {
        processArray: JSON.stringify(processArray),
        materialArray: JSON.stringify(materialArray),
        positionArray: JSON.stringify(positionArray)
      });
      
      try {
        // Update welder record
        const result = await db.execute(sql`
          UPDATE welders 
          SET 
            name = ${name}, 
            trade = ${trade}, 
            "processQualified" = ${processArray}, 
            "materialGroupQualified" = ${materialArray}, 
            "thicknessRange" = ${thicknessRange}, 
            "positionQualified" = ${positionArray}, 
            "wpsNumber" = ${wpsNumber}, 
            "testDate" = ${testDate}, 
            "testResults" = ${testResults}, 
            "certificateExpiryDate" = ${certificateExpiryDate}, 
            status = ${status}, 
            remarks = ${remarks || ""},
            "updatedAt" = NOW()
          WHERE id = ${id}
          RETURNING *
        `);
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Welder not found' });
        }
        
        console.log("Welder updated successfully:", result.rows[0]);
        res.json(result.rows[0]);
      } catch (dbError) {
        console.error('Database error during update:', dbError);
        res.status(500).json({ 
          error: 'Database error during update',
          message: dbError instanceof Error ? dbError.message : String(dbError)
        });
      }
    } catch (error) {
      console.error('Error updating welder:', error);
      // Send a more detailed error response
      res.status(500).json({ 
        error: 'Failed to update welder', 
        message: error instanceof Error ? error.message : String(error),
        stack: process.env.NODE_ENV !== 'production' ? (error instanceof Error ? error.stack : undefined) : undefined
      });
    }
  });

  // Delete welder
  app.delete('/api/quality/welders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const result = await db.execute(sql`
        DELETE FROM welders 
        WHERE id = ${id}
        RETURNING *
      `);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Welder not found' });
      }
      
      res.json({ message: 'Welder deleted successfully' });
    } catch (error) {
      console.error('Error deleting welder:', error);
      res.status(500).json({ error: 'Failed to delete welder' });
    }
  });

  // Get active welders for a specific WPS
  app.get('/api/quality/welders/by-wps/:wpsNumber', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { wpsNumber } = req.params;
      
      const welders = await db.execute(sql`
        SELECT * FROM welders 
        WHERE "wpsNumber" = ${wpsNumber}
        AND status = 'Active'
        ORDER BY name ASC
      `);
      
      res.json(welders.rows);
    } catch (error) {
      console.error('Error fetching welders by WPS:', error);
      res.status(500).json({ error: 'Failed to fetch welders' });
    }
  });

  // Get expiring certificates (welders whose certificates expire within 30 days)
  app.get('/api/quality/welders/expiring-soon', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const welders = await db.execute(sql`
        SELECT * FROM welders 
        WHERE status = 'Active'
        AND "certificateExpiryDate" <= (CURRENT_DATE + INTERVAL '30 days')
        AND "certificateExpiryDate" > CURRENT_DATE
        ORDER BY "certificateExpiryDate" ASC
      `);
      
      res.json(welders.rows);
    } catch (error) {
      console.error('Error fetching expiring certifications:', error);
      res.status(500).json({ error: 'Failed to fetch expiring certifications' });
    }
  });
}