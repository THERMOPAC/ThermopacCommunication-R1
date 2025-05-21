import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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

const WriteOffManagementPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("pending");
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

  // Toggle expanded row
  const toggleRowExpansion = (id: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

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
                <div className="flex justify-between items-center mb-4">
                  <TabsList>
                    <TabsTrigger 
                      value="pending" 
                      onClick={() => setActiveTab("pending")}
                      className={activeTab === "pending" ? "bg-primary text-primary-foreground" : ""}
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Pending ({pendingCount})
                    </TabsTrigger>
                    <TabsTrigger 
                      value="approved" 
                      onClick={() => setActiveTab("approved")}
                      className={activeTab === "approved" ? "bg-primary text-primary-foreground" : ""}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approved ({approvedCount})
                    </TabsTrigger>
                    <TabsTrigger 
                      value="rejected" 
                      onClick={() => setActiveTab("rejected")}
                      className={activeTab === "rejected" ? "bg-primary text-primary-foreground" : ""}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Rejected ({rejectedCount})
                    </TabsTrigger>
                  </TabsList>
                  
                  <Button>
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
                            >
                              Review
                            </Button>
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