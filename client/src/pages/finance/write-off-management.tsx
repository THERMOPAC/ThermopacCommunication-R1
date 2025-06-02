import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import Layout from '@/components/layout';
import { canManage } from '@shared/roles';

// UI Components
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

// Icons
import { 
  ChevronDown, 
  ChevronUp, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Plus 
} from 'lucide-react';

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

// Write-off creation form component
const WriteOffForm = ({ onCancel }: { onCancel: () => void }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState('');
  const [writeOffAmount, setWriteOffAmount] = useState('');
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0]); // Default to today
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');

  // Fetch customers with outstanding invoices
  const { data: customersData = { customers: [] } } = useQuery({
    queryKey: ['/api/simple-finance/customers-with-outstanding'],
  });
  
  const customersWithOutstanding = customersData.customers || [];

  // Fetch outstanding invoices for write-off - load all invoices, then filter by customer
  const { data: outstandingInvoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['/api/finance/outstanding-invoices'],
    queryFn: async () => {
      const response = await fetch('/api/finance/outstanding-invoices');
      if (!response.ok) throw new Error('Failed to fetch outstanding invoices');
      const data = await response.json();
      return data.invoices || [];
    }
  });

  // Since invoice data doesn't contain customer relationship, show all invoices
  // Customer selection is optional for user reference only
  const filteredInvoices = Array.isArray(outstandingInvoices) ? outstandingInvoices : [];

  // Create write-off mutation
  const createWriteOffMutation = useMutation({
    mutationFn: async (writeOffData: any) => {
      const response = await fetch('/api/finance/write-offs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(writeOffData)
      });
      if (!response.ok) throw new Error('Failed to create write-off');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Write-off Created",
        description: "Write-off has been submitted for approval.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/write-offs'] });
      onCancel();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create write-off",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || !writeOffAmount || !reason || !postingDate) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive"
      });
      return;
    }

    const invoice = filteredInvoices.find((inv: any) => inv.id.toString() === selectedInvoice);
    createWriteOffMutation.mutate({
      invoiceId: parseInt(selectedInvoice),
      amount: parseFloat(writeOffAmount),
      reason,
      notes: description,
      currency: invoice?.currency || 'USD',
      postingDate
    });
  };

  const selectedInvoiceData = filteredInvoices.find((inv: any) => inv.id.toString() === selectedInvoice);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="customer">Filter by Customer (Optional)</Label>
          <Select value={selectedCustomer} onValueChange={(value) => {
            setSelectedCustomer(value);
            setSelectedInvoice(''); // Reset invoice selection
            setWriteOffAmount(''); // Reset amount
          }}>
            <SelectTrigger>
              <SelectValue placeholder="All Customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customersWithOutstanding.map((customer: any) => (
                <SelectItem key={customer.id} value={customer.id.toString()}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="invoice">Select Invoice *</Label>
          <Select value={selectedInvoice} onValueChange={(value) => {
            setSelectedInvoice(value);
            // Auto-populate write-off amount with full outstanding amount
            const invoice = filteredInvoices.find((inv: any) => inv.id.toString() === value);
            if (invoice) {
              setWriteOffAmount(invoice.outstandingAmount.toString());
            }
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Choose invoice to write off" />
            </SelectTrigger>
            <SelectContent>
              {filteredInvoices.map((invoice: any) => (
                <SelectItem key={invoice.id} value={invoice.id.toString()}>
                  {invoice.invoiceNumber} - {invoice.customerName} ({invoice.currency} {invoice.outstandingAmount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCustomer && selectedCustomer !== 'all' && filteredInvoices.length === 0 && (
            <p className="text-sm text-gray-500 mt-1">No outstanding invoices for selected customer</p>
          )}
        </div>

        <div>
          <Label htmlFor="amount">Write-off Amount *</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            value={writeOffAmount}
            onChange={(e) => setWriteOffAmount(e.target.value)}
            placeholder={selectedInvoiceData ? `Max: ${selectedInvoiceData.outstandingAmount}` : "0.00"}
            max={selectedInvoiceData?.outstandingAmount}
          />
          {selectedInvoiceData && (
            <p className="text-sm text-muted-foreground mt-1">
              Outstanding: {selectedInvoiceData.currency} {selectedInvoiceData.outstandingAmount}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="postingDate">Posting Date *</Label>
          <Input
            id="postingDate"
            type="date"
            value={postingDate}
            onChange={(e) => setPostingDate(e.target.value)}
          />
        </div>

        <div>
          {/* Empty div for spacing to keep the layout consistent */}
        </div>
      </div>

      <div>
        <Label htmlFor="reason">Reason *</Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger>
            <SelectValue placeholder="Select reason for write-off" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="uncollectible">Uncollectible Debt</SelectItem>
            <SelectItem value="customer_dispute">Customer Dispute</SelectItem>
            <SelectItem value="bankruptcy">Customer Bankruptcy</SelectItem>
            <SelectItem value="small_balance">Small Balance Write-off</SelectItem>
            <SelectItem value="settlement">Settlement Agreement</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="description">Additional Notes</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Provide additional context for this write-off..."
          rows={3}
        />
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" disabled={createWriteOffMutation.isPending}>
          {createWriteOffMutation.isPending ? "Creating..." : "Submit Write-off"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

const WriteOffManagementPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("pending");
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Approve write-off function
  const approveWriteOff = async (writeOffId: number) => {
    try {
      console.log(`Attempting to approve write-off ${writeOffId}`);
      
      const response = await fetch(`/api/simple-finance/approve-writeoff/${writeOffId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      console.log('Approval response:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Approval failed:', errorData);
        throw new Error('Failed to approve write-off');
      }
      
      const responseText = await response.text();
      console.log('Raw response text:', responseText);
      
      let result;
      try {
        result = JSON.parse(responseText);
        console.log('Approval successful:', result);
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', parseError);
        console.log('Response was:', responseText);
        throw new Error('Invalid response from server');
      }
      
      toast({
        title: "Success",
        description: "Write-off approved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/write-offs'] });
    } catch (error) {
      console.error('Approve write-off error:', error);
      toast({
        title: "Error",
        description: "Failed to approve write-off",
        variant: "destructive",
      });
    }
  };

  // Reject write-off function
  const rejectWriteOff = async (writeOffId: number) => {
    try {
      const response = await fetch(`/api/finance/write-offs/${writeOffId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) throw new Error('Failed to reject write-off');
      
      toast({
        title: "Success",
        description: "Write-off rejected successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/write-offs'] });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reject write-off",
        variant: "destructive",
      });
    }
  };

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

  // Fetch ALL write-offs for counting
  const { data: allWriteOffs = [], isLoading: loadingAll } = useQuery({
    queryKey: ['/api/finance/write-offs-all'],
    queryFn: async () => {
      const response = await fetch('/api/finance/write-offs');
      if (!response.ok) throw new Error('Failed to fetch all write-offs');
      const data = await response.json();
      return data;
    }
  });

  // Fetch write-offs with status filter for current tab
  const { data: writeOffs = [], isLoading } = useQuery({
    queryKey: ['/api/finance/write-offs', activeTab],
    queryFn: async () => {
      const status = activeTab === 'all' ? undefined : activeTab === 'pending' ? 'Pending' : activeTab === 'approved' ? 'Approved' : 'Rejected';
      const response = await fetch(`/api/finance/write-offs${status ? `?status=${status}` : ''}`);
      if (!response.ok) throw new Error('Failed to fetch write-offs');
      const data = await response.json();
      console.log("Write-offs data from API:", data);
      return data;
    }
  });

  // Toggle expanded row
  const toggleRowExpansion = (id: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Count by status for badges using ALL write-offs
  const pendingCount = allWriteOffs.filter((wo: WriteOff) => wo.status === 'Pending').length;
  const approvedCount = allWriteOffs.filter((wo: WriteOff) => wo.status === 'Approved').length;
  const rejectedCount = allWriteOffs.filter((wo: WriteOff) => wo.status === 'Rejected').length;

  // Check if user can approve write-offs (allow for superusers and managers)
  const canApprove = user && (user.role === 'Superuser' || user.role === 'Manager' || canManage(user));

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
                {!showCreateForm ? (
                  <>
                    <div className="flex justify-between items-center mb-4">
                      <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList>
                          <TabsTrigger value="pending">
                            <Clock className="h-4 w-4 mr-2" />
                            Pending ({pendingCount})
                          </TabsTrigger>
                          <TabsTrigger value="approved">
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Approved ({approvedCount})
                          </TabsTrigger>
                          <TabsTrigger value="rejected">
                            <XCircle className="h-4 w-4 mr-2" />
                            Rejected ({rejectedCount})
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      
                      <Button onClick={() => setShowCreateForm(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Write-off
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Create New Write-off</h3>
                      <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                        Cancel
                      </Button>
                    </div>
                    <WriteOffForm onCancel={() => setShowCreateForm(false)} />
                  </div>
                )}
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: '50px' }}></TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Additional Notes</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      {activeTab === "pending" && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {writeOffs.map((writeOff: WriteOff) => (
                      <TableRow key={writeOff.id}>
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
                        <TableCell>
                          <div className="max-w-[200px] truncate" title={writeOff.notes || '-'}>
                            {writeOff.notes || '-'}
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
                        {activeTab === "pending" && (
                          <TableCell>
                            <div className="space-x-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="text-green-600 hover:bg-green-50"
                                onClick={() => approveWriteOff(writeOff.id)}
                              >
                                Approve
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="text-red-600 hover:bg-red-50"
                                onClick={() => rejectWriteOff(writeOff.id)}
                              >
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default WriteOffManagementPage;