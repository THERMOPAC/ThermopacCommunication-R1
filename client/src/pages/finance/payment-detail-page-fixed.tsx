import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
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
import { Separator } from "@/components/ui/separator";
import { formatRupees, formatDate } from "@/lib/utils";
import { Loader2, ArrowLeft, Download, FileText, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Helmet } from "react-helmet";

export default function PaymentDetailPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Extract payment ID from URL
  const location = window.location.pathname;
  const paymentId = location.split('/').pop();
  
  // Query for payment details
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/finance/payments/${paymentId}`],
  });
  
  // Get outstanding invoices for allocation - simplified to avoid issues
  const { 
    data: invoicesData,
    isLoading: invoicesLoading,
    isError: invoicesError
  } = useQuery({
    queryKey: ['/api/finance/invoices'],
    enabled: !!data?.payment, // Only load invoices after payment data is available
  });
  
  // Fallback for missing data - show empty arrays rather than undefined
  const payment = data?.payment || {};
  const allocations = data?.allocations || [];
  const outstandingInvoices = invoicesData?.invoices || [];
  
  const handleNavigateToEdit = () => {
    // Navigate to the edit page with the correct URL structure
    // The URL should match what PaymentCreatePage expects (/finance/payments/:id/edit)
    setLocation(`/finance/payments/${paymentId}/edit`);
  };
  
  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="mr-2 h-16 w-16 animate-spin" />
          <p>Loading Payment Details...</p>
        </div>
      </Layout>
    );
  }
  
  if (error) {
    return (
      <Layout>
        <div className="container mx-auto py-6">
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load payment details. Please try again later.
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <Button variant="outline" asChild>
              <Link href="/finance/payments">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Payments
              </Link>
            </Button>
          </div>
        </div>
      </Layout>
    );
  }
  
  // Calculate total amount applied to invoices
  const totalApplied = allocations.reduce((sum: number, allocation: any) => {
    const amount = parseFloat(allocation.amountApplied) || 0;
    return sum + amount;
  }, 0);
  
  const unappliedAmount = payment ? parseFloat(payment.amount || "0") - totalApplied : 0;
  
  return (
    <Layout>
      <Helmet>
        <title>Payment Details | Thermopac Finance</title>
      </Helmet>
      
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <Button variant="ghost" className="mr-2" asChild>
              <Link href="/finance/payments">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Payments
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">Payment #{payment?.paymentNumber || payment?.id}</h1>
            {payment?.reference && (
              <span className="ml-4 text-muted-foreground">Ref: {payment.reference}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleNavigateToEdit}>
              Edit Payment
            </Button>
            {payment?.proofDocumentPath && (
              <Button variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                View Receipt
              </Button>
            )}
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download Receipt
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Payment ID:</span>
                <span className="text-sm">#{payment?.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Payment Number:</span>
                <span className="text-sm">{payment?.paymentNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">SAP Payment No:</span>
                <span className="text-sm">{payment?.sapPaymentNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Payment Date:</span>
                <span className="text-sm">{formatDate(payment?.paymentDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Method:</span>
                <span className="text-sm">{payment?.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Payment Type:</span>
                <span className="text-sm">{payment?.paymentType}</span>
              </div>
              {payment?.reference && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Reference:</span>
                  <span className="text-sm">{payment.reference}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm font-medium">Customer:</span>
                <span className="text-sm">{payment?.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Advance Payment:</span>
                <span className="text-sm">{payment?.isAdvancePayment ? 'Yes' : 'No'}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Payment Amount</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Total Amount:</span>
                <span className="text-sm font-semibold">{formatRupees(payment?.amount)} {payment?.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Applied to Invoices:</span>
                <span className="text-sm">{formatRupees(totalApplied)}</span>
              </div>
              {unappliedAmount > 0 && (
                <>
                  <Separator className="my-2" />
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Unapplied Amount:</span>
                    <span className="text-sm font-bold text-amber-600">{formatRupees(unappliedAmount)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Allocation Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Allocated Amount:</span>
                <span className="text-sm">{formatRupees(payment?.allocatedAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Unallocated Amount:</span>
                <span className="text-sm">{formatRupees(payment?.unallocatedAmount)}</span>
              </div>
              {payment?.isAdvancePayment && payment?.unallocatedAmount && parseFloat(payment.unallocatedAmount) > 0 && (
                <Button variant="outline" className="w-full mt-4" size="sm" asChild>
                  <Link href={`/finance/allocate-advance/${payment.id}`}>
                    Allocate Advance Payment
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
        
        {allocations.length > 0 ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Applied to Invoices</CardTitle>
              <CardDescription>
                This payment has been applied to the following invoices
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left text-sm font-medium">Invoice Number</th>
                      <th className="px-4 py-2 text-center text-sm font-medium">Invoice Type</th>
                      <th className="px-4 py-2 text-right text-sm font-medium">Invoice Amount</th>
                      <th className="px-4 py-2 text-right text-sm font-medium">Applied Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((allocation: any, index: number) => (
                      <tr key={index} className="border-b">
                        <td className="px-4 py-3 text-left text-sm">
                          <Link href={`/finance/invoices/${allocation.invoiceId}`} className="text-primary hover:underline">
                            {allocation.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                            allocation.invoiceType === 'Product' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {allocation.invoiceType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm">{formatRupees(allocation.invoiceAmount)}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium">{formatRupees(allocation.amountApplied)}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted/50">
                      <td colSpan={3} className="px-4 py-3 text-right text-sm font-bold">Total Applied:</td>
                      <td className="px-4 py-3 text-right text-sm font-bold">{formatRupees(totalApplied)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : payment?.isAdvancePayment ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Advance Payment</CardTitle>
              <CardDescription>
                This is an advance payment that hasn't been allocated to any invoices yet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-amber-800">
                  This advance payment has {formatRupees(payment.unallocatedAmount)} available to allocate to invoices.
                </p>
                <Button variant="outline" className="mt-4" size="sm" asChild>
                  <Link href={`/finance/allocate-advance/${payment.id}`}>
                    Allocate to Invoices
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>No Allocations</CardTitle>
              <CardDescription>
                This payment has not been allocated to any invoices.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertDescription>
                  This payment hasn't been applied to any invoices. You can allocate this payment to invoices by clicking the button below.
                </AlertDescription>
              </Alert>
              <div className="flex justify-end mt-4">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/finance/allocate-payment/${payment.id}`}>
                    Allocate Payment
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {payment?.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-line">{payment.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}