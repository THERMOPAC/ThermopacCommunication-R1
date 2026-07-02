import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Search, Plus, Edit, Trash2, Calculator, Save, X, Clock, Download, Play, Loader2, CheckCircle, Send, AlertCircle, RefreshCw, ShieldCheck, Pause, XCircle, RotateCcw, History, Lock, Filter, Undo2, Ban, Shield, AlertTriangle, Info, Eye, FileCheck, Calendar, TrendingUp, Check, ChevronDown, ArrowUpRight, ArrowDownRight, Printer, FileText, User } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, getErrorMessage } from '@/lib/queryClient';
import { ExcelJS } from '@/lib/excel-client-utils';
import { PayrollRunWizard } from '@/components/payroll-run-wizard';
import { TdsManagementTab } from '@/components/tds-management';
import { ManualSalaryTab } from '@/components/contract-worker-salary-tab';
import { CalendarAttendanceTab } from '@/components/calendar-attendance';
import { fmtDate, fmtDateTime, toDisplayDate, toIsoDate } from '@/lib/date-utils';

// Schema for salary form
const salaryFormSchema = z.object({
  userId: z.number().min(1, 'Please select an employee'),
  salaryStartDate: z.string().min(1, 'Please select salary start date'),
  salaryType: z.enum(['monthly', 'daily']),
  basicSalary: z.string().min(1, 'Basic salary is required'),
  hourlyRate: z.string().optional(),
  paidDays: z.string().default('30'),
  workingHoursPerDay: z.string().default('8'),
  overtimeHours: z.string().default('0'),
  otRate: z.string().default('1.0'),
  bonus: z.string().default('0'),
  kgpAllowance: z.string().default('0'),
  kpiPercent: z.string().default('0'),
  kpiKgpApplicable: z.boolean().default(false),
  lwpExempt: z.boolean().default(false),
  pfApplicable: z.boolean().default(true),
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
  workLocationId?: number;
  dateOfBirth?: string;
  // Duty schedule fields
  dutyTimeIn?: string;
  dutyTimeOut?: string;
  workTimePolicy?: string;
  minimumDailyHours?: number;
  halfDayMinimumHours?: number;
  weeklyOffDays?: number[];
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
  hourlyRate?: string;
  actualDays: string;
  paidDays: string;
  workingHoursPerDay: string;
  overtimeHours: string;
  otRate: string;
  bonus: string;
  kgpAllowance: string;
  kpiPercent?: string;
  groupInsurance: string;
  professionalTax: string;
  workLocationId?: number;
  remarks?: string;
  salaryStartDate: string;
  createdAt: string;
  updatedAt: string;
  pfApplicable?: boolean;
  lwpExempt?: boolean;
  dateOfBirth?: string;
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
const exportToExcel = async (employee: any, month: string, year: string, calculationData: any) => {
  const employeeName = employee.firstName && employee.lastName
    ? `${employee.firstName} ${employee.lastName}`
    : employee.username;

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

  const salaryData: any[][] = [
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
    [calculationData?.salaryType === 'daily' ? 'Daily Rate × Paid Days' : 'Basic Salary', basicSalary, ''],
    ...(calculationData?.salaryType !== 'daily' ? [
      ['HRA', hra, ''],
      ['Conveyance Allowance', conveyance, ''],
      ['LTA', lta, ''],
      ['Special Allowance', special, ''],
      ['Supplementary Allowance', supplementary, ''],
    ] : []),
    ...(calculationData?.salaryType !== 'daily' && kgp > 0 ? [['KGP Allowance', kgp, '']] : []),
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

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Salary Breakdown');

  ws.getColumn(1).width = 35;
  ws.getColumn(2).width = 15;
  ws.getColumn(3).width = 10;

  ws.addRows(salaryData);

  const headerCell = ws.getCell('A1');
  headerCell.font = { bold: true, size: 14 };
  headerCell.alignment = { horizontal: 'center' };

  ['A3', 'A9', 'A14'].forEach(addr => {
    const cell = ws.getCell(addr);
    if (cell.value) {
      cell.font = { bold: true, size: 12 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3FF' } };
    }
  });

  const lastRow = ws.rowCount;
  const netSalaryRowA = ws.getCell(`A${lastRow}`);
  const netSalaryRowB = ws.getCell(`B${lastRow}`);
  [netSalaryRowA, netSalaryRowB].forEach(cell => {
    cell.font = { bold: true, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4FFD4' } };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Salary_Breakdown_${employeeName.replace(/\s+/g, '_')}_${month}-${year}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Calculation hook for salary computations
const useSalaryCalculations = (formData: Partial<SalaryFormValues>, selectedUserRole?: string) => {
  return useMemo(() => {
    const basicAmount = parseFloat(formData.basicSalary || '0');
    const salaryType = formData.salaryType || 'monthly';
    const MONTHLY_DIVISOR = 30; // Fixed — per business rule
    const paidDays = parseFloat(formData.paidDays || '30');
    const workingHours = parseFloat(formData.workingHoursPerDay || '8');
    const overtimeHours = parseFloat(formData.overtimeHours || '0');
    const otRate = parseFloat(formData.otRate || '1.0');
    // Auto-calculate bonus as 8.33% of Basic Salary
    const bonus = basicAmount * 0.0833;
    
    const kpiPct = parseFloat(formData.kpiPercent || '0');
    let kgp = salaryType === 'daily' ? 0 : basicAmount * 0.15 * (kpiPct / 100);
    
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
      grossBasic = basicAmount * paidDays;
      const hourlyRate = basicAmount / workingHours;
      overtimePay = hourlyRate * overtimeHours * otRate;
      grossEarnings = grossBasic + overtimePay;
    } else {
      // Monthly worker calculations — divisor always 30 (business rule)
      const proRatedBasic = (basicAmount / MONTHLY_DIVISOR) * paidDays;
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
    ReferenceDate: "2026-02-28",
    Memo: "Salary JE - Mansi Main - Feb 2026",
    Reference2: "V10771",
    Reference3: "92B",
    U_Employee_Name: "Mansi Main",
    JournalEntryLines: [
      { Line_ID: 0, AccountCode: "_SYS00000000676", Debit: 18900.00, Credit: 0, LineMemo: "BASIC - Mansi Main - Feb 2026" },
      { Line_ID: 1, AccountCode: "_SYS00000000681", Debit: 7560.00, Credit: 0, LineMemo: "HRA - Mansi Main - Feb 2026" },
      { Line_ID: 2, AccountCode: "_SYS00000000684", Debit: 5670.00, Credit: 0, LineMemo: "CONVEYANCE - Mansi Main - Feb 2026" },
      { Line_ID: 3, AccountCode: "_SYS00000000683", Debit: 3780.00, Credit: 0, LineMemo: "LTA - Mansi Main - Feb 2026" },
      { Line_ID: 4, AccountCode: "_SYS00000000687", Debit: 5670.00, Credit: 0, LineMemo: "SPECIAL_ALLOWANCE - Mansi Main - Feb 2026" },
      { Line_ID: 5, AccountCode: "_SYS00000000751", Debit: 5670.00, Credit: 0, LineMemo: "SUPPLEMENTARY - Mansi Main - Feb 2026" },
      { Line_ID: 6, AccountCode: "_SYS00000000676", Debit: 1800.00, Credit: 0, LineMemo: "PF_EMPLOYER - Mansi Main - Feb 2026" },
      { Line_ID: 7, AccountCode: "_SYS00000000502", Debit: 0, Credit: 3600.00, LineMemo: "PF_PAYABLE (Emp+Er) - Mansi Main - Feb 2026" },
      { Line_ID: 8, AccountCode: "_SYS00000000501", Debit: 0, Credit: 300.00, LineMemo: "PT - Mansi Main - Feb 2026" },
      { Line_ID: 9, AccountCode: "_SYS00000000286", ShortName: "V10771", Debit: 0, Credit: 45150.00, LineMemo: "NET_PAY - Mansi Main - Feb 2026" },
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
      toast({ title: 'Test JE Failed', description: getErrorMessage(e), variant: 'destructive' });
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
                Post a simple GL-to-GL test JE (₹100 Debit/Credit) to SAP B1 test database
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  try {
                    const data = await apiRequest('POST', '/api/admin/payroll/gl-mapping/auto-resolve');
                    setResult(data);
                    setShowResult(true);
                    toast({ title: 'GL Auto-Resolve Complete', description: `Resolved: ${data.resolved}, Failed: ${data.failed?.length || 0}` });
                  } catch (e: any) {
                    setResult({ error: e.message });
                    setShowResult(true);
                    toast({ title: 'GL Auto-Resolve Failed', description: getErrorMessage(e), variant: 'destructive' });
                  }
                }}
                variant="outline"
                className="border-purple-400 text-purple-700"
              >
                <RefreshCw className="h-4 w-4 mr-2" /> GL Auto-Resolve
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const data = await apiRequest('GET', '/api/admin/payroll/sap-diagnostic');
                    setResult(data);
                    setShowResult(true);
                  } catch (e: any) {
                    setResult({ error: e.message });
                    setShowResult(true);
                  }
                }}
                variant="outline"
                className="border-orange-400 text-orange-700"
              >
                <Search className="h-4 w-4 mr-2" /> SAP Diagnostic
              </Button>
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
          </div>
        </CardContent>
      </Card>

      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{result?.success ? 'Test JE Posted Successfully' : result?.tests ? 'SAP Diagnostic Results' : 'Test JE Result'}</DialogTitle>
          </DialogHeader>
          <pre className="bg-muted p-4 rounded text-xs overflow-auto max-h-[70vh] whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WorkflowStatusBadge({ record }: { record: any }) {
  const raw = record.status || 'generated';
  const status = raw === 'draft' ? 'generated' : raw;
  switch (status) {
    case 'generated':
      return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50"><Clock className="h-3 w-3 mr-1" /> Generated</Badge>;
    case 'verified':
      return <Badge className="bg-emerald-600 text-white"><ShieldCheck className="h-3 w-3 mr-1" /> Verified</Badge>;
    case 'transferred':
      return <Badge className="bg-green-700 text-white"><Lock className="h-3 w-3 mr-1" /> Transferred</Badge>;
    case 'held':
      return (
        <div className="flex flex-col gap-1">
          <Badge className="bg-amber-500 text-white"><Pause className="h-3 w-3 mr-1" /> Held</Badge>
          {record.heldReason && <span className="text-xs text-amber-700 max-w-[180px] truncate" title={record.heldReason}>{record.heldReason}</span>}
        </div>
      );
    case 'rejected':
      return (
        <div className="flex flex-col gap-1">
          <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>
          {record.heldReason && <span className="text-xs text-red-600 max-w-[180px] truncate" title={record.heldReason}>{record.heldReason}</span>}
        </div>
      );
    case 'reversed':
      return (
        <div className="flex flex-col gap-1">
          <Badge className="bg-purple-600 text-white"><Undo2 className="h-3 w-3 mr-1" /> Reversed</Badge>
          {record.reversalSapJeNumber && <span className="text-xs text-purple-600">Rev JE #{record.reversalSapJeNumber}</span>}
        </div>
      );
    case 'voided':
      return (
        <div className="flex flex-col gap-1">
          <Badge className="bg-gray-600 text-white"><Ban className="h-3 w-3 mr-1" /> Voided</Badge>
          {record.heldReason && <span className="text-xs text-gray-600 max-w-[180px] truncate" title={record.heldReason}>{record.heldReason}</span>}
        </div>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function GeneratedSalariesView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showVoidAllConfirm, setShowVoidAllConfirm] = useState(false);
  const [voidAllReason, setVoidAllReason] = useState('');
  const [voidRecordId, setVoidRecordId] = useState<number | null>(null);
  const [showVoidRecordConfirm, setShowVoidRecordConfirm] = useState(false);
  const [voidRecordReason, setVoidRecordReason] = useState('');
  const [postingId, setPostingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<number | 'all'>('all');
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [reasonAction, setReasonAction] = useState<'hold' | 'reject'>('hold');
  const [reasonRecordId, setReasonRecordId] = useState<number | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historyRecord, setHistoryRecord] = useState<any>(null);
  const [showReverseConfirm, setShowReverseConfirm] = useState(false);
  const [reverseRecordId, setReverseRecordId] = useState<number | null>(null);
  const [reversingId, setReversingId] = useState<number | null>(null);
  const [verificationDrilldown, setVerificationDrilldown] = useState<any>(null);
  const [showVerificationDrilldown, setShowVerificationDrilldown] = useState(false);
  const [overrideRecordId, setOverrideRecordId] = useState<number | null>(null);
  const [overridePeriodId, setOverridePeriodId] = useState<number | null>(null);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [verifyingPeriodId, setVerifyingPeriodId] = useState<number | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [viewRecord, setViewRecord] = useState<any>(null);

  const { data: jePreviewData, isLoading: jePreviewLoading } = useQuery<any>({
    queryKey: ['/api/admin/payroll/records', editRecord?.id, 'je-preview'],
    queryFn: () => apiRequest('GET', `/api/admin/payroll/records/${editRecord?.id}/je-preview`),
    enabled: showEditDialog && !!editRecord?.id,
  });

  const { data: generatedSalaries, isLoading: isLoadingGenerated } = useQuery({
    queryKey: ['/api/admin/payroll/records'],
    enabled: true
  });

  const voidAllMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/admin/payroll/records/clear-all'),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-records'] });
      setShowVoidAllConfirm(false);
      setVoidAllReason('');
      toast({ title: 'Records Cleared', description: data.message });
    },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const voidRecordMutation = useMutation({
    mutationFn: ({ recordId, reason }: { recordId: number; reason: string }) =>
      apiRequest('PATCH', `/api/admin/payroll/records/${recordId}/void`, { reason }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-records'] });
      setShowVoidRecordConfirm(false);
      setVoidRecordId(null);
      setVoidRecordReason('');
      toast({ title: 'Record Voided', description: data.message });
    },
    onError: (e: any) => {
      setShowVoidRecordConfirm(false);
      setVoidRecordId(null);
      setVoidRecordReason('');
      toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' });
    },
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
      toast({ title: 'SAP Posting Failed', description: getErrorMessage(e), variant: 'destructive' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ recordId, action, reason }: { recordId: number; action: string; reason?: string }) =>
      apiRequest('PATCH', `/api/admin/payroll/records/${recordId}/status`, { action, reason }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      toast({ title: 'Status Updated', description: data.message });
      setReasonDialogOpen(false);
      setReasonText('');
      setReasonRecordId(null);
    },
    onError: (e: any) => {
      toast({ title: 'Status Update Failed', description: getErrorMessage(e), variant: 'destructive' });
    },
  });

  const reverseSapMutation = useMutation({
    mutationFn: (recordId: number) => {
      setReversingId(recordId);
      return apiRequest('POST', `/api/admin/payroll/records/${recordId}/reverse-sap`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      setReversingId(null);
      setShowReverseConfirm(false);
      setReverseRecordId(null);
      toast({
        title: 'Reversal JE Posted',
        description: `Reversal JE #${data.reversalJeNumber} posted to SAP (Original JE #${data.originalJeNumber})`,
      });
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      setReversingId(null);
      setShowReverseConfirm(false);
      setReverseRecordId(null);
      toast({ title: 'Reversal Failed', description: getErrorMessage(e), variant: 'destructive' });
    },
  });

  const verifyAllMutation = useMutation({
    mutationFn: (periodId: number) => {
      setVerifyingPeriodId(periodId);
      return apiRequest('POST', `/api/payroll/verify/${periodId}`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      setVerifyingPeriodId(null);
      toast({
        title: 'Verification Complete',
        description: `${data?.passed || 0} passed, ${data?.failed || 0} failed out of ${data?.totalRecords || 0} records`,
      });
    },
    onError: (e: any) => {
      setVerifyingPeriodId(null);
      toast({ title: 'Verification Error', description: getErrorMessage(e), variant: 'destructive' });
    },
  });

  const reVerifyFailedMutation = useMutation({
    mutationFn: (periodId: number) => {
      setVerifyingPeriodId(periodId);
      return apiRequest('POST', `/api/payroll/verify/${periodId}/failed`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      setVerifyingPeriodId(null);
      toast({ title: 'Re-Verification Complete', description: `Re-verified failed records: ${data?.passed || 0} now passed, ${data?.failed || 0} still failing` });
    },
    onError: (e: any) => {
      setVerifyingPeriodId(null);
      toast({ title: 'Re-Verification Error', description: getErrorMessage(e), variant: 'destructive' });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: ({ recordId, reason, periodId }: { recordId: number; reason: string; periodId: number }) =>
      apiRequest('POST', `/api/payroll/verify/${periodId}/${recordId}/override`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      setShowOverrideDialog(false);
      setOverrideRecordId(null);
      setOverridePeriodId(null);
      setOverrideReason('');
      toast({ title: 'Override Applied', description: 'Verification warnings have been overridden' });
    },
    onError: (e: any) => {
      toast({ title: 'Override Failed', description: getErrorMessage(e), variant: 'destructive' });
    },
  });

  const editRecordMutation = useMutation({
    mutationFn: ({ recordId, data }: { recordId: number; data: any }) =>
      apiRequest('PATCH', `/api/admin/payroll/records/${recordId}/edit`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      setShowEditDialog(false);
      setEditRecord(null);
      toast({ title: 'Record Updated', description: 'Salary record has been updated successfully.' });
    },
    onError: (e: any) => {
      toast({ title: 'Update Failed', description: getErrorMessage(e), variant: 'destructive' });
    },
  });

  const handleEditRecord = (record: any) => {
    setEditRecord(record);
    setEditFormData({
      baseSalary: record.baseSalary || '0',
      hra: record.hra || '0',
      conveyanceAllowance: record.conveyanceAllowance || '0',
      ltaAllowance: record.ltaAllowance || '0',
      specialAllowance: record.specialAllowance || '0',
      supplementaryAllowance: record.supplementaryAllowance || '0',
      kgpAllowance: record.kgpAllowance || '0',
      bonus: record.bonus || '0',
      overtimePay: record.overtimePay || '0',
      otherAllowances: record.otherAllowances || '0',
      incomeTax: record.incomeTax || '0',
      professionalTax: record.professionalTax || '0',
      providentFund: record.providentFund || '0',
      employeePf: record.employeePf || '0',
      employerPf: record.employerPf || '0',
      esiDeduction: record.esiDeduction || '0',
      employeeEsic: record.employeeEsic || '0',
      employerEsic: record.employerEsic || '0',
      tdsAmount: record.tdsAmount || '0',
      loanDeductions: record.loanDeductions || '0',
      advanceDeductions: record.advanceDeductions || '0',
      reimbursements: record.reimbursements || '0',
      otherDeductions: record.otherDeductions || '0',
    });
    setShowEditDialog(true);
  };

  const handleDownloadSalarySlip = async (payrollRecordId: number) => {
    const url = `/api/admin/salary-slip/${payrollRecordId}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        if (data?.verificationStatus) {
          const statusLabel = data.verificationStatus === 'failed' ? 'has errors' : 'is pending';
          toast({
            title: 'Payslip Blocked',
            description: `Verification ${statusLabel}. ${data.reason || 'Verify payroll before generating payslip.'}`,
            variant: 'destructive',
          });
        } else {
          toast({ title: 'Error', description: data?.error || 'Failed to generate payslip', variant: 'destructive' });
        }
        return;
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const disposition = resp.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : `salary-slip-${payrollRecordId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to generate payslip', variant: 'destructive' });
    }
  };

  const openReasonDialog = (recordId: number, action: 'hold' | 'reject') => {
    setReasonRecordId(recordId);
    setReasonAction(action);
    setReasonText('');
    setReasonDialogOpen(true);
  };

  const submitReasonAction = () => {
    if (!reasonRecordId || !reasonText.trim()) return;
    statusMutation.mutate({ recordId: reasonRecordId, action: reasonAction, reason: reasonText });
  };

  const periodGroups = useMemo(() => {
    if (!generatedSalaries) return {};
    const groups: Record<number, { periodId: number; label: string; records: any[] }> = {};
    (generatedSalaries as any[]).forEach((r: any) => {
      const pid = r.periodId;
      if (!pid) return;
      if (!groups[pid]) {
        groups[pid] = { periodId: pid, label: `${r.month}/${r.year}`, records: [] };
      }
      groups[pid].records.push(r);
    });
    return groups;
  }, [generatedSalaries]);

  const periodVerificationSummaries = useMemo(() => {
    return Object.values(periodGroups).map(g => {
      const total = g.records.length;
      const passed = g.records.filter((r: any) => r.verificationStatus === 'passed').length;
      const failed = g.records.filter((r: any) => r.verificationStatus === 'failed').length;
      const overridden = g.records.filter((r: any) => r.verificationStatus === 'overridden').length;
      const pending = g.records.filter((r: any) => !r.verificationStatus || r.verificationStatus === 'pending').length;
      return { ...g, total, passed, failed, overridden, pending };
    });
  }, [periodGroups]);

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

  const periodFilteredSalaries = selectedPeriodFilter === 'all'
    ? (generatedSalaries as any[])
    : (generatedSalaries as any[]).filter((r: any) => r.periodId === selectedPeriodFilter);

  const searchFilteredRecords = employeeSearch.trim()
    ? periodFilteredSalaries.filter((r: any) => {
        const name = (r.employeeName || r.username || '').toLowerCase();
        const empCode = (r.employeeCode || '').toLowerCase();
        const term = employeeSearch.toLowerCase();
        return name.includes(term) || empCode.includes(term);
      })
    : periodFilteredSalaries;

  const normalizeStatus = (s: string | null | undefined) => {
    const raw = s || 'generated';
    return raw === 'draft' ? 'generated' : raw;
  };

  // A record is "verified" if the admin clicked Verify (status='verified')
  // OR the automated calculation check passed (verificationStatus='passed').
  const isVerifiedRecord = (r: any) =>
    normalizeStatus(r.status) === 'verified' || r.verificationStatus === 'passed';

  const filteredRecords = statusFilter === 'all'
    ? searchFilteredRecords
    : statusFilter === 'verified'
      ? searchFilteredRecords.filter(isVerifiedRecord)
      : searchFilteredRecords.filter((r: any) => {
          const normalized = normalizeStatus(r.status);
          if (statusFilter === 'generated') {
            return normalized === 'generated' && !isVerifiedRecord(r);
          }
          return normalized === statusFilter;
        });

  const verifiedCount = periodFilteredSalaries.filter(isVerifiedRecord).length;
  const statusCounts = periodFilteredSalaries.reduce((acc: any, r: any) => {
    const s = normalizeStatus(r.status);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  // Reconcile: records with status='generated' but verificationStatus='passed' count as verified
  const calcPassedOnly = periodFilteredSalaries.filter(
    (r: any) => normalizeStatus(r.status) !== 'verified' && r.verificationStatus === 'passed'
  ).length;
  statusCounts['verified'] = verifiedCount;
  statusCounts['generated'] = Math.max(0, (statusCounts['generated'] || 0) - calcPassedOnly);

  const handleViewIssues = (record: any) => {
    const details = record.verificationDetails;
    setVerificationDrilldown({
      record,
      issues: details?.issues || [],
      summary: details?.summary || {},
    });
    setShowVerificationDrilldown(true);
  };

  const availablePeriods = Object.values(periodGroups).sort((a, b) => {
    const [am, ay] = a.label.split('/').map(Number);
    const [bm, by] = b.label.split('/').map(Number);
    return by !== ay ? by - ay : bm - am;
  });

  const formatPeriodLabel = (label: string) => {
    const [m, y] = label.split('/').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  };

  return (
    <>
    <div className="flex flex-col gap-3 mb-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Period:</span>
        </div>
        <Select
          value={selectedPeriodFilter === 'all' ? 'all' : String(selectedPeriodFilter)}
          onValueChange={(v) => {
            setSelectedPeriodFilter(v === 'all' ? 'all' : Number(v));
            setStatusFilter('all');
            setEmployeeSearch('');
          }}
        >
          <SelectTrigger className="w-48 h-9">
            <SelectValue placeholder="All Periods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Periods</SelectItem>
            {availablePeriods.map(p => (
              <SelectItem key={p.periodId} value={String(p.periodId)}>
                {formatPeriodLabel(p.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search employee by name or code..."
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
      <div className="flex items-center gap-2 mr-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Filter:</span>
      </div>
      {[
        { key: 'all', label: 'All', count: periodFilteredSalaries.length, color: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
        { key: 'generated', label: 'Generated', count: statusCounts['generated'] || 0, color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200' },
        { key: 'verified', label: 'Verified', count: statusCounts['verified'] || 0, color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200' },
        { key: 'transferred', label: 'Transferred', count: statusCounts['transferred'] || 0, color: 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200' },
        { key: 'held', label: 'Held', count: statusCounts['held'] || 0, color: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200' },
        { key: 'rejected', label: 'Rejected', count: statusCounts['rejected'] || 0, color: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200' },
        { key: 'reversed', label: 'Reversed', count: statusCounts['reversed'] || 0, color: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200' },
        { key: 'voided', label: 'Voided', count: statusCounts['voided'] || 0, color: 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200' },
      ].map(f => (
        <Button
          key={f.key}
          variant={statusFilter === f.key ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter(f.key)}
          className={statusFilter !== f.key ? f.color : ''}
        >
          {f.label} ({f.count})
        </Button>
      ))}
      </div>
    </div>

    {periodVerificationSummaries.filter(ps => selectedPeriodFilter === 'all' || ps.periodId === selectedPeriodFilter).length > 0 && (
      <div className="space-y-3 mb-4">
        {periodVerificationSummaries.filter(ps => selectedPeriodFilter === 'all' || ps.periodId === selectedPeriodFilter).map(ps => (
          <Card key={ps.periodId} className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <FileCheck className="h-5 w-5 text-blue-600" />
                  <div>
                    <h4 className="text-sm font-semibold">Calculation Verification — Period {ps.label}</h4>
                    <p className="text-xs text-muted-foreground">{ps.total} records total</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {ps.passed > 0 && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                      <CheckCircle className="h-3 w-3 mr-1" /> {ps.passed} Passed
                    </Badge>
                  )}
                  {ps.failed > 0 && (
                    <Badge className="bg-red-100 text-red-800 border-red-300">
                      <XCircle className="h-3 w-3 mr-1" /> {ps.failed} Failed
                    </Badge>
                  )}
                  {ps.overridden > 0 && (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                      <AlertTriangle className="h-3 w-3 mr-1" /> {ps.overridden} Overridden
                    </Badge>
                  )}
                  {ps.pending > 0 && (
                    <Badge className="bg-gray-100 text-gray-700 border-gray-300">
                      <Clock className="h-3 w-3 mr-1" /> {ps.pending} Pending
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => verifyAllMutation.mutate(ps.periodId)}
                    disabled={verifyAllMutation.isPending || reVerifyFailedMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 h-8 text-xs"
                  >
                    {verifyAllMutation.isPending && verifyingPeriodId === ps.periodId ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Verifying...</>
                    ) : (
                      <><Shield className="h-3 w-3 mr-1" /> Verify All</>
                    )}
                  </Button>
                  {ps.failed > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reVerifyFailedMutation.mutate(ps.periodId)}
                      disabled={verifyAllMutation.isPending || reVerifyFailedMutation.isPending}
                      className="text-red-600 hover:text-red-800 border-red-300 h-8 text-xs"
                    >
                      {reVerifyFailedMutation.isPending && verifyingPeriodId === ps.periodId ? (
                        <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-verifying...</>
                      ) : (
                        <><RefreshCw className="h-3 w-3 mr-1" /> Re-verify Failed</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )}

    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Generated Salary Records</CardTitle>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowVoidAllConfirm(true)}
        >
          <Ban className="h-4 w-4 mr-2" /> Clear All Generated Salaries
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 text-xs font-semibold uppercase text-muted-foreground">Employee</th>
                <th className="text-left p-3 text-xs font-semibold uppercase text-muted-foreground">Period</th>
                <th className="text-right p-3 text-xs font-semibold uppercase text-muted-foreground">Gross</th>
                <th className="text-right p-3 text-xs font-semibold uppercase text-muted-foreground">Deductions</th>
                <th className="text-right p-3 text-xs font-semibold uppercase text-muted-foreground">Net Salary</th>
                <th className="text-center p-3 text-xs font-semibold uppercase text-muted-foreground">Verification</th>
                <th className="text-center p-3 text-xs font-semibold uppercase text-muted-foreground">Workflow Status</th>
                <th className="text-center p-3 text-xs font-semibold uppercase text-muted-foreground">SAP Status</th>
                <th className="text-center p-3 text-xs font-semibold uppercase text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record: any) => {
                const recStatus = (record.status || 'generated') === 'draft' ? 'generated' : (record.status || 'generated');
                const isManualSalary = record.salarySource === 'manual_salary';
                const isTransferred = recStatus === 'transferred' || (record.sapPostingStatus === 'posted' && recStatus !== 'reversed');
                const isReversed = recStatus === 'reversed';
                const isVoided = recStatus === 'voided';
                const isLocked = isTransferred || isReversed || isVoided;
                return (
                <tr key={record.id} className={`border-b hover:bg-gray-50 ${isTransferred ? 'bg-green-50/30' : isReversed ? 'bg-purple-50/20' : isVoided ? 'bg-gray-50/30' : recStatus === 'rejected' ? 'bg-red-50/20' : recStatus === 'held' ? 'bg-amber-50/20' : ''}`}>
                  <td className="p-3">
                    <div className="font-medium text-sm">
                      {record.employeeName}
                      {record.salarySource === 'manual_salary' && (
                        <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 text-orange-700 border-orange-300 bg-orange-50">Manual</Badge>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{record.employeeCode}</div>
                  </td>
                  <td className="p-3 text-sm">
                    {record.month}/{record.year}
                  </td>
                  <td className="p-3 text-sm text-right">
                    ₹{parseFloat(record.grossEarnings || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="p-3 text-sm text-right">
                    ₹{parseFloat(record.totalDeductions || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="p-3 text-right">
                    <span className="font-semibold text-green-600">
                      ₹{parseFloat(record.netSalary || 0).toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      {(() => {
                        const vs = record.verificationStatus || 'pending';
                        const details = record.verificationDetails;
                        const issueCount = details?.issues?.length || 0;
                        const errorCount = details?.issues?.filter((i: any) => i.severity === 'error').length || 0;
                        const warningCount = details?.issues?.filter((i: any) => i.severity === 'warning').length || 0;

                        if (vs === 'passed') return (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] px-1.5 py-0.5">
                            <CheckCircle className="h-3 w-3 mr-0.5" /> Passed
                          </Badge>
                        );
                        if (vs === 'failed') return (
                          <div className="flex flex-col items-center gap-0.5">
                            <Badge className="bg-red-100 text-red-800 border-red-300 text-[10px] px-1.5 py-0.5 cursor-pointer" onClick={() => handleViewIssues(record)}>
                              <XCircle className="h-3 w-3 mr-0.5" /> {errorCount} Error{errorCount !== 1 ? 's' : ''}{warningCount > 0 ? `, ${warningCount} Warn` : ''}
                            </Badge>
                            <button onClick={() => handleViewIssues(record)} className="text-[10px] text-blue-600 hover:underline">View Issues</button>
                          </div>
                        );
                        if (vs === 'overridden') return (
                          <div className="flex flex-col items-center gap-0.5">
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0.5">
                              <AlertTriangle className="h-3 w-3 mr-0.5" /> Overridden
                            </Badge>
                            {record.verificationOverrideReason && (
                              <span className="text-[9px] text-muted-foreground max-w-[120px] truncate" title={record.verificationOverrideReason}>
                                {record.verificationOverrideReason}
                              </span>
                            )}
                          </div>
                        );
                        return (
                          <Badge className="bg-gray-100 text-gray-600 border-gray-300 text-[10px] px-1.5 py-0.5">
                            <Clock className="h-3 w-3 mr-0.5" /> Pending
                          </Badge>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <WorkflowStatusBadge record={record} />
                      {record.verifiedAt && recStatus === 'verified' && (
                        <span className="text-[10px] text-emerald-600">
                          {fmtDate(record.verifiedAt)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <SapStatusBadge record={record} />
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1 justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setViewRecord(record); setShowViewDialog(true); }}
                        className="text-indigo-600 hover:text-indigo-800 hover:border-indigo-300 h-7 px-2 text-xs"
                      >
                        <Eye className="h-3 w-3 mr-1" /> View
                      </Button>

                      {!isManualSalary && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadSalarySlip(record.id)}
                          className="text-blue-600 hover:text-blue-800 h-7 px-2 text-xs"
                        >
                          <Download className="h-3 w-3 mr-1" /> Slip
                        </Button>
                      )}

                      {isManualSalary && (
                        <span className="text-[10px] text-orange-600 italic">Manage via Manual Salary tab</span>
                      )}

                      {!isManualSalary && (recStatus === 'generated' || recStatus === 'verified') && !isLocked && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditRecord(record)}
                          className="text-blue-600 hover:text-blue-800 hover:border-blue-300 h-7 px-2 text-xs"
                        >
                          <Edit className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      )}

                      {!isManualSalary && recStatus === 'generated' && record.verificationStatus !== 'passed' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => statusMutation.mutate({ recordId: record.id, action: 'verify' })}
                            disabled={statusMutation.isPending}
                            className="text-emerald-600 hover:text-emerald-800 hover:border-emerald-300 h-7 px-2 text-xs"
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" /> Verify
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openReasonDialog(record.id, 'hold')}
                            className="text-amber-600 hover:text-amber-800 hover:border-amber-300 h-7 px-2 text-xs"
                          >
                            <Pause className="h-3 w-3 mr-1" /> Hold
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openReasonDialog(record.id, 'reject')}
                            className="text-red-600 hover:text-red-800 hover:border-red-300 h-7 px-2 text-xs"
                          >
                            <XCircle className="h-3 w-3 mr-1" /> Reject
                          </Button>
                        </>
                      )}

                      {!isManualSalary && recStatus === 'verified' && !isLocked && (
                        <>
                          {record.sapPostingStatus === 'posted' ? (
                            <Button variant="outline" size="sm" disabled className="text-green-600 h-7 px-2 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" /> JE #{record.sapJeNumber}
                            </Button>
                          ) : (() => {
                            const vs = record.verificationStatus || 'pending';
                            // Hard-block only on 'failed' (known calculation errors).
                            // 'pending' (automated check not yet run) does NOT block transfer
                            // when the admin has already manually verified the record.
                            const sapBlocked = vs === 'failed';
                            return sapBlocked ? (
                              <Button variant="outline" size="sm" disabled className="text-gray-400 h-7 px-2 text-xs" title="Fix verification errors before transferring to SAP">
                                <Shield className="h-3 w-3 mr-1" /> Fix Errors
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => postToSapMutation.mutate(record.id)}
                                disabled={postToSapMutation.isPending && postingId === record.id}
                                className="text-orange-600 hover:text-orange-800 hover:border-orange-300 h-7 px-2 text-xs"
                              >
                                {postToSapMutation.isPending && postingId === record.id ? (
                                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Posting...</>
                                ) : record.sapPostingStatus === 'failed' ? (
                                  <><RefreshCw className="h-3 w-3 mr-1" /> Retry SAP</>
                                ) : (
                                  <><Send className="h-3 w-3 mr-1" /> Transfer to SAP</>
                                )}
                              </Button>
                            );
                          })()}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openReasonDialog(record.id, 'hold')}
                            className="text-amber-600 hover:text-amber-800 hover:border-amber-300 h-7 px-2 text-xs"
                          >
                            <Pause className="h-3 w-3 mr-1" /> Hold
                          </Button>
                        </>
                      )}

                      {!isManualSalary && (recStatus === 'held' || recStatus === 'rejected') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => statusMutation.mutate({ recordId: record.id, action: 'reopen' })}
                          disabled={statusMutation.isPending}
                          className="text-blue-600 hover:text-blue-800 hover:border-blue-300 h-7 px-2 text-xs"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Reopen
                        </Button>
                      )}

                      {!isManualSalary && isTransferred && !isReversed && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setReverseRecordId(record.id); setShowReverseConfirm(true); }}
                          disabled={reverseSapMutation.isPending && reversingId === record.id}
                          className="text-purple-600 hover:text-purple-800 hover:border-purple-300 h-7 px-2 text-xs"
                        >
                          {reverseSapMutation.isPending && reversingId === record.id ? (
                            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Reversing...</>
                          ) : (
                            <><Undo2 className="h-3 w-3 mr-1" /> Reverse Entry</>
                          )}
                        </Button>
                      )}

                      {!isManualSalary && isReversed && (
                        <Badge variant="outline" className="text-purple-700 border-purple-300 bg-purple-50 h-7 px-2 text-xs flex items-center">
                          <Ban className="h-3 w-3 mr-1" /> No Repost
                        </Badge>
                      )}

                      {!isManualSalary && (isTransferred || isReversed) && (
                        <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 h-7 px-2 text-xs flex items-center">
                          <Lock className="h-3 w-3 mr-1" /> Locked
                        </Badge>
                      )}

                      {isVoided && (
                        <Badge variant="outline" className="text-gray-600 border-gray-300 bg-gray-50 h-7 px-2 text-xs flex items-center">
                          <Lock className="h-3 w-3 mr-1" /> Voided
                        </Badge>
                      )}

                      {!isLocked && !isVoided && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setVoidRecordId(record.id); setShowVoidRecordConfirm(true); }}
                          className="text-gray-600 hover:text-red-700 hover:border-red-300 h-7 px-2 text-xs"
                        >
                          <Ban className="h-3 w-3 mr-1" /> Void
                        </Button>
                      )}

                      {Array.isArray(record.statusHistory) && record.statusHistory.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setHistoryRecord(record); setShowHistoryDialog(true); }}
                          className="text-gray-500 hover:text-gray-700 h-7 px-2 text-xs"
                        >
                          <History className="h-3 w-3 mr-1" /> Audit
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className={reasonAction === 'hold' ? 'text-amber-600' : 'text-red-600'}>
            {reasonAction === 'hold' ? 'Hold Salary Record' : 'Reject Salary Record'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {reasonAction === 'hold'
              ? 'Held records can be reopened later and then verified. Please provide a reason for holding this record.'
              : 'Rejected records will need to be reopened before they can proceed. Please provide a reason for rejection.'}
          </p>
          <div>
            <Label htmlFor="reason">Reason *</Label>
            <Input
              id="reason"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={reasonAction === 'hold' ? 'e.g. Pending attendance verification' : 'e.g. Incorrect overtime calculation'}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setReasonDialogOpen(false)}>Cancel</Button>
            <Button
              variant={reasonAction === 'hold' ? 'default' : 'destructive'}
              onClick={submitReasonAction}
              disabled={statusMutation.isPending || !reasonText.trim()}
              className={reasonAction === 'hold' ? 'bg-amber-600 hover:bg-amber-700' : ''}
            >
              {statusMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : reasonAction === 'hold' ? 'Hold Record' : 'Reject Record'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Audit Trail — {historyRecord?.employeeName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {historyRecord?.statusHistory?.map((entry: any, idx: number) => (
            <div key={idx} className="flex items-start gap-3 p-2 rounded bg-muted/50 text-sm">
              <div className="mt-0.5">
                {entry.to === 'verified' && <ShieldCheck className="h-4 w-4 text-emerald-600" />}
                {entry.to === 'held' && <Pause className="h-4 w-4 text-amber-600" />}
                {entry.to === 'rejected' && <XCircle className="h-4 w-4 text-red-600" />}
                {entry.to === 'generated' && <RotateCcw className="h-4 w-4 text-blue-600" />}
                {entry.to === 'transferred' && <Lock className="h-4 w-4 text-green-700" />}
                {entry.to === 'reversed' && <Undo2 className="h-4 w-4 text-purple-600" />}
              </div>
              <div className="flex-1">
                <div className="font-medium">
                  <span className="capitalize">{entry.from}</span> → <span className="capitalize">{entry.to}</span>
                </div>
                {entry.reason && <p className="text-xs text-muted-foreground mt-0.5">Reason: {entry.reason}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">By {entry.by} on {fmtDateTime(entry.at)}</p>
              </div>
            </div>
          ))}
          {(!historyRecord?.statusHistory || historyRecord.statusHistory.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">No status changes recorded.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showReverseConfirm} onOpenChange={setShowReverseConfirm}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-purple-600">Reverse SAP Journal Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This will post a <strong>reversal Journal Entry</strong> to SAP B1 that swaps all debit and credit lines of the original salary JE.
          </p>
          <div className="bg-purple-50 border border-purple-200 rounded p-3 text-sm space-y-1">
            <p className="font-medium text-purple-800">What happens:</p>
            <ul className="list-disc list-inside text-purple-700 text-xs space-y-0.5">
              <li>A new reversal JE is created in SAP (debit ↔ credit swapped)</li>
              <li>The original JE is <strong>NOT deleted</strong> — both entries remain</li>
              <li>Record status changes to "Reversed"</li>
              <li>Record is permanently locked — no reposting allowed</li>
            </ul>
          </div>
          <p className="text-sm font-semibold text-purple-600">This action cannot be undone.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowReverseConfirm(false); setReverseRecordId(null); }}>Cancel</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              onClick={() => reverseRecordId && reverseSapMutation.mutate(reverseRecordId)}
              disabled={reverseSapMutation.isPending}
            >
              {reverseSapMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Posting Reversal...</> : <><Undo2 className="h-4 w-4 mr-2" /> Yes, Reverse Entry</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* ── View Salary Details Dialog ─────────────────────────────────────── */}
    <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-indigo-600" />
            Salary Details — {viewRecord?.employeeName}
          </DialogTitle>
          <DialogDescription>
            Period {viewRecord?.month}/{viewRecord?.year}
            {viewRecord?.employeeCode && <span className="ml-2 text-gray-400">({viewRecord.employeeCode})</span>}
          </DialogDescription>
        </DialogHeader>

        {viewRecord && (() => {
          const snap = viewRecord.calculationSnapshot || {};
          const kpi = (snap.kpiAdjustment && snap.kpiAdjustment.kpiSource !== 'non_system_user') ? snap.kpiAdjustment : null;
          const f = (v: any, dec = 2) => parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
          const r = (v: any) => `₹${f(v)}`;

          const basic     = parseFloat(viewRecord.baseSalary || 0);
          const hra       = parseFloat(viewRecord.hra || 0);
          const conv      = parseFloat(viewRecord.conveyanceAllowance || 0);
          const lta       = parseFloat(viewRecord.ltaAllowance || 0);
          const special   = parseFloat(viewRecord.specialAllowance || 0);
          const suppl     = parseFloat(viewRecord.supplementaryAllowance || 0);
          const kgp       = parseFloat(viewRecord.kgpAllowance || 0);
          const bonus     = parseFloat(viewRecord.bonus || 0);
          const otPay     = parseFloat(viewRecord.overtimePay || 0);
          const gross     = parseFloat(viewRecord.grossEarnings || viewRecord.grossPay || 0);
          const pf        = parseFloat(viewRecord.employeePf || 0);
          const esic      = parseFloat(viewRecord.esic || viewRecord.employeeEsic || 0);
          const pt        = parseFloat(viewRecord.professionalTax || 0);
          const tds       = parseFloat(viewRecord.incomeTax || viewRecord.tdsAmount || 0);
          const loans     = parseFloat(viewRecord.loanDeductions || 0);
          const advances  = parseFloat(viewRecord.advanceDeductions || 0);
          const totalDed  = parseFloat(viewRecord.totalDeductions || 0);
          const net       = parseFloat(viewRecord.netSalary || viewRecord.netPay || 0);

          const recStatus = (viewRecord.status || 'generated') === 'draft' ? 'generated' : (viewRecord.status || 'generated');

          return (
            <div className="space-y-4 text-sm">
              {/* Status row */}
              <div className="flex flex-wrap gap-2">
                <WorkflowStatusBadge record={viewRecord} />
                <SapStatusBadge record={viewRecord} />
                {viewRecord.verificationStatus === 'passed' && (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs">
                    <CheckCircle className="h-3 w-3 mr-1" /> Verified
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* ── Attendance ── */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Attendance</p>
                  {[
                    ['Days in Month', viewRecord.workingDays != null ? (parseInt(viewRecord.workingDays) + (viewRecord.weeklyOffs || 0) + (viewRecord.holidays || 0)) : '—'],
                    ['Working Days', viewRecord.workingDays ?? '—'],
                    ['Present Days', viewRecord.presentDays != null ? parseFloat(viewRecord.presentDays) : '—'],
                    ['Paid Days', viewRecord.paidDays != null ? parseFloat(viewRecord.paidDays) : '—'],
                    ['LOP Days', viewRecord.lopDays != null ? parseFloat(viewRecord.lopDays) : '—'],
                    ['Paid Leave', viewRecord.paidLeaveDays != null ? parseFloat(viewRecord.paidLeaveDays) : '—'],
                    ['OT Hours', viewRecord.overtimeHours != null ? parseFloat(viewRecord.overtimeHours) : '—'],
                  ].map(([label, val]) => val !== '—' ? (
                    <div key={label as string} className="flex justify-between text-xs">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-medium">{String(val)}</span>
                    </div>
                  ) : null)}
                </div>

                {/* ── Gross Pay Breakdown ── */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase text-blue-600 mb-2">Gross Pay Breakdown</p>
                  {basic > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Basic (pro-rated)</span><span>{r(basic)}</span></div>}
                  {hra > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">HRA (40%)</span><span>{r(hra)}</span></div>}
                  {conv > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Conveyance (30%)</span><span>{r(conv)}</span></div>}
                  {lta > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">LTA (20%)</span><span>{r(lta)}</span></div>}
                  {special > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Special (30%)</span><span>{r(special)}</span></div>}
                  {suppl > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Supplementary (30%)</span><span>{r(suppl)}</span></div>}
                  {kgp > 0 && (
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">KGP Allowance</span>
                        <span className="font-medium text-blue-700">{r(kgp)}</span>
                      </div>
                      {kpi && (
                        <div className="flex justify-between text-[10px] pl-3">
                          <span className="text-gray-400">
                            KPI {kpi.compositeKpiPercent?.toFixed(2)}%
                            {' '}({kpi.dwarDaysMatched}/{kpi.paidAttendanceDays} DWARs)
                          </span>
                          <span className="text-gray-400">ceiling {r(kpi.kgpCeiling)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {bonus > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Bonus</span><span>{r(bonus)}</span></div>}
                  {otPay > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Overtime</span><span>{r(otPay)}</span></div>}
                  <div className="border-t pt-1.5 mt-1 flex justify-between text-xs font-semibold">
                    <span>Gross Pay</span><span>{r(gross)}</span>
                  </div>
                </div>
              </div>

              {/* ── Deductions ── */}
              <div className="bg-red-50/50 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold uppercase text-red-600 mb-2">Deductions</p>
                <div className="grid grid-cols-2 gap-x-6">
                  <div className="space-y-1.5">
                    {pf > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">PF (Employee)</span><span className="text-red-700">−{r(pf)}</span></div>}
                    {esic > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">ESIC</span><span className="text-red-700">−{r(esic)}</span></div>}
                    {pt > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Professional Tax</span><span className="text-red-700">−{r(pt)}</span></div>}
                  </div>
                  <div className="space-y-1.5">
                    {tds > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">TDS</span><span className="text-red-700">−{r(tds)}</span></div>}
                    {loans > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Loan EMI</span><span className="text-red-700">−{r(loans)}</span></div>}
                    {advances > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Advance Recovery</span><span className="text-red-700">−{r(advances)}</span></div>}
                  </div>
                </div>
                <div className="border-t pt-1.5 mt-1 flex justify-between text-xs font-semibold text-red-700">
                  <span>Total Deductions</span><span>−{r(totalDed)}</span>
                </div>
              </div>

              {/* ── Net Pay ── */}
              <div className="flex justify-between items-center bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <span className="font-semibold text-gray-700">Net Pay</span>
                <span className="text-xl font-bold text-green-700">₹{net.toLocaleString('en-IN')}</span>
              </div>

              {/* ── KPI Detail ── */}
              {kpi && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-blue-700 uppercase">KPI Adjustment (Phase 2)</p>
                  <p className="text-xs text-blue-600">{kpi.formula}</p>
                  <div className="grid grid-cols-3 gap-2 mt-1 text-xs">
                    <div className="text-center"><div className="font-semibold text-blue-800">{kpi.compositeKpiPercent?.toFixed(2)}%</div><div className="text-gray-500">Composite KPI</div></div>
                    <div className="text-center"><div className="font-semibold text-blue-800">{kpi.dwarDaysMatched}/{kpi.paidAttendanceDays}</div><div className="text-gray-500">DWARs / Days</div></div>
                    <div className="text-center"><div className="font-semibold text-blue-800">{r(kpi.kgpCeiling)}</div><div className="text-gray-500">Ceiling</div></div>
                  </div>
                  {kpi.dwarDaysMissing > 0 && (
                    <p className="text-[10px] text-amber-600 mt-1">⚠ {kpi.dwarDaysMissing} paid day{kpi.dwarDaysMissing !== 1 ? 's' : ''} had no DWAR — scored as 0</p>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowViewDialog(false)}>Close</Button>
          {viewRecord && !viewRecord.isManualSalary && (
            <Button variant="outline" onClick={() => handleDownloadSalarySlip(viewRecord.id)} className="text-blue-600">
              <Download className="h-4 w-4 mr-2" /> Download Slip
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={showVoidAllConfirm} onOpenChange={setShowVoidAllConfirm}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-700">Clear All Generated Salaries</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This will <strong>permanently delete</strong> all generated salary records. Records that are already transferred to SAP will be preserved.
          </p>
          <p className="text-sm text-orange-600 text-sm font-medium">
            This action cannot be undone. You will need to re-run the payroll engine to regenerate salary records.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowVoidAllConfirm(false); setVoidAllReason(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => voidAllMutation.mutate()}
              disabled={voidAllMutation.isPending}
            >
              {voidAllMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Clearing...</> : 'Yes, Clear All'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showVerificationDrilldown} onOpenChange={setShowVerificationDrilldown}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-blue-600" />
            Verification Details — {verificationDrilldown?.record?.employeeName}
          </DialogTitle>
        </DialogHeader>
        {verificationDrilldown && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="text-sm">
                <span className="font-medium">Status:</span>{' '}
                {verificationDrilldown.record.verificationStatus === 'passed' && <Badge className="bg-emerald-100 text-emerald-800">Passed</Badge>}
                {verificationDrilldown.record.verificationStatus === 'failed' && <Badge className="bg-red-100 text-red-800">Failed</Badge>}
                {verificationDrilldown.record.verificationStatus === 'overridden' && <Badge className="bg-amber-100 text-amber-800">Overridden</Badge>}
                {(!verificationDrilldown.record.verificationStatus || verificationDrilldown.record.verificationStatus === 'pending') && <Badge className="bg-gray-100 text-gray-700">Pending</Badge>}
              </div>
              {verificationDrilldown.record.verificationRunAt && (
                <div className="text-xs text-muted-foreground">
                  Verified: {fmtDateTime(verificationDrilldown.record.verificationRunAt)}
                </div>
              )}
            </div>

            {verificationDrilldown.issues.length === 0 ? (
              <div className="text-center text-sm text-emerald-600 py-4">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                All checks passed — no issues found
              </div>
            ) : (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Issues Found ({verificationDrilldown.issues.length})</h4>
                {verificationDrilldown.issues.map((issue: any, idx: number) => (
                  <div key={idx} className={`p-3 rounded-lg border text-sm ${
                    issue.severity === 'error' ? 'bg-red-50 border-red-200' :
                    issue.severity === 'warning' ? 'bg-amber-50 border-amber-200' :
                    'bg-blue-50 border-blue-200'
                  }`}>
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 flex-shrink-0">
                        {issue.severity === 'error' && <XCircle className="h-4 w-4 text-red-600" />}
                        {issue.severity === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                        {issue.severity === 'info' && <Info className="h-4 w-4 text-blue-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{issue.title}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {issue.type === 'calculation_error' ? 'Calc Error' :
                             issue.type === 'data_completeness_error' ? 'Data Error' :
                             issue.type === 'policy_error' ? 'Policy Error' :
                             issue.type === 'policy_warning' ? 'Warning' : 'Info'}
                          </Badge>
                        </div>
                        <p className="text-xs mt-1">{issue.details}</p>
                        {(issue.expected !== undefined || issue.actual !== undefined) && (
                          <div className="flex gap-4 mt-1.5 text-xs">
                            {issue.expected !== undefined && (
                              <span>Expected: <strong>{typeof issue.expected === 'number' ? issue.expected.toFixed(2) : String(issue.expected)}</strong></span>
                            )}
                            {issue.actual !== undefined && (
                              <span>Actual: <strong>{typeof issue.actual === 'number' ? issue.actual.toFixed(2) : String(issue.actual)}</strong></span>
                            )}
                            {issue.difference !== undefined && (
                              <span>Diff: <strong className="text-red-600">{typeof issue.difference === 'number' ? issue.difference.toFixed(2) : String(issue.difference)}</strong></span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {verificationDrilldown.record.verificationStatus === 'failed' && (() => {
              const hasOnlyWarnings = verificationDrilldown.issues.every((i: any) =>
                i.type === 'policy_warning' || i.type === 'info' || i.severity === 'warning' || i.severity === 'info'
              );
              const hasWarnings = verificationDrilldown.issues.some((i: any) =>
                i.type === 'policy_warning' || i.severity === 'warning'
              );
              return hasWarnings && hasOnlyWarnings ? (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">
                    This record has only warnings (no calculation/policy errors). You can override and approve it.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-600 border-amber-300"
                    onClick={() => {
                      setOverrideRecordId(verificationDrilldown.record.id);
                      setOverridePeriodId(verificationDrilldown.record.periodId);
                      setOverrideReason('');
                      setShowOverrideDialog(true);
                      setShowVerificationDrilldown(false);
                    }}
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" /> Override Warnings
                  </Button>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-amber-600">Override Verification Warnings</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This will mark the verification as overridden, allowing the record to proceed to SAP posting despite warnings.
          </p>
          <div>
            <Label htmlFor="override-reason">Reason for Override *</Label>
            <textarea
              id="override-reason"
              className="w-full mt-1 p-2 border rounded text-sm min-h-[60px]"
              placeholder="e.g., Confirmed with HR that the leave balance adjustment is correct"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowOverrideDialog(false); setOverrideRecordId(null); setOverrideReason(''); }}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => overrideRecordId && overridePeriodId && overrideMutation.mutate({ recordId: overrideRecordId, reason: overrideReason, periodId: overridePeriodId })}
              disabled={overrideMutation.isPending || !overrideReason.trim()}
            >
              {overrideMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Overriding...</> : 'Apply Override'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showVoidRecordConfirm} onOpenChange={setShowVoidRecordConfirm}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-700">Void Salary Record</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This will mark this salary record as <strong>Voided</strong>. The record will be preserved for audit trail purposes — it is not deleted.
          </p>
          <p className="text-sm text-muted-foreground">
            No SAP entries, loan balances, or advance balances are affected. Only the payroll record status changes.
          </p>
          <div>
            <label className="text-sm font-medium">Reason for voiding <span className="text-red-500">*</span></label>
            <textarea
              className="w-full mt-1 p-2 border rounded text-sm min-h-[60px]"
              placeholder="e.g., Incorrect salary calculation, wrong employee..."
              value={voidRecordReason}
              onChange={(e) => setVoidRecordReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowVoidRecordConfirm(false); setVoidRecordId(null); setVoidRecordReason(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => voidRecordId && voidRecordMutation.mutate({ recordId: voidRecordId, reason: voidRecordReason })}
              disabled={voidRecordMutation.isPending || !voidRecordReason.trim()}
            >
              {voidRecordMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Voiding...</> : 'Yes, Void Record'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Salary Record — {editRecord?.employeeName}</DialogTitle>
          <DialogDescription>
            {editRecord?.month}/{editRecord?.year} | Employee Code: {editRecord?.employeeCode}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-blue-700 mb-2">Earnings</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { key: 'baseSalary', label: 'Basic Salary' },
                { key: 'hra', label: 'HRA' },
                { key: 'conveyanceAllowance', label: 'Conveyance' },
                { key: 'ltaAllowance', label: 'LTA' },
                { key: 'specialAllowance', label: 'Special Allowance' },
                { key: 'supplementaryAllowance', label: 'Supplementary' },
                { key: 'kgpAllowance', label: 'KGP Allowance' },
                { key: 'bonus', label: 'Bonus' },
                { key: 'overtimePay', label: 'Overtime Pay' },
                { key: 'otherAllowances', label: 'Other Allowances' },
                { key: 'reimbursements', label: 'Reimbursements' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-gray-600">{f.label}</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editFormData[f.key] || '0'}
                    onChange={(e) => setEditFormData((prev: any) => ({ ...prev, [f.key]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-red-700 mb-2">Deductions</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { key: 'employeePf', label: 'Employee PF' },
                { key: 'employerPf', label: 'Employer PF' },
                { key: 'employeeEsic', label: 'Employee ESIC' },
                { key: 'employerEsic', label: 'Employer ESIC' },
                { key: 'professionalTax', label: 'Professional Tax' },
                { key: 'incomeTax', label: 'Income Tax (TDS)' },
                { key: 'tdsAmount', label: 'TDS Amount' },
                { key: 'loanDeductions', label: 'Loan Deductions' },
                { key: 'advanceDeductions', label: 'Advance Deductions' },
                { key: 'otherDeductions', label: 'Other Deductions' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-gray-600">{f.label}</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editFormData[f.key] || '0'}
                    onChange={(e) => setEditFormData((prev: any) => ({ ...prev, [f.key]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {(() => {
            const gross = ['baseSalary','hra','conveyanceAllowance','ltaAllowance','specialAllowance','supplementaryAllowance','kgpAllowance','bonus','overtimePay','otherAllowances']
              .reduce((s, k) => s + parseFloat(editFormData[k] || '0'), 0);
            const reimb = parseFloat(editFormData.reimbursements || '0');
            const deductions = ['employeePf','professionalTax','incomeTax','tdsAmount','employeeEsic','loanDeductions','advanceDeductions','otherDeductions']
              .reduce((s, k) => s + parseFloat(editFormData[k] || '0'), 0);
            const net = gross - deductions + reimb;

            return (
              <>
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded border">
                  <div className="text-sm">
                    <span className="text-gray-600">Gross: </span>
                    <span className="font-semibold text-blue-700">₹{gross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Deductions: </span>
                    <span className="font-semibold text-red-600">₹{deductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Net Pay: </span>
                    <span className="font-bold text-green-700 text-base">₹{net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-purple-700">SAP JE JSON Preview</h4>
                    {jePreviewData && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className={jePreviewData.balanced ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                          Dr: ₹{(jePreviewData.totalDebit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Cr: ₹{(jePreviewData.totalCredit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          {jePreviewData.balanced ? ' ✓ Balanced' : ' ✗ Unbalanced'}
                        </span>
                      </div>
                    )}
                  </div>
                  {jePreviewLoading ? (
                    <div className="bg-gray-900 text-gray-400 p-4 rounded text-xs text-center">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading SAP JE preview...
                    </div>
                  ) : jePreviewData?.payload ? (
                    <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-auto max-h-[250px] font-mono">
                      {JSON.stringify(jePreviewData.payload, null, 2)}
                    </pre>
                  ) : (
                    <div className="bg-gray-900 text-red-400 p-3 rounded text-xs">
                      Could not generate JE preview. Check GL mappings.
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditRecord(null); }}>Cancel</Button>
            <Button
              onClick={() => editRecord && editRecordMutation.mutate({ recordId: editRecord.id, data: editFormData })}
              disabled={editRecordMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editRecordMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><Save className="h-4 w-4 mr-2" /> Save Changes</>}
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
  const { data: periods = [], isLoading: periodsLoading } = useQuery<any[]>({
    queryKey: ['/api/payroll/payroll-periods'],
  });
  const { data: salaryConfigs = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/payroll/salary-setup'],
  });
  const { data: sessionUser } = useQuery<any>({ queryKey: ['/api/user'] });

  // Build the set of userIds the current user is allowed to run payroll for
  // Role hierarchy: Superuser(0) > General Manager(1) > Senior Manager(2) > Manager(3) > Senior Executive(4) > Employee(5)
  // Each user sees themselves + everyone with a strictly lower hierarchy level (higher number)
  const visibleUserIds = useMemo(() => {
    if (!sessionUser || sessionUser.role === 'Superuser') return null; // null = all
    const roleLevel: Record<string, number> = {
      'Superuser': 0, 'General Manager': 1, 'Senior Manager': 2,
      'Manager': 3, 'Senior Executive': 4, 'Employee': 5,
    };
    const myLevel = roleLevel[sessionUser.role] ?? 5;
    return new Set<number>(
      salaryConfigs
        .filter((c: any) => {
          if (c.userId === sessionUser.id) return true; // always include self
          const theirLevel = roleLevel[c.role] ?? 5;
          return theirLevel > myLevel; // only show roles strictly below current user
        })
        .map((c: any) => c.userId)
    );
  }, [sessionUser, salaryConfigs]);

  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const ensurePeriodMutation = useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      return await apiRequest('POST', '/api/payroll/payroll-periods/ensure', { year, month });
    },
    onSuccess: (data: any) => {
      if (data.created) {
        toast({ title: 'Period auto-created', description: data.period.periodName });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
      setSelectedPeriodId(data.period.id);
    },
  });

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [singleUserResult, setSingleUserResult] = useState<any>(null);
  const [showPastPeriods, setShowPastPeriods] = useState(false);
  const [autoEnsured, setAutoEnsured] = useState(false);

  useEffect(() => {
    if (periodsLoading || autoEnsured) return;
    setAutoEnsured(true);
    const match = periods.find((p: any) => {
      const sd = new Date(p.startDate);
      return sd.getMonth() + 1 === prevMonth && sd.getFullYear() === prevYear;
    });
    if (match) {
      setSelectedPeriodId(match.id);
    } else {
      ensurePeriodMutation.mutate({ year: prevYear, month: prevMonth });
    }
  }, [periodsLoading, periods]);

  const singleUserRunMutation = useMutation({
    mutationFn: async (data: { periodId: number; userId: number }) => {
      return await apiRequest('POST', '/api/payroll/trial/run', data);
    },
    onSuccess: (data: any) => {
      setSingleUserResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-records'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/verify'] });
      toast({ title: `Trial Run #${data.trialRunNo} Complete`, description: `${data.employee}: Net Pay ₹${parseFloat(data.netPay || 0).toLocaleString('en-IN')}` });
    },
    onError: (err: any) => {
      toast({ title: 'Trial Run Failed', description: err.message, variant: 'destructive' });
    },
  });

  const selectedPeriod = periods.find((p: any) => p.id === selectedPeriodId);
  const isPosted = selectedPeriod && (selectedPeriod.status === 'paid' || selectedPeriod.status === 'locked');

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    processing: 'bg-blue-100 text-blue-700',
    processed: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    paid: 'bg-emerald-100 text-emerald-700',
    locked: 'bg-red-100 text-red-700',
    completed: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-700',
  };

  const pastPeriods = periods
    .filter((p: any) => p.id !== selectedPeriodId)
    .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  if (periodsLoading || ensurePeriodMutation.isPending) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading payroll period...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-lg font-semibold">
                  {selectedPeriod?.periodName || 'No Period Selected'}
                </div>
                {selectedPeriod && (
                  <div className="text-xs text-muted-foreground">
                    {selectedPeriod.startDate} to {selectedPeriod.endDate}
                  </div>
                )}
              </div>
              {selectedPeriod && (
                <Badge className={statusColors[selectedPeriod.status] || 'bg-gray-100 text-gray-700'}>
                  {(selectedPeriod.status || 'draft').toUpperCase()}
                </Badge>
              )}
              {isPosted && (
                <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">
                  <Lock className="h-3 w-3 mr-1" /> SAP Posted — Read Only
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowPastPeriods(!showPastPeriods)}
            >
              <History className="h-4 w-4 mr-1" />
              {showPastPeriods ? 'Hide Past Periods' : 'View Past Periods'}
            </Button>
          </div>

          {showPastPeriods && pastPeriods.length > 0 && (
            <div className="border rounded-lg p-3 mb-4 bg-gray-50 max-h-48 overflow-y-auto">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Past Periods (read-only)</div>
              <div className="space-y-1">
                {pastPeriods.map((p: any) => {
                  const pStatus = p.status || 'draft';
                  return (
                    <button
                      key={p.id}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between hover:bg-gray-100 transition-colors ${
                        p.id === selectedPeriodId ? 'bg-blue-50 border border-blue-200' : ''
                      }`}
                      onClick={() => { setSelectedPeriodId(p.id); setSingleUserResult(null); setSelectedUserId('all'); }}
                    >
                      <span className="font-medium">{p.periodName}</span>
                      <Badge variant="outline" className={`text-xs ${statusColors[pStatus] || ''}`}>
                        {pStatus.toUpperCase()}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedPeriod && !isPosted && (
            <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
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
                      const roleOrder: Record<string, number> = { 'Superuser': 0, 'General Manager': 1, 'Senior Manager': 2, 'Manager': 3, 'Senior Executive': 4, 'Employee': 5 };
                      const visibleConfigs = visibleUserIds
                        ? salaryConfigs.filter((c: any) => visibleUserIds.has(c.userId))
                        : salaryConfigs;
                      const sorted = [...visibleConfigs].sort((a: any, b: any) => {
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
          )}

          {selectedPeriodId && selectedUserId !== 'all' && !isPosted && (
            <div className="flex items-center gap-3 mt-4">
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
                  <><Play className="h-4 w-4 mr-2" /> Run Trial for Selected Employee</>
                )}
              </Button>
              {singleUserResult && (
                <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                  Trial #{singleUserResult.trialRunNo} — Net Pay: ₹{parseFloat(singleUserResult.netPay || 0).toLocaleString('en-IN')}
                </Badge>
              )}
            </div>
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
                  <div className="flex justify-between"><span className="text-gray-500">Present Days</span><span className="font-medium">{singleUserResult.attendance?.presentDays ?? 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Half Days</span><span className="font-medium">{singleUserResult.attendance?.halfDays ?? 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Leave Used</span><span className="font-medium text-amber-600">{((singleUserResult.attendance?.paidLeaveDays || 0) + (singleUserResult.attendance?.unpaidLeaveDays || 0)).toFixed(1)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">LOP Days</span><span className="font-medium text-red-600">{singleUserResult.attendance?.lopDays ?? 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Paid Days</span><span className="font-medium text-green-600">{singleUserResult.attendance?.paidDays ?? 'N/A'}</span></div>
                  {singleUserResult.attendance?.lwpExemptApplied && (
                    <div className="mt-1 pt-1 border-t">
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs font-medium">LWP Exempt — LOP waived by policy</Badge>
                    </div>
                  )}
                  <div className="flex justify-between"><span className="text-gray-500">Weekly Offs</span><span className="font-medium">{singleUserResult.attendance?.weeklyOffs ?? 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Holidays</span><span className="font-medium">{singleUserResult.attendance?.holidays ?? 'N/A'}</span></div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Salary & Deductions</h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
                  {/* ── Gross Pay Breakdown ── */}
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide pb-0.5">Gross Pay Breakdown</p>
                  {singleUserResult.breakdown ? (
                    <>
                      {parseFloat(singleUserResult.breakdown.proratedBase || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Basic (pro-rated)</span><span className="font-medium">₹{parseFloat(singleUserResult.breakdown.proratedBase || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      )}
                      {parseFloat(singleUserResult.breakdown.hra || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">HRA (40%)</span><span className="font-medium">₹{parseFloat(singleUserResult.breakdown.hra || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      )}
                      {parseFloat(singleUserResult.breakdown.conv || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Conveyance (30%)</span><span className="font-medium">₹{parseFloat(singleUserResult.breakdown.conv || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      )}
                      {parseFloat(singleUserResult.breakdown.lta || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">LTA (20%)</span><span className="font-medium">₹{parseFloat(singleUserResult.breakdown.lta || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      )}
                      {parseFloat(singleUserResult.breakdown.specialAllowance || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Special (30%)</span><span className="font-medium">₹{parseFloat(singleUserResult.breakdown.specialAllowance || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      )}
                      {parseFloat(singleUserResult.breakdown.supplementaryAllowance || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Supplementary (30%)</span><span className="font-medium">₹{parseFloat(singleUserResult.breakdown.supplementaryAllowance || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      )}
                      {parseFloat(singleUserResult.breakdown.kgpAllowance || 0) > 0 && (
                        <div className="space-y-0.5">
                          <div className="flex justify-between">
                            <span className="text-gray-500">KGP Allowance</span>
                            <span className="font-medium text-blue-700">₹{parseFloat(singleUserResult.breakdown.kgpAllowance || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                          </div>
                          {singleUserResult.breakdown.compositeKpiPercent != null && (
                            <div className="flex justify-between text-xs pl-3">
                              <span className="text-gray-400">
                                Composite KPI: {singleUserResult.breakdown.compositeKpiPercent.toFixed(2)}%
                                {' '}({singleUserResult.breakdown.kpiDwarMatched}/{singleUserResult.breakdown.kpiPaidDays} DWARs)
                              </span>
                              {singleUserResult.breakdown.kgpCeiling != null && (
                                <span className="text-gray-400">ceiling ₹{parseFloat(singleUserResult.breakdown.kgpCeiling || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {parseFloat(singleUserResult.breakdown.overtimePay || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Overtime</span><span className="font-medium">₹{parseFloat(singleUserResult.breakdown.overtimePay || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                      )}
                    </>
                  ) : null}
                  <div className="border-t pt-1 mt-0.5 flex justify-between font-semibold text-gray-800">
                    <span>Gross Pay</span>
                    <span>₹{parseFloat(singleUserResult.grossPay || 0).toLocaleString('en-IN')}</span>
                  </div>

                  {/* ── Deductions ── */}
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wide pt-1 pb-0.5">Deductions</p>
                  {singleUserResult.deductions && (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500">PF (Employee)</span><span className="font-medium text-red-600">−₹{parseFloat(singleUserResult.deductions.pf || 0).toLocaleString('en-IN')}</span></div>
                      {parseFloat(singleUserResult.deductions.esic || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">ESIC</span><span className="font-medium text-red-600">−₹{parseFloat(singleUserResult.deductions.esic || 0).toLocaleString('en-IN')}</span></div>
                      )}
                      {parseFloat(singleUserResult.deductions.pt || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Professional Tax</span><span className="font-medium text-red-600">−₹{parseFloat(singleUserResult.deductions.pt || 0).toLocaleString('en-IN')}</span></div>
                      )}
                      {parseFloat(singleUserResult.deductions.tds || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">TDS</span><span className="font-medium text-orange-600">−₹{parseFloat(singleUserResult.deductions.tds || 0).toLocaleString('en-IN')}</span></div>
                      )}
                      {parseFloat(singleUserResult.deductions.loanDeductions || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Loan EMI</span><span className="font-medium text-red-600">−₹{parseFloat(singleUserResult.deductions.loanDeductions || 0).toLocaleString('en-IN')}</span></div>
                      )}
                      {parseFloat(singleUserResult.deductions.advanceDeductions || 0) > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Advance Recovery</span><span className="font-medium text-red-600">−₹{parseFloat(singleUserResult.deductions.advanceDeductions || 0).toLocaleString('en-IN')}</span></div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between font-medium"><span className="text-gray-500">Total Deductions</span><span className="text-red-600">−₹{parseFloat(singleUserResult.totalDeductions || 0).toLocaleString('en-IN')}</span></div>
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
    </div>
  );
}

// ── Salary Revision Report Component ─────────────────────────────────────────
type IncrementProposal = {
  id: number;
  employeeId: number;
  employeeName: string;
  incrementPercentage: string;
  oldBasicSalary: string;
  proposedBasicSalary: string;
  oldCtc: string;
  proposedCtc: string;
  effectiveDate: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  remarks: string;
  appliedAt?: string;
};

const REVISION_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:  { label: 'Pending',  className: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  applied:  { label: 'Applied',  className: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
};

function fmtInr(v: string | number) {
  return `₹${parseFloat(String(v)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtInrRound(v: string | number) {
  return `₹${parseFloat(String(v)).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function SalaryRevisionReport({ isSuperuser }: { isSuperuser: boolean }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter] = React.useState<string>('applied');

  const { data: proposals = [], isLoading } = useQuery<IncrementProposal[]>({
    queryKey: ['/api/admin/payroll/increment-proposals/all'],
    enabled: isSuperuser,
  });

  const rows = statusFilter === 'all'
    ? proposals
    : proposals.filter(p => p.status === statusFilter);

  const totalOldBasic = rows.reduce((s, p) => s + parseFloat(p.oldBasicSalary || '0'), 0);
  const totalNewBasic = rows.reduce((s, p) => s + parseFloat(p.proposedBasicSalary || '0'), 0);
  const totalOldCtc   = rows.reduce((s, p) => s + parseFloat(p.oldCtc || '0'), 0);
  const totalNewCtc   = rows.reduce((s, p) => s + parseFloat(p.proposedCtc || '0'), 0);

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head>
      <title>Salary Revision Report — THERMOPAC</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:24px}
        h1{font-size:15px;font-weight:bold;margin-bottom:3px}
        .sub{font-size:10px;color:#555;margin-bottom:14px}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th{background:#1e40af;color:#fff;text-align:left;padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.5px}
        td{padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:10.5px}
        tr:nth-child(even) td{background:#f9fafb}
        tfoot td{background:#eff6ff;font-weight:700;border-top:2px solid #93c5fd}
        .r{text-align:right}.c{text-align:center}
        .pos{color:#166534;font-weight:600}.neg{color:#991b1b;font-weight:600}
        .badge{display:inline-block;padding:2px 7px;border-radius:9px;font-size:9px;font-weight:700}
        .applied{background:#dcfce7;color:#166534}.approved{background:#dbeafe;color:#1e40af}
        .pending{background:#fef3c7;color:#92400e}.rejected{background:#fee2e2;color:#991b1b}
        .footer{margin-top:18px;font-size:9px;color:#888;text-align:right}
      </style>
    </head><body>
      <h1>Salary Revision Report — Old Basic vs New Basic</h1>
      <div class="sub">THERMOPAC · Filter: ${statusFilter === 'all' ? 'All' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} · ${rows.length} employees</div>
      ${el.innerHTML}
      <div class="footer">Generated ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})} · THERMOPAC ERP</div>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  if (!isSuperuser) {
    return (
      <Card className="mt-4">
        <CardContent className="py-16 flex flex-col items-center text-muted-foreground gap-2">
          <FileText className="h-8 w-8" />
          <p className="text-sm">Only Superusers can view salary revision data.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 mt-2">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          <div>
            <h2 className="text-base font-semibold text-gray-900">Old Basic vs New Basic Report</h2>
            <p className="text-xs text-muted-foreground">Salary revision history from all increment proposals</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="applied">Applied Only</SelectItem>
              <SelectItem value="approved">Approved Only</SelectItem>
              <SelectItem value="pending">Pending Only</SelectItem>
              <SelectItem value="rejected">Rejected Only</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={handlePrint}
            disabled={rows.length === 0}
          >
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-gray-50">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total Old Basic</p>
              <p className="text-lg font-bold font-mono mt-0.5">{fmtInrRound(totalOldBasic)}</p>
              <p className="text-[10px] text-muted-foreground">/month · {rows.length} employees</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-3">
              <p className="text-xs text-green-700">Total New Basic</p>
              <p className="text-lg font-bold font-mono text-green-800 mt-0.5">{fmtInrRound(totalNewBasic)}</p>
              <p className="text-[10px] text-green-600 flex items-center gap-0.5">
                <ArrowUpRight className="h-3 w-3" />
                +{fmtInrRound(totalNewBasic - totalOldBasic)}/month increase
              </p>
            </CardContent>
          </Card>
          <Card className="bg-gray-50">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total Old CTC</p>
              <p className="text-lg font-bold font-mono mt-0.5">{fmtInrRound(totalOldCtc)}</p>
              <p className="text-[10px] text-muted-foreground">/month</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-3">
              <p className="text-xs text-green-700">Total New CTC</p>
              <p className="text-lg font-bold font-mono text-green-800 mt-0.5">{fmtInrRound(totalNewCtc)}</p>
              <p className="text-[10px] text-green-600 flex items-center gap-0.5">
                <ArrowUpRight className="h-3 w-3" />
                +{fmtInrRound(totalNewCtc - totalOldCtc)}/month increase
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Printable table */}
      <div ref={printRef}>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <FileText className="h-8 w-8" />
                <p className="text-sm">No salary revision records for the selected filter</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-blue-800 text-white text-xs uppercase tracking-wide">
                      <th className="text-left p-3 pl-4">#</th>
                      <th className="text-left p-3">Employee</th>
                      <th className="text-right p-3">Old Basic</th>
                      <th className="text-right p-3">New Basic</th>
                      <th className="text-right p-3">Difference</th>
                      <th className="text-center p-3">Increment %</th>
                      <th className="text-right p-3">Old CTC/mo</th>
                      <th className="text-right p-3">New CTC/mo</th>
                      <th className="text-center p-3">Effective Date</th>
                      <th className="text-center p-3">Status</th>
                      <th className="text-left p-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p, i) => {
                      const oldB = parseFloat(p.oldBasicSalary || '0');
                      const newB = parseFloat(p.proposedBasicSalary || '0');
                      const diff = newB - oldB;
                      const pct  = parseFloat(p.incrementPercentage || '0');
                      const oldC = parseFloat(p.oldCtc || '0');
                      const newC = parseFloat(p.proposedCtc || '0');
                      const isNeg = diff < 0;
                      return (
                        <tr key={p.id} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'} hover:bg-blue-50/30 transition-colors`}>
                          <td className="p-3 pl-4 text-xs text-gray-400">{i + 1}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5 font-medium text-gray-900">
                              <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                              {p.employeeName}
                            </div>
                            {p.appliedAt && (
                              <div className="text-[10px] text-gray-400 mt-0.5">Applied {fmtDate(p.appliedAt)}</div>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono text-gray-700">{fmtInr(oldB)}</td>
                          <td className="p-3 text-right font-mono font-semibold text-green-700">{fmtInr(newB)}</td>
                          <td className="p-3 text-right font-mono">
                            <span className={`flex items-center justify-end gap-0.5 font-semibold text-xs ${isNeg ? 'text-red-600' : 'text-green-600'}`}>
                              {isNeg ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                              {isNeg ? '-' : '+'}{fmtInr(Math.abs(diff))}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${isNeg ? 'bg-red-50 text-red-700 ring-red-600/20' : 'bg-green-50 text-green-700 ring-green-600/20'}`}>
                              {isNeg ? '' : '+'}{pct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono text-xs text-gray-600">{fmtInrRound(oldC)}</td>
                          <td className="p-3 text-right font-mono text-xs font-semibold text-green-700">{fmtInrRound(newC)}</td>
                          <td className="p-3 text-center text-xs text-gray-700 whitespace-nowrap">{fmtDate(p.effectiveDate)}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${REVISION_STATUS_CONFIG[p.status]?.className}`}>
                              {REVISION_STATUS_CONFIG[p.status]?.label}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-gray-500 max-w-[130px] truncate" title={p.remarks}>{p.remarks || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 border-t-2 border-blue-200 font-semibold text-sm">
                      <td className="p-3 pl-4 text-xs text-gray-600" colSpan={2}>Total ({rows.length} employees)</td>
                      <td className="p-3 text-right font-mono text-gray-800">{fmtInr(totalOldBasic)}</td>
                      <td className="p-3 text-right font-mono text-green-700">{fmtInr(totalNewBasic)}</td>
                      <td className="p-3 text-right font-mono text-green-600 text-xs">
                        +{fmtInr(totalNewBasic - totalOldBasic)}
                      </td>
                      <td className="p-3 text-center text-xs text-green-700">
                        {totalOldBasic > 0 ? `+${(((totalNewBasic - totalOldBasic) / totalOldBasic) * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="p-3 text-right font-mono text-xs text-gray-700">{fmtInrRound(totalOldCtc)}</td>
                      <td className="p-3 text-right font-mono text-xs text-green-700">{fmtInrRound(totalNewCtc)}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PayrollManagementNew() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.length >= 3 ? searchTerm : '');
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);
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
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/verify'] });
      toast({ title: 'Payroll Test Run Complete', description: `${data.employee}: Net Pay ₹${parseFloat(data.netPay).toLocaleString()}` });
    },
    onError: (e: any) => toast({ title: 'Test Run Failed', description: getErrorMessage(e), variant: 'destructive' }),
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

  const { data: sessionUserData } = useQuery<any>({ queryKey: ['/api/user'] });
  const isSuperuserPage = sessionUserData?.role === 'Superuser';
  const { data: incrementPendingData } = useQuery<{ count: number }>({
    queryKey: ['/api/admin/payroll/increment-proposals/pending-count'],
    enabled: isSuperuserPage,
    refetchInterval: 60_000,
  });
  const pendingIncrementCount = incrementPendingData?.count ?? 0;

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
    !debouncedSearch ||
    config.username.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    `${config.firstName} ${config.lastName}`.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    config.department?.toLowerCase().includes(debouncedSearch.toLowerCase())
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
      toast({ title: 'Success', description: 'Salary generated and saved successfully' });
      setIsConfirmationDialogOpen(false);
      setSelectedEmployeeForSalary(null);
      setSelectedMonth('');
      setSelectedYear('');
      setCalculationPreview(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/records'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-records'] });
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
        {/* Pending increment proposals alert for Superusers */}
        {isSuperuserPage && pendingIncrementCount > 0 && (
          <a href="/admin/payroll/increment-approvals" className="block">
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer">
              <TrendingUp className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="font-medium">{pendingIncrementCount} salary increment proposal{pendingIncrementCount > 1 ? 's' : ''} pending your approval</span>
              <span className="ml-auto text-xs underline">Review now →</span>
            </div>
          </a>
        )}

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

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="configurations">Salary Configurations</TabsTrigger>
            <TabsTrigger value="generated">Generated Salaries</TabsTrigger>
            <TabsTrigger value="payroll-run">Payroll Run Engine</TabsTrigger>
            <TabsTrigger value="calendar-attendance">Attendance Calendar</TabsTrigger>
            <TabsTrigger value="manual-salary">Manual Salary</TabsTrigger>
            <TabsTrigger value="tds">Income Tax / TDS</TabsTrigger>
            <TabsTrigger value="salary-revision" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Salary Revision
              {pendingIncrementCount > 0 && (
                <span className="ml-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold px-1 py-0.5 leading-none">{pendingIncrementCount}</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configurations">
            {/* Salary Configurations Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle>Salary Configurations</CardTitle>
                <div className="relative w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or department (min 3 chars)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
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
                      <th className="text-left p-4">Basic Salary / Daily Rate</th>
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
                              {config.userType === 'non_system_user' && (
                                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 text-orange-700 border-orange-300 bg-orange-50">Non-System</Badge>
                              )}
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
                          {config.paidDays}/30
                        </td>
                        <td className="p-4">
                          {fmtDate(config.salaryStartDate)}
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

          <TabsContent value="calendar-attendance">
            <CalendarAttendanceTab />
          </TabsContent>

          <TabsContent value="manual-salary">
            <ManualSalaryTab />
          </TabsContent>

          <TabsContent value="tds">
            <TdsManagementTab />
          </TabsContent>

          <TabsContent value="salary-revision">
            <SalaryRevisionReport isSuperuser={isSuperuserPage} />
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
                    {selectedEmployeeForSalary.salaryType === 'daily' ? 'Daily Rate' : 'Basic Salary'}: ₹{parseFloat(selectedEmployeeForSalary.basicSalary).toLocaleString('en-IN')}
                    {selectedEmployeeForSalary.salaryType === 'daily' && <span className="text-xs"> /day</span>}
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
                        <span>{calculationPreview.data?.salaryType === 'daily' ? 'Daily Rate × Paid Days:' : 'Basic Salary:'}</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.grossBasic || calculationPreview.data?.basicSalary || 0)).toLocaleString('en-IN')}</span>
                      </div>
                      {calculationPreview.data?.salaryType !== 'daily' && (
                        <>
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
                        </>
                      )}
                      {calculationPreview.data?.salaryType !== 'daily' && parseFloat(calculationPreview.data?.kgpAllowance || 0) > 0 && (
                        <div className="flex justify-between">
                          <span>KGP Allowance:</span>
                          <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.kgpAllowance || 0)).toLocaleString('en-IN')}</span>
                        </div>
                      )}
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
                        <div><span className="text-gray-500">Present Days:</span> <span className="font-medium">{testRunResult.attendance?.presentDays ?? 'N/A'}</span></div>
                        <div><span className="text-gray-500">Leave Used:</span> <span className="font-medium text-amber-600">{((testRunResult.attendance?.paidLeaveDays || 0) + (testRunResult.attendance?.unpaidLeaveDays || 0)).toFixed(1)}</span></div>
                        <div><span className="text-gray-500">LOP Days:</span> <span className="font-medium text-red-600">{testRunResult.attendance?.lopDays ?? 'N/A'}</span></div>
                        <div><span className="text-gray-500">Paid Days:</span> <span className="font-medium text-green-600">{testRunResult.attendance?.paidDays ?? 'N/A'}</span></div>
                        <div><span className="text-gray-500">Weekly Offs:</span> <span className="font-medium">{testRunResult.attendance?.weeklyOffs ?? 'N/A'}</span></div>
                        <div><span className="text-gray-500">Holidays:</span> <span className="font-medium">{testRunResult.attendance?.holidays ?? 'N/A'}</span></div>
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(initialData?.userId || null);
  const [employeeWorkweekInfo, setEmployeeWorkweekInfo] = useState<any>(null);

  // ── Increment tab state ────────────────────────────────────────────────────
  // Default effective date = 01 April of the current calendar year (financial year start).
  // Both "before 1 Apr" and "after 1 Apr" cases always resolve to 01/04/current year.
  const defaultIncrEffDate = `${new Date().getFullYear()}-04-01`;
  const defaultIncrEffDateDisplay = `01/04/${new Date().getFullYear()}`;
  const [incrPct, setIncrPct] = useState('0');
  const [incrEffDate, setIncrEffDate] = useState(defaultIncrEffDate);
  const [incrEffDateDisplay, setIncrEffDateDisplay] = useState(defaultIncrEffDateDisplay);
  const [incrRemarks, setIncrRemarks] = useState('Yearly Increment');
  const [approveTarget, setApproveTarget] = useState<any>(null);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Session user (for permission checks)
  const { data: sessionUser } = useQuery<any>({ queryKey: ['/api/user'] });
  const isSuperuser = sessionUser?.role === 'Superuser';
  // Can see Increment tab and submit proposals:
  //   • Superuser
  //   • Administration dept Manager (Manjusha etc.)
  //   • Vishal (Senior Executive, Accounts) — named exception
  const canAccessIncrement =
    isSuperuser ||
    (sessionUser?.department === 'Administration' && sessionUser?.role === 'Manager') ||
    sessionUser?.username === 'Vishal';

  // Show Voided toggle — admin-only, off by default
  const [showVoidedIncr, setShowVoidedIncr] = useState(false);

  // Fetch increment history (also triggers auto-apply on backend)
  const { data: incrHistory = [], isLoading: incrLoading, refetch: refetchHistory } = useQuery<any[]>({
    queryKey: ['/api/admin/payroll/salary-setup', initialData?.id, 'increment-history', showVoidedIncr],
    queryFn: async () => {
      if (!initialData?.id) return [];
      const url = `/api/admin/payroll/salary-setup/${initialData.id}/increment-history${showVoidedIncr ? '?showVoided=true' : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch increment history');
      return res.json();
    },
    enabled: !!initialData?.id,
  });

  const activeProposal = incrHistory.find((p: any) => p.status === 'pending' || p.status === 'approved');
  const hasActive = !!activeProposal;

  // Propose mutation
  const proposeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/admin/payroll/salary-setup/${initialData!.id}/increment`, {
        incrementPercentage: parseFloat(incrPct),
        effectiveDate: incrEffDate,
        remarks: incrRemarks,
      });
    },
    onSuccess: () => {
      toast({ title: 'Proposal Submitted', description: 'Increment proposal submitted and awaiting Superuser approval.' });
      setIncrPct('0'); setIncrEffDate(defaultIncrEffDate); setIncrEffDateDisplay(defaultIncrEffDateDisplay); setIncrRemarks('Yearly Increment');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/salary-setup', initialData?.id, 'increment-history'] });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (proposalId: number) => {
      return await apiRequest('POST', `/api/admin/payroll/increment-proposals/${proposalId}/approve`, {});
    },
    onSuccess: (data: any) => {
      toast({ title: 'Approved', description: data.message });
      setApproveTarget(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/salary-setup'] });
      refetchHistory();
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ proposalId, reason }: { proposalId: number; reason: string }) => {
      return await apiRequest('POST', `/api/admin/payroll/increment-proposals/${proposalId}/reject`, { rejectionReason: reason });
    },
    onSuccess: () => {
      toast({ title: 'Rejected', description: 'Proposal rejected.' });
      setRejectTarget(null); setRejectReason('');
      refetchHistory();
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const form = useForm<SalaryFormValues>({
    resolver: zodResolver(salaryFormSchema),
    defaultValues: initialData ? {
      userId: initialData.userId,
      salaryStartDate: initialData.salaryStartDate,
      salaryType: initialData.salaryType as 'monthly' | 'daily',
      basicSalary: initialData.basicSalary,
      hourlyRate: initialData.hourlyRate || '',
      paidDays: (initialData.paidDays || 30).toString(),
      workingHoursPerDay: (initialData.workingHoursPerDay || 8).toString(),
      overtimeHours: (initialData.overtimeHours || '0').toString(),
      otRate: (initialData.otRate || '1.0').toString(),
      bonus: (initialData.bonus || '0').toString(),
      kgpAllowance: (initialData.kgpAllowance || '0').toString(),
      kpiPercent: (initialData.kpiPercent || '0').toString(),
      kpiKgpApplicable: parseFloat((initialData.kpiPercent || '0').toString()) > 0,
      lwpExempt: initialData.lwpExempt === true,
      pfApplicable: initialData.pfApplicable !== false,
      groupInsurance: initialData.groupInsurance || '1500',
      workLocationId: initialData.workLocationId,
      remarks: initialData.remarks || '',
    } : {
      salaryStartDate: '',
      salaryType: 'monthly',
      basicSalary: '',
      hourlyRate: '',
      paidDays: '30',
      workingHoursPerDay: '8',
      overtimeHours: '0',
      otRate: '1.0',
      bonus: '0',
      kgpAllowance: '0',
      kpiPercent: '0',
      kpiKgpApplicable: false,
      lwpExempt: false,
      pfApplicable: true,
      groupInsurance: '1500',
      remarks: '',
    },
  });

  // Watch form values for calculations
  const watchedValues = form.watch();
  
  // Get selected user role for KGP calculation
  const selectedUser = users.find(u => u.id === watchedValues.userId);
  const selectedUserRole = selectedUser?.role;

  // ── Derive working hours from duty schedule (source of truth) ───────────────
  // Priority: dutyTimeOut − dutyTimeIn → minimumDailyHours → 8
  const computedWorkHours = useMemo(() => {
    if (!selectedUser) return 8;
    if (selectedUser.dutyTimeIn && selectedUser.dutyTimeOut) {
      const [inH, inM] = selectedUser.dutyTimeIn.split(':').map(Number);
      const [outH, outM] = selectedUser.dutyTimeOut.split(':').map(Number);
      const hours = (outH * 60 + outM - (inH * 60 + inM)) / 60;
      if (hours > 0) return hours;
    }
    return selectedUser.minimumDailyHours || 8;
  }, [selectedUser]);

  // Formatted duty schedule values for the info panel
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dutyOffDays = selectedUser?.weeklyOffDays?.map((d: number) => DAY_NAMES[d]).join(', ') || 'Sun, Sat';
  const dutyPolicy = selectedUser?.workTimePolicy || '—';
  const dutyTimeRange = (selectedUser?.dutyTimeIn && selectedUser?.dutyTimeOut)
    ? `${selectedUser.dutyTimeIn} – ${selectedUser.dutyTimeOut} (${computedWorkHours % 1 === 0 ? computedWorkHours : computedWorkHours.toFixed(1)}h)`
    : '—';
  const dutyMinPresent = selectedUser?.minimumDailyHours ?? '—';
  const dutyMinHalfDay = selectedUser?.halfDayMinimumHours ?? '—';

  // Mismatch: stored working hours differ from duty-derived hours
  const storedWorkHours = parseFloat(initialData?.workingHoursPerDay || '8');
  const workHoursMismatch = initialData && Math.abs(storedWorkHours - computedWorkHours) > 0.1;

  // Increment tab — live preview (must be AFTER computedWorkHours is available)
  const previewBasic = incrPct ? (parseFloat(initialData?.basicSalary || '0') * (1 + parseFloat(incrPct) / 100)).toFixed(2) : '';
  const previewCalc = useSalaryCalculations(
    previewBasic
      ? { basicSalary: previewBasic, salaryType: (initialData?.salaryType || 'monthly') as any,
          paidDays: String(initialData?.paidDays || 30),
          workingHoursPerDay: computedWorkHours.toFixed(1),
          kpiPercent: String(initialData?.kpiPercent || 0), groupInsurance: String(initialData?.groupInsurance || 1500),
          overtimeHours: String(initialData?.overtimeHours || 0), otRate: String(initialData?.otRate || '1.0') }
      : {},
    users.find((u) => u.id === initialData?.userId)?.role
  );
  const currentCalc = useSalaryCalculations(
    initialData
      ? { basicSalary: initialData.basicSalary, salaryType: (initialData.salaryType || 'monthly') as any,
          paidDays: String(initialData.paidDays || 30),
          workingHoursPerDay: computedWorkHours.toFixed(1),
          kpiPercent: String(initialData.kpiPercent || 0), groupInsurance: String(initialData.groupInsurance || 1500),
          overtimeHours: String(initialData.overtimeHours || 0), otRate: String(initialData.otRate || '1.0') }
      : {},
    users.find((u) => u.id === initialData?.userId)?.role
  );

  // Always sync workingHoursPerDay to the duty-derived value whenever user or duty changes
  useEffect(() => {
    form.setValue('workingHoursPerDay', computedWorkHours.toFixed(1));
  }, [computedWorkHours, form]);

  // Auto-populate paidDays and otRate when employee is selected (create mode only)
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
          // paidDays default = 30 for monthly (engine overrides from attendance at run time)
          if (!form.getValues('paidDays') || form.getValues('paidDays') === '30') {
            form.setValue('paidDays', '30');
          }
          if (workweekInfo.overtimeRateMultiplier) {
            form.setValue('otRate', workweekInfo.overtimeRateMultiplier);
          }
        }
      }
    }
  }, [watchedValues.userId, getEmployeeWorkweekPolicy, users, form, initialData]);

  useEffect(() => {
    const basic = parseFloat(watchedValues.basicSalary || '0');
    if (basic > 0) {
      // computedWorkHours is derived from duty schedule (source of truth)
      const rate = watchedValues.salaryType === 'daily'
        ? basic / computedWorkHours
        : (basic * 2.5) / 30 / computedWorkHours;
      form.setValue('hourlyRate', rate.toFixed(2));
    }
  }, [watchedValues.salaryType, watchedValues.basicSalary, computedWorkHours, form]);
  
  const calculations = useSalaryCalculations(watchedValues, selectedUserRole);

  // Manual form sync function
  const syncCalculationsToForm = useCallback(() => {
    // This would be called only when saving, not during live typing
    // For now, we'll handle this in the onSubmit directly
  }, []);

  const handleSubmit = (values: SalaryFormValues) => {
    const isDaily = values.salaryType === 'daily';
    // Allowances must always be stored at the FULL-MONTH rate (30 days).
    // The display/preview may show pro-rated values for the current period,
    // but what's saved to DB must be the standard monthly rates so payroll
    // calculations are always correct regardless of when the config was saved.
    const basic = parseFloat(values.basicSalary || '0');
    const kpiPct = parseFloat(values.kpiPercent || '0');
    const fullMonthKgp = isDaily ? 0 : basic * 0.15 * (kpiPct / 100);
    const fullMonthBonus = basic * 0.0833;
    const groupInsAmt = parseFloat(values.groupInsurance || '1500');
    // Full-month gross (no pro-ration)
    const fullHRA      = isDaily ? 0 : basic * 0.4;
    const fullConv     = isDaily ? 0 : basic * 0.3;
    const fullLTA      = isDaily ? 0 : basic * 0.2;
    const fullSpecial  = isDaily ? 0 : basic * 0.3;
    const fullSupp     = isDaily ? 0 : basic * 0.3;
    const fullGross    = isDaily ? basic : basic + fullHRA + fullConv + fullLTA + fullSpecial + fullSupp + fullMonthKgp;
    const pfBase       = Math.min(basic, 15000);
    const empPF        = pfBase * 0.12;
    const emplrPF      = pfBase * 0.12;
    const empESIC      = fullGross <= 21000 ? fullGross * 0.0075 : 0;
    const emplrESIC    = fullGross <= 21000 ? fullGross * 0.0325 : 0;
    const gratuity     = (basic * 15 / 26) / 12;
    const pt           = selectedUserRole === 'Superuser' ? 0 : 200;
    const takeHome     = fullGross - empPF - empESIC - pt;
    const ctcMonthly   = fullGross + emplrPF + emplrESIC + gratuity + groupInsAmt;
    const ctcYearly    = (ctcMonthly * 12) + (fullMonthBonus * 12);

    const submissionValues = {
      ...values,
      houseRentAllowance: isDaily ? null : fullHRA.toFixed(2),
      conveyance: isDaily ? null : fullConv.toFixed(2),
      lta: isDaily ? null : fullLTA.toFixed(2),
      specialAllowance: isDaily ? null : fullSpecial.toFixed(2),
      supplementaryAllowance: isDaily ? null : fullSupp.toFixed(2),
      bonus: fullMonthBonus.toFixed(2),
      kgpAllowance: isDaily ? null : fullMonthKgp.toFixed(2),
      kpiPercent: isDaily ? null : (values.kpiPercent || '0'),
      employeePfContribution: empPF.toFixed(2),
      employerPfContribution: emplrPF.toFixed(2),
      employeeEsicContribution: empESIC.toFixed(2),
      employerEsicContribution: emplrESIC.toFixed(2),
      gratuityCost: gratuity.toFixed(2),
      professionalTax: pt.toFixed(2),
      takeHomeSalary: takeHome.toFixed(2),
      ctcMonthly: ctcMonthly.toFixed(2),
      ctcYearly: ctcYearly.toFixed(2),
    };
    onSubmit(submissionValues);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <Tabs defaultValue="basic-info" className="w-full">
          <TabsList className={`grid w-full ${initialData ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <TabsTrigger value="basic-info">Basic Information</TabsTrigger>
            <TabsTrigger value="allowances">Allowances</TabsTrigger>
            <TabsTrigger value="calculations">Calculations</TabsTrigger>
            {initialData && canAccessIncrement && <TabsTrigger value="increment" className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />Increment</TabsTrigger>}
          </TabsList>

          <TabsContent value="basic-info" className="space-y-5 pt-1">

            {/* ══ Employment Information ══════════════════════════════════════════ */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">Employment Information</p>
              {!initialData ? (
                <>
                  <div className="grid grid-cols-1 gap-4 mb-4">
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
                                          : user.username}
                                        {user.employeeCode && ` - ${user.employeeCode}`}
                                        {(user as any).userType === 'non_system_user' && ' [Non-System]'}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                ))
                              ) : (
                                <SelectItem value="no-employees" disabled>No available employees</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="salaryType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salary Type *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select salary type" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="daily">Daily</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="salaryStartDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salary Start Date *</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="basicSalary" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{watchedValues.salaryType === 'daily' ? 'Daily Rate *' : 'Basic Salary *'}</FormLabel>
                        <FormControl>
                          <Input key="basicSalary" placeholder={watchedValues.salaryType === 'daily' ? 'Enter daily rate' : 'Enter basic salary'} autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <FormField control={form.control} name="salaryType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Salary Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select salary type" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="salaryStartDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Salary Start Date *</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="basicSalary" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{watchedValues.salaryType === 'daily' ? 'Daily Rate *' : 'Basic Salary *'}</FormLabel>
                      <FormControl>
                        <Input key="basicSalary" placeholder={watchedValues.salaryType === 'daily' ? 'Enter daily rate' : 'Enter basic salary'} autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}
            </div>

            {/* ══ Work Schedule ═══════════════════════════════════════════════════ */}
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-3">Work Schedule</p>
              {selectedUser && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 mb-3">
                  <p className="text-xs font-semibold text-blue-700 mb-2 uppercase tracking-wide">Employee Duty Schedule</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Work Time Policy</span>
                      <span className="font-medium">{dutyPolicy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Weekly Off Days</span>
                      <span className="font-medium">{dutyOffDays}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Duty Hours</span>
                      <span className="font-medium">{dutyTimeRange}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Min. Hours (Present)</span>
                      <span className="font-medium">{dutyMinPresent}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Min. Hours (Half Day)</span>
                      <span className="font-medium">{dutyMinHalfDay}h</span>
                    </div>
                  </div>
                </div>
              )}
              {workHoursMismatch && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 mb-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                  <span>
                    Stored working hours ({storedWorkHours}h) differ from current duty schedule ({computedWorkHours % 1 === 0 ? computedWorkHours : computedWorkHours.toFixed(1)}h).
                    Saving this form will update Working Hours/Day automatically.
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="workingHoursPerDay" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Working Hours/Day</FormLabel>
                    <FormControl>
                      <Input key="workingHoursPerDay" readOnly className="bg-gray-50 cursor-not-allowed" autoComplete="off" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Auto-synced from duty schedule — used for OT rate only</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="paidDays" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paid Days</FormLabel>
                    <FormControl>
                      <Input key="paidDays" placeholder="30" autoComplete="off" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Overridden by attendance engine at payroll run time</p>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {watchedValues.salaryType === 'daily' && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <FormField control={form.control} name="overtimeHours" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Overtime Hours</FormLabel>
                      <FormControl><Input key="overtimeHours" placeholder="0" autoComplete="off" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="otRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>OT Rate</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select OT rate" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="1.0">1.0x (Normal Rate)</SelectItem>
                          <SelectItem value="1.5">1.5x (Time and Half)</SelectItem>
                          <SelectItem value="2.0">2.0x (Double Time)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}
            </div>

            {/* ══ Payroll Settings ════════════════════════════════════════════════ */}
            <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-4">
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-3">Payroll Settings</p>
              {watchedValues.salaryType !== 'daily' && (
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <FormField control={form.control} name="kpiKgpApplicable" render={({ field }) => (
                    <FormItem>
                      <FormLabel>KPI / KGP Applicable</FormLabel>
                      <FormControl>
                        <div className="flex gap-6 mt-1">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="radio" className="accent-blue-600 w-4 h-4" checked={!field.value}
                              onChange={() => { field.onChange(false); form.setValue('kpiPercent', '0'); }} />
                            <span className="text-sm font-medium text-gray-700">Not Applicable</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="radio" className="accent-blue-600 w-4 h-4" checked={!!field.value}
                              onChange={() => { field.onChange(true); const cur = parseFloat(form.getValues('kpiPercent') || '0'); if (cur === 0) form.setValue('kpiPercent', '100'); }} />
                            <span className="text-sm font-medium text-gray-700">Applicable</span>
                          </label>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="lwpExempt" render={({ field }) => (
                    <FormItem>
                      <FormLabel>LWP Exempt</FormLabel>
                      <FormControl>
                        <div className="flex gap-6 mt-1">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="radio" className="accent-blue-600 w-4 h-4" checked={!field.value} onChange={() => field.onChange(false)} />
                            <span className="text-sm font-medium text-gray-700">No</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="radio" className="accent-blue-600 w-4 h-4" checked={!!field.value} onChange={() => field.onChange(true)} />
                            <span className="text-sm font-medium text-gray-700">Yes</span>
                          </label>
                        </div>
                      </FormControl>
                      <p className="text-xs text-muted-foreground mt-1">If Yes, full salary regardless of attendance or LOP.</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}
              {/* PT + PF panels */}
              {(() => {
                const dob = selectedUser?.dateOfBirth || (initialData as any)?.dateOfBirth;
                let age: number | undefined;
                if (dob) {
                  const d = new Date(dob);
                  const now = new Date();
                  age = now.getFullYear() - d.getFullYear();
                  const md = now.getMonth() - d.getMonth();
                  if (md < 0 || (md === 0 && now.getDate() < d.getDate())) age--;
                }
                const ptExempt = age !== undefined && age >= 65;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    {/* PT panel */}
                    <div className={`p-3 rounded-lg border ${ptExempt ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-800">Professional Tax (PT)</span>
                        {ptExempt ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-300">✓ Exempt — Age ≥ 65</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">₹200/month · ₹300 in Feb</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {ptExempt
                          ? `Age ${age} yrs — exempt under Maharashtra PT Act (Sec. 27A).`
                          : age !== undefined
                            ? `Age ${age} yrs — PT applicable. 65+ automatically exempt.`
                            : 'Date of birth not set — add in User Profile to enable age-based PT exemption check.'}
                      </p>
                    </div>
                    {/* PF panel */}
                    <FormField control={form.control} name="pfApplicable" render={({ field }) => (
                      <FormItem>
                        <div className={`p-3 rounded-lg border h-full ${!field.value ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-sm font-medium text-gray-800">Provident Fund (PF)</span>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {field.value ? 'Employee PF (12%) + Employer PF (12%) on Basic, capped ₹15,000.' : 'Not applicable — Employee & Employer PF will be ₹0.'}
                              </p>
                            </div>
                            <FormControl>
                              <div className="flex gap-3 shrink-0">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                  <input type="radio" className="accent-blue-600 w-4 h-4" checked={!!field.value} onChange={() => field.onChange(true)} />
                                  <span className="text-sm font-medium text-gray-700">Yes</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                  <input type="radio" className="accent-orange-500 w-4 h-4" checked={!field.value} onChange={() => field.onChange(false)} />
                                  <span className="text-sm font-medium text-gray-700">No</span>
                                </label>
                              </div>
                            </FormControl>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                );
              })()}
              <div className="mt-3">
                <FormField control={form.control} name="groupInsurance" render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>Group Insurance Cost</FormLabel>
                    <FormControl>
                      <Input key="groupInsurance" placeholder="1500" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* ══ Compensation ════════════════════════════════════════════════════ */}
            <div className="rounded-lg border border-green-200 bg-green-50/40 p-4">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">Compensation</p>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="bonus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bonus (Auto-calculated: 8.33% — Not Paid Monthly)</FormLabel>
                    <FormControl>
                      <Input key="bonus" value={calculations.bonus ? `₹${calculations.bonus.toFixed(2)}` : '₹0.00'} placeholder="₹0.00" autoComplete="off" readOnly className="bg-gray-50 cursor-not-allowed" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="hourlyRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hourly Rate (Auto)</FormLabel>
                    <FormControl>
                      <Input key="hourlyRate" placeholder="0.00" autoComplete="off" readOnly className="bg-gray-50" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {watchedValues.salaryType === 'daily' ? 'Daily Rate / Duty Hours (Out − In)' : 'Basic × 2.5 / 30 / Duty Hours (Out − In)'}
                    </p>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {watchedValues.salaryType !== 'daily' && watchedValues.kpiKgpApplicable && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <FormField control={form.control} name="kpiPercent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max KPI % (KGP = Basic × 15% × KPI%)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" max="100" step="1" placeholder="100" autoComplete="off" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Ceiling entitlement — official run scores down via DWAR composite KPI</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div>
                    <label className="text-sm font-medium">KGP Allowance (Auto-calculated)</label>
                    <Input value={`₹${calculations.kgpAllowance ? calculations.kgpAllowance.toFixed(2) : '0.00'}`} readOnly className="bg-gray-50 cursor-not-allowed mt-1" />
                    <p className="text-xs text-muted-foreground mt-1">Basic × 15% × KPI%</p>
                  </div>
                </div>
              )}
            </div>

          </TabsContent>

          <TabsContent value="allowances" className="space-y-4">
            {watchedValues.salaryType === 'daily' ? (
              <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-center">
                <h4 className="font-medium text-gray-700 mb-2">Not Applicable</h4>
                <p className="text-sm text-gray-500">
                  Allowances (HRA, Conveyance, LTA, Special, Supplementary) do not apply to daily rate employees. 
                  Daily salary structure is: Daily Rate + Overtime only.
                </p>
              </div>
            ) : (
              <>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Allowance Information</h4>
                  <p className="text-sm text-blue-700">
                    Monthly employees have auto-calculated allowances based on basic salary percentages.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>House Rent Allowance</Label>
                    <div className="p-3 bg-gray-50 rounded border">
                      ₹{calculations.houseRent.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                      <span className="text-xs text-gray-500 ml-2">(40% of Basic)</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Conveyance Allowance</Label>
                    <div className="p-3 bg-gray-50 rounded border">
                      ₹{calculations.conveyance.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                      <span className="text-xs text-gray-500 ml-2">(30% of Basic)</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>LTA</Label>
                    <div className="p-3 bg-gray-50 rounded border">
                      ₹{calculations.lta.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                      <span className="text-xs text-gray-500 ml-2">(20% of Basic)</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Special Allowance</Label>
                    <div className="p-3 bg-gray-50 rounded border">
                      ₹{calculations.special.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                      <span className="text-xs text-gray-500 ml-2">(30% of Basic)</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Supplementary Allowance</Label>
                    <div className="p-3 bg-gray-50 rounded border">
                      ₹{calculations.supplementary.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                      <span className="text-xs text-gray-500 ml-2">(30% of Basic)</span>
                    </div>
                  </div>
                </div>
              </>
            )}
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
                    <span className="text-sm">{watchedValues.salaryType === 'daily' ? 'Daily Rate × Paid Days:' : 'Basic Salary:'}</span>
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
                  {watchedValues.salaryType !== 'daily' && calculations.kgpAllowance > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm">
                        KGP Allowance
                        {selectedUserRole && 
                         ['Manager', 'Employee'].includes(selectedUserRole) && 
                         ' (15%)'
                        }:
                      </span>
                      <span className="font-medium">₹{Math.round(calculations.kgpAllowance || 0).toLocaleString('en-IN')}</span>
                    </div>
                  )}
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

          {/* ── Increment Tab ──────────────────────────────────────────────── */}
          {initialData && (
            <TabsContent value="increment" className="space-y-4">
              <TooltipProvider>

              {/* Active proposal banner */}
              {hasActive && (
                <div className={`rounded-lg border p-4 ${activeProposal.status === 'pending' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-amber-600" />
                        <span className="font-medium text-sm">
                          {activeProposal.status === 'pending' ? 'Pending Approval' : 'Approved — Awaiting Effective Date'}
                        </span>
                        <Badge className={activeProposal.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}>
                          {activeProposal.status === 'pending' ? 'Pending' : 'Approved'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">{activeProposal.incrementPercentage}%</span> increment ·
                        ₹{Math.round(parseFloat(activeProposal.oldBasicSalary)).toLocaleString('en-IN')} → ₹{Math.round(parseFloat(activeProposal.proposedBasicSalary)).toLocaleString('en-IN')} Basic ·
                        Effective <span className="font-medium">{fmtDate(activeProposal.effectiveDate)}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Proposed by {activeProposal.proposedByName} on {fmtDate(activeProposal.proposedAt)}
                        {activeProposal.status === 'approved' && activeProposal.approvedByName && ` · Approved by ${activeProposal.approvedByName}`}
                      </p>
                      {activeProposal.remarks && <p className="text-xs text-gray-500 italic">"{activeProposal.remarks}"</p>}
                    </div>
                    {isSuperuser && activeProposal.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50 gap-1"
                          onClick={() => setApproveTarget(activeProposal)}>
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 gap-1"
                          onClick={() => { setRejectTarget(activeProposal); setRejectReason(''); }}>
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Propose new increment */}
              <div className={`rounded-lg border p-4 space-y-4 ${hasActive ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-600" />Propose New Increment</h3>
                  {hasActive && <Badge variant="outline" className="text-amber-700 border-amber-300 text-xs">One active proposal exists — resolve it first</Badge>}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Increment % <span className="text-red-500">*</span></Label>
                    <Select value={incrPct} onValueChange={setIncrPct}>
                      <SelectTrigger><SelectValue placeholder="Select %" /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 41 }, (_, i) => i - 10).map(n => (
                          <SelectItem key={n} value={String(n)}>{n > 0 ? `+${n}%` : `${n}%`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {incrPct !== '' && parseFloat(incrPct) < 0 && (
                      <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3" /> Salary reduction — requires justification
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Effective Date <span className="text-red-500">*</span></Label>
                    <Input
                      type="text"
                      placeholder="DD/MM/YYYY"
                      value={incrEffDateDisplay}
                      onChange={e => {
                        const raw = e.target.value;
                        setIncrEffDateDisplay(raw);
                        setIncrEffDate(toIsoDate(raw));
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Remarks</Label>
                    <Input
                      value={incrRemarks}
                      onChange={e => setIncrRemarks(e.target.value)}
                      placeholder="Yearly Increment"
                    />
                  </div>
                </div>

                {/* Live preview */}
                {incrPct !== '' && parseFloat(incrPct) !== 0 && previewBasic && (
                  <div className="rounded-md bg-gray-50 border p-3 grid grid-cols-3 gap-4 text-sm">
                    {[
                      { label: 'Basic Salary', cur: currentCalc.grossBasic, nw: previewCalc.grossBasic, raw: true, curRaw: parseFloat(initialData.basicSalary), nwRaw: parseFloat(previewBasic) },
                      { label: 'Take-Home', cur: currentCalc.takeHome, nw: previewCalc.takeHome },
                      { label: 'CTC Monthly', cur: currentCalc.ctcMonthly, nw: previewCalc.ctcMonthly },
                    ].map(({ label, cur, nw, raw, curRaw, nwRaw }) => {
                      const curVal = raw ? curRaw! : cur;
                      const nwVal = raw ? nwRaw! : nw;
                      const delta = nwVal - curVal;
                      return (
                        <div key={label} className="space-y-0.5">
                          <p className="text-xs text-gray-500">{label}</p>
                          <p className="font-medium">₹{Math.round(nwVal).toLocaleString('en-IN')}</p>
                          <p className="text-xs text-gray-400 line-through">₹{Math.round(curVal).toLocaleString('en-IN')}</p>
                          <p className={`text-xs font-medium ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>{delta >= 0 ? '+' : ''}₹{Math.round(delta).toLocaleString('en-IN')}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={!canAccessIncrement || incrPct === '' || !incrEffDate || hasActive || proposeMutation.isPending || (parseFloat(incrPct) < 0 && incrRemarks.trim().length === 0)}
                    onClick={() => proposeMutation.mutate()}
                    className="gap-1"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {proposeMutation.isPending ? 'Submitting…' : 'Submit Proposal'}
                  </Button>
                </div>
              </div>

              {/* History table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><History className="h-4 w-4" />Increment History</h3>
                  {isSuperuser && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowVoidedIncr(v => !v)}
                      className={`h-7 text-xs gap-1.5 ${showVoidedIncr ? 'text-gray-700 bg-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {showVoidedIncr ? 'Hide Voided' : 'Show Voided'}
                    </Button>
                  )}
                </div>
                {incrLoading ? (
                  <div className="flex items-center justify-center p-6 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
                ) : incrHistory.length === 0 ? (
                  <div className="text-center p-6 text-gray-400 text-sm border rounded-lg">No increment history yet.</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="border-b">
                          <th className="text-left p-2.5 font-medium text-xs text-gray-500">Proposed</th>
                          <th className="text-left p-2.5 font-medium text-xs text-gray-500">Eff. Date</th>
                          <th className="text-right p-2.5 font-medium text-xs text-gray-500">%</th>
                          <th className="text-right p-2.5 font-medium text-xs text-gray-500">Old Basic</th>
                          <th className="text-right p-2.5 font-medium text-xs text-gray-500">New Basic</th>
                          <th className="text-right p-2.5 font-medium text-xs text-gray-500">Old CTC</th>
                          <th className="text-right p-2.5 font-medium text-xs text-gray-500">New CTC</th>
                          <th className="text-left p-2.5 font-medium text-xs text-gray-500">Remarks</th>
                          <th className="text-left p-2.5 font-medium text-xs text-gray-500">Status</th>
                          <th className="text-left p-2.5 font-medium text-xs text-gray-500">By</th>
                          {isSuperuser && <th className="p-2.5"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {incrHistory.map((row: any) => (
                          <tr key={row.id} className="border-b hover:bg-gray-50">
                            <td className="p-2.5 text-xs text-gray-500">{fmtDate(row.proposedAt)}</td>
                            <td className="p-2.5 font-medium">{fmtDate(row.effectiveDate)}</td>
                            <td className="p-2.5 text-right font-medium text-green-700">{row.incrementPercentage}%</td>
                            <td className="p-2.5 text-right">₹{Math.round(parseFloat(row.oldBasicSalary)).toLocaleString('en-IN')}</td>
                            <td className="p-2.5 text-right font-medium">₹{Math.round(parseFloat(row.proposedBasicSalary)).toLocaleString('en-IN')}</td>
                            <td className="p-2.5 text-right text-xs text-gray-500">{row.oldCtc ? `₹${Math.round(parseFloat(row.oldCtc)).toLocaleString('en-IN')}` : '—'}</td>
                            <td className="p-2.5 text-right text-xs text-gray-500">{row.proposedCtc ? `₹${Math.round(parseFloat(row.proposedCtc)).toLocaleString('en-IN')}` : '—'}</td>
                            <td className="p-2.5 text-xs text-gray-600 max-w-[120px] truncate">
                              <Tooltip>
                                <TooltipTrigger asChild><span className="cursor-default">{row.remarks || '—'}</span></TooltipTrigger>
                                <TooltipContent>{row.remarks}</TooltipContent>
                              </Tooltip>
                            </td>
                            <td className="p-2.5">
                              {row.status === 'pending' && <Badge className="bg-amber-100 text-amber-800 text-xs">Pending</Badge>}
                              {row.status === 'approved' && <Badge className="bg-blue-100 text-blue-800 text-xs">Approved · Awaiting Eff. Date</Badge>}
                              {row.status === 'applied' && (
                                <div>
                                  <Badge className="bg-green-100 text-green-800 text-xs">Applied</Badge>
                                  {row.appliedAt && <p className="text-xs text-gray-400 mt-0.5">{fmtDate(row.appliedAt)}</p>}
                                </div>
                              )}
                              {row.status === 'rejected' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-red-100 text-red-800 text-xs cursor-default">Rejected</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-medium">Reason:</p>
                                    <p>{row.rejectionReason}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {row.status === 'voided' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-gray-100 text-gray-500 text-xs border border-gray-300 cursor-default line-through">Voided</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-medium">Voided for audit purposes.</p>
                                    <p className="text-xs">This record has no effect on the current salary.</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </td>
                            <td className="p-2.5 text-xs text-gray-500">{row.proposedByName || '—'}</td>
                            {isSuperuser && (
                              <td className="p-2.5">
                                {row.status === 'pending' && (
                                  <div className="flex gap-1">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600 hover:bg-green-50"
                                          onClick={() => setApproveTarget(row)}>
                                          <Check className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Approve</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-600 hover:bg-red-50"
                                          onClick={() => { setRejectTarget(row); setRejectReason(''); }}>
                                          <X className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Reject</TooltipContent>
                                    </Tooltip>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Approve confirmation dialog */}
              <Dialog open={!!approveTarget} onOpenChange={open => { if (!open) setApproveTarget(null); }}>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-green-600" /> Approve Increment
                    </DialogTitle>
                  </DialogHeader>
                  {approveTarget && (
                    <div className="space-y-3 text-sm">
                      <div className="rounded-md bg-gray-50 p-3 space-y-1">
                        <p><span className="font-medium">Employee:</span> {users.find(u => u.id === initialData.userId)?.firstName} {users.find(u => u.id === initialData.userId)?.lastName}</p>
                        <p><span className="font-medium">Increment:</span> {approveTarget.incrementPercentage}%</p>
                        <p><span className="font-medium">Basic:</span> ₹{Math.round(parseFloat(approveTarget.oldBasicSalary)).toLocaleString('en-IN')} → ₹{Math.round(parseFloat(approveTarget.proposedBasicSalary)).toLocaleString('en-IN')}</p>
                        <p><span className="font-medium">Effective Date:</span> {fmtDate(approveTarget.effectiveDate)}</p>
                        <p><span className="font-medium">Remarks:</span> {approveTarget.remarks}</p>
                      </div>
                      {approveTarget.effectiveDate <= new Date().toISOString().split('T')[0] && (
                        <div className="rounded-md bg-green-50 border border-green-200 p-2 text-xs text-green-800 flex gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          Effective date is today or past — salary will be applied immediately on approval.
                        </div>
                      )}
                    </div>
                  )}
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
                    <Button
                      onClick={() => approveMutation.mutate(approveTarget.id)}
                      disabled={approveMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white gap-1"
                    >
                      <Check className="h-4 w-4" />
                      {approveMutation.isPending ? 'Approving…' : 'Confirm Approve'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Reject dialog */}
              <Dialog open={!!rejectTarget} onOpenChange={open => { if (!open) setRejectTarget(null); }}>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <X className="h-5 w-5 text-red-600" /> Reject Increment Proposal
                    </DialogTitle>
                  </DialogHeader>
                  {rejectTarget && (
                    <div className="space-y-3">
                      <div className="rounded-md bg-gray-50 p-3 text-sm space-y-1">
                        <p><span className="font-medium">Increment:</span> {rejectTarget.incrementPercentage}% · Effective {fmtDate(rejectTarget.effectiveDate)}</p>
                        <p><span className="font-medium">Proposed by:</span> {rejectTarget.proposedByName}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Rejection Reason <span className="text-red-500">*</span></Label>
                        <Textarea
                          rows={3}
                          placeholder="Explain why this proposal is being rejected…"
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                        />
                        <p className={`text-xs ${rejectReason.length < 5 ? 'text-gray-400' : 'text-green-600'}`}>{rejectReason.length} / 5 min characters</p>
                      </div>
                    </div>
                  )}
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
                    <Button
                      variant="destructive"
                      disabled={rejectReason.length < 5 || rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate({ proposalId: rejectTarget.id, reason: rejectReason })}
                    >
                      {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              </TooltipProvider>
            </TabsContent>
          )}
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