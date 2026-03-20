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
  insertWorkweekCalendarOverrideSchema,
  employeeLoanRepayments,
  employeeAdvanceRecoveries,
  employeeLoans,
  employeeAdvances,
  tdsMonthlyRecords,
  payrollAttendanceSnapshot
} from '../shared/schema';
import { eq, and, desc, asc, gte, lte, sql, count, isNotNull, ne, inArray } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { ensureAuthenticated } from './auth-middleware';
import { salaryCalculationEngine } from './salary-calculation-engine';
import { SalarySlipGenerator, numberToWords } from './salary-slip-generator';
import { verifyPayslipRelease } from './payroll-calculation-verifier';
import { glAccountMappings } from '../shared/schema';
import { sapHttpsClient } from './sap-b1-integration/sap-https-client';
import { sapSessionManager } from './sap-session-manager';

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
function getAttendanceStatus(timeIn: string, timeOut: string | null, halfDayMinHours: number = 4.5, lateThresholdMinutes: number = 15, dutyTimeIn: string = '09:00'): string {
  const checkInTime = new Date(timeIn);
  const startOfDay = new Date(checkInTime);
  const [dutyHour, dutyMin] = dutyTimeIn.split(':').map(Number);
  startOfDay.setHours(dutyHour, dutyMin + lateThresholdMinutes, 0, 0);
  
  if (!timeOut) {
    return checkInTime > startOfDay ? 'Late' : 'Present';
  }
  
  const workHours = calculateWorkHours(timeIn, timeOut);
  if (!workHours) return 'Present';
  
  if (workHours < halfDayMinHours) return 'Half Day';
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
        cardCode: users.cardCode,
        cardName: users.cardName,
        panNumber: users.panNumber,
        dateOfJoining: users.dateOfJoining,
        reportingManagerId: users.reportingManagerId,
        workLocationId: users.workLocationId,
        userType: users.userType,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        // Duty Schedule fields
        dutyTimeIn: users.dutyTimeIn,
        dutyTimeOut: users.dutyTimeOut,
        allowedLateMinutes: users.allowedLateMinutes,
        earlyExitMinutes: users.earlyExitMinutes,
        // Work Time Policy fields
        workTimePolicy: users.workTimePolicy,
        minimumDailyHours: users.minimumDailyHours,
        halfDayMinimumHours: users.halfDayMinimumHours
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
      cardCode,
      cardName,
      panNumber,
      dateOfJoining,
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
        cardCode,
        cardName,
        panNumber,
        dateOfJoining,
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
  } catch (error: any) {
    console.error('Error creating user:', error);
    if (error?.code === '23505') {
      const detail = error?.detail || '';
      if (detail.includes('email')) {
        return res.status(400).json({ error: 'This email address is already in use. Please use a different email.' });
      }
      if (detail.includes('username')) {
        return res.status(400).json({ error: 'This username is already taken. Please choose a different username.' });
      }
      return res.status(400).json({ error: 'A user with these details already exists. Please check for duplicates.' });
    }
    res.status(500).json({ error: 'Failed to create user. Please try again.' });
  }
});

/**
 * Update user
 */
router.put('/users/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const updateData = req.body;
    
    console.log('=== USER UPDATE REQUEST ===');
    console.log('PUT /users/:id - User ID:', userId);
    console.log('PUT /users/:id - Update data received:', updateData);
    console.log('Session ID:', req.sessionID);
    console.log('User making request:', req.user?.username);
    console.log('Request headers cookie:', req.headers.cookie);
    console.log('============================');

    // Validate user ID
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Check username uniqueness if being changed
    if (updateData.username) {
      const existingUser = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.username, updateData.username), ne(users.id, userId)));
      if (existingUser.length > 0) {
        return res.status(400).json({ error: 'Username is already taken by another user' });
      }
    }

    // If password is being updated, hash it; if empty, remove it from update
    if (updateData.password && updateData.password.trim() !== '') {
      console.log('Hashing password for user update');
      updateData.password = await bcrypt.hash(updateData.password, 10);
    } else if (updateData.password === '' || updateData.password === undefined) {
      console.log('Removing password from update data');
      delete updateData.password;
    }

    updateData.updatedAt = new Date();
    console.log('Final update data:', { ...updateData, password: updateData.password ? '[HIDDEN]' : undefined });

    // Log each field type before database update
    console.log('Type validation:');
    for (const [key, value] of Object.entries(updateData)) {
      console.log(`  ${key}: ${typeof value} = ${value}`);
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      console.log('No user found with ID:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('User updated successfully:', updatedUser.id);
    
    // Remove password from response
    const { password, ...userWithoutPassword } = updatedUser;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user', details: error.message });
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
        role: users.role,
        employeeCode: users.employeeCode,
        userType: users.userType,
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
        kpiPercent: employeeSalaries.kpiPercent,
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
        hourlyRate: employeeSalaries.hourlyRate,
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
    
    const isDaily = salaryData.salaryType === 'daily';
    if (isDaily) {
      salaryData.houseRentAllowance = null;
      salaryData.conveyance = null;
      salaryData.lta = null;
      salaryData.specialAllowance = null;
      salaryData.supplementaryAllowance = null;
      salaryData.kgpAllowance = null;
      salaryData.kpiPercent = null;
    }

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

    const grossSalaryWithoutBonus = grossSalary - parseFloat(salaryData.bonus || 0);
    const ctcMonthly = grossSalaryWithoutBonus + totalEmployerContributions;
    const ctcYearly = (ctcMonthly * 12) + (parseFloat(salaryData.bonus || 0) * 12);

    const totalDeductions = parseFloat(salaryData.employeePfContribution || 0) + 
                           parseFloat(salaryData.employeeEsicContribution || 0) +
                           parseFloat(salaryData.professionalTax || 0);

    const takeHomeSalary = grossSalary - totalDeductions;

    const [existingConfig] = await db
      .select()
      .from(employeeSalaries)
      .where(and(
        eq(employeeSalaries.userId, salaryData.userId),
        eq(employeeSalaries.isActive, true)
      ));

    if (existingConfig) {
      const updateData = {
        ...salaryData,
        baseSalary: salaryData.basicSalary,
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
    
    const isDaily = salaryData.salaryType === 'daily';
    if (isDaily) {
      salaryData.houseRentAllowance = null;
      salaryData.conveyance = null;
      salaryData.lta = null;
      salaryData.specialAllowance = null;
      salaryData.supplementaryAllowance = null;
      salaryData.kgpAllowance = null;
      salaryData.kpiPercent = null;
    }

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

    const grossSalaryWithoutBonus = grossSalary - parseFloat(salaryData.bonus || 0);
    const ctcMonthly = grossSalaryWithoutBonus + totalEmployerContributions;
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
        paymentDate: payrollRecords.paymentDate,
        salarySource: payrollRecords.salarySource,
        workerType: payrollRecords.workerType,
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
        status: attendanceRecords.status,
        userName: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        department: users.department,
        weeklyOffDays: users.weeklyOffDays,
        halfDayMinimumHours: users.halfDayMinimumHours,
        allowedLateMinutes: users.allowedLateMinutes,
        dutyTimeIn: users.dutyTimeIn
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
      // Use actual database status if available, otherwise calculate from check-in time
      const dbStatus = record.status;
      let displayStatus: string;
      
      // Check if this date is a weekly off day for this employee
      const recordDate = new Date(record.date);
      const dayOfWeek = recordDate.getDay(); // 0 = Sunday, 6 = Saturday
      const weeklyOffDays = Array.isArray(record.weeklyOffDays) ? record.weeklyOffDays : [0, 6];
      const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);
      
      if (isWeeklyOff) {
        displayStatus = 'Weekly Off';
      } else if (dbStatus === 'absent') {
        displayStatus = 'Absent';
      } else if (dbStatus === 'late') {
        displayStatus = 'Late';
      } else if (dbStatus === 'half_day') {
        displayStatus = 'Half Day';
      } else {
        // For 'present' status or unknown, calculate based on check-in time and employee settings
        const halfDayMin = Number(record.halfDayMinimumHours) || 4.5;
        const lateMin = Number(record.allowedLateMinutes) || 15;
        const dutyIn = record.dutyTimeIn || '09:00';
        displayStatus = getAttendanceStatus(record.checkInTime, record.checkOutTime, halfDayMin, lateMin, dutyIn);
      }
      
      return {
        id: record.id,
        userId: record.userId,
        userName: record.userName || record.firstName || 'Unknown',
        department: record.department || 'N/A',
        date: record.date,
        timeIn: record.checkInTime,
        timeOut: record.checkOutTime,
        workHours,
        status: displayStatus,
        location: 'Office',
        weeklyOffDays
      };
    }) : [];

    // When filtering by a specific employee, add synthetic records for days 
    // that are weekly off or absent (no attendance record)
    let allRecords = transformedRecords;
    
    if (employee !== 'all') {
      const employeeId = parseInt(employee as string);
      if (!isNaN(employeeId)) {
        // Get the employee's weekly off days
        const [employeeData] = await db
          .select({
            id: users.id,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
            department: users.department,
            weeklyOffDays: users.weeklyOffDays
          })
          .from(users)
          .where(eq(users.id, employeeId));
        
        if (employeeData) {
          const empWeeklyOffDays = Array.isArray(employeeData.weeklyOffDays) 
            ? employeeData.weeklyOffDays 
            : [0, 6];
          
          // Fetch company holidays in the date range
          const holidays = await db
            .select({ date: companyHolidays.date })
            .from(companyHolidays)
            .where(and(
              gte(companyHolidays.date, startDate.toISOString().split('T')[0]),
              lte(companyHolidays.date, endDate.toISOString().split('T')[0])
            ));
          const holidayDates = new Set(holidays.map((h: any) => h.date));
          
          // Get all dates in the range that need synthetic records
          const existingDates = new Set(transformedRecords.map((r: any) => r.date));
          const syntheticRecords: any[] = [];
          
          // Clamp end date to today (don't show future dates as Absent)
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          const effectiveEndDate = endDate > today ? today : endDate;
          
          // Iterate through all dates in the range
          const currentDate = new Date(startDate);
          while (currentDate <= effectiveEndDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();
            
            // Skip if record already exists for this date
            if (!existingDates.has(dateStr)) {
              const isWeeklyOff = empWeeklyOffDays.includes(dayOfWeek);
              const isHoliday = holidayDates.has(dateStr);
              
              if (isWeeklyOff) {
                // Weekly Off day - no attendance required
                syntheticRecords.push({
                  id: -1, // Synthetic record indicator
                  userId: employeeData.id,
                  userName: employeeData.firstName || employeeData.username || 'Unknown',
                  department: employeeData.department || 'N/A',
                  date: dateStr,
                  timeIn: null,
                  timeOut: null,
                  workHours: null,
                  status: 'Weekly Off',
                  location: 'N/A',
                  weeklyOffDays: empWeeklyOffDays
                });
              } else if (isHoliday) {
                // Company Holiday - no attendance required
                syntheticRecords.push({
                  id: -2, // Synthetic holiday record indicator
                  userId: employeeData.id,
                  userName: employeeData.firstName || employeeData.username || 'Unknown',
                  department: employeeData.department || 'N/A',
                  date: dateStr,
                  timeIn: null,
                  timeOut: null,
                  workHours: null,
                  status: 'Holiday',
                  location: 'N/A',
                  weeklyOffDays: empWeeklyOffDays
                });
              } else {
                // Working day with no attendance - mark as Absent
                syntheticRecords.push({
                  id: -3, // Synthetic absent record indicator
                  userId: employeeData.id,
                  userName: employeeData.firstName || employeeData.username || 'Unknown',
                  department: employeeData.department || 'N/A',
                  date: dateStr,
                  timeIn: null,
                  timeOut: null,
                  workHours: null,
                  status: 'Absent',
                  location: 'N/A',
                  weeklyOffDays: empWeeklyOffDays
                });
              }
            }
            
            currentDate.setDate(currentDate.getDate() + 1);
          }
          
          // Merge and sort all records by date (descending)
          allRecords = [...transformedRecords, ...syntheticRecords]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
      }
    }

    res.json(allRecords);
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    res.status(500).json({ error: 'Failed to fetch attendance records' });
  }
});

// Get list of departments for filter
router.get('/departments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const departments = await db
      .selectDistinct({ department: users.department })
      .from(users)
      .where(
        and(
          isNotNull(users.department),
          ne(users.department, ''),
          eq(users.isActive, true)
        )
      )
      .orderBy(asc(users.department));

    const departmentList = departments.map(d => d.department).filter(Boolean);
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
        status: payrollRecords.status,
        verifiedBy: payrollRecords.verifiedBy,
        verifiedAt: payrollRecords.verifiedAt,
        heldReason: payrollRecords.heldReason,
        heldBy: payrollRecords.heldBy,
        heldAt: payrollRecords.heldAt,
        statusHistory: payrollRecords.statusHistory,
        sapDocEntry: payrollRecords.sapDocEntry,
        sapJeNumber: payrollRecords.sapJeNumber,
        sapPostedAt: payrollRecords.sapPostedAt,
        sapPostingStatus: payrollRecords.sapPostingStatus,
        sapErrorMessage: payrollRecords.sapErrorMessage,
        reversalSapDocEntry: payrollRecords.reversalSapDocEntry,
        reversalSapJeNumber: payrollRecords.reversalSapJeNumber,
        reversalSapPostedAt: payrollRecords.reversalSapPostedAt,
        reversedBy: payrollRecords.reversedBy,
        reversedAt: payrollRecords.reversedAt,
        reversalMemo: payrollRecords.reversalMemo,
        createdAt: payrollRecords.createdAt,
        updatedAt: payrollRecords.updatedAt,
        salarySource: payrollRecords.salarySource,
        workerType: payrollRecords.workerType,
        verificationStatus: payrollRecords.verificationStatus,
        verificationRunAt: payrollRecords.verificationRunAt,
        verificationDetails: payrollRecords.verificationDetails,
        verificationOverrideReason: payrollRecords.verificationOverrideReason,
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

        const totalDeductions = record.salarySource === 'manual_salary'
          ? (parseFloat(record.grossPay || '0') - parseFloat(record.netPay || '0')).toFixed(2)
          : (parseFloat(record.incomeTax || '0') + 
             parseFloat(record.professionalTax || '0') + 
             parseFloat(record.providentFund || '0')).toFixed(2);

        return {
          id: record.id,
          userId: record.userId,
          employeeName,
          employeeCode: userInfo.employeeCode,
          basicSalary: record.baseSalary,
          grossEarnings: record.grossPay,
          totalDeductions,
          netSalary: record.netPay,
          month: month,
          year: year,
          status: record.status || 'generated',
          verifiedBy: record.verifiedBy,
          verifiedAt: record.verifiedAt,
          heldReason: record.heldReason,
          heldBy: record.heldBy,
          heldAt: record.heldAt,
          statusHistory: record.statusHistory || [],
          sapDocEntry: record.sapDocEntry,
          sapJeNumber: record.sapJeNumber,
          sapPostedAt: record.sapPostedAt,
          sapPostingStatus: record.sapPostingStatus,
          sapErrorMessage: record.sapErrorMessage,
          reversalSapDocEntry: record.reversalSapDocEntry,
          reversalSapJeNumber: record.reversalSapJeNumber,
          reversalSapPostedAt: record.reversalSapPostedAt,
          reversedBy: record.reversedBy,
          reversedAt: record.reversedAt,
          reversalMemo: record.reversalMemo,
          salarySource: record.salarySource,
          workerType: record.workerType,
          periodId: record.periodId,
          verificationStatus: record.verificationStatus || 'pending',
          verificationRunAt: record.verificationRunAt,
          verificationDetails: record.verificationDetails,
          verificationOverrideReason: record.verificationOverrideReason,
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

router.delete('/payroll/records/clear-all', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const allRecords = await db.select({ id: payrollRecords.id, status: payrollRecords.status, sapPostingStatus: payrollRecords.sapPostingStatus }).from(payrollRecords);

    const protectedRecords = allRecords.filter(r =>
      r.status === 'transferred' || r.sapPostingStatus === 'posted'
    );

    const deletableRecords = allRecords.filter(r =>
      r.status !== 'transferred' && r.sapPostingStatus !== 'posted'
    );

    if (deletableRecords.length === 0) {
      return res.status(400).json({ error: 'No records to clear. Only transferred/SAP-posted records are protected.' });
    }

    const deletableIds = deletableRecords.map(r => r.id);

    for (const rec of deletableRecords) {
      await reverseLinkedDeductions(rec.id, 0, 'System', 0, 'clear-all');
    }

    const idList = sql.join(deletableIds.map(id => sql`${id}`), sql`, `);
    await db.execute(sql`DELETE FROM employee_advance_recoveries WHERE payroll_record_id IN (${idList})`);
    await db.execute(sql`DELETE FROM employee_loan_repayments WHERE payroll_record_id IN (${idList})`);
    await db.execute(sql`DELETE FROM manual_salary_entries WHERE payroll_record_id IN (${idList})`);
    await db.execute(sql`DELETE FROM statutory_challan_details WHERE payroll_record_id IN (${idList})`);
    await db.execute(sql`DELETE FROM tds_compliance_register WHERE payroll_record_id IN (${idList})`);
    await db.execute(sql`DELETE FROM tds_payroll_sap_reconciliation WHERE payroll_record_id IN (${idList})`);

    await db.delete(payrollRecords).where(inArray(payrollRecords.id, deletableIds));

    res.json({
      success: true,
      message: `${deletableRecords.length} record(s) deleted.${protectedRecords.length > 0 ? ` ${protectedRecords.length} transferred/posted record(s) preserved.` : ''}`,
    });
  } catch (error) {
    console.error('Error clearing payroll records:', error);
    res.status(500).json({ error: 'Failed to clear payroll records' });
  }
});

async function reverseLinkedDeductions(recordId: number, employeeId: number, actionBy: string, actionById: number, actionType: string) {
  const reversals: { type: string; reference: string; amount: number; }[] = [];

  const loanRepayments = await db.select().from(employeeLoanRepayments)
    .where(and(
      eq(employeeLoanRepayments.payrollRecordId, recordId),
      inArray(employeeLoanRepayments.status, ['deducted', 'partial'])
    ));

  for (const rep of loanRepayments) {
    await db.update(employeeLoanRepayments).set({
      status: 'reversed',
      reversedAt: new Date(),
    }).where(eq(employeeLoanRepayments.id, rep.id));

    const [parentLoan] = await db.select().from(employeeLoans).where(eq(employeeLoans.id, rep.loanId));
    if (parentLoan) {
      const repAmount = parseFloat(rep.amount);
      const newRepaid = Math.max(0, parseFloat(parentLoan.totalRepaid || '0') - repAmount);
      const newBalance = parseFloat(parentLoan.outstandingBalance || '0') + repAmount;
      const newInstPaid = Math.max(0, (parentLoan.installmentsPaid || 0) - 1);
      await db.update(employeeLoans).set({
        totalRepaid: newRepaid.toFixed(2),
        outstandingBalance: newBalance.toFixed(2),
        installmentsPaid: newInstPaid,
        status: parentLoan.status === 'closed' ? 'active' : parentLoan.status,
        updatedAt: new Date(),
      }).where(eq(employeeLoans.id, rep.loanId));
      reversals.push({ type: 'loan', reference: parentLoan.loanReference, amount: repAmount });
    }
  }

  const advRecoveries = await db.select().from(employeeAdvanceRecoveries)
    .where(and(
      eq(employeeAdvanceRecoveries.payrollRecordId, recordId),
      inArray(employeeAdvanceRecoveries.status, ['deducted', 'partial'])
    ));

  for (const rec of advRecoveries) {
    await db.update(employeeAdvanceRecoveries).set({
      status: 'reversed',
      reversedAt: new Date(),
    }).where(eq(employeeAdvanceRecoveries.id, rec.id));

    const [parentAdv] = await db.select().from(employeeAdvances).where(eq(employeeAdvances.id, rec.advanceId));
    if (parentAdv) {
      const recAmount = parseFloat(rec.amount);
      const newRecovered = Math.max(0, parseFloat(parentAdv.totalRecovered || '0') - recAmount);
      const newBalance = parseFloat(parentAdv.outstandingBalance || '0') + recAmount;
      const newInstRec = Math.max(0, (parentAdv.installmentsRecovered || 0) - 1);
      await db.update(employeeAdvances).set({
        totalRecovered: newRecovered.toFixed(2),
        outstandingBalance: newBalance.toFixed(2),
        installmentsRecovered: newInstRec,
        status: parentAdv.status === 'closed' ? 'active' : parentAdv.status,
        updatedAt: new Date(),
      }).where(eq(employeeAdvances.id, rec.advanceId));
      reversals.push({ type: 'advance', reference: parentAdv.advanceReference, amount: recAmount });
    }
  }

  return reversals;
}

router.patch('/payroll/records/:id/void', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const recordId = Number(req.params.id);
    const currentUser = req.user as any;
    const userName = currentUser.firstName && currentUser.lastName
      ? `${currentUser.firstName} ${currentUser.lastName}` : currentUser.username;
    const { reason } = req.body;

    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, recordId));
    if (!record) return res.status(404).json({ error: 'Payroll record not found' });

    if (record.salarySource === 'manual_salary') {
      return res.status(400).json({ error: 'Manual salary records must be managed through the Manual Salary tab.' });
    }

    if (record.status === 'voided') {
      return res.status(400).json({ error: 'This record is already voided.' });
    }
    if (record.status === 'transferred' || record.sapPostingStatus === 'posted') {
      return res.status(400).json({ error: 'Transferred records cannot be voided. Use "Reverse Entry" instead.' });
    }
    if (record.status === 'reversed') {
      return res.status(400).json({ error: 'Reversed records cannot be voided — they are already permanently locked.' });
    }

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: 'A reason is required when voiding a record.' });
    }

    const reversals = await reverseLinkedDeductions(recordId, record.userId, userName, currentUser.id, 'void');

    const now = new Date();
    const history = Array.isArray(record.statusHistory) ? [...(record.statusHistory as any[])] : [];
    history.push({
      from: record.status || 'generated',
      to: 'voided',
      action: 'void',
      reason: reason.trim(),
      by: userName,
      byId: currentUser.id,
      at: now.toISOString(),
      reversals,
    });

    await db.update(payrollRecords).set({
      status: 'voided',
      heldReason: reason.trim(),
      heldBy: currentUser.id,
      heldAt: now,
      statusHistory: history,
      updatedAt: now,
    }).where(eq(payrollRecords.id, recordId));

    const reversalMsg = reversals.length > 0
      ? ` Reversed ${reversals.length} linked deduction(s): ${reversals.map(r => `${r.reference} ₹${r.amount.toFixed(2)}`).join(', ')}.`
      : '';

    res.json({
      success: true,
      message: `Payroll record voided successfully.${reversalMsg} Record preserved for audit.`,
    });
  } catch (error: any) {
    console.error('Error voiding payroll record:', error);
    res.status(500).json({ error: error.message || 'Failed to void payroll record' });
  }
});

/**
 * Fetch GL accounts from SAP Chart of Accounts
 */
router.get('/payroll/sap-gl-accounts', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const sapUser = process.env.SAP_USERNAME || '';
    const sapPass = process.env.SAP_PASSWORD || '';
    const sapDb = process.env.SAP_COMPANY_DB || '';
    if (!sapUser || !sapPass || !sapDb) return res.status(500).json({ error: 'SAP credentials not configured' });

    const loginResult = await sapHttpsClient.login(sapUser, sapPass, sapDb);
    const sessionId = loginResult.sessionId;
    let routeId = '';
    const setCookieHeader = loginResult.response.headers['set-cookie'];
    if (setCookieHeader) {
      const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      for (const cookie of cookieArray) {
        const match = cookie.match(/ROUTEID=([^;]+)/);
        if (match) { routeId = match[1]; break; }
      }
    }
    const headers: Record<string, string> = {};
    if (routeId) headers['Cookie'] = `B1SESSION=${sessionId}; ROUTEID=${routeId}`;

    const sapResponse = await sapHttpsClient.authenticatedRequest(sessionId, {
      method: 'GET',
      path: "/b1s/v1/ChartOfAccounts?$select=Code,Name,ActiveAccount&$top=500",
      headers,
    });

    if (sapResponse.ok) {
      const data = JSON.parse(sapResponse.body);
      const allAccounts = data.value || [];
      const accounts = allAccounts.map((a: any) => ({ code: a.Code, name: a.Name, active: a.ActiveAccount }));
      return res.json({ accounts, total: accounts.length });
    } else {
      return res.status(500).json({ error: sapResponse.body });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * Test SAP JE posting with custom payload
 */
router.post('/payroll/test-sap-je', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user as any;
    const jePayload = req.body.jePayload;

    if (!jePayload) {
      return res.status(400).json({ error: 'jePayload is required' });
    }

    const sapUser = process.env.SAP_USERNAME || '';
    const sapPass = process.env.SAP_PASSWORD || '';
    const sapDb = process.env.SAP_COMPANY_DB || '';

    if (!sapUser || !sapPass || !sapDb) {
      return res.status(500).json({ error: 'SAP credentials not configured' });
    }

    console.log(`[Test SAP JE] Fresh login to ${sapDb} as ${sapUser}...`);
    const loginResult = await sapHttpsClient.login(sapUser, sapPass, sapDb);
    const sessionId = loginResult.sessionId;

    let routeId = '';
    const setCookieHeader = loginResult.response.headers['set-cookie'];
    if (setCookieHeader) {
      const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      for (const cookie of cookieArray) {
        const match = cookie.match(/ROUTEID=([^;]+)/);
        if (match) {
          routeId = match[1];
          break;
        }
      }
    }
    console.log(`[Test SAP JE] Login OK, sessionId=${sessionId}, routeId=${routeId}`);

    const headers: Record<string, string> = {};
    if (routeId) {
      headers['Cookie'] = `B1SESSION=${sessionId}; ROUTEID=${routeId}`;
    }

    const glResponse = await sapHttpsClient.authenticatedRequest(sessionId, {
      method: 'GET',
      path: "/b1s/v1/ChartOfAccounts?$select=Code,Name,ActiveAccount&$top=50",
      headers,
    });
    let discoveredAccounts: any[] = [];
    if (glResponse.ok) {
      try {
        const glData = JSON.parse(glResponse.body);
        const allAccounts = glData.value || [];
        console.log(`[Test SAP JE] Got ${allAccounts.length} GL accounts from SAP. First 5:`, allAccounts.slice(0, 5).map((a: any) => JSON.stringify(a)));
        discoveredAccounts = allAccounts.filter((a: any) => a.ActiveAccount === 'tYES');
        if (discoveredAccounts.length === 0) discoveredAccounts = allAccounts;
        console.log(`[Test SAP JE] Using ${discoveredAccounts.length} active accounts. First 2:`, discoveredAccounts.slice(0, 2).map((a: any) => `${a.Code} - ${a.Name}`));
      } catch (_) {}
    } else {
      console.log(`[Test SAP JE] GL query failed: ${glResponse.statusCode} ${glResponse.body}`);
      const glResponse2 = await sapHttpsClient.authenticatedRequest(sessionId, {
        method: 'GET',
        path: "/b1s/v1/ChartOfAccounts?$top=5",
        headers,
      });
      console.log(`[Test SAP JE] Fallback GL query: ${glResponse2.statusCode} ${glResponse2.body.substring(0, 500)}`);
      if (glResponse2.ok) {
        try {
          const glData2 = JSON.parse(glResponse2.body);
          discoveredAccounts = glData2.value || [];
        } catch (_) {}
      }
    }

    let finalPayload = jePayload;

    const needsResolve = (finalPayload.JournalEntryLines || []).filter((line: any) =>
      line.ShortName && (
        line.AccountCode === line.ShortName ||
        line.AccountCode === '<REAL_BP_CONTROL_GL>' ||
        !line.AccountCode ||
        line.AccountCode.startsWith('_SYS')
      )
    );

    if (needsResolve.length > 0) {
      const bpCode = needsResolve[0].ShortName;
      console.log(`[Test SAP JE] Need to resolve BP control GL for ${bpCode}...`);

      const netPayGL = await db.select({ glAccountCode: glAccountMappings.glAccountCode })
        .from(glAccountMappings)
        .where(and(
          eq(glAccountMappings.componentCode, 'NET_PAY'),
          eq(glAccountMappings.postingContext, 'payroll_liability'),
          eq(glAccountMappings.isActive, true)
        ));

      const configuredGL = netPayGL.length > 0 ? netPayGL[0].glAccountCode?.trim() : '';
      let resolvedGL = '';

      if (configuredGL && !configuredGL.startsWith('_SYS') && !configuredGL.includes('<')) {
        resolvedGL = configuredGL;
        console.log(`[Test SAP JE] Using NET_PAY GL from GL Mapping config: ${resolvedGL}`);
      } else {
        console.log(`[Test SAP JE] No valid NET_PAY GL in config (got: "${configuredGL}"). Querying SAP BP for control GL...`);
        try {
          const bpResponse = await sapHttpsClient.authenticatedRequest(sessionId, {
            method: 'GET',
            path: `/b1s/v1/BusinessPartners('${bpCode}')`,
            headers,
          });
          if (bpResponse.ok) {
            const bpFull = JSON.parse(bpResponse.body);
            const accountFields = Object.keys(bpFull).filter(k => k.toLowerCase().includes('account'));
            console.log(`[Test SAP JE] BP ${bpCode} (CardType=${bpFull.CardType}) account fields:`);
            for (const field of accountFields) {
              console.log(`  ${field} = ${JSON.stringify(bpFull[field])}`);
            }

            const candidates = [
              bpFull.AccountsPayable,
              bpFull.CreditAccount,
              bpFull.DebitorAccount,
              bpFull.ControlAccount,
            ].filter(v => v && typeof v === 'string' && !v.startsWith('_SYS'));

            if (candidates.length > 0) {
              resolvedGL = candidates[0];
              console.log(`[Test SAP JE] Resolved BP control GL from SAP: ${resolvedGL}`);
            } else {
              console.log(`[Test SAP JE] All SAP BP account fields are _SYS or empty.`);
              return res.status(400).json({
                error: `Cannot resolve BP control GL for ${bpCode}. SAP returned only system-generated (_SYS) account codes. Please enter the actual Accounts Payable / Sundry Creditors GL code in GL Mapping → NET_PAY.`,
                bpAccountFields: accountFields.reduce((acc: any, f: string) => { acc[f] = bpFull[f]; return acc; }, {}),
                hint: 'In SAP B1, go to a JE screen, type V10771 in ShortName and press Tab. Note the AccountCode SAP auto-fills. Enter that GL code in GL Mapping → NET_PAY.',
              });
            }
          } else {
            return res.status(400).json({ error: `Cannot fetch BP ${bpCode} from SAP: ${bpResponse.statusCode}` });
          }
        } catch (bpErr: any) {
          return res.status(400).json({ error: `BP query failed: ${bpErr.message}` });
        }
      }

      finalPayload = {
        ...finalPayload,
        JournalEntryLines: finalPayload.JournalEntryLines.map((line: any) => {
          if (needsResolve.some((nr: any) => nr.Line_ID === line.Line_ID)) {
            return { ...line, AccountCode: resolvedGL };
          }
          return line;
        }),
      };
    }

    const invalidLines = (finalPayload.JournalEntryLines || []).filter((line: any) =>
      line.AccountCode && (
        line.AccountCode.startsWith('_SYS') ||
        line.AccountCode === line.ShortName ||
        line.AccountCode.includes('<')
      )
    );
    if (invalidLines.length > 0) {
      return res.status(400).json({
        error: `Invalid AccountCode on lines: ${invalidLines.map((l: any) => `Line ${l.Line_ID}: "${l.AccountCode}"`).join(', ')}. Cannot post with _SYS codes, BP codes, or placeholders.`,
        invalidLines,
        hint: 'Set the NET_PAY GL in GL Mapping with the actual Accounts Payable control GL code.',
      });
    }

    const uniqueGLs = [...new Set((finalPayload.JournalEntryLines || []).map((l: any) => l.AccountCode).filter(Boolean))];
    console.log(`[Test SAP JE] Resolving ${uniqueGLs.length} GL codes against SAP Chart of Accounts...`);
    const glResolution: Record<string, { resolved: boolean; sapAcctCode?: string; sapFormatCode?: string; name?: string; error?: string }> = {};

    for (const glCode of uniqueGLs) {
      let found = false;

      try {
        const directResp = await sapHttpsClient.authenticatedRequest(sessionId, {
          method: 'GET',
          path: `/b1s/v1/ChartOfAccounts('${encodeURIComponent(glCode)}')`,
          headers,
        });
        if (directResp.ok) {
          const data = JSON.parse(directResp.body);
          glResolution[glCode] = { resolved: true, sapAcctCode: data.Code, sapFormatCode: data.FormatCode, name: data.AcctName || data.Name };
          console.log(`  ✓ ${glCode} → direct match: AcctCode=${data.Code}, FormatCode=${data.FormatCode}, Name=${data.AcctName}`);
          found = true;
        }
      } catch (_) {}

      if (!found) {
        try {
          const filterResp = await sapHttpsClient.authenticatedRequest(sessionId, {
            method: 'GET',
            path: `/b1s/v1/ChartOfAccounts?$filter=FormatCode eq '${glCode}'&$select=Code,FormatCode,AcctName,ActiveAccount&$top=1`,
            headers,
          });
          if (filterResp.ok) {
            const result = JSON.parse(filterResp.body);
            if (result.value && result.value.length > 0) {
              const acct = result.value[0];
              glResolution[glCode] = { resolved: true, sapAcctCode: acct.Code, sapFormatCode: acct.FormatCode, name: acct.AcctName };
              console.log(`  ✓ ${glCode} → FormatCode match: AcctCode=${acct.Code}, FormatCode=${acct.FormatCode}, Name=${acct.AcctName}`);
              found = true;
            }
          }
        } catch (_) {}
      }

      if (!found) {
        try {
          const stripped = glCode.replace(/-[A-Z]+$/, '');
          if (stripped !== glCode) {
            const strippedResp = await sapHttpsClient.authenticatedRequest(sessionId, {
              method: 'GET',
              path: `/b1s/v1/ChartOfAccounts('${encodeURIComponent(stripped)}')`,
              headers,
            });
            if (strippedResp.ok) {
              const data = JSON.parse(strippedResp.body);
              glResolution[glCode] = { resolved: true, sapAcctCode: data.Code, sapFormatCode: data.FormatCode, name: data.AcctName || data.Name };
              console.log(`  ✓ ${glCode} → stripped match (${stripped}): AcctCode=${data.Code}, FormatCode=${data.FormatCode}, Name=${data.AcctName}`);
              found = true;
            }
          }
        } catch (_) {}
      }

      if (!found) {
        glResolution[glCode] = { resolved: false, error: 'Not found by AcctCode, FormatCode, or stripped code' };
        console.log(`  ✗ ${glCode} = NOT FOUND in SAP CoA`);
      }
    }

    const unresolved = Object.entries(glResolution).filter(([, v]) => !v.resolved);
    if (unresolved.length > 0) {
      return res.status(400).json({
        error: `${unresolved.length} GL code(s) not found in SAP Chart of Accounts: ${unresolved.map(([code]) => code).join(', ')}`,
        unresolvedGLCodes: Object.fromEntries(unresolved),
        resolvedGLCodes: Object.fromEntries(Object.entries(glResolution).filter(([, v]) => v.resolved)),
        hint: 'These codes do not exist in the SAP Chart of Accounts as AcctCode or FormatCode.',
      });
    }

    const codeMap: Record<string, string> = {};
    for (const [displayCode, info] of Object.entries(glResolution)) {
      if (info.sapAcctCode && info.sapAcctCode !== displayCode) {
        codeMap[displayCode] = info.sapAcctCode;
      }
    }

    if (Object.keys(codeMap).length > 0) {
      console.log(`[Test SAP JE] Remapping ${Object.keys(codeMap).length} display codes to SAP AcctCodes:`);
      for (const [from, to] of Object.entries(codeMap)) {
        console.log(`  ${from} → ${to}`);
      }
      finalPayload = {
        ...finalPayload,
        JournalEntryLines: finalPayload.JournalEntryLines.map((line: any) => {
          if (codeMap[line.AccountCode]) {
            return { ...line, AccountCode: codeMap[line.AccountCode] };
          }
          return line;
        }),
      };
    }
    console.log(`[Test SAP JE] All ${uniqueGLs.length} GL codes resolved successfully.`);

    console.log(`[Test SAP JE] Posting JE with ${finalPayload.JournalEntryLines?.length || 0} lines:`, JSON.stringify(finalPayload));

    const sapResponse = await sapHttpsClient.authenticatedRequest(sessionId, {
      method: 'POST',
      path: '/b1s/v1/JournalEntries',
      body: finalPayload,
      headers,
    });

    if (sapResponse.ok) {
      const responseData = JSON.parse(sapResponse.body);
      return res.json({
        success: true,
        message: 'Test JE posted successfully',
        sapDocEntry: responseData.DocEntry,
        sapJeNumber: String(responseData.Number || responseData.DocNum || responseData.DocEntry),
        response: responseData,
        usedPayload: finalPayload,
        discoveredAccounts: discoveredAccounts.map((a: any) => ({ code: a.Code, name: a.Name })),
      });
    } else {
      let errorMsg = `SAP posting failed (${sapResponse.statusCode})`;
      try {
        const errParsed = JSON.parse(sapResponse.body);
        errorMsg = errParsed?.error?.message?.value || errorMsg;
      } catch (_) {}
      return res.status(500).json({ error: errorMsg, rawResponse: sapResponse.body, usedPayload: finalPayload, discoveredAccounts: discoveredAccounts.map((a: any) => ({ code: a.Code, name: a.Name })) });
    }
  } catch (error: any) {
    console.error('Error in test SAP JE:', error);
    res.status(500).json({ error: error.message || 'Failed to post test JE to SAP' });
  }
});

router.patch('/payroll/records/:id/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.id);
    const currentUser = req.user as any;
    const { action, reason } = req.body;

    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, recordId));
    if (!record) return res.status(404).json({ error: 'Payroll record not found' });

    if (record.salarySource === 'manual_salary') {
      return res.status(400).json({ error: 'Manual salary records must be managed through the Manual Salary tab.' });
    }

    if (record.sapPostingStatus === 'posted') {
      return res.status(400).json({ error: 'This record has been transferred to SAP and is locked.' });
    }

    if (record.status === 'reversed' || record.reversalSapDocEntry) {
      return res.status(400).json({ error: 'This record has been reversed and is permanently locked.' });
    }

    if (record.status === 'voided') {
      return res.status(400).json({ error: 'This record has been voided. Voided records cannot be modified.' });
    }

    const rawStatus = record.status || 'generated';
    const currentStatus = rawStatus === 'draft' ? 'generated' : rawStatus;
    const history = Array.isArray(record.statusHistory) ? [...(record.statusHistory as any[])] : [];
    const now = new Date();
    const userName = currentUser.firstName && currentUser.lastName
      ? `${currentUser.firstName} ${currentUser.lastName}` : currentUser.username;

    let newStatus: string;
    const updateData: any = { updatedAt: now };

    switch (action) {
      case 'verify':
        if (currentStatus !== 'generated' && currentStatus !== 'held') {
          return res.status(400).json({ error: `Cannot verify a record in '${currentStatus}' status. Only 'Generated' or 'Held' records can be verified.` });
        }
        newStatus = 'verified';
        updateData.verifiedBy = currentUser.id;
        updateData.verifiedAt = now;
        updateData.heldReason = null;
        updateData.heldBy = null;
        updateData.heldAt = null;
        break;

      case 'hold':
        if (currentStatus !== 'generated' && currentStatus !== 'verified') {
          return res.status(400).json({ error: `Cannot hold a record in '${currentStatus}' status.` });
        }
        if (!reason || reason.trim() === '') {
          return res.status(400).json({ error: 'A reason is required when holding a record.' });
        }
        newStatus = 'held';
        updateData.heldReason = reason.trim();
        updateData.heldBy = currentUser.id;
        updateData.heldAt = now;
        updateData.verifiedBy = null;
        updateData.verifiedAt = null;
        break;

      case 'reject': {
        if (currentStatus !== 'generated' && currentStatus !== 'verified' && currentStatus !== 'held') {
          return res.status(400).json({ error: `Cannot reject a record in '${currentStatus}' status.` });
        }
        if (!reason || reason.trim() === '') {
          return res.status(400).json({ error: 'A reason is required when rejecting a record.' });
        }
        const rejectReversals = await reverseLinkedDeductions(recordId, record.userId, userName, currentUser.id, 'reject');
        newStatus = 'rejected';
        updateData.heldReason = reason.trim();
        updateData.heldBy = currentUser.id;
        updateData.heldAt = now;
        updateData.verifiedBy = null;
        updateData.verifiedAt = null;
        (updateData as any)._reversals = rejectReversals;
        break;
      }

      case 'reopen':
        if (currentStatus !== 'held' && currentStatus !== 'rejected') {
          return res.status(400).json({ error: `Cannot reopen a record in '${currentStatus}' status.` });
        }
        newStatus = 'generated';
        updateData.heldReason = null;
        updateData.heldBy = null;
        updateData.heldAt = null;
        updateData.verifiedBy = null;
        updateData.verifiedAt = null;
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    const reversals = (updateData as any)._reversals || [];
    delete (updateData as any)._reversals;

    history.push({
      from: currentStatus,
      to: newStatus,
      action,
      reason: reason || null,
      by: userName,
      byId: currentUser.id,
      at: now.toISOString(),
      ...(reversals.length > 0 ? { reversals } : {}),
    });

    updateData.status = newStatus;
    updateData.statusHistory = history;

    await db.update(payrollRecords).set(updateData).where(eq(payrollRecords.id, recordId));

    const reversalMsg = reversals.length > 0
      ? ` Reversed ${reversals.length} linked deduction(s): ${reversals.map((r: any) => `${r.reference} ₹${r.amount.toFixed(2)}`).join(', ')}.`
      : '';

    res.json({ success: true, status: newStatus, message: `Record ${action === 'verify' ? 'verified' : action === 'hold' ? 'held' : action === 'reject' ? 'rejected' : 'reopened'} successfully.${reversalMsg}` });
  } catch (error: any) {
    console.error('Error updating payroll record status:', error);
    res.status(500).json({ error: error.message || 'Failed to update record status' });
  }
});

/**
 * Post payroll salary JE to SAP B1
 */
router.post('/payroll/records/:id/post-sap', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.id);
    const currentUser = req.user as any;

    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, recordId));
    if (!record) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }

    if (record.salarySource === 'manual_salary') {
      return res.status(400).json({ error: 'Manual salary records must be posted through the Manual Salary tab.' });
    }

    if (record.sapPostingStatus === 'posted') {
      return res.status(400).json({ error: 'This salary record has already been posted to SAP', sapJeNumber: record.sapJeNumber, sapDocEntry: record.sapDocEntry });
    }

    if (record.status === 'reversed' || record.reversalSapDocEntry) {
      return res.status(400).json({ error: 'This record has been reversed and cannot be reposted to SAP.' });
    }

    if (record.status !== 'verified') {
      return res.status(400).json({ error: `Only verified records can be transferred to SAP. Current status: ${record.status || 'generated'}. Please verify the record first.` });
    }

    if (record.verificationStatus === 'failed') {
      return res.status(400).json({ error: 'This record has failed calculation verification. Fix and re-verify before posting to SAP.' });
    }
    if (record.verificationStatus === 'pending' || !record.verificationStatus) {
      return res.status(400).json({ error: 'This record has not been verified by the Payroll Calculation Verifier. Run verification before posting to SAP.' });
    }

    const [employee] = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      cardCode: users.cardCode,
      cardName: users.cardName,
      employeeCode: users.employeeCode,
    }).from(users).where(eq(users.id, record.userId));

    if (!employee) {
      return res.status(400).json({ error: 'Employee not found' });
    }

    const empName = employee.firstName && employee.lastName
      ? `${employee.firstName} ${employee.lastName}`
      : employee.username || 'Unknown';

    if (!employee.cardCode || employee.cardCode.trim() === '') {
      await db.update(payrollRecords).set({
        sapPostingStatus: 'failed',
        sapErrorMessage: `Employee ${empName} has no SAP BP code linked. Please assign a BP code before posting.`,
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, recordId));
      return res.status(400).json({ error: `Employee ${empName} has no SAP BP code linked. Please assign a BP code before posting.` });
    }

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));

    const REQUIRED_COMPONENTS = [
      { code: 'BASIC', context: 'expense' },
      { code: 'HRA', context: 'expense' },
      { code: 'CONVEYANCE', context: 'expense' },
      { code: 'LTA', context: 'expense' },
      { code: 'SPECIAL_ALLOWANCE', context: 'expense' },
      { code: 'SUPPLEMENTARY', context: 'expense' },
      { code: 'KGP', context: 'expense' },
      { code: 'BONUS', context: 'expense' },
      { code: 'OVERTIME', context: 'expense' },
      { code: 'OTHER_ALLOWANCES', context: 'expense' },
      { code: 'PF_EMPLOYEE', context: 'payroll_liability' },
      { code: 'ESIC_EMPLOYEE', context: 'payroll_liability' },
      { code: 'LOAN_DEDUCTION', context: 'payroll_liability' },
      { code: 'ADVANCE_DEDUCTION', context: 'payroll_liability' },
      { code: 'OTHER_DEDUCTIONS', context: 'payroll_liability' },
      { code: 'PT', context: 'payroll_liability' },
      { code: 'TDS', context: 'payroll_liability' },
      { code: 'NET_PAY', context: 'payroll_liability' },
    ];

    const missingMappings: string[] = [];
    const glMap = new Map<string, string>();

    for (const comp of REQUIRED_COMPONENTS) {
      const mapping = allMappings.find(
        m => m.componentCode === comp.code && m.postingContext === comp.context && m.glAccountCode && m.glAccountCode.trim() !== ''
      );
      if (!mapping) {
        missingMappings.push(`${comp.code} (${comp.context})`);
      } else {
        glMap.set(`${comp.code}|${comp.context}`, mapping.glAccountCode!);
      }
    }

    if (missingMappings.length > 0) {
      await db.update(payrollRecords).set({
        sapPostingStatus: 'failed',
        sapErrorMessage: `GL mappings missing for: ${missingMappings.join(', ')}`,
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, recordId));
      return res.status(400).json({ error: 'GL mappings incomplete', missingMappings });
    }

    const [period] = await db.select({ periodName: payrollPeriods.periodName, startDate: payrollPeriods.startDate })
      .from(payrollPeriods).where(eq(payrollPeriods.id, record.periodId));
    const periodLabel = period?.periodName || 'Unknown Period';

    const jeLines: any[] = [];
    let lineNum = 0;

    const earningComponents = [
      { code: 'BASIC', value: parseFloat(record.baseSalary || '0') },
      { code: 'HRA', value: parseFloat(record.hra || '0') },
      { code: 'CONVEYANCE', value: parseFloat(record.conveyanceAllowance || '0') },
      { code: 'LTA', value: parseFloat(record.ltaAllowance || '0') },
      { code: 'SPECIAL_ALLOWANCE', value: parseFloat(record.specialAllowance || '0') },
      { code: 'SUPPLEMENTARY', value: parseFloat(record.supplementaryAllowance || '0') },
      { code: 'KGP', value: parseFloat(record.kgpAllowance || '0') },
      { code: 'BONUS', value: parseFloat(record.bonus || '0') },
      { code: 'OVERTIME', value: parseFloat(record.overtimePay || '0') },
      { code: 'OTHER_ALLOWANCES', value: parseFloat(record.otherAllowances || '0') },
    ];

    for (const comp of earningComponents) {
      if (comp.value > 0) {
        jeLines.push({
          Line_ID: lineNum++,
          AccountCode: glMap.get(`${comp.code}|expense`),
          Debit: comp.value,
          Credit: 0,
          LineMemo: `${comp.code} - ${empName} - ${periodLabel}`,
        });
      }
    }

    const deductionComponents = [
      { code: 'PF_EMPLOYEE', value: parseFloat(record.employeePf || record.providentFund || '0') },
      { code: 'ESIC_EMPLOYEE', value: parseFloat(record.employeeEsic || record.esiDeduction || record.esic || '0') },
      { code: 'PT', value: parseFloat(record.professionalTax || '0') },
      { code: 'TDS', value: parseFloat(record.tdsAmount || record.incomeTax || '0') },
      { code: 'LOAN_DEDUCTION', value: parseFloat(record.loanDeductions || '0') },
      { code: 'ADVANCE_DEDUCTION', value: parseFloat(record.advanceDeductions || '0') },
      { code: 'OTHER_DEDUCTIONS', value: parseFloat(record.otherDeductions || '0') },
    ];

    for (const comp of deductionComponents) {
      if (comp.value > 0) {
        jeLines.push({
          Line_ID: lineNum++,
          AccountCode: glMap.get(`${comp.code}|payroll_liability`),
          Debit: 0,
          Credit: comp.value,
          LineMemo: `${comp.code} - ${empName} - ${periodLabel}`,
        });
      }
    }

    const netPayValue = parseFloat(record.netPay || '0');
    if (netPayValue > 0) {
      jeLines.push({
        Line_ID: lineNum++,
        AccountCode: glMap.get('NET_PAY|payroll_liability'),
        Debit: 0,
        Credit: netPayValue,
        LineMemo: `Net Pay - ${empName} - ${periodLabel}`,
      });
    }

    const postingDate = period?.startDate
      ? new Date(new Date(period.startDate).getFullYear(), new Date(period.startDate).getMonth() + 1, 0).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const jePayload = {
      ReferenceDate: postingDate,
      Memo: `Salary JE - ${empName} - ${periodLabel}`,
      Reference2: employee.cardCode,
      Reference3: '92B',
      U_Employee_Name: empName,
      U_TDS_Status: 'A',
      U_PF_Status: 'A',
      U_ESIC_Status: 'A',
      U_PT_Status: 'A',
      JournalEntryLines: jeLines,
    };

    await db.update(payrollRecords).set({
      sapPostingStatus: 'pending',
      sapErrorMessage: null,
      updatedAt: new Date(),
    }).where(eq(payrollRecords.id, recordId));

    const session = sapSessionManager.getSession(currentUser.id);
    if (!session) {
      try {
        const sapUrl = process.env.SAP_SERVICE_LAYER_URL || 'https://59.152.52.58:50000';
        const sapUser = process.env.SAP_USERNAME || '';
        const sapPass = process.env.SAP_PASSWORD || '';
        const sapDb = process.env.SAP_COMPANY_DB || '';

        if (!sapUser || !sapPass || !sapDb) {
          await db.update(payrollRecords).set({
            sapPostingStatus: 'failed',
            sapErrorMessage: 'SAP credentials not configured. Please set SAP_USERNAME, SAP_PASSWORD, and SAP_COMPANY_DB.',
            updatedAt: new Date(),
          }).where(eq(payrollRecords.id, recordId));
          return res.status(500).json({ error: 'SAP credentials not configured' });
        }

        const loginResult = await sapHttpsClient.login(sapUser, sapPass, sapDb);
        sapSessionManager.setSession(currentUser.id, { sessionId: loginResult.sessionId, routeId: undefined, userId: currentUser.id, createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60000) });

        const sapResponse = await sapHttpsClient.authenticatedRequest(loginResult.sessionId, {
          method: 'POST',
          path: '/b1s/v1/JournalEntries',
          body: jePayload,
        });

        if (sapResponse.ok) {
          const responseData = JSON.parse(sapResponse.body);
          await db.update(payrollRecords).set({
            sapDocEntry: responseData.DocEntry,
            sapJeNumber: String(responseData.Number || responseData.DocNum || responseData.DocEntry),
            sapPostedAt: new Date(),
            sapPostingStatus: 'posted',
            status: 'transferred',
            sapErrorMessage: null,
            updatedAt: new Date(),
          }).where(eq(payrollRecords.id, recordId));

          return res.json({
            success: true,
            message: `Salary JE posted to SAP successfully`,
            sapDocEntry: responseData.DocEntry,
            sapJeNumber: String(responseData.Number || responseData.DocNum || responseData.DocEntry),
          });
        } else {
          const errorBody = sapResponse.body;
          let errorMsg = `SAP posting failed (${sapResponse.statusCode})`;
          try {
            const errParsed = JSON.parse(errorBody);
            errorMsg = errParsed?.error?.message?.value || errorMsg;
          } catch (_) {}

          await db.update(payrollRecords).set({
            sapPostingStatus: 'failed',
            sapErrorMessage: errorMsg,
            updatedAt: new Date(),
          }).where(eq(payrollRecords.id, recordId));

          return res.status(500).json({ error: errorMsg });
        }
      } catch (sapErr: any) {
        const errorMsg = `SAP connection error: ${sapErr.message}`;
        await db.update(payrollRecords).set({
          sapPostingStatus: 'failed',
          sapErrorMessage: errorMsg,
          updatedAt: new Date(),
        }).where(eq(payrollRecords.id, recordId));
        return res.status(500).json({ error: errorMsg });
      }
    } else {
      try {
        const sapResponse = await sapHttpsClient.authenticatedRequest(session.sessionId, {
          method: 'POST',
          path: '/b1s/v1/JournalEntries',
          body: jePayload,
        });

        if (sapResponse.ok) {
          const responseData = JSON.parse(sapResponse.body);
          await db.update(payrollRecords).set({
            sapDocEntry: responseData.DocEntry,
            sapJeNumber: String(responseData.Number || responseData.DocNum || responseData.DocEntry),
            sapPostedAt: new Date(),
            sapPostingStatus: 'posted',
            status: 'transferred',
            sapErrorMessage: null,
            updatedAt: new Date(),
          }).where(eq(payrollRecords.id, recordId));

          return res.json({
            success: true,
            message: `Salary JE posted to SAP successfully`,
            sapDocEntry: responseData.DocEntry,
            sapJeNumber: String(responseData.Number || responseData.DocNum || responseData.DocEntry),
          });
        } else {
          const errorBody = sapResponse.body;
          let errorMsg = `SAP posting failed (${sapResponse.statusCode})`;
          try {
            const errParsed = JSON.parse(errorBody);
            errorMsg = errParsed?.error?.message?.value || errorMsg;
          } catch (_) {}

          await db.update(payrollRecords).set({
            sapPostingStatus: 'failed',
            sapErrorMessage: errorMsg,
            updatedAt: new Date(),
          }).where(eq(payrollRecords.id, recordId));

          return res.status(500).json({ error: errorMsg });
        }
      } catch (sapErr: any) {
        const errorMsg = `SAP connection error: ${sapErr.message}`;
        await db.update(payrollRecords).set({
          sapPostingStatus: 'failed',
          sapErrorMessage: errorMsg,
          updatedAt: new Date(),
        }).where(eq(payrollRecords.id, recordId));
        return res.status(500).json({ error: errorMsg });
      }
    }
  } catch (error: any) {
    console.error('Error posting salary JE to SAP:', error);
    res.status(500).json({ error: error.message || 'Failed to post salary JE to SAP' });
  }
});

router.post('/payroll/records/:id/reverse-sap', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.id);
    const currentUser = req.user as any;

    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, recordId));
    if (!record) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }

    if (record.salarySource === 'manual_salary') {
      return res.status(400).json({ error: 'Manual salary records must be reversed through the Manual Salary tab.' });
    }

    if (record.sapPostingStatus !== 'posted') {
      return res.status(400).json({ error: 'Only SAP-posted records can be reversed.' });
    }

    if (record.reversalSapDocEntry) {
      return res.status(400).json({ error: 'This record has already been reversed.', reversalJeNumber: record.reversalSapJeNumber });
    }

    const [employee] = await db.select({
      id: users.id, firstName: users.firstName, lastName: users.lastName,
      username: users.username, cardCode: users.cardCode, employeeCode: users.employeeCode,
    }).from(users).where(eq(users.id, record.userId));

    if (!employee) return res.status(400).json({ error: 'Employee not found' });

    const empName = employee.firstName && employee.lastName
      ? `${employee.firstName} ${employee.lastName}` : employee.username || 'Unknown';

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));
    const glMap = new Map<string, string>();
    for (const m of allMappings) {
      if (m.componentCode && m.postingContext && m.glAccountCode && m.glAccountCode.trim() !== '') {
        glMap.set(`${m.componentCode}|${m.postingContext}`, m.glAccountCode);
      }
    }

    const [period] = await db.select({ periodName: payrollPeriods.periodName, startDate: payrollPeriods.startDate })
      .from(payrollPeriods).where(eq(payrollPeriods.id, record.periodId));
    const periodLabel = period?.periodName || 'Unknown Period';

    const jeLines: any[] = [];
    let lineNum = 0;

    const earningComponents = [
      { code: 'BASIC', value: parseFloat(record.baseSalary || '0') },
      { code: 'HRA', value: parseFloat(record.hra || '0') },
      { code: 'CONVEYANCE', value: parseFloat(record.conveyanceAllowance || '0') },
      { code: 'LTA', value: parseFloat(record.ltaAllowance || '0') },
      { code: 'SPECIAL_ALLOWANCE', value: parseFloat(record.specialAllowance || '0') },
      { code: 'SUPPLEMENTARY', value: parseFloat(record.supplementaryAllowance || '0') },
      { code: 'KGP', value: parseFloat(record.kgpAllowance || '0') },
      { code: 'BONUS', value: parseFloat(record.bonus || '0') },
      { code: 'OVERTIME', value: parseFloat(record.overtimePay || '0') },
      { code: 'OTHER_ALLOWANCES', value: parseFloat(record.otherAllowances || '0') },
    ];

    for (const comp of earningComponents) {
      if (comp.value > 0) {
        const acctCode = glMap.get(`${comp.code}|expense`);
        if (acctCode) {
          jeLines.push({
            Line_ID: lineNum++,
            AccountCode: acctCode,
            Debit: 0,
            Credit: comp.value,
            LineMemo: `REVERSAL - ${comp.code} - ${empName} - ${periodLabel}`,
          });
        }
      }
    }

    const deductionComponents = [
      { code: 'PF_EMPLOYEE', value: parseFloat(record.employeePf || record.providentFund || '0') },
      { code: 'ESIC_EMPLOYEE', value: parseFloat(record.employeeEsic || record.esiDeduction || record.esic || '0') },
      { code: 'PT', value: parseFloat(record.professionalTax || '0') },
      { code: 'TDS', value: parseFloat(record.tdsAmount || record.incomeTax || '0') },
      { code: 'LOAN_DEDUCTION', value: parseFloat(record.loanDeductions || '0') },
      { code: 'ADVANCE_DEDUCTION', value: parseFloat(record.advanceDeductions || '0') },
      { code: 'OTHER_DEDUCTIONS', value: parseFloat(record.otherDeductions || '0') },
    ];

    for (const comp of deductionComponents) {
      if (comp.value > 0) {
        const acctCode = glMap.get(`${comp.code}|payroll_liability`);
        if (acctCode) {
          jeLines.push({
            Line_ID: lineNum++,
            AccountCode: acctCode,
            Debit: comp.value,
            Credit: 0,
            LineMemo: `REVERSAL - ${comp.code} - ${empName} - ${periodLabel}`,
          });
        }
      }
    }

    const netPayValue = parseFloat(record.netPay || '0');
    if (netPayValue > 0) {
      const acctCode = glMap.get('NET_PAY|payroll_liability');
      if (acctCode) {
        jeLines.push({
          Line_ID: lineNum++,
          AccountCode: acctCode,
          Debit: netPayValue,
          Credit: 0,
          LineMemo: `REVERSAL - Net Pay - ${empName} - ${periodLabel}`,
        });
      }
    }

    if (jeLines.length === 0) {
      return res.status(400).json({ error: 'No JE lines could be built for reversal. GL mappings may be missing.' });
    }

    const postingDate = new Date().toISOString().split('T')[0];
    const originalJeRef = record.sapJeNumber || String(record.sapDocEntry);

    const jePayload = {
      ReferenceDate: postingDate,
      Memo: `REVERSAL - Salary JE #${originalJeRef} - ${empName} - ${periodLabel}`,
      Reference2: employee.cardCode || '',
      Reference3: `REV-SAL-${originalJeRef}`,
      U_Employee_Name: empName,
      JournalEntryLines: jeLines,
    };

    const sapUrl = process.env.SAP_SERVICE_LAYER_URL || 'https://59.152.52.58:50000';
    const sapUser = process.env.SAP_USERNAME || '';
    const sapPass = process.env.SAP_PASSWORD || '';
    const sapDb = process.env.SAP_COMPANY_DB || '';

    if (!sapUser || !sapPass || !sapDb) {
      return res.status(500).json({ error: 'SAP credentials not configured' });
    }

    let sessionId: string;
    const existingSession = sapSessionManager.getSession(currentUser.id);
    if (existingSession) {
      sessionId = existingSession.sessionId;
    } else {
      const loginResult = await sapHttpsClient.login(sapUser, sapPass, sapDb);
      sapSessionManager.setSession(currentUser.id, {
        sessionId: loginResult.sessionId, routeId: undefined,
        userId: currentUser.id, createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60000),
      });
      sessionId = loginResult.sessionId;
    }

    const sapResponse = await sapHttpsClient.authenticatedRequest(sessionId, {
      method: 'POST',
      path: '/b1s/v1/JournalEntries',
      body: jePayload,
    });

    const userName = currentUser.firstName && currentUser.lastName
      ? `${currentUser.firstName} ${currentUser.lastName}` : currentUser.username;

    if (sapResponse.ok) {
      const responseData = JSON.parse(sapResponse.body);
      const reversalDocEntry = responseData.DocEntry;
      const reversalJeNumber = String(responseData.Number || responseData.DocNum || responseData.DocEntry);

      const history = Array.isArray(record.statusHistory) ? [...(record.statusHistory as any[])] : [];
      history.push({
        from: record.status || 'transferred',
        to: 'reversed',
        action: 'reverse',
        reason: `Reversal JE #${reversalJeNumber} posted to SAP`,
        by: userName,
        byId: currentUser.id,
        at: new Date().toISOString(),
      });

      await db.update(payrollRecords).set({
        status: 'reversed',
        reversalSapDocEntry: reversalDocEntry,
        reversalSapJeNumber: reversalJeNumber,
        reversalSapPostedAt: new Date(),
        reversedBy: currentUser.id,
        reversedAt: new Date(),
        reversalMemo: `REVERSAL of Salary JE #${originalJeRef} - ${empName} - ${periodLabel}`,
        statusHistory: history,
        updatedAt: new Date(),
      }).where(eq(payrollRecords.id, recordId));

      return res.json({
        success: true,
        message: `Reversal JE posted successfully`,
        originalJeNumber: record.sapJeNumber,
        originalDocEntry: record.sapDocEntry,
        reversalDocEntry,
        reversalJeNumber,
      });
    } else {
      let errorMsg = `SAP reversal failed (${sapResponse.statusCode})`;
      try {
        const errParsed = JSON.parse(sapResponse.body);
        errorMsg = errParsed?.error?.message?.value || errorMsg;
      } catch (_) {}
      return res.status(500).json({ error: errorMsg });
    }
  } catch (error: any) {
    console.error('Error posting reversal salary JE to SAP:', error);
    res.status(500).json({ error: error.message || 'Failed to post reversal JE to SAP' });
  }
});

/**
 * Generate salary for an employee
 */
router.post('/generate-salary', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { employeeId, month, year } = req.body;
    
    if (!employeeId || !month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: employeeId, month, year'
      });
    }
    
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ success: false, error: 'Month must be between 1 and 12' });
    }
    
    if (yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({ success: false, error: 'Year must be between 2000 and 2100' });
    }
    
    const userId = parseInt(employeeId);
    console.log(`💰 Generating salary for employee ${userId}, ${monthNum}/${yearNum}`);
    
    const result = await salaryCalculationEngine.calculateSalary({
      userId,
      month: monthNum,
      year: yearNum,
      updateLeaveBalances: true
    });
    
    const periodName = `${new Date(yearNum, monthNum - 1).toLocaleString('en-US', { month: 'long' })} ${yearNum}`;
    const [period] = await db
      .select()
      .from(payrollPeriods)
      .where(eq(payrollPeriods.periodName, periodName))
      .limit(1);
    
    if (!period) {
      return res.status(400).json({
        success: false,
        error: `Payroll period "${periodName}" not found. Please create it first.`
      });
    }

    const existingRecord = await db
      .select({ id: payrollRecords.id })
      .from(payrollRecords)
      .where(and(
        eq(payrollRecords.userId, userId),
        eq(payrollRecords.periodId, period.id)
      ))
      .limit(1);

    if (existingRecord.length > 0) {
      await db
        .delete(payrollRecords)
        .where(eq(payrollRecords.id, existingRecord[0].id));
      console.log(`🔄 Deleted existing payroll record ${existingRecord[0].id} for regeneration`);
    }
    
    const [employee] = await db
      .select({ salaryType: users.salaryType, userType: users.userType })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    const salaryType = result.salaryType || employee?.salaryType || 'monthly';
    const workerType = employee?.userType === 'non_system_user' ? 'non_system' : 'system';
    const lopDays = result.autoAppliedLeaves?.lopDays || 0;

    const snapshot = {
      salaryType,
      dailyRate: salaryType === 'daily' ? result.basicSalary : null,
      presentDays: result.presentDays,
      paidDays: result.paidDays,
      lopDays,
      workingDays: result.workingDays,
      absentDays: result.absentDays,
      leaveDays: result.leaveDays,
      holidayDays: result.holidayDays,
      autoAppliedLeaves: result.autoAppliedLeaves,
      earnings: {
        basicSalary: result.basicSalary,
        grossBasic: result.grossBasic,
        hra: result.houseRentAllowance,
        conveyance: result.conveyanceAllowance,
        lta: result.ltaAllowance,
        special: result.specialAllowance,
        supplementary: result.supplementaryAllowance,
        kgp: result.kgpAllowance,
        bonus: result.bonus,
        overtimePay: result.overtimePay,
      },
      deductions: {
        employeePF: result.employeePF,
        employeeESIC: result.employeeESIC,
        professionalTax: result.professionalTax,
        loanDeduction: result.loanDeduction,
        advanceDeduction: result.advanceDeduction,
        otherDeductions: result.otherDeductions,
        employerPF: result.employerPF,
        employerESIC: result.employerESIC,
        gratuity: result.gratuity,
        groupInsurance: result.totalEmployerContributions - result.employerPF - result.employerESIC - result.gratuity,
      },
    };

    const [savedRecord] = await db
      .insert(payrollRecords)
      .values({
        periodId: period.id,
        userId,
        baseSalary: String(result.grossBasic),
        grossPay: String(result.grossEarnings),
        netPay: String(result.netPay),
        totalDeductions: String(result.totalDeductions),
        hra: String(result.houseRentAllowance),
        conveyanceAllowance: String(result.conveyanceAllowance),
        ltaAllowance: String(result.ltaAllowance),
        specialAllowance: String(result.specialAllowance),
        supplementaryAllowance: String(result.supplementaryAllowance),
        kgpAllowance: String(result.kgpAllowance),
        bonus: String(result.bonus),
        overtimePay: String(result.overtimePay),
        providentFund: String(result.employeePF),
        professionalTax: String(result.professionalTax),
        employeePf: String(result.employeePF),
        employeeEsic: String(result.employeeESIC),
        employerPf: String(result.employerPF),
        employerEsic: String(result.employerESIC),
        gratuity: String(result.gratuity),
        esic: String(result.employeeESIC),
        loanDeductions: String(result.loanDeduction),
        advanceDeductions: String(result.advanceDeduction),
        otherDeductions: String(result.otherDeductions),
        workingDays: result.workingDays,
        paidDays: String(result.paidDays),
        lopDays: String(lopDays),
        presentDays: String(result.presentDays),
        paidLeaveDays: String(result.leaveDays),
        unpaidLeaveDays: String(lopDays),
        calculationSnapshot: snapshot,
        status: 'generated',
        salarySource: 'generate_salary',
        workerType,
      })
      .returning({ id: payrollRecords.id });
    
    console.log(`✅ Payroll record ${savedRecord.id} saved for ${result.employeeName} (${salaryType})`);
    
    res.json({
      success: true,
      message: 'Salary generated and saved successfully',
      data: { ...result, payrollRecordId: savedRecord.id }
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

    const releaseCheck = await verifyPayslipRelease(parseInt(payrollRecordId));
    if (!releaseCheck.allowed) {
      return res.status(403).json({
        error: 'Payslip generation blocked',
        reason: releaseCheck.reason,
        verificationStatus: releaseCheck.verificationStatus,
      });
    }

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
        employeePf: payrollRecords.employeePf,
        employeeEsic: payrollRecords.employeeEsic,
        employerPf: payrollRecords.employerPf,
        employerEsic: payrollRecords.employerEsic,
        gratuity: payrollRecords.gratuity,
        calculationSnapshot: payrollRecords.calculationSnapshot,
        presentDays: payrollRecords.presentDays,
        paidDays: payrollRecords.paidDays,
        lopDays: payrollRecords.lopDays,
        workingDays: payrollRecords.workingDays,
        totalDeductions: payrollRecords.totalDeductions,
        loanDeductions: payrollRecords.loanDeductions,
        advanceDeductions: payrollRecords.advanceDeductions,
        createdAt: payrollRecords.createdAt,
        
        // Employee details
        employeeName: users.username,
        employeeCode: users.employeeCode,
        firstName: users.firstName,
        lastName: users.lastName,
        jobTitle: users.jobTitle,
        userRole: users.role,
        department: users.department,
        panNumber: users.panNumber,
        dateOfJoining: users.dateOfJoining,
        userSalaryType: users.salaryType,
        
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

    const workingDays = parseInt((record as any).workingDays?.toString() || '26');

    const employeeFullName = record.firstName && record.lastName 
      ? `${record.firstName} ${record.lastName}` 
      : record.employeeName;

    const calcSnap = (record as any).calculationSnapshot || {};
    const deductions = calcSnap.deductions || {};
    const salaryType = calcSnap.salaryType || (record as any).userSalaryType || 'monthly';
    const salaryBasis = salaryType === 'daily' ? 'actual_days' : 30;

    const employerPf = parseFloat((record as any).employerPf?.toString() || deductions.employerPF?.toString() || '0');
    const employerEsic = parseFloat((record as any).employerEsic?.toString() || deductions.employerESIC?.toString() || '0');
    const gratuity = parseFloat((record as any).gratuity?.toString() || deductions.gratuity?.toString() || '0');
    const groupInsuranceVal = parseFloat(record.groupInsurance?.toString() || deductions.groupInsurance?.toString() || '0');
    const bonus = parseFloat(record.bonus?.toString() || '0');
    const kgpAllowance = parseFloat(record.kgpAllowance?.toString() || '0');

    const basicComp = parseFloat(record.baseSalary?.toString() || '0');
    const hraComp = parseFloat(record.hra?.toString() || '0');
    const convComp = parseFloat(record.conveyanceAllowance?.toString() || '0');
    const ltaComp = parseFloat(record.ltaAllowance?.toString() || '0');
    const specComp = parseFloat(record.specialAllowance?.toString() || '0');
    const suppComp = parseFloat(record.supplementaryAllowance?.toString() || '0');
    const kgpComp = parseFloat(record.kgpAllowance?.toString() || '0');
    const otComp = parseFloat(record.overtimePay?.toString() || '0');
    const otherAllowComp = parseFloat(record.otherAllowances?.toString() || '0');
    const grossPay = basicComp + hraComp + convComp + ltaComp + specComp + suppComp + kgpComp + otComp + otherAllowComp;

    const ctcMonthly = grossPay + employerPf + employerEsic + gratuity + groupInsuranceVal + bonus;
    const ctcYearly = ctcMonthly * 12;

    const [empUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, record.userId)).limit(1);
    const kgpPercent = kgpAllowance > 0 && ['Manager', 'Employee'].includes(empUser?.role || '') ? 15 : 0;

    const snap = await db
      .select()
      .from(payrollAttendanceSnapshot)
      .where(
        and(
          eq(payrollAttendanceSnapshot.periodId, record.periodId),
          eq(payrollAttendanceSnapshot.userId, record.userId)
        )
      )
      .orderBy(desc(payrollAttendanceSnapshot.runNumber))
      .limit(1);

    const attSnap = snap[0];
    const paidDays = attSnap
      ? parseFloat(attSnap.paidDays?.toString() || '30')
      : parseFloat((record as any).paidDays?.toString() || '30');
    const presentDays = attSnap ? parseFloat(attSnap.presentDays?.toString() || '0') : parseFloat((record as any).presentDays?.toString() || paidDays.toString());
    const lopDays = attSnap ? parseFloat(attSnap.lopDays?.toString() || '0') : parseFloat((record as any).lopDays?.toString() || '0');
    const absentDays = attSnap ? parseFloat(attSnap.absentDays?.toString() || '0') : lopDays;
    const weeklyOffs = attSnap ? (attSnap.weeklyOffs || 0) : 0;
    const holidays = attSnap ? (attSnap.holidays || 0) : 0;

    const employeePfVal = Math.round(parseFloat(record.providentFund?.toString() || '0'));
    const ptVal = Math.round(parseFloat(record.professionalTax?.toString() || '0'));
    const esicVal = Math.round(parseFloat(record.esic?.toString() || '0'));
    const tdsVal = Math.round(parseFloat(record.incomeTax?.toString() || '0'));
    const otherDeductionsVal = Math.round(parseFloat(record.otherDeductions?.toString() || '0'));
    const loanDeductionVal = Math.round(parseFloat(record.loanDeductions?.toString() || '0'));
    const advanceDeductionVal = Math.round(parseFloat(record.advanceDeductions?.toString() || '0'));
    const actualTotalDeductions = employeePfVal + ptVal + esicVal + tdsVal + otherDeductionsVal + loanDeductionVal + advanceDeductionVal;
    const actualNetPay = Math.round(grossPay) - actualTotalDeductions;

    const salarySlipData = {
      employee: {
        name: employeeFullName,
        employeeCode: record.employeeCode || 'N/A',
        designation: (record as any).userRole || 'N/A',
        department: record.department || 'N/A',
        joiningDate: (record as any).dateOfJoining || 'N/A',
        panNumber: (record as any).panNumber || 'N/A',
      },
      company: {
        name: 'THERMOPAC',
        address: 'L 4, 405 The Summit Business Bay, Vile Parle Western Express Highway Vile Parle Mumbai India 400 057'
      },
      period: {
        month: (() => {
          const pn = record.periodName || '';
          const yr = new Date(record.startDate).getFullYear();
          if (pn && pn.includes(yr.toString())) {
            return pn.replace(` ${yr}`, '').replace(`${yr}`, '');
          }
          return pn || new Date(record.startDate).toLocaleDateString('en-US', { month: 'long' });
        })(),
        year: new Date(record.startDate).getFullYear(),
        workingDays,
        paidDays,
        salaryBasis,
        salaryType,
        holidays,
        weeklyOffs,
        absentDays,
        presentDays,
        paidLeaveDays: attSnap ? parseFloat(attSnap.paidLeaveDays?.toString() || '0') : parseFloat((record as any).paidLeaveDays?.toString() || '0'),
        unpaidLeaveDays: attSnap ? parseFloat(attSnap.unpaidLeaveDays?.toString() || '0') : parseFloat((record as any).unpaidLeaveDays?.toString() || '0'),
        lopDays,
      },
      earnings: {
        basicSalary: Math.round(parseFloat(record.baseSalary?.toString() || '0')),
        hra: Math.round(parseFloat(record.hra?.toString() || '0')),
        conveyanceAllowance: Math.round(parseFloat(record.conveyanceAllowance?.toString() || '0')),
        ltaAllowance: Math.round(parseFloat(record.ltaAllowance?.toString() || '0')),
        specialAllowance: Math.round(parseFloat(record.specialAllowance?.toString() || '0')),
        supplementaryAllowance: Math.round(parseFloat(record.supplementaryAllowance?.toString() || '0')),
        kgpAllowance: Math.round(kgpAllowance),
        overtimePay: Math.round(parseFloat(record.overtimePay?.toString() || '0')),
        bonus: Math.round(bonus),
        otherAllowances: Math.round(parseFloat(record.otherAllowances?.toString() || '0'))
      },
      deductions: {
        providentFund: employeePfVal,
        professionalTax: ptVal,
        incomeTax: tdsVal,
        esic: esicVal,
        groupInsurance: 0,
        otherDeductions: otherDeductionsVal,
        loanDeduction: Math.round(parseFloat(record.loanDeductions?.toString() || '0')),
        advanceDeduction: Math.round(parseFloat(record.advanceDeductions?.toString() || '0')),
      },
      employerCosts: {
        esicEmployer: Math.round(employerEsic),
        groupInsurance: Math.round(groupInsuranceVal),
        pfEmployer: Math.round(employerPf),
        gratuity: Math.round(gratuity),
      },
      totals: {
        grossEarnings: Math.round(grossPay),
        totalDeductions: actualTotalDeductions,
        netPay: actualNetPay,
        ctcMonthly: Math.round(ctcMonthly),
        ctcYearly: Math.round(ctcMonthly) * 12,
      },
      kgpPercent,
      netPayInWords: numberToWords(Math.round(actualNetPay)),
      leaveBalances: [] as { leaveType: string; opening: number; used: number; closing: number }[],
    };

    const periodYear = new Date(record.startDate).getFullYear();
    const activeLeaveTypes = await db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true));
    const empLeaveBalances = await db.select().from(leaveBalances)
      .where(and(eq(leaveBalances.userId, record.userId), eq(leaveBalances.year, periodYear)));

    const balanceMap = new Map(empLeaveBalances.map(b => [b.leaveTypeId, b]));

    for (const lt of activeLeaveTypes) {
      if (['ML', 'PL', 'BL', 'ST'].includes(lt.code)) continue;
      const bal = balanceMap.get(lt.id);
      if (!bal) continue;
      const allocated = parseFloat(bal.allocatedDays?.toString() || '0');
      const carryover = parseFloat(bal.carryoverDays?.toString() || '0');
      const opening = allocated + carryover;
      const used = parseFloat(bal.usedDays?.toString() || '0');
      const closing = Math.max(0, opening - used);
      if (opening === 0 && used === 0) continue;
      salarySlipData.leaveBalances!.push({ leaveType: lt.code, opening, used, closing });
    }

    const generator = new SalarySlipGenerator();
    await generator.generateSalarySlip(salarySlipData, res);

  } catch (error) {
    console.error('Error generating salary slip:', error);
    res.status(500).json({ error: 'Failed to generate salary slip' });
  }
});

export default router;