import { useState } from "react";
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
  outstandingAmount: number;
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
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Fetch outstanding invoices
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['/api/finance/outstanding-invoices'],
    queryFn: async () => {
      const response = await fetch('/api/finance/outstanding-invoices');
      if (!response.ok) {
        throw new Error('Failed to fetch invoices');
      }
      return response.json();
    }
  });

  // Process data
  const payments = paymentsData?.advances || [];
  const invoices = invoicesData?.invoices || [];

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

    if (amount > selectedInvoice.outstandingAmount) {
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
    ? Math.min(selectedPayment.unallocatedAmount, selectedInvoice.outstandingAmount)
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedPayment?.id === payment.id
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedPayment(payment)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{payment.paymentReference}</p>
                        <p className="text-sm text-muted-foreground">
                          {payment.customerName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(payment.paymentDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          {payment.currency} {payment.unallocatedAmount.toLocaleString()}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                          {payment.paymentMethod}
                        </Badge>
                      </div>
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
              Select an invoice to allocate to ({invoices.length} available)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No outstanding invoices found
              </p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {invoices.map((invoice: OutstandingInvoice) => (
                  <div
                    key={invoice.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedInvoice?.id === invoice.id
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{invoice.invoiceNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {invoice.customerName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Due: {new Date(invoice.dueDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          {invoice.currency} {invoice.outstandingAmount.toLocaleString()}
                        </p>
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
                    Outstanding: {selectedInvoice.currency} {selectedInvoice.outstandingAmount.toLocaleString()}
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