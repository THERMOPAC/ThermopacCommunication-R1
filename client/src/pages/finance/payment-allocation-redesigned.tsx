import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Payment {
  id: number;
  paymentReference: string;
  customerId: number;
  customerName: string;
  paymentDate: string;
  amount: string;
  allocatedAmount: string;
  unallocatedAmount: string;
  paymentMethod: string;
  paymentType: string;
  currency: string;
  notes: string | null;
  isAdvancePayment: boolean;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  customerId: number;
  customerName: string;
  invoiceDate: string;
  totalAmount: string;
  outstanding_amount: string;
  invoiceType: string;
  currency: string;
  status: string;
}

export default function PaymentAllocationRedesigned() {
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [allocateAmount, setAllocateAmount] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch unallocated payments
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['/api/finance/unallocated-advances'],
  });

  // Fetch outstanding invoices
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['/api/finance/outstanding-invoices'],
    enabled: !!selectedCustomerId,
  });

  const payments: Payment[] = (paymentsData as any)?.advances || [];
  const invoices: Invoice[] = (invoicesData as any)?.invoices || [];

  // Auto-calculate allocation amount when both payment and invoice are selected
  useEffect(() => {
    if (selectedPayment && selectedInvoice) {
      // Check currency match first
      if (selectedPayment.currency !== selectedInvoice.currency) {
        setAllocateAmount('');
        return;
      }

      const paymentUnallocated = parseFloat(selectedPayment.unallocatedAmount);
      const invoiceOutstanding = parseFloat(selectedInvoice.outstanding_amount);

      // Apply the specified logic: if payment unallocated > invoice outstanding, use invoice outstanding
      // If payment unallocated <= invoice outstanding, use payment unallocated
      const calculatedAmount = paymentUnallocated > invoiceOutstanding 
        ? invoiceOutstanding 
        : paymentUnallocated;

      setAllocateAmount(calculatedAmount.toFixed(2));
    } else {
      setAllocateAmount('');
    }
  }, [selectedPayment, selectedInvoice]);

  // Allocate payment mutation
  const allocateMutation = useMutation({
    mutationFn: async (data: { paymentId: number; invoiceId: number; amount: number }) => {
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
      
      // Handle different response types
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return response.json();
      } else {
        // If not JSON, just return success status
        return { success: true };
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment allocated successfully!",
      });
      // Reset selections
      setSelectedPayment(null);
      setSelectedInvoice(null);
      setAllocateAmount('');
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/finance/unallocated-advances'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/outstanding-invoices'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to allocate payment",
        variant: "destructive",
      });
    },
  });

  const handleAllocate = () => {
    if (!selectedPayment || !selectedInvoice || !allocateAmount) {
      toast({
        title: "Error",
        description: "Please select payment, invoice, and enter allocation amount",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(allocateAmount);
    if (amount <= 0) {
      toast({
        title: "Error",
        description: "Allocation amount must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    allocateMutation.mutate({
      paymentId: selectedPayment.id,
      invoiceId: selectedInvoice.id,
      amount: amount,
    });
  };

  // Get unique customers from payments
  const uniqueCustomers = payments.reduce((acc: Array<{id: number, name: string}>, payment) => {
    if (!acc.find(c => c.id === payment.customerId)) {
      acc.push({ id: payment.customerId, name: payment.customerName });
    }
    return acc;
  }, []);

  // Filter payments by selected customer
  const filteredPayments = selectedCustomerId 
    ? payments.filter(p => p.customerId.toString() === selectedCustomerId)
    : [];

  // Filter invoices by payment type matching
  const filteredInvoices = selectedPayment 
    ? invoices.filter(i => i.invoiceType === selectedPayment.paymentType)
    : [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Payment Allocation</h1>
      </div>

      {/* Customer Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Customer</CardTitle>
          <CardDescription>Choose a customer to view their payments and invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a customer" />
            </SelectTrigger>
            <SelectContent>
              {uniqueCustomers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id.toString()}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedCustomerId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payments */}
          <Card>
            <CardHeader>
              <CardTitle>Unallocated Payments</CardTitle>
              <CardDescription>Select a payment to allocate</CardDescription>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <p>Loading payments...</p>
              ) : filteredPayments.length === 0 ? (
                <p>No unallocated payments found for this customer.</p>
              ) : (
                <div className="space-y-2">
                  {filteredPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className={`p-4 border rounded cursor-pointer hover:bg-gray-50 ${
                        selectedPayment?.id === payment.id ? 'border-blue-500 bg-blue-50' : ''
                      }`}
                      onClick={() => setSelectedPayment(payment)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{payment.paymentReference}</p>
                          <p className="text-sm text-gray-600">Date: {payment.paymentDate}</p>
                          <p className="text-sm text-gray-600">Type: {payment.paymentType}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">
                            {payment.currency} {payment.unallocatedAmount}
                          </p>
                          <p className="text-sm text-gray-600">Available</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoices */}
          <Card>
            <CardHeader>
              <CardTitle>Outstanding Invoices</CardTitle>
              <CardDescription>Select an invoice to allocate payment to</CardDescription>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <p>Loading invoices...</p>
              ) : filteredInvoices.length === 0 ? (
                <p>No outstanding invoices found for this customer and payment type.</p>
              ) : (
                <div className="space-y-2">
                  {filteredInvoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className={`p-4 border rounded cursor-pointer hover:bg-gray-50 ${
                        selectedInvoice?.id === invoice.id ? 'border-orange-500 bg-orange-50' : ''
                      }`}
                      onClick={() => setSelectedInvoice(invoice)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{invoice.invoiceNumber}</p>
                          <p className="text-sm text-gray-600">Date: {invoice.invoiceDate}</p>
                          <p className="text-sm text-gray-600">Type: {invoice.invoiceType}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600">
                            {invoice.currency} {invoice.outstanding_amount}
                          </p>
                          <p className="text-sm text-gray-600">Outstanding</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Allocation Card */}
      {selectedPayment && selectedInvoice && (
        <Card>
          <CardHeader>
            <CardTitle>Allocate Payment</CardTitle>
            <CardDescription>
              Allocate from {selectedPayment.paymentReference} to {selectedInvoice.invoiceNumber}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Selected Payment Details */}
              <div className="bg-blue-50 p-4 rounded border">
                <h4 className="font-bold text-blue-800 mb-3">Selected Payment</h4>
                <div className="space-y-2">
                  <p><strong>Payment ID:</strong> {selectedPayment.id}</p>
                  <p><strong>Reference:</strong> {selectedPayment.paymentReference}</p>
                  <p><strong>Date:</strong> {selectedPayment.paymentDate}</p>
                  <p><strong>Customer:</strong> {selectedPayment.customerName}</p>
                  <p><strong>Type:</strong> {selectedPayment.paymentType}</p>
                  <p><strong>Total Amount:</strong> {selectedPayment.currency} {selectedPayment.amount}</p>
                  <p><strong>Unallocated Amount:</strong> 
                    <span className="font-bold text-blue-700 ml-2">
                      {selectedPayment.currency} {selectedPayment.unallocatedAmount}
                    </span>
                  </p>
                </div>
              </div>

              {/* Selected Invoice Details */}
              <div className="bg-orange-50 p-4 rounded border">
                <h4 className="font-bold text-orange-800 mb-3">Selected Invoice</h4>
                <div className="space-y-2">
                  <p><strong>Invoice ID:</strong> {selectedInvoice.id}</p>
                  <p><strong>Invoice Number:</strong> {selectedInvoice.invoiceNumber}</p>
                  <p><strong>Date:</strong> {selectedInvoice.invoiceDate}</p>
                  <p><strong>Customer:</strong> {selectedInvoice.customerName}</p>
                  <p><strong>Type:</strong> {selectedInvoice.invoiceType}</p>
                  <p><strong>Total Amount:</strong> {selectedInvoice.currency} {selectedInvoice.totalAmount}</p>
                  <p><strong>Outstanding Amount:</strong> 
                    <span className="font-bold text-orange-700 ml-2">
                      {selectedInvoice.currency} {selectedInvoice.outstanding_amount}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Currency Mismatch Warning */}
            {selectedPayment.currency !== selectedInvoice.currency && (
              <div className="bg-red-50 p-4 rounded border mb-4 border-red-200">
                <h4 className="font-bold text-red-800 mb-2">⚠️ Currency Mismatch</h4>
                <p className="text-red-700">
                  Payment currency ({selectedPayment.currency}) does not match invoice currency ({selectedInvoice.currency}). 
                  Please select a payment and invoice with matching currencies.
                </p>
              </div>
            )}

            {/* Allocation Amount */}
            {selectedPayment.currency === selectedInvoice.currency && (
              <div className="bg-green-50 p-4 rounded border mb-4">
                <h4 className="font-bold text-green-800 mb-3">Allocation Amount</h4>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    value={allocateAmount}
                    onChange={(e) => setAllocateAmount(e.target.value)}
                    placeholder="Auto-calculated amount"
                    className="flex-1"
                    step="0.01"
                  />
                  <span className="text-sm text-gray-600">{selectedPayment.currency}</span>
                </div>
                <div className="text-sm text-gray-600 mt-2">
                  <p className="font-semibold text-green-700">Auto-calculation Logic:</p>
                  <p>• Payment Unallocated: {selectedPayment.currency} {selectedPayment.unallocatedAmount}</p>
                  <p>• Invoice Outstanding: {selectedInvoice.currency} {selectedInvoice.outstanding_amount}</p>
                  <p className="mt-1 font-medium">
                    {parseFloat(selectedPayment.unallocatedAmount) > parseFloat(selectedInvoice.outstanding_amount) 
                      ? `Using Invoice Outstanding Amount (${selectedInvoice.currency} ${selectedInvoice.outstanding_amount})`
                      : `Using Payment Unallocated Amount (${selectedPayment.currency} ${selectedPayment.unallocatedAmount})`
                    }
                  </p>
                </div>
              </div>
            )}

            {/* Allocate Button */}
            <Button 
              onClick={handleAllocate}
              disabled={!allocateAmount || parseFloat(allocateAmount) <= 0 || allocateMutation.isPending}
              className="w-full"
            >
              {allocateMutation.isPending ? "Processing..." : "Allocate Payment"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}