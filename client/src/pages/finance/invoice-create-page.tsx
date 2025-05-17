import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from 'date-fns';
import { Loader2, CalendarIcon, Plus, Trash2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { getIndianFinancialYear, getNextInvoiceNumber } from "@/lib/utils";

// Add global CSS style to hide number input arrows
const globalStyles = `
@layer utilities {
  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] {
    -moz-appearance: textfield;
  }
}
`;

// Add the style to the document
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.innerHTML = globalStyles;
  document.head.appendChild(styleEl);
}

// Custom CSS class for number inputs without arrows
const hideNumberInputArrows = "appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

// Create form schema
const invoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  customerId: z.string().min(1, "Customer is required"),
  projectId: z.string().optional(),
  issueDate: z.date({
    required_error: "Issue date is required",
  }),
  dueDate: z.date({
    required_error: "Due date is required",
  }),
  currency: z.string().default("INR"),
  sapInvoiceNo: z.string().min(1, "SAP Invoice No is required"),
  invoiceType: z.enum(["Product", "Service"]).default("Product"),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      description: z.string().min(1, "Description is required"),
      amount: z.string().min(1, "Amount is required"),
    })
  ).min(1, "At least one item is required"),
  // Fields for advance payment application
  applyAdvancePayments: z.boolean().default(false),
  advancePaymentAllocations: z.array(
    z.object({
      paymentId: z.number(),
      amountToApply: z.string(),
    })
  ).optional(),
});

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

interface InvoiceCreatePageProps {
  isEditMode?: boolean;
}

export default function InvoiceCreatePage({ isEditMode = false }: InvoiceCreatePageProps) {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  
  // Extract invoice ID from URL if in edit mode
  let invoiceId: string | null = null;
  if (isEditMode) {
    const pathSegments = location.split('/');
    invoiceId = pathSegments[pathSegments.indexOf('invoices') + 1];
  }
  
  // Get customers
  const { data: customers, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['/api/customers'],
  });
  
  // Get projects
  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['/api/projects'],
  });
  
  // Get invoice if in edit mode
  const { data: invoiceData, isLoading: isLoadingInvoice } = useQuery({
    queryKey: [`/api/finance/invoices/${invoiceId}`],
    enabled: !!isEditMode && !!invoiceId,
  });
  
  // Get unallocated advance payments for selected customer
  const { data: unallocatedAdvances, isLoading: isLoadingAdvances } = useQuery({
    queryKey: [`/api/finance/payments/unallocated-advances/${selectedCustomerId}`],
    enabled: !!selectedCustomerId && !isEditMode,
  });
  
  // For automatic invoice number generation
  const [isGeneratingInvoiceNumber, setIsGeneratingInvoiceNumber] = useState(false);
  
  // Default form values
  const defaultValues: InvoiceFormValues = {
    invoiceNumber: isEditMode && invoiceData?.invoice 
      ? invoiceData.invoice.invoiceNumber
      : '', // Leave blank for user to enter
    customerId: isEditMode && invoiceData?.invoice ? String(invoiceData.invoice.customerId) : '',
    projectId: isEditMode && invoiceData?.invoice && invoiceData.invoice.projectId 
      ? String(invoiceData.invoice.projectId) 
      : '',
    issueDate: isEditMode && invoiceData?.invoice ? new Date(invoiceData.invoice.issueDate) : new Date(),
    dueDate: isEditMode && invoiceData?.invoice 
      ? new Date(invoiceData.invoice.dueDate)
      : new Date(new Date().setDate(new Date().getDate() + 30)), // Due in 30 days
    currency: isEditMode && invoiceData?.invoice ? invoiceData.invoice.currency : 'USD',
    sapInvoiceNo: isEditMode && invoiceData?.invoice ? invoiceData.invoice.sapInvoiceNo || '' : '',
    invoiceType: isEditMode && invoiceData?.invoice && invoiceData.invoice.invoiceType
      ? invoiceData.invoice.invoiceType
      : 'Product',
    notes: isEditMode && invoiceData?.invoice ? invoiceData.invoice.notes || '' : '',
    items: isEditMode && invoiceData?.items && invoiceData.items.length > 0
      ? invoiceData.items.map((item: any) => ({
          description: item.description || '',
          amount: String(item.amount) || '0',
        }))
      : [
          {
            description: 'Items as per SAP invoice',
            amount: '0',
          },
        ],
    // Add the new advance payment fields
    applyAdvancePayments: !isEditMode && !!unallocatedAdvances?.advances?.length,
    advancePaymentAllocations: !isEditMode && unallocatedAdvances?.advances 
      ? unallocatedAdvances.advances.map((payment: any) => ({
          paymentId: payment.id,
          amountToApply: payment.unallocatedAmount,
        })) 
      : [],
  };
  
  // Create form
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues,
  });
  
  // Set up field array for invoice items
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  
  // Effect to update form when invoice data is loaded in edit mode
  useEffect(() => {
    if (isEditMode && invoiceData && invoiceData.invoice && form) {
      form.reset({
        invoiceNumber: invoiceData.invoice.invoiceNumber,
        customerId: String(invoiceData.invoice.customerId),
        projectId: invoiceData.invoice.projectId ? String(invoiceData.invoice.projectId) : '',
        issueDate: new Date(invoiceData.invoice.issueDate),
        dueDate: new Date(invoiceData.invoice.dueDate),
        currency: invoiceData.invoice.currency,
        invoiceType: invoiceData.invoice.invoiceType || 'Product',
        notes: invoiceData.invoice.notes || '',
        items: invoiceData.items?.map((item: any) => ({
          description: item.description,
          amount: String(item.amount),
        })) || [{
          description: 'Items as per SAP invoice',
          amount: '0',
        }],
      });
    }
  }, [isEditMode, invoiceData, form]);
  
  // Effect to update the description when the invoice type changes
  useEffect(() => {
    const invoiceType = form.watch('invoiceType');
    const currentDescription = form.getValues('items.0.description');
    
    // Only update if this is a default description or empty
    const isDefaultDescription = !currentDescription ||
      currentDescription === 'Items as per SAP invoice' ||
      currentDescription === 'Service as per SAP invoice';
      
    if (isDefaultDescription) {
      if (invoiceType === 'Product') {
        form.setValue('items.0.description', 'Items as per SAP invoice');
      } else if (invoiceType === 'Service') {
        form.setValue('items.0.description', 'Service as per SAP invoice');
      }
    }
  }, [form.watch('invoiceType')]);
  
  // Effect to auto-generate invoice number when issue date changes (for new invoices only)
  useEffect(() => {
    const updateInvoiceNumber = async () => {
      if (!isEditMode) {
        // Get the current issue date
        const currentIssueDate = form.getValues('issueDate');
        if (currentIssueDate) {
          try {
            setIsGeneratingInvoiceNumber(true);
            const nextInvoiceNumber = await getNextInvoiceNumber(currentIssueDate);
            form.setValue('invoiceNumber', nextInvoiceNumber);
          } catch (error) {
            console.error('Failed to generate invoice number:', error);
            // Fallback to a basic format if API fails
            const financialYear = getIndianFinancialYear(currentIssueDate);
            form.setValue('invoiceNumber', `INV-${financialYear}-001`);
          } finally {
            setIsGeneratingInvoiceNumber(false);
          }
        }
      }
    };
    
    // Generate invoice number on initial load for new invoices
    if (!isEditMode && !isGeneratingInvoiceNumber) {
      updateInvoiceNumber();
    }
    
    // Set up a subscription to the issue date field
    const subscription = form.watch((value, { name }) => {
      if (name === 'issueDate' && !isEditMode && !isGeneratingInvoiceNumber) {
        updateInvoiceNumber();
      }
    });
    
    // Clean up the subscription
    return () => subscription.unsubscribe();
  }, [form, isEditMode, isGeneratingInvoiceNumber]);
  
  // Create invoice mutation
  const createInvoice = useMutation({
    mutationFn: async (values: InvoiceFormValues) => {
      // Transform values for API
      const apiData = {
        invoice: {
          invoiceNumber: values.invoiceNumber,
          customerId: parseInt(values.customerId),
          projectId: values.projectId ? parseInt(values.projectId) : null,
          issueDate: format(values.issueDate, 'yyyy-MM-dd'),
          dueDate: format(values.dueDate, 'yyyy-MM-dd'),
          totalAmount: String(values.items.reduce((total, item) => total + parseFloat(item.amount || '0'), 0)),
          currency: values.currency,
          sapInvoiceNo: values.sapInvoiceNo || null,
          invoiceType: values.invoiceType,
          status: 'Pending',
          notes: values.notes || null,
        },
        items: values.items.map(item => ({
          description: item.description,
          quantity: "1",
          unitPrice: String(parseFloat(item.amount || "0")),
          amount: String(parseFloat(item.amount || "0")),
          taxRate: "0",
          taxAmount: "0",
          discountPercent: "0",
          discountAmount: "0",
          lineTotal: String(parseFloat(item.amount || "0")),
        }))
      };
      
      // Add advance payment allocations if enabled
      if (values.applyAdvancePayments && values.advancePaymentAllocations?.length > 0) {
        // Filter out allocations with zero or empty amounts
        const validAllocations = values.advancePaymentAllocations.filter(alloc => 
          alloc.amountToApply && parseFloat(alloc.amountToApply) > 0
        );
        
        if (validAllocations.length > 0) {
          apiData.advancePaymentAllocations = validAllocations.map(alloc => ({
            paymentId: alloc.paymentId,
            amountToApply: alloc.amountToApply
          }));
        }
      }
      
      // Log the data being sent
      console.log('Sending invoice data:', JSON.stringify(apiData, null, 2));
      
      // Use the updated database-backed finance route
      return apiRequest('POST', '/api/finance/invoices', apiData);
    },
    onSuccess: () => {
      toast({
        title: "Invoice created",
        description: "Invoice has been created successfully",
      });
      // Update both query keys to ensure proper refresh
      queryClient.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/simple-finance/invoices'] });
      navigate('/finance/invoices');
    },
    onError: (error: any) => {
      console.error('Error creating invoice:', error);
      const errorMessage = error?.message || "Failed to create invoice. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });
  
  // Update invoice mutation
  const updateInvoice = useMutation({
    mutationFn: async (values: InvoiceFormValues) => {
      // Transform values for API
      const apiData = {
        invoice: {
          invoiceNumber: values.invoiceNumber,
          customerId: parseInt(values.customerId),
          projectId: values.projectId ? parseInt(values.projectId) : null,
          issueDate: format(values.issueDate, 'yyyy-MM-dd'),
          dueDate: format(values.dueDate, 'yyyy-MM-dd'),
          totalAmount: String(values.items.reduce((total, item) => total + parseFloat(item.amount || '0'), 0)),
          currency: values.currency,
          sapInvoiceNo: values.sapInvoiceNo || null,
          invoiceType: values.invoiceType,
          status: 'Pending',
          notes: values.notes || null,
        },
        items: values.items.map(item => ({
          description: item.description,
          quantity: "1",
          unitPrice: String(parseFloat(item.amount || "0")),
          amount: String(parseFloat(item.amount || "0")),
          taxRate: "0",
          taxAmount: "0",
          discountPercent: "0",
          discountAmount: "0",
          lineTotal: String(parseFloat(item.amount || "0"))
        }))
      };
      
      // Log the data being sent
      console.log('Updating invoice data:', JSON.stringify(apiData, null, 2));
      
      return apiRequest('PUT', `/api/simple-finance/invoices/${invoiceId}`, apiData);
    },
    onSuccess: () => {
      toast({
        title: "Invoice updated",
        description: "Invoice has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
      queryClient.invalidateQueries({ queryKey: [`/api/finance/invoices/${invoiceId}`] });
      navigate('/finance/invoices');
    },
    onError: (error: any) => {
      console.error('Error updating invoice:', error);
      const errorMessage = error?.message || "Failed to update invoice. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });
  
  // Submit handler
  const onSubmit = (values: InvoiceFormValues) => {
    if (isEditMode && invoiceId) {
      updateInvoice.mutate(values);
    } else {
      createInvoice.mutate(values);
    }
  };
  
  // This function is now intentionally removed as we no longer need to calculate 
  // the amount based on quantity and unit price. The user will enter the amount directly.
  
  // Add item function is also removed as we'll only have a single invoice line
  
  // Show loading state when fetching data
  if (isLoadingCustomers || isLoadingProjects || (isEditMode && isLoadingInvoice)) {
    return (
      <Layout>
        <Helmet>
          <title>{isEditMode ? 'Edit Invoice' : 'Create Invoice'} | Thermopac</title>
        </Helmet>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="mr-2 h-16 w-16 animate-spin" />
          <p>Loading...</p>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <Helmet>
        <title>{isEditMode ? 'Edit Invoice' : 'Create Invoice'} | Thermopac</title>
      </Helmet>
      <div className="container py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{isEditMode ? 'Edit Invoice' : 'Create New Invoice'}</h1>
          <Button variant="outline" onClick={() => navigate('/finance/invoices')}>
            Cancel
          </Button>
        </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invoice Information</CardTitle>
              <CardDescription>
                Enter the basic information for this invoice
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="invoiceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter invoice number" 
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="USD" 
                          value="USD"
                          {...field}
                          onChange={() => {}} 
                          readOnly 
                          className="bg-muted cursor-not-allowed"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="sapInvoiceNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SAP Invoice No</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter SAP invoice number" 
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="invoiceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Type</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Product">Product</SelectItem>
                          <SelectItem value="Service">Service</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedCustomerId(value);
                        }} 
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers?.map((customer: any) => (
                            <SelectItem key={customer.id} value={customer.id.toString()}>
                              {customer.bpName} ({customer.bpCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Display unallocated advance payments if available */}
                {!isEditMode && selectedCustomerId && unallocatedAdvances && unallocatedAdvances.totalUnallocated > 0 && (
                  <div className="col-span-1 md:col-span-2 mt-2">
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                      <div className="flex items-center">
                        <div className="mr-2 text-blue-700">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-blue-700">Available Advance Payment</h4>
                          <p className="text-sm text-blue-700 mt-1">
                            This customer has unallocated advance payments totaling{" "}
                            <span className="font-mono bg-blue-100 text-blue-700 border border-blue-300 px-1 rounded">
                              {unallocatedAdvances.currency === 'INR' ? '₹' : '$'}
                              {typeof unallocatedAdvances.totalUnallocated === 'number' 
                                ? unallocatedAdvances.totalUnallocated.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                                : unallocatedAdvances.totalUnallocated}
                            </span>
                            {" "}which can be used against this invoice.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project (Optional)</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No Project</SelectItem>
                          {projects?.map((project: any) => (
                            <SelectItem key={project.id} value={project.id.toString()}>
                              {project.name} ({project.code})
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
                  name="issueDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Issue Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className="w-full pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Due Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className="w-full pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-1 md:col-span-2">
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter any additional notes here..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Advance Payment Section - Only shown in create mode when customer is selected and has unallocated advances */}
          {!isEditMode && selectedCustomerId && unallocatedAdvances && Array.isArray(unallocatedAdvances.advances) && unallocatedAdvances.advances.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Apply Advance Payments</CardTitle>
                <CardDescription>
                  Use available advance payments from this customer to pay for this invoice
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="applyAdvancePayments"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <div className="flex h-5 items-center">
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                          </div>
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            Apply available advance payments
                          </FormLabel>
                          <FormDescription>
                            Total unallocated: {unallocatedAdvances?.currency || 'USD'}{' '}
                            {parseFloat(unallocatedAdvances?.totalUnallocatedAmount || '0').toFixed(2)}
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  {form.watch('applyAdvancePayments') && (
                    <div className="border rounded-md overflow-hidden">
                      <div className="bg-muted px-4 py-2 font-medium text-sm grid grid-cols-12 gap-4">
                        <div className="col-span-3">Reference Number</div>
                        <div className="col-span-2">Date</div>
                        <div className="col-span-2">Total Amount</div>
                        <div className="col-span-2">Available</div>
                        <div className="col-span-3">Apply Amount</div>
                      </div>
                      
                      {Array.isArray(unallocatedAdvances?.advances) && unallocatedAdvances.advances.map((payment: any, index: number) => (
                        <div key={payment.id} className="px-4 py-3 border-t grid grid-cols-12 gap-4 items-center text-sm">
                          <div className="col-span-3 font-medium">{payment.referenceNumber}</div>
                          <div className="col-span-2">{new Date(payment.paymentDate).toLocaleDateString()}</div>
                          <div className="col-span-2">{payment.currency} {parseFloat(payment.amount).toFixed(2)}</div>
                          <div className="col-span-2">{payment.currency} {parseFloat(payment.unallocatedAmount).toFixed(2)}</div>
                          <div className="col-span-3">
                            <FormField
                              control={form.control}
                              name={`advancePaymentAllocations.${index}.amountToApply`}
                              render={({ field }) => (
                                <FormItem className="m-0">
                                  <FormControl>
                                    <div className="flex items-center">
                                      <span className="mr-2">{payment.currency}</span>
                                      <Input
                                        {...field}
                                        type="number"
                                        min="0"
                                        max={payment.unallocatedAmount}
                                        step="0.01"
                                        className={hideNumberInputArrows}
                                      />
                                    </div>
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`advancePaymentAllocations.${index}.paymentId`}
                              render={({ field }) => (
                                <input type="hidden" {...field} value={payment.id} />
                              )}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card>
            <CardHeader>
              <CardTitle>Invoice Item</CardTitle>
              <CardDescription>
                Enter the invoice line item details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border p-4 rounded-md space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Invoice Line</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-8">
                      <FormField
                        control={form.control}
                        name="items.0.description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="md:col-span-4">
                      <FormField
                        control={form.control}
                        name="items.0.amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Amount</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className={`text-right ${hideNumberInputArrows}`}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            
            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/finance/invoices')}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createInvoice.isPending || updateInvoice.isPending}
              >
                {(createInvoice.isPending || updateInvoice.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditMode ? 'Update Invoice' : 'Create Invoice'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
      </div>
    </Layout>
  );
}