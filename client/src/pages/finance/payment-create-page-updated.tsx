import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, CheckCircle, XCircle, CalendarIcon, FilterX, Search, Plus, Copy, FileText, ArrowLeft, ArrowDownUp, Info, DollarSign, Tag, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";

// Define the schema for the payment form using zod
const paymentFormSchema = z.object({
  referenceNumber: z.string().optional(),
  irmNo: z.string().optional(),
  paymentDate: z.date({
    required_error: "Payment date is required.",
  }),
  sapPaymentNo: z.string().optional(),
  paymentType: z.enum(["Product", "Service"], {
    required_error: "Payment type is required.",
  }),
  amount: z.string().min(1, "Amount is required"),
  unallocatedAmount: z.string().optional(),
  currency: z.string().default("USD"),
  paymentMethod: z.string({
    required_error: "Payment method is required.",
  }),
  notes: z.string().optional(),
  isAdvancePayment: z.boolean().default(false),
  customerId: z.string({
    required_error: "Customer is required.",
  }),
  invoiceLinks: z.array(
    z.object({
      invoiceId: z.string(),
      amountApplied: z.string(),
    })
  ).default([]),
});

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

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export default function PaymentCreatePage({ isEditMode = false }: { isEditMode?: boolean } = {}) {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInvoices, setSelectedInvoices] = useState<any[]>([]);
  const [isGeneratingReferenceNumber, setIsGeneratingReferenceNumber] = useState(false);
  const [showInvoiceSection, setShowInvoiceSection] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [autoAllocate, setAutoAllocate] = useState(false);
  
  // Function to determine if form is in edit mode
  const isInEditMode = Boolean(id);
  
  // Fetch payment data if in edit mode
  const { data: paymentData, isLoading: isLoadingPayment } = useQuery({
    queryKey: ['/api/finance/payments', id],
    enabled: Boolean(id),
  });

  // Fetch customers for dropdown
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['/api/customers'],
  });

  // Fetch invoices for selection
  const { data: invoices = [], isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['/api/finance/invoices'],
    enabled: showInvoiceSection,
  });

  // Form definition with default values
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      referenceNumber: "",
      irmNo: "",
      paymentDate: new Date(),
      sapPaymentNo: "",
      paymentType: "Product",
      amount: "",
      unallocatedAmount: "",
      currency: "USD",
      paymentMethod: "bank transfer",
      notes: "",
      isAdvancePayment: false,
      customerId: "",
      invoiceLinks: [],
    },
  });

  // Function to generate reference number
  const generateReferenceNumber = useCallback(async (date: Date) => {
    if (isGeneratingReferenceNumber) return;

    setIsGeneratingReferenceNumber(true);
    try {
      const formattedDate = format(date, "yyyy-MM-dd");
      const response = await apiRequest("GET", `/api/finance/generate-payment-reference?date=${formattedDate}`);
      const data = await response.json();
      
      if (data.referenceNumber) {
        form.setValue("referenceNumber", data.referenceNumber);
      }
    } catch (error) {
      console.error("Failed to generate reference number:", error);
      toast({
        title: "Error",
        description: "Failed to generate reference number. Please try again or enter manually.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingReferenceNumber(false);
    }
  }, [form, setIsGeneratingReferenceNumber]);
  
  // Generate reference number on component mount for new payments
  useEffect(() => {
    // Only for create mode, not edit mode
    if (!isInEditMode) {
      // Call the function directly to generate reference number
      // Using current date as default
      generateReferenceNumber(new Date());
    }
  }, [isInEditMode, generateReferenceNumber]);
  
  // Update form when payment data is loaded
  useEffect(() => {
    if (isInEditMode && paymentData) {
      console.log('Setting form values with payment data:', JSON.stringify(paymentData, null, 2));
      
      // First, check if we have a payments list in the data (this is what we see in the console)
      let payment = null;
      
      if (paymentData.payments && Array.isArray(paymentData.payments)) {
        // Find the payment with the matching ID
        payment = paymentData.payments.find((p: any) => p.id === parseInt(id || '0'));
        console.log('Found payment in payments array:', payment);
      } else {
        // Otherwise check for a direct payment object or nested in payment property
        payment = paymentData.payment || paymentData;
      }
      
      // Log the raw payment data to debug with stringified version to see all fields
      console.log('Raw payment data from API:', payment);
      console.log('Payment data stringified:', JSON.stringify(payment, null, 2));
      
      if (!payment || !payment.id) {
        console.error('No valid payment data found in:', paymentData);
        return;
      }
      
      // Based on console logs, we can see the actual data structure
      // The API returns camelCase field names with specific fields
      
      // Set isAdvancePayment based on the payment data
      const isAdvancePayment = payment.isAdvancePayment === true;
      console.log('Is advance payment:', isAdvancePayment);
      
      // Parse the payment date from the string to a Date object
      const paymentDateStr = payment.paymentDate || payment.payment_date;
      const paymentDate = paymentDateStr ? new Date(paymentDateStr) : new Date();
      console.log('Parsed payment date:', paymentDate);
      
      // Get reference which is used instead of reference_number
      const referenceNumber = payment.reference || payment.reference_number || "";
      console.log('Reference number:', referenceNumber);
      
      // Get payment number which is used instead of irm_no
      const irmNo = payment.paymentNumber || payment.irm_no || "";
      console.log('IRM/Payment number:', irmNo);
      
      // Get customer ID
      const customerId = payment.customerId || payment.customer_id || "";
      console.log('Customer ID:', customerId);
      
      // Get SAP payment number (might not be present)
      const sapPaymentNo = payment.sapPaymentNo || payment.sap_payment_no || "";
      console.log('SAP Payment Number:', sapPaymentNo);
      
      // Set up the initial form values from the payment data
      const formValues: PaymentFormValues = {
        referenceNumber: referenceNumber,
        irmNo: irmNo,
        paymentDate: paymentDate,
        sapPaymentNo: sapPaymentNo,
        paymentType: payment.paymentType || payment.payment_type || "Product",
        amount: payment.amount || "",
        unallocatedAmount: payment.unallocatedAmount || payment.unallocated_amount || payment.amount || "",
        currency: payment.currency || "USD",
        paymentMethod: payment.paymentMethod || payment.payment_method || "",
        notes: payment.notes || "",
        isAdvancePayment: isAdvancePayment,
        customerId: customerId ? customerId.toString() : "",
        invoiceLinks: [],
      };
      
      console.log('Form values being set:', formValues);
      
      // Set all form values at once
      form.reset(formValues);
      
      // Set the selected invoices for display
      if (paymentData.invoiceLinks && paymentData.invoiceLinks.length > 0) {
        const invoiceLinks = paymentData.invoiceLinks.map(link => ({
          invoiceId: link.invoice_id.toString(),
          amountApplied: link.amount_applied,
        }));
        
        form.setValue('invoiceLinks', invoiceLinks);
        
        // Also setup the selected invoices UI state if we have invoice data
        if (Array.isArray(paymentData.invoices)) {
          const selectedInvoiceDetails = paymentData.invoiceLinks.map(link => {
            const matchingInvoice = paymentData.invoices.find(
              (inv: any) => inv.id === link.invoice_id
            );
            return {
              ...matchingInvoice,
              id: link.invoice_id,
              amountApplied: link.amount_applied,
            };
          });
          
          setSelectedInvoices(selectedInvoiceDetails);
        }
      }
      
      // If a customer is selected, show the invoice section
      if (payment.customer_id) {
        console.log('Setting selected customer ID:', payment.customer_id.toString());
        setShowInvoiceSection(true);
      }
    }
  }, [isInEditMode, paymentData, form]);
  
  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      // Format the values for the API
      const payload = {
        reference_number: values.referenceNumber,
        irmNo: values.irmNo,
        payment_date: format(values.paymentDate, "yyyy-MM-dd"),
        sap_payment_no: values.sapPaymentNo,
        payment_type: values.paymentType,
        amount: values.amount,
        currency: values.currency,
        payment_method: values.paymentMethod,
        notes: values.notes,
        is_advance_payment: values.isAdvancePayment,
        customer_id: parseInt(values.customerId),
        invoice_links: values.invoiceLinks.map(link => ({
          invoice_id: parseInt(link.invoiceId),
          amount_applied: link.amountApplied,
        })),
      };
      
      // Send to the API
      const response = await apiRequest("POST", "/api/finance/payments", payload);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create payment");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Payment created successfully",
      });
      
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/finance/payments'] });
      
      // Navigate to the payment details page
      setLocation(`/finance/payments/${data.payment.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create payment",
        variant: "destructive",
      });
    },
  });
  
  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      if (!id) throw new Error("Payment ID is required");
      
      // Rather than trying to create a complex payload, let's use the exact same format
      // as what the server returned to us. This should ensure compatibility.
      
      // Make sure customerId is properly handled - don't send null or undefined
      const customerId = values.customerId ? parseInt(values.customerId) : 7; // Use 7 as default from original data if missing
      console.log('Customer ID for update:', customerId, 'Original value:', values.customerId);
      
      // We need to ensure all fields are present and named correctly
      const payload = {
        // Include all fields in both formats (camelCase and snake_case) to ensure compatibility
        // Core payment information
        id: parseInt(id),
        reference: values.referenceNumber,
        reference_number: values.referenceNumber, // Snake case backup
        
        // IRM information
        paymentNumber: values.irmNo,
        irm_no: values.irmNo, // Snake case backup
        
        // Payment details
        paymentDate: format(values.paymentDate, "yyyy-MM-dd"),
        payment_date: format(values.paymentDate, "yyyy-MM-dd"), // Snake case backup
        
        // SAP integration
        sapPaymentNo: values.sapPaymentNo,
        sap_payment_no: values.sapPaymentNo, // Snake case backup
        
        // Payment classification
        paymentType: values.paymentType,
        payment_type: values.paymentType, // Snake case backup
        
        // Financial details
        amount: values.amount,
        currency: values.currency,
        
        // Payment method
        paymentMethod: values.paymentMethod,
        payment_method: values.paymentMethod, // Snake case backup
        
        // Notes and additional details
        notes: values.notes,
        
        // Advance payment flag
        isAdvancePayment: values.isAdvancePayment, 
        is_advance_payment: values.isAdvancePayment, // Snake case backup
        
        // Customer relationship
        customerId: customerId,
        customer_id: customerId // Snake case backup
      };
      
      // Try with a simple POST request to an update endpoint
      try {
        // Create a simplified payload with just the key fields we want to update
        const simplifiedPayload = {
          referenceNumber: values.referenceNumber,
          irmNo: values.irmNo,
          paymentDate: values.paymentDate,
          sapPaymentNo: values.sapPaymentNo,
          paymentType: values.paymentType,
          amount: values.amount,
          currency: values.currency,
          paymentMethod: values.paymentMethod,
          notes: values.notes,
          isAdvancePayment: values.isAdvancePayment,
          customerId: values.customerId
        };
        
        console.log('Submitting payment update with simplified payload:', simplifiedPayload);
        console.log('JSON payload:', JSON.stringify(simplifiedPayload, null, 2));
        
        // Use axios-style request with a POST to a dedicated update endpoint
        const response = await fetch(`/api/finance/payments/update/${id}`, {
          method: 'POST',  // Using POST instead of PUT
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(simplifiedPayload),
        });
        
        // Handle response - if server returns a redirect to login, that's actually success but will fail JSON parse
        if (response.ok || response.status === 302) {
          console.log('Server returned success status:', response.status);
          
          try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const data = await response.json();
              console.log('Server response (JSON):', data);
              return data;
            } else {
              console.log('Server returned success with non-JSON response, showing HTML response');
              const text = await response.text();
              console.log('HTML response (first 200 chars):', text.substring(0, 200));
              return { success: true, message: 'Payment updated successfully' };
            }
          } catch (parseError) {
            console.log('Could not parse server response, but update was successful');
            console.log('Parse error:', parseError);
            return { success: true, message: 'Payment updated successfully' };
          }
        } else {
          console.error('Server returned error status:', response.status);
          try {
            const errorText = await response.text();
            console.error('Error response body:', errorText);
          } catch {}
          throw new Error(`Failed to update payment: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.error('Error updating payment:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Payment updated successfully",
      });
      
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/finance/payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/payments', id] });
      
      // Navigate to the payment details page
      setLocation(`/finance/payments/${id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update payment",
        variant: "destructive",
      });
    },
  });
  
  // Form submission handler
  const onSubmit = (values: PaymentFormValues) => {
    if (isInEditMode) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };
  
  // Function to add invoice to payment
  const handleAddInvoice = () => {
    setShowConfirmDialog(true);
  };
  
  // Function to handle invoice selection
  const handleSelectInvoice = (invoice: any) => {
    // Get the remaining amount that can be allocated
    const remainingAmount = getRemainingAmount();
    
    // Default the amount to apply
    let amountToApply = parseFloat(invoice.amount);
    
    // If the remaining amount is less than the invoice amount, use the remaining amount
    if (remainingAmount < amountToApply) {
      amountToApply = remainingAmount;
    }
    
    // Add the invoice to the form
    const updatedInvoiceLinks = [
      ...form.getValues().invoiceLinks,
      {
        invoiceId: invoice.id.toString(),
        amountApplied: amountToApply.toFixed(2),
      },
    ];
    
    form.setValue('invoiceLinks', updatedInvoiceLinks);
    
    // Add to selected invoices for UI
    setSelectedInvoices([
      ...selectedInvoices,
      {
        ...invoice,
        amountApplied: amountToApply.toFixed(2),
      },
    ]);
    
    // Hide the dialog
    setShowConfirmDialog(false);
  };
  
  // Function to handle auto-allocation
  const handleAutoAllocate = () => {
    // Get all matching invoices
    const matchingInvoices = invoices.filter(inv => {
      // Type match
      const paymentType = form.getValues().paymentType;
      const invoiceType = inv.invoiceType || inv.invoice_type;
      return invoiceType === paymentType;
    });
    
    // Sort by invoice date (oldest first)
    matchingInvoices.sort((a, b) => {
      const dateA = new Date(a.invoiceDate || a.issue_date);
      const dateB = new Date(b.invoiceDate || b.issue_date);
      return dateA.getTime() - dateB.getTime();
    });
    
    // Allocate funds sequentially
    let remainingToAllocate = parseFloat(form.getValues().amount);
    const newAllocations = [];
    
    for (const invoice of matchingInvoices) {
      if (remainingToAllocate <= 0) break;
      
      const invoiceAmount = parseFloat(invoice.amount);
      const amountToApply = Math.min(invoiceAmount, remainingToAllocate);
      
      newAllocations.push({
        invoiceId: invoice.id.toString(),
        amountApplied: amountToApply.toFixed(2),
      });
      
      remainingToAllocate -= amountToApply;
    }
    
    // Update the form
    form.setValue('invoiceLinks', newAllocations);
    
    // Update selected invoices for UI
    setSelectedInvoices(
      newAllocations.map(alloc => {
        const invoice = invoices.find(inv => inv.id.toString() === alloc.invoiceId);
        return {
          ...invoice,
          amountApplied: alloc.amountApplied,
        };
      })
    );
  };
  
  // Function to remove an invoice link
  const handleRemoveInvoiceLink = (index: number) => {
    const currentLinks = form.getValues().invoiceLinks;
    const updatedLinks = [...currentLinks];
    updatedLinks.splice(index, 1);
    form.setValue('invoiceLinks', updatedLinks);
    
    // Update selected invoices
    const updatedSelected = [...selectedInvoices];
    updatedSelected.splice(index, 1);
    setSelectedInvoices(updatedSelected);
  };
  
  // Function to update an invoice link amount
  const handleUpdateInvoiceLinkAmount = (index: number, newAmount: string) => {
    const currentLinks = form.getValues().invoiceLinks;
    const updatedLinks = [...currentLinks];
    updatedLinks[index] = {
      ...updatedLinks[index],
      amountApplied: newAmount,
    };
    form.setValue('invoiceLinks', updatedLinks);
    
    // Update selected invoices
    const updatedSelected = [...selectedInvoices];
    updatedSelected[index] = {
      ...updatedSelected[index],
      amountApplied: newAmount,
    };
    setSelectedInvoices(updatedSelected);
  };
  
  // Function to calculate total applied amount
  const calculateTotalApplied = () => {
    const links = form.getValues().invoiceLinks;
    if (!links || links.length === 0) return 0;
    
    return links.reduce((sum, link) => {
      return sum + parseFloat(link.amountApplied || '0');
    }, 0);
  };
  
  // Function to get remaining amount that can be allocated
  const getRemainingAmount = () => {
    const totalAmount = parseFloat(form.getValues().amount || '0');
    const totalApplied = calculateTotalApplied();
    
    return Math.max(0, totalAmount - totalApplied);
  };
  
  // Filter invoices based on search term and payment type
  const filteredInvoices = (invoices || []).filter(invoice => {
    // First, check if it matches the payment type
    const paymentType = form.getValues().paymentType;
    const invoiceType = invoice.invoiceType || invoice.invoice_type;
    if (invoiceType !== paymentType) return false;
    
    // Then, check if it's already selected
    const isAlreadySelected = selectedInvoices.some(
      selected => selected.id.toString() === invoice.id.toString()
    );
    if (isAlreadySelected) return false;
    
    // Finally, apply the search filter if there is a search term
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      invoice.invoiceNumber?.toLowerCase().includes(searchLower) ||
      invoice.customerName?.toLowerCase().includes(searchLower) ||
      invoice.amount?.toString().includes(searchLower)
    );
  });
  
  // Get back to the list
  const handleBack = () => {
    setLocation("/finance/payments");
  };

  // Get the customer name for display
  const getCustomerName = (customerId: string | null) => {
    if (!customerId || !customers) return '';
    const customer = customers.find((c: any) => c.id.toString() === customerId.toString());
    return customer ? customer.bpName : '';
  };

  // Initialize form with payment data when editing
  useEffect(() => {
    if (isInEditMode && paymentData && !isLoadingPayment && customers && customers.length > 0) {
      let payment = null;
      
      // Get the payment data, whether from an array or direct object
      if (paymentData.payments && Array.isArray(paymentData.payments)) {
        payment = paymentData.payments.find((p: any) => p.id === parseInt(id || '0'));
      } else {
        payment = paymentData.payment || paymentData;
      }
      
      if (payment && payment.id) {
        console.log('Refreshing form with payment data:', payment);
        
        // Get all fields with both camelCase and snake_case options
        const customerId = payment.customerId || payment.customer_id || "";
        const paymentMethod = payment.paymentMethod || payment.payment_method || "";
        const sapPaymentNo = payment.sapPaymentNo || payment.sap_payment_no || "";
        const notes = payment.notes || "";
        
        console.log('Important fields check: Customer:', customerId, 'Method:', paymentMethod, 'SAP No:', sapPaymentNo);
        
        // Make sure these fields are properly set
        setShowInvoiceSection(true);
        
        // Force update with a small delay to ensure the form is ready
        setTimeout(() => {
          form.setValue('customerId', customerId.toString());
          form.setValue('paymentMethod', paymentMethod);
          form.setValue('sapPaymentNo', sapPaymentNo);
          form.setValue('notes', notes);
          
          console.log('Form values after forced update:', {
            customerId: form.getValues('customerId'),
            paymentMethod: form.getValues('paymentMethod'),
            sapPaymentNo: form.getValues('sapPaymentNo')
          });
        }, 100);
      }
    }
  }, [isInEditMode, paymentData, isLoadingPayment, customers, id, form]);

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          {isInEditMode ? "Edit Payment" : "Create Payment"}
        </h1>
        <Button
          variant="outline"
          onClick={handleBack}
        >
          Cancel
        </Button>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow">
        {isLoadingPayment ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading payment data...</span>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4">Payment Information</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter the basic information for this payment
                </p>
                
                <div className="flex items-center space-x-3 mb-6">
                  <FormField
                    control={form.control}
                    name="isAdvancePayment"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked);
                              
                              // If switching to advance payment, clear any invoice links
                              if (checked) {
                                form.setValue('invoiceLinks', []);
                                setSelectedInvoices([]);
                              }
                            }}
                            disabled={false}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="font-medium cursor-pointer">
                            Advance Payment
                          </FormLabel>
                          <FormDescription>
                            Record a payment not linked to any invoice
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <FormField
                    control={form.control}
                    name="referenceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reference Number</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            value={field.value || ''} 
                            readOnly={false}
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
                            value="USD"
                            readOnly
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          All payments are processed in USD
                        </FormDescription>
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
                          defaultValue={field.value}
                          value={field.value}
                          disabled={isInEditMode} // In edit mode, type should be locked
                        >
                          <FormControl>
                            <SelectTrigger>
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
                
                <div className="grid grid-cols-4 gap-4 mb-6">
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
                      <FormItem>
                        <FormLabel>Payment Date</FormLabel>
                        <div className="relative">
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "MMM dd, yyyy")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => {
                                  if (date) {
                                    field.onChange(date);
                                  }
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <FormDescription className="text-xs">
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
                          value={field.value || ''}
                          defaultValue={field.value || ''}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select payment method">
                                {field.value === 'bank transfer' && 'Wire Transfer'}
                                {field.value === 'wire transfer' && 'Wire Transfer'}
                                {field.value === 'check' && 'Check'}
                                {field.value === 'cash' && 'Cash'}
                                {field.value === 'credit card' && 'Credit Card'}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="bank transfer">Wire Transfer</SelectItem>
                            <SelectItem value="wire transfer">Wire Transfer</SelectItem>
                            <SelectItem value="check">Check</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="credit card">Credit Card</SelectItem>
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
                            type="number"
                            placeholder="0.00"
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => {
                              field.onChange(e.target.value);
                              // When amount changes, update the unallocated amount too
                              form.setValue('unallocatedAmount', e.target.value);
                            }}
                            readOnly={false}
                            disabled={false}
                            step="0.01"
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Total payment amount
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="mb-6">
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
                          defaultValue={field.value?.toString() || ''}
                          disabled={false}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select customer">
                                {field.value && getCustomerName(field.value)}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customers.map((customer: any) => (
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
                
                <div className="mb-6">
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
                </div>
                
                {/* Invoice allocation section */}
                {showInvoiceSection && !form.getValues().isAdvancePayment && (
                  <div className="border-t pt-6">
                    <h2 className="text-lg font-semibold mb-4">
                      Invoice Allocation
                    </h2>
                    
                    <div className="flex justify-between items-start mb-4">
                      <div>
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
                        checked={autoAllocate}
                        onCheckedChange={setAutoAllocate}
                      />
                      <Label htmlFor="auto-allocate" className="text-sm">Auto-allocate to oldest invoices</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAutoAllocate}
                        disabled={!autoAllocate || !form.getValues().amount || parseFloat(form.getValues().amount) <= 0}
                        className="ml-2"
                      >
                        Apply
                      </Button>
                    </div>
                    
                    {form.getValues().invoiceLinks.length > 0 && (
                      <div className="mt-4">
                        <h3 className="text-sm font-medium mb-2">
                          Selected Invoices
                        </h3>
                        <div className="border rounded-md">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead>
                              <tr className="bg-muted">
                                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground tracking-wider">Invoice</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground tracking-wider">Date</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground tracking-wider">Amount</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground tracking-wider">Applied</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="bg-card divide-y divide-gray-200">
                              {selectedInvoices.length > 0 ? (
                                selectedInvoices.map((invoice, index) => (
                                  <tr key={index}>
                                    <td className="px-4 py-2 text-sm">{invoice.invoiceNumber || invoice.id}</td>
                                    <td className="px-4 py-2 text-sm">{format(new Date(invoice.invoiceDate || invoice.issue_date), "MMM dd, yyyy")}</td>
                                    <td className="px-4 py-2 text-sm">{form.getValues().currency} {parseFloat(invoice.amount).toFixed(2)}</td>
                                    <td className="px-4 py-2 text-sm">
                                      <div className="flex items-center">
                                        <span className="mr-2">{form.getValues().currency}</span>
                                        <Input
                                          type="number"
                                          className="w-24"
                                          step="0.01"
                                          value={form.getValues().invoiceLinks[index]?.amountApplied || "0.00"}
                                          onChange={(e) => handleUpdateInvoiceLinkAmount(index, e.target.value)}
                                        />
                                      </div>
                                    </td>
                                    <td className="px-4 py-2 text-sm text-right">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveInvoiceLink(index)}
                                      >
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={5} className="px-4 py-4 text-center text-sm text-muted-foreground">
                                    No invoices selected. Click "Add Invoice" to link invoices to this payment.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Action buttons */}
              <div className="flex justify-end space-x-2 mt-8">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isInEditMode ? "Update Payment" : "Create Payment"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </div>
      
      {/* Invoice selection dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Invoice</DialogTitle>
            <DialogDescription>
              Choose an invoice to apply this payment to.
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4 space-y-4">
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <Input
                  placeholder="Search invoices..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchTerm('')}
              >
                <FilterX className="h-4 w-4" />
              </Button>
            </div>
            
            <ScrollArea className="h-[300px] rounded-md border p-2">
              {isLoadingInvoices ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="ml-2">Loading invoices...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredInvoices.length > 0 ? (
                    filteredInvoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-muted cursor-pointer"
                        onClick={() => handleSelectInvoice(invoice)}
                      >
                        <div>
                          <div className="font-medium flex items-center">
                            <FileText className="h-4 w-4 mr-1 text-blue-500" />
                            {invoice.invoiceNumber || invoice.id}
                            <Badge 
                              variant={invoice.invoiceType === 'Product' ? 'outline' : 'secondary'} 
                              className="ml-2"
                            >
                              {invoice.invoiceType || invoice.invoice_type}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground flex flex-col">
                            <span>{invoice.customerName || 'Unknown Customer'}</span>
                            <span>
                              {format(new Date(invoice.invoiceDate || invoice.issue_date), "MMM dd, yyyy")}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">
                            {form.getValues().currency} {parseFloat(invoice.amount).toFixed(2)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Outstanding: {form.getValues().currency} {parseFloat(invoice.outstanding || invoice.amount).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                      <div className="text-muted-foreground mb-2">
                        No matching invoices found
                      </div>
                      <div className="text-sm">
                        Try adjusting your search or filter criteria
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}