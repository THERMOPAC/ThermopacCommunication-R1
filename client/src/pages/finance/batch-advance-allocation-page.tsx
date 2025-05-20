import { useState, useMemo, useEffect } from 'react';
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
import { Input } from "@/components/ui/input";
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
  DollarSign, 
  ChevronsUp, 
  Filter, 
  Search, 
  Wallet, 
  FilePlus,
  FileText,
  Loader2, 
  CheckCircle2,
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
  DialogTrigger,
} from "@/components/ui/dialog";

export default function BatchAdvanceAllocationPage() {
  const { toast } = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // Query available advance payments
  const {
    data: advancePayments,
    isLoading: advancesLoading,
    error: advancesError,
    refetch: refetchAdvances
  } = useQuery({
    queryKey: ['/api/finance/payments/unallocated-advances', paymentTypeFilter],
    queryFn: async () => {
      const endpoint = paymentTypeFilter 
        ? `/api/finance/payments/unallocated-advances?paymentType=${paymentTypeFilter}` 
        : '/api/finance/payments/unallocated-advances';
      
      const response = await apiRequest('GET', endpoint);
      return response.json();
    },
    enabled: true
  });

  // Query available invoices with outstanding amounts
  const {
    data: outstandingInvoices,
    isLoading: invoicesLoading,
    error: invoicesError,
    refetch: refetchInvoices
  } = useQuery({
    queryKey: ['/api/finance/invoices/outstanding', selectedCustomerId, paymentTypeFilter],
    queryFn: async () => {
      let endpoint = '/api/finance/invoices/outstanding';
      const params = [];
      
      if (selectedCustomerId) {
        params.push(`customerId=${selectedCustomerId}`);
      }
      
      if (paymentTypeFilter) {
        params.push(`invoiceType=${paymentTypeFilter}`);
      }
      
      if (params.length > 0) {
        endpoint += '?' + params.join('&');
      }
      
      const response = await apiRequest('GET', endpoint);
      return response.json();
    },
    enabled: true
  });

  // Query all customers
  const {
    data: customers,
    isLoading: customersLoading
  } = useQuery({
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
        description: `Applied advance payments to ${result.results.length} invoices.`,
        variant: "default",
      });
      
      // Refetch data
      refetchAdvances();
      refetchInvoices();
      
      // Close the dialog
      setConfirmDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Batch Allocation Failed",
        description: error.message || "Failed to apply advance payments. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Filter advance payments by customer if selected
  const filteredAdvancePayments = useMemo(() => {
    if (!advancePayments?.advances || !Array.isArray(advancePayments.advances)) {
      return [];
    }
    
    if (!selectedCustomerId) {
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
    
    if (!selectedCustomerId) {
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
    
    const grouped = advancePayments.advances.reduce((acc, payment) => {
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
    
    const grouped = outstandingInvoices.invoices.reduce((acc, invoice) => {
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
    if (!selectedCustomerId) {
      toast({
        title: "Customer Selection Required",
        description: "Please select a customer first",
        variant: "destructive",
      });
      return;
    }
    
    setConfirmDialogOpen(true);
  };

  // Execute batch allocation
  const confirmBatchAllocation = () => {
    if (!selectedCustomerId) {
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
              value={selectedCustomerId || ""}
              onValueChange={(value) => setSelectedCustomerId(value || null)}
            >
              <SelectTrigger id="customer-select" className="w-full">
                <SelectValue placeholder="Select a customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Customers</SelectItem>
                {customers && customers.map((customer: any) => (
                  <SelectItem 
                    key={customer.id} 
                    value={customer.id.toString()}
                    disabled={!customerHasBoth(customer.id)}
                  >
                    {customer.bpName}
                    {customerHasBoth(customer.id) && !customerHasTypeMatch(customer.id) && " (No matching types)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1">
            <Label htmlFor="payment-type">Invoice/Payment Type</Label>
            <Select
              value={paymentTypeFilter || ""}
              onValueChange={(value) => setPaymentTypeFilter(value || null)}
            >
              <SelectTrigger id="payment-type" className="w-full">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Types</SelectItem>
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
                ) : advancesError || invoicesError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      Failed to load payment data. Please try again later.
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
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {advancesByCustomer.map((customer: any) => {
                          const outstandingData = outstandingByCustomer.find(
                            c => c.customerId === customer.customerId
                          );
                          
                          // Skip customers without outstanding invoices
                          if (!outstandingData) return null;
                          
                          // Check if there's a type match
                          const hasTypeMatch = Array.from(customer.paymentTypes).some(
                            type => outstandingData.invoiceTypes.has(type)
                          );
                          
                          return (
                            <TableRow key={customer.customerId}>
                              <TableCell className="font-medium">
                                {customer.customerName}
                              </TableCell>
                              <TableCell>
                                {customer.advancePayments.length}
                              </TableCell>
                              <TableCell>
                                {outstandingData.invoices.length}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {Array.from(customer.paymentTypes).map((type: any) => (
                                    <Badge key={type} variant="outline">
                                      {type}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {Array.from(outstandingData.invoiceTypes).map((type: any) => (
                                    <Badge key={type} variant="outline">
                                      {type}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium text-green-600">
                                {formatRupees(customer.totalUnallocated)}
                              </TableCell>
                              <TableCell className="text-right font-medium text-red-600">
                                {formatRupees(outstandingData.totalOutstanding)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedCustomerId(customer.customerId.toString())}
                                  disabled={!hasTypeMatch}
                                >
                                  {hasTypeMatch ? "Select" : "No Type Match"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        
                        {advancesByCustomer.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              No advance payments found. Create an advance payment first.
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
          
          <TabsContent value="all-advances">
            <Card>
              <CardHeader>
                <CardTitle>Available Advance Payments</CardTitle>
                <CardDescription>
                  All unallocated advance payments in the system
                </CardDescription>
              </CardHeader>
              <CardContent>
                {advancesLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-2">Loading advance payments...</span>
                  </div>
                ) : advancesError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      Failed to load advance payments. Please try again later.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reference Number</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Payment Date</TableHead>
                          <TableHead>Payment Method</TableHead>
                          <TableHead>Payment Type</TableHead>
                          <TableHead className="text-right">Total Amount</TableHead>
                          <TableHead className="text-right">Unallocated Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAdvancePayments.map((payment: any) => (
                          <TableRow key={payment.id}>
                            <TableCell className="font-medium">
                              {payment.referenceNumber}
                            </TableCell>
                            <TableCell>
                              {payment.customerName}
                            </TableCell>
                            <TableCell>
                              {formatDate(payment.paymentDate)}
                            </TableCell>
                            <TableCell>
                              {payment.paymentMethod}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {payment.paymentType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatRupees(payment.amount)}
                            </TableCell>
                            <TableCell className="text-right font-medium text-green-600">
                              {formatRupees(payment.unallocatedAmount)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={payment.allocationStatus === 'Unallocated' ? 'default' : 'secondary'}>
                                {payment.allocationStatus}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        
                        {filteredAdvancePayments.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              No advance payments found. Create an advance payment first.
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
          
          <TabsContent value="all-invoices">
            <Card>
              <CardHeader>
                <CardTitle>Outstanding Invoices</CardTitle>
                <CardDescription>
                  All invoices with balances due
                </CardDescription>
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-2">Loading outstanding invoices...</span>
                  </div>
                ) : invoicesError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      Failed to load invoices. Please try again later.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice Number</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Issue Date</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Invoice Type</TableHead>
                          <TableHead className="text-right">Total Amount</TableHead>
                          <TableHead className="text-right">Outstanding Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInvoices.map((invoice: any) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">
                              <a 
                                href={`/finance/invoices/${invoice.id}`}
                                className="text-primary hover:underline"
                              >
                                {invoice.invoiceNumber}
                              </a>
                            </TableCell>
                            <TableCell>
                              {invoice.customerName}
                            </TableCell>
                            <TableCell>
                              {formatDate(invoice.issueDate)}
                            </TableCell>
                            <TableCell>
                              {formatDate(invoice.dueDate)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {invoice.invoiceType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatRupees(invoice.totalAmount)}
                            </TableCell>
                            <TableCell className="text-right font-medium text-red-600">
                              {formatRupees(invoice.outstandingAmount)}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={invoice.status === 'Paid' 
                                  ? 'success' 
                                  : invoice.status === 'Partially Paid' 
                                    ? 'warning' 
                                    : 'default'
                                }
                              >
                                {invoice.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        
                        {filteredInvoices.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              No outstanding invoices found.
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
      </div>
      
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Batch Allocation</DialogTitle>
            <DialogDescription>
              This will automatically apply all matching advance payments to outstanding invoices for the selected customer.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-md">
                <h4 className="font-medium mb-2">Customer</h4>
                <p>
                  {customers?.find((c: any) => c.id.toString() === selectedCustomerId)?.bpName || 'Selected Customer'}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 p-4 rounded-md border border-green-100">
                  <h4 className="font-medium mb-2 text-green-700">Available Advances</h4>
                  <p className="text-2xl font-semibold text-green-700">
                    {advancesByCustomer.find((c: any) => c.customerId.toString() === selectedCustomerId)?.advancePayments.length || 0}
                  </p>
                  <p className="text-sm text-green-600 mt-1">
                    Total: {formatRupees(advancesByCustomer.find((c: any) => c.customerId.toString() === selectedCustomerId)?.totalUnallocated || 0)}
                  </p>
                </div>
                
                <div className="bg-orange-50 p-4 rounded-md border border-orange-100">
                  <h4 className="font-medium mb-2 text-orange-700">Outstanding Invoices</h4>
                  <p className="text-2xl font-semibold text-orange-700">
                    {outstandingByCustomer.find((c: any) => c.customerId.toString() === selectedCustomerId)?.invoices.length || 0}
                  </p>
                  <p className="text-sm text-orange-600 mt-1">
                    Total: {formatRupees(outstandingByCustomer.find((c: any) => c.customerId.toString() === selectedCustomerId)?.totalOutstanding || 0)}
                  </p>
                </div>
              </div>
              
              <div className="bg-yellow-50 p-4 rounded-md border border-yellow-100">
                <h4 className="font-medium mb-2 text-yellow-700 flex items-center">
                  <AlertOctagon className="h-4 w-4 mr-2" />
                  Important Notes
                </h4>
                <ul className="text-sm text-yellow-700 list-disc pl-5 space-y-1">
                  <li>Only advance payments with matching invoice types will be applied</li>
                  <li>Payments will be applied oldest invoice first</li>
                  <li>This action cannot be undone</li>
                </ul>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setConfirmDialogOpen(false)}
              disabled={batchApplyMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmBatchAllocation}
              disabled={batchApplyMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {batchApplyMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm Allocation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}