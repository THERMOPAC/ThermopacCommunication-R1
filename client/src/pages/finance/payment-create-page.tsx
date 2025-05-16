import { useState, useEffect, useCallback } from 'react';
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
import { Loader2, CalendarIcon, Plus, Trash2, Search, AlertCircle, ArrowDownUp, CheckCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { formatRupees, getIndianFinancialYear, getNextPaymentReferenceNumber } from "@/lib/utils";

// Define payment data structure types
interface PaymentInvoiceLink {
  id: number;
  payment_id: number;
  invoice_id: number;
  amount_applied: string;
  invoiceId?: string;
  amountApplied?: string;
}

interface PaymentData {
  payment: {
    id: number;
    reference_number: string;
    payment_date: string;
    amount: string;
    currency: string;
    payment_method: string;
    notes: string | null;
    is_advance_payment: boolean;
    customer_id: number | null;
    created_at: string;
    updated_at: string;
  };
  invoiceLinks: PaymentInvoiceLink[];
}

// Payment form schema
const paymentFormSchema = z.object({
  referenceNumber: z.string().min(1, "Reference number is required"),
  paymentDate: z.date({
    required_error: "Payment date is required",
  }),
  amount: z.string().min(1, "Amount is required"),
  currency: z.string().default("INR"),
  paymentMethod: z.string().min(1, "Payment method is required"),
  notes: z.string().optional(),
  isAdvancePayment: z.boolean().default(false),
  customerId: z.string().optional(),
  invoiceLinks: z.array(
    z.object({
      invoiceId: z.string().min(1, "Invoice is required"),
      amountApplied: z.string().min(1, "Amount is required"),
    })
  ).optional(),
}).refine((data) => {
  // Validate that invoiceLinks are provided if not an advance payment
  if (!data.isAdvancePayment) {
    return data.invoiceLinks && data.invoiceLinks.length > 0;
  }
  // For advance payments, customerId is required
  if (data.isAdvancePayment) {
    return !!data.customerId;
  }
  return true;
}, {
  message: "Please either link an invoice or mark as an advance payment and select a customer",
  path: ["invoiceLinks"],
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export default function PaymentCreatePage({ isEditMode = false }: { isEditMode?: boolean } = {}) {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInvoice, setSearchInvoice] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [autoAllocateEnabled, setAutoAllocateEnabled] = useState(true);
  const [isGeneratingReferenceNumber, setIsGeneratingReferenceNumber] = useState(false);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  
  // Extract payment ID from URL if in edit mode
  useEffect(() => {
    if (isEditMode) {
      const pathParts = location.split('/');
      const id = parseInt(pathParts[pathParts.length - 2], 10);
      if (!isNaN(id)) {
        setPaymentId(id);
      }
    }
  }, [isEditMode, location]);
  
  // Define invoice and customer data types
  interface Invoice {
    id: number;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    amount: string;
    currency: string;
    customerId: number;
    customerName: string;
    status: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    totalAmount?: string; // Added to fix type errors
  }

  interface Customer {
    id: number;
    bpCode: string;
    bpName: string;
    contactPerson: string | null;
    email: string | null;
    country: string | null;
    city: string | null;
  }

  // Get all invoices and customers data
  const { data: outstandingInvoices, isLoading: isLoadingInvoices, error: invoicesError } = useQuery<Invoice[]>({
    queryKey: ['/api/finance/invoices'],
  });
  
  const { data: customersList, isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    enabled: true,
  });
  
  // Get payment details if in edit mode
  const { data: paymentData, isLoading: isLoadingPayment } = useQuery<PaymentData>({
    queryKey: [`/api/finance/payments/${paymentId}`],
    enabled: isEditMode && paymentId !== null,
  });
  
  // Log payment data for debugging
  useEffect(() => {
    if (isEditMode && paymentData) {
      console.log('Payment Data:', paymentData);
      
      // Set customer ID if this is an advance payment
      if (paymentData.payment.is_advance_payment && paymentData.payment.customer_id) {
        setSelectedCustomerId(paymentData.payment.customer_id.toString());
      }
    }
  }, [isEditMode, paymentData, setSelectedCustomerId]);
  
  // Set up form values based on whether we're creating or editing
  const initialFormValues: PaymentFormValues = isEditMode && paymentData && paymentData.payment ? {
    // Use snake_case format from API response
    referenceNumber: paymentData.payment.reference_number || '',
    paymentDate: new Date(paymentData.payment.payment_date || new Date()),
    amount: String(paymentData.payment.amount || ''),
    currency: paymentData.payment.currency || 'INR',
    paymentMethod: paymentData.payment.payment_method || 'bank transfer',
    notes: paymentData.payment.notes || '',
    isAdvancePayment: Boolean(paymentData.payment.is_advance_payment || false),
    customerId: String(paymentData.payment.customer_id || ''),
    invoiceLinks: paymentData.invoiceLinks && paymentData.invoiceLinks.length > 0 ? 
      paymentData.invoiceLinks.map(link => {
        return {
          invoiceId: String(link.invoice_id || ''),
          amount: String(link.amount || '0')
        };
      }) : [],
  } : {
    referenceNumber: `PAY-${getIndianFinancialYear(new Date())}-001`,
    paymentDate: new Date(),
    amount: '',
    currency: 'INR',
    paymentMethod: 'bank transfer',
    notes: '',
    isAdvancePayment: false,
    customerId: '',
    invoiceLinks: [],
  };
  
  // Default form values
  const defaultValues = initialFormValues;
  
  // Create form
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues,
  });
  
  // Function to generate reference number based on payment date
  const generateReferenceNumber = useCallback(async (date: Date) => {
    try {
      setIsGeneratingReferenceNumber(true);
      
      // Generate a financial year format like "2526" for 2025-2026
      const financialYear = getIndianFinancialYear(date);
      
      // Call the API to get the next reference number
      const response = await fetch(`/api/finance/payments/latest-reference`);
      if (!response.ok) {
        throw new Error('Failed to fetch next payment reference number');
      }
      
      const data = await response.json();
      const nextReferenceNumber = data.latestReference || `PAY-${financialYear}-001`;
      
      console.log(`Generated new reference number: ${nextReferenceNumber}`);
      form.setValue('referenceNumber', nextReferenceNumber);
    } catch (error) {
      console.error('Failed to generate payment reference number:', error);
      
      // Use a simple fallback approach
      const financialYear = getIndianFinancialYear(date);
      form.setValue('referenceNumber', `PAY-${financialYear}-001`);
    } finally {
      setIsGeneratingReferenceNumber(false);
    }
  }, [form, setIsGeneratingReferenceNumber]);
  
  // Generate reference number on component mount for new payments
  useEffect(() => {
    // Only for create mode, not edit mode
    if (!isEditMode) {
      // Call the function directly to generate reference number
      // Using current date as default
      generateReferenceNumber(new Date());
    }
  }, [isEditMode, generateReferenceNumber]);
  
  // Update form when payment data is loaded
  useEffect(() => {
    if (isEditMode && paymentData && paymentData.payment) {
      console.log('Setting form values with payment data:', paymentData);
      
      // Delay the reset by a tiny bit to ensure it happens after component render
      setTimeout(() => {
        // Get the advance payment status from the data
        const isAdvancePayment = Boolean(paymentData.payment.is_advance_payment);
        console.log('Is advance payment:', isAdvancePayment);
        
        // Reset the entire form with the payment data
        form.reset({
          referenceNumber: paymentData.payment.reference_number || '',
          paymentDate: paymentData.payment.payment_date ? new Date(paymentData.payment.payment_date) : new Date(),
          amount: String(paymentData.payment.amount || ''),
          currency: paymentData.payment.currency || 'INR',
          paymentMethod: paymentData.payment.payment_method || 'bank transfer',
          notes: paymentData.payment.notes || '',
          isAdvancePayment: isAdvancePayment,
          customerId: String(paymentData.payment.customer_id || ''),
          invoiceLinks: paymentData.invoiceLinks && paymentData.invoiceLinks.length > 0 ? 
            paymentData.invoiceLinks.map(link => ({
              invoiceId: String((link.invoice && link.invoice.id) || link.invoice_id || ''),
              amountApplied: String(link.amountApplied || link.amount_applied || '0')
            })) : [],
        });
        
        // Set advance payment switch directly
        form.setValue('isAdvancePayment', isAdvancePayment);
        
        // Set selected customer ID for the UI if available
        if (paymentData.payment.customer_id) {
          const customerId = String(paymentData.payment.customer_id);
          setSelectedCustomerId(customerId);
          
          // Make sure customerId is set in the form
          form.setValue('customerId', customerId);
          
          console.log('Setting selected customer ID:', customerId);
        }
        
        // For edit mode, load the selected invoices for display
        if (paymentData.invoiceLinks && outstandingInvoices) {
          const linkedInvoices = paymentData.invoiceLinks
            .map(link => {
              const invoiceId = parseInt(String(link.invoice_id || (link.invoice && link.invoice.id)), 10);
              return outstandingInvoices.find(inv => inv.id === invoiceId);
            })
            .filter(Boolean);
          
          console.log('Linked invoices:', linkedInvoices);
          setSelectedInvoices(linkedInvoices);
        }
      }, 300); // Increased delay to ensure data is loaded properly
    }
  }, [isEditMode, paymentData, form, outstandingInvoices]);
  
  // Set up field array for invoice links
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "invoiceLinks",
  });
  
// This function has been moved to line 232
  
  // Update reference number when payment date changes - only in create mode
  useEffect(() => {
    if (!isEditMode) {
      const subscription = form.watch((value, { name }) => {
        if (name === 'paymentDate' && value.paymentDate) {
          generateReferenceNumber(value.paymentDate as Date);
        }
      });
      
      return () => subscription.unsubscribe();
    }
  }, [form, generateReferenceNumber, isEditMode]);
  
  // Calculate total amount applied to invoices
  const calculateTotalApplied = () => {
    const values = form.getValues();
    return values.invoiceLinks ? values.invoiceLinks.reduce((sum, link) => sum + parseFloat(link.amountApplied || '0'), 0) : 0;
  };
  
  // Check if amount remaining to be applied
  const getRemainingAmount = () => {
    const totalAmount = parseFloat(form.getValues().amount || '0');
    const totalApplied = calculateTotalApplied();
    return totalAmount - totalApplied;
  };
  
  // Create payment mutation
  const createPayment = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      // Transform values for API
      const apiData = {
        payment: {
          referenceNumber: values.referenceNumber,
          paymentDate: format(values.paymentDate, 'yyyy-MM-dd'),
          amount: String(values.amount),
          currency: values.currency,
          paymentMethod: values.paymentMethod,
          notes: values.notes || null,
          isAdvancePayment: values.isAdvancePayment,
          customerId: values.isAdvancePayment ? parseInt(values.customerId || '0') : null,
        },
        invoiceLinks: values.invoiceLinks ? values.invoiceLinks.map(link => ({
          invoiceId: parseInt(link.invoiceId),
          amountApplied: String(link.amountApplied),
        })) : []
      };
      
      return apiRequest('POST', '/api/finance/payments', apiData);
    },
    onSuccess: () => {
      toast({
        title: "Payment recorded",
        description: "Payment has been recorded successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/payments'] });
      navigate('/finance/payments');
    },
    onError: (error: any) => {
      console.error('Error recording payment:', error);
      const errorMessage = error?.message || "Failed to record payment. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });
  
  // Update payment mutation
  const updatePayment = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!paymentId) {
        throw new Error("Payment ID is missing");
      }
      
      // Transform values for API
      const apiData = {
        payment: {
          referenceNumber: values.referenceNumber,
          paymentDate: format(values.paymentDate, 'yyyy-MM-dd'),
          amount: String(values.amount),
          currency: values.currency,
          paymentMethod: values.paymentMethod,
          notes: values.notes || null,
          isAdvancePayment: values.isAdvancePayment,
          customerId: values.isAdvancePayment ? parseInt(values.customerId || '0') : null,
        },
        invoiceLinks: values.invoiceLinks ? values.invoiceLinks.map(link => ({
          invoiceId: parseInt(link.invoiceId),
          amountApplied: String(link.amountApplied),
        })) : []
      };
      
      return apiRequest('PUT', `/api/finance/payments/${paymentId}`, apiData);
    },
    onSuccess: () => {
      toast({
        title: "Payment updated",
        description: "Payment has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/payments'] });
      navigate('/finance/payments');
    },
    onError: (error: any) => {
      console.error('Error updating payment:', error);
      const errorMessage = error?.message || "Failed to update payment. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });
  
  // Submit handler
  const onSubmit = (values: PaymentFormValues) => {
    // For advance payments, just make sure a customer is selected
    if (values.isAdvancePayment) {
      if (!values.customerId) {
        toast({
          title: "Validation Error",
          description: "Please select a customer for this advance payment",
          variant: "destructive",
        });
        return;
      }
      
      if (isEditMode && paymentId) {
        updatePayment.mutate(values);
      } else {
        createPayment.mutate(values);
      }
      return;
    }
    
    // For regular payments, validate invoice links
    const totalApplied = calculateTotalApplied();
    const totalAmount = parseFloat(values.amount);
    
    if (Math.abs(totalApplied - totalAmount) > 0.01) {
      toast({
        title: "Validation Error",
        description: "Total applied amount must equal the payment amount",
        variant: "destructive",
      });
      return;
    }
    
    // Validate that all selected invoices have the same currency as the payment
    const paymentCurrency = values.currency;
    const invoiceCurrencyMismatch = values.invoiceLinks?.some(link => {
      const invoiceId = link.invoiceId;
      const invoice = outstandingInvoices?.find((inv: any) => String(inv.id) === invoiceId);
      return invoice && invoice.currency !== paymentCurrency;
    });
    
    if (invoiceCurrencyMismatch) {
      toast({
        title: "Currency Mismatch",
        description: "All invoices must be in the same currency as the payment",
        variant: "destructive",
      });
      return;
    }
    
    if (isEditMode && paymentId) {
      updatePayment.mutate(values);
    } else {
      createPayment.mutate(values);
    }
  };
  
  // Filter invoices based on selected customer and search term
  const filteredInvoices = Array.isArray(outstandingInvoices) 
    ? outstandingInvoices.filter((invoice: any) => {
        // First filter by customer if one is selected
        if (selectedCustomerId && invoice.customerId !== parseInt(selectedCustomerId)) {
          return false;
        }
        
        // Only include invoices that are pending or partially paid
        if (invoice.status !== 'Pending' && invoice.status !== 'Partially Paid') {
          return false;
        }
        
        // Then filter by search term if one is provided
        if (!searchInvoice) return true;
        
        return (
          invoice.invoiceNumber?.toLowerCase().includes(searchInvoice.toLowerCase()) ||
          String(invoice.id).includes(searchInvoice)
        );
      })
      // Sort by amount (highest to lowest) to match auto-allocation logic
      .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
    : [];
  
  // Auto-allocate payment to invoices (highest to lowest value)
  const autoAllocatePayment = (totalAmount: number, invoicesToAllocate: any[]) => {
    const paymentCurrency = form.getValues().currency;
    
    // Filter invoices by matching currency and sort by total amount (highest to lowest)
    const matchingCurrencyInvoices = invoicesToAllocate.filter(invoice => 
      invoice.currency === paymentCurrency
    );
    
    // Show warning if any invoices were filtered due to currency mismatch
    if (matchingCurrencyInvoices.length < invoicesToAllocate.length) {
      toast({
        title: "Currency Mismatch",
        description: `Only invoices in ${paymentCurrency} will be allocated to this payment.`,
        variant: "destructive",
      });
    }
    
    // Sort invoices by total amount (highest to lowest)
    const sortedInvoices = [...matchingCurrencyInvoices].sort((a, b) => 
      parseFloat(b.totalAmount) - parseFloat(a.totalAmount)
    );
    
    let remainingAmount = totalAmount;
    const allocations: { invoiceId: string; amountApplied: string }[] = [];
    const newSelectedInvoices: any[] = [];
    
    // Clear existing invoice links
    form.setValue('invoiceLinks', []);
    
    // Allocate to each invoice until amount is exhausted
    for (const invoice of sortedInvoices) {
      if (remainingAmount <= 0) break;
      
      const invoiceAmount = parseFloat(invoice.totalAmount);
      const amountToApply = Math.min(invoiceAmount, remainingAmount);
      
      allocations.push({
        invoiceId: String(invoice.id),
        amountApplied: String(amountToApply.toFixed(2))
      });
      
      newSelectedInvoices.push(invoice);
      remainingAmount -= amountToApply;
    }
    
    // Update form with new allocations
    allocations.forEach(allocation => {
      append(allocation);
    });
    
    // Update selected invoices for display
    setSelectedInvoices(newSelectedInvoices);
    
    return allocations;
  };
  
  // Handle customer selection change
  const handleCustomerChange = (customerId: string) => {
    // Handle "all" value
    if (customerId === 'all') {
      customerId = '';
    }
    
    setSelectedCustomerId(customerId);
    
    // If this is for advance payment, also set the form customerId
    if (form.watch('isAdvancePayment') && customerId) {
      form.setValue('customerId', customerId);
    }
    
    // Reset invoice selection
    setSelectedInvoices([]);
    form.setValue('invoiceLinks', []);
    
    // If auto-allocate is enabled and payment amount is entered, allocate automatically
    const paymentAmount = parseFloat(form.getValues().amount || '0');
    if (autoAllocateEnabled && paymentAmount > 0 && !form.watch('isAdvancePayment')) {
      // Filter invoices for selected customer
      const customerInvoices = Array.isArray(outstandingInvoices) 
        ? outstandingInvoices.filter((invoice: any) => 
            (customerId ? invoice.customerId === parseInt(customerId) : true) && 
            (invoice.status === 'Pending' || invoice.status === 'Partially Paid')
          )
        : [];
      
      autoAllocatePayment(paymentAmount, customerInvoices);
    }
  };
  
  // Handle payment amount change
  const handlePaymentAmountChange = (amount: string) => {
    form.setValue('amount', amount);
    
    // If auto-allocate is enabled and customer is selected, allocate automatically
    if (autoAllocateEnabled && selectedCustomerId && !form.watch('isAdvancePayment')) {
      const paymentAmount = parseFloat(amount || '0');
      
      // Filter invoices for selected customer
      const customerInvoices = Array.isArray(outstandingInvoices) 
        ? outstandingInvoices.filter((invoice: any) => 
            invoice.customerId === parseInt(selectedCustomerId) && 
            (invoice.status === 'Pending' || invoice.status === 'Partially Paid')
          )
        : [];
      
      autoAllocatePayment(paymentAmount, customerInvoices);
    }
  };
  
  // Add invoice to form manually
  const addInvoiceToForm = (invoice: any) => {
    // Check if invoice is already in the list
    const isAlreadyAdded = form.getValues().invoiceLinks?.some(
      link => link.invoiceId === String(invoice.id)
    );
    
    if (isAlreadyAdded) {
      toast({
        title: "Invoice already added",
        description: "This invoice is already in the list",
        variant: "destructive",
      });
      return;
    }
    
    // Check if there's a currency mismatch
    const paymentCurrency = form.getValues().currency;
    if (invoice.currency !== paymentCurrency) {
      toast({
        title: "Currency Mismatch",
        description: `This invoice is in ${invoice.currency}, but the payment is in ${paymentCurrency}. All invoices must match the payment currency.`,
        variant: "destructive",
      });
      return;
    }
    
    // Add invoice to the form
    append({
      invoiceId: String(invoice.id),
      amountApplied: String(invoice.totalAmount), // Default to full amount, can be adjusted
    });
    
    // Update selected invoices list for display
    setSelectedInvoices(prev => [...prev, invoice]);
    
    // Update total amount if it's the first invoice
    if (form.getValues().amount === '') {
      form.setValue('amount', String(invoice.totalAmount));
    }
  };
  
  // Show loading state when fetching data
  if (isLoadingInvoices) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="mr-2 h-16 w-16 animate-spin" />
          <p>Loading...</p>
        </div>
      </Layout>
    );
  }
  
  if (invoicesError) {
    return (
      <Layout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load outstanding invoices. Please try again later.
          </AlertDescription>
        </Alert>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <Helmet>
        <title>{isEditMode ? 'Edit Payment' : 'Record New Payment'} | Thermopac</title>
      </Helmet>
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{isEditMode ? 'Edit Payment' : 'Record New Payment'}</h1>
        <Button variant="outline" onClick={() => navigate('/finance/payments')}>
          Cancel
        </Button>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Information</CardTitle>
              <CardDescription>
                Enter the basic information for this payment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add Advance Payment Toggle */}
              <FormField
                control={form.control}
                name="isAdvancePayment"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          // Clear invoice links if switching to advance payment
                          if (checked) {
                            form.setValue('invoiceLinks', []);
                            setSelectedInvoices([]);
                          }
                        }}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Advance Payment</FormLabel>
                      <FormDescription>
                        Record a payment not linked to any invoice
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="referenceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference Number</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <div className="flex">
                            <Input 
                              placeholder="PAY-2526-001" 
                              {...field} 
                              readOnly 
                              className="bg-muted cursor-not-allowed rounded-r-none" 
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="rounded-l-none border-l-0"
                              disabled={isGeneratingReferenceNumber}
                              onClick={() => generateReferenceNumber(form.getValues().paymentDate)}
                            >
                              <RefreshCw className={`h-4 w-4 ${isGeneratingReferenceNumber ? 'animate-spin' : ''}`} />
                            </Button>
                          </div>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Auto-generated payment reference number
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="paymentDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Payment Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={`w-full pl-3 text-left font-normal ${!field.value ? "text-muted-foreground" : ""}`}
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
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        Date when payment was received
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method</FormLabel>
                      <Select 
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="bank transfer">Bank Transfer</SelectItem>
                          <SelectItem value="wire transfer">Wire Transfer</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="check">Check</SelectItem>
                          <SelectItem value="credit card">Credit Card</SelectItem>
                          <SelectItem value="online payment">Online Payment</SelectItem>
                        </SelectContent>
                      </Select>
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
                      <Select 
                        onValueChange={(value) => {
                          // Reset invoice links if currency changes
                          if (value !== field.value && form.getValues().invoiceLinks?.length) {
                            form.setValue('invoiceLinks', []);
                            setSelectedInvoices([]);
                            toast({
                              title: "Currency Changed",
                              description: "Invoice links have been cleared as currency has changed.",
                              variant: "destructive",
                            });
                          }
                          field.onChange(value);
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="INR">Indian Rupee (₹)</SelectItem>
                          <SelectItem value="USD">US Dollar ($)</SelectItem>
                          <SelectItem value="EUR">Euro (€)</SelectItem>
                          <SelectItem value="GBP">British Pound (£)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {form.watch('isAdvancePayment') 
                          ? 'Currency of the advance payment'
                          : 'All invoices must be in the same currency as the payment.'
                        }
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="space-y-2">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Amount</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            min="0"
                            placeholder="0.00"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              handlePaymentAmountChange(e.target.value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Auto-allocation toggle - only show for non-advance payments */}
                  {!form.watch('isAdvancePayment') && (
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="auto-allocate"
                        checked={autoAllocateEnabled}
                        onCheckedChange={(checked) => {
                          setAutoAllocateEnabled(checked);
                          
                          // If turning on auto-allocation, run it now
                          if (checked && selectedCustomerId && parseFloat(form.getValues().amount || '0') > 0) {
                            const customerInvoices = Array.isArray(outstandingInvoices) 
                              ? outstandingInvoices.filter((invoice: any) => 
                                  invoice.customerId === parseInt(selectedCustomerId) && 
                                  (invoice.status === 'Pending' || invoice.status === 'Partially Paid')
                                )
                              : [];
                            
                            autoAllocatePayment(parseFloat(form.getValues().amount), customerInvoices);
                          }
                        }}
                      />
                      <label
                        htmlFor="auto-allocate"
                        className="text-sm font-medium leading-none cursor-pointer"
                      >
                        Auto-allocate to invoices
                      </label>
                    </div>
                  )}
                </div>
                
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add any additional information about this payment..."
                          className="resize-none"
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
          
          {/* Show appropriate section based on payment type */}
          {form.watch('isAdvancePayment') ? (
            // Customer selection for advance payment
            <Card>
              <CardHeader>
                <CardTitle>Advance Payment Details</CardTitle>
                <CardDescription>
                  Specify the customer for this advance payment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customersList && customersList.map((customer) => (
                            <SelectItem key={customer.id} value={String(customer.id)}>
                              {customer.bpName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select the customer who made this advance payment
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          ) : (
            // Regular invoice linking section
            <Card>
              <CardHeader>
                <CardTitle>Link to Invoices</CardTitle>
                <CardDescription>
                  Link this payment to one or more pending invoices
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Customer selection */}
                <div className="mb-6 space-y-4">
                  <div className="flex flex-col space-y-2">
                    <label className="text-sm font-medium">Select Customer</label>
                    <Select
                      value={selectedCustomerId}
                      onValueChange={handleCustomerChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Customers</SelectItem>
                        {customersList?.map((customer: any) => (
                          <SelectItem key={customer.id} value={String(customer.id)}>
                            {customer.bpName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              
                {/* Search box for invoices */}
                <div className="mb-6">
                  <label className="text-sm font-medium mb-2 block">Search for Invoices</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search by invoice number..."
                      value={searchInvoice}
                      onChange={(e) => setSearchInvoice(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                
                {/* Invoice selection */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-2">Available Invoices</h3>
                  {filteredInvoices.length > 0 ? (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="px-4 py-2 text-left">Invoice #</th>
                            <th className="px-4 py-2 text-left">Customer</th>
                            <th className="px-4 py-2 text-left">Date</th>
                            <th className="px-4 py-2 text-right">Amount</th>
                            <th className="px-4 py-2 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredInvoices.map((invoice: any) => {
                            const isSelected = form.getValues().invoiceLinks?.some(
                              link => link.invoiceId === String(invoice.id)
                            );
                            const isCurrencyMismatch = invoice.currency !== form.getValues().currency;
                            
                            return (
                              <tr key={invoice.id} className={`border-b hover:bg-muted/50 ${isSelected ? 'bg-blue-50' : ''}`}>
                                <td className="px-4 py-2 text-left">{invoice.invoiceNumber}</td>
                                <td className="px-4 py-2 text-left">
                                  {customersList?.find((c: any) => c.id === invoice.customerId)?.bpName || 'Unknown'}
                                </td>
                                <td className="px-4 py-2 text-left">{invoice.invoiceDate ? format(new Date(invoice.invoiceDate), 'MMM d, yyyy') : 'N/A'}</td>
                                <td className="px-4 py-2 text-right">
                                  {invoice.currency === 'INR' 
                                    ? formatRupees(invoice.totalAmount)
                                    : new Intl.NumberFormat('en-US', {
                                        style: 'currency',
                                        currency: invoice.currency
                                      }).format(parseFloat(invoice.totalAmount))
                                  }
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <Button
                                    type="button"
                                    variant={isCurrencyMismatch ? "outline" : "default"}
                                    size="sm"
                                    disabled={isSelected || isCurrencyMismatch}
                                    onClick={() => addInvoiceToForm(invoice)}
                                  >
                                    {isSelected ? (
                                      <>
                                        <CheckCircle className="h-4 w-4 mr-1" />
                                        Added
                                      </>
                                    ) : isCurrencyMismatch ? (
                                      "Currency Mismatch"
                                    ) : (
                                      <>
                                        <Plus className="h-4 w-4 mr-1" />
                                        Add
                                      </>
                                    )}
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-muted/20 border rounded-md">
                      <p className="text-muted-foreground">No pending invoices found.</p>
                      {selectedCustomerId && (
                        <p className="text-sm mt-2">Try selecting a different customer or clearing the search filter.</p>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Selected invoices section */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Invoice Allocations</h3>
                  {fields.length > 0 ? (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="px-4 py-2 text-left">Invoice #</th>
                            <th className="px-4 py-2 text-right">Total Amount</th>
                            <th className="px-4 py-2 text-right">Amount Applied</th>
                            <th className="px-4 py-2 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map((field, index) => {
                            const invoiceId = field.invoiceId;
                            const invoice = outstandingInvoices?.find((inv: any) => String(inv.id) === invoiceId);
                            
                            return (
                              <tr key={field.id} className="border-b hover:bg-muted/50">
                                <td className="px-4 py-2 text-left">
                                  {invoice?.invoiceNumber || invoiceId}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  {invoice?.currency === 'INR' 
                                    ? formatRupees(invoice?.amount || '0')
                                    : new Intl.NumberFormat('en-US', {
                                        style: 'currency',
                                        currency: invoice?.currency
                                      }).format(parseFloat(invoice?.amount || '0'))
                                  }
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max={invoice?.amount}
                                    className="w-32 text-right"
                                    {...form.register(`invoiceLinks.${index}.amountApplied`)}
                                  />
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      remove(index);
                                      // Also remove from selectedInvoices
                                      setSelectedInvoices(prev => 
                                        prev.filter(i => String(i.id) !== invoiceId)
                                      );
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="bg-muted/20">
                            <td className="px-4 py-3 text-right font-medium" colSpan={2}>Total Applied:</td>
                            <td className="px-4 py-3 text-right font-medium">
                              {form.getValues().currency === 'INR' 
                                ? formatRupees(calculateTotalApplied())
                                : new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: form.getValues().currency
                                  }).format(calculateTotalApplied())
                              }
                            </td>
                            <td></td>
                          </tr>
                          <tr className="bg-muted/20">
                            <td className="px-4 py-3 text-right font-medium" colSpan={2}>
                              {getRemainingAmount() > 0 ? 'Remaining:' : getRemainingAmount() < 0 ? 'Overapplied:' : 'Fully Applied:'}
                            </td>
                            <td className={`px-4 py-3 text-right font-medium ${getRemainingAmount() !== 0 ? 'text-red-500' : 'text-green-500'}`}>
                              {form.getValues().currency === 'INR' 
                                ? formatRupees(Math.abs(getRemainingAmount()))
                                : new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: form.getValues().currency
                                  }).format(Math.abs(getRemainingAmount()))
                              }
                            </td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-muted/20 border rounded-md">
                      <p className="text-muted-foreground">No invoices selected.</p>
                      <p className="text-sm mt-2">Click "Add" on an invoice above to link it to this payment.</p>
                    </div>
                  )}
                  
                  {/* Allocation progress bar */}
                  {parseFloat(form.getValues().amount || '0') > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Allocation Progress</span>
                        <span className="text-sm">
                          {Math.min(100, Math.max(0, (calculateTotalApplied() / parseFloat(form.getValues().amount || '1')) * 100)).toFixed(0)}%
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(100, Math.max(0, (calculateTotalApplied() / parseFloat(form.getValues().amount || '1')) * 100))} 
                        className="h-2"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          
          <CardFooter className="flex justify-between px-0">
            <Button variant="outline" type="button" onClick={() => navigate('/finance/payments')}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isEditMode ? updatePayment.isPending : createPayment.isPending}
            >
              {isEditMode ? (
                updatePayment.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Update Payment'
                )
              ) : (
                createPayment.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Record Payment'
                )
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Layout>
  );
}