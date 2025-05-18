import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatRupees, formatDate } from "@/lib/utils";

interface PaymentAllocationsProps {
  invoiceId: number;
  invoiceAmount: number;
  currency?: string;
}

export default function PaymentAllocations({ invoiceId, invoiceAmount, currency = 'USD' }: PaymentAllocationsProps) {
  // Fetch payment allocations for this invoice
  const {
    data: allocations,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [`/api/finance/invoices/${invoiceId}/allocations`],
    enabled: !!invoiceId
  });
  
  // Calculate total from allocations
  const totalPaid = Array.isArray(allocations) 
    ? allocations.reduce((sum: number, allocation: any) => sum + parseFloat(allocation.allocatedAmount), 0)
    : 0;
    
  const balanceDue = invoiceAmount - totalPaid;
  
  // Effect to refetch allocations periodically (every 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [refetch]);

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Payment Allocations</CardTitle>
          <CardDescription>Payments applied to this invoice</CardDescription>
        </div>
        <div className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-800 font-medium">
          Total Applied: {currency} {totalPaid.toFixed(2)}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2">Loading payment allocations...</span>
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-500">
            Error loading payment allocations. Please try again later.
          </div>
        ) : allocations && Array.isArray(allocations) && allocations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-left text-sm font-medium">Payment Reference</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Payment Date</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Payment Method</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Payment Type</th>
                  <th className="px-4 py-2 text-right text-sm font-medium">Payment Total</th>
                  <th className="px-4 py-2 text-right text-sm font-medium">Amount Applied</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((allocation: any, index: number) => (
                  <tr key={index} className="border-b hover:bg-muted/20">
                    <td className="px-4 py-3 text-sm">
                      <a href={`/finance/payments/${allocation.paymentId}`} className="text-primary hover:underline font-medium">
                        {allocation.paymentReference}
                      </a>
                      <div className="text-xs text-muted-foreground">
                        {allocation.sapPaymentNo && <div>SAP: {allocation.sapPaymentNo}</div>}
                        {allocation.irmNo && <div>IRM: {allocation.irmNo}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{formatDate(allocation.paymentDate)}</td>
                    <td className="px-4 py-3 text-sm">{allocation.paymentMethod}</td>
                    <td className="px-4 py-3 text-sm">
                      <Badge variant={allocation.paymentType === "Product" ? "default" : "secondary"}>
                        {allocation.paymentType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {currency} {parseFloat(allocation.paymentTotal).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-green-600">
                      {currency} {parseFloat(allocation.allocatedAmount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/10">
                  <td colSpan={5} className="px-4 py-3 text-sm font-medium text-right">
                    Total Applied:
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-right text-green-600">
                    {currency} {totalPaid.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-medium text-right">
                    Invoice Total:
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-right">
                    {currency} {invoiceAmount.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-medium text-right">
                    Balance Due:
                  </td>
                  <td className={`px-4 py-3 text-sm font-medium text-right ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {currency} {balanceDue.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            No payments have been applied to this invoice yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}