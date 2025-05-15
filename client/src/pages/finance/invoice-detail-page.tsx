import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { formatRupees, formatDate } from "@/lib/utils";
import { Loader2, ArrowLeft, Download, Pencil, FileText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  const getStatusStyles = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'partially paid':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusStyles(status)}`}>
      {status}
    </span>
  );
};

export default function InvoiceDetailPage() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  
  // Extract invoice ID from URL
  const invoiceId = location.split('/').pop();
  
  // Query for invoice details
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/finance/invoices/${invoiceId}`],
  });
  
  // Mutation for updating invoice status
  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest(`/api/finance/invoices/${invoiceId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Status updated",
        description: "Invoice status has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/finance/invoices/${invoiceId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
      setStatusDialogOpen(false);
    },
    onError: (error) => {
      console.error('Error updating invoice status:', error);
      toast({
        title: "Error",
        description: "Failed to update invoice status. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Handle status update
  const handleStatusUpdate = () => {
    if (newStatus) {
      updateStatus.mutate(newStatus);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="mr-2 h-16 w-16 animate-spin" />
        <p>Loading Invoice Details...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load invoice details. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }
  
  const invoice = data?.invoice;
  const items = data?.items || [];
  const payments = data?.payments || [];
  
  // Calculate total paid amount
  const totalPaid = payments.reduce((sum: number, payment: any) => sum + payment.amountApplied, 0);
  const balanceDue = invoice?.totalAmount - totalPaid;
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <Button variant="ghost" className="mr-2" asChild>
            <a href="/finance/invoices">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Invoices
            </a>
          </Button>
          <h1 className="text-3xl font-bold">{invoice?.invoiceNumber}</h1>
          <div className="ml-4">
            <StatusBadge status={invoice?.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStatusDialogOpen(true)}>
            Update Status
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          <Button variant="default">
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">Invoice Number:</span>
              <span className="text-sm">{invoice?.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium">Issue Date:</span>
              <span className="text-sm">{formatDate(invoice?.issueDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium">Due Date:</span>
              <span className="text-sm">{formatDate(invoice?.dueDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium">Status:</span>
              <StatusBadge status={invoice?.status} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">Customer ID:</span>
              <span className="text-sm">{invoice?.customerId}</span>
            </div>
            {invoice?.projectId && (
              <div className="flex justify-between">
                <span className="text-sm font-medium">Project:</span>
                <span className="text-sm">Project #{invoice?.projectId}</span>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Payment Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">Total Amount:</span>
              <span className="text-sm font-semibold">{formatRupees(invoice?.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium">Amount Paid:</span>
              <span className="text-sm text-green-600">{formatRupees(totalPaid)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between">
              <span className="text-sm font-medium">Balance Due:</span>
              <span className="text-sm font-bold text-red-600">{formatRupees(balanceDue)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Invoice Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-left text-sm font-medium">Description</th>
                  <th className="px-4 py-2 text-right text-sm font-medium">Quantity</th>
                  <th className="px-4 py-2 text-right text-sm font-medium">Unit Price</th>
                  <th className="px-4 py-2 text-right text-sm font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, index: number) => (
                  <tr key={index} className="border-b">
                    <td className="px-4 py-3 text-left text-sm">{item.description}</td>
                    <td className="px-4 py-3 text-right text-sm">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-sm">{formatRupees(item.unitPrice)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium">{formatRupees(item.amount)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/50">
                  <td colSpan={3} className="px-4 py-3 text-right text-sm font-bold">Total:</td>
                  <td className="px-4 py-3 text-right text-sm font-bold">{formatRupees(invoice?.totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      {payments.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left text-sm font-medium">Payment ID</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Date</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Method</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Reference</th>
                    <th className="px-4 py-2 text-right text-sm font-medium">Amount Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment: any, index: number) => (
                    <tr key={index} className="border-b">
                      <td className="px-4 py-3 text-left text-sm">
                        <a href={`/finance/payments/${payment.payment.id}`} className="text-primary hover:underline">
                          Payment #{payment.payment.id}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-left text-sm">{formatDate(payment.payment.paymentDate)}</td>
                      <td className="px-4 py-3 text-left text-sm">{payment.payment.paymentMethod}</td>
                      <td className="px-4 py-3 text-left text-sm">{payment.payment.referenceNumber || "-"}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium">{formatRupees(payment.amountApplied)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/50">
                    <td colSpan={4} className="px-4 py-3 text-right text-sm font-bold">Total Paid:</td>
                    <td className="px-4 py-3 text-right text-sm font-bold">{formatRupees(totalPaid)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      
      {invoice?.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}
      
      {/* Status Update Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Invoice Status</DialogTitle>
            <DialogDescription>
              Change the status of invoice {invoice?.invoiceNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select
              value={newStatus}
              onValueChange={setNewStatus}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select new status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Partially Paid">Partially Paid</SelectItem>
                <SelectItem value="Overdue">Overdue</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleStatusUpdate} disabled={updateStatus.isPending}>
              {updateStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}