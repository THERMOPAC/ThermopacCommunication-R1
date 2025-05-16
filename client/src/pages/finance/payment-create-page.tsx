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

export default function PaymentCreatePage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInvoice, setSearchInvoice] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [autoAllocateEnabled, setAutoAllocateEnabled] = useState(true);
  const [isGeneratingReferenceNumber, setIsGeneratingReferenceNumber] = useState(false);
  
  // Get all invoices and customers data
  const { data: outstandingInvoices, isLoading: isLoadingInvoices, error: invoicesError } = useQuery({
    queryKey: ['/api/finance/invoices'],
  });
  
  const { data: customersList, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['/api/customers'],
    enabled: true,
  });
  
  // Default form values
  const defaultValues: PaymentFormValues = {
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
  
  // Create form
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues,
  });
  
  // Set up field array for invoice links
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "invoiceLinks",
  });
  
  // Function to generate reference number based on payment date
  const generateReferenceNumber = useCallback(async (date: Date) => {
    try {
      setIsGeneratingReferenceNumber(true);
      const nextReferenceNumber = await getNextPaymentReferenceNumber(date);
      form.setValue('referenceNumber', nextReferenceNumber);
    } catch (error) {
      console.error('Failed to generate payment reference number:', error);
      toast({
        title: "Error",
        description: "Could not generate reference number. Using fallback format.",
        variant: "destructive",
      });
      const financialYear = getIndianFinancialYear(date);
      form.setValue('referenceNumber', `PAY-${financialYear}-001`);
    } finally {
      setIsGeneratingReferenceNumber(false);
    }
  }, [form, toast]);
  
  // Update reference number when payment date changes
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'paymentDate' && value.paymentDate) {
        generateReferenceNumber(value.paymentDate as Date);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [form, generateReferenceNumber]);
  
  // Calculate total amount applied to invoices
  const calculateTotalApplied = () => {
    const values = form.getValues();
    return values.invoiceLinks.reduce((sum, link) => sum + parseFloat(link.amountApplied || '0'), 0);
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
      
      createPayment.mutate(values);
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
    
    createPayment.mutate(values);
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
      .sort((a, b) => parseFloat(b.totalAmount) - parseFloat(a.totalAmount))
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
        variant: "warning",
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
    setSelectedCustomerId(customerId);
    
    // Reset invoice selection
    setSelectedInvoices([]);
    form.setValue('invoiceLinks', []);
    
    // If auto-allocate is enabled and payment amount is entered, allocate automatically
    const paymentAmount = parseFloat(form.getValues().amount || '0');
    if (autoAllocateEnabled && paymentAmount > 0) {
      // Filter invoices for selected customer
      const customerInvoices = Array.isArray(outstandingInvoices) 
        ? outstandingInvoices.filter((invoice: any) => 
            invoice.customerId === parseInt(customerId) && 
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
    if (autoAllocateEnabled && selectedCustomerId) {
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
    const isAlreadyAdded = form.getValues().invoiceLinks.some(
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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="mr-2 h-16 w-16 animate-spin" />
        <p>Loading...</p>
      </div>
    );
  }
  
  if (invoicesError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load outstanding invoices. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <Layout>
      <Helmet>
        <title>Record New Payment | Thermopac</title>
      </Helmet>
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Record New Payment</h1>
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
                              variant="outline"
                              size="icon"
                              className="h-10 rounded-l-none border-l-0"
                              onClick={async () => {
                                const currentPaymentDate = form.getValues('paymentDate');
                                if (currentPaymentDate) {
                                  try {
                                    setIsGeneratingReferenceNumber(true);
                                    const nextReferenceNumber = await getNextPaymentReferenceNumber(currentPaymentDate);
                                    form.setValue('referenceNumber', nextReferenceNumber);
                                  } catch (error) {
                                    console.error('Failed to generate payment reference number:', error);
                                    toast({
                                      title: "Error",
                                      description: "Could not generate reference number. Using fallback format.",
                                      variant: "destructive",
                                    });
                                    const financialYear = getIndianFinancialYear(currentPaymentDate);
                                    form.setValue('referenceNumber', `PAY-${financialYear}-001`);
                                  } finally {
                                    setIsGeneratingReferenceNumber(false);
                                  }
                                }
                              }}
                              disabled={isGeneratingReferenceNumber}
                              title="Refresh reference number"
                            >
                              {isGeneratingReferenceNumber ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          {isGeneratingReferenceNumber && (
                            <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </FormControl>
                      <FormDescription>
                        Automatically generated based on financial year (April-March). The format is PAY-YYZZ-SERIES where YY is start year and ZZ is end year (e.g., PAY-2526-001 for FY 2025-26).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
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
                
                {/* Customer Selection */}
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <Select
                    onValueChange={handleCustomerChange}
                    value={selectedCustomerId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Array.isArray(customersList) ? (
                        customersList.map((customer: any) => (
                          <SelectItem key={customer.id} value={String(customer.id)}>
                            {customer.bpName} ({customer.bpCode})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-customers" disabled>No customers found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Select the customer who made this payment
                  </FormDescription>
                </FormItem>
                
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
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          // Get the current invoiceLinks and check if they have a different currency
                          const currentLinks = form.getValues().invoiceLinks;
                          if (currentLinks.length > 0) {
                            // Check if any of the current invoices has a different currency
                            const hasCurrencyMismatch = currentLinks.some(link => {
                              const invoice = outstandingInvoices?.find((inv: any) => 
                                String(inv.id) === link.invoiceId
                              );
                              return invoice && invoice.currency !== value;
                            });
                            
                            if (hasCurrencyMismatch) {
                              // Clear the invoice links as they won't match the new currency
                              toast({
                                title: "Currency Changed",
                                description: "Invoice selections have been cleared because they don't match the new currency.",
                                variant: "warning",
                              });
                              form.setValue('invoiceLinks', []);
                              setSelectedInvoices([]);
                            }
                          }
                          
                          // Update the currency
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
                        All invoices must be in the same currency as the payment.
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
                  
                  {/* Auto-allocation toggle */}
                  <div className="flex items-center space-x-2">
                    <div className="flex-1"></div>
                    <Switch 
                      checked={autoAllocateEnabled}
                      onCheckedChange={setAutoAllocateEnabled}
                      id="auto-allocate"
                    />
                    <label
                      htmlFor="auto-allocate"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Auto-allocate to invoices
                    </label>
                  </div>
                </div>
                
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
              <CardTitle>Link Invoices</CardTitle>
              <CardDescription>
                Link this payment to one or more invoices
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4 mb-4">
                <div className="flex-grow relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search invoices by number..."
                    className="pl-8"
                    value={searchInvoice}
                    onChange={(e) => setSearchInvoice(e.target.value)}
                  />
                </div>
              </div>
              
              {/* Outstanding invoices table */}
              <div className="border rounded-md">
                <div className="px-4 py-3 bg-muted flex justify-between items-center">
                  <h3 className="font-medium">Outstanding Invoices</h3>
                  {selectedCustomerId && (
                    <div className="flex items-center gap-2">
                      <div className="text-sm text-muted-foreground mr-2">
                        {autoAllocateEnabled ? 'Auto-allocation enabled' : 'Manual selection'}
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          // If customer has selected and payment amount entered, run auto-allocation
                          const paymentAmount = parseFloat(form.getValues().amount || '0');
                          if (paymentAmount > 0) {
                            autoAllocatePayment(paymentAmount, filteredInvoices);
                          } else {
                            toast({
                              title: "Payment amount needed",
                              description: "Please enter a payment amount first",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        <ArrowDownUp className="h-4 w-4 mr-1" />
                        Reallocate
                      </Button>
                    </div>
                  )}
                </div>
                
                {!selectedCustomerId ? (
                  <div className="p-6 text-center">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <h4 className="text-lg font-medium">No customer selected</h4>
                    <p className="text-sm text-muted-foreground">
                      Please select a customer to view their outstanding invoices
                    </p>
                  </div>
                ) : filteredInvoices.length === 0 ? (
                  <div className="p-6 text-center">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <h4 className="text-lg font-medium">No outstanding invoices</h4>
                    <p className="text-sm text-muted-foreground">
                      This customer has no outstanding invoices
                    </p>
                  </div>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b">
                          <th className="px-4 py-2 text-left text-sm font-medium">Invoice #</th>
                          <th className="px-4 py-2 text-left text-sm font-medium">Date</th>
                          <th className="px-4 py-2 text-left text-sm font-medium">Due Date</th>
                          <th className="px-4 py-2 text-right text-sm font-medium">Amount</th>
                          <th className="px-4 py-2 text-right text-sm font-medium">Status</th>
                          <th className="px-4 py-2 text-center text-sm font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInvoices.map((invoice: any) => {
                          // Check if this invoice is already selected
                          const isSelected = selectedInvoices.some(i => i.id === invoice.id);
                          // Get the amount applied to this invoice
                          const appliedAmount = form.getValues().invoiceLinks.find(
                            link => link.invoiceId === String(invoice.id)
                          )?.amountApplied || '0';
                          
                          return (
                            <tr 
                              key={invoice.id} 
                              className={`border-t ${isSelected ? 'bg-muted' : 'hover:bg-muted/50'}`}
                            >
                              <td className="px-4 py-2 text-sm">
                                <div className="flex items-center">
                                  {invoice.invoiceNumber}
                                  {isSelected && (
                                    <CheckCircle className="ml-1 h-4 w-4 text-green-500" />
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-sm">{format(new Date(invoice.issueDate), 'MMM d, yyyy')}</td>
                              <td className="px-4 py-2 text-sm">{format(new Date(invoice.dueDate), 'MMM d, yyyy')}</td>
                              <td className="px-4 py-2 text-sm text-right">
                                {invoice.currency === 'INR'
                                  ? formatRupees(invoice.totalAmount || 0)
                                  : new Intl.NumberFormat('en-US', {
                                      style: 'currency',
                                      currency: invoice.currency || 'USD',
                                    }).format(invoice.totalAmount || 0)
                                }
                              </td>
                              <td className="px-4 py-2 text-sm text-right">
                                <Badge variant={
                                  invoice.status === 'Paid' ? 'success' : 
                                  invoice.status === 'Partially Paid' ? 'warning' : 
                                  invoice.status === 'Pending' ? 'outline' : 
                                  'secondary'
                                }>
                                  {invoice.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-2 text-sm text-center">
                                {isSelected ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      // Remove this invoice from the form
                                      const currentLinks = form.getValues().invoiceLinks;
                                      const indexToRemove = currentLinks.findIndex(
                                        link => link.invoiceId === String(invoice.id)
                                      );
                                      
                                      if (indexToRemove !== -1) {
                                        remove(indexToRemove);
                                        setSelectedInvoices(prev => 
                                          prev.filter(i => i.id !== invoice.id)
                                        );
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={autoAllocateEnabled}
                                    onClick={() => addInvoiceToForm(invoice)}
                                  >
                                    Add
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              
              {/* Payment allocation summary */}
              <div className="border rounded-md mt-6">
                <div className="px-4 py-3 bg-muted flex justify-between items-center">
                  <h3 className="font-medium">Payment Allocation Details</h3>
                  {getRemainingAmount() !== 0 && (
                    <Badge variant={getRemainingAmount() > 0 ? 'outline' : 'destructive'}>
                      {getRemainingAmount() > 0 
                        ? `${formatRupees(getRemainingAmount())} unallocated` 
                        : `${formatRupees(Math.abs(getRemainingAmount()))} over-allocated`}
                    </Badge>
                  )}
                </div>
                <div className="p-4">
                  {fields.length === 0 ? (
                    <div className="p-6 text-center">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <h4 className="text-lg font-medium">No invoices allocated</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedCustomerId 
                          ? "Enter a payment amount and invoices will be auto-allocated" 
                          : "Select a customer above to view their outstanding invoices"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {fields.map((field, index) => {
                        // Find the invoice details
                        const invoiceId = form.getValues().invoiceLinks[index].invoiceId;
                        const invoice = outstandingInvoices?.find((inv: any) => String(inv.id) === invoiceId);
                        
                        return (
                          <div key={field.id} className="border p-4 rounded-md space-y-3">
                            <div className="flex justify-between items-center">
                              <div>
                                <h4 className="font-medium flex items-center gap-2">
                                  Invoice {invoice?.invoiceNumber}
                                  <Badge variant="outline">
                                    {invoice?.currency}
                                  </Badge>
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  Total: {invoice?.currency === 'INR'
                                    ? formatRupees(invoice?.totalAmount || 0)
                                    : new Intl.NumberFormat('en-US', {
                                        style: 'currency',
                                        currency: invoice?.currency || 'INR',
                                      }).format(invoice?.totalAmount || 0)
                                  }
                                </p>
                              </div>
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
                            
                            <div className="flex items-center justify-between gap-4">
                              <FormField
                                control={form.control}
                                name={`invoiceLinks.${index}.invoiceId`}
                                render={({ field }) => (
                                  <FormItem className="hidden">
                                    <FormControl>
                                      <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <div className="flex-1">
                                <FormField
                                  control={form.control}
                                  name={`invoiceLinks.${index}.amountApplied`}
                                  render={({ field }) => (
                                    <FormItem className="mb-0">
                                      <div className="flex items-center gap-3">
                                        <FormLabel className="min-w-24 mb-0">Amount Applied:</FormLabel>
                                        <div className="flex-1">
                                          <FormControl>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              min="0"
                                              max={invoice?.totalAmount}
                                              {...field}
                                              onChange={(e) => {
                                                field.onChange(e);
                                                
                                                // Check if remaining amount is invalid
                                                const remaining = getRemainingAmount();
                                                if (Math.abs(remaining) < 0.01) {
                                                  // Perfect balance
                                                } else if (remaining < 0) {
                                                  toast({
                                                    title: "Warning",
                                                    description: "Applied amount exceeds total payment amount",
                                                    variant: "destructive",
                                                  });
                                                }
                                              }}
                                            />
                                          </FormControl>
                                        </div>
                                      </div>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                              
                              {/* Allocation percentage */}
                              {invoice && (
                                <div className="flex items-center text-sm">
                                  <span className={(() => {
                                    const amountApplied = parseFloat(form.getValues().invoiceLinks[index].amountApplied || '0');
                                    const totalAmount = parseFloat(invoice.totalAmount || '0');
                                    const percentage = totalAmount > 0 ? Math.min(100, (amountApplied / totalAmount) * 100) : 0;
                                    return percentage >= 99.9 ? "text-green-600 font-medium flex items-center" : "text-muted-foreground";
                                  })()}>
                                    {(() => {
                                      const amountApplied = parseFloat(form.getValues().invoiceLinks[index].amountApplied || '0');
                                      const totalAmount = parseFloat(invoice.totalAmount || '0');
                                      const percentage = totalAmount > 0 ? Math.min(100, (amountApplied / totalAmount) * 100) : 0;
                                      return percentage >= 99.9 
                                        ? <><CheckCircle className="h-4 w-4 mr-1" /> Fully allocated</>
                                        : `${percentage.toFixed(1)}% allocated`;
                                    })()}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
            
            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/finance/payments')}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createPayment.isPending || form.getValues().invoiceLinks.length === 0}
              >
                {createPayment.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Record Payment
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </Layout>
  );
}