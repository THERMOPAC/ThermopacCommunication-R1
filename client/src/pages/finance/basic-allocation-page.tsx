import { useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Define types
type Payment = {
  id: number;
  paymentReference: string;
  paymentType: 'Product' | 'Service';
  paymentDate: string;
  amount: number;
  allocatedAmount: number;
  remainingAmount: number;
  currency: string;
  status: string;
  customerName: string;
};

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
  status: string;
  customerName: string;
};

export default function BasicAllocationPage() {
  // State management
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [allocationAmount, setAllocationAmount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { toast } = useToast();

  // Format currency values
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Fetch unallocated payments
  const { data: paymentsData, isLoading: paymentsLoading, refetch: refetchPayments } = useQuery({
    queryKey: ['/api/finance/unallocated-advances'],
    select: (data) => {
      const typedData = data as { advances: Payment[] };
      return typedData?.advances || [];
    }
  });

  // Fetch outstanding invoices
  const { data: invoicesData, isLoading: invoicesLoading, refetch: refetchInvoices } = useQuery({
    queryKey: ['/api/finance/outstanding-invoices', selectedPayment?.paymentType],
    queryFn: async () => {
      if (!selectedPayment?.paymentType) {
        return [];
      }
      
      const response = await fetch(
        `${window.location.origin}/api/finance/outstanding-invoices?invoiceType=${selectedPayment.paymentType}`
      );
      
      const data = await response.json();
      return data.invoices || [];
    },
    enabled: !!selectedPayment?.paymentType
  });

  // Handle allocation button click
  const handleAllocate = async () => {
    // Validate input
    if (!selectedPayment) {
      toast({
        title: "No Payment Selected",
        description: "Please select a payment to allocate funds from.",
        variant: "destructive"
      });
      return;
    }

    if (!selectedInvoice) {
      toast({
        title: "No Invoice Selected",
        description: "Please select an invoice to allocate funds to.",
        variant: "destructive"
      });
      return;
    }

    if (!allocationAmount || allocationAmount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid allocation amount greater than zero.",
        variant: "destructive"
      });
      return;
    }

    if (allocationAmount > selectedPayment.remainingAmount) {
      toast({
        title: "Insufficient Funds",
        description: `Allocation amount (${formatCurrency(allocationAmount)}) exceeds remaining payment amount (${formatCurrency(selectedPayment.remainingAmount)}).`,
        variant: "destructive"
      });
      return;
    }

    if (allocationAmount > selectedInvoice.outstandingAmount) {
      toast({
        title: "Excessive Allocation",
        description: `Allocation amount (${formatCurrency(allocationAmount)}) exceeds outstanding invoice amount (${formatCurrency(selectedInvoice.outstandingAmount)}).`,
        variant: "destructive"
      });
      return;
    }

    // Reset status
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      // Use the ultra-simple allocation API
      const response = await fetch(`${window.location.origin}/api/finance/ultra-simple/allocate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          paymentId: selectedPayment.id,
          invoiceId: selectedInvoice.id,
          amount: allocationAmount
        }),
        credentials: 'include'
      });

      // Get text response first
      const responseText = await response.text();
      
      // Parse as JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse response:', responseText);
        throw new Error('Invalid response from server');
      }

      if (!data.success) {
        throw new Error(data.message || 'Failed to allocate payment');
      }

      // Success
      setSuccess('Payment allocated successfully!');
      toast({
        title: "Allocation Successful",
        description: "The payment has been allocated to the invoice.",
      });

      // Reset form
      setAllocationAmount(0);
      
      // Refetch data
      refetchPayments();
      refetchInvoices();
      
    } catch (err) {
      console.error('Allocation error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      toast({
        title: "Allocation Failed",
        description: err instanceof Error ? err.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-6 px-4 md:px-6 w-full max-w-[calc(100vw-280px)] overflow-x-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Basic Payment Allocation</h1>
        <p className="text-muted-foreground">
          A simplified tool to allocate payments to invoices
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Payment</CardTitle>
            <CardDescription>Choose a payment with available funds</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentsLoading ? (
              <div className="flex justify-center p-4">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : paymentsData && paymentsData.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentsData.map((payment) => (
                      <TableRow 
                        key={payment.id}
                        className={selectedPayment?.id === payment.id ? "bg-muted" : ""}
                      >
                        <TableCell>{payment.paymentReference}</TableCell>
                        <TableCell>{payment.customerName}</TableCell>
                        <TableCell>{payment.paymentType}</TableCell>
                        <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(payment.remainingAmount)}</TableCell>
                        <TableCell>
                          <Button
                            variant={selectedPayment?.id === payment.id ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => {
                              setSelectedPayment(payment);
                              setSelectedInvoice(null);
                            }}
                          >
                            {selectedPayment?.id === payment.id ? "Selected" : "Select"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center p-4 text-muted-foreground">
                No unallocated payments available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invoice Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Invoice</CardTitle>
            <CardDescription>
              Choose an invoice to allocate funds to
              {selectedPayment ? ` (${selectedPayment.paymentType} type)` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedPayment ? (
              <div className="text-center p-4 text-muted-foreground">
                Please select a payment first
              </div>
            ) : invoicesLoading ? (
              <div className="flex justify-center p-4">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : invoicesData && invoicesData.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesData.map((invoice: Invoice) => (
                      <TableRow 
                        key={invoice.id}
                        className={selectedInvoice?.id === invoice.id ? "bg-muted" : ""}
                      >
                        <TableCell>{invoice.invoiceNumber}</TableCell>
                        <TableCell>{invoice.customerName}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.totalAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.outstandingAmount)}</TableCell>
                        <TableCell>
                          <Button
                            variant={selectedInvoice?.id === invoice.id ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              // Set a default allocation amount
                              const defaultAmount = Math.min(
                                invoice.outstandingAmount,
                                selectedPayment.remainingAmount
                              );
                              setAllocationAmount(defaultAmount);
                            }}
                          >
                            {selectedInvoice?.id === invoice.id ? "Selected" : "Select"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center p-4 text-muted-foreground">
                No outstanding invoices found for {selectedPayment.paymentType} type
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Allocation Form */}
      {selectedPayment && selectedInvoice && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Allocate Payment</CardTitle>
            <CardDescription>
              Allocate funds from {selectedPayment.paymentReference} to invoice {selectedInvoice.invoiceNumber}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Available Amount
                  </label>
                  <div className="p-2 border rounded-md bg-muted">
                    {formatCurrency(selectedPayment.remainingAmount)}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Outstanding Amount
                  </label>
                  <div className="p-2 border rounded-md bg-muted">
                    {formatCurrency(selectedInvoice.outstandingAmount)}
                  </div>
                </div>
                <div>
                  <label htmlFor="allocation-amount" className="block text-sm font-medium mb-1">
                    Allocation Amount
                  </label>
                  <Input
                    id="allocation-amount"
                    type="number"
                    min={0}
                    max={Math.min(selectedPayment.remainingAmount, selectedInvoice.outstandingAmount)}
                    step={0.01}
                    value={allocationAmount}
                    onChange={(e) => setAllocationAmount(parseFloat(e.target.value) || 0)}
                    className="text-right"
                  />
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert variant="default" className="bg-green-50 text-green-800 border-green-200">
                  <Check className="h-4 w-4" />
                  <AlertTitle>Success</AlertTitle>
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end">
                <Button 
                  onClick={handleAllocate}
                  disabled={isSubmitting || !allocationAmount || allocationAmount <= 0}
                >
                  {isSubmitting ? "Processing..." : "Allocate Payment"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}