import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
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

export default function PaymentDetailPage() {
  const [location] = useLocation();
  const { toast } = useToast();
  
  // Extract payment ID from URL
  const paymentId = location.split('/').pop();
  
  // Query for payment details
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/finance/payments/${paymentId}`],
  });
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="mr-2 h-16 w-16 animate-spin" />
        <p>Loading Payment Details...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load payment details. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }
  
  const payment = data?.payment;
  const invoiceLinks = data?.invoiceLinks || [];
  const brc = data?.bankRealizationCertificate;
  
  // Calculate total amount applied to invoices
  const totalApplied = invoiceLinks.reduce((sum: number, link: any) => sum + link.amountApplied, 0);
  const unappliedAmount = payment?.amount - totalApplied;
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <Button variant="ghost" className="mr-2" asChild>
            <a href="/finance/payments">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Payments
            </a>
          </Button>
          <h1 className="text-3xl font-bold">Payment #{payment?.id}</h1>
          {payment?.referenceNumber && (
            <span className="ml-4 text-muted-foreground">Ref: {payment.referenceNumber}</span>
          )}
        </div>
        <div className="flex gap-2">
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
              <span className="text-sm font-medium">Payment Date:</span>
              <span className="text-sm">{formatDate(payment?.paymentDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium">Method:</span>
              <span className="text-sm">{payment?.paymentMethod}</span>
            </div>
            {payment?.referenceNumber && (
              <div className="flex justify-between">
                <span className="text-sm font-medium">Reference:</span>
                <span className="text-sm">{payment.referenceNumber}</span>
              </div>
            )}
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
        
        {brc && (
          <Card>
            <CardHeader>
              <CardTitle>Bank Realization Certificate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">BRC Number:</span>
                <span className="text-sm">{brc.certificateNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Issue Date:</span>
                <span className="text-sm">{formatDate(brc.issueDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Bank:</span>
                <span className="text-sm">{brc.bankName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Amount:</span>
                <span className="text-sm">{formatRupees(brc.amount)} {brc.currency}</span>
              </div>
              {brc.documentPath && (
                <Button variant="outline" className="w-full mt-2 text-sm" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  View BRC Document
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      
      {invoiceLinks.length > 0 && (
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
                    <th className="px-4 py-2 text-left text-sm font-medium">Invoice Date</th>
                    <th className="px-4 py-2 text-right text-sm font-medium">Invoice Amount</th>
                    <th className="px-4 py-2 text-right text-sm font-medium">Applied Amount</th>
                    <th className="px-4 py-2 text-center text-sm font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceLinks.map((link: any, index: number) => (
                    <tr key={index} className="border-b">
                      <td className="px-4 py-3 text-left text-sm">
                        <a href={`/finance/invoices/${link.invoice.id}`} className="text-primary hover:underline">
                          {link.invoice.invoiceNumber}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-left text-sm">{formatDate(link.invoice.issueDate)}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatRupees(link.invoice.totalAmount)}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium">{formatRupees(link.amountApplied)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                          link.invoice.status === 'Paid' 
                            ? 'bg-green-100 text-green-800' 
                            : link.invoice.status === 'Partially Paid'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {link.invoice.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/50">
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-bold">Total Applied:</td>
                    <td className="px-4 py-3 text-right text-sm font-bold">{formatRupees(totalApplied)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
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
  );
}