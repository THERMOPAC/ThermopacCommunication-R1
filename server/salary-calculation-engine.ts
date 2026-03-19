import { db } from './db';
import { users, employeeSalaries, attendanceRecords, leaveRequests, workweekPolicies, companyHolidays, workLocations, leaveBalances, leaveTypes } from '@shared/schema';
import { eq, and, between, sql, desc, asc, gte, lte } from 'drizzle-orm';

export interface SalaryCalculationInput {
  userId: number;
  month: number;
  year: number;
  overtimeHours?: number;
  overtimeRate?: number;
  bonusAmount?: number;
  deductions?: {
    loanDeduction?: number;
    advanceDeduction?: number;
    otherDeductions?: number;
  };
  leaveWithoutPay?: number;
}

export interface SalaryCalculationResult {
  // Employee Details
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  department: string;
  designation: string;
  salaryType: 'monthly' | 'daily';
  
  // Period Details
  month: number;
  year: number;
  workingDays: number;
  actualDays: number;
  paidDays: number;
  
  // Attendance Details
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  holidayDays: number;
  totalWorkingHours: number;
  overtimeHours: number;
  
  // Earnings
  basicSalary: number;
  grossBasic: number;
  houseRentAllowance: number;
  conveyanceAllowance: number;
  ltaAllowance: number;
  specialAllowance: number;
  supplementaryAllowance: number;
  kgpAllowance: number;
  bonus: number;
  overtimePay: number;
  grossEarnings: number;
  
  // Deductions
  employeePF: number;
  employeeESIC: number;
  professionalTax: number;
  loanDeduction: number;
  advanceDeduction: number;
  otherDeductions: number;
  leaveWithoutPayDeduction: number;
  totalDeductions: number;
  
  // Net Pay
  netPay: number;
  
  // Employer Contributions
  employerPF: number;
  employerESIC: number;
  gratuity: number;
  groupInsurance: number;
  totalEmployerContributions: number;
  
  // CTC
  ctcMonthly: number;
  ctcYearly: number;
  
  // Leave Balance
  leaveBalance: {
    casualLeave: number;
    sickLeave: number;
    earnedLeave: number;
    maternityLeave: number;
    paternityLeave: number;
  };
  
  // Auto-Applied Leave Breakdown (for absent days)
  autoAppliedLeaves?: {
    totalAbsentDays: number;
    coveredByLeave: number;
    lopDays: number;
    breakdown: Array<{
      leaveTypeId: number;
      leaveTypeName: string;
      daysApplied: number;
      balanceBefore: number;
      balanceAfter: number;
    }>;
  };
  
  // Calculation Details
  calculatedAt: Date;
  calculatedBy: number;
  workweekPolicy?: any;
  remarks?: string;
}

export class SalaryCalculationEngine {
  
  /**
   * Calculate comprehensive salary for an employee for a given month
   */
  async calculateSalary(input: SalaryCalculationInput & { updateLeaveBalances?: boolean }): Promise<SalaryCalculationResult> {
    console.log(`🔢 Starting salary calculation for user ${input.userId} for ${input.month}/${input.year}`);
    
    // Get employee details
    const employee = await this.getEmployeeDetails(input.userId);
    if (!employee) {
      throw new Error(`Employee not found: ${input.userId}`);
    }
    
    // Get salary configuration
    const salaryConfig = await this.getSalaryConfiguration(input.userId);
    if (!salaryConfig) {
      throw new Error(`Salary configuration not found for employee: ${input.userId}`);
    }
    
    // Get workweek policy
    const workweekPolicy = await this.getWorkweekPolicy(employee.workLocationId, employee.department);
    
    // Calculate working days for the month
    const workingDays = await this.calculateWorkingDays(input.month, input.year, workweekPolicy);
    
    // Get attendance data
    const attendanceData = await this.getAttendanceData(input.userId, input.month, input.year);
    
    // Get leave data (approved leave requests)
    const leaveData = await this.getLeaveData(input.userId, input.month, input.year);
    
    const salaryType = salaryConfig.salaryType || 'monthly';
    
    let autoAppliedLeaves = {
      totalAbsentDays: 0,
      coveredByLeave: 0,
      lopDays: 0,
      breakdown: [] as Array<{ leaveTypeId: number; leaveTypeName: string; daysApplied: number; balanceBefore: number; balanceAfter: number; }>
    };
    let enhancedLeaveData: any;
    
    if (salaryType === 'daily') {
      console.log(`📊 User ${input.userId}: Daily worker — no LOP/auto-apply. Paid days = present days + approved CL only.`);
      enhancedLeaveData = {
        ...leaveData,
        unpaidLeaveDays: 0,
        autoAppliedLeaves
      };
    } else {
      const absentDates = await this.identifyAbsentDays(
        input.userId,
        input.month,
        input.year,
        workweekPolicy,
        attendanceData.records,
        leaveData.leaves
      );
      
      console.log(`📊 User ${input.userId}: ${absentDates.length} absent days identified for ${input.month}/${input.year}`);
      
      const updateBalances = input.updateLeaveBalances ?? false;
      autoAppliedLeaves = await this.autoApplyLeaveForAbsentDays(
        input.userId,
        input.year,
        absentDates.length,
        updateBalances
      );
      
      if (autoAppliedLeaves.coveredByLeave > 0) {
        console.log(`📅 Auto-applied ${autoAppliedLeaves.coveredByLeave} days of leave for absent days`);
      }
      if (autoAppliedLeaves.lopDays > 0) {
        console.log(`⚠️ ${autoAppliedLeaves.lopDays} LOP days (no leave balance available)`);
      }
      
      enhancedLeaveData = {
        ...leaveData,
        paidLeaveDays: leaveData.paidLeaveDays + autoAppliedLeaves.coveredByLeave,
        unpaidLeaveDays: autoAppliedLeaves.lopDays,
        autoAppliedLeaves
      };
    }
    
    // Calculate leave balance (after potential auto-deductions)
    const leaveBalance = await this.calculateLeaveBalance(input.userId, input.year);
    
    // Perform salary calculations
    const result = await this.performSalaryCalculations({
      employee,
      salaryConfig,
      workweekPolicy,
      workingDays,
      attendanceData,
      leaveData: enhancedLeaveData,
      leaveBalance,
      input
    });
    
    // Add auto-applied leaves to result
    result.autoAppliedLeaves = autoAppliedLeaves;
    
    console.log(`✅ Salary calculation completed for ${employee.username}`);
    return result;
  }
  
  /**
   * Get employee details
   */
  private async getEmployeeDetails(userId: number) {
    const [employee] = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        employeeCode: users.employeeCode,
        department: users.department,
        role: users.role,
        workLocationId: users.workLocationId
      })
      .from(users)
      .where(eq(users.id, userId));
    
    return employee;
  }
  
  /**
   * Get salary configuration
   */
  private async getSalaryConfiguration(userId: number) {
    const [salary] = await db
      .select()
      .from(employeeSalaries)
      .where(eq(employeeSalaries.userId, userId))
      .orderBy(desc(employeeSalaries.salaryStartDate));
    
    return salary;
  }
  
  /**
   * Get workweek policy for employee
   */
  async getWorkweekPolicy(workLocationId?: number, department?: string) {
    // Priority: Location-specific > Department-specific > Global
    let policy = null;
    
    if (workLocationId) {
      const [locationPolicy] = await db
        .select()
        .from(workweekPolicies)
        .where(and(
          eq(workweekPolicies.policyType, 'location'),
          eq(workweekPolicies.locationId, workLocationId),
          eq(workweekPolicies.isActive, true)
        ))
        .orderBy(desc(workweekPolicies.createdAt));
      
      if (locationPolicy) policy = locationPolicy;
    }
    
    if (!policy && department) {
      const [deptPolicy] = await db
        .select()
        .from(workweekPolicies)
        .where(and(
          eq(workweekPolicies.policyType, 'department'),
          eq(workweekPolicies.department, department),
          eq(workweekPolicies.isActive, true)
        ))
        .orderBy(desc(workweekPolicies.createdAt));
      
      if (deptPolicy) policy = deptPolicy;
    }
    
    if (!policy) {
      const [globalPolicy] = await db
        .select()
        .from(workweekPolicies)
        .where(and(
          eq(workweekPolicies.policyType, 'global'),
          eq(workweekPolicies.isActive, true)
        ))
        .orderBy(desc(workweekPolicies.createdAt));
      
      if (globalPolicy) policy = globalPolicy;
    }
    
    return policy;
  }
  
  /**
   * Calculate working days for a month
   */
  async calculateWorkingDays(month: number, year: number, workweekPolicy: any) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    // Get company holidays for the month
    const holidays = await db
      .select()
      .from(companyHolidays)
      .where(
        between(companyHolidays.date, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0])
      );
    
    const workingDays = workweekPolicy?.workingDays || [1, 2, 3, 4, 5, 6]; // Default: Monday to Saturday
    let totalWorkingDays = 0;
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dayOfWeek = date.getDay();
      const isWorkingDay = workingDays.includes(dayOfWeek);
      const isHoliday = holidays.some(h => h.holidayDate === date.toISOString().split('T')[0]);
      
      if (isWorkingDay && !isHoliday) {
        totalWorkingDays++;
      }
    }
    
    return {
      totalDays: endDate.getDate(),
      workingDays: totalWorkingDays,
      holidays: holidays.length
    };
  }
  
  /**
   * Get attendance data for the month
   */
  private async getAttendanceData(userId: number, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const attendance = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, userId),
        between(attendanceRecords.date, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0])
      ))
      .orderBy(asc(attendanceRecords.date));
    
    let presentDays = 0;
    let halfDays = 0;
    let totalWorkingHours = 0;
    let overtimeHours = 0;
    
    attendance.forEach(record => {
      if (record.status === 'present' || record.status === 'late' || record.checkInTime) {
        presentDays++;
        totalWorkingHours += parseFloat(record.workingHours || '0');
        overtimeHours += parseFloat(record.overtimeHours || '0');
      } else if (record.status === 'half_day') {
        halfDays++;
        totalWorkingHours += parseFloat(record.workingHours || '0');
        overtimeHours += parseFloat(record.overtimeHours || '0');
      }
    });
    
    const effectivePresentDays = presentDays + (halfDays * 0.5);
    
    return {
      records: attendance,
      presentDays: effectivePresentDays,
      halfDays,
      totalWorkingHours,
      overtimeHours
    };
  }
  
  /**
   * Get leave data for the month
   */
  private async getLeaveData(userId: number, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const leaves = await db
      .select()
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.employeeId, userId),
        eq(leaveRequests.status, 'approved'),
        sql`DATE(${leaveRequests.startDate}) <= ${endDate.toISOString().split('T')[0]}`,
        sql`DATE(${leaveRequests.endDate}) >= ${startDate.toISOString().split('T')[0]}`
      ));
    
    let totalLeaveDays = 0;
    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    
    leaves.forEach(leave => {
      const leaveStart = new Date(Math.max(new Date(leave.startDate).getTime(), startDate.getTime()));
      const leaveEnd = new Date(Math.min(new Date(leave.endDate).getTime(), endDate.getTime()));
      
      const days = Math.ceil((leaveEnd.getTime() - leaveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      totalLeaveDays += days;
      
      // For now, assume all approved leaves are paid
      // This should be enhanced to check leave type configuration
      paidLeaveDays += days;
    });
    
    return {
      totalLeaveDays,
      paidLeaveDays,
      unpaidLeaveDays,
      leaves
    };
  }
  
  /**
   * Calculate leave balance from database
   */
  private async calculateLeaveBalance(userId: number, year: number) {
    const balances = await db
      .select({
        leaveTypeId: leaveBalances.leaveTypeId,
        leaveTypeName: leaveTypes.name,
        allocatedDays: leaveBalances.allocatedDays,
        usedDays: leaveBalances.usedDays,
        pendingDays: leaveBalances.pendingDays,
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
      .where(and(
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.year, year)
      ));
    
    const getBalance = (typeName: string) => {
      const balance = balances.find(b => b.leaveTypeName.toLowerCase().includes(typeName.toLowerCase()));
      if (!balance) return 0;
      return Math.max(0, parseFloat(balance.allocatedDays || '0') - parseFloat(balance.usedDays || '0'));
    };
    
    return {
      casualLeave: getBalance('casual'),
      sickLeave: getBalance('sick'),
      earnedLeave: getBalance('annual'),
      maternityLeave: getBalance('maternity'),
      paternityLeave: getBalance('paternity')
    };
  }
  
  /**
   * Get available leave balances in priority order for auto-deduction
   * Priority: Annual Leave → Casual Leave → Sick Leave → Other Paid Leaves
   * Uses leave type CODE for deterministic ordering (not name matching)
   */
  private async getAvailableLeaveBalances(userId: number, year: number) {
    const balances = await db
      .select({
        id: leaveBalances.id,
        leaveTypeId: leaveBalances.leaveTypeId,
        leaveTypeName: leaveTypes.name,
        leaveTypeCode: leaveTypes.code,
        isPaid: leaveTypes.isPaid,
        allocatedDays: leaveBalances.allocatedDays,
        usedDays: leaveBalances.usedDays,
        pendingDays: leaveBalances.pendingDays,
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
      .where(and(
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.year, year),
        eq(leaveTypes.isPaid, true) // Only paid leaves
      ));
    
    // Calculate available days for each leave type
    const availableBalances = balances.map(b => ({
      ...b,
      availableDays: Math.max(0, parseFloat(b.allocatedDays || '0') - parseFloat(b.usedDays || '0') - parseFloat(b.pendingDays || '0'))
    })).filter(b => b.availableDays > 0);
    
    // Priority map using leave type CODE (deterministic, not name-based)
    // Lower number = higher priority
    const priorityByCode: Record<string, number> = {
      'AL': 1,      // Annual Leave
      'ANNUAL': 1,  // Annual Leave (alternate code)
      'CL': 2,      // Casual Leave
      'CASUAL': 2,  // Casual Leave (alternate code)
      'SL': 3,      // Sick Leave  
      'SICK': 3,    // Sick Leave (alternate code)
      'EL': 4,      // Earned Leave
      'EARNED': 4,  // Earned Leave (alternate code)
      'EMR': 5,     // Emergency Leave
      'EMERGENCY': 5, // Emergency Leave (alternate code)
    };
    
    // Sort by priority using CODE
    availableBalances.sort((a, b) => {
      const codeA = (a.leaveTypeCode || '').toUpperCase();
      const codeB = (b.leaveTypeCode || '').toUpperCase();
      const priorityA = priorityByCode[codeA] ?? 999;
      const priorityB = priorityByCode[codeB] ?? 999;
      return priorityA - priorityB;
    });
    
    return availableBalances;
  }
  
  /**
   * Identify absent days for a user in a month
   * Absent = Working day with no check-in AND no approved leave
   */
  private async identifyAbsentDays(
    userId: number, 
    month: number, 
    year: number, 
    workweekPolicy: any,
    attendanceRecordsList: any[],
    approvedLeaves: any[]
  ): Promise<string[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    // Get company holidays - use 'date' column from schema
    const holidays = await db
      .select({
        id: companyHolidays.id,
        name: companyHolidays.name,
        date: companyHolidays.date,
      })
      .from(companyHolidays)
      .where(
        between(companyHolidays.date, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0])
      );
    
    const workingDays = workweekPolicy?.workingDays || [1, 2, 3, 4, 5, 6]; // Default: Mon-Sat
    const absentDates: string[] = [];
    
    const presentDates = new Set(
      attendanceRecordsList
        .filter(r => r.checkInTime || r.status === 'present' || r.status === 'late' || r.status === 'half_day')
        .map(r => r.date)
    );
    
    // Get dates with approved leaves
    const leaveDates = new Set<string>();
    approvedLeaves.forEach(leave => {
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);
      for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
        if (d >= startDate && d <= endDate) {
          leaveDates.add(d.toISOString().split('T')[0]);
        }
      }
    });
    
    // Holiday dates - explicitly use the 'date' field from query result
    const holidayDates = new Set<string>();
    holidays.forEach(h => {
      // The date column returns string in 'YYYY-MM-DD' format
      if (h.date) {
        holidayDates.add(String(h.date));
      }
    });
    
    console.log(`🗓️ Holidays in ${month}/${year}: ${holidayDates.size} days`);
    
    // Find absent days
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = date.getDay();
      const isWorkingDay = workingDays.includes(dayOfWeek);
      const isHoliday = holidayDates.has(dateStr);
      const isPresent = presentDates.has(dateStr);
      const hasLeave = leaveDates.has(dateStr);
      
      // If it's a working day, not a holiday, not present, and no approved leave = ABSENT
      if (isWorkingDay && !isHoliday && !isPresent && !hasLeave) {
        absentDates.push(dateStr);
      }
    }
    
    return absentDates;
  }
  
  /**
   * Auto-apply leave for absent days and update leave balances
   * Returns breakdown of applied leaves and remaining LOP days
   */
  private async autoApplyLeaveForAbsentDays(
    userId: number,
    year: number,
    absentDays: number,
    updateBalances: boolean = true
  ): Promise<{
    totalAbsentDays: number;
    coveredByLeave: number;
    lopDays: number;
    breakdown: Array<{
      leaveTypeId: number;
      leaveTypeName: string;
      daysApplied: number;
      balanceBefore: number;
      balanceAfter: number;
    }>;
  }> {
    const availableBalances = await this.getAvailableLeaveBalances(userId, year);
    
    let remainingAbsentDays = absentDays;
    const breakdown: Array<{
      leaveTypeId: number;
      leaveTypeName: string;
      daysApplied: number;
      balanceBefore: number;
      balanceAfter: number;
    }> = [];
    
    // Apply leaves in priority order
    for (const balance of availableBalances) {
      if (remainingAbsentDays <= 0) break;
      
      const daysToApply = Math.min(remainingAbsentDays, balance.availableDays);
      if (daysToApply > 0) {
        const balanceBefore = balance.availableDays;
        const balanceAfter = balanceBefore - daysToApply;
        
        breakdown.push({
          leaveTypeId: balance.leaveTypeId,
          leaveTypeName: balance.leaveTypeName,
          daysApplied: daysToApply,
          balanceBefore,
          balanceAfter
        });
        
        // Update leave balance in database
        if (updateBalances) {
          const currentUsed = parseFloat(balance.usedDays || '0');
          const newUsedDays = currentUsed + daysToApply;
          // Use string representation for decimal column (Drizzle expects string for decimal type)
          await db
            .update(leaveBalances)
            .set({
              usedDays: String(Math.round(newUsedDays * 100) / 100), // Round to 2 decimals, convert to string for decimal column
              lastUpdated: new Date()
            })
            .where(eq(leaveBalances.id, balance.id));
          
          console.log(`📅 Auto-applied ${daysToApply} days of ${balance.leaveTypeName} for user ${userId}`);
        }
        
        remainingAbsentDays -= daysToApply;
      }
    }
    
    const coveredByLeave = absentDays - remainingAbsentDays;
    
    return {
      totalAbsentDays: absentDays,
      coveredByLeave,
      lopDays: remainingAbsentDays,
      breakdown
    };
  }
  
  /**
   * Perform actual salary calculations
   */
  private async performSalaryCalculations(data: any): Promise<SalaryCalculationResult> {
    const { employee, salaryConfig, workweekPolicy, workingDays, attendanceData, leaveData, leaveBalance, input } = data;
    
    const MONTHLY_DIVISOR = 30;
    const basicSalary = parseFloat(salaryConfig.basicSalary || '0');
    const salaryType = salaryConfig.salaryType || 'monthly';
    
    let adjustedPaidDays: number;
    let grossBasic = 0;
    let houseRentAllowance = 0;
    let conveyanceAllowance = 0;
    let ltaAllowance = 0;
    let specialAllowance = 0;
    let supplementaryAllowance = 0;
    let kgpAllowance = 0;
    let overtimePay = 0;
    
    if (salaryType === 'daily') {
      adjustedPaidDays = attendanceData.presentDays + leaveData.paidLeaveDays;
      grossBasic = basicSalary * adjustedPaidDays;
      
      if (input.overtimeHours && input.overtimeHours > 0) {
        const workingHours = parseFloat(salaryConfig.workingHoursPerDay || '8');
        const hourlyRate = parseFloat(salaryConfig.hourlyRate || '0') || (basicSalary / workingHours);
        const otRate = input.overtimeRate || parseFloat(salaryConfig.otRate || '1.0');
        const otMultiplier = parseFloat(salaryConfig.otMultiplier || '1.0');
        overtimePay = hourlyRate * input.overtimeHours * otRate * otMultiplier;
      }
      
      houseRentAllowance = 0;
      conveyanceAllowance = 0;
      ltaAllowance = 0;
      specialAllowance = 0;
      supplementaryAllowance = 0;
      kgpAllowance = 0;
      
    } else {
      const lopDays = leaveData.unpaidLeaveDays || 0;
      adjustedPaidDays = Math.min(MONTHLY_DIVISOR - lopDays, MONTHLY_DIVISOR);
      adjustedPaidDays = Math.max(adjustedPaidDays, 0);
      
      const ratio = adjustedPaidDays / MONTHLY_DIVISOR;
      grossBasic = Math.round(basicSalary * ratio * 100) / 100;
      
      const configHra = parseFloat(salaryConfig.houseRentAllowance || '0');
      const configConv = parseFloat(salaryConfig.conveyance || '0');
      const configLta = parseFloat(salaryConfig.lta || '0');
      const configSpec = parseFloat(salaryConfig.specialAllowance || '0');
      const configSupp = parseFloat(salaryConfig.supplementaryAllowance || '0');
      const configKgp = parseFloat(salaryConfig.kgpAllowance || '0');

      houseRentAllowance = Math.round(configHra * ratio * 100) / 100;
      conveyanceAllowance = Math.round(configConv * ratio * 100) / 100;
      ltaAllowance = Math.round(configLta * ratio * 100) / 100;
      specialAllowance = Math.round(configSpec * ratio * 100) / 100;
      supplementaryAllowance = Math.round(configSupp * ratio * 100) / 100;
      kgpAllowance = Math.round(configKgp * ratio * 100) / 100;
    }
    
    const bonus = salaryType === 'daily'
      ? 0
      : (input.bonusAmount !== undefined)
        ? input.bonusAmount
        : Math.round(grossBasic * 0.0833 * 100) / 100;
    
    const grossEarnings = grossBasic + houseRentAllowance + conveyanceAllowance + 
                         ltaAllowance + specialAllowance + supplementaryAllowance + 
                         kgpAllowance + overtimePay;
    
    const pfBase = Math.min(grossBasic, 15000);
    const employeePF = pfBase * 0.12;
    const employerPF = pfBase * 0.12;
    
    const employeeESIC = grossEarnings <= 21000 ? grossEarnings * 0.0075 : 0;
    const employerESIC = grossEarnings <= 21000 ? grossEarnings * 0.0325 : 0;
    
    let professionalTax = 0;
    if (employee.role !== 'Superuser') {
      professionalTax = input.month === 2 ? 300 : 200;
    }
    
    const loanDeduction = input.deductions?.loanDeduction || 0;
    const advanceDeduction = input.deductions?.advanceDeduction || 0;
    const otherDeductions = input.deductions?.otherDeductions || 0;
    
    const leaveWithoutPayDeduction = salaryType === 'daily'
      ? 0
      : leaveData.unpaidLeaveDays * (basicSalary / MONTHLY_DIVISOR);
    
    // Total deductions
    const totalDeductions = employeePF + employeeESIC + professionalTax + 
                           loanDeduction + advanceDeduction + otherDeductions + 
                           leaveWithoutPayDeduction;
    
    // Net pay
    const netPay = grossEarnings - totalDeductions;
    
    // Employer contributions
    // Gratuity monthly provision = (Basic × 15 / 26) / 12
    const gratuity = (basicSalary * 15 / 26) / 12;
    const groupInsurance = parseFloat(salaryConfig.groupInsurance || '1500');
    const totalEmployerContributions = employerPF + employerESIC + gratuity + groupInsurance;
    
    // CTC calculations
    // CTC Monthly excludes bonus (business requirement)
    const ctcMonthly = grossEarnings + totalEmployerContributions;
    // CTC Yearly includes bonus as part of annual cost (business requirement)
    const ctcYearly = (ctcMonthly * 12) + (bonus * 12);
    
    return {
      // Employee Details
      employeeId: employee.id,
      employeeName: `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.username,
      employeeCode: employee.employeeCode || '',
      department: employee.department || '',
      designation: employee.role || '',
      salaryType: salaryType as 'monthly' | 'daily',
      
      // Period Details
      month: input.month,
      year: input.year,
      workingDays: workingDays.workingDays,
      actualDays: workingDays.totalDays,
      paidDays: adjustedPaidDays,
      
      // Attendance Details
      presentDays: attendanceData.presentDays,
      absentDays: workingDays.workingDays - attendanceData.presentDays - leaveData.totalLeaveDays,
      leaveDays: leaveData.totalLeaveDays,
      holidayDays: workingDays.holidays,
      totalWorkingHours: attendanceData.totalWorkingHours,
      overtimeHours: input.overtimeHours || attendanceData.overtimeHours,
      
      // Earnings (rounded to nearest whole number)
      basicSalary: Math.round(basicSalary),
      grossBasic: Math.round(grossBasic),
      houseRentAllowance: Math.round(houseRentAllowance),
      conveyanceAllowance: Math.round(conveyanceAllowance),
      ltaAllowance: Math.round(ltaAllowance),
      specialAllowance: Math.round(specialAllowance),
      supplementaryAllowance: Math.round(supplementaryAllowance),
      kgpAllowance: Math.round(kgpAllowance),
      bonus: Math.round(bonus),
      overtimePay: Math.round(overtimePay),
      grossEarnings: Math.round(grossEarnings),
      
      // Deductions (rounded to nearest whole number)
      employeePF: Math.round(employeePF),
      employeeESIC: Math.round(employeeESIC),
      professionalTax: Math.round(professionalTax),
      loanDeduction: Math.round(loanDeduction),
      advanceDeduction: Math.round(advanceDeduction),
      otherDeductions: Math.round(otherDeductions),
      leaveWithoutPayDeduction: Math.round(leaveWithoutPayDeduction),
      totalDeductions: Math.round(totalDeductions),
      
      // Net Pay (rounded to nearest whole number)
      netPay: Math.round(netPay),
      
      // Employer Contributions (rounded to nearest whole number)
      employerPF: Math.round(employerPF),
      employerESIC: Math.round(employerESIC),
      gratuity: Math.round(gratuity),
      groupInsurance: Math.round(groupInsurance),
      totalEmployerContributions: Math.round(totalEmployerContributions),
      
      // CTC (rounded to nearest whole number)
      ctcMonthly: Math.round(ctcMonthly),
      ctcYearly: Math.round(ctcYearly),
      
      // Leave Balance
      leaveBalance,
      
      // Calculation Details
      calculatedAt: new Date(),
      calculatedBy: 1, // System calculation
      workweekPolicy,
      remarks: `Salary calculated for ${input.month}/${input.year}`
    };
  }
  
  /**
   * Calculate salary for multiple employees
   */
  async calculateBulkSalary(userIds: number[], month: number, year: number): Promise<SalaryCalculationResult[]> {
    console.log(`🔢 Starting bulk salary calculation for ${userIds.length} employees`);
    
    const results: SalaryCalculationResult[] = [];
    
    for (const userId of userIds) {
      try {
        const result = await this.calculateSalary({ userId, month, year });
        results.push(result);
      } catch (error) {
        console.error(`Error calculating salary for user ${userId}:`, error);
        // Continue with other employees
      }
    }
    
    console.log(`✅ Bulk salary calculation completed for ${results.length}/${userIds.length} employees`);
    return results;
  }
  
  /**
   * Generate salary slip data
   */
  async generateSalarySlip(userId: number, month: number, year: number): Promise<any> {
    const salaryData = await this.calculateSalary({ userId, month, year });
    
    return {
      ...salaryData,
      companyDetails: {
        name: 'THERMOPAC',
        address: 'Company Address',
        phone: 'Company Phone',
        email: 'Company Email'
      },
      payslipNumber: `PAY-${year}${month.toString().padStart(2, '0')}-${userId.toString().padStart(4, '0')}`,
      generatedAt: new Date()
    };
  }
}

// Export singleton instance
export const salaryCalculationEngine = new SalaryCalculationEngine();