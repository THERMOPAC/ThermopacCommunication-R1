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
  invoiceType: z.enum(["Product", "Service"]).default("Product"),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      description: z.string().min(1, "Description is required"),
      quantity: z.string().min(1, "Quantity is required"),
      unitPrice: z.string().min(1, "Unit price is required"),
      amount: z.string().min(1, "Amount is required"),
    })
  ).min(1, "At least one item is required"),
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
    queryKey: ['/api/finance/payments/unallocated-advances', selectedCustomerId],
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
    notes: isEditMode && invoiceData?.invoice ? invoiceData.invoice.notes || '' : '',
    items: isEditMode && invoiceData?.items && invoiceData.items.length > 0
      ? invoiceData.items.map((item: any) => ({
          description: item.description || '',
          quantity: String(item.quantity) || '1',
          unitPrice: String(item.unitPrice) || '0',
          amount: String(item.amount) || '0',
        }))
      : [
          {
            description: '',
            quantity: '1',
            unitPrice: '0',
            amount: '0',
          },
        ],
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
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          amount: String(item.amount),
        })) || [{
          description: '',
          quantity: '1',
          unitPrice: '0',
          amount: '0',
        }],
      });
    }
  }, [isEditMode, invoiceData, form]);
  
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
          status: 'Pending',
          notes: values.notes || null,
        },
        items: values.items.map(item => ({
          description: item.description,
          quantity: String(parseFloat(item.quantity || '0')),
          unitPrice: String(parseFloat(item.unitPrice || '0')),
          amount: String(parseFloat(item.amount || '0')),
        }))
      };
      
      return apiRequest('POST', '/api/finance/invoices', apiData);
    },
    onSuccess: () => {
      toast({
        title: "Invoice created",
        description: "Invoice has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
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
          notes: values.notes || null,
        },
        items: values.items.map(item => ({
          description: item.description,
          quantity: String(parseFloat(item.quantity || '0')),
          unitPrice: String(parseFloat(item.unitPrice || '0')),
          amount: String(parseFloat(item.amount || '0')),
        }))
      };
      
      return apiRequest('PUT', `/api/finance/invoices/${invoiceId}`, apiData);
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
  
  // Calculate item amount when quantity or unit price changes
  const calculateAmount = (index: number) => {
    const quantity = parseFloat(form.getValues(`items.${index}.quantity`) || '0');
    const unitPrice = parseFloat(form.getValues(`items.${index}.unitPrice`) || '0');
    const amount = (quantity * unitPrice).toFixed(2);
    form.setValue(`items.${index}.amount`, amount);
  };
  
  // Add new item
  const addItem = () => {
    append({
      description: '',
      quantity: '1',
      unitPrice: '0',
      amount: '0',
    });
  };
  
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      {/* Help text for invoice number removed as requested */}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex gap-4">
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem className="flex-1">
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
                    name="invoiceType"
                    render={({ field }) => (
                      <FormItem className="flex-1">
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
                </div>
                
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
          
          <Card>
            <CardHeader>
              <CardTitle>Invoice Items</CardTitle>
              <CardDescription>
                Add items to this invoice
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="border p-4 rounded-md space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-medium">Item #{index + 1}</h4>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-6">
                        <FormField
                          control={form.control}
                          name={`items.${index}.description`}
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
                      
                      <div className="md:col-span-2">
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Quantity</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  {...field}
                                  onChange={(e) => {
                                    field.onChange(e);
                                    calculateAmount(index);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="md:col-span-2">
                        <FormField
                          control={form.control}
                          name={`items.${index}.unitPrice`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Unit Price</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  {...field}
                                  onChange={(e) => {
                                    field.onChange(e);
                                    calculateAmount(index);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="md:col-span-2">
                        <FormField
                          control={form.control}
                          name={`items.${index}.amount`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Amount</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  readOnly
                                  className="bg-gray-50"
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
                ))}
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={addItem}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
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