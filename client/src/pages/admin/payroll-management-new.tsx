import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Helmet } from "react-helmet";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Search, Plus, Edit, Trash2, Calculator, Save, X, Clock, Download, Play, Loader2, CheckCircle, Send, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import * as XLSX from 'xlsx';
import { PayrollRunWizard } from '@/components/payroll-run-wizard';
import { TdsManagementTab } from '@/components/tds-management';

// Schema for salary form
const salaryFormSchema = z.object({
  userId: z.number().min(1, 'Please select an employee'),
  salaryStartDate: z.string().min(1, 'Please select salary start date'),
  salaryType: z.enum(['monthly', 'daily']),
  basicSalary: z.string().min(1, 'Basic salary is required'),
  actualDays: z.string().default('30'),
  paidDays: z.string().default('30'),
  workingHoursPerDay: z.string().default('8'),
  overtimeHours: z.string().default('0'),
  otRate: z.string().default('1.0'),
  bonus: z.string().default('0'),
  kgpAllowance: z.string().default('0'),
  kpiPercent: z.string().default('0'),
  groupInsurance: z.string().default('300'),
  professionalTax: z.string().default('0'),
  workLocationId: z.number().optional(),
  remarks: z.string().optional(),
});

type SalaryFormValues = z.infer<typeof salaryFormSchema>;

interface User {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  employeeCode?: string;
  role?: string;
}

interface SalaryConfig {
  id: number;
  userId: number;
  username: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  employeeCode?: string;
  salaryType: string;
  basicSalary: string;
  actualDays: string;
  paidDays: string;
  workingHoursPerDay: string;
  overtimeHours: string;
  otRate: string;
  bonus: string;
  kgpAllowance: string;
  groupInsurance: string;
  professionalTax: string;
  workLocationId?: number;
  remarks?: string;
  salaryStartDate: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkLocation {
  id: number;
  name: string;
}

interface WorkweekPolicy {
  id: number;
  name: string;
  description?: string;
  policyType: 'location' | 'department' | 'global';
  locationId?: number;
  locationName?: string;
  department?: string;
  workingDays: number[];
  startTime: string;
  endTime: string;
  breakDurationMinutes: number;
  weeklyHours: string;
  overtimeThresholdDaily: string;
  overtimeThresholdWeekly: string;
  overtimeRateMultiplier: string;
  halfDayHours: string;
  includesSaturdays: boolean;
  includesSundays: boolean;
  followsNationalHolidays: boolean;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: number;
  creatorName?: string;
}

interface EmployeeWorkweekAssignment {
  id: number;
  employeeId: number;
  employeeName: string;
  workweekPolicyId: number;
  policyName: string;
  customWorkingDays?: number[];
  customStartTime?: string;
  customEndTime?: string;
  customWeeklyHours?: string;
  assignedDate: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  assignedBy: number;
  assignedByName?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

// Excel Export Function
const exportToExcel = (employee: any, month: string, year: string, calculationData: any) => {
  // Create workbook
  const wb = XLSX.utils.book_new();
  
  // Employee name for display
  const employeeName = employee.firstName && employee.lastName 
    ? `${employee.firstName} ${employee.lastName}`
    : employee.username;
  
  // Parse calculation data values
  const basicSalary = Math.round(parseFloat(calculationData?.grossBasic || calculationData?.basicSalary || 0));
  const hra = Math.round(parseFloat(calculationData?.houseRentAllowance || 0));
  const conveyance = Math.round(parseFloat(calculationData?.conveyanceAllowance || 0));
  const lta = Math.round(parseFloat(calculationData?.ltaAllowance || 0));
  const special = Math.round(parseFloat(calculationData?.specialAllowance || 0));
  const supplementary = Math.round(parseFloat(calculationData?.supplementaryAllowance || 0));
  const kgp = Math.round(parseFloat(calculationData?.kgpAllowance || 0));
  const bonus = Math.round(parseFloat(calculationData?.bonus || 0));
  const grossEarnings = Math.round(parseFloat(calculationData?.grossEarnings || 0));
  
  const pf = Math.round(parseFloat(calculationData?.employeePF || 0));
  const esic = Math.round(parseFloat(calculationData?.employeeESIC || 0));
  const pt = Math.round(parseFloat(calculationData?.professionalTax || 0));
  const groupInsurance = Math.round(parseFloat(calculationData?.groupInsurance || 0));
  const totalDeductions = Math.round(parseFloat(calculationData?.totalDeductions || 0));
  
  const netPay = Math.round(parseFloat(calculationData?.netPay || 0));
  
  // Create salary breakdown data
  const salaryData = [
    ['SALARY CALCULATION BREAKDOWN', '', ''],
    ['', '', ''],
    ['Employee Information', '', ''],
    ['Employee Name', employeeName, ''],
    ['Department', employee.department || 'N/A', ''],
    ['Salary Period', `${month}/${year}`, ''],
    ['Salary Type', calculationData?.salaryType || 'monthly', ''],
    ['', '', ''],
    ['Attendance Summary', '', ''],
    ['Working Days', calculationData?.workingDays || 0, ''],
    ['Present Days', calculationData?.presentDays || 0, ''],
    ['Paid Days', calculationData?.paidDays || 0, ''],
    ['', '', ''],
    ['EARNINGS', 'Amount (₹)', ''],
    ['Basic Salary', basicSalary, ''],
    ['HRA', hra, ''],
    ['Conveyance Allowance', conveyance, ''],
    ['LTA', lta, ''],
    ['Special Allowance', special, ''],
    ['Supplementary Allowance', supplementary, ''],
    ['KGP Allowance', kgp, ''],
    ['Bonus (Calculated, Not Paid Monthly)', bonus, ''],
    ['Gross Earnings', grossEarnings, ''],
    ['', '', ''],
    ['DEDUCTIONS', 'Amount (₹)', ''],
    ['Provident Fund (PF)', pf, ''],
    ['ESIC', esic, ''],
    ['Professional Tax', pt, ''],
    ['Group Insurance', groupInsurance, ''],
    ['Total Deductions', totalDeductions, ''],
    ['', '', ''],
    ['NET SALARY', netPay, ''],
  ];
  
  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(salaryData);
  
  // Set column widths
  ws['!cols'] = [
    { width: 35 }, // Description column
    { width: 15 }, // Amount column
    { width: 10 }  // Extra column
  ];
  
  // Style the header row
  if (ws['A1']) {
    ws['A1'].s = {
      font: { bold: true, sz: 14 },
      alignment: { horizontal: 'center' }
    };
  }
  
  // Style section headers
  const sectionHeaders = ['A3', 'A9', 'A14', 'A25', 'A32'];
  sectionHeaders.forEach(cell => {
    if (ws[cell]) {
      ws[cell].s = {
        font: { bold: true, sz: 12 },
        fill: { fgColor: { rgb: 'E6F3FF' } }
      };
    }
  });
  
  // Style the final net salary row
  if (ws['A32']) {
    ws['A32'].s = {
      font: { bold: true, sz: 12 },
      fill: { fgColor: { rgb: 'D4FFD4' } }
    };
  }
  if (ws['B32']) {
    ws['B32'].s = {
      font: { bold: true, sz: 12 },
      fill: { fgColor: { rgb: 'D4FFD4' } }
    };
  }
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Salary Breakdown');
  
  // Generate filename
  const filename = `Salary_Breakdown_${employeeName.replace(/\s+/g, '_')}_${month}-${year}.xlsx`;
  
  // Save file
  XLSX.writeFile(wb, filename);
};

// Calculation hook for salary computations
const useSalaryCalculations = (formData: Partial<SalaryFormValues>, selectedUserRole?: string) => {
  return useMemo(() => {
    const basicAmount = parseFloat(formData.basicSalary || '0');
    const salaryType = formData.salaryType || 'monthly';
    const actualDays = parseFloat(formData.actualDays || '30');
    const paidDays = parseFloat(formData.paidDays || '30');
    const workingHours = parseFloat(formData.workingHoursPerDay || '8');
    const overtimeHours = parseFloat(formData.overtimeHours || '0');
    const otRate = parseFloat(formData.otRate || '1.0');
    // Auto-calculate bonus as 8.33% of Basic Salary
    const bonus = basicAmount * 0.0833;
    
    // KGP Allowance = Basic Salary × 15% × KPI%
    const kpiPct = parseFloat(formData.kpiPercent || '0');
    let kgp = basicAmount * 0.15 * (kpiPct / 100);
    
    const groupInsuranceAmount = parseFloat(formData.groupInsurance || '1500');

    if (basicAmount <= 0) {
      return {
        grossBasic: 0,
        overtimePay: 0,
        grossEarnings: 0,
        employeePF: 0,
        employerPF: 0,
        employeeESIC: 0,
        employerESIC: 0,
        gratuity: 0,
        takeHome: 0,
        ctcMonthly: 0,
        ctcYearly: 0,
        houseRent: 0,
        conveyance: 0,
        lta: 0,
        special: 0,
        supplementary: 0,
        groupInsurance: groupInsuranceAmount,
        bonus: 0,
        kgpAllowance: kgp, // Still return KGP value even when basicAmount is 0
        professionalTax: 0, // No PT when basic amount is 0
      };
    }

    let grossBasic, overtimePay, grossEarnings;
    let houseRent = 0, conveyance = 0, lta = 0, special = 0, supplementary = 0;

    if (salaryType === 'daily') {
      // Daily worker calculations
      grossBasic = basicAmount * paidDays;
      const hourlyRate = basicAmount / workingHours;
      overtimePay = hourlyRate * overtimeHours * otRate;
      // Bonus excluded from monthly gross earnings - calculated but not paid monthly
      grossEarnings = grossBasic + overtimePay + kgp;
      
      // Daily workers have 0% allowances
      houseRent = conveyance = lta = special = supplementary = 0;
    } else {
      // Monthly worker calculations
      const proRatedBasic = (basicAmount / actualDays) * paidDays;
      grossBasic = proRatedBasic;
      overtimePay = 0; // Monthly workers don't have overtime
      
      // Calculate allowances as percentages
      houseRent = grossBasic * 0.4; // 40%
      conveyance = grossBasic * 0.3; // 30%
      lta = grossBasic * 0.2; // 20%
      special = grossBasic * 0.3; // 30%
      supplementary = grossBasic * 0.3; // 30%
      
      // Bonus excluded from monthly gross earnings - calculated but not paid monthly
      grossEarnings = grossBasic + houseRent + conveyance + lta + special + supplementary + kgp;
    }

    // PF calculations
    const pfBase = Math.min(grossBasic, 15000);
    const employeePF = pfBase * 0.12;
    const employerPF = pfBase * 0.12;

    // ESIC calculations
    const employeeESIC = grossEarnings <= 21000 ? grossEarnings * 0.0075 : 0;
    const employerESIC = grossEarnings <= 21000 ? grossEarnings * 0.0325 : 0;

    // Gratuity calculation: (Basic × 15 / 26) / 12
    const gratuity = (basicAmount * 15 / 26) / 12;

    // Professional Tax calculation (PT)
    // Default ₹200, ₹300 in February, not applicable to Superuser role
    let professionalTax = 0;
    if (selectedUserRole && selectedUserRole !== 'Superuser') {
      const currentMonth = new Date().getMonth() + 1; // getMonth() returns 0-11, so add 1
      professionalTax = currentMonth === 2 ? 300 : 200; // February = 300, others = 200
    }

    // Take home salary
    const takeHome = grossEarnings - employeePF - employeeESIC - professionalTax;

    // CTC calculations
    // CTC Monthly excludes bonus (business requirement)
    const ctcMonthly = grossEarnings + employerPF + employerESIC + gratuity + groupInsuranceAmount;
    // CTC Yearly includes bonus as part of annual cost (business requirement)
    const ctcYearly = (ctcMonthly * 12) + (bonus * 12);

    return {
      grossBasic,
      overtimePay,
      grossEarnings,
      employeePF,
      employerPF,
      employeeESIC,
      employerESIC,
      gratuity,
      takeHome,
      ctcMonthly,
      ctcYearly,
      houseRent,
      conveyance,
      lta,
      special,
      supplementary,
      groupInsurance: groupInsuranceAmount,
      bonus, // Auto-calculated bonus (8.33% of Basic Salary)
      kgpAllowance: kgp, // Auto-calculated KGP Allowance (15% of Basic Salary for Monthly Manager/Employee roles)
      professionalTax, // Auto-calculated Professional Tax (₹200/₹300, not applicable to Superuser)
    };
  }, [formData, selectedUserRole]);
};

// Generated Salaries View Component
function SapStatusBadge({ record }: { record: any }) {
  if (record.sapPostingStatus === 'posted') {
    return (
      <Badge className="bg-green-600 text-white">
        <CheckCircle className="h-3 w-3 mr-1" /> Posted (JE #{record.sapJeNumber})
      </Badge>
    );
  }
  if (record.sapPostingStatus === 'failed') {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" /> Failed
        </Badge>
        <span className="text-xs text-red-600 max-w-[200px] truncate" title={record.sapErrorMessage}>
          {record.sapErrorMessage}
        </span>
      </div>
    );
  }
  if (record.sapPostingStatus === 'pending') {
    return (
      <Badge variant="outline" className="text-amber-600 border-amber-300">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Posting...
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-gray-500">
      Not Posted
    </Badge>
  );
}

function TestSapJeButton() {
  const { toast } = useToast();
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testPayload = {
    ReferenceDate: "2026-03-18",
    DueDate: "2026-03-18",
    TaxDate: "2026-03-18",
    Memo: "Test Salary JE - Sanjeev Kale",
    JournalEntryLines: [
      {
        AccountCode: "10201000000-ARL",
        Debit: 10000.0
      },
      {
        AccountCode: "10301000000-ARL",
        Credit: 10000.0
      }
    ]
  };

  const testMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/payroll/test-sap-je', { jePayload: testPayload }),
    onSuccess: (data: any) => {
      setResult(data);
      setShowResult(true);
      toast({ title: 'Test JE Posted!', description: `DocEntry: ${data.sapDocEntry}, JE #${data.sapJeNumber}` });
    },
    onError: (e: any) => {
      setResult({ error: e.message });
      setShowResult(true);
      toast({ title: 'Test JE Failed', description: e.message, variant: 'destructive' });
    },
  });

  return (
    <>
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-orange-800">SAP JE Test Mode</h4>
              <p className="text-sm text-orange-700 mt-1">
                Post a test Journal Entry (₹10,000 Dr Basic / ₹10,000 Cr V10337) to SAP B1
              </p>
            </div>
            <Button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {testMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Posting Test JE...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Test SAP JE</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{result?.success ? 'Test JE Posted Successfully' : 'Test JE Result'}</DialogTitle>
          </DialogHeader>
          <pre className="bg-muted p-4 rounded text-xs overflow-auto max-h-96 whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GeneratedSalariesView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [postingId, setPostingId] = useState<number | null>(null);
  const { data: generatedSalaries, isLoading: isLoadingGenerated } = useQuery({
    queryKey: ['/api/admin/payroll/records'],
    enabled: true
  });

  const clearAllMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/admin/payroll/records/clear-all'),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-records'] });
      setShowClearConfirm(false);
      toast({ title: 'All Records Cleared', description: data.message });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const postToSapMutation = useMutation({
    mutationFn: (recordId: number) => {
      setPostingId(recordId);
      return apiRequest('POST', `/api/admin/payroll/records/${recordId}/post-sap`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      setPostingId(null);
      toast({ title: 'SAP JE Posted', description: `Journal Entry #${data.sapJeNumber} created in SAP B1 (DocEntry: ${data.sapDocEntry})` });
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      setPostingId(null);
      toast({ title: 'SAP Posting Failed', description: e.message, variant: 'destructive' });
    },
  });

  const handleDownloadSalarySlip = (payrollRecordId: number) => {
    const url = `/api/admin/salary-slip/${payrollRecordId}`;
    window.open(url, '_blank');
  };

  if (isLoadingGenerated) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center">Loading generated salaries...</div>
        </CardContent>
      </Card>
    );
  }

  if (!generatedSalaries || generatedSalaries.length === 0) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center text-gray-500">
            No salary records generated yet. Use the "Generate Salary" button from the configurations tab to create salary records.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Generated Salary Records</CardTitle>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowClearConfirm(true)}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Clear All Records
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-4">Employee</th>
                <th className="text-left p-4">Period</th>
                <th className="text-left p-4">Basic Salary</th>
                <th className="text-left p-4">Gross Earnings</th>
                <th className="text-left p-4">Deductions</th>
                <th className="text-left p-4">Net Salary</th>
                <th className="text-left p-4">SAP Status</th>
                <th className="text-left p-4">Generated On</th>
                <th className="text-left p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {generatedSalaries.map((record: any) => (
                <tr key={record.id} className="border-b hover:bg-gray-50">
                  <td className="p-4">
                    <div className="font-medium">{record.employeeName}</div>
                    <div className="text-sm text-gray-500">{record.employeeCode}</div>
                  </td>
                  <td className="p-4">
                    {record.month}/{record.year}
                  </td>
                  <td className="p-4">
                    ₹{parseFloat(record.basicSalary || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="p-4">
                    ₹{parseFloat(record.grossEarnings || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="p-4">
                    ₹{parseFloat(record.totalDeductions || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="p-4">
                    <span className="font-medium text-green-600">
                      ₹{parseFloat(record.netSalary || 0).toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td className="p-4">
                    <SapStatusBadge record={record} />
                  </td>
                  <td className="p-4">
                    {new Date(record.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDownloadSalarySlip(record.id)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> Slip
                      </Button>
                      {record.sapPostingStatus === 'posted' ? (
                        <Button variant="outline" size="sm" disabled className="text-green-600">
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> JE #{record.sapJeNumber}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => postToSapMutation.mutate(record.id)}
                          disabled={postToSapMutation.isPending && postingId === record.id}
                          className="text-orange-600 hover:text-orange-800 hover:border-orange-300"
                        >
                          {postToSapMutation.isPending && postingId === record.id ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Posting...</>
                          ) : record.sapPostingStatus === 'failed' ? (
                            <><RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry SAP</>
                          ) : (
                            <><Send className="h-3.5 w-3.5 mr-1" /> Transfer to SAP</>
                          )}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">Clear All Generated Salaries</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>{generatedSalaries.length}</strong> salary record{generatedSalaries.length > 1 ? 's' : ''} along with all related TDS records, loan repayments, and advance recoveries. Loan and advance balances will be reset.
          </p>
          <p className="text-sm font-semibold text-red-600">This action cannot be undone.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => clearAllMutation.mutate()}
              disabled={clearAllMutation.isPending}
            >
              {clearAllMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Clearing...</> : 'Yes, Clear All'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function PayrollRunTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: periods = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/payroll/payroll-periods'],
  });
  const { data: salaryConfigs = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/payroll/salary-setup'],
  });

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [singleUserResult, setSingleUserResult] = useState<any>(null);
  const [showCreatePeriod, setShowCreatePeriod] = useState(false);
  const [newPeriod, setNewPeriod] = useState({
    periodName: '',
    startDate: '',
    endDate: '',
    payDate: '',
  });

  const singleUserRunMutation = useMutation({
    mutationFn: async (data: { periodId: number; userId: number }) => {
      return await apiRequest('POST', '/api/payroll/run/single-user', data);
    },
    onSuccess: (data: any) => {
      setSingleUserResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-records'] });
      toast({ title: 'Single User Payroll Complete', description: `${data.employee}: Net Pay ₹${parseFloat(data.netPay || 0).toLocaleString('en-IN')}` });
    },
    onError: (err: any) => {
      toast({ title: 'Payroll Run Failed', description: err.message, variant: 'destructive' });
    },
  });

  const createPeriodMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/payroll/payroll-periods', newPeriod);
    },
    onSuccess: (data: any) => {
      toast({ title: 'Period created', description: `${newPeriod.periodName} is ready` });
      setShowCreatePeriod(false);
      setNewPeriod({ periodName: '', startDate: '', endDate: '', payDate: '' });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
      setSelectedPeriodId(data.id);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const generateYearMutation = useMutation({
    mutationFn: async (year: number) => {
      return await apiRequest('POST', '/api/payroll/payroll-periods/generate-year', { year });
    },
    onSuccess: (data: any) => {
      toast({ title: 'Year Generated', description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const selectedPeriod = periods.find((p: any) => p.id === selectedPeriodId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center">Loading payroll periods...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Select Payroll Period</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                const nextYear = new Date().getFullYear() + 1;
                generateYearMutation.mutate(nextYear);
              }} disabled={generateYearMutation.isPending}>
                <Calculator className="h-4 w-4 mr-1" /> Generate {new Date().getFullYear() + 1}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreatePeriod(true)}>
                <Plus className="h-4 w-4 mr-1" /> New Period
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {periods.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              No payroll periods yet. Click "New Period" to create one.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Payroll Period</Label>
                  <Select
                    value={selectedPeriodId?.toString() || ''}
                    onValueChange={(val) => { setSelectedPeriodId(parseInt(val)); setSingleUserResult(null); }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a payroll period..." />
                    </SelectTrigger>
                    <SelectContent>
                      {periods.map((p: any) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.periodName} ({p.startDate} - {p.endDate}) — {(p.status || 'draft').toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Employee (optional — select for single-user run)</Label>
                  <Select
                    value={selectedUserId}
                    onValueChange={(val) => { setSelectedUserId(val); setSingleUserResult(null); }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Employees (full run)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees (full run)</SelectItem>
                      {(() => {
                        const roleOrder: Record<string, number> = { 'Superuser': 0, 'Manager': 1, 'General Manager': 2, 'Senior Manager': 3, 'Employee': 4 };
                        const sorted = [...salaryConfigs].sort((a: any, b: any) => {
                          const ra = roleOrder[a.role] ?? 5;
                          const rb = roleOrder[b.role] ?? 5;
                          if (ra !== rb) return ra - rb;
                          const na = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
                          const nb = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
                          return na.localeCompare(nb);
                        });
                        const grouped = sorted.reduce((acc: Record<string, any[]>, sc: any) => {
                          const role = sc.role || 'Other';
                          if (!acc[role]) acc[role] = [];
                          acc[role].push(sc);
                          return acc;
                        }, {});
                        return Object.entries(grouped).map(([role, items]) => (
                          <SelectGroup key={role}>
                            <SelectLabel className="text-xs font-semibold text-blue-600">{role}</SelectLabel>
                            {items.map((sc: any) => {
                              const name = sc.firstName && sc.lastName ? `${sc.firstName} ${sc.lastName}` : sc.username;
                              const dept = sc.department ? ` • ${sc.department}` : '';
                              return (
                                <SelectItem key={sc.userId} value={sc.userId.toString()}>
                                  {name}{dept}
                                </SelectItem>
                              );
                            })}
                          </SelectGroup>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedPeriodId && selectedUserId !== 'all' && (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => {
                      singleUserRunMutation.mutate({
                        periodId: selectedPeriodId,
                        userId: parseInt(selectedUserId),
                      });
                    }}
                    disabled={singleUserRunMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {singleUserRunMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running...</>
                    ) : (
                      <><Play className="h-4 w-4 mr-2" /> Run Payroll for Selected Employee</>
                    )}
                  </Button>
                  {singleUserResult && (
                    <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                      Net Pay: ₹{parseFloat(singleUserResult.netPay || 0).toLocaleString('en-IN')}
                    </Badge>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {singleUserResult && selectedUserId !== 'all' && (
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Single User Payroll Result — {singleUserResult.employee}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Attendance</h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Days in Month</span><span className="font-medium">{singleUserResult.attendance?.daysInMonth ?? 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Working Days</span><span className="font-medium">{singleUserResult.attendance?.workingDays ?? 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Present</span><span className="font-medium">{singleUserResult.attendance?.presentDays ?? 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Half Days</span><span className="font-medium">{singleUserResult.attendance?.halfDays ?? 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Paid Days</span><span className="font-medium">{singleUserResult.attendance?.paidDays ?? 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Weekly Offs</span><span className="font-medium">{singleUserResult.attendance?.weeklyOffs ?? 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Holidays</span><span className="font-medium">{singleUserResult.attendance?.holidays ?? 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Absent</span><span className="font-medium text-red-600">{singleUserResult.attendance?.absentDays ?? 'N/A'}</span></div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Salary & Deductions</h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Gross Pay</span><span className="font-medium">₹{parseFloat(singleUserResult.grossPay || 0).toLocaleString('en-IN')}</span></div>
                  {singleUserResult.deductions && (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500">PF (Employee)</span><span className="font-medium text-red-600">₹{parseFloat(singleUserResult.deductions.pf || 0).toLocaleString('en-IN')}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">ESIC</span><span className="font-medium text-red-600">₹{parseFloat(singleUserResult.deductions.esic || 0).toLocaleString('en-IN')}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Professional Tax</span><span className="font-medium text-red-600">₹{parseFloat(singleUserResult.deductions.pt || 0).toLocaleString('en-IN')}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">TDS</span><span className="font-medium text-orange-600">₹{parseFloat(singleUserResult.deductions.tds || 0).toLocaleString('en-IN')}</span></div>
                      {parseFloat(singleUserResult.deductions.loanDeductions || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Loan EMI</span><span className="font-medium text-red-600">₹{parseFloat(singleUserResult.deductions.loanDeductions || 0).toLocaleString('en-IN')}</span></div>
                      )}
                      {parseFloat(singleUserResult.deductions.advanceDeductions || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Advance Recovery</span><span className="font-medium text-red-600">₹{parseFloat(singleUserResult.deductions.advanceDeductions || 0).toLocaleString('en-IN')}</span></div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between font-medium"><span className="text-gray-500">Total Deductions</span><span className="text-red-600">₹{parseFloat(singleUserResult.totalDeductions || 0).toLocaleString('en-IN')}</span></div>
                  <div className="border-t pt-1.5 mt-1.5 flex justify-between text-base"><span className="font-semibold">Net Pay</span><span className="font-bold text-green-700">₹{parseFloat(singleUserResult.netPay || 0).toLocaleString('en-IN')}</span></div>
                </div>
              </div>

              {singleUserResult.tds && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">TDS / Income Tax</h4>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Regime</span><span className="font-medium">{singleUserResult.tds.regime || 'new'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Projected Annual</span><span className="font-medium">₹{parseFloat(singleUserResult.tds.projectedAnnualIncome || 0).toLocaleString('en-IN')}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Taxable Income</span><span className="font-medium">₹{parseFloat(singleUserResult.tds.taxableIncome || 0).toLocaleString('en-IN')}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Annual Tax</span><span className="font-medium">₹{parseFloat(singleUserResult.tds.annualTaxLiability || 0).toLocaleString('en-IN')}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Monthly TDS</span><span className="font-medium text-orange-600">₹{parseFloat(singleUserResult.tds.monthlyTds || 0).toLocaleString('en-IN')}</span></div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedPeriod && selectedUserId === 'all' && (
        <Card>
          <CardContent className="pt-6">
            <PayrollRunWizard period={selectedPeriod} />
          </CardContent>
        </Card>
      )}

      <Dialog open={showCreatePeriod} onOpenChange={setShowCreatePeriod}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Payroll Period</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Period Name</Label>
              <Input
                value={newPeriod.periodName}
                onChange={(e) => setNewPeriod({ ...newPeriod, periodName: e.target.value })}
                placeholder="e.g. March 2026"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={newPeriod.startDate}
                  onChange={(e) => setNewPeriod({ ...newPeriod, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={newPeriod.endDate}
                  onChange={(e) => setNewPeriod({ ...newPeriod, endDate: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Pay Date</Label>
              <Input
                type="date"
                value={newPeriod.payDate}
                onChange={(e) => setNewPeriod({ ...newPeriod, payDate: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowCreatePeriod(false)}>Cancel</Button>
            <Button
              onClick={() => createPeriodMutation.mutate()}
              disabled={!newPeriod.periodName || !newPeriod.startDate || !newPeriod.endDate || !newPeriod.payDate || createPeriodMutation.isPending}
            >
              {createPeriodMutation.isPending ? 'Creating...' : 'Create Period'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PayrollManagementNew() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<SalaryConfig | null>(null);
  const [selectedEmployeeForSalary, setSelectedEmployeeForSalary] = useState<SalaryConfig | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSalaryGenerationDialogOpen, setIsSalaryGenerationDialogOpen] = useState(false);
  const [isConfirmationDialogOpen, setIsConfirmationDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [calculationPreview, setCalculationPreview] = useState<any>(null);
  const [isTestRunDialogOpen, setIsTestRunDialogOpen] = useState(false);
  const [testRunConfig, setTestRunConfig] = useState<SalaryConfig | null>(null);
  const [testRunResult, setTestRunResult] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch data
  const { data: salaryConfigs = [], isLoading } = useQuery<SalaryConfig[]>({
    queryKey: ['/api/admin/payroll/salary-setup'],
  });

  const { data: payrollPeriods = [] } = useQuery<any[]>({
    queryKey: ['/api/payroll/payroll-periods'],
  });

  const testRunMutation = useMutation({
    mutationFn: async (data: { periodId: number; userId: number }) => {
      return await apiRequest('POST', '/api/payroll/run/single-user', data);
    },
    onSuccess: (data: any) => {
      setTestRunResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/records'] });
      toast({ title: 'Payroll Test Run Complete', description: `${data.employee}: Net Pay ₹${parseFloat(data.netPay).toLocaleString()}` });
    },
    onError: (e: any) => toast({ title: 'Test Run Failed', description: e.message, variant: 'destructive' }),
  });

  const handleTestRun = (config: SalaryConfig) => {
    setTestRunConfig(config);
    setTestRunResult(null);
    setIsTestRunDialogOpen(true);
  };

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
  });

  const { data: workLocations = [] } = useQuery<WorkLocation[]>({
    queryKey: ['/api/work-locations/active'],
  });

  // Fetch workweek policies
  const { data: workweekPolicies = [] } = useQuery<WorkweekPolicy[]>({
    queryKey: ['/api/admin/workweek-policies'],
  });

  // Fetch employee workweek assignments
  const { data: employeeAssignments = [] } = useQuery<EmployeeWorkweekAssignment[]>({
    queryKey: ['/api/admin/employee-workweek-assignments'],
  });

  // Function to get workweek policy for an employee
  const getEmployeeWorkweekPolicy = useCallback((employeeId: number, workLocationId?: number, department?: string) => {
    // First check for direct employee assignment
    const assignment = employeeAssignments.find(
      assign => assign.employeeId === employeeId && assign.isActive
    );
    
    if (assignment) {
      const policy = workweekPolicies.find(p => p.id === assignment.workweekPolicyId);
      if (policy) {
        return {
          policy,
          assignment,
          // Use custom values if set, otherwise fall back to policy defaults
          workingDays: assignment.customWorkingDays || policy.workingDays,
          startTime: assignment.customStartTime || policy.startTime,
          endTime: assignment.customEndTime || policy.endTime,
          weeklyHours: assignment.customWeeklyHours || policy.weeklyHours,
          overtimeThresholdDaily: policy.overtimeThresholdDaily,
          overtimeRateMultiplier: policy.overtimeRateMultiplier,
        };
      }
    }
    
    // Then check for location-based policy
    if (workLocationId) {
      const locationPolicy = workweekPolicies.find(
        p => p.policyType === 'location' && p.locationId === workLocationId && p.isActive
      );
      if (locationPolicy) {
        return {
          policy: locationPolicy,
          assignment: null,
          workingDays: locationPolicy.workingDays,
          startTime: locationPolicy.startTime,
          endTime: locationPolicy.endTime,
          weeklyHours: locationPolicy.weeklyHours,
          overtimeThresholdDaily: locationPolicy.overtimeThresholdDaily,
          overtimeRateMultiplier: locationPolicy.overtimeRateMultiplier,
        };
      }
    }
    
    // Then check for department-based policy
    if (department) {
      const deptPolicy = workweekPolicies.find(
        p => p.policyType === 'department' && p.department === department && p.isActive
      );
      if (deptPolicy) {
        return {
          policy: deptPolicy,
          assignment: null,
          workingDays: deptPolicy.workingDays,
          startTime: deptPolicy.startTime,
          endTime: deptPolicy.endTime,
          weeklyHours: deptPolicy.weeklyHours,
          overtimeThresholdDaily: deptPolicy.overtimeThresholdDaily,
          overtimeRateMultiplier: deptPolicy.overtimeRateMultiplier,
        };
      }
    }
    
    // Finally check for global policy
    const globalPolicy = workweekPolicies.find(
      p => p.policyType === 'global' && p.isActive
    );
    if (globalPolicy) {
      return {
        policy: globalPolicy,
        assignment: null,
        workingDays: globalPolicy.workingDays,
        startTime: globalPolicy.startTime,
        endTime: globalPolicy.endTime,
        weeklyHours: globalPolicy.weeklyHours,
        overtimeThresholdDaily: globalPolicy.overtimeThresholdDaily,
        overtimeRateMultiplier: globalPolicy.overtimeRateMultiplier,
      };
    }
    
    // Default fallback
    return {
      policy: null,
      assignment: null,
      workingDays: [1, 2, 3, 4, 5], // Monday to Friday
      startTime: '09:00:00',
      endTime: '18:00:00',
      weeklyHours: '40.00',
      overtimeThresholdDaily: '8.00',
      overtimeRateMultiplier: '1.50',
    };
  }, [employeeAssignments, workweekPolicies]);

  // Filter available users
  const availableUsers = users.filter(user => 
    !salaryConfigs.some(config => config.userId === user.id)
  );

  // Group users by role with proper ordering and sorting
  const groupedUsers = useMemo(() => {
    const roleOrder = ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Employee'];
    
    // Group users by role
    const groups = availableUsers.reduce((groups, user) => {
      const role = user.role || 'Employee';
      if (!groups[role]) {
        groups[role] = [];
      }
      groups[role].push(user);
      return groups;
    }, {} as Record<string, User[]>);
    
    // Sort employees alphabetically within each group
    Object.keys(groups).forEach(role => {
      groups[role].sort((a, b) => {
        const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
        const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
        return nameA.localeCompare(nameB);
      });
    });
    
    // Return groups in specified order
    const orderedGroups: Record<string, User[]> = {};
    roleOrder.forEach(role => {
      if (groups[role] && groups[role].length > 0) {
        orderedGroups[role] = groups[role];
      }
    });
    
    // Add any remaining roles not in the predefined order
    Object.keys(groups).forEach(role => {
      if (!roleOrder.includes(role) && groups[role].length > 0) {
        orderedGroups[role] = groups[role];
      }
    });
    
    return orderedGroups;
  }, [availableUsers]);

  // Filter configurations based on search
  const filteredConfigs = salaryConfigs.filter(config =>
    config.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    `${config.firstName} ${config.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    config.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Save mutation
  const saveSalaryMutation = useMutation({
    mutationFn: async (values: SalaryFormValues) => {
      return await apiRequest('POST', '/api/admin/payroll/salary-setup', values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/salary-setup'] });
      toast({ title: 'Success', description: 'Salary configuration saved successfully' });
      setIsAddDialogOpen(false);
      setSelectedEmployee(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save salary configuration',
        variant: 'destructive' 
      });
    },
  });

  // Update mutation
  const updateSalaryMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: SalaryFormValues }) => {
      return await apiRequest('PUT', `/api/admin/payroll/salary-setup/${id}`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/salary-setup'] });
      toast({ title: 'Success', description: 'Salary configuration updated successfully' });
      setIsEditDialogOpen(false);
      setSelectedEmployee(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to update salary configuration',
        variant: 'destructive' 
      });
    },
  });

  // Delete mutation
  const deleteSalaryMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/admin/payroll/salary-setup/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/salary-setup'] });
      toast({ title: 'Success', description: 'Salary configuration deleted successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to delete salary configuration',
        variant: 'destructive' 
      });
    },
  });

  const handleEdit = (config: SalaryConfig) => {
    setSelectedEmployee(config);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this salary configuration?')) {
      deleteSalaryMutation.mutate(id);
    }
  };

  // Fetch salary calculation preview mutation
  const fetchCalculationPreviewMutation = useMutation({
    mutationFn: async ({ employeeId, month, year }: { employeeId: number; month: string; year: string }) => {
      return await apiRequest('POST', '/api/admin/salary-calculation-preview', {
        employeeId,
        month,
        year
      });
    },
    onSuccess: (data, variables) => {
      setCalculationPreview(data);
      setIsSalaryGenerationDialogOpen(false);
      setIsConfirmationDialogOpen(true);
      
      // Also fetch leave summary for the selected employee and month
      fetchLeaveSummaryMutation.mutate({
        employeeId: variables.employeeId,
        year: variables.year,
        month: variables.month
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to fetch salary calculation preview',
        variant: 'destructive' 
      });
    },
  });

  // Fetch leave summary mutation
  const fetchLeaveSummaryMutation = useMutation({
    mutationFn: async ({ employeeId, year, month }: { employeeId: number; year: string; month: string }) => {
      return await apiRequest('GET', `/api/admin/leave-summary/${employeeId}/${year}/${month}`);
    },
    onError: (error: any) => {
      console.error('Error fetching leave summary:', error);
    },
  });

  // Generate salary mutation
  const generateSalaryMutation = useMutation({
    mutationFn: async ({ employeeId, month, year }: { employeeId: number; month: string; year: string }) => {
      return await apiRequest('POST', '/api/admin/generate-salary', {
        employeeId,
        month,
        year
      });
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Salary generated successfully' });
      setIsConfirmationDialogOpen(false);
      setSelectedEmployeeForSalary(null);
      setSelectedMonth('');
      setSelectedYear('');
      setCalculationPreview(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to generate salary',
        variant: 'destructive' 
      });
    },
  });

  const handleGenerateSalary = (config: SalaryConfig) => {
    setSelectedEmployeeForSalary(config);
    
    // Calculate previous month based on current date
    const currentDate = new Date();
    const previousMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    
    // Format month as 2-digit string (01-12)
    const monthString = (previousMonth.getMonth() + 1).toString().padStart(2, '0');
    const yearString = previousMonth.getFullYear().toString();
    
    setSelectedMonth(monthString);
    setSelectedYear(yearString);
    setIsSalaryGenerationDialogOpen(true);
  };

  return (
    <>
      <Helmet>
        <title>Payroll Management - THERMOPAC</title>
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payroll Management</h1>
            <p className="text-gray-600">Manage employee salary configurations and calculations</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add New Salary
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Salary Configuration</DialogTitle>
              </DialogHeader>
              <SalaryForm 
                users={availableUsers}
                groupedUsers={groupedUsers}
                workLocations={workLocations}
                getEmployeeWorkweekPolicy={getEmployeeWorkweekPolicy}
                onSubmit={(values) => saveSalaryMutation.mutate(values)}
                isLoading={saveSalaryMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border-0 p-0 focus-visible:ring-0"
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">{salaryConfigs.length}</div>
              <div className="text-sm text-gray-600">Total Configurations</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">
                {salaryConfigs.filter(c => c.salaryType === 'monthly').length}
              </div>
              <div className="text-sm text-gray-600">Monthly Employees</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">
                {salaryConfigs.filter(c => c.salaryType === 'daily').length}
              </div>
              <div className="text-sm text-gray-600">Daily Workers</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Salary Configurations, Generated Salaries, and Payroll Run */}
        <Tabs defaultValue="configurations" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="configurations">Salary Configurations</TabsTrigger>
            <TabsTrigger value="generated">Generated Salaries</TabsTrigger>
            <TabsTrigger value="payroll-run">Payroll Run Engine</TabsTrigger>
            <TabsTrigger value="tds">Income Tax / TDS</TabsTrigger>
          </TabsList>

          <TabsContent value="configurations">
            {/* Salary Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle>Salary Configurations</CardTitle>
              </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : filteredConfigs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No salary configurations found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4">Employee</th>
                      <th className="text-left p-4">Type</th>
                      <th className="text-left p-4">Basic Salary</th>
                      <th className="text-left p-4">Days</th>
                      <th className="text-left p-4">Start Date</th>
                      <th className="text-left p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConfigs.map((config) => (
                      <tr key={config.id} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <div>
                            <div className="font-medium">
                              {config.firstName && config.lastName 
                                ? `${config.firstName} ${config.lastName}`
                                : config.username
                              }
                            </div>
                            <div className="text-sm text-gray-500">
                              {config.employeeCode && `${config.employeeCode} • `}
                              {config.department}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant={config.salaryType === 'monthly' ? 'default' : 'secondary'}>
                            {config.salaryType === 'monthly' ? 'Monthly' : 'Daily'}
                          </Badge>
                        </td>
                        <td className="p-4">
                          ₹{parseFloat(config.basicSalary).toLocaleString('en-IN')}
                          {config.salaryType === 'daily' && <span className="text-xs text-gray-500"> /day</span>}
                        </td>
                        <td className="p-4">
                          {config.paidDays}/{config.actualDays}
                        </td>
                        <td className="p-4">
                          {new Date(config.salaryStartDate).toLocaleDateString('en-IN')}
                        </td>
                        <td className="p-4">
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateSalary(config)}
                              title="Generate Salary"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                            >
                              <Calculator className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTestRun(config)}
                              title="Run Payroll Engine (Test)"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                            >
                              <Play className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(config)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(config.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="generated">
            <div className="space-y-4">
              <TestSapJeButton />
              <GeneratedSalariesView />
            </div>
          </TabsContent>

          <TabsContent value="payroll-run">
            <PayrollRunTab />
          </TabsContent>

          <TabsContent value="tds">
            <TdsManagementTab />
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Salary Configuration — {selectedEmployee ? (selectedEmployee.firstName && selectedEmployee.lastName ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : selectedEmployee.username) : ''}</DialogTitle>
            </DialogHeader>
            {selectedEmployee && (
              <SalaryForm 
                users={users}
                workLocations={workLocations}
                getEmployeeWorkweekPolicy={getEmployeeWorkweekPolicy}
                initialData={selectedEmployee}
                onSubmit={(values) => updateSalaryMutation.mutate({ 
                  id: selectedEmployee.id, 
                  values 
                })}
                isLoading={updateSalaryMutation.isPending}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Salary Generation Dialog */}
        <Dialog open={isSalaryGenerationDialogOpen} onOpenChange={setIsSalaryGenerationDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Generate Salary</DialogTitle>
            </DialogHeader>
            {selectedEmployeeForSalary && (
              <div className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-medium text-blue-900">Employee Details</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    {selectedEmployeeForSalary.firstName && selectedEmployeeForSalary.lastName 
                      ? `${selectedEmployeeForSalary.firstName} ${selectedEmployeeForSalary.lastName}`
                      : selectedEmployeeForSalary.username
                    }
                  </p>
                  <p className="text-sm text-blue-600">
                    Basic Salary: ₹{parseFloat(selectedEmployeeForSalary.basicSalary).toLocaleString('en-IN')}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="month">Month</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="01">January</SelectItem>
                        <SelectItem value="02">February</SelectItem>
                        <SelectItem value="03">March</SelectItem>
                        <SelectItem value="04">April</SelectItem>
                        <SelectItem value="05">May</SelectItem>
                        <SelectItem value="06">June</SelectItem>
                        <SelectItem value="07">July</SelectItem>
                        <SelectItem value="08">August</SelectItem>
                        <SelectItem value="09">September</SelectItem>
                        <SelectItem value="10">October</SelectItem>
                        <SelectItem value="11">November</SelectItem>
                        <SelectItem value="12">December</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="year">Year</Label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2024">2024</SelectItem>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2026">2026</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsSalaryGenerationDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => {
                      if (selectedEmployeeForSalary && selectedMonth && selectedYear) {
                        fetchCalculationPreviewMutation.mutate({
                          employeeId: selectedEmployeeForSalary.userId,
                          month: selectedMonth,
                          year: selectedYear
                        });
                      }
                    }}
                    disabled={!selectedMonth || !selectedYear || fetchCalculationPreviewMutation.isPending}
                  >
                    {fetchCalculationPreviewMutation.isPending ? 'Loading...' : 'Preview Calculation'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Salary Calculation Confirmation Dialog */}
        <Dialog open={isConfirmationDialogOpen} onOpenChange={setIsConfirmationDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Salary Calculation Breakdown</DialogTitle>
            </DialogHeader>
            {calculationPreview && selectedEmployeeForSalary && (
              <div className="space-y-6">
                {/* Employee Information */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-medium text-blue-900 mb-2">Employee Details</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-blue-700">
                        <strong>Name:</strong> {selectedEmployeeForSalary.firstName && selectedEmployeeForSalary.lastName 
                          ? `${selectedEmployeeForSalary.firstName} ${selectedEmployeeForSalary.lastName}`
                          : selectedEmployeeForSalary.username}
                      </p>
                      <p className="text-blue-700">
                        <strong>Department:</strong> {selectedEmployeeForSalary.department || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-700">
                        <strong>Period:</strong> {selectedMonth}/{selectedYear}
                      </p>
                      <p className="text-blue-700">
                        <strong>Salary Type:</strong> {calculationPreview.data?.salaryType || 'monthly'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Attendance Information */}
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h3 className="font-medium text-yellow-900 mb-2">Attendance Summary</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-yellow-700">
                        <strong>Working Days:</strong> {calculationPreview.data?.workingDays || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-yellow-700">
                        <strong>Present Days:</strong> {calculationPreview.data?.presentDays || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-yellow-700">
                        <strong>Paid Days:</strong> {calculationPreview.data?.paidDays || 0}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Leave Summary */}
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="font-medium text-purple-900 mb-3">Leave Summary - {selectedMonth}/{selectedYear}</h3>
                  {fetchLeaveSummaryMutation.isPending ? (
                    <div className="text-purple-700 text-sm">Loading leave data...</div>
                  ) : fetchLeaveSummaryMutation.data?.leaveSummary ? (
                    <div className="space-y-3">
                      {fetchLeaveSummaryMutation.data.leaveSummary.length > 0 ? (
                        <>
                          <div className="grid grid-cols-4 gap-2 text-xs font-medium text-purple-800 border-b border-purple-200 pb-2">
                            <div>Leave Type</div>
                            <div>Allocated</div>
                            <div>Used This Month</div>
                            <div>Remaining</div>
                          </div>
                          {fetchLeaveSummaryMutation.data.leaveSummary.map((leave: any) => (
                            <div 
                              key={leave.leaveTypeId} 
                              className={`grid grid-cols-4 gap-2 text-xs py-1 px-2 rounded ${
                                !leave.isPaid ? 'bg-red-100 border-l-4 border-red-500' : 'bg-white'
                              }`}
                            >
                              <div className={`font-medium ${!leave.isPaid ? 'text-red-800' : 'text-purple-700'}`}>
                                {leave.leaveTypeName}
                                {!leave.isPaid && <span className="ml-1 text-red-600">(Unpaid)</span>}
                              </div>
                              <div className="text-purple-700">{leave.allocatedDays}</div>
                              <div className={`${!leave.isPaid && leave.monthlyUsage.totalDays > 0 ? 'text-red-700 font-medium' : 'text-purple-700'}`}>
                                {leave.monthlyUsage.totalDays || 0}
                              </div>
                              <div className="text-purple-700">{leave.remainingDays}</div>
                            </div>
                          ))}
                          {fetchLeaveSummaryMutation.data.totalUnpaidDays > 0 && (
                            <div className="bg-red-100 border border-red-300 rounded p-2 mt-3">
                              <div className="text-red-800 text-sm font-medium">
                                ⚠️ Total Unpaid Leave This Month: {fetchLeaveSummaryMutation.data.totalUnpaidDays} days
                              </div>
                              <div className="text-red-700 text-xs mt-1">
                                This directly impacts salary calculation and is deducted from paid days.
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-purple-700 text-sm">No leave records found for this period.</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-purple-700 text-sm">Leave data not available.</div>
                  )}
                </div>

                {/* Auto-Applied Leave Adjustment */}
                {calculationPreview.data?.autoAppliedLeaves && (
                  <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
                    <h3 className="font-medium text-orange-900 mb-3">🔄 Auto-Applied Leave Adjustment</h3>
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="bg-white p-2 rounded">
                          <p className="text-orange-700 font-medium">Total Absent Days</p>
                          <p className="text-2xl font-bold text-orange-800">{calculationPreview.data.autoAppliedLeaves.totalAbsentDays}</p>
                        </div>
                        <div className="bg-green-100 p-2 rounded">
                          <p className="text-green-700 font-medium">Covered by Leave</p>
                          <p className="text-2xl font-bold text-green-800">{calculationPreview.data.autoAppliedLeaves.coveredByLeave}</p>
                        </div>
                        <div className={`p-2 rounded ${calculationPreview.data.autoAppliedLeaves.lopDays > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                          <p className={`font-medium ${calculationPreview.data.autoAppliedLeaves.lopDays > 0 ? 'text-red-700' : 'text-gray-700'}`}>LOP Days</p>
                          <p className={`text-2xl font-bold ${calculationPreview.data.autoAppliedLeaves.lopDays > 0 ? 'text-red-800' : 'text-gray-800'}`}>{calculationPreview.data.autoAppliedLeaves.lopDays}</p>
                        </div>
                      </div>
                      
                      {calculationPreview.data.autoAppliedLeaves.appliedLeaves && calculationPreview.data.autoAppliedLeaves.appliedLeaves.length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm font-medium text-orange-800 mb-2">Leave Applied (Priority Order):</p>
                          <div className="space-y-1">
                            {calculationPreview.data.autoAppliedLeaves.appliedLeaves.map((leave: any, index: number) => (
                              <div key={index} className="flex justify-between items-center bg-white p-2 rounded text-sm">
                                <span className="text-orange-700">{leave.leaveTypeName} ({leave.leaveTypeCode})</span>
                                <span className="font-medium text-green-700">{leave.daysApplied} days applied</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {calculationPreview.data.autoAppliedLeaves.lopDays > 0 && (
                        <div className="bg-red-100 border-l-4 border-red-500 p-3 rounded mt-2">
                          <p className="text-red-800 text-sm font-medium">⚠️ Loss of Pay Warning</p>
                          <p className="text-red-700 text-xs mt-1">
                            {calculationPreview.data.autoAppliedLeaves.lopDays} day(s) will be deducted from salary as LOP. 
                            No more paid leave balance available to cover these absences.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Salary Breakdown */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Earnings */}
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="font-medium text-green-900 mb-3">Earnings</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Basic Salary:</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.grossBasic || calculationPreview.data?.basicSalary || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>HRA:</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.houseRentAllowance || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Conveyance:</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.conveyanceAllowance || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>LTA:</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.ltaAllowance || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Special Allowance:</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.specialAllowance || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Supplementary:</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.supplementaryAllowance || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>KGP Allowance:</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.kgpAllowance || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Bonus (Calculated, Not Paid Monthly):</span>
                        <span className="font-medium text-orange-600">₹{Math.round(parseFloat(calculationPreview.data?.bonus || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="font-medium">Gross Earnings:</span>
                        <span className="font-bold text-green-600">₹{Math.round(parseFloat(calculationPreview.data?.grossEarnings || 0)).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Deductions */}
                  <div className="bg-red-50 p-4 rounded-lg">
                    <h3 className="font-medium text-red-900 mb-3">Deductions</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>PF:</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.employeePF || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>ESIC:</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.employeeESIC || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Professional Tax:</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.professionalTax || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Group Insurance:</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.groupInsurance || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="font-medium">Total Deductions:</span>
                        <span className="font-bold text-red-600">₹{Math.round(parseFloat(calculationPreview.data?.totalDeductions || 0)).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Net Salary */}
                <div className="bg-blue-100 p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-blue-900">Net Salary</h3>
                    <span className="text-2xl font-bold text-blue-600">
                      ₹{Math.round(parseFloat(calculationPreview.data?.netPay || 0)).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsConfirmationDialogOpen(false);
                      setIsSalaryGenerationDialogOpen(true);
                    }}
                  >
                    Back to Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsConfirmationDialogOpen(false);
                      setCalculationPreview(null);
                      setSelectedEmployeeForSalary(null);
                      setSelectedMonth('');
                      setSelectedYear('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      if (selectedEmployeeForSalary && selectedMonth && selectedYear && calculationPreview) {
                        exportToExcel(selectedEmployeeForSalary, selectedMonth, selectedYear, calculationPreview.data);
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export to Excel (.xlsx)
                  </Button>
                  <Button 
                    onClick={() => {
                      if (selectedEmployeeForSalary && selectedMonth && selectedYear) {
                        generateSalaryMutation.mutate({
                          employeeId: selectedEmployeeForSalary.userId,
                          month: selectedMonth,
                          year: selectedYear
                        });
                      }
                    }}
                    disabled={generateSalaryMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {generateSalaryMutation.isPending ? 'Generating...' : 'Generate & Download PDF'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Single User Test Run Dialog */}
        <Dialog open={isTestRunDialogOpen} onOpenChange={(open) => { setIsTestRunDialogOpen(open); if (!open) { setTestRunResult(null); setTestRunConfig(null); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Payroll Engine — Single User Test Run</DialogTitle>
            </DialogHeader>
            {testRunConfig && (
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-medium text-blue-900">
                    {testRunConfig.firstName && testRunConfig.lastName
                      ? `${testRunConfig.firstName} ${testRunConfig.lastName}`
                      : testRunConfig.username}
                  </h3>
                  <p className="text-sm text-blue-600">Basic: ₹{parseFloat(testRunConfig.basicSalary).toLocaleString('en-IN')} | {testRunConfig.salaryType}</p>
                </div>

                {!testRunResult && (
                  <div className="space-y-3">
                    <Label>Select Payroll Period</Label>
                    <Select onValueChange={(val) => {
                      const period = payrollPeriods.find((p: any) => p.id === parseInt(val));
                      if (period && testRunConfig) {
                        testRunMutation.mutate({ periodId: period.id, userId: testRunConfig.userId });
                      }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Choose a period..." /></SelectTrigger>
                      <SelectContent>
                        {payrollPeriods.map((p: any) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.periodName || `${p.month}/${p.year}`} — {p.status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {testRunMutation.isPending && (
                      <div className="flex items-center gap-2 text-blue-600 p-3 bg-blue-50 rounded">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Running payroll engine...</span>
                      </div>
                    )}
                  </div>
                )}

                {testRunResult && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">Test run completed successfully</span>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                      <h4 className="font-semibold text-gray-800">Attendance</h4>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div><span className="text-gray-500">Days in Month:</span> <span className="font-medium">{testRunResult.attendance?.daysInMonth ?? 'N/A'}</span></div>
                        <div><span className="text-gray-500">Working Days:</span> <span className="font-medium">{testRunResult.attendance?.workingDays ?? 'N/A'}</span></div>
                        <div><span className="text-gray-500">Present:</span> <span className="font-medium">{testRunResult.attendance?.presentDays ?? 'N/A'}</span></div>
                        <div><span className="text-gray-500">Paid Days:</span> <span className="font-medium">{testRunResult.attendance?.paidDays ?? 'N/A'}</span></div>
                        <div><span className="text-gray-500">Weekly Offs:</span> <span className="font-medium">{testRunResult.attendance?.weeklyOffs ?? 'N/A'}</span></div>
                        <div><span className="text-gray-500">Holidays:</span> <span className="font-medium">{testRunResult.attendance?.holidays ?? 'N/A'}</span></div>
                        <div><span className="text-gray-500">Absent:</span> <span className="font-medium text-red-600">{testRunResult.attendance?.absentDays ?? 'N/A'}</span></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                      <h4 className="font-semibold text-gray-800">Salary Summary</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">Gross Pay</span><span className="font-medium">₹{parseFloat(testRunResult.grossPay || 0).toLocaleString('en-IN')}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Total Deductions</span><span className="font-medium text-red-600">₹{parseFloat(testRunResult.totalDeductions || 0).toLocaleString('en-IN')}</span></div>
                        <Separator />
                        <div className="flex justify-between text-base"><span className="font-semibold">Net Pay</span><span className="font-bold text-green-700">₹{parseFloat(testRunResult.netPay || 0).toLocaleString('en-IN')}</span></div>
                      </div>
                    </div>

                    {testRunResult.tds && (
                      <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                        <h4 className="font-semibold text-gray-800">TDS Details</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between"><span className="text-gray-500">Regime</span><span className="font-medium">{testRunResult.tds.regime || 'new'}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Projected Annual Income</span><span className="font-medium">₹{parseFloat(testRunResult.tds.projectedAnnualIncome || 0).toLocaleString('en-IN')}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Taxable Income</span><span className="font-medium">₹{parseFloat(testRunResult.tds.taxableIncome || 0).toLocaleString('en-IN')}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Annual Tax Liability</span><span className="font-medium">₹{parseFloat(testRunResult.tds.annualTaxLiability || 0).toLocaleString('en-IN')}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Monthly TDS</span><span className="font-medium text-orange-600">₹{parseFloat(testRunResult.tds.monthlyTds || 0).toLocaleString('en-IN')}</span></div>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button variant="outline" onClick={() => { setTestRunResult(null); }}>Run Another Period</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

// Salary Form Component
interface SalaryFormProps {
  users: User[];
  groupedUsers?: Record<string, User[]>;
  workLocations: WorkLocation[];
  getEmployeeWorkweekPolicy?: (employeeId: number, workLocationId?: number, department?: string) => any;
  initialData?: SalaryConfig;
  onSubmit: (values: SalaryFormValues) => void;
  isLoading: boolean;
}

function SalaryForm({ users, groupedUsers = {}, workLocations, getEmployeeWorkweekPolicy, initialData, onSubmit, isLoading }: SalaryFormProps) {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(initialData?.userId || null);
  const [employeeWorkweekInfo, setEmployeeWorkweekInfo] = useState<any>(null);

  const form = useForm<SalaryFormValues>({
    resolver: zodResolver(salaryFormSchema),
    defaultValues: initialData ? {
      userId: initialData.userId,
      salaryStartDate: initialData.salaryStartDate,
      salaryType: initialData.salaryType as 'monthly' | 'daily',
      basicSalary: initialData.basicSalary,
      actualDays: (initialData.actualDays || 30).toString(),
      paidDays: (initialData.paidDays || initialData.actualDays || 30).toString(),
      workingHoursPerDay: (initialData.workingHoursPerDay || 8).toString(),
      overtimeHours: (initialData.overtimeHours || '0').toString(),
      otRate: (initialData.otRate || '1.0').toString(),
      bonus: (initialData.bonus || '0').toString(),
      kgpAllowance: (initialData.kgpAllowance || '0').toString(),
      kpiPercent: (initialData.kpiPercent || '0').toString(),
      groupInsurance: initialData.groupInsurance || '1500',
      workLocationId: initialData.workLocationId,
      remarks: initialData.remarks || '',
    } : {
      salaryStartDate: '',
      salaryType: 'monthly',
      basicSalary: '',
      actualDays: '30',
      paidDays: '30',
      workingHoursPerDay: '8',
      overtimeHours: '0',
      otRate: '1.0',
      bonus: '0',
      kgpAllowance: '0',
      kpiPercent: '0',
      groupInsurance: '1500',
      remarks: '',
    },
  });

  // Watch form values for calculations
  const watchedValues = form.watch();
  
  // Get selected user role for KGP calculation
  const selectedUser = users.find(u => u.id === watchedValues.userId);
  const selectedUserRole = selectedUser?.role;

  // Auto-populate working hours based on workweek policy when employee is selected
  useEffect(() => {
    if (watchedValues.userId && getEmployeeWorkweekPolicy && !initialData) {
      const user = users.find(u => u.id === watchedValues.userId);
      if (user) {
        const workweekInfo = getEmployeeWorkweekPolicy(
          user.id, 
          user.workLocationId || undefined, 
          user.department || undefined
        );
        
        setEmployeeWorkweekInfo(workweekInfo);
        
        if (workweekInfo && workweekInfo.policy) {
          // Calculate daily working hours from start/end times
          const startTime = workweekInfo.startTime || '09:00:00';
          const endTime = workweekInfo.endTime || '18:00:00';
          
          const [startHour, startMin] = startTime.split(':').map(Number);
          const [endHour, endMin] = endTime.split(':').map(Number);
          
          const startMinutes = startHour * 60 + startMin;
          const endMinutes = endHour * 60 + endMin;
          const workingMinutes = endMinutes - startMinutes;
          
          // Subtract break duration (in minutes)
          const breakMinutes = workweekInfo.policy.breakDurationMinutes || 60;
          const netWorkingMinutes = workingMinutes - breakMinutes;
          const dailyHours = (netWorkingMinutes / 60).toFixed(1);
          
          // Calculate monthly working days based on working days pattern
          const workingDaysCount = workweekInfo.workingDays?.length || 5;
          const monthlyWorkingDays = Math.round((workingDaysCount * 30) / 7); // Approximate
          
          // Auto-populate form fields
          form.setValue('workingHoursPerDay', dailyHours);
          form.setValue('actualDays', monthlyWorkingDays.toString());
          form.setValue('paidDays', monthlyWorkingDays.toString());
          
          // Set overtime rate from policy
          if (workweekInfo.overtimeRateMultiplier) {
            form.setValue('otRate', workweekInfo.overtimeRateMultiplier);
          }
        }
      }
    }
  }, [watchedValues.userId, getEmployeeWorkweekPolicy, users, form, initialData]);
  

  
  const calculations = useSalaryCalculations(watchedValues, selectedUserRole);

  // Manual form sync function
  const syncCalculationsToForm = useCallback(() => {
    // This would be called only when saving, not during live typing
    // For now, we'll handle this in the onSubmit directly
  }, []);

  const handleSubmit = (values: SalaryFormValues) => {
    const submissionValues = {
      ...values,
      houseRentAllowance: calculations.houseRent.toFixed(2),
      conveyance: calculations.conveyance.toFixed(2),
      lta: calculations.lta.toFixed(2),
      specialAllowance: calculations.special.toFixed(2),
      supplementaryAllowance: calculations.supplementary.toFixed(2),
      bonus: calculations.bonus.toFixed(2),
      kgpAllowance: calculations.kgpAllowance.toFixed(2),
      kpiPercent: values.kpiPercent || '0',
      employeePfContribution: calculations.employeePF.toFixed(2),
      employerPfContribution: calculations.employerPF.toFixed(2),
      employeeEsicContribution: calculations.employeeESIC.toFixed(2),
      employerEsicContribution: calculations.employerESIC.toFixed(2),
      gratuityCost: calculations.gratuity.toFixed(2),
      professionalTax: calculations.professionalTax.toFixed(2),
      takeHomeSalary: calculations.takeHome.toFixed(2),
      ctcMonthly: calculations.ctcMonthly.toFixed(2),
      ctcYearly: calculations.ctcYearly.toFixed(2),
    };
    onSubmit(submissionValues);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <Tabs defaultValue="basic-info" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic-info">Basic Information</TabsTrigger>
            <TabsTrigger value="allowances">Allowances</TabsTrigger>
            <TabsTrigger value="calculations">Calculations</TabsTrigger>
          </TabsList>

          <TabsContent value="basic-info" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {!initialData && (
                <FormField
                  control={form.control}
                  name="userId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee *</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select employee" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.keys(groupedUsers).length > 0 ? (
                            Object.entries(groupedUsers).map(([role, roleUsers]) => (
                              <SelectGroup key={role}>
                                <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400 py-2">
                                  {role === 'Superuser' ? 'Superusers' :
                                   role === 'General Manager' ? 'General Managers' :
                                   role === 'Senior Manager' ? 'Senior Managers' :
                                   role === 'Manager' ? 'Managers' :
                                   role === 'Employee' ? 'Employees' : `${role}s`}
                                </SelectLabel>
                                {roleUsers.map((user) => (
                                  <SelectItem key={user.id} value={user.id.toString()}>
                                    {user.firstName && user.lastName 
                                      ? `${user.firstName} ${user.lastName} (${user.username})`
                                      : user.username
                                    }
                                    {user.employeeCode && ` - ${user.employeeCode}`}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))
                          ) : (
                            <SelectItem value="no-employees" disabled>
                              No available employees
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <FormField
                control={form.control}
                name="salaryStartDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salary Start Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="salaryType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salary Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select salary type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="basicSalary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Basic Salary *</FormLabel>
                    <FormControl>
                      <Input 
                        key="basicSalary"
                        placeholder="Enter basic salary" 
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="actualDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Actual Days (in Month)</FormLabel>
                    <FormControl>
                      <Input 
                        key="actualDays"
                        placeholder="30" 
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="paidDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paid Days</FormLabel>
                    <FormControl>
                      <Input 
                        key="paidDays"
                        placeholder="30" 
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="workingHoursPerDay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Working Hours/Day</FormLabel>
                    <FormControl>
                      <Input 
                        key="workingHoursPerDay"
                        placeholder="8" 
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {watchedValues.salaryType === 'daily' && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="overtimeHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Overtime Hours</FormLabel>
                      <FormControl>
                        <Input 
                          key="overtimeHours"
                          placeholder="0" 
                          autoComplete="off"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="otRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>OT Rate</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select OT rate" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1.0">1.0x (Normal Rate)</SelectItem>
                          <SelectItem value="1.5">1.5x (Time and Half)</SelectItem>
                          <SelectItem value="2.0">2.0x (Double Time)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="bonus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bonus (Auto-calculated: 8.33% - Not Paid Monthly)</FormLabel>
                    <FormControl>
                      <Input 
                        key="bonus"
                        value={calculations.bonus ? `₹${calculations.bonus.toFixed(2)}` : '₹0.00'}
                        placeholder="₹0.00" 
                        autoComplete="off"
                        readOnly
                        className="bg-gray-50 cursor-not-allowed"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="kpiPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>KPI % (for KGP Allowance = Basic × 15% × KPI%)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        placeholder="0"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                <label className="text-sm font-medium">KGP Allowance (Auto-calculated)</label>
                <Input
                  value={`₹${calculations.kgpAllowance ? calculations.kgpAllowance.toFixed(2) : '0.00'}`}
                  readOnly
                  className="bg-gray-50 cursor-not-allowed mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={form.control}
                name="groupInsurance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Insurance Cost</FormLabel>
                    <FormControl>
                      <Input 
                        key="groupInsurance"
                        placeholder="1500" 
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>

          <TabsContent value="allowances" className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Allowance Information</h4>
              <p className="text-sm text-blue-700">
                {watchedValues.salaryType === 'daily' 
                  ? 'Daily workers have all allowances set to 0% of basic salary.'
                  : 'Monthly employees have auto-calculated allowances based on basic salary percentages.'
                }
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>House Rent Allowance</Label>
                <div className="p-3 bg-gray-50 rounded border">
                  ₹{calculations.houseRent.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                  <span className="text-xs text-gray-500 ml-2">
                    {watchedValues.salaryType === 'daily' ? '(0%)' : '(40% of Basic)'}
                  </span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Conveyance Allowance</Label>
                <div className="p-3 bg-gray-50 rounded border">
                  ₹{calculations.conveyance.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                  <span className="text-xs text-gray-500 ml-2">
                    {watchedValues.salaryType === 'daily' ? '(0%)' : '(30% of Basic)'}
                  </span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>LTA</Label>
                <div className="p-3 bg-gray-50 rounded border">
                  ₹{calculations.lta.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                  <span className="text-xs text-gray-500 ml-2">
                    {watchedValues.salaryType === 'daily' ? '(0%)' : '(20% of Basic)'}
                  </span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Special Allowance</Label>
                <div className="p-3 bg-gray-50 rounded border">
                  ₹{calculations.special.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                  <span className="text-xs text-gray-500 ml-2">
                    {watchedValues.salaryType === 'daily' ? '(0%)' : '(30% of Basic)'}
                  </span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Supplementary Allowance</Label>
                <div className="p-3 bg-gray-50 rounded border">
                  ₹{calculations.supplementary.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                  <span className="text-xs text-gray-500 ml-2">
                    {watchedValues.salaryType === 'daily' ? '(0%)' : '(30% of Basic)'}
                  </span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="calculations" className="space-y-4">
            {/* Workweek Policy Information */}
            {employeeWorkweekInfo && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg text-blue-700 flex items-center">
                    <Clock className="h-5 w-5 mr-2" />
                    Applied Workweek Policy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">Policy Name:</span>
                      <div className="font-semibold">
                        {employeeWorkweekInfo.policy?.name || 'Default Policy'}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Policy Type:</span>
                      <div className="capitalize">
                        {employeeWorkweekInfo.policy?.policyType || 'default'}
                        {employeeWorkweekInfo.assignment && ' (Employee Specific)'}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Working Hours:</span>
                      <div>
                        {employeeWorkweekInfo.startTime} - {employeeWorkweekInfo.endTime}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Working Days:</span>
                      <div>
                        {employeeWorkweekInfo.workingDays?.length || 5} days/week
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Overtime Rate:</span>
                      <div>
                        {parseFloat(employeeWorkweekInfo.overtimeRateMultiplier || '1.5').toFixed(1)}x
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Weekly Hours:</span>
                      <div>
                        {employeeWorkweekInfo.weeklyHours || '40.00'} hours
                      </div>
                    </div>
                    {employeeWorkweekInfo.policy?.breakDurationMinutes && (
                      <div>
                        <span className="font-medium text-gray-600">Break Duration:</span>
                        <div>
                          {employeeWorkweekInfo.policy.breakDurationMinutes} minutes
                        </div>
                      </div>
                    )}
                    {employeeWorkweekInfo.policy?.locationName && (
                      <div>
                        <span className="font-medium text-gray-600">Location:</span>
                        <div>
                          {employeeWorkweekInfo.policy.locationName}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Earnings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-green-700">Earnings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Basic Salary:</span>
                    <span className="font-medium">₹{Math.round(calculations.grossBasic).toLocaleString('en-IN')}</span>
                  </div>
                  {watchedValues.salaryType === 'monthly' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm">HRA:</span>
                        <span className="font-medium">₹{Math.round(calculations.houseRent).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Conveyance:</span>
                        <span className="font-medium">₹{Math.round(calculations.conveyance).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">LTA:</span>
                        <span className="font-medium">₹{Math.round(calculations.lta).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Special:</span>
                        <span className="font-medium">₹{Math.round(calculations.special).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Supplementary:</span>
                        <span className="font-medium">₹{Math.round(calculations.supplementary).toLocaleString('en-IN')}</span>
                      </div>
                    </>
                  )}
                  {watchedValues.salaryType === 'daily' && parseFloat(watchedValues.overtimeHours || '0') > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm">Overtime:</span>
                      <span className="font-medium">₹{Math.round(calculations.overtimePay).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-sm">Bonus (8.33%) - Calculated Only:</span>
                    <span className="font-medium text-orange-600">₹{Math.round(calculations.bonus || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">
                      KGP Allowance
                      {watchedValues.salaryType === 'monthly' && 
                       selectedUserRole && 
                       ['Manager', 'Employee'].includes(selectedUserRole) && 
                       ' (15%)'
                      }:
                    </span>
                    <span className="font-medium">₹{Math.round(calculations.kgpAllowance || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Gross Earnings:</span>
                    <span>₹{Math.round(calculations.grossEarnings).toLocaleString('en-IN')}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Deductions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-red-700">Deductions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Employee PF:</span>
                    <span className="font-medium">₹{Math.round(calculations.employeePF).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Employee ESIC:</span>
                    <span className="font-medium">₹{Math.round(calculations.employeeESIC).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">
                      Professional Tax
                      {selectedUserRole === 'Superuser' ? ' (Not Applicable)' : 
                       ` (₹${new Date().getMonth() + 1 === 2 ? '300' : '200'}/month)`
                      }:
                    </span>
                    <span className="font-medium">₹{Math.round(calculations.professionalTax || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Total Deductions:</span>
                    <span>₹{Math.round(calculations.employeePF + calculations.employeeESIC + (calculations.professionalTax || 0)).toLocaleString('en-IN')}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Net & CTC */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-blue-700">Net & CTC</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Take Home:</span>
                    <span className="font-medium">₹{Math.round(calculations.takeHome).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Employer PF:</span>
                    <span className="font-medium">₹{Math.round(calculations.employerPF).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Employer ESIC:</span>
                    <span className="font-medium">₹{Math.round(calculations.employerESIC).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Gratuity:</span>
                    <span className="font-medium">₹{Math.round(calculations.gratuity).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Group Insurance:</span>
                    <span className="font-medium">₹{Math.round(calculations.groupInsurance).toLocaleString('en-IN')}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>CTC Monthly:</span>
                    <span>₹{Math.round(calculations.ctcMonthly).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>CTC Yearly:</span>
                    <span>₹{Math.round(calculations.ctcYearly).toLocaleString('en-IN')}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end space-x-4">
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            Reset
          </Button>
          <Button 
            type="button" 
            disabled={isLoading}
            onClick={async (e) => {
              console.log('Save button clicked, isLoading:', isLoading);
              console.log('Form valid:', form.formState.isValid);
              console.log('Form errors:', form.formState.errors);
              console.log('Form values:', form.getValues());
              
              // Force form validation
              const isValid = await form.trigger();
              console.log('Manual validation result:', isValid);
              console.log('Manual validation errors:', form.formState.errors);
              
              if (isValid) {
                const values = form.getValues();
                handleSubmit(values);
              } else {
                console.log('Form validation failed');
              }
            }}
          >
            {isLoading ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </form>
    </Form>
  );
}