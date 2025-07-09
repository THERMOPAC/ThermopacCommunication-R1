import { db } from './db';
import { users, employeeSalaries, attendanceRecords, leaveRequests, workweekPolicies, companyHolidays, workLocations } from '@shared/schema';
import { eq, and, between, sql, desc, asc } from 'drizzle-orm';

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
  async calculateSalary(input: SalaryCalculationInput): Promise<SalaryCalculationResult> {
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
    
    // Get leave data
    const leaveData = await this.getLeaveData(input.userId, input.month, input.year);
    
    // Calculate leave balance
    const leaveBalance = await this.calculateLeaveBalance(input.userId, input.year);
    
    // Perform salary calculations
    const result = await this.performSalaryCalculations({
      employee,
      salaryConfig,
      workweekPolicy,
      workingDays,
      attendanceData,
      leaveData,
      leaveBalance,
      input
    });
    
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
    let totalWorkingHours = 0;
    let overtimeHours = 0;
    
    attendance.forEach(record => {
      // Check if employee is present (has check-in time)
      if (record.checkInTime) {
        presentDays++;
        totalWorkingHours += parseFloat(record.workingHours || '0');
        overtimeHours += parseFloat(record.overtimeHours || '0');
      }
    });
    
    return {
      records: attendance,
      presentDays,
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
   * Calculate leave balance
   */
  private async calculateLeaveBalance(userId: number, year: number) {
    // This would typically be based on leave policy and used leaves
    // For now, returning default values
    return {
      casualLeave: 12,
      sickLeave: 12,
      earnedLeave: 21,
      maternityLeave: 180,
      paternityLeave: 15
    };
  }
  
  /**
   * Perform actual salary calculations
   */
  private async performSalaryCalculations(data: any): Promise<SalaryCalculationResult> {
    const { employee, salaryConfig, workweekPolicy, workingDays, attendanceData, leaveData, leaveBalance, input } = data;
    
    const basicSalary = parseFloat(salaryConfig.basicSalary || '0');
    const salaryType = salaryConfig.salaryType || 'monthly';
    const actualDays = parseFloat(salaryConfig.actualDays || '30');
    const paidDays = parseFloat(salaryConfig.paidDays || '30');
    
    // Calculate paid days considering attendance and leaves
    const adjustedPaidDays = Math.min(
      paidDays,
      attendanceData.presentDays + leaveData.paidLeaveDays
    );
    
    let grossBasic = 0;
    let houseRentAllowance = 0;
    let conveyanceAllowance = 0;
    let ltaAllowance = 0;
    let specialAllowance = 0;
    let supplementaryAllowance = 0;
    let kgpAllowance = 0;
    let overtimePay = 0;
    
    if (salaryType === 'daily') {
      // Daily worker calculations
      grossBasic = basicSalary * adjustedPaidDays;
      
      // Overtime calculation
      if (input.overtimeHours && input.overtimeHours > 0) {
        const workingHours = parseFloat(salaryConfig.workingHoursPerDay || '8');
        const hourlyRate = basicSalary / workingHours;
        const otRate = input.overtimeRate || parseFloat(salaryConfig.otRate || '1.0');
        overtimePay = hourlyRate * input.overtimeHours * otRate;
      }
      
      // Daily workers have 0% allowances
      houseRentAllowance = 0;
      conveyanceAllowance = 0;
      ltaAllowance = 0;
      specialAllowance = 0;
      supplementaryAllowance = 0;
      
      // KGP Allowance for eligible roles
      if (['Manager', 'Employee'].includes(employee.role)) {
        kgpAllowance = grossBasic * 0.15;
      }
      
    } else {
      // Monthly worker calculations
      const proRatedBasic = (basicSalary / actualDays) * adjustedPaidDays;
      grossBasic = proRatedBasic;
      
      // Calculate allowances as percentages
      houseRentAllowance = grossBasic * 0.4; // 40%
      conveyanceAllowance = grossBasic * 0.3; // 30%
      ltaAllowance = grossBasic * 0.2; // 20%
      specialAllowance = grossBasic * 0.3; // 30%
      supplementaryAllowance = grossBasic * 0.3; // 30%
      
      // KGP Allowance for eligible roles
      if (['Manager', 'Employee'].includes(employee.role)) {
        kgpAllowance = grossBasic * 0.15;
      }
    }
    
    // Bonus calculation (8.33% of basic salary)
    const bonus = (input.bonusAmount !== undefined) ? input.bonusAmount : (grossBasic * 0.0833);
    
    // Gross earnings
    const grossEarnings = grossBasic + houseRentAllowance + conveyanceAllowance + 
                         ltaAllowance + specialAllowance + supplementaryAllowance + 
                         kgpAllowance + bonus + overtimePay;
    
    // PF calculations
    const pfBase = Math.min(grossBasic, 15000);
    const employeePF = pfBase * 0.12;
    const employerPF = pfBase * 0.12;
    
    // ESIC calculations
    const employeeESIC = grossEarnings <= 21000 ? grossEarnings * 0.0075 : 0;
    const employerESIC = grossEarnings <= 21000 ? grossEarnings * 0.0325 : 0;
    
    // Professional Tax
    let professionalTax = 0;
    if (employee.role !== 'Superuser') {
      professionalTax = input.month === 2 ? 300 : 200; // February = 300, others = 200
    }
    
    // Other deductions
    const loanDeduction = input.deductions?.loanDeduction || 0;
    const advanceDeduction = input.deductions?.advanceDeduction || 0;
    const otherDeductions = input.deductions?.otherDeductions || 0;
    
    // Leave without pay deduction
    const leaveWithoutPayDeduction = leaveData.unpaidLeaveDays * (basicSalary / actualDays);
    
    // Total deductions
    const totalDeductions = employeePF + employeeESIC + professionalTax + 
                           loanDeduction + advanceDeduction + otherDeductions + 
                           leaveWithoutPayDeduction;
    
    // Net pay
    const netPay = grossEarnings - totalDeductions;
    
    // Employer contributions
    const gratuity = grossEarnings * 0.0481;
    const groupInsurance = parseFloat(salaryConfig.groupInsurance || '1500');
    const totalEmployerContributions = employerPF + employerESIC + gratuity + groupInsurance;
    
    // CTC
    const ctcMonthly = grossEarnings + totalEmployerContributions;
    const ctcYearly = ctcMonthly * 12;
    
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
      actualDays: actualDays,
      paidDays: adjustedPaidDays,
      
      // Attendance Details
      presentDays: attendanceData.presentDays,
      absentDays: workingDays.workingDays - attendanceData.presentDays - leaveData.totalLeaveDays,
      leaveDays: leaveData.totalLeaveDays,
      holidayDays: workingDays.holidays,
      totalWorkingHours: attendanceData.totalWorkingHours,
      overtimeHours: input.overtimeHours || attendanceData.overtimeHours,
      
      // Earnings
      basicSalary,
      grossBasic,
      houseRentAllowance,
      conveyanceAllowance,
      ltaAllowance,
      specialAllowance,
      supplementaryAllowance,
      kgpAllowance,
      bonus,
      overtimePay,
      grossEarnings,
      
      // Deductions
      employeePF,
      employeeESIC,
      professionalTax,
      loanDeduction,
      advanceDeduction,
      otherDeductions,
      leaveWithoutPayDeduction,
      totalDeductions,
      
      // Net Pay
      netPay,
      
      // Employer Contributions
      employerPF,
      employerESIC,
      gratuity,
      groupInsurance,
      totalEmployerContributions,
      
      // CTC
      ctcMonthly,
      ctcYearly,
      
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