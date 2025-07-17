import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Calendar, Users, DollarSign, Calculator, FileText, Settings, Plus, Play, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Schema for forms
const salarySchema = z.object({
  userId: z.number(),
  baseSalary: z.string().min(1, 'Base salary is required'),
  currency: z.string().default('INR'),
  payFrequency: z.enum(['monthly', 'bi-weekly', 'weekly']).default('monthly'),
  effectiveDate: z.string(),
  salaryGrade: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
});

const periodSchema = z.object({
  periodName: z.string().min(1, 'Period name is required'),
  startDate: z.string(),
  endDate: z.string(),
  payDate: z.string(),
});

type EmployeeSalary = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  baseSalary: string;
  currency: string;
  payFrequency: string;
  effectiveDate: string;
  endDate?: string;
  isActive: boolean;
  salaryGrade?: string;
  department?: string;
  position?: string;
  createdAt: string;
};

type PayrollPeriod = {
  id: number;
  periodName: string;
  startDate: string;
  endDate: string;
  payDate: string;
  status: string;
  totalEmployees: number;
  totalGrossPay: string;
  totalDeductions: string;
  totalNetPay: string;
  createdAt: string;
};

type PayrollRecord = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  baseSalary: string;
  grossPay: string;
  totalDeductions: string;
  netPay: string;
  status: string;
  paymentDate?: string;
  paymentReference?: string;
};

type User = {
  id: number;
  username: string;
  email: string;
};

export default function PayrollPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);
  const [showSalaryDialog, setShowSalaryDialog] = useState(false);
  const [showPeriodDialog, setShowPeriodDialog] = useState(false);

  // Fetch data
  const { data: salaries = [], isLoading: salariesLoading } = useQuery({
    queryKey: ['/api/payroll/employee-salaries'],
  });

  const { data: periods = [], isLoading: periodsLoading } = useQuery({
    queryKey: ['/api/payroll/payroll-periods'],
  });

  const { data: users = [] } = useQuery({
    queryKey: ['/api/users'],
  });

  const { data: payrollRecords = [] } = useQuery({
    queryKey: ['/api/payroll/payroll-records', selectedPeriod?.id],
    enabled: !!selectedPeriod,
  });

  // Forms
  const salaryForm = useForm<z.infer<typeof salarySchema>>({
    resolver: zodResolver(salarySchema),
    defaultValues: {
      currency: 'INR',
      payFrequency: 'monthly',
    },
  });

  const periodForm = useForm<z.infer<typeof periodSchema>>({
    resolver: zodResolver(periodSchema),
  });

  // Mutations
  const createSalaryMutation = useMutation({
    mutationFn: (data: z.infer<typeof salarySchema>) =>
      apiRequest('/api/payroll/employee-salaries', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/employee-salaries'] });
      setShowSalaryDialog(false);
      salaryForm.reset();
      toast({ title: 'Success', description: 'Employee salary created successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create employee salary',
        variant: 'destructive' 
      });
    },
  });

  const createPeriodMutation = useMutation({
    mutationFn: (data: z.infer<typeof periodSchema>) =>
      apiRequest('/api/payroll/payroll-periods', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
      setShowPeriodDialog(false);
      periodForm.reset();
      toast({ title: 'Success', description: 'Payroll period created successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create payroll period',
        variant: 'destructive' 
      });
    },
  });

  const generatePayrollMutation = useMutation({
    mutationFn: (periodId: number) =>
      apiRequest(`/api/payroll/generate-payroll/${periodId}`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-records', selectedPeriod?.id] });
      toast({ 
        title: 'Success', 
        description: `Payroll generated for ${data.recordsCreated} employees` 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to generate payroll',
        variant: 'destructive' 
      });
    },
  });

  const onSubmitSalary = (data: z.infer<typeof salarySchema>) => {
    createSalaryMutation.mutate(data);
  };

  const onSubmitPeriod = (data: z.infer<typeof periodSchema>) => {
    createPeriodMutation.mutate(data);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (salariesLoading || periodsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading payroll data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Payroll Management</h1>
          <p className="text-muted-foreground">Manage employee salaries and payroll processing</p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salaries.filter((s: EmployeeSalary) => s.isActive).length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Periods</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{periods.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {periods.filter((p: PayrollPeriod) => p.status === 'processing').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {periods.filter((p: PayrollPeriod) => p.status === 'completed').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="salaries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="salaries">Employee Salaries</TabsTrigger>
          <TabsTrigger value="periods">Payroll Periods</TabsTrigger>
          <TabsTrigger value="records">Payroll Records</TabsTrigger>
        </TabsList>

        {/* Employee Salaries Tab */}
        <TabsContent value="salaries" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Employee Salaries</CardTitle>
                  <CardDescription>Manage employee salary information</CardDescription>
                </div>
                <Dialog open={showSalaryDialog} onOpenChange={setShowSalaryDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Salary
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Employee Salary</DialogTitle>
                      <DialogDescription>Set up salary information for an employee</DialogDescription>
                    </DialogHeader>
                    <Form {...salaryForm}>
                      <form onSubmit={salaryForm.handleSubmit(onSubmitSalary)} className="space-y-4">
                        <FormField
                          control={salaryForm.control}
                          name="userId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Employee</FormLabel>
                              <Select onValueChange={(value) => field.onChange(parseInt(value))}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select employee" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {React.useMemo(() => {
                                    const roleOrder = ['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Employee'];
                                    const groups: Record<string, any[]> = {};
                                    
                                    users?.forEach((user: any) => {
                                      const role = user.role || 'Employee';
                                      if (!groups[role]) {
                                        groups[role] = [];
                                      }
                                      groups[role].push(user);
                                    });
                                    
                                    // Sort alphabetically within each group
                                    Object.values(groups).forEach(group => {
                                      group.sort((a, b) => {
                                        const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
                                        const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
                                        return nameA.localeCompare(nameB);
                                      });
                                    });
                                    
                                    return roleOrder.filter(role => groups[role]).map(role => (
                                      <SelectGroup key={role}>
                                        <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">{role}</SelectLabel>
                                        {groups[role].map((user: any) => (
                                          <SelectItem key={user.id} value={user.id.toString()}>
                                            {user.firstName && user.lastName 
                                              ? `${user.firstName} ${user.lastName}${user.department ? ` • ${user.department}` : ''}`
                                              : user.username
                                            }
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    ));
                                  }, [users])}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={salaryForm.control}
                            name="baseSalary"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Base Salary</FormLabel>
                                <FormControl>
                                  <Input {...field} type="number" step="0.01" placeholder="50000" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={salaryForm.control}
                            name="currency"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Currency</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue="INR">
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="INR">INR</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                    <SelectItem value="EUR">EUR</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={salaryForm.control}
                            name="payFrequency"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Pay Frequency</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue="monthly">
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                                    <SelectItem value="weekly">Weekly</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={salaryForm.control}
                            name="effectiveDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Effective Date</FormLabel>
                                <FormControl>
                                  <Input {...field} type="date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <FormField
                            control={salaryForm.control}
                            name="salaryGrade"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Salary Grade</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="A1" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={salaryForm.control}
                            name="department"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Department</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Engineering" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={salaryForm.control}
                            name="position"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Position</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Software Engineer" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <Button type="submit" disabled={createSalaryMutation.isPending}>
                          {createSalaryMutation.isPending ? 'Creating...' : 'Create Salary'}
                        </Button>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Base Salary</TableHead>
                    <TableHead>Pay Frequency</TableHead>
                    <TableHead>Effective Date</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salaries.map((salary: EmployeeSalary) => (
                    <TableRow key={salary.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{salary.userName}</div>
                          <div className="text-sm text-muted-foreground">{salary.userEmail}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {salary.currency} {parseFloat(salary.baseSalary).toLocaleString()}
                      </TableCell>
                      <TableCell className="capitalize">{salary.payFrequency}</TableCell>
                      <TableCell>{format(new Date(salary.effectiveDate), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>{salary.department || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={salary.isActive ? "default" : "secondary"}>
                          {salary.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payroll Periods Tab */}
        <TabsContent value="periods" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Payroll Periods</CardTitle>
                  <CardDescription>Manage payroll processing periods</CardDescription>
                </div>
                <Dialog open={showPeriodDialog} onOpenChange={setShowPeriodDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Period
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Payroll Period</DialogTitle>
                      <DialogDescription>Set up a new payroll processing period</DialogDescription>
                    </DialogHeader>
                    <Form {...periodForm}>
                      <form onSubmit={periodForm.handleSubmit(onSubmitPeriod)} className="space-y-4">
                        <FormField
                          control={periodForm.control}
                          name="periodName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Period Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="June 2025" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={periodForm.control}
                            name="startDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Start Date</FormLabel>
                                <FormControl>
                                  <Input {...field} type="date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={periodForm.control}
                            name="endDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>End Date</FormLabel>
                                <FormControl>
                                  <Input {...field} type="date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={periodForm.control}
                          name="payDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Pay Date</FormLabel>
                              <FormControl>
                                <Input {...field} type="date" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button type="submit" disabled={createPeriodMutation.isPending}>
                          {createPeriodMutation.isPending ? 'Creating...' : 'Create Period'}
                        </Button>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period Name</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Pay Date</TableHead>
                    <TableHead>Employees</TableHead>
                    <TableHead>Total Net Pay</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((period: PayrollPeriod) => (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">{period.periodName}</TableCell>
                      <TableCell>{format(new Date(period.startDate), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>{format(new Date(period.endDate), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>{format(new Date(period.payDate), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>{period.totalEmployees}</TableCell>
                      <TableCell>
                        ₹{parseFloat(period.totalNetPay || '0').toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(period.status)}>
                          {period.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {period.status === 'draft' && (
                            <Button
                              size="sm"
                              onClick={() => generatePayrollMutation.mutate(period.id)}
                              disabled={generatePayrollMutation.isPending}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Generate
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedPeriod(period)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payroll Records Tab */}
        <TabsContent value="records" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Payroll Records</CardTitle>
                  <CardDescription>
                    {selectedPeriod 
                      ? `Viewing records for ${selectedPeriod.periodName}` 
                      : 'Select a payroll period to view records'
                    }
                  </CardDescription>
                </div>
                {selectedPeriod && (
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Period Status</div>
                    <Badge className={getStatusColor(selectedPeriod.status)}>
                      {selectedPeriod.status}
                    </Badge>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {selectedPeriod ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Base Salary</TableHead>
                      <TableHead>Gross Pay</TableHead>
                      <TableHead>Deductions</TableHead>
                      <TableHead>Net Pay</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollRecords.map((record: PayrollRecord) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{record.userName}</div>
                            <div className="text-sm text-muted-foreground">{record.userEmail}</div>
                          </div>
                        </TableCell>
                        <TableCell>₹{parseFloat(record.baseSalary).toLocaleString()}</TableCell>
                        <TableCell>₹{parseFloat(record.grossPay).toLocaleString()}</TableCell>
                        <TableCell>₹{parseFloat(record.totalDeductions).toLocaleString()}</TableCell>
                        <TableCell className="font-medium">
                          ₹{parseFloat(record.netPay).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(record.status)}>
                            {record.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Please select a payroll period from the Payroll Periods tab to view records
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}