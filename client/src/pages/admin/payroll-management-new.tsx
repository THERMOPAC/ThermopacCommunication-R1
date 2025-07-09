import React, { useState, useMemo, useCallback } from 'react';
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
import { Search, Plus, Edit, Trash2, Calculator, Save, X } from 'lucide-react';
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
      conveyance = grossBasic * 0.2; // 20%
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

    // Take home salary
    const takeHome = grossEarnings - employeePF - employeeESIC;

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
    };
  }, [formData, selectedUserRole]);
};

export default function PayrollManagementNew() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<SalaryConfig | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
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
      </div>
    </Layout>
  );
}

// Salary Form Component
interface SalaryFormProps {
  users: User[];
  groupedUsers?: Record<string, User[]>;
  workLocations: WorkLocation[];
  initialData?: SalaryConfig;
  onSubmit: (values: SalaryFormValues) => void;
  isLoading: boolean;
}

function SalaryForm({ users, groupedUsers = {}, workLocations, initialData, onSubmit, isLoading }: SalaryFormProps) {
  const form = useForm<SalaryFormValues>({
    resolver: zodResolver(salaryFormSchema),
    defaultValues: initialData ? {
      userId: initialData.userId,
      salaryStartDate: initialData.salaryStartDate,
      salaryType: initialData.salaryType as 'monthly' | 'daily',
      basicSalary: initialData.basicSalary,
      actualDays: initialData.actualDays.toString(),
      paidDays: initialData.paidDays.toString(),
      workingHoursPerDay: initialData.workingHoursPerDay.toString(),
      overtimeHours: initialData.overtimeHours,
      otRate: initialData.otRate,
      bonus: initialData.bonus,
      kgpAllowance: initialData.kgpAllowance,
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
                    {watchedValues.salaryType === 'daily' ? '(0%)' : '(20% of Basic)'}
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
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Total Deductions:</span>
                    <span>₹{Math.round(calculations.employeePF + calculations.employeeESIC).toLocaleString('en-IN')}</span>
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