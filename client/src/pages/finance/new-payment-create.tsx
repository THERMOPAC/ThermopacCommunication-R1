import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Helmet } from 'react-helmet';

import Layout from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Form schema
const paymentSchema = z.object({
  paymentDate: z.date({
    required_error: "Payment date is required.",
  }),
  amount: z.string().min(1, "Amount is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Amount must be a positive number",
  }),
  currency: z.string().min(1, "Currency is required"),
  paymentMethod: z.string().min(1, "Payment method is required"),
  paymentType: z.enum(['Product', 'Service'], {
    required_error: "Payment type is required",
  }),
  customerId: z.string().min(1, "Customer is required"),
  isAdvancePayment: z.boolean().default(false),
  irmNo: z.string().optional(),
  sapPaymentNo: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export default function NewPaymentCreatePage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch customers
  const { data: customers, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['/api/customers'],
  });

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      paymentDate: new Date(),
      amount: '',
      currency: 'USD',
      paymentMethod: 'bank transfer',
      paymentType: 'Product',
      customerId: '',
      isAdvancePayment: true,
      irmNo: '',
      sapPaymentNo: '',
      notes: '',
    },
  });

  // Create payment mutation
  const createPayment = useMutation({
    mutationFn: async (values: PaymentFormValues) => {
      try {
        const paymentData = {
          payment: {
            irmNo: values.irmNo || null,
            paymentDate: format(values.paymentDate, 'yyyy-MM-dd'),
            sapPaymentNo: values.sapPaymentNo || null,
            paymentType: values.paymentType,
            amount: String(values.amount),
            currency: values.currency,
            paymentMethod: values.paymentMethod,
            notes: values.notes || null,
            isAdvancePayment: values.isAdvancePayment,
            customerId: values.customerId
          },
          invoiceLinks: []
        };

        console.log('Sending payment data:', JSON.stringify(paymentData));

        const response = await fetch('/api/finance/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentData)
        });

        // First check if response is JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          // It's JSON response
          const result = await response.json();
          
          if (!response.ok) {
            throw new Error(result.error || 'Failed to create payment');
          }
          
          // Log the entire successful result for debugging
          console.log('Payment creation successful. Server response:', JSON.stringify(result));
          return result;
        } else {
          // Not a JSON response
          const textResponse = await response.text();
          console.error('Non-JSON response received:', textResponse);
          
          if (!response.ok) {
            throw new Error('Server error: ' + response.status);
          } else {
            // Attempt to handle a successful but non-JSON response
            console.log('Payment may have been created but received non-JSON response');
            console.log('Will reload payments list to check for new payment');
            
            // Force a query invalidation even with unknown response
            setTimeout(() => {
              window.queryClient?.invalidateQueries({ queryKey: ['/api/finance/payments'] });
            }, 500);
            
            return { 
              success: true, 
              id: "unknown", 
              message: "Payment created successfully" 
            };
          }
        }
      } catch (error) {
        console.error('Payment creation error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Log success data for debugging
      console.log('Payment creation success response:', data);
      
      toast({
        title: "Success",
        description: `Payment created successfully! ${data.id ? `Payment ID: ${data.id}` : 'Refreshing payment list...'}`,
      });
      
      // Force immediate data reload to ensure newest payment is displayed
      fetch('/api/finance/payments')
        .then(res => res.json())
        .then(data => {
          console.log('Fetched fresh payments data:', data);
          
          // Now invalidate the query cache
          queryClient.invalidateQueries({ 
            queryKey: ['/api/finance/payments'],
            refetchType: 'all'  
          });
          
          // Navigate after ensuring data is refreshed
          setTimeout(() => {
            navigate('/finance/payments');
          }, 1000);
        })
        .catch(err => {
          console.error('Error prefetching payments:', err);
          // Navigate anyway
          setTimeout(() => {
            navigate('/finance/payments');
          }, 1000);
        });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: PaymentFormValues) => {
    createPayment.mutate(values);
  };

  const isLoading = isLoadingCustomers || createPayment.isPending;

  return (
    <Layout>
      <Helmet>
        <title>Create New Payment | Thermopac</title>
      </Helmet>
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Create New Payment</h1>
        <Button variant="outline" onClick={() => navigate('/finance/payments')}>
          Back to Payments
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Information</CardTitle>
              <CardDescription>
                Enter the payment details. The Payment ID will be automatically generated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Row 1: Payment ID, Currency, SAP Payment No, Payment Type */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <FormLabel>Payment ID</FormLabel>
                  <div className="px-3 py-2 border rounded-md bg-muted text-muted-foreground text-sm">
                    Will be assigned after saving
                  </div>
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
                          readOnly={true}
                          className="bg-muted cursor-not-allowed"
                          onChange={(e) => {
                            // Force USD value even on change attempts
                            field.onChange("USD");
                          }}
                        />
                      </FormControl>
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
                        <Input placeholder="Enter SAP payment number" {...field} />
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Product" />
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

              {/* Row 2: IRM NO, Payment Date, Payment Method, Payment Amount */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="irmNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IRM NO</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter IRM number" {...field} />
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
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "MMM do, yyyy")
                              ) : (
                                <span>May 22nd, 2025</span>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Bank Transfer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="bank transfer">Bank Transfer</SelectItem>
                          <SelectItem value="wire transfer">Wire Transfer</SelectItem>
                          <SelectItem value="check">Check</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
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
                        <Input placeholder="Enter amount" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Row 3: Customer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers && Array.isArray(customers) ? customers.map((customer: any) => (
                            <SelectItem key={customer.id} value={String(customer.id)}>
                              {customer.bpName || customer.company_name}
                            </SelectItem>
                          )) : null}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter any additional notes about this payment"
                        className="resize-none"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/finance/payments')}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Payment
            </Button>
          </div>
        </form>
      </Form>
    </Layout>
  );
}