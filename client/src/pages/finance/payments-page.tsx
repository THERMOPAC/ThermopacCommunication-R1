import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Loader2, AlertCircle, FileText, Eye, Edit, Filter, Plus, Search, Download } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Method badge component
const PaymentMethodBadge = ({ method }: { method: string }) => {
  const getMethodStyles = (method: string) => {
    switch (method.toLowerCase()) {
      case 'bank transfer':
        return 'bg-blue-100 text-blue-800';
      case 'wire transfer':
        return 'bg-purple-100 text-purple-800';
      case 'cash':
        return 'bg-green-100 text-green-800';
      case 'check':
      case 'cheque':
        return 'bg-yellow-100 text-yellow-800';
      case 'credit card':
        return 'bg-pink-100 text-pink-800';
      case 'online payment':
        return 'bg-indigo-100 text-indigo-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${getMethodStyles(method)}`}>
      {method}
    </span>
  );
};

export default function PaymentsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Query for payments
  const { data, isLoading, error } = useQuery<{ payments: any[] }>({
    queryKey: ['/api/finance/payments'],
    retry: 1
  });
  
  // Query for customers list
  const { data: customersData = [] } = useQuery<any[]>({
    queryKey: ['/api/customers'],
    retry: 1
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="mr-2 h-16 w-16 animate-spin" />
          <p>Loading Payments...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load payment records. Please try again later.
          </AlertDescription>
        </Alert>
      </Layout>
    );
  }

  // Handle the API response structure which returns { payments: [...] }
  const payments = data?.payments || [];
  
  // Filter the payments based on search term, payment method, and customer
  const filteredPayments = payments
    .filter((payment: any) => {
      const matchesSearch = searchTerm === '' || 
        (payment.reference && payment.reference.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (payment.paymentNumber && payment.paymentNumber.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesMethod = methodFilter === 'all' || 
        (payment.paymentMethod && payment.paymentMethod.toLowerCase() === methodFilter.toLowerCase());
      
      // Customer filtering
      const matchesCustomer = customerFilter === 'all' || 
        (payment.customerId && payment.customerId.toString() === customerFilter);
      
      // Date range filtering
      let matchesDateRange = true;
      if (dateRange.from) {
        matchesDateRange = matchesDateRange && new Date(payment.paymentDate) >= dateRange.from;
      }
      if (dateRange.to) {
        matchesDateRange = matchesDateRange && new Date(payment.paymentDate) <= dateRange.to;
      }
      
      return matchesSearch && matchesMethod && matchesCustomer && matchesDateRange;
    })
    // Sort by payment ID in ascending order
    .sort((a: any, b: any) => Number(a.id) - Number(b.id));

  return (
    <Layout>
      <Helmet>
        <title>Payments | Thermopac Finance</title>
      </Helmet>
      
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Payments</h1>
          <Button asChild>
            <Link href="/finance/payments/new">
              <Plus className="mr-2 h-4 w-4" />
              Record New Payment
            </Link>
          </Button>
        </div>

        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="relative flex-grow">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by reference number..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <Button
                variant="outline" 
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="w-full sm:w-auto"
              >
                <Filter className="mr-2 h-4 w-4" />
                Filters
              </Button>
            </div>

            {isFilterOpen && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Customer</label>
                  <Select 
                    value={customerFilter} 
                    onValueChange={setCustomerFilter}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers</SelectItem>
                      {customersData?.map((customer: any) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.bpName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">Payment Method</label>
                  <Select 
                    value={methodFilter} 
                    onValueChange={setMethodFilter}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Methods</SelectItem>
                      <SelectItem value="bank transfer">Bank Transfer</SelectItem>
                      <SelectItem value="wire transfer">Wire Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="credit card">Credit Card</SelectItem>
                      <SelectItem value="online payment">Online Payment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">From Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        {dateRange.from ? formatDate(dateRange.from) : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateRange.from}
                        onSelect={(date) => 
                          setDateRange(prev => ({ ...prev, from: date }))
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">To Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        {dateRange.to ? formatDate(dateRange.to) : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateRange.to}
                        onSelect={(date) => 
                          setDateRange(prev => ({ ...prev, to: date }))
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="all" className="mb-6">
          <TabsList>
            <TabsTrigger value="all">All Payments</TabsTrigger>
            <TabsTrigger value="recent">Recent (30 days)</TabsTrigger>
            <TabsTrigger value="this-month">This Month</TabsTrigger>
            <TabsTrigger value="last-month">Last Month</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium">Payment ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Payment #</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Payment Date</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Customer Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Payment Method</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Unallocated</th>
                <th className="px-4 py-3 text-center text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length > 0 ? (
                filteredPayments.map((payment: any) => (
                  <tr key={payment.id} className="border-t hover:bg-muted/50">
                    <td className="px-4 py-3 text-left text-sm font-medium">
                      {payment.id}
                    </td>
                    <td className="px-4 py-3 text-left text-sm">
                      <Link href={`/finance/payments/${payment.id}`} className="text-primary hover:underline">
                        {payment.paymentNumber || payment.reference || `PAY-${payment.id}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-left text-sm">{formatDate(new Date(payment.paymentDate))}</td>
                    <td className="px-4 py-3 text-left text-sm">{payment.customerName || "N/A"}</td>
                    <td className="px-4 py-3 text-left text-sm">
                      <PaymentMethodBadge method={payment.paymentMethod || "Unknown"} />
                    </td>
                    <td className="px-4 py-3 text-left text-sm">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium 
                        ${payment.paymentType === 'Product' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                        {payment.paymentType || "Unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium">
                      {formatCurrency(payment.amount, payment.currency || 'USD')}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium">
                      {payment.unallocatedAmount > 0 ? (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium 
                          ${parseFloat(payment.unallocatedAmount) === parseFloat(payment.amount) 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-amber-100 text-amber-800'}`}>
                          {formatCurrency(payment.unallocatedAmount, payment.currency || 'USD')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                          Fully Allocated
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <Button variant="ghost" size="icon" asChild title="View Payment">
                          <Link href={`/finance/payments/${payment.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild title="Edit Payment">
                          <Link href={`/finance/payments/${payment.id}/edit`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                        {parseFloat(payment.unallocatedAmount) > 0 && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-blue-600 hover:text-blue-800"
                            asChild
                          >
                            <Link 
                              href={`/finance/payment-allocation?paymentId=${payment.id}`} 
                              title="Allocate Payment"
                            >
                              <span className="text-xs font-semibold">A</span>
                            </Link>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    No payments found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}