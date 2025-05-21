import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { AlertCircle, CheckCircle, Info } from "lucide-react";
import { useQuery, useMutation, QueryKey } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

// Define the schema for allocation form
const allocationSchema = z.object({
  paymentId: z.number(),
  invoices: z.array(
    z.object({
      invoiceId: z.number(),
      allocationAmount: z.number().min(0, 'Amount cannot be negative')
    })
  ),
  comment: z.string().optional()
});

// Define types based on the schema
type AllocationFormValues = z.infer<typeof allocationSchema>;

// Define types for data structures
type Payment = {
  id: number;
  paymentReference: string;
  paymentType: 'Product' | 'Service';
  paymentDate: string;
  amount: number;
  allocatedAmount: number;
  remainingAmount: number;
  currency: string;
  status: 'Unallocated' | 'Partially Allocated' | 'Fully Allocated';
  customerName: string;
};

type Invoice = {
  id: number;
  invoiceNumber: string;
  invoiceType: 'Product' | 'Service';
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  currency: string;
  status: 'Unpaid' | 'Partially Paid' | 'Paid';
  customerName: string;
};

type Allocation = {
  id: number;
  paymentId: number;
  invoiceId: number;
  paymentReference: string;
  invoiceNumber: string;
  allocationDate: string;
  amount: number;
  createdBy: string;
};

export default function PaymentAllocationPage() {
  // State management
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<Invoice[]>([]);
  const [allocationsDialogOpen, setAllocationsDialogOpen] = useState(false);
  const [viewPaymentId, setViewPaymentId] = useState<number | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const { toast } = useToast();

  // Format currency values using USD
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Setup form
  const form = useForm<AllocationFormValues>({
    resolver: zodResolver(allocationSchema),
    defaultValues: {
      paymentId: 0,
      invoices: [],
      comment: ''
    }
  });

  // Fetch unallocated payments
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['/api/finance/unallocated-advances'],
    select: (data) => {
      // Process payments to include UI-specific fields like the formatted total for display
      const typedData = data as { advances: Payment[] };
      if (!typedData?.advances) return { advances: [] };
      
      const processedPayments = typedData.advances.map((payment: Payment) => ({
        ...payment,
        total: payment.amount,
        allocated: payment.allocatedAmount || 0,
        remaining: payment.remainingAmount || payment.amount - (payment.allocatedAmount || 0),
        raw: payment
      }));
      
      console.log('Processed payments:', processedPayments);
      return { advances: processedPayments };
    }
  });

  // Fetch outstanding invoices for the selected payment type
  const { data: invoicesData, isLoading: invoicesLoading, refetch: refetchInvoices } = useQuery({
    queryKey: ['/api/finance/outstanding-invoices', selectedPayment?.paymentType],
    queryFn: async () => {
      console.log("Fetching outstanding invoices for payment type:", selectedPayment?.paymentType);
      
      // Only fetch if we have a payment type to filter by
      if (!selectedPayment?.paymentType) {
        return { invoices: [], totalOutstanding: "0.00", count: 0 };
      }
      
      console.log("Fetching from URL:", `${window.location.origin}/api/finance/outstanding-invoices?invoiceType=${selectedPayment.paymentType}`);
      
      const response = await fetch(
        `${window.location.origin}/api/finance/outstanding-invoices?invoiceType=${selectedPayment.paymentType}`
      );
      
      const data = await response.json();
      console.log("Outstanding invoices response:", data);
      return data;
    },
    enabled: !!selectedPayment?.paymentType,
    staleTime: 5000 // Cache invoices for 5 seconds
  });

  // Fetch payment allocations for the view dialog
  const fetchAllocations = async (paymentId: number): Promise<Allocation[]> => {
    try {
      // Use our new simple allocations API endpoint
      const response = await fetch(`${window.location.origin}/api/finance/simple-allocations/payment-allocations/${paymentId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch allocations');
      }
      
      const data = await response.json();
      console.log("Fetched allocations:", data);
      
      // The new API returns allocations in a different format
      if (data.success === false) {
        throw new Error(data.message || 'Failed to fetch allocations');
      }
      
      return data.allocations || [];
    } catch (error) {
      console.error('Error fetching allocations:', error);
      return [];
    }
  };

  // Get all payments from the query result
  const payments = (paymentsData as { advances: Payment[] })?.advances || [];

  // Update filtered invoices when payment selection changes
  useEffect(() => {
    if (selectedPayment && invoicesData) {
      // Log payment selection
      console.log("Payment selected with type:", selectedPayment.paymentType);
      
      // Clear any previously selected invoices first
      setSelectedInvoices([]);
      form.reset({ 
        paymentId: selectedPayment.id,
        invoices: [],
        comment: ''
      });
      
      // Filter invoices to match the payment type
      const typedInvoicesData = invoicesData as { invoices: Invoice[] };
      const matchingInvoices = typedInvoicesData.invoices
        .filter((invoice: Invoice) => 
          // Match invoice type to payment type
          invoice.invoiceType === selectedPayment.paymentType
        );
      
      console.log(`Filtered ${matchingInvoices.length} invoices for payment type: ${selectedPayment.paymentType}`);
      setFilteredInvoices(matchingInvoices);
    } else {
      setFilteredInvoices([]);
    }
  }, [selectedPayment, invoicesData, form]);

  // Handle invoice selection
  const toggleInvoice = (invoice: Invoice) => {
    console.log("Toggle invoice:", invoice.id, invoice.invoiceNumber);
    const isSelected = selectedInvoices.some(i => i.id === invoice.id);
    
    if (isSelected) {
      // Remove the invoice from selectedInvoices
      console.log("Removing invoice:", invoice.id);
      setSelectedInvoices(selectedInvoices.filter(i => i.id !== invoice.id));
      
      // Remove from form value
      const currentInvoices = form.getValues('invoices');
      form.setValue(
        'invoices', 
        currentInvoices.filter(i => i.invoiceId !== invoice.id)
      );
    } else {
      // Add the invoice to the selectedInvoices state
      console.log("Adding invoice:", invoice.id);
      setSelectedInvoices(prevSelected => [...prevSelected, invoice]);
      
      // Calculate the default allocation amount (use full outstanding amount or remaining payment amount, whichever is smaller)
      const defaultAllocationAmount = Math.min(
        invoice.outstandingAmount,
        selectedPayment ? selectedPayment.remainingAmount - getTotalAllocation() : 0
      );
      
      console.log("Setting default allocation amount:", defaultAllocationAmount);
      
      // Create a direct allocation entry for this invoice
      const currentInvoices = form.getValues('invoices');
      const updatedInvoices = [
        ...currentInvoices,
        { 
          invoiceId: invoice.id, 
          allocationAmount: defaultAllocationAmount 
        }
      ];
      
      // Update form with the new invoice allocation
      form.setValue('invoices', updatedInvoices);
      
      // Force form to re-render with updated values
      form.trigger('invoices');
    }
  };

  // Direct allocation amount update
  const handleAllocationChange = (invoiceId: number, amount: number) => {
    console.log(`Updating allocation for invoice ${invoiceId} to ${amount}`);
    
    const currentInvoices = form.getValues('invoices');
    const invoiceIndex = currentInvoices.findIndex(i => i.invoiceId === invoiceId);
    
    if (invoiceIndex >= 0) {
      // Update existing allocation
      const updatedInvoices = [...currentInvoices];
      updatedInvoices[invoiceIndex].allocationAmount = amount;
      form.setValue('invoices', updatedInvoices);
    } else {
      // Add new allocation
      form.setValue('invoices', [
        ...currentInvoices,
        { invoiceId, allocationAmount: amount }
      ]);
    }
  };

  // Calculate total allocation amount
  const getTotalAllocation = (): number => {
    const invoices = form.getValues('invoices');
    return invoices.reduce((sum, inv) => sum + (inv.allocationAmount || 0), 0);
  };

  // Allocation mutation
  const allocateMutation = useMutation({
    mutationFn: async (values: AllocationFormValues) => {
      try {
        // Filter out invoices with no allocation
        const selectedInvoices = values.invoices.filter(inv => inv.allocationAmount > 0);
        
        // Create payload for new API
        const payload = {
          paymentId: selectedPayment?.id,
          invoices: selectedInvoices,
          comment: values.comment || undefined
        };
        
        console.log('Allocation payload:', payload);
        
        // Make a direct fetch to ensure proper handling - using our newest API endpoint
        const response = await fetch(`${window.location.origin}/api/finance/allocations-new/allocate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          credentials: 'include'
        });
        
        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          console.error('Server returned non-JSON response:', text);
          throw new Error('Server returned non-JSON response. Please try again later.');
        }
        
        const data = await response.json();
        
        if (!response.ok || data.success === false) {
          throw new Error(data.message || 'Failed to allocate payment');
        }
        
        return data;
      } catch (error) {
        console.error('Allocation error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Check if response indicates failure
      if (data && data.success === false) {
        toast({
          title: "Allocation Failed",
          description: data.message || "There was an error processing the allocation.",
          variant: "destructive"
        });
        return;
      }
      
      toast({
        title: "Payment Allocated Successfully",
        description: "The payment has been allocated to the selected invoices.",
      });
      
      // Reset the form
      resetAllocation();
      
      // Refetch data using the imported queryClient
      queryClient.invalidateQueries({ queryKey: ['/api/finance/unallocated-advances'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/outstanding-invoices'] });
      
      // Also invalidate allocations if we were viewing them
      if (viewPaymentId) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/finance/simple-allocations/payment-allocations', viewPaymentId.toString()] 
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Allocation Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Handle form submission
  const onSubmit = (values: AllocationFormValues) => {
    // Check if total allocation exceeds remaining amount
    const totalAllocation = getTotalAllocation();
    if (selectedPayment && totalAllocation > selectedPayment.remainingAmount) {
      toast({
        title: "Allocation Exceeds Available Amount",
        description: `Total allocation (${formatCurrency(totalAllocation)}) exceeds the remaining payment amount (${formatCurrency(selectedPayment.remainingAmount)}).`,
        variant: "destructive"
      });
      return;
    }

    // Validate that all selected invoices have allocations
    const invoicesWithZeroAllocation = values.invoices.filter(inv => inv.allocationAmount === 0);
    if (invoicesWithZeroAllocation.length > 0) {
      toast({
        title: "Invalid Allocation",
        description: "Please enter allocation amounts for all selected invoices or deselect them.",
        variant: "destructive"
      });
      return;
    }

    console.log('Submitting allocation:', values);
    allocateMutation.mutate(values);
  };

  // Reset allocation form
  const resetAllocation = () => {
    setSelectedPayment(null);
    setSelectedInvoices([]);
    form.reset();
  };

  // Handle clicking the "View Allocations" button
  useEffect(() => {
    if (viewPaymentId !== null && allocationsDialogOpen) {
      // Fetch allocations for the selected payment
      fetchAllocations(viewPaymentId).then(setAllocations);
    }
  }, [viewPaymentId, allocationsDialogOpen]);

  return (
    <div className="py-6 px-4 md:px-6 w-full max-w-[calc(100vw-280px)] overflow-x-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Payment Allocation</h1>
        <p className="text-muted-foreground">
          Allocate unallocated payments to outstanding invoices
        </p>
      </div>

      <Tabs defaultValue="allocate" className="space-y-6">
        <TabsList>
          <TabsTrigger value="allocate">Allocate Payments</TabsTrigger>
          <TabsTrigger value="history">Allocation History</TabsTrigger>
        </TabsList>

        <TabsContent value="allocate" className="space-y-6">
          {/* Payment Selection Section */}
          <Card>
            <CardHeader>
              <CardTitle>Select Payment to Allocate</CardTitle>
              <CardDescription>
                Choose a payment with available funds to allocate to invoices
              </CardDescription>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <div className="text-center py-4">Loading payments...</div>
              ) : payments.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No unallocated payments available</AlertTitle>
                  <AlertDescription>
                    All payments have been fully allocated to invoices.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Select</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments
                        .filter((payment: Payment) => payment.remainingAmount > 0)
                        .map((payment: Payment) => (
                          <TableRow 
                            key={payment.id}
                            className={selectedPayment?.id === payment.id ? "bg-muted/50" : ""}
                          >
                            <TableCell>
                              <input
                                type="radio"
                                name="selectedPayment"
                                checked={selectedPayment?.id === payment.id}
                                onChange={() => {
                                  setSelectedPayment(payment);
                                  form.setValue('paymentId', payment.id);
                                }}
                                className="h-4 w-4 rounded-full border-gray-300 text-primary focus:ring-primary"
                              />
                            </TableCell>
                            <TableCell className="font-medium">{payment.paymentReference}</TableCell>
                            <TableCell>
                              <Badge variant={payment.paymentType === 'Product' ? "default" : "secondary"}>
                                {payment.paymentType}
                              </Badge>
                            </TableCell>
                            <TableCell>{payment.customerName}</TableCell>
                            <TableCell>{format(new Date(payment.paymentDate), 'dd/MM/yyyy')}</TableCell>
                            <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(payment.remainingAmount)}</TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  payment.status === 'Unallocated' 
                                    ? "default" 
                                    : payment.status === 'Partially Allocated'
                                      ? "outline"
                                      : "secondary"
                                }
                              >
                                {payment.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  setViewPaymentId(payment.id);
                                  setAllocationsDialogOpen(true);
                                }}
                              >
                                View Allocations
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice Selection Section - Only visible if a payment is selected */}
          {selectedPayment && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Select Invoices to Allocate Payment</CardTitle>
                    <CardDescription>
                      Available amount: {formatCurrency(selectedPayment.remainingAmount)}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Payment Type:</span>
                    <Badge variant="outline">
                      {selectedPayment.paymentType}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="text-center py-4">Loading invoices...</div>
                ) : filteredInvoices.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>No matching invoices found</AlertTitle>
                    <AlertDescription>
                      There are no outstanding invoices matching the payment type ({selectedPayment.paymentType})
                      for this customer.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Select</TableHead>
                              <TableHead>Invoice Number</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Due Date</TableHead>
                              <TableHead className="text-right">Total Amount</TableHead>
                              <TableHead className="text-right">Outstanding</TableHead>
                              <TableHead className="text-right">Allocation Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredInvoices.map((invoice) => {
                              const isSelected = selectedInvoices.some(i => i.id === invoice.id);
                              
                              // Find the index of this invoice in the form values
                              const invoiceFormIndex = form
                                .getValues('invoices')
                                .findIndex(i => i.invoiceId === invoice.id);
                                
                              // Get current allocation amount
                              const currentAllocation = invoiceFormIndex !== -1 
                                ? form.getValues(`invoices.${invoiceFormIndex}.allocationAmount`) 
                                : 0;
                                
                              return (
                                <TableRow key={invoice.id} className={isSelected ? "bg-muted/50" : ""}>
                                  <TableCell>
                                    <Checkbox 
                                      checked={isSelected}
                                      onCheckedChange={() => toggleInvoice(invoice)}
                                    />
                                  </TableCell>
                                  <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                                  <TableCell>{invoice.invoiceType}</TableCell>
                                  <TableCell>{invoice.customerName}</TableCell>
                                  <TableCell>{format(new Date(invoice.invoiceDate), 'dd/MM/yyyy')}</TableCell>
                                  <TableCell>{format(new Date(invoice.dueDate), 'dd/MM/yyyy')}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(invoice.totalAmount)}</TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatCurrency(invoice.outstandingAmount)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {isSelected && (
                                      <div className="flex flex-col gap-1">
                                        <Input
                                          key={`invoice-allocation-${invoice.id}`}
                                          type="number"
                                          min={0}
                                          max={Math.min(invoice.outstandingAmount, selectedPayment.remainingAmount)}
                                          value={invoiceFormIndex !== -1 
                                            ? form.getValues(`invoices.${invoiceFormIndex}.allocationAmount`) 
                                            : invoice.outstandingAmount}
                                          onChange={(e) => handleAllocationChange(invoice.id, parseFloat(e.target.value) || 0)}
                                          className="w-32 text-right"
                                        />
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="sm" 
                                          className="text-xs"
                                          onClick={() => handleAllocationChange(invoice.id, invoice.outstandingAmount)}
                                        >
                                          Use max
                                        </Button>
                                      </div>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Allocation summary */}
                      <div className="flex flex-col gap-2 max-w-md mx-auto mt-6">
                        <div className="flex justify-between">
                          <span>Total Available:</span>
                          <span className="font-medium">{formatCurrency(selectedPayment.remainingAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Allocating:</span>
                          <span className="font-medium">{formatCurrency(getTotalAllocation())}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Remaining After Allocation:</span>
                          <span className="font-medium">{formatCurrency(selectedPayment.remainingAmount - getTotalAllocation())}</span>
                        </div>
                        
                        <Progress 
                          value={(getTotalAllocation() / selectedPayment.remainingAmount) * 100} 
                          className="h-2 mt-2"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="comment">Comment (Optional)</Label>
                        <Textarea
                          id="comment"
                          placeholder="Add any additional notes about this allocation"
                          {...form.register('comment')}
                        />
                      </div>

                      <div className="flex justify-end space-x-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={resetAllocation}
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit"
                          disabled={
                            getTotalAllocation() === 0 || 
                            !selectedPayment || 
                            selectedInvoices.length === 0 ||
                            allocateMutation.isPending
                          }
                        >
                          {allocateMutation.isPending ? 'Processing...' : 'Allocate Payment'}
                        </Button>
                      </div>
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Allocations</CardTitle>
              <CardDescription>
                View the history of recent payment allocations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4">
                Allocation history will be available in a future update.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Allocations Dialog */}
      <Dialog open={allocationsDialogOpen} onOpenChange={setAllocationsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Payment Allocations</DialogTitle>
            <DialogDescription>
              View all allocations for this payment
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {allocations.length === 0 ? (
              <div className="text-center py-4">
                No allocations found for this payment.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice Number</TableHead>
                    <TableHead>Allocation Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocations.map((allocation) => (
                    <TableRow key={allocation.id}>
                      <TableCell className="font-medium">{allocation.invoiceNumber}</TableCell>
                      <TableCell>{format(new Date(allocation.allocationDate), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-right">{formatCurrency(allocation.amount)}</TableCell>
                      <TableCell>{allocation.createdBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Allocation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to allocate this payment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => form.handleSubmit(onSubmit)()}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}