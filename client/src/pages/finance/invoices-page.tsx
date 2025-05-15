import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, AlertCircle, Download, Eye, Filter, Plus, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatRupees, formatDate } from "@/lib/utils";
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
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Query for invoices
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/finance/invoices'],
    retry: 1
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="mr-2 h-16 w-16 animate-spin" />
        <p>Loading Invoices...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load invoices. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  // Filter the invoices based on search term and status
  const filteredInvoices = data?.filter((invoice: any) => {
    const matchesSearch = searchTerm === '' || 
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      invoice.status.toLowerCase() === statusFilter.toLowerCase();
    
    // Date range filtering
    let matchesDateRange = true;
    if (dateRange.from) {
      matchesDateRange = matchesDateRange && new Date(invoice.issueDate) >= dateRange.from;
    }
    if (dateRange.to) {
      matchesDateRange = matchesDateRange && new Date(invoice.issueDate) <= dateRange.to;
    }
    
    return matchesSearch && matchesStatus && matchesDateRange;
  }) || [];

  return (
    <div className="container mx-auto py-6">
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

      <Tabs defaultValue="all" className="mb-6">
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
              <th className="px-4 py-3 text-left text-sm font-medium">Client</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Issue Date</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Due Date</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
              <th className="px-4 py-3 text-center text-sm font-medium">Status</th>
              <th className="px-4 py-3 text-center text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Display either mock data or actual data once available */}
            {(filteredInvoices.length > 0 ? filteredInvoices : [
              {
                id: 1,
                invoiceNumber: 'INV-2025-001',
                customerId: 1,
                customerName: 'Company A',
                issueDate: '2025-05-10',
                dueDate: '2025-06-09',
                totalAmount: 45000,
                status: 'Pending'
              },
              {
                id: 2,
                invoiceNumber: 'INV-2025-002',
                customerId: 2,
                customerName: 'Company B',
                issueDate: '2025-05-05',
                dueDate: '2025-06-04',
                totalAmount: 78500,
                status: 'Paid'
              },
              {
                id: 3,
                invoiceNumber: 'INV-2025-003',
                customerId: 3,
                customerName: 'Company C',
                issueDate: '2025-04-20',
                dueDate: '2025-05-10',
                totalAmount: 32500,
                status: 'Overdue'
              }
            ]).map((invoice: any) => (
              <tr key={invoice.id} className="border-t hover:bg-muted/50">
                <td className="px-4 py-3 text-left text-sm">
                  <Link href={`/finance/invoices/${invoice.id}`} className="text-primary hover:underline">
                    {invoice.invoiceNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-left text-sm">{invoice.customerName}</td>
                <td className="px-4 py-3 text-left text-sm">{formatDate(invoice.issueDate)}</td>
                <td className="px-4 py-3 text-left text-sm">{formatDate(invoice.dueDate)}</td>
                <td className="px-4 py-3 text-right text-sm font-medium">{formatRupees(invoice.totalAmount)}</td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={invoice.status} />
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-2">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/finance/invoices/${invoice.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/finance/invoices/${invoice.id}/download`}>
                        <Download className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}