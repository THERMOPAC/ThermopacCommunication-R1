import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface PaymentAllocationsProps {
  invoiceId: number;
  invoiceAmount: number;
  currency?: string;
}

export default function PaymentAllocationsFixed({ invoiceId, invoiceAmount, currency = 'USD' }: PaymentAllocationsProps) {
  // Use React Query for allocations
  const { 
    data: allocations, 
    isLoading: isLoadingAllocations, 
    error: allocationsError 
  } = useQuery({
    queryKey: ['invoice-allocations', invoiceId],
    queryFn: () => fetch(`/api/finance/invoices/${invoiceId}/allocations`).then(res => res.json()),
    enabled: !!invoiceId,
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  // Fetch write-offs for this invoice
  const { 
    data: writeOffs, 
    isLoading: isLoadingWriteOffs, 
    error: writeOffsError 
  } = useQuery({
    queryKey: ['invoice-writeoffs', invoiceId],
    queryFn: () => fetch(`/api/finance/write-offs/invoice/${invoiceId}`).then(res => res.json()),
    enabled: !!invoiceId,
    refetchInterval: 10000
  });

  const isLoading = isLoadingAllocations || isLoadingWriteOffs;
  const error = allocationsError || writeOffsError;

  // Calculate total from allocations - handle both old and new API response formats
  const allocationsData = allocations?.allocations || allocations || [];
  const totalPaid = Array.isArray(allocationsData) 
    ? allocationsData.reduce((sum: number, allocation: any) => sum + parseFloat(allocation.amountApplied || allocation.allocatedAmount || 0), 0)
    : 0;

  // Calculate total from write-offs (only approved ones) - debug the data structure
  const writeOffsData = writeOffs || [];
  console.log('Write-offs data from API:', writeOffsData);
  const totalWrittenOff = Array.isArray(writeOffsData) 
    ? writeOffsData
        .filter((writeOff: any) => writeOff.status === 'Approved')
        .reduce((sum: number, writeOff: any) => sum + parseFloat(writeOff.amount || 0), 0)
    : 0;
    
  const balanceDue = invoiceAmount - totalPaid - totalWrittenOff;

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Payment Allocations</CardTitle>
          <CardDescription>Payments applied to this invoice</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2">Loading payment allocations...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Only show error if both APIs fail and there's no data available
  if (error && (!allocations && !writeOffs)) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Payment Allocations</CardTitle>
          <CardDescription>Payments applied to this invoice</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 text-center text-red-500">
            Error loading payment allocations. Please try again later.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Payment Allocations</CardTitle>
          <CardDescription>Payments applied to this invoice</CardDescription>
        </div>
        <div className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-800 font-medium">
          Total Applied: {currency} {(totalPaid + totalWrittenOff).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </CardHeader>
      <CardContent>
        {(allocationsData && Array.isArray(allocationsData) && allocationsData.length > 0) || (writeOffsData && Array.isArray(writeOffsData) && writeOffsData.length > 0) ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-left text-sm font-medium">Reference</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Date</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Type</th>
                  <th className="px-4 py-2 text-left text-sm font-medium">Currency</th>
                  <th className="px-4 py-2 text-right text-sm font-medium">Amount Applied</th>
                </tr>
              </thead>
              <tbody>
                {/* Payment Allocations */}
                {allocationsData && Array.isArray(allocationsData) && allocationsData.map((allocation: any, index: number) => (
                  <tr key={`payment-${index}`} className="border-b hover:bg-muted/20">
                    <td className="px-4 py-3 text-sm">
                      <a 
                        href={`/finance/payments/view/${allocation.payment?.id}`} 
                        className="text-primary hover:underline font-medium"
                      >
                        {allocation.payment?.irmNo || allocation.payment?.sapPaymentNo || `Payment ${allocation.payment?.id}`}
                      </a>
                      <div className="text-xs text-muted-foreground mt-1">
                        {allocation.payment?.sapPaymentNo && <div>SAP: {allocation.payment.sapPaymentNo}</div>}
                        {allocation.payment?.irmNo && <div>IRM: {allocation.payment.irmNo}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {new Date(allocation.payment?.paymentDate || allocation.allocationDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge variant="default" className="bg-blue-100 text-blue-800">
                        {allocation.payment?.paymentMethod || 'Payment'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge variant="outline">
                        {allocation.payment?.currency || currency}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-green-600">
                      {currency} {parseFloat(allocation.amountApplied || allocation.allocatedAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                
                {/* Write-offs */}
                {writeOffsData && Array.isArray(writeOffsData) && writeOffsData
                  .filter((writeOff: any) => writeOff.status === 'Approved')
                  .map((writeOff: any, index: number) => (
                  <tr key={`writeoff-${index}`} className="border-b hover:bg-muted/20 bg-orange-50">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">Write-off #{writeOff.id}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        <div>Reason: {writeOff.reason}</div>
                        {writeOff.notes && <div>Notes: {writeOff.notes}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {new Date(writeOff.approvalDate || writeOff.dateCreated).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge variant="destructive" className="bg-orange-100 text-orange-800">
                        Write-off
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge variant="outline">
                        {writeOff.currency || currency}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-orange-600">
                      {currency} {parseFloat(writeOff.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {totalPaid > 0 && (
                  <tr className="border-t bg-muted/5">
                    <td colSpan={4} className="px-4 py-2 text-sm font-medium text-right">
                      Payment Total:
                    </td>
                    <td className="px-4 py-2 text-sm font-medium text-right text-green-600">
                      {currency} {totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}
                {totalWrittenOff > 0 && (
                  <tr className="bg-muted/5">
                    <td colSpan={4} className="px-4 py-2 text-sm font-medium text-right">
                      Write-off Total:
                    </td>
                    <td className="px-4 py-2 text-sm font-medium text-right text-orange-600">
                      {currency} {totalWrittenOff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}
                <tr className="border-t-2 bg-muted/10">
                  <td colSpan={4} className="px-4 py-3 text-sm font-bold text-right">
                    Total Applied:
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-right text-green-600">
                    {currency} {(totalPaid + totalWrittenOff).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="bg-muted/10">
                  <td colSpan={4} className="px-4 py-3 text-sm font-bold text-right">
                    Invoice Total:
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-right">
                    {currency} {invoiceAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="bg-muted/10">
                  <td colSpan={4} className="px-4 py-3 text-sm font-bold text-right">
                    Balance Due:
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold text-right ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {currency} {balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            <div className="text-sm">No payments have been applied to this invoice yet.</div>
            <div className="text-xs mt-2">When payments are allocated, they will appear here automatically.</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}