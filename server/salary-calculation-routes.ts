import { Router, Request, Response } from 'express';
import { salaryCalculationEngine, SalaryCalculationInput } from './salary-calculation-engine';
import { ensureAuthenticated } from './auth-middleware';

const router = Router();

/**
 * Calculate salary for a single employee
 */
router.post('/calculate', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('🔢 Salary calculation request received:', req.body);
    
    const input: SalaryCalculationInput = req.body;
    
    // Validate required fields
    if (!input.userId || !input.month || !input.year) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, month, year'
      });
    }
    
    // Validate month and year ranges
    if (input.month < 1 || input.month > 12) {
      return res.status(400).json({
        success: false,
        error: 'Month must be between 1 and 12'
      });
    }
    
    if (input.year < 2000 || input.year > 2100) {
      return res.status(400).json({
        success: false,
        error: 'Year must be between 2000 and 2100'
      });
    }
    
    const result = await salaryCalculationEngine.calculateSalary(input);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error: any) {
    console.error('❌ Error calculating salary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate salary',
      message: error.message
    });
  }
});

/**
 * Calculate salary for multiple employees
 */
router.post('/calculate/bulk', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('🔢 Bulk salary calculation request received:', req.body);
    
    const { userIds, month, year } = req.body;
    
    // Validate required fields
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userIds must be a non-empty array'
      });
    }
    
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: month, year'
      });
    }
    
    // Validate month and year ranges
    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        error: 'Month must be between 1 and 12'
      });
    }
    
    if (year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        error: 'Year must be between 2000 and 2100'
      });
    }
    
    const results = await salaryCalculationEngine.calculateBulkSalary(userIds, month, year);
    
    res.json({
      success: true,
      data: results,
      summary: {
        totalEmployees: userIds.length,
        successfulCalculations: results.length,
        failedCalculations: userIds.length - results.length
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error calculating bulk salary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate bulk salary',
      message: error.message
    });
  }
});

/**
 * Generate salary slip for an employee
 */
router.get('/slip/:userId/:month/:year', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const month = parseInt(req.params.month);
    const year = parseInt(req.params.year);
    
    console.log(`🧾 Generating salary slip for user ${userId}, ${month}/${year}`);
    
    // Validate parameters
    if (isNaN(userId) || isNaN(month) || isNaN(year)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters: userId, month, and year must be numbers'
      });
    }
    
    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        error: 'Month must be between 1 and 12'
      });
    }
    
    if (year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        error: 'Year must be between 2000 and 2100'
      });
    }
    
    const salarySlip = await salaryCalculationEngine.generateSalarySlip(userId, month, year);
    
    res.json({
      success: true,
      data: salarySlip
    });
    
  } catch (error: any) {
    console.error('❌ Error generating salary slip:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate salary slip',
      message: error.message
    });
  }
});

/**
 * Get salary calculation preview (without saving)
 */
router.post('/preview', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('👀 Salary calculation preview request received:', req.body);
    
    const input: SalaryCalculationInput = req.body;
    
    // Validate required fields
    if (!input.userId || !input.month || !input.year) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, month, year'
      });
    }
    
    // Calculate salary (same as calculate but marked as preview)
    const result = await salaryCalculationEngine.calculateSalary(input);
    
    res.json({
      success: true,
      data: {
        ...result,
        isPreview: true
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error calculating salary preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate salary preview',
      message: error.message
    });
  }
});

/**
 * Get salary calculation summary for a department
 */
router.get('/summary/department/:department/:month/:year', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { department, month, year } = req.params;
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    console.log(`📊 Generating salary summary for department ${department}, ${monthNum}/${yearNum}`);
    
    // Validate parameters
    if (isNaN(monthNum) || isNaN(yearNum)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters: month and year must be numbers'
      });
    }
    
    // Get all users in department
    const { db } = await import('./db');
    const { users } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    
    const departmentUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.department, department));
    
    const userIds = departmentUsers.map(u => u.id);
    
    if (userIds.length === 0) {
      return res.json({
        success: true,
        data: {
          department,
          month: monthNum,
          year: yearNum,
          totalEmployees: 0,
          calculations: [],
          summary: {
            totalGrossEarnings: 0,
            totalNetPay: 0,
            totalEmployerContributions: 0,
            totalCTC: 0
          }
        }
      });
    }
    
    // Calculate salary for all users in department
    const calculations = await salaryCalculationEngine.calculateBulkSalary(userIds, monthNum, yearNum);
    
    // Calculate summary
    const summary = calculations.reduce((acc, calc) => {
      acc.totalGrossEarnings += calc.grossEarnings;
      acc.totalNetPay += calc.netPay;
      acc.totalEmployerContributions += calc.totalEmployerContributions;
      acc.totalCTC += calc.ctcMonthly;
      return acc;
    }, {
      totalGrossEarnings: 0,
      totalNetPay: 0,
      totalEmployerContributions: 0,
      totalCTC: 0
    });
    
    res.json({
      success: true,
      data: {
        department,
        month: monthNum,
        year: yearNum,
        totalEmployees: userIds.length,
        calculations,
        summary
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error generating department salary summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate department salary summary',
      message: error.message
    });
  }
});

/**
 * Get salary calculation summary for the entire organization
 */
router.get('/summary/organization/:month/:year', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { month, year } = req.params;
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    console.log(`📊 Generating organization salary summary for ${monthNum}/${yearNum}`);
    
    // Validate parameters
    if (isNaN(monthNum) || isNaN(yearNum)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters: month and year must be numbers'
      });
    }
    
    // Get all active users
    const { db } = await import('./db');
    const { users } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    
    const allUsers = await db
      .select({ id: users.id, department: users.department })
      .from(users)
      .where(eq(users.isActive, true));
    
    const userIds = allUsers.map(u => u.id);
    
    if (userIds.length === 0) {
      return res.json({
        success: true,
        data: {
          month: monthNum,
          year: yearNum,
          totalEmployees: 0,
          calculations: [],
          summary: {
            totalGrossEarnings: 0,
            totalNetPay: 0,
            totalEmployerContributions: 0,
            totalCTC: 0
          },
          departmentSummary: {}
        }
      });
    }
    
    // Calculate salary for all users
    const calculations = await salaryCalculationEngine.calculateBulkSalary(userIds, monthNum, yearNum);
    
    // Calculate overall summary
    const summary = calculations.reduce((acc, calc) => {
      acc.totalGrossEarnings += calc.grossEarnings;
      acc.totalNetPay += calc.netPay;
      acc.totalEmployerContributions += calc.totalEmployerContributions;
      acc.totalCTC += calc.ctcMonthly;
      return acc;
    }, {
      totalGrossEarnings: 0,
      totalNetPay: 0,
      totalEmployerContributions: 0,
      totalCTC: 0
    });
    
    // Calculate department-wise summary
    const departmentSummary = calculations.reduce((acc: any, calc) => {
      const dept = calc.department || 'Unassigned';
      if (!acc[dept]) {
        acc[dept] = {
          employeeCount: 0,
          totalGrossEarnings: 0,
          totalNetPay: 0,
          totalEmployerContributions: 0,
          totalCTC: 0
        };
      }
      
      acc[dept].employeeCount++;
      acc[dept].totalGrossEarnings += calc.grossEarnings;
      acc[dept].totalNetPay += calc.netPay;
      acc[dept].totalEmployerContributions += calc.totalEmployerContributions;
      acc[dept].totalCTC += calc.ctcMonthly;
      
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: {
        month: monthNum,
        year: yearNum,
        totalEmployees: userIds.length,
        calculations,
        summary,
        departmentSummary
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error generating organization salary summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate organization salary summary',
      message: error.message
    });
  }
});

export default router;