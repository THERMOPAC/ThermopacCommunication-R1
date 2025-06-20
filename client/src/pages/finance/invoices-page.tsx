import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, AlertCircle, Download, Eye, Filter, Plus, Search, Edit, MoreHorizontal, FileText, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatRupees, formatDate, formatCurrency } from "@/lib/utils";
import { Link } from "wouter";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export default function InvoicesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Query for invoices using direct database connection with proper cache invalidation
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/simple-finance/invoices-list'],
    retry: 2,
    staleTime: 30000, // Cache for 30 seconds for better performance
    refetchOnWindowFocus: false // Prevent automatic refetching on focus
  });


  
  // Extract invoices from the response or use empty array if no data
  const invoices = Array.isArray(data) ? data : [];
  
  // Filter the invoices based on search term, status, and customer
  const filteredInvoices = invoices.filter((invoice: any) => {
    // Search term filter
    const matchesSearch = searchTerm === '' || 
      invoice.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Customer filter
    const matchesCustomer = customerFilter === 'all' || 
      (invoice.customerName && invoice.customerName === customerFilter);
    
    // Status filter to match exact values from the database (case-sensitive)
    let matchesStatus = false;
    
    // Status filtering logic
    if (statusFilter === 'all') {
      matchesStatus = true;
    } else if (statusFilter === 'pending' && (invoice.status === 'Pending' || invoice.status === 'Partially Paid')) {
      matchesStatus = true;
    } else if (statusFilter === 'overdue') {
      // Check if the invoice is overdue by comparing the due date with today's date
      const dueDate = new Date(invoice.dueDate);
      const today = new Date();
      matchesStatus = dueDate < today && (invoice.status === 'Pending' || invoice.status === 'Partially Paid');
    } else if (statusFilter === 'paid' && invoice.status === 'Paid') {
      matchesStatus = true;
    }
    
    // Date range filtering - check multiple possible date field names
    let matchesDateRange = true;
    const invoiceDate = invoice.issueDate || invoice.invoiceDate || invoice.issue_date || invoice.invoice_date;
    
    // Date filtering logic
    
    if (dateRange.from && invoiceDate) {
      const invDate = new Date(invoiceDate);
      if (isNaN(invDate.getTime())) {
        console.log(`Invalid date for invoice ${invoice.invoiceNumber}:`, invoiceDate);
      } else {
        matchesDateRange = matchesDateRange && invDate >= dateRange.from;
      }
    }
    if (dateRange.to && invoiceDate) {
      const invDate = new Date(invoiceDate);
      if (isNaN(invDate.getTime())) {
        console.log(`Invalid date for invoice ${invoice.invoiceNumber}:`, invoiceDate);
      } else {
        matchesDateRange = matchesDateRange && invDate <= dateRange.to;
      }
    }
    
    // Return filtered results
    
    return matchesSearch && matchesCustomer && matchesStatus && matchesDateRange;
  }) || [];

  // Sort filtered invoices by Invoice # in ascending order
  const sortedInvoices = filteredInvoices.sort((a: any, b: any) => {
    const aNum = a.invoiceNumber || '';
    const bNum = b.invoiceNumber || '';
    return aNum.localeCompare(bNum, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Extract unique customer names for the dropdown
  const uniqueCustomers = Array.from(new Set(
    invoices
      .map((invoice: any) => invoice.customerName)
      .filter(Boolean)
  )).sort();

  // Loading state
  if (isLoading) {
    return (
      <Layout>
        <Helmet>
          <title>Invoices | THERMOPAC Finance</title>
        </Helmet>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="mr-2 h-16 w-16 animate-spin" />
          <p>Loading Invoices...</p>
        </div>
      </Layout>
    );
  }

  // Error state
  if (error) {
    return (
      <Layout>
        <Helmet>
          <title>Invoices | THERMOPAC Finance</title>
        </Helmet>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load invoices. Please try again later.
          </AlertDescription>
        </Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <title>Invoices | THERMOPAC Finance</title>
      </Helmet>
      <div className="container py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Invoices</h1>
          <Button asChild>
            <Link href="/finance/invoices/new">
              <Plus className="mr-2 h-4 w-4" />
              Create New Invoice
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
                  placeholder="Search invoices..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline" 
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="flex-1 sm:w-auto"
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </Button>
                
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setCustomerFilter('all');
                    setDateRange({ from: undefined, to: undefined });
                  }}
                  className="flex-1 sm:w-auto"
                  title="Clear all filters"
                >
                  Clear
                </Button>
              </div>
            </div>

            {isFilterOpen && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Customer</label>
                  <Select 
                    value={customerFilter} 
                    onValueChange={setCustomerFilter}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Customers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers</SelectItem>
                      {uniqueCustomers.map((customer: string) => (
                        <SelectItem key={customer} value={customer}>
                          {customer}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">Status</label>
                  <Select 
                    value={statusFilter} 
                    onValueChange={setStatusFilter}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="partially paid">Partially Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
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

        <Tabs defaultValue="all" className="mb-6" onValueChange={(value) => {
          console.log("Tab changed to:", value);
          setStatusFilter(value);
        }} value={statusFilter}>
          <TabsList>
            <TabsTrigger value="all">All Invoices</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium">Invoice #</th>
                <th className="px-4 py-3 text-left text-sm font-medium">SAP Invoice No</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Shipping Bill No</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Client</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Issue Date</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Due Date</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Paid</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Outstanding</th>
                <th className="px-4 py-3 text-center text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-center text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedInvoices.length > 0 ? (
                sortedInvoices.map((invoice: any) => (
                  <tr key={invoice.id} className="border-t hover:bg-muted/50">
                    <td className="px-4 py-3 text-left text-sm">
                      <Link href={`/finance/invoices/view/${invoice.id}`} className="text-primary hover:underline">
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-left text-sm">{invoice.sapInvoiceNo || '-'}</td>
                    <td className="px-4 py-3 text-left text-sm">{invoice.shippingBillNumber || '-'}</td>
                    <td className="px-4 py-3 text-left text-sm">{invoice.customerName}</td>
                    <td className="px-4 py-3 text-left text-sm">{formatDate(invoice.issueDate)}</td>
                    <td className="px-4 py-3 text-left text-sm">{formatDate(invoice.dueDate)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium">{formatCurrency(invoice.totalAmount, invoice.currency)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-green-600">{formatCurrency(invoice.paidAmount || 0, invoice.currency)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-orange-600">{formatCurrency(invoice.outstanding_amount || invoice.totalAmount, invoice.currency)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link href={`/finance/invoices/view/${invoice.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/finance/invoices/${invoice.id}/edit`}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Invoice
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={`/finance/invoices/${invoice.id}/download`}>
                              <Download className="h-4 w-4 mr-2" />
                              Download PDF
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/finance/invoices/${invoice.id}/print`}>
                              <FileText className="h-4 w-4 mr-2" />
                              Print Invoice
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600 focus:text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                    No invoices found. Create your first invoice to get started.
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