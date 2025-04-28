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
  
  const maxIdStr = result.rows[0]?.max_id as string | undefined;
  const maxId = maxIdStr ? parseInt(maxIdStr) : 0;
  const nextId = maxId + 1;
  return `W-${nextId.toString().padStart(3, '0')}`;
}

// Helper function to generate next Certificate Number
async function generateNextCertificateNo() {
  const result = await db.execute(sql`
    SELECT MAX(CAST(SUBSTRING("certificateNo" FROM 5) AS INTEGER)) as max_id
    FROM welders
  `);
  
  const maxIdStr = result.rows[0]?.max_id as string | undefined;
  const maxId = maxIdStr ? parseInt(maxIdStr) : 0;
  const nextId = maxId + 1;
  return `WQC-${nextId.toString().padStart(3, '0')}`;
}

export function setupTestWelderRoute(app: any) {
  // Test route that just returns a JSON response
  app.post('/api/quality/test-welder', async (req: Request, res: Response) => {
    // Force content type to be application/json
    res.setHeader('Content-Type', 'application/json');
    
    try {
      console.log("TEST ROUTE - Received request body:", JSON.stringify(req.body, null, 2));
      
      // Just return a success message without doing anything
      return res.status(200).json({ 
        success: true, 
        message: 'Test route successful',
        receivedData: req.body
      });
    } catch (error) {
      console.error('TEST ROUTE - Error:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Test route error', 
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Non-authenticated test route for creating welders
  app.post('/api/quality/test-create-welder', async (req: Request, res: Response) => {
    // Force content type to be application/json
    res.setHeader('Content-Type', 'application/json');
    
    try {
      console.log("TEST CREATE WELDER - Received request body:", JSON.stringify(req.body, null, 2));
      
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
      
      // Simplified validation
      if (!name || !trade || !wpsNumber) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Ensure arrays are properly handled
      const processArray = Array.isArray(processQualified) ? processQualified : [];
      const materialArray = Array.isArray(materialGroupQualified) ? materialGroupQualified : [];
      const positionArray = Array.isArray(positionQualified) ? positionQualified : [];
      
      console.log("Sanitized arrays:", {
        processArray,
        materialArray,
        positionArray
      });
      
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
            ${thicknessRange || ''}, ${positionArray}, ${wpsNumber}, ${testDate || new Date().toISOString().split('T')[0]},
            ${testResults || 'Pass'}, ${certificateNo}, ${certificateExpiryDate || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]}, 
            ${status || 'Active'}, ${remarks || ""}, NOW()
          )
          RETURNING id, "welderId", name, trade
        `);
        
        if (result.rows && result.rows.length > 0) {
          console.log("Test welder created successfully:", result.rows[0]);
          return res.status(201).json({
            success: true,
            message: 'Test welder created successfully',
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
      console.error('Error creating test welder:', error);
      return res.status(500).json({ 
        error: 'Failed to create test welder', 
        message: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  });
}