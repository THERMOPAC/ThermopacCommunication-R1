import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Helmet } from 'react-helmet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  FileText, 
  Download, 
  Edit,
  Calendar,
  DollarSign,
  CreditCard,
  User,
  Receipt
} from 'lucide-react';
import { Loader2 } from 'lucide-react';
import Layout from '@/components/layout';
import { format } from 'date-fns';

interface PaymentDetails {
  id: number;
  paymentNumber: string;
  paymentDate: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  paymentType: string;
  reference: string;
  allocatedAmount: string;
  unallocatedAmount: string;
  customerName: string;
  isAdvancePayment: boolean;
  notes?: string;
  irmNo?: string;
}

interface AllocationDetails {
  amountApplied: number;
  allocationDate: string;
  invoice: {
    id: number;
    invoiceNumber: string;
    totalAmount: number;
    status: string;
    issueDate: string;
    dueDate: string;
    currency: string;
    customerName: string;
  };
}

interface AllocationsResponse {
  success: boolean;
  paymentId: number;
  allocations: AllocationDetails[];
}

export default function PaymentDetailEnhanced() {
  const [location, setLocation] = useLocation();
  
  // Extract payment ID from URL
  const paymentId = location.split('/').pop();
  
  // Query for payment details
  const { data: paymentData, isLoading: isLoadingPayment, error: paymentError } = useQuery({
    queryKey: [`/api/finance/payments/${paymentId}`],
  });
  
  // Query for payment allocations
  const { data: allocationsData, isLoading: isLoadingAllocations } = useQuery<AllocationsResponse>({
    queryKey: [`/api/finance/payments/${paymentId}/allocations`],
    enabled: !!paymentId,
  });
  
  const payment = paymentData?.payment as PaymentDetails;
  const allocations = allocationsData?.allocations || [];
  
  // Calculate totals from actual allocations data
  const calculatedAllocatedAmount = allocations.reduce((sum, allocation) => sum + allocation.amountApplied, 0);
  const calculatedUnallocatedAmount = payment ? parseFloat(payment.amount) - calculatedAllocatedAmount : 0;
  
  const handleNavigateToEdit = () => {
    setLocation(`/finance/payments/${paymentId}/edit`);
  };
  
  const formatCurrency = (amount: number | string, currency: string = 'USD') => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(numAmount);
  };
  
  if (isLoadingPayment) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="mr-2 h-16 w-16 animate-spin" />
          <p>Loading Payment Details...</p>
        </div>
      </Layout>
    );
  }
  
  if (paymentError || !payment) {
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
            <Button variant="outline" onClick={() => setLocation('/finance/payments')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Payments
            </Button>
          </div>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <Helmet>
        <title>Payment Details | Thermopac Finance</title>
      </Helmet>
      
      <div className="container mx-auto py-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <Button variant="ghost" className="mr-2" onClick={() => setLocation('/finance/payments')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Payments
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Payment #{payment.paymentNumber}</h1>
              {payment.reference && (
                <span className="text-muted-foreground">Reference: {payment.reference}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleNavigateToEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Payment
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download Receipt
            </Button>
          </div>
        </div>
        
        {/* Payment Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(payment.amount, payment.currency)}
              </div>
              <p className="text-xs text-muted-foreground">
                {payment.currency} • {payment.paymentType}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Allocated</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(calculatedAllocatedAmount, payment.currency)}
              </div>
              <p className="text-xs text-muted-foreground">
                Applied to {allocations.length} invoice{allocations.length !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unallocated</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(calculatedUnallocatedAmount, payment.currency)}
              </div>
              <p className="text-xs text-muted-foreground">
                Available for allocation
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Payment Date</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {format(new Date(payment.paymentDate), 'dd/MM/yyyy')}
              </div>
              <p className="text-xs text-muted-foreground">
                via {payment.paymentMethod}
              </p>
            </CardContent>
          </Card>
        </div>
        
        {/* Payment Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="h-5 w-5 mr-2" />
                Payment Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Payment ID:</span>
                <span className="text-sm">#{payment.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Customer:</span>
                <span className="text-sm">{payment.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Payment Method:</span>
                <span className="text-sm capitalize">{payment.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Advance Payment:</span>
                <Badge variant={payment.isAdvancePayment ? "default" : "secondary"}>
                  {payment.isAdvancePayment ? "Yes" : "No"}
                </Badge>
              </div>
              {payment.irmNo && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">IRM No:</span>
                  <span className="text-sm">{payment.irmNo}</span>
                </div>
              )}
              {payment.notes && (
                <div>
                  <span className="text-sm font-medium">Notes:</span>
                  <p className="text-sm text-muted-foreground mt-1">{payment.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Allocation Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allocations.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-sm">
                    <span className="font-medium">Total Allocations:</span> {allocations.length}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Total Applied:</span> {formatCurrency(calculatedAllocatedAmount, payment.currency)}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Remaining:</span> {formatCurrency(calculatedUnallocatedAmount, payment.currency)}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full" 
                      style={{ 
                        width: `${(calculatedAllocatedAmount / parseFloat(payment.amount)) * 100}%` 
                      }}
                    ></div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {((calculatedAllocatedAmount / parseFloat(payment.amount)) * 100).toFixed(1)}% allocated
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-muted-foreground">No allocations yet</p>
                  <p className="text-sm text-muted-foreground">This payment hasn't been allocated to any invoices</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Allocation Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <Receipt className="h-5 w-5 mr-2" />
                Allocation Breakdown
              </span>
              {allocations.length > 0 && (
                <Badge variant="outline">{allocations.length} allocation{allocations.length !== 1 ? 's' : ''}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingAllocations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                <span>Loading allocations...</span>
              </div>
            ) : allocations.length > 0 ? (
              <div className="space-y-4">
                {allocations.map((allocation, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-semibold">{allocation.invoice.invoiceNumber}</h4>
                        <p className="text-sm text-muted-foreground">
                          {allocation.invoice.customerName}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">
                          {formatCurrency(allocation.amountApplied, allocation.invoice.currency)}
                        </div>
                        <Badge variant={
                          allocation.invoice.status === 'Paid' ? 'default' :
                          allocation.invoice.status === 'Partially Paid' ? 'secondary' :
                          'destructive'
                        }>
                          {allocation.invoice.status}
                        </Badge>
                      </div>
                    </div>
                    
                    <Separator className="my-3" />
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Invoice Total:</span>
                        <div className="font-medium">
                          {formatCurrency(allocation.invoice.totalAmount, allocation.invoice.currency)}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Issue Date:</span>
                        <div className="font-medium">
                          {format(new Date(allocation.invoice.issueDate), 'dd/MM/yyyy')}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Due Date:</span>
                        <div className="font-medium">
                          {format(new Date(allocation.invoice.dueDate), 'dd/MM/yyyy')}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Allocated On:</span>
                        <div className="font-medium">
                          {format(new Date(allocation.allocationDate), 'dd/MM/yyyy')}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Allocations Found</h3>
                <p className="text-muted-foreground mb-4">
                  This payment hasn't been allocated to any invoices yet.
                </p>
                <Button 
                  onClick={() => setLocation('/finance/payment-allocation')}
                  variant="outline"
                >
                  Allocate Payment
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}