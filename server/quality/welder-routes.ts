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
      res.setHeader('Content-Type', 'application/json');
      
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
      
      console.log("All required fields are present");
      
      // Ensure arrays are properly handled
      const processArray = Array.isArray(processQualified) ? processQualified : [];
      const materialArray = Array.isArray(materialGroupQualified) ? materialGroupQualified : [];
      const positionArray = Array.isArray(positionQualified) ? positionQualified : [];
      
      console.log("Sanitized arrays:", {
        processArray,
        materialArray,
        positionArray
      });
      
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
        
        console.log("Date validation passed");
      } catch (dateError) {
        console.error("Date validation error:", dateError);
        return res.status(400).json({ error: 'Invalid date format', details: String(dateError) });
      }

      // Generate IDs
      let welderId, certificateNo;
      try {
        welderId = await generateNextWelderId();
        certificateNo = await generateNextCertificateNo();
        console.log("Generated IDs successfully. Welder ID:", welderId, "Certificate No:", certificateNo);
      } catch (idError) {
        console.error("Error generating IDs:", idError);
        return res.status(500).json({ 
          error: 'Failed to generate IDs',
          message: idError instanceof Error ? idError.message : String(idError)
        });
      }
      
      // Database insert
      try {
        console.log("Executing database insert");
        
        // Create welder record with simplified query
        const result = await db.execute(sql`
          INSERT INTO welders (
            "welderId", name, trade, "processQualified", "materialGroupQualified", 
            "thicknessRange", "positionQualified", "wpsNumber", "testDate", 
            "testResults", "certificateNo", "certificateExpiryDate", status, 
            remarks, "createdAt"
          ) 
          VALUES (
            ${welderId}, ${name}, ${trade}, ${processArray}, ${materialArray},
            ${thicknessRange}, ${positionArray}, ${wpsNumber}, ${testDate},
            ${testResults}, ${certificateNo}, ${certificateExpiryDate}, ${status},
            ${remarks || ""}, NOW()
          )
          RETURNING id, "welderId", name, trade
        `);
        
        if (result.rows && result.rows.length > 0) {
          console.log("Welder created successfully:", result.rows[0]);
          return res.status(201).json({
            success: true,
            message: 'Welder created successfully',
            data: result.rows[0]
          });
        } else {
          console.error('No rows returned from insert');
          return res.status(500).json({ 
            error: 'Database insert did not return expected data',
            success: false
          });
        }
      } catch (dbError) {
        console.error('Database error:', dbError);
        return res.status(500).json({ 
          error: 'Database error',
          message: dbError instanceof Error ? dbError.message : String(dbError),
          success: false
        });
      }
    } catch (error) {
      console.error('Error creating welder:', error);
      // Send a more detailed error response
      return res.status(500).json({ 
        error: 'Failed to create welder', 
        message: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  });

  // Update welder
  app.put('/api/quality/welders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log("Received welder update request:", JSON.stringify(req.body, null, 2));
      res.setHeader('Content-Type', 'application/json');
      
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
      
      console.log("All required fields are present");
      
      // Ensure arrays are properly handled
      const processArray = Array.isArray(processQualified) ? processQualified : [];
      const materialArray = Array.isArray(materialGroupQualified) ? materialGroupQualified : [];
      const positionArray = Array.isArray(positionQualified) ? positionQualified : [];
      
      console.log("Sanitized arrays:", {
        processArray,
        materialArray,
        positionArray
      });
      
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
        
        console.log("Date validation passed");
      } catch (dateError) {
        console.error("Date validation error:", dateError);
        return res.status(400).json({ error: 'Invalid date format', details: String(dateError) });
      }
      
      // Database update
      try {
        console.log("Executing database update");
        
        // Update welder record with simplified query
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
          RETURNING id, "welderId", name, trade
        `);
        
        if (result.rows && result.rows.length > 0) {
          console.log("Welder updated successfully:", result.rows[0]);
          return res.status(200).json({
            success: true,
            message: 'Welder updated successfully',
            data: result.rows[0]
          });
        } else {
          console.error('Welder not found for update');
          return res.status(404).json({ 
            error: 'Welder not found',
            success: false
          });
        }
      } catch (dbError) {
        console.error('Database error during update:', dbError);
        return res.status(500).json({ 
          error: 'Database error during update',
          message: dbError instanceof Error ? dbError.message : String(dbError),
          success: false
        });
      }
    } catch (error) {
      console.error('Error updating welder:', error);
      // Send a more detailed error response
      return res.status(500).json({ 
        error: 'Failed to update welder', 
        message: error instanceof Error ? error.message : String(error),
        success: false
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