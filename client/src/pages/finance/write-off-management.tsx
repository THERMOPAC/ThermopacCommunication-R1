import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import Layout from '@/components/layout';
import { canManage } from '@shared/roles';

// UI Components
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// Icons
import { 
  ChevronDown, 
  ChevronUp, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Plus, 
  FileText, 
  DollarSign,
  CalendarClock,
  User 
} from 'lucide-react';

// Create write-off form schema
const writeOffFormSchema = z.object({
  invoiceId: z.coerce.number().positive({ message: "Please select an invoice" }),
  amount: z.coerce.number().positive({ message: "Amount must be greater than 0" }),
  reason: z.string().min(3, { message: "Reason must be at least 3 characters" }),
  notes: z.string().optional(),
});

// Approval form schema
const approvalFormSchema = z.object({
  status: z.enum(['Approved', 'Rejected'], { required_error: "Please select a status" }),
  notes: z.string().optional(),
});

type WriteOff = {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  originalInvoiceAmount: string | number;
  reason: string;
  notes: string | null;
  dateCreated: string;
  createdBy: {
    id: number;
    name: string;
  };
  status: string;
  approvedBy: {
    id: number;
    name: string;
  } | null;
  approvalDate: string | null;
  currency: string;
};

type Invoice = {
  id: number;
  invoiceNumber: string;
  customerId: number;
  totalAmount: string;
  currency: string;
  status: string;
  outstandingAmount?: number;
};

const WriteOffManagementPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedWriteOff, setSelectedWriteOff] = useState<WriteOff | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  // Format currency values
  const formatCurrency = (amount: number | string, currency: string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `${currency} ${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format dates
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Fetch write-offs with optional status filter
  const { data: writeOffs = [], isLoading } = useQuery({
    queryKey: ['/api/finance/write-offs', activeTab],
    queryFn: async () => {
      const status = activeTab === 'all' ? undefined : activeTab === 'pending' ? 'Pending' : activeTab === 'approved' ? 'Approved' : 'Rejected';
      const response = await fetch(`/api/finance/write-offs${status ? `?status=${status}` : ''}`);
      if (!response.ok) throw new Error('Failed to fetch write-offs');
      return response.json();
    }
  });

  // Fetch invoices with outstanding balances for the create form
  const { data: invoices = [] } = useQuery({
    queryKey: ['/api/finance/invoices'],
    queryFn: async () => {
      const response = await fetch('/api/finance/invoices?status=Open');
      if (!response.ok) throw new Error('Failed to fetch invoices');
      return response.json();
    },
    enabled: createDialogOpen, // Only fetch when create dialog is open
  });

  // Create form
  const createForm = useForm({
    resolver: zodResolver(writeOffFormSchema),
    defaultValues: {
      invoiceId: 0,
      amount: 0,
      reason: '',
      notes: '',
    }
  });

  // Approval form
  const approvalForm = useForm({
    resolver: zodResolver(approvalFormSchema),
    defaultValues: {
      status: undefined,
      notes: '',
    }
  });

  // Selected invoice data for the create form
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Handle invoice selection change
  const handleInvoiceChange = (invoiceId: number) => {
    const invoice = invoices.find((inv: Invoice) => inv.id === invoiceId);
    setSelectedInvoice(invoice || null);
    if (invoice) {
      // Set default amount to the outstanding amount of the invoice
      createForm.setValue('amount', invoice.outstandingAmount || parseFloat(invoice.totalAmount));
    }
  };

  // Create write-off mutation
  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof writeOffFormSchema>) => {
      const response = await apiRequest('/api/finance/write-offs', 'POST', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create write-off');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Write-off created",
        description: "Your write-off request has been successfully submitted.",
      });
      setCreateDialogOpen(false);
      createForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/finance/write-offs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create write-off",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Approve/reject write-off mutation
  const approvalMutation = useMutation({
    mutationFn: async (data: { id: number; status: 'Approved' | 'Rejected'; notes?: string }) => {
      const response = await apiRequest(`/api/finance/write-offs/${data.id}`, 'PATCH', { 
        status: data.status, 
        notes: data.notes
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update write-off status');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Write-off updated",
        description: "The write-off status has been successfully updated.",
      });
      setApprovalDialogOpen(false);
      approvalForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/finance/write-offs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update write-off",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Create form submission handler
  const onCreateSubmit = (values: z.infer<typeof writeOffFormSchema>) => {
    createMutation.mutate(values);
  };

  // Approval form submission handler
  const onApprovalSubmit = (values: z.infer<typeof approvalFormSchema>) => {
    if (!selectedWriteOff) return;
    approvalMutation.mutate({
      id: selectedWriteOff.id,
      status: values.status,
      notes: values.notes
    });
  };

  // Toggle expanded row
  const toggleRowExpansion = (id: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Filter write-offs based on active tab
  const filteredWriteOffs = writeOffs;

  // Count by status for badges
  const pendingCount = writeOffs.filter((wo: WriteOff) => wo.status === 'Pending').length;
  const approvedCount = writeOffs.filter((wo: WriteOff) => wo.status === 'Approved').length;
  const rejectedCount = writeOffs.filter((wo: WriteOff) => wo.status === 'Rejected').length;

  // Check if user can approve write-offs
  const canApprove = user && canManage(user);

  // Get status variant for badge styling
  const getStatusVariant = (status: string) => {
    if (status === 'Approved') return 'default';
    if (status === 'Rejected') return 'destructive';
    return 'outline';
  };

  return (
    <Layout>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Write-off Management</h1>
            <p className="text-muted-foreground">
              Manage invoice write-offs by creating, approving, or rejecting them
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (
              <div>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <div className="flex justify-between items-center mb-4">
                    <TabsList>
                      <TabsTrigger value="pending" className="flex gap-2">
                        <Clock className="h-4 w-4" />
                        Pending
                        <Badge variant="outline">{pendingCount}</Badge>
                      </TabsTrigger>
                      <TabsTrigger value="approved" className="flex gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Approved
                        <Badge variant="outline">{approvedCount}</Badge>
                      </TabsTrigger>
                      <TabsTrigger value="rejected" className="flex gap-2">
                        <XCircle className="h-4 w-4" />
                        Rejected
                        <Badge variant="outline">{rejectedCount}</Badge>
                      </TabsTrigger>
                    </TabsList>
                    
                    <Button onClick={() => setCreateDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Write-off
                    </Button>
                  </div>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead style={{ width: '50px' }}></TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        {activeTab === "pending" && canApprove && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWriteOffs.map((writeOff: WriteOff) => (
                        <React.Fragment key={writeOff.id}>
                          <TableRow>
                            <TableCell>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => toggleRowExpansion(writeOff.id)}
                              >
                                {expandedRows[writeOff.id] ? 
                                  <ChevronUp className="h-4 w-4" /> : 
                                  <ChevronDown className="h-4 w-4" />
                                }
                              </Button>
                            </TableCell>
                            <TableCell>{writeOff.invoiceNumber}</TableCell>
                            <TableCell>{writeOff.customerName}</TableCell>
                            <TableCell>{formatCurrency(writeOff.amount, writeOff.currency)}</TableCell>
                            <TableCell>
                              <div className="max-w-[200px] truncate" title={writeOff.reason}>
                                {writeOff.reason}
                              </div>
                            </TableCell>
                            <TableCell>{formatDate(writeOff.dateCreated)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={getStatusVariant(writeOff.status)}
                                className={writeOff.status === "Approved" ? "bg-green-600 text-white" : ""}
                              >
                                {writeOff.status === "Approved" && <CheckCircle className="mr-1 h-3 w-3" />}
                                {writeOff.status === "Rejected" && <XCircle className="mr-1 h-3 w-3" />}
                                {writeOff.status === "Pending" && <Clock className="mr-1 h-3 w-3" />}
                                {writeOff.status}
                              </Badge>
                            </TableCell>
                            {activeTab === "pending" && canApprove && (
                              <TableCell>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    setSelectedWriteOff(writeOff);
                                    setApprovalDialogOpen(true);
                                  }}
                                >
                                  Review
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>

                          {expandedRows[writeOff.id] && (
                            <TableRow key={`details-${writeOff.id}`} className="bg-muted/50">
                              <TableCell colSpan={activeTab === "pending" && canApprove ? 8 : 7}>
                                <div className="p-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div>
                                      <h4 className="font-medium text-sm">Write-off Details</h4>
                                      <div className="space-y-2 mt-2">
                                        <div className="flex items-start gap-2">
                                          <DollarSign className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                          <div>
                                            <div className="text-sm font-medium">Original Invoice Amount</div>
                                            <div className="text-sm">{formatCurrency(writeOff.originalInvoiceAmount, writeOff.currency)}</div>
                                          </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                          <CalendarClock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                          <div>
                                            <div className="text-sm font-medium">Created On</div>
                                            <div className="text-sm">{formatDate(writeOff.dateCreated)}</div>
                                          </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                          <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                          <div>
                                            <div className="text-sm font-medium">Created By</div>
                                            <div className="text-sm">{writeOff.createdBy.name || 'Unknown'}</div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div>
                                      <h4 className="font-medium text-sm">Notes</h4>
                                      <p className="text-sm mt-2">
                                        {writeOff.notes || 'No additional notes provided.'}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  {writeOff.status !== "Pending" && (
                                    <div className="mt-4 pt-4 border-t">
                                      <h4 className="font-medium text-sm mb-2">Approval Details</h4>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex items-start gap-2">
                                          <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                          <div>
                                            <div className="text-sm font-medium">Processed By</div>
                                            <div className="text-sm">{writeOff.approvedBy?.name || 'Unknown'}</div>
                                          </div>
                                        </div>
                                        {writeOff.approvalDate && (
                                          <div className="flex items-start gap-2">
                                            <CalendarClock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                            <div>
                                              <div className="text-sm font-medium">Processed On</div>
                                              <div className="text-sm">{formatDate(writeOff.approvalDate)}</div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </Tabs>
              </div>
            )}

            {/* Create Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Create New Write-off</DialogTitle>
                  <DialogDescription>
                    Create a write-off request for an invoice with an outstanding amount
                  </DialogDescription>
                </DialogHeader>
                
                <div>
                  <Form {...createForm}>
                    <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                      <FormField
                        control={createForm.control}
                        name="invoiceId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Invoice</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                field.onChange(parseInt(value));
                                handleInvoiceChange(parseInt(value));
                              }}
                              defaultValue={field.value?.toString()}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select an invoice" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {invoices.map((invoice: Invoice) => (
                                  <SelectItem key={invoice.id} value={invoice.id.toString()}>
                                    {invoice.invoiceNumber} - {formatCurrency(invoice.outstandingAmount || invoice.totalAmount, invoice.currency)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {selectedInvoice && (
                        <div className="bg-muted p-3 rounded-md mb-4">
                          <h4 className="text-sm font-medium mb-2">Invoice Information</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex flex-col">
                              <span className="text-muted-foreground">Total Amount:</span>
                              <span>{formatCurrency(selectedInvoice.totalAmount, selectedInvoice.currency)}</span>
                            </div>
                            {selectedInvoice.outstandingAmount !== undefined && (
                              <div className="flex flex-col">
                                <span className="text-muted-foreground">Outstanding Amount:</span>
                                <span>{formatCurrency(selectedInvoice.outstandingAmount, selectedInvoice.currency)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <FormField
                        control={createForm.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Write-off Amount</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.01" 
                                {...field} 
                                onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={createForm.control}
                        name="reason"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Reason</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormDescription>
                              Provide a brief reason for this write-off
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={createForm.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Additional Notes</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                value={field.value || ''}
                                placeholder="Enter any additional details or context (optional)" 
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
                          onClick={() => setCreateDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending}>
                          {createMutation.isPending ? "Creating..." : "Create Write-off"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </div>
              </DialogContent>
            </Dialog>

            {/* Approval Dialog */}
            <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Review Write-off Request</DialogTitle>
                  <DialogDescription>
                    Approve or reject this write-off request
                  </DialogDescription>
                </DialogHeader>
                
                <div>
                  {selectedWriteOff && (
                    <div className="mb-6">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">Invoice Number</span>
                          <span className="font-medium">{selectedWriteOff.invoiceNumber}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">Customer</span>
                          <span className="font-medium">{selectedWriteOff.customerName}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">Original Amount</span>
                          <span className="font-medium">{formatCurrency(selectedWriteOff.originalInvoiceAmount, selectedWriteOff.currency)}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">Write-off Amount</span>
                          <span className="font-medium">{formatCurrency(selectedWriteOff.amount, selectedWriteOff.currency)}</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col mb-4">
                        <span className="text-sm text-muted-foreground">Reason</span>
                        <span>{selectedWriteOff.reason}</span>
                      </div>
                      
                      {selectedWriteOff.notes && (
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">Additional Notes</span>
                          <span>{selectedWriteOff.notes}</span>
                        </div>
                      )}
                      
                      <Separator className="my-4" />
                    </div>
                  )}
                  
                  <Form {...approvalForm}>
                    <form onSubmit={approvalForm.handleSubmit(onApprovalSubmit)} className="space-y-4">
                      <FormField
                        control={approvalForm.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Decision</FormLabel>
                            <FormControl>
                              <div className="flex gap-4">
                                <Button
                                  type="button"
                                  variant={field.value === 'Approved' ? 'default' : 'outline'}
                                  className={field.value === 'Approved' ? 'bg-green-600 text-white' : ''}
                                  onClick={() => field.onChange('Approved')}
                                >
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Approve
                                </Button>
                                <Button
                                  type="button"
                                  variant={field.value === 'Rejected' ? 'destructive' : 'outline'}
                                  onClick={() => field.onChange('Rejected')}
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Reject
                                </Button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={approvalForm.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Comments</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                value={field.value || ''}
                                placeholder="Add any comments about your decision (optional)" 
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
                          onClick={() => setApprovalDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={approvalMutation.isPending || !approvalForm.watch('status')}>
                          {approvalMutation.isPending ? "Processing..." : "Submit Decision"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default WriteOffManagementPage;