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
  workweekPolicies,
  employeeWorkweekAssignments,
  workweekCalendarOverrides,
  workLocations,
  insertLeaveTypeSchema,
  insertLeaveBalanceSchema,
  insertLeaveRequestSchema,
  insertCompanyHolidaySchema,
  insertLeavePolicySchema,
  insertWorkweekPolicySchema,
  insertEmployeeWorkweekAssignmentSchema,
  insertWorkweekCalendarOverrideSchema
} from '../shared/schema';
import { eq, and, desc, asc, gte, lte, sql, count } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { ensureAuthenticated } from './auth-middleware';
import { salaryCalculationEngine } from './salary-calculation-engine';
import { SalarySlipGenerator, numberToWords } from './salary-slip-generator';

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
        professionalTax: employeeSalaries.professionalTax,
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

    // CTC Monthly excludes bonus (business requirement)
    const grossSalaryWithoutBonus = grossSalary - parseFloat(salaryData.bonus || 0);
    const ctcMonthly = grossSalaryWithoutBonus + totalEmployerContributions;
    // CTC Yearly includes bonus as part of annual cost (business requirement)
    const ctcYearly = (ctcMonthly * 12) + (parseFloat(salaryData.bonus || 0) * 12);

    const totalDeductions = parseFloat(salaryData.employeePfContribution || 0) + 
                           parseFloat(salaryData.employeeEsicContribution || 0) +
                           parseFloat(salaryData.professionalTax || 0);

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
      // Update existing configuration - convert string decimals to integers first
      const updateData = {
        ...salaryData,
        baseSalary: salaryData.basicSalary, // Map basicSalary to baseSalary
        ctcMonthly: ctcMonthly.toString(),
        ctcYearly: ctcYearly.toString(),
        takeHomeSalary: takeHomeSalary.toString(),
        actualSalaryForMonth: takeHomeSalary.toString(),
        updatedAt: new Date()
      };
      
      // Convert string values to integers for database fields that expect integers - apply after spread
      updateData.workingHoursPerDay = parseInt(salaryData.workingHoursPerDay) || 8;
      updateData.actualDays = parseInt(salaryData.actualDays) || 30;
      updateData.paidDays = parseInt(salaryData.paidDays) || 30;
      

      
      const [updated] = await db
        .update(employeeSalaries)
        .set(updateData)
        .where(eq(employeeSalaries.id, existingConfig.id))
        .returning();

      res.json(updated);
    } else {
      // Create new configuration - convert string decimals to integers first
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
      
      // Convert string values to integers for database fields that expect integers - apply after spread
      insertData.workingHoursPerDay = parseInt(salaryData.workingHoursPerDay) || 8;
      insertData.actualDays = parseInt(salaryData.actualDays) || 30;
      insertData.paidDays = parseInt(salaryData.paidDays) || 30;
      

      
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
 * Update salary configuration by ID
 */
router.put('/payroll/salary-setup/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
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

    // CTC Monthly excludes bonus (business requirement)
    const grossSalaryWithoutBonus = grossSalary - parseFloat(salaryData.bonus || 0);
    const ctcMonthly = grossSalaryWithoutBonus + totalEmployerContributions;
    // CTC Yearly includes bonus as part of annual cost (business requirement)
    const ctcYearly = (ctcMonthly * 12) + (parseFloat(salaryData.bonus || 0) * 12);

    const totalDeductions = parseFloat(salaryData.employeePfContribution || 0) + 
                           parseFloat(salaryData.employeeEsicContribution || 0) +
                           parseFloat(salaryData.professionalTax || 0);

    const takeHomeSalary = grossSalary - totalDeductions;

    // Update configuration
    const updateData = {
      ...salaryData,
      baseSalary: salaryData.basicSalary, // Map basicSalary to baseSalary
      ctcMonthly: ctcMonthly.toString(),
      ctcYearly: ctcYearly.toString(),
      takeHomeSalary: takeHomeSalary.toString(),
      actualSalaryForMonth: takeHomeSalary.toString(),
      updatedAt: new Date()
    };
    
    // Convert string values to integers for database fields that expect integers
    updateData.workingHoursPerDay = parseInt(salaryData.workingHoursPerDay) || 8;
    updateData.actualDays = parseInt(salaryData.actualDays) || 30;
    updateData.paidDays = parseInt(salaryData.paidDays) || 30;
    
    const [updated] = await db
      .update(employeeSalaries)
      .set(updateData)
      .where(eq(employeeSalaries.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Salary configuration not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating salary configuration:', error);
    res.status(500).json({ error: 'Failed to update salary configuration' });
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

/**
 * Get leave summary for employee and specific month
 */
router.get('/leave-summary/:employeeId/:year/:month', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    console.log(`Fetching leave summary for employeeId: ${employeeId}, year: ${year}, month: ${month}`);

    // Get leave balances for the employee for the specified year
    const leaveBalanceData = await db
      .select({
        leaveTypeId: leaveBalances.leaveTypeId,
        leaveTypeName: leaveTypes.name,
        leaveTypeCode: leaveTypes.code,
        leaveTypeColor: leaveTypes.colorCode,
        isPaid: leaveTypes.isPaid,
        allocatedDays: leaveBalances.allocatedDays,
        usedDays: leaveBalances.usedDays,
        pendingDays: leaveBalances.pendingDays,
        carryoverDays: leaveBalances.carryoverDays,
        remainingDays: sql`${leaveBalances.allocatedDays} + ${leaveBalances.carryoverDays} - ${leaveBalances.usedDays} - ${leaveBalances.pendingDays}`.as('remainingDays')
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
      .where(and(
        eq(leaveBalances.userId, employeeId),
        eq(leaveBalances.year, year)
      ))
      .orderBy(asc(leaveTypes.name));

    console.log(`Found ${leaveBalanceData.length} leave balance records for employee ${employeeId}`);
    console.log('Leave balance data:', JSON.stringify(leaveBalanceData, null, 2));

    // Get leave requests for the specific month
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const monthlyLeaveRequests = await db
      .select({
        id: leaveRequests.id,
        leaveTypeId: leaveRequests.leaveTypeId,
        leaveTypeName: leaveTypes.name,
        isPaid: leaveTypes.isPaid,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        totalDays: leaveRequests.totalDays,
        isHalfDay: leaveRequests.isHalfDay,
        status: leaveRequests.status
      })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
      .where(and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.status, 'approved'), // Only approved leaves count for payroll
        sql`${leaveRequests.startDate} <= '${endDate}' AND ${leaveRequests.endDate} >= '${startDate}'`
      ));

    // Calculate monthly usage for each leave type
    const monthlyUsage = monthlyLeaveRequests.reduce((acc: any, request: any) => {
      const leaveTypeId = request.leaveTypeId;
      if (!acc[leaveTypeId]) {
        acc[leaveTypeId] = {
          totalDays: 0,
          unpaidDays: 0,
          paidDays: 0
        };
      }
      
      const days = parseFloat(request.totalDays) || 0;
      acc[leaveTypeId].totalDays += days;
      
      if (request.isPaid) {
        acc[leaveTypeId].paidDays += days;
      } else {
        acc[leaveTypeId].unpaidDays += days;
      }
      
      return acc;
    }, {});

    // Combine balance data with monthly usage
    const leaveSummary = leaveBalanceData.map((balance: any) => ({
      leaveTypeId: balance.leaveTypeId,
      leaveTypeName: balance.leaveTypeName,
      leaveTypeCode: balance.leaveTypeCode,
      leaveTypeColor: balance.leaveTypeColor,
      isPaid: balance.isPaid,
      allocatedDays: parseFloat(balance.allocatedDays) || 0,
      usedDays: parseFloat(balance.usedDays) || 0,
      remainingDays: parseFloat(balance.remainingDays) || 0,
      carryoverDays: parseFloat(balance.carryoverDays) || 0,
      monthlyUsage: monthlyUsage[balance.leaveTypeId] || {
        totalDays: 0,
        unpaidDays: 0,
        paidDays: 0
      }
    }));

    // Calculate total unpaid leave days for the month
    const totalUnpaidDays = Object.values(monthlyUsage).reduce((total: number, usage: any) => {
      return total + (usage.unpaidDays || 0);
    }, 0);

    res.json({
      leaveSummary,
      totalUnpaidDays,
      monthlyLeaveRequests
    });
  } catch (error) {
    console.error('Error fetching leave summary:', error);
    res.status(500).json({ error: 'Failed to fetch leave summary' });
  }
});

// ================================
// WORKWEEK POLICY MANAGEMENT ROUTES
// ================================

/**
 * Get all workweek policies with location and creator details
 */
router.get('/workweek-policies', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const policies = await db
      .select({
        id: workweekPolicies.id,
        name: workweekPolicies.name,
        description: workweekPolicies.description,
        policyType: workweekPolicies.policyType,
        locationId: workweekPolicies.locationId,
        locationName: workLocations.name,
        department: workweekPolicies.department,
        workingDays: workweekPolicies.workingDays,
        startTime: workweekPolicies.startTime,
        endTime: workweekPolicies.endTime,
        breakDurationMinutes: workweekPolicies.breakDurationMinutes,
        weeklyHours: workweekPolicies.weeklyHours,
        overtimeThresholdDaily: workweekPolicies.overtimeThresholdDaily,
        overtimeThresholdWeekly: workweekPolicies.overtimeThresholdWeekly,
        overtimeRateMultiplier: workweekPolicies.overtimeRateMultiplier,
        halfDayHours: workweekPolicies.halfDayHours,
        includesSaturdays: workweekPolicies.includesSaturdays,
        includesSundays: workweekPolicies.includesSundays,
        followsNationalHolidays: workweekPolicies.followsNationalHolidays,
        isActive: workweekPolicies.isActive,
        effectiveFrom: workweekPolicies.effectiveFrom,
        effectiveUntil: workweekPolicies.effectiveUntil,
        createdAt: workweekPolicies.createdAt,
        updatedAt: workweekPolicies.updatedAt,
        createdBy: workweekPolicies.createdBy,
        creatorName: sql`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`.as('creatorName')
      })
      .from(workweekPolicies)
      .leftJoin(workLocations, eq(workweekPolicies.locationId, workLocations.id))
      .leftJoin(users, eq(workweekPolicies.createdBy, users.id))
      .orderBy(desc(workweekPolicies.createdAt));

    res.json(policies);
  } catch (error) {
    console.error('Error fetching workweek policies:', error);
    res.status(500).json({ error: 'Failed to fetch workweek policies' });
  }
});

/**
 * Get a specific workweek policy by ID
 */
router.get('/workweek-policies/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [policy] = await db
      .select()
      .from(workweekPolicies)
      .where(eq(workweekPolicies.id, parseInt(id)));

    if (!policy) {
      return res.status(404).json({ error: 'Workweek policy not found' });
    }

    res.json(policy);
  } catch (error) {
    console.error('Error fetching workweek policy:', error);
    res.status(500).json({ error: 'Failed to fetch workweek policy' });
  }
});

/**
 * Create a new workweek policy
 */
router.post('/workweek-policies', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user as any;
    
    // Validate request body
    const validatedData = insertWorkweekPolicySchema.parse({
      ...req.body,
      createdBy: currentUser.id
    });

    const [newPolicy] = await db
      .insert(workweekPolicies)
      .values(validatedData)
      .returning();

    res.status(201).json(newPolicy);
  } catch (error) {
    console.error('Error creating workweek policy:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create workweek policy' });
  }
});

/**
 * Update a workweek policy
 */
router.put('/workweek-policies/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate request body
    const validatedData = insertWorkweekPolicySchema.partial().parse(req.body);

    const [updatedPolicy] = await db
      .update(workweekPolicies)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(workweekPolicies.id, parseInt(id)))
      .returning();

    if (!updatedPolicy) {
      return res.status(404).json({ error: 'Workweek policy not found' });
    }

    res.json(updatedPolicy);
  } catch (error) {
    console.error('Error updating workweek policy:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update workweek policy' });
  }
});

/**
 * Delete a workweek policy
 */
router.delete('/workweek-policies/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [deletedPolicy] = await db
      .delete(workweekPolicies)
      .where(eq(workweekPolicies.id, parseInt(id)))
      .returning();

    if (!deletedPolicy) {
      return res.status(404).json({ error: 'Workweek policy not found' });
    }

    res.json({ message: 'Workweek policy deleted successfully' });
  } catch (error) {
    console.error('Error deleting workweek policy:', error);
    res.status(500).json({ error: 'Failed to delete workweek policy' });
  }
});

/**
 * Get employee workweek assignments
 */
router.get('/employee-workweek-assignments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const assignments = await db
      .select({
        id: employeeWorkweekAssignments.id,
        employeeId: employeeWorkweekAssignments.employeeId,
        employeeName: sql`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`.as('employeeName'),
        workweekPolicyId: employeeWorkweekAssignments.workweekPolicyId,
        policyName: workweekPolicies.name,
        customWorkingDays: employeeWorkweekAssignments.customWorkingDays,
        customStartTime: employeeWorkweekAssignments.customStartTime,
        customEndTime: employeeWorkweekAssignments.customEndTime,
        customWeeklyHours: employeeWorkweekAssignments.customWeeklyHours,
        assignedDate: employeeWorkweekAssignments.assignedDate,
        effectiveFrom: employeeWorkweekAssignments.effectiveFrom,
        effectiveUntil: employeeWorkweekAssignments.effectiveUntil,
        assignedBy: employeeWorkweekAssignments.assignedBy,
        assignedByName: sql`COALESCE(assigned_by_user.first_name || ' ' || assigned_by_user.last_name, assigned_by_user.username)`.as('assignedByName'),
        notes: employeeWorkweekAssignments.notes,
        isActive: employeeWorkweekAssignments.isActive,
        createdAt: employeeWorkweekAssignments.createdAt
      })
      .from(employeeWorkweekAssignments)
      .innerJoin(users, eq(employeeWorkweekAssignments.employeeId, users.id))
      .innerJoin(workweekPolicies, eq(employeeWorkweekAssignments.workweekPolicyId, workweekPolicies.id))
      .leftJoin(users.as('assigned_by_user'), eq(employeeWorkweekAssignments.assignedBy, sql`assigned_by_user.id`))
      .where(eq(employeeWorkweekAssignments.isActive, true))
      .orderBy(desc(employeeWorkweekAssignments.createdAt));

    res.json(assignments);
  } catch (error) {
    console.error('Error fetching employee workweek assignments:', error);
    res.status(500).json({ error: 'Failed to fetch employee workweek assignments' });
  }
});

/**
 * Create employee workweek assignment
 */
router.post('/employee-workweek-assignments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user as any;
    
    // Validate request body
    const validatedData = insertEmployeeWorkweekAssignmentSchema.parse({
      ...req.body,
      assignedBy: currentUser.id
    });

    const [newAssignment] = await db
      .insert(employeeWorkweekAssignments)
      .values(validatedData)
      .returning();

    res.status(201).json(newAssignment);
  } catch (error) {
    console.error('Error creating employee workweek assignment:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create employee workweek assignment' });
  }
});

/**
 * Get workweek calendar overrides for a policy
 */
router.get('/workweek-calendar-overrides/:policyId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { policyId } = req.params;
    
    const overrides = await db
      .select({
        id: workweekCalendarOverrides.id,
        workweekPolicyId: workweekCalendarOverrides.workweekPolicyId,
        overrideDate: workweekCalendarOverrides.overrideDate,
        overrideType: workweekCalendarOverrides.overrideType,
        isWorkingDay: workweekCalendarOverrides.isWorkingDay,
        customStartTime: workweekCalendarOverrides.customStartTime,
        customEndTime: workweekCalendarOverrides.customEndTime,
        reason: workweekCalendarOverrides.reason,
        description: workweekCalendarOverrides.description,
        createdAt: workweekCalendarOverrides.createdAt,
        createdBy: workweekCalendarOverrides.createdBy,
        creatorName: sql`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.username})`.as('creatorName')
      })
      .from(workweekCalendarOverrides)
      .leftJoin(users, eq(workweekCalendarOverrides.createdBy, users.id))
      .where(eq(workweekCalendarOverrides.workweekPolicyId, parseInt(policyId)))
      .orderBy(asc(workweekCalendarOverrides.overrideDate));

    res.json(overrides);
  } catch (error) {
    console.error('Error fetching workweek calendar overrides:', error);
    res.status(500).json({ error: 'Failed to fetch workweek calendar overrides' });
  }
});

/**
 * Create workweek calendar override
 */
router.post('/workweek-calendar-overrides', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user as any;
    
    // Validate request body
    const validatedData = insertWorkweekCalendarOverrideSchema.parse({
      ...req.body,
      createdBy: currentUser.id
    });

    const [newOverride] = await db
      .insert(workweekCalendarOverrides)
      .values(validatedData)
      .returning();

    res.status(201).json(newOverride);
  } catch (error) {
    console.error('Error creating workweek calendar override:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid input data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create workweek calendar override' });
  }
});

/**
 * Delete workweek calendar override
 */
router.delete('/workweek-calendar-overrides/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [deletedOverride] = await db
      .delete(workweekCalendarOverrides)
      .where(eq(workweekCalendarOverrides.id, parseInt(id)))
      .returning();

    if (!deletedOverride) {
      return res.status(404).json({ error: 'Workweek calendar override not found' });
    }

    res.json({ message: 'Workweek calendar override deleted successfully' });
  } catch (error) {
    console.error('Error deleting workweek calendar override:', error);
    res.status(500).json({ error: 'Failed to delete workweek calendar override' });
  }
});

/**
 * Get work locations for policy assignment
 */
router.get('/work-locations', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const locations = await db
      .select({
        id: workLocations.id,
        name: workLocations.name,
        address: workLocations.address,
        city: workLocations.city,
        state: workLocations.state,
        isActive: workLocations.isActive
      })
      .from(workLocations)
      .where(eq(workLocations.isActive, true))
      .orderBy(asc(workLocations.name));

    res.json(locations);
  } catch (error) {
    console.error('Error fetching work locations:', error);
    res.status(500).json({ error: 'Failed to fetch work locations' });
  }
});

/**
 * Get payroll records
 */
router.get('/payroll/records', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const records = await db
      .select({
        id: payrollRecords.id,
        periodId: payrollRecords.periodId,
        userId: payrollRecords.userId,
        baseSalary: payrollRecords.baseSalary,
        grossPay: payrollRecords.grossPay,
        netPay: payrollRecords.netPay,
        incomeTax: payrollRecords.incomeTax,
        professionalTax: payrollRecords.professionalTax,
        providentFund: payrollRecords.providentFund,
        createdAt: payrollRecords.createdAt,
        updatedAt: payrollRecords.updatedAt
      })
      .from(payrollRecords)
      .orderBy(desc(payrollRecords.createdAt));

    // Get user details for each record
    const recordsWithUserInfo = await Promise.all(
      records.map(async (record) => {
        const user = await db
          .select({
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
            employeeCode: users.employeeCode
          })
          .from(users)
          .where(eq(users.id, record.userId))
          .limit(1);

        const userInfo = user[0] || {};
        const employeeName = userInfo.firstName && userInfo.lastName 
          ? `${userInfo.firstName} ${userInfo.lastName}`
          : userInfo.username || 'Unknown';

        // Get period info for month/year
        const period = await db
          .select({
            periodName: payrollPeriods.periodName,
            startDate: payrollPeriods.startDate
          })
          .from(payrollPeriods)
          .where(eq(payrollPeriods.id, record.periodId))
          .limit(1);

        const periodInfo = period[0];
        let month = 0, year = 0;
        
        if (periodInfo && periodInfo.startDate) {
          const startDate = new Date(periodInfo.startDate);
          month = startDate.getMonth() + 1; // JavaScript months are 0-indexed
          year = startDate.getFullYear();
        }

        // Calculate total deductions
        const totalDeductions = (parseFloat(record.incomeTax || '0') + 
                               parseFloat(record.professionalTax || '0') + 
                               parseFloat(record.providentFund || '0')).toFixed(2);

        return {
          id: record.id,
          employeeName,
          employeeCode: userInfo.employeeCode,
          basicSalary: record.baseSalary,
          grossEarnings: record.grossPay,
          totalDeductions,
          netSalary: record.netPay,
          month: month,
          year: year,
          createdAt: record.createdAt
        };
      })
    );

    res.json(recordsWithUserInfo);
  } catch (error) {
    console.error('Error fetching payroll records:', error);
    res.status(500).json({ error: 'Failed to fetch payroll records' });
  }
});

/**
 * Generate salary for an employee
 */
router.post('/generate-salary', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { employeeId, month, year } = req.body;
    
    // Validate required fields
    if (!employeeId || !month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: employeeId, month, year'
      });
    }
    
    // Convert month and year to numbers
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    // Validate month and year ranges
    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        error: 'Month must be between 1 and 12'
      });
    }
    
    if (yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({
        success: false,
        error: 'Year must be between 2000 and 2100'
      });
    }
    
    console.log(`💰 Generating salary for employee ${employeeId}, ${month}/${year}`);
    
    // Use the salary calculation engine to generate salary
    const salaryInput = {
      userId: parseInt(employeeId),
      month: monthNum,
      year: yearNum
    };
    
    const result = await salaryCalculationEngine.calculateSalary(salaryInput);
    
    res.json({
      success: true,
      message: 'Salary generated successfully',
      data: result
    });
    
  } catch (error: any) {
    console.error('❌ Error generating salary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate salary',
      message: error.message
    });
  }
});

/**
 * Get salary calculation preview without saving
 */
router.post('/salary-calculation-preview', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { employeeId, month, year } = req.body;
    
    // Validate required fields
    if (!employeeId || !month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: employeeId, month, year'
      });
    }
    
    // Convert month and year to numbers
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    // Validate month and year ranges
    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        error: 'Month must be between 1 and 12'
      });
    }
    
    if (yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({
        success: false,
        error: 'Year must be between 2000 and 2100'
      });
    }
    
    console.log(`👀 Generating salary preview for employee ${employeeId}, ${month}/${year}`);
    
    // Use the salary calculation engine to calculate salary preview
    const salaryInput = {
      userId: parseInt(employeeId),
      month: monthNum,
      year: yearNum
    };
    
    const result = await salaryCalculationEngine.calculateSalary(salaryInput);
    
    res.json({
      success: true,
      message: 'Salary calculation preview generated successfully',
      data: result
    });
    
  } catch (error: any) {
    console.error('❌ Error generating salary preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate salary preview',
      message: error.message
    });
  }
});

/**
 * Generate salary slip PDF
 */
router.get('/salary-slip/:payrollRecordId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { payrollRecordId } = req.params;

    // Get payroll record with employee details
    const payrollRecord = await db
      .select({
        id: payrollRecords.id,
        periodId: payrollRecords.periodId,
        userId: payrollRecords.userId,
        baseSalary: payrollRecords.baseSalary,
        grossPay: payrollRecords.grossPay,
        netPay: payrollRecords.netPay,
        incomeTax: payrollRecords.incomeTax,
        professionalTax: payrollRecords.professionalTax,
        providentFund: payrollRecords.providentFund,
        hra: payrollRecords.hra,
        conveyanceAllowance: payrollRecords.conveyanceAllowance,
        ltaAllowance: payrollRecords.ltaAllowance,
        specialAllowance: payrollRecords.specialAllowance,
        supplementaryAllowance: payrollRecords.supplementaryAllowance,
        kgpAllowance: payrollRecords.kgpAllowance,
        overtimePay: payrollRecords.overtimePay,
        bonus: payrollRecords.bonus,
        otherAllowances: payrollRecords.otherAllowances,
        esic: payrollRecords.esic,
        groupInsurance: payrollRecords.groupInsurance,
        otherDeductions: payrollRecords.otherDeductions,
        createdAt: payrollRecords.createdAt,
        
        // Employee details
        employeeName: users.username,
        employeeCode: users.employeeCode,
        firstName: users.firstName,
        lastName: users.lastName,
        jobTitle: users.jobTitle,
        department: users.department,
        
        // Period details
        periodName: payrollPeriods.periodName,
        startDate: payrollPeriods.startDate,
        endDate: payrollPeriods.endDate
      })
      .from(payrollRecords)
      .innerJoin(users, eq(payrollRecords.userId, users.id))
      .innerJoin(payrollPeriods, eq(payrollRecords.periodId, payrollPeriods.id))
      .where(eq(payrollRecords.id, parseInt(payrollRecordId)))
      .limit(1);

    if (!payrollRecord.length) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }

    const record = payrollRecord[0];

    // Calculate actual working days based on workweek policy and month
    let workingDays = 30; // Default fallback
    let paidDays = 30; // Default fallback
    
    try {
      // Import SalaryCalculationEngine for working days calculation
      const { SalaryCalculationEngine } = await import('./salary-calculation-engine');
      const salaryEngine = new SalaryCalculationEngine();
      
      // Extract month and year from period start date
      const periodStartDate = new Date(record.startDate);
      const month = periodStartDate.getMonth() + 1; // getMonth() returns 0-11
      const year = periodStartDate.getFullYear();
      
      // Get employee details for workweek policy
      const [employee] = await db
        .select({
          id: users.id,
          workLocationId: users.workLocationId,
          department: users.department
        })
        .from(users)
        .where(eq(users.id, record.userId))
        .limit(1);
      
      if (employee) {
        // Get workweek policy
        const workweekPolicy = await salaryEngine.getWorkweekPolicy(employee.workLocationId, employee.department);
        
        // Calculate actual working days for the month
        const workingDaysData = await salaryEngine.calculateWorkingDays(month, year, workweekPolicy);
        workingDays = workingDaysData.workingDays;
        
        // 🔥 CRITICAL FIX: Use actual attendance-based calculation instead of assuming all working days are paid
        const attendanceData = await salaryEngine.calculateAttendanceData(record.userId, month, year);
        paidDays = attendanceData.presentDays + attendanceData.paidLeaveDays;
        
        console.log(`📅 Calculated working days for ${month}/${year}: ${workingDays} days`);
        console.log(`👤 Attendance data for user ${record.userId}: Present: ${attendanceData.presentDays}, Paid Leave: ${attendanceData.paidLeaveDays}, Total Paid Days: ${paidDays}`);
        
        // 🔥 CRITICAL FIX: Recalculate salary with attendance-based pro-rating
        const attendanceBasedSalary = await salaryEngine.calculateSalary({
          userId: record.userId,
          month: month,
          year: year
        });
        
        console.log(`💰 Attendance-based salary calculation completed:`);
        console.log(`   - Original Basic Salary: ₹${record.baseSalary}`);
        console.log(`   - Attendance-adjusted Basic: ₹${attendanceBasedSalary.grossBasic}`);
        console.log(`   - Net Pay: ₹${attendanceBasedSalary.netPay}`);
        
        // Update the payroll record with attendance-based values
        record.baseSalary = attendanceBasedSalary.grossBasic;
        record.grossPay = attendanceBasedSalary.grossEarnings;
        record.netPay = attendanceBasedSalary.netPay;
        record.hra = attendanceBasedSalary.hra || 0;
        record.conveyanceAllowance = attendanceBasedSalary.conveyanceAllowance || 0;
        record.ltaAllowance = attendanceBasedSalary.ltaAllowance || 0;
        record.specialAllowance = attendanceBasedSalary.specialAllowance || 0;
        record.supplementaryAllowance = attendanceBasedSalary.supplementaryAllowance || 0;
        record.kgpAllowance = attendanceBasedSalary.kgpAllowance || 0;
        record.overtimePay = attendanceBasedSalary.overtimePay || 0;
        record.bonus = attendanceBasedSalary.bonus || 0;
        record.providentFund = attendanceBasedSalary.providentFund || 0;
        record.professionalTax = attendanceBasedSalary.professionalTax || 0;
        record.incomeTax = attendanceBasedSalary.incomeTax || 0;
        record.esic = attendanceBasedSalary.esic || 0;
        record.groupInsurance = attendanceBasedSalary.groupInsurance || 0;
      }
    } catch (error) {
      console.error('Error calculating working days, using fallback:', error);
      // Fall back to salary configuration values
      const salaryConfig = await db
        .select()
        .from(employeeSalaries)
        .where(eq(employeeSalaries.userId, record.userId))
        .limit(1);

      workingDays = salaryConfig.length > 0 ? (parseInt(salaryConfig[0].actualDays) || 30) : 30;
      paidDays = salaryConfig.length > 0 ? (parseInt(salaryConfig[0].paidDays) || workingDays) : workingDays;
    }

    // Prepare salary slip data
    const employeeFullName = record.firstName && record.lastName 
      ? `${record.firstName} ${record.lastName}` 
      : record.employeeName;

    const salarySlipData = {
      employee: {
        name: employeeFullName,
        employeeCode: record.employeeCode || 'N/A',
        designation: record.jobTitle || 'N/A',
        department: record.department || 'N/A',
        joiningDate: 'N/A', // Would need to be added to users table
        bankAccount: 'N/A', // Would need to be added to users table
        panNumber: undefined,
        uan: undefined
      },
      company: {
        name: 'THERMOPAC',
        address: 'B-20 TPEL Factory Area, Industrial Area, Phase II, Chandigarh - 160002'
      },
      period: {
        month: record.periodName || new Date(record.startDate).toLocaleDateString('en-US', { month: 'long' }),
        year: new Date(record.startDate).getFullYear(),
        workingDays: workingDays,
        paidDays: paidDays
      },
      earnings: {
        basicSalary: Math.round(parseFloat(record.baseSalary?.toString() || '0')),
        hra: Math.round(parseFloat(record.hra?.toString() || '0')),
        conveyanceAllowance: Math.round(parseFloat(record.conveyanceAllowance?.toString() || '0')),
        ltaAllowance: Math.round(parseFloat(record.ltaAllowance?.toString() || '0')),
        specialAllowance: Math.round(parseFloat(record.specialAllowance?.toString() || '0')),
        supplementaryAllowance: Math.round(parseFloat(record.supplementaryAllowance?.toString() || '0')),
        kgpAllowance: Math.round(parseFloat(record.kgpAllowance?.toString() || '0')),
        overtimePay: Math.round(parseFloat(record.overtimePay?.toString() || '0')),
        bonus: Math.round(parseFloat(record.bonus?.toString() || '0')),
        otherAllowances: Math.round(parseFloat(record.otherAllowances?.toString() || '0'))
      },
      deductions: {
        providentFund: Math.round(parseFloat(record.providentFund?.toString() || '0')),
        professionalTax: Math.round(parseFloat(record.professionalTax?.toString() || '0')),
        incomeTax: Math.round(parseFloat(record.incomeTax?.toString() || '0')),
        esic: Math.round(parseFloat(record.esic?.toString() || '0')),
        groupInsurance: Math.round(parseFloat(record.groupInsurance?.toString() || '0')),
        otherDeductions: Math.round(parseFloat(record.otherDeductions?.toString() || '0'))
      },
      totals: {
        grossEarnings: Math.round(parseFloat(record.grossPay?.toString() || '0')),
        totalDeductions: Math.round(parseFloat(record.grossPay?.toString() || '0') - parseFloat(record.netPay?.toString() || '0')),
        netPay: Math.round(parseFloat(record.netPay?.toString() || '0'))
      },
      netPayInWords: numberToWords(Math.round(parseFloat(record.netPay?.toString() || '0')))
    };

    // Generate and send PDF
    const generator = new SalarySlipGenerator();
    await generator.generateSalarySlip(salarySlipData, res);

  } catch (error) {
    console.error('Error generating salary slip:', error);
    res.status(500).json({ error: 'Failed to generate salary slip' });
  }
});

export default router;