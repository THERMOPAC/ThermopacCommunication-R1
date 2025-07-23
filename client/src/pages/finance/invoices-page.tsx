import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, AlertCircle, Download, Eye, Filter, Plus, Search, Edit, MoreHorizontal, FileText, Trash2, CreditCard, Printer } from "lucide-react";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

// Credit note validation schema with enhanced validation
const creditNoteSchema = z.object({
  creditNoteNumber: z.string().min(1, "Credit note number is required"),
  creditNoteDate: z.string().min(1, "Credit note date is required"),
  creditNoteAmount: z.string().min(1, "Credit note amount is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    { message: "Credit note amount must be a valid positive number" }
  ),
  creditNoteReason: z.string().min(1, "Credit note reason is required"),
});

type CreditNoteFormData = z.infer<typeof creditNoteSchema>;

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
      case 'credited':
        return 'bg-purple-100 text-purple-800';
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
  const [selectedInvoiceForCredit, setSelectedInvoiceForCredit] = useState<any>(null);
  const [showCreditNoteDialog, setShowCreditNoteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  
  // Credit Notes specific filters
  const [creditNoteSearchTerm, setCreditNoteSearchTerm] = useState('');
  const [creditNoteCustomerFilter, setCreditNoteCustomerFilter] = useState('all');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Credit note mutation
  const createCreditNoteMutation = useMutation({
    mutationFn: async (data: CreditNoteFormData) => {
      if (!selectedInvoiceForCredit) throw new Error('No invoice selected');
      return apiRequest('POST', `/api/finance/invoices/${selectedInvoiceForCredit.id}/credit-note`, data);
    },
    onSuccess: () => {
      toast({
        title: "Credit Note Created",
        description: "The credit note has been successfully created and the invoice has been marked as credited.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/simple-finance/invoices-list'] });
      setShowCreditNoteDialog(false);
      setSelectedInvoiceForCredit(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error Creating Credit Note",
        description: error.message || "Failed to create credit note. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Query for invoices using direct database connection with proper cache invalidation
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/simple-finance/invoices-list'],
    retry: 2,
    staleTime: 30000, // Cache for 30 seconds for better performance
    refetchOnWindowFocus: false // Prevent automatic refetching on focus
  });

  // Query for credit notes
  const { data: creditNotesData, isLoading: creditNotesLoading, error: creditNotesError } = useQuery({
    queryKey: ['/api/finance/credit-notes'],
    retry: 2,
    staleTime: 30000,
    refetchOnWindowFocus: false
  });


  
  // Extract invoices from the response or use empty array if no data
  const invoices = Array.isArray(data) ? data : [];
  
  // Extract credit notes from the response
  const creditNotes = creditNotesData?.creditNotes || [];
  
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
          <h1 className="text-3xl font-bold pl-4">Invoices</h1>
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
          setActiveTab(value);
          if (value !== 'credit-notes') {
            setStatusFilter(value);
          }
        }} value={activeTab}>
          <TabsList>
            <TabsTrigger value="all">All Invoices</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
            <TabsTrigger value="credit-notes">Credit Notes</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Render invoice table for non-credit-note tabs */}
        {activeTab !== 'credit-notes' && (
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
                      <td className="px-4 py-3 text-right text-sm font-medium text-orange-600">{formatCurrency(invoice.outstandingAmount !== undefined ? invoice.outstandingAmount : (invoice.totalAmount - (invoice.paidAmount || 0)), invoice.currency)}</td>
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
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedInvoiceForCredit(invoice);
                                setShowCreditNoteDialog(true);
                              }}
                              className="text-purple-600 focus:text-purple-600"
                            >
                              <CreditCard className="h-4 w-4 mr-2" />
                              Create Credit Note
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
        )}

        {/* Render credit notes table */}
        {activeTab === 'credit-notes' && (
          <CreditNotesSection 
            creditNotes={creditNotes}
            searchTerm={creditNoteSearchTerm}
            setSearchTerm={setCreditNoteSearchTerm}
            customerFilter={creditNoteCustomerFilter}
            setCustomerFilter={setCreditNoteCustomerFilter}
            isLoading={creditNotesLoading}
            error={creditNotesError}
          />
        )}
      </div>

      {/* Credit Note Dialog */}
      <CreditNoteDialog 
        open={showCreditNoteDialog}
        onOpenChange={setShowCreditNoteDialog}
        invoice={selectedInvoiceForCredit}
        onSubmit={createCreditNoteMutation.mutate}
        isLoading={createCreditNoteMutation.isPending}
      />
    </Layout>
  );
}

// Credit Note Dialog Component
function CreditNoteDialog({ 
  open, 
  onOpenChange, 
  invoice, 
  onSubmit, 
  isLoading 
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any;
  onSubmit: (data: CreditNoteFormData) => void;
  isLoading: boolean;
}) {
  const [creditNoteDetails, setCreditNoteDetails] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const { toast } = useToast();

  // Enhanced validation schema with dynamic invoice amount checking
  const currentSchema = useMemo(() => {
    if (!creditNoteDetails?.invoice?.totalAmount) return creditNoteSchema;
    
    return creditNoteSchema.extend({
      creditNoteAmount: z.string()
        .min(1, "Credit note amount is required")
        .refine(
          (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
          { message: "Credit note amount must be a valid positive number" }
        )
        .refine(
          (val) => parseFloat(val) <= parseFloat(creditNoteDetails.invoice.totalAmount),
          { 
            message: `Credit note amount cannot exceed invoice amount (${formatCurrency(creditNoteDetails.invoice.totalAmount, creditNoteDetails.invoice.currency)})` 
          }
        ),
      creditNoteDate: z.string()
        .min(1, "Credit note date is required")
        .refine(
          (val) => {
            if (!creditNoteDetails?.minDate) return true;
            const creditDate = new Date(val);
            const minDate = new Date(creditNoteDetails.minDate);
            return creditDate >= minDate;
          },
          { 
            message: `Credit note date cannot be before invoice date (${creditNoteDetails?.minDate ? new Date(creditNoteDetails.minDate).toLocaleDateString() : ''})` 
          }
        )
    });
  }, [creditNoteDetails]);

  const form = useForm<CreditNoteFormData>({
    resolver: zodResolver(currentSchema),
    defaultValues: {
      creditNoteNumber: '',
      creditNoteDate: new Date().toISOString().split('T')[0],
      creditNoteAmount: '',
      creditNoteReason: '',
    }
  });

  // Fetch credit note details when dialog opens
  useEffect(() => {
    if (open && invoice?.id) {
      setIsLoadingDetails(true);
      apiRequest('GET', `/api/finance/invoices/${invoice.id}/credit-note-details`)
        .then((response) => {
          setCreditNoteDetails(response);
          // Auto-fill form with generated data
          form.setValue('creditNoteNumber', response.creditNoteNumber);
          form.setValue('creditNoteAmount', response.invoice.totalAmount.toString());
          form.setValue('creditNoteDate', new Date().toISOString().split('T')[0]);
        })
        .catch((error) => {
          toast({
            title: "Error Loading Credit Note Details",
            description: error.message || "Failed to load credit note details",
            variant: "destructive"
          });
          onOpenChange(false);
        })
        .finally(() => {
          setIsLoadingDetails(false);
        });
    }
  }, [open, invoice?.id]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
      setCreditNoteDetails(null);
    }
  }, [open]);

  const handleSubmit = (data: CreditNoteFormData) => {
    onSubmit(data);
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Credit Note</DialogTitle>
          <DialogDescription>
            Create a credit note for Invoice #{invoice.invoiceNumber}
          </DialogDescription>
        </DialogHeader>
        
        {isLoadingDetails ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading credit note details...</span>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              {/* Invoice Information */}
              <div className="rounded-lg border p-4 bg-muted/50">
                <h3 className="font-medium mb-2">Invoice Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Invoice #:</span>
                    <p className="font-medium">{invoice.invoiceNumber}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Customer:</span>
                    <p className="font-medium">{invoice.customerName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Amount:</span>
                    <p className="font-medium">{formatCurrency(invoice.totalAmount, invoice.currency)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <div className="mt-1">
                      <StatusBadge status={invoice.status} />
                    </div>
                  </div>
                  {creditNoteDetails && (
                    <div className="col-span-2 mt-2 pt-2 border-t">
                      <span className="text-muted-foreground">Issue Date:</span>
                      <p className="font-medium">{new Date(creditNoteDetails.invoice.issueDate).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Credit Note Form */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="creditNoteNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Credit Note Number *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Auto-generated credit note number" 
                          readOnly
                          className="bg-muted/50"
                          {...field} 
                        />
                      </FormControl>
                      {creditNoteDetails && (
                        <p className="text-xs text-muted-foreground">
                          Auto-generated for fiscal year {creditNoteDetails.fiscalYear}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="creditNoteDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Credit Note Date *</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          min={creditNoteDetails?.minDate}
                          {...field} 
                        />
                      </FormControl>
                      {creditNoteDetails?.minDate && (
                        <p className="text-xs text-muted-foreground">
                          Cannot be before invoice date: {new Date(creditNoteDetails.minDate).toLocaleDateString()}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="creditNoteAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Credit Note Amount *</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          placeholder="Enter amount" 
                          max={creditNoteDetails?.invoice?.totalAmount}
                          {...field} 
                        />
                      </FormControl>
                      {creditNoteDetails?.invoice && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Pre-filled with full invoice amount</span>
                          <span>Max: {formatCurrency(creditNoteDetails.invoice.totalAmount, creditNoteDetails.invoice.currency)}</span>
                        </div>
                      )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="creditNoteReason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason for Credit Note *</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter reason for credit note"
                        className="min-h-[80px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Create Credit Note
                  </>
                )}
              </Button>
            </div>
          </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Credit Notes Section Component
function CreditNotesSection({ 
  creditNotes, 
  searchTerm, 
  setSearchTerm, 
  customerFilter, 
  setCustomerFilter, 
  isLoading, 
  error 
}: {
  creditNotes: any[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  customerFilter: string;
  setCustomerFilter: (filter: string) => void;
  isLoading: boolean;
  error: any;
}) {
  // Filter credit notes based on search term and customer filter
  const filteredCreditNotes = useMemo(() => {
    return creditNotes.filter((creditNote) => {
      const matchesSearch = !searchTerm || 
        creditNote.creditNoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        creditNote.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        creditNote.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        creditNote.creditNoteReason.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCustomer = customerFilter === 'all' || 
        creditNote.customerName.toLowerCase().includes(customerFilter.toLowerCase());
      
      return matchesSearch && matchesCustomer;
    });
  }, [creditNotes, searchTerm, customerFilter]);

  // Sort credit notes by date (newest first)
  const sortedCreditNotes = useMemo(() => {
    return [...filteredCreditNotes].sort((a, b) => 
      new Date(b.creditNoteDate).getTime() - new Date(a.creditNoteDate).getTime()
    );
  }, [filteredCreditNotes]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading credit notes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-red-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading credit notes</h3>
            <p className="text-sm text-red-700 mt-1">
              There was a problem loading the credit notes. Please try refreshing the page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Credit Notes Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search credit notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="w-full sm:w-auto">
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {/* Get unique customers for filter */}
              {Array.from(new Set(creditNotes.map(cn => cn.customerName))).map((customer) => (
                <SelectItem key={customer} value={customer}>
                  {customer}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Credit Notes Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-primary">{creditNotes.length}</div>
            <p className="text-sm text-muted-foreground">Total Credit Notes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(creditNotes.reduce((sum, cn) => sum + (cn.creditNoteAmount || 0), 0), 'USD')}
            </div>
            <p className="text-sm text-muted-foreground">Total Credit Amount</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{filteredCreditNotes.length}</div>
            <p className="text-sm text-muted-foreground">Filtered Results</p>
          </CardContent>
        </Card>
      </div>

      {/* Credit Notes Table */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium">Credit Note Number</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Linked Invoice Number</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Customer Name</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Credit Note Amount</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Credit Note Date</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Reason</th>
              <th className="px-4 py-3 text-center text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedCreditNotes.length > 0 ? (
              sortedCreditNotes.map((creditNote) => (
                <tr key={creditNote.id} className="border-t hover:bg-muted/50">
                  <td className="px-4 py-3 text-left text-sm font-medium text-purple-600">
                    {creditNote.creditNoteNumber}
                  </td>
                  <td className="px-4 py-3 text-left text-sm">
                    <Link 
                      href={`/finance/invoices/view/${creditNote.id}`} 
                      className="text-primary hover:underline"
                    >
                      {creditNote.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-left text-sm">{creditNote.customerName}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-green-600">
                    {formatCurrency(creditNote.creditNoteAmount, creditNote.currency)}
                  </td>
                  <td className="px-4 py-3 text-left text-sm">{formatDate(creditNote.creditNoteDate)}</td>
                  <td className="px-4 py-3 text-left text-sm max-w-xs truncate" title={creditNote.creditNoteReason}>
                    {creditNote.creditNoteReason}
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
                          <Link href={`/finance/invoices/view/${creditNote.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Invoice
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <FileText className="h-4 w-4 mr-2" />
                          Download Credit Note
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Printer className="h-4 w-4 mr-2" />
                          Print Credit Note
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {searchTerm || customerFilter !== 'all' 
                    ? "No credit notes match your search criteria." 
                    : "No credit notes found. Create your first credit note from an invoice."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}