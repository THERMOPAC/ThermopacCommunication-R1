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

  // Toggle row expansion
  const toggleRowExpansion = (id: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Fetch all write-offs
  const { data: writeOffs, isLoading: writeOffsLoading } = useQuery({
    queryKey: ['/api/finance/write-offs'],
    queryFn: async () => {
      const response = await apiRequest<WriteOff[]>("GET", "/api/finance/write-offs");
      return response as WriteOff[];
    }
  });

  // Fetch outstanding invoices for the creation form
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['/api/finance/invoices', 'outstanding'],
    queryFn: async () => {
      // In a real implementation, we would have an endpoint that returns only outstanding invoices
      // For now, we'll fetch all invoices and assume they have outstanding amounts
      const response = await apiRequest<Invoice[]>("GET", "/api/finance/invoices");
      return (response as Invoice[]).map((invoice: Invoice) => ({
        ...invoice,
        outstandingAmount: parseFloat(invoice.totalAmount)
      }));
    }
  });

  // Create new write-off mutation
  const createWriteOffMutation = useMutation({
    mutationFn: async (data: z.infer<typeof writeOffFormSchema>) => {
      const response = await apiRequest("POST", "/api/finance/write-offs", data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance/write-offs'] });
      setCreateDialogOpen(false);
      toast({
        title: "Write-off created",
        description: "The write-off has been created and is pending approval",
      });
      createForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error creating write-off",
        description: error.message || "An error occurred while creating the write-off",
        variant: "destructive",
      });
    }
  });

  // Approve/reject write-off mutation
  const updateWriteOffStatusMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: z.infer<typeof approvalFormSchema> }) => {
      const response = await apiRequest("PATCH", `/api/finance/write-offs/${id}/status`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance/write-offs'] });
      setApprovalDialogOpen(false);
      toast({
        title: "Write-off updated",
        description: "The write-off status has been updated",
      });
      approvalForm.reset();
      setSelectedWriteOff(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating write-off",
        description: error.message || "An error occurred while updating the write-off",
        variant: "destructive",
      });
    }
  });

  // Create write-off form
  const createForm = useForm<z.infer<typeof writeOffFormSchema>>({
    resolver: zodResolver(writeOffFormSchema),
    defaultValues: {
      invoiceId: undefined,
      amount: undefined,
      reason: "",
      notes: "",
    },
  });

  // Approval form
  const approvalForm = useForm<z.infer<typeof approvalFormSchema>>({
    resolver: zodResolver(approvalFormSchema),
    defaultValues: {
      status: undefined,
      notes: "",
    },
  });

  // Handler for creating a new write-off
  const onCreateSubmit = (values: z.infer<typeof writeOffFormSchema>) => {
    createWriteOffMutation.mutate(values);
  };

  // Handler for approving/rejecting a write-off
  const onApprovalSubmit = (values: z.infer<typeof approvalFormSchema>) => {
    if (!selectedWriteOff) return;
    updateWriteOffStatusMutation.mutate({ id: selectedWriteOff.id, data: values });
  };

  // Set the selected invoice's details when it's selected in the form
  const handleInvoiceChange = (invoiceId: number) => {
    if (!invoices) return;
    
    const selectedInvoice = invoices.find(inv => inv.id === invoiceId);
    if (selectedInvoice) {
      createForm.setValue('amount', selectedInvoice.outstandingAmount || 0);
    }
  };

  // Filter write-offs based on the active tab
  const filteredWriteOffs = writeOffs?.filter((writeOff: WriteOff) => {
    switch (activeTab) {
      case "pending": return writeOff.status === "Pending";
      case "approved": return writeOff.status === "Approved";
      case "rejected": return writeOff.status === "Rejected";
      default: return true;
    }
  }) || [];

  // Count write-offs by status
  const pendingCount = writeOffs?.filter((w: WriteOff) => w.status === "Pending").length || 0;
  const approvedCount = writeOffs?.filter((w: WriteOff) => w.status === "Approved").length || 0;
  const rejectedCount = writeOffs?.filter((w: WriteOff) => w.status === "Rejected").length || 0;

  // Format currency
  const formatCurrency = (amount: number | string, currency: string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR'
    }).format(numAmount);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Determine if the user can approve/reject write-offs
  const canApprove = user && canManage(user.role, 'Manager');

  // Render a loading skeleton when data is being fetched
  if (writeOffsLoading) {
    return (
      <div className="container py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Write-off Management</CardTitle>
            <CardDescription>
              Manage invoice write-offs by creating, approving, or rejecting them
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between mb-6">
              <div className="flex gap-2">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-24" />
              </div>
              <Skeleton className="h-10 w-32" />
            </div>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Write-off Management</CardTitle>
          <CardDescription>
            Manage invoice write-offs by creating, approving, or rejecting them
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between mb-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
              
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="ml-auto" onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Write-off
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px]">
                  <DialogHeader>
                    <DialogTitle>Create New Write-off</DialogTitle>
                    <DialogDescription>
                      Create a write-off request for an invoice with an outstanding amount
                    </DialogDescription>
                  </DialogHeader>
                  
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
                                {invoices?.map(invoice => (
                                  <SelectItem key={invoice.id} value={invoice.id.toString()}>
                                    {invoice.invoiceNumber} - {formatCurrency(invoice.outstandingAmount || 0, invoice.currency)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Select an invoice that has an outstanding amount
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={createForm.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Amount</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.01" 
                                {...field} 
                                onChange={(e) => field.onChange(e.target.valueAsNumber)}
                              />
                            </FormControl>
                            <FormDescription>
                              Enter the amount to be written off
                            </FormDescription>
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
                              <Select
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  if (value === "Other") {
                                    // Clear the field so user can type their own reason
                                    field.onChange("");
                                  }
                                }}
                                defaultValue={field.value}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a reason" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Bad debt">Bad debt</SelectItem>
                                  <SelectItem value="Customer dispute">Customer dispute</SelectItem>
                                  <SelectItem value="Billing error">Billing error</SelectItem>
                                  <SelectItem value="Customer goodwill">Customer goodwill</SelectItem>
                                  <SelectItem value="Partial payment settlement">Partial payment settlement</SelectItem>
                                  <SelectItem value="Currency exchange loss">Currency exchange loss</SelectItem>
                                  <SelectItem value="Other">Other (specify)</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            {field.value === "Other" && (
                              <FormControl>
                                <Input placeholder="Enter custom reason" {...field} />
                              </FormControl>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={createForm.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes (Optional)</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Add any additional notes or context for this write-off request"
                                className="min-h-[80px]"
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
                        <Button 
                          type="submit" 
                          disabled={createWriteOffMutation.isPending}
                        >
                          {createWriteOffMutation.isPending ? "Creating..." : "Create Write-off"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </Tabs>
          </div>

          {filteredWriteOffs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No write-offs found</h3>
              <p className="text-muted-foreground mt-1">
                {activeTab === "pending" 
                  ? "There are no pending write-offs waiting for approval"
                  : activeTab === "approved"
                  ? "No write-offs have been approved yet"
                  : "No write-offs have been rejected yet"}
              </p>
              {activeTab === "pending" && (
                <Button 
                  className="mt-4" 
                  variant="outline" 
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create a Write-off
                </Button>
              )}
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
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
                  {filteredWriteOffs.map((writeOff) => (
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
                            variant={
                              writeOff.status === "Approved" ? "default" :
                              writeOff.status === "Rejected" ? "destructive" :
                              "outline"
                            }
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
                            <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
                              <DialogTrigger asChild>
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
                              </DialogTrigger>
                            </Dialog>
                          </TableCell>
                        )}
                      </TableRow>
                      
                      {expandedRows[writeOff.id] && (
                        <TableRow className="bg-muted/50">
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
                                        <div className="text-sm">{writeOff.createdBy.name}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                
                                {writeOff.status !== "Pending" && (
                                  <div>
                                    <h4 className="font-medium text-sm">Approval Details</h4>
                                    <div className="space-y-2 mt-2">
                                      <div className="flex items-start gap-2">
                                        <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                        <div>
                                          <div className="text-sm font-medium">
                                            {writeOff.status === "Approved" ? "Approved By" : "Rejected By"}
                                          </div>
                                          <div className="text-sm">{writeOff.approvedBy?.name || "Unknown"}</div>
                                        </div>
                                      </div>
                                      {writeOff.approvalDate && (
                                        <div className="flex items-start gap-2">
                                          <CalendarClock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                          <div>
                                            <div className="text-sm font-medium">
                                              {writeOff.status === "Approved" ? "Approved On" : "Rejected On"}
                                            </div>
                                            <div className="text-sm">{formatDate(writeOff.approvalDate)}</div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              {writeOff.notes && (
                                <div className="mt-2">
                                  <h4 className="font-medium text-sm mb-1">Notes:</h4>
                                  <p className="text-sm whitespace-pre-line p-2 border rounded-md bg-background">
                                    {writeOff.notes}
                                  </p>
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
            </div>
          )}

          {/* Approval Dialog */}
          {selectedWriteOff && (
            <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Review Write-off Request</DialogTitle>
                  <DialogDescription>
                    Review and approve or reject this write-off request
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Invoice</Label>
                    <div className="text-sm font-medium">{selectedWriteOff.invoiceNumber}</div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Customer</Label>
                    <div className="text-sm font-medium">{selectedWriteOff.customerName}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Write-off Amount</Label>
                      <div className="text-sm font-medium">{formatCurrency(selectedWriteOff.amount, selectedWriteOff.currency)}</div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Original Invoice Amount</Label>
                      <div className="text-sm font-medium">{formatCurrency(selectedWriteOff.originalInvoiceAmount, selectedWriteOff.currency)}</div>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Reason</Label>
                    <div className="text-sm font-medium">{selectedWriteOff.reason}</div>
                  </div>
                  {selectedWriteOff.notes && (
                    <div className="grid gap-2">
                      <Label>Notes</Label>
                      <div className="text-sm whitespace-pre-line p-2 border rounded-md">{selectedWriteOff.notes}</div>
                    </div>
                  )}
                  
                  <Separator className="my-2" />
                  
                  <Form {...approvalForm}>
                    <form onSubmit={approvalForm.handleSubmit(onApprovalSubmit)}>
                      <FormField
                        control={approvalForm.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem className="mb-4">
                            <FormLabel>Decision</FormLabel>
                            <FormControl>
                              <div className="flex gap-4">
                                <Button
                                  type="button"
                                  variant={field.value === "Approved" ? "default" : "outline"}
                                  className={field.value === "Approved" ? "bg-green-600 hover:bg-green-700" : ""}
                                  onClick={() => field.onChange("Approved")}
                                >
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Approve
                                </Button>
                                <Button
                                  type="button"
                                  variant={field.value === "Rejected" ? "destructive" : "outline"}
                                  onClick={() => field.onChange("Rejected")}
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
                            <FormLabel>Additional Notes (Optional)</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Provide any additional information about your decision"
                                className="min-h-[80px]"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <DialogFooter className="mt-4">
                        <Button type="button" variant="outline" onClick={() => setApprovalDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={updateWriteOffStatusMutation.isPending || !approvalForm.getValues().status}
                        >
                          {updateWriteOffStatusMutation.isPending ? "Submitting..." : "Submit Decision"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WriteOffManagementPage;