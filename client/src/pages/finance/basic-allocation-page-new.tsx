import { useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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

// Main component content
function BasicAllocationPageContent() {
  // State management
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [allocationAmount, setAllocationAmount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const { toast } = useToast();

  // Fetch unallocated payments
  const { data: paymentsResponse, isLoading: paymentsLoading } = useQuery({
    queryKey: ['/api/finance/unallocated-advances'],
    queryFn: async () => {
      const response = await fetch('/api/finance/unallocated-advances');
      if (!response.ok) {
        throw new Error('Failed to fetch unallocated payments');
      }
      return response.json();
    }
  });
  
  // Extract the payments array from the response
  const paymentsData = paymentsResponse?.advances || [];

  // Fetch outstanding invoices
  const { data: invoicesResponse, isLoading: invoicesLoading } = useQuery({
    queryKey: ['/api/finance/outstanding-invoices', selectedPayment?.paymentType],
    queryFn: async () => {
      if (!selectedPayment) return { invoices: [] };
      
      const url = new URL('/api/finance/outstanding-invoices', window.location.origin);
      url.searchParams.append('type', selectedPayment.paymentType);
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to fetch outstanding invoices');
      }
      return response.json();
    },
    enabled: !!selectedPayment,
  });
  
  // Extract the invoices array from the response
  const invoicesData = invoicesResponse?.invoices || [];

  // Handle payment selection
  const handleSelectPayment = (payment: Payment) => {
    setSelectedPayment(payment);
    setSelectedInvoice(null);
    setAllocationAmount(0);
    setError(null);
    setSuccess(null);
  };

  // Handle invoice selection
  const handleSelectInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    
    // If payment type doesn't match invoice type, show error
    if (selectedPayment && selectedPayment.paymentType !== invoice.invoiceType) {
      setError(`Cannot allocate ${selectedPayment.paymentType} payment to ${invoice.invoiceType} invoice`);
      return;
    }
    
    setError(null);
    
    // Default allocation amount to the smaller of remaining payment or outstanding invoice
    if (selectedPayment) {
      const suggestedAmount = Math.min(
        selectedPayment.remainingAmount, 
        invoice.outstandingAmount
      );
      setAllocationAmount(parseFloat(suggestedAmount.toFixed(2)));
    }
  };

  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    
    if (isNaN(value) || value <= 0) {
      setAllocationAmount(0);
      return;
    }
    
    if (selectedPayment && selectedInvoice) {
      // Cannot allocate more than what's available
      const maxAmount = Math.min(
        selectedPayment.remainingAmount,
        selectedInvoice.outstandingAmount
      );
      
      if (value > maxAmount) {
        setAllocationAmount(maxAmount);
        setError(`Cannot allocate more than ${maxAmount} ${selectedPayment.currency}`);
      } else {
        setAllocationAmount(value);
        setError(null);
      }
    }
  };

  // Handle allocation submission
  const handleAllocate = async () => {
    if (!selectedPayment || !selectedInvoice || allocationAmount <= 0) {
      setError("Please select a payment, invoice, and enter a valid amount");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch('/api/finance/ultra-simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentId: selectedPayment.id,
          invoiceId: selectedInvoice.id,
          amount: allocationAmount,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to allocate payment');
      }
      
      setSuccess(`Successfully allocated ${allocationAmount} ${selectedPayment.currency} from payment ${selectedPayment.paymentReference} to invoice ${selectedInvoice.invoiceNumber}`);
      
      // Clear selection and refresh data
      setSelectedPayment(null);
      setSelectedInvoice(null);
      setAllocationAmount(0);
      
      // Show toast notification
      toast({
        title: "Payment Allocated",
        description: `${allocationAmount} ${selectedPayment.currency} allocated successfully`,
        variant: "default",
      });
    } catch (err: any) {
      console.error("Allocation error:", err);
      setError(err.message || "An error occurred during allocation");
      toast({
        title: "Allocation Failed",
        description: err.message || "An error occurred during allocation",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-6 px-4 md:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Basic Payment Allocation</h1>
        <p className="text-muted-foreground">
          A simplified tool to allocate payments to invoices
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Payment Selection Card */}
        <Card>
          <CardHeader>
            <CardTitle>Select Payment</CardTitle>
            <CardDescription>Choose a payment with available funds</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
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
                  {paymentsLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">Loading payments...</TableCell>
                    </TableRow>
                  ) : paymentsData?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">No unallocated payments found</TableCell>
                    </TableRow>
                  ) : (
                    paymentsData?.map((payment: Payment) => (
                      <TableRow key={payment.id} className={selectedPayment?.id === payment.id ? 'bg-muted/50' : ''}>
                        <TableCell>{payment.paymentReference}</TableCell>
                        <TableCell>{payment.customerName}</TableCell>
                        <TableCell>{payment.paymentType}</TableCell>
                        <TableCell className="text-right">{payment.amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{payment.remainingAmount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant={selectedPayment?.id === payment.id ? "default" : "outline"}
                            onClick={() => handleSelectPayment(payment)}
                          >
                            Select
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Selection Card (only shown when payment is selected) */}
        {selectedPayment && (
          <Card>
            <CardHeader>
              <CardTitle>Select Invoice</CardTitle>
              <CardDescription>
                Choose an invoice to allocate payment {selectedPayment.paymentReference} ({selectedPayment.remainingAmount.toFixed(2)} {selectedPayment.currency} available)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center">Loading invoices...</TableCell>
                      </TableRow>
                    ) : invoicesData?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center">
                          No outstanding invoices found for {selectedPayment.paymentType} payment type
                        </TableCell>
                      </TableRow>
                    ) : (
                      invoicesData?.map((invoice: Invoice) => (
                        <TableRow key={invoice.id} className={selectedInvoice?.id === invoice.id ? 'bg-muted/50' : ''}>
                          <TableCell>{invoice.invoiceNumber}</TableCell>
                          <TableCell>{invoice.customerName}</TableCell>
                          <TableCell>{invoice.invoiceType}</TableCell>
                          <TableCell className="text-right">{invoice.totalAmount.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{invoice.outstandingAmount.toFixed(2)}</TableCell>
                          <TableCell>
                            <Button 
                              size="sm" 
                              variant={selectedInvoice?.id === invoice.id ? "default" : "outline"}
                              onClick={() => handleSelectInvoice(invoice)}
                            >
                              Select
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Allocation Form Card (only shown when both payment and invoice are selected) */}
        {selectedPayment && selectedInvoice && (
          <Card>
            <CardHeader>
              <CardTitle>Allocate Payment</CardTitle>
              <CardDescription>
                Allocate from {selectedPayment.paymentReference} to {selectedInvoice.invoiceNumber}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert>
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
    </div>
  );
}

export default function BasicAllocationPage() {
  return (
    <Layout>
      <BasicAllocationPageContent />
    </Layout>
  );
}