import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRupees, formatDate } from "@/lib/utils";
import { 
  CreditCard, 
  Wallet, 
  FileText,
  Loader2, 
  AlertOctagon
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Define data types
type Payment = {
  id: number;
  customerId: number;
  customerName: string;
  paymentNumber: string;
  paymentDate: string;
  paymentType: string;
  amount: string;
  unallocatedAmount: string;
};

type Invoice = {
  id: number;
  customerId: number;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceType: string;
  total: string;
  outstandingAmount: string;
  status: string;
};

type AdvancePaymentsResponse = {
  advances: Payment[];
  totalUnallocatedAmount: string;
  count: number;
};

type OutstandingInvoicesResponse = {
  invoices: Invoice[];
  totalOutstanding: string;
  count: number;
};

type Customer = {
  id: number;
  bpCode: string;
  bpName: string;
};

type CustomerGroup = {
  customerId: number;
  customerName: string;
  advancePayments: Payment[];
  totalUnallocated: number;
  paymentTypes: Set<string>;
};

type InvoiceGroup = {
  customerId: number;
  customerName: string;
  invoices: Invoice[];
  totalOutstanding: number;
  invoiceTypes: Set<string>;
};

export default function BatchAdvanceAllocationPage() {
  const { toast } = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>("all");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // Fetch advance payments for the selected customer
  const {
    data: advancePayments = { advances: [], totalUnallocatedAmount: "0.00", count: 0 } as AdvancePaymentsResponse,
    isLoading: advancesLoading,
    error: advancesError,
    refetch: refetchAdvances
  } = useQuery<AdvancePaymentsResponse>({
    queryKey: ['/api/finance/unallocated-advances', selectedCustomerId, paymentTypeFilter],
    enabled: true,
  });

  // Fetch outstanding invoices for the selected customer
  const {
    data: outstandingInvoices = { invoices: [], totalOutstanding: "0.00", count: 0 } as OutstandingInvoicesResponse,
    isLoading: invoicesLoading,
    error: invoicesError,
    refetch: refetchInvoices
  } = useQuery<OutstandingInvoicesResponse>({
    queryKey: ['/api/finance/outstanding-invoices', selectedCustomerId, paymentTypeFilter],
    enabled: true,
  });

  // Query all customers
  const {
    data: customers = [] as Customer[],
    isLoading: customersLoading
  } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  // Batch apply mutation
  const batchApplyMutation = useMutation({
    mutationFn: async (customerId: number) => {
      return await apiRequest('POST', `/api/finance/customers/${customerId}/apply-advances`);
    },
    onSuccess: async (response) => {
      const result = await response.json();
      
      toast({
        title: "Batch Allocation Successful",
        description: `Applied ${result.uniquePaymentsUsed || 0} advance payments to ${result.uniqueInvoicesUpdated || 0} invoices.`,
        variant: "default",
      });
      
      // Refetch data
      refetchAdvances();
      refetchInvoices();
      
      // Close the dialog
      setConfirmDialogOpen(false);
    },
    onError: async (error: any) => {
      // Try to parse the response error message if available
      let errorMessage = "Failed to apply advance payments. Please try again.";
      
      try {
        if (error.response) {
          const errorData = await error.response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } else if (error.message) {
          errorMessage = error.message;
        }
      } catch (e) {
        console.error("Error parsing error response:", e);
      }
      
      toast({
        title: "Batch Allocation Failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Close the dialog
      setConfirmDialogOpen(false);
    }
  });

  // Filter advance payments by customer if selected
  const filteredAdvancePayments = useMemo(() => {
    if (!advancePayments?.advances || !Array.isArray(advancePayments.advances)) {
      return [];
    }
    
    if (!selectedCustomerId || selectedCustomerId === 'all') {
      return advancePayments.advances;
    }
    
    return advancePayments.advances.filter(
      payment => payment.customerId === parseInt(selectedCustomerId)
    );
  }, [advancePayments, selectedCustomerId]);

  // Filter invoices by customer if selected
  const filteredInvoices = useMemo(() => {
    if (!outstandingInvoices?.invoices || !Array.isArray(outstandingInvoices.invoices)) {
      return [];
    }
    
    if (!selectedCustomerId || selectedCustomerId === 'all') {
      return outstandingInvoices.invoices;
    }
    
    return outstandingInvoices.invoices.filter(
      invoice => invoice.customerId === parseInt(selectedCustomerId)
    );
  }, [outstandingInvoices, selectedCustomerId]);

  // Group advances by customer
  const advancesByCustomer = useMemo(() => {
    if (!advancePayments?.advances || !Array.isArray(advancePayments.advances)) {
      return [];
    }
    
    const grouped = advancePayments.advances.reduce((acc: Record<number, CustomerGroup>, payment) => {
      const customerId = payment.customerId;
      
      if (!acc[customerId]) {
        acc[customerId] = {
          customerId,
          customerName: payment.customerName,
          advancePayments: [],
          totalUnallocated: 0,
          paymentTypes: new Set()
        };
      }
      
      acc[customerId].advancePayments.push(payment);
      acc[customerId].totalUnallocated += parseFloat(payment.unallocatedAmount);
      acc[customerId].paymentTypes.add(payment.paymentType);
      
      return acc;
    }, {});
    
    return Object.values(grouped);
  }, [advancePayments]);

  // Group invoices by customer
  const outstandingByCustomer = useMemo(() => {
    if (!outstandingInvoices?.invoices || !Array.isArray(outstandingInvoices.invoices)) {
      return [];
    }
    
    const grouped = outstandingInvoices.invoices.reduce((acc: Record<number, InvoiceGroup>, invoice) => {
      const customerId = invoice.customerId;
      
      if (!acc[customerId]) {
        acc[customerId] = {
          customerId,
          customerName: invoice.customerName,
          invoices: [],
          totalOutstanding: 0,
          invoiceTypes: new Set()
        };
      }
      
      acc[customerId].invoices.push(invoice);
      acc[customerId].totalOutstanding += parseFloat(invoice.outstandingAmount);
      acc[customerId].invoiceTypes.add(invoice.invoiceType);
      
      return acc;
    }, {});
    
    return Object.values(grouped);
  }, [outstandingInvoices]);

  // Handle apply button click
  const handleBatchApply = () => {
    if (!selectedCustomerId || selectedCustomerId === 'all') {
      toast({
        title: "Customer Selection Required",
        description: "Please select a specific customer before applying advance payments",
        variant: "destructive",
      });
      return;
    }
    
    setConfirmDialogOpen(true);
  };

  // Execute batch allocation
  const confirmBatchAllocation = () => {
    if (!selectedCustomerId || selectedCustomerId === 'all') {
      return;
    }
    
    batchApplyMutation.mutate(parseInt(selectedCustomerId));
  };

  // Check if a customer has both advance payments and outstanding invoices
  const customerHasBoth = (customerId: number) => {
    const hasAdvances = advancesByCustomer.some(c => c.customerId === customerId);
    const hasInvoices = outstandingByCustomer.some(c => c.customerId === customerId);
    return hasAdvances && hasInvoices;
  };

  // Helper to check if there is a type match between a customer's advances and invoices
  const customerHasTypeMatch = (customerId: number) => {
    const advances = advancesByCustomer.find(c => c.customerId === customerId);
    const invoices = outstandingByCustomer.find(c => c.customerId === customerId);
    
    if (!advances || !invoices) return false;
    
    // Check if there's at least one matching type
    return Array.from(advances.paymentTypes).some(type => 
      invoices.invoiceTypes.has(type)
    );
  };

  return (
    <Layout>
      <Helmet>
        <title>Batch Advance Payment Allocation | THERMOPAC Finance</title>
      </Helmet>
      
      <div className="container py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Batch Advance Payment Allocation</h1>
            <p className="text-muted-foreground">
              Allocate advance payments to outstanding invoices in bulk
            </p>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center">
                <Wallet className="mr-2 h-5 w-5" />
                Available Advance Payments
              </CardTitle>
              <CardDescription>
                Unallocated advance payments across all customers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="font-medium text-2xl text-green-600 mb-4">
                {advancePayments?.advances?.length || 0} Advances Available
              </div>
              <div className="text-muted-foreground">
                Total unallocated amount: <span className="font-semibold">{advancePayments?.totalUnallocatedAmount ? formatRupees(advancePayments.totalUnallocatedAmount) : formatRupees(0)}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Outstanding Invoices
              </CardTitle>
              <CardDescription>
                Invoices with balances due from all customers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="font-medium text-2xl text-red-600 mb-4">
                {outstandingInvoices?.invoices?.length || 0} Invoices Pending
              </div>
              <div className="text-muted-foreground">
                Total outstanding amount: <span className="font-semibold">{outstandingInvoices?.totalOutstanding ? formatRupees(outstandingInvoices.totalOutstanding) : formatRupees(0)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Label htmlFor="customer-select">Customer</Label>
            <Select
              value={selectedCustomerId}
              onValueChange={setSelectedCustomerId}
            >
              <SelectTrigger id="customer-select" className="w-full">
                <SelectValue placeholder="Select a customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers && Array.isArray(customers) && customers.map((customer) => (
                  <SelectItem 
                    key={customer.id} 
                    value={customer.id.toString()}
                  >
                    {customer.bpName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1">
            <Label htmlFor="payment-type">Invoice/Payment Type</Label>
            <Select
              value={paymentTypeFilter}
              onValueChange={setPaymentTypeFilter}
            >
              <SelectTrigger id="payment-type" className="w-full">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Product">Product</SelectItem>
                <SelectItem value="Service">Service</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1 flex items-end">
            <Button 
              className="w-full" 
              onClick={handleBatchApply}
              disabled={!selectedCustomerId || batchApplyMutation.isPending}
            >
              {batchApplyMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Allocating...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Apply Advance Payments
                </>
              )}
            </Button>
          </div>
        </div>
        
        <Tabs defaultValue="by-customer" className="space-y-6">
          <TabsList>
            <TabsTrigger value="by-customer">Grouped by Customer</TabsTrigger>
            <TabsTrigger value="all-advances">All Advance Payments</TabsTrigger>
            <TabsTrigger value="all-invoices">All Outstanding Invoices</TabsTrigger>
          </TabsList>
          
          <TabsContent value="by-customer">
            <Card>
              <CardHeader>
                <CardTitle>Customers with Advance Payments</CardTitle>
                <CardDescription>
                  Select a customer to view and allocate their advance payments
                </CardDescription>
              </CardHeader>
              <CardContent>
                {advancesLoading || invoicesLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-2">Loading payment data...</span>
                  </div>
                ) : advancePayments?.advances?.length === 0 && outstandingInvoices?.invoices?.length === 0 ? (
                  <Alert>
                    <AlertTitle>No Data Found</AlertTitle>
                    <AlertDescription>
                      No advance payments or outstanding invoices found matching the selected criteria.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">Customer</TableHead>
                          <TableHead>Advance Payments</TableHead>
                          <TableHead>Outstanding Invoices</TableHead>
                          <TableHead>Payment Types</TableHead>
                          <TableHead>Invoice Types</TableHead>
                          <TableHead className="text-right">Available Amount</TableHead>
                          <TableHead className="text-right">Outstanding Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {advancesByCustomer.map((customer) => {
                          const outstandingData = outstandingByCustomer.find(
                            c => c.customerId === customer.customerId
                          );
                          
                          // Skip customers without outstanding invoices
                          if (!outstandingData) return null;
                          
                          return (
                            <TableRow 
                              key={customer.customerId}
                              onClick={() => setSelectedCustomerId(customer.customerId.toString())}
                              className={`cursor-pointer ${selectedCustomerId === customer.customerId.toString() ? 'bg-accent' : ''}`}
                            >
                              <TableCell className="font-medium">{customer.customerName}</TableCell>
                              <TableCell>{customer.advancePayments.length}</TableCell>
                              <TableCell>{outstandingData.invoices.length}</TableCell>
                              <TableCell>
                                <div className="flex gap-1 flex-wrap">
                                  {Array.from(customer.paymentTypes).map(type => (
                                    <Badge key={type} variant="outline">{type}</Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1 flex-wrap">
                                  {Array.from(outstandingData.invoiceTypes).map(type => (
                                    <Badge key={type} variant="outline">{type}</Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-medium">
                                {formatRupees(customer.totalUnallocated)}
                              </TableCell>
                              <TableCell className="text-right text-red-600 font-medium">
                                {formatRupees(outstandingData.totalOutstanding)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="all-advances">
            <Card>
              <CardHeader>
                <CardTitle>Available Advance Payments</CardTitle>
                <CardDescription>
                  All unallocated advance payments across customers
                </CardDescription>
              </CardHeader>
              <CardContent>
                {advancesLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-2">Loading advance payments...</span>
                  </div>
                ) : filteredAdvancePayments.length === 0 ? (
                  <Alert>
                    <AlertTitle>No Advance Payments Found</AlertTitle>
                    <AlertDescription>
                      No unallocated advance payments found for the selected filters.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Payment Number</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Total Amount</TableHead>
                          <TableHead className="text-right">Unallocated Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAdvancePayments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell className="font-medium">{payment.customerName}</TableCell>
                            <TableCell>{payment.paymentNumber}</TableCell>
                            <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{payment.paymentType}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatRupees(payment.amount)}
                            </TableCell>
                            <TableCell className="text-right text-green-600 font-medium">
                              {formatRupees(payment.unallocatedAmount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="all-invoices">
            <Card>
              <CardHeader>
                <CardTitle>Outstanding Invoices</CardTitle>
                <CardDescription>
                  All invoices with outstanding balances
                </CardDescription>
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-2">Loading outstanding invoices...</span>
                  </div>
                ) : filteredInvoices.length === 0 ? (
                  <Alert>
                    <AlertTitle>No Outstanding Invoices Found</AlertTitle>
                    <AlertDescription>
                      No invoices with outstanding balances found for the selected filters.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Invoice Number</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Total Amount</TableHead>
                          <TableHead className="text-right">Outstanding Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInvoices.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">{invoice.customerName}</TableCell>
                            <TableCell>{invoice.invoiceNumber}</TableCell>
                            <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{invoice.invoiceType}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  invoice.status === "Paid" ? "outline" :
                                  invoice.status === "Partial" ? "secondary" :
                                  "default"
                                }
                              >
                                {invoice.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatRupees(invoice.total)}
                            </TableCell>
                            <TableCell className="text-right text-red-600 font-medium">
                              {formatRupees(invoice.outstandingAmount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Batch Allocation</DialogTitle>
            <DialogDescription>
              This will automatically apply all matching advance payments to
              outstanding invoices for the selected customer.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <h4 className="font-medium">Customer</h4>
              <p>
                {customers.find((c) => c.id.toString() === selectedCustomerId)?.bpName || 'Selected Customer'}
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-green-600">Available Advances</h4>
                <p className="text-2xl font-bold">{filteredAdvancePayments.length}</p>
                <p className="text-sm text-muted-foreground">
                  Total: {formatRupees(
                    filteredAdvancePayments.reduce((total, adv) => 
                      total + parseFloat(adv.unallocatedAmount), 0)
                  )}
                </p>
              </div>
              
              <div>
                <h4 className="font-medium text-red-600">Outstanding Invoices</h4>
                <p className="text-2xl font-bold">{filteredInvoices.length}</p>
                <p className="text-sm text-muted-foreground">
                  Total: {formatRupees(
                    filteredInvoices.reduce((total, inv) => 
                      total + parseFloat(inv.outstandingAmount), 0)
                  )}
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium flex items-center">
                <AlertOctagon className="w-4 h-4 mr-2 text-amber-500" />
                Important Notes
              </h4>
              <ul className="space-y-1 text-sm">
                <li>• Only advance payments with matching invoice types will be applied</li>
                <li>• Payments will be applied oldest invoice first</li>
                <li>• This action cannot be undone</li>
              </ul>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmBatchAllocation} disabled={batchApplyMutation.isPending}>
              {batchApplyMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm Allocation"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}