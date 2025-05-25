import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Helmet } from "react-helmet";
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { formatRupees, formatDate } from "@/lib/utils";
import { Loader2, ArrowLeft, Download, Pencil, FileText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import PaymentAllocations from "./components/payment-allocations";
import AdvancePaymentAllocator from "./components/advance-payment-allocator";
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

interface InvoiceDetailPageProps {
  download?: boolean;
  print?: boolean;
}

export default function InvoiceDetailPage({ download = false, print = false }: InvoiceDetailPageProps) {
  const [location] = useLocation();
  const { toast } = useToast();
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  
  // Extract invoice ID from URL
  const pathSegments = location.split('/');
  const invoiceIndex = pathSegments.indexOf('invoices');
  
  // Handle both /finance/invoices/:id and /finance/invoices/view/:id patterns
  let invoiceId;
  if (pathSegments[invoiceIndex + 1] === 'view') {
    invoiceId = pathSegments[invoiceIndex + 2]; // Get ID after 'view'
  } else {
    invoiceId = pathSegments[invoiceIndex + 1]; // Direct ID
  }
  
  // Log the URL path for debugging
  console.log('Invoice path segments:', pathSegments);
  console.log('Detected invoice ID:', invoiceId);
  
  // Query for invoice details
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/finance/invoices/${invoiceId}`],
  });
  
  // Query for payment allocations
  const { 
    data: allocationsData, 
    isLoading: allocationsLoading
  } = useQuery({
    queryKey: [`/api/finance/invoices/${invoiceId}/allocations`],
    enabled: !!invoiceId
  });
  
  // Mutation for updating invoice status
  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      return await apiRequest('PATCH', `/api/finance/invoices/${invoiceId}/status`, { status });
    },
    onSuccess: () => {
      setStatusDialogOpen(false);
      toast({
        title: "Status Updated",
        description: `Invoice status has been updated to ${newStatus}.`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/finance/invoices/${invoiceId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
    },
    onError: () => {
      toast({
        title: "Update Failed",
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
  
  // PDF download handler
  const handleDownloadPdf = () => {
    if (!data?.invoice) return;
    
    // In a real implementation, this would call an API endpoint to generate a PDF
    toast({
      title: "PDF Download",
      description: `Invoice ${data.invoice.invoiceNumber} PDF is being generated...`,
    });
    
    // Simulate download delay
    setTimeout(() => {
      toast({
        title: "Download Complete",
        description: `Invoice ${data.invoice.invoiceNumber} has been downloaded.`,
      });
      
      // If this is an automatic download, navigate back
      if (download) {
        window.location.href = '/finance/invoices';
      }
    }, 1500);
  };
  
  // Print handler
  const handlePrintInvoice = () => {
    if (!data?.invoice) return;
    
    toast({
      title: "Print Prepared",
      description: "Invoice is ready to print. Print dialog will open shortly.",
    });
    
    // Simulate print dialog
    setTimeout(() => {
      // In a real implementation, this would open the browser's print dialog
      window.print();
      
      // If this is an automatic print request, navigate back
      if (print) {
        window.location.href = '/finance/invoices';
      }
    }, 1000);
  };

  // Auto-trigger download or print if needed
  useEffect(() => {
    if ((download || print) && data?.invoice) {
      // Delay to ensure data is loaded
      const timer = setTimeout(() => {
        if (download) {
          handleDownloadPdf();
        }
        if (print) {
          handlePrintInvoice();
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [download, print, data]);

  if (isLoading) {
    return (
      <Layout>
        <Helmet>
          <title>Invoice Details | THERMOPAC Finance</title>
        </Helmet>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="mr-2 h-16 w-16 animate-spin" />
          <p>Loading Invoice Details...</p>
        </div>
      </Layout>
    );
  }
  
  if (error) {
    return (
      <Layout>
        <Helmet>
          <title>Error | THERMOPAC Finance</title>
        </Helmet>
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load invoice details. Please try again later.
          </AlertDescription>
        </Alert>
      </Layout>
    );
  }
  
  const invoice = data?.invoice || data;
  const items = data?.items || [];
  
  // Debug logging to see what data we're receiving
  console.log('Raw API response:', data);
  console.log('Invoice data:', invoice);
  
  // We're now using our dedicated PaymentAllocations component instead of calculating these here
  
  return (
    <Layout>
      <Helmet>
        <title>{invoice?.invoiceNumber || 'Invoice Details'} | THERMOPAC Finance</title>
      </Helmet>
      <div className="container py-6">
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
              <StatusBadge status={invoice?.status || ''} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStatusDialogOpen(true)}>
              Update Status
            </Button>
            <Button variant="outline" onClick={handleDownloadPdf}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            <Button variant="outline" onClick={handlePrintInvoice}>
              <FileText className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button asChild>
              <a href={`/finance/invoices/${invoiceId}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </a>
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Invoice Number</dt>
                  <dd className="text-base">{invoice?.invoiceNumber}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Status</dt>
                  <dd className="text-base"><StatusBadge status={invoice?.status || ''} /></dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Issue Date</dt>
                  <dd className="text-base">{formatDate(invoice?.issueDate)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Due Date</dt>
                  <dd className="text-base">{formatDate(invoice?.dueDate)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Total Amount</dt>
                  <dd className="text-base font-medium">{formatRupees(invoice?.totalAmount)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Balance Due</dt>
                  <dd className={`text-base font-medium ${(invoice?.outstandingAmount || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatRupees(invoice?.outstandingAmount || 0)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Customer Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Customer Name</dt>
                  <dd className="text-base">{invoice?.customerName}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Customer ID</dt>
                  <dd className="text-base">{invoice?.customerId}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Project</dt>
                  <dd className="text-base">{invoice?.projectName || 'Not linked to a project'}</dd>
                </div>
              </dl>
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
                    <th className="px-4 py-2 text-left text-sm font-medium">Item</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Description</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Quantity</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Rate</th>
                    <th className="px-4 py-2 text-right text-sm font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length > 0 ? (
                    items.map((item: any, index: number) => (
                      <tr key={index} className="border-b">
                        <td className="px-4 py-3 text-sm">{item.itemCode || `Item ${index + 1}`}</td>
                        <td className="px-4 py-3 text-sm">{item.description}</td>
                        <td className="px-4 py-3 text-sm">{item.quantity}</td>
                        <td className="px-4 py-3 text-sm">{formatRupees(item.rate)}</td>
                        <td className="px-4 py-3 text-sm text-right">{formatRupees(item.amount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-sm text-center text-muted-foreground">No items found</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={4} className="px-4 py-3 text-sm font-medium text-right">Total:</td>
                    <td className="px-4 py-3 text-sm font-medium text-right">{formatRupees(invoice?.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
        
        {/* Import our reusable payment allocation component */}
        {invoice && invoice.id && (
          <>
            {/* Add the advance payment allocator first */}
            <AdvancePaymentAllocator
              invoiceId={invoice.id}
              customerId={invoice.customerId}
              invoiceType={invoice.invoiceType || 'Product'}
              outstandingAmount={balanceDue}
              currency={invoice.currency || 'USD'}
              onAllocationComplete={() => {
                // Refetch invoice data and allocations when complete
                queryClient.invalidateQueries({ queryKey: [`/api/finance/invoices/${invoiceId}`] });
              }}
            />
            
            {/* Show existing payment allocations */}
            <PaymentAllocations 
              invoiceId={invoice.id} 
              invoiceAmount={parseFloat(invoice.totalAmount)} 
              currency={invoice.currency || 'USD'} 
            />
          </>
        )}
      </div>
      
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Invoice Status</DialogTitle>
            <DialogDescription>
              Update the status of invoice {invoice?.invoiceNumber}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
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
    </Layout>
  );
}