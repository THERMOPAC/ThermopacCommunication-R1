import express, { Request, Response } from 'express';
import { db } from './db';
import { users, employeeSalaries, payrollPeriods, payrollRecords, attendanceRecords } from '../shared/schema';
import { eq, and, desc, asc, gte, lte } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { ensureAuthenticated } from './auth-middleware';

const router = express.Router();

// Helper function to calculate work hours between two timestamps
function calculateWorkHours(timeIn: string, timeOut: string | null): number | null {
  if (!timeOut) return null;
  
  const start = new Date(timeIn);
  const end = new Date(timeOut);
  const diffMs = end.getTime() - start.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  return Math.round(diffHours * 10) / 10; // Round to 1 decimal place
}

// Helper function to determine attendance status
function getAttendanceStatus(timeIn: string, timeOut: string | null): string {
  const checkInTime = new Date(timeIn);
  const startOfDay = new Date(checkInTime);
  startOfDay.setHours(9, 30, 0, 0); // 9:30 AM threshold
  
  if (!timeOut) {
    return checkInTime > startOfDay ? 'Late' : 'Present';
  }
  
  const workHours = calculateWorkHours(timeIn, timeOut);
  if (!workHours) return 'Present';
  
  if (workHours < 4) return 'Half Day';
  if (checkInTime > startOfDay) return 'Late';
  
  return 'Present';
}

// ================================
// USER MANAGEMENT ROUTES
// ================================

/**
 * Get all users with enhanced details
 */
router.get('/users', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        middleName: users.middleName,
        lastName: users.lastName,
        jobTitle: users.jobTitle,
        department: users.department,
        branch: users.branch,
        employeeCode: users.employeeCode,
        role: users.role,
        mobileNumber: users.mobileNumber,
        countryCode: users.countryCode,
        phone: users.phone,
        fax: users.fax,
        linkedVendor: users.linkedVendor,
        epfNo: users.epfNo,
        esicNo: users.esicNo,
        stdCode: users.stdCode,
        reportingManagerId: users.reportingManagerId,
        workLocationId: users.workLocationId,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt
      })
      .from(users)
      .orderBy(asc(users.firstName));

    res.json(allUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * Get user by ID
 */
router.get('/users/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * Create new user
 */
router.post('/users', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const {
      username,
      email,
      password,
      firstName,
      middleName,
      lastName,
      jobTitle,
      department,
      branch,
      employeeCode,
      role,
      mobileNumber,
      countryCode,
      phone,
      fax,
      linkedVendor,
      epfNo,
      esicNo,
      stdCode,
      reportingManagerId,
      workLocationId
    } = req.body;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const [newUser] = await db
      .insert(users)
      .values({
        username,
        email,
        password: hashedPassword,
        firstName,
        middleName,
        lastName,
        jobTitle,
        department,
        branch,
        employeeCode,
        role,
        mobileNumber,
        countryCode,
        phone,
        fax,
        linkedVendor,
        epfNo,
        esicNo,
        stdCode,
        reportingManagerId,
        workLocationId,
        isActive: true
      })
      .returning();

    // Remove password from response
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * Update user
 */
router.put('/users/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const updateData = req.body;

    // If password is being updated, hash it; if empty, remove it from update
    if (updateData.password && updateData.password.trim() !== '') {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    } else if (updateData.password === '') {
      delete updateData.password;
    }

    updateData.updatedAt = new Date();

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = updatedUser;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * Activate/Deactivate user
 */
router.patch('/users/:id/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const { isActive } = req.body;

    const [updatedUser] = await db
      .update(users)
      .set({ 
        isActive,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: `User ${isActive ? 'activated' : 'deactivated'} successfully` });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

/**
 * Reset user password
 */
router.post('/users/:id/reset-password', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const { newPassword } = req.body;

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db
      .update(users)
      .set({ 
        password: hashedPassword,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ================================
// PAYROLL MANAGEMENT ROUTES
// ================================

/**
 * Get employee salary configuration
 */
router.get('/payroll/salary-setup', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const salaryConfigs = await db
      .select({
        id: employeeSalaries.id,
        userId: employeeSalaries.userId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        department: users.department,
        employeeCode: users.employeeCode,
        salaryStartDate: employeeSalaries.salaryStartDate,
        basicSalary: employeeSalaries.basicSalary,
        houseRentAllowance: employeeSalaries.houseRentAllowance,
        conveyance: employeeSalaries.conveyance,
        lta: employeeSalaries.lta,
        specialAllowance: employeeSalaries.specialAllowance,
        supplementaryAllowance: employeeSalaries.supplementaryAllowance,
        bonus: employeeSalaries.bonus,
        gratuityCost: employeeSalaries.gratuityCost,
        kgpAllowance: employeeSalaries.kgpAllowance,
        employeePfContribution: employeeSalaries.employeePfContribution,
        employerPfContribution: employeeSalaries.employerPfContribution,
        employeeEsicContribution: employeeSalaries.employeeEsicContribution,
        employerEsicContribution: employeeSalaries.employerEsicContribution,
        groupInsurance: employeeSalaries.groupInsurance,
        bankName: employeeSalaries.bankName,
        bankAccountNo: employeeSalaries.bankAccountNo,
        debitAccount: employeeSalaries.debitAccount,
        takeHomeSalary: employeeSalaries.takeHomeSalary,
        ctcMonthly: employeeSalaries.ctcMonthly,
        ctcYearly: employeeSalaries.ctcYearly,
        salaryType: employeeSalaries.salaryType,
        actualDays: employeeSalaries.actualDays,
        workingHoursPerDay: employeeSalaries.workingHoursPerDay,
        overtimeHours: employeeSalaries.overtimeHours,
        otRate: employeeSalaries.otRate,
        isActive: employeeSalaries.isActive
      })
      .from(employeeSalaries)
      .leftJoin(users, eq(employeeSalaries.userId, users.id))
      .where(eq(employeeSalaries.isActive, true))
      .orderBy(asc(users.firstName));

    res.json(salaryConfigs);
  } catch (error) {
    console.error('Error fetching salary configurations:', error);
    res.status(500).json({ error: 'Failed to fetch salary configurations' });
  }
});

/**
 * Get salary configuration for specific user
 */
router.get('/payroll/salary-setup/:userId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    
    const [salaryConfig] = await db
      .select()
      .from(employeeSalaries)
      .where(and(
        eq(employeeSalaries.userId, userId),
        eq(employeeSalaries.isActive, true)
      ));

    if (!salaryConfig) {
      return res.status(404).json({ error: 'Salary configuration not found' });
    }

    res.json(salaryConfig);
  } catch (error) {
    console.error('Error fetching salary configuration:', error);
    res.status(500).json({ error: 'Failed to fetch salary configuration' });
  }
});

/**
 * Create or update salary configuration
 */
router.post('/payroll/salary-setup', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const salaryData = req.body;
    const currentUser = req.user as any;
    
    console.log('Received salary data:', JSON.stringify(salaryData, null, 2));

    // Calculate CTC values
    const grossSalary = parseFloat(salaryData.basicSalary) + 
                       parseFloat(salaryData.houseRentAllowance || 0) + 
                       parseFloat(salaryData.conveyance || 0) + 
                       parseFloat(salaryData.lta || 0) + 
                       parseFloat(salaryData.specialAllowance || 0) + 
                       parseFloat(salaryData.supplementaryAllowance || 0) + 
                       parseFloat(salaryData.bonus || 0) + 
                       parseFloat(salaryData.kgpAllowance || 0);

    const totalEmployerContributions = parseFloat(salaryData.employerPfContribution || 0) + 
                                     parseFloat(salaryData.employerEsicContribution || 0) + 
                                     parseFloat(salaryData.groupInsurance || 0) + 
                                     parseFloat(salaryData.gratuityCost || 0);

    const ctcMonthly = grossSalary + totalEmployerContributions;
    const ctcYearly = ctcMonthly * 12;

    const totalDeductions = parseFloat(salaryData.employeePfContribution || 0) + 
                           parseFloat(salaryData.employeeEsicContribution || 0);

    const takeHomeSalary = grossSalary - totalDeductions;

    // Check if salary configuration already exists
    const [existingConfig] = await db
      .select()
      .from(employeeSalaries)
      .where(and(
        eq(employeeSalaries.userId, salaryData.userId),
        eq(employeeSalaries.isActive, true)
      ));

    if (existingConfig) {
      // Update existing configuration
      const updateData = {
        ...salaryData,
        baseSalary: salaryData.basicSalary, // Map basicSalary to baseSalary
        ctcMonthly: ctcMonthly.toString(),
        ctcYearly: ctcYearly.toString(),
        takeHomeSalary: takeHomeSalary.toString(),
        actualSalaryForMonth: takeHomeSalary.toString(),
        updatedAt: new Date()
      };
      
      console.log('Update data:', JSON.stringify(updateData, null, 2));
      
      const [updated] = await db
        .update(employeeSalaries)
        .set(updateData)
        .where(eq(employeeSalaries.id, existingConfig.id))
        .returning();

      res.json(updated);
    } else {
      // Create new configuration
      const insertData = {
        ...salaryData,
        baseSalary: salaryData.basicSalary, // Map basicSalary to baseSalary
        ctcMonthly: ctcMonthly.toString(),
        ctcYearly: ctcYearly.toString(),
        takeHomeSalary: takeHomeSalary.toString(),
        actualSalaryForMonth: takeHomeSalary.toString(),
        effectiveDate: salaryData.salaryStartDate,
        createdBy: currentUser.id
      };
      
      console.log('Insert data:', JSON.stringify(insertData, null, 2));
      
      const [newConfig] = await db
        .insert(employeeSalaries)
        .values(insertData)
        .returning();

      res.status(201).json(newConfig);
    }
  } catch (error) {
    console.error('Error saving salary configuration:', error);
    res.status(500).json({ error: 'Failed to save salary configuration' });
  }
});

/**
 * Get payroll periods
 */
router.get('/payroll/periods', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const periods = await db
      .select()
      .from(payrollPeriods)
      .orderBy(desc(payrollPeriods.startDate));

    res.json(periods);
  } catch (error) {
    console.error('Error fetching payroll periods:', error);
    res.status(500).json({ error: 'Failed to fetch payroll periods' });
  }
});

/**
 * Create new payroll period
 */
router.post('/payroll/periods', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const periodData = req.body;
    const currentUser = req.user as any;

    const [newPeriod] = await db
      .insert(payrollPeriods)
      .values({
        ...periodData,
        processedBy: currentUser.id
      })
      .returning();

    res.status(201).json(newPeriod);
  } catch (error) {
    console.error('Error creating payroll period:', error);
    res.status(500).json({ error: 'Failed to create payroll period' });
  }
});

/**
 * Get payroll records for a specific period
 */
router.get('/payroll/records/:periodId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const periodId = parseInt(req.params.periodId);

    const records = await db
      .select({
        id: payrollRecords.id,
        userId: payrollRecords.userId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        department: users.department,
        baseSalary: payrollRecords.baseSalary,
        grossPay: payrollRecords.grossPay,
        totalDeductions: payrollRecords.totalDeductions,
        netPay: payrollRecords.netPay,
        status: payrollRecords.status,
        paymentReference: payrollRecords.paymentReference,
        paymentDate: payrollRecords.paymentDate
      })
      .from(payrollRecords)
      .leftJoin(users, eq(payrollRecords.userId, users.id))
      .where(eq(payrollRecords.periodId, periodId))
      .orderBy(asc(users.firstName));

    res.json(records);
  } catch (error) {
    console.error('Error fetching payroll records:', error);
    res.status(500).json({ error: 'Failed to fetch payroll records' });
  }
});

// ================================
// ATTENDANCE MANAGEMENT ROUTES
// ================================

// Get attendance statistics
router.get('/attendance/stats', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { range = 'today' } = req.query;
    
    let startDate: Date;
    let endDate: Date = new Date();
    
    // Calculate date range based on selection
    switch (range) {
      case 'yesterday':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'thisWeek':
        startDate = new Date();
        const dayOfWeek = startDate.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate.setDate(startDate.getDate() - daysToMonday);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'lastWeek':
        startDate = new Date();
        const lastWeekDay = startDate.getDay();
        const daysToLastMonday = lastWeekDay === 0 ? 13 : lastWeekDay + 6;
        startDate.setDate(startDate.getDate() - daysToLastMonday);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'thisMonth':
        startDate = new Date();
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'lastMonth':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0);
        endDate.setHours(23, 59, 59, 999);
        break;
      default: // today
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        break;
    }

    // Get total active employees
    const totalEmployees = await db.select().from(users).where(eq(users.isActive, true));
    
    // Get attendance records for the date range
    const attendanceRecords = await db.execute(`
      SELECT 
        a.user_id,
        a.check_in_time,
        a.check_out_time,
        u.username,
        u.department
      FROM attendance_records a
      JOIN users u ON a.user_id = u.id
      WHERE a.date >= '${startDate.toISOString().split('T')[0]}' AND a.date <= '${endDate.toISOString().split('T')[0]}'
      AND u.is_active = true
    `);

    // Calculate statistics
    const stats = {
      totalEmployees: totalEmployees.length,
      presentToday: 0,
      absentToday: 0,
      lateToday: 0,
      presentPercentage: 0
    };

    if (range === 'today') {
      const today = new Date().toISOString().split('T')[0];
      const todayRecords = await db.execute(`
        SELECT 
          a.user_id,
          a.check_in_time,
          a.check_out_time
        FROM attendance_records a
        WHERE a.date = '${today}'
      `);

      const presentUserIds = new Set(Array.isArray(todayRecords) ? todayRecords.map((r: any) => r.user_id) : []);
      stats.presentToday = presentUserIds.size;
      stats.absentToday = stats.totalEmployees - stats.presentToday;
      
      // Count late arrivals (after 9:30 AM)
      stats.lateToday = Array.isArray(todayRecords) ? todayRecords.filter((r: any) => {
        if (!r.check_in_time) return false;
        const checkIn = new Date(r.check_in_time);
        const lateThreshold = new Date(checkIn);
        lateThreshold.setHours(9, 30, 0, 0);
        return checkIn > lateThreshold;
      }).length : 0;

      stats.presentPercentage = stats.totalEmployees > 0 
        ? Math.round((stats.presentToday / stats.totalEmployees) * 100)
        : 0;
    }

    res.json(stats);
  } catch (error) {
    console.error('Error fetching attendance stats:', error);
    res.status(500).json({ error: 'Failed to fetch attendance statistics' });
  }
});

// Get attendance records with filtering
router.get('/attendance/records', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { range = 'today', department = 'all', search = '' } = req.query;
    
    let startDate: Date;
    let endDate: Date = new Date();
    
    // Calculate date range (same logic as stats endpoint)
    switch (range) {
      case 'yesterday':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'thisWeek':
        startDate = new Date();
        const dayOfWeek = startDate.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate.setDate(startDate.getDate() - daysToMonday);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'lastWeek':
        startDate = new Date();
        const lastWeekDay = startDate.getDay();
        const daysToLastMonday = lastWeekDay === 0 ? 13 : lastWeekDay + 6;
        startDate.setDate(startDate.getDate() - daysToLastMonday);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'thisMonth':
        startDate = new Date();
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'lastMonth':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0);
        endDate.setHours(23, 59, 59, 999);
        break;
      default: // today
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        break;
    }

    // Use Drizzle ORM with proper joins
    let baseQuery = db
      .select({
        id: attendanceRecords.id,
        userId: attendanceRecords.userId,
        date: attendanceRecords.date,
        checkInTime: attendanceRecords.checkInTime,
        checkOutTime: attendanceRecords.checkOutTime,
        userName: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        department: users.department
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(attendanceRecords.userId, users.id))
      .where(and(
        gte(attendanceRecords.date, startDate.toISOString().split('T')[0]),
        lte(attendanceRecords.date, endDate.toISOString().split('T')[0]),
        eq(users.isActive, true)
      ));

    // Add department filter
    if (department !== 'all') {
      baseQuery = baseQuery.where(and(
        gte(attendanceRecords.date, startDate.toISOString().split('T')[0]),
        lte(attendanceRecords.date, endDate.toISOString().split('T')[0]),
        eq(users.isActive, true),
        eq(users.department, department)
      ));
    }

    const records = await baseQuery
      .orderBy(desc(attendanceRecords.date), desc(attendanceRecords.checkInTime))
      .limit(100);

    // Transform records with calculated fields
    const transformedRecords = Array.isArray(records) ? records.map((record: any) => {
      const workHours = calculateWorkHours(record.checkInTime, record.checkOutTime);
      const status = getAttendanceStatus(record.checkInTime, record.checkOutTime);
      
      return {
        id: record.id,
        userId: record.userId,
        userName: record.userName || record.firstName || 'Unknown',
        department: record.department || 'N/A',
        date: record.date,
        timeIn: record.checkInTime,
        timeOut: record.checkOutTime,
        workHours,
        status,
        location: 'Office'
      };
    }) : [];

    res.json(transformedRecords);
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    res.status(500).json({ error: 'Failed to fetch attendance records' });
  }
});

// Get list of departments for filter
router.get('/departments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const departments = await db.execute(`
      SELECT DISTINCT department
      FROM users
      WHERE department IS NOT NULL 
      AND department != ''
      AND is_active = true
      ORDER BY department
    `);

    const departmentList = Array.isArray(departments) ? departments.map((d: any) => d.department).filter(Boolean) : [];
    res.json(departmentList);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.json([]); // Return empty array on error
  }
});

export default router;