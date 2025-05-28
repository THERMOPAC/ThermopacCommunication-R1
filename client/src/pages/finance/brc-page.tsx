import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Plus, Loader2, AlertCircle, Search, Upload } from 'lucide-react';
import Layout from '@/components/layout';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatRupees } from '@/lib/utils';

export default function BrcPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all BRCs
  const { data: brcs, isLoading: isLoadingBrcs } = useQuery({
    queryKey: ['/api/finance/brc'],
    enabled: true
  });

  const handleCreateBrc = () => {
    setDialogOpen(true);
  };

  // Generate a BRC number based on payment reference
  const generateBrcNumber = (paymentRef: string) => {
    // Extract the financial year part from payment reference (PAY-2526-001 => BRC-2526-001)
    if (paymentRef && paymentRef.includes('-')) {
      const parts = paymentRef.split('-');
      if (parts.length === 3) {
        return `BRC-${parts[1]}-${parts[2]}`;
      }
    }
    
    // Fallback: use current financial year
    const financialYear = getIndianFinancialYear(new Date());
    return `BRC-${financialYear}-001`;
  };

  const handleInvoiceSelect = (invoice: any) => {
    setSelectedInvoice(invoice);
    setFormValues({
      invoiceId: invoice.id.toString(),
      brcNumber: generateBrcNumber(invoice.invoiceNumber),
      issueDate: format(new Date(), 'yyyy-MM-dd'),
      amount: invoice.totalAmount,
      currency: invoice.currency,
      bankName: '',
      remarks: ''
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await apiRequest('POST', '/api/finance/brc', formValues);
      queryClient.invalidateQueries({ queryKey: ['/api/finance/brc'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/payments/foreign-without-brc'] });
      toast({
        title: 'Success',
        description: 'Bank Realization Certificate has been recorded',
      });
      setDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to record BRC',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  // Filter export invoices by search query
  const filteredInvoices = Array.isArray(exportInvoices)
    ? exportInvoices.filter((invoice: any) =>
        invoice.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.customer?.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.amount?.toString().includes(searchQuery)
      )
    : [];

  // Filter BRCs by search query
  const filteredBrcs = Array.isArray(brcs)
    ? brcs.filter((brc: any) =>
        brc.brcNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        brc.payment?.customer?.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        brc.amount?.toString().includes(searchQuery)
      )
    : [];

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2">Loading...</span>
        </div>
      </Layout>
    );
  }

  // Ignore errors for foreign payments endpoint and continue rendering the page
  // with empty data instead of showing an error

  return (
    <Layout>
      <Helmet>
        <title>Bank Realization Certificate | Thermopac</title>
      </Helmet>

      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Bank Realization Certificates</h1>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                type="search" 
                placeholder="Search..." 
                className="pl-8 w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Pending foreign payments */}
          <Card>
            <CardHeader>
              <CardTitle>Foreign Currency Payments Pending BRC</CardTitle>
              <CardDescription>
                Payments received in foreign currencies for which Bank Realization Certificate is pending
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredPayments.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  {searchQuery
                    ? "No matching foreign currency payments found"
                    : "No pending foreign currency payments found"}
                </div>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference No.</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayments.map((payment: any) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium">{payment.referenceNumber}</TableCell>
                          <TableCell>{format(new Date(payment.paymentDate), 'dd MMM yyyy')}</TableCell>
                          <TableCell>{payment.customer?.companyName}</TableCell>
                          <TableCell className="text-right">
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: payment.currency || 'USD',
                            }).format(parseFloat(payment.amount))}
                          </TableCell>
                          <TableCell>{payment.currency}</TableCell>
                          <TableCell>
                            <Badge variant="outline">BRC Pending</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePaymentSelect(payment)}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add BRC
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Existing BRCs */}
          <Card>
            <CardHeader>
              <CardTitle>Existing Bank Realization Certificates</CardTitle>
              <CardDescription>
                All recorded Bank Realization Certificates for foreign currency receipts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingBrcs ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredBrcs.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  {searchQuery
                    ? "No matching Bank Realization Certificates found"
                    : "No Bank Realization Certificates recorded yet"}
                </div>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>BRC Number</TableHead>
                        <TableHead>Issue Date</TableHead>
                        <TableHead>Payment Ref</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Bank</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBrcs.map((brc: any) => (
                        <TableRow key={brc.id}>
                          <TableCell className="font-medium">{brc.brcNumber}</TableCell>
                          <TableCell>{format(new Date(brc.issueDate), 'dd MMM yyyy')}</TableCell>
                          <TableCell>{brc.payment?.referenceNumber}</TableCell>
                          <TableCell>{brc.payment?.customer?.companyName}</TableCell>
                          <TableCell className="text-right">
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: brc.currency || 'USD',
                            }).format(parseFloat(brc.amount))}
                          </TableCell>
                          <TableCell>{brc.currency}</TableCell>
                          <TableCell>{brc.bankName}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              title="Download BRC"
                              disabled={true} // Enable when download functionality is ready
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add BRC Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Bank Realization Certificate</DialogTitle>
            <DialogDescription>
              Record BRC details for the selected foreign currency payment
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-2">
              {selectedPayment && (
                <div className="bg-muted p-3 rounded-md text-sm mb-4">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium">Payment Reference:</span>
                    <span>{selectedPayment.referenceNumber}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium">Customer:</span>
                    <span>{selectedPayment.customer?.companyName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Amount:</span>
                    <span>
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: selectedPayment.currency || 'USD',
                      }).format(parseFloat(selectedPayment.amount))}
                    </span>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="brcNumber">BRC Number</Label>
                <Input
                  id="brcNumber"
                  name="brcNumber"
                  value={formValues.brcNumber}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="issueDate">Issue Date</Label>
                <Input
                  id="issueDate"
                  name="issueDate"
                  type="date"
                  value={formValues.issueDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  value={formValues.amount}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select 
                  name="currency" 
                  value={formValues.currency} 
                  onValueChange={(value) => handleSelectChange('currency', value)}
                  disabled
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">US Dollar ($)</SelectItem>
                    <SelectItem value="EUR">Euro (€)</SelectItem>
                    <SelectItem value="GBP">British Pound (£)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="bankName">Issuing Bank</Label>
                <Input
                  id="bankName"
                  name="bankName"
                  value={formValues.bankName}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  id="remarks"
                  name="remarks"
                  value={formValues.remarks}
                  onChange={handleInputChange}
                  rows={3}
                />
              </div>
            </div>
            
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save BRC'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}