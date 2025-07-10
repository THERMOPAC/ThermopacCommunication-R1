import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  CreditCard, 
  Search, 
  Edit, 
  Plus,
  Calculator,
  Receipt,
  Users,
  TrendingUp
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";

// Salary configuration form schema
const salaryFormSchema = z.object({
  userId: z.number({ required_error: "Please select an employee" }),
  salaryStartDate: z.string(),
  basicSalary: z.string().min(1, "Basic salary is required"),
  houseRentAllowance: z.string().default("0"),
  conveyance: z.string().default("0"),
  lta: z.string().default("0"),
  specialAllowance: z.string().default("0"),
  supplementaryAllowance: z.string().default("0"),
  bonus: z.string().default("0"),
  gratuityCost: z.string().default("0"),
  kgpAllowance: z.string().default("0"),
  employeePfContribution: z.string().default("0"),
  employerPfContribution: z.string().default("0"),
  employeeEsicContribution: z.string().default("0"),
  employerEsicContribution: z.string().default("0"),
  groupInsurance: z.string().default("0"),
  bankName: z.string().optional(),
  bankAccountNo: z.string().optional(),
  debitAccount: z.string().optional(),
  // Additional fields for daily worker support
  salaryType: z.string().default("monthly"),
  actualDays: z.string().default("30"),
  workingHoursPerDay: z.string().default("8"),
  overtimeHours: z.string().default("0"),
  otRate: z.string().default("1.0"),
});

type SalaryFormValues = z.infer<typeof salaryFormSchema>;

interface SalaryConfig {
  id: number;
  userId: number;
  username: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  employeeCode?: string;
  salaryStartDate: string;
  basicSalary: string;
  houseRentAllowance: string;
  conveyance: string;
  lta: string;
  specialAllowance: string;
  supplementaryAllowance: string;
  bonus: string;
  gratuityCost: string;
  kgpAllowance: string;
  employeePfContribution: string;
  employerPfContribution: string;
  employeeEsicContribution: string;
  employerEsicContribution: string;
  groupInsurance: string;
  bankName?: string;
  bankAccountNo?: string;
  debitAccount?: string;
  takeHomeSalary: string;
  ctcMonthly: string;
  ctcYearly: string;
  isActive: boolean;
  // Additional fields for daily worker support
  salaryType?: string;
  actualDays?: number;
  workingHoursPerDay?: number;
  overtimeHours?: string;
  otRate?: string;
}

interface User {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  employeeCode?: string;
}

export default function PayrollManagementPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<SalaryConfig | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch salary configurations
  const { data: salaryConfigs = [], isLoading } = useQuery<SalaryConfig[]>({
    queryKey: ['/api/admin/payroll/salary-setup'],
  });

  // Fetch all users for dropdown
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
  });

  // Filter users that don't have salary configuration yet
  const availableUsers = users.filter(user => 
    !salaryConfigs.some(config => config.userId === user.id)
  );

  // Filter salary configurations based on search term
  const filteredConfigs = salaryConfigs.filter(config =>
    config.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    `${config.firstName} ${config.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    config.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Save salary configuration mutation
  const saveSalaryMutation = useMutation({
    mutationFn: async (salaryData: SalaryFormValues) => {
      return apiRequest('POST', '/api/admin/payroll/salary-setup', salaryData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/salary-setup'] });
      setIsAddDialogOpen(false);
      setIsEditDialogOpen(false);
      setSelectedEmployee(null);
      toast({
        title: "Salary Configuration Saved",
        description: "Employee salary details have been successfully configured.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save salary configuration. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Form for salary configuration
  const form = useForm<SalaryFormValues>({
    resolver: zodResolver(salaryFormSchema),
    defaultValues: {
      salaryStartDate: new Date().toISOString().split('T')[0],
      basicSalary: "",
      houseRentAllowance: "0",
      conveyance: "0",
      lta: "0",
      specialAllowance: "0",
      supplementaryAllowance: "0",
      bonus: "0",
      gratuityCost: "0",
      kgpAllowance: "0",
      employeePfContribution: "0",
      employerPfContribution: "0",
      employeeEsicContribution: "0",
      employerEsicContribution: "0",
      groupInsurance: "0",
      salaryType: "monthly",
      actualDays: "30",
      workingHoursPerDay: "8",
      overtimeHours: "0",
      otRate: "1.0",
    },
  });

  // Watch form values for calculation with memoized values to prevent re-renders
  const watchedValues = form.watch();
  const basicSalary = useMemo(() => watchedValues.basicSalary || '', [watchedValues.basicSalary]);
  const salaryType = useMemo(() => watchedValues.salaryType || 'monthly', [watchedValues.salaryType]);
  const workingHoursPerDay = useMemo(() => watchedValues.workingHoursPerDay || '8', [watchedValues.workingHoursPerDay]);
  const overtimeHours = useMemo(() => watchedValues.overtimeHours || '0', [watchedValues.overtimeHours]);
  const otRate = useMemo(() => watchedValues.otRate || '1.0', [watchedValues.otRate]);
  const actualDays = useMemo(() => watchedValues.actualDays || '30', [watchedValues.actualDays]);
  const paidDays = useMemo(() => watchedValues.paidDays || '30', [watchedValues.paidDays]);

  // Memoized calculated values to avoid remounting
  const calculatedValues = useMemo(() => {
    const basicAmount = parseFloat(basicSalary || '0');
    if (basicAmount <= 0) return {
      employeePfContribution: '0',
      employerPfContribution: '0',
      employeeEsicContribution: '0',
      employerEsicContribution: '0',
      gratuityCost: '0',
      takeHomeSalary: '0',
      ctcMonthly: '0',
      ctcYearly: '0',
      houseRentAllowance: salaryType === 'daily' ? '0' : '40',
      conveyance: salaryType === 'daily' ? '0' : '30',
      lta: salaryType === 'daily' ? '0' : '20',
      specialAllowance: salaryType === 'daily' ? '0' : '30',
      supplementaryAllowance: salaryType === 'daily' ? '0' : '30',
      groupInsurance: salaryType === 'daily' ? '300' : '0'
    };

    const actualDaysNum = parseFloat(actualDays || '30');
    const paidDaysNum = parseFloat(paidDays || '30');
    const workingHoursNum = parseFloat(workingHoursPerDay || '8');
    const overtimeHoursNum = parseFloat(overtimeHours || '0');
    const otRateNum = parseFloat(otRate || '1.0');
    
    let proRatedBasic, overtimePay, grossSalary, employeePF, employerPF, employeeESIC, employerESIC, monthlyGratuityProvision;
    let hra = 0, conveyance = 0, lta = 0, special = 0, supplementary = 0;
    
    if (salaryType === 'daily') {
      // Daily worker calculations
      const grossBasic = basicAmount * paidDaysNum;
      proRatedBasic = grossBasic;
      
      const hourlyRate = basicAmount / workingHoursNum;
      overtimePay = hourlyRate * overtimeHoursNum * otRateNum;
      
      const bonus = parseFloat(form.getValues('bonus') || '0');
      const kgp = parseFloat(form.getValues('kgpAllowance') || '0');
      const grossEarnings = grossBasic + overtimePay + bonus + kgp;
      grossSalary = grossEarnings;
      
      const pfBase = Math.min(grossBasic, 15000);
      employeePF = pfBase * 0.12;
      employerPF = pfBase * 0.12;
      
      employeeESIC = grossEarnings <= 21000 ? grossEarnings * 0.0075 : 0;
      employerESIC = grossEarnings <= 21000 ? grossEarnings * 0.0325 : 0;
      
      monthlyGratuityProvision = (basicAmount * 15 / 26) / 12;
      
      const groupInsurance = 300;
      const takeHomeSalary = grossEarnings - employeePF - employeeESIC;
      const ctcMonthly = grossEarnings + employerPF + employerESIC + groupInsurance + monthlyGratuityProvision;
      const ctcYearly = ctcMonthly * 12;
      
      return {
        employeePfContribution: employeePF.toFixed(2),
        employerPfContribution: employerPF.toFixed(2),
        employeeEsicContribution: employeeESIC.toFixed(2),
        employerEsicContribution: employerESIC.toFixed(2),
        gratuityCost: monthlyGratuityProvision.toFixed(2),
        takeHomeSalary: takeHomeSalary.toFixed(2),
        ctcMonthly: ctcMonthly.toFixed(2),
        ctcYearly: ctcYearly.toFixed(2),
        houseRentAllowance: '0',
        conveyance: '0',
        lta: '0',
        specialAllowance: '0',
        supplementaryAllowance: '0',
        groupInsurance: groupInsurance.toFixed(2)
      };
      
    } else {
      // Monthly worker calculations
      proRatedBasic = basicAmount * (paidDaysNum / actualDaysNum);
      
      hra = proRatedBasic * 0.40;
      conveyance = proRatedBasic * 0.30;
      lta = proRatedBasic * 0.20;
      special = proRatedBasic * 0.30;
      supplementary = proRatedBasic * 0.30;
      
      const bonus = parseFloat(form.getValues('bonus') || '0');
      const kgp = parseFloat(form.getValues('kgpAllowance') || '0');
      grossSalary = proRatedBasic + hra + conveyance + lta + special + supplementary + bonus + kgp;
      
      const pfBase = Math.min(proRatedBasic, 15000);
      employeePF = pfBase * 0.12;
      employerPF = pfBase * 0.12;
      
      employeeESIC = grossSalary <= 21000 ? grossSalary * 0.0075 : 0;
      employerESIC = grossSalary <= 21000 ? grossSalary * 0.0325 : 0;
      
      monthlyGratuityProvision = (basicAmount * 15 / 26) / 12;
      
      const groupInsurance = parseFloat(form.getValues('groupInsurance') || '0');
      const takeHomeSalary = grossSalary - employeePF - employeeESIC;
      const ctcMonthly = grossSalary + employerPF + employerESIC + groupInsurance + monthlyGratuityProvision;
      const ctcYearly = ctcMonthly * 12;
      
      return {
        employeePfContribution: employeePF.toFixed(2),
        employerPfContribution: employerPF.toFixed(2),
        employeeEsicContribution: employeeESIC.toFixed(2),
        employerEsicContribution: employerESIC.toFixed(2),
        gratuityCost: monthlyGratuityProvision.toFixed(2),
        takeHomeSalary: takeHomeSalary.toFixed(2),
        ctcMonthly: ctcMonthly.toFixed(2),
        ctcYearly: ctcYearly.toFixed(2),
        houseRentAllowance: '40',
        conveyance: '30',
        lta: '20',
        specialAllowance: '30',
        supplementaryAllowance: '30',
        groupInsurance: groupInsurance.toFixed(2)
      };
    }
  }, [basicSalary, salaryType, workingHoursPerDay, overtimeHours, otRate, actualDays, paidDays, form]);

  // Auto-update form with calculated values when inputs change
  useEffect(() => {
    if (parseFloat(basicSalary || '0') > 0) {

      form.setValue('gratuityCost', calculatedValues.gratuityCost, { shouldValidate: false });
      form.setValue('employeePfContribution', calculatedValues.employeePfContribution, { shouldValidate: false });
      form.setValue('employerPfContribution', calculatedValues.employerPfContribution, { shouldValidate: false });
      form.setValue('employeeEsicContribution', calculatedValues.employeeEsicContribution, { shouldValidate: false });
      form.setValue('employerEsicContribution', calculatedValues.employerEsicContribution, { shouldValidate: false });
      form.setValue('takeHomeSalary', calculatedValues.takeHomeSalary, { shouldValidate: false });
      form.setValue('ctcMonthly', calculatedValues.ctcMonthly, { shouldValidate: false });
      form.setValue('ctcYearly', calculatedValues.ctcYearly, { shouldValidate: false });
      
      // Update allowances for monthly workers
      if (salaryType === 'monthly') {
        form.setValue('houseRentAllowance', calculatedValues.houseRentAllowance, { shouldValidate: false });
        form.setValue('conveyance', calculatedValues.conveyance, { shouldValidate: false });
        form.setValue('lta', calculatedValues.lta, { shouldValidate: false });
        form.setValue('specialAllowance', calculatedValues.specialAllowance, { shouldValidate: false });
        form.setValue('supplementaryAllowance', calculatedValues.supplementaryAllowance, { shouldValidate: false });
      }
    }
  }, [calculatedValues, form, basicSalary, salaryType]);

  // Manual sync function to update form values only when needed (on save)
  const syncCalculatedToForm = useCallback(() => {
    // Only sync calculated values to form when explicitly called (not during live typing)
    form.setValue('employeePfContribution', calculatedValues.employeePfContribution, { shouldValidate: false });
    form.setValue('employerPfContribution', calculatedValues.employerPfContribution, { shouldValidate: false });
    form.setValue('employeeEsicContribution', calculatedValues.employeeEsicContribution, { shouldValidate: false });
    form.setValue('employerEsicContribution', calculatedValues.employerEsicContribution, { shouldValidate: false });
    form.setValue('gratuityCost', calculatedValues.gratuityCost, { shouldValidate: false });
    form.setValue('takeHomeSalary', calculatedValues.takeHomeSalary, { shouldValidate: false });
    form.setValue('ctcMonthly', calculatedValues.ctcMonthly, { shouldValidate: false });
    form.setValue('ctcYearly', calculatedValues.ctcYearly, { shouldValidate: false });
    form.setValue('groupInsurance', calculatedValues.groupInsurance, { shouldValidate: false });
    
    // Set allowance percentages for display
    form.setValue('houseRentAllowance', calculatedValues.houseRentAllowance, { shouldValidate: false });
    form.setValue('conveyance', calculatedValues.conveyance, { shouldValidate: false });
    form.setValue('lta', calculatedValues.lta, { shouldValidate: false });
    form.setValue('specialAllowance', calculatedValues.specialAllowance, { shouldValidate: false });
    form.setValue('supplementaryAllowance', calculatedValues.supplementaryAllowance, { shouldValidate: false });
  }, [calculatedValues, form]);

  const onSubmit = (values: SalaryFormValues) => {
    // Sync calculated values to form before submitting
    syncCalculatedToForm();
    
    // Use updated form values for submission
    const updatedValues = form.getValues();
    saveSalaryMutation.mutate(updatedValues);
  };

  const handleEdit = (config: SalaryConfig) => {
    setSelectedEmployee(config);
    form.reset({
      userId: config.userId,
      salaryStartDate: config.salaryStartDate.split('T')[0],
      basicSalary: config.basicSalary,
      houseRentAllowance: config.houseRentAllowance,
      conveyance: config.conveyance,
      lta: config.lta,
      specialAllowance: config.specialAllowance,
      supplementaryAllowance: config.supplementaryAllowance,
      bonus: config.bonus,
      // Don't load old gratuityCost - let it be recalculated
      gratuityCost: "0",
      kgpAllowance: config.kgpAllowance,
      // Don't load old calculated values - let them be recalculated
      employeePfContribution: "0",
      employerPfContribution: "0",
      employeeEsicContribution: "0",
      employerEsicContribution: "0",
      groupInsurance: config.groupInsurance,
      bankName: config.bankName || "",
      bankAccountNo: config.bankAccountNo || "",
      debitAccount: config.debitAccount || "",
      salaryType: config.salaryType || "monthly",
      actualDays: config.actualDays?.toString() || "30",
      workingHoursPerDay: config.workingHoursPerDay?.toString() || "8",
      overtimeHours: config.overtimeHours?.toString() || "0",
      otRate: config.otRate?.toString() || "1.0",
    });
    setIsEditDialogOpen(true);
  };

  const handleAddNew = () => {
    setSelectedEmployee(null);
    form.reset({
      salaryStartDate: new Date().toISOString().split('T')[0],
      basicSalary: "",
      houseRentAllowance: "0",
      conveyance: "0",
      lta: "0",
      specialAllowance: "0",
      supplementaryAllowance: "0",
      bonus: "0",
      gratuityCost: "0",
      kgpAllowance: "0",
      employeePfContribution: "0",
      employerPfContribution: "0",
      employeeEsicContribution: "0",
      employerEsicContribution: "0",
      groupInsurance: "0",
    });
    setIsAddDialogOpen(true);
  };

  // Calculate live totals
  const calculateTotals = () => {
    const basic = parseFloat(basicSalary || "0");
    const actualDaysNum = parseFloat(actualDays || "30");
    const paidDaysNum = parseFloat(paidDays || "30");
    const workingHoursNum = parseFloat(workingHoursPerDay || "8");
    const overtimeHoursNum = parseFloat(overtimeHours || "0");
    const otRateNum = parseFloat(otRate || "1.0");
    
    let effectiveBasic, overtimePay = 0, grossSalary;
    let hra = 0, conveyance = 0, lta = 0, special = 0, supplementary = 0;
    
    if (salaryType === 'daily') {
      // Daily worker calculation - use the same logic as auto-calculation
      effectiveBasic = basic * paidDaysNum; // Gross Basic = Daily wage × Paid days
      
      // Overtime calculation
      const hourlyRate = basic / workingHoursNum;
      overtimePay = hourlyRate * overtimeHoursNum * otRateNum;
      
      // Daily workers have 0% allowances - use form values (which should be 0)
      hra = parseFloat(watchedValues.houseRentAllowance || "0");
      conveyance = parseFloat(watchedValues.conveyance || "0");
      lta = parseFloat(watchedValues.lta || "0");
      special = parseFloat(watchedValues.specialAllowance || "0");
      supplementary = parseFloat(watchedValues.supplementaryAllowance || "0");
      
    } else {
      // Monthly worker calculation
      effectiveBasic = basic;
      if (paidDaysNum < actualDaysNum) {
        effectiveBasic = (basic / actualDaysNum) * paidDaysNum;
      }
      
      // Monthly workers get full allowances
      hra = parseFloat(watchedValues.houseRentAllowance || "0");
      conveyance = parseFloat(watchedValues.conveyance || "0");
      lta = parseFloat(watchedValues.lta || "0");
      special = parseFloat(watchedValues.specialAllowance || "0");
      supplementary = parseFloat(watchedValues.supplementaryAllowance || "0");
    }
    
    const bonus = parseFloat(watchedValues.bonus || "0");
    const kgp = parseFloat(watchedValues.kgpAllowance || "0");
    
    const empPf = parseFloat(watchedValues.employeePfContribution || "0");
    const empEsic = parseFloat(watchedValues.employeeEsicContribution || "0");
    
    const empPfEmployer = parseFloat(watchedValues.employerPfContribution || "0");
    const empEsicEmployer = parseFloat(watchedValues.employerEsicContribution || "0");
    const gratuity = parseFloat(watchedValues.gratuityCost || "0");
    const insurance = parseFloat(watchedValues.groupInsurance || "0");

    grossSalary = effectiveBasic + hra + conveyance + lta + special + supplementary + bonus + kgp + overtimePay;
    const totalDeductions = empPf + empEsic;
    const takeHome = grossSalary - totalDeductions;
    const employerContributions = empPfEmployer + empEsicEmployer + gratuity + insurance;
    const ctcMonthly = grossSalary + employerContributions;
    const ctcYearly = ctcMonthly * 12;

    return {
      grossSalary,
      totalDeductions,
      takeHome,
      employerContributions,
      ctcMonthly,
      ctcYearly,
      effectiveBasic,
      overtimePay
    };
  };

  const totals = calculateTotals();

  const SalaryForm = () => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Employee Selection */}
        <FormField
          control={form.control}
          name="userId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Employee *</FormLabel>
              <Select 
                onValueChange={(value) => field.onChange(parseInt(value))} 
                defaultValue={field.value?.toString()}
                disabled={!!selectedEmployee}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(selectedEmployee ? users : availableUsers).map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.firstName && user.lastName 
                        ? `${user.firstName} ${user.lastName} (${user.username})`
                        : user.username
                      }
                      {user.employeeCode && ` - ${user.employeeCode}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

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

        <Tabs defaultValue="basic-info" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic-info">Basic Info</TabsTrigger>
            <TabsTrigger value="allowances">Allowances</TabsTrigger>
            <TabsTrigger value="deductions">Deductions</TabsTrigger>
            <TabsTrigger value="bank-details">Bank Details</TabsTrigger>
          </TabsList>

          <TabsContent value="basic-info" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="salaryType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salary Type *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || 'monthly'}>
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
                        defaultValue="30"
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
                        defaultValue="30"
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
                        defaultValue="8"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="overtimeHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Overtime Hours {salaryType === 'daily' ? '' : '(Daily Salary Only)'}</FormLabel>
                    <FormControl>
                      <Input 
                        key="overtimeHours"
                        placeholder="0" 
                        autoComplete="off"
                        {...field} 
                        defaultValue="0"
                        disabled={salaryType !== 'daily'}
                        className={salaryType !== 'daily' ? 'bg-gray-100 cursor-not-allowed' : ''}
                        onBlur={(e) => {
                          field.onBlur(e);
                          handleFieldBlur();
                        }}
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
                    <FormLabel>OT Rate {salaryType === 'daily' ? '' : '(Daily Salary Only)'}</FormLabel>
                    <Select 
                      onValueChange={field.onChange}
                      defaultValue={field.value || '1.0'}
                      disabled={salaryType !== 'daily'}
                    >
                      <FormControl>
                        <SelectTrigger className={salaryType !== 'daily' ? 'bg-gray-100 cursor-not-allowed' : ''}>
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
            
            {/* Total Compensation Display */}
            {parseFloat(basicSalary || '0') > 0 && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-900">Total Compensation (2.5× Basic)</span>
                  <span className="text-lg font-bold text-blue-700">
                    ₹{((parseFloat(basicSalary || '0') * 2.5).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }))}
                  </span>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  Auto-calculated allowances will be populated in the Allowances tab
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="allowances" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="houseRentAllowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>House Rent Allowance <span className="text-xs text-muted-foreground">(Auto: 40% of Basic)</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0" 
                        {...field} 
                        readOnly
                        className="bg-gray-50 cursor-not-allowed"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="conveyance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conveyance <span className="text-xs text-muted-foreground">(Auto: 30% of Basic)</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0" 
                        {...field} 
                        readOnly
                        className="bg-gray-50 cursor-not-allowed"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LTA <span className="text-xs text-muted-foreground">(Auto: 20% of Basic)</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0" 
                        {...field} 
                        readOnly
                        className="bg-gray-50 cursor-not-allowed"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="specialAllowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Special Allowance <span className="text-xs text-muted-foreground">(Auto: 30% of Basic)</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0" 
                        {...field} 
                        readOnly
                        className="bg-gray-50 cursor-not-allowed"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplementaryAllowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplementary Allowance <span className="text-xs text-muted-foreground">(Auto: 30% of Basic)</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0" 
                        {...field} 
                        readOnly
                        className="bg-gray-50 cursor-not-allowed"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bonus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bonus</FormLabel>
                    <FormControl>
                      <Input placeholder="0" {...field} />
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
                    <FormLabel>KGP Allowance</FormLabel>
                    <FormControl>
                      <Input placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>

          <TabsContent value="deductions" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="employeePfContribution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee PF Contribution <span className="text-xs text-muted-foreground">(Auto: 12% capped at ₹15,000)</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0" 
                        {...field} 
                        readOnly
                        className="bg-gray-50 cursor-not-allowed"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="employerPfContribution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employer PF Contribution <span className="text-xs text-muted-foreground">(Auto: 12% capped at ₹15,000)</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0" 
                        {...field} 
                        readOnly
                        className="bg-gray-50 cursor-not-allowed"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="employeeEsicContribution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee ESIC Contribution <span className="text-xs text-muted-foreground">(Auto: 0.75% if Gross ≤ ₹21,000)</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0" 
                        {...field} 
                        readOnly
                        className="bg-gray-50 cursor-not-allowed"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="employerEsicContribution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employer ESIC Contribution <span className="text-xs text-muted-foreground">(Auto: 3.25% if Gross ≤ ₹21,000)</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0" 
                        {...field} 
                        readOnly
                        className="bg-gray-50 cursor-not-allowed"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gratuityCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gratuity Cost <span className="text-xs text-muted-foreground">(Auto: Basic×15÷26÷12)</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="0" 
                        {...field} 
                        readOnly
                        className="bg-gray-50 cursor-not-allowed"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="groupInsurance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Insurance</FormLabel>
                    <FormControl>
                      <Input placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Total PF & ESIC Summary */}
            {parseFloat(basicSalary || '0') > 0 && (
              <div className="mt-4 space-y-4">
                {/* PF Summary */}
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-green-900">Total PF Calculation Summary</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-700">Employee PF:</span>
                      <span className="font-medium text-green-800">
                        ₹{(parseFloat(form.watch('employeePfContribution') || '0')).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">Employer PF:</span>
                      <span className="font-medium text-green-800">
                        ₹{(parseFloat(form.watch('employerPfContribution') || '0')).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between border-l border-green-300 pl-4">
                      <span className="text-green-700 font-medium">Total PF:</span>
                      <span className="font-bold text-green-900">
                        ₹{((parseFloat(form.watch('employeePfContribution') || '0')) + 
                            (parseFloat(form.watch('employerPfContribution') || '0'))).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-green-600 mt-2">
                    PF is calculated at 12% of Basic Salary, capped at ₹15,000 maximum contribution base
                  </p>
                </div>

                {/* ESIC Summary */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-900">Total ESIC Calculation Summary</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-700">Employee ESIC:</span>
                      <span className="font-medium text-blue-800">
                        ₹{(parseFloat(form.watch('employeeEsicContribution') || '0')).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">Employer ESIC:</span>
                      <span className="font-medium text-blue-800">
                        ₹{(parseFloat(form.watch('employerEsicContribution') || '0')).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between border-l border-blue-300 pl-4">
                      <span className="text-blue-700 font-medium">Total ESIC:</span>
                      <span className="font-bold text-blue-900">
                        ₹{((parseFloat(form.watch('employeeEsicContribution') || '0')) + 
                            (parseFloat(form.watch('employerEsicContribution') || '0'))).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-blue-600 mt-2">
                    ESIC is calculated at 0.75% (Employee) + 3.25% (Employer) of Gross Salary, applicable only if Gross ≤ ₹21,000
                  </p>
                </div>

                {/* Gratuity Summary */}
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-orange-900">Monthly Gratuity Provision Summary</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-orange-700">Basic Salary:</span>
                      <span className="font-medium text-orange-800">
                        ₹{(parseFloat(basicSalary || '0')).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between border-l border-orange-300 pl-4">
                      <span className="text-orange-700 font-medium">Monthly Provision:</span>
                      <span className="font-bold text-orange-900">
                        ₹{(parseFloat(form.watch('gratuityCost') || '0')).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-orange-600 mt-2">
                    Monthly provision for gratuity calculated as (Basic Salary × 15) ÷ (26 × 12)
                  </p>
                  <p className="text-xs text-orange-500 mt-1">
                    Note: Actual gratuity is payable only after 5 years of continuous service as per Payment of Gratuity Act, 1972
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="bank-details" className="space-y-4">
            <FormField
              control={form.control}
              name="bankName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bank Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter bank name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bankAccountNo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bank Account Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter account number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="debitAccount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Debit Account</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter debit account" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TabsContent>
        </Tabs>

        {/* Comprehensive Payroll Summary */}
        {parseFloat(basicSalary || '0') > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Comprehensive Payroll Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Salary Type and Configuration */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="bg-slate-50 p-3 rounded border">
                  <span className="text-sm text-slate-600">Salary Type</span>
                  <p className="font-medium text-slate-900 capitalize">{salaryType}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded border">
                  <span className="text-sm text-slate-600">Working Days</span>
                  <p className="font-medium text-slate-900">{paidDays} / {actualDays} days</p>
                </div>
                <div className="bg-slate-50 p-3 rounded border">
                  <span className="text-sm text-slate-600">Working Hours/Day</span>
                  <p className="font-medium text-slate-900">{workingHoursPerDay} hours</p>
                </div>
                {salaryType === 'daily' && parseFloat(overtimeHours) > 0 && (
                  <div className="bg-slate-50 p-3 rounded border">
                    <span className="text-sm text-slate-600">Overtime</span>
                    <p className="font-medium text-slate-900">{overtimeHours}h × {otRate}x</p>
                  </div>
                )}
              </div>

              {/* Salary Calculations */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4">
                {/* Basic Salary and Allowances */}
                <div className="bg-white p-4 rounded border">
                  <h4 className="font-medium text-slate-900 mb-3">Salary Components</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Basic Salary (Original):</span>
                      <span className="font-medium">₹{(parseFloat(basicSalary || '0')).toLocaleString('en-IN')}</span>
                    </div>
                    {parseFloat(paidDays) < parseFloat(actualDays) && salaryType === 'monthly' && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Pro-Rated Basic:</span>
                        <span className="font-medium text-blue-600">₹{((parseFloat(basicSalary || '0') / parseFloat(actualDays)) * parseFloat(paidDays)).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-600">HRA (40%):</span>
                      <span className="font-medium">₹{(parseFloat(form.watch('houseRentAllowance') || '0')).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Conveyance (30%):</span>
                      <span className="font-medium">₹{(parseFloat(form.watch('conveyance') || '0')).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">LTA (20%):</span>
                      <span className="font-medium">₹{(parseFloat(form.watch('lta') || '0')).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Special Allowance (30%):</span>
                      <span className="font-medium">₹{(parseFloat(form.watch('specialAllowance') || '0')).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Supplementary (30%):</span>
                      <span className="font-medium">₹{(parseFloat(form.watch('supplementaryAllowance') || '0')).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                    </div>
                    {salaryType === 'daily' && parseFloat(overtimeHours) > 0 && (
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-slate-600">Overtime Pay:</span>
                        <span className="font-medium text-green-600">₹{((parseFloat(basicSalary || '0') / parseFloat(workingHoursPerDay)) * parseFloat(otRate) * parseFloat(overtimeHours)).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Statutory Deductions */}
                <div className="bg-white p-4 rounded border">
                  <h4 className="font-medium text-slate-900 mb-3">Statutory Deductions</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Employee PF (12%):</span>
                      <span className="font-medium text-red-600">₹{(parseFloat(calculatedValues.employeePfContribution || '0')).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Employee ESIC (0.75%):</span>
                      <span className="font-medium text-red-600">₹{(parseFloat(calculatedValues.employeeEsicContribution || '0')).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="border-t pt-2 mt-3">
                      <div className="flex justify-between font-medium">
                        <span className="text-slate-700">Total Deductions:</span>
                        <span className="text-red-700">₹{((parseFloat(calculatedValues.employeePfContribution || '0')) + (parseFloat(calculatedValues.employeeEsicContribution || '0'))).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Employer Contributions */}
                <div className="bg-white p-4 rounded border">
                  <h4 className="font-medium text-slate-900 mb-3">Employer Contributions</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Employer PF (12%):</span>
                      <span className="font-medium text-blue-600">₹{(parseFloat(calculatedValues.employerPfContribution || '0')).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Employer ESIC (3.25%):</span>
                      <span className="font-medium text-blue-600">₹{(parseFloat(calculatedValues.employerEsicContribution || '0')).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Gratuity Provision (4.81%):</span>
                      <span className="font-medium text-orange-600">₹{(parseFloat(calculatedValues.gratuityCost || '0')).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="border-t pt-2 mt-3">
                      <div className="flex justify-between font-medium">
                        <span className="text-slate-700">Total Contributions:</span>
                        <span className="text-blue-700">₹{((parseFloat(calculatedValues.employerPfContribution || '0')) + (parseFloat(calculatedValues.employerEsicContribution || '0')) + (parseFloat(calculatedValues.gratuityCost || '0'))).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Final Calculations */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="bg-green-50 p-4 rounded border border-green-200">
                  <span className="text-sm text-green-700">Take Home Salary</span>
                  <p className="text-xl font-bold text-green-800">₹{(parseFloat(calculatedValues.takeHomeSalary || '0')).toLocaleString('en-IN', {maximumFractionDigits: 2})}</p>
                </div>
                <div className="bg-red-50 p-4 rounded border border-red-200">
                  <span className="text-sm text-red-700">Total Deductions</span>
                  <p className="text-xl font-bold text-red-800">₹{totals.totalDeductions.toLocaleString('en-IN', {maximumFractionDigits: 2})}</p>
                </div>
                <div className="bg-blue-50 p-4 rounded border border-blue-200">
                  <span className="text-sm text-blue-700">Take Home Salary</span>
                  <p className="text-xl font-bold text-blue-800">₹{totals.takeHome.toLocaleString('en-IN', {maximumFractionDigits: 2})}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded border border-purple-200">
                  <span className="text-sm text-purple-700">CTC (Monthly)</span>
                  <p className="text-xl font-bold text-purple-800">₹{totals.ctcMonthly.toLocaleString('en-IN', {maximumFractionDigits: 2})}</p>
                </div>
              </div>

              {/* Calculation Notes */}
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                <h5 className="font-medium text-yellow-900 mb-2">Calculation Notes:</h5>
                <ul className="text-xs text-yellow-800 space-y-1">
                  <li>• PF is capped at ₹15,000 basic salary (₹1,800 max contribution per party)</li>
                  <li>• ESIC applies only if gross salary ≤ ₹21,000</li>
                  <li>• Gratuity provision is calculated monthly but payable after 5 years of service</li>
                  {salaryType === 'monthly' && parseFloat(paidDays) < parseFloat(actualDays) && (
                    <li>• Basic salary is pro-rated: ({basicSalary} ÷ {actualDays}) × {paidDays} days</li>
                  )}
                  {salaryType === 'daily' && parseFloat(overtimeHours) > 0 && (
                    <li>• Overtime: Hourly Rate (₹{(parseFloat(basicSalary || '0') / parseFloat(workingHoursPerDay)).toFixed(2)}) × {otRate}x × {overtimeHours} hours</li>
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end space-x-2 pt-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => {
              setIsAddDialogOpen(false);
              setIsEditDialogOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={saveSalaryMutation.isPending}
          >
            {selectedEmployee ? 'Update Configuration' : 'Save Configuration'}
          </Button>
        </div>
      </form>
    </Form>
  );

  return (
    <Layout>
      <Helmet>
        <title>Payroll Management - THERMOPAC</title>
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payroll Management</h1>
            <p className="text-muted-foreground">
              Configure employee salaries and manage payroll processing
            </p>
          </div>
          <Button onClick={handleAddNew}>
            <Plus className="mr-2 h-4 w-4" />
            Add Salary Configuration
          </Button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Configured Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{salaryConfigs.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Setup</CardTitle>
              <Calculator className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{availableUsers.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Monthly CTC</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₹{salaryConfigs.reduce((sum, config) => sum + parseFloat(config.ctcMonthly), 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Annual CTC</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₹{salaryConfigs.reduce((sum, config) => sum + parseFloat(config.ctcYearly), 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4" />
              <Input
                placeholder="Search employees by name, username, or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>
        </Card>

        {/* Salary Configurations Table */}
        <Card>
          <CardHeader>
            <CardTitle>Salary Configurations ({filteredConfigs.length})</CardTitle>
            <CardDescription>
              Employee salary details and CTC breakdown
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Basic Salary</TableHead>
                  <TableHead>Take Home</TableHead>
                  <TableHead>CTC Monthly</TableHead>
                  <TableHead>CTC Yearly</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">Loading...</TableCell>
                  </TableRow>
                ) : (
                  filteredConfigs.map((config) => (
                    <TableRow key={config.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {config.firstName && config.lastName 
                              ? `${config.firstName} ${config.lastName}`
                              : config.username
                            }
                          </div>
                          {config.employeeCode && (
                            <div className="text-xs text-muted-foreground">
                              {config.employeeCode}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{config.department || '-'}</TableCell>
                      <TableCell>₹{parseFloat(config.basicSalary).toLocaleString()}</TableCell>
                      <TableCell className="font-medium text-green-600">
                        ₹{parseFloat(config.takeHomeSalary).toLocaleString()}
                      </TableCell>
                      <TableCell>₹{parseFloat(config.ctcMonthly).toLocaleString()}</TableCell>
                      <TableCell className="font-medium">
                        ₹{parseFloat(config.ctcYearly).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.isActive ? "default" : "secondary"}>
                          {config.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(config)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add Salary Configuration Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Salary Configuration</DialogTitle>
              <DialogDescription>
                Configure salary details for an employee
              </DialogDescription>
            </DialogHeader>
            <SalaryForm />
          </DialogContent>
        </Dialog>

        {/* Edit Salary Configuration Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Salary Configuration</DialogTitle>
              <DialogDescription>
                Update employee salary details
              </DialogDescription>
            </DialogHeader>
            <SalaryForm />
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}