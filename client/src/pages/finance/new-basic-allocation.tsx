import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/layout";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Types
interface UnallocatedPayment {
  id: number;
  paymentReference: string;
  customerId: number;
  customerName: string;
  paymentDate: string;
  amount: number;
  unallocatedAmount: number;
  paymentMethod: string;
  paymentType: string;
  currency: string;
  notes?: string;
}

interface OutstandingInvoice {
  id: number;
  invoiceNumber: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  outstanding_amount: number;
  currency: string;
  invoiceType: string;
}

export default function NewBasicAllocation() {
  return (
    <Layout>
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Payment Allocation</h1>
          <p className="text-muted-foreground">
            Allocate advance payments to outstanding invoices
          </p>
        </div>
        <NewBasicAllocationContent />
      </div>
    </Layout>
  );
}

function NewBasicAllocationContent() {
  const [selectedPayment, setSelectedPayment] = useState<UnallocatedPayment | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<OutstandingInvoice | null>(null);
  const [allocationAmount, setAllocationAmount] = useState<string>("");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Auto-calculate allocation amount when both payment and invoice are selected
  useEffect(() => {
    if (selectedPayment && selectedInvoice) {
      const paymentAmount = selectedPayment.unallocatedAmount;
      const invoiceAmount = Number(selectedInvoice.outstanding_amount || selectedInvoice.totalAmount || 0);
      
      // Use the smaller of the two amounts
      const autoAmount = Math.min(paymentAmount, invoiceAmount);
      setAllocationAmount(autoAmount.toString());
    } else {
      setAllocationAmount("");
    }
  }, [selectedPayment, selectedInvoice]);

  // Fetch unallocated payments
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['/api/finance/unallocated-advances'],
    queryFn: async () => {
      const response = await fetch('/api/finance/unallocated-advances');
      if (!response.ok) {
        throw new Error('Failed to fetch payments');
      }
      return response.json();
    }
  });

  // Fetch outstanding invoices using the working API
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['/api/simple-finance/invoices-list'],
    queryFn: async () => {
      const response = await fetch('/api/simple-finance/invoices-list');
      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }
      return response.json();
    }
  });

  // Process data
  const allPayments = paymentsData?.advances || [];
  const allInvoices = Array.isArray(invoicesData) ? invoicesData : [];

  // Debug log to see what data we're getting
  console.log('Invoices data:', allInvoices.slice(0, 3));

  // Get unique customers from both payments and invoices
  const allCustomers = new Set([
    ...allPayments.map((p: UnallocatedPayment) => p.customerName),
    ...allInvoices.map((i: OutstandingInvoice) => i.customerName)
  ]);
  const uniqueCustomers = Array.from(allCustomers).sort();

  // Filter data based on selected customer
  const payments = selectedCustomer === "all" 
    ? allPayments 
    : allPayments.filter((p: UnallocatedPayment) => p.customerName === selectedCustomer);
    
  const invoices = selectedCustomer === "all"
    ? allInvoices
    : allInvoices.filter((i: OutstandingInvoice) => i.customerName === selectedCustomer);

  // Filter invoices based on selected payment type (Product/Service matching)
  const filteredInvoices = selectedPayment 
    ? invoices.filter((i: OutstandingInvoice) => i.invoiceType === selectedPayment.paymentType)
    : invoices;

  // Allocation mutation
  const allocationMutation = useMutation({
    mutationFn: async (data: {
      paymentId: number;
      invoiceId: number;
      amount: number;
    }) => {
      const response = await fetch('/api/finance/allocate-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error('Failed to allocate payment');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment allocated successfully!",
      });
      
      // Reset form
      setSelectedPayment(null);
      setSelectedInvoice(null);
      setAllocationAmount("");
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/finance/unallocated-advances'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/outstanding-invoices'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleAllocate = () => {
    if (!selectedPayment || !selectedInvoice || !allocationAmount) {
      toast({
        title: "Error",
        description: "Please select a payment, invoice, and enter allocation amount",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(allocationAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid allocation amount",
        variant: "destructive",
      });
      return;
    }

    if (amount > selectedPayment.unallocatedAmount) {
      toast({
        title: "Error",
        description: "Allocation amount cannot exceed unallocated payment amount",
        variant: "destructive",
      });
      return;
    }

    const invoiceOutstanding = Number(selectedInvoice.outstanding_amount || selectedInvoice.totalAmount || 0);
    if (amount > invoiceOutstanding) {
      toast({
        title: "Error",
        description: "Allocation amount cannot exceed outstanding invoice amount",
        variant: "destructive",
      });
      return;
    }

    allocationMutation.mutate({
      paymentId: selectedPayment.id,
      invoiceId: selectedInvoice.id,
      amount: amount,
    });
  };

  const maxAllocation = selectedPayment && selectedInvoice 
    ? Math.min(selectedPayment.unallocatedAmount, Number(selectedInvoice.outstanding_amount || selectedInvoice.totalAmount || 0))
    : 0;

  if (paymentsLoading || invoicesLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Loading Payments...</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Loading Invoices...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Customer Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Filter by Customer</CardTitle>
          <CardDescription>
            Select a customer to filter payments and invoices, or view all
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium min-w-[100px]">Customer:</label>
            <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select customer to filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {uniqueCustomers.map((customer) => (
                  <SelectItem key={customer} value={customer}>
                    {customer}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCustomer !== "all" && (
              <Button 
                variant="outline" 
                onClick={() => setSelectedCustomer("all")}
                size="sm"
              >
                Clear Filter
              </Button>
            )}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Showing {payments.length} payments and {filteredInvoices.length} invoices
            {selectedCustomer !== "all" && ` for ${selectedCustomer}`}
            {selectedPayment && ` (${selectedPayment.paymentType} type only)`}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {/* Unallocated Payments */}
        <Card>
          <CardHeader>
            <CardTitle>Unallocated Payments</CardTitle>
            <CardDescription>
              Select a payment to allocate ({payments.length} available)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No unallocated payments found
              </p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {payments.map((payment: UnallocatedPayment) => (
                  <div
                    key={payment.id}
                    className={`p-3 border rounded-lg transition-colors ${
                      selectedPayment?.id === payment.id
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-4 flex-1 text-sm">
                        <span className="font-medium">IRM: {payment.paymentReference}</span>
                        <span className="text-muted-foreground">|</span>
                        <span className="font-medium">ID: {payment.id}</span>
                        <span className="text-muted-foreground">|</span>
                        <span className="truncate max-w-[200px]">{payment.customerName}</span>
                        <span className="text-muted-foreground">|</span>
                        <span>{new Date(payment.paymentDate).toLocaleDateString()}</span>
                        <span className="text-muted-foreground">|</span>
                        <span className="font-medium">{payment.currency} {payment.unallocatedAmount.toLocaleString()}</span>
                        <span className="text-muted-foreground">|</span>
                        <Badge variant="outline" className="text-xs">
                          {payment.paymentType}
                        </Badge>
                        <span className="text-muted-foreground">|</span>
                        <Badge variant="secondary" className="text-xs">
                          {payment.paymentMethod}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant={selectedPayment?.id === payment.id ? "default" : "outline"}
                        onClick={() => setSelectedPayment(payment)}
                        className="ml-4"
                      >
                        {selectedPayment?.id === payment.id ? "Selected" : "Select"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Outstanding Invoices */}
        <Card>
          <CardHeader>
            <CardTitle>Outstanding Invoices</CardTitle>
            <CardDescription>
              {selectedPayment 
                ? `Select an invoice to allocate to (${filteredInvoices.length} ${selectedPayment.paymentType} type invoices available)`
                : "Select a payment above first to see matching invoices"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredInvoices.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                {selectedPayment 
                  ? `No ${selectedPayment.paymentType} type invoices found`
                  : "No outstanding invoices found"
                }
              </p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredInvoices.map((invoice: OutstandingInvoice) => (
                  <div
                    key={invoice.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedInvoice?.id === invoice.id
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-4 flex-1 text-sm">
                        <span className="font-medium">Invoice: {invoice.invoiceNumber}</span>
                        <span className="text-muted-foreground">|</span>
                        <span className="truncate max-w-[200px]">{invoice.customerName}</span>
                        <span className="text-muted-foreground">|</span>
                        <span>Due: {new Date(invoice.dueDate).toLocaleDateString()}</span>
                        <span className="text-muted-foreground">|</span>
                        <span className="font-medium">{invoice.currency} {Number(invoice.outstanding_amount || invoice.totalAmount || 0).toLocaleString()}</span>
                        <span className="text-muted-foreground">|</span>
                        <Badge variant="outline" className="text-xs">
                          {invoice.invoiceType}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Allocation Section */}
      {selectedPayment && selectedInvoice && (
        <Card>
          <CardHeader>
            <CardTitle>Allocate Payment</CardTitle>
            <CardDescription>
              Allocate payment to invoice
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Selected Payment</label>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">{selectedPayment.paymentReference}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedPayment.customerName}
                  </p>
                  <p className="text-sm">
                    Available: {selectedPayment.currency} {selectedPayment.unallocatedAmount.toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Selected Invoice</label>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-medium">{selectedInvoice.invoiceNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedInvoice.customerName}
                  </p>
                  <p className="text-sm">
                    Outstanding: {selectedInvoice.currency} {(selectedInvoice.outstandingAmount || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Allocation Amount</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={allocationAmount}
                    onChange={(e) => setAllocationAmount(e.target.value)}
                    placeholder="Enter amount"
                    max={maxAllocation}
                    step="0.01"
                  />
                  <Button
                    variant="outline"
                    onClick={() => setAllocationAmount(maxAllocation.toString())}
                  >
                    Max ({maxAllocation.toLocaleString()})
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Maximum allocation: {selectedPayment.currency} {maxAllocation.toLocaleString()}
                </p>
              </div>

              <Button 
                onClick={handleAllocate}
                disabled={allocationMutation.isPending || !allocationAmount}
                className="w-full"
              >
                {allocationMutation.isPending ? 'Allocating...' : 'Allocate Payment'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}