import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import Layout from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Check, ChevronRight, Circle, FileText, Filter, Plus, Search, Loader2, CheckCircle2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

// Define types
interface Invoice {
  id: number;
  invoiceNumber: string;
  customer: {
    id: number;
    name: string;
  };
  date: string;
  dueDate: string;
  amount: number;
  outstandingAmount: number;
  currency: string;
  status: 'Paid' | 'Partially Paid' | 'Unpaid' | 'Overdue';
  type: 'Product' | 'Service';
}

interface WriteOff {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  originalInvoiceAmount: number;
  reason: string;
  notes: string | null;
  dateCreated: string;
  createdBy: {
    id: number;
    name: string;
  };
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: {
    id: number;
    name: string;
  } | null;
  approvalDate?: string | null;
  currency: string;
}

// Form schema for creating write-offs
const writeOffFormSchema = z.object({
  invoiceId: z.number({
    required_error: "Please select an invoice",
  }),
  amount: z.number({
    required_error: "Amount is required",
    invalid_type_error: "Amount must be a number",
  }).positive("Amount must be greater than 0"),
  reason: z.string({
    required_error: "Reason is required",
  }).min(3, {
    message: "Reason must be at least 3 characters",
  }),
  notes: z.string().optional(),
});

type WriteOffFormValues = z.infer<typeof writeOffFormSchema>;

// Sample data for demonstration
const sampleInvoices: Invoice[] = [
  {
    id: 1,
    invoiceNumber: 'INV-2022-001',
    customer: {
      id: 101,
      name: 'ABC Manufacturing Ltd'
    },
    date: '2022-04-15',
    dueDate: '2022-05-15',
    amount: 95000,
    outstandingAmount: 25000,
    currency: 'INR',
    status: 'Partially Paid',
    type: 'Product'
  },
  {
    id: 2,
    invoiceNumber: 'INV-2022-002',
    customer: {
      id: 102,
      name: 'XYZ Industries'
    },
    date: '2022-03-25',
    dueDate: '2022-04-25',
    amount: 85000,
    outstandingAmount: 85000,
    currency: 'INR',
    status: 'Overdue',
    type: 'Service'
  },
  {
    id: 3,
    invoiceNumber: 'INV-2022-003',
    customer: {
      id: 103,
      name: 'Sunshine Enterprises'
    },
    date: '2022-02-18',
    dueDate: '2022-03-18',
    amount: 65000,
    outstandingAmount: 15000,
    currency: 'INR',
    status: 'Partially Paid',
    type: 'Product'
  },
  {
    id: 4,
    invoiceNumber: 'INV-2022-004',
    customer: {
      id: 104,
      name: 'Global Solutions Inc'
    },
    date: '2022-01-10',
    dueDate: '2022-02-10',
    amount: 55000,
    outstandingAmount: 5000,
    currency: 'INR',
    status: 'Partially Paid',
    type: 'Service'
  },
  {
    id: 5,
    invoiceNumber: 'INV-2022-005',
    customer: {
      id: 105,
      name: 'Tech Innovators Ltd'
    },
    date: '2021-12-05',
    dueDate: '2022-01-05',
    amount: 45000,
    outstandingAmount: 8000,
    currency: 'INR',
    status: 'Overdue',
    type: 'Product'
  }
];

const sampleWriteOffs: WriteOff[] = [
  {
    id: 1,
    invoiceId: 1,
    invoiceNumber: 'INV-2022-001',
    customerName: 'ABC Manufacturing Ltd',
    amount: 5000,
    originalInvoiceAmount: 95000,
    reason: 'Goodwill Adjustment',
    notes: 'Customer has been long-term partner, adjusting small amount as goodwill',
    dateCreated: '2022-06-15',
    createdBy: {
      id: 1,
      name: 'John Smith'
    },
    status: 'Approved',
    approvedBy: {
      id: 2,
      name: 'Jane Doe'
    },
    approvalDate: '2022-06-18',
    currency: 'INR'
  },
  {
    id: 2,
    invoiceId: 3,
    invoiceNumber: 'INV-2022-003',
    customerName: 'Sunshine Enterprises',
    amount: 2500,
    originalInvoiceAmount: 65000,
    reason: 'Disputed Amount',
    notes: 'Customer disputed this portion due to quality concerns',
    dateCreated: '2022-06-10',
    createdBy: {
      id: 1,
      name: 'John Smith'
    },
    status: 'Pending',
    currency: 'INR'
  },
  {
    id: 3,
    invoiceId: 5,
    invoiceNumber: 'INV-2022-005',
    customerName: 'Tech Innovators Ltd',
    amount: 3000,
    originalInvoiceAmount: 45000,
    reason: 'Rounding Difference',
    notes: 'Adjustment for rounding differences in currency conversion',
    dateCreated: '2022-05-25',
    createdBy: {
      id: 3,
      name: 'Robert Johnson'
    },
    status: 'Rejected',
    approvedBy: {
      id: 2,
      name: 'Jane Doe'
    },
    approvalDate: '2022-05-27',
    currency: 'INR'
  }
];

export default function WriteOffManagementPage() {
  const [selectedTab, setSelectedTab] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedWriteOff, setSelectedWriteOff] = useState<WriteOff | null>(null);
  const [writeOffAction, setWriteOffAction] = useState<'approve' | 'reject' | null>(null);
  const { toast } = useToast();

  // Create form
  const form = useForm<WriteOffFormValues>({
    resolver: zodResolver(writeOffFormSchema),
    defaultValues: {
      amount: 0,
      reason: '',
      notes: '',
    },
  });

  // Format currency
  const formatCurrency = (amount: number, currency: string = 'INR') => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'PP');
  };

  // Get invoices with outstanding amounts
  const { data: invoices = [], isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['/api/finance/invoices/outstanding'],
    queryFn: async () => {
      // In a real app, this would be an API call
      // Get invoices with outstanding amounts
      return sampleInvoices.filter(invoice => invoice.outstandingAmount > 0);
    }
  });

  // Get write-offs
  const { data: writeOffs = [], isLoading: isLoadingWriteOffs } = useQuery({
    queryKey: ['/api/finance/write-offs', selectedTab],
    queryFn: async () => {
      // In a real app, this would be an API call
      // Filter based on selected tab
      switch (selectedTab) {
        case 'pending':
          return sampleWriteOffs.filter(wo => wo.status === 'Pending');
        case 'approved':
          return sampleWriteOffs.filter(wo => wo.status === 'Approved');
        case 'rejected':
          return sampleWriteOffs.filter(wo => wo.status === 'Rejected');
        default:
          return sampleWriteOffs;
      }
    }
  });

  // Filter write-offs by search term
  const filteredWriteOffs = writeOffs.filter(writeOff => 
    writeOff.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    writeOff.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    writeOff.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Create write-off mutation
  const createWriteOffMutation = useMutation({
    mutationFn: async (values: WriteOffFormValues) => {
      // In a real app, this would be an API call
      console.log('Creating write-off:', values);
      return {
        id: Math.floor(Math.random() * 1000),
        invoiceId: values.invoiceId,
        invoiceNumber: selectedInvoice?.invoiceNumber || '',
        customerName: selectedInvoice?.customer.name || '',
        amount: values.amount,
        originalInvoiceAmount: selectedInvoice?.amount || 0,
        reason: values.reason,
        notes: values.notes || null,
        dateCreated: new Date().toISOString(),
        createdBy: {
          id: 1,
          name: 'John Smith' // This would be the logged-in user
        },
        status: 'Pending',
        currency: selectedInvoice?.currency || 'INR'
      };
    },
    onSuccess: (data) => {
      toast({
        title: "Write-off created",
        description: `Write-off for ${formatCurrency(data.amount, data.currency)} has been submitted for approval.`,
      });
      setCreateDialogOpen(false);
      form.reset();
      setSelectedInvoice(null);
      queryClient.invalidateQueries({ queryKey: ['/api/finance/write-offs'] });
    },
    onError: (error) => {
      toast({
        title: "Error creating write-off",
        description: "There was an error creating the write-off. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Update write-off status mutation
  const updateWriteOffStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: 'Approved' | 'Rejected' }) => {
      // In a real app, this would be an API call
      console.log(`${status} write-off:`, id);
      return {
        success: true
      };
    },
    onSuccess: () => {
      const action = writeOffAction === 'approve' ? 'approved' : 'rejected';
      toast({
        title: `Write-off ${action}`,
        description: `The write-off for invoice ${selectedWriteOff?.invoiceNumber} has been ${action}.`,
      });
      setConfirmDialogOpen(false);
      setSelectedWriteOff(null);
      setWriteOffAction(null);
      queryClient.invalidateQueries({ queryKey: ['/api/finance/write-offs'] });
    },
    onError: (error) => {
      toast({
        title: "Error updating write-off",
        description: "There was an error updating the write-off status. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Handle invoice selection for write-off
  const handleInvoiceSelect = (invoiceId: string) => {
    const invoice = invoices.find(inv => inv.id === Number(invoiceId));
    setSelectedInvoice(invoice || null);
    
    if (invoice) {
      // Pre-fill form with maximum outstanding amount
      form.setValue('invoiceId', invoice.id);
      form.setValue('amount', invoice.outstandingAmount);
    }
  };

  // Handle form submission
  const onSubmit = (values: WriteOffFormValues) => {
    // Validate that amount is not more than outstanding
    if (selectedInvoice && values.amount > selectedInvoice.outstandingAmount) {
      form.setError('amount', {
        type: 'manual',
        message: `Amount cannot exceed outstanding amount of ${formatCurrency(selectedInvoice.outstandingAmount, selectedInvoice.currency)}`
      });
      return;
    }
    
    createWriteOffMutation.mutate(values);
  };

  // Handle write-off approval or rejection
  const handleWriteOffAction = (writeOff: WriteOff, action: 'approve' | 'reject') => {
    setSelectedWriteOff(writeOff);
    setWriteOffAction(action);
    setConfirmDialogOpen(true);
  };

  // Confirm write-off status change
  const confirmStatusChange = () => {
    if (!selectedWriteOff || !writeOffAction) return;
    
    updateWriteOffStatusMutation.mutate({
      id: selectedWriteOff.id,
      status: writeOffAction === 'approve' ? 'Approved' : 'Rejected'
    });
  };

  // Get status badge variant
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
      case 'Approved':
        return <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>;
      case 'Rejected':
        return <Badge variant="outline" className="bg-red-100 text-red-800 hover:bg-red-100">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Write-off Management</h1>
            <p className="text-muted-foreground">Manage invoice write-offs for uncollectible amounts</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setFilterOpen(!filterOpen)} variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Write-off
            </Button>
          </div>
        </div>

        {filterOpen && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Search</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search by invoice #, customer or reason"
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">All Write-offs</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            <WriteOffTable 
              writeOffs={filteredWriteOffs} 
              formatCurrency={formatCurrency} 
              formatDate={formatDate} 
              getStatusBadge={getStatusBadge}
              handleWriteOffAction={handleWriteOffAction}
              isLoading={isLoadingWriteOffs}
            />
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <WriteOffTable 
              writeOffs={filteredWriteOffs} 
              formatCurrency={formatCurrency} 
              formatDate={formatDate} 
              getStatusBadge={getStatusBadge}
              handleWriteOffAction={handleWriteOffAction}
              isLoading={isLoadingWriteOffs}
              showActions={true}
            />
          </TabsContent>

          <TabsContent value="approved" className="space-y-4">
            <WriteOffTable 
              writeOffs={filteredWriteOffs} 
              formatCurrency={formatCurrency} 
              formatDate={formatDate} 
              getStatusBadge={getStatusBadge}
              handleWriteOffAction={handleWriteOffAction}
              isLoading={isLoadingWriteOffs}
              showActions={false}
            />
          </TabsContent>

          <TabsContent value="rejected" className="space-y-4">
            <WriteOffTable 
              writeOffs={filteredWriteOffs} 
              formatCurrency={formatCurrency} 
              formatDate={formatDate} 
              getStatusBadge={getStatusBadge}
              handleWriteOffAction={handleWriteOffAction}
              isLoading={isLoadingWriteOffs}
              showActions={false}
            />
          </TabsContent>
        </Tabs>

        {/* Create Write-off Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create Write-off</DialogTitle>
              <DialogDescription>
                Create a new write-off for an invoice with an outstanding amount.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="invoiceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(Number(value));
                          handleInvoiceSelect(value);
                        }}
                        value={field.value?.toString() || ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an invoice" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {invoices.map((invoice) => (
                            <SelectItem 
                              key={invoice.id} 
                              value={invoice.id.toString()}
                            >
                              {invoice.invoiceNumber} - {invoice.customer.name} ({formatCurrency(invoice.outstandingAmount, invoice.currency)} outstanding)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedInvoice && (
                  <div className="bg-muted p-4 rounded-md space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Invoice Number:</span>
                      <span>{selectedInvoice.invoiceNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Customer:</span>
                      <span>{selectedInvoice.customer.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Original Amount:</span>
                      <span>{formatCurrency(selectedInvoice.amount, selectedInvoice.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Outstanding Amount:</span>
                      <span className="font-bold">{formatCurrency(selectedInvoice.outstandingAmount, selectedInvoice.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Due Date:</span>
                      <span>{formatDate(selectedInvoice.dueDate)}</span>
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Write-off Amount</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        Maximum amount: {selectedInvoice && formatCurrency(selectedInvoice.outstandingAmount, selectedInvoice.currency)}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a reason" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Goodwill Adjustment">Goodwill Adjustment</SelectItem>
                          <SelectItem value="Disputed Amount">Disputed Amount</SelectItem>
                          <SelectItem value="Rounding Difference">Rounding Difference</SelectItem>
                          <SelectItem value="Bad Debt">Bad Debt</SelectItem>
                          <SelectItem value="Settlement Agreement">Settlement Agreement</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Additional notes or explanation for the write-off"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createWriteOffMutation.isPending}>
                    {createWriteOffMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Write-off
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Confirmation Dialog */}
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {writeOffAction === 'approve' ? 'Approve Write-off' : 'Reject Write-off'}
              </DialogTitle>
              <DialogDescription>
                {writeOffAction === 'approve'
                  ? 'Are you sure you want to approve this write-off? This action cannot be undone.'
                  : 'Are you sure you want to reject this write-off? This action cannot be undone.'}
              </DialogDescription>
            </DialogHeader>

            {selectedWriteOff && (
              <div className="py-4">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Invoice:</span>
                    <span>{selectedWriteOff.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Customer:</span>
                    <span>{selectedWriteOff.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Amount:</span>
                    <span className="font-bold">{formatCurrency(selectedWriteOff.amount, selectedWriteOff.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Reason:</span>
                    <span>{selectedWriteOff.reason}</span>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setConfirmDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={confirmStatusChange}
                variant={writeOffAction === 'approve' ? 'default' : 'destructive'}
                disabled={updateWriteOffStatusMutation.isPending}
              >
                {updateWriteOffStatusMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {writeOffAction === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

// Write-off table component
function WriteOffTable({
  writeOffs,
  formatCurrency,
  formatDate,
  getStatusBadge,
  handleWriteOffAction,
  isLoading,
  showActions = false
}: {
  writeOffs: WriteOff[];
  formatCurrency: (amount: number, currency: string) => string;
  formatDate: (date: string) => string;
  getStatusBadge: (status: string) => React.ReactNode;
  handleWriteOffAction: (writeOff: WriteOff, action: 'approve' | 'reject') => void;
  isLoading: boolean;
  showActions?: boolean;
}) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const toggleRow = (id: number) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading write-offs...</span>
      </div>
    );
  }

  if (writeOffs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <div className="rounded-full bg-primary/10 p-3 mb-3">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-lg font-medium">No write-offs found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            There are no write-offs in this category.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            {showActions && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {writeOffs.map((writeOff) => (
            <>
              <TableRow key={writeOff.id} className="cursor-pointer hover:bg-muted/50">
                <TableCell className="p-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleRow(writeOff.id)}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className={`h-4 w-4 transition-transform ${expandedRow === writeOff.id ? 'rotate-90' : ''}`} />
                  </Button>
                </TableCell>
                <TableCell onClick={() => toggleRow(writeOff.id)}>
                  <div className="font-medium">{writeOff.invoiceNumber}</div>
                </TableCell>
                <TableCell onClick={() => toggleRow(writeOff.id)}>{writeOff.customerName}</TableCell>
                <TableCell onClick={() => toggleRow(writeOff.id)}>{writeOff.reason}</TableCell>
                <TableCell onClick={() => toggleRow(writeOff.id)}>{formatDate(writeOff.dateCreated)}</TableCell>
                <TableCell className="text-right font-medium" onClick={() => toggleRow(writeOff.id)}>
                  {formatCurrency(writeOff.amount, writeOff.currency)}
                </TableCell>
                <TableCell onClick={() => toggleRow(writeOff.id)}>
                  {getStatusBadge(writeOff.status)}
                </TableCell>
                {showActions && (
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => handleWriteOffAction(writeOff, 'approve')}
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs text-red-600 hover:text-red-700"
                        onClick={() => handleWriteOffAction(writeOff, 'reject')}
                      >
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
              {expandedRow === writeOff.id && (
                <TableRow>
                  <TableCell colSpan={showActions ? 8 : 7} className="p-0">
                    <div className="p-4 bg-muted/50 border-t">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-medium mb-2">Write-off Details</h4>
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-1 text-sm">
                              <span className="text-muted-foreground">Original Invoice Amount:</span>
                              <span>{formatCurrency(writeOff.originalInvoiceAmount, writeOff.currency)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-sm">
                              <span className="text-muted-foreground">Write-off Amount:</span>
                              <span className="font-medium">{formatCurrency(writeOff.amount, writeOff.currency)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-sm">
                              <span className="text-muted-foreground">Write-off Percentage:</span>
                              <span>
                                {((writeOff.amount / writeOff.originalInvoiceAmount) * 100).toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="text-sm font-medium mb-2">Administrative Details</h4>
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-1 text-sm">
                              <span className="text-muted-foreground">Created By:</span>
                              <span>{writeOff.createdBy.name}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-sm">
                              <span className="text-muted-foreground">Created On:</span>
                              <span>{formatDate(writeOff.dateCreated)}</span>
                            </div>
                            {writeOff.approvedBy && (
                              <div className="grid grid-cols-2 gap-1 text-sm">
                                <span className="text-muted-foreground">
                                  {writeOff.status === 'Approved' ? 'Approved By:' : 'Rejected By:'}
                                </span>
                                <span>{writeOff.approvedBy.name}</span>
                              </div>
                            )}
                            {writeOff.approvalDate && (
                              <div className="grid grid-cols-2 gap-1 text-sm">
                                <span className="text-muted-foreground">
                                  {writeOff.status === 'Approved' ? 'Approved On:' : 'Rejected On:'}
                                </span>
                                <span>{formatDate(writeOff.approvalDate)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {writeOff.notes && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium mb-2">Notes</h4>
                          <p className="text-sm bg-background p-3 rounded-md border">{writeOff.notes}</p>
                        </div>
                      )}
                      
                      <div className="mt-4 flex justify-end">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/finance/invoices/${writeOff.invoiceId}`}>
                            View Original Invoice
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}