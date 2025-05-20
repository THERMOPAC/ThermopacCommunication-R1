import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Layout from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { AlertCircle, Download, ArrowUpDown, Info, CheckCircle2 } from 'lucide-react';

// Define allocation schema
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

type AllocationFormValues = z.infer<typeof allocationSchema>;

// Payment type definition
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

// Invoice type definition
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

// Allocation type definition
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

  // Get unallocated payments
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['/api/finance/unallocated-advances'],
    queryFn: async () => {
      console.log('Fetching unallocated payments from simplified endpoint');
      const response = await fetch('/api/finance/unallocated-advances');
      if (!response.ok) {
        console.error('Failed to fetch unallocated payments:', response.statusText);
        throw new Error('Failed to fetch unallocated payments');
      }
      
      const data = await response.json();
      console.log('Response from unallocated payments API:', data);
      return data;
    }
  });

  // Transform the API response to match our component's expected format
  const payments: Payment[] = useMemo(() => {
    if (!paymentsData || !paymentsData.advances) return [];
    
    return paymentsData.advances.map((payment: any) => {
      // Ensure numeric values are properly parsed with fallbacks
      const totalAmount = parseFloat(payment.amount) || 0;
      const allocatedAmount = parseFloat(payment.allocatedAmount || '0') || 0;
      // Calculate remaining amount or use the provided unallocatedAmount
      const remainingAmount = parseFloat(payment.unallocatedAmount || payment.remainingAmount || (totalAmount - allocatedAmount).toString() || '0');
      
      console.log('Processing payment:', payment.id, {
        total: totalAmount,
        allocated: allocatedAmount,
        remaining: remainingAmount,
        raw: payment
      });
      
      return {
        id: payment.id,
        paymentReference: payment.paymentReference || payment.irm_no || `PAY-${payment.id}`,
        paymentType: payment.paymentType,
        paymentDate: payment.paymentDate,
        amount: totalAmount,
        allocatedAmount: allocatedAmount,
        remainingAmount: remainingAmount,
        currency: payment.currency || 'USD',
        status: payment.allocationStatus || 'Unallocated',
        customerName: payment.customerName
      };
    });
  }, [paymentsData]);

  // Get outstanding invoices that can receive payment allocations
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['/api/finance/outstanding-invoices', selectedPayment?.paymentType, selectedPayment?.customerName],
    queryFn: async () => {
      // Only fetch invoices if a payment is selected
      if (!selectedPayment) return { invoices: [] };
      
      console.log('Fetching outstanding invoices for payment type:', selectedPayment.paymentType);
      
      const url = new URL('/api/finance/outstanding-invoices', window.location.origin);
      
      // Add query parameters for filtering
      if (selectedPayment.paymentType) {
        url.searchParams.append('invoiceType', selectedPayment.paymentType);
      }
      
      console.log('Fetching from URL:', url.toString());
      
      try {
        const response = await fetch(url.toString());
        if (!response.ok) {
          console.error('Failed to fetch outstanding invoices:', response.statusText);
          throw new Error('Failed to fetch outstanding invoices');
        }
        
        const data = await response.json();
        console.log('Outstanding invoices response:', data);
        return data;
      } catch (error) {
        console.error('Error fetching outstanding invoices:', error);
        return { invoices: [] };
      }
    },
    enabled: !!selectedPayment // Only run this query when a payment is selected
  });

  // Filter invoices based on selected payment
  useEffect(() => {
    if (selectedPayment && invoicesData?.invoices?.length > 0) {
      // Transform API data to match our component's expected format
      const filtered = invoicesData.invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType,
        invoiceDate: invoice.issueDate || invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalAmount: parseFloat(invoice.totalAmount || invoice.total || '0'),
        paidAmount: parseFloat(invoice.totalAmount || invoice.total || '0') - parseFloat(invoice.outstandingAmount || '0'),
        outstandingAmount: parseFloat(invoice.outstandingAmount || '0'),
        currency: invoice.currency || 'USD',
        status: invoice.status || 'Unpaid',
        customerName: invoice.customerName
      })).filter(invoice => 
        invoice.invoiceType === selectedPayment.paymentType && 
        invoice.outstandingAmount > 0
      );
      
      setFilteredInvoices(filtered);
      form.setValue('paymentId', selectedPayment.id);
    } else {
      setFilteredInvoices([]);
    }
  }, [selectedPayment, invoicesData, form]);

  // Toggle invoice selection
  const toggleInvoice = (invoice: Invoice) => {
    const isSelected = selectedInvoices.some(i => i.id === invoice.id);
    
    if (isSelected) {
      setSelectedInvoices(selectedInvoices.filter(i => i.id !== invoice.id));
      // Remove from form value
      const currentInvoices = form.getValues('invoices');
      form.setValue(
        'invoices', 
        currentInvoices.filter(i => i.invoiceId !== invoice.id)
      );
    } else {
      setSelectedInvoices([...selectedInvoices, invoice]);
      // Add to form value with 0 allocation amount
      const currentInvoices = form.getValues('invoices');
      form.setValue(
        'invoices', 
        [...currentInvoices, { invoiceId: invoice.id, allocationAmount: 0 }]
      );
    }
  };

  // Handle allocation amount change
  const handleAllocationChange = (invoiceId: number, amount: number) => {
    const currentInvoices = form.getValues('invoices');
    const invoiceIndex = currentInvoices.findIndex(i => i.invoiceId === invoiceId);
    
    if (invoiceIndex !== -1) {
      const updatedInvoices = [...currentInvoices];
      updatedInvoices[invoiceIndex].allocationAmount = amount;
      form.setValue('invoices', updatedInvoices);
    }
  };

  // Calculate total allocation amount
  const getTotalAllocation = () => {
    const invoices = form.getValues('invoices');
    return invoices.reduce((total, invoice) => total + invoice.allocationAmount, 0);
  };

  // API mutation for submitting allocations
  const allocateMutation = useMutation({
    mutationFn: async (values: AllocationFormValues) => {
      const response = await fetch(`/api/finance/payments/${values.paymentId}/allocate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceAllocations: values.invoices.map(inv => ({
            invoiceId: inv.invoiceId,
            amountApplied: inv.allocationAmount
          })),
          comment: values.comment || ''
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to allocate payment');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      // Invalidate related queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/finance/unallocated-advances'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/outstanding-invoices'] });
      
      toast({
        title: "Payment Allocated Successfully",
        description: "The payment has been allocated to the selected invoices.",
      });
      
      // Reset form and selection state
      resetAllocation();
      setConfirmationOpen(true);
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

  // Get payment allocations when dialog opens
  useEffect(() => {
    if (allocationsDialogOpen && viewPaymentId) {
      const fetchAllocations = async () => {
        try {
          const response = await fetch(`/api/finance/payments/${viewPaymentId}/allocations`);
          if (response.ok) {
            const data = await response.json();
            if (data.allocations) {
              const formattedAllocations = data.allocations.map((item: any) => ({
                id: item.id,
                paymentId: item.paymentId,
                invoiceId: item.invoiceId,
                paymentReference: item.paymentReference || `PAY-${item.paymentId}`,
                invoiceNumber: item.invoiceNumber,
                allocationDate: item.allocationDate || item.createdAt || new Date().toISOString(),
                amount: parseFloat(item.amount || item.amountApplied || '0'),
                createdBy: item.createdBy || 'System'
              }));
              setAllocations(formattedAllocations);
            } else {
              setAllocations([]);
            }
          } else {
            console.error('Failed to fetch payment allocations');
            setAllocations([]);
          }
        } catch (error) {
          console.error('Error fetching payment allocations:', error);
          setAllocations([]);
        }
      };
      
      fetchAllocations();
    }
  }, [allocationsDialogOpen, viewPaymentId]);

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Payment Allocation</h1>
            <p className="text-muted-foreground">
              Allocate payments to outstanding invoices
            </p>
          </div>
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
                          .filter(payment => payment.remainingAmount > 0)
                          .map(payment => (
                            <TableRow 
                              key={payment.id}
                              className={selectedPayment?.id === payment.id ? "bg-muted/50" : ""}
                            >
                              <TableCell>
                                <Checkbox 
                                  checked={selectedPayment?.id === payment.id}
                                  onCheckedChange={() => {
                                    setSelectedPayment(
                                      selectedPayment?.id === payment.id ? null : payment
                                    );
                                    setSelectedInvoices([]);
                                  }}
                                  disabled={payment.remainingAmount <= 0}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{payment.paymentReference}</TableCell>
                              <TableCell>{payment.paymentType}</TableCell>
                              <TableCell>{payment.customerName}</TableCell>
                              <TableCell>{format(new Date(payment.paymentDate), 'dd/MM/yyyy')}</TableCell>
                              <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(payment.remainingAmount)}
                              </TableCell>
                              <TableCell>
                                <span 
                                  className={`px-2 py-1 rounded-full text-xs ${
                                    payment.status === 'Unallocated' ? 'bg-yellow-100 text-yellow-800' :
                                    payment.status === 'Partially Allocated' ? 'bg-blue-100 text-blue-800' :
                                    'bg-green-100 text-green-800'
                                  }`}
                                >
                                  {payment.status}
                                </span>
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

            {/* Allocation Section */}
            {selectedPayment && (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                  <Card>
                    <CardHeader>
                      <CardTitle>Allocate Payment: {selectedPayment.paymentReference}</CardTitle>
                      <CardDescription>
                        Allocate payment to outstanding invoices for {selectedPayment.customerName}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {invoicesLoading ? (
                        <div className="text-center py-4">Loading invoices...</div>
                      ) : filteredInvoices.length === 0 ? (
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertTitle>No outstanding invoices found</AlertTitle>
                          <AlertDescription>
                            There are no outstanding invoices matching this payment type.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <div className="space-y-4">
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Select</TableHead>
                                  <TableHead>Invoice Number</TableHead>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Due Date</TableHead>
                                  <TableHead className="text-right">Total Amount</TableHead>
                                  <TableHead className="text-right">Outstanding</TableHead>
                                  <TableHead>Allocation Amount</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredInvoices.map(invoice => (
                                  <TableRow 
                                    key={invoice.id}
                                    className={selectedInvoices.some(i => i.id === invoice.id) ? "bg-muted/50" : ""}
                                  >
                                    <TableCell>
                                      <Checkbox 
                                        checked={selectedInvoices.some(i => i.id === invoice.id)}
                                        onCheckedChange={() => toggleInvoice(invoice)}
                                      />
                                    </TableCell>
                                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                                    <TableCell>
                                      {invoice.invoiceDate && format(new Date(invoice.invoiceDate), 'dd/MM/yyyy')}
                                    </TableCell>
                                    <TableCell>
                                      {invoice.dueDate && format(new Date(invoice.dueDate), 'dd/MM/yyyy')}
                                    </TableCell>
                                    <TableCell className="text-right">{formatCurrency(invoice.totalAmount)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(invoice.outstandingAmount)}</TableCell>
                                    <TableCell className="w-44">
                                      <div className="flex items-center space-x-2">
                                        <Input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          max={Math.min(invoice.outstandingAmount, selectedPayment.remainingAmount)}
                                          disabled={!selectedInvoices.some(i => i.id === invoice.id)}
                                          className="h-8 text-right"
                                          defaultValue="0.00"
                                          onChange={(e) => {
                                            const value = parseFloat(e.target.value || '0');
                                            handleAllocationChange(invoice.id, value);
                                          }}
                                        />
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-muted/30">
                                  <TableCell colSpan={5} className="text-right font-medium">
                                    Total Allocating:
                                  </TableCell>
                                  <TableCell colSpan={2} className="text-right font-medium">
                                    {formatCurrency(getTotalAllocation())}
                                  </TableCell>
                                </TableRow>
                                <TableRow className="bg-muted/30">
                                  <TableCell colSpan={5} className="text-right font-medium">
                                    Remaining Available:
                                  </TableCell>
                                  <TableCell colSpan={2} className="text-right font-medium">
                                    {formatCurrency(
                                      Math.max(0, selectedPayment.remainingAmount - getTotalAllocation())
                                    )}
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>

                          <div>
                            <FormField
                              control={form.control}
                              name="comment"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Notes</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="Optional notes about this allocation"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                    {filteredInvoices.length > 0 && (
                      <div className="px-6 py-4 border-t flex justify-end space-x-4">
                        <Button 
                          variant="outline"
                          onClick={resetAllocation}
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit"
                          disabled={
                            selectedInvoices.length === 0 || 
                            getTotalAllocation() <= 0 ||
                            getTotalAllocation() > selectedPayment.remainingAmount ||
                            allocateMutation.isPending
                          }
                        >
                          {allocateMutation.isPending ? "Processing..." : "Allocate Payment"}
                        </Button>
                      </div>
                    )}
                  </Card>
                </form>
              </Form>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Recent Payment Allocations</CardTitle>
                <CardDescription>
                  View history of recent payment allocations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* In a real implementation, this would call an API endpoint to get allocation history */}
                <Alert className="mb-6">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Coming Soon</AlertTitle>
                  <AlertDescription>
                    The allocation history feature is under development.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Allocation Details Dialog */}
        <Dialog open={allocationsDialogOpen} onOpenChange={setAllocationsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Payment Allocation Details</DialogTitle>
              <DialogDescription>
                How this payment has been allocated to invoices
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {allocations.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No Allocations</AlertTitle>
                  <AlertDescription>
                    This payment has not been allocated to any invoices yet.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allocations.map((allocation) => (
                        <TableRow key={allocation.id}>
                          <TableCell className="font-medium">{allocation.invoiceNumber}</TableCell>
                          <TableCell>
                            {format(new Date(allocation.allocationDate), 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(allocation.amount)}</TableCell>
                          <TableCell>{allocation.createdBy}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={2} className="text-right font-medium">Total:</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(
                            allocations.reduce((sum, alloc) => sum + alloc.amount, 0)
                          )}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setAllocationsDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmation Dialog */}
        <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Allocation Successful</DialogTitle>
              <DialogDescription>
                The payment has been successfully allocated to the selected invoices.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center p-6">
              <div className="bg-green-100 text-green-800 rounded-full p-3">
                <CheckCircle2 className="h-8 w-8" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setConfirmationOpen(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}