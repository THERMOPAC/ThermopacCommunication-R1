import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
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
import { Loader2, CalendarIcon, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Payment form schema
const editPaymentFormSchema = z.object({
  irmNo: z.string().optional(),
  paymentDate: z.date({
    required_error: "Payment date is required",
  }),
  sapPaymentNo: z.string().optional(),
  paymentType: z.enum(["Product", "Service"]).default("Product"),
  amount: z.string().min(1, "Amount is required"),
  currency: z.string().default("USD"),
  paymentMethod: z.string().min(1, "Payment method is required"),
  notes: z.string().optional(),
  isAdvancePayment: z.boolean().default(false),
  customerId: z.string().optional(),
});

type EditPaymentFormValues = z.infer<typeof editPaymentFormSchema>;

// Define payment data structure
interface PaymentData {
  payment: {
    id: number;
    paymentDate?: string;
    payment_date?: string;
    irmNo?: string;
    irm_no?: string;
    sapPaymentNo?: string;
    sap_payment_no?: string;
    paymentType?: string;
    payment_type?: string;
    amount: string;
    currency: string;
    paymentMethod?: string;
    payment_method?: string;
    notes?: string;
    isAdvancePayment?: boolean;
    is_advance_payment?: boolean;
    customerId?: number;
    customer_id?: number;
    customerName?: string;
  };
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

export default function EditPaymentPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [paymentId, setPaymentId] = useState<number | null>(null);

  // Extract payment ID from URL
  useEffect(() => {
    const pathParts = location.split('/');
    const id = parseInt(pathParts[pathParts.length - 2], 10);
    if (!isNaN(id)) {
      setPaymentId(id);
    }
  }, [location]);

  // Get payment details
  const { data: paymentData, isLoading: isLoadingPayment, error: paymentError } = useQuery<PaymentData>({
    queryKey: [`/api/finance/payments/${paymentId}`],
    enabled: paymentId !== null,
  });

  // Get customers data
  const { data: customersList, isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    enabled: true,
  });

  // Setup form with default values
  const form = useForm<EditPaymentFormValues>({
    resolver: zodResolver(editPaymentFormSchema),
    defaultValues: {
      irmNo: '',
      paymentDate: new Date(),
      sapPaymentNo: '',
      paymentType: 'Product',
      amount: '',
      currency: 'USD',
      paymentMethod: 'bank transfer',
      notes: '',
      isAdvancePayment: false,
      customerId: '',
    },
  });

  // Update form when payment data is loaded
  useEffect(() => {
    if (paymentData && paymentData.payment) {
      const payment = paymentData.payment;
      console.log('Loading payment data for edit:', payment);

      // Parse the payment date
      let paymentDate = new Date();
      try {
        const dateString = payment.paymentDate || payment.payment_date;
        if (dateString) {
          paymentDate = new Date(dateString);
        }
      } catch (err) {
        console.error('Error parsing payment date:', err);
      }

      // Extract all field values with proper fallbacks
      const formValues: EditPaymentFormValues = {
        irmNo: payment.irmNo || payment.irm_no || payment.paymentNumber || '',
        paymentDate: paymentDate,
        sapPaymentNo: payment.sapPaymentNo || payment.sap_payment_no || '',
        paymentType: (payment.paymentType || payment.payment_type || 'Product') as "Product" | "Service",
        amount: String(payment.amount || ''),
        currency: payment.currency || 'USD',
        paymentMethod: payment.paymentMethod || payment.payment_method || 'bank transfer',
        notes: payment.notes || '',
        isAdvancePayment: Boolean(payment.isAdvancePayment || payment.is_advance_payment || false),
        customerId: String(payment.customerId || payment.customer_id || ''),
      };

      console.log('Setting form values:', formValues);
      
      // Reset the form with the payment data
      form.reset(formValues);
    }
  }, [paymentData, form]);

  // Update payment mutation
  const updatePayment = useMutation({
    mutationFn: async (values: EditPaymentFormValues) => {
      if (!paymentId) throw new Error('Payment ID is required');

      const updateData = {
        payment: {
          irmNo: values.irmNo || null,
          paymentDate: values.paymentDate.toISOString(),
          sapPaymentNo: values.sapPaymentNo || null,
          paymentType: values.paymentType,
          amount: parseFloat(values.amount),
          currency: values.currency,
          paymentMethod: values.paymentMethod,
          notes: values.notes || null,
          isAdvancePayment: values.isAdvancePayment,
          customerId: values.customerId ? parseInt(values.customerId, 10) : null,
        },
        invoiceLinks: []
      };

      console.log('Updating payment with data:', updateData);

      return apiRequest('POST', `/api/finance/payments/update/${paymentId}`, updateData.payment);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment updated successfully",
        variant: "default",
      });
      
      // Invalidate and refetch payment data
      queryClient.invalidateQueries({ queryKey: [`/api/finance/payments/${paymentId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/payments'] });
      
      // Navigate back to payments list
      navigate('/finance/payments');
    },
    onError: (error: any) => {
      console.error('Error updating payment:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update payment",
        variant: "destructive",
      });
    },
  });

  // Form submission handler
  const onSubmit = (values: EditPaymentFormValues) => {
    console.log('Submitting form values:', values);
    updatePayment.mutate(values);
  };

  // Handle back navigation
  const handleBack = () => {
    navigate('/finance/payments');
  };

  // Loading state
  const isLoading = isLoadingPayment || isLoadingCustomers || updatePayment.isPending;

  if (paymentError) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Error Loading Payment</h2>
            <p className="text-muted-foreground mb-4">Could not load payment details</p>
            <Button onClick={handleBack} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Payments
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (isLoadingPayment || !paymentData) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="mr-2 h-16 w-16 animate-spin" />
          <p>Loading payment details...</p>
        </div>
      </Layout>
    );
  }

  const customers = customersList || [];

  return (
    <Layout>
      <Helmet>
        <title>Edit Payment | Thermopac</title>
      </Helmet>
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold pl-4">Edit Payment</h1>
          <p className="text-muted-foreground">Payment ID: {paymentId}</p>
        </div>
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Payments
        </Button>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Information</CardTitle>
              <CardDescription>
                Update the payment details below
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Advance Payment Toggle */}
              <FormField
                control={form.control}
                name="isAdvancePayment"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-red-600 font-medium">Advance Payment</FormLabel>
                      <FormDescription>
                        Mark this payment as an advance payment
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {/* First Row: Payment ID, Currency, SAP Payment No, Payment Type */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="flex flex-col space-y-1.5">
                  <Label>Payment ID</Label>
                  <Input 
                    value={paymentId || ''} 
                    disabled 
                    className="bg-muted cursor-not-allowed" 
                  />
                  <p className="text-sm text-muted-foreground">
                    System-generated payment ID
                  </p>
                </div>
                
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl>
                        <Input 
                          value="USD" 
                          disabled 
                          className="bg-muted cursor-not-allowed"
                        />
                      </FormControl>
                      <FormDescription>
                        All payments are in USD
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
                        disabled
                      >
                        <FormControl>
                          <SelectTrigger className="bg-muted cursor-not-allowed">
                            <SelectValue placeholder="Select payment type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Product">Product</SelectItem>
                          <SelectItem value="Service">Service</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Payment type cannot be changed
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Second Row: IRM NO, Payment Date, Payment Method, Payment Amount */}
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
                          disabled
                          className="bg-muted cursor-not-allowed"
                        />
                      </FormControl>
                      <FormDescription>
                        Amount cannot be changed
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Customer Selection (only for advance payments) */}
              {form.watch('isAdvancePayment') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer</FormLabel>
                        <Select 
                          onValueChange={field.onChange}
                          value={field.value?.toString() || ''}
                          disabled
                        >
                          <FormControl>
                            <SelectTrigger className="bg-muted cursor-not-allowed">
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
                        <FormDescription>
                          Customer cannot be changed
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Notes Field */}
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
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          
          <div className="flex gap-4 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Payment
            </Button>
          </div>
        </form>
      </Form>
    </Layout>
  );
}