import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
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
import { Search, Plus, Edit, Trash2, Calculator, Save, X, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

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
    
    // Auto-calculate KGP Allowance: 15% of Basic Salary for Monthly salary types
    // Only for Manager and Employee roles (excluding Senior Manager, General Manager, Superuser)
    let kgp = 0;
    if (salaryType === 'monthly' && selectedUserRole && ['Manager', 'Employee'].includes(selectedUserRole)) {
      kgp = basicAmount * 0.15; // 15% of Basic Salary
    } else {
      kgp = parseFloat(formData.kgpAllowance || '0');
    }
    
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
      grossEarnings = grossBasic + overtimePay + bonus + kgp;
      
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
      
      grossEarnings = grossBasic + houseRent + conveyance + lta + special + supplementary + bonus + kgp;
    }

    // PF calculations
    const pfBase = Math.min(grossBasic, 15000);
    const employeePF = pfBase * 0.12;
    const employerPF = pfBase * 0.12;

    // ESIC calculations
    const employeeESIC = grossEarnings <= 21000 ? grossEarnings * 0.0075 : 0;
    const employerESIC = grossEarnings <= 21000 ? grossEarnings * 0.0325 : 0;

    // Gratuity calculation
    const gratuity = grossEarnings * 0.0481;

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
    const ctcMonthly = grossEarnings + employerPF + employerESIC + gratuity + groupInsuranceAmount;
    const ctcYearly = ctcMonthly * 12;

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
function GeneratedSalariesView() {
  const { data: generatedSalaries, isLoading: isLoadingGenerated } = useQuery({
    queryKey: ['/api/admin/payroll/records'],
    enabled: true
  });

  const handleDownloadSalarySlip = (payrollRecordId: number) => {
    // Open the PDF in a new window/tab
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
    <Card>
      <CardHeader>
        <CardTitle>Generated Salary Records</CardTitle>
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
                    {new Date(record.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td className="p-4">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDownloadSalarySlip(record.id)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Download Slip
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch data
  const { data: salaryConfigs = [], isLoading } = useQuery<SalaryConfig[]>({
    queryKey: ['/api/admin/payroll/salary-setup'],
  });

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
    onSuccess: (data) => {
      setCalculationPreview(data);
      setIsSalaryGenerationDialogOpen(false);
      setIsConfirmationDialogOpen(true);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to fetch salary calculation preview',
        variant: 'destructive' 
      });
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
    <Layout>
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

        {/* Tabs for Salary Configurations and Generated Salaries */}
        <Tabs defaultValue="configurations" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="configurations">Salary Configurations</TabsTrigger>
            <TabsTrigger value="generated">Generated Salaries</TabsTrigger>
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
                            >
                              <Calculator className="h-4 w-4" />
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
            <GeneratedSalariesView />
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Salary Configuration</DialogTitle>
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
                        <span>Bonus:</span>
                        <span className="font-medium">₹{Math.round(parseFloat(calculationPreview.data?.bonus || 0)).toLocaleString('en-IN')}</span>
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
      </div>
    </Layout>
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
    // Include the auto-calculated bonus and KGP allowance in the submission
    const submissionValues = {
      ...values,
      bonus: calculations.bonus.toString(),
      kgpAllowance: calculations.kgpAllowance.toString()
    };
    console.log('Form submission values:', submissionValues);
    console.log('Form validation errors:', form.formState.errors);
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
                    <FormLabel>Bonus (Auto-calculated: 8.33% of Basic Salary)</FormLabel>
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
                name="kgpAllowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      KGP Allowance
                      {watchedValues.salaryType === 'monthly' && 
                       selectedUserRole && 
                       ['Manager', 'Employee'].includes(selectedUserRole) && 
                       ' (Auto-calculated: 15% of Basic Salary)'
                      }
                    </FormLabel>
                    <FormControl>
                      <Input 
                        key="kgpAllowance"
                        value={
                          watchedValues.salaryType === 'monthly' && 
                          selectedUserRole && 
                          ['Manager', 'Employee'].includes(selectedUserRole)
                            ? `₹${calculations.kgpAllowance ? calculations.kgpAllowance.toFixed(2) : '0.00'}`
                            : field.value
                        }
                        placeholder="0" 
                        autoComplete="off"
                        readOnly={
                          watchedValues.salaryType === 'monthly' && 
                          selectedUserRole && 
                          ['Manager', 'Employee'].includes(selectedUserRole)
                        }
                        className={
                          watchedValues.salaryType === 'monthly' && 
                          selectedUserRole && 
                          ['Manager', 'Employee'].includes(selectedUserRole)
                            ? 'bg-gray-50 cursor-not-allowed'
                            : ''
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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

            <div className="grid grid-cols-2 gap-4">
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
                    <span className="text-sm">Bonus (8.33%):</span>
                    <span className="font-medium">₹{Math.round(calculations.bonus || 0).toLocaleString('en-IN')}</span>
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