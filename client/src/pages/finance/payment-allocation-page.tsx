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
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { AlertCircle, Download, ArrowUpDown, Info, CheckCircle2, Edit2, Trash2, Pencil } from 'lucide-react';

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

// Define edit allocation schema
const editAllocationSchema = z.object({
  amount: z.number().min(0.01, 'Amount must be greater than 0')
});

type AllocationFormValues = z.infer<typeof allocationSchema>;
type EditAllocationFormValues = z.infer<typeof editAllocationSchema>;

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
  const [editAllocationId, setEditAllocationId] = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAllocationId, setDeleteAllocationId] = useState<number | null>(null);
  const { toast } = useToast();

  // Format currency values
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
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

  // Setup edit form
  const editForm = useForm<EditAllocationFormValues>({
    resolver: zodResolver(editAllocationSchema),
    defaultValues: {
      amount: 0
    }
  });

  // Get outstanding invoices that can receive payment allocations
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['/api/finance/outstanding-invoices', selectedPayment?.paymentType, selectedPayment?.customerName],
    queryFn: async () => {
      // Only fetch invoices if a payment is selected
      if (!selectedPayment) return { invoices: [] };
      
      const url = new URL('/api/finance/outstanding-invoices', window.location.origin);
      
      // Add query parameters for filtering
      if (selectedPayment.paymentType) {
        url.searchParams.append('invoiceType', selectedPayment.paymentType);
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to fetch outstanding invoices');
      }
      return await response.json();
    },
    enabled: !!selectedPayment // Only run this query when a payment is selected
  });

  // Filter invoices based on selected payment
  useEffect(() => {
    if (selectedPayment && invoicesData?.invoices?.length > 0) {
      // Transform API data to match our component's expected format
      const filtered = invoicesData.invoices.map((invoice: any) => ({
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
      // Remove the invoice from selectedInvoices
      setSelectedInvoices(selectedInvoices.filter(i => i.id !== invoice.id));
      
      // Remove from form value
      const currentInvoices = form.getValues('invoices');
      form.setValue(
        'invoices', 
        currentInvoices.filter(i => i.invoiceId !== invoice.id)
      );
    } else {
      // Add the invoice to the selectedInvoices state
      setSelectedInvoices(prevSelected => [...prevSelected, invoice]);
      
      // Calculate the default allocation amount (use full outstanding amount or remaining payment amount, whichever is smaller)
      const defaultAllocationAmount = Math.min(
        invoice.outstandingAmount,
        selectedPayment ? selectedPayment.remainingAmount - getTotalAllocation() : 0
      );
      
      // For debugging
      console.log('Adding invoice with default allocation amount:', defaultAllocationAmount);
      
      // Create a direct allocation entry for this invoice
      handleDirectAllocation(invoice.id, defaultAllocationAmount);
    }
  };
  
  // Handle direct allocation to an invoice
  const handleDirectAllocation = (invoiceId: number, amount: number) => {
    console.log(`Directly allocating ${amount} to invoice ${invoiceId}`);
    
    // Get current invoices
    const currentInvoices = [...form.getValues('invoices')];
    
    // Find if this invoice already has an allocation
    const existingIndex = currentInvoices.findIndex(i => i.invoiceId === invoiceId);
    
    if (existingIndex >= 0) {
      // Update existing allocation
      currentInvoices[existingIndex].allocationAmount = amount;
    } else {
      // Add new allocation
      currentInvoices.push({ 
        invoiceId: invoiceId, 
        allocationAmount: amount 
      });
    }
    
    // Update the form with modified allocations
    form.setValue('invoices', currentInvoices);
    
    // Force form to re-render with updated values
    form.trigger('invoices');
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

  // Edit allocation mutation
  const editAllocationMutation = useMutation({
    mutationFn: async (data: { id: number; amount: number }) => {
      const response = await apiRequest(`/api/finance/allocations/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify({ amount: data.amount }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to update allocation');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Allocation updated successfully'
      });
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/finance/allocations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/unallocated-advances'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/payments'] });
      
      // Close dialog
      setEditDialogOpen(false);
      setEditAllocationId(null);
      editForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update allocation',
        variant: 'destructive'
      });
    }
  });

  // Delete allocation mutation
  const deleteAllocationMutation = useMutation({
    mutationFn: async (allocationId: number) => {
      const response = await apiRequest(`/api/finance/allocations/${allocationId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to delete allocation');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Allocation deleted successfully'
      });
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/finance/allocations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/unallocated-advances'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/payments'] });
      
      // Close dialog
      setDeleteConfirmOpen(false);
      setDeleteAllocationId(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete allocation',
        variant: 'destructive'
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

  // Handle edit allocation submission
  const onEditSubmit = (values: EditAllocationFormValues) => {
    if (editAllocationId) {
      editAllocationMutation.mutate({
        id: editAllocationId,
        amount: values.amount
      });
    }
  };

  // Handle edit allocation click
  const handleEditAllocation = (allocation: Allocation) => {
    setEditAllocationId(allocation.id);
    editForm.setValue('amount', allocation.amount);
    setEditDialogOpen(true);
  };

  // Handle delete allocation click
  const handleDeleteAllocation = (allocation: Allocation) => {
    setDeleteAllocationId(allocation.id);
    setDeleteConfirmOpen(true);
  };

  // Confirm delete allocation
  const confirmDeleteAllocation = () => {
    if (deleteAllocationId) {
      deleteAllocationMutation.mutate(deleteAllocationId);
    }
  };

  // Reset allocation form
  const resetAllocation = () => {
    setSelectedPayment(null);
    setSelectedInvoices([]);
    form.reset();
  };

  // Get payments with unallocated amounts that can be allocated to invoices
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['/api/finance/unallocated-advances'],
    queryFn: async () => {
      const response = await fetch('/api/finance/unallocated-advances');
      if (!response.ok) {
        throw new Error('Failed to fetch unallocated payments');
      }
      return await response.json();
    }
  });

  // Transform the API response to match our component's expected format
  const payments: Payment[] = useMemo(() => {
    if (!paymentsData || !paymentsData.advances) return [];
    
    return paymentsData.advances.map((payment: any) => ({
      id: payment.id,
      paymentReference: payment.paymentReference || payment.irm_no || `PAY-${payment.id}`,
      paymentType: payment.paymentType,
      paymentDate: payment.paymentDate,
      amount: parseFloat(payment.amount),
      allocatedAmount: parseFloat(payment.allocatedAmount || '0'),
      remainingAmount: parseFloat(payment.unallocatedAmount || '0'),
      currency: payment.currency || 'USD',
      status: payment.allocationStatus || 'Unallocated',
      customerName: payment.customerName
    }));
  }, [paymentsData]);

  // Get outstanding invoices that can receive payment allocations
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['/api/finance/outstanding-invoices', selectedPayment?.paymentType, selectedPayment?.customerName],
    queryFn: async () => {
      // Only fetch invoices if a payment is selected
      if (!selectedPayment) return { invoices: [] };
      
      const url = new URL('/api/finance/outstanding-invoices', window.location.origin);
      
      // Add query parameters for filtering
      if (selectedPayment.paymentType) {
        url.searchParams.append('invoiceType', selectedPayment.paymentType);
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to fetch outstanding invoices');
      }
      return await response.json();
    },
    enabled: !!selectedPayment // Only run this query when a payment is selected
  });

  // Get allocations for a specific payment with proper typing
  const getPaymentAllocations = async (paymentId: number): Promise<Allocation[]> => {
    try {
      const response = await fetch(`/api/finance/payments/${paymentId}/allocations`);
      if (!response.ok) {
        console.error('Failed to fetch payment allocations');
        return [];
      }
      const data = await response.json();
      return (data.allocations || []).map((allocation: any) => ({
        id: allocation.id,
        paymentId: allocation.paymentId,
        invoiceId: allocation.invoiceId,
        paymentReference: allocation.paymentReference || `PAY-${allocation.paymentId}`,
        invoiceNumber: allocation.invoiceNumber,
        allocationDate: allocation.allocationDate || allocation.createdAt || new Date().toISOString(),
        amount: parseFloat(allocation.amount || allocation.amountApplied || '0'),
        createdBy: allocation.createdBy || 'System'
      }));
    } catch (error) {
      console.error('Error fetching payment allocations:', error);
      return [];
    }
  };

  // Query to fetch all allocations for management
  const { data: allocationsData, isLoading: allocationsLoading } = useQuery({
    queryKey: ['/api/finance/allocations'],
    queryFn: async () => {
      const response = await fetch('/api/finance/allocations');
      if (!response.ok) {
        throw new Error('Failed to fetch allocations');
      }
      return await response.json();
    }
  });

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold pl-4">Payment Allocation</h1>
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

            {/* Invoice Selection Section - Only visible if a payment is selected */}
            {selectedPayment && (
              <Card>
                <CardHeader>
                  <CardTitle>Select Invoices to Allocate Payment</CardTitle>
                  <CardDescription>
                    Available amount: {formatCurrency(selectedPayment.remainingAmount)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {filteredInvoices.length === 0 ? (
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
                              {filteredInvoices.map(invoice => {
                                const isSelected = selectedInvoices.some(i => i.id === invoice.id);
                                const invoiceFormIndex = form.getValues('invoices')
                                  .findIndex(i => i.invoiceId === invoice.id);
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
                                            defaultValue={invoice.outstandingAmount}
                                            value={form.getValues(`invoices.${invoiceFormIndex}.allocationAmount`) || invoice.outstandingAmount}
                                            onChange={(e) => handleDirectAllocation(invoice.id, parseFloat(e.target.value) || 0)}
                                            className="w-32 text-right"
                                          />
                                          <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="sm" 
                                            className="text-xs"
                                            onClick={() => handleDirectAllocation(invoice.id, invoice.outstandingAmount)}
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

                        {selectedInvoices.length > 0 && (
                          <>
                            <div className="bg-muted p-4 rounded-md">
                              <div className="flex justify-between items-center">
                                <div>
                                  <h3 className="font-semibold">Allocation Summary</h3>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedInvoices.length} invoice(s) selected
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm">Total Allocation</p>
                                  <p className="font-semibold text-lg">
                                    {formatCurrency(getTotalAllocation())}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Remaining after allocation: {formatCurrency(selectedPayment.remainingAmount - getTotalAllocation())}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <FormField
                              control={form.control}
                              name="comment"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Allocation Comment (Optional)</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Add a comment about this allocation" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="flex justify-end gap-4">
                              <Button type="button" variant="outline" onClick={resetAllocation}>
                                Cancel
                              </Button>
                              <Button type="submit">Complete Allocation</Button>
                            </div>
                          </>
                        )}
                      </form>
                    </Form>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Payment Allocation History</CardTitle>
                <CardDescription>
                  View all payment allocations made to invoices
                </CardDescription>
              </CardHeader>
              <CardContent>
                {allocationsLoading ? (
                  <div className="text-center py-4">Loading allocations...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Allocation Date</TableHead>
                          <TableHead>Payment Reference</TableHead>
                          <TableHead>Invoice Number</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Created By</TableHead>
                          <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allocationsData?.allocations?.length > 0 ? (
                          allocationsData.allocations.map((allocation: any) => (
                            <TableRow key={allocation.id}>
                              <TableCell>{format(new Date(allocation.allocationDate || allocation.createdAt), 'dd/MM/yyyy')}</TableCell>
                              <TableCell className="font-medium">{allocation.paymentReference}</TableCell>
                              <TableCell>{allocation.invoiceNumber}</TableCell>
                              <TableCell className="text-right">{formatCurrency(allocation.amount)}</TableCell>
                              <TableCell>{allocation.createdBy || 'System'}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditAllocation({
                                      id: allocation.id,
                                      paymentId: allocation.paymentId,
                                      invoiceId: allocation.invoiceId,
                                      paymentReference: allocation.paymentReference,
                                      invoiceNumber: allocation.invoiceNumber,
                                      allocationDate: allocation.allocationDate || allocation.createdAt,
                                      amount: allocation.amount,
                                      createdBy: allocation.createdBy || 'System'
                                    })}
                                    disabled={editAllocationMutation.isPending}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteAllocation({
                                      id: allocation.id,
                                      paymentId: allocation.paymentId,
                                      invoiceId: allocation.invoiceId,
                                      paymentReference: allocation.paymentReference,
                                      invoiceNumber: allocation.invoiceNumber,
                                      allocationDate: allocation.allocationDate || allocation.createdAt,
                                      amount: allocation.amount,
                                      createdBy: allocation.createdBy || 'System'
                                    })}
                                    disabled={deleteAllocationMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                              No allocations found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
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
                {viewPaymentId && (
                  <span>
                    Viewing allocations for payment 
                    <span className="font-medium">
                      {' '}{payments.find(p => p.id === viewPaymentId)?.paymentReference}
                    </span>
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            
            {viewPaymentId && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-muted p-3 rounded-md">
                    <p className="text-sm font-medium">Total Amount</p>
                    <p className="text-lg">
                      {formatCurrency(payments.find(p => p.id === viewPaymentId)?.amount || 0)}
                    </p>
                  </div>
                  <div className="bg-muted p-3 rounded-md">
                    <p className="text-sm font-medium">Allocated</p>
                    <p className="text-lg">
                      {formatCurrency(payments.find(p => p.id === viewPaymentId)?.allocatedAmount || 0)}
                    </p>
                  </div>
                  <div className="bg-muted p-3 rounded-md">
                    <p className="text-sm font-medium">Remaining</p>
                    <p className="text-lg">
                      {formatCurrency(payments.find(p => p.id === viewPaymentId)?.remainingAmount || 0)}
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="text-sm font-medium mb-2">Allocation Details</h3>
                  {getPaymentAllocations(viewPaymentId).length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Invoice</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Allocated By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getPaymentAllocations(viewPaymentId).map(allocation => (
                          <TableRow key={allocation.id}>
                            <TableCell>{format(new Date(allocation.allocationDate), 'dd/MM/yyyy')}</TableCell>
                            <TableCell>{allocation.invoiceNumber}</TableCell>
                            <TableCell className="text-right">{formatCurrency(allocation.amount)}</TableCell>
                            <TableCell>{allocation.createdBy}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">
                      No allocations have been made for this payment yet.
                    </p>
                  )}
                </div>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setAllocationsDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmation Dialog */}
        <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Allocation Successful
              </DialogTitle>
              <DialogDescription>
                Your payment allocation has been completed successfully
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <p className="text-sm">
                Payment <span className="font-medium">{selectedPayment?.paymentReference}</span> has been allocated to {selectedInvoices.length} invoice(s).
              </p>
              
              <div className="bg-muted p-4 rounded-md">
                <p className="font-medium">Allocation Summary</p>
                <div className="mt-2 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Total allocated:</span>
                    <span className="font-medium">{formatCurrency(getTotalAllocation())}</span>
                  </div>
                  {selectedPayment && (
                    <div className="flex justify-between text-sm">
                      <span>Remaining balance:</span>
                      <span className="font-medium">{formatCurrency(selectedPayment.remainingAmount - getTotalAllocation())}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                onClick={() => {
                  setConfirmationOpen(false);
                  resetAllocation();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Allocation Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Allocation</DialogTitle>
              <DialogDescription>
                Modify the allocation amount
              </DialogDescription>
            </DialogHeader>
            
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allocation Amount</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Enter amount"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setEditDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={editAllocationMutation.isPending}
                  >
                    {editAllocationMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Delete</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this allocation? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmDeleteAllocation}
                disabled={deleteAllocationMutation.isPending}
              >
                {deleteAllocationMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}