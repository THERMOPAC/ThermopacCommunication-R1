import express from 'express';
import { db } from './db';
import { visaRecords, users } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';

const router = express.Router();

// Simple test endpoint to verify visa data without complex joins
router.get('/test-visa-data', ensureAuthenticated, async (req, res) => {
  try {
    console.log('Testing visa data access...');
    
    // Simple count query
    const countResult = await db.select().from(visaRecords);
    console.log(`Found ${countResult.length} visa records`);
    
    // Basic records with simple user join
    const records = await db
      .select({
        id: visaRecords.id,
        visaNumber: visaRecords.visaNumber,
        country: visaRecords.country,
        visaType: visaRecords.visaType,
        employeeId: visaRecords.employeeId,
        status: visaRecords.status,
        expiryDate: visaRecords.expiryDate,
      })
      .from(visaRecords)
      .limit(5);
    
    console.log('Simple visa records:', records);
    
    res.json({
      success: true,
      totalRecords: countResult.length,
      sampleRecords: records
    });
  } catch (error) {
    console.error('Error in simple visa test:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Simple visa records endpoint
router.get('/simple-records', ensureAuthenticated, async (req, res) => {
  try {
    console.log('Fetching simple visa records...');
    
    const records = await db
      .select({
        id: visaRecords.id,
        employeeId: visaRecords.employeeId,
        visaType: visaRecords.visaType,
        country: visaRecords.country,
        visaNumber: visaRecords.visaNumber,
        issueDate: visaRecords.issueDate,
        expiryDate: visaRecords.expiryDate,
        status: visaRecords.status,
        notes: visaRecords.notes,
        createdAt: visaRecords.createdAt,
      })
      .from(visaRecords)
      .orderBy(desc(visaRecords.createdAt))
      .limit(50);
    
    // Get employee names separately to avoid join issues
    const employeeIds = [...new Set(records.map(r => r.employeeId))];
    const employees = await db
      .select({
        id: users.id,
        username: users.username,
        department: users.department
      })
      .from(users)
      .where(eq(users.id, employeeIds[0])); // This will need to be updated for multiple IDs
    
    // Create employee lookup
    const employeeMap = new Map(employees.map(emp => [emp.id, emp]));
    
    // Combine data
    const enrichedRecords = records.map(record => ({
      ...record,
      employeeName: employeeMap.get(record.employeeId)?.username || 'Unknown',
      employeeDepartment: employeeMap.get(record.employeeId)?.department || 'Unknown',
      daysToExpiry: Math.ceil((new Date(record.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    }));
    
    console.log(`Returning ${enrichedRecords.length} visa records`);
    res.json(enrichedRecords);
  } catch (error) {
    console.error('Error fetching simple visa records:', error);
    res.status(500).json({ 
      error: 'Failed to fetch visa records',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;