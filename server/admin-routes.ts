import { sendError, sendValidationError, sendNotFound, sendPermissionError, sendBusinessError } from './utils/error-response';
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
  payrollAttendanceSnapshot,
  attendanceOverrideLog,
  salaryIncrementProposals,
  salaryIncrementAuditLog,
  notifications,
  appraisalCycles,
  employeeAppraisals,
  payrollSettings
} from '../shared/schema';
import { eq, and, desc, asc, gte, lte, sql, count, isNotNull, ne, inArray, notInArray, or } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { ensureAuthenticated } from './auth-middleware';
import { requireReauth, checkReauth } from './middleware/require-reauth';
import { salaryCalculationEngine } from './salary-calculation-engine';
import { SalarySlipGenerator, numberToWords } from './salary-slip-generator';
import { applySalaryIncrement, autoApplyDueIncrements } from './salary-increment-service';
import { verifyPayslipRelease } from './payroll-calculation-verifier';
import { glAccountMappings } from '../shared/schema';
import { sapSession } from './sap-b1-integration/sap-central-session';
import {
  adminCreateLeave,
  adminApproveLeave,
  adminRejectLeave,
  revokeApprovedLeave,
  grantLwpExemption,
  revokeLwpExemption,
} from './leave-service';

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
function getAttendanceStatus(timeIn: string, timeOut: string | null, halfDayMinHours: number = 4, lateThresholdMinutes: number = 15, dutyTimeIn: string = '09:00', fullDayMinHours: number = 8): string {
  const checkInTime = new Date(timeIn);
  const startOfDay = new Date(checkInTime);
  const [dutyHour, dutyMin] = dutyTimeIn.split(':').map(Number);
  startOfDay.setHours(dutyHour, dutyMin + lateThresholdMinutes, 0, 0);
  
  if (!timeOut) {
    return checkInTime > startOfDay ? 'Late' : 'Present';
  }
  
  const workHours = calculateWorkHours(timeIn, timeOut);
  if (!workHours) return 'Present';
  
  if (workHours < halfDayMinHours) return 'Absent';
  if (workHours < fullDayMinHours) return 'Half Day';
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
        halfDayMinimumHours: users.halfDayMinimumHours,
        weeklyOffDays: users.weeklyOffDays,
        salaryType: users.salaryType,
        otApplicable: users.otApplicable,
        loanCardCode: users.loanCardCode,
        loanCardName: users.loanCardName,
        employeeType: users.employeeType
      })
      .from(users)
      .orderBy(asc(users.firstName));

    res.json(allUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    sendError(res, error);
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
    sendError(res, error);
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
      workLocationId,
      employeeType
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
        employeeType: employeeType || 'PERMANENT',
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
    sendError(res, error);
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

    // Conditional re-auth checks based on sensitive fields in payload
    if (updateData.role !== undefined) {
      if (!await checkReauth(req, res, 'user.change_role')) return;
    } else if (
      updateData.bankAccountNumber !== undefined ||
      updateData.ifscCode !== undefined ||
      updateData.bankName !== undefined ||
      updateData.bank_account_number !== undefined ||
      updateData.ifsc_code !== undefined ||
      updateData.bank_name !== undefined
    ) {
      if (!await checkReauth(req, res, 'salary.update_bank_details')) return;
    } else if (
      updateData.basicSalary !== undefined ||
      updateData.monthlySalary !== undefined ||
      updateData.salaryType !== undefined ||
      updateData.basic_salary !== undefined ||
      updateData.monthly_salary !== undefined ||
      updateData.salary_type !== undefined
    ) {
      if (!await checkReauth(req, res, 'salary.update_base')) return;
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

    // Validate field types before database update
    console.log('Updating user with fields:', Object.keys(updateData).join(', '));

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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
  }
});

/**
 * GET /payroll/manual-increment-eligible
 * Returns employees with an active salary record but NO appraisal in the current active cycle.
 * Used to populate the "New Manual Increment" dialog dropdown.
 */
router.get('/payroll/manual-increment-eligible', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Find the current active (or most recent) appraisal cycle
    const [activeCycle] = await db
      .select({ id: appraisalCycles.id, financialYear: appraisalCycles.financialYear })
      .from(appraisalCycles)
      .where(eq(appraisalCycles.status, 'active'))
      .orderBy(desc(appraisalCycles.id))
      .limit(1);

    // Get employee IDs that have a COMPLETED (approved) appraisal in the current active cycle
    // Open / in-progress appraisals do NOT disqualify — those employees may still need a manual increment
    const approvedEmployeeIds: number[] = [];
    if (activeCycle) {
      const approvedAppraisals = await db
        .select({ employeeId: employeeAppraisals.employeeId })
        .from(employeeAppraisals)
        .where(
          and(
            eq(employeeAppraisals.cycleId, activeCycle.id),
            eq(employeeAppraisals.status, 'approved')
          )
        );
      approvedEmployeeIds.push(...approvedAppraisals.map(a => a.employeeId));
    }

    // Also exclude employees who already have ANY increment proposal created on or after
    // the active cycle's start date (covers pending, approved, AND applied statuses)
    const cycleStartDate = activeCycle
      ? (await db
          .select({ startDate: appraisalCycles.startDate })
          .from(appraisalCycles)
          .where(eq(appraisalCycles.id, activeCycle.id))
          .limit(1)
        )[0]?.startDate
      : null;

    const activeProposalEmployeeIds = (await db
      .select({ employeeId: salaryIncrementProposals.employeeId })
      .from(salaryIncrementProposals)
      .where(
        cycleStartDate
          ? gte(salaryIncrementProposals.proposedAt, new Date(cycleStartDate))
          : or(
              eq(salaryIncrementProposals.status, 'pending'),
              eq(salaryIncrementProposals.status, 'approved')
            )
      )
    ).map(p => p.employeeId);

    const excludedIds = [...new Set([...approvedEmployeeIds, ...activeProposalEmployeeIds])];

    // Fetch all active salary configs for active users, excluding disqualified employees
    const query = db
      .select({
        id: employeeSalaries.id,
        userId: employeeSalaries.userId,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        basicSalary: employeeSalaries.basicSalary,
        ctcMonthly: employeeSalaries.ctcMonthly,
        salaryType: employeeSalaries.salaryType,
      })
      .from(employeeSalaries)
      .innerJoin(users, eq(employeeSalaries.userId, users.id))
      .where(
        and(
          eq(employeeSalaries.isActive, true),
          eq(users.isActive, true),
          excludedIds.length > 0
            ? notInArray(employeeSalaries.userId, excludedIds)
            : undefined
        )
      )
      .orderBy(asc(users.firstName));

    const results = await query;
    res.json({ cycle: activeCycle || null, employees: results });
  } catch (error) {
    console.error('Error fetching manual increment eligible employees:', error);
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
  }
});

// ── Salary Increment routes ─────────────────────────────────────────────────

// ── POST /payroll/salary-setup/:id/increment — Propose increment ─────────────
router.post('/payroll/salary-setup/:id/increment', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const salaryConfigId = parseInt(req.params.id);
    if (isNaN(salaryConfigId)) return res.status(400).json({ error: 'Invalid salary config ID' });

    const user = (req as any).user;

    // Permission: Superuser, Administration-dept Manager, or Vishal (named exception)
    const canPropose =
      user.role === 'Superuser' ||
      (user.department === 'Administration' && user.role === 'Manager') ||
      user.username === 'Vishal';
    if (!canPropose) {
      return res.status(403).json({ error: 'You do not have permission to submit salary increment proposals' });
    }

    const { incrementPercentage, effectiveDate, remarks } = req.body;

    const pct = parseFloat(incrementPercentage);
    if (isNaN(pct) || pct < -10 || pct > 40) {
      return res.status(400).json({ error: 'Increment percentage must be between -10 and 40' });
    }
    if (!effectiveDate) {
      return res.status(400).json({ error: 'effectiveDate is required' });
    }

    const [salaryConfig] = await db
      .select()
      .from(employeeSalaries)
      .where(and(eq(employeeSalaries.id, salaryConfigId), eq(employeeSalaries.isActive, true)));

    if (!salaryConfig) return res.status(404).json({ error: 'Salary configuration not found' });

    // Only one active proposal allowed
    const [activeProposal] = await db
      .select({ id: salaryIncrementProposals.id, status: salaryIncrementProposals.status })
      .from(salaryIncrementProposals)
      .where(and(
        eq(salaryIncrementProposals.employeeSalaryId, salaryConfigId),
        or(
          eq(salaryIncrementProposals.status, 'pending'),
          eq(salaryIncrementProposals.status, 'approved')
        )
      ));

    if (activeProposal) {
      return res.status(409).json({
        error: `An active proposal (status: ${activeProposal.status}) already exists for this salary configuration. Approve, reject, or wait for it to be applied before creating a new one.`
      });
    }

    const oldBasic = parseFloat(salaryConfig.basicSalary as string);
    const proposedBasic = parseFloat((oldBasic * (1 + pct / 100)).toFixed(2));
    const oldCtc = parseFloat(salaryConfig.ctcMonthly as string || '0');
    // Rough CTC projection (precise recalc happens on apply)
    const proposedCtc = parseFloat((oldCtc * (1 + pct / 100)).toFixed(2));

    const [proposal] = await db.insert(salaryIncrementProposals).values({
      employeeSalaryId: salaryConfigId,
      employeeId: salaryConfig.userId,
      incrementPercentage: pct.toFixed(2),
      oldBasicSalary: oldBasic.toFixed(2),
      proposedBasicSalary: proposedBasic.toFixed(2),
      oldCtc: oldCtc.toFixed(2),
      proposedCtc: proposedCtc.toFixed(2),
      effectiveDate,
      status: 'pending',
      remarks: remarks || 'Yearly Increment',
      proposedBy: user.id,
    }).returning();

    await db.insert(salaryIncrementAuditLog).values({
      proposalId: proposal.id,
      employeeSalaryId: salaryConfigId,
      employeeId: salaryConfig.userId,
      action: 'proposed',
      actorId: user.id,
      oldValues: { basicSalary: oldBasic, ctcMonthly: oldCtc },
      newValues: { proposedBasicSalary: proposedBasic, proposedCtc, incrementPercentage: pct, effectiveDate },
      remarks: remarks || 'Yearly Increment',
    });

    // ── Notify all Superusers immediately ─────────────────────────────────────
    const [employeeUser] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, salaryConfig.userId));
    const superusers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'Superuser'), eq(users.isActive, true)));

    if (superusers.length > 0) {
      await db.insert(notifications).values(
        superusers.map(su => ({
          userId: su.id,
          type: 'salary_increment',
          title: 'New Salary Increment Proposal',
          message: `${employeeUser?.username || 'An employee'} — ${pct}% increment proposed, effective ${effectiveDate}. Submitted by ${user.username}.`,
          link: '/admin/payroll/increment-approvals',
          priority: 'high',
          category: 'payroll',
          sourceType: 'salary_increment_proposal',
          sourceId: proposal.id,
          createdBy: user.id,
        }))
      );
    }

    res.status(201).json(proposal);
  } catch (error) {
    console.error('Error creating salary increment proposal:', error);
    sendError(res, error);
  }
});

// ── GET /payroll/increment-proposals/pending-count ───────────────────────────
router.get('/payroll/increment-proposals/pending-count', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const [row] = await db
      .select({ count: count() })
      .from(salaryIncrementProposals)
      .where(eq(salaryIncrementProposals.status, 'pending'));
    res.json({ count: row?.count ?? 0 });
  } catch (error) {
    sendError(res, error);
  }
});

// ── GET /payroll/increment-proposals/all ─────────────────────────────────────
router.get('/payroll/increment-proposals/all', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'Superuser') {
      return sendPermissionError(res, 'Only Superuser can view all increment proposals');
    }
    const proposals = await db
      .select()
      .from(salaryIncrementProposals)
      .orderBy(desc(salaryIncrementProposals.proposedAt));

    // Attach employee name and proposer name
    const allUserIds = [...new Set([
      ...proposals.map(p => p.employeeId),
      ...proposals.map(p => p.proposedBy),
    ].filter(Boolean))] as number[];
    const allUsers = allUserIds.length
      ? await db.select({ id: users.id, username: users.username, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, allUserIds))
      : [];
    const userMap = Object.fromEntries(allUsers.map(u => {
      const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
      return [u.id, full || u.username];
    }));

    res.json(proposals.map(p => ({
      ...p,
      employeeName: p.employeeId ? (userMap[p.employeeId] || 'Unknown') : 'Unknown',
      proposedByName: p.proposedBy ? (userMap[p.proposedBy] || 'Unknown') : 'Unknown',
    })));
  } catch (error) {
    sendError(res, error);
  }
});

// ── GET /payroll/salary-setup/:id/increment-history ─────────────────────────
router.get('/payroll/salary-setup/:id/increment-history', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const salaryConfigId = parseInt(req.params.id);
    if (isNaN(salaryConfigId)) return res.status(400).json({ error: 'Invalid salary config ID' });

    // Auto-apply any approved proposals due today
    await autoApplyDueIncrements();

    const proposedByAlias = db.select({ id: users.id, name: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})` }).from(users).as('proposed_by_user');
    const approvedByAlias = db.select({ id: users.id, name: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})` }).from(users).as('approved_by_user');

    const history = await db
      .select({
        id: salaryIncrementProposals.id,
        employeeSalaryId: salaryIncrementProposals.employeeSalaryId,
        incrementPercentage: salaryIncrementProposals.incrementPercentage,
        oldBasicSalary: salaryIncrementProposals.oldBasicSalary,
        proposedBasicSalary: salaryIncrementProposals.proposedBasicSalary,
        oldCtc: salaryIncrementProposals.oldCtc,
        proposedCtc: salaryIncrementProposals.proposedCtc,
        effectiveDate: salaryIncrementProposals.effectiveDate,
        status: salaryIncrementProposals.status,
        remarks: salaryIncrementProposals.remarks,
        proposedAt: salaryIncrementProposals.proposedAt,
        approvedAt: salaryIncrementProposals.approvedAt,
        rejectedAt: salaryIncrementProposals.rejectedAt,
        rejectionReason: salaryIncrementProposals.rejectionReason,
        appliedAt: salaryIncrementProposals.appliedAt,
        proposedByName: sql<string>`(SELECT concat(u.first_name, ' ', u.last_name) FROM users u WHERE u.id = ${salaryIncrementProposals.proposedBy})`,
        approvedByName: sql<string>`(SELECT concat(u.first_name, ' ', u.last_name) FROM users u WHERE u.id = ${salaryIncrementProposals.approvedBy})`,
        appliedByName: sql<string>`(SELECT concat(u.first_name, ' ', u.last_name) FROM users u WHERE u.id = ${salaryIncrementProposals.appliedBy})`,
      })
      .from(salaryIncrementProposals)
      .where(eq(salaryIncrementProposals.employeeSalaryId, salaryConfigId))
      .orderBy(desc(salaryIncrementProposals.proposedAt));

    res.json(history);
  } catch (error) {
    console.error('Error fetching increment history:', error);
    sendError(res, error);
  }
});

// ── POST /payroll/increment-proposals/:id/approve — Superuser only ───────────
router.post('/payroll/increment-proposals/:id/approve', ensureAuthenticated, requireReauth('payroll.approve_increment'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'Superuser') {
      return sendPermissionError(res, 'Only Superuser can approve salary increment proposals');
    }

    const proposalId = parseInt(req.params.id);
    if (isNaN(proposalId)) return res.status(400).json({ error: 'Invalid proposal ID' });

    const [proposal] = await db
      .select()
      .from(salaryIncrementProposals)
      .where(eq(salaryIncrementProposals.id, proposalId));

    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'pending') {
      return res.status(409).json({ error: `Cannot approve a proposal with status: ${proposal.status}` });
    }

    // Safeguard: reject if another approved-but-not-yet-applied proposal already
    // exists for this salary config (prevents two pending→approved paths racing).
    const [otherApproved] = await db
      .select({ id: salaryIncrementProposals.id })
      .from(salaryIncrementProposals)
      .where(and(
        eq(salaryIncrementProposals.employeeSalaryId, proposal.employeeSalaryId),
        eq(salaryIncrementProposals.status, 'approved'),
        ne(salaryIncrementProposals.id, proposalId),
      ));

    if (otherApproved) {
      return res.status(409).json({
        error: `Another approved proposal (ID ${otherApproved.id}) for this employee is already awaiting application. Resolve it first.`,
      });
    }

    const effectiveDateOverride = req.body.effectiveDate || null;
    await db.update(salaryIncrementProposals).set({
      status: 'approved',
      approvedBy: user.id,
      approvedAt: new Date(),
      ...(effectiveDateOverride ? { effectiveDate: effectiveDateOverride } : {}),
    }).where(eq(salaryIncrementProposals.id, proposalId));

    await db.insert(salaryIncrementAuditLog).values({
      proposalId,
      employeeSalaryId: proposal.employeeSalaryId,
      employeeId: proposal.employeeId,
      action: 'approved',
      actorId: user.id,
      oldValues: { status: 'pending' },
      newValues: { status: 'approved' },
      remarks: `Approved by ${user.username}`,
    });

    // If effective_date <= today, apply immediately
    const today = new Date().toISOString().split('T')[0];
    const finalEffectiveDate = effectiveDateOverride || proposal.effectiveDate;
    if (finalEffectiveDate <= today) {
      await applySalaryIncrement(proposalId, user.id);
      return res.json({ success: true, message: 'Proposal approved and salary applied immediately (effective date has passed).' });
    }

    res.json({ success: true, message: `Proposal approved. Salary will be applied on ${finalEffectiveDate}.` });
  } catch (error) {
    console.error('Error approving increment proposal:', error);
    sendError(res, error);
  }
});

// ── POST /payroll/increment-proposals/:id/reject — Superuser only ────────────
router.post('/payroll/increment-proposals/:id/reject', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'Superuser') {
      return sendPermissionError(res, 'Only Superuser can reject salary increment proposals');
    }

    const proposalId = parseInt(req.params.id);
    if (isNaN(proposalId)) return res.status(400).json({ error: 'Invalid proposal ID' });

    const { rejectionReason } = req.body;
    if (!rejectionReason || String(rejectionReason).trim().length < 5) {
      return res.status(400).json({ error: 'Rejection reason is required (min 5 characters)' });
    }

    const [proposal] = await db
      .select()
      .from(salaryIncrementProposals)
      .where(eq(salaryIncrementProposals.id, proposalId));

    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'pending') {
      return res.status(409).json({ error: `Cannot reject a proposal with status: ${proposal.status}` });
    }

    await db.update(salaryIncrementProposals).set({
      status: 'rejected',
      rejectedBy: user.id,
      rejectedAt: new Date(),
      rejectionReason: rejectionReason.trim(),
    }).where(eq(salaryIncrementProposals.id, proposalId));

    await db.insert(salaryIncrementAuditLog).values({
      proposalId,
      employeeSalaryId: proposal.employeeSalaryId,
      employeeId: proposal.employeeId,
      action: 'rejected',
      actorId: user.id,
      oldValues: { status: 'pending' },
      newValues: { status: 'rejected', rejectionReason: rejectionReason.trim() },
      remarks: rejectionReason.trim(),
    });

    res.json({ success: true, message: 'Proposal rejected.' });
  } catch (error) {
    console.error('Error rejecting increment proposal:', error);
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
        statusSource: attendanceRecords.statusSource,
        adjustedBy: attendanceRecords.adjustedBy,
        adjustmentReason: attendanceRecords.adjustmentReason,
        adjustmentDate: attendanceRecords.adjustmentDate,
        originalPunchData: attendanceRecords.originalPunchData,
        workingHours: attendanceRecords.workingHours,
        netWorkingHours: attendanceRecords.netWorkingHours,
        userName: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        department: users.department,
        weeklyOffDays: users.weeklyOffDays,
        halfDayMinimumHours: users.halfDayMinimumHours,
        minimumDailyHours: users.minimumDailyHours,
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
      .orderBy(asc(attendanceRecords.date), asc(users.firstName), asc(users.lastName))
      .limit(10000);

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
      
      // DB status is authoritative for enforced dates (>= 2026-05-01); map directly.
      const isEnforcedRecord = typeof record.date === 'string'
        ? record.date >= '2026-05-01'
        : new Date(record.date) >= new Date('2026-05-01');

      const DB_STATUS_MAP: Record<string, string> = {
        on_leave: 'On Leave',
        half_day: 'Half Day',
        holiday: 'Holiday',
        weekly_off: 'Weekly Off',
        absent: 'Absent',
        late: 'Late',
        present: 'Present',
      };

      if (dbStatus === 'on_leave') {
        displayStatus = 'On Leave';
      } else if (dbStatus === 'holiday') {
        displayStatus = 'Holiday';
      } else if (isWeeklyOff || dbStatus === 'weekly_off') {
        displayStatus = 'Weekly Off';
      } else if (isEnforcedRecord) {
        // For May 2026+ records, trust DB status — thresholds were already applied on write
        displayStatus = DB_STATUS_MAP[dbStatus] ?? (record.checkInTime ? 'Present' : 'Absent');
      } else if (dbStatus === 'absent') {
        displayStatus = 'Absent';
      } else if (dbStatus === 'late') {
        displayStatus = 'Late';
      } else if (dbStatus === 'half_day') {
        displayStatus = 'Half Day';
      } else {
        const halfDayMin = Number(record.halfDayMinimumHours) || 4;
        const fullDayMin = Number(record.minimumDailyHours) || 8;
        const lateMin = Number(record.allowedLateMinutes) || 15;
        const dutyIn = record.dutyTimeIn || '09:00';
        displayStatus = getAttendanceStatus(record.checkInTime, record.checkOutTime, halfDayMin, lateMin, dutyIn, fullDayMin);
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
        weeklyOffDays,
        // Override metadata
        statusSource: record.statusSource,
        adjustedBy: record.adjustedBy,
        adjustmentReason: record.adjustmentReason,
        adjustmentDate: record.adjustmentDate,
        originalPunchData: record.originalPunchData,
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
    sendError(res, error);
  }
});

// ── Admin Override helpers ──────────────────────────────────────────────────

const OVERRIDE_ALLOWED_STATUSES = ['present', 'half_day', 'absent', 'on_leave', 'weekly_off', 'holiday'] as const;

async function canAdminOverride(user: any): Promise<boolean> {
  if (!user) return false;
  if (user.role === 'Superuser') return true;
  if (user.role === 'Manager' && user.department === 'Administration') return true;
  return false;
}

async function getLockedPayrollPeriod(dateStr: string) {
  const [locked] = await db
    .select({ id: payrollPeriods.id, periodName: payrollPeriods.periodName })
    .from(payrollPeriods)
    .where(and(
      lte(payrollPeriods.startDate, dateStr),
      gte(payrollPeriods.endDate, dateStr),
      eq(payrollPeriods.isLocked, true)
    ))
    .limit(1);
  return locked ?? null;
}

// ── PATCH /attendance/records/:id/override — Apply override ─────────────────
router.patch('/attendance/records/:id/override', ensureAuthenticated, requireReauth('attendance.override_admin'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!await canAdminOverride(user)) {
      return sendPermissionError(res, 'Only Superuser or Administration Manager can apply attendance overrides');
    }

    const recordId = parseInt(req.params.id);
    if (isNaN(recordId)) return res.status(400).json({ error: 'Invalid record ID' });

    const { status, checkInTime, checkOutTime, workingHours, netWorkingHours, reason } = req.body;

    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'Reason is required and must be at least 10 characters' });
    }

    if (status && !OVERRIDE_ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Allowed values: ${OVERRIDE_ALLOWED_STATUSES.join(', ')}`
      });
    }

    // Fetch current record
    const [record] = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.id, recordId));

    if (!record) return res.status(404).json({ error: 'Attendance record not found' });

    // Check payroll period lock
    const recordDateStr = typeof record.date === 'string' ? record.date.substring(0, 10) : String(record.date);
    const lockedPeriod = await getLockedPayrollPeriod(recordDateStr);

    let payrollPeriodWasLocked = false;
    let requiresPayrollRecalculation = false;

    if (lockedPeriod) {
      if (user.role !== 'Superuser') {
        return res.status(403).json({
          error: `Payroll period "${lockedPeriod.periodName}" is locked. Only Superuser can override locked periods.`
        });
      }
      payrollPeriodWasLocked = true;
      requiresPayrollRecalculation = true;
    }

    // Snapshot before values
    const beforeValues = {
      status: record.status,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      workingHours: record.workingHours,
      netWorkingHours: record.netWorkingHours,
    };

    // Preserve original_punch_data — write ONLY on first override
    let originalPunchData = record.originalPunchData as any;
    if (!originalPunchData) {
      originalPunchData = {
        systemStatus: record.status,
        checkInTime: record.checkInTime,
        checkOutTime: record.checkOutTime,
        workingHours: record.workingHours,
        netWorkingHours: record.netWorkingHours,
        capturedAt: new Date().toISOString(),
      };
    }

    // Build update payload
    const updatePayload: any = {
      statusSource: 'admin_override',
      adjustedBy: user.id,
      adjustmentReason: reason.trim(),
      adjustmentDate: new Date(),
      originalPunchData,
      updatedAt: new Date(),
    };

    if (status) updatePayload.status = status;
    if (checkInTime !== undefined) updatePayload.checkInTime = checkInTime ? new Date(checkInTime) : null;
    if (checkOutTime !== undefined) updatePayload.checkOutTime = checkOutTime ? new Date(checkOutTime) : null;
    if (workingHours !== undefined) updatePayload.workingHours = workingHours;
    if (netWorkingHours !== undefined) updatePayload.netWorkingHours = netWorkingHours;

    const [updated] = await db
      .update(attendanceRecords)
      .set(updatePayload)
      .where(eq(attendanceRecords.id, recordId))
      .returning();

    // After values
    const afterValues = {
      status: updated.status,
      checkInTime: updated.checkInTime,
      checkOutTime: updated.checkOutTime,
      workingHours: updated.workingHours,
      netWorkingHours: updated.netWorkingHours,
    };

    // Insert immutable audit log
    await db.insert(attendanceOverrideLog).values({
      recordId,
      employeeId: record.userId,
      date: recordDateStr,
      action: 'apply',
      beforeValues,
      afterValues,
      reason: reason.trim(),
      changedBy: user.id,
      payrollPeriodWasLocked,
      requiresPayrollRecalculation,
    });

    res.json({ success: true, record: updated, payrollPeriodWasLocked, requiresPayrollRecalculation });
  } catch (error) {
    console.error('Error applying attendance override:', error);
    sendError(res, error);
  }
});

// ── DELETE /attendance/records/:id/override — Revert override ───────────────
router.delete('/attendance/records/:id/override', ensureAuthenticated, requireReauth('attendance.override_admin'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!await canAdminOverride(user)) {
      return sendPermissionError(res, 'Only Superuser or Administration Manager can revert attendance overrides');
    }

    const recordId = parseInt(req.params.id);
    if (isNaN(recordId)) return res.status(400).json({ error: 'Invalid record ID' });

    const { reason } = req.body;
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ error: 'Reason is required and must be at least 10 characters' });
    }

    const [record] = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.id, recordId));

    if (!record) return res.status(404).json({ error: 'Attendance record not found' });

    if (record.statusSource !== 'admin_override') {
      return res.status(409).json({ error: 'This record has no active admin override to revert' });
    }

    const originalData = record.originalPunchData as any;
    if (!originalData) {
      return res.status(409).json({ error: 'No original punch data found — cannot revert' });
    }

    // Check payroll period lock
    const recordDateStr = typeof record.date === 'string' ? record.date.substring(0, 10) : String(record.date);
    const lockedPeriod = await getLockedPayrollPeriod(recordDateStr);
    let payrollPeriodWasLocked = false;
    let requiresPayrollRecalculation = false;

    if (lockedPeriod) {
      if (user.role !== 'Superuser') {
        return res.status(403).json({
          error: `Payroll period "${lockedPeriod.periodName}" is locked. Only Superuser can revert overrides in locked periods.`
        });
      }
      payrollPeriodWasLocked = true;
      requiresPayrollRecalculation = true;
    }

    // Snapshot before values (current override state)
    const beforeValues = {
      status: record.status,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      workingHours: record.workingHours,
      netWorkingHours: record.netWorkingHours,
    };

    // Restore from original_punch_data
    const [updated] = await db
      .update(attendanceRecords)
      .set({
        status: originalData.systemStatus ?? record.status,
        checkInTime: originalData.checkInTime ? new Date(originalData.checkInTime) : null,
        checkOutTime: originalData.checkOutTime ? new Date(originalData.checkOutTime) : null,
        workingHours: originalData.workingHours ?? null,
        netWorkingHours: originalData.netWorkingHours ?? null,
        statusSource: 'system',
        adjustedBy: null,
        adjustmentReason: null,
        adjustmentDate: null,
        // originalPunchData intentionally NOT cleared — permanent record
        updatedAt: new Date(),
      })
      .where(eq(attendanceRecords.id, recordId))
      .returning();

    const afterValues = {
      status: updated.status,
      checkInTime: updated.checkInTime,
      checkOutTime: updated.checkOutTime,
      workingHours: updated.workingHours,
      netWorkingHours: updated.netWorkingHours,
    };

    // Immutable audit log
    await db.insert(attendanceOverrideLog).values({
      recordId,
      employeeId: record.userId,
      date: recordDateStr,
      action: 'revert',
      beforeValues,
      afterValues,
      reason: reason.trim(),
      changedBy: user.id,
      payrollPeriodWasLocked,
      requiresPayrollRecalculation,
    });

    res.json({ success: true, record: updated, payrollPeriodWasLocked });
  } catch (error) {
    console.error('Error reverting attendance override:', error);
    sendError(res, error);
  }
});

// ── GET /attendance/records/:id/override-log — View audit history ───────────
router.get('/attendance/records/:id/override-log', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!await canAdminOverride(user)) {
      return sendPermissionError(res, 'Only Superuser or Administration Manager can view override logs');
    }

    const recordId = parseInt(req.params.id);
    if (isNaN(recordId)) return res.status(400).json({ error: 'Invalid record ID' });

    const logs = await db
      .select({
        id: attendanceOverrideLog.id,
        recordId: attendanceOverrideLog.recordId,
        employeeId: attendanceOverrideLog.employeeId,
        date: attendanceOverrideLog.date,
        action: attendanceOverrideLog.action,
        beforeValues: attendanceOverrideLog.beforeValues,
        afterValues: attendanceOverrideLog.afterValues,
        reason: attendanceOverrideLog.reason,
        changedAt: attendanceOverrideLog.changedAt,
        payrollPeriodWasLocked: attendanceOverrideLog.payrollPeriodWasLocked,
        requiresPayrollRecalculation: attendanceOverrideLog.requiresPayrollRecalculation,
        changedByName: users.username,
        changedByFirstName: users.firstName,
      })
      .from(attendanceOverrideLog)
      .leftJoin(users, eq(attendanceOverrideLog.changedBy, users.id))
      .where(eq(attendanceOverrideLog.recordId, recordId))
      .orderBy(desc(attendanceOverrideLog.changedAt));

    res.json(logs);
  } catch (error) {
    console.error('Error fetching override log:', error);
    sendError(res, error);
  }
});

// Get list of departments — reads from department_master (all rows incl. inactive)
// Response shape: DepartmentMaster[] — NOT string[]. Only Superuser may access.
router.get('/departments', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || user.role !== 'Superuser') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { departmentMaster } = await import('@shared/schema');
    const { asc: ascDept } = await import('drizzle-orm');
    const rows = await db
      .select()
      .from(departmentMaster)
      .orderBy(ascDept(departmentMaster.sortOrder));
    res.json(rows);
  } catch (error) {
    console.error('Error fetching departments from master:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
  }
});

/**
 * Create new leave request (admin — balance-safe via leave-service)
 */
router.post('/leave-requests', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const {
      employeeId,
      leaveTypeId,
      startDate,
      endDate,
      totalDays,
      isHalfDay,
      halfDayPeriod,
      reason,
      status,
      managerId,
    } = req.body;

    const effectiveEmployeeId = employeeId || currentUser.id;
    if (!leaveTypeId || !startDate || !reason) {
      return res.status(400).json({ error: 'Missing required fields: leaveTypeId, startDate, reason' });
    }

    const newRequest = await adminCreateLeave({
      employeeId: effectiveEmployeeId,
      leaveTypeId,
      startDate,
      endDate: endDate || startDate,
      totalDays: parseFloat(totalDays) || 1,
      isHalfDay: isHalfDay || false,
      halfDayPeriod: halfDayPeriod || null,
      reason,
      status: status || 'pending',
      managerId: managerId || null,
      adminId: currentUser.id,
    });

    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Error creating leave request:', error);
    sendError(res, error);
  }
});

/**
 * Update leave request status (approve/reject) — balance-safe via leave-service
 */
router.put('/leave-requests/:id/status', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { status, comments } = req.body;
    const currentUser = (req as any).user;

    if (!status) return res.status(400).json({ error: 'status is required' });

    if (status === 'approved') {
      await adminApproveLeave(id, currentUser.id, comments);
    } else if (status === 'rejected') {
      if (!comments) return res.status(400).json({ error: 'comments required for rejection' });
      await adminRejectLeave(id, currentUser.id, comments);
    } else {
      return res.status(400).json({ error: 'status must be approved or rejected' });
    }

    const [updated] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id));
    if (!updated) return res.status(404).json({ error: 'Leave request not found' });
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating leave request status:', error);
    if (error.message?.includes('already been processed')) {
      return res.status(409).json({ error: error.message });
    }
    sendError(res, error);
  }
});

/**
 * Admin revoke an approved leave request
 */
router.post('/leave-requests/:id/revoke', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;
    const currentUser = (req as any).user;
    const allowedRoles = ['admin', 'hr', 'Superuser', 'General Manager'];
    if (!allowedRoles.includes(currentUser.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    if (!reason) return res.status(400).json({ error: 'reason is required' });
    await revokeApprovedLeave(id, currentUser.id, reason);
    res.json({ success: true, message: 'Leave revoked successfully' });
  } catch (error: any) {
    console.error('Error revoking leave:', error);
    if (error.message?.includes('Only approved')) return res.status(400).json({ error: error.message });
    sendError(res, error);
  }
});

/**
 * LWP / LOP Exemption — Grant
 */
router.post('/users/:id/lwp-exemption/grant', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.id);
    const { reason, nextReview } = req.body;
    const currentUser = (req as any).user;
    const allowedRoles = ['admin', 'hr', 'Superuser', 'General Manager'];
    if (!allowedRoles.includes(currentUser.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    if (!reason) return res.status(400).json({ error: 'reason is required' });
    await grantLwpExemption(targetUserId, currentUser.id, reason, nextReview);
    res.json({ success: true, message: 'LWP exemption granted' });
  } catch (error) {
    console.error('Error granting LWP exemption:', error);
    sendError(res, error);
  }
});

/**
 * LWP / LOP Exemption — Revoke
 */
router.post('/users/:id/lwp-exemption/revoke', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.id);
    const { reason } = req.body;
    const currentUser = (req as any).user;
    const allowedRoles = ['admin', 'hr', 'Superuser', 'General Manager'];
    if (!allowedRoles.includes(currentUser.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    if (!reason) return res.status(400).json({ error: 'reason is required' });
    await revokeLwpExemption(targetUserId, currentUser.id, reason);
    res.json({ success: true, message: 'LWP exemption revoked' });
  } catch (error) {
    console.error('Error revoking LWP exemption:', error);
    sendError(res, error);
  }
});

/**
 * LWP Exemption status — GET
 */
router.get('/users/:id/lwp-exemption', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.id);
    const [user] = await db
      .select({
        id: users.id,
        role: users.role,
        lwpExempt: users.lwpExempt,
        lwpExemptReason: users.lwpExemptReason,
        lwpExemptGrantedBy: users.lwpExemptGrantedBy,
        lwpExemptGrantedAt: users.lwpExemptGrantedAt,
        lwpExemptNextReview: users.lwpExemptNextReview,
      })
      .from(users)
      .where(eq(users.id, targetUserId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    const policyExemptRoles = ['Superuser', 'General Manager', 'Senior Manager'];
    res.json({
      ...user,
      exemptByPolicy: policyExemptRoles.includes(user.role),
      effectivelyExempt: user.lwpExempt || policyExemptRoles.includes(user.role),
    });
  } catch (error) {
    console.error('Error fetching LWP exemption status:', error);
    sendError(res, error);
  }
});

/**
 * LOP Confirmation — confirm computed LOP for a payroll run
 */
router.post('/payroll/lop-confirmation', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const allowedRoles = ['admin', 'hr', 'Superuser', 'General Manager'];
    if (!allowedRoles.includes(currentUser.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const { periodId, runNumber, userId, lopDaysConfirmed, notes } = req.body;
    if (!periodId || !runNumber || !userId) {
      return res.status(400).json({ error: 'periodId, runNumber, userId required' });
    }
    await db
      .update(payrollAttendanceSnapshot)
      .set({
        lopDaysConfirmed: lopDaysConfirmed?.toString() ?? null,
        lopConfirmedBy: currentUser.id,
        lopConfirmedAt: new Date(),
        lopOverrideNotes: notes || null,
      })
      .where(
        and(
          eq(payrollAttendanceSnapshot.periodId, periodId),
          eq(payrollAttendanceSnapshot.runNumber, runNumber),
          eq(payrollAttendanceSnapshot.userId, userId)
        )
      );
    res.json({ success: true, message: 'LOP confirmed' });
  } catch (error) {
    console.error('Error confirming LOP:', error);
    sendError(res, error);
  }
});

/**
 * Bulk LOP Confirmation — confirm all employees in a run
 */
router.post('/payroll/lop-confirmation/bulk', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const allowedRoles = ['admin', 'hr', 'Superuser', 'General Manager'];
    if (!allowedRoles.includes(currentUser.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const { periodId, runNumber } = req.body;
    if (!periodId || !runNumber) {
      return res.status(400).json({ error: 'periodId, runNumber required' });
    }
    // Confirm all rows with computed LOP (accept lopDays as the confirmed value)
    await db
      .update(payrollAttendanceSnapshot)
      .set({
        lopDaysConfirmed: sql`lop_days`,
        lopConfirmedBy: currentUser.id,
        lopConfirmedAt: new Date(),
        lopOverrideNotes: 'Bulk confirmed',
      })
      .where(
        and(
          eq(payrollAttendanceSnapshot.periodId, periodId),
          eq(payrollAttendanceSnapshot.runNumber, runNumber),
          sql`lop_confirmed_at IS NULL`
        )
      );
    res.json({ success: true, message: 'Bulk LOP confirmation complete' });
  } catch (error) {
    console.error('Error bulk confirming LOP:', error);
    sendError(res, error);
  }
});

/**
 * Sandwich deduction — void a specific deduction record
 */
router.post('/leave-deductions/:id/void', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const deductionId = parseInt(req.params.id);
    const { reason } = req.body;
    const currentUser = (req as any).user;
    const allowedRoles = ['admin', 'hr', 'Superuser', 'General Manager'];
    if (!allowedRoles.includes(currentUser.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    if (!reason) return res.status(400).json({ error: 'reason is required' });
    const { voidSandwichDeduction } = await import('./leave-service');
    await voidSandwichDeduction(deductionId, currentUser.id, reason);
    res.json({ success: true, message: 'Deduction voided' });
  } catch (error: any) {
    console.error('Error voiding deduction:', error);
    if (error.message?.includes('Only approved')) return res.status(400).json({ error: error.message });
    sendError(res, error);
  }
});

/**
 * Get sandwich deductions for a leave request
 */
router.get('/leave-requests/:id/deductions', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.id);
    const { leaveDeductions } = await import('@shared/schema');
    const deductions = await db
      .select()
      .from(leaveDeductions)
      .where(eq(leaveDeductions.leaveRequestId, requestId))
      .orderBy(leaveDeductions.deductionDate);
    res.json(deductions);
  } catch (error) {
    console.error('Error fetching deductions:', error);
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
        assignedByName: sql`(SELECT COALESCE(u2.first_name || ' ' || u2.last_name, u2.username) FROM users u2 WHERE u2.id = ${employeeWorkweekAssignments.assignedBy})`.as('assignedByName'),
        notes: employeeWorkweekAssignments.notes,
        isActive: employeeWorkweekAssignments.isActive,
        createdAt: employeeWorkweekAssignments.createdAt
      })
      .from(employeeWorkweekAssignments)
      .innerJoin(users, eq(employeeWorkweekAssignments.employeeId, users.id))
      .innerJoin(workweekPolicies, eq(employeeWorkweekAssignments.workweekPolicyId, workweekPolicies.id))
      .where(eq(employeeWorkweekAssignments.isActive, true))
      .orderBy(desc(employeeWorkweekAssignments.createdAt));

    res.json(assignments);
  } catch (error) {
    console.error('Error fetching employee workweek assignments:', error);
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
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
          cardCode: userInfo.cardCode,
          cardName: userInfo.cardName,
          basicSalary: record.baseSalary,
          baseSalary: record.baseSalary,
          grossEarnings: record.grossPay,
          totalDeductions,
          netSalary: record.netPay,
          hra: record.hra,
          conveyanceAllowance: record.conveyanceAllowance,
          ltaAllowance: record.ltaAllowance,
          specialAllowance: record.specialAllowance,
          supplementaryAllowance: record.supplementaryAllowance,
          kgpAllowance: record.kgpAllowance,
          bonus: record.bonus,
          overtimePay: record.overtimePay,
          otherAllowances: record.otherAllowances,
          reimbursements: record.reimbursements,
          employeePf: record.employeePf,
          employerPf: record.employerPf,
          employeeEsic: record.employeeEsic,
          employerEsic: record.employerEsic,
          professionalTax: record.professionalTax,
          incomeTax: record.incomeTax,
          tdsAmount: record.tdsAmount,
          loanDeductions: record.loanDeductions,
          advanceDeductions: record.advanceDeductions,
          otherDeductions: record.otherDeductions,
          providentFund: record.providentFund,
          esiDeduction: record.esiDeduction,
          gratuity: record.gratuity,
          workingDays: record.workingDays,
          paidDays: record.paidDays,
          lopDays: record.lopDays,
          presentDays: record.presentDays,
          paidLeaveDays: record.paidLeaveDays,
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
    sendError(res, error);
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
    sendError(res, error);
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
    sendError(res, error);
  }
});

/**
 * Fetch GL accounts from SAP Chart of Accounts
 */
router.get('/payroll/sap-gl-accounts', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const sapResponse = await sapSession.request({
      method: 'GET',
      path: "/b1s/v1/ChartOfAccounts?$select=Code,Name,ActiveAccount&$top=500",
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

router.get('/payroll/sap-coa-search', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const search = (req.query.q as string || '').trim();
    if (!search || search.length < 2) {
      return res.status(400).json({ error: 'Search query (q) must be at least 2 characters' });
    }

    const sapDb = process.env.SAP_COMPANY_DB || '';
    let allSapAccounts: any[] = [];
    let nextLink: string | null = `/b1s/v1/ChartOfAccounts?$top=500`;

    console.log(`[SAP CoA Search] Fetching all accounts from SAP (bulk fetch with pagination)...`);
    while (nextLink) {
      try {
        const resp = await sapSession.request({
          method: 'GET',
          path: nextLink,
        });
        if (resp.ok) {
          const data = JSON.parse(resp.body);
          const batch = data.value || [];
          allSapAccounts.push(...batch);
          console.log(`[SAP CoA Search] Fetched page, got ${batch.length} accounts (total so far: ${allSapAccounts.length})`);
          nextLink = data['odata.nextLink'] || null;
          if (!nextLink && batch.length > 0) {
            const currentSkip = allSapAccounts.length;
            const testResp = await sapSession.request({
              method: 'GET',
              path: `/b1s/v1/ChartOfAccounts?$skip=${currentSkip}&$top=500`,
            });
            if (testResp.ok) {
              const testData = JSON.parse(testResp.body);
              const testBatch = testData.value || [];
              if (testBatch.length > 0) {
                allSapAccounts.push(...testBatch);
                console.log(`[SAP CoA Search] Manual skip=${currentSkip} found ${testBatch.length} more (total: ${allSapAccounts.length})`);
                nextLink = testData['odata.nextLink'] || `/b1s/v1/ChartOfAccounts?$skip=${allSapAccounts.length}&$top=500`;
              }
            }
          }
        } else {
          console.log(`[SAP CoA Search] Batch fetch failed: ${resp.statusCode} ${resp.body.substring(0, 200)}`);
          nextLink = null;
        }
      } catch (e: any) {
        console.log(`[SAP CoA Search] Batch fetch error: ${e.message}`);
        nextLink = null;
      }
    }

    console.log(`[SAP CoA Search] Total accounts fetched: ${allSapAccounts.length}. Searching for "${search}"...`);
    if (allSapAccounts.length > 0) {
      const samples = allSapAccounts.slice(0, 5);
      console.log(`[SAP CoA Search] First 5 accounts: ${JSON.stringify(samples.map((a: any) => ({ Code: a.Code, FormatCode: a.FormatCode, Name: a.AcctName })))}`);
    }

    const searchLower = search.toLowerCase();
    const matched = allSapAccounts
      .filter((a: any) => {
        const code = (a.Code || '').toLowerCase();
        const formatCode = (a.FormatCode || '').toLowerCase();
        const name = (a.AcctName || '').toLowerCase();
        return code.includes(searchLower) || formatCode.includes(searchLower) || name.includes(searchLower);
      })
      .slice(0, 100)
      .map((a: any) => ({
        acctCode: a.Code,
        formatCode: a.FormatCode,
        acctName: a.AcctName,
        active: a.ActiveAccount,
        currency: a.AcctCurrency,
        balance: a.Balance,
        accountType: a.AccountType,
        controlAccount: a.ControlAccount,   // 'tYES' = SAP blocks direct JE posting
      }));

    console.log(`[SAP CoA Search] Found ${matched.length} matching accounts for "${search}"`);
    if (matched.length > 0) {
      console.log(`[SAP CoA Search] First match: Code=${matched[0].acctCode}, FormatCode=${matched[0].formatCode}, Name=${matched[0].acctName}`);
    }

    return res.json({ accounts: matched, total: matched.length, totalInSap: allSapAccounts.length, search, companyDb: sapDb });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/payroll/sap-diagnostic', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const sapDb = process.env.SAP_COMPANY_DB || '';
    const sapUser = process.env.SAP_B1_USERNAME || '';

    const results: any = { companyDb: sapDb, sapUser, tests: {} };

    console.log(`\n========== SAP DIAGNOSTIC START ==========`);
    console.log(`[SAP Diag] Company DB: ${sapDb}, User: ${sapUser}`);

    const test1Path = `/b1s/v1/ChartOfAccounts('50207350101-ARL')`;
    console.log(`[SAP Diag] Test 1: GET ${test1Path}`);
    try {
      const r1 = await sapSession.request({ method: 'GET', path: test1Path });
      console.log(`[SAP Diag] Test 1 result: ${r1.statusCode} ${r1.body.substring(0, 500)}`);
      results.tests.directLookup1 = { status: r1.statusCode, ok: r1.ok, body: JSON.parse(r1.body) };
    } catch (e: any) {
      console.log(`[SAP Diag] Test 1 error: ${e.message}`);
      results.tests.directLookup1 = { error: e.message };
    }

    const test2Path = `/b1s/v1/ChartOfAccounts('20302070300-ARL')`;
    console.log(`[SAP Diag] Test 2: GET ${test2Path}`);
    try {
      const r2 = await sapSession.request({ method: 'GET', path: test2Path });
      console.log(`[SAP Diag] Test 2 result: ${r2.statusCode} ${r2.body.substring(0, 500)}`);
      results.tests.directLookup2 = { status: r2.statusCode, ok: r2.ok, body: JSON.parse(r2.body) };
    } catch (e: any) {
      console.log(`[SAP Diag] Test 2 error: ${e.message}`);
      results.tests.directLookup2 = { error: e.message };
    }

    const test3Path = `/b1s/v1/ChartOfAccounts?$select=Code,AcctName,FormatCode,ActiveAccount,AccountType&$top=20`;
    console.log(`[SAP Diag] Test 3: GET ${test3Path}`);
    try {
      const r3 = await sapSession.request({ method: 'GET', path: test3Path });
      console.log(`[SAP Diag] Test 3 result: ${r3.statusCode}`);
      if (r3.ok) {
        const d3 = JSON.parse(r3.body);
        const accts = (d3.value || []).map((a: any) => ({
          Code: a.Code, FormatCode: a.FormatCode, AcctName: a.AcctName,
          Active: a.ActiveAccount, Type: a.AccountType
        }));
        console.log(`[SAP Diag] Test 3: ${accts.length} accounts returned`);
        accts.forEach((a: any, i: number) => console.log(`  [${i}] Code="${a.Code}" FormatCode="${a.FormatCode}" Name="${a.AcctName}" Active=${a.Active} Type=${a.Type}`));
        results.tests.listAccounts = { status: r3.statusCode, count: accts.length, accounts: accts };
      } else {
        console.log(`[SAP Diag] Test 3 body: ${r3.body.substring(0, 500)}`);
        results.tests.listAccounts = { status: r3.statusCode, body: r3.body.substring(0, 500) };
      }
    } catch (e: any) {
      results.tests.listAccounts = { error: e.message };
    }

    const test4Path = `/b1s/v1/CompanyService_GetCompanyInfo`;
    console.log(`[SAP Diag] Test 4: POST ${test4Path}`);
    try {
      const r4 = await sapSession.request({ method: 'POST', path: test4Path });
      console.log(`[SAP Diag] Test 4 result: ${r4.statusCode} ${r4.body.substring(0, 500)}`);
      if (r4.ok) {
        const ci = JSON.parse(r4.body);
        results.tests.companyInfo = {
          status: r4.statusCode,
          CompanyName: ci.CompanyName,
          LocalCurrency: ci.LocalCurrency,
          SystemCurrency: ci.SystemCurrency,
          EnableAccountSegmentation: ci.EnableAccountSegmentation,
          IsMultiBranch: ci.IsMultiBranch,
        };
        console.log(`[SAP Diag] Company: "${ci.CompanyName}", Currency: ${ci.LocalCurrency}, Segmentation: ${ci.EnableAccountSegmentation}, MultiBranch: ${ci.IsMultiBranch}`);
      } else {
        results.tests.companyInfo = { status: r4.statusCode, body: r4.body.substring(0, 300) };
      }
    } catch (e: any) {
      results.tests.companyInfo = { error: e.message };
    }

    console.log(`\n[SAP Diag] Test 5: Paginated full CoA fetch...`);
    let allAccts: any[] = [];
    let diagNextLink: string | null = `/b1s/v1/ChartOfAccounts?$top=500`;
    while (diagNextLink) {
      try {
        const r = await sapSession.request({ method: 'GET', path: diagNextLink });
        if (r.ok) {
          const d = JSON.parse(r.body);
          const batch = d.value || [];
          allAccts.push(...batch);
          diagNextLink = d['odata.nextLink'] || null;
          if (!diagNextLink && batch.length > 0) {
            const skip = allAccts.length;
            const nr = await sapSession.request({
              method: 'GET', path: `/b1s/v1/ChartOfAccounts?$skip=${skip}&$top=500`
            });
            if (nr.ok) {
              const nd = JSON.parse(nr.body);
              const nb = nd.value || [];
              if (nb.length > 0) {
                allAccts.push(...nb);
                diagNextLink = nd['odata.nextLink'] || `/b1s/v1/ChartOfAccounts?$skip=${allAccts.length}&$top=500`;
              }
            }
          }
        } else { diagNextLink = null; }
      } catch { diagNextLink = null; }
    }
    console.log(`[SAP Diag] Total accounts: ${allAccts.length}`);

    const salaryAccts = allAccts.filter((a: any) => {
      const name = (a.AcctName || a.Name || '').toLowerCase();
      const fc = (a.FormatCode || '').toLowerCase();
      return name.includes('salary') || name.includes('basic') || fc.includes('50207') || fc.includes('20302') || fc.includes('20304');
    });
    console.log(`[SAP Diag] Salary-related accounts found: ${salaryAccts.length}`);
    salaryAccts.forEach((a: any) => console.log(`  Code="${a.Code}" FormatCode="${a.FormatCode}" Name="${a.AcctName || a.Name}"`));

    results.tests.fullCoA = {
      totalAccounts: allAccts.length,
      salaryRelated: salaryAccts.map((a: any) => ({
        Code: a.Code, FormatCode: a.FormatCode, Name: a.AcctName || a.Name
      })),
      first10: allAccts.slice(0, 10).map((a: any) => ({
        Code: a.Code, FormatCode: a.FormatCode, Name: a.AcctName || a.Name
      })),
    };

    console.log(`========== SAP DIAGNOSTIC END ==========\n`);
    return res.json(results);
  } catch (e: any) {
    console.error('[SAP Diag] Fatal error:', e);
    return res.status(500).json({ error: e.message });
  }
});

router.get('/payroll/gl-mappings', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const mappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));
    const result: Record<string, string> = {};
    for (const m of mappings) {
      if (m.sapAcctCode) {
        result[`${m.componentCode}|${m.postingContext}`] = m.sapAcctCode;
      } else if (m.glAccountCode) {
        result[`${m.componentCode}|${m.postingContext}`] = m.glAccountCode;
      }
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/payroll/validate-gl-mappings', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const sapDb = process.env.SAP_COMPANY_DB || '';

    console.log(`[Validate GL] Bulk-fetching SAP Chart of Accounts...`);
    let allSapAccounts: any[] = [];
    let valNextLink: string | null = `/b1s/v1/ChartOfAccounts?$top=500`;
    while (valNextLink) {
      try {
        const resp = await sapSession.request({
          method: 'GET',
          path: valNextLink,
        });
        if (resp.ok) {
          const data = JSON.parse(resp.body);
          const batch = data.value || [];
          allSapAccounts.push(...batch);
          console.log(`[Validate GL] Fetched page, got ${batch.length} (total: ${allSapAccounts.length})`);
          valNextLink = data['odata.nextLink'] || null;
          if (!valNextLink && batch.length > 0) {
            const skip = allSapAccounts.length;
            const testResp = await sapSession.request({
              method: 'GET',
              path: `/b1s/v1/ChartOfAccounts?$skip=${skip}&$top=500`,
            });
            if (testResp.ok) {
              const td = JSON.parse(testResp.body);
              const tb = td.value || [];
              if (tb.length > 0) {
                allSapAccounts.push(...tb);
                console.log(`[Validate GL] Manual skip=${skip} found ${tb.length} more (total: ${allSapAccounts.length})`);
                valNextLink = td['odata.nextLink'] || `/b1s/v1/ChartOfAccounts?$skip=${allSapAccounts.length}&$top=500`;
              }
            }
          }
        } else { valNextLink = null; }
      } catch { valNextLink = null; }
    }
    console.log(`[Validate GL] Fetched ${allSapAccounts.length} SAP accounts total`);

    if (allSapAccounts.length > 0) {
      const first3 = allSapAccounts.slice(0, 3);
      console.log(`[Validate GL] Sample accounts: ${first3.map((a: any) => `Code="${a.Code}" FormatCode="${a.FormatCode}" Name="${a.AcctName}"`).join(' | ')}`);
    }

    const byCode = new Map<string, any>();
    const byFormatCode = new Map<string, any[]>();
    for (const acct of allSapAccounts) {
      byCode.set(acct.Code, acct);
      const fc = (acct.FormatCode || '').trim();
      if (fc) {
        if (!byFormatCode.has(fc)) byFormatCode.set(fc, []);
        byFormatCode.get(fc)!.push(acct);
      }
    }

    const mappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));
    const results: any[] = [];
    let validCount = 0;
    let invalidCount = 0;
    let emptyCount = 0;

    for (const mapping of mappings) {
      const glCode = mapping.glAccountCode?.trim();
      if (!glCode) {
        results.push({
          id: mapping.id, componentCode: mapping.componentCode, componentName: mapping.componentName,
          category: mapping.category, configuredGL: '', status: 'empty',
          sapAcctCode: null, sapFormatCode: null, sapAcctName: null,
        });
        emptyCount++;
        continue;
      }

      const strippedCode = glCode.replace(/-[A-Z]+$/, '');
      let resolved = false;
      let sapAcctCode = '';
      let sapFormatCode = '';
      let sapAcctName = '';

      if (byCode.has(glCode)) {
        const acct = byCode.get(glCode)!;
        sapAcctCode = acct.Code; sapFormatCode = acct.FormatCode || ''; sapAcctName = acct.AcctName || '';
        resolved = true;
        console.log(`[Validate GL] ${glCode} → matched by exact Code → ${sapAcctCode}`);
      }

      if (!resolved && strippedCode !== glCode && byCode.has(strippedCode)) {
        const acct = byCode.get(strippedCode)!;
        sapAcctCode = acct.Code; sapFormatCode = acct.FormatCode || ''; sapAcctName = acct.AcctName || '';
        resolved = true;
        console.log(`[Validate GL] ${glCode} → matched by stripped Code "${strippedCode}" → ${sapAcctCode}`);
      }

      if (!resolved && byFormatCode.has(glCode)) {
        const matches = byFormatCode.get(glCode)!;
        if (matches.length === 1) {
          sapAcctCode = matches[0].Code; sapFormatCode = matches[0].FormatCode || ''; sapAcctName = matches[0].AcctName || '';
          resolved = true;
          console.log(`[Validate GL] ${glCode} → matched by FormatCode → AcctCode=${sapAcctCode}`);
        } else {
          results.push({
            id: mapping.id, componentCode: mapping.componentCode, componentName: mapping.componentName,
            category: mapping.category, configuredGL: glCode, status: 'ambiguous',
            matches: matches.map((a: any) => ({ acctCode: a.Code, formatCode: a.FormatCode, acctName: a.AcctName })),
          });
          invalidCount++;
          console.log(`[Validate GL] ${glCode} → ambiguous FormatCode match (${matches.length} results)`);
          continue;
        }
      }

      if (!resolved && strippedCode !== glCode && byFormatCode.has(strippedCode)) {
        const matches = byFormatCode.get(strippedCode)!;
        if (matches.length === 1) {
          sapAcctCode = matches[0].Code; sapFormatCode = matches[0].FormatCode || ''; sapAcctName = matches[0].AcctName || '';
          resolved = true;
          console.log(`[Validate GL] ${glCode} → matched by stripped FormatCode "${strippedCode}" → AcctCode=${sapAcctCode}`);
        }
      }

      if (!resolved) {
        const codeLower = glCode.toLowerCase();
        const strippedLower = strippedCode.toLowerCase();
        const partialMatches = allSapAccounts.filter((a: any) => {
          const c = (a.Code || '').toLowerCase();
          const fc = (a.FormatCode || '').toLowerCase();
          return c.includes(strippedLower) || fc.includes(strippedLower) || fc.includes(codeLower);
        });
        if (partialMatches.length === 1) {
          sapAcctCode = partialMatches[0].Code; sapFormatCode = partialMatches[0].FormatCode || ''; sapAcctName = partialMatches[0].AcctName || '';
          resolved = true;
          console.log(`[Validate GL] ${glCode} → partial match → AcctCode=${sapAcctCode}, FormatCode=${sapFormatCode}`);
        } else if (partialMatches.length > 1) {
          console.log(`[Validate GL] ${glCode} → ${partialMatches.length} partial matches (ambiguous)`);
        } else {
          console.log(`[Validate GL] ${glCode} → NOT FOUND in ${allSapAccounts.length} SAP accounts`);
        }
      }

      if (resolved) {
        const resolvedAcct = byCode.get(sapAcctCode) || allSapAccounts.find((a: any) => a.Code === sapAcctCode);
        const accountType = resolvedAcct?.AccountType || '';
        const controlAccount = resolvedAcct?.ControlAccount || '';
        const isControlAcct = controlAccount === 'tYES';
        await db.update(glAccountMappings)
          .set({ sapAcctCode, sapValidatedAt: new Date() })
          .where(eq(glAccountMappings.id, mapping.id));
        results.push({
          id: mapping.id, componentCode: mapping.componentCode, componentName: mapping.componentName,
          category: mapping.category, configuredGL: glCode, status: isControlAcct ? 'control_account' : 'valid',
          sapAcctCode, sapFormatCode, sapAcctName, updated: sapAcctCode !== glCode,
          accountType, controlAccount, isControlAcct,
        });
        if (isControlAcct) { invalidCount++; } else { validCount++; }
        if (isControlAcct) {
          console.log(`[Validate GL] ⚠️ ${mapping.componentCode} → ${sapAcctCode} (${sapAcctName}) is a CONTROL ACCOUNT — SAP will reject JE posting to this account!`);
        }
      } else {
        results.push({
          id: mapping.id, componentCode: mapping.componentCode, componentName: mapping.componentName,
          category: mapping.category, configuredGL: glCode, status: 'not_found', sapAcctCode: null,
        });
        invalidCount++;
      }
    }

    return res.json({
      companyDb: sapDb,
      summary: { total: mappings.length, valid: validCount, invalid: invalidCount, empty: emptyCount },
      results,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/payroll/gl-mapping/:id/set-sap-code', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const mappingId = parseInt(req.params.id);
    const { sapAcctCode, sapFormatCode, sapAcctName } = req.body;

    if (!sapAcctCode) return res.status(400).json({ error: 'sapAcctCode is required' });

    await db.update(glAccountMappings)
      .set({
        sapAcctCode,
        glAccountName: sapAcctName || undefined,
        sapValidatedAt: new Date(),
        updatedBy: (req.user as any)?.id,
        updatedAt: new Date(),
      })
      .where(eq(glAccountMappings.id, mappingId));

    return res.json({ success: true, mappingId, sapAcctCode, sapFormatCode, sapAcctName });
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

    console.log(`[Test SAP JE] Bulk-fetching all SAP Chart of Accounts to build FormatCode→Code map...`);
    let allSapAccounts: any[] = [];
    let jeNextLink: string | null = `/b1s/v1/ChartOfAccounts?$top=500`;
    while (jeNextLink) {
      try {
        const resp = await sapSession.request({
          method: 'GET',
          path: jeNextLink,
        });
        if (resp.ok) {
          const data = JSON.parse(resp.body);
          const batch = data.value || [];
          allSapAccounts.push(...batch);
          console.log(`[Test SAP JE] Fetched page, got ${batch.length} accounts (total: ${allSapAccounts.length})`);
          jeNextLink = data['odata.nextLink'] || null;
          if (!jeNextLink && batch.length > 0) {
            const skip = allSapAccounts.length;
            const testResp = await sapSession.request({
              method: 'GET',
              path: `/b1s/v1/ChartOfAccounts?$skip=${skip}&$top=500`,
            });
            if (testResp.ok) {
              const td = JSON.parse(testResp.body);
              const tb = td.value || [];
              if (tb.length > 0) {
                allSapAccounts.push(...tb);
                console.log(`[Test SAP JE] Manual skip=${skip} found ${tb.length} more (total: ${allSapAccounts.length})`);
                jeNextLink = td['odata.nextLink'] || `/b1s/v1/ChartOfAccounts?$skip=${allSapAccounts.length}&$top=500`;
              }
            }
          }
        } else {
          console.log(`[Test SAP JE] Batch fetch failed: ${resp.statusCode}`);
          jeNextLink = null;
        }
      } catch (e: any) {
        console.log(`[Test SAP JE] Batch fetch error: ${e.message}`);
        jeNextLink = null;
      }
    }
    console.log(`[Test SAP JE] Total SAP accounts fetched: ${allSapAccounts.length}`);

    const formatCodeToCode = new Map<string, string>();
    const codeToName = new Map<string, string>();
    for (const acct of allSapAccounts) {
      if (acct.FormatCode) {
        formatCodeToCode.set(acct.FormatCode.trim(), acct.Code);
      }
      codeToName.set(acct.Code, acct.AcctName || acct.Name || '');
    }

    if (allSapAccounts.length > 0) {
      const samples = allSapAccounts.slice(0, 5);
      console.log(`[Test SAP JE] Sample accounts: ${samples.map((a: any) => `Code="${a.Code}" FormatCode="${a.FormatCode}" Name="${a.AcctName || a.Name}"`).join(' | ')}`);
    }

    let discoveredAccounts = allSapAccounts;

    let finalPayload = jePayload;

    const needsResolve = (finalPayload.JournalEntryLines || []).filter((line: any) =>
      line.ShortName && (
        line.AccountCode === line.ShortName ||
        line.AccountCode === '<REAL_BP_CONTROL_GL>' ||
        !line.AccountCode
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
          const bpResponse = await sapSession.request({
            method: 'GET',
            path: `/b1s/v1/BusinessPartners('${bpCode}')`,
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
        line.AccountCode === line.ShortName ||
        line.AccountCode.includes('<')
      )
    );
    if (invalidLines.length > 0) {
      return res.status(400).json({
        error: `Invalid AccountCode on lines: ${invalidLines.map((l: any) => `Line ${l.Line_ID}: "${l.AccountCode}"`).join(', ')}. Cannot post with BP codes or placeholders.`,
        invalidLines,
        hint: 'Set the NET_PAY GL in GL Mapping with the actual GL code.',
      });
    }

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));
    const sapCodeLookup: Record<string, string> = {};
    for (const m of allMappings) {
      if (m.sapAcctCode && m.glAccountCode) {
        sapCodeLookup[m.glAccountCode] = m.sapAcctCode;
      }
    }

    if (finalPayload.JournalEntryLines) {
      const remapped: string[] = [];
      const unresolvedLines: any[] = [];
      finalPayload = {
        ...finalPayload,
        JournalEntryLines: finalPayload.JournalEntryLines.map((line: any) => {
          const displayCode = line.AccountCode;
          if (!displayCode) {
            unresolvedLines.push(line);
            return line;
          }

          if (sapCodeLookup[displayCode] && sapCodeLookup[displayCode] !== displayCode) {
            remapped.push(`${displayCode} -> ${sapCodeLookup[displayCode]} (from DB sapAcctCode)`);
            return { ...line, AccountCode: sapCodeLookup[displayCode] };
          }

          if (formatCodeToCode.has(displayCode)) {
            const realCode = formatCodeToCode.get(displayCode)!;
            remapped.push(`${displayCode} -> ${realCode} (FormatCode→Code from SAP)`);
            return { ...line, AccountCode: realCode };
          }

          const strippedCode = displayCode.replace(/-[A-Z]+$/, '');
          if (strippedCode !== displayCode && formatCodeToCode.has(strippedCode)) {
            const realCode = formatCodeToCode.get(strippedCode)!;
            remapped.push(`${displayCode} -> ${realCode} (stripped FormatCode→Code from SAP)`);
            return { ...line, AccountCode: realCode };
          }

          if (codeToName.has(displayCode)) {
            console.log(`[Test SAP JE] ${displayCode} is already a valid internal Code`);
            return line;
          }

          console.log(`[Test SAP JE] WARNING: ${displayCode} not found in SAP CoA (${allSapAccounts.length} accounts). Posting as-is.`);
          return line;
        }),
      };
      if (remapped.length > 0) {
        console.log('[Test SAP JE] Remapped ' + remapped.length + ' codes:');
        remapped.forEach(r => console.log('  ' + r));
      }
    }

    console.log('[Test SAP JE] All GL codes processed.');

    console.log(`[Test SAP JE] Posting JE with ${finalPayload.JournalEntryLines?.length || 0} lines:`, JSON.stringify(finalPayload));

    const sapResponse = await sapSession.request({
      method: 'POST',
      path: '/b1s/v1/JournalEntries',
      body: finalPayload,
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
    sendError(res, error);
  }
});

router.patch('/payroll/records/:id/edit', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.id);
    const updates = req.body;

    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, recordId));
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const status = (record.status || 'generated') === 'draft' ? 'generated' : record.status;
    if (status !== 'generated' && status !== 'verified') {
      return res.status(400).json({ error: `Cannot edit a record in "${status}" status. Only "generated" or "verified" records can be edited.` });
    }

    const allowedFields = [
      'baseSalary', 'hra', 'conveyanceAllowance', 'ltaAllowance', 'specialAllowance',
      'supplementaryAllowance', 'kgpAllowance', 'bonus', 'overtimePay', 'otherAllowances',
      'reimbursements', 'incomeTax', 'professionalTax', 'providentFund', 'employeePf',
      'employerPf', 'esiDeduction', 'employeeEsic', 'employerEsic', 'tdsAmount',
      'loanDeductions', 'advanceDeductions', 'otherDeductions'
    ];

    const setData: any = { updatedAt: new Date() };
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setData[field] = String(parseFloat(updates[field]) || 0);
      }
    }

    const grossFields = ['baseSalary','hra','conveyanceAllowance','ltaAllowance','specialAllowance','supplementaryAllowance','kgpAllowance','bonus','overtimePay','otherAllowances'];
    const gross = grossFields.reduce((s, k) => s + parseFloat(setData[k] || record[k as keyof typeof record] || '0'), 0);
    setData.grossPay = String(gross);

    const deductionFields = ['employeePf','professionalTax','incomeTax','tdsAmount','employeeEsic','otherDeductions'];
    const totalDeductions = deductionFields.reduce((s, k) => s + parseFloat(setData[k] || record[k as keyof typeof record] || '0'), 0);
    setData.totalDeductions = String(totalDeductions);

    const loanDed = parseFloat(setData.loanDeductions || record.loanDeductions || '0');
    const advDed = parseFloat(setData.advanceDeductions || record.advanceDeductions || '0');
    const reimb = parseFloat(setData.reimbursements || record.reimbursements || '0');
    const netPay = gross - totalDeductions - loanDed - advDed + reimb;
    setData.netPay = String(netPay);

    setData.verificationStatus = null;
    setData.verificationDetails = null;

    if (status === 'verified') {
      setData.status = 'generated';
      setData.verifiedBy = null;
      setData.verifiedAt = null;
    }

    const [updated] = await db.update(payrollRecords).set(setData).where(eq(payrollRecords.id, recordId)).returning();

    res.json({ message: 'Salary record updated successfully', record: updated });
  } catch (error: any) {
    console.error('Error editing payroll record:', error);
    sendError(res, error);
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
    sendError(res, error);
  }
});

/**
 * Auto-resolve GL mappings by looking up FormatCode in SAP Chart of Accounts.
 * Stores the resolved _SYS code in sap_acct_code for reuse.
 */
async function resolveGlMappingsFromSap(): Promise<{ resolved: number; failed: string[]; alreadyResolved: number }> {
  const unresolvedMappings = await db.select().from(glAccountMappings)
    .where(and(
      eq(glAccountMappings.isActive, true),
      sql`${glAccountMappings.glAccountCode} IS NOT NULL AND TRIM(${glAccountMappings.glAccountCode}) != ''`,
      sql`(${glAccountMappings.sapAcctCode} IS NULL OR TRIM(${glAccountMappings.sapAcctCode}) = '')`
    ));

  if (unresolvedMappings.length === 0) {
    const totalResolved = await db.select({ count: sql<number>`count(*)` }).from(glAccountMappings)
      .where(and(eq(glAccountMappings.isActive, true), sql`${glAccountMappings.sapAcctCode} IS NOT NULL AND TRIM(${glAccountMappings.sapAcctCode}) != ''`));
    return { resolved: 0, failed: [], alreadyResolved: Number(totalResolved[0]?.count || 0) };
  }

  let allSapAccounts: any[] = [];
  let nextLink: string | null = '/b1s/v1/ChartOfAccounts?$select=Code,Name,FormatCode&$top=500';

  while (nextLink) {
    const resp = await sapSession.request({ method: 'GET', path: nextLink });
    if (!resp.ok) break;
    const data = JSON.parse(resp.body);
    allSapAccounts = allSapAccounts.concat(data.value || []);
    nextLink = data['odata.nextLink'] || data['@odata.nextLink'] || null;
    if (nextLink && !nextLink.startsWith('/')) nextLink = '/b1s/v1/' + nextLink;
  }

  console.log(`[GL Auto-Resolve] Fetched ${allSapAccounts.length} SAP COA accounts for FormatCode lookup`);

  const formatCodeMap = new Map<string, string>();
  for (const acct of allSapAccounts) {
    if (acct.FormatCode) {
      const cleanFormat = acct.FormatCode.replace(/-/g, '').trim();
      formatCodeMap.set(cleanFormat, acct.Code);
      formatCodeMap.set(acct.FormatCode.trim(), acct.Code);
    }
  }

  let resolved = 0;
  const failed: string[] = [];

  for (const mapping of unresolvedMappings) {
    const glCode = mapping.glAccountCode!.trim();
    const cleanGlCode = glCode.replace(/-/g, '');
    const sysCode = formatCodeMap.get(cleanGlCode) || formatCodeMap.get(glCode);

    if (sysCode && sysCode.startsWith('_SYS')) {
      await db.update(glAccountMappings).set({
        sapAcctCode: sysCode,
        sapValidatedAt: new Date(),
      }).where(eq(glAccountMappings.id, mapping.id));
      console.log(`[GL Auto-Resolve] ${mapping.componentCode}|${mapping.postingContext}: ${glCode} → ${sysCode}`);
      resolved++;
    } else {
      failed.push(`${mapping.componentCode}|${mapping.postingContext} (${glCode})`);
      console.log(`[GL Auto-Resolve] FAILED: ${mapping.componentCode}|${mapping.postingContext} (${glCode}) — no SAP match found`);
    }
  }

  return { resolved, failed, alreadyResolved: 0 };
}

router.get('/payroll/records/:id/je-preview', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.id);
    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, recordId));
    if (!record) return res.status(404).json({ error: 'Payroll record not found' });

    const [employee] = await db.select({
      id: users.id, firstName: users.firstName, lastName: users.lastName,
      username: users.username, cardCode: users.cardCode, cardName: users.cardName, employeeCode: users.employeeCode,
      loanCardCode: users.loanCardCode,
    }).from(users).where(eq(users.id, record.userId));
    if (!employee) return res.status(400).json({ error: 'Employee not found' });

    const empName = employee.firstName && employee.lastName ? `${employee.firstName} ${employee.lastName}` : employee.username || 'Unknown';

    const period = await db.select({ startDate: payrollPeriods.startDate }).from(payrollPeriods).where(eq(payrollPeriods.id, record.periodId)).limit(1);
    let periodLabel = 'Unknown';
    let postingDate = new Date().toISOString().slice(0, 10);
    if (period[0]?.startDate) {
      const sd = new Date(period[0].startDate);
      const m = sd.getMonth() + 1;
      const y = sd.getFullYear();
      periodLabel = `${m}/${y}`;
      postingDate = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
    }

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));
    const glMap = new Map<string, string>();
    for (const m of allMappings) {
      const code = m.sapAcctCode || m.glAccountCode;
      if (code) glMap.set(`${m.componentCode}|${m.postingContext}`, code);
    }

    const { payload, totalDebit, totalCredit } = buildSalaryJePayload(record, employee, empName, periodLabel, postingDate, glMap);

    res.json({ payload, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 });
  } catch (error: any) {
    console.error('Error generating JE preview:', error);
    sendError(res, error);
  }
});

router.post('/payroll/gl-mapping/auto-resolve', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await resolveGlMappingsFromSap();
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Build salary JE payload for a payroll record using approved structure.
 * Returns { payload, jeLines, totalDebit, totalCredit } or throws with details.
 */
function buildSalaryJePayload(
  record: any,
  employee: any,
  empName: string,
  periodLabel: string,
  postingDate: string,   // ReferenceDate — last day of the salary period month (e.g. 2026-04-30)
  glMap: Map<string, string>,
  ptAmountOverride?: number,  // If provided, overrides record.professionalTax (ensures correct monthly/Feb rule)
  isTrial: boolean = false,
  trialRunNo?: number,
) {
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
    { code: 'OVERTIME', value: parseFloat(record.overtimePay || '0') },
    { code: 'OTHER_ALLOWANCES', value: parseFloat(record.otherAllowances || '0') },
  ];

  for (const comp of earningComponents) {
    if (comp.value > 0) {
      const acctCode = glMap.get(`${comp.code}|expense`);
      if (!acctCode) continue;
      jeLines.push({ Line_ID: lineNum++, AccountCode: acctCode, Debit: comp.value, Credit: 0, LineMemo: `${comp.code} - ${empName} - ${periodLabel}` });
    }
  }

  const employerPf = parseFloat(record.employerPf || '0');
  const employerEsic = parseFloat(record.employerEsic || '0');

  if (employerPf > 0) {
    const pfExpenseCode = glMap.get('PF_EMPLOYER|expense');
    if (pfExpenseCode) {
      jeLines.push({ Line_ID: lineNum++, AccountCode: pfExpenseCode, Debit: employerPf, Credit: 0, LineMemo: `PF_EMPLOYER - ${empName} - ${periodLabel}` });
    }
  }

  if (employerEsic > 0) {
    const esicExpenseCode = glMap.get('ESIC_EMPLOYER|expense');
    if (esicExpenseCode) {
      jeLines.push({ Line_ID: lineNum++, AccountCode: esicExpenseCode, Debit: employerEsic, Credit: 0, LineMemo: `ESIC_EMPLOYER - ${empName} - ${periodLabel}` });
    }
  }

  const employeePf = parseFloat(record.employeePf || record.providentFund || '0');
  const combinedPfPayable = employeePf + employerPf;
  if (combinedPfPayable > 0) {
    const pfLiabilityCode = glMap.get('PF_EMPLOYER|payroll_liability') || glMap.get('PF_EMPLOYEE|payroll_liability');
    if (pfLiabilityCode) {
      jeLines.push({ Line_ID: lineNum++, AccountCode: pfLiabilityCode, Debit: 0, Credit: combinedPfPayable, LineMemo: `PF_PAYABLE (Emp+Er) - ${empName} - ${periodLabel}` });
    }
  }

  const employeeEsic = parseFloat(record.employeeEsic || record.esiDeduction || record.esic || '0');
  const combinedEsicPayable = employeeEsic + employerEsic;
  if (combinedEsicPayable > 0) {
    const esicLiabilityCode = glMap.get('ESIC_EMPLOYER|payroll_liability') || glMap.get('ESIC_EMPLOYEE|payroll_liability');
    if (esicLiabilityCode) {
      jeLines.push({ Line_ID: lineNum++, AccountCode: esicLiabilityCode, Debit: 0, Credit: combinedEsicPayable, LineMemo: `ESIC_PAYABLE (Emp+Er) - ${empName} - ${periodLabel}` });
    }
  }

  // PT: use override (computed from period month rule: 200 for non-Feb, 300 for Feb) rather than stored record value
  const ptValue = ptAmountOverride !== undefined ? ptAmountOverride : parseFloat(record.professionalTax || '0');
  // TDS: always include in salary JE — standard Indian payroll accounting (withheld from employee, posted as govt liability)
  const tdsValue = parseFloat(record.tdsAmount || record.incomeTax || '0');
  const plainDeductions = [
    { code: 'PT', value: ptValue },
    { code: 'TDS', value: tdsValue },
  ];

  for (const comp of plainDeductions) {
    if (comp.value > 0) {
      const acctCode = glMap.get(`${comp.code}|payroll_liability`);
      if (!acctCode) continue;
      jeLines.push({ Line_ID: lineNum++, AccountCode: acctCode, Debit: 0, Credit: comp.value, LineMemo: `${comp.code} - ${empName} - ${periodLabel}` });
    }
  }

  const loanCardCode = employee.loanCardCode || null;
  const bpDeductions = [
    { code: 'LOAN_DEDUCTION', value: parseFloat(record.loanDeductions || '0') },
    { code: 'ADVANCE_DEDUCTION', value: parseFloat(record.advanceDeductions || '0') },
  ];

  for (const comp of bpDeductions) {
    if (comp.value > 0) {
      const line: any = { Line_ID: lineNum++ };
      if (loanCardCode) {
        line.ShortName = loanCardCode;
      } else {
        const acctCode = glMap.get(`${comp.code}|payroll_liability`);
        if (!acctCode) continue;
        line.AccountCode = acctCode;
      }
      line.Debit = 0;
      line.Credit = comp.value;
      line.LineMemo = `${comp.code} - ${empName} - ${periodLabel}`;
      jeLines.push(line);
    }
  }

  // NET_PAY: compute as the self-balancing amount (totalDebit - all other credits).
  // This guarantees the JE always balances regardless of stored netPay, and automatically
  // reflects any PT correction or TDS inclusion without depending on the stored record.netPay.
  const preNetPayDebit = Math.round(jeLines.reduce((sum: number, l: any) => sum + (l.Debit || 0), 0) * 100) / 100;
  const preNetPayCredit = Math.round(jeLines.reduce((sum: number, l: any) => sum + (l.Credit || 0), 0) * 100) / 100;
  const netPayValue = Math.round((preNetPayDebit - preNetPayCredit) * 100) / 100;

  if (netPayValue > 0.005) {
    // NET_PAY: use the employee's SAP Business Partner Card Code (ShortName).
    // SAP B1 automatically routes this through the employee BP's reconciliation/control account.
    // Do NOT use a GL AccountCode here — posting directly to the BP control account is rejected by SAP
    // with "Cannot perform transaction in controlling type account".
    if (employee.cardCode && employee.cardCode.trim() !== '') {
      jeLines.push({
        Line_ID: lineNum++,
        ShortName: employee.cardCode.trim(),
        Debit: 0,
        Credit: netPayValue,
        LineMemo: `NET_PAY - ${empName} - ${periodLabel}`,
      });
    } else {
      // Fallback: use GL account only if employee has no BP card code
      const netPayCode = glMap.get('NET_PAY|payroll_liability');
      if (netPayCode) {
        jeLines.push({
          Line_ID: lineNum++,
          AccountCode: netPayCode,
          Debit: 0,
          Credit: netPayValue,
          LineMemo: `NET_PAY - ${empName} - ${periodLabel}`,
        });
      }
    }
  }

  const totalDebit = Math.round(jeLines.reduce((sum: number, l: any) => sum + (l.Debit || 0), 0) * 100) / 100;
  const totalCredit = Math.round(jeLines.reduce((sum: number, l: any) => sum + (l.Credit || 0), 0) * 100) / 100;

  // JournalEntries in SAP B1 Service Layer use ReferenceDate as the posting date.
  // DocDate is NOT a valid field for JEs (only for A/R, A/P documents).
  // ReferenceDate = last day of the salary period month.
  const memoPrefix = isTrial ? `[TRIAL #${trialRunNo ?? '?'}] ` : '';
  const payload = {
    ReferenceDate: postingDate,
    Memo: `${memoPrefix}Salary JE - ${empName} - ${periodLabel}`,
    Reference2: employee.cardCode,
    Reference3: isTrial ? '92B-TRIAL' : '92B',
    U_Employee_Name: empName,
    U_PayrollRunType: isTrial ? 'TRIAL' : 'OFFICIAL',
    JournalEntryLines: jeLines,
  };

  return { payload, jeLines, totalDebit, totalCredit };
}

/**
 * Post payroll salary JE to SAP B1
 */
router.post('/payroll/records/:id/post-sap', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.id);
    const currentUser = req.user as any;

    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, recordId));
    if (!record) return res.status(404).json({ error: 'Payroll record not found' });

    if (record.salarySource === 'manual_salary') return res.status(400).json({ error: 'Manual salary records must be posted through the Manual Salary tab.' });
    if (record.sapPostingStatus === 'posted') return res.status(400).json({ error: 'Already posted to SAP', sapJeNumber: record.sapJeNumber, sapDocEntry: record.sapDocEntry });
    if (record.status === 'reversed' || record.reversalSapDocEntry) return res.status(400).json({ error: 'Reversed record cannot be reposted.' });
    if (record.status !== 'verified') return res.status(400).json({ error: `Only verified records can transfer to SAP. Current: ${record.status || 'generated'}` });

    const vs = record.verificationStatus || 'pending';
    if (vs === 'failed') return res.status(400).json({ error: 'Calculation verification failed. Fix and re-verify.' });
    if (vs === 'pending') return res.status(400).json({ error: 'Not yet verified by Payroll Calculation Verifier.' });
    if (vs !== 'passed' && vs !== 'overridden') return res.status(400).json({ error: `Verification status "${vs}" does not allow SAP posting.` });

    const [employee] = await db.select({
      id: users.id, firstName: users.firstName, lastName: users.lastName,
      username: users.username, cardCode: users.cardCode, cardName: users.cardName, employeeCode: users.employeeCode,
      loanCardCode: users.loanCardCode,
    }).from(users).where(eq(users.id, record.userId));
    if (!employee) return res.status(400).json({ error: 'Employee not found' });

    const empName = employee.firstName && employee.lastName ? `${employee.firstName} ${employee.lastName}` : employee.username || 'Unknown';

    if (!employee.cardCode || employee.cardCode.trim() === '') {
      await db.update(payrollRecords).set({ sapPostingStatus: 'failed', sapErrorMessage: `No SAP BP code for ${empName}`, updatedAt: new Date() }).where(eq(payrollRecords.id, recordId));
      return res.status(400).json({ error: `No SAP BP code for ${empName}. Assign a BP code first.` });
    }

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));

    const POSTING_COMPONENTS = [
      { code: 'BASIC', context: 'expense' },
      { code: 'HRA', context: 'expense' },
      { code: 'CONVEYANCE', context: 'expense' },
      { code: 'LTA', context: 'expense' },
      { code: 'SPECIAL_ALLOWANCE', context: 'expense' },
      { code: 'SUPPLEMENTARY', context: 'expense' },
      { code: 'KGP', context: 'expense' },
      { code: 'OVERTIME', context: 'expense' },
      { code: 'OTHER_ALLOWANCES', context: 'expense' },
      { code: 'PF_EMPLOYER', context: 'expense' },
      { code: 'ESIC_EMPLOYER', context: 'expense' },
      { code: 'PF_EMPLOYEE', context: 'payroll_liability' },
      { code: 'PF_EMPLOYER', context: 'payroll_liability' },
      { code: 'ESIC_EMPLOYEE', context: 'payroll_liability' },
      { code: 'ESIC_EMPLOYER', context: 'payroll_liability' },
      { code: 'PT', context: 'payroll_liability' },
      { code: 'TDS', context: 'payroll_liability' },
      { code: 'LOAN_DEDUCTION', context: 'payroll_liability' },
      { code: 'ADVANCE_DEDUCTION', context: 'payroll_liability' },
      { code: 'NET_PAY', context: 'payroll_liability' },
    ];

    const glMap = new Map<string, string>();
    const unresolvedCodes: string[] = [];
    const missingMappings: string[] = [];

    for (const comp of POSTING_COMPONENTS) {
      const mapping = allMappings.find(m => m.componentCode === comp.code && m.postingContext === comp.context);
      if (!mapping || !mapping.glAccountCode || mapping.glAccountCode.trim() === '') {
        missingMappings.push(`${comp.code} (${comp.context})`);
        continue;
      }
      const sapCode = mapping.sapAcctCode && mapping.sapAcctCode.trim() !== '' ? mapping.sapAcctCode.trim() : null;
      if (!sapCode || !sapCode.startsWith('_SYS')) {
        unresolvedCodes.push(`${comp.code}|${comp.context} (${mapping.glAccountCode})`);
      } else {
        glMap.set(`${comp.code}|${comp.context}`, sapCode);
      }
    }

    if (unresolvedCodes.length > 0) {
      console.log(`[Salary JE] ${unresolvedCodes.length} unresolved GLs — attempting auto-resolution...`);
      try {
        const resolveResult = await resolveGlMappingsFromSap();
        console.log(`[Salary JE] Auto-resolved: ${resolveResult.resolved}, failed: ${resolveResult.failed.length}`);

        if (resolveResult.resolved > 0) {
          const refreshed = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));
          unresolvedCodes.length = 0;
          for (const comp of POSTING_COMPONENTS) {
            const mapping = refreshed.find(m => m.componentCode === comp.code && m.postingContext === comp.context);
            if (!mapping || !mapping.glAccountCode || mapping.glAccountCode.trim() === '') continue;
            const sapCode = mapping.sapAcctCode && mapping.sapAcctCode.trim() !== '' ? mapping.sapAcctCode.trim() : null;
            if (!sapCode || !sapCode.startsWith('_SYS')) {
              unresolvedCodes.push(`${comp.code}|${comp.context} (${mapping.glAccountCode})`);
            } else {
              glMap.set(`${comp.code}|${comp.context}`, sapCode);
            }
          }
        }
      } catch (resolveErr: any) {
        console.error(`[Salary JE] Auto-resolve failed:`, resolveErr.message);
      }
    }

    if (unresolvedCodes.length > 0) {
      const errMsg = `Unresolved SAP _SYS codes: ${unresolvedCodes.join(', ')}. Run GL Auto-Resolve first.`;
      await db.update(payrollRecords).set({ sapPostingStatus: 'failed', sapErrorMessage: errMsg, updatedAt: new Date() }).where(eq(payrollRecords.id, recordId));
      return res.status(400).json({ error: errMsg, unresolvedCodes });
    }

    const [period] = await db.select({ periodName: payrollPeriods.periodName, startDate: payrollPeriods.startDate })
      .from(payrollPeriods).where(eq(payrollPeriods.id, record.periodId));
    const periodLabel = period?.periodName || 'Unknown Period';

    // DocDate = ReferenceDate = last day of the payroll period month.
    // e.g. April 2026 → 2026-04-30, February → last day of Feb, March → 31.
    // SAP exchange rates must be configured in B1 for this date.
    const periodEndDate = period?.startDate
      ? new Date(new Date(period.startDate).getFullYear(), new Date(period.startDate).getMonth() + 1, 0).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    // Compute correct PT override from period month (Rule: ₹200 for all months, ₹300 only for February)
    // This overrides whatever is stored in record.professionalTax to ensure correctness at JE-build time.
    const ptSettings = await db.select().from(payrollSettings).where(
      sql`${payrollSettings.settingName} IN ('professional_tax_monthly', 'professional_tax_february')`
    );
    let ptMonthly = 200, ptFebruary = 300;
    for (const s of ptSettings) {
      if (s.settingName === 'professional_tax_monthly') ptMonthly = parseFloat(s.settingValue) || 200;
      if (s.settingName === 'professional_tax_february') ptFebruary = parseFloat(s.settingValue) || 300;
    }
    const periodMonth = period?.startDate ? new Date(period.startDate).getMonth() + 1 : new Date().getMonth() + 1;
    const ptOverride = periodMonth === 2 ? ptFebruary : ptMonthly;

    const { payload: jePayload, jeLines, totalDebit, totalCredit } = buildSalaryJePayload(record, employee, empName, periodLabel, periodEndDate, glMap, ptOverride);

    if (jeLines.length === 0) {
      await db.update(payrollRecords).set({ sapPostingStatus: 'failed', sapErrorMessage: 'No JE lines generated', updatedAt: new Date() }).where(eq(payrollRecords.id, recordId));
      return res.status(400).json({ error: 'No JE lines could be generated.' });
    }

    const invalidLines = jeLines.filter((l: any) => {
      if (l.ShortName && !l.AccountCode) return false;
      return !l.AccountCode || !l.AccountCode.startsWith('_SYS');
    });
    if (invalidLines.length > 0) {
      const errMsg = `Invalid AccountCodes (not _SYS): ${invalidLines.map((l: any) => l.AccountCode).join(', ')}`;
      await db.update(payrollRecords).set({ sapPostingStatus: 'failed', sapErrorMessage: errMsg, updatedAt: new Date() }).where(eq(payrollRecords.id, recordId));
      return res.status(400).json({ error: errMsg });
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      const errMsg = `JE imbalance: Debit=${totalDebit.toFixed(2)} Credit=${totalCredit.toFixed(2)} Diff=${(totalDebit - totalCredit).toFixed(2)}`;
      await db.update(payrollRecords).set({ sapPostingStatus: 'failed', sapErrorMessage: errMsg, updatedAt: new Date() }).where(eq(payrollRecords.id, recordId));
      return res.status(400).json({ error: errMsg });
    }

    console.log(`[Salary JE] ${empName} (${employee.cardCode}): ${jeLines.length} lines, Debit=${totalDebit.toFixed(2)}, Credit=${totalCredit.toFixed(2)}`);
    console.log(`[Salary JE] Payload lines:`, JSON.stringify(jeLines.map((l: any, i: number) => ({
      idx: i, AccountCode: l.AccountCode, ControlAccount: l.ControlAccount, ShortName: l.ShortName, D: l.Debit, C: l.Credit, memo: l.LineMemo?.substring(0, 30)
    }))));

    await db.update(payrollRecords).set({
      sapPostingStatus: 'pending',
      sapPayloadStatus: 'ready',
      sapRequestLog: jePayload as any,
      sapErrorMessage: null,
      updatedAt: new Date(),
    }).where(eq(payrollRecords.id, recordId));

    try {
      const sapResponse = await sapSession.request({ method: 'POST', path: '/b1s/v1/JournalEntries', body: jePayload });

      if (sapResponse.ok) {
        const responseData = JSON.parse(sapResponse.body);
        await db.update(payrollRecords).set({
          sapDocEntry: responseData.DocEntry,
          sapJeNumber: String(responseData.Number || responseData.DocNum || responseData.DocEntry),
          sapPostedAt: new Date(),
          sapPostingStatus: 'posted',
          sapPayloadStatus: 'posted',
          status: 'transferred',
          sapErrorMessage: null,
          sapResponseLog: responseData as any,
          updatedAt: new Date(),
        }).where(eq(payrollRecords.id, recordId));

        return res.json({
          success: true,
          message: `Salary JE posted to SAP successfully`,
          sapDocEntry: responseData.DocEntry,
          sapJeNumber: String(responseData.Number || responseData.DocNum || responseData.DocEntry),
        });
      } else {
        let errorMsg = sapResponse.body;
        try { const p = JSON.parse(sapResponse.body); errorMsg = p?.error?.message?.value || errorMsg; } catch (_) {}
        await db.update(payrollRecords).set({
          sapPostingStatus: 'failed', sapErrorMessage: errorMsg,
          sapResponseLog: { statusCode: sapResponse.statusCode, body: sapResponse.body } as any,
          updatedAt: new Date(),
        }).where(eq(payrollRecords.id, recordId));
        return res.status(500).json({ error: errorMsg });
      }
    } catch (sapErr: any) {
      const errMsg = sapErr.message || 'SAP connection error';
      await db.update(payrollRecords).set({ sapPostingStatus: 'failed', sapErrorMessage: errMsg, updatedAt: new Date() }).where(eq(payrollRecords.id, recordId));
      return res.status(500).json({ error: errMsg });
    }
  } catch (error: any) {
    console.error('Error posting salary JE to SAP:', error);
    sendError(res, error);
  }
});

router.post('/payroll/records/:id/reverse-sap', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.id);
    const currentUser = req.user as any;

    const [record] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, recordId));
    if (!record) return res.status(404).json({ error: 'Payroll record not found' });
    if (record.salarySource === 'manual_salary') return res.status(400).json({ error: 'Manual salary records must be reversed through the Manual Salary tab.' });
    if (record.sapPostingStatus !== 'posted') return res.status(400).json({ error: 'Only SAP-posted records can be reversed.' });
    if (record.reversalSapDocEntry) return res.status(400).json({ error: 'Already reversed.', reversalJeNumber: record.reversalSapJeNumber });

    const [employee] = await db.select({
      id: users.id, firstName: users.firstName, lastName: users.lastName,
      username: users.username, cardCode: users.cardCode, employeeCode: users.employeeCode,
      loanCardCode: users.loanCardCode,
    }).from(users).where(eq(users.id, record.userId));
    if (!employee) return res.status(400).json({ error: 'Employee not found' });

    const empName = employee.firstName && employee.lastName ? `${employee.firstName} ${employee.lastName}` : employee.username || 'Unknown';

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));
    const glMap = new Map<string, string>();
    for (const m of allMappings) {
      if (m.componentCode && m.postingContext) {
        const sapCode = m.sapAcctCode && m.sapAcctCode.trim() !== '' ? m.sapAcctCode.trim() : null;
        if (sapCode && sapCode.startsWith('_SYS')) {
          glMap.set(`${m.componentCode}|${m.postingContext}`, sapCode);
        }
      }
    }

    const [period] = await db.select({ periodName: payrollPeriods.periodName, startDate: payrollPeriods.startDate })
      .from(payrollPeriods).where(eq(payrollPeriods.id, record.periodId));
    const periodLabel = period?.periodName || 'Unknown Period';
    const postingDate = new Date().toISOString().split('T')[0];
    const originalJeRef = record.sapJeNumber || String(record.sapDocEntry);

    const { payload: origPayload, jeLines: origLines } = buildSalaryJePayload(record, employee, empName, periodLabel, postingDate, glMap);

    const reversalLines = origLines.map((l: any, idx: number) => ({
      Line_ID: idx,
      AccountCode: l.AccountCode,
      ...(l.ShortName ? { ShortName: l.ShortName } : {}),
      Debit: l.Credit || 0,
      Credit: l.Debit || 0,
      LineMemo: `REVERSAL - ${l.LineMemo}`,
    }));

    if (reversalLines.length === 0) return res.status(400).json({ error: 'No reversal lines generated.' });

    const jePayload = {
      ReferenceDate: postingDate,
      Memo: `REVERSAL - Salary JE #${originalJeRef} - ${empName} - ${periodLabel}`,
      Reference2: employee.cardCode || '',
      Reference3: `REV-SAL-${originalJeRef}`,
      U_Employee_Name: empName,
      JournalEntryLines: reversalLines,
    };

    try {
      const sapResponse = await sapSession.request({ method: 'POST', path: '/b1s/v1/JournalEntries', body: jePayload });

      const userName = currentUser.firstName && currentUser.lastName ? `${currentUser.firstName} ${currentUser.lastName}` : currentUser.username;

      if (sapResponse.ok) {
        const responseData = JSON.parse(sapResponse.body);
        const reversalDocEntry = responseData.DocEntry;
        const reversalJeNumber = String(responseData.Number || responseData.DocNum || responseData.DocEntry);

        const history = Array.isArray(record.statusHistory) ? [...(record.statusHistory as any[])] : [];
        history.push({ from: record.status || 'transferred', to: 'reversed', action: 'reverse', reason: `Reversal JE #${reversalJeNumber}`, by: userName, byId: currentUser.id, at: new Date().toISOString() });

        await db.update(payrollRecords).set({
          status: 'reversed', reversalSapDocEntry: reversalDocEntry, reversalSapJeNumber: reversalJeNumber,
          reversalSapPostedAt: new Date(), reversedBy: currentUser.id, reversedAt: new Date(),
          reversalMemo: `REVERSAL of Salary JE #${originalJeRef} - ${empName} - ${periodLabel}`,
          statusHistory: history, updatedAt: new Date(),
        }).where(eq(payrollRecords.id, recordId));

        return res.json({ success: true, message: 'Reversal JE posted', originalJeNumber: record.sapJeNumber, originalDocEntry: record.sapDocEntry, reversalDocEntry, reversalJeNumber });
      } else {
        let errorMsg = `SAP reversal failed (${sapResponse.statusCode})`;
        try { const errParsed = JSON.parse(sapResponse.body); errorMsg = errParsed?.error?.message?.value || errorMsg; } catch (_) {}
        return res.status(500).json({ error: errorMsg });
      }
    } catch (sapErr: any) {
      return res.status(500).json({ error: `SAP connection error: ${sapErr.message}` });
    }
  } catch (error: any) {
    console.error('Error posting reversal salary JE to SAP:', error);
    sendError(res, error);
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

    const absentRecords = await db
      .select({ date: attendanceRecords.date, status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.userId, record.userId),
          gte(attendanceRecords.date, record.startDate),
          lte(attendanceRecords.date, record.endDate),
          inArray(attendanceRecords.status, ['absent', 'half_day'])
        )
      )
      .orderBy(attendanceRecords.date);
    const explicitAbsentDates = absentRecords.map(r => r.date);

    const allAttRecords = await db
      .select({ date: attendanceRecords.date })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.userId, record.userId),
          gte(attendanceRecords.date, record.startDate),
          lte(attendanceRecords.date, record.endDate)
        )
      );
    const recordedDates = new Set(allAttRecords.map(r => r.date));

    const holidayRecords = await db
      .select({ date: companyHolidays.date })
      .from(companyHolidays)
      .where(
        and(
          gte(companyHolidays.date, record.startDate),
          lte(companyHolidays.date, record.endDate)
        )
      );
    const holidaySet = new Set(holidayRecords.map(r => r.date));

    const empUser2 = await db.select({ weeklyOffDays: users.weeklyOffDays }).from(users).where(eq(users.id, record.userId)).limit(1);
    const weeklyOffDays: number[] = empUser2[0]?.weeklyOffDays || [0];

    const absentDateEntries: { date: string; type: string }[] = [];
    for (const r of absentRecords) {
      absentDateEntries.push({ date: r.date, type: r.status === 'half_day' ? 'Half Day' : 'LOP' });
    }

    const startStr = typeof record.startDate === 'string' ? record.startDate : new Date(record.startDate).toISOString().split('T')[0];
    const endStr = typeof record.endDate === 'string' ? record.endDate : new Date(record.endDate).toISOString().split('T')[0];
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const pStart = new Date(sy, sm - 1, sd);
    const pEnd = new Date(ey, em - 1, ed);
    for (let dt = new Date(pStart); dt <= pEnd; dt.setDate(dt.getDate() + 1)) {
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayOfWeek = dt.getDay();
      if (weeklyOffDays.includes(dayOfWeek)) continue;
      if (holidaySet.has(dateStr)) continue;
      if (recordedDates.has(dateStr)) continue;
      absentDateEntries.push({ date: dateStr, type: 'LOP' });
    }

    absentDateEntries.sort((a, b) => a.date.localeCompare(b.date));
    salarySlipData.absentDates = absentDateEntries;

    const generator = new SalarySlipGenerator();
    await generator.generateSalarySlip(salarySlipData, res);

  } catch (error) {
    console.error('Error generating salary slip:', error);
    sendError(res, error);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Trial Payroll — SAP JE Post, Reversal Confirm, Parity Verification
// Baseline: docs/payroll-governance-v4.1-baseline.md §6, §10
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /admin/payroll/trial/:recordId/post-sap-je
 * Post a trial salary JE to SAP B1 (Memo prefix [TRIAL #N], Reference3=92B-TRIAL).
 * Only records in trial_status='generated' may be posted.
 * Sets trial_status='sap_posted' on success.
 */
router.post('/payroll/trial/:recordId/post-sap-je', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.recordId);
    const currentUser = req.user as any;
    if (!['Admin', 'Finance', 'Superuser'].includes(currentUser?.role)) {
      return res.status(403).json({ error: 'Finance/Admin/Superuser role required to post trial JEs' });
    }

    const [record] = await db.select().from(payrollRecords).where(and(eq(payrollRecords.id, recordId), eq(payrollRecords.recordType as any, 'trial')));
    if (!record) return res.status(404).json({ error: 'Trial payroll record not found' });
    if (record.trialStatus !== 'generated') return res.status(409).json({ error: `Only 'generated' trial records can be SAP-posted. Current: ${record.trialStatus}` });

    const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.id, record.periodId));
    if (!period) return res.status(400).json({ error: 'Period not found' });

    const [employee] = await db.select({
      id: users.id, firstName: users.firstName, lastName: users.lastName,
      username: users.username, cardCode: users.cardCode, cardName: users.cardName,
      loanCardCode: users.loanCardCode,
    }).from(users).where(eq(users.id, record.userId));
    if (!employee) return res.status(400).json({ error: 'Employee not found' });

    const empName = employee.firstName && employee.lastName ? `${employee.firstName} ${employee.lastName}` : employee.username || 'Unknown';

    const allMappings = await db.select().from(glAccountMappings).where(eq(glAccountMappings.isActive, true));
    const glMap = new Map<string, string>();
    for (const m of allMappings) {
      if (m.componentCode && m.postingContext) {
        const sapCode = m.sapAcctCode && m.sapAcctCode.trim() !== '' ? m.sapAcctCode.trim() : null;
        if (sapCode && sapCode.startsWith('_SYS')) glMap.set(`${m.componentCode}|${m.postingContext}`, sapCode);
      }
    }

    // Compute posting date = last day of period month
    const periodEnd = new Date(period.endDate);
    const lastDay = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 0);
    const postingDate = lastDay.toISOString().slice(0, 10);

    const periodMonth = periodEnd.getMonth() + 1;
    const ptIsFebruary = periodMonth === 2;
    const ptRows = await db.select().from(payrollSettings).where(sql`${payrollSettings.settingName} IN ('professional_tax_monthly', 'professional_tax_february')`);
    let ptMonthly = 200, ptFebruary = 300;
    for (const r of ptRows) {
      if (r.settingName === 'professional_tax_monthly') ptMonthly = parseFloat(r.settingValue) || 200;
      if (r.settingName === 'professional_tax_february') ptFebruary = parseFloat(r.settingValue) || 300;
    }
    const ptAmountForPeriod = ptIsFebruary ? ptFebruary : ptMonthly;

    let jePayload: any;
    try {
      const built = buildSalaryJePayload(record, employee, empName, period.periodName, postingDate, glMap, ptAmountForPeriod, true, record.trialRunNo ?? undefined);
      jePayload = built.payload;
      console.log(`[TrialSapJE] Built payload for trial #${record.trialRunNo}, debit=${built.totalDebit.toFixed(2)}, credit=${built.totalCredit.toFixed(2)}`);
    } catch (buildErr: any) {
      return res.status(400).json({ error: `JE payload build failed: ${buildErr.message}` });
    }

    // Phase 1.1 — SAP Session Unification: use central session (sapSession.request) only.
    // getSapClient() was undefined (ReferenceError). Replaced with sapSession (imported line 51).
    // Central session handles retry, -1102 recovery, and cookie management internally.
    console.log(`[TrialSapJE] Posting trial #${record.trialRunNo} via central SAP session...`);
    try {
      const jeResp = await sapSession.request({ method: 'POST', path: '/b1s/v1/JournalEntries', body: jePayload });
      if (!jeResp.ok) {
        const errBody = typeof jeResp.body === 'string' ? jeResp.body : JSON.stringify(jeResp.body);
        await db.update(payrollRecords).set({ sapPostingStatus: 'failed', sapErrorMessage: errBody, updatedAt: new Date() }).where(eq(payrollRecords.id, recordId));
        return res.status(500).json({ error: `SAP JE posting failed (${jeResp.statusCode}): ${errBody}` });
      }
      const jeData = typeof jeResp.body === 'string' ? JSON.parse(jeResp.body) : jeResp.body;
      const docEntry = jeData?.DocEntry;
      const jeNumber = jeData?.JournalEntryNumber ?? docEntry;

      await db.update(payrollRecords).set({
        trialStatus: 'sap_posted',
        sapPostingStatus: 'posted',
        sapDocEntry: String(docEntry),
        sapJeNumber: String(jeNumber ?? docEntry),
        sapPostedAt: new Date(),
        sapPostedBy: currentUser.id,
        updatedAt: new Date(),
      } as any).where(eq(payrollRecords.id, recordId));

      console.log(`✅ [TrialSapJE] Posted trial #${record.trialRunNo} to SAP. DocEntry=${docEntry} sap_session_source=central`);
      return res.json({ success: true, trialRunNo: record.trialRunNo, sapDocEntry: docEntry, sapJeNumber: jeNumber ?? docEntry, message: `Trial #${record.trialRunNo} JE posted to SAP.` });
    } catch (sapErr: any) {
      const errMsg = sapErr.message || String(sapErr);
      await db.update(payrollRecords).set({ sapPostingStatus: 'failed', sapErrorMessage: errMsg, updatedAt: new Date() }).where(eq(payrollRecords.id, recordId));
      return res.status(500).json({ error: errMsg });
    }
  } catch (error: any) {
    console.error('Error posting trial JE to SAP:', error);
    sendError(res, error);
  }
});

/**
 * POST /admin/payroll/trial/:recordId/confirm-reversal
 * Mark a trial record as fully reversed (after manual SAP reversal).
 * Sets trial_status='reversed'. Body: { reversalSapDocEntry, reversalMemo? }
 */
router.post('/payroll/trial/:recordId/confirm-reversal', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.recordId);
    const currentUser = req.user as any;
    if (!['Admin', 'Finance', 'Superuser'].includes(currentUser?.role)) {
      return res.status(403).json({ error: 'Finance/Admin/Superuser role required' });
    }

    const { reversalSapDocEntry, reversalMemo } = req.body;
    if (!reversalSapDocEntry) return res.status(400).json({ error: 'reversalSapDocEntry is required' });

    const [record] = await db.select().from(payrollRecords).where(and(eq(payrollRecords.id, recordId), eq(payrollRecords.recordType as any, 'trial')));
    if (!record) return res.status(404).json({ error: 'Trial payroll record not found' });
    if (record.trialStatus !== 'sap_posted') return res.status(409).json({ error: `Only 'sap_posted' trials can be confirmed-reversed. Current: ${record.trialStatus}` });

    await db.update(payrollRecords).set({
      trialStatus: 'reversed',
      reversalSapDocEntry: String(reversalSapDocEntry),
      reversalMemo: reversalMemo || `Trial #${record.trialRunNo} reversed`,
      reversedBy: currentUser.id,
      reversedAt: new Date(),
      updatedAt: new Date(),
    } as any).where(eq(payrollRecords.id, recordId));

    console.log(`✅ [TrialReversal] Trial #${record.trialRunNo} (record ${recordId}) confirmed reversed. DocEntry=${reversalSapDocEntry}`);
    res.json({ success: true, trialRunNo: record.trialRunNo, message: `Trial #${record.trialRunNo} reversal confirmed. Period now clear for next trial or official run.` });
  } catch (error: any) {
    console.error('Error confirming trial reversal:', error);
    sendError(res, error);
  }
});

/**
 * POST /admin/payroll/verify/trial-vs-official
 * 21-field parity comparison between latest reversed trial and official record.
 * Baseline: docs/payroll-governance-v4.1-baseline.md §10
 * Body: { periodId, userId }
 */
router.post('/payroll/verify/trial-vs-official', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user as any;
    if (!['Admin', 'Finance', 'Superuser', 'HR'].includes(currentUser?.role)) {
      return res.status(403).json({ error: 'Finance/Admin/HR/Superuser role required' });
    }

    const { periodId, userId } = req.body;
    if (!periodId || !userId) return res.status(400).json({ error: 'periodId and userId are required' });

    const [trialRecord] = await db.select().from(payrollRecords)
      .where(and(
        eq(payrollRecords.periodId, periodId),
        eq(payrollRecords.userId, userId),
        eq(payrollRecords.recordType as any, 'trial'),
        eq(payrollRecords.trialStatus as any, 'reversed'),
      ))
      .orderBy(desc(payrollRecords.trialRunNo))
      .limit(1);

    if (!trialRecord) return res.status(404).json({ error: 'No reversed trial record found for this employee/period. Run and reverse a trial first.' });

    const [officialRecord] = await db.select().from(payrollRecords)
      .where(and(
        eq(payrollRecords.periodId, periodId),
        eq(payrollRecords.userId, userId),
        eq(payrollRecords.recordType as any, 'official'),
      ))
      .orderBy(desc(payrollRecords.runNumber))
      .limit(1);

    if (!officialRecord) return res.status(404).json({ error: 'No official payroll record found for this employee/period. Run official payroll first.' });

    type ParityField = {
      field: string;
      label: string;
      trial: string | null;
      official: string | null;
      match: boolean;
      delta?: string;
    };

    const numF = (v: any) => parseFloat(v || '0');
    const cmpNum = (a: any, b: any, label: string): ParityField => {
      const ta = numF(a), tb = numF(b);
      const delta = Math.abs(ta - tb);
      return { field: label, label, trial: ta.toFixed(2), official: tb.toFixed(2), match: delta < 0.01, delta: delta.toFixed(2) };
    };
    const cmpStr = (a: any, b: any, label: string): ParityField => {
      return { field: label, label, trial: String(a ?? ''), official: String(b ?? ''), match: String(a ?? '') === String(b ?? '') };
    };

    const fields: ParityField[] = [
      cmpNum(trialRecord.grossPay, officialRecord.grossPay, 'grossPay'),
      cmpNum(trialRecord.baseSalary, officialRecord.baseSalary, 'proratedBase'),
      cmpNum(trialRecord.hra, officialRecord.hra, 'hra'),
      cmpNum(trialRecord.conveyanceAllowance, officialRecord.conveyanceAllowance, 'conveyance'),
      cmpNum(trialRecord.ltaAllowance, officialRecord.ltaAllowance, 'lta'),
      cmpNum(trialRecord.specialAllowance, officialRecord.specialAllowance, 'specialAllowance'),
      cmpNum(trialRecord.supplementaryAllowance, officialRecord.supplementaryAllowance, 'supplementaryAllowance'),
      cmpNum(trialRecord.kgpAllowance, officialRecord.kgpAllowance, 'kgpAllowance'),
      cmpNum(trialRecord.bonus, officialRecord.bonus, 'bonus'),
      cmpNum(trialRecord.overtimePay, officialRecord.overtimePay, 'overtimePay'),
      cmpNum(trialRecord.employeePf, officialRecord.employeePf, 'employeePF'),
      cmpNum(trialRecord.employerPf, officialRecord.employerPf, 'employerPF'),
      cmpNum(trialRecord.employeeEsic, officialRecord.employeeEsic, 'employeeESIC'),
      cmpNum(trialRecord.employerEsic, officialRecord.employerEsic, 'employerESIC'),
      cmpNum(trialRecord.professionalTax, officialRecord.professionalTax, 'professionalTax'),
      cmpNum(trialRecord.gratuity, officialRecord.gratuity, 'gratuity'),
      cmpNum(trialRecord.totalDeductions, officialRecord.totalDeductions, 'totalDeductions'),
      cmpNum(trialRecord.netPay, officialRecord.netPay, 'netPay'),
      cmpNum(trialRecord.paidDays, officialRecord.paidDays, 'paidDays'),
      cmpNum(trialRecord.lopDays, officialRecord.lopDays, 'lopDays'),
      cmpStr(trialRecord.calculationEngineVersion, officialRecord.calculationEngineVersion, 'calculationEngineVersion'),
    ];

    const mismatches = fields.filter(f => !f.match);
    const allMatch = mismatches.length === 0;

    res.json({
      periodId,
      userId,
      trialRecordId: trialRecord.id,
      trialRunNo: trialRecord.trialRunNo,
      officialRecordId: officialRecord.id,
      officialRunNumber: officialRecord.runNumber,
      totalFields: fields.length,
      matchCount: fields.filter(f => f.match).length,
      mismatchCount: mismatches.length,
      allMatch,
      parityStatus: allMatch ? 'PASS' : 'FAIL',
      fields,
      mismatches,
      summary: allMatch
        ? `All 21 fields match between Trial #${trialRecord.trialRunNo} and Official Run #${officialRecord.runNumber}.`
        : `${mismatches.length} field(s) differ between Trial #${trialRecord.trialRunNo} and Official Run #${officialRecord.runNumber}: ${mismatches.map(m => m.field).join(', ')}`,
    });
  } catch (error: any) {
    console.error('Error in parity verification:', error);
    sendError(res, error);
  }
});

export default router;