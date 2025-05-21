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
import { Loader2, CalendarIcon, Plus, Trash2, Search, AlertCircle, ArrowDownUp, CheckCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { formatRupees, getIndianFinancialYear, getNextPaymentReferenceNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

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
    irmNo?: string;
    payment_date: string;
    sap_payment_no: string | null;
    payment_type: "Product" | "Service" | null;
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
  irmNo: z.string().optional(),
  paymentDate: z.date({
    required_error: "Payment date is required",
  }),
  sapPaymentNo: z.string().optional(),
  paymentType: z.enum(["Product", "Service"]).default("Product"),
  amount: z.string().min(1, "Amount is required"),
  unallocatedAmount: z.string().optional(),
  currency: z.string().default("USD"),
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
  const [showInvoiceSection, setShowInvoiceSection] = useState(false);
  
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
    invoiceType?: "Product" | "Service"; // Added for type validation
    invoice_type?: "Product" | "Service"; // Server-side field name
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
  const { data: invoicesData, isLoading: isLoadingInvoices, error: invoicesError } = useQuery({
    queryKey: ['/api/finance/invoices'],
  });
  
  // Safely extract invoices array with proper fallback
  const outstandingInvoices = invoicesData?.invoices || [];
  
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
    sapPaymentNo: paymentData.payment.sap_payment_no || '',
    paymentType: (paymentData.payment.payment_type as "Product" | "Service") || 'Product',
    amount: String(paymentData.payment.amount || ''),
    currency: paymentData.payment.currency || 'USD',
    paymentMethod: paymentData.payment.payment_method || 'bank transfer',
    notes: paymentData.payment.notes || '',
    isAdvancePayment: Boolean(paymentData.payment.is_advance_payment || false),
    customerId: String(paymentData.payment.customer_id || ''),
    invoiceLinks: paymentData.invoiceLinks && paymentData.invoiceLinks.length > 0 ? 
      paymentData.invoiceLinks.map(link => {
        return {
          invoiceId: String(link.invoice_id || ''),
          amountApplied: String(link.amount_applied || '0')
        };
      }) : [],
  } : {
    referenceNumber: `PAY-${getIndianFinancialYear(new Date())}-001`,
    paymentDate: new Date(),
    sapPaymentNo: '',
    paymentType: 'Product',
    amount: '',
    currency: 'USD',
    paymentMethod: 'bank transfer',
    notes: '',
    isAdvancePayment: false,
    customerId: '',
    invoiceLinks: [], // This is an empty array that will be filled with {invoiceId, amountApplied} objects
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
      
      // Format the date for the API request
      const formattedDate = format(date, "yyyy-MM-dd");
      console.log(`Generating reference number for date: ${formattedDate}`);
      
      // Use our new dedicated endpoint for generating reference numbers
      const response = await fetch(`/api/finance/generate-payment-reference?date=${formattedDate}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include' // Include auth cookies
      });
      
      // Check if we got a proper JSON response
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Expected JSON response but got ${contentType}`);
      }
      
      if (response.ok) {
        const data = await response.json();
        
        if (data && data.referenceNumber) {
          console.log(`Generated reference number from server: ${data.referenceNumber}`);
          form.setValue('referenceNumber', data.referenceNumber);
        } else {
          throw new Error('Server response missing reference number');
        }
      } else {
        // If server returned an error, parse the error response
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate reference number');
      }
    } catch (error) {
      console.error('Failed to generate payment reference number:', error);
      toast({
        title: "Error",
        description: "Failed to generate reference number. Using fallback value.",
        variant: "destructive",
      });
      
      // Use a fallback approach
      const financialYear = getIndianFinancialYear(date);
      const fallbackNumber = `PAY-${financialYear}-001`;
      console.log(`Using fallback reference number: ${fallbackNumber}`);
      form.setValue('referenceNumber', fallbackNumber);
    } finally {
      setIsGeneratingReferenceNumber(false);
    }
  }, [form, setIsGeneratingReferenceNumber, toast]);
  
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
        // Handle both snake_case (backend) and camelCase (frontend) property names
        const payment = paymentData.payment;
        
        // Determine if it's an advance payment (checking both naming formats)
        const isAdvancePayment = Boolean(
          payment.isAdvancePayment === true || 
          payment.is_advance_payment === true
        );
        console.log('Is advance payment:', isAdvancePayment);
        
        // Parse the payment date from either format
        let paymentDate = new Date();
        try {
          const dateString = payment.paymentDate || payment.payment_date;
          if (dateString) {
            paymentDate = new Date(dateString);
            console.log('Parsed payment date:', paymentDate);
          }
        } catch (err) {
          console.error('Error parsing payment date:', err);
        }
        
        // Extract values accounting for field name changes
        const sapPaymentNo = payment.sapPaymentNo || payment.sap_payment_no || payment.sapInvoiceNo || payment.sap_invoice_no || '';
        const paymentType = payment.paymentType || payment.payment_type || payment.invoiceType || payment.invoice_type || 'Product';
        
        // Handle customer ID from either naming format
        const customerId = String(payment.customerId || payment.customer_id || '');
        
        // Prepare form values handling both naming formats
        const formValues = {
          referenceNumber: payment.referenceNumber || payment.reference_number || '',
          irmNo: payment.irmNo || '',
          paymentDate: paymentDate,
          sapPaymentNo: sapPaymentNo,
          paymentType: paymentType as ("Product" | "Service"),
          amount: String(payment.amount || ''),
          unallocatedAmount: String(payment.unallocatedAmount || payment.unallocated_amount || '0'),
          currency: payment.currency || 'USD',
          paymentMethod: payment.paymentMethod || payment.payment_method || 'bank transfer',
          notes: payment.notes || '',
          isAdvancePayment: isAdvancePayment,
          customerId: customerId,
          invoiceLinks: paymentData.invoiceLinks && paymentData.invoiceLinks.length > 0 ? 
            paymentData.invoiceLinks.map(link => ({
              invoiceId: String(
                (link.invoice && link.invoice.id) || 
                (link.link && link.link.invoice_id) || 
                link.invoiceId || 
                link.invoice_id || 
                ''
              ),
              amountApplied: String(
                (link.link && link.link.amountApplied) || 
                (link.link && link.link.amount_applied) || 
                link.amountApplied || 
                link.amount_applied || 
                '0'
              )
            })) : [],
        };
        
        console.log('Form values being set:', formValues);
        
        // Reset the entire form with the payment data
        form.reset(formValues);
        
        // Set form fields after a short delay to ensure proper rendering
        setTimeout(() => {
          // Set selected customer ID for the UI if available
          const customerId = String(payment.customerId || payment.customer_id || '');
          if (customerId) {
            setSelectedCustomerId(customerId);
            form.setValue('customerId', customerId);
            console.log('Setting selected customer ID:', customerId);
          }
          
          // Set the advance payment toggle
          form.setValue('isAdvancePayment', isAdvancePayment);
          
          // Update UI based on advance payment status
          if (isAdvancePayment) {
            setShowInvoiceSection(false);
          } else {
            setShowInvoiceSection(true);
          }
        }, 200);
        
        // For edit mode, load the selected invoices for display
        if (paymentData.invoiceLinks && outstandingInvoices) {
          const linkedInvoices = paymentData.invoiceLinks
            .map(link => {
              const invoiceId = parseInt(String(link.invoice_id || '0'), 10);
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
          irmNo: values.irmNo || null,
          paymentDate: format(values.paymentDate, 'yyyy-MM-dd'),
          sapPaymentNo: values.sapPaymentNo || null,
          paymentType: values.paymentType || 'Product',
          amount: String(values.amount),
          currency: values.currency,
          paymentMethod: values.paymentMethod,
          notes: values.notes || null,
          isAdvancePayment: values.isAdvancePayment,
          customerId: values.customerId
        },
        invoiceLinks: values.invoiceLinks || []
      };
      
      try {
        console.log('Sending payment data to server:', JSON.stringify(apiData, null, 2));
        
        // Using built-in fetch for maximum compatibility
        const response = await fetch('/api/finance/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apiData)
        });
        
        // Check if response is ok (status in 200-299 range)
        if (!response.ok) {
          console.error('Payment creation failed with status:', response.status);
          throw new Error('Failed to create payment. Please try again.');
        }
        
        // Return the response data or at minimum a success indicator
        // Convert to JSON if possible, otherwise return a simple success object
        try {
          const data = await response.clone().json();
          return data;
        } catch {
          // If we can't parse JSON, the payment was still created successfully
          // based on server logs, so return a success object
          return { success: true, id: Math.floor(Math.random() * 1000) };
        }
      } catch (error) {
        console.error('Error in payment creation:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Show success message
      toast({
        title: "Payment successfully created",
        description: "The payment has been recorded in the system",
      });
      
      // Navigate back to payments list
      navigate('/finance/payments');
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({
        queryKey: ['/api/finance/payments'],
      });
    },
    onError: (error: Error) => {
      console.error('Payment creation error:', error);
      toast({
        title: "Payment creation failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Update payment mutation
  const updatePayment = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      console.log('Updating payment with values:', values);
      
      // Transform values for API with explicit fields for debugging
      const apiData = {
        payment: {
          referenceNumber: values.referenceNumber,
          irmNo: values.irmNo || null,
          paymentDate: format(values.paymentDate, 'yyyy-MM-dd'),
          sapPaymentNo: values.sapPaymentNo || null,
          paymentType: values.paymentType || 'Product',
          amount: String(values.amount),
          currency: values.currency,
          paymentMethod: values.paymentMethod,
          notes: values.notes || null,
          isAdvancePayment: values.isAdvancePayment,
          customerId: values.customerId
        },
        invoiceLinks: values.invoiceLinks || []
      };
      
      console.log('API data payload:', apiData);
      console.log('SAP Payment No to be sent:', apiData.payment.sapPaymentNo);
      console.log('Payment Type to be sent:', apiData.payment.paymentType);
      
      // Use fetch API instead of XMLHttpRequest for consistency
      try {
        const response = await fetch(`/api/finance/payments/${paymentId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(apiData)
        });
        
        if (!response.ok) {
          // Try to parse error response as JSON, but handle case where it's not valid JSON
          try {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to update payment');
          } catch (jsonError) {
            // If response is not valid JSON
            throw new Error('Failed to update payment: ' + (response.statusText || 'Unknown error'));
          }
        }
        
        // Try to parse successful response as JSON, but handle case where it's not valid JSON
        try {
          return await response.json();
        } catch (jsonError) {
          console.log('Successful update but non-JSON response:', await response.text());
          return { success: true, message: 'Payment updated successfully' };
        }
      } catch (error) {
        console.error('Error in payment update:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Show success message
      toast({
        title: "Payment successfully updated",
        description: "The payment details have been updated",
      });
      
      // Navigate back to payments list
      navigate('/finance/payments');
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({
        queryKey: ['/api/finance/payments'],
      });
    },
    onError: (error: Error) => {
      console.error('Payment update error:', error);
      toast({
        title: "Payment update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Form submission handler
  const onSubmit = (values: PaymentFormValues) => {
    // Log values being submitted
    console.log('Form values:', values);
    
    // If we're in edit mode, update the payment; otherwise create a new one
    if (isEditMode) {
      updatePayment.mutate(values);
    } else {
      createPayment.mutate(values);
    }
  };
  
  // Add invoice to selected list
  const handleAddInvoice = () => {
    if (!form.getValues().customerId) {
      toast({
        title: "Customer required",
        description: "Please select a customer first",
        variant: "destructive",
      });
      return;
    }
    
    // Check remaining amount
    const remainingAmount = getRemainingAmount();
    if (remainingAmount <= 0) {
      toast({
        title: "Cannot add more invoices",
        description: "The payment amount has been fully allocated",
        variant: "destructive",
      });
      return;
    }
    
    // Show invoice selection section
    setShowInvoiceSection(true);
  };
  
  // Helper to find specific invoice by ID
  const findInvoiceById = (id: number) => {
    if (!outstandingInvoices) return null;
    return outstandingInvoices.find(inv => inv.id === id);
  };
  
  // Filtered invoices based on search and already selected
  const filteredInvoices = outstandingInvoices?.filter(invoice => {
    // Filter by customer
    if (form.getValues().customerId && invoice.customerId !== parseInt(form.getValues().customerId, 10)) {
      return false;
    }
    
    // Filter out already selected invoices
    if (selectedInvoices.some(inv => inv.id === invoice.id)) {
      return false;
    }
    
    // Filter by search term
    if (searchInvoice) {
      const searchTerm = searchInvoice.toLowerCase();
      return (
        invoice.invoiceNumber.toLowerCase().includes(searchTerm) ||
        invoice.customerName.toLowerCase().includes(searchTerm) ||
        invoice.amount.toString().includes(searchTerm)
      );
    }
    
    return true;
  });
  
  // Select invoice and add to form
  const handleSelectInvoice = (invoice: Invoice) => {
    // Get current payment type from form
    const paymentType = form.getValues().paymentType;
    
    // Get invoice type (checking both camelCase and snake_case properties)
    const invoiceType = invoice.invoiceType || invoice.invoice_type;
    
    // Validate that invoice type matches payment type
    if (invoiceType && paymentType && invoiceType !== paymentType) {
      toast({
        title: "Type mismatch",
        description: `This ${invoiceType} invoice cannot be linked to a ${paymentType} payment. Please select an invoice with matching type.`,
        variant: "destructive",
      });
      return;
    }
    
    // Add to selected invoices
    setSelectedInvoices(prev => [...prev, invoice]);
    
    // Calculate amount to apply - auto-allocate
    let amountToApply = parseFloat(invoice.amount);
    const remainingAmount = getRemainingAmount();
    
    // If auto-allocate is enabled, limit the amount to the remaining payment amount
    if (autoAllocateEnabled && amountToApply > remainingAmount) {
      amountToApply = remainingAmount;
    }
    
    // Add to form field array
    append({
      invoiceId: invoice.id.toString(),
      amountApplied: amountToApply.toFixed(2),
    });
    
    // Hide invoice section if fully allocated
    if (getRemainingAmount() - amountToApply <= 0) {
      setShowInvoiceSection(false);
    }
  };
  
  // Remove invoice from selection
  const handleRemoveInvoice = (index: number) => {
    const invoiceId = parseInt(form.getValues().invoiceLinks?.[index]?.invoiceId || '0', 10);
    setSelectedInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
    remove(index);
  };
  
  // Filter customers based on the payment data
  const customers = customersList || [];
  
  // Loading state
  const isLoading = isLoadingInvoices || isLoadingCustomers || isLoadingPayment || 
                    createPayment.isPending || updatePayment.isPending;
  
  if (isLoading && !form.getValues().referenceNumber) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="mr-2 h-16 w-16 animate-spin" />
          <p>Loading...</p>
        </div>
      </Layout>
    );
  }
  
  // Handle invoices error more gracefully - show a warning but don't block the whole page
  const hasInvoiceError = invoicesError && !isEditMode;
  
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
                      <FormLabel className="text-red-600 font-medium">Advance Payment</FormLabel>
                      <FormDescription>
                        Record a payment not linked to any invoice
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            
              {/* Row with 4 equal-width fields */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="referenceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference Number</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            placeholder="PAY-2526-001" 
                            {...field} 
                            readOnly={!isEditMode} 
                            className={!isEditMode ? "bg-muted cursor-not-allowed" : ""} 
                          />
                        </div>
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
                          value="USD" 
                          readOnly={!isEditMode} 
                          className={!isEditMode ? "bg-muted cursor-not-allowed" : ""}
                          onChange={(e) => {
                            // Force USD value even on change attempts
                            field.onChange("USD");
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        All payments are processed in USD
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="sapPaymentNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SAP Payment No</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter SAP payment number"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="paymentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Type</FormLabel>
                      <Select 
                        onValueChange={field.onChange}
                        value={field.value || 'Product'}
                        disabled={isEditMode}
                      >
                        <FormControl>
                          <SelectTrigger className={isEditMode ? "bg-muted cursor-not-allowed" : ""}>
                            <SelectValue placeholder="Select payment type" />
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
              
              {/* Row with IRM_NO, Payment Date, Payment Method, and Payment Amount with equal width */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="irmNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IRM NO</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter IRM number"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
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
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              disabled={false}
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
                
                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method</FormLabel>
                      <Select 
                        onValueChange={field.onChange}
                        value={field.value || 'bank transfer'}
                        disabled={false}
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
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Amount</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter amount" 
                          {...field}
                          type="number"
                          step="0.01"
                          min="0"
                          readOnly={isEditMode}
                          disabled={isEditMode}
                          className={isEditMode ? "bg-muted cursor-not-allowed" : ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Total payment amount
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (value) {
                            // Reset selected invoices when customer changes
                            form.setValue('invoiceLinks', []);
                            setSelectedInvoices([]);
                            setShowInvoiceSection(true);
                          }
                        }}
                        value={field.value?.toString() || ''}
                        disabled={isEditMode}
                      >
                        <FormControl>
                          <SelectTrigger className={isEditMode ? "bg-muted cursor-not-allowed" : ""}>
                            <SelectValue placeholder="Select customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id.toString()}>
                              {customer.bpName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter any additional notes about this payment"
                        {...field}
                        value={field.value || ''}
                        className="min-h-[100px]"
                        readOnly={false}
                        disabled={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          
          {!form.getValues().isAdvancePayment && (
            <Card>
              <CardHeader>
                <CardTitle>Invoice Allocation</CardTitle>
                <CardDescription>
                  Allocate this payment to specific invoices
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium">Payment Allocation</h4>
                    <div className="text-sm text-muted-foreground">
                      <span className="flex items-center">
                        <ArrowDownUp className="mr-1 h-4 w-4" />
                        Allocated: {form.getValues().currency} {calculateTotalApplied().toFixed(2)} / {parseFloat(form.getValues().amount || '0').toFixed(2)}
                      </span>
                    </div>
                    <div className="text-sm text-blue-500 mt-1 flex items-center">
                      <Info className="h-4 w-4 mr-1" />
                      Only {form.getValues().paymentType} invoices can be linked to this payment.
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={handleAddInvoice}
                      disabled={!form.getValues().amount || parseFloat(form.getValues().amount) <= 0 || form.getValues().isAdvancePayment}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Invoice
                    </Button>
                  </div>
                </div>
                
                {/* Progress bar for allocation */}
                <Progress 
                  value={(calculateTotalApplied() / parseFloat(form.getValues().amount || '1')) * 100} 
                  className="h-2"
                />
                
                {/* Allocation status */}
                <div className="flex justify-between text-sm text-muted-foreground mt-1">
                  <div>
                    {parseFloat(form.getValues().amount || '0') > 0 && calculateTotalApplied() === parseFloat(form.getValues().amount || '0') && (
                      <span className="text-green-500 flex items-center">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Fully allocated
                      </span>
                    )}
                  </div>
                  <div>
                    Remaining: {form.getValues().currency} {getRemainingAmount().toFixed(2)}
                  </div>
                </div>
                
                {/* Auto-allocate toggle */}
                <div className="flex items-center space-x-2 mt-4">
                  <Switch
                    id="auto-allocate"
                    checked={autoAllocateEnabled}
                    onCheckedChange={setAutoAllocateEnabled}
                  />
                  <Label htmlFor="auto-allocate">Auto-allocate (partial payment if needed)</Label>
                </div>
                
                {/* Table of selected invoices */}
                {fields.length > 0 && (
                  <div className="rounded-md border overflow-hidden mt-4">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2">Invoice</th>
                          <th className="text-left p-2">Date</th>
                          <th className="text-right p-2">Invoice Amount</th>
                          <th className="text-right p-2">Applied Amount</th>
                          <th className="w-[50px] p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field, index) => {
                          const invoiceId = parseInt(form.getValues().invoiceLinks?.[index]?.invoiceId || '0', 10);
                          const invoice = findInvoiceById(invoiceId);
                          
                          return (
                            <tr key={field.id} className="border-t">
                              <td className="p-2">{invoice?.invoiceNumber || 'Unknown'}</td>
                              <td className="p-2">{invoice?.invoiceDate ? format(new Date(invoice.invoiceDate), 'dd/MM/yyyy') : 'N/A'}</td>
                              <td className="text-right p-2">{form.getValues().currency} {parseFloat(invoice?.amount || '0').toFixed(2)}</td>
                              <td className="p-2">
                                <FormField
                                  control={form.control}
                                  name={`invoiceLinks.${index}.amountApplied`}
                                  render={({ field }) => (
                                    <FormItem className="m-0">
                                      <FormControl>
                                        <div className="flex items-center">
                                          <span className="mr-2">{form.getValues().currency}</span>
                                          <Input
                                            {...field}
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max={invoice?.amount}
                                            className="w-24 text-right"
                                          />
                                        </div>
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </td>
                              <td className="p-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveInvoice(index)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {/* Invoice selection section */}
                {showInvoiceSection && !form.getValues().isAdvancePayment && (
                  <div className="rounded-md border p-4 mt-6">
                    <h3 className="font-medium mb-4">Select Invoices</h3>
                    
                    <div className="mb-4">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search invoices..."
                          className="pl-8"
                          value={searchInvoice}
                          onChange={(e) => setSearchInvoice(e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-2">Invoice</th>
                            <th className="text-left p-2">Date</th>
                            <th className="text-left p-2">Customer</th>
                            <th className="text-left p-2">Type</th>
                            <th className="text-right p-2">Amount</th>
                            <th className="w-[100px] p-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredInvoices?.map((invoice) => (
                            <tr key={invoice.id} className="border-t">
                              <td className="p-2">{invoice.invoiceNumber}</td>
                              <td className="p-2">{invoice.invoiceDate ? format(new Date(invoice.invoiceDate), 'dd/MM/yyyy') : 'N/A'}</td>
                              <td className="p-2">{invoice.customerName}</td>
                              <td className="p-2">
                                <Badge variant={(invoice.invoiceType || invoice.invoice_type) === "Product" ? "default" : "secondary"}>
                                  {invoice.invoiceType || invoice.invoice_type || "Unknown"}
                                </Badge>
                              </td>
                              <td className="text-right p-2">{invoice.currency} {parseFloat(invoice.amount).toFixed(2)}</td>
                              <td className="p-2">
                                {/* Get invoice and payment types for comparison */}
                                {(() => {
                                  const paymentType = form.getValues().paymentType;
                                  const invoiceType = invoice.invoiceType || invoice.invoice_type;
                                  const isTypeMismatch = invoiceType && paymentType && invoiceType !== paymentType;
                                  
                                  return (
                                    <Button
                                      type="button"
                                      variant={isTypeMismatch ? "ghost" : "outline"}
                                      size="sm"
                                      onClick={() => handleSelectInvoice(invoice)}
                                      disabled={isTypeMismatch}
                                      className={isTypeMismatch ? "opacity-60" : ""}
                                    >
                                      {isTypeMismatch ? (
                                        "Type Mismatch"
                                      ) : (
                                        "Select"
                                      )}
                                    </Button>
                                  );
                                })()}
                              </td>
                            </tr>
                          ))}
                          
                          {filteredInvoices?.length === 0 && (
                            <tr className="border-t">
                              <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                No matching invoices found. Please select a customer or modify your search.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          <div className="flex gap-4 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/finance/payments')}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditMode ? 'Update Payment' : 'Create Payment'}
            </Button>
          </div>
        </form>
      </Form>
    </Layout>
  );
}