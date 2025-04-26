import { Request, Response } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { ensureAuthenticated } from '../auth-middleware';

// Helper function to generate next Welder ID
async function generateNextWelderId() {
  const result = await db.execute(sql`
    SELECT MAX(CAST(SUBSTRING("welderId" FROM 3) AS INTEGER)) as max_id
    FROM welders
  `);
  
  const maxId = result.rows[0]?.max_id || 0;
  const nextId = maxId + 1;
  return `W-${nextId.toString().padStart(3, '0')}`;
}

// Helper function to generate next Certificate Number
async function generateNextCertificateNo() {
  const result = await db.execute(sql`
    SELECT MAX(CAST(SUBSTRING("certificateNo" FROM 5) AS INTEGER)) as max_id
    FROM welders
  `);
  
  const maxId = result.rows[0]?.max_id || 0;
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

      // Generate IDs
      const welderId = await generateNextWelderId();
      const certificateNo = await generateNextCertificateNo();
      
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
          ${processQualified}, 
          ${materialGroupQualified}, 
          ${thicknessRange}, 
          ${positionQualified}, 
          ${wpsNumber}, 
          ${testDate}, 
          ${testResults}, 
          ${certificateNo}, 
          ${certificateExpiryDate}, 
          ${status}, 
          ${remarks},
          NOW()
        )
        RETURNING *
      `);
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating welder:', error);
      res.status(500).json({ error: 'Failed to create welder' });
    }
  });

  // Update welder
  app.put('/api/quality/welders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
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
      
      // Update welder record
      const result = await db.execute(sql`
        UPDATE welders 
        SET 
          name = ${name}, 
          trade = ${trade}, 
          "processQualified" = ${processQualified}, 
          "materialGroupQualified" = ${materialGroupQualified}, 
          "thicknessRange" = ${thicknessRange}, 
          "positionQualified" = ${positionQualified}, 
          "wpsNumber" = ${wpsNumber}, 
          "testDate" = ${testDate}, 
          "testResults" = ${testResults}, 
          "certificateExpiryDate" = ${certificateExpiryDate}, 
          status = ${status}, 
          remarks = ${remarks},
          "updatedAt" = NOW()
        WHERE id = ${id}
        RETURNING *
      `);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Welder not found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating welder:', error);
      res.status(500).json({ error: 'Failed to update welder' });
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