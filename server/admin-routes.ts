import express, { Request, Response } from 'express';
import { db } from './db';
import { 
  users, 
  employeeSalaries, 
  payrollPeriods, 
  payrollRecords, 
  attendanceRecords,
  leaveTypes,
  leaveBalances,
  leaveRequests,
  leaveApprovals,
  companyHolidays,
  leavePolicies,
  insertLeaveTypeSchema,
  insertLeaveBalanceSchema,
  insertLeaveRequestSchema,
  insertCompanyHolidaySchema,
  insertLeavePolicySchema
} from '../shared/schema';
import { eq, and, desc, asc, gte, lte, sql, count } from 'drizzle-orm';
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
    const { range = 'today', department = 'all', employee = 'all' } = req.query;
    
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

    // Build Drizzle filter conditions
    let userConditions = [eq(users.isActive, true)];
    
    if (department !== 'all') {
      userConditions.push(eq(users.department, department));
    }
    
    if (employee !== 'all') {
      const employeeId = parseInt(employee as string);
      if (!isNaN(employeeId)) {
        userConditions.push(eq(users.id, employeeId));
      }
    }

    // Get total active employees (filtered)
    const totalEmployees = await db
      .select()
      .from(users)
      .where(and(...userConditions));
    
    const totalEmployeeCount = totalEmployees.length;
    const stats = {
      totalEmployees: totalEmployeeCount,
      presentToday: 0,
      absentToday: 0,
      lateToday: 0,
      presentPercentage: 0
    };

    // Build attendance conditions for the selected date range
    let attendanceConditions = [
      gte(attendanceRecords.date, startDate.toISOString().split('T')[0]),
      lte(attendanceRecords.date, endDate.toISOString().split('T')[0])
    ];
    
    if (employee !== 'all') {
      const employeeId = parseInt(employee as string);
      if (!isNaN(employeeId)) {
        attendanceConditions.push(eq(attendanceRecords.userId, employeeId));
      }
    }
    
    // Get attendance records for the date range (filtered)
    let attendanceQuery = db
      .select({
        userId: attendanceRecords.userId,
        checkInTime: attendanceRecords.checkInTime,
        checkOutTime: attendanceRecords.checkOutTime,
        date: attendanceRecords.date,
        username: users.username,
        department: users.department
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(attendanceRecords.userId, users.id))
      .where(and(...attendanceConditions, eq(users.isActive, true)));
    
    // Add department filter if needed
    if (department !== 'all') {
      attendanceQuery = attendanceQuery.where(and(
        ...attendanceConditions,
        eq(users.isActive, true),
        eq(users.department, department)
      ));
    }
    
    const attendanceRecordsResult = await attendanceQuery;

    if (range === 'today' || range === 'yesterday') {
      // For single day ranges, calculate present/absent/late statistics
      const presentUserIds = new Set(attendanceRecordsResult.map((r: any) => r.userId));
      stats.presentToday = presentUserIds.size;
      stats.absentToday = Math.max(0, totalEmployeeCount - stats.presentToday);
      
      // Count late arrivals (after 9:30 AM)
      stats.lateToday = attendanceRecordsResult.filter((r: any) => {
        if (!r.checkInTime) return false;
        const checkIn = new Date(r.checkInTime);
        const lateThreshold = new Date(checkIn);
        lateThreshold.setHours(9, 30, 0, 0);
        return checkIn > lateThreshold;
      }).length;

      stats.presentPercentage = totalEmployeeCount > 0 
        ? Math.round((stats.presentToday / totalEmployeeCount) * 100)
        : 0;
    } else {
      // For multi-day ranges (weeks/months), calculate days present/absent/late
      if (employee !== 'all') {
        // When filtering by specific employee, count days in the period
        const employeeId = parseInt(employee as string);
        if (!isNaN(employeeId)) {
          // Calculate total working days in the period (excluding weekends for now)
          const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;
          
          // Get unique dates when the employee was present
          const presentDates = new Set(attendanceRecordsResult.map((r: any) => r.date));
          stats.presentToday = presentDates.size;
          stats.absentToday = Math.max(0, totalDays - stats.presentToday);
          
          // Count late arrivals across the date range
          stats.lateToday = attendanceRecordsResult.filter((r: any) => {
            if (!r.checkInTime) return false;
            const checkIn = new Date(r.checkInTime);
            const lateThreshold = new Date(checkIn);
            lateThreshold.setHours(9, 30, 0, 0);
            return checkIn > lateThreshold;
          }).length;

          stats.presentPercentage = totalDays > 0 
            ? Math.round((stats.presentToday / totalDays) * 100)
            : 0;
        }
      } else {
        // For multiple employees, show unique users who attended during the period
        const uniqueUserIds = new Set(attendanceRecordsResult.map((r: any) => r.userId));
        stats.presentToday = uniqueUserIds.size;
        stats.absentToday = Math.max(0, totalEmployeeCount - stats.presentToday);
        
        // Count late arrivals across the date range
        stats.lateToday = attendanceRecordsResult.filter((r: any) => {
          if (!r.checkInTime) return false;
          const checkIn = new Date(r.checkInTime);
          const lateThreshold = new Date(checkIn);
          lateThreshold.setHours(9, 30, 0, 0);
          return checkIn > lateThreshold;
        }).length;

        stats.presentPercentage = totalEmployeeCount > 0 
          ? Math.round((stats.presentToday / totalEmployeeCount) * 100)
          : 0;
      }
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
    const { range = 'today', department = 'all', employee = 'all' } = req.query;
    
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

    // Add employee filter
    if (employee !== 'all') {
      const employeeId = parseInt(employee as string);
      if (!isNaN(employeeId)) {
        baseQuery = baseQuery.where(and(
          gte(attendanceRecords.date, startDate.toISOString().split('T')[0]),
          lte(attendanceRecords.date, endDate.toISOString().split('T')[0]),
          eq(users.isActive, true),
          eq(attendanceRecords.userId, employeeId),
          ...(department !== 'all' ? [eq(users.department, department)] : [])
        ));
      }
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

// ================================
// LEAVE MANAGEMENT ROUTES
// ================================

/**
 * Get all leave types
 */
router.get('/leave-types', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const allLeaveTypes = await db
      .select()
      .from(leaveTypes)
      .where(eq(leaveTypes.isActive, true))
      .orderBy(asc(leaveTypes.name));

    res.json(allLeaveTypes);
  } catch (error) {
    console.error('Error fetching leave types:', error);
    res.status(500).json({ error: 'Failed to fetch leave types' });
  }
});

/**
 * Create new leave type
 */
router.post('/leave-types', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const validatedData = insertLeaveTypeSchema.parse(req.body);
    
    const [newLeaveType] = await db
      .insert(leaveTypes)
      .values(validatedData)
      .returning();

    res.status(201).json(newLeaveType);
  } catch (error) {
    console.error('Error creating leave type:', error);
    res.status(500).json({ error: 'Failed to create leave type' });
  }
});

/**
 * Update leave type
 */
router.put('/leave-types/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const validatedData = insertLeaveTypeSchema.parse(req.body);

    const [updatedLeaveType] = await db
      .update(leaveTypes)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(leaveTypes.id, id))
      .returning();

    if (!updatedLeaveType) {
      return res.status(404).json({ error: 'Leave type not found' });
    }

    res.json(updatedLeaveType);
  } catch (error) {
    console.error('Error updating leave type:', error);
    res.status(500).json({ error: 'Failed to update leave type' });
  }
});

/**
 * Get leave balances for a user
 */
router.get('/leave-balances/:userId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const balances = await db
      .select({
        id: leaveBalances.id,
        userId: leaveBalances.userId,
        leaveTypeId: leaveBalances.leaveTypeId,
        year: leaveBalances.year,
        allocatedDays: leaveBalances.allocatedDays,
        usedDays: leaveBalances.usedDays,
        pendingDays: leaveBalances.pendingDays,
        carryoverDays: leaveBalances.carryoverDays,
        lastUpdated: leaveBalances.lastUpdated,
        leaveTypeName: leaveTypes.name,
        leaveTypeCode: leaveTypes.code,
        leaveTypeColor: leaveTypes.colorCode,
        isPaid: leaveTypes.isPaid
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
      .where(and(
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.year, year)
      ))
      .orderBy(asc(leaveTypes.name));

    res.json(balances);
  } catch (error) {
    console.error('Error fetching leave balances:', error);
    res.status(500).json({ error: 'Failed to fetch leave balances' });
  }
});

/**
 * Initialize leave balances for a user
 */
router.post('/leave-balances/initialize', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { userId, year } = req.body;
    const currentUser = (req as any).user;

    // Get all active leave types
    const activeLeaveTypes = await db
      .select()
      .from(leaveTypes)
      .where(eq(leaveTypes.isActive, true));

    // Create balances for each leave type
    const balancesToCreate = activeLeaveTypes.map(leaveType => ({
      userId: parseInt(userId),
      leaveTypeId: leaveType.id,
      year: parseInt(year),
      allocatedDays: leaveType.maxDaysPerYear || '0',
      usedDays: '0',
      pendingDays: '0',
      carryoverDays: '0',
      updatedBy: currentUser.id
    }));

    const createdBalances = await db
      .insert(leaveBalances)
      .values(balancesToCreate)
      .returning();

    res.status(201).json(createdBalances);
  } catch (error) {
    console.error('Error initializing leave balances:', error);
    res.status(500).json({ error: 'Failed to initialize leave balances' });
  }
});

/**
 * Get leave requests (with filters)
 */
router.get('/leave-requests', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { 
      employeeId, 
      status, 
      fromDate, 
      toDate, 
      leaveTypeId,
      limit = 50,
      offset = 0 
    } = req.query;

    let query = db
      .select({
        id: leaveRequests.id,
        employeeId: leaveRequests.employeeId,
        employeeName: sql`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`.as('employeeName'),
        leaveTypeId: leaveRequests.leaveTypeId,
        leaveTypeName: leaveTypes.name,
        leaveTypeColor: leaveTypes.colorCode,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        totalDays: leaveRequests.totalDays,
        isHalfDay: leaveRequests.isHalfDay,
        halfDayPeriod: leaveRequests.halfDayPeriod,
        reason: leaveRequests.reason,
        status: leaveRequests.status,
        appliedDate: leaveRequests.appliedDate,
        managerApprovalStatus: leaveRequests.managerApprovalStatus,
        hrApprovalStatus: leaveRequests.hrApprovalStatus,
        approvedDate: leaveRequests.approvedDate
      })
      .from(leaveRequests)
      .innerJoin(users, eq(leaveRequests.employeeId, users.id))
      .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id));

    // Apply filters
    const conditions = [];
    if (employeeId) conditions.push(eq(leaveRequests.employeeId, parseInt(employeeId as string)));
    if (status) conditions.push(eq(leaveRequests.status, status as string));
    if (leaveTypeId) conditions.push(eq(leaveRequests.leaveTypeId, parseInt(leaveTypeId as string)));
    if (fromDate) conditions.push(gte(leaveRequests.startDate, fromDate as string));
    if (toDate) conditions.push(lte(leaveRequests.endDate, toDate as string));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const requests = await query
      .orderBy(desc(leaveRequests.appliedDate))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    res.json(requests);
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

/**
 * Create new leave request
 */
router.post('/leave-requests', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const validatedData = insertLeaveRequestSchema.parse(req.body);
    const currentUser = (req as any).user;

    // Set the employee ID to current user if not provided (for self-requests)
    if (!validatedData.employeeId) {
      validatedData.employeeId = currentUser.id;
    }

    const [newLeaveRequest] = await db
      .insert(leaveRequests)
      .values(validatedData)
      .returning();

    res.status(201).json(newLeaveRequest);
  } catch (error) {
    console.error('Error creating leave request:', error);
    res.status(500).json({ error: 'Failed to create leave request' });
  }
});

/**
 * Update leave request status (approve/reject)
 */
router.put('/leave-requests/:id/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { status, comments, approvalLevel } = req.body;
    const currentUser = (req as any).user;

    const updateData: any = {
      updatedAt: new Date()
    };

    // Update based on approval level
    if (approvalLevel === 1) { // Manager approval
      updateData.managerApprovalStatus = status;
      updateData.managerApprovalDate = new Date();
      updateData.managerComments = comments;
      updateData.managerId = currentUser.id;
    } else if (approvalLevel === 2) { // HR approval
      updateData.hrApprovalStatus = status;
      updateData.hrApprovalDate = new Date();
      updateData.hrComments = comments;
      updateData.hrApprovalId = currentUser.id;
    }

    // Set final status if both approvals are complete
    if (status === 'approved') {
      updateData.status = 'approved';
      updateData.approvedBy = currentUser.id;
      updateData.approvedDate = new Date();
    } else if (status === 'rejected') {
      updateData.status = 'rejected';
      updateData.rejectionReason = comments;
    }

    const [updatedRequest] = await db
      .update(leaveRequests)
      .set(updateData)
      .where(eq(leaveRequests.id, id))
      .returning();

    if (!updatedRequest) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    res.json(updatedRequest);
  } catch (error) {
    console.error('Error updating leave request status:', error);
    res.status(500).json({ error: 'Failed to update leave request status' });
  }
});

/**
 * Get company holidays
 */
router.get('/company-holidays', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const holidays = await db
      .select()
      .from(companyHolidays)
      .where(sql`EXTRACT(YEAR FROM ${companyHolidays.date}) = ${year}`)
      .orderBy(asc(companyHolidays.date));

    res.json(holidays);
  } catch (error) {
    console.error('Error fetching company holidays:', error);
    res.status(500).json({ error: 'Failed to fetch company holidays' });
  }
});

/**
 * Create new company holiday
 */
router.post('/company-holidays', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const validatedData = insertCompanyHolidaySchema.parse(req.body);
    const currentUser = (req as any).user;

    const [newHoliday] = await db
      .insert(companyHolidays)
      .values({
        ...validatedData,
        createdBy: currentUser.id
      })
      .returning();

    res.status(201).json(newHoliday);
  } catch (error) {
    console.error('Error creating company holiday:', error);
    res.status(500).json({ error: 'Failed to create company holiday' });
  }
});

/**
 * Update company holiday
 */
router.put('/company-holidays/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const validatedData = insertCompanyHolidaySchema.parse(req.body);
    const currentUser = (req as any).user;

    const [updatedHoliday] = await db
      .update(companyHolidays)
      .set({
        ...validatedData,
        updatedAt: new Date(),
        updatedBy: currentUser.id
      })
      .where(eq(companyHolidays.id, id))
      .returning();

    if (!updatedHoliday) {
      return res.status(404).json({ error: 'Holiday not found' });
    }

    res.json(updatedHoliday);
  } catch (error) {
    console.error('Error updating company holiday:', error);
    res.status(500).json({ error: 'Failed to update company holiday' });
  }
});

/**
 * Delete company holiday
 */
router.delete('/company-holidays/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const [deletedHoliday] = await db
      .delete(companyHolidays)
      .where(eq(companyHolidays.id, id))
      .returning();

    if (!deletedHoliday) {
      return res.status(404).json({ error: 'Holiday not found' });
    }

    res.json({ message: 'Holiday deleted successfully' });
  } catch (error) {
    console.error('Error deleting company holiday:', error);
    res.status(500).json({ error: 'Failed to delete company holiday' });
  }
});

/**
 * Get leave policies
 */
router.get('/leave-policies', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const policies = await db
      .select()
      .from(leavePolicies)
      .where(eq(leavePolicies.isActive, true))
      .orderBy(asc(leavePolicies.policyName));

    res.json(policies);
  } catch (error) {
    console.error('Error fetching leave policies:', error);
    res.status(500).json({ error: 'Failed to fetch leave policies' });
  }
});

/**
 * Update leave policy
 */
router.put('/leave-policies/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const validatedData = insertLeavePolicySchema.parse(req.body);
    const currentUser = (req as any).user;

    const [updatedPolicy] = await db
      .update(leavePolicies)
      .set({
        ...validatedData,
        updatedAt: new Date(),
        updatedBy: currentUser.id
      })
      .where(eq(leavePolicies.id, id))
      .returning();

    if (!updatedPolicy) {
      return res.status(404).json({ error: 'Leave policy not found' });
    }

    res.json(updatedPolicy);
  } catch (error) {
    console.error('Error updating leave policy:', error);
    res.status(500).json({ error: 'Failed to update leave policy' });
  }
});

/**
 * Get leave dashboard statistics
 */
router.get('/leave-dashboard', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const currentYear = new Date().getFullYear();

    // Get pending requests count
    const [pendingCount] = await db
      .select({ count: count() })
      .from(leaveRequests)
      .where(eq(leaveRequests.status, 'pending'));

    // Get current user's leave balance
    const userBalances = await db
      .select({
        leaveType: leaveTypes.name,
        allocatedDays: leaveBalances.allocatedDays,
        usedDays: leaveBalances.usedDays,
        remainingDays: sql`${leaveBalances.allocatedDays} + ${leaveBalances.carryoverDays} - ${leaveBalances.usedDays} - ${leaveBalances.pendingDays}`.as('remainingDays')
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
      .where(and(
        eq(leaveBalances.userId, currentUser.id),
        eq(leaveBalances.year, currentYear)
      ));

    // Get recent requests
    const recentRequests = await db
      .select({
        id: leaveRequests.id,
        employeeName: sql`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`.as('employeeName'),
        leaveType: leaveTypes.name,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        totalDays: leaveRequests.totalDays,
        status: leaveRequests.status,
        appliedDate: leaveRequests.appliedDate
      })
      .from(leaveRequests)
      .innerJoin(users, eq(leaveRequests.employeeId, users.id))
      .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
      .orderBy(desc(leaveRequests.appliedDate))
      .limit(10);

    res.json({
      pendingRequestsCount: pendingCount.count,
      userBalances,
      recentRequests
    });
  } catch (error) {
    console.error('Error fetching leave dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch leave dashboard data' });
  }
});

export default router;