import { SalaryCalculationEngine } from './server/salary-calculation-engine.js';

async function testAttendanceBasedSalary() {
  try {
    const engine = new SalaryCalculationEngine();
    
    console.log('🧪 Testing attendance-based salary calculation for Manager (User ID: 1)');
    console.log('📅 Testing period: July 2025');
    console.log('👤 Expected: 1 present day out of 23 working days');
    
    const result = await engine.calculateSalary({
      userId: 1,
      month: 7,
      year: 2025
    });
    
    console.log('\n📊 SALARY CALCULATION RESULTS:');
    console.log('===============================');
    console.log(`👥 Employee: ${result.employeeName} (ID: ${result.employeeId})`);
    console.log(`💼 Department: ${result.department}`);
    console.log(`📋 Designation: ${result.designation}`);
    console.log(`💰 Salary Type: ${result.salaryType}`);
    console.log('');
    console.log('📅 PERIOD DETAILS:');
    console.log(`   Working Days: ${result.workingDays}`);
    console.log(`   Present Days: ${result.presentDays}`);
    console.log(`   Paid Days: ${result.paidDays}`);
    console.log(`   Leave Days: ${result.leaveDays}`);
    console.log('');
    console.log('💵 SALARY BREAKDOWN:');
    console.log(`   Basic Salary: ₹${result.basicSalary.toFixed(2)}`);
    console.log(`   Gross Basic: ₹${result.grossBasic.toFixed(2)}`);
    console.log(`   Gross Earnings: ₹${result.grossEarnings.toFixed(2)}`);
    console.log(`   Total Deductions: ₹${result.totalDeductions.toFixed(2)}`);
    console.log(`   Net Pay: ₹${result.netPay.toFixed(2)}`);
    console.log('');
    console.log('🔍 ATTENDANCE IMPACT:');
    const expectedFullSalary = 100000; // Basic salary from DB
    const attendanceRatio = result.presentDays / result.workingDays;
    console.log(`   Attendance Ratio: ${attendanceRatio.toFixed(3)} (${(attendanceRatio * 100).toFixed(1)}%)`);
    console.log(`   Expected Pro-rata Basic: ₹${(expectedFullSalary * attendanceRatio).toFixed(2)}`);
    console.log(`   Actual Gross Basic: ₹${result.grossBasic.toFixed(2)}`);
    
    const isAttendanceProRated = Math.abs(result.grossBasic - (expectedFullSalary * attendanceRatio)) < 100;
    console.log(`   ✅ Attendance Pro-rating: ${isAttendanceProRated ? 'WORKING' : 'NOT WORKING'}`);
    
  } catch (error) {
    console.error('❌ Error testing salary calculation:', error.message);
    console.error(error.stack);
  }
}

testAttendanceBasedSalary();