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
}