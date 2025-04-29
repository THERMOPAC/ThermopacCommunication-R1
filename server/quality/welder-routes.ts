import express, { Request, Response } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { ensureAuthenticated } from '../auth-middleware';
import { generateWelderId } from '../utils/id-generators';

export function registerWelderRoutes(app: express.Express) {
  // Get all welders
  app.get('/api/quality/welders', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const welders = await db.execute(sql`
        SELECT 
          id, 
          "welderId", 
          name, 
          trade, 
          status, 
          remarks,
          photo_path as "photoPath",
          date_of_birth as "dateOfBirth",
          contact_number as "contactNumber",
          hire_date as "hireDate",
          identification_type as "identificationType",
          identification_number as "identificationNumber",
          "createdAt", 
          "updatedAt"
        FROM welders 
        ORDER BY id DESC
      `);
      
      return res.status(200).json(welders.rows);
    } catch (error) {
      console.error('Error in /api/quality/welders GET route:', error);
      return res.status(500).json({
        error: 'Server error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get welder by ID
  app.get('/api/quality/welders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const result = await db.execute(sql`
        SELECT 
          id, 
          "welderId", 
          name, 
          trade, 
          status, 
          remarks,
          photo_path as "photoPath",
          date_of_birth as "dateOfBirth",
          contact_number as "contactNumber",
          hire_date as "hireDate",
          identification_type as "identificationType",
          identification_number as "identificationNumber",
          "createdAt", 
          "updatedAt"
        FROM welders 
        WHERE id = ${id}
      `);
      
      if (result.rows && result.rows.length > 0) {
        return res.status(200).json(result.rows[0]);
      } else {
        return res.status(404).json({ error: 'Welder not found' });
      }
    } catch (error) {
      console.error('Error in /api/quality/welders/:id GET route:', error);
      return res.status(500).json({
        error: 'Server error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Create welder
  app.post('/api/quality/welders', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log("Received welder creation request:", JSON.stringify(req.body, null, 2));
      
      const {
        name,
        trade,
        status,
        remarks,
        dateOfBirth,
        contactNumber,
        hireDate,
        identificationType,
        identificationNumber
      } = req.body;
      
      // Validate required fields
      if (!name || !trade || !status) {
        return res.status(400).json({ error: 'Missing required fields: name, trade and status are required' });
      }
      
      // Generate next welder ID
      const welderId = await generateWelderId();
      console.log(`Generated new welder ID: ${welderId}`);
      
      // Insert into database
      const result = await db.execute(sql`
        INSERT INTO welders (
          "welderId", 
          name, 
          trade, 
          status, 
          remarks,
          date_of_birth,
          contact_number,
          hire_date,
          identification_type,
          identification_number,
          "createdAt", 
          "updatedAt"
        ) 
        VALUES (
          ${welderId}, 
          ${name}, 
          ${trade}, 
          ${status}, 
          ${remarks || ""}, 
          ${dateOfBirth || null},
          ${contactNumber || null},
          ${hireDate || null},
          ${identificationType || null},
          ${identificationNumber || null},
          NOW(), 
          NOW()
        )
        RETURNING 
          id, 
          "welderId", 
          name, 
          trade, 
          status, 
          remarks,
          date_of_birth as "dateOfBirth",
          contact_number as "contactNumber",
          hire_date as "hireDate",
          identification_type as "identificationType",
          identification_number as "identificationNumber"
      `);
      
      if (result.rows && result.rows.length > 0) {
        console.log("Welder created successfully:", result.rows[0]);
        return res.status(201).json({
          success: true,
          message: 'Welder created successfully',
          data: result.rows[0]
        });
      } else {
        return res.status(500).json({ error: 'Failed to create welder' });
      }
    } catch (error) {
      console.error('Error in /api/quality/welders POST route:', error);
      return res.status(500).json({
        error: 'Server error',
        message: error instanceof Error ? error.message : String(error)
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
        status,
        remarks,
        dateOfBirth,
        contactNumber,
        hireDate,
        identificationType,
        identificationNumber
      } = req.body;
      
      // Validate required fields - simplified now that qualification details are in certificate table
      if (!name || !trade || !status) {
        return res.status(400).json({ error: 'Missing required fields: name, trade and status are required' });
      }
      
      console.log("All required fields are present");
      
      // Validate date formats if present
      try {
        if (dateOfBirth) {
          const parsedDateOfBirth = new Date(dateOfBirth);
          if (isNaN(parsedDateOfBirth.getTime())) {
            return res.status(400).json({ error: 'Invalid date of birth format. Use YYYY-MM-DD format.' });
          }
        }
        
        if (hireDate) {
          const parsedHireDate = new Date(hireDate);
          if (isNaN(parsedHireDate.getTime())) {
            return res.status(400).json({ error: 'Invalid hire date format. Use YYYY-MM-DD format.' });
          }
        }
        
        console.log("Date validation passed");
      } catch (dateError) {
        console.error("Date validation error:", dateError);
        return res.status(400).json({ error: 'Invalid date format', details: String(dateError) });
      }
      
      // Database update
      try {
        console.log("Executing database update for welder personal information");
        
        // Update welder record with new personal info fields
        const result = await db.execute(sql`
          UPDATE welders 
          SET 
            name = ${name}, 
            trade = ${trade}, 
            status = ${status}, 
            remarks = ${remarks || ""},
            date_of_birth = ${dateOfBirth || null},
            contact_number = ${contactNumber || null},
            hire_date = ${hireDate || null},
            identification_type = ${identificationType || null},
            identification_number = ${identificationNumber || null},
            "updatedAt" = NOW()
          WHERE id = ${id}
          RETURNING id, "welderId", name, trade, status, remarks, 
                   date_of_birth as "dateOfBirth", 
                   contact_number as "contactNumber", 
                   hire_date as "hireDate", 
                   identification_type as "identificationType", 
                   identification_number as "identificationNumber",
                   photo_path as "photoPath"
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
      console.error('Error in /api/quality/welders/:id PUT route:', error);
      return res.status(500).json({
        error: 'Server error',
        message: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  });

  // Delete welder
  app.delete('/api/quality/welders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      // First, check if welder exists
      const checkResult = await db.execute(sql`SELECT id FROM welders WHERE id = ${id}`);
      
      if (!checkResult.rows || checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Welder not found' });
      }
      
      // Delete welder
      await db.execute(sql`DELETE FROM welders WHERE id = ${id}`);
      
      return res.status(200).json({
        success: true,
        message: 'Welder deleted successfully'
      });
    } catch (error) {
      console.error('Error in /api/quality/welders/:id DELETE route:', error);
      return res.status(500).json({
        error: 'Server error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
