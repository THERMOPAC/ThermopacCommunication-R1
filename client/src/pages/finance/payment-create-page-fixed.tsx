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
    if (isInEditMode && paymentData && paymentData.payment) {
      console.log('Setting form values with payment data:', paymentData);
      
      // Delay the reset by a tiny bit to ensure it happens after component render
      setTimeout(() => {
        // Handle both snake_case (backend) and camelCase (frontend) property names
        const payment = paymentData.payment;
        
        // Set isAdvancePayment based on the payment data
        const isAdvancePayment = payment.is_advance_payment || false;
        console.log('Is advance payment:', isAdvancePayment);
        
        // Parse the payment date from the string to a Date object
        const paymentDate = payment.payment_date ? new Date(payment.payment_date) : new Date();
        console.log('Parsed payment date:', paymentDate);
        
        // Set up the initial form values from the payment data
        const formValues: PaymentFormValues = {
          referenceNumber: payment.reference_number || "",
          irmNo: payment.irmNo || "",
          paymentDate: paymentDate,
          sapPaymentNo: payment.sap_payment_no || "",
          paymentType: payment.payment_type || "Product",
          amount: payment.amount || "",
          unallocatedAmount: payment.unallocatedAmount || payment.amount || "",
          currency: payment.currency || "USD",
          paymentMethod: payment.payment_method || "",
          notes: payment.notes || "",
          isAdvancePayment: isAdvancePayment,
          customerId: payment.customer_id?.toString() || "",
          invoiceLinks: [],
        };
        
        console.log('Form values being set:', formValues);
        
        // Set all form values at once
        form.reset(formValues);
        
        // If a customer is selected, show the invoice section
        if (payment.customer_id) {
          console.log('Setting selected customer ID:', payment.customer_id.toString());
          setShowInvoiceSection(true);
        }
        
        // Set any existing invoice links
        if (paymentData.invoiceLinks && paymentData.invoiceLinks.length > 0) {
          const invoiceLinks = paymentData.invoiceLinks.map(link => ({
            invoiceId: link.invoice_id.toString(),
            amountApplied: link.amount_applied,
          }));
          form.setValue('invoiceLinks', invoiceLinks);
        }
      }, 0);
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
      const response = await apiRequest("PUT", `/api/finance/payments/${id}`, payload);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update payment");
      }
      
      return response.json();
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
  const handleUpdateInvoiceLinkAmount = (index: number, amount: string) => {
    const currentLinks = form.getValues().invoiceLinks;
    const updatedLinks = [...currentLinks];
    updatedLinks[index] = {
      ...updatedLinks[index],
      amountApplied: amount,
    };
    form.setValue('invoiceLinks', updatedLinks);
    
    // Update selected invoices
    const updatedSelected = [...selectedInvoices];
    updatedSelected[index] = {
      ...updatedSelected[index],
      amountApplied: amount,
    };
    setSelectedInvoices(updatedSelected);
  };
  
  // Calculate total amount applied
  const calculateTotalApplied = () => {
    const links = form.getValues().invoiceLinks;
    if (!links || links.length === 0) return 0;
    
    return links.reduce((sum, link) => {
      return sum + parseFloat(link.amountApplied || "0");
    }, 0);
  };
  
  // Get remaining amount to allocate
  const getRemainingAmount = () => {
    const totalAmount = parseFloat(form.getValues().amount || "0");
    const totalApplied = calculateTotalApplied();
    return totalAmount - totalApplied;
  };
  
  // Filter invoices based on search term
  const filteredInvoices = invoices.filter(invoice => {
    // Match by customer
    const customerMatches = invoice.customerId?.toString() === form.getValues().customerId;
    if (!customerMatches) return false;
    
    // Match by search term
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

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Payments
          </Button>
          <h1 className="text-2xl font-bold">
            {isInEditMode ? "Edit Payment" : "Create New Payment"}
          </h1>
        </div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h2 className="text-lg font-semibold mb-4">Payment Details</h2>
                  
                  {/* Row with Reference Number, Currency, SAP Payment No, and Payment Type with equal width */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="referenceNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reference Number</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Auto-generated" 
                              {...field} 
                              value={field.value || ''} 
                              readOnly={true}
                              className="bg-muted cursor-not-allowed"
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
                              readOnly={false} 
                              className={false ? "bg-muted cursor-not-allowed" : ""}
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
                            disabled={isInEditMode}
                          >
                            <FormControl>
                              <SelectTrigger className={isInEditMode ? "bg-muted cursor-not-allowed" : ""}>
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
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                <DollarSign className="h-4 w-4 text-gray-400" />
                              </div>
                              <Input
                                type="number"
                                placeholder="0.00"
                                className="pl-10"
                                {...field}
                                value={field.value || ''}
                                onChange={(e) => {
                                  field.onChange(e.target.value);
                                  // When amount changes, update the unallocated amount too
                                  form.setValue('unallocatedAmount', e.target.value);
                                }}
                                readOnly={isInEditMode} // In edit mode, amount should be locked
                                disabled={isInEditMode}
                                step="0.01"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="my-4">
                    <FormField
                      control={form.control}
                      name="isAdvancePayment"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                field.onChange(checked);
                                
                                // If switching to advance payment, clear any invoice links
                                if (checked) {
                                  form.setValue('invoiceLinks', []);
                                  setSelectedInvoices([]);
                                }
                              }}
                              disabled={isInEditMode} // Lock in edit mode
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>
                              Advance Payment
                            </FormLabel>
                            <FormDescription>
                              Mark as advance payment if not linked to specific invoices yet
                            </FormDescription>
                          </div>
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
                            if (value) {
                              // Reset selected invoices when customer changes
                              form.setValue('invoiceLinks', []);
                              setSelectedInvoices([]);
                              setShowInvoiceSection(true);
                            }
                          }}
                          value={field.value?.toString() || ''}
                          disabled={false}
                        >
                          <FormControl>
                            <SelectTrigger>
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
              </div>
              
              {/* Invoice allocation section */}
              {showInvoiceSection && !form.getValues().isAdvancePayment && (
                <div className="mt-8 border-t pt-6">
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
                    <Label htmlFor="auto-allocate">Auto Allocate</Label>
                    
                    {autoAllocate && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={handleAutoAllocate}
                        disabled={!form.getValues().amount || parseFloat(form.getValues().amount) <= 0}
                        className="ml-2"
                      >
                        Apply Auto Allocation
                      </Button>
                    )}
                  </div>
                  
                  {/* List of allocated invoices */}
                  {selectedInvoices.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-sm font-medium mb-2">Allocated Invoices</h3>
                      <div className="bg-gray-50 rounded-md p-4">
                        <table className="w-full">
                          <thead>
                            <tr className="text-xs text-muted-foreground border-b">
                              <th className="text-left p-2">Invoice Number</th>
                              <th className="text-left p-2">Date</th>
                              <th className="text-left p-2">Customer</th>
                              <th className="text-left p-2">Type</th>
                              <th className="text-right p-2">Total Amount</th>
                              <th className="text-right p-2">Applied Amount</th>
                              <th className="text-center p-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedInvoices.map((invoice, index) => (
                              <tr key={index} className="border-b">
                                <td className="p-2">{invoice.invoiceNumber}</td>
                                <td className="p-2">{format(new Date(invoice.invoiceDate || invoice.issue_date), "MMM d, yyyy")}</td>
                                <td className="p-2">{invoice.customerName}</td>
                                <td className="p-2">
                                  <Badge variant={(invoice.invoiceType || invoice.invoice_type) === "Product" ? "default" : "secondary"}>
                                    {invoice.invoiceType || invoice.invoice_type || "Unknown"}
                                  </Badge>
                                </td>
                                <td className="text-right p-2">{invoice.currency} {parseFloat(invoice.amount).toFixed(2)}</td>
                                <td className="p-2">
                                  <Input 
                                    type="number"
                                    className="w-24 text-right"
                                    value={selectedInvoices[index].amountApplied || "0.00"}
                                    onChange={(e) => handleUpdateInvoiceLinkAmount(index, e.target.value)}
                                    min="0"
                                    max={invoice.amount}
                                    step="0.01"
                                  />
                                </td>
                                <td className="text-center p-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveInvoiceLink(index)}
                                    className="text-red-500 h-8 w-8 p-0"
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex justify-end space-x-4 mt-8">
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
                  {isInEditMode ? "Update" : "Create"} Payment
                </Button>
              </div>
            </form>
          </Form>
        )}
      </div>
      
      {/* Invoice selection dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Select Invoice to Allocate</DialogTitle>
            <DialogDescription>
              Choose an invoice to allocate payment funds to.
            </DialogDescription>
          </DialogHeader>
          
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search invoices..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="max-h-[400px] overflow-auto border rounded-md">
            <table className="w-full">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2">Invoice Number</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Customer</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-right p-2">Amount</th>
                  <th className="text-center p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t">
                    <td className="p-2">{invoice.invoiceNumber}</td>
                    <td className="p-2">{format(new Date(invoice.invoiceDate || invoice.issue_date), "MMM d, yyyy")}</td>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}